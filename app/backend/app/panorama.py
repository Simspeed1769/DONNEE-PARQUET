"""Panorama d'une ou plusieurs prestations, vues sous toutes leurs dimensions.

Là où `explore.py` répond à « comment se découpe ce périmètre selon *une*
dimension ? », ce module répond à « à quoi ressemble *ce sujet* ? » — et, dès
qu'il y en a plusieurs, « en quoi diffèrent-ils ? ».

Un **sujet** est une modalité mise sous observation : une prestation, un grand
poste. Aucun sujet choisi signifie « tout confondu » : un sujet unique couvrant
le périmètre entier, qui est l'état d'ouverture de l'écran.

Une **facette** est une dimension selon laquelle on détaille chaque sujet :
région, tranche d'âge, sexe. Chaque facette part par sujet et par année, si
bien que l'interface dispose de tout ce qu'il lui faut pour dessiner aussi bien
la carte d'une prestation que la comparaison de huit prestations, sans requête
supplémentaire.

Le **référentiel** accompagne la réponse : c'est le même découpage calculé sur
le périmètre *sans* la restriction aux sujets. Il sert de dénominateur à
l'indice de spécialisation (voir `LOCATION_QUOTIENT` plus bas), qui est ce qui
rend deux cartes comparables alors que leurs montants ne le sont pas.
"""

from __future__ import annotations

from typing import Any

from pydantic import Field

from .analysis import (
    DIMENSIONS,
    METRICS,
    POSTES_SANS_BASE,
    UNIT_DEPENDENT_KEYS,
    FilterPayload,
    QueryRepository,
    cube_where,
    unit_caveat,
    unit_scope,
)
from .explore import (
    COMPONENTS,
    FORMULAS,
    TOTAL_KEY,
    _bucket_label,
    _COMPONENT_SQL,
    _dimension_sql,
    _service_labels,
)

# Sujet unique lorsque l'utilisateur n'en a choisi aucun.
ALL_KEY = "__all__"
ALL_LABEL = "Tout confondu"

# Huit sujets au plus : c'est la borne de la palette catégorielle, et au-delà
# une grille de petites cartes cesse d'être lisible.
MAX_SUBJECTS = 8

# Facettes proposées par défaut. Toute dimension du cube peut en tenir lieu ;
# celles-ci sont celles qui décrivent une population et un territoire.
DEFAULT_FACETS = ("region", "age", "sex")

#: Pourquoi un indice plutôt qu'un montant, dans la vue comparative.
#:
#: Un montant remboursé par région confond deux choses : le poids de la région
#: et l'intensité du recours. L'Île-de-France arrive première partout, ce qui
#: n'apprend rien. L'indice de spécialisation neutralise les deux tailles :
#:
#:     indice[r, s] = 100 × (v[r, s] / v[·, s]) / (v[r, ·] / v[·, ·])
#:
#: soit « la part de la région r dans la prestation s, rapportée à la part de
#: la région r dans l'ensemble du périmètre ». 100 signifie que la région
#: consomme cette prestation exactement à hauteur de son poids ; 130, qu'elle
#: la sur-consomme de 30 %. Deux prestations de tailles très différentes
#: deviennent alors comparables sur la même échelle de couleur.
#:
#: Le dénominateur v[r, ·] vient du référentiel, d'où sa présence dans la
#: réponse : il ne peut pas se déduire des sujets seuls.
LOCATION_QUOTIENT = "part du sujet rapportée à la part du périmètre"


class PanoramaRequest(FilterPayload):
    subject_dimension: str = "service"
    subjects: list[str] = Field(default_factory=list, max_length=MAX_SUBJECTS)
    facets: list[str] = Field(default_factory=lambda: list(DEFAULT_FACETS))


def _subject_predicate(dimension: str, subjects: list[str]) -> tuple[str, list[Any]]:
    """Restreint la requête aux sujets observés.

    Les codes de prestation sont numériques dans le cube ; les autres
    dimensions portent du texte. On convertit donc explicitement plutôt que de
    laisser DuckDB comparer un entier à une chaîne.
    """
    _, expression, _ = _dimension_sql(dimension)
    placeholders = ",".join("?" for _ in subjects)
    if dimension == "service":
        codes: list[Any] = []
        for value in subjects:
            try:
                codes.append(int(value))
            except (TypeError, ValueError):
                raise ValueError(f"Code de prestation invalide : {value}")
        return f"{expression} IN ({placeholders})", codes
    return f"CAST({expression} AS VARCHAR) IN ({placeholders})", list(subjects)


