from __future__ import annotations

from functools import lru_cache
from typing import Any, Protocol

from pydantic import BaseModel, Field


class CspRepository(Protocol):
    has_csp: bool
    csp_file_size: int

    def query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]: ...


CSP_LEVELS = {
    "groupe_6": "6 grands groupes",
    "categorie_29": "29 catégories détaillées",
}

CSP_DIMENSIONS = {
    "year": ("Année", "annee"),
    "region": ("Région", "region"),
    "age": ("Tranche d’âge", "tranche_age"),
    "sex": ("Sexe", "sexe"),
}

CSP_MEASURES = {
    "effectif": ("Effectif pondéré", "SUM(effectif)::DOUBLE", "quantity"),
    "population": ("Actifs en emploi", "SUM(population_reference)::DOUBLE", "quantity"),
    "share": ("Part de la CSP", "100.0 * SUM(effectif) / NULLIF(SUM(population_reference), 0)", "percent"),
}


class CspOverviewRequest(BaseModel):
    year: int = Field(default=2023, ge=2000, le=2100)
    level: str = "groupe_6"
    csp_code: str = "3"
    region: str = "FR"
    age: str = "all"
    sex: int = Field(default=0, ge=0, le=2)


class CspEvolutionRequest(BaseModel):
    """Filters shared by the annual CSP evolution view.

    The selected year is deliberately absent: the endpoint always returns
    every available year for the requested perimeter.  ``start_year`` and
    ``end_year`` are optional display bounds and are applied server-side so a
    chart does not have to load the full history when a shorter window is
    selected.
    """

    level: str = "groupe_6"
    csp_code: str = "3"
    region: str = "FR"
    age: str = "all"
    sex: int = Field(default=0, ge=0, le=2)
    start_year: int | None = Field(default=None, ge=2000, le=2100)
    end_year: int | None = Field(default=None, ge=2000, le=2100)


class CspExtractionRequest(BaseModel):
    year: int = Field(default=2023, ge=2000, le=2100)
    level: str = "groupe_6"
    csp_code: str = "3"
    dimensions: list[str] = Field(default_factory=lambda: ["region", "age", "sex"])
    measures: list[str] = Field(default_factory=lambda: ["effectif", "share"])
    limit: int = Field(default=500, ge=1, le=1000)


def _require_source(repo: CspRepository) -> None:
    if not repo.has_csp:
        raise ValueError("La base CSP n’est pas disponible.")


@lru_cache(maxsize=2)
def csp_metadata(repo: CspRepository) -> dict[str, Any]:
    _require_source(repo)
    years = [int(row["year"]) for row in repo.query(
        "SELECT DISTINCT annee AS year FROM csp ORDER BY 1"
    )]
    if not years:
        raise ValueError("Aucun millésime CSP exploitable n’est présent dans la base.")
    regions = repo.query(
        "SELECT DISTINCT code_region AS code, region AS label FROM csp ORDER BY code_region"
    )
    ages = repo.query(
        """SELECT DISTINCT tranche_age AS code, tranche_age AS label,
                          tranche_age_ordre AS sort
             FROM csp ORDER BY sort"""
    )
    options = repo.query(
        """SELECT niveau_csp AS level, code_csp AS code, ANY_VALUE(csp) AS label,
                          ANY_VALUE(CAST(code_groupe_csp AS VARCHAR)) AS group_code,
                          ANY_VALUE(groupe_csp) AS group_label
             FROM csp
             GROUP BY niveau_csp, code_csp
             ORDER BY CASE niveau_csp WHEN 'groupe_6' THEN 1 ELSE 2 END,
                      TRY_CAST(code_csp AS INTEGER), code_csp"""
    )
    # Le poids de chaque catégorie sur le dernier millésime, France entière.
    # Il ne s'affiche nulle part comme un chiffre : il **classe** le sélecteur de
    # comparaison et désigne la sélection d'ouverture, exactement comme
    # `patients` le fait pour les pathologies.
    weights = {
        (str(row["level"]), str(row["code"])):
            (float(row["effectif"]) if row["effectif"] is not None else None)
        for row in repo.query(
            """SELECT niveau_csp AS level, code_csp AS code, SUM(effectif)::DOUBLE AS effectif
                 FROM csp WHERE annee = ?
                 GROUP BY niveau_csp, code_csp""",
            [max(years)],
        )
    }
    by_level: dict[str, list[dict[str, Any]]] = {key: [] for key in CSP_LEVELS}
    for row in options:
        level = str(row["level"])
        if level in by_level:
            by_level[level].append({
                "code": str(row["code"]),
                "label": str(row["label"]),
                "group_code": str(row["group_code"]),
                "group_label": str(row["group_label"]),
                "effectif": weights.get((level, str(row["code"]))),
            })
    source_label = (
        f"Recensement de la population Insee · {min(years)}–{max(years)}"
        if years else "Recensement de la population Insee"
    )
    source_paths = [getattr(path, "name", str(path)) for path in getattr(repo, "csp_paths", [])]
    try:
        nomenclature_rows = repo.query(
            "SELECT annee AS year, ANY_VALUE(nomenclature_csp) AS nomenclature FROM csp GROUP BY annee ORDER BY annee"
        )
    except Exception:
        nomenclature_rows = []
    return {
        "available": True,
        "years": years,
        "default_year": max(years),
        "levels": [
            {"key": key, "label": label, "options": by_level[key]}
            for key, label in CSP_LEVELS.items()
        ],
        "regions": [
            {"code": "FR", "label": "France entière"},
            *[{"code": str(row["code"]), "label": str(row["label"])} for row in regions],
        ],
        "ages": [
            {"code": "all", "label": "Tous âges"},
            *[{"code": str(row["code"]), "label": str(row["label"])} for row in ages],
        ],
        "sexes": [
            {"code": 0, "label": "Tous sexes"},
            {"code": 1, "label": "Hommes"},
            {"code": 2, "label": "Femmes"},
        ],
        "source": source_label,
        "nomenclatures": [
            {"year": int(row["year"]), "nomenclature": str(row["nomenclature"])}
            for row in nomenclature_rows if row.get("nomenclature") is not None
        ],
        "available_sources": source_paths,
        "population_scope": "Actifs ayant un emploi (TACT = 11)",
        "core_size_bytes": int(repo.csp_file_size),
        "geography_url": "/api/csp/regions.geojson",
    }


