# Journal d'ingestion

Ce qui est entré dans le poste, ce qui en a été écarté, et pourquoi. Avec, en
tête, l'audit des trois pièges que le point 3.3 de la mission demande de traiter
**avant** toute ingestion — parce qu'ils ont en commun de casser une série en
silence : aucun ne lève d'erreur, tous produisent un résultat d'allure normale.

```bash
# depuis app/backend
.venv/Scripts/python.exe ../../tools/audit_pieges.py
```

À relancer avant chaque ingestion. Les verdicts ci-dessous en sortent.

*Relevé du 17 août 2026.*

## État : rien à ingérer aujourd'hui

`data/source/` ne contient qu'un fichier :

| Fichier | Statut |
|---|---|
| `estim-pop-nreg-sexe-aq-1975-2026.xlsx` | **déjà ingéré** — `data/population/`, 1975 à 2026, conforme au nom du fichier |

Il n'y a donc **aucune donnée DAMIR supplémentaire à ingérer**. L'extension des
historiques demandée par le point 3.3 est bloquée faute de matière, non faute de
méthode. Ce qui suit est ce qui reste livrable et utile : l'audit qui doit
précéder l'ingestion du jour où les fichiers arriveront.

## Piège 1 — La réforme régionale de 2016

**Attendu** : 22 régions avant 2016, 13 après ; sans table de passage, les
séries territoriales longues sont fausses silencieusement.

**Mesuré** : le cube emploie les mêmes 14 codes de 2014 à 2025, sans exception —
`[5, 11, 24, 27, 28, 32, 44, 52, 53, 75, 76, 84, 93, 99]`. Ce sont les codes
postérieurs à la réforme. L'ancien découpage n'apparaît nulle part.

Un jeu de codes identique ne prouve pourtant pas que le reclassement soit bon :
un mauvais reclassement produit les bons codes et les mauvais montants. Le
contrôle porte donc sur la continuité des parts régionales au franchissement de
2015 → 2016. **Plus grand écart : 0,370 point**, et il est sur « Non
renseignée », pas sur une région. Toutes les régions bougent de quelques
centièmes. Un reclassement raté déplacerait des points entiers.

> **Verdict : le piège n'existe pas dans ce fichier.** Le cube est déjà
> harmonisé à la construction. Il redeviendrait actif si une ingestion apportait
> des années antérieures sur l'ancien découpage — c'est le seul cas à surveiller.

La base Population n'est pas concernée non plus : `population.py` documente
qu'elle est rétropolée sur les régions actuelles depuis 1975, ce que
l'inventaire confirme (13 régions en 1980, 17 en 1995, 18 en 2020 — les paliers
sont l'outre-mer, pas la réforme).

### Ce que l'audit a trouvé à la place

Le vrai défaut territorial du cube n'est pas celui qu'annonçait la mission.

**La région « Non renseignée » (code 99) pèse 17,7 % du remboursement en 2024**,
et sa part dérive : 14,5 % en 2015, 18,5 % au maximum en 2020.

| Année | Part du code 99 |
|---:|---:|
| 2015 | 14,54 % |
| 2018 | 15,91 % |
| 2020 | 18,50 % |
| 2022 | 17,96 % |
| 2024 | 17,71 % |
| 2025 | 16,97 % |

Ce n'est pas une corruption. La décomposition par grand poste l'explique
entièrement :

| Grand poste | Part du 99 | Part du poste sans région |
|---|---:|---:|
| Indemnités Journalières | 72,8 % | **90,5 %** |
| Pharmacie | 11,6 % | 8,8 % |
| Rémunérations forfaitaires des PS | 3,6 % | **93,2 %** |
| Consultations Visites | 2,9 % | 6,0 % |

Une prestation en espèces n'a pas de lieu de soins, et une rémunération
forfaitaire non plus. Le code 99 est donc **structurel**, et sa dérive suit
surtout le poids croissant des IJ.

Conséquence à retenir, qui est un problème d'affichage et non de donnée : le
**classement territorial affiche bien « Non renseignée »**, vérifié — elle sort
même en tête, devant l'Île-de-France. **La carte ne le peut pas** : aucun
polygone ne correspond à « pas de région ». Une carte de DAMIR représente donc
82 % du total sans le dire.

## Piège 2 — La couverture de `prs_nat_transco.csv`

**Attendu** : si la transco ne couvre pas les codes anciens, « Autres » gonfle
rétrospectivement.

**Mesuré** : **zéro code orphelin, sur les douze années.** La transco compte
1 630 lignes pour 1 342 codes employés, et aucune de ses lignes n'a de
`grand_poste` vide. Le repli `COALESCE(t.grand_poste, 'Autres')` représente
**0,0000 % du remboursement chaque année** — il ne se déclenche jamais.

> **Verdict : couverture intégrale. Le repli est dormant, pas mort.**

Car la nomenclature n'est pas figée. Chaque exercice apporte des codes jamais
vus :

| Année | Codes nouveaux | | Année | Codes nouveaux |
|---:|---:|---|---:|---:|
| 2015 | +79 | | 2021 | +36 |
| 2016 | +51 | | 2022 | +51 |
| 2017 | +70 | | 2023 | +50 |
| 2018 | +59 | | 2024 | +61 |
| 2019 | +90 | | 2025 | +38 |
| 2020 | +75 | | | |

