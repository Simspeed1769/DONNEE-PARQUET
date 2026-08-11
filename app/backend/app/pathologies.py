from __future__ import annotations

from functools import lru_cache
from typing import Any, Protocol

from pydantic import BaseModel, Field


class PathologyRepository(Protocol):
    has_pathologies: bool

    def query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]: ...


PATHOLOGY_REGIONS = {
    "01": "Guadeloupe", "02": "Martinique", "03": "Guyane", "04": "La Réunion",
    "06": "Mayotte", "11": "Île-de-France", "24": "Centre-Val de Loire",
    "27": "Bourgogne-Franche-Comté", "28": "Normandie", "32": "Hauts-de-France",
    "44": "Grand Est", "52": "Pays de la Loire", "53": "Bretagne",
    "75": "Nouvelle-Aquitaine", "76": "Occitanie", "84": "Auvergne-Rhône-Alpes",
    "93": "Provence-Alpes-Côte d’Azur", "94": "Corse", "99": "France entière",
}


PATHOLOGY_DIMENSIONS = {
    "year": ("Année", "year(annee)"),
    "sex": ("Sexe", "libelle_sexe"),
    "age": ("Tranche d’âge", "cla_age_5"),
    "region": ("Région", "region"),
}


PATHOLOGY_MEASURES = {
    "patients": ("Patients", "SUM(ntop)::DOUBLE", "quantity"),
    "population": ("Population de référence", "SUM(npop)::DOUBLE", "quantity"),
    "prevalence": ("Prévalence", "100.0 * SUM(ntop) / NULLIF(SUM(npop), 0)", "percent"),
}


class PathologyOverviewRequest(BaseModel):
    top: str
    year: int = Field(ge=2000, le=2100)
    region: str = "99"
    age: str = "tsage"
    sex: str = "tous sexes"


class PathologyExtractionRequest(BaseModel):
    top: str
    start_year: int = Field(ge=2000, le=2100)
    end_year: int = Field(ge=2000, le=2100)
    dimensions: list[str] = Field(default_factory=lambda: ["year", "sex", "region"])
    measures: list[str] = Field(default_factory=lambda: ["patients", "prevalence"])
    limit: int = Field(default=500, ge=1, le=1000)


def _require_source(repo: PathologyRepository) -> None:
    if not repo.has_pathologies:
        raise ValueError("La base Pathologies n’est pas disponible.")


