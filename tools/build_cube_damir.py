# -*- coding: utf-8 -*-
"""Reconstruit le cube brut `cube_damir.parquet` depuis les fichiers mensuels.

Pourquoi ce script existe
-------------------------
Les cubes du depot etaient arrives deja construits, par deux scripts vivant
hors depot dans `..\\Annee_Damir\\` : `convertir_damir.py` (csv.gz -> parquet
annuel, 61 variables, 19 gardees) puis `construire_cube.py` (parquet ->
cube). Le premier laissait tomber les variables d'etablissement, le second
laissait tomber `PRS_PPU_SEC` que le premier avait pourtant conservee.

Ce script remplace les deux. Il lit **directement les .csv.gz**, sans passer
par les parquets annuels intermediaires : lire un mois prend une trentaine de
secondes, et l'etape intermediaire coutait 46 Go de disque pour rien.

Ce qui change par rapport a l'ancien cube
-----------------------------------------
Quatre cles nouvelles, mesurees a l'etape A de la mission
(`docs/MESURE_SECTEUR_PUBLIC_PRIVE.md`) :

    sec       PRS_PPU_SEC    secteur public / prive
    ete_typ   ETE_TYP_SNDS   type d'etablissement executant
    mdt       MDT_TYP_COD    mode de traitement
    taa       ETE_IND_TAA    indicateur TAA

Tout le reste est identique a l'ancien cube, colonne par colonne et type par
type. La correspondance ci-dessous est lue dans `construire_cube.py`, pas
deduite des libelles : `dep` vient de `FLT_PAI_MNT` et non de `PRS_PAI_MNT`,
`nb` est un `count(*)` et non `PRS_ACT_NBR`, `rem_ref` et `bse_ref` sont les
montants filtres sur `PRS_REM_TYP = 0`.

Le cube des delais n'est pas concerne : ses colonnes ne changent pas.

Prudence
--------
Le script ecrit sous `cube_damir_v2.parquet` et ne touche JAMAIS au cube en
place. Le remplacement est une decision separee, prise apres les controles de
`tools/verifier_cube_v2.py`.

Il est reprenable : chaque mois et chaque annee de soins produit une part sur
le disque, et une part deja ecrite est sautee. Une interruption ne coute que
le mois en cours.

    app/backend/.venv/Scripts/python.exe tools/build_cube_damir.py
    app/backend/.venv/Scripts/python.exe tools/build_cube_damir.py --source D:/autre
"""
from __future__ import annotations

import argparse
import glob
import os
import shutil
import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DEFAUT = ROOT.parent / "Annee_Damir"
PARTS_MOIS = ROOT / "data" / ".cube_parts_v2" / "mois"
PARTS_ANNEE = ROOT / "data" / ".cube_parts_v2" / "annee"
TEMP_DUCKDB = ROOT / "data" / ".cube_parts_v2" / "tmp"
CIBLE = ROOT / "data" / "cube_damir_v2.parquet"

# Les annees de soins retenues. Le filtre est celui de l'ancien cube, repris
# a l'identique : sans lui, un mois de flux apporte environ 9 % de lignes
# aux annees de soins anciennes ou non renseignees, absentes du cube actuel,
# et les deux ne se compareraient plus.
ANNEE_MIN, ANNEE_MAX = 2014, 2100

# Les montants sont typés explicitement : le sniffeur de duckdb ne lit qu'un
# echantillon, et une colonne de montants prise pour du texte fausserait tout
# en silence.
TYPES = {
    "PRS_REM_MNT": "DOUBLE",
    "PRS_REM_BSE": "DOUBLE",
    "FLT_PAI_MNT": "DOUBLE",
    "FLT_DEP_MNT": "DOUBLE",
    "FLT_ACT_QTE": "DOUBLE",
    "PRS_REM_TYP": "BIGINT",
    "EXO_MTF": "BIGINT",
}

