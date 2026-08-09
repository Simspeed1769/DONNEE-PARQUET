from __future__ import annotations

import argparse
import csv
import json
import os
import time
from pathlib import Path

import duckdb


REGIONS = {
    "01": "Guadeloupe",
    "02": "Martinique",
    "03": "Guyane",
    "04": "La Réunion",
    "11": "Île-de-France",
    "24": "Centre-Val de Loire",
    "27": "Bourgogne-Franche-Comté",
    "28": "Normandie",
    "32": "Hauts-de-France",
    "44": "Grand Est",
    "52": "Pays de la Loire",
    "53": "Bretagne",
    "75": "Nouvelle-Aquitaine",
    "76": "Occitanie",
    "84": "Auvergne-Rhône-Alpes",
    "93": "Provence-Alpes-Côte d'Azur",
    "94": "Corse",
}

GROUPES_CSP = {
    "1": "Agriculteurs exploitants",
    "2": "Artisans, commerçants et chefs d'entreprise",
    "3": "Cadres et professions intellectuelles supérieures",
    "4": "Professions intermédiaires",
    "5": "Employés",
    "6": "Ouvriers",
}

CATEGORIES_CSP = {
    "10": "Exploitants de l'agriculture, sylviculture, pêche et aquaculture",
    "21": "Artisans",
    "22": "Commerçants et assimilés",
    "23": "Chefs d'entreprise de plus de 10 personnes",
    "31": "Professions libérales",
    "33": "Cadres administratifs et techniques de la fonction publique",
    "34": "Professeurs et professions scientifiques supérieures",
    "35": "Professions de l'information, de l'art et des spectacles",
    "37": "Cadres des services administratifs et commerciaux d'entreprise",
    "38": "Ingénieurs et cadres techniques d'entreprise",
    "42": "Professions de l'enseignement primaire et professionnel, de la formation continue et du sport",
    "43": "Professions intermédiaires de la santé et du travail social",
    "44": "Ministres du culte et religieux consacrés",
    "45": "Professions intermédiaires de la fonction publique",
    "46": "Professions intermédiaires administratives et commerciales des entreprises",
    "47": "Techniciens",
    "48": "Agents de maîtrise",
    "52": "Employés administratifs de la fonction publique, agents de service et auxiliaires de santé",
    "53": "Policiers, militaires, pompiers et agents de sécurité privée",
    "54": "Employés administratifs d'entreprise",
    "55": "Employés de commerce",
    "56": "Personnels des services directs aux particuliers",
    "62": "Ouvriers qualifiés de type industriel",
    "63": "Ouvriers qualifiés de type artisanal",
    "64": "Conducteurs de véhicules de transport, chauffeurs-livreurs et coursiers",
    "65": "Conducteurs d'engins, caristes, magasiniers et ouvriers du transport",
    "67": "Ouvriers peu qualifiés de type industriel",
    "68": "Ouvriers peu qualifiés de type artisanal",
    "69": "Ouvriers agricoles, forestiers, de la pêche et de l'aquaculture",
}

METADATA = [
    ("annee", "Année", "SMALLINT", "Millésime du recensement de la population."),
    ("code_region", "Code région", "VARCHAR", "Code INSEE de la région de résidence, conservé sur deux caractères."),
    ("region", "Région", "VARCHAR", "Libellé français de la région de résidence."),
    ("age", "Âge", "UTINYINT", "Âge exact au dernier anniversaire, issu de la variable AGEREV."),
    ("tranche_age", "Tranche d'âge", "VARCHAR", "Regroupement compatible avec les classes décennales de DAMIR."),
    ("tranche_age_ordre", "Ordre de la tranche d'âge", "UTINYINT", "Valeur technique permettant de trier correctement les tranches d'âge."),
    ("code_sexe", "Code sexe", "UTINYINT", "1 pour les hommes et 2 pour les femmes."),
    ("sexe", "Sexe", "VARCHAR", "Libellé Hommes ou Femmes."),
    ("niveau_csp", "Niveau de CSP", "VARCHAR", "groupe_6 pour les six grands groupes ou categorie_29 pour le détail en 29 catégories."),
    ("code_groupe_csp", "Code du groupe CSP", "UTINYINT", "Code du groupe socioprofessionnel parent en six postes."),
    ("groupe_csp", "Groupe CSP", "VARCHAR", "Libellé du groupe socioprofessionnel parent."),
    ("code_csp", "Code CSP affiché", "VARCHAR", "Code du groupe ou de la catégorie selon le niveau_csp."),
    ("csp", "CSP affichée", "VARCHAR", "Libellé du groupe ou de la catégorie selon le niveau_csp."),
    ("effectif", "Effectif pondéré", "DOUBLE", "Somme des poids individuels IPONDI sur la cellule."),
    ("population_reference", "Population de référence", "DOUBLE", "Total des actifs ayant un emploi pour la même année, région, âge et sexe."),
    ("part_csp_pct", "Part de la CSP", "DOUBLE", "Effectif de la CSP rapporté à la population de référence, en pourcentage."),
    ("nb_lignes_source", "Nombre de lignes source", "BIGINT", "Nombre d'observations anonymisées du fichier INSEE mobilisées dans la cellule."),
    ("champ_population", "Champ de population", "VARCHAR", "Champ constant : actifs ayant un emploi, TACT=11."),
    ("source", "Source", "VARCHAR", "Source statistique officielle du fichier."),
]


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def values_sql(values: dict[str, str]) -> str:
    return ",\n".join(f"({sql_literal(code)}, {sql_literal(label)})" for code, label in values.items())