@lru_cache(maxsize=2)
def pathology_metadata(repo: PathologyRepository) -> dict[str, Any]:
    _require_source(repo)
    years = [int(row["year"]) for row in repo.query(
        "SELECT DISTINCT year(annee) AS year FROM pathologies ORDER BY 1"
    )]
    rows = repo.query(
        """
        SELECT DISTINCT patho_niv1 AS level1, patho_niv2 AS level2,
                        patho_niv3 AS level3, top, niveau_prioritaire
        FROM pathologies
        WHERE dept = '999' AND region = '99' AND cla_age_5 = 'tsage'
          AND libelle_sexe = 'tous sexes' AND patho_niv1 IS NOT NULL
          AND COALESCE(patho_niv3, patho_niv2, patho_niv1) NOT ILIKE 'Total consommants%'
          AND COALESCE(patho_niv3, patho_niv2, patho_niv1) NOT ILIKE 'Pas de pathologie repérée%'
        ORDER BY level1, level2 NULLS FIRST, level3 NULLS FIRST
        """
    )
    families: dict[str, dict[str, Any]] = {}
    for row in rows:
        code = str(row["top"])
        level1 = str(row["level1"] or "Autres")
        level2 = str(row["level2"] or level1)
        level3 = str(row["level3"] or level2)
        priorities = {item.strip() for item in str(row["niveau_prioritaire"] or "").split(",")}
        family = families.setdefault(level1, {"label": level1, "code": None, "groups": {}})
        if "1" in priorities:
            family["code"] = family["code"] or code
        group = family["groups"].setdefault(level2, {
            "label": level2, "code": None, "pathologies": [], "seen": set(),
        })
        if "2" in priorities:
            group["code"] = group["code"] or code
        if "3" in priorities and code not in group["seen"]:
            group["seen"].add(code)
            group["pathologies"].append({"code": code, "label": level3})

    # Le poids national de chaque « top » sur le dernier millésime. Il ne sert
    # pas à afficher un chiffre mais à **classer** : un sélecteur qui propose
    # 118 pathologies dans l'ordre de la nomenclature demande de connaître la
    # nomenclature ; classées par nombre de patients, les plus courantes se
    # présentent d'elles-mêmes.
    weights = {
        str(row["top"]): float(row["patients"] or 0)
        for row in repo.query(
            """SELECT top, MAX(ntop) AS patients FROM pathologies
               WHERE dept = '999' AND region = '99' AND cla_age_5 = 'tsage'
                 AND libelle_sexe = 'tous sexes' AND year(annee) = ?
               GROUP BY top""",
            [max(years)],
        )
    }

    def _weighted(code: str, label: str) -> dict[str, Any]:
        return {"code": code, "label": label, "patients": weights.get(code)}

    hierarchy: list[dict[str, Any]] = []
    for family in families.values():
        groups = []
        for group in family["groups"].values():
            group_code = group["code"] or (group["pathologies"][0]["code"] if group["pathologies"] else None)
            if group_code is None:
                continue
            groups.append({
                "label": group["label"], "code": group_code,
                "patients": weights.get(group_code),
                "pathologies": [_weighted(item["code"], item["label"])
                                for item in group["pathologies"]],
            })
        family_code = family["code"] or (groups[0]["code"] if groups else None)
        if family_code is not None:
            hierarchy.append({"label": family["label"], "code": family_code,
                              "patients": weights.get(family_code), "groups": groups})

    ages = repo.query(
        f"""SELECT DISTINCT cla_age_5 AS code FROM pathologies
            WHERE cla_age_5 IS NOT NULL AND cla_age_5 <> 'tsage'
            ORDER BY {_age_order()}"""
    )
    return {
        "available": True,
        "levels": 3,
        "years": years,
        "default_year": max(years),
        "families": hierarchy,
        "regions": [{"code": code, "label": label} for code, label in PATHOLOGY_REGIONS.items()],
        "ages": [{"code": "tsage", "label": "Tous âges"}, *[
            {"code": str(row["code"]), "label": _age_label(row["code"])} for row in ages
        ]],
        "sexes": [
            {"code": "tous sexes", "label": "Tous sexes"},
            {"code": "femmes", "label": "Femmes"},
            {"code": "hommes", "label": "Hommes"},
        ],
        "dimensions": [{"key": key, "label": value[0]} for key, value in PATHOLOGY_DIMENSIONS.items()],
        "measures": [{"key": key, "label": value[0], "kind": value[2]}
                     for key, value in PATHOLOGY_MEASURES.items()],
        "source": "Cartographie des pathologies · Cnam",
    }


def _age_order(expression: str = "cla_age_5") -> str:
    return (f"COALESCE(TRY_CAST(split_part({expression}, '-', 1) AS INTEGER), "
            f"TRY_CAST(replace({expression}, 'et+', '') AS INTEGER), 999)")


def _points(delta: float | None) -> str:
    """Un écart en points de pourcentage, écrit en français.

    Virgule décimale, signe explicite parce qu'il s'agit bien d'une variation,
    et accord au pluriel plutôt qu'un « point(s) » entre parenthèses — une
    interface qui hésite sur le nombre se lit comme un brouillon.
    """
    if delta is None:
        return "—"
    number = f"{delta:+.2f}".replace(".", ",")
    return f"{number} point" if abs(delta) < 2 else f"{number} points"


def _age_label(value: Any) -> str:
    text = str(value)
    if text == "tsage":
        return "Tous âges"
    if text.endswith("et+"):
        return f"{int(text[:-3])} ans et +"
    if "-" in text:
        start, end = text.split("-", 1)
        return f"{int(start)}–{int(end)} ans"
    return text


