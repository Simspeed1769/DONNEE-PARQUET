# -*- coding: utf-8 -*-
"""Ce qu'est chaque dimension de découpage DAMIR, en une phrase.

`DIMENSIONS` (`analysis.py`) ne porte qu'un libellé et une expression SQL : de
quoi construire une requête, pas de quoi comprendre ce qu'on découpe. Le
référentiel affichait donc onze noms sans un mot d'explication.

Ce fichier ajoute ce qui manque, et rien d'autre : à quoi sert la dimension, d'où
elle vient dans la donnée, et — quand il y en a une — la précaution qui décide
d'une lecture juste ou fausse.

**Les précautions ne sont pas décoratives.** Celle de la région vient de l'audit
des chiffres : un lecteur qui additionne les treize régions nommées passe à côté
de 16,7 % du montant remboursé. C'est le genre de chose qui doit se lire là où
l'on choisit la dimension, pas dans un rapport que personne n'ouvrira.
"""
from __future__ import annotations

#: Pour chaque dimension : ce qu'elle découpe · d'où elle vient · la précaution.
#:
#: La clé `modalities_from` nomme la liste de `/api/meta` qui en donne le
#: décompte réel, plutôt que d'écrire un nombre qui vieillirait mal.
DIMENSION_NOTES: dict[str, dict[str, str | None]] = {
    "year": {
        "description": "L’année où le soin a été réalisé — et non celle où il a été remboursé.",
        "origin": "Colonne `soi_ann` du cube.",
        "modalities_from": "years",
        "caution": "Les dernières années sont incomplètes tant que les soins ne sont "
                   "pas tous liquidés : une baisse récente est d’abord un artefact.",
    },
    "grand_post": {
        "description": "Le premier niveau de la nomenclature des prestations : pharmacie, "
                       "hospitalisation, indemnités journalières…",
        "origin": "Table de transcodification `prs_nat_transco.csv`, jointe sur le code prestation.",
        "modalities_from": "grand_posts",
        "caution": "« Autres » est une catégorie à part entière de la nomenclature, "
                   "et non un fourre-tout de codes non classés.",
    },
    "post": {
        "description": "Le deuxième niveau de la nomenclature, à l’intérieur d’un grand poste.",
        "origin": "Table de transcodification.",
        "modalities_from": None,
        "caution": "Se choisit après un grand poste : la hiérarchie est une cascade, "
                   "pas un arbre chargé d’un coup.",
    },
    "sub_post": {
        "description": "Le troisième niveau, à l’intérieur d’un poste.",
        "origin": "Table de transcodification.",
        "modalities_from": None,
        "caution": None,
    },
    "service": {
        "description": "La prestation elle-même, au code près — le grain le plus fin.",
        "origin": "Colonne `prs_nat` du cube, libellée par la transcodification.",
        "modalities_from": None,
        "caution": "C’est le seul niveau où un volume et un montant moyen ont une "
                   "unité homogène, donc un sens.",
    },
    "region": {
        "description": "La région de résidence du bénéficiaire.",
        "origin": "Colonne `region` du cube.",
        "modalities_from": "regions",
        "caution": "Une modalité « Non renseignée » porte 16,7 % du montant remboursé. "
                   "Additionner les seules régions nommées ne redonne pas le total national.",
    },
    "age": {
        "description": "La tranche d’âge du bénéficiaire, par décennie.",
        "origin": "Colonne `age` du cube.",
        "modalities_from": "ages",
        "caution": "Une modalité « Âge inconnu » porte 1,4 % du montant remboursé.",
    },
    "sex": {
        "description": "Le sexe du bénéficiaire.",
        "origin": "Colonne `sexe` du cube.",
        "modalities_from": "sexes",
        "caution": "Deux modalités — « Non renseigné » et « Inconnu » — portent "
                   "ensemble 1,2 % du montant remboursé.",
    },
    "insurance": {
        "description": "Le risque au titre duquel la prestation est prise en charge : "
                       "maladie, maternité, accident du travail, invalidité.",
        "origin": "Colonne `asu_nat` du cube.",
        "modalities_from": "insurances",
        "caution": None,
    },
    "envelope": {
        "description": "L’enveloppe de financement à laquelle la dépense est rattachée, "
                       "au sens de l’ONDAM.",
        "origin": "Colonne `env` du cube.",
        "modalities_from": "envelopes",
        "caution": None,
    },
    "ald": {
        "description": "Si la prestation est exonérée du ticket modérateur au titre "
                       "d’une affection de longue durée.",
        "origin": "Colonne `ald` du cube.",
        "modalities_from": None,
        "caution": "Deux modalités seulement : exonéré, ou non. Ce n’est pas le "
                   "diagnostic du patient, mais le motif de prise en charge de "
                   "cette ligne de remboursement.",
    },
}