def _facet_rows(repo: QueryRepository, payload: PanoramaRequest, facets: list[str],
                *, restrict_to_subjects: bool) -> dict[str, list[dict[str, Any]]]:
    """Composantes par année, par sujet et par modalité, pour toutes les facettes.

    Un `GROUPING SETS` produit les trois découpages en **un seul balayage** du
    cube. Interroger facette par facette relisait le même milliard de lignes
    autant de fois, et la troisième lecture coûtait déjà sept fois la première
    — DuckDB n'a plus de mémoire à consacrer au cache une fois les précédentes
    installées. `GROUPING()` indique de quel découpage chaque ligne provient,
    ce qu'on ne peut pas déduire des NULL : une région « non renseignée » est
    une modalité réelle, pas une absence.

    Le sujet figure dans le GROUP BY dès qu'il est restreint ; sinon tout se
    replie sur un sujet unique — c'est le référentiel, ou « tout confondu ».
    """
    expressions = [_dimension_sql(facet)[1] for facet in facets]
    _, subject_expression, _ = _dimension_sql(payload.subject_dimension)

    where, params = cube_where(payload)
    # Les paramètres des `CASE WHEN` du ticket modérateur précèdent ceux du
    # WHERE dans l'ordre d'apparition du SQL ; les expressions de dimension
    # n'en portent aucun.
    head_params = list(POSTES_SANS_BASE) * 2

    if restrict_to_subjects and payload.subjects:
        predicate, subject_params = _subject_predicate(
            payload.subject_dimension, payload.subjects)
        where = f"({where}) AND ({predicate})"
        params = [*params, *subject_params]
        grouped_subject, subject_term = subject_expression, f"{subject_expression}, "
    else:
        # Grouper sur une constante n'a pas de sens : on la projette seulement.
        grouped_subject, subject_term = "NULL", ""

    selected = ", ".join(f"{expression} AS f{index}"
                         for index, expression in enumerate(expressions))
    flags = ", ".join(f"GROUPING({expression}) AS g{index}"
                      for index, expression in enumerate(expressions))
    sets = ", ".join(f"(c.soi_ann, {subject_term}{expression})"
                     for expression in expressions)

    rows = repo.query(
        f"""
        SELECT c.soi_ann AS year,
               {grouped_subject} AS subject,
               {selected}, {flags},
               {', '.join(_COMPONENT_SQL)}
        FROM cube c LEFT JOIN transco t USING (prs_nat)
        WHERE {where}
        GROUP BY GROUPING SETS ({sets})
        """,
        [*head_params, *params],
    )

    # Chaque ligne appartient au découpage dont l'indicateur GROUPING vaut 0.
    per_facet: dict[str, list[dict[str, Any]]] = {facet: [] for facet in facets}
    for row in rows:
        for index, facet in enumerate(facets):
            if row[f"g{index}"] == 0:
                per_facet[facet].append({**row, "bucket": row[f"f{index}"]})
                break
    return per_facet


def _empty() -> dict[str, float]:
    return {name: 0.0 for name in COMPONENTS}


def _add(target: dict[str, float], source: dict[str, float]) -> None:
    for name in COMPONENTS:
        target[name] += source[name]


def _components_from_row(row: dict[str, Any]) -> dict[str, float]:
    return {name: float(row.get(name) or 0.0) for name in COMPONENTS}


def _emit(key: str, label: str, per_year: dict[int, dict[str, float]],
          years: list[int]) -> dict[str, Any]:
    return {
        "key": key,
        "label": label,
        "components": {
            name: [per_year.get(year, {}).get(name, 0.0) for year in years]
            for name in COMPONENTS
        },
    }


def _availability(payload: PanoramaRequest) -> dict[str, str | None]:
    """Explique, mesure par mesure, pourquoi elle est indisponible — ou None.

    La règle vit dans `analysis.unit_scope`, partagée avec l'exploration, le
    Tableau et l'extraction : les quatre surfaces refusaient — ou acceptaient —
    différemment la même chose. Ici s'ajoute seulement ce que le panorama sait
    de plus : son **sujet**, qui vaut prestation unique quand il en désigne une.
    """
    subject_is_service = (
        payload.subject_dimension == "service" and len(payload.subjects) == 1
    )
    level, refusal = unit_scope(payload)
    if subject_is_service:
        level, refusal = "prestation", None

    reasons: dict[str, str | None] = {}
    for key, metric in METRICS.items():
        reason: str | None = None
        if metric.unit_key in UNIT_DEPENDENT_KEYS and refusal:
            reason = refusal
        elif key == "copayment" and payload.grand_post in POSTES_SANS_BASE:
            reason = "Ce grand poste n’a pas de base de remboursement."
        reasons[key] = reason
    return reasons


