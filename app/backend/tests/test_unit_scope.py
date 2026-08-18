"""Le périmètre qui autorise un volume ou un montant moyen.

Une quantité DAMIR n'a de sens que rapportée à l'unité de sa prestation : des
boîtes, des séances, des journées, des kilomètres. La règle décide donc où l'on
peut encore lire un volume, et où l'addition cesserait de vouloir dire quelque
chose.

Elle a changé : elle n'admettait qu'une **prestation unique**, ce qui rendait
volume et moyennes inaccessibles tant qu'on n'était pas descendu au bout de la
hiérarchie. Elle admet désormais **tout niveau** — grand poste, poste,
sous-poste, prestation — et ne refuse plus que « tous les grands postes ».

Ces tests fixent les deux bords de la règle et la réserve qui l'accompagne :
c'est elle qui empêche de lire un ordre de grandeur comme un tarif.
"""
from __future__ import annotations

import unittest

from app.analysis import UNIT_DEPENDENT_KEYS, METRICS, unit_caveat, unit_scope
from app.explore import ExploreRequest
from app.panorama import PanoramaRequest, _availability


class UnitScopeTests(unittest.TestCase):
    def test_every_hierarchy_level_is_admitted(self) -> None:
        cases = {
            "prestation": ExploreRequest(start_year=2015, end_year=2024, service_codes=[3313]),
            "sous-poste": ExploreRequest(start_year=2015, end_year=2024, sub_post="Un sous-poste"),
            "poste": ExploreRequest(start_year=2015, end_year=2024, post="Un poste"),
            "grand poste": ExploreRequest(start_year=2015, end_year=2024, grand_post="Pharmacie"),
        }
        for expected, payload in cases.items():
            level, refusal = unit_scope(payload)
            self.assertEqual(level, expected)
            self.assertIsNone(refusal, f"{expected} devrait être admis")

    def test_all_postes_together_is_refused(self) -> None:
        """Le seul refus qui reste, et le seul qui se justifie : additionner des
        boîtes, des journées et des kilomètres ne produit rien d'interprétable."""
        level, refusal = unit_scope(ExploreRequest(start_year=2015, end_year=2024))
        self.assertIsNone(level)
        self.assertIsNotNone(refusal)
        self.assertIn("grand poste", refusal)

    def test_two_prestations_fall_back_to_the_hierarchy(self) -> None:
        """Deux prestations ne font pas une unité : sans poste choisi, c'est un
        refus — la règle ne se laisse pas contourner par une sélection multiple."""
        level, refusal = unit_scope(
            ExploreRequest(start_year=2015, end_year=2024, service_codes=[3313, 2111]))
        self.assertIsNone(level)
        self.assertIsNotNone(refusal)

    def test_the_caveat_appears_above_the_prestation(self) -> None:
        """Sur une prestation, l'unité est une : aucune réserve. Au-dessus, la
        réserve existe et **nomme le niveau**, sans quoi elle ne dirait pas de
        combien on s'éloigne du tarif."""
        self.assertIsNone(unit_caveat("prestation"))
        self.assertIsNone(unit_caveat(None))
        for level in ("sous-poste", "poste", "grand poste"):
            caveat = unit_caveat(level)
            self.assertIsNotNone(caveat)
            self.assertIn(level, caveat)
            self.assertIn("jamais un tarif", caveat)


class PanoramaAvailabilityTests(unittest.TestCase):
    """Les trois mesures visées sont exactement celles dont l'unité dépend de la
    prestation. On les prend par leur `unit_key` plutôt que par leur nom : c'est
    ce que fait le code, et un test qui les listerait à la main ne verrait pas
    une quatrième mesure ajoutée demain."""

    def unit_keys(self) -> set[str]:
        return {key for key, metric in METRICS.items()
                if metric.unit_key in UNIT_DEPENDENT_KEYS}

    def refused(self, payload: PanoramaRequest) -> set[str]:
        return {key for key, reason in _availability(payload).items() if reason}

    def test_a_grand_poste_now_opens_volume_and_averages(self) -> None:
        refused = self.refused(PanoramaRequest(
            start_year=2015, end_year=2024, grand_post="Pharmacie"))
        self.assertEqual(refused, set(), "un grand poste doit suffire")

    def test_no_poste_still_refuses(self) -> None:
        self.assertEqual(
            self.refused(PanoramaRequest(start_year=2015, end_year=2024)),
            self.unit_keys())

    def test_a_single_service_subject_counts_as_a_prestation(self) -> None:
        """Le panorama désigne sa prestation par son **sujet**, pas par le filtre
        `service_codes` : la règle doit lire les deux."""
        self.assertEqual(
            self.refused(PanoramaRequest(
                start_year=2015, end_year=2024,
                subject_dimension="service", subjects=["3313"])),
            set())

    def test_two_subjects_are_not_a_unit(self) -> None:
        self.assertEqual(
            self.refused(PanoramaRequest(
                start_year=2015, end_year=2024,
                subject_dimension="service", subjects=["3313", "2111"])),
            self.unit_keys())


if __name__ == "__main__":
    unittest.main()
