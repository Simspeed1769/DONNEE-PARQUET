"""Le préchauffage, et ce qu'il exerce.

`warm_caches` lance un fil démon et **avale toute exception** — à raison : un
préchauffage ne doit jamais tuer le serveur. Mais cela veut dire qu'un import
manquant y reste invisible : l'application démarre, répond, passe les tests, et
imprime discrètement `préchauffage interrompu` dans une console que personne ne
lit. C'est arrivé au point 2.4, quand la couche d'accès aux données a quitté
`main.py` en y laissant deux constantes non importées.

Ces tests appellent donc **directement** ce que le préchauffage appelle. Ils ne
vérifient pas que le fil démarre : ils vérifient que le travail qu'il fait
aboutit, ce qui est la seule chose qui compte et la seule que le silence
masquait.
"""
from __future__ import annotations

import unittest

from app.explore import ExploreRequest, OptionsRequest
from app.main import _options_aggregate_cached, explore_view, metadata


class StartupTests(unittest.TestCase):
    def test_metadata_builds(self) -> None:
        """Le premier appel du préchauffage. Il touche l'empreinte du cache
        disque, qui référence trois chemins de fichiers — trois occasions
        d'oublier un import."""
        result = metadata()
        self.assertTrue(result["years"], "aucune année : les métadonnées sont vides")
        self.assertEqual(len(result["measures"]), 12)
        self.assertIn("reliability", result)

    def test_first_explore_view_answers(self) -> None:
        years = metadata()["years"]
        result = explore_view(ExploreRequest(
            start_year=min(years), end_year=max(years), breakdown="grand_post",
        ))
        self.assertTrue(result["series"])
        self.assertEqual(result["breakdown"], "grand_post")

    def test_service_ranking_is_reachable(self) -> None:
        """Le classement des 1 342 prestations : le troisième et dernier geste
        du préchauffage, et le plus coûteux."""
        years = metadata()["years"]
        payload = OptionsRequest(
            start_year=min(years), end_year=max(years), breakdown="service", limit=1,
        )
        # `_options_aggregate_cached` renvoie le classement brut ; c'est
        # `filter_options` qui en fait une reponse. Le prechauffage ne paie
        # que le balayage, et c'est bien lui qu'on exerce ici.
        ranking = _options_aggregate_cached(payload.model_dump_json())
        self.assertGreater(len(ranking), 100, "le classement des prestations est vide")


if __name__ == "__main__":
    unittest.main()