# Le schema de l'ancien cube, reproduit type pour type : l'application filtre
# `region`, `asu_nat` et `env` avec des entiers, un changement de type la
# casserait sans bruit.
CLES = (
    ("soi_ann", "TRY_CAST(SOI_ANN AS INTEGER)"),
    ("soi_moi", "TRY_CAST(SOI_MOI AS INTEGER)"),
    ("prs_nat", "TRY_CAST(PRS_NAT AS BIGINT)"),
    ("asu_nat", "TRY_CAST(ASU_NAT AS BIGINT)"),
    ("age", "TRY_CAST(AGE_BEN_SNDS AS BIGINT)"),
    ("sexe", "TRY_CAST(BEN_SEX_COD AS BIGINT)"),
    ("region", "TRY_CAST(BEN_RES_REG AS BIGINT)"),
    ("env", "TRY_CAST(CPT_ENV_TYP AS BIGINT)"),
    ("ald", "CASE WHEN EXO_MTF BETWEEN 41 AND 46 THEN 1 ELSE 0 END"),
    # les quatre nouvelles
    ("sec", "TRY_CAST(PRS_PPU_SEC AS BIGINT)"),
    ("ete_typ", "TRY_CAST(ETE_TYP_SNDS AS BIGINT)"),
    ("mdt", "TRY_CAST(MDT_TYP_COD AS BIGINT)"),
    ("taa", "TRY_CAST(ETE_IND_TAA AS BIGINT)"),
)

MESURES = (
    ("rem", "sum(PRS_REM_MNT)"),
    ("bse", "sum(PRS_REM_BSE)"),
    ("dep", "sum(FLT_PAI_MNT)"),
    ("depas", "sum(FLT_DEP_MNT)"),
    ("qte", "sum(FLT_ACT_QTE)"),
    ("rem_ref", "sum(CASE WHEN PRS_REM_TYP = 0 THEN PRS_REM_MNT END)"),
    ("bse_ref", "sum(CASE WHEN PRS_REM_TYP = 0 THEN PRS_REM_BSE END)"),
    ("rem_neg", "sum(CASE WHEN PRS_REM_MNT < 0 THEN PRS_REM_MNT END)"),
    ("nb", "CAST(count(*) AS DOUBLE)"),
)

NOMS_CLES = [nom for nom, _ in CLES]
NOMS_MESURES = [nom for nom, _ in MESURES]


def connexion(memoire: str) -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    con.execute("PRAGMA threads=4")
    con.execute("SET preserve_insertion_order=false")
    con.execute(f"SET memory_limit='{memoire}'")
    TEMP_DUCKDB.mkdir(parents=True, exist_ok=True)
    con.execute(f"SET temp_directory='{TEMP_DUCKDB.as_posix()}'")
    return con


def lecture_csv(fichier: Path) -> str:
    """Le dialecte est dicté, pas deviné.

    `A202301.csv.gz` — et lui seul parmi les 132 — porte des lignes plus
    courtes que son en-tête, et le détecteur de dialecte de duckdb abandonne
    dessus. `null_padding=true` complète les colonnes manquantes par des NULL,
    sans effet sur un fichier bien formé.

    Surtout, ne PAS mettre `ignore_errors=true` : il ferait passer le fichier
    en supprimant les lignes fautives, sans rien dire. Une ligne courte est
    une donnée incomplète, pas une donnée absente ; elle reste, ses champs
    manquants restent nuls, et le contrôle annuel dira si cela déplace un
    total.
    """
    types = ", ".join(f"'{k}': '{v}'" for k, v in TYPES.items())
    return (f"read_csv('{fichier.as_posix()}', delim=';', header=true, "
            f"types={{{types}}}, null_padding=true, ignore_errors=false)")


def libre_go() -> float:
    return shutil.disk_usage(ROOT.anchor).free / 1e9


def mois_sources(source: Path) -> list[Path]:
    motif = str(source / "*" / "A*.csv.gz")
    fichiers = sorted(Path(p) for p in glob.glob(motif))
    if not fichiers:
        raise SystemExit(f"Aucun fichier mensuel sous {source}")
    return fichiers


# Les colonnes sans lesquelles le cube ne peut pas etre construit.
REQUISES = ("SOI_ANN", "SOI_MOI", "PRS_NAT", "ASU_NAT", "AGE_BEN_SNDS",
            "BEN_SEX_COD", "BEN_RES_REG", "CPT_ENV_TYP", "EXO_MTF",
            "PRS_PPU_SEC", "ETE_TYP_SNDS", "MDT_TYP_COD", "ETE_IND_TAA",
            "PRS_REM_MNT", "PRS_REM_BSE", "FLT_PAI_MNT", "FLT_DEP_MNT",
            "FLT_ACT_QTE", "PRS_REM_TYP")


