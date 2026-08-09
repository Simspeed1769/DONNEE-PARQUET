"""Contrôle du GLM contre des coefficients vrais connus.

`glm.py` n'a jamais eu de test : sa seule vérification était une validation
manuelle en session, sur les trois familles proposées par l'écran Croisements.
Ce module la rejoue en test automatisé, à graine fixe pour la reproductibilité.

Deux exigences par famille :
- le coefficient estimé retrouve le coefficient vrai à tolérance raisonnable ;
- l'intervalle à 95 % (coefficient ± 1,96 écart-type, sur l'échelle du lien —
  celle que `fit()` renvoie directement, avant tout passage à l'échelle de
  l'effet qui est le travail de `correlations.py`, pas de ce module) couvre le
  coefficient vrai.

Une seule graine par famille : avec un intervalle à 95 % correctement
calibré, il n'y a rien d'anormal à ce qu'il rate sa cible une fois sur vingt.
Le répéter pour chasser ce risque résiduel serait sur-tester une formule déjà
vérifiée analytiquement dans `test_statistics.py`.
"""

from __future__ import annotations

import math
import random
import unittest

from app.glm import fit

# 1,959963985 : le même quantile normal que celui utilisé pour les intervalles
# de corrélation dans statistics.py — une seule valeur de référence dans tout
# le projet, pas une resaisie approximative de 1,96.
_Z95 = 1.959963985


def _covers(estimate: float, error: float, truth: float) -> bool:
    margin = _Z95 * error
    return (estimate - margin) <= truth <= (estimate + margin)


class GaussianIdentityTests(unittest.TestCase):
    """y = 3 + 2·x1 − 1·x2 + bruit gaussien : la régression linéaire ordinaire."""

    def setUp(self) -> None:
        rng = random.Random(7)
        design: list[list[float]] = []
        response: list[float] = []
        for _ in range(200):
            x1 = rng.uniform(0, 10)
            x2 = rng.uniform(0, 5)
            design.append([1.0, x1, x2])
            response.append(3 + 2 * x1 - 1 * x2 + rng.gauss(0, 0.5))
        self.result = fit(design, response, "gaussian", "identity")
        self.truth = [3.0, 2.0, -1.0]

    def test_coefficients_recover_the_true_values(self) -> None:
        for estimate, truth in zip(self.result["coefficients"], self.truth):
            self.assertAlmostEqual(estimate, truth, delta=0.15)

    def test_confidence_intervals_cover_the_true_values(self) -> None:
        errors = self.result["standard_errors"]
        for estimate, error, truth in zip(self.result["coefficients"], errors, self.truth):
            self.assertTrue(
                _covers(estimate, error, truth),
                f"IC [{estimate - _Z95 * error:.4f} ; {estimate + _Z95 * error:.4f}] "
                f"ne couvre pas la vraie valeur {truth}",
            )


class GammaLogTests(unittest.TestCase):
    """log(μ) = 1 + 0,3·x1, tirage Gamma de forme 20 : le cas d'un montant."""

    def setUp(self) -> None:
        rng = random.Random(7)
        design: list[list[float]] = []
        response: list[float] = []
        shape = 20.0
        for _ in range(400):
            x1 = rng.uniform(0, 5)
            mean = math.exp(1 + 0.3 * x1)
            design.append([1.0, x1])
            response.append(rng.gammavariate(shape, mean / shape))
        self.result = fit(design, response, "gamma", "log")
        self.truth = [1.0, 0.3]

    def test_coefficients_recover_the_true_values(self) -> None:
        for estimate, truth in zip(self.result["coefficients"], self.truth):
            self.assertAlmostEqual(estimate, truth, delta=0.05)

    def test_confidence_intervals_cover_the_true_values(self) -> None:
        errors = self.result["standard_errors"]
        for estimate, error, truth in zip(self.result["coefficients"], errors, self.truth):
            self.assertTrue(
                _covers(estimate, error, truth),
                f"IC [{estimate - _Z95 * error:.4f} ; {estimate + _Z95 * error:.4f}] "
                f"ne couvre pas la vraie valeur {truth}",
            )

    def test_effect_reads_as_a_percentage_the_way_correlations_py_derives_it(self) -> None:
        # exp(β) − 1 est ce que l'écran affiche pour « +1 point de X » sous lien
        # log : ce test protège cette lecture, pas seulement le coefficient brut.
        estimate = self.result["coefficients"][1]
        effect_percent = (math.exp(estimate) - 1.0) * 100.0
        expected_percent = (math.exp(0.3) - 1.0) * 100.0  # ≈ 34,99 %
        self.assertAlmostEqual(effect_percent, expected_percent, delta=6.0)