def _where(payload: CspOverviewRequest, *, region: bool = True,
           age: bool = True, sex: bool = True) -> tuple[str, list[Any]]:
    clauses = ["annee = ?", "niveau_csp = ?"]
    params: list[Any] = [payload.year, payload.level]
    if region and payload.region != "FR":
        clauses.append("code_region = ?")
        params.append(payload.region)
    if age and payload.age != "all":
        clauses.append("tranche_age = ?")
        params.append(payload.age)
    if sex and payload.sex in (1, 2):
        clauses.append("code_sexe = ?")
        params.append(payload.sex)
    return " AND ".join(clauses), params


def _float(value: Any) -> float:
    return float(value or 0)


def _csp_evolution_rows(repo: CspRepository, payload: CspEvolutionRequest) -> list[dict[str, Any]]:
    """Aggregate the selected CSP and its denominator by available year."""
    clauses = ["niveau_csp = ?"]
    params: list[Any] = [payload.level]
    if payload.region != "FR":
        clauses.append("code_region = ?")
        params.append(payload.region)
    if payload.age != "all":
        clauses.append("tranche_age = ?")
        params.append(payload.age)
    if payload.sex in (1, 2):
        clauses.append("code_sexe = ?")
        params.append(payload.sex)
    if payload.start_year is not None:
        clauses.append("annee >= ?")
        params.append(payload.start_year)
    if payload.end_year is not None:
        clauses.append("annee <= ?")
        params.append(payload.end_year)
    where = " AND ".join(clauses)
    rows = repo.query(
        f"""SELECT annee AS year,
                          SUM(effectif)::DOUBLE AS population,
                          SUM(CASE WHEN code_csp = ? THEN effectif ELSE 0 END)::DOUBLE AS selected
                     FROM csp
                    WHERE {where}
                    GROUP BY annee
                    ORDER BY annee""",
        [payload.csp_code, *params],
    )
    output: list[dict[str, Any]] = []
    for row in rows:
        population = _float(row["population"])
        selected = _float(row["selected"])
        output.append({
            "year": int(row["year"]),
            "population": population,
            "effectif": selected,
            "share": 100.0 * selected / population if population else 0.0,
        })
    return output


