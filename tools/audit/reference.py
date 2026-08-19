# -*- coding: utf-8 -*-
"""Les valeurs de référence, obtenues sans jamais passer par l'application.

**Ce module n'importe rien de `app/`, et c'est sa raison d'être.** La règle
fondamentale de l'audit — un contrôle qui appelle le code testé pour produire sa
propre valeur attendue ne teste rien — est ici rendue mécanique : si le module de
référence ne *peut pas* importer le code testé, il ne peut pas produire une
valeur circulaire par accident.

Tout ce qui suit est du SQL écrit à la main, exécuté par DuckDB directement sur
les fichiers Parquet. Ni `cube_where`, ni `explore.py`, ni `panorama.py`, ni
`pivot.py`, ni aucune fonction du produit.

`data/` n'est jamais modifié : on ne fait que lire des Parquet depuis une base
en mémoire.
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import duckdb

RACINE = Path(__file__).resolve().parents[2]
DONNEES = RACINE / "data"

CUBE_BRUT = DONNEES / "cube_damir.parquet"
CUBE_COMPACT = DONNEES / "cube_damir_compact.parquet"
TRANSCO = DONNEES / "prs_nat_transco.csv"

#: Les mesures additives du cube. `bse` et `nb` n'existent que dans le brut et
#: ne sont lues nulle part dans le produit : elles sont hors périmètre.
MESURES = ("rem", "dep", "depas", "qte", "rem_ref", "bse_ref", "rem_neg")

#: Les colonnes de regroupement conservées par le compact. Le brut y ajoute
#: `soi_moi`, que le compact agrège — c'est tout l'objet du compactage.
CLES = ("soi_ann", "prs_nat", "asu_nat", "age", "sexe", "region", "env", "ald")

#: Les six grands postes sans base de remboursement, recopiés ici **à la main**
#: depuis `analysis.py`. Les importer créerait la circularité qu'on refuse : si
#: la liste du produit changeait par erreur, un import la suivrait en silence.
POSTES_SANS_BASE = (
    "Indemnités Journalières",
    "Invalidité, Décès & Rentes",
    "Rémunérations forfaitaires des PS",
    "Maternité & Adoption (forfaits)",
    "Non remboursable",
    "Codes réservés",
)


def chemin_sql(path: Path) -> str:
    return str(path).replace("\\", "/")


def connexion() -> duckdb.DuckDBPyConnection:
    """Une base en mémoire, et deux vues en lecture seule sur les Parquet."""
    con = duckdb.connect()
    con.execute(f"CREATE VIEW brut AS SELECT * FROM read_parquet('{chemin_sql(CUBE_BRUT)}')")
    con.execute(f"CREATE VIEW compact AS SELECT * FROM read_parquet('{chemin_sql(CUBE_COMPACT)}')")
    con.execute(
        f"""
        CREATE TABLE transco AS
        SELECT TRY_CAST(PRS_NAT AS BIGINT) AS prs_nat, libelle, grand_poste, poste, sous_poste
        FROM read_csv_auto('{chemin_sql(TRANSCO)}', delim = ';', header = true, all_varchar = true)
        WHERE TRY_CAST(PRS_NAT AS BIGINT) IS NOT NULL
        """
    )
    return con


def empreintes() -> list[tuple[str, str]]:
    """L'empreinte des fichiers audités.

    Le cube brut fait 1,1 Go : le hacher à chaque exécution coûterait plus que
    tous les contrôles réunis. Il est identifié par sa taille et sa date de
    modification ; les fichiers légers sont hachés pour de bon.
    """
    lignes: list[tuple[str, str]] = []
    for chemin in (CUBE_BRUT, CUBE_COMPACT, TRANSCO):
        if not chemin.exists():
            lignes.append((chemin.name, "absent"))
            continue
        taille = chemin.stat().st_size
        date = datetime.fromtimestamp(chemin.stat().st_mtime, timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        if taille > 200_000_000:
            lignes.append((chemin.name, f"{taille:,} o · modifié {date} (non haché : trop volumineux)".replace(",", " ")))
        else:
            digest = hashlib.sha256(chemin.read_bytes()).hexdigest()[:16]
            lignes.append((chemin.name, f"{taille:,} o · sha256 {digest}".replace(",", " ")))
    return lignes


# ---------------------------------------------------------------- agrégations

def total_par(con: duckdb.DuckDBPyConnection, source: str, mesure: str,
              groupe: str | None = None, where: str = "") -> dict[Any, float]:
    """Σ d'une mesure, éventuellement par modalité. SQL nu, sans filtre du produit."""
    clause = f"WHERE {where}" if where else ""
    if groupe is None:
        ligne = con.execute(f"SELECT SUM({mesure})::DOUBLE FROM {source} {clause}").fetchone()
        return {"__total__": ligne[0]}
    rows = con.execute(
        f"SELECT {groupe} AS cle, SUM({mesure})::DOUBLE AS valeur FROM {source} {clause} GROUP BY 1"
    ).fetchall()
    return {row[0]: row[1] for row in rows}


def total_par_poste(con: duckdb.DuckDBPyConnection, mesure: str, niveau: str) -> dict[Any, float]:
    """Σ par niveau de la hiérarchie de prestations, « Autres » compris.

    La jointure reproduit à la main le `COALESCE` du produit — sans l'importer.
    """
    colonne = {
        "grand_poste": "COALESCE(t.grand_poste, 'Autres')",
        "poste": "COALESCE(t.poste, 'Non classé')",
        "sous_poste": "COALESCE(t.sous_poste, 'Non classé')",
    }[niveau]
    rows = con.execute(
        f"""
        SELECT {colonne} AS cle, SUM(c.{mesure})::DOUBLE AS valeur
        FROM compact c LEFT JOIN transco t ON t.prs_nat = c.prs_nat
        GROUP BY 1
        """
    ).fetchall()
    return {row[0]: row[1] for row in rows}