def verifier_colonnes(con, fichiers: list[Path]) -> None:
    """Lit les en-tetes des 132 fichiers avant de calculer quoi que ce soit.

    Le schema d'Open DAMIR bouge d'une annee sur l'autre. Constate le
    23/09/2026 sur ces fichiers : trois schemas distincts, 56 colonnes de
    01/2015 a 07/2023, 55 de 08/2023 a 09/2024, 57 a partir de 10/2024 — les
    colonnes de queue changent (`ETB_DCS_MCO` apparait et disparait,
    `PSP_STJ_SNDS` et `TOP_PS5_TRG` vont et viennent).

    Les 19 colonnes utilisees ici sont presentes partout, mais rien ne le
    garantit pour un flux a venir. Echouer ici coute quelques secondes ;
    echouer au 97e mois coute deux heures.
    """
    print("Verification des en-tetes...")
    schemas: dict[tuple[str, ...], list[str]] = {}
    manquants: list[str] = []
    for fichier in fichiers:
        colonnes = tuple(r[0] for r in con.execute(
            f"DESCRIBE SELECT * FROM {lecture_csv(fichier)} LIMIT 0").fetchall())
        schemas.setdefault(colonnes, []).append(fichier.name)
        absentes = [c for c in REQUISES if c not in colonnes]
        if absentes:
            manquants.append(f"{fichier.name} : manque {', '.join(absentes)}")
    for i, (colonnes, noms) in enumerate(
            sorted(schemas.items(), key=lambda kv: kv[1][0]), 1):
        print(f"  schema {i} : {len(colonnes)} colonnes, {len(noms)} fichiers "
              f"({noms[0]} .. {noms[-1]})")
    if manquants:
        print()
        for ligne in manquants:
            print("  ARRET — " + ligne)
        raise SystemExit("Colonnes requises absentes : rien n'a ete calcule.")
    print(f"  les {len(REQUISES)} colonnes requises sont presentes partout")


# ───────────────────────────────────────────── etape 1 : un mois, une part
def agreger_mois(con, fichier: Path, part: Path) -> int:
    select = ",\n               ".join(
        f"{expr} AS {nom}" for nom, expr in CLES)
    mesures = ",\n               ".join(
        f"{expr} AS {nom}" for nom, expr in MESURES)
    staging = part.with_suffix(".parquet.tmp")
    staging.unlink(missing_ok=True)
    con.execute(f"""
        COPY (
            SELECT {select},
                   {mesures}
            FROM {lecture_csv(fichier)}
            WHERE TRY_CAST(SOI_ANN AS INTEGER) BETWEEN {ANNEE_MIN} AND {ANNEE_MAX}
            GROUP BY ALL
        ) TO '{staging.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)
    """)
    staging.replace(part)
    return con.execute(
        f"SELECT count(*) FROM read_parquet('{part.as_posix()}')").fetchone()[0]


# ─────────────────────────── etape 2 : une annee de soins, toutes les parts
def agreger_annee(con, annee: int, parts: list[Path], cible: Path) -> int:
    """Regroupe une seule annee de soins a la fois.

    Un mois de flux porte plusieurs annees de soins : les parts mensuelles se
    recouvrent, et il faut les resommer. Le faire annee par annee borne la
    memoire au lieu de lancer un GROUP BY sur 330 millions de lignes.
    """
    sources = "[" + ", ".join(f"'{p.as_posix()}'" for p in parts) + "]"
    mesures = ", ".join(f"sum({nom}) AS {nom}" for nom in NOMS_MESURES)
    staging = cible.with_suffix(".parquet.tmp")
    staging.unlink(missing_ok=True)
    con.execute(f"""
        COPY (
            SELECT {', '.join(NOMS_CLES)}, {mesures}
            FROM read_parquet({sources})
            WHERE soi_ann = {annee}
            GROUP BY {', '.join(NOMS_CLES)}
        ) TO '{staging.as_posix()}'
          (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 500000)
    """)
    staging.replace(cible)
    return con.execute(
        f"SELECT count(*) FROM read_parquet('{cible.as_posix()}')").fetchone()[0]


