from __future__ import annotations

from functools import lru_cache
from typing import Any, Literal

from pydantic import Field

from .dimension_notes import DIMENSION_NOTES
from .analysis import (
    DIMENSIONS,
    METRICS,
    POSTES_SANS_BASE,
    FilterPayload,
    QueryRepository,
    _dimension_expression,
    _mapped_label,
    _metric,
    _unknown_share,
    cube_where,
    delay_where,
)


Question = Literal["evolution", "comparison", "juxtaposition", "liquidation", "decomposition", "calculator"]
Comparator = Literal["years", "women_men", "regions", "custom", "previous_period", "region_france", "ald"]


def _filter_data(payload: FilterPayload) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.model_dump().items()
        if key in FilterPayload.model_fields
    }


#: Le délai au-delà duquel la courbe de liquidation est considérée close.
#: C'est la borne de `curve`, et donc la définition pratique de « 100 % liquidé »
#: dans tout le produit : ce qui arrive après deux ans n'est pas modélisé.
MAX_DELAY = 24


def _scope(payload: FilterPayload | None) -> tuple[str, list[Any]]:
    """Le filtre de prestation sur le cube des délais — et rien d'autre.

    Ce cube ne connaît que la prestation et les dates : un périmètre de
    population (région, âge, sexe…) n'y a pas de sens, et n'est pas appliqué.
    """
    if payload is None:
        return "1 = 1", []
    scope = FilterPayload(start_year=2000, end_year=2100, grand_post=payload.grand_post,
                          post=payload.post, sub_post=payload.sub_post, service_codes=payload.service_codes)
    return delay_where(scope)


def _completeness(repo: QueryRepository, profile: dict[int, float],
                  available_month: int, first_flow_year: int,
                  where: str, params: list[Any]) -> list[dict[str, Any]]:
    """Part déjà liquidée de chaque année de soins, à la date des flux observés.

    Une année de soins ne se clôt pas avec son dernier flux mensuel : les soins
    de décembre se remboursent l'année suivante. Sans ce redressement, la
    dernière année d'une courbe descend toujours — et l'écran donne à lire une
    baisse là où il n'y a qu'une observation tronquée.

    Le calcul est mois par mois, parce que la troncature l'est : au sein d'un
    même exercice, janvier a été observé onze mois de plus que décembre. Le
    profil (`curve`, mesuré sur les années mûres) dit quelle part chaque durée
    d'observation représente ; la division redresse.

    Aucune extrapolation au-delà de ce que le profil couvre : un mois observé
    plus longtemps que `MAX_DELAY` est tenu pour complet, ce qui est la même
    convention que celle de la courbe.

    Le tableau porte aussi `in_year` : la part de l'année de soins réglée au
    31 décembre de cette même année. C'est la lecture la plus simple de la
    cadence, et la plus robuste pour redresser la dernière année — le profil
    mois par mois divise décembre par une part de quelques pour cent, et
    amplifie d'autant la moindre irrégularité.
    """
    if not profile:
        return []

    rows = repo.query(
        f"""SELECT d.soi_ann AS year, d.soi_moi AS month,
                   SUM(d.rem)::DOUBLE AS value,
                   SUM(CASE WHEN d.flx // 100 = d.soi_ann THEN d.rem END)::DOUBLE AS in_year
            FROM delays d LEFT JOIN transco t USING (prs_nat)
            WHERE {where} AND d.rem IS NOT NULL GROUP BY 1, 2 ORDER BY 1, 2""",
        params,
    )
    longest = max(profile)
    observed: dict[int, float] = {}
    mature: dict[int, float] = {}
    settled_in_year: dict[int, float] = {}
    for row in rows:
        year, month = int(row["year"]), int(row["month"])
        value = max(float(row["value"] or 0), 0.0)
        delay = available_month - (year * 12 + month)
        share = profile.get(min(delay, longest), 0.0) if delay >= 0 else 0.0
        observed[year] = observed.get(year, 0.0) + value
        settled_in_year[year] = settled_in_year.get(year, 0.0) + max(float(row["in_year"] or 0), 0.0)
        # Une part nulle ne peut pas servir de diviseur : le mois n'a rien été
        # observé, donc rien n'est estimable. On ne le remplace pas par zéro —
        # l'année entière devient inestimable, et le dira.
        mature[year] = mature.get(year, 0.0) + (value / share if share > 0 else float("nan"))

    # `available_month` compte les mois depuis l'an 0, décembre inclus : l'année
    # du dernier flux est celle du mois précédent.
    latest_year = (available_month - 1) // 12
    result: list[dict[str, Any]] = []
    for year in sorted(observed):
        estimate = mature[year]
        complete = estimate == estimate and estimate > 0  # écarte NaN
        # La part réglée dans l'année n'a de sens que pour une année de soins
        # dont les douze mois de flux ont été observés ET qui a eu le temps de
        # se liquider : la dernière année serait à 100 % par construction, et
        # une année antérieure au premier flux à 0 % — deux artefacts, pas des
        # mesures.
        closed = first_flow_year <= year < latest_year and observed[year] > 0
        result.append({
            "year": year,
            "observed": observed[year],
            "mature": estimate if complete else None,
            "ratio": min(observed[year] / estimate, 1.0) if complete else None,
            "in_year": settled_in_year[year] / observed[year] if closed else None,
        })
    return result


