"""Moteur d'exploration unifié de DAMIR.

Ce module remplace le triptyque Panorama / Atelier / Repères par un seul
moteur. Le principe : une requête agrège les **composantes brutes** du cube
(remboursements, dépenses, quantités…) par année et par modalité d'une
dimension quelconque ; tous les indicateurs en sont ensuite dérivés en Python.

Deux conséquences directes pour l'interface :

- changer d'indicateur ne demande aucune requête, puisque les douze mesures
  sortent des mêmes composantes ;
- n'importe quelle dimension du cube devient un axe de comparaison, au lieu
  des quatre comparaisons figées de l'ancien Atelier.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from .analysis import (
    DIMENSIONS,
    METRICS,
    POSTES_SANS_BASE,
    FilterPayload,
    QueryRepository,
    _mapped_label,
    cube_where,
    delay_where,
)

# Composantes additives suffisant à reconstituer les douze indicateurs.
# `bse_tm` / `rem_tm` portent la variante « ticket modérateur » : elles
# neutralisent les prestations sans base de remboursement, faute de quoi le
# ticket modérateur ressort artificiellement négatif.
COMPONENTS = ("rem", "dep", "depas", "qte", "bse_tm", "rem_tm", "rem_neg")

_BASE_LESS_PREDICATE = (
    "t.grand_poste IS NULL OR t.grand_poste NOT IN ("
    + ",".join("?" for _ in POSTES_SANS_BASE)
    + ")"
)

_COMPONENT_SQL = (
    "SUM(c.rem)::DOUBLE AS rem",
    "SUM(c.dep)::DOUBLE AS dep",
    "SUM(c.depas)::DOUBLE AS depas",
    "SUM(c.qte)::DOUBLE AS qte",
    f"SUM(CASE WHEN {_BASE_LESS_PREDICATE} THEN c.bse_ref END)::DOUBLE AS bse_tm",
    f"SUM(CASE WHEN {_BASE_LESS_PREDICATE} THEN c.rem_ref END)::DOUBLE AS rem_tm",
    "SUM(c.rem_neg)::DOUBLE AS rem_neg",
)

# Nombre de modalités renvoyées avant repli dans « Autres ». Large pour que
# l'interface puisse re-classer instantanément selon l'indicateur choisi,
# borné pour que la charge utile reste légère sur `service` (8 656 modalités).
MAX_BUCKETS = 60

OTHER_KEY = "__other__"
TOTAL_KEY = "__total__"


class ExploreRequest(FilterPayload):
    breakdown: str = "none"
    time_axis: Literal["care", "payment"] = "care"
    rank_by: str = "reimbursed"
    max_buckets: int = Field(default=MAX_BUCKETS, ge=2, le=200)
    # Modalités choisies explicitement par l'utilisateur. Elles sont renvoyées
    # même lorsque leur poids les placerait hors des premières : sans cela, une
    # prestation classée 900e sur 1 342 serait impossible à mettre sur un
    # graphique, ce qui est précisément ce qu'on veut permettre.
    pinned: list[str] = Field(default_factory=list)


class OptionsRequest(FilterPayload):
    """Recherche des modalités d'une dimension, pour le sélecteur de séries."""

    breakdown: str = "service"
    rank_by: str = "reimbursed"
    query: str = ""
    limit: int = Field(default=60, ge=1, le=500)


def _empty() -> dict[str, float]:
    return {name: 0.0 for name in COMPONENTS}


def _add(target: dict[str, float], source: dict[str, float]) -> None:
    for name in COMPONENTS:
        target[name] += source[name]


def _components_from_row(row: dict[str, Any]) -> dict[str, float]:
    return {name: float(row.get(name) or 0.0) for name in COMPONENTS}


