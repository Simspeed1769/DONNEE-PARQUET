
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
