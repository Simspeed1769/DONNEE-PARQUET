"""La lecture des années en date de règlement AMO, sans extrapolation.

Le cube principal date chaque dépense au soin. Celui des règlements
(`cube_reglement.parquet`) la date au paiement, avec les mêmes mesures et les
mêmes dimensions : dépense présentée, part AMO et reste après AMO deviennent
donc lisibles sur cet axe, et les filtres de population s'y appliquent.

Sans ce cube, la lecture retombe sur le cube des délais, qui ne porte que le
remboursement : les autres mesures sont alors déclarées indisponibles plutôt
que devinées.
"""
from typing import Any

from .analysis import METRICS, FilterPayload, QueryRepository, cube_where, delay_where

# Les quatre mesures qui font sens sur un exercice de paiement. Les volumes en
# sont exclus : une quantité n'a pas d'unité commune entre prestations, et une
# moyenne par unité n'en hériterait pas davantage.
MEASURES = ("reimbursed", "expense", "coverage", "out_of_pocket")


def _measure_cards() -> list[dict[str, Any]]:
    return [{
        "key": key,
        "label": METRICS[key].label,
        "kind": METRICS[key].kind,
        "definition": METRICS[key].definition,
        "formula": METRICS[key].formula,
        "caveat": METRICS[key].caveat,
    } for key in MEASURES]


def _flow_months(repo: QueryRepository) -> tuple[dict[int, int], int | None]:
    """Les mois de flux observés par année, et le dernier d'entre eux."""
    if not repo.has_delays:
        return {}, None
    flows = repo.query("SELECT DISTINCT flx FROM delays ORDER BY flx", [])
    months: dict[int, set[int]] = {}
    for row in flows:
        if row["flx"] is not None:
            year, month = divmod(int(row["flx"]), 100)
            if 1 <= month <= 12:
                months.setdefault(year, set()).add(month)
    latest = max((int(row["flx"]) for row in flows if row["flx"] is not None), default=None)
    return {year: len(values) for year, values in months.items()}, latest


def time_basis(repo: QueryRepository, payload: FilterPayload) -> dict[str, Any]:
    if payload.start_year > payload.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    if not (repo.has_settlement or repo.has_delays):
        raise ValueError("Les données en date de remboursement ne sont pas disponibles.")
    months, latest = _flow_months(repo)
    warnings = [
        "Année de règlement AMO : paiements enregistrés pendant l’année, toutes années de soins disponibles "
        "confondues. Ce n’est pas l’année comptable de la complémentaire.",
        "Un écart entre cette lecture et l’année de soins ne mesure pas le ROC : DAMIR ne contient ni les "
        "règlements des complémentaires ni leurs provisions.",
    ]

    if repo.has_settlement:
        where, params = cube_where(payload, year_column="c.flx_ann", ignore_facility=True)
        selects = ", ".join(f"{METRICS[key].expression}::DOUBLE AS {key}" for key in MEASURES)
        rows = repo.query(
            f"""SELECT c.flx_ann AS year, {selects}
                FROM settlement c LEFT JOIN transco t USING (prs_nat)
                WHERE {where} GROUP BY 1""", params)
        values = {int(row["year"]): row for row in rows}
        available = list(MEASURES)
    else:
        # Repli : le cube des délais ne porte que le remboursement.
        where, params = delay_where(payload, payment_axis=True)
        rows = repo.query(
            f"""SELECT d.flx // 100 AS year, SUM(d.rem)::DOUBLE AS reimbursed
                FROM delays d LEFT JOIN transco t USING (prs_nat)
                WHERE {where} GROUP BY 1""", params)
        values = {int(row["year"]): row for row in rows}
        available = ["reimbursed"]
        warnings.append(
            "Seul le montant remboursé existe sur cet axe : le cube des règlements, qui porte la dépense, "
            "n’est pas installé."
        )

    return {
        "available_measures": available,
        "measures": [card for card in _measure_cards() if card["key"] in available],
        "latest_flow": latest,
        "rows": [{
            "year": year,
            "payment_months": months.get(year, 12 if repo.has_settlement else 0),
            **{key: (values.get(year, {}).get(key) if key in available else None) for key in MEASURES},
        } for year in range(payload.start_year, payload.end_year + 1)],
        "warnings": warnings,
    }
