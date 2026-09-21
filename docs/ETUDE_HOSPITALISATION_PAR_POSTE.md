# Hospitalisation dans DAMIR : ce que l'outil montre poste par poste, et où sont les pistes

*Rapport du 20 septembre 2026, à partir de l'outil (tous les découpages : poste,
prestation, âge, sexe, ALD, nature d'assurance, enveloppe, région, année de
soins et année de règlement, cadence de liquidation) et des sources
externes citées au § 6. Flux Open DAMIR arrêtés au 31/12/2025. Montants en M€.*

Il répond aux retours de Charlène du 18 septembre et prépare la refonte du diapo.
Il complète `ETUDE_HOSPITALISATION_2022_2025.md` (méthode de maturité, tableaux
détaillés), qu'il ne remplace pas.

## 1. Le message en cinq points

1. **« Hospitalisation globale » ne se lit pas.** La part AMO de l'ensemble
   (85,5 % → 87,6 % → 93,1 %) monte pour deux raisons d'enregistrement, pas de
   couverture : la **dotation populationnelle SSR** (1 283 M€ nouveaux en 2024,
   remboursés à 100 %) et le **forfait journalier dont la dépense n'est plus
   enregistrée depuis novembre 2024** (2,4 Md€ de dépense qui disparaissent).
   Hors ces deux postes, la part AMO est stable (91,5 % → 91,6 %). La DREES
   dit la même chose autrement : dans le privé, la part de la Sécurité sociale
   **recule** de 0,6 point en 2024 (87,9 %). La slide 4 et la conclusion
   « piste ROC » du diapo reposent sur cet artefact : à retirer.
2. **Le poste « Hospitalisation Honoraires » de l'outil, c'est l'anesthésie
   (96 %)**, pas les honoraires des praticiens en clinique (6,6 Md€ selon la
   DREES). Sa dérive est réelle et entièrement faite de **dépassements**
   (reste après AMO 436 → 480 → 499 M€ obs., dépassements 434 → 478 → 498) :
   volume plat (+1 %), dépassement moyen en hausse, **uniforme à tous les
   âges** (+9 à +13 % en 2024). Ce n'est ni un effet de mix ni un effet de
   cadence (94 % réglés dans l'année, stable). La chirurgie CCAM (1,2 Md€ de
   dépassements, +8 à +9 % en 2024 hors transfert des chirurgiens-dentistes)
   est hors du grand poste et mêle ville et clinique.
3. **Les séjours hors rééducation (MCO, dialyse, HAD, psy : 12,7 Md€) sont
   sages** : dépense +2,7 % en 2024 (volume +2,0 %, prix +0,6 % sur le GHS),
   reste après AMO **−4,6 %**, part AMO 93,6 %. 2025 à maturité : +3 à +4 %.
   Aucune dérive.
