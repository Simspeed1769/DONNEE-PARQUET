from __future__ import annotations

from functools import lru_cache
from typing import Any, Literal

from pydantic import Field

from .analysis import (
    DIMENSIONS,
    METRICS,
    POSTES_SANS_BASE,
    AnalysisRequest,
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


class WorkbenchRequest(FilterPayload):
    question: Question = "evolution"
    measure: str = "reimbursed"
    time_axis: Literal["care", "payment"] = "care"
    display: Literal["raw", "change", "index"] = "raw"
    comparator: Comparator = "previous_period"
    reference: FilterPayload | None = None
    comparison_year_a: int | None = Field(default=None, ge=2000, le=2100)
    comparison_year_b: int | None = Field(default=None, ge=2000, le=2100)
    comparison_regions: list[int] = Field(default_factory=list)
    reference_measure: str | None = None
    reference_time_axis: Literal["care", "payment"] | None = None
    comparison_display: Literal["auto", "raw", "index"] = "auto"
    decomposition_basis: Literal["change", "total"] = "change"
    dimension: str = "auto"
    limit: int = Field(default=20, ge=5, le=100)


def _filter_data(payload: FilterPayload) -> dict[str, Any]:
    return {
        key: value
        for key, value in payload.model_dump().items()
        if key in FilterPayload.model_fields
    }


def _scope(payload: FilterPayload, **updates: Any) -> FilterPayload:
    return FilterPayload.model_validate({**_filter_data(payload), **updates})


def _metric_warnings(payload: FilterPayload, metric_key: str) -> list[str]:
    metric = _metric(metric_key)
    warnings: list[str] = []
    if metric_key == "copayment":
        if payload.grand_post in POSTES_SANS_BASE:
            raise ValueError(
                "Le ticket modérateur n’est pas calculable sur ce poste sans base de remboursement."
            )
        if not payload.grand_post and not payload.service_codes:
            warnings.append(
                "Les prestations en espèces et forfaitaires sans base de remboursement sont exclues du ticket modérateur."
            )
    if metric.requires_homogeneous_unit and len(payload.service_codes) != 1:
        raise ValueError(
            "Cette mesure par unité nécessite une prestation unique et précise, car les unités diffèrent entre prestations."
        )
    if metric.caveat:
        warnings.append(metric.caveat)
    return warnings


@lru_cache(maxsize=2)
def reliability_metadata(repo: QueryRepository) -> dict[str, Any]:
    if not repo.has_delays:
        return {
            "available": False,
            "status": "Indisponible",
            "consolidated_through": None,
            "latest_flow": None,
            "liquidation_observed_through": None,
            "thresholds": {},
            "curve": [],
        }

    maximum_rows = repo.query(
        "SELECT MAX(TRY_CAST(flx AS INTEGER)) AS latest_flow, MAX(soi_ann) AS latest_care_year FROM delays"
    )
    latest_flow = int(maximum_rows[0]["latest_flow"]) if maximum_rows and maximum_rows[0]["latest_flow"] else None
    latest_care_year = int(maximum_rows[0]["latest_care_year"]) if maximum_rows and maximum_rows[0]["latest_care_year"] else None
    if latest_flow is None or latest_care_year is None:
        return {
            "available": False,
            "status": "Indisponible",
            "consolidated_through": None,
            "latest_flow": None,
            "liquidation_observed_through": None,
            "thresholds": {},
            "curve": [],
        }

    rows = repo.query(
        """
        SELECT (flx // 100) * 12 + (flx % 100) - (soi_ann * 12 + soi_moi) AS delay,
               SUM(rem)::DOUBLE AS value
        FROM delays
        WHERE soi_ann <= ? AND rem IS NOT NULL
        GROUP BY 1 HAVING delay BETWEEN 0 AND 24
        ORDER BY 1
        """,
        [latest_care_year - 2],
    )
    total = sum(max(float(row["value"] or 0), 0) for row in rows)
    cumulative = 0.0
    curve: list[dict[str, Any]] = []
    thresholds: dict[str, int | None] = {"50": None, "90": None, "95": None, "97": None}
    for row in rows:
        cumulative += max(float(row["value"] or 0), 0)
        percentage = 100 * cumulative / total if total else 0.0
        delay = int(row["delay"])
        curve.append({"delay": delay, "label": f"M+{delay}", "value": percentage})
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
    }


def studio_metadata(repo: QueryRepository) -> dict[str, Any]:
    reliability = reliability_metadata(repo)
    return {
        "reliability": reliability,
        "semantic_version": "1.0",
        "analysis_questions": [
            {"key": "evolution", "label": "Évolution", "description": "Suivre un périmètre dans le temps"},
            {"key": "comparison", "label": "Comparaison", "description": "Comparer un périmètre à une référence"},
            {"key": "juxtaposition", "label": "Deux indicateurs", "description": "Comparer deux trajectoires sans calculer de faux écart"},
            {"key": "liquidation", "label": "Liquidation", "description": "Mesurer la maturité des remboursements"},
        ],
    }


def _aggregate(repo: QueryRepository, payload: FilterPayload, metric_key: str) -> float | None:
    metric = _metric(metric_key)
    where, params = cube_where(payload, exclude_base_less=metric_key == "copayment")
    rows = repo.query(
        f"SELECT ({metric.expression})::DOUBLE AS value FROM cube c LEFT JOIN transco t USING (prs_nat) WHERE {where}",
        params,
    )
    value = rows[0]["value"] if rows else None
    return float(value) if value is not None else None


