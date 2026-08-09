"""Build the small, query-ready CSP Parquet used by DAMIR.

The INSEE source files are individual-level files and deliberately stay in
``raw``/``Années``.  This script reads one year at a time, keeps only the
dimensions needed by the application, aggregates the weights, and writes a
single consolidated Parquet.  It accepts the two historical source formats:
PCS 2003 (CSV/DBF, 2015--2022) and PCS 2020 (Parquet, 2023+).

Run from the CSP directory with ``python build_csp_dataset.py``.  Invalid or
unfinished downloads are reported and skipped; the consolidated output is
never built from a partial archive.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import shutil
import struct
import tempfile
import zipfile
from collections import defaultdict
import sys
import time
from pathlib import Path
from typing import Iterator

import duckdb


REGIONS = {
    "01": "Guadeloupe", "02": "Martinique", "03": "Guyane", "04": "La Réunion",
    "11": "Île-de-France", "24": "Centre-Val de Loire", "27": "Bourgogne-Franche-Comté",
    "28": "Normandie", "32": "Hauts-de-France", "44": "Grand Est", "52": "Pays de la Loire",
    "53": "Bretagne", "75": "Nouvelle-Aquitaine", "76": "Occitanie",
    "84": "Auvergne-Rhône-Alpes", "93": "Provence-Alpes-Côte d'Azur", "94": "Corse",
}
GROUPES = {
    "1": "Agriculteurs exploitants", "2": "Artisans, commerçants et chefs d'entreprise",
    "3": "Cadres et professions intellectuelles supérieures", "4": "Professions intermédiaires",
    "5": "Employés", "6": "Ouvriers",
}
CATEGORIES = {
    "10": "Exploitants de l'agriculture, sylviculture, pêche et aquaculture",
    "21": "Artisans", "22": "Commerçants et assimilés", "23": "Chefs d'entreprise de plus de 10 personnes",
    "31": "Professions libérales", "33": "Cadres administratifs et techniques de la fonction publique",
    "34": "Professeurs et professions scientifiques supérieures",
    "35": "Professions de l'information, de l'art et des spectacles",
    "37": "Cadres des services administratifs et commerciaux d'entreprise",
    "38": "Ingénieurs et cadres techniques d'entreprise",
    "42": "Professions de l'enseignement primaire et professionnel, de la formation continue et du sport",
    "43": "Professions intermédiaires de la santé et du travail social",
    "44": "Ministres du culte et religieux consacrés", "45": "Professions intermédiaires de la fonction publique",
    "46": "Professions intermédiaires administratives et commerciales des entreprises", "47": "Techniciens",
    "48": "Agents de maîtrise",
    "52": "Employés administratifs de la fonction publique, agents de service et auxiliaires de santé",
    "53": "Policiers, militaires, pompiers et agents de sécurité privée",
    "54": "Employés administratifs d'entreprise", "55": "Employés de commerce",
    "56": "Personnels des services directs aux particuliers", "62": "Ouvriers qualifiés de type industriel",
    "63": "Ouvriers qualifiés de type artisanal",
    "64": "Conducteurs de véhicules de transport, chauffeurs-livreurs et coursiers",
    "65": "Conducteurs d'engins, caristes, magasiniers et ouvriers du transport",
    "67": "Ouvriers peu qualifiés de type industriel", "68": "Ouvriers peu qualifiés de type artisanal",
    "69": "Ouvriers agricoles, forestiers, de la pêche et de l'aquaculture",
}
KEEP_COLUMNS = ("REGION", "AGEREV", "SEXE", "TACT", "IPONDI", "CS1", "CS3", "GS", "CS")


def _valid_parquet(path: Path) -> bool:
    if not path.exists() or path.stat().st_size < 1024:
        return False
    try:
        con = duckdb.connect()
        con.execute(f"SELECT 1 FROM read_parquet('{path.as_posix().replace(chr(39), chr(39)*2)}') LIMIT 1")
        con.close()
        return True
    except Exception:
        return False


def _valid_zip(path: Path) -> bool:
    if not path.exists():
        return False
    try:
        with zipfile.ZipFile(path) as archive:
            return bool(archive.namelist()) and archive.testzip() is None
    except (OSError, zipfile.BadZipFile):
        return False


def find_sources(root: Path, years: list[int]) -> tuple[dict[int, Path], dict[int, str]]:
    selected: dict[int, Path] = {}
    status: dict[int, str] = {}
    for year in years:
        candidates = sorted((root / "raw" / str(year)).glob("*") if (root / "raw" / str(year)).exists() else [])
        candidates += sorted((root / "Années").glob(f"*{year}*"))
        candidates += sorted(root.glob(f"RP{year}*.parquet"))
        for candidate in candidates:
            ok = _valid_parquet(candidate) if candidate.suffix.lower() == ".parquet" else _valid_zip(candidate)
            if ok:
                selected[year] = candidate
                status[year] = "valide"
                break
        if year not in selected:
            status[year] = "absente ou téléchargement incomplet"
    return selected, status


def _dbf_rows(path: Path) -> Iterator[dict[str, str]]:
    """Minimal streaming DBF reader (the INSEE file has no memo fields)."""
    with path.open("rb") as stream:
        header = stream.read(32)
        if len(header) != 32:
            raise ValueError(f"En-tête DBF invalide : {path}")
        count, header_len, record_len = struct.unpack_from("<IHH", header, 4)
        fields: list[tuple[str, str, int]] = []
        while True:
            first = stream.read(1)
            if not first or first == b"\r":
                break
            descriptor = first + stream.read(31)
            name = descriptor[:11].split(b"\0", 1)[0].decode("latin-1", "replace").strip()
            fields.append((name, chr(descriptor[11]), descriptor[16]))
        stream.seek(header_len)
        for _ in range(count):
            record = stream.read(record_len)
            if len(record) != record_len:
                break
            if record[:1] == b"*":
                continue
            offset = 1
            values: dict[str, str] = {}
            for name, kind, width in fields:
                raw = record[offset: offset + width]
                offset += width
                text = raw.decode("latin-1", "replace").strip()
                values[name] = text
            yield values


def _dbf_to_csv(dbf: Path, target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=list(KEEP_COLUMNS), extrasaction="ignore")
        writer.writeheader()
        for row in _dbf_rows(dbf):
            writer.writerow({key: row.get(key, "") for key in KEEP_COLUMNS})
    return target


def _extract_source(source: Path, stage: Path) -> tuple[Path, str]:
    """Return an extracted source and its logical format (csv/dbf/parquet)."""
    if source.suffix.lower() == ".parquet":
        return source, "parquet"
    if source.suffix.lower() == ".csv":
        return source, "csv"
    with zipfile.ZipFile(source) as archive:
        names = [name for name in archive.namelist() if not name.endswith("/")]
        if not names:
            raise ValueError(f"Archive vide : {source}")
        member = next((name for name in names if name.lower().endswith((".csv", ".dbf"))), names[0])
        extracted = stage / Path(member).name
        with archive.open(member) as input_stream, extracted.open("wb") as output_stream:
            shutil.copyfileobj(input_stream, output_stream, length=8 * 1024 * 1024)
    if extracted.suffix.lower() == ".dbf":
        return _dbf_to_csv(extracted, stage / f"{extracted.stem}_selected.csv"), "csv"
    return extracted, "csv"


def _zip_member_rows(source: Path) -> tuple[Iterator[dict[str, str]], str, zipfile.ZipFile]:
    """Open the single INSEE member and return a streaming row iterator.

    The ZipFile handle must stay alive while the iterator is consumed, hence
    it is returned to the caller and closed in ``build_year``.
    """
    archive = zipfile.ZipFile(source)
    names = [name for name in archive.namelist() if not name.endswith("/")]
    member = next((name for name in names if name.lower().endswith((".csv", ".dbf"))), names[0])
    stream = archive.open(member)
    if member.lower().endswith(".dbf"):
        return _dbf_rows_stream(stream), "dbf", archive
    text = io.TextIOWrapper(stream, encoding="utf-8-sig", errors="replace", newline="")
    return csv.DictReader(text, delimiter=";"), "csv", archive


def _dbf_rows_stream(stream: io.BufferedIOBase) -> Iterator[dict[str, str]]:
    header = stream.read(32)
    if len(header) != 32:
        raise ValueError("En-tête DBF invalide")
    count, header_len, record_len = struct.unpack_from("<IHH", header, 4)
    fields: list[tuple[str, str, int]] = []
    while True:
        first = stream.read(1)
        if not first or first == b"\r":
            break
        descriptor = first + stream.read(31)
        name = descriptor[:11].split(b"\0", 1)[0].decode("latin-1", "replace").strip()
        fields.append((name, chr(descriptor[11]), descriptor[16]))
    # The field descriptors have already consumed the header, so this is only
    # needed for readers that expose seek; ZipExtFile does not, and is exactly
    # positioned at the first record after the loop.
    _ = header_len
    for _ in range(count):
        record = stream.read(record_len)
        if len(record) != record_len:
            break
        if record[:1] == b"*":
            continue
        offset = 1
        values: dict[str, str] = {}
        for name, _kind, width in fields:
            if name in KEEP_COLUMNS:
                values[name] = record[offset: offset + width].decode("latin-1", "replace").strip()
            offset += width
        yield values


def _aggregate_rows(rows: Iterator[dict[str, str]], year: int, old_format: bool) -> list[dict[str, object]]:
    groups: defaultdict[tuple[str, int, int, int], list[float]] = defaultdict(lambda: [0.0, 0.0])
    categories: defaultdict[tuple[str, int, int, int, str], list[float]] = defaultdict(lambda: [0.0, 0.0])
    scanned = 0
    started = time.perf_counter()
    for row in rows:
        scanned += 1
        if scanned % 1_000_000 == 0:
            print(f"{year}: {scanned:,} lignes lues ({time.perf_counter() - started:.0f}s)", file=sys.stderr, flush=True)
        if str(row.get("TACT", "")).strip() != "11":
            continue
        region = str(row.get("REGION", "")).strip().zfill(2)
        try:
            age = int(str(row.get("AGEREV", "")).strip())
            sex = int(str(row.get("SEXE", "")).strip())
            weight = float(str(row.get("IPONDI", "0")).strip().replace(",", ".") or 0)
            group = int(str(row.get("CS1" if old_format else "GS", "")).strip())
            category = str(row.get("CS3" if old_format else "CS", "")).strip()
        except (TypeError, ValueError):
            continue
        if region not in REGIONS or not 0 <= age <= 120 or sex not in (1, 2) or group not in range(1, 7) or category not in CATEGORIES:
            continue
        groups[(region, age, sex, group)][0] += weight
        groups[(region, age, sex, group)][1] += 1
        categories[(region, age, sex, group, category)][0] += weight
        categories[(region, age, sex, group, category)][1] += 1
    output: list[dict[str, object]] = []
    nomenclature = "PCS 2003" if old_format else "PCS 2020"
    for (region, age, sex, group), (effectif, count) in groups.items():
        output.append({"annee": year, "code_region": region, "age": age, "code_sexe": sex,
                       "niveau_csp": "groupe_6", "code_groupe_csp": group,
                       "code_csp": str(group), "effectif": effectif, "nb_lignes_source": int(count),
                       "nomenclature_csp": nomenclature})
    for (region, age, sex, group, category), (effectif, count) in categories.items():
        output.append({"annee": year, "code_region": region, "age": age, "code_sexe": sex,
                       "niveau_csp": "categorie_29", "code_groupe_csp": group,
                       "code_csp": category, "effectif": effectif, "nb_lignes_source": int(count),
                       "nomenclature_csp": nomenclature})
    references: defaultdict[tuple[int, str, int, int, str], float] = defaultdict(float)
    for row in output:
        references[(year, str(row["code_region"]), int(row["age"]), int(row["code_sexe"]), str(row["niveau_csp"]))] += float(row["effectif"])
    for row in output:
        ref = references[(year, str(row["code_region"]), int(row["age"]), int(row["code_sexe"]), str(row["niveau_csp"]))]
        row["population_reference"] = ref
        row["part_csp_pct"] = 100.0 * float(row["effectif"]) / ref if ref else None
        row["region"] = REGIONS[str(row["code_region"])]
        age = int(row["age"])
        row["tranche_age"] = "Moins de 20 ans" if age < 20 else f"{age // 10 * 10} à {age // 10 * 10 + 9} ans" if age < 80 else "80 ans ou plus"
        row["tranche_age_ordre"] = 0 if age < 20 else 80 if age >= 80 else (age // 10) * 10
        row["sexe"] = "Hommes" if int(row["code_sexe"]) == 1 else "Femmes"
        group = str(row["code_groupe_csp"])
        row["groupe_csp"] = GROUPES[group]
        row["csp"] = GROUPES[group] if row["niveau_csp"] == "groupe_6" else CATEGORIES[str(row["code_csp"])]
        row["champ_population"] = "Actifs ayant un emploi (TACT=11)"
        row["source"] = f"Insee, Recensement de la population {year}, individus localisés à la région"
    return output


def _write_aggregated_rows(rows: list[dict[str, object]], output: Path) -> int:
    import pandas as pd
    frame = pd.DataFrame(rows)
    # Registering the small aggregate (not the individual file) keeps the
    # memory footprint bounded and lets DuckDB write compressed Parquet.
    con = duckdb.connect()
    con.register("aggregated_rows", frame)
    temp = output.with_suffix(".tmp.parquet")
    temp.unlink(missing_ok=True)
    con.execute(f"COPY aggregated_rows TO '{_sql_path(temp)}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    temp.replace(output)
    con.close()
    return len(rows)


def _sql_path(path: Path) -> str:
    return path.as_posix().replace("'", "''")


def build_year(source: Path, year: int, output: Path, staging_root: Path) -> dict[str, object]:
    # CSV and DBF are streamed directly from the archive.  This avoids
    # expanding a 600--700 MB ZIP into several gigabytes just to retain a few
    # thousand aggregate cells.
    if source.suffix.lower() == ".zip":
        rows, fmt, archive = _zip_member_rows(source)
        try:
            aggregated = _aggregate_rows(rows, year, old_format=year <= 2022)
        finally:
            archive.close()
        output.parent.mkdir(parents=True, exist_ok=True)
        count = _write_aggregated_rows(aggregated, output)
        return {"year": year, "source": str(source), "output": str(output), "rows": count,
                "nomenclature": "PCS 2003" if year <= 2022 else "PCS 2020"}
    stage = staging_root / str(year)
    stage.mkdir(parents=True, exist_ok=True)
    materialized, kind = _extract_source(source, stage)
    con = duckdb.connect()
    con.execute("PRAGMA threads=4")
    source_reader = (
        f"read_parquet('{_sql_path(materialized)}')"
        if kind == "parquet"
        else f"read_csv_auto('{_sql_path(materialized)}', header=true, all_varchar=true, sample_size=-1, ignore_errors=false)"
    )
    # PCS 2003 has CS1/CS3; PCS 2020 has GS/CS.  The displayed level names
    # remain stable for the application, while `nomenclature_csp` exposes the
    # break in definitions to the user.
    # RP2022 was delivered by INSEE in the newer Parquet schema (GS/CS),
    # while the historical CSV/DBF files use CS1/CS3.  Detect the schema from
    # the actual columns instead of relying only on the year label.
    parquet_columns: set[str] = set()
    if kind == "parquet":
        parquet_columns = {str(row[0]).upper() for row in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{_sql_path(materialized)}')").fetchall()}
    old_format = ("GS" not in parquet_columns or "CS" not in parquet_columns) if kind == "parquet" else year <= 2022
    if old_format:
        group_expr = "try_cast(CS1 AS UTINYINT)"
        category_expr = "CAST(CS3 AS VARCHAR)"
        nomenclature = "PCS 2003"
    else:
        group_expr = "try_cast(GS AS UTINYINT)"
        category_expr = "CAST(CS AS VARCHAR)"
        nomenclature = "PCS 2020"
    category_codes = ",".join("'" + code + "'" for code in CATEGORIES)
    temp_output = output.with_suffix(".tmp.parquet")
    temp_output.unlink(missing_ok=True)
    query = f"""
      COPY (
        WITH raw AS (
          SELECT CAST(REGION AS VARCHAR) AS code_region,
                 try_cast(AGEREV AS UTINYINT) AS age,
                 try_cast(SEXE AS UTINYINT) AS code_sexe,
                 CAST(TACT AS VARCHAR) AS tact,
                 try_cast(IPONDI AS DOUBLE) AS ipondi,
                 {group_expr} AS code_groupe_csp,
                 {category_expr} AS code_csp
            FROM {source_reader}
           WHERE CAST(TACT AS VARCHAR) = '11'
             AND try_cast(AGEREV AS INTEGER) BETWEEN 0 AND 120
             AND CAST(SEXE AS VARCHAR) IN ('1','2')
             AND {group_expr} BETWEEN 1 AND 6
             AND {category_expr} IN ({category_codes})
        ), groups AS (
          SELECT {year}::SMALLINT AS annee, code_region, age, code_sexe,
                 'groupe_6'::VARCHAR AS niveau_csp, code_groupe_csp,
                 SUM(ipondi)::DOUBLE AS effectif, COUNT(*)::BIGINT AS nb_lignes_source
            FROM raw GROUP BY ALL
        ), categories AS (
          SELECT {year}::SMALLINT AS annee, code_region, age, code_sexe,
                 'categorie_29'::VARCHAR AS niveau_csp, code_groupe_csp,
                 code_csp, SUM(ipondi)::DOUBLE AS effectif,
                 COUNT(*)::BIGINT AS nb_lignes_source
            FROM raw GROUP BY ALL
        ), levels AS (
          SELECT annee, code_region, age, code_sexe, niveau_csp, code_groupe_csp,
                 CAST(code_groupe_csp AS VARCHAR) AS code_csp, effectif, nb_lignes_source FROM groups
          UNION ALL
          SELECT annee, code_region, age, code_sexe, niveau_csp, code_groupe_csp,
                 code_csp, effectif, nb_lignes_source FROM categories
        ), labeled AS (
          SELECT *,
             CASE WHEN age < 20 THEN 'Moins de 20 ans'
                  WHEN age < 30 THEN '20 à 29 ans' WHEN age < 40 THEN '30 à 39 ans'
                  WHEN age < 50 THEN '40 à 49 ans' WHEN age < 60 THEN '50 à 59 ans'
                  WHEN age < 70 THEN '60 à 69 ans' WHEN age < 80 THEN '70 à 79 ans'
                  ELSE '80 ans ou plus' END AS tranche_age,
             CASE WHEN age < 20 THEN 0 WHEN age >= 80 THEN 80 ELSE floor(age / 10) * 10 END::UTINYINT AS tranche_age_ordre
          FROM levels
        ), with_labels AS (
          SELECT annee, code_region,
                 CASE code_region {''.join(f" WHEN '{k}' THEN '{v.replace(chr(39), chr(39)*2)}'" for k,v in REGIONS.items())} ELSE 'Autre' END AS region,
                 age, tranche_age, tranche_age_ordre, code_sexe,
                 CASE code_sexe WHEN 1 THEN 'Hommes' WHEN 2 THEN 'Femmes' END AS sexe,
                 niveau_csp, code_groupe_csp,
                 CASE code_groupe_csp {''.join(f" WHEN {k} THEN '{v.replace(chr(39), chr(39)*2)}'" for k,v in GROUPES.items())} END AS groupe_csp,
                 code_csp,
                 CASE code_csp {''.join(f" WHEN '{k}' THEN '{v.replace(chr(39), chr(39)*2)}'" for k,v in CATEGORIES.items())} ELSE CASE code_csp {''.join(f" WHEN '{k}' THEN '{v.replace(chr(39), chr(39)*2)}'" for k,v in GROUPES.items())} END END AS csp,
                 effectif, nb_lignes_source
            FROM labeled
        ), refs AS (
          SELECT *, SUM(effectif) OVER (PARTITION BY annee, code_region, age, code_sexe, niveau_csp)::DOUBLE AS population_reference
            FROM with_labels
        )
        SELECT *, 100.0 * effectif / NULLIF(population_reference, 0) AS part_csp_pct,
               '{nomenclature}'::VARCHAR AS nomenclature_csp,
               'Actifs ayant un emploi (TACT=11)'::VARCHAR AS champ_population,
               'Insee, Recensement de la population {year}, individus localisés à la région'::VARCHAR AS source
          FROM refs
         ORDER BY annee, code_region, age, code_sexe, niveau_csp, code_csp
      ) TO '{_sql_path(temp_output)}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)
    """
    con.execute(query)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.unlink(missing_ok=True)
    temp_output.replace(output)
    count = con.execute(f"SELECT count(*) FROM read_parquet('{_sql_path(output)}')").fetchone()[0]
    con.close()
    return {"year": year, "source": str(source), "output": str(output), "rows": int(count), "nomenclature": nomenclature}


def build(root: Path, years: list[int]) -> dict[str, object]:
    processed = root / "processed"
    processed.mkdir(parents=True, exist_ok=True)
    sources, status = find_sources(root, years)
    # Keep staging below the existing temporary workspace.  Some Windows
    # security policies make a freshly-created directory directly beside the
    # downloaded archives non-browsable while another download is running.
    staging = root / "tmp" / "csp-build-run"
    if staging.exists():
        shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True, exist_ok=True)
    built: list[dict[str, object]] = []
    try:
        for year, source in sorted(sources.items()):
            built.append(build_year(source, year, processed / f"csp_core_{year}.parquet", staging))
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    if built:
        con = duckdb.connect()
        # An incremental run (for example when 2022 finishes downloading)
        # must retain the already-built annual cores instead of replacing the
        # consolidated file with the single newly requested year.
        outputs = [str(path) for path in sorted(processed.glob("csp_core_*.parquet"))]
        output = root / "csp_core.parquet"
        temp = root / "csp_core.tmp.parquet"
        temp.unlink(missing_ok=True)
        paths = ",".join("'" + _sql_path(Path(item)) + "'" for item in outputs)
        con.execute(f"COPY (SELECT * FROM read_parquet([{paths}], union_by_name=true)) TO '{_sql_path(temp)}' (FORMAT PARQUET, COMPRESSION ZSTD, ROW_GROUP_SIZE 100000)")
        output.unlink(missing_ok=True)
        temp.replace(output)
        con.close()
    manifest = {"years": sorted(status), "status": status, "built": built, "output": str(root / "csp_core.parquet") if built else None}
    (root / "csp_build_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    # Les scripts vivent dans `tools/`, les données CSP dans `data/csp/`.
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parent.parent / "data" / "csp")
    parser.add_argument("--years", default="2015,2016,2017,2018,2019,2020,2021,2022,2023")
    args = parser.parse_args()
    years = [int(item) for item in args.years.split(",") if item.strip()]
    print(json.dumps(build(args.root.resolve(), years), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
