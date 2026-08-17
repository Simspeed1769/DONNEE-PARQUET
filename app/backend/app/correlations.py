"""Croisements statistiques entre les quatre sources.

Les quatre bases ne parlent pas la même langue : elles n'ont ni les mêmes
régions, ni les mêmes tranches d'âge, ni la même granularité. Ce module établit
le vocabulaire commun, construit des séries appariées, puis les confie à
`statistics.py`.

Ce qu'il faut savoir avant de lire un résultat, et que le module affiche :

- **Douze régions seulement** sont communes aux trois sources régionales. La
  Corse est absente de DAMIR et les DOM y sont agrégés. Avec douze points, un
  coefficient inférieur à 0,58 ne peut pas être distingué du hasard.
- **La mortalité n'a pas de dimension régionale.** Elle ne peut se croiser
  qu'au niveau national, ce qui ramène l'observation à l'année : dix points.
- **Une corrélation entre deux totaux n'est qu'un effet de taille.** L'Île-de-
  France dépense plus et compte plus de malades parce qu'elle est plus peuplée.
  Le module normalise donc par la population dès que c'est possible, et le
  signale bruyamment quand ça ne l'est pas.
- **Le sophisme écologique reste entier.** Une relation entre régions ne dit
  rien des individus qui les composent.
"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import BaseModel

from .analysis import QueryRepository
from .glm import Family, GlmError, default_family, fit

# Régions présentes dans les trois sources régionales. DAMIR ne porte pas la
# Corse (94) et agrège les DOM sous un code unique : les retenir produirait des
# appariements faux plutôt que des observations manquantes.
COMMON_REGIONS: dict[int, str] = {
    11: "Île-de-France",
    24: "Centre-Val de Loire",
    27: "Bourgogne-Franche-Comté",
    28: "Normandie",
    32: "Hauts-de-France",
    44: "Grand Est",
    52: "Pays de la Loire",
    53: "Bretagne",
    75: "Nouvelle-Aquitaine",
    76: "Occitanie",
    84: "Auvergne-Rhône-Alpes",
    93: "Provence-Alpes-Côte d'Azur",
}

# Tranches décennales : DAMIR et CSP les portent déjà, les pathologies s'y
# agrègent exactement (bandes de cinq ans). La mortalité, découpée en
# 0-64 / 65-84 / 85+, ne s'y ramène pas — elle reste hors de cet axe.
AGE_BANDS: dict[str, str] = {
    "0": "Moins de 20 ans", "20": "20–29 ans", "30": "30–39 ans",
    "40": "40–49 ans", "50": "50–59 ans", "60": "60–69 ans",
    "70": "70–79 ans", "80": "80 ans et plus",
}

Unit = Literal["region_year", "region", "region_age_sex", "year"]
Source = Literal["damir", "patho", "csp", "mortality"]

#: Ce qu'une observation distingue, unité par unité.
#:
#: Toute la mécanique d'agrégation en découle : chaque source sait exprimer ces
#: dimensions dans son propre vocabulaire, et l'appariement se fait sur leur
#: concaténation. Ajouter une unité, c'est ajouter une ligne ici.
UNIT_DIMENSIONS: dict[str, tuple[str, ...]] = {
    "region_year": ("region", "year"),
    "region": ("region",),
    "region_age_sex": ("region", "age", "sex"),
    "year": ("year",),
}

UNITS: dict[str, dict[str, Any]] = {
    "region_age_sex": {
        "label": "Région × âge × sexe",
        "hint": "Un point par région, tranche d'âge et sexe : 192 cellules. C'est la seule unité "
                "où l'âge et le sexe peuvent entrer dans un modèle plutôt que rester des filtres.",
        "sources": ("damir", "patho", "csp"),
    },
    "region_year": {
        "label": "Région × année",
        "hint": "Un point par région et par année. Les points d'une même région ne sont pas indépendants.",
        "sources": ("damir", "patho", "csp"),
    },
    "region": {
        "label": "Région",
        "hint": "Un point par région, moyenné sur la période. Douze points : seules les relations très fortes ressortiront.",
        "sources": ("damir", "patho", "csp"),
    },
    "year": {
        "label": "Année (national)",
        "hint": "Un point par année. Seul axe ouvert à la mortalité, mais deux séries qui croissent avec le temps corrèlent presque toujours.",
        "sources": ("damir", "patho", "csp", "mortality"),
    },
}

# ── Vocabulaire commun des dimensions ────────────────────────────────────────
#
# Les trois sources régionales portent l'âge et le sexe, mais chacune dans son
# découpage : DAMIR en tranches décennales, la Cartographie en bandes de cinq
# ans, la CSP en âge révolu. On les projette toutes sur la tranche décennale,
# qui est le plus grossier des trois — donc le seul commun.

_PATHO_DECADE = (
    "CASE WHEN CAST(SUBSTR(cla_age_5, 1, 2) AS INTEGER) < 20 THEN 0 "
    "     WHEN CAST(SUBSTR(cla_age_5, 1, 2) AS INTEGER) >= 80 THEN 80 "
    "     ELSE (CAST(SUBSTR(cla_age_5, 1, 2) AS INTEGER) // 10) * 10 END"
)
_CSP_DECADE = "CASE WHEN age < 20 THEN 0 WHEN age >= 80 THEN 80 ELSE (age // 10) * 10 END"

_DIMENSION_SQL: dict[str, dict[str, str]] = {
    "damir": {
        "year": "c.soi_ann", "region": "c.region", "age": "c.age", "sex": "c.sexe",
    },
    "patho": {
        "year": "YEAR(annee)", "region": "CAST(region AS INTEGER)",
        "age": _PATHO_DECADE, "sex": "CAST(sexe AS INTEGER)",
    },
    "csp": {
        "year": "annee", "region": "CAST(code_region AS INTEGER)",
        "age": _CSP_DECADE, "sex": "code_sexe",
    },
    "mortality": {"year": "year"},
}

# Les deux modalités de sexe que les trois sources partagent. Le « tous sexes »
# de la Cartographie est un agrégat, pas une troisième population : le retenir
# comme cellule doublerait les effectifs.
_SEX_CELLS = (1, 2)


def _projection(source: str, dimensions: tuple[str, ...]) -> tuple[str, str]:
    """(colonnes projetées et nommées d0…dn, liste du GROUP BY)."""
    expressions = [_DIMENSION_SQL[source][dimension] for dimension in dimensions]
    selected = ", ".join(f"{expression} AS d{index}"
                         for index, expression in enumerate(expressions))
    grouped = ", ".join(str(index + 1) for index in range(len(expressions)))
    return selected, grouped


def _cell_key(row: dict[str, Any], dimensions: tuple[str, ...]) -> str | None:
    """Clé d'appariement d'une cellule. `None` dès qu'une dimension manque —
    une modalité inconnue n'apparie rien et ne doit pas inventer une cellule."""
    parts = []
    for index in range(len(dimensions)):
        value = row.get(f"d{index}")
        if value is None:
            return None
        parts.append(str(int(value)))
    return ":".join(parts)


