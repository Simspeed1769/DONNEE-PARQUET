# Hospitalisation 2022–2025 : dérive AMO en année de soins et en année de règlement

*Note vérifiable. Fichier local Open DAMIR, flux arrêtés au 31/12/2025. Établie le
18 septembre 2026 avec `tools/etude_roc_hospitalisation.py` (lecture seule).*

Elle répond aux deux demandes de Charlène du 17 septembre : **ajouter 2025** (année
incomplète, données arrêtées au 31/12/2025) et **refaire l'exercice en année civile**
(année de règlement AMO) en complément de l'année de survenance (année de soins).

## 1. Message court

- **Séjours en établissements privés** : la dépense et le remboursement AMO
  progressent au même rythme, la part AMO est stable (91,3 % → 91,7 % → 91,5 %).
  En 2024, +5,1 % de dépense et +5,5 % d'AMO. En 2025, l'année observée baisse
  (−2,8 %) parce qu'elle n'est réglée qu'à 90 % ; ramenée à maturité, elle
  progresse de **+6,7 à +8,1 %**, et le reste après AMO de **+9 à +11 %**.
- **Honoraires en établissements privés** : c'est là que la dérive est réelle et
  continue. La dépense croît plus vite que l'AMO, la part AMO recule chaque année
  (69,0 % → 67,0 % → 65,3 % → 64,3 %) et le **reste après AMO augmente d'environ
  +10 % par an** (+9,9 % en 2024, +10,8 à +11,4 % en 2025 à maturité).
- **En année de règlement (année civile)**, grâce aux tranches annuelles de
  flux fournies le 18 septembre : séjours, dépense +3,7 % en 2024 puis **+9,3 %
  en 2025**, AMO +4,5 % puis +8,8 %, reste après AMO −3,8 % puis **+15,0 %** ;
  honoraires, dépense +4,7 % puis +7,1 %, reste après AMO **+9,9 % deux années
  de suite**, part AMO 67,1 % → 65,4 % → 64,5 %. La hausse 2025 des séjours en
  année civile est gonflée d'environ un point et demi par un effet de cadence
  (davantage de soins 2024 réglés en 2025 : 1 585 M€ contre 1 360 M€ un an plus
  tôt) — exactement le type d'effet qu'un dispositif comme le ROC produit côté
  complémentaire.
- **Côté AMO, aucune accélération de cadence** : la part de l'année de soins
  réglée au 31 décembre est stable depuis 2016 (séjours ≈ 90–91 %, honoraires
  ≈ 93–94 %). Une accélération que l'assureur observerait sur ses propres flux
  serait donc propre au canal complémentaire.
- **L'ensemble du grand poste « Hospitalisation » n'est pas comparable d'une
  année à l'autre** : la dépense du forfait journalier n'est plus enregistrée
  depuis novembre 2024, les dotations (remboursées à 100 %) ont plus que doublé
  en 2024, et 262 M€ de prestations nouvelles apparaissent mi-2025 sans libellé.
  Les +2,16 points de part AMO annoncés hier sur l'ensemble sont un effet de
  composition : **hors dotations et forfait journalier, la part AMO est stable
  (91,5 % → 91,6 %)**.

## 2. Périmètre et définitions

- **Source** : Open DAMIR (Assurance Maladie, tous régimes). Soins de ville,
  établissements de soins **privés**, prestations en espèces. Les séjours en
  hôpital public n'y sont pas (hors actes et consultations externes). Les
  résultats décrivent donc l'hospitalisation **privée**.
- **Deux datations**. *Année de soins* (survenance) : les soins de l'année,
  quelle que soit la date du paiement. *Année de règlement AMO* (année civile) :
  ce que l'AMO a payé pendant l'année, toutes années de soins confondues. Le
  cube de l'outil ne porte, sur cet axe, que le remboursement AMO ; la dépense,
  la part AMO et le reste après AMO en année de règlement viennent des **tranches
  annuelles de flux** (`cube_parts3/main_AAAA.parquet`, une par année de
  règlement) fournies le 18 septembre — vérifiées : leur AMO annuel est celui du
  cube des délais à l'euro près, et leur somme redonne le cube principal. Elles
  ne sont pas encore intégrées à l'outil.
- **Mesures**. Dépense présentée ; remboursement AMO ; part AMO = somme des
  remboursements / somme des dépenses ; reste après AMO = dépense − AMO. Ce
  reste comprend la part du patient et celle de la complémentaire : ce n'est pas
  la charge d'une mutuelle.