def _annual(repo: QueryRepository, payload: FilterPayload, metric_key: str) -> list[dict[str, Any]]:
    metric = _metric(metric_key)
    where, params = cube_where(payload, exclude_base_less=metric_key == "copayment")
    rows = repo.query(
        f"""
        SELECT c.soi_ann AS x, ({metric.expression})::DOUBLE AS value
        FROM cube c LEFT JOIN transco t USING (prs_nat)
        WHERE {where}
        GROUP BY 1 ORDER BY 1
        """,
        params,
    )
    return [{"x": int(row["x"]), "y": float(row["value"] or 0)} for row in rows]


def _payment_annual(repo: QueryRepository, payload: FilterPayload) -> list[dict[str, Any]]:
    if not repo.has_delays:
        raise ValueError("Le cube des délais n’est pas disponible.")
    where, params = delay_where(payload, payment_axis=True)
    rows = repo.query(
        f"""
        SELECT d.flx // 100 AS x, SUM(d.rem)::DOUBLE AS value
        FROM delays d LEFT JOIN transco t USING (prs_nat)
        WHERE {where}
        GROUP BY 1 ORDER BY 1
        """,
        params,
    )
    return [{"x": int(row["x"]), "y": float(row["value"] or 0)} for row in rows]


def _transform_points(points: list[dict[str, Any]], display: str) -> tuple[list[dict[str, Any]], str]:
    if display == "raw" or not points:
        return points, "raw"
    if display == "index":
        base = float(points[0]["y"] or 0)
        return ([{"x": point["x"], "y": 100 * float(point["y"]) / base if base else 0}
                 for point in points], "index")
    transformed: list[dict[str, Any]] = []
    for previous, current in zip(points, points[1:]):
        reference = float(previous["y"] or 0)
        transformed.append({
            "x": current["x"],
            "y": 100 * (float(current["y"]) / reference - 1) if reference else 0,
        })
    return transformed, "percent"


def _reference_scopes(payload: WorkbenchRequest) -> tuple[FilterPayload, str, FilterPayload, str]:
    base = _scope(payload)
    if payload.comparator == "years":
        year_a = payload.comparison_year_a or base.end_year
        year_b = payload.comparison_year_b or year_a - 1
        if year_a == year_b:
            raise ValueError("Choisissez deux années différentes à comparer.")
        return (_scope(base, start_year=year_a, end_year=year_a), str(year_a),
                _scope(base, start_year=year_b, end_year=year_b), str(year_b))
    if payload.comparator == "women_men":
        return _scope(base, sexes=[2]), "Femmes", _scope(base, sexes=[1]), "Hommes"
    if payload.comparator == "ald":
        return _scope(base, ald=1), "ALD", _scope(base, ald=0), "Hors ALD"
    if payload.comparator == "region_france":
        if not base.regions:
            raise ValueError("Choisissez au moins une région pour la comparer à la France entière.")
        return base, "Territoire sélectionné", _scope(base, regions=[]), "France entière"
    if payload.comparator == "custom":
        if payload.reference is None:
            raise ValueError("Définissez le périmètre de référence B.")
        return base, "Périmètre A", payload.reference, "Périmètre B"
    current = _scope(base, start_year=base.end_year, end_year=base.end_year)
    reference = _scope(base, start_year=base.end_year - 1, end_year=base.end_year - 1)
    return current, str(current.end_year), reference, str(reference.end_year)


def _summary(value_a: float | None, value_b: float | None, label_a: str, label_b: str) -> dict[str, Any]:
    a = float(value_a or 0)
    b = float(value_b or 0)
    delta = a - b
    return {
        "label_a": label_a,
        "label_b": label_b,
        "value_a": a,
        "value_b": b,
        "delta": delta,
        "delta_pct": 100 * delta / abs(b) if b else None,
    }


def _table(columns: list[tuple[str, str, str]], rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "columns": [{"key": key, "label": label, "kind": kind} for key, label, kind in columns],
        "rows": rows,
    }


def _points_for_axis(repo: QueryRepository, scope: FilterPayload, measure: str,
                     time_axis: str) -> tuple[list[dict[str, Any]], list[str]]:
    warnings = _metric_warnings(scope, measure)
    if time_axis == "payment":
        if measure != "reimbursed":
            raise ValueError("En date de remboursement, seul le montant remboursé est disponible.")
        if scope.sexes or scope.ages or scope.regions or scope.insurances or scope.envelopes or scope.ald is not None:
            warnings.append("Les filtres de population ne s’appliquent pas au cube de liquidation.")
        warnings.append("Les montants sont regroupés selon l’année du remboursement.")
        return _payment_annual(repo, scope), warnings
    return _annual(repo, scope, measure), warnings


def _points_total(repo: QueryRepository, scope: FilterPayload, measure: str,
                  time_axis: str, points: list[dict[str, Any]]) -> float:
    metric = _metric(measure)
    if len(points) <= 1 or time_axis == "payment" or metric.additive:
        return sum(float(point["y"] or 0) for point in points)
    return float(_aggregate(repo, scope, measure) or 0)


