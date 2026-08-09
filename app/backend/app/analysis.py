from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal, Protocol

from pydantic import BaseModel, Field


class QueryRepository(Protocol):
    has_delays: bool

    def query(self, sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]: ...


SEXES = {1: "Hommes", 2: "Femmes", 0: "Non renseigné", 9: "Inconnu"}
AGES = {
    0: "0–19 ans", 20: "20–29 ans", 30: "30–39 ans", 40: "40–49 ans",
    50: "50–59 ans", 60: "60–69 ans", 70: "70–79 ans",
    80: "80 ans et plus", 99: "Âge inconnu",
}
INSURANCES = {
    0: "Sans objet", 10: "Maladie", 11: "Maladie — navigation > 6 mois",
    12: "Maladie — navigation < 6 mois", 22: "Soins aux invalides de guerre",
    30: "Maternité", 40: "AT-MP", 50: "Décès",
    70: "Prestations supplémentaires", 80: "Invalidité",
    90: "Prévention maladie", 99: "Inconnue",
}
ENVELOPES = {
    0: "Non pris en charge par le RG", 1: "Soins de ville",
    2: "Hospitalisation & médico-social", 3: "Prestations hors ONDAM",
    4: "Prévention", 5: "FNAS", 7: "C2S / AME / ACS",
    8: "Alsace-Moselle", 9: "Inconnue", 98: "Sans objet",
}


POSTES_SANS_BASE = (
    "Indemnités Journalières",
    "Invalidité, Décès & Rentes",
    "Rémunérations forfaitaires des PS",
    "Maternité & Adoption (forfaits)",
    "Non remboursable",
    "Codes réservés",
)


@dataclass(frozen=True)
class Metric:
    key: str
    label: str
    expression: str
    kind: Literal["money", "quantity", "percent"]
    family: str
    definition: str
    formula: str
    caveat: str | None = None
    requires_homogeneous_unit: bool = False
    additive: bool = True

    @property
    def unit_key(self) -> str:
        if self.key in {"average_reimbursed", "average_expense"}:
            return "eur_per_unit"
        if self.kind == "money":
            return "eur_total"
        if self.kind == "quantity":
            return "service_unit"
        return "percent"

    @property
    def unit_label(self) -> str:
        return {
            "eur_per_unit": "€/unité",
            "eur_total": "€",
            "service_unit": "unités",
            "percent": "%",
        }[self.unit_key]


