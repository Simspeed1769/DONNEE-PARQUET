# MISSION V6 — DAMIR Studio · ergonomie de Comparer et finitions

> **Mode d'emploi (humain).** Placer ce fichier à la racine, à côté de `CLAUDE.md`. « Lis MISSION_V6.md et CLAUDE.md en entier. Présente-moi un plan bref avant de coder. Traite les points dans l'ordre, en commitant après chaque point. »

Une seule phase, six points. Le point 1 est le plus important et demande une vraie refonte ; les cinq autres sont des corrections ciblées. Le point 6 est un bug : le traiter en premier si c'est plus commode.

Les principes de `CLAUDE.md` restent la loi : aucune nouvelle dépendance, couleurs issues des jetons `theme.css` uniquement, aucune liste déroulante native dans les sélecteurs de séries, forme non licite absente plutôt que grisée, rien ajouté à `styles.css`.

## 1. Refonte du panneau « Modifier les séries » (les cinq bases)

**Constat.** Le bandeau « Ce que je compare » est bien placé, mais le panneau qui s'ouvre derrière est le point faible de l'application. Défauts relevés sur capture, tous à corriger :

- Le panneau recouvre la page en superposition et masque le bandeau et les filtres qu'il prolonge ; on ne voit plus le graphique qu'on est en train de modifier.
- Il apparaît collé sous la barre de filtres, sans séparation, si bien qu'on ne sait plus quel contrôle appartient à quoi.
- Il a sa propre barre de défilement imbriquée dans celle de la page — deux ascenseurs concurrents.
- Le contenu d'une série mélange sans hiérarchie : nom éditable, valeur, puce de filtre, et un bloc « Périmètre de "Pharmacie" » qui pousse tout le reste vers le bas dès qu'il s'ouvre.
- Ce bloc de périmètre contient des listes déroulantes natives (`<select>`) — interdites, elles ignorent les jetons de thème.
- Il manque une croix pour retirer une série de façon évidente ; les icônes présentes (entonnoir, flèches, croix) sont petites, sans libellé et ambiguës.

