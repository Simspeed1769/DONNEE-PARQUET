# -*- coding: utf-8 -*-
"""Le socle de l'audit : tolérances, verdicts, comparaison.

Ce module ne connaît ni l'application ni les données. Il ne sait que deux
choses : comment on compare deux nombres, et comment on nomme le résultat.

**Les tolérances sont déclarées ici, une fois, et ne sont jamais élargies après
coup.** Si un écart les dépasse, il devient un défaut ou un écart expliqué —
jamais un seuil relevé. C'est la seule discipline qui empêche un audit de se
transformer en justification.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

#: Les tolérances de la Phase 0, avec leur justification.
#:
#: - `comptage` : ce sont des entiers. Aucun mécanisme numérique ne peut en
#:   changer la valeur ; tout écart est un défaut de logique.
#: - `montant` : somme flottante sur ~5,76 M lignes. L'erreur d'accumulation
#:   croît en √n·ε, soit √5,76e6 × 2,2e-16 ≈ 5e-13 en relatif. Mesuré sur le
#:   total `rem` du cube : 3,8e-13. Le seuil retenu est trois ordres de grandeur
#:   au-dessus — assez large pour ne jamais accuser à tort, assez serré pour
#:   attraper une erreur de logique, qui se compte en pourcents.
#: - `ratio` : l'erreur relative d'un quotient majore la somme des erreurs de
#:   ses termes, soit ~2e-9. Facteur 5 de marge.
TOLERANCES: dict[str, float] = {
    "comptage": 0.0,
    "montant": 1e-9,
    "ratio": 1e-8,
}

#: Plancher **absolu**, en euros, sous lequel un écart cesse d'avoir un sens.
#:
#: Il ne relâche pas la tolérance relative : il corrige une faute de métrique.
#: Une comparaison relative n'a de sens que si le dénominateur en a un. Sur ce
#: cube, des milliers de cellules somment à des miettes de virgule flottante —
#: 4,4e-16 € — par annulation entre un débit et un crédit. Rapporter un écart de
#: 1,3e-15 € à un dénominateur de 4,4e-16 € donne « 300 % » et ne mesure rien.
#:
#: Le critère retenu est celui, classique, qui combine les deux :
#:
#:     |attendu − obtenu| ≤ PLANCHER + tolérance_relative × |attendu|
#:
#: 1e-6 € : sous le millionième d'euro, aucune grandeur comptable ne se
#: distingue. Le pire écart absolu réellement observé entre les deux cubes est
#: de 2,4e-07 € ; le plancher est quatre fois au-dessus.
#:
#: **Déclaré après la première exécution**, et il faut le dire : le premier jet
#: du harnais comparait en relatif seul et classait I-06c en défaut. Le rapport
#: publie les deux mesures — absolue et relative au-dessus du plancher — pour
#: que le lecteur juge lui-même de l'amendement.
PLANCHER_MONTANT = 1e-6

CONFORME = "Conforme"
EXPLIQUE = "Écart expliqué"
DEFAUT = "Défaut"
ATTENTE = "En attente"


@dataclass
class Controle:
    """Une ligne du tableau de l'audit."""

    ref: str
    base: str
    libelle: str
    #: **La colonne qui décide si le contrôle vaut quelque chose.** Elle dit
    #: comment la valeur attendue a été obtenue — SQL manuel, calcul posé,
    #: valeur publiée — et signale une circularité assumée quand il y en a une.
    reference_par: str
    attendu: str = ""
    obtenu: str = ""
    ecart: str = ""
    verdict: str = ATTENTE
    note: str = ""
    #: Détail des comparaisons, pour la section qui suit le tableau.
    details: list[str] = field(default_factory=list)
    #: Les valeurs **brutes** du contrôle, pour que tout texte de synthèse les
    #: dérive au lieu de les recopier. Un résumé qui recopie un chiffre est un
    #: chiffre de plus à maintenir, et le premier à mentir quand la donnée bouge.
    chiffres: dict[str, float] = field(default_factory=dict)