def _cell_clauses(source: str, dimensions: tuple[str, ...]) -> list[str]:
    """Ce qu'il faut écarter pour que chaque cellule existe vraiment.

    L'âge inconnu et les agrégats « tous sexes » ne sont pas des cellules : les
    laisser produirait des lignes qui ne s'apparient à rien, ou qui compteraient
    deux fois la même population.
    """
    clauses: list[str] = []
    if "age" in dimensions:
        if source == "damir":
            clauses.append("c.age <> 99")
        elif source == "patho":
            clauses.append("cla_age_5 <> 'tsage'")
    if "sex" in dimensions:
        codes = ",".join(str(code) for code in _SEX_CELLS)
        if source == "damir":
            clauses.append(f"c.sexe IN ({codes})")
        elif source == "patho":
            clauses.append(f"CAST(sexe AS INTEGER) IN ({codes})")
        elif source == "csp":
            clauses.append(f"code_sexe IN ({codes})")
    return clauses


class IndicatorRef(BaseModel):
    source: Source
    metric: str
    # Pathologie, groupe socio-professionnel ou cause de décès selon la source.
    selection: str | None = None


class CorrelationRequest(BaseModel):
    unit: Unit = "region_year"
    x: IndicatorRef
    y: IndicatorRef
    start_year: int = 2015
    end_year: int = 2023
    sex: Literal["all", "men", "women"] = "all"
    age_band: str | None = None
    # Retire la tendance temporelle commune, premier producteur de
    # corrélations fallacieuses sur des séries annuelles.
    detrend: bool = False


# ── Catalogue des indicateurs ────────────────────────────────────────────────
# `rate` distingue un taux d'un effectif : croiser deux effectifs régionaux ne
# mesure que la taille des régions.
METRICS: dict[str, dict[str, Any]] = {
    "damir.spend_per_capita": {
        "source": "damir", "label": "Dépense remboursée par habitant",
        "unit": "€ / habitant", "rate": True, "needs": None,
    },
    "damir.coverage": {
        "source": "damir", "label": "Taux de prise en charge",
        "unit": "%", "rate": True, "needs": None,
    },
    "damir.average_reimbursed": {
        "source": "damir", "label": "Remboursement moyen par acte",
        "unit": "€ / acte", "rate": True, "needs": None,
    },
    "damir.spend_total": {
        "source": "damir", "label": "Dépense remboursée (total)",
        "unit": "€", "rate": False, "needs": None,
    },
    "patho.prevalence": {
        "source": "patho", "label": "Prévalence",
        "unit": "%", "rate": True, "needs": "pathology",
    },
    "patho.patients": {
        "source": "patho", "label": "Patients (effectif)",
        "unit": "patients", "rate": False, "needs": "pathology",
    },
    "csp.share": {
        "source": "csp", "label": "Part dans la population active",
        "unit": "%", "rate": True, "needs": "csp",
    },
    "mortality.deaths": {
        "source": "mortality", "label": "Décès (effectif)",
        "unit": "décès", "rate": False, "needs": "cause",
    },
    "mortality.rate": {
        "source": "mortality", "label": "Décès pour 100 000 habitants",
        "unit": "/100 000", "rate": True, "needs": "cause",
    },
}

_SEX_DAMIR = {"men": "1", "women": "2"}
_SEX_PATHO = {"men": "1", "women": "2"}
_SEX_CSP = {"men": "1", "women": "2"}
_SEX_MORTALITY = {"men": "hommes", "women": "femmes"}


def _region_filter(column: str, cast: bool) -> str:
    codes = ",".join(str(code) for code in COMMON_REGIONS)
    return f"CAST({column} AS INTEGER) IN ({codes})" if cast else f"{column} IN ({codes})"


