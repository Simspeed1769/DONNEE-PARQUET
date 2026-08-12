"""La population résidente Insee : cinquième base, et dénominateur de référence.

Deux rôles, une seule source. La base se consulte comme les quatre autres —
évolution, territoire, âge, sexe — et sert de dénominateur aux mesures « par
habitant » des autres bases, à la place de la population de référence que la
Cnam publie avec ses effectifs.

**Ce que la source dit, et ce qu'elle ne dit pas.** L'Insee publie une
population au **1er janvier**. Un effectif de flux — des remboursements, des
décès — se rapporte à une population *moyenne* sur l'année : c'est la demi-somme
des 1er janvier N et N+1, que `population_reference` calcule. Sur la dernière
année disponible, N+1 manque : le 1er janvier seul sert alors de dénominateur,
et la réserve le dit plutôt que de laisser croire à une moyenne.

**Les régions sont rétropolées sur les 13 régions actuelles depuis 1975.** Il n'y
a donc aucune réforme régionale à gérer sur cette source. Restent trois trous
que le script d'ingestion journalise et que l'écran affiche : la métropole seule
avant 1990, Mayotte à partir de 2014, et l'âge non détaillé au-delà de 90 ans
sur quelques cellules d'outre-mer des années 1990.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Any, Protocol

from pydantic import BaseModel, Field


class PopulationRepository(Protocol):
    has_population: bool

    def query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]: ...


# Le code du périmètre national. La source ne le publie pas comme une ligne : il
# se recalcule par somme des régions, exactement comme l'« Ensemble » se
# recalcule par somme des sexes.
FRANCE = "99"
FRANCE_LABEL = "France entière"
ALL_AGES = "tsage"
ALL_AGES_LABEL = "Tous âges"
ALL_SEXES = "tous sexes"

SEXES = {
    ALL_SEXES: "Tous sexes",
    "femmes": "Femmes",
    "hommes": "Hommes",
}
# Le libellé stocké dans le Parquet, par code de l'application.
SEX_VALUES = {"femmes": "Femmes", "hommes": "Hommes"}

POPULATION_DIMENSIONS = {
    "year": ("Année", "annee"),
    "region": ("Région", "region_libelle"),
    "age": ("Tranche d’âge", "age_libelle"),
    "sex": ("Sexe", "sexe"),
}

POPULATION_MEASURES = {
    "population": ("Population", "quantity"),
    "share": ("Part du périmètre", "percent"),
}

SOURCE_LABEL = "Insee · Estimations de population par région, sexe et âge quinquennal"
SCOPE_LABEL = "France (Métropole et DROM), population au 1er janvier"

LIMITATIONS = [
    "Population au 1er janvier de l’année : ce n’est pas une population moyenne annuelle.",
    "1975 à 1989 : métropole seule, la source ne publie pas les DROM par sexe et âge.",
    "Mayotte n’entre dans la série qu’à partir de 2014.",
    "La Guadeloupe est publiée hors Saint-Martin et Saint-Barthélemy.",
    "Les régions sont rétropolées sur les 13 régions actuelles depuis 1975 : aucune rupture de la réforme de 2016 n’apparaît, mais les chiffres anciens sont reconstitués.",
    "Les derniers millésimes sont provisoires ou précoces et seront révisés par l’Insee.",
    "Le total « Ensemble » n’est pas chargé : il est recalculé par somme des hommes et des femmes.",
]


class PopulationOverviewRequest(BaseModel):
    year: int = Field(default=2026, ge=1975, le=2100)
    start_year: int = Field(default=1975, ge=1975, le=2100)
    end_year: int = Field(default=2026, ge=1975, le=2100)
    region: str = FRANCE
    age: str = ALL_AGES
    sex: str = ALL_SEXES


class PopulationExtractionRequest(BaseModel):
    start_year: int = Field(default=2015, ge=1975, le=2100)
    end_year: int = Field(default=2026, ge=1975, le=2100)
    region: str = "__all__"
    age: str = "__all__"
    sex: str = "__all__"
    dimensions: list[str] = Field(default_factory=lambda: ["year", "region"])
    measures: list[str] = Field(default_factory=lambda: ["population"])
    limit: int = Field(default=500, ge=1, le=5000)


def _require_source(repo: PopulationRepository) -> None:
    if not repo.has_population:
        raise ValueError(
            "La base Population n’est pas disponible : lancez tools/build_population.py.")


def _float(value: Any) -> float | None:
    return float(value) if value is not None else None


@lru_cache(maxsize=2)
def population_metadata(repo: PopulationRepository) -> dict[str, Any]:
    _require_source(repo)
    years = [int(row["annee"]) for row in repo.query(
        "SELECT DISTINCT annee FROM population ORDER BY 1")]
    if not years:
        raise ValueError("Aucun millésime exploitable dans la source Population.")
    regions = repo.query(
        """SELECT region AS code, ANY_VALUE(region_libelle) AS label,
                  min(annee) AS depuis
           FROM population GROUP BY region ORDER BY region""")
    ages = repo.query(
        """SELECT age_quinquennal AS code, ANY_VALUE(age_libelle) AS label,
                  min(age_decennal) AS decennal
           FROM population GROUP BY age_quinquennal ORDER BY code""")
    return {
        "available": True,
        "years": years,
        "default_year": max(years),
        "regions": [
            {"code": FRANCE, "label": FRANCE_LABEL, "depuis": min(years)},
            *[{"code": str(row["code"]), "label": str(row["label"]),
               "depuis": int(row["depuis"])} for row in regions],
        ],
        "ages": [
            {"code": ALL_AGES, "label": ALL_AGES_LABEL, "decennal": None},
            *[{"code": str(row["code"]), "label": str(row["label"]),
               "decennal": int(row["decennal"])} for row in ages],
        ],
        "sexes": [{"code": code, "label": label} for code, label in SEXES.items()],
        "dimensions": [{"key": key, "label": value[0]} for key, value in POPULATION_DIMENSIONS.items()],
        "measures": [{"key": key, "label": value[0], "kind": value[1]}
                     for key, value in POPULATION_MEASURES.items()],
        "source": SOURCE_LABEL,
        "scope": SCOPE_LABEL,
        "limitations": LIMITATIONS,
    }


def _scope_clauses(region: str, age: str, sex: str) -> tuple[list[str], list[Any]]:
    """Le périmètre en clauses paramétrées. « Tous » n'ajoute aucune clause : le
    filtre absent est une absence de restriction, jamais une valeur."""
    clauses: list[str] = []
    params: list[Any] = []
    if region != FRANCE:
        clauses.append("region = ?")
        params.append(region)
    if age != ALL_AGES:
        clauses.append("age_quinquennal = ?")
        params.append(age)
    if sex != ALL_SEXES:
        clauses.append("sexe = ?")
        params.append(SEX_VALUES[sex])
    return clauses, params


def _where(clauses: list[str]) -> str:
    return (" AND " + " AND ".join(clauses)) if clauses else ""


def population_overview(repo: PopulationRepository,
                        payload: PopulationOverviewRequest) -> dict[str, Any]:
    _require_source(repo)
    metadata = population_metadata(repo)
    years = set(metadata["years"])
    if payload.year not in years:
        raise ValueError("Ce millésime n’est pas disponible dans la source Insee.")
    if payload.start_year > payload.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    if payload.region != FRANCE and not any(
            item["code"] == payload.region for item in metadata["regions"]):
        raise ValueError("Le territoire sélectionné est inconnu.")
    if payload.age != ALL_AGES and not any(
            item["code"] == payload.age for item in metadata["ages"]):
        raise ValueError("La tranche d’âge sélectionnée est inconnue.")
    if payload.sex not in SEXES:
        raise ValueError("Le sexe sélectionné est inconnu.")

    clauses, params = _scope_clauses(payload.region, payload.age, payload.sex)
    scope_where = _where(clauses)

    # — Évolution : l'effectif du périmètre et sa part dans le territoire, année
    #   par année. Le dénominateur de la part est le même territoire, tous âges
    #   et tous sexes : c'est ce que « part du périmètre » veut dire.
    region_clause, region_params = ([], []) if payload.region == FRANCE else (["region = ?"], [payload.region])
    annual_rows = repo.query(
        f"""WITH scope AS (
                SELECT annee, SUM(population)::DOUBLE AS population
                FROM population
                WHERE annee BETWEEN ? AND ?{scope_where}
                GROUP BY annee),
            whole AS (
                SELECT annee, SUM(population)::DOUBLE AS population
                FROM population
                WHERE annee BETWEEN ? AND ?{_where(region_clause)}
                GROUP BY annee)
            SELECT w.annee AS year, s.population AS population,
                   (100.0 * s.population / NULLIF(w.population, 0))::DOUBLE AS share
            FROM whole w LEFT JOIN scope s USING (annee)
            ORDER BY 1""",
        [payload.start_year, payload.end_year, *params,
         payload.start_year, payload.end_year, *region_params],
    )
    annual = [{"year": int(row["year"]), "population": _float(row["population"]),
               "share": _float(row["share"])} for row in annual_rows]

    # — Territoire : le millésime courant, région par région. Une région entrée
    #   plus tard dans la série — Mayotte — n'y figure pas avant son temps.
    age_sex_clauses, age_sex_params = _scope_clauses(FRANCE, payload.age, payload.sex)
    territory_rows = repo.query(
        f"""SELECT region AS code, ANY_VALUE(region_libelle) AS label,
                   SUM(population)::DOUBLE AS population
            FROM population
            WHERE annee = ?{_where(age_sex_clauses)}
            GROUP BY region ORDER BY 3 DESC""",
        [payload.year, *age_sex_params],
    )
    national = sum(_float(row["population"]) or 0.0 for row in territory_rows)
    territories = [{
        "code": str(row["code"]), "label": str(row["label"]),
        "population": _float(row["population"]),
        "share": (100.0 * float(row["population"]) / national) if national and row["population"] is not None else None,
    } for row in territory_rows]

    # — Âge × sexe : la matière de la pyramide. Le filtre d'âge ne s'y applique
    #   pas — une pyramide d'une seule tranche n'est pas une pyramide ; c'est le
    #   territoire et le millésime qui la déterminent.
    pyramid_clauses, pyramid_params = _scope_clauses(payload.region, ALL_AGES, ALL_SEXES)

    def pyramid(year: int) -> list[dict[str, Any]]:
        rows = repo.query(
            f"""SELECT age_quinquennal AS age, ANY_VALUE(age_libelle) AS age_label,
                       ANY_VALUE(age_decennal) AS decennal, sexe AS sex,
                       SUM(population)::DOUBLE AS population,
                       BOOL_OR(age_90_plus_agrege) AS lumped
                FROM population
                WHERE annee = ?{_where(pyramid_clauses)}
                GROUP BY age_quinquennal, sexe
                ORDER BY age_quinquennal""",
            [year, *pyramid_params])
        return [{"age": str(row["age"]), "age_label": str(row["age_label"]),
                 "decennal": int(row["decennal"]), "sex": str(row["sex"]),
                 "population": _float(row["population"]),
                 "lumped": bool(row["lumped"])} for row in rows]

    age_sex = pyramid(payload.year)
    reference_year = payload.start_year if payload.start_year in years and payload.start_year != payload.year else None
    age_sex_reference = pyramid(reference_year) if reference_year else []

    # — Sexe : le profil du périmètre, femmes et hommes.
    sex_clauses, sex_params = _scope_clauses(payload.region, payload.age, ALL_SEXES)
    sex_rows = repo.query(
        f"""SELECT sexe AS sex, SUM(population)::DOUBLE AS population
            FROM population WHERE annee = ?{_where(sex_clauses)}
            GROUP BY sexe ORDER BY 1""",
        [payload.year, *sex_params])
    profile_total = sum(_float(row["population"]) or 0.0 for row in sex_rows)
    sex_profile = [{
        "code": "femmes" if str(row["sex"]) == "Femmes" else "hommes",
        "label": str(row["sex"]),
        "population": _float(row["population"]),
        "share": (100.0 * float(row["population"]) / profile_total) if profile_total else None,
    } for row in sex_rows]

    # — Repères chiffrés —
    current = next((row for row in annual if row["year"] == payload.year), None)
    previous = next((row for row in annual if row["year"] == payload.year - 1), None)
    change = None
    if current and previous and current["population"] is not None and previous["population"]:
        change = 100.0 * (current["population"] / previous["population"] - 1)
    # La part des 65 ans et plus se lit sur le territoire entier : elle ignore
    # le filtre d'âge, qui la rendrait tautologique — 100 % sur « 65-69 ans ».
    senior_clauses, senior_params = _scope_clauses(payload.region, ALL_AGES, payload.sex)
    seniors = repo.query(
        f"""SELECT SUM(population) FILTER (
                       WHERE age_quinquennal IN
                       ('65-69','70-74','75-79','80-84','85-89','90-94','95et+'))::DOUBLE AS seniors,
                   SUM(population)::DOUBLE AS total
            FROM population WHERE annee = ?{_where(senior_clauses)}""",
        [payload.year, *senior_params])
    senior_share = None
    if seniors and seniors[0]["total"]:
        senior_share = 100.0 * float(seniors[0]["seniors"] or 0) / float(seniors[0]["total"])

    region_label = next((item["label"] for item in metadata["regions"]
                         if item["code"] == payload.region), payload.region)
    age_label = next((item["label"] for item in metadata["ages"]
                      if item["code"] == payload.age), payload.age)
    lumped_cells = any(row["lumped"] for row in age_sex)

    return {
        "context": {
            "year": payload.year, "start_year": payload.start_year, "end_year": payload.end_year,
            "region": payload.region, "region_label": region_label,
            "age": payload.age, "age_label": age_label,
            "sex": payload.sex, "sex_label": SEXES[payload.sex],
            "reference_year": reference_year,
        },
        "kpis": [
            {"key": "population", "label": "Population", "kind": "quantity",
             "value": current["population"] if current else None,
             "detail": f"au 1er janvier {payload.year}"},
            {"key": "change", "label": f"Variation depuis {payload.year - 1}", "kind": "percent",
             "value": change, "detail": "même périmètre, d’un 1er janvier à l’autre"},
            {"key": "seniors", "label": "Part des 65 ans et plus", "kind": "percent",
             "value": senior_share, "detail": f"dans le périmètre · {payload.year}"},
        ],
        "annual": annual,
        "territories": territories,
        "age_sex": age_sex,
        "age_sex_reference": age_sex_reference,
        "sex_profile": sex_profile,
        "quality": {
            "source": SOURCE_LABEL,
            "scope": SCOPE_LABEL,
            "limitations": LIMITATIONS,
            "lumped_90_plus": lumped_cells,
        },
    }


# ── Le dénominateur de référence ────────────────────────────────────────────
#
# L'Insee publie une population au 1er janvier. Rapporter un flux annuel — des
# remboursements, des décès — à la population du 1er janvier revient à la
# rapporter à l'état du pays la veille du premier jour compté. La population
# moyenne de l'année est la demi-somme des 1er janvier N et N+1 ; c'est elle
# qu'il faut, et c'est elle que cette fonction renvoie.
#
# Sur la dernière année disponible, N+1 n'existe pas. Le 1er janvier seul sert
# alors, et `moyenne` vaut faux sur cette ligne : l'appelant doit le dire.

def population_reference(repo: PopulationRepository, years: list[int], *,
                         region: str = FRANCE, age: str = ALL_AGES,
                         sex: str = ALL_SEXES) -> dict[int, dict[str, Any]]:
    """La population de référence par année, moyennée quand c'est possible."""
    _require_source(repo)
    if not years:
        return {}
    clauses, params = _scope_clauses(region, age, sex)
    rows = repo.query(
        f"""SELECT annee AS year, SUM(population)::DOUBLE AS population
            FROM population
            WHERE annee BETWEEN ? AND ?{_where(clauses)}
            GROUP BY annee ORDER BY 1""",
        [min(years), max(years) + 1, *params])
    by_year = {int(row["year"]): _float(row["population"]) for row in rows}
    reference: dict[int, dict[str, Any]] = {}
    for year in years:
        january = by_year.get(year)
        next_january = by_year.get(year + 1)
        if january is None:
            reference[year] = {"population": None, "moyenne": False}
        elif next_january is None:
            reference[year] = {"population": january, "moyenne": False}
        else:
            reference[year] = {"population": (january + next_january) / 2, "moyenne": True}
    return reference


