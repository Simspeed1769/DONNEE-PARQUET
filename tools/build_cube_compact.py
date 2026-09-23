"""Construit le cube compact interrogé par DAMIR Studio.

Le cube brut `cube_damir.parquet` porte 45 millions de lignes au grain
mois × prestation × population. Aucune requête de l'application n'utilise le
mois de soins : l'axe temporel est l'année, et le seul écran qui raisonne en
mois — la cadence de liquidation — lit le cube des délais, pas celui-ci. La
colonne `nb` n'est lue nulle part non plus.

Agréger le mois ramène le cube à 5,8 millions de lignes, soit huit fois moins,
sans perdre aucune information exploitable par l'interface. Les requêtes
d'exploration passent d'environ deux secondes à quelques centaines de
millisecondes.

Deux clés d'établissement sont entrées le 23/09/2026 : `sec` (secteur public
/ privé) et `ete_typ` (type d'établissement exécutant). Elles multiplient le
nombre de lignes par environ 1,34 — mesuré, pas estimé. Les deux autres
variables d'établissement du cube brut, `mdt` et `taa`, restent dehors : la
mesure d'étape A les a trouvées trop peu renseignées pour qu'un écran s'y
appuie sans mentir (`docs/MESURE_SECTEUR_PUBLIC_PRIVE.md`).

`bse` est de nouveau conservée : l'étude hospitalisation en a besoin pour
décomposer la part AMO en « remboursé ÷ base » × « base ÷ dépense », et c'est
cette décomposition qui montre que la dérive de l'anesthésie vient des
dépassements et non d'un changement de règle.

Le fichier brut n'est jamais modifié : il reste la source de vérité, et ce
script peut être relancé à volonté après une mise à jour des données.

    python tools/build_cube_compact.py
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data" / "cube_damir.parquet"
TARGET = ROOT / "data" / "cube_damir_compact.parquet"

# Clés conservées : tout ce sur quoi l'interface sait filtrer ou découper.
KEYS = ("soi_ann", "prs_nat", "asu_nat", "age", "sexe", "region", "env", "ald",
        "sec", "ete_typ")
# Mesures additives : leur somme sur les mois d'une année est exacte.
MEASURES = ("rem", "bse", "dep", "depas", "qte", "rem_ref", "bse_ref", "rem_neg")


def build(source: Path, target: Path) -> None:
    if not source.exists():
        raise SystemExit(f"Cube introuvable : {source}")

    connection = duckdb.connect(database=":memory:")
    connection.execute("SET preserve_insertion_order = false")

    started = time.perf_counter()
    print(f"Lecture de {source.name} ({source.stat().st_size / 1e9:.2f} Go)...")

    # Écriture dans un fichier temporaire puis remplacement atomique : une
    # interruption ne laisse jamais un cube compact tronqué derrière elle.
    staging = target.with_suffix(".parquet.tmp")
    staging.unlink(missing_ok=True)
    connection.execute(
        f"""
        COPY (
            SELECT {', '.join(KEYS)},
                   {', '.join(f'SUM({name})::DOUBLE AS {name}' for name in MEASURES)}
            FROM read_parquet('{source.as_posix()}')
            GROUP BY {', '.join(KEYS)}
        ) TO '{staging.as_posix()}'
        (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 500000)
        """
    )
    staging.replace(target)

    rows = connection.execute(
        f"SELECT COUNT(*) FROM read_parquet('{target.as_posix()}')"
    ).fetchone()[0]
    elapsed = time.perf_counter() - started
    # Sortie volontairement en ASCII : ce script est lance depuis cmd.exe, dont
    # la console refuse les caracteres hors cp1252 et ferait echouer un travail
    # par ailleurs termine.
    print(
        f"-> {target.name} : {rows:,} lignes, "
        f"{target.stat().st_size / 1e6:.0f} Mo, en {elapsed:.0f} s".replace(",", " ")
    )


def verify(source: Path, target: Path) -> bool:
    """Contrôle que l'agrégation conserve les totaux annuels au centime près."""
    connection = duckdb.connect(database=":memory:")
    connection.execute("SET preserve_insertion_order = false")
    sums = ", ".join(f"SUM({name}) AS {name}" for name in MEASURES)
    print("Controle des totaux annuels...")
    before = connection.execute(
        f"SELECT soi_ann, {sums} FROM read_parquet('{source.as_posix()}') GROUP BY 1 ORDER BY 1"
    ).fetchall()
    after = connection.execute(
        f"SELECT soi_ann, {sums} FROM read_parquet('{target.as_posix()}') GROUP BY 1 ORDER BY 1"
    ).fetchall()

    ok = True
    for original, compact in zip(before, after, strict=True):
        for index, name in enumerate(("annee", *MEASURES)):
            left, right = original[index], compact[index]
            if left is None and right is None:
                continue
            # Sommer dans un ordre différent déplace le dernier bit d'un flottant :
            # on tolère un écart relatif d'un millionième, pas une divergence réelle.
            if abs(float(left) - float(right)) > max(1e-6 * abs(float(left)), 0.01):
                print(f"  [ECART] {original[0]} - {name} : {left} != {right}")
                ok = False
    print("  [OK] totaux identiques" if ok else "  [ECHEC] ecart detecte, cube compact non fiable")
    return ok


if __name__ == "__main__":
    # Deux arguments facultatifs : ils permettent de fabriquer le compact d'un
    # cube candidat sans toucher au compact en place, le temps des contrôles.
    #     python tools/build_cube_compact.py data/cube_damir_v2.parquet \
    #                                        data/cube_damir_compact_v2.parquet
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else SOURCE
    target = Path(sys.argv[2]) if len(sys.argv) > 2 else TARGET
    build(source, target)
    if not verify(source, target):
        target.unlink(missing_ok=True)
        sys.exit(1)