def _damir_series(repo: QueryRepository, metric: str, request: CorrelationRequest) -> dict[str, float]:
    dimensions = UNIT_DIMENSIONS[request.unit]
    clauses = [f"c.soi_ann BETWEEN {request.start_year} AND {request.end_year}"]
    if "region" in dimensions or request.unit != "year":
        clauses.append(_region_filter("c.region", cast=False))
    # Un filtre de population n'a de sens que si la population n'est pas déjà
    # une dimension de l'observation : sinon il retirerait des cellules.
    if request.sex != "all" and "sex" not in dimensions:
        clauses.append(f"c.sexe = {_SEX_DAMIR[request.sex]}")
    if request.age_band and "age" not in dimensions:
        clauses.append(f"c.age = {int(request.age_band)}")
    clauses.extend(_cell_clauses("damir", dimensions))

    selected, grouped = _projection("damir", dimensions)
    rows = repo.query(
        f"""SELECT {selected},
                   SUM(c.rem)::DOUBLE AS rem,
                   SUM(c.dep)::DOUBLE AS dep,
                   SUM(c.qte)::DOUBLE AS qte
            FROM cube c WHERE {' AND '.join(clauses)} GROUP BY {grouped}"""
    )

    populations = _population(repo, request) if metric == "damir.spend_per_capita" else {}
    series: dict[str, float] = {}
    for row in rows:
        key = _cell_key(row, dimensions)
        if key is None:
            continue
        rem, dep, qte = float(row["rem"] or 0), float(row["dep"] or 0), float(row["qte"] or 0)
        if metric == "damir.spend_total":
            series[key] = rem
        elif metric == "damir.coverage":
            if dep:
                series[key] = 100.0 * rem / dep
        elif metric == "damir.average_reimbursed":
            if qte:
                series[key] = rem / qte
        elif metric == "damir.spend_per_capita":
            population = populations.get(key)
            if population:
                series[key] = rem / population
    return series


INSEE_DENOMINATOR = "population résidente Insee"
CNAM_DENOMINATOR = "population de référence de la Cartographie Cnam"

_INSEE_DIMENSION_SQL = {
    "year": "annee",
    "region": "CAST(region AS INTEGER)",
    "age": "age_decennal",
    "sex": "CASE sexe WHEN 'Hommes' THEN 1 ELSE 2 END",
}


def _population(repo: QueryRepository, request: CorrelationRequest) -> dict[str, float]:
    """Le dénominateur des taux : la population résidente Insee quand elle est
    chargée, la population de référence de la Cartographie sinon.

    `denominator_label` dit laquelle a servi, et l'appelant l'écrit à l'écran :
    une dépense « par habitant » ne veut pas dire la même chose selon qu'on
    divise par les résidents d'un territoire ou par les assurés que la Cnam
    protège, et le chiffre change de plusieurs pour cent."""
    if getattr(repo, "has_population", False):
        return _insee_population(repo, request)
    return _cartography_population(repo, request)


def denominator_label(repo: QueryRepository) -> str:
    return INSEE_DENOMINATOR if getattr(repo, "has_population", False) else CNAM_DENOMINATOR


def _insee_population(repo: QueryRepository, request: CorrelationRequest) -> dict[str, float]:
    """Années-personnes sur la période, à partir des estimations Insee.

    **La moyenne des deux 1er janvier.** L'Insee publie un état au 1er janvier ;
    un flux annuel — des remboursements, des décès — se rapporte à la population
    *moyenne* de l'année, soit la demi-somme des 1er janvier N et N+1. La
    dernière année disponible n'a pas de N+1 : son 1er janvier sert seul, et la
    réserve le dit.

    Le numérateur somme toutes les années de la période dès que l'année n'est
    pas une dimension ; le dénominateur cumule donc les moyennes annuelles, en
    années-personnes, pour que quatre ans de dépenses ne soient pas rapportés à
    une seule année de population.
    """
    dimensions = UNIT_DIMENSIONS[request.unit]
    clauses: list[str] = []
    # Les douze régions communes ne s'imposent que lorsque la région est une
    # dimension de l'observation. Sur l'axe national — le seul ouvert à la
    # mortalité — le numérateur couvre la France entière, DROM compris : y
    # opposer douze régions métropolitaines gonflerait le taux de 2 %.
    if "region" in dimensions:
        clauses.append(_region_filter("region", cast=True))
    if "sex" in dimensions:
        pass  # les deux sexes sont des cellules, rien à écarter
    elif request.sex != "all":
        clauses.append(f"sexe = '{'Hommes' if request.sex == 'men' else 'Femmes'}'")
    if "age" not in dimensions and request.age_band:
        clauses.append(f"age_decennal = {int(request.age_band)}")

    cell_dimensions = [name for name in dimensions if name != "year"]
    cell_columns = [f"{_INSEE_DIMENSION_SQL[name]} AS c{index}"
                    for index, name in enumerate(cell_dimensions)]
    cell_names = [f"c{index}" for index in range(len(cell_dimensions))]
    partition = f"PARTITION BY {', '.join(cell_names)} " if cell_names else ""
    projected = ", ".join(
        f"{('annee' if name == 'year' else cell_names[cell_dimensions.index(name)])} AS d{index}"
        for index, name in enumerate(dimensions))
    grouped = ", ".join(str(index + 1) for index in range(len(dimensions)))
    selection = ", ".join(["annee", *cell_columns])

    rows = repo.query(
        f"""WITH cellules AS (
                SELECT {selection}, SUM(population)::DOUBLE AS effectif
                FROM population
                WHERE annee BETWEEN {request.start_year} AND {request.end_year + 1}
                  {''.join(f' AND {clause}' for clause in clauses)}
                GROUP BY {', '.join(['annee', *cell_names])}
            ), moyennes AS (
                SELECT annee, {', '.join(cell_names) + ',' if cell_names else ''}
                       COALESCE(
                           (effectif + LEAD(effectif) OVER ({partition}ORDER BY annee)) / 2,
                           effectif) AS effectif
                FROM cellules
            )
            SELECT {projected}, SUM(effectif)::DOUBLE AS population
            FROM moyennes
            WHERE annee BETWEEN {request.start_year} AND {request.end_year}
            GROUP BY {grouped}"""
    )
    result: dict[str, float] = {}
    for row in rows:
        key = _cell_key(row, dimensions)
        value = float(row["population"] or 0)
        if key is not None and value:
            result[key] = value
    return result


