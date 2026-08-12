# MISSION V5 — DAMIR Studio · Comparer partout, et une base de population

> **Mode d'emploi (humain).** Placer ce fichier à la racine, à côté de `CLAUDE.md`. Déposer le fichier Insee dans `data/population/source/estim-pop-nreg-sexe-aq-1975-2026.xlsx`. Lancer les deux phases **séparément** :
> « Lis MISSION_V5.md et CLAUDE.md en entier. Exécute la Phase 1 uniquement. Plan bref avant de coder, commit à la fin, puis arrête-toi. »

Deux phases seulement. La Phase 1 finit l'uniformisation visuelle et fonctionnelle des quatre bases. La Phase 2 ajoute une cinquième source — la population Insee — qui sert à la fois de base consultable et de dénominateur propre pour les autres.

Les principes de `CLAUDE.md` restent la loi : aucune nouvelle dépendance, couleurs issues des jetons `theme.css` uniquement, ratio sans dénominateur = `None`, forme non licite absente plutôt que grisée, rien ajouté à `styles.css`, SQL paramétré, aucun appel réseau au runtime.

**Référence constante : DAMIR.** Quand une spécification laisse un doute, la réponse est « fais exactement comme DAMIR ».

---

# PHASE 1 — Finir l'uniformisation

## 1.A — Le bandeau « Ce que je compare » sort de l'encadré

**Constat (capture 1).** Le bandeau gris « Ce que je compare » est posé **à l'intérieur du panneau blanc** du graphique, tout en haut. Le contraste gris-sur-blanc est lourd et le bandeau appartient visuellement au graphique alors qu'il le pilote.

**Travail.** Sortir ce bandeau du panneau `.panel` et le placer **au-dessus**, sur le fond `--paper` de la page, entre la barre de filtres et le panneau graphique. Il n'a alors plus besoin de fond gris : sur le fond ivoire de la page, une simple rangée de puces colorées suffit, sans surface propre — ou avec une surface très légère si la lisibilité l'exige. Le bouton « Modifier les séries » reste à droite du bandeau.

Conserver : les pastilles de couleur de série, les libellés, l'ordre des séries. Le bandeau reste compact et ne pousse jamais le graphique vers le bas quand on l'ouvre.

## 1.B — Plus aucun débordement ni chevauchement

**Constats précis.**
- **Capture 2 :** le titre d'axe Y « % de la population de référence Cnam » **chevauche l'étiquette de la première barre** (« 11,8 % »). Deux textes se superposent, illisibles.
- **Capture 3 :** le libellé « Pathologies comparées » est **coupé en haut** par le bord de son conteneur.

**Travail.** Traiter la cause commune : la zone réservée au-dessus du tracé est insuffisante et les conteneurs rognent ce qui dépasse.
1. Dans les options ECharts de chaque lecture, réserver assez de place au-dessus du tracé pour le nom d'axe **et** les étiquettes de valeurs (`grid.top`), plutôt que de réduire les polices.
2. Vérifier qu'aucun conteneur parent ne coupe le canvas ou les libellés (`overflow`, hauteur fixe, marge négative héritée de `styles.css`).
3. Activer l'évitement de collision sur les étiquettes de séries là où elles peuvent se chevaucher (`LabelLayout` avec `hideOverlap` — **vérifier que le module est bien enregistré dans `EChart.tsx`**, un module non enregistré échoue en silence).
4. Contrôler aux largeurs 1400 / 1240 / 860 / 720 / 620 px, en thème clair **et** sombre, sur les quatre bases et sur toutes les lectures. Prendre des captures avant de conclure.

**Aucun texte coupé, aucun texte superposé nulle part** — c'est le critère d'acceptation, sans exception.

## 1.C — Pathologies : la carte de France dans Territoire

La lecture Territoire de Pathologies doit proposer la **carte choroplèthe**, comme DAMIR, en plus du classement horizontal existant.

Réutiliser `charts/frenchMap.ts` (GeoJSON déjà servi et mémorisé) avec le cadrage `layoutCenter` / `layoutSize` de DAMIR. Règles propres à la base à respecter :
- Un territoire **sans donnée publiée** (masquage Cnam, effectif < 10) prend `--map-void`, jamais le bas de rampe — l'absence n'est pas une valeur basse.
- La prévalence étant une mesure de niveau, la rampe est séquentielle (`--ramp-*`), et l'échelle indique clairement l'unité.
- Le clic sur une région filtre la lecture, comme sur DAMIR.

## 1.D — Comparer : le gabarit DAMIR à l'identique sur les trois autres bases

**Exigence.** La section Comparer de Pathologies, CSP et Mortalité doit être **la même que celle de DAMIR**, au mot près : mêmes gestes, mêmes emplacements, mêmes vues, mêmes exports. Seul l'objet comparé change.

