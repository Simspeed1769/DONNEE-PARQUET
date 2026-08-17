"""La complétude de liquidation, et le cache qui pourrait l'empêcher d'arriver.

Deux mécanismes se cachent ici, et **tous deux échouent en silence** — d'où des
tests plutôt qu'une relecture.

Le premier est le redressement lui-même : il ne lève rien s'il se trompe, il
rend simplement un taux plausible. Le second est le cache disque des
métadonnées, indexé sur l'empreinte des fichiers de données : un champ ajouté à
la charge utile n'invalide rien, et un poste au cube inchangé continuerait de
servir l'ancienne réponse. Le serveur serait à jour, le front aussi, et un
fichier JSON déciderait que la fonctionnalité n'existe pas.
"""
from __future__ import annotations

import unittest

from app.main import METADATA_SCHEMA, metadata
from app.repository import repository
from app.studio import reliability_metadata


class CompletenessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.reliability = reliability_metadata(repository)
        cls.rows = cls.reliability["completeness"]

    def test_every_care_year_is_covered(self) -> None:
        years = {row["year"] for row in self.rows}
        observed = {
            int(row["year"])
            for row in repository.query("SELECT DISTINCT soi_ann AS year FROM delays")
        }
        self.assertEqual(years, observed, "des années de soins manquent au relevé")

    def test_ratio_stays_within_bounds(self) -> None:
        """Un taux ne dépasse jamais 100 % : une année plus qu'entière n'existe pas.

        Le plafond est explicite dans le calcul plutôt que laissé au hasard du
        profil — sans lui, une année dont la liquidation dépasse la cadence
        moyenne afficherait 101 %, ce qui ne veut rien dire.
        """
        for row in self.rows:
            if row["ratio"] is None:
                continue
            self.assertGreater(row["ratio"], 0.0, f"{row['year']} : taux nul")
            self.assertLessEqual(row["ratio"], 1.0, f"{row['year']} : taux au-dessus de 100 %")

    def test_mature_years_are_complete(self) -> None:
        """Une année consolidée doit ressortir à 100 %, ou le profil est faux.

        C'est le contrôle qui mord : le redressement est calibré sur les années
        mûres, il doit donc les rendre inchangées. S'il les gonfle, il gonfle
        aussi la dernière.
        """
        consolidated = self.reliability["consolidated_through"]
        self.assertIsNotNone(consolidated)
        for row in self.rows:
            # 2014 est un exercice partiel à la source : complet au sens de la
            # liquidation, mais sans rapport avec une année pleine.
            if row["year"] >= 2015 and row["year"] < consolidated:
                self.assertAlmostEqual(
                    row["ratio"], 1.0, places=2,
                    msg=f"{row['year']} est consolidée et ne ressort pas à 100 %",
                )

    def test_last_year_is_incomplete(self) -> None:
        """La dernière année de soins ne peut pas être complète.

        Ses soins de décembre se remboursent l'année suivante, qui n'est pas
        observée. Un taux de 100 % ici signifierait que le redressement ne
        redresse rien — c'est-à-dire le défaut que le point 3.4 corrige.
        """
        last = max(row["year"] for row in self.rows)
        row = next(item for item in self.rows if item["year"] == last)
        self.assertIsNotNone(row["ratio"])
        self.assertLess(row["ratio"], 1.0, f"{last} ressort complète : rien n'est redressé")
        self.assertGreater(row["mature"], row["observed"])

    def test_absent_stays_absent(self) -> None:
        """Une année inestimable rend `None`, jamais zéro ni 100 %."""
        for row in self.rows:
            if row["mature"] is None:
                self.assertIsNone(row["ratio"])

    def test_metadata_exposes_completeness(self) -> None:
        """Le champ doit traverser le cache disque, pas seulement la fonction.

        C'est le test qui aurait manqué : `reliability_metadata` peut être
        parfaite et l'écran ne rien recevoir, parce que l'entrée en cache
        antérieure reste valide tant que les fichiers n'ont pas bougé.
        """
        served = metadata()["reliability"]
        self.assertIn("completeness", served)
        self.assertTrue(served["completeness"], "le cache sert une charge utile sans complétude")

    def test_schema_version_is_in_the_cache_key(self) -> None:
        """Le garde-fou du test précédent, vérifié pour lui-même.

        Sans la version dans la clé, le test ci-dessus passerait aujourd'hui —
        le cache vient d'être reconstruit — et échouerait chez quelqu'un dont
        l'entrée date d'avant. Le contrôle porte donc sur le mécanisme.
        """
        from app.main import DELAYS_PATH, DISK_CACHE, TRANSCO_PATH, fingerprint

        raw = fingerprint([repository.cube_path, DELAYS_PATH, TRANSCO_PATH])
        token = f"v{METADATA_SCHEMA}-{raw}"
        self.assertNotEqual(token, raw, "la version de schéma n'entre pas dans la clé")

        entry = DISK_CACHE._entry("metadata")
        if entry.exists():
            import json

            stored = json.loads(entry.read_text(encoding="utf-8"))
            self.assertEqual(
                stored.get("token"), token,
                "l'entrée en cache n'est pas indexée sur la version courante",
            )


if __name__ == "__main__":
    unittest.main()
