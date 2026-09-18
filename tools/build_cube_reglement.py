"""Construit le cube des règlements interrogé par DAMIR Studio.

Le cube principal date chaque dépense au **soin**. Ce cube la date au
**règlement** : une ligne par année de flux, c'est-à-dire par exercice de
paiement de l'Assurance Maladie, toutes années de soins confondues. C'est la
lecture d'un compte de résultat, et la seule qui porte les effets de cadence.

Source : les tranches annuelles de flux `cube_parts3/main_AAAA.parquet`, une par
année de règlement, qui portent la dépense — ce que le cube des délais
(`cube_delais.parquet`, limité au remboursement) ne permettait pas.

    app/backend/.venv/Scripts/python.exe tools/build_cube_reglement.py

Le contrôle final compare, année par année, le remboursement de ce cube à celui
du cube des délais. Un écart arrête la construction : deux mesures du même flux
ne peuvent pas diverger.
"""
import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
PARTS = ROOT / "cube_parts3"
DELAYS = ROOT / "data" / "cube_delais.parquet"
TARGET = ROOT / "data" / "cube_reglement.parquet"

DIMENSIONS = ("prs_nat", "asu_nat", "age", "sexe", "region", "env", "ald")
MEASURES = ("rem", "dep", "depas", "qte", "rem_ref", "bse_ref", "rem_neg")


def sources() -> list[tuple[int, Path]]:
    found = []
    for path in sorted(PARTS.glob("main_*.parquet")):
        try:
            year = int(path.stem.split("_")[1])
        except (IndexError, ValueError):
            continue
        found.append((year, path))
    return found


def build(parts: list[tuple[int, Path]]) -> None:
    started = time.perf_counter()
    connection = duckdb.connect(database=":memory:")
    connection.execute("SET preserve_insertion_order = false")
    dims = ", ".join(DIMENSIONS)
    sums = ", ".join(f"SUM({name})::DOUBLE AS {name}" for name in MEASURES)
    # Une tranche par annee de reglement : l'annee de flux est le nom du fichier,
    # jamais une colonne du fichier. On la pose explicitement.
    selects = " UNION ALL ".join(
        f"""SELECT {year} AS flx_ann, {dims}, {sums}
            FROM read_parquet('{path.as_posix()}') GROUP BY flx_ann, {dims}"""
        for year, path in parts
    )
    staging = TARGET.with_suffix(".tmp.parquet")
    connection.execute(
        f"""COPY ({selects}) TO '{staging.as_posix()}'
            (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 500000)"""
    )
    staging.replace(TARGET)
    rows = connection.execute(
        f"SELECT COUNT(*) FROM read_parquet('{TARGET.as_posix()}')"
    ).fetchone()[0]
    elapsed = time.perf_counter() - started
    # Sortie volontairement en ASCII : ce script est lance depuis cmd.exe, dont
    # la console refuse les caracteres hors cp1252.
    print(
        f"-> {TARGET.name} : {rows:,} lignes, {TARGET.stat().st_size / 1e6:.0f} Mo, "
        f"en {elapsed:.0f} s".replace(",", " ")
    )


def verify() -> bool:
    """Le remboursement par annee de reglement doit egaler celui du cube des delais."""
    if not DELAYS.exists():
        print("  [INFO] cube des delais absent : controle ignore.")
        return True
    connection = duckdb.connect(database=":memory:")
    connection.execute("SET preserve_insertion_order = false")
    print("Controle contre le cube des delais...")
    mine = connection.execute(
        f"SELECT flx_ann, SUM(rem) FROM read_parquet('{TARGET.as_posix()}') GROUP BY 1 ORDER BY 1"
    ).fetchall()
    theirs = dict(connection.execute(
        f"SELECT flx // 100, SUM(rem) FROM read_parquet('{DELAYS.as_posix()}') GROUP BY 1"
    ).fetchall())
    ok = True
    for year, value in mine:
        reference = theirs.get(year)
        if reference is None:
            print(f"  [ECART] {year} : absent du cube des delais")
            ok = False
            continue
        if abs(value - reference) > max(1e-6 * abs(reference), 0.01):
            print(f"  [ECART] {year} : {value} != {reference}")
            ok = False
    print("  [OK] remboursements identiques" if ok else "  [ECHEC] ecart detecte")
    return ok


if __name__ == "__main__":
    parts = sources()
    if not parts:
        print(f"Aucune tranche de flux dans {PARTS}. Rien a construire.")
        sys.exit(1)
    print(f"Lecture de {len(parts)} tranches de flux ({parts[0][0]} a {parts[-1][0]})...")
    build(parts)
    if not verify():
        TARGET.unlink(missing_ok=True)
        sys.exit(1)