METRICS = {
    metric.key: metric
    for metric in (
        Metric("reimbursed", "Montant remboursé", "SUM(c.rem)", "money", "Dépenses",
               "Montant pris en charge par l’Assurance Maladie obligatoire.", "Somme des remboursements"),
        Metric("expense", "Dépense présentée", "SUM(c.dep)", "money", "Dépenses",
               "Dépense présentée avant remboursement de l’Assurance Maladie obligatoire.", "Somme des dépenses"),
        Metric("out_of_pocket", "Reste à charge après AMO", "SUM(c.dep) - SUM(c.rem)", "money", "Dépenses",
               "Part de la dépense restant après remboursement AMO, avant intervention éventuelle d’une complémentaire.",
               "Dépense présentée − montant remboursé",
               "Ne correspond pas au reste à charge final de l’assuré après complémentaire."),
        Metric("copayment", "Ticket modérateur", "SUM(c.bse_ref) - SUM(c.rem_ref)", "money", "Avancé",
               "Écart entre la base de remboursement de référence et le remboursement de référence.",
               "Base de remboursement de référence − remboursement de référence",
               "Non pertinent pour les prestations en espèces ou forfaitaires sans base de remboursement."),
        Metric("excess_fees", "Dépassements", "SUM(c.depas)", "money", "Dépenses",
               "Montants facturés au-delà de la base de remboursement.", "Somme des dépassements"),
        Metric("quantity", "Volume de la prestation", "SUM(c.qte)", "quantity", "Activité",
               "Volume déclaré dans l’unité propre à la prestation.", "Somme des quantités",
               "Le total peut agréger des unités différentes lorsque plusieurs prestations sont réunies."),
        Metric("average_reimbursed", "Remboursement moyen par unité",
               "SUM(c.rem) / NULLIF(SUM(c.qte), 0)", "money", "Montants moyens",
               "Montant remboursé rapporté au volume de la prestation sélectionnée.",
               "Somme des remboursements / somme des quantités",
               "Ne correspond ni à un coût par patient ni nécessairement à un tarif ; une moyenne globale dépend du mix de prestations.", False, False),
        Metric("average_expense", "Dépense moyenne par unité",
               "SUM(c.dep) / NULLIF(SUM(c.qte), 0)", "money", "Montants moyens",
               "Dépense présentée rapportée au volume de la prestation sélectionnée.",
               "Somme des dépenses / somme des quantités",
               "Ne correspond ni à un coût par patient ni nécessairement à un tarif ; une moyenne globale dépend du mix de prestations.", False, False),
        Metric("coverage", "Taux de prise en charge AMO", "100.0 * SUM(c.rem) / NULLIF(SUM(c.dep), 0)", "percent", "Prise en charge",
               "Part de la dépense présentée remboursée par l’Assurance Maladie obligatoire.",
               "100 × remboursements / dépenses",
               "Une évolution agrégée peut provenir d’un changement de structure des prestations.", False, False),
        Metric("negative", "Régularisations négatives", "SUM(c.rem_neg)", "money", "Avancé",
               "Montants de remboursements enregistrés négativement.", "Somme des remboursements négatifs"),
        Metric("gross_reimbursed", "Remboursé hors régularisations", "SUM(c.rem) - SUM(c.rem_neg)", "money", "Avancé",
               "Montant remboursé neutralisant les régularisations négatives.",
               "Montant remboursé − régularisations négatives"),
        Metric("negative_share", "Part des régularisations", "-100.0 * SUM(c.rem_neg) / NULLIF(SUM(c.rem) - SUM(c.rem_neg), 0)", "percent", "Avancé",
               "Poids des régularisations négatives dans le remboursement hors régularisations.",
               "−100 × régularisations / remboursement hors régularisations", None, False, False),
    )
}


DIMENSIONS = {
    "year": ("Année de soins", "c.soi_ann"),
    "grand_post": ("Grand poste", "COALESCE(t.grand_poste, 'Autres')"),
    "post": ("Poste", "COALESCE(t.poste, 'Non classé')"),
    "sub_post": ("Sous-poste", "COALESCE(t.sous_poste, 'Non classé')"),
    "service": ("Prestation", "SERVICE"),
    "region": ("Région", "c.region"),
    "age": ("Tranche d’âge", "c.age"),
    "sex": ("Sexe", "c.sexe"),
    "insurance": ("Nature d’assurance", "c.asu_nat"),
    "envelope": ("Enveloppe", "c.env"),
    "ald": ("Motif d’exonération", "c.ald"),
}


class FilterPayload(BaseModel):
    start_year: int = Field(ge=2000, le=2100)
    end_year: int = Field(ge=2000, le=2100)
    grand_post: str | None = None
    post: str | None = None
    sub_post: str | None = None
    service_codes: list[int] = Field(default_factory=list)
    sexes: list[int] = Field(default_factory=list)
    ages: list[int] = Field(default_factory=list)
    regions: list[int] = Field(default_factory=list)
    insurances: list[int] = Field(default_factory=list)
    envelopes: list[int] = Field(default_factory=list)
    ald: int | None = Field(default=None, ge=0, le=1)


class ExtractionRequest(FilterPayload):
    dimensions: list[str] = Field(default_factory=lambda: ["year", "sex", "region"])
    measures: list[str] = Field(default_factory=lambda: ["reimbursed"])
    limit: int = Field(default=500, ge=1, le=1000)