def _evolution(repo: QueryRepository, payload: WorkbenchRequest, regions: dict[int, str]) -> dict[str, Any]:
    warnings = _metric_warnings(payload, payload.measure)
    metric = _metric(payload.measure)
    if payload.time_axis == "payment":
        if payload.measure != "reimbursed":
            raise ValueError("En date de remboursement, seul le montant remboursé est disponible.")
        if payload.sexes or payload.ages or payload.regions or payload.insurances or payload.envelopes or payload.ald is not None:
            warnings.append("Les filtres de population ne s’appliquent pas au cube de liquidation.")
        points = _payment_annual(repo, payload)
        warnings.append("Les montants sont regroupés selon l’année du remboursement.")
    else:
        points = _annual(repo, payload, payload.measure)
    points, transformed_unit = _transform_points(points, payload.display)
    unit = metric.kind if transformed_unit == "raw" else transformed_unit
    values = [float(point["y"]) for point in points]
    summary = _summary(values[-1] if values else None, values[-2] if len(values) > 1 else None,
                       str(points[-1]["x"]) if points else "—", str(points[-2]["x"]) if len(points) > 1 else "—")
    if payload.display != "raw":
        summary["delta_pct"] = None
    if payload.display == "raw":
        rows = [{"period": point["x"], "value": point["y"],
                 "change": (point["y"] - points[index - 1]["y"]) if index else None,
                 "change_pct": (100 * (point["y"] / points[index - 1]["y"] - 1)
                                if index and points[index - 1]["y"] else None)}
                for index, point in enumerate(points)]
        table = _table([
            ("period", "Période", "dimension"),
            ("value", metric.label, unit),
            ("change", "Écart absolu", unit),
            ("change_pct", "Écart relatif", "percent"),
        ], rows)
    else:
        value_label = "Évolution annuelle" if payload.display == "change" else "Indice base 100"
        table = _table([
            ("period", "Période", "dimension"),
            ("value", value_label, unit),
        ], [{"period": point["x"], "value": point["y"]} for point in points])
    return {
        "question": "evolution",
        "chart_type": "line",
        "title": f"Évolution · {metric.label}",
        "subtitle": "Date de remboursement" if payload.time_axis == "payment" else "Date de soins",
        "unit": unit,
        "series": [{"name": metric.label, "unit": unit, "points": points}],
        "bars": [],
        "summary": summary,
        "table": table,
        "warnings": warnings,
        "unknown_share": None,
    }


def _region_comparison(repo: QueryRepository, payload: WorkbenchRequest,
                       regions: dict[int, str]) -> dict[str, Any]:
    if payload.time_axis == "payment":
        raise ValueError("La comparaison régionale utilise la date de soins.")
    selected_regions = list(dict.fromkeys(payload.comparison_regions or payload.regions))
    if len(selected_regions) < 2:
        raise ValueError("Sélectionnez au moins deux régions à comparer.")
    metric = _metric(payload.measure)
    base = _scope(payload, regions=[])
    warnings = _metric_warnings(base, payload.measure)
    where, params = cube_where(base, exclude_base_less=payload.measure == "copayment")
    placeholders = ",".join("?" for _ in selected_regions)
    rows = repo.query(
        f"""
        SELECT c.soi_ann AS period, c.region AS region, ({metric.expression})::DOUBLE AS value
        FROM cube c LEFT JOIN transco t USING (prs_nat)
        WHERE {where} AND c.region IN ({placeholders})
        GROUP BY 1, 2 ORDER BY 1, 2
        """,
        [*params, *selected_regions],
    )
    by_region: dict[int, list[dict[str, Any]]] = {code: [] for code in selected_regions}
    by_period: dict[int, dict[str, Any]] = {}
    columns: list[tuple[str, str, str]] = [("period", "Année", "dimension")]
    for code in selected_regions:
        columns.append((f"region_{code}", regions.get(code, f"Région {code}"), metric.kind))
    for row in rows:
        code = int(row["region"])
        period = int(row["period"])
        value = float(row["value"] or 0)
        by_region.setdefault(code, []).append({"x": period, "y": value})
        by_period.setdefault(period, {"period": period})[f"region_{code}"] = value
    series = [{
        "name": regions.get(code, f"Région {code}"),
        "unit": metric.kind,
        "points": by_region.get(code, []),
    } for code in selected_regions]
    totals = [sum(point["y"] for point in item["points"]) for item in series]
    first = totals[0] if totals else 0.0
    second = totals[1] if len(totals) > 1 else 0.0
    return {
        "question": "comparison",
        "chart_type": "line",
        "title": f"Comparaison de {len(selected_regions)} régions",
        "subtitle": metric.label,
        "unit": metric.kind,
        "series": series,
        "bars": [],
        "summary": _summary(first, second, series[0]["name"], series[1]["name"]),
        "table": _table(columns, [by_period[key] for key in sorted(by_period)]),
        "warnings": warnings,
        "unknown_share": None,
    }


