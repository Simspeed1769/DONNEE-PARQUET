"""Les cinq sources d'Extraire répondent, et rien ne disparaît en silence.

Ce fichier existe à cause d'un défaut précis, et du même genre que celui qui a
motivé `test_croisements.py`.

Au commit 3604991, les cinq blocs CSV + Excel de `main.py` ont fusionné dans un
seul `ExportSpec`. Le message annonçait « rien n'est perdu ». Les exports, en
effet, ont survécu — mais **trois routes d'aperçu ont été supprimées au passage**
et personne ne l'a vu : celle de DAMIR, celle de Pathologies, celle de CSP. Les
fonctions sous-jacentes n'ont jamais cessé d'être importées dans `main.py`, si
bien que rien n'échouait à l'import, aucun test ne rougissait, et l'écran
affichait « Method Not Allowed » sur trois sources sur cinq — dont la principale.

Deux niveaux de protection, donc.

Le premier est **structurel**, et c'est celui qui aurait attrapé la régression le
jour même : `test_front_routes_exist` relit `api.ts` — le client — et vérifie que
chaque chemin qu'il appelle est déclaré par le serveur. Une route retirée d'un
côté sans l'autre ne se voit ni à la lecture, ni à l'import, ni au démarrage :
elle ne se voit qu'en ouvrant l'écran concerné.

Le second est **comportemental** : on appelle les cinq vues et on vérifie
qu'elles rendent des colonnes et un décompte.

Aucun client HTTP ici. `starlette.testclient` réclame `httpx`, que ce dépôt n'a
pas et qu'on n'ajoute pas pour un test : les routes sont lues par introspection
d'`app.routes`, les vues appelées directement. La combinaison des deux couvre
exactement les deux façons dont l'aperçu peut mourir — la route absente, ou la
fonction cassée.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

# Seule `app` est importée ici. Les vues le sont *dans* les tests qui les
# appellent : quand une route disparaît, sa fonction disparaît souvent avec
# elle, et un import manqué en tête de fichier ferait tomber tout le module —
# y compris les deux contrôles structurels, qui sont précisément ceux dont le
# message nomme le problème.
from app.main import app
from app.analysis import ExtractionRequest
from app.csp import CspExtractionRequest
from app.mortality import MortalityExtractionRequest
from app.pathologies import PathologyExtractionRequest
from app.population import PopulationExtractionRequest

API_TS = Path(__file__).resolve().parents[2] / "frontend" / "src" / "api.ts"

#: Les cinq chemins d'aperçu, et la vue qui doit les servir.
PREVIEW_PATHS = {
    "/api/extraction/preview",
    "/api/pathologies/extraction/preview",
    "/api/csp/extraction/preview",
    "/api/population/extraction/preview",
    "/api/mortality/extraction/preview",
}


def declared() -> dict[str, set[str]]:
    """Les chemins d'API déclarés par le serveur, et leurs méthodes."""
    routes: dict[str, set[str]] = {}
    for route in app.routes:
        path = getattr(route, "path", "")
        if path.startswith("/api/"):
            routes.setdefault(path, set()).update(getattr(route, "methods", set()))
    return routes


class PreviewRouteTests(unittest.TestCase):
    def test_the_five_previews_are_declared_in_post(self) -> None:
        """Une route absente répondait 405 — un code qui ne dit rien au lecteur
        et que rien, côté serveur, ne signalait."""
        routes = declared()
        for path in sorted(PREVIEW_PATHS):
            with self.subTest(path=path):
                self.assertIn(path, routes, f"« {path} » n'est pas déclarée : l'aperçu est mort sur cette source")
                self.assertIn("POST", routes[path])


class PreviewShapeTests(unittest.TestCase):
    """Un aperçu qui répond mais ne rend rien serait un panneau blanc : même
    symptôme à l'écran, autre cause."""

    def views(self):
        from app import main
        return main

    def check(self, body: dict, source: str) -> None:
        self.assertTrue(body.get("columns"), f"{source} : aucune colonne")
        self.assertIn("rows", body, f"{source} : aucune ligne")
        self.assertIn("total_rows", body, f"{source} : aucun décompte")

    def test_damir(self) -> None:
        self.check(self.views().extraction_preview_view(ExtractionRequest(
            start_year=2022, end_year=2022,
            dimensions=["region"], measures=["reimbursed"], limit=40)), "DAMIR")

    def test_pathologies(self) -> None:
        self.check(self.views().pathologies_extraction_preview_view(PathologyExtractionRequest(
            top="", start_year=2022, end_year=2022,
            dimensions=["year"], measures=["patients"], limit=40)), "Pathologies")

    def test_csp(self) -> None:
        self.check(self.views().csp_extraction_preview_view(CspExtractionRequest(
            year=2023, level="groupe_6", csp_code="3",
            dimensions=["region"], measures=["effectif"], limit=40)), "CSP")

    def test_population(self) -> None:
        self.check(self.views().population_extraction_preview_view(PopulationExtractionRequest(
            start_year=2022, end_year=2022,
            region="__all__", age="__all__", sex="__all__",
            dimensions=["region"], measures=["population"], limit=40)), "Population")

    def test_mortality(self) -> None:
        self.check(self.views().mortality_extraction_preview_view(MortalityExtractionRequest(
            start_year=2022, end_year=2022, cause="__all__", population="__all__",
            # « Toutes les causes » impose de garder la dimension Cause, sans
            # quoi les décès de causes distinctes s'additionneraient en une
            # ligne muette. La règle est du produit ; le jeu d'essai s'y plie.
            dimensions=["cause", "population"], measures=["deaths"], limit=40)), "Mortalité")


class ClientServerRouteTests(unittest.TestCase):
    def test_front_routes_exist(self) -> None:
        """Tout chemin `/api/...` appelé par le client est déclaré par le serveur.

        Le contrôle ne coûte rien et couvre bien plus que les aperçus : il vaut
        pour chaque route du produit."""
        called = {
            path for path in re.findall(r'"(/api/[^"${}]+)"', API_TS.read_text(encoding="utf-8"))
        }
        self.assertTrue(called, "aucun chemin lu dans api.ts : le test ne prouverait rien")

        routes = declared()
        missing = sorted(path for path in called if path not in routes)
        self.assertEqual(
            missing, [],
            "le client appelle des chemins que le serveur ne déclare pas — un "
            "déplacement de code a emporté la route sans emporter l'appel",
        )


if __name__ == "__main__":
    unittest.main()