# Chaque indicateur s'écrit `facteur × (Σ numérateur) / (Σ dénominateur)`, les
# termes portant leur signe. Cette table est **envoyée telle quelle au client**,
# qui l'évalue avec le même code générique : la formule n'existe donc qu'à un
# seul endroit, et l'interface peut changer d'indicateur sans requête.
FORMULAS: dict[str, dict[str, Any]] = {
    "reimbursed": {"numerator": {"rem": 1}, "denominator": None, "factor": 1},
    "expense": {"numerator": {"dep": 1}, "denominator": None, "factor": 1},
    "out_of_pocket": {"numerator": {"dep": 1, "rem": -1}, "denominator": None, "factor": 1},
    "copayment": {"numerator": {"bse_tm": 1, "rem_tm": -1}, "denominator": None, "factor": 1},
    "excess_fees": {"numerator": {"depas": 1}, "denominator": None, "factor": 1},
    "quantity": {"numerator": {"qte": 1}, "denominator": None, "factor": 1},
    "average_reimbursed": {"numerator": {"rem": 1}, "denominator": {"qte": 1}, "factor": 1},
    "average_expense": {"numerator": {"dep": 1}, "denominator": {"qte": 1}, "factor": 1},
    "coverage": {"numerator": {"rem": 1}, "denominator": {"dep": 1}, "factor": 100},
    "negative": {"numerator": {"rem_neg": 1}, "denominator": None, "factor": 1},
    "gross_reimbursed": {"numerator": {"rem": 1, "rem_neg": -1}, "denominator": None, "factor": 1},
    "negative_share": {
        "numerator": {"rem_neg": -1},
        "denominator": {"rem": 1, "rem_neg": -1},
        "factor": 100,
    },
}


def _combine(components: dict[str, float], terms: dict[str, int]) -> float:
    return sum(components[name] * weight for name, weight in terms.items())


def measure_value(components: dict[str, float], key: str) -> float | None:
    """Dérive un indicateur des composantes agrégées.

    Un ratio sans dénominateur renvoie None plutôt que zéro : il n'existe pas.
    Les distinguer évite qu'une courbe plonge vers zéro là où la donnée est
    simplement absente.
    """
    formula = FORMULAS.get(key)
    if formula is None:
        raise ValueError(f"Mesure inconnue : {key}")
    numerator = _combine(components, formula["numerator"])
    if formula["denominator"] is None:
        return formula["factor"] * numerator
    denominator = _combine(components, formula["denominator"])
    if not denominator:
        return None
    return formula["factor"] * numerator / denominator


def _dimension_sql(key: str) -> tuple[str, str, bool]:
    """Renvoie (libellé, expression SQL, jointure_libellé_prestation)."""
    if key in ("none", ""):
        return "Ensemble du périmètre", "NULL", False
    if key not in DIMENSIONS:
        raise ValueError(f"Dimension inconnue : {key}")
    label, expression = DIMENSIONS[key]
    if expression == "SERVICE":
        return label, "c.prs_nat", True
    return label, expression, False


def _bucket_label(key: str, raw: Any, regions: dict[int, str],
                  service_labels: dict[int, str]) -> str:
    if key in ("none", ""):
        return "Ensemble du périmètre"
    if key == "service":
        try:
            code = int(raw)
        except (TypeError, ValueError):
            return "Prestation inconnue"
        return f"{code} · {service_labels.get(code, 'Prestation non libellée')}"
    return _mapped_label(key, raw, regions)


def _care_axis_rows(repo: QueryRepository, payload: ExploreRequest,
                    expression: str) -> list[dict[str, Any]]:
    where, params = cube_where(payload)
    # Les paramètres des `CASE WHEN` du ticket modérateur précèdent ceux du
    # WHERE dans l'ordre d'apparition du SQL.
    base_less_params = list(POSTES_SANS_BASE) * 2
    return repo.query(
        f"""
        SELECT c.soi_ann AS year, {expression} AS bucket, {', '.join(_COMPONENT_SQL)}
        FROM cube c LEFT JOIN transco t USING (prs_nat)
        WHERE {where}
        GROUP BY 1, 2
        """,
        [*base_less_params, *params],
    )


def _payment_axis_rows(repo: QueryRepository, payload: ExploreRequest) -> list[dict[str, Any]]:
    if not repo.has_delays:
        raise ValueError("Le cube des délais n’est pas disponible.")
    where, params = delay_where(payload, payment_axis=True)
    rows = repo.query(
        f"""
        SELECT d.flx // 100 AS year, NULL AS bucket, SUM(d.rem)::DOUBLE AS rem
        FROM delays d LEFT JOIN transco t USING (prs_nat)
        WHERE {where}
        GROUP BY 1
        """,
        params,
    )
    # Le cube des délais ne porte que le montant remboursé ; les autres
    # composantes restent nulles et leurs indicateurs seront marqués
    # indisponibles sur cet axe.
    return [{"year": row["year"], "bucket": None, "rem": row["rem"]} for row in rows]