def _comparison(repo: QueryRepository, payload: WorkbenchRequest, regions: dict[int, str]) -> dict[str, Any]:
    if payload.comparator == "regions":
        return _region_comparison(repo, payload, regions)
    scope_a, label_a, scope_b, label_b = _reference_scopes(payload)
    measure_a = payload.measure
    if payload.comparator == "custom" and payload.reference_measure not in (None, measure_a):
        raise ValueError("Une comparaison utilise la même mesure pour A et B. Utilisez la mise en regard pour deux indicateurs différents.")
    if payload.comparator == "custom" and payload.reference_time_axis not in (None, payload.time_axis):
        raise ValueError("Une comparaison utilise le même référentiel temporel pour A et B.")
    measure_b = measure_a
    axis_a = payload.time_axis
    axis_b = axis_a
    if payload.comparator == "women_men" and (axis_a == "payment" or axis_b == "payment"):
        raise ValueError("La comparaison femmes / hommes utilise la date de soins.")
    metric_a = _metric(measure_a)
    metric_b = _metric(measure_b)
    points_a, warnings_a = _points_for_axis(repo, scope_a, measure_a, axis_a)
    points_b, warnings_b = _points_for_axis(repo, scope_b, measure_b, axis_b)
    warnings = list(dict.fromkeys([*warnings_a, *warnings_b]))
    value_a = _points_total(repo, scope_a, measure_a, axis_a, points_a)
    value_b = _points_total(repo, scope_b, measure_b, axis_b, points_b)
    summary = _summary(value_a, value_b, label_a, label_b)
    same_period = scope_a.start_year == scope_b.start_year and scope_a.end_year == scope_b.end_year
    same_measure = measure_a == measure_b and axis_a == axis_b
    line_chart = same_period or not same_measure
    series_names = (label_a, label_b) if same_measure else (
        f"{label_a} · {metric_a.label}", f"{label_b} · {metric_b.label}"
    )
    series = ([
        {"name": series_names[0], "unit": metric_a.kind, "points": points_a},
        {"name": series_names[1], "unit": metric_b.kind, "points": points_b},
    ] if line_chart else [])
    bars = ([] if line_chart else [
        {"label": label_a, "value": float(value_a or 0), "reference": None, "delta": None,
         "delta_pct": None, "contribution_pct": None},
        {"label": label_b, "value": float(value_b or 0), "reference": None, "delta": None,
         "delta_pct": None, "contribution_pct": None},
    ])
    by_x_a = {point["x"]: point["y"] for point in points_a}
    by_x_b = {point["x"]: point["y"] for point in points_b}
    periods = sorted(set(by_x_a) | set(by_x_b))
    rows = [{
        "period": period,
        "value_a": by_x_a.get(period),
        "value_b": by_x_b.get(period),
        "delta": ((by_x_a.get(period) or 0) - (by_x_b.get(period) or 0)),
        "delta_pct": (100 * ((by_x_a.get(period) or 0) - (by_x_b.get(period) or 0)) / abs(by_x_b[period])
                      if by_x_b.get(period) else None),
    } for period in periods]
    if not line_chart:
        rows = [{"period": "Total", "value_a": value_a, "value_b": value_b,
                 "delta": summary["delta"], "delta_pct": summary["delta_pct"]}]
    columns = [
        ("period", "Période", "dimension"),
        ("value_a", series_names[0], metric_a.kind),
        ("value_b", series_names[1], metric_b.kind),
    ]
    if same_measure:
        columns.extend([
            ("delta", "Écart absolu", metric_a.kind),
            ("delta_pct", "Écart relatif", "percent"),
        ])
    return {
        "question": "comparison",
        "chart_type": "line" if line_chart else "bar",
        "title": f"{label_a} / {label_b}",
        "subtitle": metric_a.label if same_measure else f"{metric_a.label} / {metric_b.label}",
        "unit": metric_a.kind,
        "series": series,
        "bars": bars,
        "summary": summary,
        "table": _table(columns, rows),
        "warnings": warnings,
        "unknown_share": None,
    }


