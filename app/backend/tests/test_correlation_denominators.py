"""Les dénominateurs des croisements, confrontés à la source qui fait autorité.

La table de la Cartographie est départementale **et** porte ses propres
agrégats : `dept = '999'` totalise la région, `cla_age_5 = 'tsage'` totalise les
tranches, `sexe = '9'` totalise les sexes. Additionner un agrégat aux cellules
qu'il résume compte deux fois la même population — et personne ne le voit, parce
qu'un dénominateur doublé ne fait pas planter une corrélation : il en divise
simplement le résultat par deux.

Ces tests comparent donc ce que produisent `_population` et `_patho_series` à la
valeur lue directement sur la ligne qui fait autorité. Ils tiendraient encore si
le SQL était réécrit autrement : c'est le nombre qui est vérifié, pas la requête.
"""

from __future__ import annotations

import unittest

from app.correlations import (
    CorrelationRequest,
    IndicatorRef,
    _patho_series,
    _population,
)
from app.main import repository

#: Île-de-France : assez grande pour que l'erreur d'un facteur deux saute aux
#: yeux, et présente dans les douze régions communes aux sources.
IDF = "11"
YEAR = 2022


def _request(**overrides) -> CorrelationRequest:
    payload = {
        "unit": "region",
        "x": IndicatorRef(source="patho", metric="patho.prevalence", selection="Diabète"),
        "y": IndicatorRef(source="damir", metric="damir.spend_per_capita"),
        "start_year": YEAR,
        "end_year": YEAR,
    }
    payload.update(overrides)
    return CorrelationRequest(**payload)


@unittest.skipUnless(repository.has_pathologies, "La Cartographie n'est pas chargée.")
class DenominatorTests(unittest.TestCase):
    def _authoritative_population(self, year: int = YEAR) -> float:
        """La population de référence telle que la fiche Pathologies la lit."""
        rows = repository.query(
            """SELECT MAX(npop)::DOUBLE AS value FROM pathologies
               WHERE YEAR(annee) = ? AND region = ? AND dept = '999'
                 AND cla_age_5 = 'tsage' AND sexe = '9'""",
            [year, IDF],
        )
        return float(rows[0]["value"])

    def test_population_matches_the_authoritative_row(self) -> None:
        population = _population(repository, _request())
        self.assertIn(IDF, population)
        self.assertAlmostEqual(population[IDF], self._authoritative_population(), delta=1.0)

    def test_population_is_not_doubled_by_the_all_ages_aggregate(self) -> None:
        """Le défaut historique : `tsage` sommé avec les tranches qu'il résume.

        L'Île-de-France y pesait 25,3 millions d'habitants au lieu de 12,5.
        """
        population = _population(repository, _request())[IDF]
        self.assertLess(population, 1.5 * self._authoritative_population())

    def test_population_counts_person_years_over_a_period(self) -> None:
        """Un numérateur qui somme quatre ans appelle quatre ans de population.

        Sans quoi la dépense par habitant d'une période est mécaniquement
        multipliée par le nombre d'années qu'elle couvre.
        """
        one_year = _population(repository, _request())[IDF]
        two_years = _population(repository, _request(start_year=YEAR - 1))[IDF]
        expected = one_year + self._authoritative_population(YEAR - 1)
        self.assertAlmostEqual(two_years, expected, delta=1.0)

    def test_patients_match_the_authoritative_row(self) -> None:
        """Le numérateur souffrait du même mélange, deux fois : départements
        additionnés à leur région, tranches additionnées au tous âges."""
        rows = repository.query(
            """SELECT SUM(ntop)::DOUBLE AS value FROM pathologies
               WHERE YEAR(annee) = ? AND region = ? AND dept = '999'
                 AND cla_age_5 = 'tsage' AND sexe = '9' AND patho_niv1 = ?""",
            [YEAR, IDF, "Diabète"],
        )
        expected = float(rows[0]["value"])
        series = _patho_series(
            repository, "patho.patients", _request(), "Diabète",
        )
        self.assertIn(IDF, series)
        self.assertAlmostEqual(series[IDF], expected, delta=1.0)

    def test_prevalence_stays_within_a_plausible_range(self) -> None:
        """Une prévalence est bornée par construction : un dénominateur ou un
        numérateur mal agrégé la fait sortir de [0, 100]."""
        series = _patho_series(
            repository, "patho.prevalence", _request(), "Diabète",
        )
        for region, value in series.items():
            with self.subTest(region=region):
                self.assertGreater(value, 0.0)
                self.assertLess(value, 100.0)


if __name__ == "__main__":
    unittest.main()
