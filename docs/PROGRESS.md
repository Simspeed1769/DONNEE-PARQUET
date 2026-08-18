
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

## v4 · Phase 4 — CSP : Composition devient Comparer

- **Fait** : même coquille à deux sections que DAMIR et Pathologies. Millésime,
  territoire, âge, sexe et mesure vivent dans la coquille ; le panorama garde le
  niveau de nomenclature et la CSP observée, la comparaison garde sa liste.
- **Décision** : « Composition » disparaît comme lecture. Elle répondait à une
  question d'une autre nature que les trois autres — une comparaison déguisée en
  lecture. La composition d'un territoire s'obtient dans Comparer sous forme de
  vue (aires empilées sur les effectifs), au lieu d'un écran à part.
- **Fait** : la carte reste cliquable et change le territoire **commun**, que la
  comparaison suit ; les encarts DROM sont conservés.
- **Fait** : les deux niveaux de nomenclature cohabitent dans le sélecteur — on
  compare un grand groupe à une catégorie fine si la question l'exige, chaque
  entrée portant son niveau.
- **Réserve tenue** : une part n'est pas additive entre régions. Sur la mesure
  « Part », les formes cumulatives — aires empilées, empilé, camembert — ne sont
  pas offertes ; elles n'apparaissent que sur les effectifs. Vérifié à l'écran.
- **Fait** : `PathologyPicker` devient `components/EntityPicker`, partagé par
  Pathologies et CSP — et par Mortalité à la phase suivante. Trois usages réels,
  le seuil que se fixe le projet pour extraire un composant.

## v6 — Ergonomie de Comparer et finitions

- **Le tiroir remplace la superposition.** « Modifier les séries » ouvre un
  panneau ancré à droite qui **pousse** la page au lieu de la recouvrir : le
  graphique reste visible et se met à jour pendant qu'on modifie. Un seul
  défilement. `SeriesDrawer` porte la coquille pour les quatre bases qui
  comparent — `Échap`, piège à focus, retour du focus, pied fixe — et la ligne
  de série est ordonnée : pastille, nom, valeur, « Filtrer » écrit en toutes
  lettres, poignée, croix toujours visible sur 44 px.
- **Plus aucun `<select>` natif dans un réglage de périmètre.** `ChoiceSelect`
  les remplace jusque dans `AdvancedFilterPanel`, ce qui règle du même coup ses
  champs blancs en thème sombre. Le sélecteur de cause de Mortalité devient un
  contrôle unique avec recherche intégrée, et les trois filtres tiennent enfin
  sur une rangée.
- **Le bug de palette n'était pas dans l'infobulle.** La transition universelle
  appariait les marques de l'ancien tracé aux nouvelles ; les données étant
  identiques, ECharts gardait les éléments existants **avec leur style**. Le
  tracé entier restait rouge après un passage au bleu. `EChart` reconnaît
  désormais un changement d'apparence et rejoue l'option sans appariement.
- **Deux boucles capables de figer le rendu, trouvées et corrigées** : un effet
  du tiroir qui dépendait d'un `onClose` refait à chaque rendu, et le
  redimensionnement du graphique appelé depuis l'observateur qui mesure ce
  qu'il redimensionne.
- **Population** : la courbe 1975-2026 garde toutes ses valeurs mais n'espace
  ses marques que tous les cinq ans — elle se lisait comme un pointillé. La
  silhouette de référence de la pyramide est retirée : une polyligne en travers
  de deux séries opposées ne se lit pas.
- **Non vérifié** : les largeurs sous 1272 px. La fenêtre du navigateur piloté
  refuse de descendre plus bas dans cet environnement, et rétrécir la coquille
  ne déclenche pas les requêtes de média, qui portent sur la fenêtre.
- **Toujours ouvert, hors périmètre** : `.panel` reste blanc en thème sombre
  (`styles.css:151`). Le contraste saute désormais aux yeux à côté du tiroir,
  correctement thémé. Une ligne à passer aux jetons, qui repeint toute
  l'application — la décision appartient à l'utilisateur.

## v5 · Phase 2 — La population Insee : dénominateur et cinquième base

- **La structure annoncée a été contrôlée, pas supposée.** Les 53 onglets ont la
  même mise en page — blocs `Ensemble`/`Hommes`/`Femmes` en colonnes B, W et AR,
  21 colonnes chacun — et `tools/build_population.py` le vérifie avant de lire
  une seule valeur. Contrairement à ce qu'annonçait la feuille de route, les
  années 1990-1998 n'ont pas de mise en page différente : elles ont seulement
  trois lignes vides de plus et l'astérisque de La Réunion.
- **Le piège des 90 ans et plus était plus large que sa note.** Le classeur
  prévient que la Guadeloupe, la Guyane et la Martinique n'ont pas d'âge détaillé
  au-delà de 90 ans entre 1990 et 1998 ; **La Réunion est dans le même cas et la
  note ne le dit pas**. Le repère se lit donc dans la donnée — « 95 ans et plus »
  vide alors que « 90 à 94 ans » est renseigné — et la colonne
  `age_90_plus_agrege` marque les 144 cellules concernées. Une liste écrite à la
  main en aurait manqué un territoire sur quatre.
- **Le recalcul de l'« Ensemble » retrouve exactement le total publié** : zéro
  écart sur les 936 lignes région × année. C'est ce contrôle qui autorise à ne
  pas charger le troisième bloc.
- **Écartés et journalisés** : `France métropolitaine` (52 fois), `DOM` (37),
  `France métropolitaine et DOM` (37) — des agrégats, pas des régions. 33 480
  lignes produites, 18 régions, 1975→2026, 0,09 Mo.
- **Le dénominateur emprunté était à un seul endroit.** Le recensement demandé
  par la feuille de route donne : `analysis.py`, `explore.py` et `csp.py`
  n'emploient pas `npop` ; `pathologies.py` s'en sert pour la prévalence, qui
  *est* l'indicateur publié par la Cnam et le reste ; `correlations.py`
  l'empruntait pour tous ses taux « par habitant », avec un `MAX(npop)` par
  cellule pour éviter de le multiplier par le nombre de pathologies. C'est ce
  dernier qui bascule sur l'Insee, moyenné sur l'année.
- **L'écart, mesuré sur trois mesures témoins (2023, avant → après)** :
  dépense remboursée par habitant en Île-de-France, 1 525,80 € → 1 488,65 € ;
  prévalence du diabète en Île-de-France, 5,86 % → 5,72 % ; décès pour 100 000
  habitants au niveau national, 945,71 → 929,75. Sur les douze régions communes
  l'écart médian est de −1,8 %, et il va de −5,9 % à +2,6 % : la population
  résidente n'est pas la population protégée, et le rapport des deux n'est pas
  le même partout. Rien n'est lissé ; l'écran nomme désormais le dénominateur
  dans ses réserves, et la table de Méthodologie porte les deux.
- **Corrigé en route** : le filtre des douze régions communes s'appliquait aussi
  à l'axe national, où le numérateur couvre la France entière. Le taux de
  mortalité y était gonflé de 2 %.
- **La cinquième base** suit le gabarit des autres — filtres dans la coquille,
  quatre lectures, formes décidées par le modèle — **sans section Comparer**,
  qui n'aurait rien apporté. La pyramide des âges n'est offerte que sur la
  lecture Âge, sexe non filtré, sur des effectifs : `buildOption` gagne un
  `overlay`, deux séries en trait fin, qui porte la silhouette de la première
  année de la période.
- **Rupture de champ signalée** : la courbe France entière saute en 1990 (entrée
  des DROM) et en 2014 (Mayotte). Ce sont des changements de champ, pas des
  variations de population, et la réserve le dit.
- **Non fait, et assumé** : la prévalence de la fiche Pathologies garde le
  dénominateur de la Cnam. C'est l'indicateur que la Cartographie publie ;
  le diviser par une autre population produirait un chiffre que personne n'a
  publié. Les deux coexistent, nommés, et la table de Méthodologie donne
  l'écart. Le dénominateur Insee sert partout où l'outil construit **lui-même**
  un taux, c'est-à-dire dans les Croisements.

## v5 · Phase 1.D — Comparer, le même geste sur les quatre bases

- **Un seul gabarit, pas trois copies.** `charts/compareReading.ts` porte
  désormais le catalogue de vues et le constructeur de la comparaison ; les
  trois modèles ne font plus que déclarer ce que leur mesure autorise. Trois
  listes de vues voisines mais jamais identiques ne restent pas identiques
  longtemps, et la consigne était l'identité.
- **Les vues manquantes arrivent** : Base 100 et Variation, que seul DAMIR
  offrait, sont maintenant partout. **Écart assumé** : « Empilé » figure sur les
  trois bases et pas sur DAMIR, qui l'a écarté en v4 ; le retirer supprimerait
  une capacité, il reste.
- **Le rail de DAMIR, porté tel quel.** `components/SeriesRail.tsx` réemploie
  ses classes — `compare-rail*`, `series-*`, `scope-editor*` — plutôt que d'en
  inventer de voisines. Chaque série y porte son périmètre, son nom écrit à la
  main, ses filtres résumés en gris, et le bouton « dupliquer » remplace la
  « série libre » de DAMIR : c'est lui qui permet de comparer le diabète en
  Île-de-France au diabète en Occitanie, deux séries sur le même code.
- **La période reste commune**, contre la lettre du tableau de la mission qui
  citait le millésime parmi les filtres par série : la ligne suivante impose une
  période commune, et deux axes du temps différents ne se comparent pas.
- **Les poids descendent dans les métadonnées.** `csp_metadata` publie
  l'effectif du dernier millésime par catégorie, `mortality_metadata` les décès
  de la dernière année **et la hiérarchie « dont … »** (`detail`, `chapter`),
  qui dormait dans le cube sans être exposée. C'est ce qui donne le classement
  par poids réclamé, les sélections d'ouverture, et la seule chose qui rende un
  « reste » calculable sans mentir.