def _warnings(payload: PanoramaRequest, subject_count: int) -> list[str]:
    warnings: list[str] = []
    if not payload.grand_post and not payload.service_codes and not payload.subjects:
        warnings.append(
            "Le ticket modérateur exclut les prestations sans base de remboursement, "
            "afin d’éviter un montant artificiellement négatif."
        )
    if subject_count > 1:
        warnings.append(
            "Les cartes comparées sont en indice : 100 signifie que le territoire "
            "recourt à ce sujet à hauteur de son poids dans le périmètre. "
            "Les montants bruts restent lisibles sujet par sujet."
        )
    return warnings


def _validate(payload: PanoramaRequest) -> list[str]:
    if payload.start_year > payload.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    if payload.subject_dimension not in DIMENSIONS:
        raise ValueError(f"Dimension de sujet inconnue : {payload.subject_dimension}")
    facets = [facet for facet in payload.facets if facet in DIMENSIONS]
    if not facets:
        raise ValueError("Aucune facette exploitable.")
    return facets


def reference_block(repo: QueryRepository, payload: PanoramaRequest,
                    regions: dict[int, str]) -> dict[str, Any]:
    """Le périmètre entier, découpé par facette — sans restriction aux sujets.

    C'est la partie coûteuse : elle balaie tout le cube. Elle ne dépend
    pourtant **que du périmètre**, jamais des prestations observées. La sortir
    de `panorama` permet de la mettre en cache à part, et fait tomber le geste
    central de l'écran — ajouter une prestation à la comparaison — d'un
    balayage complet à une requête filtrée.

    Les années viennent d'ici et non des sujets : une prestation créée en 2019
    doit laisser un trou visible avant 2019, pas décaler l'axe.
    """
    facets = _validate(payload)
    perimeter = payload.model_copy(update={"subjects": []})
    rows = _facet_rows(repo, perimeter, facets, restrict_to_subjects=False)

    years = sorted({int(row["year"]) for facet_rows in rows.values() for row in facet_rows})
    if not years:
        years = list(range(payload.start_year, payload.end_year + 1))

    service_codes = {
        int(row["bucket"])
        for facet in facets if facet == "service"
        for row in rows[facet] if row["bucket"] is not None
    }
    service_labels = _service_labels(repo, sorted(service_codes))

    out: dict[str, list[dict[str, Any]]] = {}
    total: dict[int, dict[str, float]] = {}
    for index, facet in enumerate(facets):
        per_bucket: dict[str, dict[int, dict[str, float]]] = {}
        for row in rows[facet]:
            cell = (per_bucket
                    .setdefault(str(row["bucket"]), {})
                    .setdefault(int(row["year"]), _empty()))
            _add(cell, _components_from_row(row))
        out[facet] = [
            _emit(key, _bucket_label(facet, key, regions, service_labels), per_year, years)
            for key, per_year in per_bucket.items()
        ]
        # Chaque facette partitionne le périmètre : le total se lit sur
        # n'importe laquelle, sans requête supplémentaire.
        if index == 0:
            for per_year in per_bucket.values():
                for year, cell in per_year.items():
                    _add(total.setdefault(year, _empty()), cell)

    return {
        "years": years,
        "facets": out,
        "total": _emit(TOTAL_KEY, "Périmètre", total, years),
    }