- **Postes** (nomenclature locale `prs_nat_transco.csv`) : « Hospitalisation
  Sejour » (139 codes) et « Hospitalisation Honoraires » (31 codes). L'ensemble
  du grand poste est en annexe, avec ses défauts.
- **2025** : observée au 31/12/2025. Le § 5 explique le redressement à maturité.

## 3. Séjours — « Hospitalisation Sejour »

### Année de soins (survenance)

| Mesure | 2022 | 2023 | 2024 | 2025 obs. | 23→24 | 24→25 obs. |
|---|---:|---:|---:|---:|---:|---:|
| Dépense présentée (M€) | 15 040,95 | 15 998,33 | 16 815,43 | 16 339,28 | +5,11 % | −2,83 % |
| Remboursement AMO (M€) | 13 708,69 | 14 604,41 | 15 413,53 | 14 947,18 | +5,54 % | −3,03 % |
| Reste après AMO (M€) | 1 332,25 | 1 393,92 | 1 401,90 | 1 392,10 | +0,57 % | −0,70 % |
| Part AMO | 91,14 % | 91,29 % | 91,66 % | 91,48 % | +0,38 pt | −0,18 pt |

### Année de règlement AMO (année civile)

| Remboursement AMO (M€) | 2022 | 2023 | 2024 | 2025 | 23→24 | 24→25 |
|---|---:|---:|---:|---:|---:|---:|
| Par année de soins | 13 708,69 | 14 604,41 | 15 413,53 | 14 947,18 | +5,54 % | −3,03 % |
| Par année de règlement | 13 655,08 | 14 549,49 | 15 197,86 | 16 533,03 | +4,46 % | **+8,79 %** |
| dont soins de l'année | 12 408,04 | 13 246,48 | 13 828,45 | 14 947,18 | +4,39 % | +8,09 % |
| dont soins de l'année précédente | 1 234,35 | 1 293,29 | 1 359,85 | 1 585,08 | +5,15 % | +16,56 % |

| Mesure, par année de règlement | 2022 | 2023 | 2024 | 2025 | 23→24 | 24→25 |
|---|---:|---:|---:|---:|---:|---:|
| Dépense présentée (M€) | 14 973,54 | 15 958,35 | 16 553,16 | 18 090,96 | +3,73 % | **+9,29 %** |
| Remboursement AMO (M€) | 13 655,08 | 14 549,49 | 15 197,86 | 16 533,03 | +4,46 % | +8,79 % |
| Reste après AMO (M€) | 1 318,46 | 1 408,86 | 1 355,30 | 1 557,93 | −3,80 % | **+14,95 %** |
| Part AMO | 91,19 % | 91,17 % | 91,81 % | 91,39 % | +0,64 pt | −0,42 pt |

### 2025 à maturité

| Estimation | Part réglée au 31/12 retenue | AMO 2025 | AMO 24→25 | Dépense 2025 | Reste après AMO | Reste 24→25 |
|---|---:|---:|---:|---:|---:|---:|
| Part observée en 2024 (retenue) | 89,7 % | 16 660,62 M€ | **+8,09 %** | 18 212,31 M€ | 1 551,68 M€ | **+10,68 %** |
| Part moyenne 2016–2023 (hors 2020) | 90,9 % | 16 451,56 M€ | **+6,73 %** | 17 983,77 M€ | 1 532,21 M€ | **+9,30 %** |

**Lecture.** La part AMO ne bouge pas : dépense et remboursement dérivent
ensemble. En 2024, le reste après AMO est stable (+8 M€). En 2025, la baisse
affichée est une troncature ; à maturité, l'année est en hausse sensible, et le
reste après AMO avec elle. L'ordre de grandeur (+7 à +8 % d'AMO, dépense
2025 à maturité de 18,0 à 18,2 Md€) est cohérent avec l'année civile (+8,8 %
d'AMO, 18,1 Md€ de dépense) une fois l'effet de cadence retiré. En année
civile, le reste après AMO fait un saut de +15 % en 2025 après une baisse en
2024 : c'est la lecture qu'aurait une complémentaire en année comptable, et
elle amplifie la dérive réelle (+9 à +11 %). Le tout sera confirmé ou infirmé
par les flux du premier semestre 2026.

## 4. Honoraires — « Hospitalisation Honoraires »