# ── Extraction ──────────────────────────────────────────────────────────────

def population_extraction_columns(payload: PopulationExtractionRequest) -> list[dict[str, str]]:
    return ([{"key": key, "label": POPULATION_DIMENSIONS[key][0], "kind": "dimension"}
             for key in payload.dimensions]
            + [{"key": key, "label": POPULATION_MEASURES[key][0], "kind": POPULATION_MEASURES[key][1]}
               for key in payload.measures])


def _validate_extraction(repo: PopulationRepository, payload: PopulationExtractionRequest) -> None:
    metadata = population_metadata(repo)
    if payload.start_year > payload.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    valid_years = set(metadata["years"])
    if payload.start_year not in valid_years or payload.end_year not in valid_years:
        raise ValueError("La période sélectionnée n’est pas disponible dans la source Insee.")
    if not payload.dimensions or not payload.measures:
        raise ValueError("Choisissez au moins une dimension et une mesure.")
    if any(key not in POPULATION_DIMENSIONS for key in payload.dimensions):
        raise ValueError("Une dimension Population est inconnue.")
    if any(key not in POPULATION_MEASURES for key in payload.measures):
        raise ValueError("Une mesure Population est inconnue.")
    codes = {item["code"] for item in metadata["regions"]}
    if payload.region not in {"__all__", FRANCE} and payload.region not in codes:
        raise ValueError("Le territoire sélectionné est inconnu.")
    ages = {item["code"] for item in metadata["ages"]}
    if payload.age not in {"__all__", ALL_AGES} and payload.age not in ages:
        raise ValueError("La tranche d’âge sélectionnée est inconnue.")
    if payload.sex not in {"__all__", *SEXES}:
        raise ValueError("Le sexe sélectionné est inconnu.")
    if payload.start_year != payload.end_year and "year" not in payload.dimensions:
        raise ValueError("Conservez la dimension Année lorsque plusieurs millésimes sont sélectionnés.")
    if payload.region == "__all__" and "region" not in payload.dimensions:
        raise ValueError("Conservez la dimension Région lorsque tous les territoires sont sélectionnés.")