def csp_evolution(repo: CspRepository, payload: CspEvolutionRequest) -> dict[str, Any]:
    """Return annual population, CSP effectif and share for one perimeter."""
    _require_source(repo)
    if payload.level not in CSP_LEVELS:
        raise ValueError("Le niveau de CSP sélectionné est inconnu.")
    metadata = csp_metadata(repo)
    level = next(item for item in metadata["levels"] if item["key"] == payload.level)
    selected = next((item for item in level["options"] if item["code"] == payload.csp_code), None)
    if selected is None:
        raise ValueError("La CSP sélectionnée est inconnue pour ce niveau.")
    if payload.start_year is not None and payload.end_year is not None and payload.start_year > payload.end_year:
        raise ValueError("La première année doit être antérieure ou égale à la dernière.")
    if payload.region not in {item["code"] for item in metadata["regions"]}:
        raise ValueError("La région sélectionnée est inconnue.")
    if payload.age not in {item["code"] for item in metadata["ages"]}:
        raise ValueError("La tranche d’âge sélectionnée est inconnue.")
    if payload.sex not in {item["code"] for item in metadata["sexes"]}:
        raise ValueError("Le sexe sélectionné est inconnu.")
    return {
        "context": {
            "level": payload.level,
            "level_label": CSP_LEVELS[payload.level],
            "csp_code": payload.csp_code,
            "csp_label": selected["label"],
            "region": payload.region,
            "age": payload.age,
            "sex": payload.sex,
        },
        "rows": _csp_evolution_rows(repo, payload),
        "years": metadata["years"],
        "evolution_note": (
            "Rupture de nomenclature : la série détaillée rapproche PCS 2003 et PCS 2020."
            if payload.level == "categorie_29" and len({item.get("nomenclature") for item in metadata.get("nomenclatures", [])}) > 1
            else None
        ),
    }