**Direction à suivre.** Concevoir un panneau latéral (tiroir ancré à droite, largeur fixe d'environ 420 px, hauteur pleine) plutôt qu'une superposition centrale : le graphique reste visible à gauche pendant qu'on modifie les séries, et chaque modification se répercute en direct. Un seul défilement, à l'intérieur du tiroir.

Structure d'une ligne de série, dans cet ordre horizontal :

1. Pastille de couleur de la série (rappelle la couleur du tracé).
2. Nom, éditable au clic.
3. Valeur agrégée, discrète.
4. Bouton « Filtrer » — libellé texte ou icône avec infobulle, jamais une icône nue.
5. Poignée de réordonnancement.
6. Croix de suppression, toujours visible, avec zone de clic confortable (44 px minimum) et infobulle « Retirer cette série ».

Le périmètre par série s'ouvre en accordéon sous sa propre ligne, sans repousser les autres séries hors de vue : le tiroir défile, la ligne reste ancrée en haut de sa section pendant l'édition. Les contrôles du périmètre sont ceux de l'`AdvancedFilterPanel`, avec les composants maison (`MultiSelect`), jamais de `<select>` natif.

En bas du tiroir, fixes : « Ajouter une série », le compteur (« 5 séries sur 8 »), et le bouton de fermeture. La touche `Échap` ferme le tiroir, le focus revient sur « Modifier les séries », et le focus est piégé dans le tiroir tant qu'il est ouvert.

À appliquer à l'identique sur les cinq bases — DAMIR (prestations), Pathologies, CSP, Mortalité, Population le cas échéant. Un seul composant partagé, pas cinq variantes.

## 2. Mortalité : aligner les filtres

**Constat.** Dans le panneau de filtres, « Cause de décès » occupe deux lignes (champ de recherche au-dessus d'une liste déroulante) tandis que « Population » et « Millésime » sont sur une seule ligne, alignés sur la seconde. Les trois libellés ne sont pas sur la même ligne de base et les champs n'ont pas la même hauteur.

**Travail.** Une seule rangée, trois contrôles alignés : libellés sur la même ligne de base, champs de même hauteur, espacements repris de la `ScopeBar` de DAMIR. Le sélecteur de cause devient un contrôle unique avec recherche intégrée (`SearchableCauseSelect`), pas un champ de recherche plus une liste déroulante native. La mention « 86 causes classées par famille » passe à l'intérieur du sélecteur.

## 3. Population : ne pas afficher chaque année

**Constat.** Sur 1975-2026, l'axe porte 52 points et le graphique devient un pointillé illisible.

**Travail.** Sur la lecture Évolution de la base Population, n'afficher par défaut qu'un point tous les 5 ans (1975, 1980, … 2025, plus la dernière année disponible même si elle rompt le pas). Prévoir un contrôle discret « pas : 5 ans / 1 an » pour qui veut le détail. Les étiquettes d'axe suivent le même pas.

Alternative acceptable si elle rend mieux : conserver tous les points mais n'afficher les marqueurs que sur le pas de 5 ans, la courbe restant continue. Choisir la plus lisible et le dire dans le commit.

## 4. Population, lecture Âge : retirer la courbe de référence

**Constat.** Sur la pyramide des âges, la ligne grise superposée (silhouette de l'année de référence) est illisible : elle zigzague en travers des barres, se confond avec les axes, et n'aide pas à lire le vieillissement.

**Travail.** La retirer. L'idée était bonne, l'exécution ne fonctionne pas : une polyligne qui traverse deux séries opposées n'est pas lisible. La pyramide reste seule, sans superposition. Si une comparaison temporelle est souhaitée plus tard, elle passera par un autre moyen — ce n'est pas l'objet de cette version.

Conserver le reste : barres opposées hommes/femmes, axe des âges au centre, infobulle par tranche, transition au changement d'année ou de région.

## 5. Le choix de palette devient un bouton discret

**Constat.** Le couple de boutons « Rouge | Bleu » est aussi visible que les choix de forme, alors que c'est un réglage d'apparence secondaire.

**Travail.** Le remplacer par un seul bouton compact placé en fin de rangée des formes : une pastille ronde de la couleur active, sans libellé, avec l'infobulle « Changer la palette ». Un clic bascule vers l'autre palette. La transition de la pastille et des couleurs du graphique est douce (transition de couleur d'environ 200 ms, jetons `--ease` existants), sans remontage de l'instance ECharts.

Rester sobre : pas d'animation de bande défilante, pas de menu. Un bouton, un clic, une bascule. Le réglage continue de vivre dans l'URL et d'être reflété dans l'export PNG.

## 6. Bug — le survol garde l'ancienne couleur

**Constat.** Après un changement de palette, survoler une barre ou un point réaffiche la couleur de l'ancienne palette (surbrillance, infobulle, ou les deux).

**Cause probable, à vérifier avant de corriger.** Les couleurs d'`emphasis` (et/ou les pastilles d'infobulle) sont figées à la construction de l'option, ou lues une seule fois au montage, alors que le reste de la série est mis à jour. Chercher :

- des couleurs d'`emphasis.itemStyle` calculées lors du premier rendu et non recalculées ;
- un `useChartTokens` dont le résultat est mémorisé sur une dépendance qui n'inclut pas la palette ;
- une option passée en `setOption` sans `notMerge`, laissant survivre les anciennes valeurs d'`emphasis` ;
- un formateur d'infobulle qui capture la palette en fermeture.

**Correction attendue** : toutes les couleurs — série, `emphasis`, pastille d'infobulle, surbrillance de ligne ou de bande, légende HTML — dérivent de la même source au même moment. Ajouter un test manuel à la recette : changer de palette puis survoler chaque forme de chaque base, en thème clair et sombre.

## Recette

1. Sur les cinq bases : tiroir latéral, graphique visible pendant l'édition, un seul défilement, croix de suppression évidente sur chaque série, aucun `<select>` natif, `Échap` ferme et rend le focus.
2. Mortalité : trois filtres alignés sur une rangée, sélecteur de cause unique avec recherche intégrée.
3. Population · Évolution : un point tous les 5 ans par défaut, lisible.
4. Population · Âge : pyramide seule, sans courbe de référence.
5. Palette : un bouton pastille discret, bascule douce, réglage dans l'URL et dans le PNG.
6. Après changement de palette, aucun survol ne montre l'ancienne couleur, sur aucune forme, dans aucun thème.
7. Aux largeurs 1400 / 1240 / 860 / 720 / 620 px, dans les deux thèmes : aucun texte coupé, aucun chevauchement, aucun débordement.
8. `npm run build` vert · `python -m pytest` vert.

## Méthode

Plan bref avant de coder. Un commit par point, message en français. 3 à 5 lignes ajoutées à `docs/PROGRESS.md` en fin de mission. Captures aux cinq largeurs, dans les deux thèmes, avant de déclarer un point terminé. En cas d'ambiguïté : choisir l'option la plus simple et la signaler dans le commit.
