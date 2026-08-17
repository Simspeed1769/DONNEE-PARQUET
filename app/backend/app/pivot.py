"""Le tableau croisé : deux dimensions, une mesure, et rien d'inventé.

Cet écran remplace « Repères », qui choisissait une source, puis un calcul
parmi six, et produisait **un chiffre**. Panorama affichait déjà la dernière
valeur, la variation et le cumul : seuls le taux de croissance annuel moyen et
la dispersion y apportaient du neuf, pour un écran entier.

Le tableau croisé est l'objet que tout le monde a déjà manipulé dans un
tableur, ce qui en fait un écran sans apprentissage. Ce qui le distingue d'un
croisé de tableur, et qui justifie qu'il vive ici, c'est que la méthode reste
dépliable à côté du chiffre : définition, formule, dénominateur, limitation.

**Le contrat central est tenu.** Comme `explore.py`, ce module ne renvoie
jamais un indicateur calculé : il renvoie les **composantes additives brutes**
par cellule, plus la spécification des formules. Le client dérive les douze
mesures, si bien que changer de mesure ou d'agrégation ne provoque aucune
requête.

**Trois paquets de composantes par cellule**, et pas un de plus : la période
entière, la première année, la dernière année. C'est le strict nécessaire pour
que le client dérive les six agrégations de l'ancien écran — valeur, cumul,
moyenne par unité, variation, TCAM — sans renvoyer une charge utile
proportionnelle au nombre d'années. La dispersion, elle, se calcule entre les
cellules et n'a besoin de rien de plus.
"""

from __future__ import annotations

from typing import Any

from pydantic import Field

from .analysis import DIMENSIONS, METRICS, POSTES_SANS_BASE, FilterPayload, QueryRepository, cube_where
from .explore import (
    COMPONENTS,
    FORMULAS,
    _add,
    _bucket_label,
    _components_from_row,
    _COMPONENT_SQL,
    _dimension_sql,
    _empty,
    _measure_availability,
    _service_labels,
    ExploreRequest,
)

#: Plafond du produit lignes × colonnes.
#:
#: Ce n'est pas une limite de calcul — DuckDB agrégerait bien davantage — mais
#: une limite de lecture : au-delà, personne ne lit un tableau, et la charge
#: utile cesse d'être raisonnable. `service` porte à elle seule 1 342
#: modalités ; croisée avec les régions, elle produirait 17 000 cellules.
MAX_CELLS = 2000


class PivotRequest(FilterPayload):
    """Deux dimensions et un périmètre. La mesure n'est pas ici : elle se
    dérive côté client, comme partout dans le produit."""

    rows: str = "grand_post"
    columns: str = "year"


def _axis_expression(key: str) -> tuple[str, str]:
    """(libellé, expression SQL) pour un axe du tableau.

    `_dimension_sql` refuse `year`, qui n'est pas une dimension de découpage
    dans `explore.py` mais l'axe du temps. Ici, c'est un axe comme un autre :
    croiser les grands postes par année est la première chose qu'on demande à
    un tableau croisé.
    """
    if key == "year":
        return DIMENSIONS["year"][0], "c.soi_ann"
    label, expression, _ = _dimension_sql(key)
    return label, expression


def _sorted_keys(key: str, raw_keys: list[Any]) -> list[Any]:
    """Les années se lisent dans l'ordre du temps, le reste par libellé.

    Trier les années comme du texte donnerait 2015, 2016, … 2024 par chance, et
    n'importe quoi dès qu'un millésime passe à cinq chiffres ou qu'une année
    manque.
    """
    if key == "year":
        return sorted(raw_keys, key=lambda v: (v is None, v))
    return sorted(raw_keys, key=lambda v: (v is None, str(v)))


