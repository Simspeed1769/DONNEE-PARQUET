"""Les dénominateurs des croisements, confrontés à la source qui fait autorité.

La table de la Cartographie est départementale **et** porte ses propres
agrégats : `dept = '999'` totalise la région, `cla_age_5 = 'tsage'` totalise les
tranches, `sexe = '9'` totalise les sexes. Additionner un agrégat aux cellules
qu'il résume compte deux fois la même population — et personne ne le voit, parce
qu'un dénominateur doublé ne fait pas planter une corrélation : il en divise
simplement le résultat par deux.

Ces tests comparent donc ce que produisent les dénominateurs et `_patho_series`
à la valeur lue directement sur la ligne qui fait autorité. Ils tiendraient
encore si le SQL était réécrit autrement : c'est le nombre qui est vérifié, pas
la requête.

Depuis la v5, deux dénominateurs coexistent. `_cartography_population` est celui
de la Cartographie, conservé en recours et protégé ici du défaut d'agrégat qui
l'avait doublé. `_insee_population` est celui qui sert désormais : la population
résidente, moyennée sur l'année. Les deux sont vérifiés, contre deux sources
différentes — c'est le seul moyen de voir si l'un dérive.
"""

from __future__ import annotations

import unittest

from app.correlations import (
    CorrelationRequest,
    IndicatorRef,
    _cartography_population,
    _insee_population,
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
        population = _cartography_population(repository, _request())
        self.assertIn(IDF, population)
        self.assertAlmostEqual(population[IDF], self._authoritative_population(), delta=1.0)

    def test_population_is_not_doubled_by_the_all_ages_aggregate(self) -> None:
        """Le défaut historique : `tsage` sommé avec les tranches qu'il résume.

        L'Île-de-France y pesait 25,3 millions d'habitants au lieu de 12,5.
        """
        population = _cartography_population(repository, _request())[IDF]
        self.assertLess(population, 1.5 * self._authoritative_population())

    def test_population_counts_person_years_over_a_period(self) -> None:
        """Un numérateur qui somme quatre ans appelle quatre ans de population.

        Sans quoi la dépense par habitant d'une période est mécaniquement
        multipliée par le nombre d'années qu'elle couvre.
        """
        one_year = _cartography_population(repository, _request())[IDF]
        two_years = _cartography_population(repository, _request(start_year=YEAR - 1))[IDF]
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


@unittest.skipUnless(repository.has_population, "La population Insee n'est pas chargée.")
class InseeDenominatorTests(unittest.TestCase):
    """Le dénominateur qui sert désormais : la population résidente Insee."""

    def _january(self, year: int) -> float:
        """La population au 1er janvier, lue directement dans la source."""
        rows = repository.query(
            """SELECT SUM(population)::DOUBLE AS value FROM population
               WHERE annee = ? AND region = ?""",
            [year, IDF],
        )
        return float(rows[0]["value"])

    def test_population_is_the_mean_of_two_januaries(self) -> None:
        """L'Insee publie un état au 1er janvier ; un flux annuel se rapporte à
        la population moyenne, soit la demi-somme des 1er janvier N et N+1."""
        value = _insee_population(repository, _request())[IDF]
        expected = (self._january(YEAR) + self._january(YEAR + 1)) / 2
        self.assertAlmostEqual(value, expected, delta=1.0)

    def test_last_year_falls_back_to_the_first_of_january(self) -> None:
        """Sur la dernière année disponible, N+1 n'existe pas : le 1er janvier
        sert seul, et il ne doit surtout pas être divisé par deux."""
        rows = repository.query("SELECT max(annee) AS last FROM population")
        last = int(rows[0]["last"])
        value = _insee_population(repository, _request(start_year=last, end_year=last))[IDF]
        self.assertAlmostEqual(value, self._january(last), delta=1.0)

    def test_population_counts_person_years_over_a_period(self) -> None:
        """Deux ans de numérateur appellent deux ans de population."""
        one_year = _insee_population(repository, _request())[IDF]
        previous = _insee_population(repository, _request(start_year=YEAR - 1, end_year=YEAR - 1))[IDF]
        two_years = _insee_population(repository, _request(start_year=YEAR - 1))[IDF]
        self.assertAlmostEqual(two_years, one_year + previous, delta=1.0)

    def test_the_two_denominators_stay_within_a_tenth(self) -> None:
        """Les deux populations ne mesurent pas la même chose — résidents contre
        assurés protégés — mais un écart de plus de 10 % au niveau régional
        signalerait une erreur d'agrégation, pas une différence de champ."""
        insee = _insee_population(repository, _request())
        cnam = _cartography_population(repository, _request())
        for region, value in insee.items():
            with self.subTest(region=region):
                self.assertLess(abs(value / cnam[region] - 1), 0.10)

    def test_population_is_the_one_actually_used(self) -> None:
        """`_population` choisit l'Insee quand la base est chargée."""
        self.assertEqual(_population(repository, _request()), _insee_population(repository, _request()))


if __name__ == "__main__":
    unittest.main()