### Année de soins (survenance)

| Mesure | 2022 | 2023 | 2024 | 2025 obs. | 23→24 | 24→25 obs. |
|---|---:|---:|---:|---:|---:|---:|
| Dépense présentée (M€) | 1 217,45 | 1 322,45 | 1 382,36 | 1 398,07 | +4,53 % | +1,14 % |
| Remboursement AMO (M€) | 840,25 | 886,08 | 902,71 | 898,63 | +1,88 % | −0,45 % |
| Reste après AMO (M€) | 377,20 | 436,37 | 479,65 | 499,43 | **+9,92 %** | +4,12 % |
| Part AMO | 69,02 % | 67,00 % | 65,30 % | 64,28 % | **−1,70 pt** | **−1,03 pt** |

### Année de règlement AMO (année civile)

| Remboursement AMO (M€) | 2022 | 2023 | 2024 | 2025 | 23→24 | 24→25 |
|---|---:|---:|---:|---:|---:|---:|
| Par année de soins | 840,25 | 886,08 | 902,71 | 898,63 | +1,88 % | −0,45 % |
| Par année de règlement | 836,22 | 883,84 | 903,27 | 953,54 | +2,20 % | **+5,57 %** |
| dont soins de l'année | 787,20 | 830,83 | 848,07 | 898,63 | +2,08 % | +5,96 % |
| dont soins de l'année précédente | 48,88 | 52,87 | 54,98 | 54,64 | +3,99 % | −0,63 % |

| Mesure, par année de règlement | 2022 | 2023 | 2024 | 2025 | 23→24 | 24→25 |
|---|---:|---:|---:|---:|---:|---:|
| Dépense présentée (M€) | 1 209,24 | 1 318,09 | 1 380,43 | 1 478,00 | +4,73 % | **+7,07 %** |
| Remboursement AMO (M€) | 836,22 | 883,84 | 903,27 | 953,54 | +2,20 % | +5,57 % |
| Reste après AMO (M€) | 373,03 | 434,25 | 477,17 | 524,46 | **+9,88 %** | **+9,91 %** |
| Part AMO | 69,15 % | 67,05 % | 65,43 % | 64,52 % | −1,62 pt | −0,92 pt |

### 2025 à maturité

| Estimation | Part réglée au 31/12 retenue | AMO 2025 | AMO 24→25 | Dépense 2025 | Reste après AMO | Reste 24→25 |
|---|---:|---:|---:|---:|---:|---:|
| Part observée en 2024 (retenue) | 93,9 % | 956,54 M€ | **+5,96 %** | 1 488,15 M€ | 531,62 M€ | **+10,83 %** |
| Part moyenne 2016–2023 (hors 2020) | 93,5 % | 961,04 M€ | **+6,46 %** | 1 495,16 M€ | 534,12 M€ | **+11,35 %** |

**Lecture.** Le signal est le même trois années de suite : la dépense présentée
augmente plus vite que la base remboursée par l'AMO, la part AMO recule d'un à
deux points par an, et le reste après AMO — où vivent les dépassements
d'honoraires — croît d'environ 10 % par an. Ici, la cadence n'explique rien :
la part réglée dans l'année est identique en 2024 et 2025, et l'année civile
dit la même chose que l'année de soins à maturité : AMO +5,6 % contre +6,0 à
+6,5 %, dépense +7,1 % contre +7,7 à +8,2 %, reste après AMO +9,9 % contre
+10,8 à +11,4 %.
C'est une dérive de survenance, qui pèse directement sur une garantie
hospitalisation couvrant les honoraires.

## 5. Comment 2025 est ramenée à maturité

Le fichier s'arrête aux flux de décembre 2025 : les soins de fin 2025 ne sont
pas encore tous réglés. On redresse avec la **part de l'année de soins déjà
réglée au 31 décembre de la même année**, mesurée sur les années closes :

| Année de soins | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Séjours | 91,2 % | 90,7 % | 90,7 % | 91,1 % | 90,5 % | 91,2 % | 90,5 % | 90,7 % | 89,7 % |
| Honoraires | 93,4 % | 92,8 % | 93,3 % | 93,6 % | 93,4 % | 94,0 % | 93,7 % | 93,8 % | 93,9 % |

