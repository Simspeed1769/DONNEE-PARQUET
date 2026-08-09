from __future__ import annotations

import unittest

from app.analysis import AnalysisRequest, POSTES_SANS_BASE, run_analysis
from app.main import REGIONS, repository


class AnalysisParityTests(unittest.TestCase):
    def assert_amounts_equal(self, actual: list[float], expected: list[float]) -> None:
        self.assertEqual(len(actual), len(expected))
        for observed, reference in zip(actual, expected, strict=True):
            self.assertAlmostEqual(observed, reference, delta=max(abs(reference) * 1e-12, 1e-6))

    def test_annual_evolution_matches_cube(self) -> None:
        request = AnalysisRequest(start_year=2020, end_year=2025, mode="evolution", measure="reimbursed")
        result = run_analysis(repository, request, REGIONS)
        direct = repository.query(
            """SELECT soi_ann AS year, SUM(rem)::DOUBLE AS value
               FROM cube WHERE soi_ann BETWEEN 2020 AND 2025 GROUP BY 1 ORDER BY 1"""
        )
        self.assertEqual(
            [point["x"] for point in result["series"][0]["points"]],
            [int(row["year"]) for row in direct],
        )
        self.assert_amounts_equal(
            [point["y"] for point in result["series"][0]["points"]],
            [float(row["value"] or 0) for row in direct],
        )

    def test_women_men_matches_filtered_cube(self) -> None:
        request = AnalysisRequest(
            start_year=2022,
            end_year=2024,
            mode="women_men",
            measure="expense",
            grand_post="Pharmacie",
            regions=[11],
        )
        result = run_analysis(repository, request, REGIONS)
        direct = repository.query(
            """SELECT c.soi_ann AS year, c.sexe AS sex, SUM(c.dep)::DOUBLE AS value
               FROM cube c LEFT JOIN transco t USING (prs_nat)
               WHERE c.soi_ann BETWEEN 2022 AND 2024
                 AND t.grand_poste = 'Pharmacie' AND c.region = 11 AND c.sexe IN (1, 2)
               GROUP BY 1, 2 ORDER BY 1, 2"""
        )
        for series, sex in zip(result["series"], (2, 1), strict=True):
            expected = [float(row["value"] or 0) for row in direct if int(row["sex"]) == sex]
            self.assert_amounts_equal([point["y"] for point in series["points"]], expected)

    def test_pharmacy_breakdown_matches_sub_posts(self) -> None:
        request = AnalysisRequest(
            start_year=2020,
            end_year=2025,
            mode="breakdown",
            measure="reimbursed",
            grand_post="Pharmacie",
            dimension="auto",
        )
        result = run_analysis(repository, request, REGIONS)
        direct = repository.query(
            """SELECT COALESCE(t.sous_poste, 'Non classé') AS label,
                      SUM(c.rem)::DOUBLE AS value
               FROM cube c LEFT JOIN transco t USING (prs_nat)
               WHERE c.soi_ann BETWEEN 2020 AND 2025 AND t.grand_poste = 'Pharmacie'
               GROUP BY 1 HAVING SUM(c.rem) IS NOT NULL ORDER BY value DESC LIMIT 20"""
        )
        self.assertEqual([bar["label"] for bar in result["bars"]], [str(row["label"]) for row in direct])
        self.assert_amounts_equal(
            [bar["value"] for bar in result["bars"]],
            [float(row["value"] or 0) for row in direct],
        )

    def test_copayment_keeps_streamlit_exclusions(self) -> None:
        request = AnalysisRequest(start_year=2023, end_year=2024, mode="evolution", measure="copayment")
        result = run_analysis(repository, request, REGIONS)
        placeholders = ",".join("?" for _ in POSTES_SANS_BASE)
        direct = repository.query(
            f"""SELECT c.soi_ann AS year, (SUM(c.bse_ref) - SUM(c.rem_ref))::DOUBLE AS value
                FROM cube c
                WHERE c.soi_ann BETWEEN 2023 AND 2024
                  AND c.prs_nat NOT IN (
                    SELECT prs_nat FROM transco WHERE grand_poste IN ({placeholders})
                  )
                GROUP BY 1 ORDER BY 1""",
            list(POSTES_SANS_BASE),
        )
        self.assert_amounts_equal(
            [point["y"] for point in result["series"][0]["points"]],
            [float(row["value"] or 0) for row in direct],
        )


if __name__ == "__main__":
    unittest.main()
