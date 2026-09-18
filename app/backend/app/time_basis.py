"""Deux datations des remboursements AMO, sans extrapolation."""
from typing import Any

from .analysis import FilterPayload, QueryRepository, cube_where, delay_where


def time_basis(repo: QueryRepository, payload: FilterPayload) -> dict[str, Any]:
    if payload.start_year > payload.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    if not repo.has_delays:
        raise ValueError("Les données en date de remboursement ne sont pas disponibles.")
    if any((payload.regions, payload.ages, payload.sexes, payload.insurances,
            payload.envelopes)) or payload.ald is not None:
        raise ValueError("La comparaison des dates exige le périmètre national, tous âges, "
                         "sexes, assurances, enveloppes et motifs d’exonération.")
    care_where, care_params = cube_where(payload)
    payment_where, payment_params = delay_where(payload, payment_axis=True)
    care = repo.query(
        f"""SELECT c.soi_ann AS year, SUM(c.rem)::DOUBLE AS value
            FROM cube c LEFT JOIN transco t USING (prs_nat)
            WHERE {care_where} GROUP BY 1""", care_params)
    payment = repo.query(
        f"""SELECT d.flx // 100 AS year, SUM(d.rem)::DOUBLE AS value
            FROM delays d LEFT JOIN transco t USING (prs_nat)
            WHERE {payment_where} GROUP BY 1""", payment_params)
    # Disponibilité des fichiers mensuels, indépendante de la prestation choisie.
    flows = repo.query("SELECT DISTINCT flx FROM delays ORDER BY flx", [])
    months: dict[int, set[int]] = {}
    for row in flows:
        if row["flx"] is not None:
            year, month = divmod(int(row["flx"]), 100)
            if 1 <= month <= 12:
                months.setdefault(year, set()).add(month)
    care_values = {int(row["year"]): row["value"] for row in care}
    payment_values = {int(row["year"]): row["value"] for row in payment}
    latest = max((int(row["flx"]) for row in flows if row["flx"] is not None), default=None)
    return {
        "latest_flow": latest,
        "rows": [{"year": year, "care": care_values.get(year),
                  "payment": payment_values.get(year),
                  "payment_months": len(months.get(year, set()))}
                 for year in range(payload.start_year, payload.end_year + 1)],
        "warnings": [
            "Survenance : remboursements des soins de l’année, connus à la date d’arrêté. "
            "Les années récentes restent incomplètes, sans redressement.",
            "Règlement AMO : paiements enregistrés pendant l’année, toutes années de soins disponibles confondues. "
            "Ce n’est pas l’année comptable de la complémentaire.",
            "Un écart entre les deux courbes ne mesure pas le ROC : DAMIR ne contient ni les règlements "
            "des complémentaires ni leurs provisions. Les filtres de population ne sont pas disponibles sur cet axe.",
        ],
    }