AMO 2025 à maturité = AMO observé / part retenue. Deux parts sont proposées
(celle de 2024, et la moyenne 2016–2023 hors 2020) : elles encadrent le résultat.
La dépense présentée est redressée avec la **même** part que l'AMO — dépense et
remboursement d'un même acte sont enregistrés ensemble — de sorte que la part
AMO 2025 est celle qui est observée, sans redressement.

**Pourquoi cette méthode et non la puce « en consolidation » de l'outil.** La
puce redresse mois par mois avec un profil de liquidation ; sur l'hospitalisation
et à horizon douze mois, ce profil **surestime** systématiquement (décembre, observé
zéro mois, est divisé par une part de ~17 % : toute irrégularité est amplifiée
six fois). Le backtest sur les années de soins 2019–2024, chacune estimée à fin
décembre de son année puis comparée à ce qui est réglé aujourd'hui :

| Écart estimation / réel | Méthode mois par mois (outil) | Part de l'année N−1 (retenue ici) |
|---|---:|---:|
| Séjours, 2019–2024 | +2,95 % à +5,62 % | −1,04 % à +0,76 % |
| Honoraires, 2019–2024 | +3,24 % à +5,04 % | −0,35 % à +0,68 % |

Avec la méthode de l'outil, 2025 ressortirait à +11,6 % (séjours) et +10,7 %
(honoraires) : c'est une borne haute, pas une estimation centrale. Ce point est
à reporter dans l'outil (point 3.4 de la mission) ; il n'a pas été modifié ici.

## 6. Cadence de règlement AMO et lecture « ROC »

**Ce que DAMIR montre.** La part de l'année de soins réglée au 31 décembre est
stable depuis dix ans (tableau du § 5). À plus court terme, la cadence AMO a
même **ralenti** en 2024 et 2025 : sur les soins de janvier à juin, la part
réglée à M+1 passe de 75–79 % (2016–2023) à 59 % (2024) et 64 % (2025) pour les
séjours — creux de liquidation en avril 2024 (394 M€ réglés contre ~1 260
habituellement) et en avril 2025, rattrapés le mois suivant. Ces à-coups se
résorbent dans l'année, mais ils déforment toute lecture trimestrielle ou
semestrielle en année civile.

**Ce que le ROC ferait, et où on le verrait.** Le ROC accélère et sécurise la
facturation de la part complémentaire par les établissements (moins de rejets,
délais plus courts). Il ne touche pas aux flux AMO. Pour une complémentaire,
l'année de sa montée en charge cumule la queue normale des soins de l'année
précédente et le flux accéléré des soins de l'année : la charge **en année
comptable** monte sans que la consommation ait changé, et une part des rejets
d'hier devient des prestations payées. En **année de soins** avec des provisions
correctement recalées, l'effet est neutre — c'est ce que Charlène a écrit à
Hervé Dumontroty.

**Le test à proposer au client.** Comparer, sur sa garantie hospitalisation,
la dérive en année de soins et la dérive en année comptable, poste par poste,
aux repères ci-dessus (secteur privé) :

| Repère DAMIR | 2024 | 2025 (à maturité) |
|---|---:|---:|
| Séjours — dépense présentée | +5,1 % | +7,0 à +8,3 % |
| Séjours — reste après AMO | +0,6 % | +9,3 à +10,7 % |
| Honoraires — dépense présentée | +4,5 % | +7,7 à +8,2 % |
| Honoraires — reste après AMO | +9,9 % | +10,8 à +11,4 % |
| Séjours — dépense en année civile | +3,7 % | +9,3 % (observé) |
| Séjours — reste après AMO en année civile | −3,8 % | +15,0 % (observé) |
| Honoraires — dépense en année civile | +4,7 % | +7,1 % (observé) |
| Honoraires — reste après AMO en année civile | +9,9 % | +9,9 % (observé) |

- Dérive en année de soins de l'assureur **du même ordre** que ces repères, mais
  charge en année comptable **nettement au-dessus** : l'écart est un effet de
  cadence, compatible avec une montée en charge du ROC. À corriger dans les
  triangles de règlement (PSAP) plutôt qu'à répercuter en tarif.
- Dérive en année de soins **elle-même très supérieure** aux repères : ce n'est
  pas le ROC, c'est le portefeuille (mix d'établissements, réseau, niveau de
  garantie sur les honoraires).
- Sur les **honoraires**, une dégradation d'environ 10 % par an du reste après
  AMO est déjà dans le marché, ROC ou pas.

