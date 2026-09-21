"""Cadence de paiement de l'Assurance Maladie par bloc de l'étude hospitalisation.

Pour chaque année de soins, part du remboursement déjà réglée au 31 décembre de
la même année, sur trois blocs : séjours ordinaires (poste « Hospitalisation
Sejour » hors rééducation), rééducation (anciens codes 2211 et 2339, nouveaux
codes 2110 et 3145 à 3156), anesthésie (poste « Hospitalisation Honoraires »).

Ce sont les six chiffres du tableau « Cadence de l'Assurance Maladie » du
diapo (slide 4). L'encart « Liquidation du périmètre » de l'outil donne la
même mesure par poste ou sous-poste, mais ne sait pas lire les codes de
rééducation nés en 2024 : ce script les réunit aux anciens.

Lecture seule : `app\\backend\\.venv\\Scripts\\python.exe tools\\cadence_par_bloc.py`.
"""
from __future__ import annotations

from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
DELAYS = ROOT / "data" / "cube_delais.parquet"
TRANSCO = ROOT / "data" / "prs_nat_transco.csv"

REEDUC = (2211, 2339, 2110, 3145, 3146, 3147, 3148, 3149, 3151, 3152, 3153, 3154, 3155, 3156)
SEJOUR = f"(select prs_nat from read_csv('{TRANSCO.as_posix()}', delim=';', header=true) where poste='Hospitalisation Sejour')"
HONOS = f"(select prs_nat from read_csv('{TRANSCO.as_posix()}', delim=';', header=true) where poste='Hospitalisation Honoraires')"

BLOCS = {
    "Séjours ordinaires (poste Séjour hors rééducation)": f"prs_nat in {SEJOUR} and prs_nat not in {REEDUC}",
    "Rééducation (2211, 2339, 2110, 3145–3156)": f"prs_nat in {REEDUC}",
    "Anesthésie (poste Honoraires)": f"prs_nat in {HONOS}",
}


def main() -> None:
    con = duckdb.connect()
    print(f"{'Bloc':<52}{'2021':>8}{'2022':>8}{'2023':>8}{'2024':>8}")
    for label, where in BLOCS.items():
        rows = con.execute(
            f"""
            with t as (
                select soi_ann, cast(flx as int) // 100 as flx_ann, sum(rem) as rem
                from read_parquet('{DELAYS.as_posix()}')
                where {where} and soi_ann between 2021 and 2024
                group by 1, 2
            )
            select soi_ann,
                   100.0 * sum(case when flx_ann = soi_ann then rem end) / sum(rem) as part
            from t group by 1 order by 1
            """
        ).fetchall()
        parts = {year: part for year, part in rows}
        print(f"{label:<52}" + "".join(f"{parts.get(y, float('nan')):7.1f} %" for y in (2021, 2022, 2023, 2024)))
    print("\nLecture : part du remboursement de l'année de soins déjà payée au 31 décembre de cette année.")


if __name__ == "__main__":
    main()