def _cartography_population(repo: QueryRepository, request: CorrelationRequest) -> dict[str, float]:
    """Population de référence, tirée du dénominateur de la Cartographie.

    Le recours quand la population Insee n'est pas chargée. C'est un
    dénominateur détourné de sa source : la Cartographie le publie pour
    rapporter ses propres effectifs, cellule par cellule, et il compte les
    assurés protégés par l'Assurance Maladie, non les résidents d'un territoire.

    La table de la Cartographie est départementale **et** porte ses propres
    agrégats : `dept = '999'` est le total régional, `cla_age_5 = 'tsage'` le
    tous âges, `sexe = '9'` le tous sexes. Mélanger un agrégat avec les cellules
    qu'il résume compte la même population deux fois — c'est ce que faisait
    cette fonction sur l'âge, et l'Île-de-France y pesait 25,3 millions
    d'habitants au lieu de 12,5.
    """
    dimensions = UNIT_DIMENSIONS[request.unit]
    clauses = [
        f"YEAR(annee) BETWEEN {request.start_year} AND {request.end_year}",
        # Le total régional, jamais additionné aux départements qui le composent.
        "dept = '999'",
    ]
    # Quand le sexe est une dimension, la population doit être celle de chaque
    # sexe : le « tous sexes » de la source est un agrégat, pas une cellule.
    if "sex" in dimensions:
        clauses.append(f"CAST(sexe AS INTEGER) IN ({','.join(str(code) for code in _SEX_CELLS)})")
    else:
        clauses.append("sexe = '9'" if request.sex == "all"
                       else f"sexe = '{_SEX_PATHO[request.sex]}'")
    if "age" in dimensions:
        clauses.append("cla_age_5 <> 'tsage'")
    elif request.age_band:
        clauses.append(f"cla_age_5 IN ({_patho_age_codes(request.age_band)})")
    else:
        clauses.append("cla_age_5 = 'tsage'")
    if "region" in dimensions:
        clauses.append(_region_filter("region", cast=True))

    selected, grouped = _projection("patho", dimensions)
    outer = ", ".join(f"d{index}" for index in range(len(dimensions)))

    # Deux agrégations imbriquées, chacune pour une raison distincte.
    #
    # `npop` est répété sur chaque pathologie : on prend le maximum par cellule
    # avant de sommer, sans quoi la population serait multipliée par le nombre
    # de pathologies. Le maximum, et non n'importe quelle valeur, parce que les
    # pathologies propres à un sexe — maternité, cancer de la prostate — portent
    # la population de leur seul sexe ; c'est bien la population générale qu'on
    # veut ici.
    #
    # L'année entre dans l'agrégation interne même lorsqu'elle n'est pas une
    # dimension : le numérateur somme alors toutes les années de la période, et
    # le dénominateur doit couvrir la même période en années-personnes. Sans
    # cela, quatre ans de dépenses seraient rapportés à une seule année de
    # population.
    rows = repo.query(
        f"""SELECT {outer}, SUM(cell)::DOUBLE AS population FROM (
                SELECT {selected}, YEAR(annee) AS annee_cellule, cla_age_5, sexe,
                       MAX(npop) AS cell
                FROM pathologies WHERE {' AND '.join(clauses)}
                GROUP BY {grouped}, annee_cellule, cla_age_5, sexe
            ) GROUP BY {outer}"""
    )
    result: dict[str, float] = {}
    for row in rows:
        key = _cell_key(row, dimensions)
        value = float(row["population"] or 0)
        if key is not None and value:
            result[key] = value
    return result


def _patho_age_codes(band: str) -> str:
    """Bandes de cinq ans composant une tranche décennale.

    Le libellé du dernier palier est `95et+`, sans espaces : la variante
    espacée qui figurait ici n'appariait aucune ligne, et le filtre « 80 ans et
    plus » perdait silencieusement les 276 000 cellules des 95 ans et plus.
    """
    start = int(band)
    if start == 0:
        codes = ["00-04", "05-09", "10-14", "15-19"]
    elif start == 80:
        codes = ["80-84", "85-89", "90-94", "95et+"]
    else:
        codes = [f"{start:02d}-{start + 4:02d}", f"{start + 5:02d}-{start + 9:02d}"]
    return ",".join(f"'{code}'" for code in codes)


