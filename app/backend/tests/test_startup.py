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
from app.main import _options_aggregate_cached, csp_regions_geojson, explore_view, metadata


class StartupTests(unittest.TestCase):
    def test_metadata_builds(self) -> None:
        """Le premier appel du préchauffage. Il touche l'empreinte du cache
        disque, qui référence trois chemins de fichiers — trois occasions
        d'oublier un import."""
        result = metadata()
        self.assertTrue(result["years"], "aucune année : les métadonnées sont vides")
        self.assertEqual(len(result["measures"]), 13)
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

    def test_map_background_is_served(self) -> None:
        """Le fond de carte porte toutes les cartes du produit : sa route avait
        disparu dans une refonte sans qu'aucun test ne le voie."""
        response = csp_regions_geojson()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.media_type, "application/geo+json")
        self.assertTrue(str(response.path).endswith("regions.geojson"))


    def test_cube_resolution_without_raw_cube(self) -> None:
        """Le cube brut peut manquer : un poste préparé par `preparer.bat` n'a
        que le compact. La résolution ne doit pas exiger un fichier absent."""
        from pathlib import Path
        from unittest.mock import patch

        from app import repository as repo_module

        absent = repo_module.CUBE_PATH.with_name("cube_qui_n_existe_pas.parquet")
        self.assertFalse(absent.exists())
        with patch.object(repo_module, "CUBE_PATH", absent):
            resolved = repo_module.DamirRepository._resolve_cube()
        self.assertEqual(resolved, repo_module.COMPACT_CUBE_PATH)


if __name__ == "__main__":
    unittest.main()