def main() -> None:
    parseur = argparse.ArgumentParser(description=__doc__)
    parseur.add_argument("--source", default=str(SOURCE_DEFAUT),
                         help="dossier contenant les annees de .csv.gz")
    parseur.add_argument("--memoire", default="6GB",
                         help="plafond memoire de duckdb")
    parseur.add_argument("--garder-parts", action="store_true",
                         help="ne pas effacer les parts apres la fusion")
    args = parseur.parse_args()

    source = Path(args.source).resolve()
    debut = time.time()
    PARTS_MOIS.mkdir(parents=True, exist_ok=True)
    PARTS_ANNEE.mkdir(parents=True, exist_ok=True)

    fichiers = mois_sources(source)
    print(f"Source : {source}")
    print(f"{len(fichiers)} fichiers mensuels, "
          f"{sum(f.stat().st_size for f in fichiers) / 1e9:.0f} Go compresses")
    print(f"Disque libre : {libre_go():.1f} Go")
    print(f"Cible : {CIBLE}  (le cube en place n'est pas touche)")
    print()

    con = connexion(args.memoire)
    verifier_colonnes(con, fichiers)
    print()

    # ── etape 1 ────────────────────────────────────────────────────────────
    print("Etape 1/3 — un agregat par mois de flux")
    parts = []
    for i, fichier in enumerate(fichiers, 1):
        part = PARTS_MOIS / (fichier.stem.replace(".csv", "") + ".parquet")
        parts.append(part)
        if part.exists():
            print(f"  [{i:3d}/{len(fichiers)}] {fichier.name} : deja fait, saute")
            continue
        if libre_go() < 5:
            raise SystemExit(f"ARRET — moins de 5 Go libres ({libre_go():.1f} Go).")
        t0 = time.time()
        n = agreger_mois(con, fichier, part)
        print(f"  [{i:3d}/{len(fichiers)}] {fichier.name} : "
              f"{n:,} lignes en {time.time() - t0:.0f} s".replace(",", " "))
        sys.stdout.flush()

    # ── etape 2 ────────────────────────────────────────────────────────────
    print()
    print("Etape 2/3 — regroupement par annee de soins")
    annees = [r[0] for r in con.execute(
        f"SELECT DISTINCT soi_ann FROM read_parquet("
        f"[{', '.join(repr(p.as_posix()) for p in parts)}]) ORDER BY 1"
    ).fetchall()]
    print(f"  annees de soins presentes : {annees[0]} - {annees[-1]} "
          f"({len(annees)} annees)")
    parts_annee = []
    for annee in annees:
        cible = PARTS_ANNEE / f"{annee}.parquet"
        parts_annee.append(cible)
        if cible.exists():
            print(f"  {annee} : deja fait, saute")
            continue
        t0 = time.time()
        n = agreger_annee(con, annee, parts, cible)
        print(f"  {annee} : {n:,} lignes en {time.time() - t0:.0f} s"
              .replace(",", " "))
        sys.stdout.flush()

    # ── etape 3 ────────────────────────────────────────────────────────────
    print()
    print("Etape 3/3 — assemblage du cube")
    sources = "[" + ", ".join(f"'{p.as_posix()}'" for p in parts_annee) + "]"
    staging = CIBLE.with_suffix(".parquet.tmp")
    staging.unlink(missing_ok=True)
    con.execute(f"""
        COPY (SELECT * FROM read_parquet({sources}))
        TO '{staging.as_posix()}'
        (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 500000)
    """)
    staging.replace(CIBLE)

    lignes = con.execute(
        f"SELECT count(*) FROM read_parquet('{CIBLE.as_posix()}')").fetchone()[0]
    print(f"-> {CIBLE.name} : {lignes:,} lignes, "
          f"{CIBLE.stat().st_size / 1e6:.0f} Mo".replace(",", " "))

    if not args.garder_parts:
        shutil.rmtree(PARTS_MOIS, ignore_errors=True)
        shutil.rmtree(TEMP_DUCKDB, ignore_errors=True)
        print("Parts mensuelles effacees (les parts annuelles restent).")

    print()
    print(f"Termine en {(time.time() - debut) / 60:.0f} min. "
          f"Disque libre : {libre_go():.1f} Go")
    print("Le cube en place n'a pas ete touche.")
    print("Controler avec : tools/verifier_cube_v2.py")


if __name__ == "__main__":
    main()