**De 36 à 90 codes par an.** Une année ingérée sans extension préalable de la
transco enverrait autant de codes vers « Autres », sans message ni erreur : le
`COALESCE` produit une catégorie d'allure parfaitement normale. C'est
précisément la forme de rupture silencieuse que le point 3.3 cherche à
prévenir, et le chiffre donne l'effort à prévoir.

**Consigne d'ingestion** : étendre `prs_nat_transco.csv` d'abord, relancer
`audit_pieges.py`, et n'ingérer que quand la colonne « Orphelins » est à zéro.

## Piège 3 — Les révisions de nomenclature des causes de décès

**Attendu** : comparabilité des causes cassée sur longue période par les
révisions de la CIM.

**Mesuré** : **86 causes, exactement les mêmes sur les dix millésimes** — aucune
entrée, aucune sortie. Aucun code dont le libellé varie selon l'année.

Sur la période présente, la question CIM ne se pose donc pas : la CIM-10 couvre
2015-2024 sans révision majeure, et la grille du producteur est stable.

> **Verdict : intact sur la période, mais le contrôle qui l'établit est le
> mauvais.**

Les identifiants ne sont **pas des codes CIM** : ce sont des rangs,
`cause_001` … `cause_086`, attribués à l'ingestion selon l'ordre des lignes du
producteur. « `cause_042` » ne signifie pas une maladie, il signifie « la
quarante-deuxième ligne du tableau ».

Si un futur millésime insère ou retire une ligne, alors :

- le rang 42 désignera une autre maladie ;
- le jeu de codes restera d'apparence identique — toujours 86, toujours les
  mêmes ;
- le contrôle par les codes ne détectera rien.

**Consigne d'ingestion** : comparer les **libellés**, pas les codes. C'est le
seul contrôle qui morde sur une clé positionnelle. Étendre l'historique en
deçà de 2000 poserait en revanche la vraie question CIM — la bascule CIM-9 →
CIM-10 — et exigerait une table de correspondance.

## Un quatrième point, non prévu par la mission

Les grilles territoriales des bases ne se recouvrent pas :

| Base | Corse | Outre-mer | Code 99 |
|---|---|---|---|
| DAMIR | **absente** | agrégé en un seul code `5` | « Non renseignée » |
| Pathologies | présente (`94`) | détaillé (`01`–`06`) | « France entière » |
| Population | présente (`94`) | détaillé (`01`–`06`) | — |
| CSP | présente (libellé) | détaillé (libellés) | — |

Deux pièges y dorment. La Corse et le détail de l'outre-mer manquent à DAMIR
seul. Et le **code 99 ne veut pas dire la même chose d'une base à l'autre** :
résidu sans territoire dans DAMIR, total national dans les Pathologies. Une
jointure naïve sur le code apparierait un reste à un tout.

Vérifié : le module des croisements n'y tombe pas. `correlations.py` annonce
« Douze points » pour l'unité Région — les douze régions métropolitaines
communes — ce qui exclut de fait la Corse, l'outre-mer et le 99. L'asymétrie
est donc déjà traitée. Elle est consignée ici pour qu'une ingestion future ne
la réintroduise pas en croyant enrichir la grille.

### Les Pathologies portent leurs marges dans leurs dimensions

Découvert en vérifiant le point précédent : la somme des régions non-99 vaut
**deux fois** le total national. Ce n'est pas une anomalie du territoire mais
du sexe — la dimension contient `tous sexes` **à côté** de `hommes` et
`femmes`. De même, `cla_age_5` contient `tsage`, `dept` contient `999`, et
`region` contient `99`.

Cette base n'est donc pas une table de faits mais **un cube déjà agrégé, marges
comprises**. Toute somme naïve y compte double, quelle que soit la dimension.

Vérifié : `pathologies.py` ne somme pas, il **sélectionne la marge** —
`WHERE dept = '999' AND region = '99' AND cla_age_5 = 'tsage' AND
libelle_sexe = 'tous sexes'`, avec `MAX(ntop)` là où un `SUM` serait faux. Le
traitement est correct et délibéré.

C'est précisément le genre de propriété qu'une ingestion casse sans bruit : un
millésime livré sans ses marges, ou avec des libellés de marge différents, ne
provoquerait aucune erreur — il rendrait des totaux nuls ou doublés. **À
vérifier explicitement avant toute ingestion de ce produit.**

## Ce qui est écarté, et pourquoi

| Écarté | Motif |
|---|---|
| L'ingestion elle-même | Aucune donnée DAMIR disponible dans `data/source/`. Bloqué faute de matière. |
| Une table de passage 22 → 13 régions | Mesuré inutile : le cube est déjà harmonisé. L'écrire « au cas où » serait du code non exercé. |
| Un correctif au poids du code 99 | Ce n'est pas un défaut de donnée mais une propriété des prestations en espèces. Le corriger serait inventer un territoire. |
| Un avertissement de carte sur le 99 | Réel et à faire, mais c'est une modification d'interface, hors du périmètre d'un point d'ingestion. Consigné comme reste à faire. |
| Une table CIM-9 → CIM-10 | Sans objet tant que l'historique commence en 2015. |

## Reste à faire

- **La carte DAMIR ne dit pas qu'elle omet 17,7 % du total.** Le classement le
  montre, la carte ne le peut pas ; il lui faut une mention. Modification
  d'interface, à traiter comme telle.
- **`audit_pieges.py` doit être exécuté avant toute ingestion**, et la
  nomenclature `prs_nat` étendue avant, pas après.
- **Tout nouveau millésime de mortalité doit être apparié sur les libellés.**
