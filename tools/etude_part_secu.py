"""Reproduit l'étude hospitalisation via les mêmes calculs que l'outil.

Depuis la racine : app/backend/.venv/Scripts/python.exe tools/etude_part_secu.py
Lecture seule, résultats JSON sur la sortie standard (montants en euros).
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "backend"))
from app.analysis import ExtractionRequest, extraction_preview
from app.repository import REGIONS, repository
from app.studio import reliability_metadata


def study():
    measures = ["reimbursed", "expense", "coverage", "out_of_pocket"]
    scopes = [None, "Hospitalisation Sejour", "Hospitalisation Honoraires",
              "Hospitalisation Forf.Journalie", "Dotations & forfaits établissements", "Transport"]
    results = {}
    for post in scopes:
        request = ExtractionRequest(start_year=2022, end_year=2025,
            grand_post="Hospitalisation", post=post, dimensions=["year"], measures=measures)
        rows = extraction_preview(repository, request, REGIONS)["rows"]
        by_year = {row["year"]: row for row in rows}
        before, after = by_year[2023], by_year[2024]
        changes = {key: 100 * (after[key] / before[key] - 1)
                   for key in ["reimbursed", "expense", "out_of_pocket"] if before[key]}
        changes["coverage_points"] = after["coverage"] - before["coverage"]
        changes["remaining_delta_eur"] = after["out_of_pocket"] - before["out_of_pocket"]
        results[post or "Hospitalisation (ensemble)"] = {"rows": rows, "change_2023_2024": changes}
    reliability = reliability_metadata(repository)
    return {"cube": str(repository.cube_path), "filters": {
        "grand_post": "Hospitalisation", "regions": [], "ages": [], "sexes": [],
        "ald": None, "insurances": [], "envelopes": [], "time_axis": "care"},
        "latest_flow": reliability["latest_flow"],
        "consolidated_through": reliability["consolidated_through"],
        "completeness_all_posts": reliability["completeness"], "results": results}


if __name__ == "__main__":
    print(json.dumps(study(), ensure_ascii=True, indent=2))