def pathology_overview(repo: PathologyRepository, payload: PathologyOverviewRequest) -> dict[str, Any]:
    _require_source(repo)
    if payload.sex not in {"tous sexes", "femmes", "hommes"}:
        raise ValueError("Le sexe sélectionné est inconnu.")

    def nullable_float(value: Any) -> float | None:
        return float(value) if value is not None else None

    identity = repo.query(
        """SELECT patho_niv1 AS family, COALESCE(patho_niv3, patho_niv2, patho_niv1) AS label
           FROM pathologies WHERE top = ? LIMIT 1""", [payload.top]
    )
    if not identity:
        raise ValueError("La pathologie sélectionnée est inconnue.")
    annual_rows = repo.query(
        """
        SELECT year(annee) AS year, ntop::DOUBLE AS patients, npop::DOUBLE AS population,
               (100.0 * ntop / NULLIF(npop, 0))::DOUBLE AS prevalence
        FROM pathologies
        WHERE top = ? AND dept = '999' AND region = ?
          AND cla_age_5 = ? AND libelle_sexe = ?
        ORDER BY 1
        """, [payload.top, payload.region, payload.age, payload.sex]
    )
    annual = [{"year": int(row["year"]), "patients": nullable_float(row["patients"]),
               "prevalence": nullable_float(row["prevalence"])} for row in annual_rows]
    if payload.region == "99":
        france_annual = annual
    else:
        france_annual_rows = repo.query(
            """
            SELECT year(annee) AS year, ntop::DOUBLE AS patients,
                   (100.0 * ntop / NULLIF(npop, 0))::DOUBLE AS prevalence
            FROM pathologies
            WHERE top = ? AND dept = '999' AND region = '99'
              AND cla_age_5 = ? AND libelle_sexe = ?
            ORDER BY 1
            """, [payload.top, payload.age, payload.sex]
        )
        france_annual = [{"year": int(row["year"]), "patients": nullable_float(row["patients"]),
                          "prevalence": nullable_float(row["prevalence"])} for row in france_annual_rows]
    current = next((row for row in annual if row["year"] == payload.year), None)
    if current is None:
        raise ValueError("Aucune donnée n’est disponible pour cette pathologie et cette année.")
    first = next((row for row in annual if row["patients"] is not None and row["patients"] > 0), current)
    sexes = repo.query(
        """
        SELECT libelle_sexe AS sex, ntop::DOUBLE AS patients,
               (100.0 * ntop / NULLIF(npop, 0))::DOUBLE AS prevalence
        FROM pathologies
        WHERE top = ? AND year(annee) = ? AND dept = '999' AND region = ?
          AND cla_age_5 = ? AND libelle_sexe IN ('femmes', 'hommes')
        """, [payload.top, payload.year, payload.region, payload.age]
    )
    by_sex = {str(row["sex"]): nullable_float(row["prevalence"]) for row in sexes}
    women = by_sex.get("femmes")
    men = by_sex.get("hommes")
    ratio = women / men if women is not None and men not in (None, 0) else None
    sex_clause = "libelle_sexe IN ('femmes', 'hommes')" if payload.sex == "tous sexes" else "libelle_sexe = ?"
    sex_params: list[Any] = [] if payload.sex == "tous sexes" else [payload.sex]
    age_rows = repo.query(
        f"""
        SELECT cla_age_5 AS age, libelle_sexe AS sex, ntop::DOUBLE AS patients,
               (100.0 * ntop / NULLIF(npop, 0))::DOUBLE AS prevalence
        FROM pathologies
        WHERE top = ? AND year(annee) = ? AND dept = '999' AND region = ?
          AND cla_age_5 <> 'tsage' AND {sex_clause}
        ORDER BY {_age_order()}, sex
        """, [payload.top, payload.year, payload.region, *sex_params]
    )
    quality_age_clause = "cla_age_5 <> 'tsage'" if payload.age == "tsage" else "cla_age_5 = ?"
    quality_age_params: list[Any] = [] if payload.age == "tsage" else [payload.age]
    quality_sex_clause = "libelle_sexe IN ('femmes', 'hommes')" if payload.sex == "tous sexes" else "libelle_sexe = ?"
    quality_sex_params: list[Any] = [] if payload.sex == "tous sexes" else [payload.sex]
    territory_rows = repo.query(
        f"""
        WITH quality AS (
            SELECT region,
                   SUM(CASE WHEN ntop IS NULL THEN 1 ELSE 0 END)::INTEGER AS masked_cells,
                   COUNT(*)::INTEGER AS total_cells
            FROM pathologies
            WHERE top = ? AND year(annee) = ? AND dept = '999' AND region <> '99'
              AND {quality_age_clause} AND {quality_sex_clause}
            GROUP BY region
        )
        SELECT p.region, p.ntop::DOUBLE AS patients,
               (100.0 * p.ntop / NULLIF(p.npop, 0))::DOUBLE AS prevalence,
               COALESCE(q.masked_cells, 0) AS masked_cells,
               COALESCE(q.total_cells, 0) AS total_cells
        FROM pathologies p LEFT JOIN quality q USING (region)
        WHERE p.top = ? AND year(p.annee) = ? AND p.dept = '999' AND p.region <> '99'
          AND p.cla_age_5 = ? AND p.libelle_sexe = ?
        ORDER BY prevalence DESC NULLS LAST
        """, [payload.top, payload.year, *quality_age_params, *quality_sex_params,
               payload.top, payload.year, payload.age, payload.sex]
    )
    france_rows = repo.query(
        """SELECT ntop::DOUBLE AS patients,
                  (100.0 * ntop / NULLIF(npop, 0))::DOUBLE AS prevalence
           FROM pathologies
           WHERE top = ? AND year(annee) = ? AND dept = '999' AND region = '99'
             AND cla_age_5 = ? AND libelle_sexe = ?""",
        [payload.top, payload.year, payload.age, payload.sex],
    )
    france = france_rows[0] if france_rows else {"patients": None, "prevalence": None}
    total_masked = sum(int(row["masked_cells"] or 0) for row in territory_rows)
    total_cells = sum(int(row["total_cells"] or 0) for row in territory_rows)
    unavailable_territories = sum(1 for row in territory_rows if row["prevalence"] is None)
    point_delta = (current["prevalence"] - first["prevalence"]
                   if current["prevalence"] is not None and first["prevalence"] is not None else None)
    rounded_ratio = round(ratio, 1) if ratio is not None else None
    ratio_detail = ((f"{rounded_ratio:g}".replace(".", ",") + " femme pour 1 homme")
                    if rounded_ratio is not None else "Prévalence non disponible")
    return {
        "context": {"top": payload.top, "label": str(identity[0]["label"]),
                    "family": str(identity[0]["family"]), "year": payload.year,
                    "region": payload.region, "age": payload.age, "sex": payload.sex},
        "kpis": [
            {"key": "patients", "label": "Patients", "value": current["patients"], "kind": "quantity",
             "detail": str(payload.year)},
            {"key": "prevalence", "label": "Prévalence", "value": current["prevalence"], "kind": "percent",
             "detail": "population de référence"},
            {"key": "evolution", "label": f"Évolution depuis {first['year']}",
             "value": (100 * (current["patients"] / first["patients"] - 1)
                       if current["patients"] is not None and first["patients"] not in (None, 0) else None),
             "kind": "percent", "detail": _points(point_delta)},
            {"key": "sex_ratio", "label": "Ratio femmes / hommes", "value": ratio, "kind": "ratio",
             "detail": ratio_detail},
        ],
        "annual": annual,
        "france_annual": france_annual,
        "age_sex": [{"age": _age_label(row["age"]), "sex": str(row["sex"]),
                     "patients": float(row["patients"]) if row["patients"] is not None else None,
                     "prevalence": float(row["prevalence"]) if row["prevalence"] is not None else None}
                    for row in age_rows],
        "territories": [{
            "code": str(row["region"]),
            "label": PATHOLOGY_REGIONS.get(str(row["region"]), f"Région {row['region']}"),
            "patients": nullable_float(row["patients"]),
            "prevalence": nullable_float(row["prevalence"]),
            "masked_cells": int(row["masked_cells"] or 0),
            "total_cells": int(row["total_cells"] or 0),
            "masked_share": (100.0 * int(row["masked_cells"] or 0) / int(row["total_cells"])
                             if int(row["total_cells"] or 0) else 0.0),
        } for row in territory_rows],
        "france_reference": {"patients": nullable_float(france["patients"]),
                             "prevalence": nullable_float(france["prevalence"])},
        "quality": {
            "masked_cells": total_masked,
            "total_cells": total_cells,
            "masked_share": 100.0 * total_masked / total_cells if total_cells else 0.0,
            "unavailable_territories": unavailable_territories,
            "available_territories": len(territory_rows) - unavailable_territories,
        },
    }