def _patho_series(repo: QueryRepository, metric: str, request: CorrelationRequest,
                  selection: str | None) -> dict[str, float]:
    dimensions = UNIT_DIMENSIONS[request.unit]
    clauses = [
        f"YEAR(annee) BETWEEN {request.start_year} AND {request.end_year}",
        "patho_niv1 = ?" if selection else "patho_niv1 IS NOT NULL",
        # La table est départementale et porte en plus son total régional : les
        # additionner comptait chaque patient deux fois.
        "dept = '999'",
    ]
    params: list[Any] = [selection] if selection else []
    if "sex" not in dimensions:
        clauses.append("sexe = '9'" if request.sex == "all"
                       else f"sexe = '{_SEX_PATHO[request.sex]}'")
    if "region" in dimensions:
        clauses.append(_region_filter("region", cast=True))
    # Le tous âges est un agrégat des tranches : on prend l'un ou les autres,
    # jamais les deux.
    if "age" not in dimensions:
        clauses.append(f"cla_age_5 IN ({_patho_age_codes(request.age_band)})"
                       if request.age_band else "cla_age_5 = 'tsage'")
    clauses.extend(_cell_clauses("patho", dimensions))

    selected, grouped = _projection("patho", dimensions)
    rows = repo.query(
        f"""SELECT {selected}, SUM(ntop)::DOUBLE AS patients
            FROM pathologies WHERE {' AND '.join(clauses)} GROUP BY {grouped}""",
        params,
    )
    patients: dict[str, float] = {}
    for row in rows:
        key = _cell_key(row, dimensions)
        if key is not None:
            patients[key] = float(row["patients"] or 0)
    if metric == "patho.patients":
        return patients

    populations = _population(repo, request)
    return {
        key: 100.0 * value / populations[key]
        for key, value in patients.items()
        if populations.get(key)
    }


def _csp_series(repo: QueryRepository, request: CorrelationRequest,
                selection: str | None) -> dict[str, float]:
    dimensions = UNIT_DIMENSIONS[request.unit]
    clauses = [
        f"annee BETWEEN {request.start_year} AND {request.end_year}",
        "niveau_csp = 'groupe_6'",
    ]
    params: list[Any] = []
    if selection:
        clauses.append("groupe_csp = ?")
        params.append(selection)
    if "region" in dimensions:
        clauses.append(_region_filter("code_region", cast=True))
    if request.sex != "all" and "sex" not in dimensions:
        clauses.append(f"code_sexe = {_SEX_CSP[request.sex]}")
    clauses.extend(_cell_clauses("csp", dimensions))

    selected, grouped = _projection("csp", dimensions)
    rows = repo.query(
        f"""SELECT {selected},
                   SUM(effectif)::DOUBLE AS effectif,
                   SUM(population_reference)::DOUBLE AS reference
            FROM csp WHERE {' AND '.join(clauses)} GROUP BY {grouped}""",
        params,
    )
    series: dict[str, float] = {}
    for row in rows:
        key = _cell_key(row, dimensions)
        reference = float(row["reference"] or 0)
        if key is not None and reference:
            series[key] = 100.0 * float(row["effectif"] or 0) / reference
    return series


def _mortality_series(repo: QueryRepository, metric: str, request: CorrelationRequest,
                      selection: str | None) -> dict[str, float]:
    """La mortalité n'existe qu'au niveau national : seul l'axe « année » lui est
    ouvert, et l'appelant a déjà refusé les autres."""
    if request.age_band:
        raise ValueError(
            "La mortalité est découpée en 0-64 / 65-84 / 85 ans et plus, qui ne "
            "recouvrent pas les tranches décennales des autres sources. Retirez le "
            "filtre d'âge pour la croiser."
        )
    clauses = [
        f"year BETWEEN {request.start_year} AND {request.end_year}",
        "population_group = 'ensemble'" if request.sex == "all"
        else f"population_group = '{_SEX_MORTALITY[request.sex]}'",
        "cause_label = ?",
    ]
    params: list[Any] = [selection or "Toutes causes"]

    rows = repo.query(
        f"""SELECT year, SUM(deaths)::DOUBLE AS deaths
            FROM mortality WHERE {' AND '.join(clauses)} GROUP BY 1""",
        params,
    )
    deaths = {str(int(row["year"])): float(row["deaths"] or 0) for row in rows}
    if metric == "mortality.deaths":
        return deaths

    populations = _population(repo, request)
    return {
        key: 100_000.0 * value / populations[key]
        for key, value in deaths.items()
        if populations.get(key)
    }


def _series(repo: QueryRepository, reference: IndicatorRef,
            request: CorrelationRequest) -> dict[str, float]:
    definition = METRICS.get(reference.metric)
    if definition is None:
        raise ValueError(f"Indicateur inconnu : {reference.metric}")
    if definition["source"] == "damir":
        return _damir_series(repo, reference.metric, request)
    if definition["source"] == "patho":
        return _patho_series(repo, reference.metric, request, reference.selection)
    if definition["source"] == "csp":
        return _csp_series(repo, request, reference.selection)
    return _mortality_series(repo, reference.metric, request, reference.selection)


_SEX_LABELS: dict[int, str] = {1: "Hommes", 2: "Femmes"}


def _describe_cell(key: str, unit: Unit) -> dict[str, Any]:
    """Nomme une cellule dans les termes de son unité.

    Le libellé sert d'étiquette de point et de ligne de tableau : il doit dire
    exactement ce que la cellule contient, faute de quoi un nuage de 192 points
    devient illisible dès qu'on en survole un.
    """
    dimensions = UNIT_DIMENSIONS[unit]
    values = key.split(":")
    described: dict[str, Any] = {"region": None, "year": None, "age": None, "sex": None}
    parts: list[str] = []

    for dimension, raw in zip(dimensions, values):
        if dimension == "region":
            label = COMMON_REGIONS.get(int(raw), raw)
            described["region"] = label
            parts.append(label)
        elif dimension == "year":
            described["year"] = raw
            parts.append(raw)
        elif dimension == "age":
            label = AGE_BANDS.get(raw, f"{raw} ans")
            described["age"] = label
            parts.append(label)
        elif dimension == "sex":
            label = _SEX_LABELS.get(int(raw), raw)
            described["sex"] = label
            parts.append(label)

    described["label"] = " · ".join(parts)
    return described