def _service_labels(repo: QueryRepository, codes: list[int]) -> dict[int, str]:
    if not codes:
        return {}
    placeholders = ",".join("?" for _ in codes)
    rows = repo.query(
        f"""SELECT prs_nat AS code, COALESCE(libelle, 'Prestation non libellée') AS label
            FROM transco WHERE prs_nat IN ({placeholders})""",
        list(codes),
    )
    return {int(row["code"]): str(row["label"]) for row in rows}


def _measure_availability(payload: ExploreRequest) -> dict[str, str | None]:
    """Explique, mesure par mesure, pourquoi elle est indisponible — ou None."""
    reasons: dict[str, str | None] = {}
    for key, metric in METRICS.items():
        reason: str | None = None
        if payload.time_axis == "payment" and key != "reimbursed":
            reason = "Seul le montant remboursé existe en date de remboursement."
        elif metric.requires_homogeneous_unit and len(payload.service_codes) != 1:
            reason = "Sélectionnez une prestation précise : les volumes ne s’additionnent pas entre prestations."
        elif key == "copayment" and payload.grand_post in POSTES_SANS_BASE:
            reason = "Ce grand poste n’a pas de base de remboursement."
        reasons[key] = reason
    return reasons


def _warnings(payload: ExploreRequest, folded: int) -> list[str]:
    warnings: list[str] = []
    if payload.time_axis == "payment":
        warnings.append(
            "En date de remboursement, les filtres de population ne s’appliquent pas : "
            "le cube des délais ne porte que la prestation et la période."
        )
    if not payload.grand_post and not payload.service_codes:
        warnings.append(
            "Le ticket modérateur exclut les prestations sans base de remboursement, "
            "afin d’éviter un montant artificiellement négatif."
        )
    if folded:
        warnings.append(
            f"{folded} modalités de faible poids sont regroupées dans « Autres » "
            "afin que les totaux restent exacts."
        )
    return warnings


def filter_options(options: list[dict[str, Any]], query: str, limit: int) -> dict[str, Any]:
    """Applique la recherche à un classement déjà calculé.

    La frappe au clavier ne doit pas relancer l'agrégation : celle-ci ne dépend
    que du périmètre, tandis que le texte cherché change à chaque touche. Les
    séparer permet de garder la liste en cache et de ne payer que le filtrage.
    """
    needle = query.strip().casefold()
    matched = [item for item in options if needle in item["label"].casefold()] if needle else options
    return {
        "options": matched[:limit],
        "total_count": len(options),
        "match_count": len(matched),
    }


def aggregate_options(repo: QueryRepository, payload: OptionsRequest,
                      regions: dict[int, str]) -> list[dict[str, Any]]:
    """Modalités d'une dimension, classées par poids réel sur le périmètre.

    C'est ce qui alimente le sélecteur de séries. Le classement est calculé sur
    l'indicateur affiché, et non alphabétique : présenter 1 342 prestations par
    ordre alphabétique revient à ne pas les présenter du tout, puisque rien
    n'indique lesquelles pèsent.

    Toutes les modalités sont agrégées, puis filtrées et tronquées en Python.
    Un seul GROUP BY suffit — même sur la dimension la plus fine, le cube
    compact répond en quelques centaines de millisecondes — et les libellés
    dérivés (région, tranche d'âge…) restent calculés à un seul endroit.
    """
    if payload.rank_by not in METRICS:
        raise ValueError(f"Mesure de classement inconnue : {payload.rank_by}")
    breakdown = payload.breakdown or "none"
    if breakdown in ("none", ""):
        return []

    _, expression, _ = _dimension_sql(breakdown)
    where, params = cube_where(payload)
    base_less_params = list(POSTES_SANS_BASE) * 2
    rows = repo.query(
        f"""
        SELECT {expression} AS bucket, {', '.join(_COMPONENT_SQL)}
        FROM cube c LEFT JOIN transco t USING (prs_nat)
        WHERE {where}
        GROUP BY 1
        """,
        [*base_less_params, *params],
    )

    service_labels = (
        _service_labels(repo, [int(row["bucket"]) for row in rows if row["bucket"] is not None])
        if breakdown == "service" else {}
    )

    options = []
    for row in rows:
        components = _components_from_row(row)
        options.append({
            "key": str(row["bucket"]),
            "label": _bucket_label(breakdown, row["bucket"], regions, service_labels),
            "value": measure_value(components, payload.rank_by),
        })
    options.sort(key=lambda item: abs(item["value"] or 0.0), reverse=True)
    return options


