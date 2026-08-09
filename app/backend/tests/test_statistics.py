"""Contrôle des formules statistiques contre des valeurs de référence.

Ces fonctions sont écrites à la main faute de SciPy : elles doivent donc être
vérifiées ailleurs que sur elles-mêmes. Les valeurs attendues proviennent de jeux
de données publiés (quartet d'Anscombe) et de tables de Student.
"""

from __future__ import annotations

import unittest

from app.statistics import (
    correlation_report,
    minimum_detectable_r,
    pearson,
    spearman,
    student_two_sided_p,
)

# Anscombe I : r = 0,816, pente 0,500, ordonnée à l'origine 3,000.
ANSCOMBE_X = [10, 8, 13, 9, 11, 14, 6, 4, 12, 7, 5]
ANSCOMBE_Y = [8.04, 6.95, 7.58, 8.81, 8.33, 9.96, 7.24, 4.26, 10.84, 4.82, 5.68]


class StatisticsTests(unittest.TestCase):
    def test_pearson_matches_published_value(self) -> None:
        self.assertAlmostEqual(pearson(ANSCOMBE_X, ANSCOMBE_Y), 0.8164205, places=6)

    def test_regression_line_matches_published_value(self) -> None:
        report = correlation_report(ANSCOMBE_X, ANSCOMBE_Y)
        self.assertAlmostEqual(report["slope"], 0.5001, places=4)
        self.assertAlmostEqual(report["intercept"], 3.0001, places=4)

    def test_p_value_matches_student_table(self) -> None:
        # t = 2,228 à 10 degrés de liberté correspond au seuil bilatéral de 5 %.
        self.assertAlmostEqual(student_two_sided_p(2.228, 10), 0.05, places=4)
        self.assertAlmostEqual(student_two_sided_p(3.169, 10), 0.01, places=4)

    def test_spearman_is_one_on_a_monotone_relation(self) -> None:
        # Relation strictement croissante mais non linéaire : Pearson descend,
        # Spearman reste à 1. C'est la raison d'être des deux coefficients.
        xs = [1, 2, 3, 4, 5]
        ys = [1, 4, 9, 16, 25]
        self.assertAlmostEqual(spearman(xs, ys), 1.0, places=9)
        self.assertLess(pearson(xs, ys), 1.0)

    def test_spearman_shares_ranks_between_ties(self) -> None:
        self.assertAlmostEqual(spearman([1, 2, 2, 3], [1, 2, 3, 4]), 0.9486833, places=6)

    def test_confidence_interval_stays_inside_bounds(self) -> None:
        report = correlation_report([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6.01])
        self.assertGreater(report["ci_low"], -1.0)
        self.assertLess(report["ci_high"], 1.0)

    def test_a_flat_series_has_no_correlation(self) -> None:
        # Variance nulle : le coefficient n'existe pas et ne doit pas valoir zéro,
        # qui se lirait comme une absence de relation mesurée.
        self.assertIsNone(pearson([1, 1, 1, 1], [1, 2, 3, 4]))

    def test_too_few_points_yield_no_coefficient(self) -> None:
        report = correlation_report([1, 2], [3, 4])
        self.assertIsNone(report["pearson"])
        self.assertEqual(report["n"], 2)

    def test_minimum_detectable_r_matches_published_thresholds(self) -> None:
        # Seuils classiques de signification au risque de 5 %.
        self.assertAlmostEqual(minimum_detectable_r(12), 0.5760, places=3)
        self.assertAlmostEqual(minimum_detectable_r(17), 0.4821, places=3)
        self.assertAlmostEqual(minimum_detectable_r(30), 0.3610, places=3)

    def test_minimum_detectable_r_falls_as_observations_grow(self) -> None:
        thresholds = [minimum_detectable_r(n) for n in (10, 20, 50, 100)]
        self.assertEqual(thresholds, sorted(thresholds, reverse=True))


if __name__ == "__main__":
    unittest.main()