**Ce que DAMIR ne dit pas.** Ni les règlements des complémentaires, ni le
partage patient / complémentaire du reste après AMO, ni la distinction des
établissements ROC et non ROC, ni la chambre particulière (13 M€ de dépense en
2025 : quasiment absente du fichier, puisque non remboursée).

## 7. Annexe — l'ensemble du grand poste, et la correction du message d'hier

| Poste | Dép. 2023 | Dép. 2024 | Dép. 2025 | AMO 2023 | AMO 2024 | AMO 2025 | Part 2023 | Part 2024 | Part 2025 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Hospitalisation Sejour | 15 998,33 | 16 815,43 | 16 339,28 | 14 604,41 | 15 413,53 | 14 947,18 | 91,29 % | 91,66 % | 91,48 % |
| Transport | 6 285,14 | 6 455,67 | 5 734,60 | 6 056,80 | 6 193,36 | 5 503,24 | 96,37 % | 95,94 % | 95,97 % |
| Hospitalisation Forf.Journalie | 2 652,33 | 2 223,57 | 288,15 | 661,54 | 678,25 | 563,75 | 24,94 % | 30,50 % | 195,64 % |
| Dotations & forfaits établissements | 840,10 | 2 157,71 | 2 160,24 | 840,10 | 2 157,71 | 2 160,24 | 100,00 % | 100,00 % | 100,00 % |
| Hospitalisation Honoraires | 1 322,45 | 1 382,36 | 1 398,07 | 886,08 | 902,71 | 898,63 | 67,00 % | 65,30 % | 64,28 % |
| Hospitalisation Supplements | 969,25 | 980,33 | 766,31 | 960,55 | 976,77 | 762,68 | 99,10 % | 99,64 % | 99,53 % |
| Hospi.Chambre Part.Lit Accompa | 29,74 | 17,40 | 13,50 | 8,85 | 0,00 | 0,01 | 29,74 % | 0,02 % | 0,09 % |
| Classement par plage (à confirmer) | 0,03 | 1,58 | 1,61 | 0,03 | 1,57 | 1,60 | 99,88 % | 99,19 % | 99,38 % |
| Codes retirés (classement par plage) | — | — | 271,52 | — | — | 262,08 | — | — | 96,52 % |
| **Ensemble** | **28 097,37** | **30 034,04** | **26 973,28** | **24 018,36** | **26 323,89** | **25 099,41** | **85,48 %** | **87,65 %** | **93,05 %** |

Montants en M€, année de soins.

- **Forfait journalier** : la dépense présentée passe de ~230 M€ par mois à
  ~25 M€ à partir de novembre 2024, alors que l'AMO reste à ~55 M€ par mois.
  C'est un changement d'enregistrement, pas de consommation. Il retire ~430 M€
  de dépense à 2024 et ~2,4 Md€ à 2025, et rend la part AMO 2025 de ce poste
  (196 %) et de l'ensemble (93 %) ininterprétables.
- **Dotations & forfaits** : 840 → 2 158 M€, remboursés à 100 %. Leur poids
  relève mécaniquement la part AMO de l'ensemble.
- **Codes 4243 à 4247** : classés « retirés » par la nomenclature locale, ils
  apparaissent pour des soins à partir de juillet 2025 (premier flux en novembre
  2025) : 262 M€ d'AMO en cinq mois, part AMO 96 %, enveloppe hospitalière. Ce
  sont des prestations **nouvelles**, à identifier avec le dictionnaire 2025 ;
  selon leur nature, une partie de la baisse apparente d'autres postes en 2025
  pourrait être un transfert de codes.

**Correction du message d'hier.** Le taux de prise en charge AMO de l'ensemble
ne « passe » pas de 85,5 % à 87,6 % au sens d'une meilleure couverture : hors
dotations et forfait journalier, la dépense fait +4,26 %, l'AMO +4,31 %, la part
AMO 91,51 % → 91,56 % et le reste après AMO +3,67 % (2 088 → 2 165 M€). Ces
quatre chiffres se retrouvent par soustraction des deux lignes dans le tableau
ci-dessus. Le message tient sur les deux postes qui comptent pour une garantie
hospitalisation : séjours stables, honoraires en dérive.

En année de règlement, l'AMO de l'ensemble fait +8,79 % en 2024 et +5,68 % en
2025 (dépense +6,54 % puis −1,07 %, part AMO 85,5 % → 87,3 % → 93,3 % : mêmes
défauts d'enregistrement qu'en survenance) ; à maturité, l'AMO 2025 ressort à
+5,7 à +6,1 %.

