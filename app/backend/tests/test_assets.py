"""Reprise d'un asset périmé.

Le cas réel : un utilisateur laisse l'onglet ouvert pendant qu'on reconstruit
l'interface. Son HTML référence des fichiers qui n'existent plus. Le serveur
doit reconnaître le *nom logique* du fichier demandé et servir la version
courante, sinon l'écran reste blanc.

La liste des noms logiques était tenue à la main et avait dérivé — elle ne
couvrait aucun des trois écrans les plus récents. Ces tests verrouillent le fait
qu'elle est désormais dérivée du disque, donc qu'elle ne peut plus dériver.
"""
from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app import main


class LogicalNameTests(unittest.TestCase):
    def resolve(self, present: list[str], requested: str) -> str | None:
        with TemporaryDirectory() as folder:
            root = Path(folder)
            for name in present:
                (root / name).write_text("", encoding="utf-8")
            with patch.object(main, "FRONTEND_ASSETS", root):
                return main._recoverable_logical_name(requested, Path(requested).suffix)

    def test_recovers_the_screens_the_old_list_forgot(self) -> None:
        """PopulationPage, CorrelationsPage et DamirPage étaient absents à la main."""
        for page in ("PopulationPage", "CorrelationsPage", "DamirPage"):
            with self.subTest(page=page):
                resolved = self.resolve([f"{page}-NEWHASH1.js"], f"{page}-OLDHASH0.js")
                self.assertEqual(resolved, page)

    def test_prefers_the_longest_logical_name(self) -> None:
        """`vendor-react` ne doit jamais se rabattre sur `vendor`.

        Les deux chunks partagent un préfixe ; servir l'un pour l'autre livrerait
        ECharts à la place de React.
        """
        present = ["vendor-react-AAAAAAAA.js", "vendor-echarts-BBBBBBBB.js"]
        self.assertEqual(self.resolve(present, "vendor-react-OLD00000.js"), "vendor-react")
        self.assertEqual(self.resolve(present, "vendor-echarts-OLD00000.js"), "vendor-echarts")

    def test_handles_a_hash_containing_a_dash(self) -> None:
        """L'empreinte Vite est en base64url : elle peut contenir un tiret."""
        resolved = self.resolve(["index-Cw-vJY8u.js"], "index-OLDHASH0.js")
        self.assertEqual(resolved, "index")

    def test_keeps_suffixes_apart(self) -> None:
        """Un `.css` périmé ne doit pas être servi depuis un `.js` du même nom."""
        self.assertIsNone(self.resolve(["index-AAAAAAAA.js"], "index-OLDHASH0.css"))

    def test_unknown_name_is_not_recovered(self) -> None:
        self.assertIsNone(self.resolve(["index-AAAAAAAA.js"], "inconnu-OLDHASH0.js"))


if __name__ == "__main__":
    unittest.main()