4. **La rééducation (SSR/SMR, 4,1 Md€) est le vrai foyer de mouvement, et il
   est réglementaire** : la réforme du financement des SMR s'applique aux
   flux depuis le **1er janvier 2024** (nouveaux codes de prestation, nouveau
   niveau de facturation, dotation à part). Trois effets visibles :
   - le **niveau** n'est pas comparable (+13 % en 2024, encore +17 à +23 % en
     2025 à maturité, alors que la DREES mesure +1 % d'activité SMR privée) ;
   - le **reste après AMO se déplace vers les moins de 60 ans** : ×2 à ×3 en
     2024 pour les 0–49 ans, **−30 % pour les 80 ans et plus** ; le total du
     bloc ne bouge que de +8,5 %. Un portefeuille d'actifs voit donc ses
     tickets modérateurs de séjour grimper alors que le marché est plat ;
   - la **cadence de règlement a ralenti** (84 % de l'année de soins 2024
     réglés dans l'année, contre 89 % avant) et **2025 en année civile
     rattrape : +27 % de dépense, +33 % de reste après AMO**. C'est l'essentiel
     du +9,3 % / +15 % des séjours en année comptable 2025.
5. **Le ROC ne peut pas être vu dans DAMIR, et en 2025 il ne concerne pas
   encore les cliniques.** Le ROC couvre la part complémentaire des séjours
   (ticket modérateur, forfait journalier, chambre particulière…) ; il est
   déployé dans le **public et les ESPIC** (58 % des établissements en
   septembre 2024, 88 AMC couvrant 97 % des assurés) ; pour les
   **établissements privés, l'expérimentation commence à la rentrée 2025**,
   la montée en charge est prévue en septembre 2026 et la généralisation en
   2027. DAMIR ne contient que les séjours du privé : le signal ROC que voit
   Groupama en 2025 vient de sa **part publique**, hors du fichier. Ce que
   DAMIR apporte : les repères de dérive du privé, poste par poste, et la
   preuve que la cadence AMO n'a pas accéléré.

## 2. Ce que DAMIR contient pour l'hospitalisation

| Élément d'une garantie hospitalisation | Dans DAMIR ? | Où, et avec quel défaut |
|---|---|---|
| Frais de séjour en clinique (MCO, dialyse, HAD, psy, SMR) | Oui | Poste « Hospitalisation Sejour », 76 codes. Rupture SMR au 01/2024. |
| Frais de séjour à l'hôpital public | **Non** | Hors champ Open DAMIR (sauf actes externes). |
| Honoraires en clinique | Partiel | Anesthésie dans le poste « Honoraires » ; chirurgie et actes techniques dans « Actes Technique et de Chirurgie », ville et clinique confondues. |
| Dépassements d'honoraires | **Oui** | Mesure « Dépassements » de l'outil (colonne `depas`) : contrairement à ce qui a été dit, ils sont dans la base. |
| Ticket modérateur de séjour | Oui, par différence | Reste après AMO = dépense − AMO ; sur les séjours, c'est le TM (dépassements ≈ 0). |
| Forfait journalier (public et privé) | Jusqu'en oct. 2024 | Dépense ≈ 200 M€/mois puis ≈ 0 à partir de nov. 2024 ; l'AMO (≈ 34 M€/mois, exonérés) continue. |
| Chambre particulière | Non | 13 M€ de dépense en 2025 : non remboursable, donc absente. |
| Part payée par la complémentaire | **Non** | Le reste après AMO mêle patient et complémentaire. |
| Établissements ROC / non ROC | **Non** | Aucune variable d'établissement dans le fichier. |

## 3. Les repères, poste par poste

### Année de soins (survenance)

| Périmètre | Dép. 2023 | Dép. 2024 | 23→24 | Reste 2023 | Reste 2024 | 23→24 | Part AMO 2024 | 2025 à maturité (dép. / reste) |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Séjours hors SMR | 12 334 | 12 671 | **+2,7 %** | 848 | 809 | **−4,6 %** | 93,6 % | +3 à +4 % / +3 % |
| Bloc SSR/SMR | 3 665 | 4 144 | +13,1 %* | 546 | 593 | +8,5 %* | 85,7 % | +17 à +23 %* / +20 à +27 %* |
| Séjours, poste entier | 15 998 | 16 815 | +5,1 % | 1 394 | 1 402 | +0,6 % | 91,7 % | +7 à +8 % / +9 à +11 % |
| Anesthésie (« Honoraires ») | 1 322 | 1 382 | +4,5 % | 436 | 480 | **+9,9 %** | 65,3 % | +7,7 % / +10,8 % |
| Chirurgie CCAM (ville + clinique) | 3 446 | 3 603 | +4,6 % | 1 275 | 1 387 | +8,7 % | 61,5 % | — |
| Forfait journalier | 2 652 | 2 224 | rupture | 1 991 | 1 545 | rupture | — | ininterprétable |

\* niveau non comparable (réforme SMR au 01/2024) ; lire les ordres de grandeur, pas les taux.

### Année de règlement AMO (année civile)

| Périmètre | Dép. 24→25 | Reste 24→25 | Ce que ça dit |
|---|---:|---:|---|
| Séjours hors SMR | +3,8 % | +2,8 % | même chose qu'en survenance : pas d'effet de cadence |
| Bloc SSR/SMR | **+27,2 %** | **+33,2 %** | rattrapage des factures 2024 réglées en 2025 |
| Séjours, poste entier | +9,3 % | +15,0 % | = hors SMR + rattrapage SMR |
| Anesthésie | +7,1 % | +9,9 % | idem survenance : dérive de fond |

Part de l'année de soins réglée par l'AMO dans l'année : séjours hors SMR
91,3 % (stable 2021–2024), anesthésie 94 % (stable), SMR 89 % → **84,4 % en 2024**,
forfait journalier 88 % → 84 %. **Aucune accélération côté AMO** : si l'assureur en
voit une sur ses flux, elle est propre au canal complémentaire.

### Ce qui bouge par population (séjours, reste après AMO, 2023 → 2024)

| | 0–19 | 20–29 | 30–39 | 40–49 | 50–59 | 60–69 | 70–79 | 80 + |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Séjours hors SMR | −8 % | −2 % | +1 % | −2 % | −4 % | −3 % | −4 % | −9 % |
| Bloc SSR/SMR | **×3,8** | **×2,2** | **×3,0** | **×2,0** | +31 % | +2 % | −12 % | **−31 %** |
| Séjours, poste entier | +14 % | +22 % | +34 % | +26 % | +10 % | −1 % | −8 % | −21 % |

Hors ALD : reste +8,6 % ; ALD : −21 %. Femmes +4,3 %, hommes −4,0 % (rééducation
périnéo-sphinctérienne et orthopédie ambulatoire dans les nouveaux codes). Par région,
le bloc SMR va de −23 % (Bourgogne-Franche-Comté) à ×2,2 (Bretagne) : c'est le
calendrier de bascule des établissements, pas une épidémiologie.

## 4. Réponses aux points de Charlène

- **« Le ROC ne concerne que la part de dépassement, qu'on n'a pas dans DAMIR. »**
  Deux corrections. Le ROC concerne la **part complémentaire** des prestations
  hospitalières (ticket modérateur, forfait journalier, chambre particulière et
  autres prestations facturées à l'AMC), pas seulement les dépassements. Et les dépassements **sont** dans
  DAMIR (mesure « Dépassements ») : sur l'anesthésie ils font 100 % du reste
  après AMO, sur la chirurgie plus de 90 %. Ce que DAMIR n'a pas, c'est le partage
  patient / complémentaire, et les séjours du public.
- **« Très étrange que la part de la Sécu augmente. »** Elle n'augmente pas :
  c'est la dotation SSR à 100 % et la dépense du forfait journalier qui
  disparaît. Voir § 1, point 1, et la DREES (part Sécu privé −0,6 pt en 2024,
  ménages +0,8 pt, complémentaires −0,2 pt).
- **« Des réformes réglementaires impactent aussi la lecture. »** Oui, et
  elles se voient dans le fichier. À lister sur la slide de lecture :
  réforme du financement des SMR (flux au 01/01/2024 ; trésorerie et
  facturation retardées en 2024, 700 M€ liquidés fin septembre 2024 pour les
  premiers mois) ; forfait journalier non enregistré depuis 11/2024 ;
  doublement des franchises et participations forfaitaires en 2024 (DREES) ;
  la réforme 2026 qu'elle cite, à identifier. (Les 262 M€ de codes nouveaux
  4243–4247 apparus en juillet 2025 relèvent de l'enveloppe soins de ville et
  de la plage des transports : ils ne concernent pas l'hospitalisation.)
- **« Calculer le taux de liquidation 2023 et 2024, puis appliquer une
  déformation ROC. »** Faisable, mais pas depuis DAMIR : la cadence AMO est
  stable, la déformation est propre au canal complémentaire. Ce que l'étude
  peut fournir : (a) la cadence AMO par poste comme témoin « sans ROC » ;
  (b) le calendrier public du ROC comme profil de déformation, à appliquer à
  la **seule part publique** du portefeuille (58 % des établissements en
  09/2024 → déploiement achevé 2025–2026 ; cliniques à partir de 2026) ; (c) le
  mécanisme : rejets passés de 10–15 % à 0,1–0,2 %, donc des factures qui
  n'étaient pas payées le deviennent, et plus tôt. L'année de bascule cumule
  la queue des soins N−1, les soins N accélérés et les rejets d'hier.
- **« Ajouter 2024 dans les tableaux et graphiques. »** Les tableaux du § 3
  et de l'annexe ont 2022 à 2025, dans les deux datations.

## 5. Ce que je propose pour le diapo et pour Groupama

1. **Remplacer la lecture « honoraires / global » par quatre postes** : séjours
   hors rééducation (sage), rééducation (réforme 2024, à isoler), honoraires
   d'anesthésie (dérive de dépassements, ~+10 %/an), forfait journalier (hors
   lecture). Chaque poste avec ses deux datations et 2022–2025.
2. **Le test à proposer au client**, poste par poste, public / privé séparés :
   - dérive en année de soins du même ordre que les repères, mais charge
     comptable 2025 nettement au-dessus → cadence (ROC sur le public, réforme
     SMR sur le privé) : à corriger dans les triangles, pas dans le tarif ;
   - dérive en année de soins elle-même très supérieure → portefeuille
     (mix d'établissements, réseau, niveau de garantie sur les dépassements) ;
   - sur les honoraires, ~+10 %/an de dépassements est déjà dans le marché.
3. **Une slide de définition** : DAMIR (Open DAMIR : remboursements de
   l'Assurance Maladie tous régimes, soins de ville et cliniques, pas de
   séjours du public, pas de part complémentaire) et ROC (tiers payant
   dématérialisé de la part complémentaire entre établissements et AMC ;
   en cours dans le public et les ESPIC — 58 % des établissements en
   septembre 2024, fin prévue 2025–2026 —, privé 2025–2027 ; effets : rejets, délais,
   engagement de paiement en temps réel).
4. **Ce que l'étude ne tranchera pas** : la part ROC / dérive dans un chiffre
   Groupama, sans leurs flux par établissement et par date de soins. Le
   livrable honnête est : les repères de marché, la liste des réformes, et le
   protocole de lecture.

## 6. Sources externes utilisées

- ROC : périmètre, établissements éligibles (EPS, HIA, PNL ex-DG, privés
  ex-OQN), services (IDB, SIM, CLC, DEL, DRE-ES) — [GIE SESAM-Vitale](https://www.sesam-vitale.fr/en/roc-es) ;
  chiffres de déploiement au 19/09/2024 (473 établissements, 58 %, 88 AMC,
  97 % de la population ; rejets 10–15 % → 0,1–0,2 %) — [Groupe VYV](https://www.groupe-vyv.fr/informations/le-dispositif-roc-ou-en-est-on/) ;
  calendrier privé (pilotes rentrée 2025, montée en charge 09/2026,
  généralisation 2027) — [FHP-MCO, 21/07/2025](https://www.fhpmco.fr/2025/07/21/roc-place-aux-cliniques-et-hopitaux-prives/).
- Réforme SMR : décret 2023-696, application intégrale en 2024, difficultés de
  trésorerie ex-OQN, 700 M€ liquidés fin 09/2024 — [Sénat, question écrite 2024](https://www.senat.fr/questions/base/2024/qSEQ241000269.html).
- DREES, *Les dépenses de santé en 2024*, fiche 02 « Les soins hospitaliers »
  (édition 2025) : privé lucratif 27,1 Md€ (+4,1 %), honoraires en clinique
  6,6 Md€ (+4,5 %), SMR +1,0 %, MCO +3,2 %, financement du privé : Sécu 87,9 %
  (−0,6 pt), OC 5,1 % (−0,2 pt), ménages 6,7 % (+0,8 pt) — [PDF](https://drees.solidarites-sante.gouv.fr/sites/default/files/2025-12/CNS%20-%20Fiche%2002%20-%20Les%20soins%20hospitaliers.pdf).

## 7. Limites de l'outil rencontrées en chemin (à traiter plus tard, pas maintenant)

- `POST /api/reliability` répond « Aucun règlement sur ce périmètre » pour
  des prestations nées en 2024 (codes SMR) : la cadence n'est observée que
  jusqu'en 2023.
- Le libellé « Hospitalisation Honoraires » laisse croire à l'ensemble des
  honoraires en clinique ; c'est l'anesthésie.
- Sur les séjours, la quantité change d'unité en 2024 (47 M → 123 M) et le
  ticket modérateur calculé fait +54 % : les mesures « volume », « moyenne
  par unité » et « ticket modérateur » ne se lisent pas sur ce poste au-delà
  de 2023.
- Les codes 4243–4247 restent classés « retirés » et rangés par plage sous
  Hospitalisation ; ils portent 262 M€ d'AMO en 2025, mais leur enveloppe
  (soins de ville à 91 %), leur plage (42xx, celle des transports) et leur
  profil (83 % de patients en ALD) désignent plutôt des transports. À
  reclasser dès que le dictionnaire 2025 donne leur libellé.

## Annexe — montants par périmètre, 2022–2025 (M€)

Année de soins = date du soin (2025 observée au 31/12/2025, non redressée). Année de
règlement = date du remboursement AMO, toutes années de soins confondues. Part AMO =
AMO / dépense. Le bloc SSR/SMR réunit les anciens codes 2211 et 2339 et les codes nés
en 2024 (2110, 3145–3156) ; « séjours hors SMR » est le reste du poste « Hospitalisation
Sejour ».

| Périmètre | Datation | Mesure | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---:|---:|---:|---:|
| Séjours hors SMR (MCO, dialyse, HAD, psy…) | soins | Dépense | 11 524 | 12 334 | 12 671 | 12 024 |
|  |  | AMO | 10 715 | 11 486 | 11 862 | 11 265 |
|  |  | Reste après AMO | 810 | 848 | 809 | 759 |
| | | Part AMO | 93,0 % | 93,1 % | 93,6 % | 93,7 % |
|  | règlement | Dépense | 11 458 | 12 282 | 12 660 | 13 138 |
|  |  | AMO | 10 664 | 11 425 | 11 846 | 12 301 |
|  |  | Reste après AMO | 794 | 857 | 814 | 837 |
| | | Part AMO | 93,1 % | 93,0 % | 93,6 % | 93,6 % |
| Bloc SSR/SMR (rééducation) | soins | Dépense | 3 517 | 3 665 | 4 144 | 4 315 |
|  |  | AMO | 2 994 | 3 118 | 3 552 | 3 682 |
|  |  | Reste après AMO | 523 | 546 | 593 | 633 |
| | | Part AMO | 85,1 % | 85,1 % | 85,7 % | 85,3 % |
|  | règlement | Dépense | 3 516 | 3 676 | 3 893 | 4 953 |
|  |  | AMO | 2 991 | 3 124 | 3 351 | 4 232 |
|  |  | Reste après AMO | 525 | 552 | 541 | 721 |
| | | Part AMO | 85,1 % | 85,0 % | 86,1 % | 85,4 % |
| Séjours (poste entier) | soins | Dépense | 15 041 | 15 998 | 16 815 | 16 339 |
|  |  | AMO | 13 709 | 14 604 | 15 414 | 14 947 |
|  |  | Reste après AMO | 1 332 | 1 394 | 1 402 | 1 392 |
| | | Part AMO | 91,1 % | 91,3 % | 91,7 % | 91,5 % |
|  | règlement | Dépense | 14 974 | 15 958 | 16 553 | 18 091 |
|  |  | AMO | 13 655 | 14 549 | 15 198 | 16 533 |
|  |  | Reste après AMO | 1 318 | 1 409 | 1 355 | 1 558 |
| | | Part AMO | 91,2 % | 91,2 % | 91,8 % | 91,4 % |
| Honoraires (poste = anesthésie à 96 %) | soins | Dépense | 1 217 | 1 322 | 1 382 | 1 398 |
|  |  | AMO | 840 | 886 | 903 | 899 |
|  |  | Reste après AMO | 377 | 436 | 480 | 499 |
| | | Part AMO | 69,0 % | 67,0 % | 65,3 % | 64,3 % |
|  | règlement | Dépense | 1 209 | 1 318 | 1 380 | 1 478 |
|  |  | AMO | 836 | 884 | 903 | 954 |
|  |  | Reste après AMO | 373 | 434 | 477 | 524 |
| | | Part AMO | 69,2 % | 67,1 % | 65,4 % | 64,5 % |
| Chirurgie CCAM 1321+1325 (ville + clinique) | soins | Dépense | 3 112 | 3 446 | 3 603 | 3 614 |
|  |  | AMO | 1 987 | 2 171 | 2 217 | 2 204 |
|  |  | Reste après AMO | 1 125 | 1 275 | 1 387 | 1 410 |
| | | Part AMO | 63,8 % | 63,0 % | 61,5 % | 61,0 % |
|  | règlement | Dépense | 3 093 | 3 429 | 3 610 | 3 802 |
|  |  | AMO | 1 977 | 2 160 | 2 224 | 2 325 |
|  |  | Reste après AMO | 1 116 | 1 269 | 1 386 | 1 477 |
| | | Part AMO | 63,9 % | 63,0 % | 61,6 % | 61,2 % |
| Forfait journalier | soins | Dépense | 2 389 | 2 652 | 2 224 | 288 |
|  |  | AMO | 645 | 662 | 678 | 564 |
|  |  | Reste après AMO | 1 745 | 1 991 | 1 545 | -276 |
| | | Part AMO | 27,0 % | 24,9 % | 30,5 % | 195,6 % |
|  | règlement | Dépense | 2 368 | 2 637 | 2 329 | 302 |
|  |  | AMO | 643 | 659 | 647 | 673 |
|  |  | Reste après AMO | 1 725 | 1 979 | 1 682 | -371 |
| | | Part AMO | 27,2 % | 25,0 % | 27,8 % | 222,8 % |
| Dotations & forfaits établissements | soins | Dépense | 0 | 840 | 2 158 | 2 160 |
|  |  | AMO | 0 | 840 | 2 158 | 2 160 |
|  |  | Reste après AMO | 0 | 0 | 0 | 0 |
| | | Part AMO | — | 100,0 % | 100,0 % | 100,0 % |
|  | règlement | Dépense | 0 | 827 | 2 136 | 2 195 |
|  |  | AMO | 0 | 827 | 2 136 | 2 195 |
|  |  | Reste après AMO | 0 | 0 | 0 | 0 |
| | | Part AMO | — | 100,0 % | 100,0 % | 100,0 % |
| Ensemble grand poste Hospitalisation | soins | Dépense | 25 722 | 28 097 | 30 034 | 26 973 |
|  |  | AMO | 21 995 | 24 018 | 26 324 | 25 099 |
|  |  | Reste après AMO | 3 727 | 4 079 | 3 710 | 1 874 |
| | | Part AMO | 85,5 % | 85,5 % | 87,6 % | 93,1 % |
|  | règlement | Dépense | 25 571 | 28 174 | 30 015 | 29 695 |
|  |  | AMO | 21 883 | 24 096 | 26 213 | 27 703 |
|  |  | Reste après AMO | 3 687 | 4 077 | 3 802 | 1 993 |
| | | Part AMO | 85,6 % | 85,5 % | 87,3 % | 93,3 % |
