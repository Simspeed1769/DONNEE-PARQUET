
## v3 · Phase 1 — Transitions homogènes dans Panorama

- **Fait** : hauteur de graphique constante **par lecture** et non plus par forme
  (Territoire 520 partout, Âge 430 partout) ; `id` de série stable ajouté aux
  builders mono-série qui n'en avaient pas (classement territorial, comparaison
  par sexe, `rankOption`, `pieOption`, `waterfallOption`) ; fondu court de 130 ms
  dans `EChart` quand la transition passe par une forme non morphable (carte).
- **Diagnostic** : le remontage de composant, suspecté, a été écarté par la
  mesure — le conteneur n'enregistre aucune mutation d'enfant. Les deux vraies
  causes étaient le redimensionnement du conteneur au milieu de l'animation et
  l'absence de `seriesKey` (aucun `id`) sur les formes mono-série.
- **Écarté** : rien.

## v3 · Phase 2 — Comparer n'importe quoi, et le dire en haut

- **Fait** : le bloc « Ce que je compare » remonte sous le titre, réduit à un
  résumé d'une ligne ; son édition s'ouvre en `position: absolute` (graphique
  déplacé de 0 px, mesuré). Nom de série éditable et persisté dans l'URL
  (`series_names`), avec un nom auto tiré de **ce qui distingue** la série des
  autres et non de tous ses filtres. Les formes cumulatives (Camembert) sont
  retirées — pas grisées — dès que deux séries diffèrent de population.
- **Décision** : le mode « comparer selon une dimension » reste le défaut ; les
  séries sur mesure sont l'extension, dans le même bloc, sans changer d'écran.
- **Écarté** : rien.

## v3 · Phase 3 — Pathologies, CSP et Mortalité sur le gabarit DAMIR

- **Fait** : les trois fiches n'ont plus qu'**un seul graphique piloté** par une
  barre de lectures et une barre de formes, comme DAMIR. Chaque base déclare ses
  lectures et ses formes licites dans son modèle (`pathologies/model.ts`,
  `csp/model.ts`, `mortality/model.ts`), sur le vocabulaire commun
  `charts/reading.ts`. Lecture, forme et mesure sont persistées dans l'URL.
- **Décision** : Mortalité n'offre **pas** de lecture Territoire et le dit — le
  CépiDc est une source nationale sans population de référence ; une carte y
  serait inventée. Les prévalences et les parts n'ouvrent ni camembert ni pile :
  ce sont des rapports, ils ne composent pas un tout.
- **Correction** : le classement (`rank`) mettait en rang des **séries** sur leur
  dernière valeur. Une fiche met en rang des **modalités** d'une série unique —
  régions, tranches, causes. `buildOption` prend désormais un `rankBy` explicite,
  et le classement par modalité porte une teinte unique : il encode une
  magnitude, pas des identités.
- **Écarté** : `pathologies/charts.ts` et `mortality/charts.ts`, devenus vides de
  sens une fois les formes tirées de `buildOption` ; `csp/charts.ts` se réduit à
  la carte, seule forme sans équivalent générique.

## v3 · Phase 4 — Croisements : une seule porte d'entrée

- **Décision** : Croisements n'expose plus que le mode Guidé. Choisir entre
  « Lien », « Modèle » et « Guidé » était déjà une question de spécialiste,
  posée avant même la question de fond.
- **Fait** : l'écran avancé part entier dans `correlations/AdvancedCross.tsx`,
  compilé mais non routé — le rebrancher tient en une ligne de rendu.
  `RegressionPanel.tsx` et les endpoints de corrélation restent en place et
  servis. Preuve que rien n'est embarqué pour rien : le lot Croisements passe de
  41,5 ko à 17,5 ko.
- **Écarté** : rien n'est supprimé.

## v3 · Phase 5 — Nommer l'axe, nommer le dénominateur

- **Fait** : `buildOption` et les constructeurs de Panorama prennent un titre
  d'axe, qui suit l'axe des modalités et bascule en ordonnée sur les formes
  horizontales. Année, Région, Tranche d'âge, Sexe, Cause de décès, Groupe
  socioprofessionnel, Séries comparées, Sujets comparés.
- **Fait** : nouvel écran « Ce que compte chaque mesure » dans Données & méthode
  — numérateur et dénominateur des 31 mesures des cinq surfaces, relevés dans le
  code du serveur et non de mémoire (`methodology/denominators.ts`).
- **Corrigé — Mortalité** : le mot « part » recouvrait deux dénominateurs. Sur
  l'évolution et les causes, une part se rapporte aux décès toutes causes ; sur
  les profils d'âge et de sexe, aux décès de la seule cause affichée. L'axe et
  les réserves le disent maintenant, lecture par lecture.