def csp_overview(repo: CspRepository, payload: CspOverviewRequest) -> dict[str, Any]:
    _require_source(repo)
    if payload.level not in CSP_LEVELS:
        raise ValueError("Le niveau de CSP sélectionné est inconnu.")
    metadata = csp_metadata(repo)
    level = next(item for item in metadata["levels"] if item["key"] == payload.level)
    selected_option = next((item for item in level["options"] if item["code"] == payload.csp_code), None)
    if selected_option is None:
        raise ValueError("La CSP sélectionnée est inconnue pour ce niveau.")
    if payload.year not in metadata["years"]:
        raise ValueError("Ce millésime CSP n’est pas disponible.")
    if not any(item["code"] == payload.region for item in metadata["regions"]):
        raise ValueError("La région sélectionnée est inconnue.")
    if not any(item["code"] == payload.age for item in metadata["ages"]):
        raise ValueError("La tranche d’âge sélectionnée est inconnue.")

    context_where, context_params = _where(payload)
    context = repo.query(
        f"""SELECT SUM(effectif)::DOUBLE AS population,
                   SUM(CASE WHEN code_csp = ? THEN effectif ELSE 0 END)::DOUBLE AS selected
              FROM csp WHERE {context_where}""",
        [payload.csp_code, *context_params],
    )[0]
    population = _float(context["population"])
    selected = _float(context["selected"])
    share = 100.0 * selected / population if population else 0.0

    territory_where, territory_params = _where(payload, region=False)
    territory_rows = repo.query(
        f"""SELECT code_region AS code, ANY_VALUE(region) AS label,
                   SUM(effectif)::DOUBLE AS population,
                   SUM(CASE WHEN code_csp = ? THEN effectif ELSE 0 END)::DOUBLE AS selected
              FROM csp WHERE {territory_where}
              GROUP BY code_region ORDER BY code_region""",
        [payload.csp_code, *territory_params],
    )
    france_population = sum(_float(row["population"]) for row in territory_rows)
    france_selected = sum(_float(row["selected"]) for row in territory_rows)
    france_share = 100.0 * france_selected / france_population if france_population else 0.0
    territories = []
    for row in territory_rows:
        row_population = _float(row["population"])
        row_selected = _float(row["selected"])
        row_share = 100.0 * row_selected / row_population if row_population else 0.0
        territories.append({
            "code": str(row["code"]),
            "label": str(row["label"]),
            "effectif": row_selected,
            "population": row_population,
            "share": row_share,
        })
    territories.sort(key=lambda item: item["share"], reverse=True)

    profile_where, profile_params = _where(payload, age=False)
    age_sex_rows = repo.query(
        f"""SELECT tranche_age AS age, tranche_age_ordre AS age_order,
                   code_sexe AS sex_code, ANY_VALUE(sexe) AS sex,
                   SUM(effectif)::DOUBLE AS population,
                   SUM(CASE WHEN code_csp = ? THEN effectif ELSE 0 END)::DOUBLE AS selected
              FROM csp WHERE {profile_where}
              GROUP BY tranche_age, tranche_age_ordre, code_sexe
              ORDER BY tranche_age_ordre, code_sexe""",
        [payload.csp_code, *profile_params],
    )
    age_sex = []
    for row in age_sex_rows:
        row_population = _float(row["population"])
        row_selected = _float(row["selected"])
        age_sex.append({
            "age": str(row["age"]),
            "age_order": int(row["age_order"]),
            "sex_code": int(row["sex_code"]),
            "sex": str(row["sex"]),
            "effectif": row_selected,
            "population": row_population,
            "share": 100.0 * row_selected / row_population if row_population else 0.0,
        })

    composition_rows = repo.query(
        f"""SELECT code_csp AS code, ANY_VALUE(csp) AS label,
                   ANY_VALUE(groupe_csp) AS group_label,
                   SUM(effectif)::DOUBLE AS effectif
              FROM csp WHERE {context_where}
              GROUP BY code_csp""",
        context_params,
    )
    france_where, france_params = _where(payload, region=False)
    france_composition_rows = repo.query(
        f"""SELECT code_csp AS code, SUM(effectif)::DOUBLE AS effectif
              FROM csp WHERE {france_where} GROUP BY code_csp""",
        france_params,
    )
    france_by_code = {str(row["code"]): _float(row["effectif"]) for row in france_composition_rows}
    france_total = sum(france_by_code.values())
    composition = []
    for row in composition_rows:
        code = str(row["code"])
        effectif = _float(row["effectif"])
        item_share = 100.0 * effectif / population if population else 0.0
        item_france_share = 100.0 * france_by_code.get(code, 0.0) / france_total if france_total else 0.0
        composition.append({
            "code": code,
            "label": str(row["label"]),
            "group_label": str(row["group_label"]),
            "effectif": effectif,
            "share": item_share,
            "france_share": item_france_share,
        })
    composition.sort(key=lambda item: item["share"], reverse=True)

    ratio_where, ratio_params = _where(payload, sex=False)
    ratio_row = repo.query(
        f"""SELECT SUM(CASE WHEN code_sexe = 2 AND code_csp = ? THEN effectif ELSE 0 END)::DOUBLE AS women,
                   SUM(CASE WHEN code_sexe = 1 AND code_csp = ? THEN effectif ELSE 0 END)::DOUBLE AS men
              FROM csp WHERE {ratio_where}""",
        [payload.csp_code, payload.csp_code, *ratio_params],
    )[0]
    women = _float(ratio_row["women"])
    men = _float(ratio_row["men"])
    ratio = women / men if men else None
    ratio_text = (f"{ratio:.2f}".replace(".", ",") + " femme pour 1 homme") if ratio is not None else "—"
    top_territory = territories[0] if territories else None

    region_label = next(item["label"] for item in metadata["regions"] if item["code"] == payload.region)
    age_label = next(item["label"] for item in metadata["ages"] if item["code"] == payload.age)
    sex_label = next(item["label"] for item in metadata["sexes"] if item["code"] == payload.sex)
    evolution = _csp_evolution_rows(repo, CspEvolutionRequest(
        level=payload.level,
        csp_code=payload.csp_code,
        region=payload.region,
        age=payload.age,
        sex=payload.sex,
    ))
    evolution_nomenclatures = sorted({
        str(row.get("nomenclature")) for row in metadata.get("nomenclatures", [])
        if row.get("nomenclature")
    })
    evolution_note = None
    if payload.level == "categorie_29" and len(evolution_nomenclatures) > 1:
        evolution_note = "Rupture de nomenclature : la série détaillée rapproche PCS 2003 et PCS 2020. Pour une évolution comparable, choisissez les 6 grands groupes."
    return {
        "context": {
            "year": payload.year,
            "level": payload.level,
            "level_label": CSP_LEVELS[payload.level],
            "csp_code": payload.csp_code,
            "csp_label": selected_option["label"],
            "group_label": selected_option["group_label"],
            "region": payload.region,
            "region_label": region_label,
            "age": payload.age,
            "age_label": age_label,
            "sex": payload.sex,
            "sex_label": sex_label,
        },
        "kpis": [
            {"key": "population", "label": "Actifs en emploi", "value": population,
             "kind": "quantity", "detail": f"{region_label} · {age_label} · {sex_label}"},
            {"key": "selected", "label": "Effectif de la CSP", "value": selected,
             "kind": "quantity", "detail": "effectif pondéré Insee"},
            {"key": "share", "label": "Part de la CSP", "value": share,
             "kind": "percent", "detail": "parmi les actifs en emploi"},
            {"key": "sex_ratio", "label": "Femmes / hommes", "value": ratio,
             "kind": "ratio", "detail": ratio_text},
        ],
        "territories": territories,
        "france_reference": {
            "effectif": france_selected,
            "population": france_population,
            "share": france_share,
        },
        "top_territory": top_territory,
        "age_sex": age_sex,
        "composition": composition,
        "evolution": evolution,
        "evolution_note": evolution_note,
        "nomenclatures": metadata.get("nomenclatures", []),
        "quality": {
            "regions": len(territories),
            "weighted": True,
            "masked_cells": 0,
            "scope": "Actifs ayant un emploi",
        },
    }


