from __future__ import annotations

from functools import lru_cache
from typing import Any, Protocol

from pydantic import BaseModel, Field


class MortalityRepository(Protocol):
    has_mortality: bool

    def query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]: ...


MORTALITY_GROUPS = {
    "ensemble": "Ensemble",
    "femmes": "Femmes",
    "hommes": "Hommes",
    "0-64": "0–64 ans",
    "65-84": "65–84 ans",
    "85+": "85 ans ou plus",
}

MORTALITY_DIMENSIONS = {
    "year": ("Année", "year"),
    "population": ("Population", "population_group"),
    "cause": ("Cause de décès", "cause_label"),
}

MORTALITY_MEASURES = {
    "deaths": ("Décès", "quantity"),
    "share": ("Part des décès", "percent"),
}


class MortalityOverviewRequest(BaseModel):
    cause: str = "Toutes causes"
    population: str = "ensemble"
    year: int = Field(default=2024, ge=1979, le=2100)


class MortalityExtractionRequest(BaseModel):
    start_year: int = Field(default=2015, ge=1979, le=2100)
    end_year: int = Field(default=2024, ge=1979, le=2100)
    cause: str = "__all__"
    population: str = "__all__"
    dimensions: list[str] = Field(default_factory=lambda: ["year", "cause", "population"])
    measures: list[str] = Field(default_factory=lambda: ["deaths", "share"])
    limit: int = Field(default=500, ge=1, le=5000)


def _require_source(repo: MortalityRepository) -> None:
    if not repo.has_mortality:
        raise ValueError("La base Mortalité n’est pas disponible.")


def _float(value: Any) -> float | None:
    return float(value) if value is not None else None


@lru_cache(maxsize=2)
def mortality_metadata(repo: MortalityRepository) -> dict[str, Any]:
    _require_source(repo)
    years = [int(row["year"]) for row in repo.query("SELECT DISTINCT year FROM mortality ORDER BY 1")]
    last_year = max(years) if years else None
    # Le rang de chaque cause, son poids et **sa place dans la hiérarchie**.
    #
    # Le CépiDc publie des chapitres puis leurs détails, ces derniers préfixés
    # « dont » ; le cube porte déjà la distinction dans `is_detail`, mais la
    # fiche seule ne la donnait pas. Le sélecteur de comparaison en a besoin
    # pour deux raisons : rattacher un détail à son chapitre, et savoir quand un
    # « reste du périmètre » est licite — additionner un chapitre et l'un de ses
    # détails compterait deux fois les mêmes décès.
    causes = repo.query(
        """SELECT cause_code AS code, cause_label AS label,
                  MIN(cause_order) AS cause_order,
                  BOOL_OR(COALESCE(is_detail, false)) AS is_detail,
                  MAX(CASE WHEN year = ? THEN deaths END) AS deaths
           FROM mortality
           WHERE population_group = 'ensemble'
           GROUP BY cause_code, cause_label
           ORDER BY cause_order""",
        [last_year],
    )
    chapter = ""
    described: list[dict[str, Any]] = []
    for row in causes:
        detail = bool(row["is_detail"])
        if not detail:
            chapter = str(row["label"])
        described.append({
            "code": str(row["code"]),
            "label": str(row["label"]),
            "detail": detail,
            "chapter": chapter,
            "deaths": _float(row["deaths"]),
        })
    groups = [{"code": code, "label": label} for code, label in MORTALITY_GROUPS.items()]
    return {
        "available": True,
        "years": years,
        "default_year": max(years) if years else None,
        "causes": described,
        "populations": groups,
        "dimensions": [{"key": key, "label": value[0]} for key, value in MORTALITY_DIMENSIONS.items()],
        "measures": [{"key": key, "label": value[0], "kind": value[1]}
                     for key, value in MORTALITY_MEASURES.items()],
        "source": "INSERM–CépiDc · Statistiques nationales sur les causes de décès",
        "scope": "Personnes résidant et décédées en France (Métropole et DROM)",
        "limitations": [
            "Base nationale : aucune ventilation régionale ou individuelle.",
            "Les décès de résidents français survenus à l’étranger ne sont pas inclus.",
            "Les effectifs sont bruts et ne sont pas rapportés à une population exposée : ils ne mesurent pas le risque de mortalité.",
            "Les blocs femmes/hommes et âges sont publiés séparément ; aucun croisement sexe × âge n’est disponible.",
            "La part d’une cause parmi tous les décès est un indicateur de composition, pas une mesure du risque.",
            "Les cellules vides sont conservées comme non disponibles/non applicables, jamais remplacées par zéro.",
            "Des ruptures de série (notamment autour de 2018–2019 et 2021–2022) peuvent refléter des changements de codage des causes.",
        ],
    }