def _extraction_query(payload: PopulationExtractionRequest, *, include_count: bool,
                      limit: int) -> tuple[str, list[Any]]:
    clauses = ["annee BETWEEN ? AND ?"]
    params: list[Any] = [payload.start_year, payload.end_year]
    if payload.region not in {"__all__", FRANCE}:
        clauses.append("region = ?")
        params.append(payload.region)
    if payload.age not in {"__all__", ALL_AGES}:
        clauses.append("age_quinquennal = ?")
        params.append(payload.age)
    if payload.sex != "__all__" and payload.sex != ALL_SEXES:
        clauses.append("sexe = ?")
        params.append(SEX_VALUES[payload.sex])

    groups = [POPULATION_DIMENSIONS[key][1] for key in payload.dimensions]
    selections = [f"{POPULATION_DIMENSIONS[key][1]} AS {key}" for key in payload.dimensions]
    measures = []
    for key in payload.measures:
        if key == "population":
            measures.append("SUM(population)::DOUBLE AS population")
        else:
            measures.append(
                "(100.0 * SUM(population) / NULLIF(SUM(SUM(population)) OVER (), 0))::DOUBLE AS share")
    count = ", COUNT(*) OVER ()::BIGINT AS __total_rows" if include_count else ""
    sql = (f"SELECT {', '.join(selections + measures)}{count} FROM population "
           f"WHERE {' AND '.join(clauses)} GROUP BY {', '.join(groups)} "
           f"ORDER BY {', '.join(groups)} LIMIT {limit}")
    return sql, params


def population_extraction_preview(repo: PopulationRepository,
                                  payload: PopulationExtractionRequest) -> dict[str, Any]:
    _require_source(repo)
    _validate_extraction(repo, payload)
    sql, params = _extraction_query(payload, include_count=True, limit=payload.limit)
    rows = repo.query(sql, params)
    total_rows = int(rows[0].pop("__total_rows")) if rows else 0
    for row in rows[1:]:
        row.pop("__total_rows", None)
    return {
        "columns": population_extraction_columns(payload),
        "rows": rows,
        "total_rows": total_rows,
        "limited": total_rows > payload.limit,
    }


def population_extraction_rows(repo: PopulationRepository, payload: PopulationExtractionRequest,
                               *, limit: int = 250000) -> list[dict[str, Any]]:
    _require_source(repo)
    _validate_extraction(repo, payload)
    sql, params = _extraction_query(payload, include_count=False, limit=limit + 1)
    rows = repo.query(sql, params)
    if len(rows) > limit:
        raise ValueError(f"L’extraction dépasse la limite de {limit:,} lignes.".replace(",", " "))
    return rows
