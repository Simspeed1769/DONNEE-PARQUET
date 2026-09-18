"""La liquidation par périmètre de prestations.

Un seul taux — celui de tout DAMIR — servait à redresser n'importe quel poste.
Or les honoraires hospitaliers se règlent plus vite que les séjours : projeter
les uns avec la cadence des autres, c'est se tromper de quelques pour cent sans
qu'aucune erreur ne le dise. Ces tests vérifient que le périmètre est bien
appliqué, que le calcul sans périmètre reste celui des métadonnées, et que la
part réglée dans l'année — la lecture simple — est là et bornée.
"""
from __future__ import annotations

import unittest

from app.analysis import FilterPayload
from app.repository import repository
from app.studio import liquidation, reliability_metadata


def _scope(**kwargs) -> FilterPayload:
    return FilterPayload(start_year=2023, end_year=2025, **kwargs)


def _rounded(result: dict) -> dict:
    """Les sommes DuckDB sont parallèles : deux appels diffèrent au dernier bit.
    On compare des valeurs arrondies, pas des flottants bruts."""
    return {
        "status": result["status"],
        "thresholds": result["thresholds"],
        "curve": [(row["delay"], round(row["value"], 6)) for row in result["curve"]],
        "completeness": [(row["year"],
                          None if row["ratio"] is None else round(row["ratio"], 6),
                          None if row["in_year"] is None else round(row["in_year"], 6))
                         for row in result["completeness"]],
    }


class LiquidationScopeTests(unittest.TestCase):
    def test_no_scope_equals_metadata(self) -> None:
        """Sans périmètre, la fonction rend exactement la cadence globale."""
        self.assertEqual(_rounded(liquidation(repository)), _rounded(reliability_metadata(repository)))

    def test_scope_changes_the_cadence(self) -> None:
        """Deux postes du même grand poste ne se liquident pas au même rythme."""
        honoraires = liquidation(repository, _scope(grand_post="Hospitalisation", post="Hospitalisation Honoraires"))
        sejours = liquidation(repository, _scope(grand_post="Hospitalisation", post="Hospitalisation Sejour"))
        self.assertTrue(honoraires["available"] and sejours["available"])
        last_h = honoraires["completeness"][-1]["ratio"]
        last_s = sejours["completeness"][-1]["ratio"]
        self.assertIsNotNone(last_h)
        self.assertIsNotNone(last_s)
        self.assertNotAlmostEqual(last_h, last_s, places=3, msg="le périmètre n'est pas appliqué")

    def test_in_year_share_is_bounded_and_absent_for_the_open_year(self) -> None:
        """La part réglée dans l'année vaut entre 0 et 1 sur les années closes,
        et n'est pas donnée pour la dernière année — elle y vaudrait 100 % par
        construction, ce qui ne dirait rien."""
        result = liquidation(repository, _scope(grand_post="Hospitalisation", post="Hospitalisation Honoraires"))
        rows = result["completeness"]
        latest_year = result["latest_flow"] // 100
        for row in rows:
            if row["year"] >= latest_year:
                self.assertIsNone(row["in_year"], f"{row['year']} : part dans l'année donnée sur une année ouverte")
            elif row["in_year"] is not None:
                self.assertGreater(row["in_year"], 0.0)
                self.assertLessEqual(row["in_year"], 1.0)
        closed = [row for row in rows if row["year"] < latest_year and row["in_year"] is not None]
        self.assertTrue(closed, "aucune année close avec une part réglée dans l'année")

    def test_population_filters_are_ignored(self) -> None:
        """Le cube des délais ne connaît pas la région : un filtre de population
        ne change rien, plutôt que de faire échouer la lecture."""
        national = liquidation(repository, _scope(grand_post="Hospitalisation"))
        regional = liquidation(repository, _scope(grand_post="Hospitalisation", regions=[84]))
        self.assertEqual(_rounded(national), _rounded(regional))

    def test_empty_scope_says_so(self) -> None:
        """Une prestation sans règlement ne produit pas une cadence à 0 %."""
        result = liquidation(repository, _scope(service_codes=[-1]))
        self.assertFalse(result["available"])
        self.assertEqual(result["completeness"], [])


if __name__ == "__main__":
    unittest.main()