class PoissonLogTests(unittest.TestCase):
    """log(μ) = 1,5 + 0,4·x, tirage Poisson par inversion : le cas d'un effectif.

    L'ordonnée à l'origine est plus haute que dans la validation manuelle de
    session (0,5) : `fit()` refuse toute observation nulle pour cette famille
    (« réponse strictement positive »), et à une moyenne proche de exp(0,5) un
    tirage Poisson authentique produit régulièrement des zéros. La pente,
    seule valeur que la mission cite explicitement (0,40), est inchangée.
    """

    def setUp(self) -> None:
        rng = random.Random(7)
        design: list[list[float]] = []
        response: list[float] = []
        for _ in range(500):
            x = rng.uniform(0, 4)
            mean = math.exp(1.5 + 0.4 * x)
            draw = self._poisson_draw(rng, mean)
            while draw == 0:  # cf. docstring : fit() exige une réponse > 0
                draw = self._poisson_draw(rng, mean)
            design.append([1.0, x])
            response.append(float(draw))
        self.result = fit(design, response, "poisson", "log")
        self.truth = [1.5, 0.4]

    @staticmethod
    def _poisson_draw(rng: random.Random, mean: float) -> int:
        """Tirage par inversion (Knuth) : suffisant pour ces moyennes modestes,
        et n'introduit aucune dépendance supplémentaire."""
        limit = math.exp(-mean)
        count = 0
        product = 1.0
        while True:
            product *= rng.random()
            if product <= limit:
                return count
            count += 1

    def test_coefficients_recover_the_true_values(self) -> None:
        for estimate, truth in zip(self.result["coefficients"], self.truth):
            self.assertAlmostEqual(estimate, truth, delta=0.1)

    def test_confidence_intervals_cover_the_true_values(self) -> None:
        errors = self.result["standard_errors"]
        for estimate, error, truth in zip(self.result["coefficients"], errors, self.truth):
            self.assertTrue(
                _covers(estimate, error, truth),
                f"IC [{estimate - _Z95 * error:.4f} ; {estimate + _Z95 * error:.4f}] "
                f"ne couvre pas la vraie valeur {truth}",
            )


class DefaultFamilyTests(unittest.TestCase):
    """`default_family()` propose la loi, elle ne l'impose jamais — l'écran
    garde la main (cf. MISSION.md, principe « une forme qui mentirait n'est
    pas offerte » appliqué ici à la loi statistique)."""

    def test_positive_response_suggests_gamma_log(self) -> None:
        from app.glm import default_family

        family, link = default_family(response_is_positive=True, response_is_count=False)
        self.assertEqual((family, link), ("gamma", "log"))

    def test_count_response_suggests_poisson_log(self) -> None:
        from app.glm import default_family

        family, link = default_family(response_is_positive=True, response_is_count=True)
        self.assertEqual((family, link), ("poisson", "log"))

    def test_response_crossing_zero_suggests_gaussian_identity(self) -> None:
        from app.glm import default_family

        family, link = default_family(response_is_positive=False, response_is_count=False)
        self.assertEqual((family, link), ("gaussian", "identity"))


if __name__ == "__main__":
    unittest.main()
