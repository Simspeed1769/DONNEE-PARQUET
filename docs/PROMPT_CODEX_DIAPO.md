# Prompt pour Codex — refonte du diapo « Hospitalisation : dérive réelle ou effet ROC ? »

*À copier tel quel dans Codex, ouvert à la racine du dépôt `Outil_DAMIR`.*

---

## Ta mission

Refais le diapo PowerPoint **`Question Client Hospitalisation ROC.pptx`** (à la racine
du dépôt) en une version **v2**, sur le même modèle Forsides, en intégrant l'analyse
ci-dessous et les demandes de la relectrice (Charlène, Director, Forsides). Tu es
**libre sur la fabrication** : mise en page, choix des graphiques, découpage en
slides, formulations — tant que tu respectes les faits, les chiffres et les
contraintes de ce document. Vise **8 slides de contenu** (titre compris) plus la page
de fin du modèle. Tu peux en faire 7 ou 9 si c'est mieux ; pas plus.

**Sortie attendue** : `Question Client Hospitalisation ROC v2.pptx` à la racine
(ne pas écraser l'original), qui s'ouvre sans réparation dans PowerPoint, et un
court compte rendu de ce que tu as fait et de ce que tu n'as pas pu faire.

## Le contexte en trois paragraphes

**La question du client.** Hervé Dumontroty (Groupama, direction technique
assurances de particuliers) constate que la garantie hospitalisation de ses
contrats santé « paraît se détériorer » depuis le déploiement du ROC en 2025, et
n'arrive pas à séparer ce qui relève de l'effet ROC (un effet de cadence de
règlement) d'une vraie dérive de sinistralité. Ce manque de visibilité pèse sur
ses revalorisations tarifaires. Forsides (Charlène Fusis, Guillaume Bletio) lui a
répondu que le ROC ne devrait pas changer la consommation, seulement les cadences
et donc le provisionnement (PSAP), et a proposé une étude complémentaire.

**Ce que Simon a fait.** Avec l'outil DAMIR Studio (application locale construite
sur Open DAMIR, la base des remboursements de l'Assurance Maladie), il a mesuré la
dérive de l'hospitalisation privée 2022–2025, en année de soins (survenance) et en
année de règlement (année civile de remboursement), et a livré un premier diapo
de 6 slides le 18 septembre 2026. Ce diapo est celui que tu vas refaire.

**Ce que dit la relectrice (mail de Charlène du 18/09/2026, à intégrer point par
point).**
1. *Slide 2* : « Pourrais-tu présenter la base DAMIR en quelques phrases au tout
   début ? Car je ne suis pas sûre qu'ils connaissent cette base. Et peut-être
   ajouter la définition du ROC, pour que le support soit auto-porteur. »
2. *Slide 2, bloc « lecture des résultats »* : « Je ne suis pas encore convaincue
   car il peut y avoir des réformes réglementaires qui impactent aussi la lecture,
   il y en a eu une en 2026 mais je ne sais pas avant. »
3. *Slide 2, taux de liquidation* : « Je ne sais pas à quel point c'est pertinent
   si on se dit que le ROC vient perturber les cadences… peut-être qu'il faudrait
   calculer le taux de liquidation 2023, 2024, et appliquer à cela une déformation
   en fonction de la montée en charge du ROC. »
4. *Slides 3 et 4* : « Pourrais-tu ajouter 2024 également dans les tableaux et
   graphes ? »
5. *Slides 3 et 4, conclusions* : « Sur le poste Hospi global, on dit que la part
   AMO augmente plus fortement que la dépense et qu'il pourrait donc y avoir un
   effet ROC, mais le ROC ne concerne que la part de dépassement pour laquelle on
   n'a pas de vision dans DAMIR, et je trouve ça très étrange que la part de la
   Sécu augmente… il faudrait lire le rapport de la DREES. »

Les réponses à ces cinq points sont dans l'analyse ci-dessous ; le diapo doit les
porter sans dire « Charlène avait raison » — il doit simplement être juste.

## Le diapo actuel (à refaire, pas à rafistoler)

Fichier : `Question Client Hospitalisation ROC.pptx`, format 16:9 réduit
(10 × 6,25 pouces, 9 144 000 × 5 715 000 EMU). Modèle Forsides ; mises en page
utilisées : **« Page de garde »** (slide 1), **« Contenu sans spirale »** (slides 2
à 5 : un titre en haut à gauche, un sous-titre, zone de contenu libre), **« Slide
fin »** (slide 6, avec `communication@forsides.com`). Réutilise ces trois mises
en page ; ne crée pas de nouveau thème, ne change pas les polices ni les couleurs
du modèle.

Contenu actuel, pour savoir ce que tu remplaces :
- **Slide 1** — Titre « Hospitalisation : dérive réelle ou effet ROC ? », sous-titre
  « Remboursements de l'Assurance Maladie, 2023 à 2025 », « Septembre 2026 ».
- **Slide 2** — « Ce que l'on regarde, et comment » : deux périmètres (Honoraires,
  Hospitalisation globale), périmètre et limites de DAMIR, bloc « Lecture des
  résultats », méthode de projection de 2025.