def panorama(repo: QueryRepository, payload: PanoramaRequest,
             regions: dict[int, str],
             reference: dict[str, Any] | None = None) -> dict[str, Any]:
    facets = _validate(payload)
    has_subjects = bool(payload.subjects)

    if reference is None:
        reference = reference_block(repo, payload, regions)
    years: list[int] = reference["years"]
    reference_out: dict[str, list[dict[str, Any]]] = reference["facets"]
    reference_total_bucket: dict[str, Any] = reference["total"]

    # Sans sujet choisi, « tout confondu » est exactement le référentiel : on
    # ne relit pas le cube pour recalculer ce qu'on vient de calculer.
    subject_rows = (
        _facet_rows(repo, payload, facets, restrict_to_subjects=True)
        if has_subjects else None
    )

    # Libellés des prestations, résolus une seule fois pour tout ce qui en
    # porte : les sujets comme, le cas échéant, une facette « prestation ».
    service_codes: set[int] = set()
    if payload.subject_dimension == "service" and has_subjects:
        for value in payload.subjects:
            try:
                service_codes.add(int(value))
            except (TypeError, ValueError):
                pass
    if subject_rows:
        for facet in facets:
            if facet == "service":
                for row in subject_rows[facet]:
                    if row["bucket"] is not None:
                        service_codes.add(int(row["bucket"]))
    service_labels = _service_labels(repo, sorted(service_codes))

    def subject_label(raw: Any) -> str:
        if raw is None:
            return ALL_LABEL
        return _bucket_label(payload.subject_dimension, raw, regions, service_labels)

    def fold(rows: list[dict[str, Any]], facet: str,
             ) -> dict[str, dict[str, dict[int, dict[str, float]]]]:
        """sujet -> modalité -> année -> composantes."""
        folded: dict[str, dict[str, dict[int, dict[str, float]]]] = {}
        for row in rows:
            subject_key = ALL_KEY if row["subject"] is None else str(row["subject"])
            bucket_key = str(row["bucket"])
            cell = (folded
                    .setdefault(subject_key, {})
                    .setdefault(bucket_key, {})
                    .setdefault(int(row["year"]), _empty()))
            _add(cell, _components_from_row(row))
        return folded

    # Ordre des sujets : celui que l'utilisateur a composé, et non un
    # classement imposé. Sa sélection est une liste ordonnée, les couleurs et
    # la grille de petites cartes doivent la suivre.
    ordered_subjects = list(payload.subjects) if has_subjects else [ALL_KEY]

    # Sans sujet choisi, l'unique sujet est le périmètre lui-même : ses
    # facettes sont celles du référentiel, déjà en main.
    folded_by_facet = (
        {facet: fold(subject_rows[facet], facet) for facet in facets}
        if subject_rows else {}
    )

    subjects_out: list[dict[str, Any]] = []
    for subject_key in ordered_subjects:
        raw_label = subject_label(None if subject_key == ALL_KEY else subject_key)
        if not has_subjects:
            subjects_out.append({
                "key": ALL_KEY,
                "label": ALL_LABEL,
                "total": {**reference_total_bucket, "label": ALL_LABEL},
                "facets": {facet: list(reference_out[facet]) for facet in facets},
            })
            continue
        facets_out: dict[str, list[dict[str, Any]]] = {}
        total_per_year: dict[int, dict[str, float]] = {}
        for index, facet in enumerate(facets):
            per_bucket = folded_by_facet[facet].get(subject_key, {})
            buckets = [
                _emit(bucket_key,
                      _bucket_label(facet, bucket_key, regions, service_labels),
                      per_year, years)
                for bucket_key, per_year in per_bucket.items()
            ]
            # Classement par poids décroissant sur le remboursement : c'est
            # l'ordre d'affichage par défaut des barres et du dot plot.
            buckets.sort(key=lambda item: -sum(item["components"]["rem"]))
            facets_out[facet] = buckets
            # Le total du sujet se déduit d'une facette quelconque : chaque
            # facette est une partition complète du périmètre, aucune ligne
            # n'en sort. On ne le recalcule donc pas par une requête de plus.
            if index == 0:
                for per_year in per_bucket.values():
                    for year, cell in per_year.items():
                        _add(total_per_year.setdefault(year, _empty()), cell)
        subjects_out.append({
            "key": subject_key,
            "label": raw_label,
            "total": _emit(TOTAL_KEY, raw_label, total_per_year, years),
            "facets": facets_out,
        })

    availability = _availability(payload)
    # Le niveau de découpage sur lequel un volume se lit : il commande la
    # réserve attachée aux trois mesures qui dépendent de l'unité.
    scope_level = (
        "prestation"
        if payload.subject_dimension == "service" and len(payload.subjects) == 1
        else unit_scope(payload)[0]
    )
    return {
        "subject_dimension": payload.subject_dimension,
        "subject_dimension_label": DIMENSIONS[payload.subject_dimension][0],
        "facets": facets,
        "facet_labels": {facet: DIMENSIONS[facet][0] for facet in facets},
        "years": years,
        "components": list(COMPONENTS),
        "subjects": subjects_out,
        "reference": reference_out,
        "reference_total": reference_total_bucket,
        "measures": [
            {
                "key": metric.key,
                "label": metric.label,
                "kind": metric.kind,
                "family": metric.family,
                "definition": metric.definition,
                "formula": metric.formula,
                "caveat": " ".join(filter(None, (
                    metric.caveat,
                    unit_caveat(scope_level) if metric.unit_key in UNIT_DEPENDENT_KEYS else None,
                ))) or None,
                "additive": metric.additive,
                "unit_key": metric.unit_key,
                "unit_label": metric.unit_label,
                "unavailable_reason": availability[metric.key],
                "formula_spec": FORMULAS[metric.key],
            }
            for metric in METRICS.values()
        ],
        "dimensions": [
            {"key": key, "label": label}
            for key, (label, _) in DIMENSIONS.items()
            if key != "year"
        ],
        "warnings": _warnings(payload, len(ordered_subjects)),
    }