def csp_extraction_columns(payload: CspExtractionRequest) -> list[dict[str, str]]:
    return ([{"key": key, "label": CSP_DIMENSIONS[key][0], "kind": "dimension"}
             for key in payload.dimensions]
            + [{"key": key, "label": CSP_MEASURES[key][0], "kind": CSP_MEASURES[key][2]}
               for key in payload.measures])


def _csp_extraction_query(payload: CspExtractionRequest, *, include_count: bool,
                          limit: int) -> tuple[str, list[Any]]:
    if payload.level not in CSP_LEVELS:
        raise ValueError("Le niveau de CSP sélectionné est inconnu.")
    if not payload.dimensions or not payload.measures:
        raise ValueError("Choisissez au moins une dimension et une mesure.")
    if any(key not in CSP_DIMENSIONS for key in payload.dimensions):
        raise ValueError("Une dimension CSP est inconnue.")
    if any(key not in CSP_MEASURES for key in payload.measures):
        raise ValueError("Une mesure CSP est inconnue.")
    selections = [f"{CSP_DIMENSIONS[key][1]} AS {key}" for key in payload.dimensions]
    groups = [CSP_DIMENSIONS[key][1] for key in payload.dimensions]
    output_dimensions = [f"t.{key} AS {key}" for key in payload.dimensions]
    available_measures = {
        "effectif": "COALESCE(s.effectif, 0)::DOUBLE AS effectif",
        "population": "t.population::DOUBLE AS population",
        "share": "(100.0 * COALESCE(s.effectif, 0) / NULLIF(t.population, 0))::DOUBLE AS share",
    }
    output_measures = [available_measures[key] for key in payload.measures]
    count_sql = ", COUNT(*) OVER() AS __total_rows" if include_count else ""
    sql = f"""WITH totals AS (
                  SELECT {', '.join(selections)}, SUM(effectif)::DOUBLE AS population
                    FROM csp
                   WHERE annee = ? AND niveau_csp = ?
                   GROUP BY {', '.join(groups)}
              ), selected AS (
                  SELECT {', '.join(selections)}, SUM(effectif)::DOUBLE AS effectif
                    FROM csp
                   WHERE annee = ? AND niveau_csp = ? AND code_csp = ?
                   GROUP BY {', '.join(groups)}
              ), aggregated AS (
                  SELECT {', '.join(output_dimensions + output_measures)}
                    FROM totals t LEFT JOIN selected s USING ({', '.join(payload.dimensions)})
              )
              SELECT *{count_sql} FROM aggregated
              ORDER BY {payload.dimensions[0]} LIMIT {int(limit)}"""
    return sql, [payload.year, payload.level, payload.year, payload.level, payload.csp_code]


def csp_extraction_preview(repo: CspRepository, payload: CspExtractionRequest) -> dict[str, Any]:
    _require_source(repo)
    metadata = csp_metadata(repo)
    level = next((item for item in metadata["levels"] if item["key"] == payload.level), None)
    if level is None or not any(item["code"] == payload.csp_code for item in level["options"]):
        raise ValueError("La CSP sélectionnée est inconnue.")
    sql, params = _csp_extraction_query(payload, include_count=True, limit=payload.limit)
    rows = repo.query(sql, params)
    total_rows = int(rows[0].pop("__total_rows")) if rows else 0
    for row in rows[1:]:
        row.pop("__total_rows", None)
    return {
        "columns": csp_extraction_columns(payload),
        "rows": rows,
        "total_rows": total_rows,
        "limited": total_rows > payload.limit,
    }


def csp_extraction_rows(repo: CspRepository, payload: CspExtractionRequest,
                        *, limit: int = 250000) -> list[dict[str, Any]]:
    _require_source(repo)
    sql, params = _csp_extraction_query(payload, include_count=False, limit=limit + 1)
    rows = repo.query(sql, params)
    if len(rows) > limit:
        raise ValueError(f"L’extraction dépasse la limite de {limit:,} lignes.".replace(",", " "))
    return rows
