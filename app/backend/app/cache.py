"""Cache disque des résultats qui ne dépendent que des fichiers de données.

Les métadonnées de l'application — années disponibles, grands postes, modalités
de population, cadence de liquidation — coûtent plusieurs balayages complets du
cube, soit près de deux secondes, et sont pourtant identiques tant que les
fichiers source n'ont pas changé. Les recalculer à chaque lancement est du
temps d'attente offert à personne.

Le cache est indexé sur une empreinte des fichiers source (taille et date de
modification). Toute mise à jour d'un cube invalide l'entrée automatiquement :
il n'y a pas de cache à vider à la main, et jamais de risque d'afficher les
métadonnées d'un cube qui n'est plus là.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Callable, Iterable


def fingerprint(paths: Iterable[Path]) -> str:
    """Empreinte courte des fichiers source, sans les lire."""
    digest = hashlib.sha1()
    for path in sorted(paths, key=lambda item: item.as_posix()):
        digest.update(path.name.encode("utf-8"))
        if path.exists():
            status = path.stat()
            digest.update(f"{status.st_size}:{status.st_mtime_ns}".encode("ascii"))
        else:
            digest.update(b"absent")
    return digest.hexdigest()[:16]


class DiskCache:
    def __init__(self, directory: Path) -> None:
        self.directory = directory

    def _entry(self, name: str) -> Path:
        return self.directory / f"{name}.json"

    def get_or_build(self, name: str, token: str, build: Callable[[], Any]) -> Any:
        """Renvoie l'entrée si son empreinte correspond, sinon la reconstruit.

        Toute anomalie du cache — fichier tronqué, disque en lecture seule,
        droits manquants — se résout en recalculant : le cache accélère, il ne
        conditionne jamais le fonctionnement.
        """
        entry = self._entry(name)
        try:
            stored = json.loads(entry.read_text(encoding="utf-8"))
            if stored.get("token") == token:
                return stored["payload"]
        except (OSError, ValueError, KeyError):
            pass

        payload = build()
        self._write(entry, {"token": token, "payload": payload})
        return payload

    @staticmethod
    def _write(entry: Path, content: dict[str, Any]) -> None:
        try:
            entry.parent.mkdir(parents=True, exist_ok=True)
            # Écriture puis remplacement atomique : un lancement interrompu ne
            # laisse jamais une entrée à moitié écrite qu'il faudrait détecter.
            handle, temporary = tempfile.mkstemp(dir=entry.parent, suffix=".tmp")
            with os.fdopen(handle, "w", encoding="utf-8") as file:
                json.dump(content, file, ensure_ascii=False)
            os.replace(temporary, entry)
        except OSError:
            pass