def pivot(repo: QueryRepository, payload: PivotRequest,
          regions: dict[int, str]) -> dict[str, Any]:
    if payload.start_year > payload.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    if payload.rows == payload.columns:
        raise ValueError(
            "Les lignes et les colonnes portent la même dimension : "
            "choisissez-en deux différentes."
        )

    row_label, row_expression = _axis_expression(payload.rows)
    column_label, column_expression = _axis_expression(payload.columns)

    where, params = cube_where(payload)
    # Les paramètres des `CASE WHEN` du ticket modérateur précèdent ceux du
    # WHERE dans l'ordre d'apparition du SQL — même contrainte que dans
    # `explore.py`, et pour la même raison.
    base_less_params = list(POSTES_SANS_BASE) * 2
    rows = repo.query(
        f"""
        SELECT c.soi_ann AS year,
               {row_expression} AS row_key,
               {column_expression} AS column_key,
               {', '.join(_COMPONENT_SQL)}
        FROM cube c LEFT JOIN transco t USING (prs_nat)
        WHERE {where}
        GROUP BY 1, 2, 3
        """,
        [*base_less_params, *params],
    )

    row_keys = _sorted_keys(payload.rows, list({row["row_key"] for row in rows}))
    column_keys = _sorted_keys(payload.columns, list({row["column_key"] for row in rows}))

    if len(row_keys) * len(column_keys) > MAX_CELLS:
        raise ValueError(
            f"Ce croisement produirait {len(row_keys) * len(column_keys)} cellules "
            f"({len(row_keys)} lignes × {len(column_keys)} colonnes), au-delà des "
            f"{MAX_CELLS} qu'un tableau reste lisible. Restreignez le périmètre, "
            "ou choisissez une dimension moins fine."
        )

    years = sorted({int(row["year"]) for row in rows})
    first_year, last_year = (years[0], years[-1]) if years else (payload.start_year, payload.end_year)

    # Trois accumulateurs par cellule : la période entière, la première année,
    # la dernière. Les totaux de ligne, de colonne et le total général se
    # somment dans la même passe — les composantes étant additives, un total
    # est une somme et jamais un recalcul.
    def bundle() -> dict[str, dict[str, float]]:
        return {"period": _empty(), "first": _empty(), "last": _empty()}

    cells: dict[tuple[Any, Any], dict[str, dict[str, float]]] = {}
    row_totals: dict[Any, dict[str, dict[str, float]]] = {}
    column_totals: dict[Any, dict[str, dict[str, float]]] = {}
    grand = bundle()

    for row in rows:
        components = _components_from_row(row)
        year = int(row["year"])
        targets = [
            cells.setdefault((row["row_key"], row["column_key"]), bundle()),
            row_totals.setdefault(row["row_key"], bundle()),
            column_totals.setdefault(row["column_key"], bundle()),
            grand,
        ]
        for target in targets:
            _add(target["period"], components)
            if year == first_year:
                _add(target["first"], components)
            if year == last_year:
                _add(target["last"], components)

    service_codes: list[int] = []
    for key, axis in ((payload.rows, row_keys), (payload.columns, column_keys)):
        if key == "service":
            service_codes.extend(int(value) for value in axis if value is not None)
    service_labels = _service_labels(repo, service_codes)

    def label_of(key: str, raw: Any) -> str:
        if key == "year":
            return str(int(raw)) if raw is not None else "Année inconnue"
        return _bucket_label(key, raw, regions, service_labels)

    # `ExploreRequest` porte la disponibilité des mesures ; le tableau croisé
    # travaille toujours en date de soins, d'où `time_axis` laissé au défaut.
    availability = _measure_availability(ExploreRequest(**payload.model_dump()))

    return {
        "rows": payload.rows,
        "rows_label": row_label,
        "columns": payload.columns,
        "columns_label": column_label,
        "row_keys": [{"key": str(value), "label": label_of(payload.rows, value)} for value in row_keys],
        "column_keys": [{"key": str(value), "label": label_of(payload.columns, value)} for value in column_keys],
        "cells": [
            {"row": str(row_key), "column": str(column_key), **bundles}
            for (row_key, column_key), bundles in cells.items()
        ],
        "row_totals": [{"row": str(key), **bundles} for key, bundles in row_totals.items()],
        "column_totals": [{"column": str(key), **bundles} for key, bundles in column_totals.items()],
        "total": grand,
        "first_year": first_year,
        "last_year": last_year,
        "years": years,
        "components": list(COMPONENTS),
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
        "dimensions": [{"key": key, "label": label} for key, (label, _) in DIMENSIONS.items()],
        "warnings": _pivot_warnings(payload),
    }


def _pivot_warnings(payload: PivotRequest) -> list[str]:
    warnings: list[str] = []
    if not payload.grand_post and not payload.service_codes:
        warnings.append(
            "Le ticket modérateur exclut les prestations sans base de remboursement, "
            "afin d’éviter un montant artificiellement négatif."
        )
    if "service" in (payload.rows, payload.columns) and not payload.grand_post:
        warnings.append(
            "Croiser les prestations sans restreindre le grand poste donne un tableau "
            "très long : les volumes de prestations différentes ne s’additionnent pas."
        )
    return warnings