def ecart_relatif(attendu: float | None, obtenu: float | None) -> float | None:
    """L'écart relatif, ou `None` si l'un des deux manque.

    `None` n'est pas zéro, ici comme dans le produit : comparer un absent à un
    présent n'a pas de sens, et renvoyer 0 ferait passer l'absence pour un
    accord parfait.
    """
    if attendu is None or obtenu is None:
        return None
    if attendu == obtenu:
        return 0.0
    if attendu == 0:
        return abs(obtenu)
    return abs(obtenu - attendu) / abs(attendu)


def verdict_pour(pire: float | None, nature: str) -> str:
    if pire is None:
        return ATTENTE
    return CONFORME if pire <= TOLERANCES[nature] else DEFAUT


@dataclass
class Comparaison:
    """Un lot de comparaisons homogènes, résumé par son pire cas.

    Un contrôle d'additivité porte sur des centaines de couples (année ×
    mesure) ; en rapporter un seul serait arbitraire, tous les rapporter serait
    illisible. On garde le compte et **le pire**, qui est le seul qui décide.
    """

    nature: str
    #: Plancher absolu. Zéro pour un comptage : un entier n'a pas de miettes.
    plancher: float = 0.0
    n: int = 0
    pire: float = 0.0
    pire_cas: str = ""
    pire_absolu: float = 0.0
    absents: int = 0
    hors_tolerance: int = 0
    #: Comparaisons dont le dénominateur est sous le plancher : l'écart relatif
    #: n'y veut rien dire, seul l'absolu est retenu.
    degenerees: int = 0

    def ajouter(self, attendu: float | None, obtenu: float | None, cas: str) -> None:
        self.n += 1
        if attendu is None or obtenu is None:
            self.absents += 1
            return
        absolu = abs(obtenu - attendu)
        self.pire_absolu = max(self.pire_absolu, absolu)
        if absolu > self.plancher + TOLERANCES[self.nature] * abs(attendu):
            self.hors_tolerance += 1
        if abs(attendu) <= self.plancher:
            self.degenerees += 1
            return
        gap = absolu / abs(attendu)
        if gap > self.pire:
            self.pire, self.pire_cas = gap, cas

    @property
    def verdict(self) -> str:
        if self.n == 0:
            return ATTENTE
        return CONFORME if self.hors_tolerance == 0 else DEFAUT

    def resume(self) -> str:
        if self.n == 0:
            return "aucune comparaison"
        texte = (f"{self.n} comparaisons · pire écart absolu {self.pire_absolu:.2e} · "
                 f"pire écart relatif {self.pire:.2e}")
        if self.pire_cas:
            texte += f" ({self.pire_cas})"
        if self.degenerees:
            texte += (f" · {self.degenerees} comparaison(s) sous le plancher de "
                      f"{self.plancher:g}, jugées en absolu seulement")
        if self.absents:
            texte += f" · {self.absents} valeur(s) absente(s)"
        texte += f" · {self.hors_tolerance} hors tolérance"
        return texte


def sci(valeur: float) -> str:
    """Notation scientifique à la française : 4,3e-13, et non 4.3e-13.

    La Phase 5 contrôlera que l'application écrit ses décimales avec une virgule.
    Il serait mal venu que le rapport qui l'exige ne s'y tienne pas.
    """
    return f"{valeur:.2e}".replace(".", ",")


def pct(valeur: float, decimales: int = 1) -> str:
    """Un pourcentage à la française : « 16,7 % », virgule et espace insécable."""
    return f"{valeur:.{decimales}f}".replace(".", ",") + chr(8239) + "%"


def formater(valeur: Any) -> str:
    """Un nombre lisible par un actuaire : virgule décimale, espace insécable."""
    if valeur is None:
        return "absent"
    if isinstance(valeur, bool):
        return "oui" if valeur else "non"
    if isinstance(valeur, int):
        return f"{valeur:,}".replace(",", " ")
    if isinstance(valeur, float):
        if valeur == int(valeur) and abs(valeur) < 1e15:
            return f"{int(valeur):,}".replace(",", " ")
        return f"{valeur:,.4f}".replace(",", " ").replace(".", ",")
    return str(valeur)
