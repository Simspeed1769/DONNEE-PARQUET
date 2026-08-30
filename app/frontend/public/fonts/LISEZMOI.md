# Les polices embarquées

Deux familles, quatre fichiers. Elles sont **dans le dépôt** et servies par
l'application elle-même : aucun appel réseau au chargement, conformément au
principe « rien ne quitte le poste ». C'est aussi ce qui garantit que l'outil
s'affiche à l'identique sur tous les postes, y compris ceux où aucune police
n'est installée.

| Fichier | Famille | Rôle |
|---|---|---|
| `source-serif-4-latin.woff2` | Source Serif 4 | titres et textes suivis |
| `source-serif-4-latin-ext.woff2` | Source Serif 4 | idem, caractères latins étendus |
| `inter-latin.woff2` | Inter | chiffres, tableaux, commandes |
| `inter-latin-ext.woff2` | Inter | idem, caractères latins étendus |

Les quatre fichiers sont des polices **variables** : un seul fichier par famille
couvre toute la plage de graisses, il n'y a donc pas de fichier par graisse.

Les sous-ensembles `latin` et `latin-ext` suffisent au français — les accents et
la ligature œ sont dans `latin`, `latin-ext` couvre les noms propres étrangers.
Les sous-ensembles cyrillique, grec et vietnamien n'ont pas été repris : ils
auraient doublé le poids sans servir.

## Licences

Les deux familles sont sous **SIL Open Font License 1.1**, dont le texte est
dans `OFL-1.1.txt`. Elle autorise l'usage, la modification et la redistribution,
y compris embarquée dans une application.

- **Source Serif 4** — Copyright 2014–2023 Adobe (http://www.adobe.com/), avec
  nom réservé « Source ». Source : https://github.com/adobe-fonts/source-serif
- **Inter** — Copyright (c) 2016 The Inter Project Authors.
  Source : https://github.com/rsms/inter

`OFL-1.1.txt` porte la ligne de copyright d'Adobe en tête ; le corps de la
licence est identique pour les deux familles, et la ligne de copyright d'Inter
est celle citée ci-dessus.

Les fichiers proviennent des sous-ensembles servis par l'API Google Fonts, qui
distribue ces familles sous la même licence.
