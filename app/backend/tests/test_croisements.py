"""Croisements : le catalogue, la régression, et les noms qui manquent.

Ce fichier existe à cause d'un défaut précis. Au point 2.2 — une simplification
de l'**écran** Croisements — quatre constantes ont été supprimées du backend
alors que leurs sept usages subsistaient. Au point 2.4, la scission de
`regression.py` a réparti ces usages entre deux fichiers, ce qui a rendu le
manque encore moins visible. Résultat : `/api/correlations/meta` répondait 500,
la régression aussi, et **la suite de tests restait verte** — aucun test ne
touchait ces deux chemins.

Deux niveaux de protection, donc.

Le premier est **comportemental** : on appelle le catalogue et une régression
réelle, ce qui exerce chacune des constantes restaurées.

Le second est **structurel**, et c'est le plus utile : `test_no_undefined_globals`
relit chaque module du backend et vérifie qu'aucun nom n'y est employé sans y
être défini ni importé. Un `NameError` de ce genre ne se voit pas à la lecture,
ne casse pas l'import du module, et n'apparaît qu'au moment où quelqu'un ouvre
l'écran concerné. C'est exactement ce qui s'est produit deux fois — ici, et avec
`DELAYS_PATH` au point 2.4.
"""
from __future__ import annotations

import ast
import builtins
import unittest
from pathlib import Path

from app.correlations import IndicatorRef, catalogue
from app.regression import RegressionRequest, regression
from app.repository import repository

APP = Path(__file__).resolve().parent.parent / "app"


def undefined_globals(path: Path) -> list[str]:
    """Noms chargés par un module sans y être définis ni importés.

    L'analyse est volontairement grossière — elle ne suit ni les portées ni les
    imports conditionnels — mais elle ne produit aucun faux positif sur ce
    dépôt, et elle attrape la seule chose qu'on cherche : un nom resté derrière
    après un déplacement de code.
    """
    tree = ast.parse(path.read_text(encoding="utf-8-sig"))
    bound: set[str] = set(dir(builtins))
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            bound.add(node.id)
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            bound.add(node.name)
        elif isinstance(node, (ast.Import, ast.ImportFrom)):
            for alias in node.names:
                bound.add(alias.asname or alias.name.split(".")[0])
        elif isinstance(node, ast.arg):
            bound.add(node.arg)
        elif isinstance(node, ast.ExceptHandler) and node.name:
            bound.add(node.name)
        elif isinstance(node, ast.Global):
            bound.update(node.names)
        elif isinstance(node, ast.MatchAs) and node.name:
            bound.add(node.name)

    used = {
        node.id for node in ast.walk(tree)
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load)
    }
    return sorted(name for name in used - bound if not name.startswith("__"))


class UndefinedGlobalsTests(unittest.TestCase):
    def test_no_undefined_globals(self) -> None:
        offenders = {
            path.name: missing
            for path in sorted(APP.glob("*.py"))
            if (missing := undefined_globals(path))
        }
        self.assertEqual(
            offenders, {},
            "des noms sont employés sans être définis : un déplacement de code "
            "a laissé leurs usages derrière lui",
        )


class CatalogueTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.catalogue = catalogue(repository)

    def test_catalogue_answers(self) -> None:
        """Le chemin exact qui répondait 500 : `/api/correlations/meta`."""
        for key in ("units", "metrics", "response_metrics", "max_predictors",
                    "factors", "unit_factors"):
            self.assertIn(key, self.catalogue, f"« {key} » manque au catalogue")

    def test_response_metrics_exist(self) -> None:
        """Une mesure explicable doit exister au catalogue, sans quoi l'écran
        propose un choix que le serveur refusera."""
        for key in self.catalogue["response_metrics"]:
            self.assertIn(
                key, {metric["key"] for metric in self.catalogue["metrics"]},
                f"« {key} » est proposée comme réponse mais n'est pas un indicateur",
            )

    def test_factors_are_offered_per_unit(self) -> None:
        """Un facteur n'a de sens que si l'unité distingue sa dimension."""
        known = {factor["key"] for factor in self.catalogue["factors"]}
        self.assertTrue(known)
        for offered in self.catalogue["unit_factors"].values():
            for key in offered:
                self.assertIn(key, known)


class RegressionTests(unittest.TestCase):
    def test_regression_answers(self) -> None:
        """Une régression réelle, qui exerce `FAMILY_LABELS` et `MAX_PREDICTORS`."""
        pathology = catalogue(repository)["pathologies"][0]
        label = pathology if isinstance(pathology, str) else pathology["label"]
        result = regression(repository, RegressionRequest(
            unit="region_age_sex",
            response="damir.spend_per_capita",
            predictors=[IndicatorRef(source="patho", metric="patho.prevalence",
                                     selection=label)],
            factors=["factor.age", "factor.sex"],
        ))
        self.assertTrue(result["family_label"], "la loi ajustée n'est pas nommée")
        self.assertTrue(result["families"], "les lois offertes ne sont pas listées")
        self.assertTrue(result["terms"], "aucun coefficient")

    def test_too_many_predictors_is_refused(self) -> None:
        """La borne existe, et le message la nomme plutôt que d'échouer sèchement."""
        one = IndicatorRef(source="patho", metric="patho.patients")
        with self.assertRaises(ValueError) as raised:
            regression(repository, RegressionRequest(
                unit="region_age_sex", predictors=[one] * 9,
            ))
        self.assertIn("4", str(raised.exception))


if __name__ == "__main__":
    unittest.main()
