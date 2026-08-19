# -*- coding: utf-8 -*-
"""I-07 — le filtre du produit contre un WHERE écrit à la main.

**Ce module importe `app/`, et c'est voulu : l'application est ici l'objet du
contrôle, pas la source de la référence.** La valeur attendue vient toujours d'un
SQL écrit à la main dans `reference.py`, qui n'importe rien du produit. On
compare donc bien deux choses indépendantes.

La distinction est celle que la mission pose : appeler le code testé pour
*produire* la valeur attendue est circulaire ; l'appeler pour *obtenir la valeur
à tester* est exactement ce qu'un audit doit faire.
"""
from __future__ import annotations

import sys
from pathlib import Path

from . import reference as ref
from .socle import (CONFORME, DEFAUT, EXPLIQUE, PLANCHER_MONTANT, TOLERANCES,
                    Comparaison, Controle, sci, formater)

BACKEND = ref.RACINE / "app" / "backend"


def _importer_produit():
    """Charge `app.analysis` sans démarrer le serveur."""
    if str(BACKEND) not in sys.path:
        sys.path.insert(0, str(BACKEND))
    from app.analysis import POSTES_SANS_BASE, FilterPayload, cube_where  # noqa: PLC0415
    return FilterPayload, cube_where, POSTES_SANS_BASE


#: Les scénarios de filtrage. Chacun porte le prédicat SQL **écrit à la main**
#: qui doit produire le même sous-ensemble que `cube_where`.
SCENARIOS: list[tuple[str, dict, str]] = [
    ("période seule, 2018–2020", {"start_year": 2018, "end_year": 2020},
     "c.soi_ann BETWEEN 2018 AND 2020"),
    ("une région", {"start_year": 2015, "end_year": 2024, "regions": ["11"]},
     "c.soi_ann BETWEEN 2015 AND 2024 AND c.region = 11"),
    ("trois régions", {"start_year": 2015, "end_year": 2024, "regions": ["11", "84", "93"]},
     "c.soi_ann BETWEEN 2015 AND 2024 AND c.region IN (11, 84, 93)"),
    ("un sexe", {"start_year": 2015, "end_year": 2024, "sexes": ["2"]},
     "c.soi_ann BETWEEN 2015 AND 2024 AND c.sexe = 2"),
    ("deux tranches d'âge", {"start_year": 2015, "end_year": 2024, "ages": ["30", "40"]},
     "c.soi_ann BETWEEN 2015 AND 2024 AND c.age IN (30, 40)"),
    ("région × sexe × âge", {"start_year": 2019, "end_year": 2019, "regions": ["75"],
                             "sexes": ["1"], "ages": ["60"]},
     "c.soi_ann = 2019 AND c.region = 75 AND c.sexe = 1 AND c.age = 60"),
    ("ALD seulement", {"start_year": 2015, "end_year": 2024, "ald": "1"},
     "c.soi_ann BETWEEN 2015 AND 2024 AND c.ald = 1"),
    ("toutes les régions listées = pas de filtre", {"start_year": 2022, "end_year": 2022},
     "c.soi_ann = 2022"),
]


def _filtres(con) -> list[Controle]:
    try:
        FilterPayload, cube_where, _ = _importer_produit()
    except Exception as exc:  # pragma: no cover
        return [Controle(
            ref="I-07", base="DAMIR", libelle="Le filtre du produit contre un WHERE écrit à la main",
            reference_par="SQL manuel", verdict="En attente",
            note=f"`app.analysis` n'a pas pu être importé : {exc}",
        )]

    lot = Comparaison("montant", plancher=PLANCHER_MONTANT)
    detail = []
    for libelle, champs, predicat in SCENARIOS:
        payload = FilterPayload(**champs)
        where_produit, params = cube_where(payload)

        attendu = con.execute(
            f"SELECT SUM(c.rem)::DOUBLE FROM compact c WHERE {predicat}"
        ).fetchone()[0]
        obtenu = con.execute(
            f"SELECT SUM(c.rem)::DOUBLE FROM compact c "
            f"LEFT JOIN transco t ON t.prs_nat = c.prs_nat WHERE {where_produit}", params
        ).fetchone()[0]

        lot.ajouter(attendu, obtenu, libelle)
        # Le signe reflète la **tolérance**, pas l'égalité binaire : deux sommes
        # flottantes qui diffèrent au dernier bit sont égales pour un actuaire, et
        # afficher « ≠ » à côté de « 0 hors tolérance » ferait se contredire le
        # rapport sur la même ligne.
        conforme = abs((obtenu or 0.0) - (attendu or 0.0)) <= (
            PLANCHER_MONTANT + TOLERANCES["montant"] * abs(attendu or 0.0)
        )
        detail.append(
            f"{libelle} — manuel {formater(attendu)} {'=' if conforme else '≠'} "
            f"produit {formater(obtenu)}"
        )

    return [Controle(
        ref="I-07", base="DAMIR",
        libelle="`cube_where` du produit contre un WHERE écrit à la main (8 scénarios)",
        reference_par="**SQL manuel**, prédicat rédigé à la main pour chaque scénario ; "
                      "`cube_where` fournit la valeur *testée*, jamais l'attendue",
        attendu="prédicat manuel", obtenu="prédicat du produit",
        ecart=sci(lot.pire),
        verdict=lot.verdict,
        note=lot.resume(),
        details=detail,
    )]


def executer() -> list[Controle]:
    con = ref.connexion()
    controles = _filtres(con)
    con.close()
    return controles