- **« Reste du périmètre » : offert là où un tout existe, absent ailleurs.**
  CSP le calcule exactement (l'endpoint d'évolution renvoie le dénominateur avec
  l'effectif), à un seul niveau de nomenclature à la fois. Mortalité le calcule
  entre chapitres, sur « Toutes causes ». **Pathologies ne l'offre pas** : la
  nomenclature Cnam s'emboîte et une même personne compte dans chacune de ses
  pathologies — le tout dont on retrancherait la sélection n'existe pas.
- **Corrigé au passage, deux mensonges de forme.** Le camembert cumulait les
  périodes : sur un stock de personnes il annonçait 247 millions d'actifs. Il
  porte maintenant la dernière période, et le dit au centre comme en réserve.
  Les étiquettes de bout de courbe, elles, débordaient du canevas et se
  recouvraient ; elles sont bornées, effacées quand elles se chevaucheraient, et
  `ChartShell` gagne la légende HTML de DAMIR pour porter l'identité des séries.
- **La sélection d'ouverture de Pathologies, corrigée.** « Maladies
  neurologiques ou dégénératives » n'existe pas sous ce nom : la Cartographie
  publie « Maladies neurologiques ». Le repli prenait la plus lourde du
  catalogue — donc les hospitalisations — au lieu de la plus proche. Il cherche
  maintenant le libellé le plus proche et **écrit la substitution en réserve**.
- **Retiré** : `EntityPicker` et `pathologies.css`, entièrement morts une fois
  le rail partagé en place.
- **Défaut de thème, hors périmètre, à trancher.** En sombre, `.panel` reste
  blanc (`styles.css:151`) et tous les champs sont forcés en blanc
  (`styles.css:2081`, `background-color: #fff !important`). C'est le « défaut de
  thème déjà signalé » : deux lignes à passer aux jetons, mais qui repeignent
  toute l'application — la décision appartient à l'utilisateur.
- **Non vérifié** : les largeurs sous 1272 px. La fenêtre du navigateur pilotée
  refuse de descendre plus bas dans cet environnement.

## v5 · Phase 1 (partielle) — 1.A, 1.B, 1.C faits ; 1.D fait depuis

- **1.B — cause commune trouvée et traitée à la source.** Sur les formes
  horizontales — classement, écarts, cascade — ECharts posait le nom de l'axe
  des **valeurs** au bout de l'axe, c'est-à-dire en haut à droite du tracé :
  exactement là où arrive l'étiquette de la plus longue barre. D'où les deux
  textes superposés. Il passe au milieu, sous l'axe, où la place est libre. Le
  titre des modalités, lui, était rogné par une marge haute de 24 px pour un
  écart de 14 px et une ligne de 12 px ; elle passe à 34.
- **1.A** : le bandeau « Ce que je compare » sort du panneau blanc et se pose
  sur le fond ivoire, entre les filtres et le graphique. Plus de surface grise :
  une rangée de puces et un filet en dessous. Les quatre bases sont alignées.
- **1.C** : Pathologies gagne la carte choroplèthe. `csp/charts.ts` devient
  `charts/mapOption.ts`, partagé. Un territoire sans valeur publiée — masquage
  Cnam — reste en `--map-void` : la carte ne reçoit que les territoires dont la
  valeur existe, une absence n'étant pas une valeur basse. Clic = ouverture de
  la région, comme sur DAMIR.
- **Fait aussi** : la comparaison de Pathologies s'ouvre sur Diabète, Cancers et
  Maladies neurologiques ou dégénératives, avec repli sur la pathologie la plus
  lourde encore libre si un libellé manque.
- **Non fait — 1.D.** Le gabarit Comparer de DAMIR n'est pas encore porté à
  l'identique : il manque les **filtres par série** (`AdvancedFilterPanel` par
  série, périmètre propre, nom éditable), le complément « Reste du périmètre »,
  et les sélections par défaut de CSP et Mortalité, qui demandent des poids que
  leurs catalogues ne portent pas encore. C'est le gros morceau de la phase.
- **Non vérifié** : la revue aux cinq largeurs dans les deux thèmes, l'outil de
  navigation de cette session capturant toujours en 1568 px.

## v4 · Phase 5 — Mortalité : Comparer les causes

- **Fait** : même coquille à deux sections. Millésime, population et mesure
  vivent dans la coquille ; le sélecteur hiérarchique de cause reste au
  panorama, la comparaison a sa propre liste.
- **Décision** : « Causes » disparaît comme lecture. Elle classait les douze
  premières les unes contre les autres — une comparaison présentée comme une
  lecture. Rien n'est perdu : le catalogue du sélecteur est classé par nombre de
  décès, retenir les premières reproduit l'ancien classement.
- **Dérogation assumée, documentée** : pas de lecture Territoire. Le CépiDc
  publie des effectifs nationaux, sans découpage régional ni population de
  référence. La réserve `SCOPE_NOTE` en donne la raison sur chaque graphique.
- **Fait** : les décès étant additifs, empilé, aires empilées et camembert sont
  licites ici sur la mesure « Nombre » — c'est la base où ils ont le plus de
  sens. Sur la « Part », déjà rapportée au total toutes causes, ils disparaissent.
- **Réserve ajoutée** : les causes de la nomenclature s'emboîtent ; additionner
  une cause et l'un de ses sous-ensembles compterait deux fois les mêmes décès.
- **Économie** : la coquille charge la fiche de la cause courante une seule fois
  et la sert deux fois — au panorama pour l'afficher, à la comparaison pour
  classer son catalogue.

## v4 · Phase 6 — Transitions homogènes sur les quatre bases

- **Diagnostic (mesuré, pas supposé)** : le piège classique — une `key` React
  sur le conteneur, qui détruit l'instance et rend toute transition impossible —
  est **absent** du dépôt. Depuis la phase 3 de v3, les quatre bases passent par
  le même `ChartShell` → `EChart` que DAMIR : le chemin de rendu était déjà
  unifié, `notMerge` + `lazyUpdate` + `withMorphing` compris.
- **Corrigé** : `prefers-reduced-motion` n'était plus respecté. Je l'avais perdu
  en retirant le fondu manuel qui bloquait le passage vers la carte. Sous ce
  réglage, l'animation ECharts et la transition universelle sont maintenant
  coupées à la source — un mouvement bref reste un mouvement.
- **Rappel de ce qui a été réglé plus tôt** : le fondu manuel autour des cartes
  passait le conteneur à l'opacité zéro *avant* le rendu du fond de carte ; le
  blanc n'était pas la transition mais l'attente. ECharts enchaîne seul, et
  `divideShape: "clone"` étend l'enchaînement au changement de **lecture**, pas
  seulement de forme.
- **Écarté** : rien. `stale` garde l'opacité réduite plutôt qu'un squelette, et
  aucun module ECharts nouveau n'était nécessaire.

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

## Mission « 3 blocs » · Bloc 1, point 1.1 — le thème sombre tranché

Le défaut le plus visible du produit : `theme.css` portait deux thèmes complets,
mais `styles.css` repeignait les panneaux en blanc par-dessus. Décision prise :
**garder la bascule et rendre le sombre propre**, pas la retirer.

- **Fait — la cause, pas les deux symptômes.** Les deux lignes citées par
  l'audit (`.panel { background:#fff }` et le `background-color:#fff !important`
  des champs) n'étaient que les plus voyantes d'un ensemble : **327 règles
  atteignables** portaient une couleur en dur. Toutes sont passées aux jetons.
  Vérifié par script : plus aucune couleur en dur dans une règle atteignable.
- **Fait — les jetons qui manquaient.** `theme.css` n'avait ni fond ni filet
  pour les états, ni encre d'infobulle, ni anneau de focus, ni couleur pour le
  repère « B ». Ajoutés dans les trois portées (clair, `prefers-color-scheme`,
  `[data-theme="dark"]`) : `--good-wash/-line`, `--warning-wash/-line`,
  `--info-text/-wash`, `--counterpart(-ink)`, `--tooltip-surface/-ink`,
  `--overlay`, `--focus-ring`.
- **Fait — vérifié à l'écran.** Les neuf écrans parcourus en sombre forcé, plus
  le tiroir des séries, le bandeau « Ce que je compare », les popovers, le
  tiroir de méthode et son voile, les tableaux repliés, le panneau « Plus de
  filtres ». Contrôle de non-régression en clair sur Comparer et Référentiel.