def _index_points(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    base = next((float(point["y"]) for point in points if float(point["y"] or 0) != 0), 0.0)
    return [{"x": point["x"], "y": 100 * float(point["y"] or 0) / base if base else 0.0}
            for point in points]


def _juxtaposition(repo: QueryRepository, payload: WorkbenchRequest,
                   regions: dict[int, str]) -> dict[str, Any]:
    if payload.reference is None:
        raise ValueError("Définissez le périmètre B du second indicateur.")
    scope_a = _scope(payload)
    scope_b = payload.reference
    measure_a = payload.measure
    measure_b = payload.reference_measure or payload.measure
    axis_a = payload.time_axis
    axis_b = payload.reference_time_axis or payload.time_axis
    metric_a = _metric(measure_a)
    metric_b = _metric(measure_b)
    points_a, warnings_a = _points_for_axis(repo, scope_a, measure_a, axis_a)
    points_b, warnings_b = _points_for_axis(repo, scope_b, measure_b, axis_b)
    same_unit = metric_a.unit_key == metric_b.unit_key
    indexed = not same_unit and payload.comparison_display != "raw"
    display_a = _index_points(points_a) if indexed else points_a
    display_b = _index_points(points_b) if indexed else points_b
    raw_a = {point["x"]: point["y"] for point in points_a}
    raw_b = {point["x"]: point["y"] for point in points_b}
    shown_a = {point["x"]: point["y"] for point in display_a}
    shown_b = {point["x"]: point["y"] for point in display_b}
    periods = sorted(set(raw_a) | set(raw_b))
    value_a = _points_total(repo, scope_a, measure_a, axis_a, points_a)
    value_b = _points_total(repo, scope_b, measure_b, axis_b, points_b)
    summary = _summary(value_a, value_b, "Périmètre A", "Périmètre B")
    summary["delta"] = 0.0
    summary["delta_pct"] = None
    warnings = list(dict.fromkeys([*warnings_a, *warnings_b]))
    if indexed:
        warnings.append(
            "Les unités diffèrent : les séries sont ramenées à l’indice 100 pour comparer leur dynamique, pas leur niveau."
        )
    elif not same_unit:
        warnings.append(
            "Les valeurs réelles utilisent deux axes distincts. Comparez les niveaux avec prudence."
        )
    displayed_unit = "index" if indexed else metric_a.kind
    columns = [
        ("period", "Période", "dimension"),
        ("value_a", f"A · {metric_a.label}", metric_a.kind),
        ("value_b", f"B · {metric_b.label}", metric_b.kind),
    ]
    if indexed:
        columns.extend([
            ("index_a", "Indice A", "index"),
            ("index_b", "Indice B", "index"),
        ])
    return {
        "question": "juxtaposition",
        "chart_type": "line",
        "title": "Trajectoires des indicateurs A et B",
        "subtitle": f"{metric_a.label} / {metric_b.label}",
        "unit": displayed_unit,
        "series": [
            {
                "name": f"A · {metric_a.label}",
                "unit": "index" if indexed else metric_a.kind,
                "unit_key": "index" if indexed else metric_a.unit_key,
                "unit_label": "Indice base 100" if indexed else metric_a.unit_label,
                "points": display_a,
            },
            {
                "name": f"B · {metric_b.label}",
                "unit": "index" if indexed else metric_b.kind,
                "unit_key": "index" if indexed else metric_b.unit_key,
                "unit_label": "Indice base 100" if indexed else metric_b.unit_label,
                "points": display_b,
            },
        ],
        "bars": [],
        "summary": summary,
        "table": _table(columns, [{
            "period": period,
            "value_a": raw_a.get(period),
            "value_b": raw_b.get(period),
            "index_a": shown_a.get(period),
            "index_b": shown_b.get(period),
        } for period in periods]),
        "warnings": warnings,
        "unknown_share": None,
        "comparison_display": "index" if indexed else "raw",
    }


def _calculator(repo: QueryRepository, payload: WorkbenchRequest,
                regions: dict[int, str]) -> dict[str, Any]:
    metric = _metric(payload.measure)
    warnings = _metric_warnings(payload, payload.measure)
    dimension = payload.dimension if payload.dimension != "auto" else "year"
    if dimension not in DIMENSIONS:
        raise ValueError("Choisissez une dimension disponible pour le calculateur.")

    if payload.time_axis == "payment":
        if dimension != "year":
            raise ValueError("En date de remboursement, le calculateur est disponible par année uniquement.")
        if payload.measure != "reimbursed":
            raise ValueError("En date de remboursement, seul le montant remboursé est disponible.")
        points = _payment_annual(repo, payload)
        aggregate = sum(float(point["y"]) for point in points)
        warnings.append("Les montants sont regroupés selon l’année du remboursement.")
        rows = [{"label": point["x"], "value": point["y"]} for point in points]
    elif dimension == "year":
        points = _annual(repo, payload, payload.measure)
        aggregate = _aggregate(repo, payload, payload.measure)
        rows = [{"label": point["x"], "value": point["y"]} for point in points]
    else:
        points = []
        grouped = _group_values(repo, payload, payload.measure, dimension, regions)
        rows = [{"label": label, "value": value} for label, value in grouped.items()]
        rows.sort(key=lambda row: abs(float(row["value"] or 0)), reverse=True)
        aggregate = _aggregate(repo, payload, payload.measure)

    visible = rows[:payload.limit]
    dimension_label = DIMENSIONS[dimension][0]
    return {
        "question": "calculator",
        "chart_type": "line" if dimension == "year" else "bar",
        "title": f"Calculs par {dimension_label.lower()}",
        "subtitle": metric.label,
        "unit": metric.kind,
        "unit_key": metric.unit_key,
        "unit_label": metric.unit_label,
        "series": [{
            "name": metric.label,
            "unit": metric.kind,
            "unit_key": metric.unit_key,
            "unit_label": metric.unit_label,
            "points": points,
        }] if dimension == "year" else [],
        "bars": [{
            "label": str(row["label"]),
            "value": float(row["value"] or 0),
            "reference": None,
            "delta": None,
            "delta_pct": None,
            "contribution_pct": None,
        } for row in visible],
        "summary": _summary(aggregate, None, "Valeur agrégée", "—"),
        "table": _table([
            ("label", dimension_label, "dimension"),
            ("value", metric.label, metric.kind),
        ], rows),
        "warnings": warnings,
        "unknown_share": _unknown_share(repo, payload),
        "dimension": dimension,
        "additive": metric.additive,
    }


def _liquidation(repo: QueryRepository, payload: WorkbenchRequest) -> dict[str, Any]:
    if not repo.has_delays:
        raise ValueError("Le cube des délais n’est pas disponible.")

    horizon = 24
    reliability = reliability_metadata(repo)
    latest_flow = reliability.get("latest_flow")
    if latest_flow is None:
        raise ValueError("Le dernier mois de remboursement disponible n’est pas identifiable.")

    available_month = (int(latest_flow) // 100) * 12 + (int(latest_flow) % 100)
    eligible_through = (available_month - 12 - horizon) // 12
    effective_end = min(payload.end_year, eligible_through)
    if payload.start_year > effective_end:
        raise ValueError(
            f"La période choisie n’a pas encore 24 mois de recul. "
            f"Sélectionnez une année de soins au plus tard égale à {eligible_through}."
        )

    scope = _scope(payload, end_year=effective_end)
    where, params = delay_where(scope)
    rows = repo.query(
        f"""
        SELECT d.soi_ann AS care_year,
               (d.flx // 100) * 12 + (d.flx % 100)
                 - (d.soi_ann * 12 + d.soi_moi) AS delay,
               SUM(d.rem)::DOUBLE AS value
        FROM delays d LEFT JOIN transco t USING (prs_nat)
        WHERE {where}
        GROUP BY 1, 2
        HAVING delay BETWEEN 0 AND ?
        ORDER BY 1, 2
        """,
        [*params, horizon],
    )
    if not rows:
        raise ValueError("Aucune donnée de liquidation ne correspond au périmètre choisi.")

    years = sorted({int(row["care_year"]) for row in rows})
    increments: dict[int, dict[int, float]] = {year: {delay: 0.0 for delay in range(horizon + 1)}
                                               for year in years}
    for row in rows:
        increments[int(row["care_year"])][int(row["delay"])] = float(row["value"] or 0)

    series: list[dict[str, Any]] = []
    cumulative_by_year: dict[int, dict[int, float]] = {}
    for year in years:
        total = sum(increments[year].values())
        cumulative = 0.0
        cumulative_by_year[year] = {}
        points: list[dict[str, Any]] = []
        for delay in range(horizon + 1):
            cumulative += increments[year][delay]
            percentage = 100 * cumulative / total if total else 0.0
            cumulative_by_year[year][delay] = percentage
            points.append({"x": delay, "y": percentage})
        series.append({"name": str(year), "unit": "percent", "points": points})

    pooled = {delay: sum(increments[year][delay] for year in years) for delay in range(horizon + 1)}
    pooled_total = sum(pooled.values())
    pooled_cumulative = 0.0
    pooled_curve: dict[int, float] = {}
    for delay in range(horizon + 1):
        pooled_cumulative += pooled[delay]
        pooled_curve[delay] = 100 * pooled_cumulative / pooled_total if pooled_total else 0.0
    delay_95 = next((delay for delay, value in pooled_curve.items() if value >= 95), None)

    kpis = [
        {
            "key": "m3",
            "label": "Liquidé à 3 mois",
            "value": pooled_curve.get(3),
            "kind": "percent",
            "detail": "Part cumulée de M+0 à M+3",
        },
        {
            "key": "m12",
            "label": "Liquidé à 12 mois",
            "value": pooled_curve.get(12),
            "kind": "percent",
            "detail": "Part cumulée de M+0 à M+12",
        },
        {
            "key": "delay_95",
            "label": "Délai pour atteindre 95 %",
            "value": delay_95,
            "kind": "delay",
            "detail": "Mois après les soins",
        },
    ]
    table_columns: list[tuple[str, str, str]] = [("delay", "Mois après les soins", "dimension")]
    table_columns.extend((f"year_{year}", str(year), "percent") for year in years)
    table_rows = [
        {
            "delay": f"M+{delay}",
            **{f"year_{year}": cumulative_by_year[year][delay] for year in years},
        }
        for delay in range(horizon + 1)
    ]
    warnings = [
        "Courbes observées sans extrapolation, calculées sur un horizon commun de 24 mois.",
        "Le dénominateur est le montant remboursé dans les 24 mois, et non un montant ultime projeté.",
    ]
    if payload.end_year > effective_end:
        warnings.append(
            f"Les années postérieures à {effective_end} sont exclues : elles ne disposent pas encore de 24 mois de recul."
        )
    if payload.sexes or payload.ages or payload.regions or payload.insurances or payload.envelopes or payload.ald is not None:
        warnings.append("Les filtres de population ne s’appliquent pas au cube de liquidation.")

    return {
        "question": "liquidation",
        "chart_type": "line",
        "title": "Délais de liquidation",
        "subtitle": f"Années de soins {years[0]}–{years[-1]} · remboursements observés à 24 mois",
        "unit": "percent",
        "series": series,
        "bars": [],
        "summary": _summary(
            pooled_curve.get(12),
            pooled_curve.get(3),
            "Liquidé à 12 mois",
            "Liquidé à 3 mois",
        ),
        "table": _table(table_columns, table_rows),
        "warnings": warnings,
        "unknown_share": None,
        "liquidation": {
            "horizon": horizon,
            "eligible_through": effective_end,
            "years": years,
            "kpis": kpis,
            "definition": "Part des remboursements d’une année de soins connue après n mois, sur un horizon observé de 24 mois.",
        },
    }


def _group_values(repo: QueryRepository, payload: FilterPayload, metric_key: str,
                  dimension: str, regions: dict[int, str]) -> dict[str, float]:
    metric = _metric(metric_key)
    _, expression = _dimension_expression(dimension, service_label=True)
    group_expression = "c.prs_nat" if dimension == "service" else expression
    where, params = cube_where(payload, exclude_base_less=metric_key == "copayment")
    rows = repo.query(
        f"""
        SELECT {expression} AS label, ({metric.expression})::DOUBLE AS value
        FROM cube c LEFT JOIN transco t USING (prs_nat)
        WHERE {where}
        GROUP BY {group_expression}
        HAVING ({metric.expression}) IS NOT NULL
        """,
        params,
    )
    return {
        _mapped_label(dimension, row["label"], regions): float(row["value"] or 0)
        for row in rows
    }


def _automatic_dimension(payload: WorkbenchRequest) -> str:
    if payload.dimension != "auto":
        return payload.dimension
    if payload.sub_post:
        return "service"
    if payload.post:
        return "sub_post"
    if payload.grand_post:
        return "post"
    return "grand_post"


def _decomposition(repo: QueryRepository, payload: WorkbenchRequest, regions: dict[int, str]) -> dict[str, Any]:
    warnings = _metric_warnings(payload, payload.measure)
    if payload.time_axis == "payment":
        raise ValueError("La décomposition utilise actuellement la date de soins.")
    metric = _metric(payload.measure)
    dimension = _automatic_dimension(payload)
    dimension_label = DIMENSIONS[dimension][0]

    if payload.decomposition_basis == "total":
        scope_a = _scope(payload)
        label_a = f"{scope_a.start_year}–{scope_a.end_year}"
        values_a = _group_values(repo, scope_a, payload.measure, dimension, regions)
        values_b: dict[str, float] = {}
        label_b = "Total"
    else:
        if payload.comparator == "previous_period":
            scope_a = _scope(payload, start_year=payload.end_year, end_year=payload.end_year)
            scope_b = _scope(payload, start_year=payload.end_year - 1, end_year=payload.end_year - 1)
            label_a, label_b = str(payload.end_year), str(payload.end_year - 1)
        else:
            scope_a, label_a, scope_b, label_b = _reference_scopes(payload)
        values_a = _group_values(repo, scope_a, payload.measure, dimension, regions)
        values_b = _group_values(repo, scope_b, payload.measure, dimension, regions)

    labels = set(values_a) | set(values_b)
    rows: list[dict[str, Any]] = []
    total_delta = sum(values_a.values()) - sum(values_b.values())
    total_a = sum(values_a.values())
    for label in labels:
        current = values_a.get(label, 0.0)
        reference = values_b.get(label, 0.0)
        delta = current - reference
        rows.append({
            "label": label,
            "value": current,
            "reference": reference if payload.decomposition_basis == "change" else None,
            "delta": delta if payload.decomposition_basis == "change" else current,
            "delta_pct": (100 * delta / abs(reference) if reference else None)
                         if payload.decomposition_basis == "change" else None,
            "contribution_pct": (100 * delta / total_delta if total_delta else None)
                                if payload.decomposition_basis == "change" else
                                (100 * current / total_a if total_a else None),
        })
    sort_key = "delta" if payload.decomposition_basis == "change" else "value"
    rows.sort(key=lambda row: abs(float(row[sort_key] or 0)), reverse=True)

    visible = rows[:payload.limit]
    hidden = rows[payload.limit:]
    if hidden:
        visible.append({
            "label": "Autres",
            "value": sum(float(row["value"] or 0) for row in hidden),
            "reference": sum(float(row["reference"] or 0) for row in hidden),
            "delta": sum(float(row["delta"] or 0) for row in hidden),
            "delta_pct": None,
            "contribution_pct": sum(float(row["contribution_pct"] or 0) for row in hidden),
        })
    bars = [{**row, "value": row["delta"] if payload.decomposition_basis == "change" else row["value"]}
            for row in visible]
    value_a = sum(values_a.values())
    value_b = sum(values_b.values()) if payload.decomposition_basis == "change" else 0.0
    return {
        "question": "decomposition",
        "chart_type": "bar",
        "title": (f"Moteurs de l’écart par {dimension_label.lower()}"
                  if payload.decomposition_basis == "change"
                  else f"Structure par {dimension_label.lower()}"),
        "subtitle": f"{label_a} comparé à {label_b}" if payload.decomposition_basis == "change" else label_a,
        "unit": metric.kind,
        "series": [],
        "bars": bars,
        "summary": _summary(value_a, value_b, label_a, label_b),
        "table": _table([
            ("label", dimension_label, "dimension"),
            ("value", label_a, metric.kind),
            ("reference", label_b, metric.kind),
            ("delta", "Contribution en valeur", metric.kind),
            ("delta_pct", "Évolution", "percent"),
            ("contribution_pct", "Part de l’écart", "percent"),
        ], rows),
        "warnings": warnings,
        "unknown_share": _unknown_share(repo, payload),
        "dimension": dimension,
    }


def run_workbench(repo: QueryRepository, payload: WorkbenchRequest, regions: dict[int, str]) -> dict[str, Any]:
    if payload.question == "evolution":
        return _evolution(repo, payload, regions)
    if payload.question == "comparison":
        return _comparison(repo, payload, regions)
    if payload.question == "juxtaposition":
        return _juxtaposition(repo, payload, regions)
    if payload.question == "liquidation":
        return _liquidation(repo, payload)
    if payload.question == "calculator":
        return _calculator(repo, payload, regions)
    return _decomposition(repo, payload, regions)


def panorama(repo: QueryRepository, start_year: int, end_year: int,
             grand_post: str | None, region: int | None,
             reference_year: int | None = None, measure: str = "reimbursed") -> dict[str, Any]:
    if start_year > end_year:
        raise ValueError("La période sélectionnée est invalide.")
    if measure not in ("reimbursed", "expense"):
        raise ValueError("Le Panorama permet de lire les remboursements ou les dépenses.")
    reference_year = reference_year if reference_year is not None else end_year - 1
    if reference_year == end_year:
        raise ValueError("L’année de référence doit être différente de l’année analysée.")
    filters = FilterPayload(
        start_year=min(start_year, reference_year),
        end_year=max(end_year, reference_year),
        grand_post=grand_post,
        regions=[region] if region is not None else [],
    )
    annual_where, annual_params = cube_where(filters)
    annual_rows = repo.query(
        f"""
        SELECT c.soi_ann AS year,
               SUM(c.rem)::DOUBLE AS reimbursed,
               SUM(c.dep)::DOUBLE AS expense,
               SUM(c.qte)::DOUBLE AS quantity,
               (SUM(c.rem) / NULLIF(SUM(c.qte), 0))::DOUBLE AS average_reimbursed,
               (SUM(c.dep) / NULLIF(SUM(c.qte), 0))::DOUBLE AS average_expense,
               (SUM(c.dep) - SUM(c.rem))::DOUBLE AS out_of_pocket,
               (100.0 * SUM(c.rem) / NULLIF(SUM(c.dep), 0))::DOUBLE AS coverage
        FROM cube c LEFT JOIN transco t USING (prs_nat)
        WHERE {annual_where}
        GROUP BY 1 ORDER BY 1
        """,
        annual_params,
    )
    all_annual = [{key: (int(value) if key == "year" else float(value or 0)) for key, value in row.items()}
                  for row in annual_rows]
    annual = [row for row in all_annual if start_year <= row["year"] <= end_year]
    annual_by_year = {row["year"]: row for row in all_annual}
    current_annual = annual_by_year.get(end_year, {})
    reference_annual = annual_by_year.get(reference_year, {})

    dimension = "post" if grand_post else "grand_post"
    dimension_label = DIMENSIONS[dimension][0]
    _, dimension_expression = _dimension_expression(dimension, service_label=True)
    group_expression = "c.prs_nat" if dimension == "service" else dimension_expression
    group_where, group_params = cube_where(filters)
    group_rows = repo.query(
        f"""
        SELECT c.soi_ann AS year, {dimension_expression} AS label,
               SUM(c.rem)::DOUBLE AS reimbursed,
               SUM(c.dep)::DOUBLE AS expense
        FROM cube c LEFT JOIN transco t USING (prs_nat)
        WHERE {group_where} AND c.soi_ann IN (?, ?)
        GROUP BY c.soi_ann, {group_expression}
        ORDER BY 1
        """,
        [*group_params, end_year, reference_year],
    )

    grouped: dict[str, dict[int, dict[str, float]]] = {"reimbursed": {}, "expense": {}}
    for row in group_rows:
        label = _mapped_label(dimension, row["label"], {})
        year = int(row["year"])
        for key in grouped:
            grouped[key].setdefault(year, {})[label] = float(row[key] or 0)

    def driver_rows(metric_key: str) -> list[dict[str, Any]]:
        current = grouped[metric_key].get(end_year, {})
        reference = grouped[metric_key].get(reference_year, {})
        total_delta = sum(current.values()) - sum(reference.values())
        result = []
        for label in set(current) | set(reference):
            value = current.get(label, 0.0)
            reference_value = reference.get(label, 0.0)
            delta = value - reference_value
            result.append({
                "label": label,
                "value": value,
                "reference": reference_value,
                "delta": delta,
                "delta_pct": 100 * delta / abs(reference_value) if reference_value else None,
                "contribution_pct": 100 * delta / total_delta if total_delta else None,
                "filter_key": dimension,
            })
        result.sort(key=lambda item: abs(float(item["delta"])), reverse=True)
        hidden = result[10:]
        result = result[:10]
        if hidden:
            hidden_value = sum(float(item["value"] or 0) for item in hidden)
            hidden_reference = sum(float(item["reference"] or 0) for item in hidden)
            hidden_delta = sum(float(item["delta"] or 0) for item in hidden)
            result.append({
                "label": "Autres contributions",
                "value": hidden_value,
                "reference": hidden_reference,
                "delta": hidden_delta,
                "delta_pct": 100 * hidden_delta / abs(hidden_reference) if hidden_reference else None,
                "contribution_pct": 100 * hidden_delta / total_delta if total_delta else None,
                "filter_key": "",
            })
        return result

    reimbursement_drivers = driver_rows("reimbursed")
    expense_drivers = driver_rows("expense")
    selected_drivers = reimbursement_drivers if measure == "reimbursed" else expense_drivers

    kpis = []
    for key in ("reimbursed", "expense"):
        metric = _metric(key)
        comparison = _summary(current_annual.get(key), reference_annual.get(key), str(end_year), str(reference_year))
        kpis.append({
            "key": key,
            "type": "metric",
            "label": metric.label,
            "kind": metric.kind,
            "value": comparison["value_a"],
            "reference": comparison["value_b"],
            "delta": comparison["delta"],
            "delta_pct": comparison["delta_pct"],
            "definition": metric.definition,
        })
    for key, label, values in (
        ("reimbursed_driver", "Moteur des remboursements", reimbursement_drivers),
        ("expense_driver", "Moteur des dépenses", expense_drivers),
    ):
        lead = values[0] if values else None
        kpis.append({
            "key": key,
            "type": "driver",
            "label": label,
            "text": lead["label"] if lead else "—",
            "kind": "money",
            "value": lead["delta"] if lead else None,
            "reference": None,
            "delta": lead["delta"] if lead else None,
            "delta_pct": lead["contribution_pct"] if lead else None,
            "definition": f"Premier {dimension_label.lower()} contributeur en valeur absolue.",
        })

    current_by_group = grouped[measure].get(end_year, {})
    total_current = sum(current_by_group.values())
    concentration_rows = sorted(current_by_group.items(), key=lambda item: item[1], reverse=True)
    top_five = concentration_rows[:5]
    others = sum(value for _, value in concentration_rows[5:])
    concentration = []
    cumulative = 0.0
    for label, value in top_five:
        share = 100 * value / total_current if total_current else 0.0
        cumulative += share
        concentration.append({"label": label, "value": value, "share": share, "cumulative_share": cumulative})
    if others:
        share = 100 * others / total_current if total_current else 0.0
        concentration.append({"label": "Autres", "value": others, "share": share, "cumulative_share": 100.0})

    return {
        "context": {
            "start_year": start_year,
            "end_year": end_year,
            "reference_year": reference_year,
            "grand_post": grand_post,
            "region": region,
            "measure": measure,
            "measure_label": _metric(measure).label,
            "dimension": dimension,
            "dimension_label": dimension_label,
        },
        "facts": [],
        "kpis": kpis,
        "annual": annual,
        "drivers": selected_drivers,
        "concentration": concentration,
        "reliability": reliability_metadata(repo),
        "unknown_share": None,
    }


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
    measures = [{
        "key": metric.key,
        "label": metric.label,
        "family": metric.family,
        "kind": metric.kind,
        "definition": metric.definition,
        "formula": metric.formula,
        "caveat": metric.caveat,
        "requires_homogeneous_unit": metric.requires_homogeneous_unit,
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
        "reliability": reliability,
        "measures": measures,
        "dimensions": [{"key": key, "label": label} for key, (label, _) in DIMENSIONS.items()],
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
        ],
    }


def legacy_payload(payload: WorkbenchRequest) -> AnalysisRequest:
    """Kept for explicit compatibility during the transition."""
    return AnalysisRequest(**_filter_data(payload), mode="evolution", measure=payload.measure,
                           time_axis=payload.time_axis)