def _in_filter(clauses: list[str], params: list[Any], column: str, values: list[Any]) -> None:
    if values:
        clauses.append(f"{column} IN ({','.join('?' for _ in values)})")
        params.extend(values)


def cube_where(payload: FilterPayload, *, ignore_sex: bool = False,
               exclude_base_less: bool = False) -> tuple[str, list[Any]]:
    if payload.start_year > payload.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    clauses = ["c.soi_ann BETWEEN ? AND ?"]
    params: list[Any] = [payload.start_year, payload.end_year]
    for value, column in (
        (payload.grand_post, "t.grand_poste"),
        (payload.post, "t.poste"),
        (payload.sub_post, "t.sous_poste"),
    ):
        if value:
            clauses.append(f"{column} = ?")
            params.append(value)
    _in_filter(clauses, params, "c.prs_nat", payload.service_codes)
    if not ignore_sex:
        _in_filter(clauses, params, "c.sexe", payload.sexes)
    _in_filter(clauses, params, "c.age", payload.ages)
    _in_filter(clauses, params, "c.region", payload.regions)
    _in_filter(clauses, params, "c.asu_nat", payload.insurances)
    _in_filter(clauses, params, "c.env", payload.envelopes)
    if payload.ald is not None:
        clauses.append("c.ald = ?")
        params.append(payload.ald)
    if exclude_base_less and not payload.grand_post and not payload.service_codes:
        placeholders = ",".join("?" for _ in POSTES_SANS_BASE)
        clauses.append(
            f"c.prs_nat NOT IN (SELECT prs_nat FROM transco WHERE grand_poste IN ({placeholders}))"
        )
        params.extend(POSTES_SANS_BASE)
    return " AND ".join(clauses), params


def delay_where(payload: FilterPayload, *, payment_axis: bool = False) -> tuple[str, list[Any]]:
    year_expression = "d.flx // 100" if payment_axis else "d.soi_ann"
    clauses = [f"{year_expression} BETWEEN ? AND ?"]
    params: list[Any] = [payload.start_year, payload.end_year]
    for value, column in (
        (payload.grand_post, "t.grand_poste"),
        (payload.post, "t.poste"),
        (payload.sub_post, "t.sous_poste"),
    ):
        if value:
            clauses.append(f"{column} = ?")
            params.append(value)
    _in_filter(clauses, params, "d.prs_nat", payload.service_codes)
    return " AND ".join(clauses), params


def _metric(key: str) -> Metric:
    if key not in METRICS:
        raise ValueError(f"Mesure inconnue : {key}")
    return METRICS[key]


def _mapped_label(dimension: str, value: Any, regions: dict[int, str]) -> str:
    if value is None:
        return "Non renseigné"
    if dimension not in ("sex", "age", "region", "insurance", "envelope", "ald"):
        return str(value)
    try:
        code = int(value)
    except (TypeError, ValueError):
        return str(value)
    mappings = {
        "sex": SEXES, "age": AGES, "region": regions,
        "insurance": INSURANCES, "envelope": ENVELOPES,
        "ald": {0: "Hors ALD", 1: "ALD"},
    }
    return mappings[dimension].get(code, f"Code {code}")


def _dimension_expression(key: str, *, service_label: bool = False) -> tuple[str, str]:
    if key not in DIMENSIONS:
        raise ValueError(f"Dimension inconnue : {key}")
    label, expression = DIMENSIONS[key]
    if expression == "SERVICE":
        expression = (
            "CAST(c.prs_nat AS VARCHAR) || ' · ' || COALESCE(ANY_VALUE(t.libelle), 'Prestation non libellée')"
            if service_label else "c.prs_nat"
        )
    return label, expression


def analysis_metadata(repo: QueryRepository, regions: dict[int, str]) -> dict[str, Any]:
    return _analysis_metadata_cached(repo, tuple(regions.items()))