## 8. Limites

- Hospitalisation **privée** : les séjours en hôpital public ne sont pas dans
  le fichier ; une garantie hospitalisation couvre aussi le public (forfait
  journalier, chambre particulière, ticket modérateur).
- **Reste après AMO ≠ charge de la complémentaire** : il inclut la part du
  patient, et rien ne le sépare.
- **2025 est une estimation** pour la partie « à maturité » : elle repose sur la
  stabilité de la part réglée dans l'année (±1 % en backtest, sauf 2020) et sur
  l'hypothèse d'une même cadence pour la dépense et l'AMO. Les flux de 2026 la
  confirmeront ou la corrigeront.
- Les à-coups de liquidation d'avril 2024 et avril 2025 interdisent de lire une
  cadence sur un trimestre ou un semestre.
- Aucune information sur le ROC dans la source : la note donne des repères de
  marché et un test, pas une mesure de l'effet.

## 9. Retrouver les chiffres dans l'outil

L'application doit tourner (`DAMIR.bat`, http://127.0.0.1:8000).

1. **Survenance** — DAMIR → Panorama, période 2022 à 2025, grand poste
   Hospitalisation, poste « Hospitalisation Sejour » puis « Hospitalisation
   Honoraires ». Lire successivement Dépense présentée, Montant remboursé, Part
   financée par la Sécurité sociale (variation en points) et Reste à charge
   après AMO. Le bouton **Voir les montants et la part Sécu** donne le tableau
   du § 3 et du § 4.
   - [Panorama — séjours](http://127.0.0.1:8000/?page=damir&section=panorama&view=evolution&start_year=2022&end_year=2025&grand_post=Hospitalisation&post=Hospitalisation%20Sejour&measure=coverage)
   - [Panorama — honoraires](http://127.0.0.1:8000/?page=damir&section=panorama&view=evolution&start_year=2022&end_year=2025&grand_post=Hospitalisation&post=Hospitalisation%20Honoraires&measure=coverage)
   - [Extraire — séjours, quatre mesures par année](http://127.0.0.1:8000/?page=extraction&source=damir&start_year=2022&end_year=2025&grand_post=Hospitalisation&post=Hospitalisation%20Sejour&dimensions=year&measures=reimbursed,expense,coverage,out_of_pocket)
   - [Extraire — honoraires](http://127.0.0.1:8000/?page=extraction&source=damir&start_year=2022&end_year=2025&grand_post=Hospitalisation&post=Hospitalisation%20Honoraires&dimensions=year&measures=reimbursed,expense,coverage,out_of_pocket)
   - [Extraire — tous les postes du grand poste (annexe)](http://127.0.0.1:8000/?page=extraction&source=damir&start_year=2023&end_year=2025&grand_post=Hospitalisation&dimensions=year,post&measures=reimbursed,expense,coverage,out_of_pocket)
2. **Année de règlement** — en haut du Panorama, choisir **Comparer les deux**
   (ou l'adresse avec `time_basis=both`). Les deux courbes sont les deux
   premières lignes des tableaux « année civile ». La dépense, la part AMO et
   le reste après AMO en année de règlement ne sont pas dans l'outil : le
   script les lit dans `cube_parts3/main_AAAA.parquet` (une tranche par année
   de règlement) avec les mêmes filtres de poste que l'outil.
   - [Comparer les deux — séjours](http://127.0.0.1:8000/?page=damir&section=panorama&view=evolution&start_year=2022&end_year=2025&grand_post=Hospitalisation&post=Hospitalisation%20Sejour&measure=reimbursed&time_basis=both)
   - [Comparer les deux — honoraires](http://127.0.0.1:8000/?page=damir&section=panorama&view=evolution&start_year=2022&end_year=2025&grand_post=Hospitalisation&post=Hospitalisation%20Honoraires&measure=reimbursed&time_basis=both)
3. **Décomposition par année de soins, parts réglées dans l'année, maturité,
   cadence, backtest** : ces calculs ne sont pas à l'écran ; ils lisent le cube
   des délais (`data/cube_delais.parquet`) avec les mêmes filtres que l'outil.
   Le script les imprime intégralement :

```powershell
app\backend\.venv\Scripts\python.exe tools\etude_roc_hospitalisation.py
```

`--json` donne les valeurs brutes en euros. Les cubes ne sont pas modifiés.