def mortality_overview(repo: MortalityRepository, payload: MortalityOverviewRequest) -> dict[str, Any]:
    _require_source(repo)
    metadata = mortality_metadata(repo)
    valid_years = set(metadata["years"])
    if payload.year not in valid_years:
        raise ValueError("Le millésime Mortalité sélectionné est indisponible.")
    cause = next((item for item in metadata["causes"] if item["code"] == payload.cause), None)
    if cause is None:
        # Backward-friendly support for callers that pass the visible label.
        cause = next((item for item in metadata["causes"] if item["label"] == payload.cause), None)
    if cause is None:
        raise ValueError("La cause de décès sélectionnée est inconnue.")
    if payload.population not in MORTALITY_GROUPS:
        raise ValueError("Le périmètre de population sélectionné est inconnu.")

    annual_rows = repo.query(
        """SELECT year, deaths FROM mortality
           WHERE cause_code = ? AND population_group = ? ORDER BY year""",
        [cause["code"], payload.population],
    )
    total_rows = repo.query(
        """SELECT year, deaths FROM mortality
           WHERE cause_order = (SELECT MIN(cause_order) FROM mortality)
           AND population_group = ? ORDER BY year""",
        [payload.population],
    )
    totals = {int(row["year"]): _float(row["deaths"]) for row in total_rows}
    annual = []
    for row in annual_rows:
        year = int(row["year"])
        deaths = _float(row["deaths"])
        total = totals.get(year)
        annual.append({
            "year": year,
            "deaths": deaths,
            "share": (100.0 * deaths / total if deaths is not None and total not in (None, 0) else None),
        })
    current = next((row for row in annual if row["year"] == payload.year), None)
    if current is None:
        raise ValueError("Aucune donnée n’est disponible pour cette cause et ce millésime.")
    current_total = totals.get(payload.year)
    first = next((item for item in annual if item["deaths"] is not None), current)
    evolution = None
    if current["deaths"] is not None and first["deaths"] not in (None, 0):
        evolution = 100.0 * (current["deaths"] / first["deaths"] - 1.0)
    share = (100.0 * current["deaths"] / current_total
             if current["deaths"] is not None and current_total not in (None, 0) else None)
    top_rows = repo.query(
        """SELECT cause_code AS code, cause_label AS label, deaths
           FROM mortality
           WHERE year = ? AND population_group = ?
             AND cause_order > (SELECT MIN(cause_order) FROM mortality)
             AND COALESCE(is_detail, false) = false
           ORDER BY deaths DESC NULLS LAST LIMIT 12""",
        [payload.year, payload.population],
    )
    top = [{"code": str(row["code"]), "label": str(row["label"]), "deaths": _float(row["deaths"]),
            "share": (100.0 * float(row["deaths"]) / current_total if row["deaths"] is not None and current_total else None)}
           for row in top_rows]

    profile_specs = {
        "sex": [("femmes", "Femmes"), ("hommes", "Hommes")],
        "age": [("0-64", "0–64 ans"), ("65-84", "65–84 ans"), ("85+", "85 ans ou plus")],
    }
    profiles: dict[str, list[dict[str, Any]]] = {}
    for profile_key, options in profile_specs.items():
        codes = [code for code, _ in options]
        placeholders = ", ".join("?" for _ in codes)
        profile_rows = repo.query(
            f"""SELECT population_group, deaths FROM mortality
                WHERE cause_code = ? AND year = ? AND population_group IN ({placeholders})""",
            [cause["code"], payload.year, *codes],
        )
        values = {str(row["population_group"]): _float(row["deaths"]) for row in profile_rows}
        profile_total = sum(value for value in values.values() if value is not None)
        profiles[profile_key] = [
            {
                "code": code,
                "label": label,
                "deaths": values.get(code),
                "share": (100.0 * values[code] / profile_total if values.get(code) is not None and profile_total else None),
            }
            for code, label in options
        ]
    return {
        "context": {"cause": cause["code"], "cause_label": cause["label"],
                    "population": payload.population, "population_label": MORTALITY_GROUPS[payload.population],
                    "year": payload.year},
        "kpis": [
            {"key": "deaths", "label": "Décès", "value": current["deaths"], "kind": "quantity",
             "detail": f"{payload.year} · {MORTALITY_GROUPS[payload.population]}"},
            {"key": "share", "label": "Part des décès", "value": share, "kind": "percent",
             "detail": f"dans toutes les causes · {payload.year}"},
            {"key": "evolution", "label": f"Évolution depuis {first['year']}", "value": evolution,
             "kind": "percent", "detail": f"même cause et même population · jusqu’en {payload.year}"},
            {"key": "total", "label": "Repère · toutes causes", "value": current_total, "kind": "quantity",
             "detail": f"référence · {payload.year} · même population"},
        ],
        "annual": annual,
        "top_causes": top,
        "profiles": profiles,
        "quality": {"source_note": "Effectifs publiés par le CépiDc. Les valeurs ne sont pas estimées.",
                     "scope": metadata["scope"], "limitations": metadata["limitations"]},
    }