@lru_cache(maxsize=2)
def _analysis_metadata_cached(repo: QueryRepository, regions_key: tuple[tuple[int, str], ...]) -> dict[str, Any]:
    regions = dict(regions_key)
    values: dict[str, list[int]] = {}
    for key, column in (("sexes", "sexe"), ("ages", "age"), ("insurances", "asu_nat"), ("envelopes", "env")):
        values[key] = [int(row["code"]) for row in repo.query(
            f"SELECT DISTINCT {column} AS code FROM cube WHERE {column} IS NOT NULL ORDER BY 1"
        )]
    return {
        "measures": [{
            "key": m.key,
            "label": m.label,
            "kind": m.kind,
            "family": m.family,
            "definition": m.definition,
            "formula": m.formula,
            "caveat": m.caveat,
            "requires_homogeneous_unit": m.requires_homogeneous_unit,
            "additive": m.additive,
            "unit_key": m.unit_key,
            "unit_label": m.unit_label,
            "invalid_grand_posts": list(POSTES_SANS_BASE) if m.key == "copayment" else [],
        } for m in METRICS.values()],
        "dimensions": [{"key": key, "label": label} for key, (label, _) in DIMENSIONS.items()],
        "sexes": [{"code": code, "label": SEXES.get(code, f"Sexe {code}")} for code in values["sexes"]],
        "ages": [{"code": code, "label": AGES.get(code, f"Âge {code}")} for code in values["ages"]],
        "insurances": [{"code": code, "label": INSURANCES.get(code, f"Assurance {code}")} for code in values["insurances"]],
        "envelopes": [{"code": code, "label": ENVELOPES.get(code, f"Enveloppe {code}")} for code in values["envelopes"]],
        "has_delays": repo.has_delays,
    }


@lru_cache(maxsize=128)
def hierarchy_options(repo: QueryRepository, grand_post: str | None, post: str | None, sub_post: str | None) -> dict[str, Any]:
    posts: list[str] = []
    sub_posts: list[str] = []
    if grand_post:
        posts = [str(row["label"]) for row in repo.query(
            """SELECT DISTINCT poste AS label FROM transco
               WHERE grand_poste = ? AND poste IS NOT NULL ORDER BY 1""", [grand_post]
        ) if row["label"]]
    if grand_post and post:
        sub_posts = [str(row["label"]) for row in repo.query(
            """SELECT DISTINCT sous_poste AS label FROM transco
               WHERE grand_poste = ? AND poste = ? AND sous_poste IS NOT NULL ORDER BY 1""", [grand_post, post]
        ) if row["label"]]
    clauses: list[str] = []
    params: list[Any] = []
    for value, column in ((grand_post, "t.grand_poste"), (post, "t.poste"), (sub_post, "t.sous_poste")):
        if value:
            clauses.append(f"{column} = ?")
            params.append(value)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    # Le montant est celui réellement remboursé sur la prestation : c'est lui
    # qui permet de trier par poids. Il était auparavant renvoyé à zéro, et la
    # liste tronquée à 300 lignes sans le dire — au-delà, une prestation
    # devenait introuvable. On classe par montant et on ne coupe que la queue.
    services = repo.query(
        f"""SELECT t.prs_nat AS code,
                   COALESCE(MAX(t.libelle), 'Prestation non libellée') AS label,
                   COALESCE(SUM(c.rem), 0)::DOUBLE AS amount
            FROM transco t LEFT JOIN cube c USING (prs_nat) {where}
            GROUP BY t.prs_nat
            ORDER BY amount DESC, label""", params
    )
    return {"posts": posts, "sub_posts": sub_posts, "services": services}


def _unknown_share(repo: QueryRepository, payload: FilterPayload) -> float | None:
    """Part du remboursement portée par une modalité non renseignée sur au
    moins une dimension. Utilisée par `studio.py` (Repères) pour signaler
    qu'un calcul agrégé laisse de côté une part non négligeable du périmètre."""
    where, params = cube_where(payload)
    rows = repo.query(
        f"""SELECT 100.0 * SUM(CASE WHEN c.age = 99 OR c.sexe IN (0, 9)
                                     OR c.region = 99 OR c.asu_nat IN (0, 99)
                                     OR c.env IN (9, 98) THEN c.rem END)
                    / NULLIF(SUM(c.rem), 0) AS value
            FROM cube c LEFT JOIN transco t USING (prs_nat) WHERE {where}""", params
    )
    value = rows[0]["value"] if rows else None
    return float(value) if value is not None else None