- **Écarté — la barre latérale.** Elle est sombre dans les deux thèmes
  (`--sidebar` passe d'un brun très foncé à un noir) : ses encres claires sont
  justes des deux côtés, et les passer aux jetons d'encre les rendrait *fausses*
  en clair. Ses couleurs en dur restent, délibérément, et c'est écrit en tête de
  `styles.css`.
- **Écarté — les règles mortes.** 251 des 434 classes de `styles.css` ne sont
  citées nulle part dans le code ; elles portent encore ~490 couleurs en dur.
  Elles ne peignent rien. Les toucher aurait gonflé le diff sans rien changer à
  l'écran, et `styles.css` ne doit pas être réécrit en une passe : elles
  partiront avec leurs sélecteurs au point 2.4.
- **Conséquence assumée en thème clair.** Consolider vers les jetons déplace
  légèrement deux teintes : le bandeau « masqué » du catalogue passe d'un ocre
  `#d28a37` au `--warning` du thème, et le bandeau « pondéré » d'un vert-de-gris
  `#4d8b7a` au `--good`. Même rôle, teinte du système plutôt que teinte locale.
- **Non vérifié** : le rendu sous 1272 px, dans les deux thèmes — c'est
  l'objet du point 1.2, pas de celui-ci.

## Bloc 1, points 1.3 · 1.4 · 1.6 · 1.9 — les listes, les chaînes, le code mort

- **1.3 fait.** `logical_names` est dérivée des fichiers présents plutôt que
  tenue à la main : la reprise d'asset périmé couvre désormais tous les écrans,
  y compris ceux qui n'existent pas encore. Cinq tests neufs, dont le cas d'une
  empreinte Vite contenant elle-même un tiret et celui de `vendor-react` qui ne
  doit jamais se rabattre sur `vendor`.
- **1.4 fait.** `lifespan` remplace `on_event` (plus aucun warning) ; le compte
  des sources vient du catalogue ; `DESIGN.md` décrit deux sections DAMIR et le
  tiroir des séries à la place de `.free-series` et `.scope-editor`, disparus.
- **1.6 fait.** `AdvancedCross.tsx` supprimé (673 l.), avec `runCorrelation` et
  `POST /api/correlations`, devenus sans appelant.
- **1.6 écarté, volontairement.** `correlate()` reste dans `correlations.py`
  sans appelant : elle est seule à employer `statistics.py`, et c'est le point
  2.2 qui décide du sort de ce module — il prévoit explicitement ce nettoyage
  « après 1.6 ».
- **1.9 fait.** `docs/ETAT_DES_LIEUX.md` supprimé : deux photos du code se
  contredisaient. `app/LISEZMOI.md` est nommé référence unique dans `CLAUDE.md`,
  et ses propres renvois au fichier supprimé sont retirés. `MISSION_V6.md`,
  achevée, rejoint `docs/missions/`.

## Bloc 1.5 — les réserves dans l'image : tranché

`CLAUDE.md` disait qu'elles voyagent en entier ; `exportSlide.ts` les avait
retirées en entier. **Ni l'un ni l'autre.**

- **Décidé.** L'image porte le **nombre** de réserves et **où les lire**, pas
  leur texte : « 1 réserve méthodologique accompagne cette lecture — “Ce que ce
  graphique ne montre pas”, dans l'outil. » Une ligne, dans la teinte d'accent,
  au-dessus de la source. Raison : un pavé sous un graphique de présentation
  fait perdre le graphique, mais une image muette laisse croire qu'il n'y avait
  rien à dire. La règle qui reste : *une image ne donne jamais moins
  d'avertissement que l'écran, elle peut en donner une forme plus courte.*
- **Fait.** `caveatCount` traverse `ExportPngButton` depuis les quatre points
  d'appel (ChartShell, Panorama, Comparer, Croisements). Aucune ligne écrite
  quand il n'y a pas de réserve : annoncer « 0 réserve » serait une affirmation
  plus forte que le silence, et fausse.
- **Trouvé au passage.** `GuidedPanel` déclarait `guidedCaveats` avec un
  commentaire disant que la garde écologique « doit voyager avec l'image » — et
  la liste n'était lue nulle part. L'intention était écrite, pas branchée ; elle
  l'est maintenant.
- **Aligné.** Le principe de `CLAUDE.md` est réécrit pour dire la décision.
- **Vérifié** sur une image réellement produite : mention au singulier, teinte
  d'accent, pied non chevauché.

## Bloc 1.8 — le rouge n'est plus la couleur par défaut d'un tracé

- **Décidé : graphite d'encre**, pas bleu profond. Le bleu serait entré en
  collision avec `--series-2` et avec la rampe bleue ; le graphite ne collide
  avec rien. Une série seule n'encode aucune catégorie : elle ne doit porter
  aucune teinte. Nouveau jeton `--plot-solo` (#4a463d clair, #d7d3c8 sombre),
  lu par `soloColor()`. Contrastes mesurés : 9,4:1 sur blanc, 12,1:1 sur la
  surface sombre.
- **Le graphite ne suit pas la bascule de palette.** Celle-ci gouverne ce qui
  code une grandeur — la rampe — et l'ordre des teintes catégorielles, pas
  l'absence de teinte. Le bouton reste, en réglage secondaire, comme demandé.
- **Palette hiérarchisée.** Rangs 1-3 inchangés, à pleine saturation ; rangs
  4-8 en récession, chroma de 0,135 à 0,108 et clarté étalée.
- **Les six contrôles, rejoués dans les deux modes** (tableau complet en tête de
  `theme.css`). Le progrès porte exactement sur le défaut constaté — la
  confusion à six séries en vision normale, toutes paires : **7,1 → 15,9 en
  clair** (l'échec devient un succès), **7,1 → 9,9 en sombre**. Les cinq
  contrôles « adjacent », ceux qui valent pour les courbes et les barres,
  restent au vert dans les deux modes, contraste 3:1 compris en sombre.
- **Non résolu, et non résoluble : la séparation daltonienne toutes paires.**
  Le plafond est atteint dès le trio de tête — rouge et vert tombent à ΔE 6,9
  en deutéranopie — et aucun choix sur les rangs suivants ne le relève. Huit
  teintes catégorielles simultanément distinguables n'existent pas. La réponse
  n'est pas une meilleure teinte : c'est de ne pas faire porter à la couleur
  seule ce qu'elle ne peut pas porter — étiquettes directes, vue tableau,
  légende, repli en « Reste du périmètre », tous déjà présents.
- **Écarté.** Retoucher les rangs 1-3 : cela aurait repeint tous les graphiques
  existants pour un gain nul sur le plafond, qui vient de la paire rouge/vert
  elle-même.
- **Écart de méthode assumé.** La bande de clarté du mode sombre (0,48–0,67
  contre 0,43–0,77) laisse deux fois moins de place pour étaler la clarté :
  c'est la raison du reste de l'écart entre les deux modes, et elle n'est pas
  contournable sans sortir de la bande ou perdre le contraste 3:1.

## Bloc 1.7 — faire respirer le haut de page

Sur Comparer, six bandes s'empilaient avant le tracé. Trois sont parties.

- **Fait — l'axe de comparaison descend dans la barre de filtres.** Choisir de
  comparer des postes plutôt que des régions est un choix de *sujet*, au même
  titre qu'un filtre. La rangée de huit onglets qui vivait sur la bande du
  graphique devient un `ChoiceSelect` « Comparer selon », en tête de la seconde
  ligne — l'emplacement que le commentaire de `ScopeBar` prévoyait déjà. Son
  panneau s'ouvre **au-dessus** du contenu : la barre ne change pas de hauteur.
- **Fait — cinq vues d'accès direct, le reste replié.** Nouveau composant
  partagé `ViewSwitch` : Courbes, Barres, Classement, Base 100, Variation
  restent à un clic ; Empilé, Camembert, Aires empilées, Écarts et Carte de
  chaleur passent sous « Autres vues », avec leur nombre. Quand la vue active
  est repliée, le bouton porte son nom — sinon rien ne dirait pourquoi l'écran
  affiche un camembert. **Le repli est cosmétique** : `offeredViews()` continue
  de retirer les formes qui mentiraient, elles n'arrivent pas jusqu'au
  composant. Vérifié : sur Pathologies, où la prévalence n'est pas additive, il
  ne reste qu'une vue repliée au lieu de cinq.
- **Fait — une seule amorce par écran.** Sur Comparer, « Comparer selon · grands
  postes » répétait l'axe désormais lu dans la barre, et le titre, lui, ne le
  portait pas : le titre devient « Montant remboursé par grands postes —
  5 séries ». Sur les quatre bases, les amorces `X · comparaison` sont du pur
  bruit et disparaissent ; celles de Panorama gardent le *sujet* et perdent le
  nom de la base, déjà porté par l'en-tête de page et la barre latérale.
- **Écarté.** Réécrire les titres des modèles pour y fondre le sujet : cela
  aurait touché les noms de fichiers d'export et les titres pré-remplis du PNG,
  pour un gain que le dédoublonnage des amorces obtient déjà.
- **Rien de fonctionnel n'a disparu** : les huit axes de comparaison et les dix
  vues restent tous atteignables, seule la densité change.

## Bloc 1.2 — la revue responsive, enfin faite

Signalée deux fois comme « non vérifiée ». Faite aux sept largeurs (1400 · 1272
· 1240 · 1024 · 860 · 720 · 620), sur les neuf écrans, dans les deux thèmes.

**Méthode.** La fenêtre Chrome étant maximisée, elle refuse de rétrécir sous la
largeur de l'écran (1272 px CSS ici) : les redimensionnements réussissaient en
apparence sans rien changer. L'application est donc chargée dans une **iframe**
dont on fixe la largeur — les media queries s'y évaluent sur la largeur de
l'iframe, ce qui donne un contrôle exact **et** l'accès aux largeurs supérieures
à celle de l'écran. Une sonde mesure ensuite trois choses : la page qui déborde,
un élément qui sort de son conteneur, un texte rogné sans ellipse ni défilement.
Regarder neuf écrans à sept largeurs à l'œil aurait laissé passer les 2 px.

**Trois défauts trouvés et corrigés :**

1. **Le panneau des listes multiples sortait de l'écran** dès 1240 px. Il était
   tendu `left: 0; right: 0` avec 240 px de largeur minimale : un champ plus
   étroit le faisait grandir vers la droite, et sur Territoire / Âge / Sexe il
   passait le bord. Il est désormais ancré à droite — tous les sélecteurs
   multiples de la barre vivent dans sa moitié droite.
2. **Régression que le point 1.7 venait d'introduire** : la grille à sept
   colonnes de la barre de Comparer a une spécificité supérieure aux paliers
   existants, qui ne la rattrapaient donc plus. La page défilait
   horizontalement de 59 px à 1024 et de 223 px à 860. Les paliers citent
   maintenant la variante.
3. **Le double de mesure du bandeau « Ce que je compare »** était en
   `position: absolute` : invisible, mais il **compte dans le débordement
   défilable de son ancêtre**, et large de `max-content` il faisait défiler la
   page entière. Passé en `fixed`, il n'entre plus dans cette zone et mesure
   toujours aussi juste.
4. **Les boutons d'export d'Extraire** sortaient de 138 px sous 790 px :
   `.hero` était en `nowrap`. Il passe à la ligne — c'est la cause, partagée par
   tous les écrans, pas l'instance.

- **Aucune police n'a été réduite** : les quatre correctifs portent sur
  l'ancrage, la spécificité, le mode de positionnement et le retour à la ligne.
- **Résiduel accepté** : 2 px de débordement sur Extraire à 860 px, dans le
  bruit d'arrondi d'un affichage à dpr 1,5. Invisible, sans barre de défilement.
- **Faux positif consigné** : la sonde signale le `✕` des puces de comparaison
  comme rogné de 11 px. C'est sa cible tactile de 44 px, volontairement plus
  large que le bouton de 22 px — à ne pas « corriger » au prochain passage.

## Bloc 2.1 — Repères devient un tableau croisé

L'écran choisissait une source, puis un calcul parmi six, et produisait **un
chiffre** que Panorama affichait déjà. Il devient un croisé dynamique : l'objet
que tout le monde a manipulé dans un tableur, donc zéro apprentissage.

- **Serveur — `pivot.py` (213 l.) et `POST /api/pivot`.** Le contrat central est
  tenu : composantes brutes par cellule + `formula_spec`, jamais un indicateur
  calculé. `cube_where` et les helpers d'`explore.py` sont réutilisés — pas de
  second chemin d'agrégation. Plafond de 2 000 cellules, `ValueError` en
  français au-delà.
- **Trois paquets par cellule, et pas un de plus** : période, première année,
  dernière année. C'est le strict nécessaire pour dériver les six agrégations
  sans une charge utile proportionnelle au nombre d'années.
- **Une forme qui mentirait n'est pas offerte.** Variation et TCAM comparent la
  première à la dernière année, cellule par cellule : quand l'année *est* l'un
  des axes, chaque cellule se comparerait à elle-même. Les deux agrégations sont
  alors **absentes**, avec la raison écrite — pas grisées. Trouvé à l'écran, pas
  en relisant le code : le premier essai rendait un tableau vide sans rien dire.
- **Client** : `pivot/model.ts` (agrégations, teinte, tri), `PivotPage.tsx`,
  `pivot.css`. Totaux de ligne/colonne/général, tri sur n'importe quelle
  colonne, rampe séquentielle — totaux exclus de l'échelle, sinon tout paraît
  pâle. Bascule graphique. **Méthode dépliée conservée.**
- **Exports** : CSV côté client, PNG par le chemin commun, Excel en passant le
  croisement à Extraire — une seule fabrique de classeur dans le produit.
- **Nommage** : l'entrée devient **Tableau**. `?page=benchmarks` redirige vers
  `pivot` plutôt que de tomber sur l'écran par défaut.
- **Retiré** : `BenchmarksPage.tsx` (1 137 l.), `benchmarks/charts.ts`,
  `/api/workbench`, et le moteur de `studio.py` — **1 089 → 320 lignes**.
  `reliability_metadata` est conservée, comme demandé.
- **Tests** : 8 neufs sur le pivot (contrat, totaux = somme des cellules,
  plafond, ordre du temps, recoupement avec le cube). Les 11 tests du workbench
  partent avec lui. 55 tests verts, au-dessus du plancher de 54.
- **Écart signalé** : la « dispersion » de l'ancien écran n'est pas reprise
  comme agrégation. Elle se lit directement dans le tableau — l'étendue des
  cellules d'une ligne est ce que la teinte montre — et un chiffre de plus
  n'aurait rien ajouté.
- **Dérive documentaire corrigée au passage** : `DESIGN.md` affirmait encore que
  la série seule prend `--accent` (faux depuis 1.8) et que les réserves partent
  entières dans l'image (faux depuis 1.5).

## Bloc 2.2 — Croisements : plus simple à comprendre

L'écran était déjà bon — porte unique, unité fixée, encart écologique
permanent. Trois simplifications, et rien touché à ce qui protège la lecture.

- **Une variable par défaut** : c'était déjà le cas. Ce qui ne l'était pas :
  les trois sources d'une deuxième variable étaient trois boutons permanents,
  qui donnaient à un écran simple l'air d'un formulaire. Elles vivent derrière
  un seul « + Ajouter une variable ».
- **Le graphique des effets n'apparaît qu'à partir de deux variables.** À une
  seule, il redisait la phrase sous la forme d'un segment unique sur un axe.
- **La phrase coupée en deux.** Verdict en français simple, en corps de texte ;
  effet et intervalle à 95 % en dessous, en plus petit et en chiffres tabulaires.
  Les deux tenaient dans une seule phrase, parenthèse comprise : celui qui vient
  savoir *s'il y a un lien* devait traverser « effet : +2,4 % ; IC à 95 % :
  0,8 à 4,1 » pour l'apprendre.
- **Inchangés, délibérément** : le langage écologique, le gabarit qui nomme les
  cellules région × âge × sexe, et l'encart permanent « Comment lire ces
  résultats ». Vérifié à l'écran.
- **Nettoyage** : `correlate()`, ses avertissements typés et le retrait de
  tendance quittent `correlations.py` (1 200 → 1 025 l.) — plus aucun appelant
  depuis 1.6.
- **Gardé, et pourquoi** : `statistics.py`, bien qu'aucun code applicatif ne
  l'appelle plus. Ce n'est pas le cas d'`AdvancedCross` : c'est une
  bibliothèque de fonctions pures, sans couplage à l'API, testée contre des
  valeurs publiées. Elle ne coûte rien à garder, et le point **3.6** en a besoin
  nommément — la bande d'incertitude d'une prolongation vient des résidus, donc
  d'une loi de Student.
- **Signalé, hors périmètre** : rien n'empêche d'expliquer une mesure par
  elle-même (effet 0 %, intervalle nul). C'est une forme qui ne ment pas mais
  qui n'apprend rien ; à traiter si l'usage le remonte.

## Bloc 2.3 — un seul module d'export

Le motif CSV + Excel était recopié **cinq fois** dans `main.py`, pour plus de
400 lignes quasi identiques.

- **Fait.** `app/exports.py` : une `ExportSpec` par source — nom de fichier,
  colonnes, lignes, largeurs, métadonnées — et deux fonctions, `csv_response`
  et `xlsx_response`. `main.py` passe de **1 189 à 986 lignes**, et chaque
  source tient désormais en une trentaine de lignes déclaratives.
- **Rien perdu, et même gagné.** DAMIR, CSP et Pathologies n'avaient ni
  en-têtes figées, ni largeurs de colonne, ni bandeau coloré : ils les ont
  maintenant. Le dictionnaire des mesures DAMIR et l'état de consolidation sont
  portés par `extra_blocks`, un mécanisme général plutôt qu'un cas particulier.
- **Ce qui reste réglable par source, parce que c'en est vraiment un choix** :
  le format des pourcentages — une décimale pour DAMIR et Pathologies, deux
  pour les trois autres. Unifier aurait été un appauvrissement déguisé en
  cohérence.
- **Non déplacé, volontairement** : la limite de 250 000 lignes et les règles de
  cohérence par source (« conservez la dimension Cause… ») restent dans les
  `*_extraction_rows`, où elles protègent la requête et pas seulement le
  fichier. Elles se sont d'ailleurs manifestées en écrivant les tests, ce qui
  est la preuve qu'elles tiennent toujours.
- **Tests** : `test_exports.py`, 6 tests qui parcourent **les cinq sources** —
  point-virgule et nomenclature d'octets, deux feuilles, en-têtes figées,
  source et date, dictionnaire DAMIR, largeurs et formats, et une valeur
  absente qui reste vide. 61 tests verts.
- **Trouvé en écrivant les tests** : sur une colonne unique, le module `csv`
  écrit `""` pour distinguer un champ vide d'une ligne vide. Artefact du
  format, pas du produit — le test porte donc sur deux colonnes, comme la
  réalité.

## Bloc 2.4 — découper les fichiers volumineux

Un fichier par commit, sans changer de comportement. Six découpages.

| Fichier | Avant | Après | Nouveau fichier |
|---|---:|---:|---|
| `correlations.py` | 1 200 | 706 | `regression.py` (360) |
| `main.py` | 1 189 | 680 | `repository.py` (342) + `exports.py` (2.3) |
| `studio.py` | 1 089 | 320 | *(vidé au point 2.1)* |
| `buildOption.ts` | 887 | 280 | `chartBase.ts` (171) + `chartForms.ts` (512) |
| `explore.css` | 891 | 587 | `seriesPicker.css` (314) |
| `damir/CompareSection.tsx` | 797 | 724 | `compareModel.ts` (100) |
| `panorama/charts.ts` | 730 | 363 | `territoryCharts.ts` (376) |
| `styles.css` | 2 228 | 1 597 | *(page « Repères » retirée)* |

- **Deux fichiers restent au-dessus de 700**, à 1 % et 3 % du seuil :
  `correlations.py` (706) et `CompareSection.tsx` (724). Pour le second, ce qui
  reste sont des fermetures sur l'état du composant — construction du tableau,
  export CSV, fabrique d'option — et les extraire demanderait des helpers à six
  paramètres. Le dépôt préfère une duplication lisible à une abstraction
  prématurée ; le fichier est désormais organisé, ce qui était le but.
- **`styles.css` n'a pas été réécrit en une passe**, comme demandé. Une seule
  page a été migrée : celle de « Repères », que le point 2.1 venait de rendre
  morte — 629 lignes et 166 couleurs en dur, parties avec l'écran. Les
  suivantes le seront de la même façon.
- **Vérifié à l'écran, pas seulement au compilateur.** Un découpage de
  graphiques peut casser un rendu en silence : le classement, la carte de
  chaleur, la carte de France et la lecture Âge ont été comparés avant/après
  sur la même adresse. Une alerte au passage — la carte de chaleur a semblé
  bloquer après le découpage ; en remisant les modifications et en rechargeant,
  elle bloquait aussi *sans* elles. Incident d'onglet, pas régression.

## Bloc 2 · après-coup — un liseré, un import perdu, un chiffre à regarder

Trois choses trouvées **après** les commits du bloc, dont deux par l'exécution
et non par les tests.

- **Corrigé — le liseré sur le flanc.** Le « Point de vigilance » du Tableau
  portait un `border-left: 3px` recopié de la feuille de « Repères » que je
  venais de supprimer. `explore.css` porte pourtant la convention écrite :
  « une pastille en tête de ligne, **jamais un liseré coloré sur le flanc** …
  deux grammaires pour un même rôle se verraient ». Le bloc prend la pastille.
- **Corrigé — un import perdu au découpage.** `DELAYS_PATH` et `TRANSCO_PATH`
  n'ont pas suivi la couche d'accès dans `repository.py`. Conséquence :
  `metadata()` levait une `NameError` **dans le préchauffage, qui avale toute
  exception**. L'application démarrait, répondait, passait les 61 tests, et
  imprimait discrètement `préchauffage interrompu` dans une console que
  personne ne lit. Trouvé en relisant le journal du serveur, pas autrement.
  - **Le trou est fermé** : `tests/test_startup.py` appelle directement les
    trois gestes du préchauffage — métadonnées, première vue, classement des
    prestations. 64 tests verts.
- **Signalé, non corrigé — le taux de prise en charge sur les prestations en
  espèces.** Le Tableau rend visible ce qui l'était moins ailleurs : sur
  « Indemnités Journalières », le taux affiche **16 714 %**. Ce n'est pas un
  défaut du Tableau — la même formule donne le même nombre sur Panorama, et le
  cube le confirme (rem = 13,4 Md €, dep = 80 M € en 2015 : une prestation en
  espèces n'a pas de dépense présentée). Trois grands postes sont concernés :
  Indemnités Journalières, Autres, Transports — ces deux derniers parce que
  leurs composantes sont négatives.
  - **Ce que ça vaut** : arithmétiquement juste, sémantiquement vide. Décider
    quand `coverage` a un sens par grand poste est un choix méthodologique, pas
    un refactor : à trancher avec l'utilisateur, pas dans un commit de dette.

## Bloc 3.1 — Motion sur le chrome

Seule dépendance ajoutée au produit, autorisation explicite. Elle ne touche que
le chrome ; **aucun `m.*` n'enveloppe un conteneur de graphique** — ECharts a
son propre moteur de transition, et deux systèmes sur le même élément se
contrarient.

- **Surfaces animées** : tiroir des séries, tiroir de méthode et son voile,
  popover « Autres vues », popover de réglage d'une série. Fondu-glissé de 6 px
  pour les panneaux, glissé de 24 px pour les tiroirs.
- **Le motif `LazyMotion` + `m`, vraiment appliqué.** Premier essai :
  `domAnimation` importé statiquement, `index` passe de 7,5 à **32 Ko gzip** —
  le motif ne servait à rien. `motionFeatures.ts` crée le point de découpe et
  le moteur part dans un morceau différé.

| | avant | après |
|---|---:|---:|
| `index` (chemin critique) | 7 478 o gzip | **18 010 o gzip** |
| `motionFeatures` (différé) | — | 14 069 o gzip |
| total JS brut | 1 198 121 o | 1 281 256 o |

  Coût réel sur le chemin critique : **+10,5 Ko gzip**. Le moteur (14 Ko) ne
  charge qu'après le premier rendu.

- **`prefers-reduced-motion` : deux gardes, dont une vérifiable en la lisant.**
  `reducedMotion="user"` est celle de Motion ; une **durée nulle** est la nôtre.
  Une durée de zéro n'est pas une subtilité de bibliothèque, c'est de
  l'arithmétique. La transition est posée **uniquement** dans le fournisseur :
  aucun composant ne fournit la sienne, faute de quoi il court-circuiterait la
  garde en silence. Les `transition={SPRING_WIDE}` locaux ont été retirés pour
  cette raison.
- **Écrit avec `x`, `y`, `scale`** plutôt qu'avec des chaînes `transform:` —
  ce sont les valeurs que Motion sait composer et que sa neutralisation
  inspecte.
- **Ce que je n'ai pas pu vérifier, et pourquoi.** L'onglet d'automatisation
  reste `visibilityState: "hidden"` **même pendant une capture** : l'horloge
  d'animation y est gelée (mesuré — 0 ms d'avancement pour 660 ms réelles).
  Toute observation de position y est donc mensongère, et mes premières mesures
  du mouvement réduit l'étaient. Ce qui est vérifié : les animations sont bien
  appliquées aux bonnes surfaces, et les valeurs convergent quand l'horloge
  tourne (opacité 0,90 → 1, translation 2,4 px → 0). Ce qui ne l'est pas par
  machine : la coupure sous `prefers-reduced-motion`, d'où la seconde garde,
  écrite pour être vraie par construction plutôt que par confiance.

## v6 · Bloc 3 point 3.2 — La couverture réelle des sources

- **`tools/inventaire_sources.py` + `docs/SOURCES.md`.** Le script relit les
  Parquet par la couche DuckDB du produit ; chaque chiffre du document sort
  d'une commande. Il mesure aussi deux choses qu'aucun décompte de lignes ne
  donne : le poids de chaque année DAMIR — critère par lequel le serveur décide
  des années offertes — et la complétude de la dernière année de soins, estimée
  par le profil de liquidation.
- **Aucune série n'a de trou** sur les six vues. En revanche les bornes ne se
  recouvrent pas : la CSP s'arrête en 2023, qui est donc la dernière année où
  les cinq bases coexistent. L'interface ne le dit nulle part.
- **La trouvaille du point : 2025 est offerte au choix et complète à 91,4 %.**
  Elle passe le seuil de 1 % (97,3 % de 2024) ; seule la période *par défaut*
  s'arrête à 2024. À l'écran, 2025 est en **baisse** de 2,7 % ; à maturité elle
  est en **hausse** d'environ 6 %. La courbe n'atténue pas, elle inverse le
  signe. C'est la justification directe du point 3.4.
- **Diagnostic annexe : 2014 est écarté par un plancher en dur** (`soi_ann >=
  2015`), pas par le seuil de 1 % — à 5,4 % il l'aurait passé. Les deux règles
  ne sont pas redondantes, et c'est la date écrite en dur qui travaille.
- **Deux bases sont révisées rétrospectivement** (population, mortalité) :
  remplacer leur fichier change des dénominateurs d'années anciennes, donc des
  taux déjà exportés. Consigné, car ce n'est pas un ajout mais une
  reconstruction.
- **Écarté** : ce que publie le producteur ne peut pas être relevé depuis le
  poste — aucun appel réseau. Le document sépare donc explicitement les bornes
  mesurées de la colonne « à vérifier chez le producteur », plutôt que de
  présenter une mémoire comme un constat.

## v6 · Bloc 3 point 3.3 — Les trois pièges, audités ; l'ingestion, bloquée

- **Ingestion impossible, et ce n'est pas un renoncement de méthode.**
  `data/source/` ne contient que le classeur Insee de population, déjà ingéré
  (1975–2026). Il n'y a aucune donnée DAMIR supplémentaire à ajouter. Ce qui
  est livré est donc l'audit que le point demande de faire **avant** toute
  ingestion : `tools/audit_pieges.py` et `docs/INGESTION.md`.
- **Piège 1, réforme régionale de 2016 : inexistant dans ce fichier.** Le cube
  emploie les mêmes 14 codes de 2014 à 2025, ceux d'après la réforme. Un jeu de
  codes identique ne prouvant rien, le contrôle porte sur la continuité des
  parts : plus grand écart au passage 2015 → 2016, **0,370 pt**, et il est sur
  « Non renseignée », pas sur une région. Un reclassement raté déplacerait des
  points entiers.
- **Trouvé à la place : la région « Non renseignée » pèse 17,7 % en 2024**, avec
  une dérive de 14,5 % en 2015. Ce n'est pas une corruption — 73 % en sont des
  Indemnités Journalières, dont 90,5 % n'ont pas de région, une prestation en
  espèces n'ayant pas de lieu de soins. Mais le **classement l'affiche** (en
  tête, devant l'Île-de-France, vérifié) là où **la carte ne le peut pas** :
  une carte DAMIR représente 82 % du total sans le dire.
- **Piège 2, nomenclature `prs_nat` : couverture intégrale.** Zéro code
  orphelin sur douze ans, le repli `COALESCE(…, 'Autres')` ne se déclenche
  jamais (0,0000 % chaque année). Mais il est **dormant, pas mort** : la
  nomenclature gagne **36 à 90 codes par an**. Une année ingérée sans extension
  préalable de la transco en enverrait autant vers « Autres », sans erreur.
- **Piège 3, révisions CIM : sans objet sur la période, mais le contrôle usuel
  est le mauvais.** 86 causes strictement identiques sur dix millésimes. Or les
  identifiants ne sont pas des codes CIM mais des **rangs** (`cause_001`…) : si
  un millésime insère une ligne, le rang 42 change de maladie, le jeu de codes
  reste d'apparence identique, et rien ne le détecte. Consigne : apparier sur
  les **libellés**.
- **Quatrième piège, non prévu, trouvé en vérifiant les autres.** Les
  Pathologies portent leurs marges **dans** leurs dimensions (`tous sexes` à
  côté de `hommes`/`femmes` — ratio mesuré 1,000 —, `tsage`, `dept 999`,
  `region 99`). Une somme naïve y compte double. Vérifié que le produit ne s'y
  trompe pas : il sélectionne la marge et emploie `MAX(ntop)`, jamais `SUM`.
  Un millésime livré sans ses marges rendrait des totaux vides sans lever
  d'erreur — d'où un contrôle dédié dans le script.
- **Écarté** : une table de passage 22 → 13 régions (mesurée inutile, elle
  serait du code non exercé) · un correctif au poids du 99 (ce serait inventer
  un territoire) · une table CIM-9 → CIM-10 (sans objet à partir de 2015) ·
  l'avertissement de carte sur le 99, réel mais relevant de l'interface et non
  d'un point d'ingestion — consigné en reste à faire.

## v6 · Bloc 3 point 3.4 — Le taux de liquidation, à l'écran

- **Le chiffre qui manquait.** `reliability_metadata` calculait la courbe de
  liquidation et ses seuils, mais jamais la part déjà liquidée d'un exercice.
  `_completeness` la dérive mois par mois — au sein d'un même exercice, janvier
  a été observé onze mois de plus que décembre — en **réutilisant la courbe
  déjà là** comme profil de redressement. Deux mesures de la même cadence
  auraient divergé.
- **Ce que ça donne : 2025 est liquidé à 91,3 %**, 2024 à 99,6 %. La puce de la
  page DAMIR affiche désormais « 2025 · liquidé à 91 % » au lieu de
  « en consolidation » : le premier libellé mesure, le second se contente de
  prévenir. Et la formulation est plus courte que celle qu'elle remplace.
- **La réserve est chiffrée, et sur les quatre lectures**, pas seulement
  l'Évolution : Territoire, Âge et Sexe agrègent sur la période et héritent donc
  de la même sous-estimation. Elle est écrite une seule fois
  (`consolidationCaveat`) — deux lectures qui l'énonceraient différemment
  laisseraient croire à deux faits.
- **Le dernier point est atténué**, teinte de la série conservée : atténuer
  n'est pas recolorer, un point qui changerait de couleur se lirait comme un
  autre sujet. Encodage secondaire — la zone ombrée et la réserve portent le
  sens.
- **Défaut trouvé au passage : la zone « en consolidation » ne s'affichait
  jamais.** Bornée sur les libellés d'année, elle allait de 2025 à 2025 : une
  largeur nulle. Elle est désormais bornée sur les rangs de l'axe, décalés d'un
  demi-pas. Vérifié à l'écran.
- **Défaut plus grave, trouvé avant de le publier : le cache disque des
  métadonnées est indexé sur l'empreinte des seuls fichiers de données.** Un
  champ ajouté à la charge utile n'invalide rien. Constaté sur ce poste :
  l'entrée en cache ne contenait pas `completeness` et aurait été servie telle
  quelle — serveur à jour, front à jour, et un fichier JSON décidant que la
  fonctionnalité n'existe pas. Corrigé par un `METADATA_SCHEMA` qui entre dans
  la clé, et **verrouillé par deux tests** : l'un vérifie que le champ traverse
  le cache, l'autre que la version est bien dans la clé.
- **Sept tests** (`test_completeness.py`), dont celui qui mord : une année
  consolidée doit ressortir à 100 %. Le redressement est calibré sur les années
  mûres, s'il les gonfle il gonfle aussi la dernière. **71 tests verts.**
- **Écarté** : le libellé texte *dans* la zone ombrée. Ni un `formatter` ni un
  `name` sur la borne n'ont réussi à le faire rendre (vérifié à l'écran).
  Plutôt qu'un `label: { show: true }` qui n'affiche rien, la zone reste muette
  et le constat est écrit dans le code. Le signal textuel existe ailleurs — la
  réserve nomme l'exercice et chiffre son taux — et c'est lui qui voyage dans
  le PNG.

## v6 · Bloc 3 point 3.5 — D'où vient l'écart : volume et coût moyen

- **Une cinquième lecture au Panorama**, la seule qui ne décrive pas un état
  mais une **cause**. Un montant qui progresse de 4 % peut recouvrir deux
  histoires opposées — davantage d'actes au même prix, ou autant d'actes plus
  chers — et la décision n'est pas la même.
- **L'identité employée est la forme symétrique**, `Δq·(c₀+c₁)/2` et
  `Δc·(q₀+q₁)/2`, et non la forme naïve. La naïve laisse un terme croisé
  `Δq·Δc` qui n'appartient à personne ; la symétrique somme exactement à
  `q₁c₁ − q₀c₀`. Ce n'est pas une élégance : une cascade dont les marches ne
  rejoignent pas l'arrivée est une cascade fausse.
- **Ce que ça donne, 2015 → 2024** : 107,01 Md € · effet volume **+22,12 Md €**
  · effet coût moyen **+18,15 Md €** · 147,09 Md €. Par poste : Pharmacie
  +9,42 Md €, Radios +7,58, Indemnités Journalières +7,51.
- **Aucune requête supplémentaire.** `grand_post` rejoint les facettes de la
  requête panorama existante ; le serveur balaie déjà toutes les facettes en une
  passe (`_facet_rows`), précisément pour ne pas relire le cube plusieurs fois.
- **Une donnée absente reste absente.** Trois postes ne sont pas décomposables —
  Autres et Transports (montant négatif : un coût moyen négatif n'est pas un
  coût), Codes réservés (aucune quantité). Ils sont **nommés en réserve** et
  leur écart porté par une marche distincte, jamais réparti sur les autres ni
  mis à zéro.
- **La lecture n'est pas offerte sur une mesure qui n'est pas un montant.** Un
  taux n'est pas un `q × c` : la lecture affiche pourquoi, elle n'est pas
  proposée grisée.
- **Défaut trouvé à l'écran : `LegendComponent` n'est pas enregistré** dans
  `EChart.tsx` — tout le produit emploie des légendes HTML, que le panorama ne
  dessine pas. Ma première version « Par poste » posait deux barres par poste et
  une clé `legend` qui était une configuration morte ; les étiquettes directes
  de repli se chevauchaient à quatorze pixels d'écart. La forme est devenue
  **une barre nette par poste**, où la couleur porte un signe et non une
  identité : plus de légende nécessaire. Le partage volume/coût est au survol et
  dans le tableau, là où on le cherche une fois le poste repéré.
- **Écarté** : l'effet de structure, hors périmètre par la mission — un report
  vers des prestations plus chères au sein d'un poste s'y lit comme un effet
  coût. C'est la limite principale, énoncée en première réserve.

## v6 · Bloc 3 point 3.6 — Prolongation de tendance

- **Une forme de plus sur l'Évolution**, offerte au seul sujet unique :
  prolonger huit trajectoires produirait huit bandes superposées dont on ne
  lirait plus laquelle appartient à qui.
- **Ajustement log-linéaire**, donc à **taux constant** et non à montant
  constant ajouté — sur des dépenses de santé, la seconde hypothèse serait la
  plus fausse des deux. Le taux annuel implicite est **affiché** : c'est
  l'hypothèse elle-même.
- **Les trois conditions, vérifiées à l'écran.** ① 2025 est écarté de
  l'ajustement parce que non consolidé — **exclu plutôt que redressé** : le
  redressement du point 3.4 est déjà une estimation, en nourrir une seconde
  empilerait deux incertitudes sans que rien ne le dise. ② 2020-2021 exclus par
  défaut, **case décochable** : mesuré, 8 exercices et +3,8 % en excluant, 10
  exercices et +3,9 % en incluant. ③ Les six hypothèses sont énoncées sous le
  graphique, donc dans le PNG.
- **Le mot est tenu.** « Prolongation de tendance » partout ; « prévision »
  n'apparaît qu'en dénégation explicite dans la première réserve, et dans deux
  commentaires qui posent la règle. Aucun libellé ne l'emploie.
- **La bande vient des résidus**, par l'intervalle de prédiction à 95 % :
  `s·√(1 + 1/n + (t−t̄)²/Σ(tᵢ−t̄)²)`. Le troisième terme la fait s'évaser avec la
  distance — une bande d'épaisseur constante suggérerait que la seconde année
  prolongée vaut la première.
- **Trois encodages distincts, dont deux non colorés** : observé en trait plein
  avec points, prolongation en **tireté** — la forme dit « construit » même à
  l'impression et pour qui ne distingue pas les teintes —, bande en aire pâle
  sans contour.
- **Défaut trouvé à l'écran : la tendance était détachée de la courbe.** 2025
  étant écarté de l'ajustement, l'année laissait un trou entre le dernier point
  ajusté et le premier point prolongé. La tendance **traverse** désormais les
  années écartées : un trait interrompu ferait croire à une donnée manquante là
  où il n'y a qu'une année retirée du calcul. Effet secondaire heureux — on voit
  le point 2025 observé passer **sous** la tendance, ce qui est exactement le
  défaut de liquidation du point 3.4, rendu visible.
- **Français corrigé après lecture** : `toFixed` rendait « +3.8 % » avec un
  point décimal, et la phrase disait « appliqué à montant remboursé » sans
  article.
- **Écarté** : le choix de l'horizon. Deux ans, non négociable dans le code — au
  delà, la bande devient plus large que le signal et la forme cesse d'informer.

## v6 · Correctif — Croisements répondait 500

- **Symptôme** : « Le catalogue des indicateurs n'a pas pu être chargé ».
  `/api/correlations/meta` renvoyait 500, et la régression avec.
- **Cause** : au point 2.2 — une simplification de l'**écran** Croisements —
  quatre constantes du backend ont été supprimées alors que leurs **sept usages
  subsistaient** : `RESPONSE_METRICS`, `MAX_PREDICTORS`, `FACTORS`,
  `FAMILY_LABELS`. Le point 2.4 a ensuite réparti ces usages entre
  `correlations.py` et `regression.py`, rendant le manque encore moins visible.
  Un `import math` manquait aussi.
- **Pourquoi la suite restait verte** : aucun test ne touchait ces deux chemins.
  Un `NameError` de ce genre ne casse pas l'import du module et n'apparaît qu'à
  l'ouverture de l'écran. C'est la **deuxième fois** — `DELAYS_PATH` au point
  2.4 avait la même forme.
- **Correction** : les constantes partagées reviennent dans `correlations.py`,
  qui porte le vocabulaire commun et dont `regression.py` dépend déjà — jamais
  l'inverse. `FAMILY_LABELS`, que seule la régression emploie, reste chez elle.
- **Garde-fou, sur la classe et pas sur le cas.**
  `test_croisements.py::test_no_undefined_globals` relit chaque module du
  backend et vérifie qu'aucun nom n'y est employé sans y être défini ni importé.
  Vérifié en remisant le correctif : les six tests tombent, et repassent une
  fois le code restauré. Le balayage est propre sur l'ensemble du backend.
- **77 tests verts** (71 avant).

## v6 · Allègement des écrans de base — KPI, texte, couleur

Demande de l'utilisateur, portant sur Population, Mortalité et Pathologies —
étendue à la CSP, quatrième écran du même gabarit : en laisser un dépareillé
aurait coûté plus qu'il n'aurait préservé.

- **Les graphiques repassent au rouge.** `--plot-solo` était un graphite, sur
  l'argument qu'une courbe seule n'encode rien par sa couleur et que le rouge,
  en santé, signifie alerte. L'argument tient, **l'utilisateur a tranché
  autrement** : un outil dont tous les graphiques sont gris n'a plus de
  dominante. Le jeton pointe désormais `--accent-chart`, déjà défini comme « la
  teinte d'une série seule au graphique » et déjà sensible à la bascule de
  palette — donc rouge par défaut, bleu si l'utilisateur choisit le bleu. Les
  deux surcharges sombres en dur ont été retirées : elles masquaient le renvoi.
- **Les repères chiffrés sortent de la carte du graphique.** Ils partageaient
  une rangée avec le choix de forme et le sélecteur de palette — un résultat
  qu'on lit, à côté de deux réglages qu'on manipule. Ils ont désormais leur
  bande à eux, au-dessus. `KpiStrip`, qui existait déjà pour ce rôle et n'était
  plus importé que pour son type, est ranimé plutôt que remplacé : aucun
  composant nouveau.
- **Une bande, pas des cartes.** Quatre panneaux encadrés au-dessus d'un
  cinquième ne faisaient plus de hiérarchie. Un seul fond, un filet vertical
  entre les repères, le nombre en grand : c'est lui qu'on vient chercher.
  Styles dans `kpi.css`, fichier dédié adossé aux jetons — rien n'entre dans
  `styles.css`.
- **La question au-dessus du graphique disparaît** (« Comment cela évolue-t-il
  dans le temps ? »). Le titre, deux lignes plus haut, dit déjà ce qu'on
  regarde. Retirée de `ChartShell`, de ses sept points d'appel et des quatre
  modèles de lecture ; `question` devient facultatif dans le type partagé, où
  seul le Comparer de DAMIR le renseigne encore.
- **L'amorce de la carte disparaît aussi.** « DIABÈTE » s'affichait une
  troisième fois, après l'amorce de section et le titre h2. `ChartShell`
  énonçait déjà la règle — l'amorce est à laisser vide dès qu'elle répète ;
  elle répétait.
- **Défaut trouvé à l'écran : la CSP écrivait son ratio deux fois**, « 0,76
  femme pour 1 homme » en gros puis en petit. Sa valeur **est** son détail ; le
  drapeau `sentence` supprime le second.
- **`.pathology-kpis` retiré de `styles.css`** : huit règles mortes et trois
  sélecteurs dans des groupes partagés.
- **`docs/captures/`** : les douze écrans, avec un LISEZMOI qui donne les URL
  pour les refaire — une capture non reproductible ne vaut que le jour où on la
  prend.

## v7 · Mission « Alléger » point 1 — Diagnostic des mesures unitaires

- **Aucun code modifié**, c'était la consigne. Rapport dans
  `docs/DIAGNOSTIC_MESURES_UNITAIRES.md`.
- **La donnée est intacte** : `qte` totalise 133 320 833 455 dans le cube source
  comme dans le compact, zéro NULL des deux côtés, écart 0,000000 %. Le cube
  n'est pas à reconstruire.
- **La règle du Panorama est juste** — une prestation unique, parce qu'on
  n'additionne pas des boîtes et des journées — mais sa restitution ne l'est
  pas : trois options grisées portant « · indisponible » sans la raison que le
  serveur envoie pourtant, et un repli automatique vers « Montant remboursé »
  qui réécrit l'adresse sans un mot.
- **Défaut miroir non repéré par la mission** : `requires_homogeneous_unit`
  n'est posé sur aucune des douze mesures, donc la branche qui s'appuie dessus
  est morte. Comparer, le Tableau et Extraire n'appliquent aucune restriction et
  offrent un volume « tous postes confondus » — un nombre qui ne veut rien dire.
  `LISEZMOI.md` l. 1323 documente un garde-fou d'Extraire qui n'existe pas.

## v7 · Mission « Motion » point 0 — Audit : la fondation existe déjà

- **Le défaut que la mission juge le plus probable et le plus coûteux — un
  import `motion.*` qui réintègre tout le moteur — n'existe pas.** Zéro
  occurrence dans le dépôt, et `LazyMotion` est monté en mode `strict`, qui rend
  la faute impossible par construction plutôt que par vigilance.
- **Six fichiers importent `motion/react`** : cinq n'en tirent
  qu'`AnimatePresence`, qui doit rester au premier plan et non dans le morceau
  différé ; `components/motion.tsx` tient le reste.
- **La fondation du point 1 est déjà posée** (bloc 3, point 3.1) : `LazyMotion`
  + `domAnimation` via un fichier de découpe, monté une seule fois dans
  `App.tsx:213` ; `MotionConfig reducedMotion="user"` doublé d'une durée nulle
  vérifiable à la lecture ; vocabulaire commun (`SPRING`, `POPOVER`, `CHIP`,
  `REVEAL`, `DRAWER`) dans un fichier unique.
- **Poids** : `motionFeatures` 37,37 Ko bruts, **14,06 Ko gzippés** — exactement
  le repère de la mission. Le moteur ne charge qu'après le premier rendu.
- **Ce qui reste du point 2** : les puces du bandeau (entrée/sortie et `layout`),
  la bascule Panorama ↔ Comparer, les blocs repliés. Le tiroir et les deux
  popovers sont animés.

## v7 · Mission « Alléger » point 2 — Les repères, discrets

- **Ni cadre ni surface.** La bande avait encore un fond et une bordure : deux
  cadres empilés avec celui du graphique ne font pas de hiérarchie, ils font
  deux boîtes. Les repères vivent maintenant sur le fond de la page, tenus par
  leur seul alignement.
- **Trois niveaux enfin distincts.** Libellé `--text-2xs` en capitales grises,
  valeur `--text-xl` en graisse **600** — elle était en 700 et écrasait le titre
  du graphique posé juste dessous —, précision `--text-2xs` sans capitales ni
  graisse.
- **Le plafond de quatre repères est déjà tenu** : Pathologies 4, CSP 4,
  Mortalité 4, Population 3. Rien à replier, et aucun découpage ajouté — il
  aurait supprimé une capacité pour un cas qui n'existe pas.
- **Écart assumé avec la mission, sur consigne postérieure de l'utilisateur.**
  Le point 2 demande de remettre les repères dans la carte, sur la rangée des
  choix de forme (`.damir-strip`). L'utilisateur avait demandé l'inverse la
  veille — une zone dédiée au-dessus de la carte. La zone dédiée est conservée ;
  tout le reste du point (poids typographique, cadres, plafond) est appliqué.

## v7 · Mission « Alléger » point 3 — « Autres vues » n'appartient qu'à Comparer

- **Le repli était décidé par le composant**, sur une liste écrite en dur
  (`PRIMARY_VIEWS`). Un Panorama qui n'offre que trois formes héritait donc d'un
  bouton qui ne repliait rien, tout en ajoutant un contrôle.
- **Il devient une propriété de l'appelant** : `ViewSwitch` reçoit `folded`, et
  sans elle ne replie rien — le bouton n'existe alors pas du tout, plutôt que
  d'exister vide.
- **Seul le Comparer de DAMIR replie**, parce que lui seul offre dix formes.
  Vérifié à l'écran : Panorama Pathologies n'affiche plus que « Courbe / Barres »,
  Comparer conserve « Autres vues 4 ».
- `PRIMARY_VIEWS` reste exporté mais n'a plus qu'un appelant, ce que son
  commentaire dit désormais.

## v7 · Mission « Alléger » point 5 — Les explications passent derrière une icône

- **`InfoHint`** : vrai `<button>` focusable, panneau lié par `aria-describedby`,
  `Échap` qui ferme **et rend le focus immédiatement** — aucune animation ne le
  retarde. Le survol ouvre, le clic **épingle**. Styles dans `infoHint.css`,
  adossés aux jetons.
- **Défaut corrigé à l'écran** : le clic basculait au lieu d'épingler. À la
  souris, `onMouseEnter` avait déjà ouvert le panneau ; le clic le refermait
  donc aussitôt, et il était impossible de le fixer.
- **Tableau** : les deux paragraphes permanents — le mode d'agrégation, et
  pourquoi Variation et CAGR manquent quand l'année est en axe — passent dans
  une icône contre l'étiquette « Agrégation ». L'en-tête tient en deux lignes.
- **Extraire** : cinq encarts permanents retirés, dont quatre disaient la même
  chose d'une source à l'autre. Une seule icône, sur le bouton qui produit le
  fichier.
- **Arbitrage : ce qui reste visible.** Les quatre `.damir-note` de DAMIR, CSP
  et Mortalité sont des **avertissements de comparabilité** — « ces séries ne
  décrivent pas la même population », « 12 prestations sélectionnées, 8
  comparées ». Ils ne bougent pas. La mesure indisponible du Tableau non plus :
  c'est un avertissement, pas une explication.
- **La règle est écrite dans `CLAUDE.md`**, avec ses deux exceptions, à côté de
  celle qui impose l'import de Motion via `m`.

## v7 · Mission « Alléger » points 6.1 et 6.4 — La teinte du Tableau, et la ligne négative

- **L'échelle se lit sur les rangs, plus sur l'étendue brute.** Un poste à
  22 Md € poussait quinze postes plus petits dans la même marche : la couleur
  ne distinguait plus rien. Chaque marche reçoit maintenant la même part de
  cellules (`tintStep`, recherche dichotomique du premier rang égal — deux
  cellules de même valeur reçoivent la même teinte).
- **Un lavis, plus un aplat.** Cinq marches en `color-mix` sur la rampe
  séquentielle, de 6 % à 46 %. L'encre reste `--ink` partout : **l'inversion de
  couleur de texte disparaît**, et avec elle les cellules fortes pénibles à
  lire. Huit marches ont été ramenées à cinq — au-delà, deux voisines ne se
  distinguent plus.
- **La teinte suit la palette** et vient du thème ; la cellule vide garde
  `--map-void`, jamais un bas de rampe. Vérifié à l'écran sur « Codes réservés ».
- **6.4 tranché : la ligne AUTRES est légitime.** En 2015, ses −639,81 M€ se
  décomposent en **−677,20 M€ de régularisations** (`rem_neg`) pour
  **+37,39 M€ de remboursements** — 46 codes, tous dans le poste « Divers ».
  Ce n'est pas un défaut d'agrégation. Un `InfoHint` le dit, **sur les seules
  lignes à total négatif**.
- **Aucun réglage de teinte ajouté** : le tableau lavé se lit mieux que nu, et
  un interrupteur aurait été un élément visible de plus.

## v7 · Mission « Alléger » point 4 — Le popover de série, dévoilé par degrés

- **Trois filtres visibles, le reste replié.** Sexe, Tranche d'âge, Territoire
  restent ; la hiérarchie de prestations et les trois champs avancés passent
  derrière « Plus de filtres », fermé par défaut. Le **compteur de filtres
  actifs** est écrit sur le bouton : un réglage posé puis refermé ne s'oublie
  pas.
- **Le pli est générique.** Chaque champ est rendu par sa clé (`fieldNode`), la
  section le pose s'il est visible, le pli s'il est replié — jamais deux fois.
  L'appelant nomme les clés ; Extraire, qui les veut toutes à plat, ne nomme
  rien et ne voit aucun pli.
- **La hauteur du pli est animée par Motion** (`height: auto`), la seule chose
  que le CSS ne sait pas faire et le seul endroit du produit où ça vaut la peine.
- **Défaut corrigé : le popover portait deux moteurs d'animation.** Une keyframe
  CSS `chip-popover-in` **et** la variante Motion `POPOVER` sur le même élément.
  La keyframe rejouait le fondu à chaque re-rendu et se battait avec la
  transformation de Motion. Elle est retirée ; Motion garde l'entrée **et la
  sortie**, que le CSS ne pouvait pas animer.
- **`transform-origin: top left`** : le panneau naît de sa puce au lieu
  d'apparaître par-dessus. `scroll-behavior: smooth` sur le défilement unique.
- **Composant unique déjà en place** : `CompareRail` sert DAMIR directement et
  les trois autres bases via `SeriesRail`. Rien à unifier — vérifié, pas
  supposé.

## v7 · Mission « Motion » point 2 — Ce qui devait être animé, et ce qui ne le sera pas

- **Les puces du bandeau, avec `layout`.** Ajouter et retirer une série sont les
  deux gestes de cet écran : leurs voisines glissent maintenant vers leur
  nouvelle place au lieu de s'y téléporter. C'est le cas où Motion apporte ce
  que le CSS ne sait pas faire. La mesure de largeur se fait sur la rangée
  fantôme, que rien n'anime — les deux ne se gênent pas.
- **La bascule Panorama ↔ Comparer : animée, puis retirée.** Le fondu partait
  d'`opacity: 0`, si bien que la section n'apparaissait qu'une fois l'animation
  jouée. Constaté à l'écran : sur un onglet dont l'horloge d'animation est
  ralentie, la page est restée **blanche plus de huit secondes**, contenu monté
  mais invisible. Un popover qui rate son fondu reste un popover ; une section
  qui rate le sien devient une page vide. Retiré, et la raison est écrite dans
  le code.
- **Les blocs repliés restent des `<details>` natifs.** Les animer en hauteur
  demanderait de les remplacer par un pli scripté, ce qui coûterait l'expansion
  automatique à la recherche dans la page — une capacité réelle contre 200 ms
  de cosmétique. `InfoHint`, lui, est animé, et le pli « Plus de filtres » du
  popover aussi.
- **Bundle inchangé** : `motionFeatures` 37,37 Ko / **14,06 Ko gzip**, identique
  au repère. `index` passe de 53,86 à 54,01 Ko — soixante octets gzip de code
  nouveau, pas un import mixte.

## v7 · Recette des deux missions — largeurs, thèmes, contraste

- **Six largeurs, aucun débordement.** 1400 / 1272 / 1024 / 860 / 720 / 620 px
  sur CSP, Pathologies, Population et le Tableau : `scrollWidth` toujours
  inférieur à la largeur, zéro élément dont le texte dépasse sa boîte. Mesuré au
  banc d'essai en iframe — la fenêtre est maximisée et ne se redimensionne pas,
  mais les media queries d'une iframe s'évaluent sur *sa* largeur.
- **Contraste du lavis du Tableau, composé sur le fond réel** (le lavis est
  translucide, le lire dans la feuille de style ne dirait rien) :

  | Marche | Thème clair | Thème sombre |
  |---|---:|---:|
  | 1 (la plus pâle) | 16,24 : 1 | 17,20 : 1 |
  | 5 (la plus forte) | **10,51 : 1** | **10,32 : 1** |

  Le pire cas dépasse AAA. C'est ce qu'achète l'encre constante : l'ancienne
  rampe pleine exigeait d'inverser la couleur du texte précisément parce
  qu'elle passait sous le seuil.
- **Reste à faire : le point 6.3**, le Tableau ouvert aux cinq sources. Il
  demande de porter dans le Tableau la machinerie par source qu'`Extraire`
  possède déjà — cinq barres de portée distinctes, quatre chemins de requête, et
  une table de licences d'agrégation (une prévalence ne se somme pas, une part
  n'est pas additive entre régions, la Mortalité n'a pas de dimension
  territoriale). Non entamé plutôt que bâclé : sur un produit dont la première
  règle est qu'une forme qui mentirait n'est pas offerte, un croisé à moitié
  gardé produirait des nombres faux.

## v8 · Mission « Finition » point 1 — Une seule structure d'écran

- **Les quatre en-têtes hors panneau ont disparu.** Le sujet est monté dans
  l'amorce du panneau, le périmètre est descendu en ligne grise sous le titre.
  Un seul titre par écran là où il y en avait deux pour la même chose.
- **Les repères sont revenus dans le panneau**, sur la seconde rangée, à gauche
  des formes — exactement le vide qu'elles laissaient. `KpiStrip` et `kpi.css`,
  devenus morts, sont supprimés ; le type `KpiItem` emménage dans `ChartShell`.
  **C'est un revirement assumé** : la bande séparée au-dessus du panneau avait
  été demandée à l'oral trois jours plus tôt ; cette mission tranche l'inverse,
  avec son argument, et la structure de DAMIR devient la seule.
- **Aucune capacité perdue.** Les pastilles des en-têtes supprimés — « Effectifs
  bruts · sans taux », « Millésime », « Pondéré Insee » — sont du périmètre :
  elles rejoignent la ligne grise. Le bouton « Extraire les données → » en
  double disparaît, les quatre bases passaient déjà `onExtract` au pied.
- **Deux répétitions corrigées en chemin**, vues à l'écran : « Diabète » en
  amorce **et** en tête de la ligne grise (la famille n'est reprise que si elle
  diffère du sujet) ; « millésime 2023 · millésime 2023 » sur CSP (`scopeLabel`
  le portait déjà).
- **Aucun espace mort sous le graphique** : mesuré, le canevas remplit son
  conteneur au pixel (430/430) et il reste 14 px avant le pied. Le vide que la
  mission voyait venait des deux en-têtes empilés, pas d'une hauteur réservée.
- **21 règles CSS mortes retirées** de `styles.css`, plus 7 sélecteurs dans des
  groupes partagés. Recette : six largeurs, deux thèmes, aucun débordement,
  aucun texte coupé, aucun chevauchement entre repères et commandes.

## v8 · Trois défauts d'écran, et le volume ouvert à tout poste

- **L'infobulle du Tableau était illisible.** Cause trouvée avant correction :
  le panneau était en `position: absolute` dans un conteneur portant
  `overflow: auto` (`pivot.css:76`) — rogné, emporté par le défilement, et
  posé sur des cellules teintées dans la paire sombre d'infobulle. Il passe en
  **portail** vers `document.body`, en position fixe mesurée sur l'icône,
  corrigée s'il sort de la fenêtre, fond `--surface` **opaque** et encre
  `--ink`. `Échap`, clic extérieur et focus inchangés.
- **Le chevauchement du popover** venait de la phrase « La période reste
  commune… », qui recouvrait le replieur. Elle est supprimée — le point 7 la
  listait comme superflue —, avec ses **quatre** occurrences.
- **La « pastille rouge parasite » n'existait pas** : c'était le graphique qui
  transparaissait à travers le popover pendant son fondu d'ouverture. Rien à
  corriger, et c'est dit plutôt que patché.
- **Le popover tient enfin sans défilement** : débordement mesuré à 0 px, contre
  52 px. « Grand poste » descend dans le pli — sur une série comparée par grand
  poste, le champ est désactivé et ne fait qu'écho au nom de la puce. Le
  compteur du pli affiche « 1 », de sorte qu'un filtre replié ne s'oublie pas.
- **Le sous-titre du Tableau est supprimé** : le titre et les deux menus d'axe
  disent déjà ce que fait l'écran.
- **Volume et montants moyens s'ouvrent à tout niveau de la hiérarchie**, à la
  demande de l'utilisateur : grand poste, poste, sous-poste ou prestation. La
  règle unique vit dans `analysis.unit_scope` ; seul « tous les grands postes »
  reste refusé, parce qu'on y additionnerait des boîtes, des journées et des
  kilomètres. **Le prix est dit, pas payé en silence** : au-dessus de la
  prestation, une réserve nommant le niveau accompagne la mesure jusqu'au bloc
  « Ce que ce graphique ne montre pas » et jusqu'au PNG — « un ordre de grandeur
  et une tendance, jamais un tarif ». **8 tests** (`test_unit_scope.py`), 85 au
  total.

## v8 · Le bandeau « Ce que je compare » repose sur une surface

- **Il flottait sur le fond ivoire, collé au panneau de filtres** : l'ensemble se
  lisait comme une zone unique, et les puces semblaient posées sur du gris. Il
  repose maintenant sur une tablette `--surface`, au rayon des panneaux, **sans
  bordure ni ombre** — elle le pose sans en faire un troisième panneau entre les
  deux qui l'encadrent.
- **Les puces passent en `--surface-sunken`** : blanches sur une tablette
  blanche, un filet seul ne leur donnait plus de corps.
- **Aligné et respiré** : retrait horizontal de 22 px, celui de `.damir-stage`,
  si bien que « Ce que je compare » tombe sur le titre du panneau suivant —
  mesuré à 274 contre 275 px. Douze pixels au-dessus, seize en dessous, les
  écarts standards entre panneaux.
- **Écart assumé avec la mission**, qui demandait au point 3 « sans surface ni
  bordure ». L'utilisateur a demandé l'inverse en voyant l'écran : une surface,
  esprit minimaliste. La surface est là, la bordure et l'ombre ne le sont pas.
- Vérifié aux deux thèmes — en sombre, page `#0e0d0c`, tablette `#171614`, puce
  `#121110`, trois niveaux distincts — et à 1400 / 1024 / 720 px sans
  débordement.