# La correlation appariee vivait ici : `correlate()`, ses avertissements types
# et le retrait de tendance. Elle est partie avec l'ecran avance de Croisements
# (point 1.6) : plus aucun appelant. Croisements passe par la regression, qui
# repond a la meme question en tenant l'age et le sexe constants — et dont les
# avertissements sont produits par `regression()`, pas ici.
#
# `statistics.py` reste, bien qu'aucun code applicatif ne l'appelle plus. Ce
# n'est pas le meme cas qu'`AdvancedCross` : c'est une bibliotheque de
# fonctions pures, sans couplage a l'API, testee contre des valeurs publiees —
# le quartet d'Anscombe, des tables de Student. Elle ne coute rien a garder, et
# le point 3.6 (prolongation de tendance) en a besoin nommement : bande
# d'incertitude issue des residus, donc loi de Student.


def available_factors(unit: Unit) -> list[str]:
    """Un facteur n'existe que si l'unité distingue sa dimension : sur « Région »,
    toutes les cellules ont le même âge, et l'indicatrice serait constante."""
    dimensions = UNIT_DIMENSIONS[unit]
    return [key for key, factor in FACTORS.items()
            if factor["dimension"] in dimensions and len(dimensions) > 1]


class RegressionRequest(BaseModel):
    unit: Unit = "region_age_sex"
    response: str = "damir.spend_per_capita"
    # Modalité de la mesure expliquée, quand elle en exige une — la prévalence
    # d'une pathologie précise, par exemple. Sans objet pour une mesure DAMIR.
    response_selection: str | None = None
    predictors: list[IndicatorRef] = []
    # Dimensions de l'observation mises dans le modèle comme variables
    # catégorielles, avec un niveau de référence.
    factors: list[str] = []
    start_year: int = 2016
    end_year: int = 2022
    sex: Literal["all", "men", "women"] = "all"
    age_band: str | None = None
    # `None` laisse le module proposer la loi qui convient à la mesure. Le choix
    # reste offert : aucune loi n'est imposée.
    family: Family | None = None


def _term_sentence(label: str, unit: str, effect: float | None, link: str,
                   significant: bool) -> str:
    """L'effet d'une variable, en une phrase.

    C'est la seule sortie que la plupart des lecteurs regarderont : elle dit le
    sens, l'ampleur et l'unité, et elle dit aussi quand il n'y a rien à dire.
    """
    if effect is None:
        return f"{label} : effet non estimable."
    if not significant:
        return (f"{label} : aucun effet distinguable du hasard sur ces données. "
                "Ce n'est pas la preuve qu'il n'y en a pas.")
    direction = "de plus" if effect >= 0 else "de moins"
    # Séparateur décimal français : la phrase se lit à côté d'un tableau qui
    # écrit déjà « 5,2 % », et deux notations pour le même nombre se remarquent.
    def french(value: float, digits: int) -> str:
        return f"{value:.{digits}f}".replace(".", ",")

    size = abs(effect)
    if link == "log":
        return (f"À chaque point de « {label} » en plus, la mesure varie de "
                f"{french(size, 1)} % {direction}, les autres variables tenues constantes.")
    return (f"À chaque unité de « {label} » en plus ({unit}), la mesure varie de "
            f"{french(size, 2)} {direction}, les autres variables tenues constantes.")


def _level_label(dimension: str, raw: str) -> str:
    if dimension == "age":
        return AGE_BANDS.get(raw, f"{raw} ans")
    if dimension == "sex":
        return _SEX_LABELS.get(int(raw), raw)
    if dimension == "region":
        return COMMON_REGIONS.get(int(raw), raw)
    return raw


def _factor_sentence(group: str, level: str, reference: str, effect: float,
                     link: str, significant: bool) -> str:
    """Un niveau de facteur se lit **contre sa référence**, jamais dans l'absolu."""
    if not significant:
        return (f"{group} · {level} : pas d'écart distinguable du hasard "
                f"par rapport à « {reference} ».")
    direction = "de plus" if effect >= 0 else "de moins"
    size = f"{abs(effect):.1f}".replace(".", ",") if link == "log" else f"{abs(effect):.2f}".replace(".", ",")
    measure = f"{size} %" if link == "log" else size
    return (f"{group} · {level} : {measure} {direction} que « {reference} », "
            "les autres variables tenues constantes.")


