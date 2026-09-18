"""Le taux AMO est un ratio de sommes, jamais une moyenne de taux."""
import unittest

from app.analysis import ExtractionRequest, METRICS, extraction_preview
from app.explore import COMPONENTS, measure_value
from app.panorama import PanoramaRequest, panorama
from app.repository import REGIONS, repository


class CoverageTests(unittest.TestCase):
    def test_weighted_ratio_and_missing_denominator(self):
        components = dict.fromkeys(COMPONENTS, 0.0)
        # 10/10 et 45/90 : le total est 55 %, pas la moyenne simple 75 %.
        components.update(rem=55, dep=100)
        self.assertEqual(measure_value(components, "coverage"), 55)
        components["dep"] = 0
        self.assertIsNone(measure_value(components, "coverage"))

    def test_abnormal_ratio_is_not_silently_clamped(self):
        components = dict.fromkeys(COMPONENTS, 0.0)
        components.update(rem=120, dep=100)
        self.assertEqual(measure_value(components, "coverage"), 120)

    def test_panorama_matches_extraction_for_hospitalisation(self):
        filters = dict(start_year=2023, end_year=2024, grand_post="Hospitalisation")
        result = panorama(repository, PanoramaRequest(**filters, facets=["sex"]), REGIONS)
        measure = next(m for m in result["measures"] if m["key"] == "coverage")
        self.assertEqual(measure["label"], METRICS["coverage"].label)
        self.assertFalse(measure["additive"])
        rows = extraction_preview(repository, ExtractionRequest(
            **filters, dimensions=["year"], measures=["coverage", "reimbursed", "expense"]), REGIONS)["rows"]
        total = result["subjects"][0]["total"]["components"]
        for row in rows:
            index = result["years"].index(row["year"])
            components = {key: total[key][index] for key in COMPONENTS}
            self.assertAlmostEqual(measure_value(components, "coverage"), row["coverage"], places=8)
            self.assertAlmostEqual(row["coverage"], 100 * row["reimbursed"] / row["expense"], places=8)