- **Slide 3** — « Hospitalisation Honoraires, une vraie dérive » : deux tableaux
  (année de soins 2023 / 2025 liquidée / 2025 projetée ; année comptable 2023 /
  2025), deux graphiques en colonnes (dépense et AMO 2023 vs 2025 ; part AMO 2023–
  2025), conclusion.
- **Slide 4** — « Hospitalisation globale ⇒ une piste ROC » : même structure sur
  l'ensemble du grand poste ; conclusion « la part AMO augmente, donc si la
  garantie se dégrade, effet de cadence lié au ROC ». **Cette slide est fausse**
  (voir plus bas) : elle disparaît, remplacée par la rééducation.
- **Slide 5** — « Dérive observée et hypothèse ROC » : deux colonnes de conclusion.
- **Slide 6** — page de fin.

Les tableaux et graphiques actuels sont des objets natifs PowerPoint (tables et
charts) : garde des **objets natifs**, pas des images, pour que Simon puisse
retoucher.

## Ce que DAMIR est, et ce qu'il ne contient pas (pour la slide « DAMIR »)

**Open DAMIR** : base publique de l'Assurance Maladie (Cnam), tous régimes. Chaque
ligne = un mois de soins × une prestation (nature de prestation, ~1 300 codes) ×
une région × une tranche d'âge × un sexe × nature d'assurance × ALD, avec la
**dépense présentée** (ce qui est facturé), le **montant remboursé** par l'AMO, la
base de remboursement, les **dépassements** et les quantités. Elle couvre les soins
de ville et les **établissements privés** (cliniques) ; elle ne contient **pas les
séjours de l'hôpital public** (seulement ses actes et consultations externes et
quelques prestations comme le forfait journalier). Elle ne contient **ni ce que
paie la complémentaire, ni la chambre particulière** (non remboursable). L'outil
DAMIR Studio la lit sur le poste de Simon, sans réseau ; flux arrêtés au
31/12/2025.

Deux datations disponibles :
- **Année de soins (survenance)** : les soins de l'année, quelle que soit la date
  du paiement. Les dernières années sont incomplètes tant que tout n'est pas
  liquidé (2025 est liquidée à ~90 % pour les séjours, ~94 % pour l'anesthésie au
  31/12/2025).
- **Année de règlement AMO (année civile)** : ce que l'AMO a payé pendant l'année,
  toutes années de soins confondues. Complète par construction. C'est la lecture
  « comptable », la plus proche de ce que voit un assureur dans ses comptes —
  mais ce n'est pas l'année comptable d'une complémentaire.