- **Corrigé — Croisements, défaut de fond** : la table de la Cartographie est
  départementale **et** porte ses agrégats (`dept = '999'`, `cla_age_5 =
  'tsage'`, `sexe = '9'`). `correlations.py` sommait les agrégats avec les
  cellules qu'ils résument : l'Île-de-France pesait 25,3 millions d'habitants au
  lieu de 12,5, et les patients d'une pathologie y étaient comptés quatre fois
  (2 779 240 au lieu de 694 790 pour le diabète en 2022). Le dénominateur compte
  en outre désormais des années-personnes, faute de quoi quatre ans de dépenses
  étaient rapportés à une seule année de population. Cinq tests verrouillent ces
  nombres contre la ligne qui fait autorité
  (`tests/test_correlation_denominators.py`).
- **Vérifié sur les données, pas supposé** : `population_reference` de la CSP
  vaut exactement la somme des effectifs des six groupes d'une même cellule ; le
  `MAX(npop)` de la Cartographie sélectionne bien la population générale, les
  pathologies propres à un sexe portant celle de leur seul sexe.
- **Signalé sans le corriger** : le taux de mortalité des Croisements emprunte
  son dénominateur à la Cartographie, faute d'en trouver un au CépiDc.
  Numérateur et dénominateur ne viennent donc pas de la même source ; la table
  des dénominateurs le dit en toutes lettres plutôt que de laisser croire à un
  taux homogène.
- **Écarté** : rien.

## v3 · Phase 6 — Quatre formes de plus, chacune sous condition

- **Fait** : aires empilées (part du total, année après année), barres
  divergentes autour de zéro sur la rampe `--diverge`, carte de chaleur
  année × modalité sur la rampe séquentielle, pyramide des âges. Toutes passent
  par `buildOption`, héritent donc des transitions, du titre d'axe et de
  l'export en clair.
- **Conditions, jamais un bouton grisé** : les aires et les écarts demandent
  deux années ; la carte de chaleur, quatre séries — en dessous elle est moins
  lisible que les barres qu'elle remplacerait ; les aires demandent en outre une
  mesure additive et des séries de même population. La pyramide n'est offerte
  que sur des effectifs : sur une prévalence ou une part, ses deux ailes
  seraient des taux et leur longueur mentirait sur le nombre de personnes.
- **Décision de nommage** : « Aires 100 % » a été renommé « Aires empilées ».
  Les séries retenues ne pèsent qu'une partie du total et l'empilement ne
  remplit pas la hauteur ; le nom dit la forme, l'axe dit la part.
- **Signalé, hors périmètre** : en thème sombre, les panneaux de contenu restent
  clairs dans toute l'application — y compris sur des écrans qu'aucune phase de
  v3 n'a touchés, Repères par exemple. C'est antérieur à cette mission et la
  correction demanderait de reprendre `styles.css`.
- **Écarté** : rien.

## v4 · Phase 1 + 1 bis — Un seul format de KPI, un axe entier, des nombres français

- **Fait (1.A)** : les cartes encadrées de Pathologies, CSP et Mortalité
  disparaissent. Les repères passent au format DAMIR — une ligne, valeur en gras
  et libellé discret — sur la même bande que le choix de forme, dans
  `ChartShell`. La question descend sous la bande : à trois éléments, la ligne
  débordait sur les écrans étroits.
- **Fait (1.B)** : le nom de l'axe des valeurs est écrit par ECharts **au-dessus**
  de la grille et n'entre pas dans `containLabel`. Avec 16 px de marge haute,
  « % de la population de référence Cnam » était coupé en deux dans la hauteur.
  La marge passe à 30 px, ici et dans les constructeurs de Panorama.
- **Fait (1 bis)** : `Bn` disparaît des formateurs — au-delà du milliard on
  écrit `1 250 Md €`, une seule unité. Un **niveau** ne porte plus de signe
  (`6,6 %` et non `+6,6 %`), le signe restant aux variations. `+1.03 point(s)`
  devient `+1,03 point`, virgule française et accord au pluriel, via un
  formateur nommé côté serveur. « 0,8 femme touchée pour 1 homme » devient
  « 0,8 femme pour 1 homme ».
- **Non vérifié** : la revue aux largeurs 1400 / 1240 / 860 / 720 / 620 px
  exigée par la mission n'a pas pu être faite — l'outil de navigation de cette
  session ne réduit pas le viewport capturé, il rend toujours en 1568 px. La
  bande de KPI est construite pour se replier (`flex-wrap`), mais ce
  comportement reste à contrôler sur un vrai écran étroit.

## v4 · Phase 2 — Le choix de palette descend au niveau du graphique

- **Fait** : le contrôle rouge / bleu quitte l'en-tête de l'application pour la
  bande du graphique, en fin de rangée, après le choix de forme. Même traitement
  segmenté que les autres contrôles (`.pathology-toggle`), sur les quatre bases :
  `ChartShell` le porte pour Pathologies, CSP et Mortalité, les deux sections de
  DAMIR l'ont dans leur propre bande.
- **Fait** : l'état vit dans l'adresse (`palette=blue`), doublé d'une mémoire
  locale. Les trois fiches réécrivent leur URL de bout en bout : elles reportent
  le paramètre explicitement, sans quoi elles l'effaceraient. DAMIR fusionne
  déjà dans les paramètres existants et n'a rien demandé.