def mortality_extraction_columns(payload: MortalityExtractionRequest) -> list[dict[str, str]]:
    return ([{"key": key, "label": MORTALITY_DIMENSIONS[key][0], "kind": "dimension"}
             for key in payload.dimensions]
            + [{"key": key, "label": MORTALITY_MEASURES[key][0], "kind": MORTALITY_MEASURES[key][1]}
               for key in payload.measures])


def _validate_mortality_extraction(repo: MortalityRepository, payload: MortalityExtractionRequest) -> None:
    metadata = mortality_metadata(repo)
    if payload.start_year > payload.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    valid_years = set(metadata["years"])
    if payload.start_year not in valid_years or payload.end_year not in valid_years:
        raise ValueError("La période sélectionnée n’est pas disponible dans la source Mortalité.")
    if not payload.dimensions or not payload.measures:
        raise ValueError("Choisissez au moins une dimension et une mesure.")
    if any(key not in MORTALITY_DIMENSIONS for key in payload.dimensions):
        raise ValueError("Une dimension Mortalité est inconnue.")
    if any(key not in MORTALITY_MEASURES for key in payload.measures):
        raise ValueError("Une mesure Mortalité est inconnue.")
    valid_causes = {item["code"] for item in metadata["causes"]}
    if payload.cause != "__all__" and payload.cause not in valid_causes:
        raise ValueError("La cause de décès sélectionnée est inconnue.")
    if payload.population != "__all__" and payload.population not in MORTALITY_GROUPS:
        raise ValueError("Le périmètre de population sélectionné est inconnu.")
    if payload.start_year != payload.end_year and "year" not in payload.dimensions:
        raise ValueError("Conservez la dimension Année lorsque plusieurs millésimes sont sélectionnés.")
    if payload.cause == "__all__" and "cause" not in payload.dimensions:
        raise ValueError("Conservez la dimension Cause lorsque toutes les causes sont sélectionnées.")
    if payload.population == "__all__" and "population" not in payload.dimensions:
        raise ValueError("Conservez la dimension Population lorsque tous les périmètres sont sélectionnés.")


def _mortality_extraction_query(payload: MortalityExtractionRequest, *, include_count: bool,
                                limit: int) -> tuple[str, list[Any]]:
    clauses = ["m.year BETWEEN ? AND ?"]
    params: list[Any] = [payload.start_year, payload.end_year]
    if payload.cause != "__all__":
        clauses.append("m.cause_code = ?")
        params.append(payload.cause)
    if payload.population != "__all__":
        clauses.append("m.population_group = ?")
        params.append(payload.population)
    dimensions = {
        "year": "m.year AS year",
        "cause": "m.cause_label AS cause",
        "population": "m.population_group AS population",
    }
    measures = {
        "deaths": "m.deaths::DOUBLE AS deaths",
        "share": "(100.0 * m.deaths / NULLIF(t.deaths, 0))::DOUBLE AS share",
    }
    selections = [dimensions[key] for key in payload.dimensions] + [measures[key] for key in payload.measures]
    count_sql = ", COUNT(*) OVER() AS __total_rows" if include_count else ""
    sql = f"""SELECT {', '.join(selections)}{count_sql}
              FROM mortality m
              LEFT JOIN mortality t
                ON t.year = m.year
               AND t.population_group = m.population_group
               AND t.cause_order = (SELECT MIN(cause_order) FROM mortality)
              WHERE {' AND '.join(clauses)}
              ORDER BY m.year, m.cause_order, m.population_group
              LIMIT {int(limit)}"""
    return sql, params


def _humanize_mortality_rows(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        if "population" in row:
            row["population"] = MORTALITY_GROUPS.get(str(row["population"]), str(row["population"]))


def mortality_extraction_preview(repo: MortalityRepository, payload: MortalityExtractionRequest) -> dict[str, Any]:
    _require_source(repo)
    _validate_mortality_extraction(repo, payload)
    sql, params = _mortality_extraction_query(payload, include_count=True, limit=payload.limit)
    rows = repo.query(sql, params)
    total_rows = int(rows[0].pop("__total_rows")) if rows else 0
    for row in rows[1:]:
        row.pop("__total_rows", None)
    _humanize_mortality_rows(rows)
    return {
        "columns": mortality_extraction_columns(payload),
        "rows": rows,
        "total_rows": total_rows,
        "limited": total_rows > payload.limit,
    }


def mortality_extraction_rows(repo: MortalityRepository, payload: MortalityExtractionRequest,
                              *, limit: int = 250000) -> list[dict[str, Any]]:
    _require_source(repo)
    _validate_mortality_extraction(repo, payload)
    sql, params = _mortality_extraction_query(payload, include_count=False, limit=limit + 1)
    rows = repo.query(sql, params)
    if len(rows) > limit:
        raise ValueError(f"L’extraction dépasse la limite de {limit:,} lignes.".replace(",", " "))
    _humanize_mortality_rows(rows)
    return rows