_EMPTY = {
    "available": False,
    "status": "Indisponible",
    "consolidated_through": None,
    "latest_flow": None,
    "liquidation_observed_through": None,
    "thresholds": {},
    "curve": [],
    "completeness": [],
}


def liquidation(repo: QueryRepository, payload: FilterPayload | None = None) -> dict[str, Any]:
    """La cadence de liquidation d'un périmètre de prestations.

    Sans périmètre, c'est la cadence de tout DAMIR — celle des métadonnées et
    de la puce « consolidé jusqu'en ». Avec, c'est celle du grand poste, du
    poste, du sous-poste ou des prestations demandés : les honoraires
    hospitaliers se liquident plus vite que les séjours, et une projection qui
    l'ignore se trompe d'autant.
    """
    if not repo.has_delays:
        return dict(_EMPTY)

    maximum_rows = repo.query(
        "SELECT MAX(TRY_CAST(flx AS INTEGER)) AS latest_flow, MIN(TRY_CAST(flx AS INTEGER)) AS first_flow, "
        "MAX(soi_ann) AS latest_care_year FROM delays"
    )
    latest_flow = int(maximum_rows[0]["latest_flow"]) if maximum_rows and maximum_rows[0]["latest_flow"] else None
    first_flow_year = int(maximum_rows[0]["first_flow"]) // 100 if maximum_rows and maximum_rows[0]["first_flow"] else 0
    latest_care_year = int(maximum_rows[0]["latest_care_year"]) if maximum_rows and maximum_rows[0]["latest_care_year"] else None
    if latest_flow is None or latest_care_year is None:
        return dict(_EMPTY)

    where, params = _scope(payload)
    rows = repo.query(
        f"""
        SELECT (d.flx // 100) * 12 + (d.flx % 100) - (d.soi_ann * 12 + d.soi_moi) AS delay,
               SUM(d.rem)::DOUBLE AS value
        FROM delays d LEFT JOIN transco t USING (prs_nat)
        WHERE {where} AND d.soi_ann <= ? AND d.rem IS NOT NULL
        GROUP BY 1 HAVING delay BETWEEN 0 AND {MAX_DELAY}
        ORDER BY 1
        """,
        [*params, latest_care_year - 2],
    )
    total = sum(max(float(row["value"] or 0), 0) for row in rows)
    if total <= 0:
        return {**_EMPTY, "latest_flow": latest_flow, "status": "Aucun règlement sur ce périmètre"}
    cumulative = 0.0
    curve: list[dict[str, Any]] = []
    thresholds: dict[str, int | None] = {"50": None, "90": None, "95": None, "97": None}
    # La même courbe sert deux fois : à l'écran, et comme profil de redressement
    # dans `_completeness`. Deux mesures de la même cadence divergeraient.
    profile: dict[int, float] = {}
    for row in rows:
        cumulative += max(float(row["value"] or 0), 0)
        percentage = 100 * cumulative / total if total else 0.0
        delay = int(row["delay"])
        curve.append({"delay": delay, "label": f"M+{delay}", "value": percentage})
        profile[delay] = percentage / 100
        for threshold in thresholds:
            if thresholds[threshold] is None and percentage >= int(threshold):
                thresholds[threshold] = delay

    k97 = thresholds["97"] if thresholds["97"] is not None else 4
    available_month = (latest_flow // 100) * 12 + (latest_flow % 100)
    liquidation_observed_through = (available_month - 12 - 24) // 12
    candidate_years = [
        year
        for year in range(2015, latest_care_year + 1)
        if year * 12 + 12 + int(k97) <= available_month
    ]
    consolidated_through = max(candidate_years) if candidate_years else latest_care_year - 2
    latest_label = f"{latest_flow % 100:02d}/{latest_flow // 100}"
    return {
        "available": True,
        "status": f"Consolidé jusqu’en {consolidated_through}",
        "consolidated_through": consolidated_through,
        "latest_flow": latest_flow,
        "latest_flow_label": latest_label,
        "liquidation_observed_through": liquidation_observed_through,
        "thresholds": thresholds,
        "curve": curve,
        "completeness": _completeness(repo, profile, available_month, first_flow_year, where, params),
    }


def reliability_metadata(repo: QueryRepository) -> dict[str, Any]:
    """La cadence de tout DAMIR : ce qu'affichent les métadonnées."""
    return liquidation(repo)


def studio_metadata(repo: QueryRepository) -> dict[str, Any]:
    reliability = reliability_metadata(repo)
    return {
        "reliability": reliability,
        "semantic_version": "1.0",
        # `analysis_questions` a disparu avec l'écran « Repères » : c'était le
        # catalogue de ses six calculs, que le Tableau absorbe dans son menu
        # d'agrégation. `reliability` reste — elle alimente la puce « en
        # consolidation » de DAMIR et servira au point 3.4.
    }


# Le moteur de l'ancien ecran « Reperes » vivait ici : six calculs — evolution,
# comparaison, juxtaposition, liquidation, decomposition, calculatrice — pour
# produire un chiffre. Il est parti avec l'ecran (point 2.1) : le Tableau les
# absorbe dans un menu d'agregation, et les derive cote client a partir des
# composantes brutes de `pivot.py`, sans second chemin d'agregation.
#
# Ce qui reste ici est ce qui sert encore : `reliability_metadata`, qui derive
# la cadence de liquidation du cube des delais et alimente la puce
# « en consolidation » de DAMIR, et `methodology`, qui compose les fiches des
# cinq sources.


def _modalites(repo: QueryRepository, liste: str | None) -> int | None:
    """Le nombre réel de modalités, lu dans les métadonnées déjà calculées.

    `None` plutôt que zéro quand le décompte n'a pas de sens : les niveaux
    inférieurs de la hiérarchie de prestations dépendent du niveau choisi, et
    annoncer « 0 poste » serait faux là où la bonne réponse est « cela dépend ».
    """
    if liste is None:
        return None
    valeurs = repo.metadata().get(liste)
    return len(valeurs) if isinstance(valeurs, list) else None


def methodology(repo: QueryRepository) -> dict[str, Any]:
    reliability = reliability_metadata(repo)
    damir_year_rows = repo.query("SELECT MIN(soi_ann) AS first_year, MAX(soi_ann) AS last_year FROM cube")
    damir_first_year = int(damir_year_rows[0]["first_year"]) if damir_year_rows and damir_year_rows[0]["first_year"] else None
    damir_last_year = int(damir_year_rows[0]["last_year"]) if damir_year_rows and damir_year_rows[0]["last_year"] else None
    damir_period = (
        f"{damir_first_year}–{damir_last_year}"
        if damir_first_year is not None and damir_last_year is not None
        else "Période indisponible"
    )
    pathologies_available = bool(getattr(repo, "has_pathologies", False))
    pathology_years: list[int] = []
    if pathologies_available:
        try:
            from .pathologies import pathology_metadata
            pathology_years = [int(year) for year in pathology_metadata(repo).get("years", [])]
        except Exception:
            pass
    pathology_period = (
        f"{min(pathology_years)}–{max(pathology_years)}"
        if pathology_years else "Période disponible"
    )
    csp_available = bool(getattr(repo, "has_csp", False))
    csp_years: list[int] = []
    csp_nomenclatures: list[str] = []
    if csp_available:
        try:
            from .csp import csp_metadata
            csp_meta = csp_metadata(repo)
            csp_years = [int(year) for year in csp_meta.get("years", [])]
            csp_nomenclatures = [str(item.get("nomenclature")) for item in csp_meta.get("nomenclatures", []) if item.get("nomenclature")]
        except Exception:
            pass
    csp_period = f"{min(csp_years)}–{max(csp_years)}" if csp_years else "millésime disponible"
    mortality_available = bool(getattr(repo, "has_mortality", False))
    mortality_years: list[int] = []
    if mortality_available:
        try:
            from .mortality import mortality_metadata
            mortality_years = [int(year) for year in mortality_metadata(repo).get("years", [])]
        except Exception:
            pass
    mortality_period = (
        f"{min(mortality_years)}–{max(mortality_years)}"
        if mortality_years else "Période disponible"
    )
    population_available = bool(getattr(repo, "has_population", False))
    population_years: list[int] = []
    if population_available:
        try:
            from .population import population_metadata
            population_years = [int(year) for year in population_metadata(repo).get("years", [])]
        except Exception:
            pass
    population_period = (
        f"{min(population_years)}–{max(population_years)}"
        if population_years else "Période disponible"
    )
    measures = [{
        "key": metric.key,
        "label": metric.label,
        "family": metric.family,
        "kind": metric.kind,
        "definition": metric.definition,
        "formula": metric.formula,
        "caveat": metric.caveat,
        "requires_homogeneous_unit": metric.requires_homogeneous_unit,
        # `additive` décide de ce qu'on a le droit d'empiler, et le référentiel
        # l'affiche en colonne. Absent de la charge utile, il s'y lisait
        # « non » pour les douze mesures — un défaut plus grave que l'omission,
        # puisqu'il affirmait le contraire de la vérité sur les huit additives.
        "additive": metric.additive,
        "unit_key": metric.unit_key,
        "unit_label": metric.unit_label,
        "invalid_grand_posts": list(POSTES_SANS_BASE) if metric.key == "copayment" else [],
    } for metric in METRICS.values()]
    return {
        "source": {
            "key": "damir",
            "name": "Open DAMIR",
            "producer": "Assurance Maladie",
            "description": "Dépenses et remboursements mensuels de l’Assurance Maladie, agrégés pour l’analyse.",
            "granularity": "Année de soins dans le cube principal ; mois de remboursement dans le cube de liquidation.",
            "period": damir_period,
            "dimensions": ["Temps", "Territoire", "Âge", "Sexe", "Prestation"],
            "measures_count": len(measures),
            "badges": [reliability["status"], "Liquidation observée"],
            "limitations": [
                "Aucune population exposée n’est intégrée : pas de fréquence ni de coût par assuré.",
                "Les quantités ne sont pas homogènes entre prestations.",
                "Les dernières périodes en date de soins peuvent être incomplètement liquidées.",
                "Certaines modalités sont inconnues ou non renseignées.",
            ],
        },
        "pathology_source": {
            "key": "pathologies",
            "name": "Cartographie des pathologies",
            "producer": "Cnam",
            "description": "Effectifs de patients, populations de référence et prévalences par pathologie.",
            "granularity": "Année, pathologie, âge quinquennal, sexe et territoire.",
            "period": pathology_period,
            "dimensions": ["Temps", "Territoire", "Âge", "Sexe", "Pathologie"],
            "measures_count": 2,
            "badges": ["Consolidé", "Secret statistique"],
            "limitations": [
                "Les effectifs inférieurs à 10 patients peuvent être masqués à la source.",
                "Une cellule masquée reste absente des graphiques et des calculs ; elle n’est ni remplacée par zéro ni réallouée.",
                "Aucune prévalence standardisée n’est recalculée à partir de cellules masquées tant qu’une règle d’imputation validée n’est pas disponible.",
                "Une personne peut être comptée dans plusieurs pathologies.",
                "La source ne contient aucune dépense ni prestation DAMIR.",
                "Toute mise en regard avec DAMIR reste agrégée et non causale.",
            ],
            "status": "Disponible" if pathologies_available else "Indisponible",
        },
        "csp_source": {
            "key": "csp",
            "name": "Professions et catégories socioprofessionnelles",
            "producer": "Insee",
            "description": "Structure des actifs ayant un emploi selon la profession, le territoire, l’âge et le sexe.",
            "granularity": f"Millésime(s) {csp_period}, région, âge exact, sexe et CSP en 6 ou 29 postes.",
            "period": csp_period,
            "dimensions": ["Temps", "Territoire", "Âge", "Sexe", "CSP"],
            "measures_count": 2,
            "badges": ["Pondéré Insee", "Actifs en emploi"],
            "limitations": [
                "Le champ porte uniquement sur les actifs ayant un emploi (TACT = 11).",
                "Les effectifs sont pondérés par le poids individuel du recensement.",
                "L’évolution interannuelle fiable se lit au niveau des 6 grands groupes ; la nomenclature détaillée change entre PCS 2003 et PCS 2020.",
                "Les comparaisons temporelles devront respecter la méthode du recensement glissant.",
            ],
            "status": "Disponible" if csp_available else "Indisponible",
            "years": csp_years,
            "nomenclatures": csp_nomenclatures,
        },
        "mortality_source": {
            "key": "mortality",
            "name": "Causes médicales de décès",
            "producer": "INSERM · CépiDc",
            "description": "Effectifs nationaux de décès par cause, sexe et grande tranche d’âge.",
            "granularity": "Année, cause de décès et six périmètres de population.",
            "period": mortality_period,
            "dimensions": ["Temps", "Âge", "Sexe", "Cause"],
            "measures_count": 2,
            "badges": ["Effectifs bruts", "Sans dénominateur"],
            "limitations": [
                "France entière uniquement : pas de ventilation régionale ou individuelle.",
                "Les décès de résidents français survenus à l’étranger ne sont pas inclus.",
                "Les effectifs sont bruts et ne sont pas rapportés à une population exposée : ils ne mesurent pas un risque de mortalité.",
                "Les blocs femmes/hommes et âges sont séparés ; aucun croisement sexe × âge ne peut être reconstruit.",
                "La part d’une cause parmi tous les décès est un indicateur de composition, pas une mesure du risque ni une tendance principale.",
                "Des ruptures de série peuvent refléter des changements de codage.",
            ],
            "status": "Disponible" if mortality_available else "Indisponible",
        },
        "population_source": {
            "key": "population",
            "name": "Estimations de population",
            "producer": "Insee",
            "description": "Population résidente par région, sexe et tranche d’âge quinquennale, au 1er janvier. Cinquième base consultable, et dénominateur de référence des mesures par habitant des autres bases.",
            "granularity": "Année, région, sexe et tranche d’âge quinquennale.",
            "period": population_period,
            "dimensions": ["Temps", "Territoire", "Âge", "Sexe"],
            "measures_count": 2,
            "badges": ["Au 1er janvier", "Rétropolée depuis 1975"],
            "limitations": [
                "Population au 1er janvier : ce n’est pas une population moyenne annuelle. Les taux des autres bases se rapportent à la moyenne des 1er janvier N et N+1 ; la dernière année disponible, faute de N+1, compte son 1er janvier seul.",
                "1975 à 1989 : métropole seule, la source ne publie pas les DROM par sexe et âge.",
                "Mayotte n’entre dans la série qu’à partir de 2014 ; la Guadeloupe est publiée hors Saint-Martin et Saint-Barthélemy.",
                "Sur quelques cellules d’outre-mer des années 1990, l’âge n’est pas détaillé au-delà de 90 ans : la tranche « 90–94 ans » y porte tous les 90 ans et plus.",
                "Les régions sont rétropolées sur les 13 régions actuelles depuis 1975 : aucune rupture de la réforme de 2016 n’apparaît, mais les chiffres anciens sont reconstitués.",
                "Les derniers millésimes sont provisoires ou précoces et seront révisés.",
                "Le total « Ensemble » du classeur n’est pas chargé : il est recalculé par somme des hommes et des femmes.",
            ],
            "status": "Disponible" if population_available else "Indisponible",
        },
        "reliability": reliability,
        "measures": measures,
        # Onze noms sans un mot d'explication ne font pas un référentiel : chaque
        # dimension porte désormais ce qu'elle découpe, d'où elle vient, son
        # nombre réel de modalités, et la précaution qui décide d'une lecture
        # juste ou fausse.
        "dimensions": [
            {
                "key": key,
                "label": label,
                "column": expression,
                "description": DIMENSION_NOTES.get(key, {}).get("description"),
                "origin": DIMENSION_NOTES.get(key, {}).get("origin"),
                "caution": DIMENSION_NOTES.get(key, {}).get("caution"),
                "modalities": _modalites(repo, DIMENSION_NOTES.get(key, {}).get("modalities_from")),
            }
            for key, (label, expression) in DIMENSIONS.items()
        ],
        "compatibility_rules": [
            {"key": "no_denominator", "label": "Pas de dénominateur, pas de fréquence par assuré", "status": "active"},
            {"key": "quantity_units", "label": "Volumes sommés et moyennes pondérées par les quantités ; effet de mix signalé", "status": "active"},
            {"key": "copayment_scope", "label": "Ticket modérateur exclu des postes sans base", "status": "active"},
            {"key": "care_consolidation", "label": "Consolidation commune dérivée des délais", "status": "active"},
            {"key": "ecological_lock", "label": "Aucune dépense par patient pathologique calculée", "status": "active"},
        ],
        "catalog": [
            {"key": "damir", "label": "Open DAMIR", "status": "Disponible", "common_dimensions": ["time", "territory", "age", "sex"]},
            {"key": "pathologies", "label": "Pathologies", "status": "Disponible" if pathologies_available else "Indisponible", "common_dimensions": ["time", "territory", "age", "sex"]},
            {"key": "dc", "label": "DC", "status": "À documenter", "common_dimensions": []},
            {"key": "csp", "label": "CSP", "status": "Disponible" if csp_available else "Indisponible", "common_dimensions": ["time", "territory", "age", "sex"]},
            {"key": "mortality", "label": "Mortalité", "status": "Disponible" if mortality_available else "Indisponible", "common_dimensions": ["time", "age", "sex"]},
            {"key": "population", "label": "Population", "status": "Disponible" if population_available else "Indisponible", "common_dimensions": ["time", "territory", "age", "sex"]},
        ],
    }