def write_metadata(path: Path) -> None:
    temporary = path.with_suffix(".tmp.csv")
    with temporary.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream, delimiter=";")
        writer.writerow(("variable", "libelle", "type", "definition"))
        writer.writerows(METADATA)
    os.replace(temporary, path)


def build(source: Path, output: Path, metadata: Path, year: int) -> dict[str, object]:
    if not source.exists():
        raise FileNotFoundError(source)
    if source.resolve() == output.resolve():
        raise ValueError("Le fichier source et le fichier de sortie doivent être différents.")

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".tmp.parquet")
    if temporary.exists():
        temporary.unlink()

    connection = duckdb.connect()
    connection.execute("PRAGMA threads=4")
    connection.execute(
        f"CREATE TEMP TABLE dim_region AS SELECT * FROM (VALUES {values_sql(REGIONS)}) AS t(code, label)"
    )
    connection.execute(
        f"CREATE TEMP TABLE dim_groupe AS SELECT * FROM (VALUES {values_sql(GROUPES_CSP)}) AS t(code, label)"
    )
    connection.execute(
        f"CREATE TEMP TABLE dim_categorie AS SELECT * FROM (VALUES {values_sql(CATEGORIES_CSP)}) AS t(code, label)"
    )

    source_sql = sql_literal(str(source.resolve()))
    temporary_sql = sql_literal(str(temporary.resolve()))
    query = f"""
        COPY (
            WITH base AS (
                SELECT
                    {year}::SMALLINT AS annee,
                    r.REGION AS code_region,
                    dr.label AS region,
                    try_cast(r.AGEREV AS UTINYINT) AS age,
                    try_cast(r.SEXE AS UTINYINT) AS code_sexe,
                    CASE r.SEXE WHEN '1' THEN 'Hommes' WHEN '2' THEN 'Femmes' END AS sexe,
                    try_cast(r.GS AS UTINYINT) AS code_groupe_csp,
                    dg.label AS groupe_csp,
                    r.CS AS code_categorie_csp,
                    dc.label AS categorie_csp,
                    r.IPONDI
                FROM read_parquet({source_sql}) r
                JOIN dim_region dr ON dr.code = r.REGION
                JOIN dim_groupe dg ON dg.code = r.GS
                JOIN dim_categorie dc ON dc.code = r.CS
                WHERE r.TACT = '11'
                  AND try_cast(r.AGEREV AS INTEGER) BETWEEN 0 AND 120
                  AND r.SEXE IN ('1', '2')
            ),
            groupes AS (
                SELECT annee, code_region, region, age, code_sexe, sexe,
                       'groupe_6'::VARCHAR AS niveau_csp,
                       code_groupe_csp, groupe_csp,
                       code_groupe_csp::VARCHAR AS code_csp,
                       groupe_csp AS csp,
                       sum(IPONDI)::DOUBLE AS effectif,
                       count(*)::BIGINT AS nb_lignes_source
                FROM base
                GROUP BY ALL
            ),
            categories AS (
                SELECT annee, code_region, region, age, code_sexe, sexe,
                       'categorie_29'::VARCHAR AS niveau_csp,
                       code_groupe_csp, groupe_csp,
                       code_categorie_csp AS code_csp,
                       categorie_csp AS csp,
                       sum(IPONDI)::DOUBLE AS effectif,
                       count(*)::BIGINT AS nb_lignes_source
                FROM base
                GROUP BY ALL
            ),
            niveaux AS (
                SELECT * FROM groupes
                UNION ALL
                SELECT * FROM categories
            ),
            avec_reference AS (
                SELECT *,
                       sum(effectif) OVER (
                           PARTITION BY annee, code_region, age, code_sexe, niveau_csp
                       )::DOUBLE AS population_reference
                FROM niveaux
            )
            SELECT
                annee,
                code_region,
                region,
                age,
                CASE
                    WHEN age < 20 THEN 'Moins de 20 ans'
                    WHEN age < 30 THEN '20 à 29 ans'
                    WHEN age < 40 THEN '30 à 39 ans'
                    WHEN age < 50 THEN '40 à 49 ans'
                    WHEN age < 60 THEN '50 à 59 ans'
                    WHEN age < 70 THEN '60 à 69 ans'
                    WHEN age < 80 THEN '70 à 79 ans'
                    ELSE '80 ans ou plus'
                END AS tranche_age,
                CASE
                    WHEN age < 20 THEN 0
                    WHEN age >= 80 THEN 80
                    ELSE floor(age / 10) * 10
                END::UTINYINT AS tranche_age_ordre,
                code_sexe,
                sexe,
                niveau_csp,
                code_groupe_csp,
                groupe_csp,
                code_csp,
                csp,
                effectif,
                population_reference,
                100.0 * effectif / nullif(population_reference, 0) AS part_csp_pct,
                nb_lignes_source,
                'Actifs ayant un emploi (TACT=11)'::VARCHAR AS champ_population,
                'Insee, Recensement de la population {year}, individus localisés à la région'::VARCHAR AS source
            FROM avec_reference
            ORDER BY annee, code_region, age, code_sexe, niveau_csp, code_groupe_csp, code_csp
        ) TO {temporary_sql} (
            FORMAT PARQUET,
            COMPRESSION ZSTD,
            ROW_GROUP_SIZE 100000
        )
    """

    started = time.perf_counter()
    connection.execute(query)
    build_seconds = time.perf_counter() - started
    os.replace(temporary, output)
    write_metadata(metadata)

    output_sql = sql_literal(str(output.resolve()))
    summary_row = connection.execute(
        f"""
            SELECT count(*) AS lignes,
                   count(DISTINCT code_region) AS regions,
                   count(DISTINCT age) AS ages,
                   count(DISTINCT code_sexe) AS sexes,
                   count(DISTINCT niveau_csp) AS niveaux,
                   min(age) AS age_min,
                   max(age) AS age_max
            FROM read_parquet({output_sql})
        """
    ).fetchone()
    totals = connection.execute(
        f"""
            SELECT niveau_csp, sum(effectif), sum(nb_lignes_source)
            FROM read_parquet({output_sql})
            GROUP BY niveau_csp ORDER BY niveau_csp
        """
    ).fetchall()
    max_share_error = connection.execute(
        f"""
            SELECT max(abs(total_part - 100.0))
            FROM (
                SELECT annee, code_region, age, code_sexe, niveau_csp,
                       sum(part_csp_pct) AS total_part
                FROM read_parquet({output_sql})
                GROUP BY ALL
            )
        """
    ).fetchone()[0]
    started = time.perf_counter()
    connection.execute(
        f"""
            SELECT code_region, tranche_age, code_sexe, code_csp,
                   sum(effectif), max(population_reference)
            FROM read_parquet({output_sql})
            WHERE niveau_csp = 'groupe_6'
            GROUP BY ALL
        """
    ).fetchall()
    benchmark_seconds = time.perf_counter() - started
    connection.close()

    return {
        "source": str(source),
        "output": str(output),
        "output_bytes": output.stat().st_size,
        "metadata": str(metadata),
        "build_seconds": round(build_seconds, 3),
        "query_benchmark_seconds": round(benchmark_seconds, 4),
        "rows": summary_row[0],
        "regions": summary_row[1],
        "ages": summary_row[2],
        "sexes": summary_row[3],
        "levels": summary_row[4],
        "age_min": summary_row[5],
        "age_max": summary_row[6],
        "totals_by_level": totals,
        "max_share_error": max_share_error,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Construit la base CSP agrégée utilisée par l'application DAMIR.")
    # Les scripts vivent dans `tools/`, les données CSP dans `data/csp/`.
    folder = Path(__file__).resolve().parent.parent / "data" / "csp"
    parser.add_argument("--source", type=Path, default=folder / "RP2023_indreg.parquet")
    parser.add_argument("--output", type=Path, default=folder / "csp_core_2023.parquet")
    parser.add_argument("--metadata", type=Path, default=folder / "csp_core_2023_metadata.csv")
    parser.add_argument("--year", type=int, default=2023)
    args = parser.parse_args()
    print(json.dumps(build(args.source, args.output, args.metadata, args.year), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
