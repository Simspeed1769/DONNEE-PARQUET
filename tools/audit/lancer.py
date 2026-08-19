# -*- coding: utf-8 -*-
"""Point d'entree unique de l'audit.

    python -m tools.audit.lancer

Reexecutable sans effet de bord, et idempotent : deux executions de suite
produisent le meme rapport. `data/` n'est jamais modifie.
"""
from __future__ import annotations

import sys
import time

from . import phase1_filtres, phase1_interne, rapport


def main() -> int:
    debut = time.time()
    print("Phase 1 — coherence interne de DAMIR...", flush=True)
    controles = phase1_interne.executer()
    controles += phase1_filtres.executer()
    controles.sort(key=lambda c: c.ref)
    chemin = rapport.ecrire(rapport.rendre(controles, "Phase 1"))
    duree = time.time() - debut
    print(f"{len(controles)} controles en {duree:.1f}s -> {chemin}")
    for c in controles:
        print(f"  {c.verdict:16s} {c.ref:6s} {c.libelle}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