| Base | Objet comparé | Sélection par défaut à l'ouverture |
|---|---|---|
| DAMIR | prestations (grand poste → poste → sous-poste → prestation) | inchangée |
| Pathologies | pathologies (Famille → Catégorie → Détail) | **Diabète · Cancers · Maladies neurologiques ou dégénératives** — reprendre les libellés exacts de la nomenclature Cnam, et si l'un est absent, prendre la pathologie de prévalence la plus proche et le signaler |
| CSP | catégories socioprofessionnelles (6 groupes ou 29 catégories) | les 3 groupes aux effectifs les plus élevés du dernier millésime |
| Mortalité | causes de décès (hiérarchie CépiDc) | les 3 causes les plus fréquentes de la dernière année |

**Capacités exigées sur les quatre bases, sans exception :**
- Sélecteur du type `SeriesPicker` : recherche, classement par poids, jusqu'à 8 séries, complément « Reste du périmètre » éteint par défaut. **Aucune liste déroulante native** (`<select>`) : elle ignore les jetons de thème.
- **Filtres par série** : chaque série ouvre l'`AdvancedFilterPanel` complet et peut avoir son propre périmètre (région, âge, sexe, millésime), exactement comme dans DAMIR. Une nouvelle série part du périmètre de la précédente. Nom éditable, filtres résumés en gris sous le nom.
- Avertissement automatique dès que deux séries ne décrivent pas la même population, et **retrait** (pas grisage) des formes cumulatives dans ce cas.
- Vues nommées par la question à laquelle elles répondent, filtrées par le modèle de chaque base : prévalence et part jamais empilées ni en camembert (non additives) ; patients, effectifs et décès l'autorisent.
- Période commune, exports PNG 16:9 fond clair et CSV, transitions par morphing.

**Acceptation Phase 1.** Aucun texte coupé ni superposé aux cinq largeurs dans les deux thèmes · bandeau de comparaison hors du panneau blanc · carte de France dans Pathologies · sur les quatre bases, Comparer s'utilise à l'identique, avec filtres par série et une sélection par défaut parlante à l'ouverture. **Commit.**

---

# PHASE 2 — La population Insee : dénominateur et cinquième base

## 2.A — Le fichier source

`data/population/source/estim-pop-nreg-sexe-aq-1975-2026.xlsx` — Insee, *Estimations de population par région, sexe et âge quinquennal*, mise à jour du 23 décembre 2025.