def regression(repo: QueryRepository, request: RegressionRequest) -> dict[str, Any]:
    if request.start_year > request.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    if request.response not in RESPONSE_METRICS:
        raise ValueError(f"Mesure expliquée inconnue : {request.response}")
    if not request.predictors:
        raise ValueError("Choisissez au moins une variable explicative.")
    if len(request.predictors) > MAX_PREDICTORS:
        raise ValueError(
            f"{MAX_PREDICTORS} variables au plus : au-delà, sur si peu "
            "d'observations, les effets ne se séparent plus."
        )

    allowed = UNITS[request.unit]["sources"]
    response_definition = METRICS[request.response]

    def scope_for(reference: IndicatorRef) -> CorrelationRequest:
        return CorrelationRequest(
            unit=request.unit, x=reference, y=reference,
            start_year=request.start_year, end_year=request.end_year,
            sex=request.sex, age_band=request.age_band, detrend=False,
        )

    response_reference = IndicatorRef(
        source=response_definition["source"], metric=request.response,
        selection=request.response_selection,
    )
    response_series = _series(repo, response_reference, scope_for(response_reference))

    predictor_series: list[dict[str, float]] = []
    definitions: list[dict[str, Any]] = []
    for reference in request.predictors:
        definition = METRICS.get(reference.metric)
        if definition is None:
            raise ValueError(f"Variable inconnue : {reference.metric}")
        if definition["source"] not in allowed:
            raise ValueError(
                f"« {definition['label']} » n'existe pas sur "
                f"« {UNITS[request.unit]['label']} »."
            )
        predictor_series.append(_series(repo, reference, scope_for(reference)))
        definitions.append(definition)

    # Seules les unités où **tout** est renseigné entrent dans le modèle : une
    # observation partielle fausserait les coefficients des autres variables.
    keys = sorted(set(response_series).intersection(*(set(item) for item in predictor_series)))
    if not keys:
        raise ValueError(
            "Aucune unité d'observation ne porte à la fois la mesure et toutes "
            "les variables choisies."
        )

    # ── Facteurs : les dimensions de l'observation, encodées en indicatrices ──
    #
    # Le premier niveau rencontré sert de référence et n'a pas de colonne : sans
    # cela, la somme des indicatrices reproduirait la constante et la matrice
    # serait singulière. Chaque coefficient se lit donc « par rapport à » ce
    # niveau, et c'est ainsi qu'il est libellé.
    chosen_factors = [key for key in request.factors if key in FACTORS]
    allowed_factors = available_factors(request.unit)
    for key in chosen_factors:
        if key not in allowed_factors:
            raise ValueError(
                f"« {FACTORS[key]['label']} » ne varie pas sur "
                f"« {UNITS[request.unit]['label']} » : il ne peut pas être une variable."
            )

    dimensions = UNIT_DIMENSIONS[request.unit]
    factor_columns: list[dict[str, Any]] = []
    for key in chosen_factors:
        position = dimensions.index(FACTORS[key]["dimension"])
        levels = sorted({cell.split(":")[position] for cell in keys},
                        key=lambda raw: int(raw))
        if len(levels) < 2:
            raise ValueError(
                f"« {FACTORS[key]['label']} » ne prend qu'une modalité sur ce "
                "périmètre : il n'y a rien à comparer."
            )
        reference = levels[0]
        for level in levels[1:]:
            factor_columns.append({
                "factor": key, "position": position, "level": level,
                "reference": reference,
            })

    observed = [response_series[key] for key in keys]
    design = [
        [
            1.0,
            *(series[cell] for series in predictor_series),
            *(1.0 if cell.split(":")[column["position"]] == column["level"] else 0.0
              for column in factor_columns),
        ]
        for cell in keys
    ]

    positive = all(value > 0 for value in observed)
    counts = response_definition["unit"] in ("patients", "décès")
    family, link = default_family(positive, counts)
    if request.family is not None:
        family = request.family
        link = "identity" if family == "gaussian" else "log"

    try:
        result = fit(design, observed, family, link)
    except GlmError as error:
        raise ValueError(str(error)) from error

    coefficients: list[float] = result["coefficients"]  # type: ignore[assignment]
    errors: list[float] = result["standard_errors"]  # type: ignore[assignment]
    p_values: list[float | None] = result["p_values"]  # type: ignore[assignment]

    terms: list[dict[str, Any]] = []
    for index, (reference, definition) in enumerate(zip(request.predictors, definitions), start=1):
        estimate = coefficients[index]
        p_value = p_values[index]
        significant = p_value is not None and p_value < 0.05
        # Sur un lien logarithmique, exp(β) − 1 est la variation relative de la
        # réponse pour une unité de plus : c'est ce qui se dit, pas β.
        as_effect = (lambda value: (math.exp(value) - 1.0) * 100.0) if link == "log" else (lambda value: value)
        effect = as_effect(estimate)
        # L'intervalle est calculé sur l'échelle du coefficient **puis**
        # transporté : transformer les bornes après coup garde un intervalle
        # asymétrique juste, là où ±1,96 σ appliqué à l'effet le fausserait.
        margin = 1.959963985 * errors[index]
        ci_low, ci_high = sorted((as_effect(estimate - margin), as_effect(estimate + margin)))
        label = definition["label"] + (f" · {reference.selection}" if reference.selection else "")
        terms.append({
            "key": f"{reference.metric}::{reference.selection or ''}",
            "metric": reference.metric,
            "selection": reference.selection,
            "label": label,
            "unit": definition["unit"],
            "estimate": estimate,
            "std_error": errors[index],
            "statistic": result["statistics"][index],  # type: ignore[index]
            "p_value": p_value,
            "effect": effect,
            "ci_low": ci_low,
            "ci_high": ci_high,
            "effect_kind": "percent" if link == "log" else "absolute",
            "significant": significant,
            "sentence": _term_sentence(label, definition["unit"], effect, link, significant),
        })

    # Les niveaux d'un facteur, chacun lu par rapport à sa référence.
    offset = 1 + len(request.predictors)
    for position, column in enumerate(factor_columns):
        index = offset + position
        estimate = coefficients[index]
        p_value = p_values[index]
        significant = p_value is not None and p_value < 0.05
        as_effect = (lambda value: (math.exp(value) - 1.0) * 100.0) if link == "log" else (lambda value: value)
        effect = as_effect(estimate)
        margin = 1.959963985 * errors[index]
        ci_low, ci_high = sorted((as_effect(estimate - margin), as_effect(estimate + margin)))
        factor = FACTORS[column["factor"]]
        level_label = _level_label(factor["dimension"], column["level"])
        reference_label = _level_label(factor["dimension"], column["reference"])
        terms.append({
            "key": f"{column['factor']}::{column['level']}",
            "metric": column["factor"],
            "selection": column["level"],
            "label": f"{level_label}",
            "group": factor["label"],
            "reference_level": reference_label,
            "unit": "",
            "estimate": estimate,
            "std_error": errors[index],
            "statistic": result["statistics"][index],  # type: ignore[index]
            "p_value": p_value,
            "effect": effect,
            "ci_low": ci_low,
            "ci_high": ci_high,
            "effect_kind": "percent" if link == "log" else "absolute",
            "significant": significant,
            "sentence": _factor_sentence(factor["label"], level_label, reference_label,
                                         effect, link, significant),
        })

    fitted: list[float] = result["fitted"]  # type: ignore[assignment]
    points = []
    for position, key in enumerate(keys):
        described = _describe_cell(key, request.unit)
        points.append({
            "key": key, "label": described["label"],
            "region": described["region"], "age": described["age"], "sex": described["sex"],
            "observed": observed[position], "fitted": fitted[position],
            # Valeur brute de chaque variable explicative pour cette cellule,
            # déjà calculée ci-dessus pour l'ajustement : le nuage du mode
            # guidé la lit directement au lieu de refaire la requête.
            "predictors": {
                f"{reference.metric}::{reference.selection or ''}": series[key]
                for reference, series in zip(request.predictors, predictor_series)
            },
        })

    warnings: list[dict[str, str]] = [{
        "level": "info",
        "text": "Un coefficient dit une association à variables tenues constantes, "
                "pas une cause. Une variable absente du modèle peut porter l'essentiel "
                "de ce qu'on lui attribue ici.",
    }]
    if result["n"] < 30:  # type: ignore[operator]
        warnings.append({
            "level": "warning",
            "text": f"{result['n']} observations : les écarts-types sont larges et un "
                    "effet réel peut très bien rester indétectable.",
        })
    if request.unit == "region_year":
        warnings.append({
            "level": "warning",
            "text": "Les années d'une même région ne sont pas indépendantes : "
                    "les p-values sont optimistes.",
        })

    return {
        "unit": request.unit,
        "unit_label": UNITS[request.unit]["label"],
        "response": {**response_definition, "key": request.response},
        "family": family,
        "link": link,
        "family_label": FAMILY_LABELS[family],
        "families": [
            {"key": key, "label": label,
             "available": key == "gaussian" or positive}
            for key, label in FAMILY_LABELS.items()
        ],
        "factors": [
            {"key": key, "label": FACTORS[key]["label"], "hint": FACTORS[key]["hint"],
             "active": key in chosen_factors}
            for key in allowed_factors
        ],
        "intercept": {
            "estimate": coefficients[0],
            "std_error": errors[0],
            "p_value": p_values[0],
        },
        "terms": terms,
        "fit": {
            "n": result["n"],
            "parameters": result["parameters"],
            "explained": result["explained"],
            "dispersion": result["dispersion"],
            "deviance": result["deviance"],
        },
        "points": points,
        "warnings": warnings,
    }