Mesures utilisées : dépense présentée ; remboursement AMO ; **reste après AMO** =
dépense − remboursement (il mêle ticket modérateur, dépassements, franchises ; il
inclut la part du patient : ce n'est pas la charge de la mutuelle) ; **part AMO** =
remboursement / dépense ; **dépassements** (montants facturés au-delà du tarif) ;
**part des dépassements** = dépassements / dépense.

Vocabulaire à expliquer une fois, simplement : sur un séjour, l'AMO rembourse
80 % du tarif et laisse 20 % (le ticket modérateur), sauf patients exonérés (ALD,
actes lourds, maternité : 100 %) ; les cliniques ne facturent pas au-dessus du
tarif, donc **sur les séjours, reste après AMO = ticket modérateur**. Sur les
honoraires (anesthésie, chirurgie), les actes sont presque tous exonérés mais le
praticien facture au-dessus du tarif : **reste après AMO = dépassements**.

## Ce que le ROC est (pour la slide « ROC »)

**ROC = Remboursement des Organismes Complémentaires.** Dispositif national de
**tiers payant dématérialisé sur la part complémentaire** des prestations
hospitalières (ticket modérateur, forfait journalier, chambre particulière et
autres prestations facturées à l'AMC) : l'établissement interroge en temps réel
les droits du patient auprès de sa complémentaire, calcule la part AMC, obtient
un **engagement de paiement**, et facture directement la complémentaire (norme
DRE-ES). Programme SIMPHONIE, accord de 2021 entre l'État, les fédérations
hospitalières et les complémentaires.

Calendrier et chiffres (sources en bas) :
- **19 septembre 2024** : 473 établissements de santé entrés dans le dispositif,
  soit **58 %** des établissements publics et ESPIC concernés ; **88 organismes
  complémentaires** raccordés, couvrant **97 % de la population protégée**. Fin de
  déploiement prévue 2025–2026.
- **Établissements privés (cliniques)** : expérimentation à la **rentrée 2025**
  (deux cliniques pilotes, à Montpellier et à Marseille), montée en charge **septembre 2026**, généralisation **2027**.
- Effet mesuré par les complémentaires : **rejets de factures passés de 10–15 % à
  0,1–0,2 %**.

Ce que ça change pour une complémentaire : des factures qui étaient rejetées
(et parfois jamais payées) sont payées ; elles arrivent plus vite. L'année de
montée en charge cumule la queue des soins de l'année précédente, les soins de
l'année accélérés, et les rejets d'hier. **Charge en année comptable en hausse,
consommation inchangée** : c'est un effet de cadence, à corriger dans les
triangles de règlement (PSAP), pas dans le tarif.

Conséquence pour l'étude, à dire clairement : en 2025, le ROC joue **à l'hôpital
public**, que DAMIR ne contient pas. **DAMIR ne peut pas mesurer le ROC.** Ce qu'il
apporte : le repère de la vraie dérive du privé, poste par poste, et la preuve
que la cadence de l'AMO n'a pas accéléré.

Point 5 de Charlène, à corriger sans le dire : le ROC concerne la part
complémentaire entière, pas seulement les dépassements ; et les dépassements
**sont** dans DAMIR (mesure « Dépassements »). Ce qui n'y est pas, c'est le
partage patient / complémentaire et les séjours du public.

## L'analyse — le message à porter

La dégradation d'une garantie hospitalisation a **quatre composantes**, et DAMIR
en situe trois :

| Composante | Nature | Ce que DAMIR en dit |
|---|---|---|
| Dépassements d'honoraires (anesthésie ; chirurgie hors périmètre) | **vraie dérive**, de fond | +10 %/an, à tous les âges, dans les deux datations, ROC ou pas |
| Ticket modérateur des séjours de rééducation (SSR/SMR) | **vraie hausse**, d'origine réglementaire (réforme du financement des SMR au 01/01/2024), ciblée sur les moins de 60 ans | +8,5 % en 2024, ≈ +20 % en 2025 à maturité ; ×2 à ×3 chez les 0–49 ans, −30 % chez les 80 ans et plus |
| Rattrapage de facturation de la rééducation | **calendrier** (privé) | +27 % de dépense et +33 % de reste après AMO en année de règlement 2025 |
| ROC | **calendrier** (public en 2025) | invisible dans DAMIR ; à lire sur les flux de l'assureur, public / privé séparés |

Et une composante **sans dérive** : les séjours ordinaires en clinique (chirurgie,
médecine, obstétrique — code 2111, le plus gros poste) : dépense +2,7 % en 2024,
reste après AMO +2,4 %, part AMO 96 %, aucune bosse en année de règlement.

Message de conclusion : *ce que l'assureur observe n'est pas « soit ROC, soit
dérive ». C'est une vraie hausse sur deux postes précis (dépassements
d'honoraires, ticket modérateur de rééducation) plus deux effets de calendrier
qui gonflent l'année 2025 (rattrapage de la rééducation dans le privé, ROC dans le
public). Lire poste par poste, en date de soins puis en date de paiement, public
et privé séparés, sépare les deux : ce qui est vrai se tarife, ce qui est
calendrier se provisionne.*

**Pourquoi la slide « Hospitalisation globale » de la v1 était fausse** (point 5 de
Charlène) : la part AMO de l'ensemble du grand poste (85,5 % → 87,6 % → 93,1 %)
monte pour deux raisons d'enregistrement, pas de couverture : (a) la **dotation
populationnelle SSR** (code 2192), créée par la réforme SMR, 1 283 M€ en 2024,
remboursée à 100 % ; (b) la **dépense du forfait journalier** (code 2251) n'est
plus enregistrée dans DAMIR depuis novembre 2024 (≈ 200 M€ par mois → ≈ 0), alors
que le remboursement AMO continue. Hors ces deux postes, la part AMO est stable
(91,5 % → 91,6 %). La DREES confirme par l'autre bout : dans le secteur privé, la
part de la Sécurité sociale **recule** de 0,6 point en 2024 (87,9 %), celle des
ménages monte de 0,8 point (6,7 %), celle des complémentaires baisse de 0,2 point
(5,1 %). Ne pas reprendre la conclusion « part AMO en hausse ⇒ piste ROC ».

**Réformes qui déforment la lecture 2024–2025** (point 2 de Charlène — à lister
sur la slide de lecture) :
- 1er janvier 2024 : **réforme du financement des SMR** (décret 2023-696) — les
  cliniques de rééducation passent du prix de journée à des tarifs nationaux par
  type de séjour, plus une dotation populationnelle ; nouveaux codes de
  prestation ; difficultés de trésorerie et facturation retardée en 2024
  (700 M€ liquidés fin septembre 2024 pour les premiers mois).
- 2024 : doublement des franchises et participations forfaitaires (DREES).
- Novembre 2024 : la dépense du forfait journalier n'est plus enregistrée dans
  DAMIR (changement d'enregistrement, cause non documentée).
- Juillet 2025 : 262 M€ de prestations hospitalières nouvelles sans libellé dans
  la nomenclature locale (codes 4243–4247).
- 2026 : la réforme citée par Charlène — à nommer avec elle ; laisser une ligne
  « 2026 : … (à préciser) ».

**Point 3 de Charlène (taux de liquidation + déformation ROC)** : à cadrer sur une
slide, sans le chiffrer. Ce que DAMIR fournit : la cadence AMO par poste comme
témoin « sans ROC » (part de l'année de soins réglée dans l'année : séjours
ordinaires 91 % stable depuis 2021, anesthésie 94 % stable, rééducation 89 % →
84 % en 2024) ; toute accélération que l'assureur voit sur ses flux est propre au
canal complémentaire. Le profil de déformation ROC, c'est le calendrier public
ci-dessus (58 % des établissements en 09/2024 → 100 % en 2025–2026), à appliquer
à la **seule part publique** du portefeuille. Le chiffrage demande les flux de
Groupama par établissement et par date de soins : ce n'est pas dans DAMIR.

## Les chiffres à présenter (M€ ; 2022 · 2023 · 2024 · 2025)

2025 en année de soins = observée au 31/12/2025, **non redressée** ; indique
toujours « liquidée à ~90 % » (séjours) ou « ~94 % » (anesthésie). 2025 en année de
règlement = complète. Si tu veux une valeur 2025 à maturité, utilise les
redressements indiqués (montant observé ÷ part réglée dans l'année de 2024) et
dis-le.

### Bloc A — Séjours ordinaires en clinique : code 2111 « Frais d'hébergement et environnement en GHS »

| Année de soins | 2022 | 2023 | 2024 | 2025 obs. | 23→24 |
|---|---:|---:|---:|---:|---:|
| Dépense présentée | 8 155 | 8 833 | 9 067 | 8 792 | +2,7 % |
| Remboursement AMO | 7 823 | 8 488 | 8 714 | 8 463 | +2,7 % |
| Reste après AMO | 333 | 345 | 353 | 330 | +2,4 % |
| Part AMO | 95,9 % | 96,1 % | 96,1 % | 96,3 % | +0,0 pt |

| Année de règlement | 2022 | 2023 | 2024 | 2025 | 23→24 | 24→25 |
|---|---:|---:|---:|---:|---:|---:|
| Dépense présentée | 8 114 | 8 795 | 9 063 | 9 405 | +3,0 % | +3,8 % |
| Remboursement AMO | 7 785 | 8 452 | 8 709 | 9 039 | +3,0 % | +3,8 % |
| Reste après AMO | 329 | 344 | 354 | 366 | +2,9 % | +3,6 % |
| Part AMO | 96,0 % | 96,1 % | 96,1 % | 96,1 % | | |

Volume (nombre d'unités, code 2111 seul) +2,0 % en 2024, dépense moyenne par
unité +0,6 %. Lecture : pas de dérive, pas de bosse de calendrier.

### Bloc B — Rééducation (SSR/SMR) : 14 codes

Codes : **2211** « Frais de séjour » et **2339** « Autres forfaits divers » (ancien
mode, jusqu'en 2023 ; ce qui y reste en 2024–2025 est probablement la psychiatrie
privée et d'autres prix de journée, gardé pour comparer le même champ) ; **2110**
« Frais séjour SSR » et **3145 à 3156** (« Rachis non opéré », « Rachis opéré »,
« Membre inférieur opéré / non opéré », « Aff. neuro-musculaires ou rhumatismes
inflammatoires », « Aff. respiratoires, maxillo-faciales et ORL », « Rééducation
abdominale et périnéo-sphinctérienne », « Rééducation affections vasculaires »,
« Amputations », « Déviation du rachis », « Soins palliatifs ») depuis 2024. Le
code 2211 tombe de 3 326 à 967 M€ en janvier 2024, le code 2110 apparaît à 1 432 M€,
les codes 31xx montent en charge de février à juin 2024.

| Année de soins | 2022 | 2023 | 2024 | 2025 obs. | 23→24 | 24→25 obs. |
|---|---:|---:|---:|---:|---:|---:|
| Dépense présentée | 3 517 | 3 665 | 4 144 | 4 315 | +13,1 %* | +4,1 % |
| Remboursement AMO | 2 994 | 3 118 | 3 552 | 3 682 | +13,9 %* | +3,7 % |
| Reste après AMO | 523 | 546 | 593 | 633 | **+8,5 %** | +6,8 % |
| Part AMO | 85,1 % | 85,1 % | 85,7 % | 85,3 % | | |

\* niveau non comparable entre 2023 et 2024 (réforme) : la DREES mesure +1,0 %
d'activité SMR privée en 2024. Lire le reste après AMO et les ordres de grandeur,
pas la croissance de la dépense. 2025 à maturité (part réglée dans l'année
84–89 %) : dépense +17 à +23 %, reste après AMO +20 à +27 %.

| Année de règlement | 2022 | 2023 | 2024 | 2025 | 23→24 | 24→25 |
|---|---:|---:|---:|---:|---:|---:|
| Dépense présentée | 3 516 | 3 676 | 3 893 | 4 953 | +5,9 % | **+27,2 %** |
| Remboursement AMO | 2 991 | 3 124 | 3 351 | 4 232 | +7,3 % | +26,3 % |
| Reste après AMO | 525 | 552 | 541 | 721 | −2,0 % | **+33,2 %** |
| Part AMO | 85,1 % | 85,0 % | 86,1 % | 85,4 % | | |

Part de l'année de soins réglée par l'AMO dans l'année : 2021 90,3 % · 2022
88,4 % · 2023 89,0 % · **2024 84,4 %** (contre 91,3 % stable pour les séjours
ordinaires).

**Reste après AMO par tranche d'âge, année de soins, 2023 → 2024** (M€) :

| Âge | 0–19 | 20–29 | 30–39 | 40–49 | 50–59 | 60–69 | 70–79 | 80 + |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 2023 | 8,2 | 13,7 | 15,9 | 29,6 | 59,4 | 92,1 | 141,0 | 186,2 |
| 2024 | 31,3 | 30,6 | 48,2 | 58,1 | 78,0 | 94,2 | 124,6 | 127,9 |
| Variation | ×3,8 | ×2,2 | ×3,0 | ×2,0 | +31 % | +2 % | −12 % | −31 % |

Hors ALD +8,6 %, ALD −21 % ; femmes +4,3 %, hommes −4,0 %. Lecture : le ticket
modérateur de rééducation ne monte que de 8,5 % au total, mais il **change de
patients** — il se déplace vers les actifs non exonérés, précisément la
population d'un contrat collectif. Le mécanisme exact (tarifs nationaux plus
élevés que l'ancien prix de journée sur les rééducations ordinaires ; patients
âgés exonérés) est l'hypothèse la plus simple ; il n'est pas démontrable dans
DAMIR — le dire comme une hypothèse.

### Bloc C — Anesthésie : code 1323 « Acte d'anesthésie CCAM » (= 95 % du poste « Hospitalisation Honoraires » de l'outil ; chiffres du poste entier)

| Année de soins | 2022 | 2023 | 2024 | 2025 obs. | 23→24 | 24→25 obs. |
|---|---:|---:|---:|---:|---:|---:|
| Dépense présentée | 1 217 | 1 322 | 1 382 | 1 398 | +4,5 % | +1,1 % |
| Remboursement AMO | 840 | 886 | 903 | 899 | +1,9 % | −0,5 % |
| Reste après AMO | 377 | 436 | 480 | 499 | **+9,9 %** | +4,1 % |
| dont dépassements | 374 | 434 | 478 | 498 | **+10,3 %** | +4,2 % |
| Part AMO | 69,0 % | 67,0 % | 65,3 % | 64,3 % | −1,7 pt | −1,0 pt |
| Part des dépassements | 30,8 % | 32,8 % | 34,6 % | 35,7 % | +1,8 pt | +1,0 pt |

2025 à maturité (part réglée dans l'année 93,9 %) : dépense 1 489 (+7,7 %),
reste après AMO 532 (+10,8 %).

| Année de règlement | 2022 | 2023 | 2024 | 2025 | 23→24 | 24→25 |
|---|---:|---:|---:|---:|---:|---:|
| Dépense présentée | 1 209 | 1 318 | 1 380 | 1 478 | +4,7 % | +7,1 % |
| Remboursement AMO | 836 | 884 | 903 | 954 | +2,2 % | +5,6 % |
| Reste après AMO | 373 | 434 | 477 | 524 | **+9,9 %** | **+9,9 %** |
| dont dépassements | 370 | 431 | 476 | 523 | +10,4 % | +10,0 % |
| Part AMO | 69,2 % | 67,1 % | 65,4 % | 64,5 % | | |
| Part des dépassements | 30,6 % | 32,7 % | 34,5 % | 35,4 % | | |

Volume d'actes +1,1 % en 2024 ; dépassements en hausse de +9 à +13 % dans
**chaque** tranche d'âge. Lecture : une dérive de prix (dépassements), pas de
volume ni de mix ; identique dans les deux datations, donc aucun effet de
calendrier. Précision honnête à porter : les honoraires de chirurgie (code 1321,
1,2 Md€ de dépassements, +8 % en 2024) sont hors du poste de l'outil et mêlent
cabinet et clinique ; les honoraires des praticiens en clinique font 6,6 Md€ selon
la DREES, l'anesthésie n'en est qu'une partie.

### Repères de contexte (facultatifs)

- Ensemble du grand poste Hospitalisation, part AMO : 85,5 % · 85,5 % · 87,6 % ·
  93,1 % — l'artefact expliqué plus haut. Dotation populationnelle SSR (2192) :
  0 · 840 · 2 158 · 2 160 (avec la dotation file active psy, poste entier) ;
  2192 seule : 1,1 en 2023, 1 283 en 2024, 1 269 en 2025. Forfait journalier
  (poste), dépense : 2 389 · 2 652 · 2 224 · 288.
- DREES, Comptes de la santé 2024 (édition 2025) : soins hospitaliers du privé
  lucratif 27,1 Md€ (+4,1 % en 2024, après +5,2 %) ; honoraires des praticiens en
  clinique 6,6 Md€ (+4,5 %) ; MCO +3,2 %, SMR +1,0 %, HAD +10,2 % ; prix des soins
  hospitaliers privés +0,9 %. Financement du privé : Sécurité sociale 87,9 %
  (−0,6 pt), complémentaires 5,1 % (−0,2 pt), ménages 6,7 % (+0,8 pt, deuxième
  année de hausse).

## Structure proposée (tu peux l'adapter)

1. **Titre** — « Hospitalisation : dérive réelle ou effet ROC ? » ; sous-titre
   « Ce que disent les remboursements de l'Assurance Maladie, 2022–2025 » ;
   septembre 2026.
2. **DAMIR en trois phrases** — ce que c'est, ce qu'on y voit (dépense, AMO, reste
   après AMO, dépassements ; deux datations), ce qu'on n'y voit pas (hôpital
   public, part mutuelle, chambre particulière, établissements ROC / non ROC).
   Visuel : un schéma « dans / hors » ou une table à deux colonnes.
3. **Le ROC** — définition, ce qu'il change pour une complémentaire, calendrier
   public / privé. Visuel : une frise 2021 → 09/2024 (58 %, 88 AMC, 97 %) →
   rentrée 2025 (pilotes privés) → 09/2026 → 2027, et le chiffre « rejets 10–15 %
   → 0,1–0,2 % » en gros.
4. **Comment lire** — trois blocs (séjours ordinaires / rééducation / anesthésie),
   deux datations, et la frise des réformes 2024–2026 qui déforment la lecture.
   C'est ici que se répondent les points 2 et 3 de Charlène ; rester sobre.
5. **Séjours ordinaires : pas de dérive** — bloc A. Tableau 2022–2025 (année de
   soins + année de règlement) et un graphique : colonnes du reste après AMO dans
   les deux datations, ou courbe dépense / AMO / part AMO. Une phrase de
   conclusion.
6. **Rééducation : une réforme, une vraie hausse ciblée, un rattrapage** — bloc B.
   Deux graphiques : (a) reste après AMO 2022–2025, année de soins contre année de
   règlement, qui montre la bosse +33 % en 2025 ; (b) reste après AMO par tranche
   d'âge, 2023 contre 2024, qui montre le déplacement vers les jeunes. Tableau
   compact. Note « niveau 2023/2024 non comparable (réforme) ».
7. **Anesthésie : les dépassements dérivent** — bloc C. Graphique : colonnes des
   dépassements 2022–2025 (les deux datations se superposent) et courbe de la part
   des dépassements 30,8 → 35,7 %. Tableau avec 2024 (point 4 de Charlène).
8. **Conclusion** — le tableau des quatre composantes, le protocole de lecture pour
   Groupama (par bloc, par datation, public / privé séparés ; ce qui est vrai se
   tarife, ce qui est calendrier se provisionne), et « ce que DAMIR ne dit pas »
   (part ROC en euros, séjours du public, partage patient / mutuelle).
9. **Page de fin** du modèle.

## Contraintes

- **Aucun chiffre qui ne soit dans ce document** (ou recalculé avec l'outil, voir
  ci-dessous). Ne pas arrondir au point de changer le sens ; garder les
  variations avec une décimale.
- **Français soigné**, voix active, vocabulaire constant : « reste après AMO »,
  « part AMO », « dépassements », « année de soins », « année de règlement »,
  « rééducation (SSR/SMR) », « séjours ordinaires en clinique ». Pas
  d'anglicismes.
- Ne jamais écrire que DAMIR mesure le ROC, ni que « la part AMO monte donc ROC ».
  Distinguer toujours ce qui est **démontré** (les chiffres), ce qui est
  **expliqué par une réforme** (rééducation), et ce qui est **hypothèse**
  (mécanisme du déplacement par âge ; part du ROC chez Groupama).
- Chaque slide chiffrée porte en pied : « Source : Open DAMIR, Assurance Maladie ·
  flux arrêtés au 31/12/2025 · traitement Forsides ». Les slides DAMIR / ROC
  citent leurs sources externes (ci-dessous) en petit.
- Objets natifs (tables, charts), polices et couleurs du modèle. Pas de texte qui
  déborde ; les tableaux à 6 colonnes tiennent en 9–10 pt dans ce format. Le
  format est petit (10 × 6,25 po) : privilégier un tableau + un graphique par
  slide, pas trois.
- Ne pas supprimer d'information de la v1 sans équivalent : la méthode de
  redressement de 2025 peut se réduire à une note de bas de slide.

## Outils à ta disposition

- `app/backend/.venv/Scripts/python.exe` a **python-pptx** (lire le diapo,
  ajouter des slides depuis une mise en page, tables et charts natifs). Pour
  dupliquer une slide avec sa mise en forme, passe par l'XML (`ppt/slides/`) ou
  reconstruis depuis la mise en page « Contenu sans spirale ». Vérifie le fichier
  produit en le rouvrant avec python-pptx ; LibreOffice n'est probablement pas
  installé, ne bloque pas dessus.
- Pour recontrôler un chiffre, l'application tourne sur `http://127.0.0.1:8000`
  (`DAMIR.bat` à la racine si elle ne tourne pas). `POST /api/explore` avec
  `{"start_year":2022,"end_year":2025,"grand_post":"Hospitalisation",
  "post":"Hospitalisation Sejour","service_codes":[2111],"breakdown":"none",
  "time_axis":"care"}` (ou `"payment"`) renvoie les composantes brutes par année
  (`dep`, `rem`, `depas`, `qte`) ; reste après AMO = `dep − rem`. Le poste
  « Hospitalisation Honoraires » sans `service_codes` donne le bloc C ; les 14
  codes du bloc B en `service_codes` donnent le bloc B. `POST /api/extraction/preview`
  avec `dimensions` et `measures` donne des tableaux prêts. Aucun appel réseau
  externe : tout est local.
- `docs/ETUDE_HOSPITALISATION_PAR_POSTE.md` (rapport complet du 20/09/2026, avec
  annexe chiffrée) et `docs/ETUDE_HOSPITALISATION_2022_2025.md` (note du 18/09,
  méthode de redressement de 2025, cadences) sont la référence si un chiffre te
  manque. `tools/etude_roc_hospitalisation.py` imprime les cadences et le
  redressement.

## Sources externes à citer

- ROC, périmètre et services : GIE SESAM-Vitale, page « ROC Établissements »
  (https://www.sesam-vitale.fr/en/roc-es).
- ROC, chiffres au 19/09/2024 et effet sur les rejets : Groupe VYV, « Le
  dispositif ROC : où en est-on ? »
  (https://www.groupe-vyv.fr/informations/le-dispositif-roc-ou-en-est-on/).
- ROC dans le privé : FHP-MCO, « ROC : place aux cliniques et hôpitaux privés »,
  21/07/2025 (https://www.fhpmco.fr/2025/07/21/roc-place-aux-cliniques-et-hopitaux-prives/).
- Réforme SMR : Sénat, question écrite 2024 sur la réforme du financement des SMR
  (référence qSEQ241000269) (https://www.senat.fr/questions/base/2024/qSEQ241000269.html).
- DREES, *Les dépenses de santé en 2024 — Résultats des comptes de la santé*,
  édition 2025, fiche 02 « Les soins hospitaliers ».

## Avant de rendre

1. Rouvre le fichier avec python-pptx, liste les slides et leurs textes ; vérifie
   qu'aucun texte de la v1 rendu faux ne subsiste (« piste ROC », « la part AMO
   augmente donc… », « 2025 projetée » sans note).
2. Relis chaque chiffre contre les tableaux de ce document.
3. Vérifie qu'aucune zone de texte ne dépasse la slide (10 × 6,25 po) et que les
   tableaux ne débordent pas de leur cadre.
4. Rends le fichier v2 et un compte rendu de 10 lignes : structure retenue,
   graphiques faits, ce qui reste à arbitrer (par exemple la réforme 2026 à
   nommer, ou le choix d'afficher 2025 à maturité).
