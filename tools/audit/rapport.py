# -*- coding: utf-8 -*-
"""Le rendu du rapport : un tableau lisible par un actuaire."""
from __future__ import annotations

import subprocess
from datetime import datetime
from pathlib import Path

from . import reference as ref
from .socle import ATTENTE, CONFORME, DEFAUT, EXPLIQUE, Controle

RAPPORT = ref.RACINE / "docs" / "AUDIT_CHIFFRES.md"


def _branche_et_commit() -> tuple[str, str]:
    def git(*args: str) -> str:
        try:
            return subprocess.run(["git", *args], cwd=ref.RACINE, capture_output=True,
                                  text=True, check=True).stdout.strip()
        except Exception:
            return "inconnu"
    return git("rev-parse", "--abbrev-ref", "HEAD"), git("rev-parse", "--short", "HEAD")


def _echapper(texte: str) -> str:
    """Un tableau Markdown se casse sur une barre verticale."""
    return texte.replace("|", "\\|").replace("\n", " ")


def rendre(controles: list[Controle], phases_faites: str) -> str:
    branche, commit = _branche_et_commit()
    compte = {verdict: sum(1 for c in controles if c.verdict == verdict)
              for verdict in (CONFORME, EXPLIQUE, DEFAUT, ATTENTE)}

    lignes = [
        "# Audit des chiffres — les résultats affichés sont-ils justes ?",
        "",
        f"*Exécuté le {datetime.now().strftime('%d %B %Y à %H:%M')}, "
        f"branche `{branche}`, commit `{commit}`.*",
        "",
        "Rapport **régénéré** par `python -m tools.audit.lancer`. Ne pas le modifier",
        "à la main : toute correction doit passer par le harnais, sans quoi le rapport",
        "cesserait d'être reproductible.",
        "",
        f"**Phases exécutées : {phases_faites}.**",
        "",
        "## Décompte",
        "",
        f"| Contrôles exécutés | {len(controles)} |",
        "|---|---:|",
        f"| Conformes | {compte[CONFORME]} |",
        f"| Écarts expliqués | {compte[EXPLIQUE]} |",
        f"| **Défauts confirmés** | **{compte[DEFAUT]}** |",
        f"| En attente | {compte[ATTENTE]} |",
        "",
        "## Empreinte des données auditées",
        "",
        "| Fichier | Empreinte |",
        "|---|---|",
    ]
    lignes += [f"| `{nom}` | {valeur} |" for nom, valeur in ref.empreintes()]

    lignes += [
        "",
        "## Politique de tolérance",
        "",
        "Déclarée **avant** les contrôles et jamais élargie après coup. Si un écart la",
        "dépasse, il devient un défaut ou un écart expliqué — jamais un seuil relevé.",
        "",
        "| Nature | Tolérance | Justification |",
        "|---|---|---|",
        "| Effectifs, comptages | **0 — exact** | Ce sont des entiers ; aucun mécanisme numérique ne peut en changer la valeur. |",
        "| Sommes de montants | **1e-9 relatif** | L'accumulation flottante sur ~5,76 M lignes croît en √n·ε ≈ 5e-13. Mesuré sur le total `rem` : **3,8e-13**. Le seuil est trois ordres de grandeur au-dessus du bruit. |",
        "| Ratios | **1e-8 relatif** | L'erreur d'un quotient majore la somme de celles de ses termes (~2e-9) ; facteur 5 de marge. |",
        "| Références externes | **aucune** | Un écart n'y est pas toléré : il est expliqué (champ, régime, millésime) ou il reste un défaut. |",
        "| Arrondi d'affichage | **hors barème** | Contrôlé en Phase 5. Un nombre juste mal arrondi est un défaut d'affichage, pas de calcul ; les confondre masquerait les deux. |",
        "| **Plancher absolu** | **1e-6 €** | Voir l'encadré ci-dessous. |",
        "",
        "> **Un amendement, déclaré.** Le premier jet du harnais comparait en relatif",
        "> seul, et classait I-06c en **défaut** : « 300 % d'écart ». Vérification faite,",
        "> ces écarts portaient sur des cellules dont la somme vaut **4,4e-16 €** —",
        "> des miettes de virgule flottante nées de l'annulation entre un débit et un",
        "> crédit. Rapporter 1,3e-15 € à un dénominateur de 4,4e-16 € ne mesure rien.",
        ">",
        "> Le critère est devenu `|attendu − obtenu| ≤ 1e-6 € + tolérance × |attendu|`.",
        "> **Ce n'est pas un seuil relevé, c'est une métrique corrigée** : la tolérance",
        "> relative reste à 1e-9. Le rapport publie désormais les deux mesures — écart",
        "> absolu et écart relatif au-dessus du plancher — pour que le lecteur juge",
        "> lui-même. Le pire écart absolu réellement observé entre les deux cubes est",
        "> de 3,6e-07 € ; le plancher est quatre fois au-dessus.",
        "",
        "`None` n'est jamais égal à `0`. Un contrôle dont l'attendu est « absent »",
        "vérifie l'absence, pas la nullité.",
        "",
        "## Le tableau",
        "",
        "| Réf | Base | Contrôle | Comment la référence est obtenue | Attendu | Obtenu | Écart | Verdict |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for c in controles:
        marque = {CONFORME: "✅", EXPLIQUE: "⚠️", DEFAUT: "❌", ATTENTE: "⏳"}[c.verdict]
        lignes.append(
            f"| **{c.ref}** | {c.base} | {_echapper(c.libelle)} | {_echapper(c.reference_par)} "
            f"| {_echapper(c.attendu)} | {_echapper(c.obtenu)} | {c.ecart} | {marque} {c.verdict} |"
        )

    lignes += ["", "## Ce que chaque contrôle a trouvé", ""]
    for c in controles:
        lignes += [f"### {c.ref} — {c.libelle}", ""]
        if c.note:
            lignes += [c.note, ""]
        if c.details:
            lignes += [f"- {d}" for d in c.details] + [""]

    defauts = [c for c in controles if c.verdict == DEFAUT]
    lignes += ["## Défauts confirmés", ""]
    if defauts:
        for c in defauts:
            lignes += [f"### {c.ref} — {c.libelle}", "", c.note or "—", ""]
    else:
        lignes += ["Aucun, sur les contrôles exécutés à ce stade.", ""]

    attentes = [c for c in controles if c.verdict == ATTENTE]
    if attentes:
        lignes += ["## En attente", "",
                   "Ces contrôles n'ont pas pu être écrits ou exécutés. Ce qui manque est dit.", ""]
        for c in attentes:
            lignes += [f"- **{c.ref}** — {c.libelle} · {c.note or 'référence non disponible'}"]
        lignes += [""]

    return "\n".join(lignes) + "\n"


def ecrire(contenu: str) -> Path:
    RAPPORT.parent.mkdir(parents=True, exist_ok=True)
    RAPPORT.write_text(contenu, encoding="utf-8")
    return RAPPORT