def catalogue(repo: QueryRepository) -> dict[str, Any]:
    """Indicateurs disponibles et modalités de leurs paramètres."""
    pathologies = [
        str(row["label"]) for row in repo.query(
            "SELECT DISTINCT patho_niv1 AS label FROM pathologies "
            "WHERE patho_niv1 IS NOT NULL ORDER BY 1"
        ) if row["label"]
    ]
    groups = [
        str(row["label"]) for row in repo.query(
            "SELECT DISTINCT groupe_csp AS label FROM csp "
            "WHERE niveau_csp = 'groupe_6' AND groupe_csp IS NOT NULL ORDER BY 1"
        ) if row["label"]
    ]
    # `is_detail = false` désigne exactement les causes de premier niveau.
    causes = [
        str(row["label"]) for row in repo.query(
            "SELECT cause_label AS label, MIN(cause_order) AS ordre "
            "FROM mortality WHERE is_detail = false GROUP BY 1 ORDER BY ordre"
        ) if row["label"]
    ]
    return {
        "units": [{"key": key, **{k: v for k, v in value.items() if k != "sources"},
                   "sources": list(value["sources"])}
                  for key, value in UNITS.items()],
        "metrics": [{"key": key, **value} for key, value in METRICS.items()],
        "pathologies": pathologies,
        "csp_groups": groups,
        "causes": causes,
        "age_bands": [{"key": key, "label": label} for key, label in AGE_BANDS.items()],
        "regions": [{"code": code, "label": label} for code, label in COMMON_REGIONS.items()],
        # Ce qui peut être expliqué par un modèle, et ce qui peut l'expliquer.
        "response_metrics": list(RESPONSE_METRICS),
        "max_predictors": MAX_PREDICTORS,
        # Les facteurs disponibles dépendent de l'unité : l'interface a besoin
        # de la table complète pour n'offrir que ce qui varie.
        "factors": [{"key": key, "label": value["label"], "hint": value["hint"],
                     "dimension": value["dimension"]}
                    for key, value in FACTORS.items()],
        "unit_factors": {unit: available_factors(unit) for unit in UNIT_DIMENSIONS},
    }