**Structure vérifiée du fichier** (ne pas la redécouvrir à l'aveugle, mais la contrôler) :
- **53 onglets annuels** nommés `1975` … `2026`, plus un onglet `À savoir` à ignorer pour les données.
- Dans chaque onglet annuel : ligne 1-2 = titres ; **ligne 4** = bloc de sexe (`Ensemble` en colonne B, `Hommes` en colonne W, `Femmes` en colonne AR) ; **ligne 5** = en-têtes d'âge ; **données à partir de la ligne 6**, colonne A = région.
- Chaque bloc de sexe compte **21 colonnes** : 20 tranches quinquennales (`0 à 4 ans` … `95 ans et plus`) puis `Total`.
- Colonne A : les **13 régions**, puis des lignes d'agrégat — `France métropolitaine`, `Guadeloupe`, `Martinique`, `Guyane`, `La Réunion`, `Mayotte`, `DOM`, `France métropolitaine et DOM`. Les DOM sont des régions à part entière ; **`France métropolitaine`, `DOM` et `France métropolitaine et DOM` sont des agrégats à ne pas charger comme régions** (ils seraient comptés deux fois).

**Bonne nouvelle à exploiter :** les régions sont **rétropolées sur les 13 régions actuelles depuis 1975**. Il n'y a donc aucun problème de réforme régionale de 2016 à gérer sur cette source.

**Pièges à traiter explicitement :**
- **1975 à 1989** : métropole seule, pas de DOM.
- **1990 à 1998** : mise en page différente et classe d'âge maximale `90 ans et plus` pour les DOM. Le script doit détecter la mise en page plutôt que supposer celle des années récentes ; à défaut, restreindre l'ingestion à 1999+ et le dire dans le journal.
- **Mayotte** : absente avant 2014.
- Guadeloupe hors Saint-Martin et Saint-Barthélemy.
- L'âge s'entend **atteint au 1er janvier** de l'année.

## 2.B — Le script de préparation

Écrire `tools/build_population.py`, sur le modèle des scripts existants de `tools/` :
- Lit les 53 onglets, produit `data/population/population.parquet` en **format long** : `annee` (int), `region` (libellé normalisé sur le référentiel régions déjà utilisé par l'app), `sexe` (`Hommes` / `Femmes` — le bloc `Ensemble` est **recalculé par somme**, pas chargé, pour garantir la cohérence), `age_quinquennal` (libellé), `population` (int).
- Exclut les lignes d'agrégat, journalise ce qui a été exclu et les années non ingérées.
- Ajoute une colonne `age_decennal` dérivée, projetée sur la maille décennale déjà utilisée par DAMIR, pour que les jointures soient immédiates.
- Idempotent, réexécutable, ne modifie jamais le fichier source.

Charger le Parquet en **vue DuckDB** dans `DamirRepository`, comme les autres sources, avec un drapeau `has_population` et la même dégradation gracieuse : si le fichier est absent, l'application fonctionne sans, en le signalant.

## 2.C — Remplacer le dénominateur emprunté

Aujourd'hui la population de référence est tirée de `npop` de la Cartographie Cnam, avec un `MAX(npop)` par cellule âge × sexe pour éviter la multiplication par le nombre de pathologies. C'est un dénominateur détourné de sa source.

**Travail.**
1. Recenser toutes les mesures « par habitant » et toutes les parts qui s'appuient sur `npop` (dans `analysis.py`, `explore.py`, `correlations.py`, `csp.py`, `pathologies.py`).
2. Introduire la population Insee comme **dénominateur de référence**, sur la maille commune région × âge × sexe × année.
3. **Population moyenne de l'année.** L'Insee donne la population au 1er janvier ; un dénominateur de flux annuel doit être la moyenne des 1er janvier N et N+1. Implémenter cette moyenne, et pour la dernière année disponible — où N+1 manque — utiliser le 1er janvier seul en le signalant dans les réserves.
4. **Ne pas supprimer `npop`.** La population protégée par l'Assurance Maladie et la population résidente ne mesurent pas la même chose : les deux restent disponibles, mais l'outil dit toujours laquelle il utilise. Nommer explicitement le dénominateur dans le titre d'axe (« % de la population résidente Insee » contre « % de la population de référence Cnam ») et dans le bloc « Ce que ce graphique ne montre pas ».
5. Compléter le tableau numérateur / dénominateur de l'écran Méthodologie : pour chaque mesure, quelle population, quelle source, quelle maille, quelle réserve.
6. Vérifier l'effet du changement : produire une note courte dans `docs/PROGRESS.md` indiquant, sur deux ou trois mesures témoins, l'écart entre l'ancien et le nouveau dénominateur. Si l'écart est important, ne rien lisser : le documenter.

## 2.D — Cinquième base : « Population »

Ajouter une entrée **Population** dans le groupe EXPLORER de la barre latérale, après les quatre existantes.

**Structure : le gabarit des autres bases, sans section Comparer** (comparer des tranches d'âge entre elles n'apporterait rien que les lectures ne donnent déjà). L'écran a donc une seule section, sur le modèle de Panorama :
- **Mesure unique** : effectif. Plus une mesure dérivée `part (%)` — la part d'un sous-ensemble dans la population du périmètre.
- **Lectures** : Évolution (1975 → 2026, la plus longue série de tout l'outil) · Territoire (carte + classement) · Âge · Sexe.
- **Filtres** : période, région, tranche d'âge, sexe — mêmes composants que partout.
- **KPI au format DAMIR** : population du dernier millésime · variation vs millésime précédent · part des 65 ans et plus (repère naturel et parlant pour un actuaire prévoyance).

**La forme signature de cette base : la pyramide des âges.** C'est ici qu'elle a le plus de sens et c'est ce qui rendra l'écran mémorable. Barres horizontales opposées, hommes à gauche, femmes à droite, axe des âges partagé au centre, valeurs absolues sur les deux versants. Deux raffinements qui font la différence, à implémenter avec les moyens déjà présents :
- **Silhouette de référence** : superposer en trait fin la pyramide d'une année de comparaison (première année de la période par défaut) — on voit le vieillissement d'un coup d'œil, sans animation ni artifice.
- **Transition continue** au changement d'année ou de région, via `universalTransition` comme partout ailleurs.

La pyramide est déclarée dans le modèle comme licite uniquement sur la lecture Âge et quand le sexe n'est pas filtré — ailleurs elle n'est pas offerte.

Réserves à afficher : couverture 1975-1989 métropole seule ; Mayotte à partir de 2014 ; âge atteint au 1er janvier ; dernières années provisoires.

Exports : PNG 16:9 fond clair et CSV, comme partout. Ajouter la source dans l'écran Extraire (aperçu, CSV, Excel) et dans « Données & méthode ».

**Acceptation Phase 2.** `tools/build_population.py` produit le Parquet et journalise ses exclusions · les mesures par habitant s'appuient sur la population Insee moyennée, avec le dénominateur nommé à l'écran · l'écart avec l'ancien dénominateur est documenté · la base Population s'utilise comme les autres, avec une pyramide des âges qui fonctionne et une silhouette de référence · Extraire et Méthodologie couvrent la nouvelle source. **Commit + tag `v5`.**

---

## Interdits (rappel)

Aucune nouvelle dépendance · aucune couleur en dur · aucun `None` remplacé par 0 · aucune liste déroulante native dans les sélecteurs de séries · aucune forme non licite offerte · aucun texte coupé ou superposé · rien ajouté à `styles.css` · le fichier source Insee n'est jamais modifié · pas deux phases enchaînées sans validation de l'utilisateur.

## Méthode

Une phase à la fois. Plan bref avant de coder. `npm run build` et `python -m pytest` verts avant chaque commit. Message de commit en français. 3 à 5 lignes ajoutées à `docs/PROGRESS.md` à la fin de chaque phase. Captures d'écran aux cinq largeurs, dans les deux thèmes, avant de déclarer une phase terminée.