def pathology_extraction_columns(payload: PathologyExtractionRequest) -> list[dict[str, str]]:
    return ([{"key": key, "label": PATHOLOGY_DIMENSIONS[key][0], "kind": "dimension"}
             for key in payload.dimensions]
            + [{"key": key, "label": PATHOLOGY_MEASURES[key][0], "kind": PATHOLOGY_MEASURES[key][2]}
               for key in payload.measures])


def _pathology_extraction_query(payload: PathologyExtractionRequest, *, include_count: bool,
                                limit: int) -> tuple[str, list[Any]]:
    if payload.start_year > payload.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    if not payload.dimensions or not payload.measures:
        raise ValueError("Choisissez au moins une dimension et une mesure.")
    if any(key not in PATHOLOGY_DIMENSIONS for key in payload.dimensions):
        raise ValueError("Une dimension Pathologies est inconnue.")
    if any(key not in PATHOLOGY_MEASURES for key in payload.measures):
        raise ValueError("Une mesure Pathologies est inconnue.")
    clauses = ["top = ?", "year(annee) BETWEEN ? AND ?", "dept = '999'"]
    params: list[Any] = [payload.top, payload.start_year, payload.end_year]
    clauses.append("cla_age_5 <> 'tsage'" if "age" in payload.dimensions else "cla_age_5 = 'tsage'")
    clauses.append("libelle_sexe <> 'tous sexes'" if "sex" in payload.dimensions else "libelle_sexe = 'tous sexes'")
    clauses.append("region <> '99'" if "region" in payload.dimensions else "region = '99'")
    selections = [f"{PATHOLOGY_DIMENSIONS[key][1]} AS {key}" for key in payload.dimensions]
    measures = [f"({PATHOLOGY_MEASURES[key][1]})::DOUBLE AS {key}" for key in payload.measures]
    groups = [PATHOLOGY_DIMENSIONS[key][1] for key in payload.dimensions]
    count_sql = ", COUNT(*) OVER() AS __total_rows" if include_count else ""
    sql = f"""WITH aggregated AS (
                  SELECT {', '.join(selections + measures)}
                  FROM pathologies WHERE {' AND '.join(clauses)}
                  GROUP BY {', '.join(groups)}
              )
              SELECT *{count_sql} FROM aggregated
              ORDER BY {payload.dimensions[0]} LIMIT {int(limit)}"""
    return sql, params


