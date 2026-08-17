"""Le tableau croisé.

Trois choses à verrouiller, et ce sont les trois que la refonte pouvait
casser :

1. **Le contrat central.** La route ne renvoie jamais un indicateur calculé.
   Si un jour quelqu'un ajoute `"value": 147.09` à une cellule pour « rendre
   service » au client, changer de mesure redeviendrait une requête et la
   formule existerait à deux endroits.
2. **Les totaux sont les sommes des cellules.** Une composante est additive :
   un total qui divergerait de la somme signalerait une double agrégation.
3. **Le plafond de lisibilité**, avec un message en français.
"""
from __future__ import annotations

import unittest

from app.main import REGIONS, repository
from app.pivot import COMPONENTS, MAX_CELLS, PivotRequest, pivot


def _request(**overrides) -> PivotRequest:
    payload = {"start_year": 2019, "end_year": 2021, "rows": "grand_post", "columns": "year"}
    payload.update(overrides)
    return PivotRequest(**payload)


class PivotTests(unittest.TestCase):
    def assert_amount_equal(self, actual: float, expected: float) -> None:
        """Tolérance *relative* : sur 5×10^10, la somme flottante de milliers de
        cellules dérive de quelques 1e-5 sans qu'aucun calcul soit faux."""
        self.assertAlmostEqual(actual, expected, delta=max(abs(expected) * 1e-12, 1e-6))

    def test_returns_components_not_indicators(self) -> None:
        """Composantes brutes et formules, jamais une valeur toute faite."""
        result = pivot(repository, _request(), REGIONS)
        self.assertTrue(result["cells"], "le croisement ne doit pas être vide")
        cell = result["cells"][0]
        for bundle in ("period", "first", "last"):
            self.assertEqual(set(cell[bundle]), set(COMPONENTS))
        # Aucune clé d'indicateur dérivé ne doit traîner dans une cellule.
        self.assertEqual(set(cell) - {"row", "column", "period", "first", "last"}, set())
        # …et les formules voyagent, pour que le client puisse dériver.
        measures = {m["key"]: m for m in result["measures"]}
        self.assertIn("reimbursed", measures)
        self.assertIn("formula_spec", measures["reimbursed"])

    def test_row_totals_equal_the_sum_of_their_cells(self) -> None:
        result = pivot(repository, _request(), REGIONS)
        cells_by_row: dict[str, list[dict]] = {}
        for cell in result["cells"]:
            cells_by_row.setdefault(cell["row"], []).append(cell)

        for total in result["row_totals"]:
            expected = sum(cell["period"]["rem"] for cell in cells_by_row[total["row"]])
            self.assert_amount_equal(total["period"]["rem"], expected)

    def test_grand_total_equals_the_sum_of_row_totals(self) -> None:
        result = pivot(repository, _request(), REGIONS)
        expected = sum(total["period"]["rem"] for total in result["row_totals"])
        self.assert_amount_equal(result["total"]["period"]["rem"], expected)

    def test_first_and_last_year_bundles_are_the_right_years(self) -> None:
        """« Variation » et « TCAM » se dérivent de ces deux paquets.

        S'ils portaient la période entière, la variation vaudrait zéro sans
        que rien ne le dise.
        """
        result = pivot(repository, _request(start_year=2019, end_year=2021), REGIONS)
        self.assertEqual(result["first_year"], 2019)
        self.assertEqual(result["last_year"], 2021)
        # Le cumul de la période est nécessairement supérieur ou égal à une
        # seule de ses années.
        total = result["total"]
        self.assertGreater(total["period"]["rem"], total["first"]["rem"])
        self.assertGreater(total["period"]["rem"], total["last"]["rem"])

    def test_same_dimension_on_both_axes_is_refused(self) -> None:
        with self.assertRaises(ValueError) as caught:
            pivot(repository, _request(rows="region", columns="region"), REGIONS)
        self.assertIn("même dimension", str(caught.exception))

    def test_too_many_cells_is_refused_in_french(self) -> None:
        """Prestations × régions dépasse largement le plafond de lisibilité."""
        with self.assertRaises(ValueError) as caught:
            pivot(repository, _request(rows="service", columns="region"), REGIONS)
        message = str(caught.exception)
        self.assertIn(str(MAX_CELLS), message)
        self.assertIn("cellules", message)

    def test_year_axis_is_ordered_by_time(self) -> None:
        result = pivot(repository, _request(rows="sex", columns="year"), REGIONS)
        labels = [column["label"] for column in result["column_keys"]]
        self.assertEqual(labels, sorted(labels, key=int))

    def test_matches_the_cube_for_a_known_slice(self) -> None:
        """Le croisement doit retrouver ce que le cube répond directement.

        C'est le contrôle qui attrape une jointure ou un filtre de travers :
        un tableau peut être cohérent avec lui-même et faux malgré tout.
        """
        result = pivot(repository, _request(start_year=2020, end_year=2020,
                                            rows="sex", columns="year"), REGIONS)
        row = repository.query(
            "SELECT SUM(rem)::DOUBLE AS value FROM cube WHERE soi_ann = ?", [2020],
        )
        self.assert_amount_equal(result["total"]["period"]["rem"], row[0]["value"])


if __name__ == "__main__":
    unittest.main()