- **Piège corrigé** : le contrôle est un **enfant** de la carte-graphique, et
  React exécute les effets des enfants avant ceux de leurs parents. Poser
  l'attribut depuis un effet le posait donc après que `useChartTokens` a lu ses
  couleurs et avant qu'il ait installé son observateur : la mutation passait
  entre les deux, et le premier tracé sortait en rouge malgré un choix bleu
  mémorisé. La palette est désormais appliquée dans `main.tsx`, avant le premier
  rendu.
- **Décision** : le ratio femmes / hommes de Pathologies descend dans le tiroir
  « Valeurs ». C'est une phrase entière, et sur la bande elle poussait les
  contrôles du graphique à la ligne — le cas que la phase 1 avait prévu.
- **Écarté** : rien. Le changement de palette ne déclenche aucune requête, ne
  remonte pas l'instance ECharts, et l'export PNG le suit puisque `readLightTokens`
  ne force que le thème, jamais la palette.

## v4 · Phase 3 — Pathologies : Panorama + Comparer

- **Fait** : la page devient une coquille à deux sections, comme DAMIR. Le
  périmètre de population et la mesure vivent dans la coquille et suivent d'une
  section à l'autre ; chaque section garde ce qui n'appartient qu'à elle — la
  pathologie affichée pour Panorama, la liste comparée pour l'autre.
- **Fait** : Panorama garde ses quatre lectures et ses réserves (masquage Cnam
  affiché et chiffré, repère France, prévalence absente qui reste absente). La
  lecture « Pathologies » quitte le panorama : elle *était* la comparaison.
- **Fait** : un **seul** sélecteur (`PathologyPicker`), sur le modèle de
  `SeriesPicker` — un résumé sur une ligne, une liste qui s'ouvre dans le flux,
  une recherche, huit pathologies au plus. Les deux champs empilés disparaissent,
  la liste déroulante native avec eux ; les puces s'alignent dans leur rangée au
  lieu de flotter sur le champ ; le décompte du catalogue descend dans le
  sélecteur, où il renseigne au lieu de déboguer.
- **Fait (serveur)** : les métadonnées portent le poids de chaque « top » sur le
  dernier millésime. Proposer 118 pathologies dans l'ordre de la nomenclature
  demande de connaître la nomenclature ; classées par nombre de patients, les
  plus courantes se présentent d'elles-mêmes.
- **Décision** : à une seule pathologie retenue, la section affiche une invite
  et non un graphique intitulé comme une comparaison. Les formes cumulatives —
  empilé, camembert — n'apparaissent que sur les effectifs : une prévalence est
  un rapport, deux prévalences ne s'additionnent pas.
- **Corrigé au passage** : l'axe d'une quantité s'intitulait « M unités ».
  L'appelant sait ce qu'il compte — patients, décès, personnes — c'est son mot
  qui est repris, précédé du seul multiplicateur.
- **Non fait, à signaler** : les séries sur mesure avec leur propre périmètre de
  population, que la mission mentionne pour Comparer. Toutes les pathologies
  comparées partagent le périmètre de la coquille ; la réserve le dit. Cette
  capacité n'existait pas auparavant sur Pathologies, rien n'est donc perdu.

## v3 · Après-coup — le périmètre par série, enfin atteignable et juste

Deux défauts signalés à l'usage sur « Ce que je compare ». Les filtres de
population existaient depuis la phase 2 mais personne ne pouvait les atteindre,
et le seul chemin qui y menait faussait la série.

- **Le tiroir était rogné.** `.scope-editor` s'ouvrait en `position: absolute`
  au-dessus d'une liste qui vit déjà dans un panneau à défilement : deux zones
  de défilement imbriquées se disputaient la molette, et la section Population —
  sexe, âge, territoire, assurance, enveloppe, motif — restait sous la coupure.
  Le tiroir revient **dans le flux**, sous sa ligne de série : il pousse la
  liste, et le seul défilement du panneau y donne accès en entier.
- **La modalité se perdait en silence.** Ouvrir le périmètre d'une série tirée
  d'une modalité l'initialisait au périmètre *commun*, sans sa propre
  restriction : régler « Pharmacie » sur les femmes en faisait *tous les postes,
  femmes*, et le montant triplait sans que rien ne l'annonce. `scopeForSeries`
  amorce désormais le périmètre avec la modalité de la série. « Pharmacie ·
  Femmes » se lit à 11–16 Md € là où la pharmacie entière pèse 25–34.
- **Réglage, pas code** : le thème sombre était resté enregistré dans le
  navigateur après les vérifications de la phase 6. Les « barres horizontales »
  vues sur les courbes en étaient la conséquence — les lignes de grille passent
  au quasi-noir en sombre et se détachent sur un panneau resté clair, ce qui est
  le défaut de thème déjà signalé ci-dessus.