def _humanize_pathology_rows(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        if "region" in row:
            row["region"] = PATHOLOGY_REGIONS.get(str(row["region"]), f"Région {row['region']}")
        if "age" in row:
            row["age"] = _age_label(row["age"])
        if "sex" in row:
            row["sex"] = str(row["sex"]).capitalize()


def pathology_extraction_preview(repo: PathologyRepository, payload: PathologyExtractionRequest) -> dict[str, Any]:
    _require_source(repo)
    sql, params = _pathology_extraction_query(payload, include_count=True, limit=payload.limit)
    rows = repo.query(sql, params)
    total_rows = int(rows[0].pop("__total_rows")) if rows else 0
    for row in rows[1:]:
        row.pop("__total_rows", None)
    _humanize_pathology_rows(rows)
    return {"columns": pathology_extraction_columns(payload), "rows": rows,
            "total_rows": total_rows, "limited": total_rows > payload.limit}


def pathology_extraction_rows(repo: PathologyRepository, payload: PathologyExtractionRequest,
                              *, limit: int = 250000) -> list[dict[str, Any]]:
    _require_source(repo)
    sql, params = _pathology_extraction_query(payload, include_count=False, limit=limit + 1)
    rows = repo.query(sql, params)
    if len(rows) > limit:
        raise ValueError(f"L’extraction dépasse la limite de {limit:,} lignes.".replace(",", " "))
    _humanize_pathology_rows(rows)
    return rows