def explore(repo: QueryRepository, payload: ExploreRequest,
            regions: dict[int, str]) -> dict[str, Any]:
    if payload.start_year > payload.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    if payload.rank_by not in METRICS:
        raise ValueError(f"Mesure de classement inconnue : {payload.rank_by}")

    breakdown = payload.breakdown or "none"
    dimension_label, expression, _ = _dimension_sql(breakdown)
    if payload.time_axis == "payment":
        rows = _payment_axis_rows(repo, payload)
        breakdown, dimension_label = "none", "Ensemble du périmètre"
    else:
        rows = _care_axis_rows(repo, payload, expression)

    years = sorted({int(row["year"]) for row in rows})
    if not years:
        years = list(range(payload.start_year, payload.end_year + 1))

    # Agrégation en mémoire : modalité -> année -> composantes.
    buckets: dict[Any, dict[int, dict[str, float]]] = {}
    for row in rows:
        raw = row["bucket"]
        key = TOTAL_KEY if breakdown in ("none", "") else raw
        per_year = buckets.setdefault(key, {})
        cell = per_year.setdefault(int(row["year"]), _empty())
        _add(cell, _components_from_row(row))

    service_labels = (
        _service_labels(repo, [int(key) for key in buckets if key is not None])
        if breakdown == "service" else {}
    )

    def period_total(per_year: dict[int, dict[str, float]]) -> dict[str, float]:
        total = _empty()
        for cell in per_year.values():
            _add(total, cell)
        return total

    ordered = sorted(
        buckets.items(),
        key=lambda item: abs(measure_value(period_total(item[1]), payload.rank_by) or 0.0),
        reverse=True,
    )

    # Les modalités épinglées remontent avec les premières, où que leur poids
    # les place. Le repli « Autres » ne porte donc que ce que personne n'a
    # demandé, et les totaux restent exacts.
    pinned = {key for key in payload.pinned if key}
    kept = ordered[: payload.max_buckets]
    rest = ordered[payload.max_buckets:]
    if pinned:
        kept += [item for item in rest if str(item[0]) in pinned]
        rest = [item for item in rest if str(item[0]) not in pinned]
    folded = rest
    if folded:
        merged: dict[int, dict[str, float]] = {}
        for _, per_year in folded:
            for year, cell in per_year.items():
                _add(merged.setdefault(year, _empty()), cell)
        kept.append((OTHER_KEY, merged))

    def emit(key: Any, per_year: dict[int, dict[str, float]]) -> dict[str, Any]:
        label = (
            "Autres" if key == OTHER_KEY
            else "Ensemble du périmètre" if key == TOTAL_KEY
            else _bucket_label(breakdown, key, regions, service_labels)
        )
        return {
            "key": OTHER_KEY if key == OTHER_KEY else str(key),
            "label": label,
            "is_other": key == OTHER_KEY,
            "components": {
                name: [per_year.get(year, {}).get(name, 0.0) for year in years]
                for name in COMPONENTS
            },
        }

    series = [emit(key, per_year) for key, per_year in kept]

    grand_total: dict[int, dict[str, float]] = {}
    for _, per_year in buckets.items():
        for year, cell in per_year.items():
            _add(grand_total.setdefault(year, _empty()), cell)

    availability = _measure_availability(payload)
    return {
        "breakdown": breakdown,
        "breakdown_label": dimension_label,
        "time_axis": payload.time_axis,
        "years": years,
        "components": list(COMPONENTS),
        "series": series,
        "total": emit(TOTAL_KEY, grand_total),
        "bucket_count": len(buckets),
        "folded_count": len(folded),
        "measures": [
            {
                "key": metric.key,
                "label": metric.label,
                "kind": metric.kind,
                "family": metric.family,
                "definition": metric.definition,
                "formula": metric.formula,
                "caveat": metric.caveat,
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
        "warnings": _warnings(payload, len(folded)),
    }
