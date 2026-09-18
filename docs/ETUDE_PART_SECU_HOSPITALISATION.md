# Part Sécu et dépenses hospitalières — fichier local au 17 septembre 2026

## Retrouver les résultats dans l'outil

Relancer le serveur après la mise à jour, puis actualiser la page.

1. Ouvrir **DAMIR → Panorama**.
2. Choisir le grand poste **Hospitalisation**, période **2023 à 2024**.
3. Garder tous les territoires, âges, sexes, assurances, enveloppes et motifs
   d'exonération. Ne sélectionner aucune prestation précise.
4. Choisir **Part financée par la Sécurité sociale**, famille **Prise en charge**.
5. Lire **Évolution → Voir les valeurs**. Le repère de variation donne des
   points de pourcentage (pas une variation relative en %).
6. Le bouton **Voir les montants et la part Sécu** ouvre Extraire, avec l'année
   en dimension et les quatre mesures : remboursement, dépense présentée,
   part Sécu, reste à charge après AMO.
7. Pour les deux zooms ci-dessous, changer seulement le poste en
   **Hospitalisation Honoraires** ou **Hospitalisation Sejour**.

Accès direct si l'application tourne sur le port habituel :

- [Panorama — ensemble Hospitalisation](http://127.0.0.1:8000/?page=damir&section=panorama&view=evolution&start_year=2023&end_year=2024&grand_post=Hospitalisation&measure=coverage)
- [Panorama — honoraires](http://127.0.0.1:8000/?page=damir&section=panorama&view=evolution&start_year=2023&end_year=2024&grand_post=Hospitalisation&post=Hospitalisation%20Honoraires&measure=coverage)
- [Tableau des quatre mesures — honoraires](http://127.0.0.1:8000/?page=extraction&source=damir&start_year=2023&end_year=2024&grand_post=Hospitalisation&post=Hospitalisation%20Honoraires&dimensions=year&measures=reimbursed,expense,coverage,out_of_pocket)

## Ce qu'on calcule

- Part Sécu = 100 × somme des remboursements / somme des dépenses présentées.
- Solde après AMO = somme des dépenses présentées − somme des remboursements.
- Variation annuelle d'un montant = 100 × (montant final / montant initial − 1).
- Variation de part = part finale − part initiale, en points de pourcentage.

Le ratio se recalcule sur les totaux : ce n'est pas la moyenne simple des
pourcentages des prestations ou des régions. Sans dénominateur, il est absent.
Le solde n'est **pas** le montant payé par les mutuelles : il inclut aussi ce
qui reste au patient, dans les dépenses présentes au fichier.

## Résultat principal : les honoraires hospitaliers

Filtre poste : **Hospitalisation Honoraires**. Montants en millions d'euros.

| Mesure | 2023 | 2024 | Évolution |
|---|---:|---:|---:|
| Dépense présentée | 1 322,45 | 1 382,36 | +4,53 % |
| Montant remboursé AMO | 886,08 | 902,71 | +1,88 % |
| Part Sécu | 67,00 % | 65,30 % | −1,70 point |
| Solde après AMO | 436,37 | 479,65 | +9,92 % |

**Lecture :** les dépenses enregistrées augmentent plus vite que les
remboursements AMO. Il reste **43,28 M€ de plus** à financer par le patient
et/ou la complémentaire. Cela donne un repère pour comparer une garantie
équivalente chez l'assureur, sans attribuer l'écart au ROC.

## Les séjours : un résultat différent

Filtre poste : **Hospitalisation Sejour**. Montants en millions d'euros.

| Mesure | 2023 | 2024 | Évolution |
|---|---:|---:|---:|
| Dépense présentée | 15 998,33 | 16 815,43 | +5,11 % |
| Montant remboursé AMO | 14 604,41 | 15 413,53 | +5,54 % |
| Part Sécu | 91,29 % | 91,66 % | +0,38 point |
| Solde après AMO | 1 393,92 | 1 401,90 | +0,57 % |

**Lecture :** la part Sécu augmente, mais le solde en euros augmente aussi
légèrement (**+7,99 M€**), parce que la dépense totale progresse. Une hausse
de la part Sécu ne signifie donc pas automatiquement une baisse du montant
restant à financer.

## Ensemble du grand poste : à lire avec prudence

Filtre poste : tous. Montants en milliards d'euros.

| Mesure | 2023 | 2024 | Évolution |
|---|---:|---:|---:|
| Dépense présentée | 28,097 | 30,034 | +6,89 % |
| Montant remboursé AMO | 24,018 | 26,324 | +9,60 % |
| Part Sécu | 85,48 % | 87,65 % | +2,16 points |
| Solde après AMO | 4,079 | 3,710 | −9,04 % |

Ce résultat global **ne constitue pas un indicateur directement comparable à
la garantie hospitalisation d'une mutuelle**. La table locale classe aussi
dans ce grand poste :

- **Transport**, avec 6,46 Md€ de dépense en 2024 ;
- **Dotations & forfaits établissements**, de 0,840 Md€ à 2,158 Md€ entre 2023
  et 2024, avec remboursement égal à la dépense enregistrée ; leur poids accru
  relève mécaniquement le taux global ;
- **Hospitalisation Forf.Journalie**, dont le solde baisse de 445,47 M€, alors
  que le solde total ne baisse que de 368,86 M€. Ce poste explique plus que
  toute la baisse nette, les autres postes la compensant partiellement.

Le poste Forf.Journalie doit donc être vérifié avant toute conclusion sur une
baisse du reste à financer. L'étude conserve les classements actuels pour
être exactement reproductible dans l'outil ; elle ne valide pas leur
équivalence avec les garanties d'un assureur.

## Pourquoi 2025 n'est pas la conclusion principale

Dernier flux observé : **décembre 2025**. L'outil considère 2024 consolidé ;
son estimation de complétude AMO, tous postes confondus, vaut environ 99,6 %
en 2024 et 91,3 % en 2025. Ce taux global n'est ni un taux propre à
l'hospitalisation, ni une correction applicable à la dépense ou au ratio AMO.

Les valeurs brutes 2025 sont consultables avec les mêmes filtres :

| Périmètre | Part Sécu 2025 observée |
|---|---:|
| Hospitalisation (ensemble) | 93,05 % |
| Hospitalisation Sejour | 91,48 % |
| Hospitalisation Honoraires | 64,28 % |
| Hospitalisation Forf.Journalie | 195,64 % |

Sur le forfait journalier, **563,75 M€ remboursés pour 288,15 M€ de dépense
présentée** donnent un solde négatif de −275,60 M€. Ce n'est pas un partage
de financement interprétable. La cause reste à examiner (source, codage,
régularisations, agrégation) ; on ne l'attribue ni à la consolidation ni au
ROC sans vérification. Le ratio global 2025 est affecté par cette anomalie.

## Portée et comparaison avec l'assureur

La [documentation officielle Open DAMIR](https://www.assurance-maladie.ameli.fr/etudes-et-donnees/open-damir-depenses-sante-interregimes)
décrit un périmètre comprenant les soins de ville, le médico-social, les
établissements de soins privés et les prestations en espèces. **L'étude
ne couvre donc pas toute l'hospitalisation publique et privée.**

La formulation initiale dans notre discussion, qui présentait le poste comme
l'ensemble de la dépense hospitalière nationale, était trop large.

Il faut comparer des postes et dates de soins équivalents, puis tenir compte
des garanties et du portefeuille de l'assureur. Aucun de ces résultats ne
permet d'isoler ou de quantifier l'effet ROC. La comparaison 2023–2024 fournit
un repère historique ; elle ne mesure pas un effet de montée en charge 2025.

## Reproduction technique

Script en lecture seule, utilisant exactement le moteur d'extraction de
l'application, sans nouvelle dépendance :

```powershell
app\backend\.venv\Scripts\python.exe tools\etude_part_secu.py
```

Les résultats non arrondis sont imprimés en JSON. Le fichier interrogé lors
de l'étude est `data/cube_damir_compact.parquet`, avec la nomenclature locale
`data/prs_nat_transco.csv`. Les cubes n'ont pas été modifiés par cette étude.