def _extraction_query(payload: ExtractionRequest, *, include_count: bool, limit: int) -> tuple[str, list[Any]]:
    if not payload.dimensions or not payload.measures:
        raise ValueError("Choisissez au moins une dimension et une mesure.")
    if any(key not in DIMENSIONS for key in payload.dimensions):
        raise ValueError("Une dimension d’extraction est inconnue.")
    metrics = [_metric(key) for key in payload.measures]
    if any(metric.requires_homogeneous_unit for metric in metrics):
        unit_is_homogeneous = len(payload.service_codes) == 1 or "service" in payload.dimensions
        if not unit_is_homogeneous:
            raise ValueError(
                "Les volumes et montants moyens nécessitent une prestation unique, "
                "ou la dimension Prestation dans l’extraction."
            )
    where, params = cube_where(payload, exclude_base_less="copayment" in payload.measures)
    selections: list[str] = []
    groups: list[str] = []
    for key in payload.dimensions:
        _, expression = _dimension_expression(key, service_label=True)
        selections.append(f"{expression} AS {key}")
        groups.append("c.prs_nat" if key == "service" else expression)
    measure_sql = [f"({metric.expression})::DOUBLE AS {metric.key}" for metric in metrics]
    count_sql = ", COUNT(*) OVER() AS __total_rows" if include_count else ""
    sql = f"""WITH aggregated AS (
                  SELECT {', '.join(selections + measure_sql)}
                  FROM cube c LEFT JOIN transco t USING (prs_nat)
                  WHERE {where} GROUP BY {', '.join(groups)}
              )
              SELECT *{count_sql} FROM aggregated
              ORDER BY {payload.dimensions[0]} LIMIT {int(limit)}"""
    return sql, params


def _humanize_rows(rows: list[dict[str, Any]], dimensions: list[str], regions: dict[int, str]) -> None:
    for row in rows:
        for dimension in dimensions:
            if dimension in ("region", "age", "sex", "insurance", "envelope", "ald"):
                row[dimension] = _mapped_label(dimension, row.get(dimension), regions)


def extraction_columns(payload: ExtractionRequest) -> list[dict[str, str]]:
    return ([{"key": key, "label": DIMENSIONS[key][0], "kind": "dimension"} for key in payload.dimensions]
            + [{"key": key, "label": METRICS[key].label, "kind": METRICS[key].kind} for key in payload.measures])


def extraction_preview(repo: QueryRepository, payload: ExtractionRequest, regions: dict[int, str]) -> dict[str, Any]:
    sql, params = _extraction_query(payload, include_count=True, limit=payload.limit)
    rows = repo.query(sql, params)
    total_rows = int(rows[0].pop("__total_rows")) if rows else 0
    for row in rows[1:]:
        row.pop("__total_rows", None)
    _humanize_rows(rows, payload.dimensions, regions)
    columns = extraction_columns(payload)
    return {"columns": columns, "rows": rows, "total_rows": total_rows,
            "limited": total_rows > payload.limit}


def extraction_rows(repo: QueryRepository, payload: ExtractionRequest, regions: dict[int, str],
                    *, limit: int = 250000) -> list[dict[str, Any]]:
    sql, params = _extraction_query(payload, include_count=False, limit=limit + 1)
    rows = repo.query(sql, params)
    if len(rows) > limit:
        raise ValueError(
            f"L’extraction dépasse la limite de {limit:,} lignes. "
            "Réduisez le périmètre ou le nombre de dimensions avant de relancer l’export."
            .replace(",", " ")
        )
    _humanize_rows(rows, payload.dimensions, regions)
    return rows
