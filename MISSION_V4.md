# MISSION V4 — DAMIR Studio · un seul gabarit pour les quatre bases

> **Mode d'emploi (humain).** Placer ce fichier à la racine, à côté de `CLAUDE.md`. Lancer les phases **une par une** :
> « Lis MISSION_V4.md et CLAUDE.md en entier. Exécute la Phase 1 uniquement. Plan bref avant de coder, commit à la fin, puis arrête-toi. »

**Principe directeur de cette version : DAMIR est le gabarit, les trois autres bases s'y conforment.** Chaque fois qu'une spécification ci-dessous laisse un doute, la réponse est « fais exactement comme DAMIR ». L'objectif est qu'un utilisateur qui passe d'une base à l'autre ne change jamais de gestes.

Les principes de `CLAUDE.md` restent la loi : aucune nouvelle dépendance, couleurs issues des jetons `theme.css` uniquement, ratio sans dénominateur = `None`, forme non licite absente plutôt que grisée, rien ajouté à `styles.css`, langage écologique dans Croisements.

---

## Phase 1 — Correctifs de mise en page (Pathologies en premier)

### 1.A — Un seul format de KPI : celui de DAMIR

**Décision arrêtée, ne pas rediscuter.** Deux formats coexistent aujourd'hui :
- **DAMIR** : une ligne, valeur en gras + libellé discret, partagée avec les choix de forme (`.damir-highlights`). Compacte, le graphique respire.
- **Pathologies / CSP** : quatre cartes encadrées, hautes, qui occupent une bande entière et repoussent le graphique hors de l'écran.

**Le format DAMIR est retenu pour les quatre bases.** Les cartes encadrées disparaissent. Chaque base conserve ses repères mais les rend sur une ligne unique, au format DAMIR :
- Pathologies : patients (dernière année) · prévalence · évolution depuis la première année de la période.
- CSP : effectif · part · évolution.
- Mortalité : décès · part · évolution.

Le quatrième repère de Pathologies (ratio femmes / hommes) est conservé **uniquement s'il tient sur la ligne** sans la faire déborder ; sinon il descend dans le bloc replié « Valeurs ». Reformuler au passage : « 0,8 femme touchée pour 1 homme » est une tournure bancale — préférer « 0,8 femme pour 1 homme ».

### 1.B — La troncature du titre d'axe

**Constat précis (capture 4).** Sur Pathologies, le titre de l'axe Y — « % de la population de référence Cnam » — est **coupé horizontalement en haut** : la moitié supérieure des lettres est rognée. Ce n'est pas un problème de largeur mais de **hauteur disponible au-dessus de la zone de tracé**.

Causes à vérifier dans cet ordre : `grid.top` insuffisant dans les options ECharts de la page (le nom d'axe est rendu au-dessus du tracé et a besoin de sa place) ; `overflow: hidden` sur un conteneur parent qui rogne le canvas ; hauteur de conteneur fixe qui ne tient pas compte du nom d'axe. **Corriger à la source, pas en réduisant la taille du texte.**

Vérifier ensuite le même défaut sur les autres lectures et les autres bases, et sur les titres d'axe X ajoutés précédemment.

### 1.C — Espacement et responsive

1. Reproduire aux largeurs 1400, 1240, 860, 720 et 620 px, en thème clair et sombre, avec captures à l'appui.
2. Reprendre les valeurs d'espacement de DAMIR **telles quelles** (c'est la référence, pas une inspiration) : écart entre la bande de KPI et le haut de la zone graphique, marges du panneau, hauteur minimale de la zone de tracé.
3. Le tracé doit se redimensionner, jamais déborder : contrôler le `grid` ECharts et le `resize` au changement de largeur.
4. Appliquer les mêmes contrôles à CSP et Mortalité.

**Acceptation.** Un seul format de KPI sur les quatre bases · titre d'axe Y intégralement lisible partout · aux cinq largeurs et dans les deux thèmes, aucun chevauchement, aucun tracé ni libellé coupé, aucun saut de mise en page au changement de lecture. **Commit.**

## Phase 1 bis — Correctifs de libellés chiffrés

Défauts relevés sur captures, à corriger dans les formateurs partagés (`utils.ts`), pas au cas par cas :

1. **`1,25 Bn €` (capture 1)** — le cumul 2015-2024 s'affiche avec une unité incohérente : la valeur annuelle est en `Md €` (milliards) et le cumul en `Bn €`. `Bn` est l'abréviation anglaise de *billion* (= milliard), ce qui rend le chiffre faux d'un facteur 1 000 pour un lecteur français, alors que 1,25 **billion** d'euros est la valeur juste. **Supprimer `Bn` du formateur.** Au-delà du millier de milliards, écrire `1 250 Md €` — une seule unité, celle que le métier utilise. Vérifier qu'aucune autre abréviation anglaise ne subsiste dans les formateurs.
2. **`+6,6 %` pour la prévalence (capture 2)** — une prévalence est un **niveau**, pas une variation : le signe `+` est trompeur. Afficher `6,6 %`. Le `+` est réservé aux variations.
3. **`+1.03 point(s)` (capture 2)** — point décimal anglais au lieu de la virgule française, et `point(s)` avec parenthèses. Écrire `+1,03 point`, avec accord au pluriel géré par le formateur.
4. Passer en revue l'ensemble des libellés chiffrés des quatre bases et corriger les mêmes classes de défauts (séparateur décimal, séparateur de milliers en espace insécable, signe, unité).

**Acceptation.** Aucune abréviation anglaise, aucun point décimal, aucun `+` sur un niveau, dans aucune des quatre bases. **Commit.**

## Phase 2 — Le sélecteur de palette descend au niveau du graphique

**Constat.** Le choix de palette (rouge / bleu) se trouve trop haut dans la page. Il appartient au graphique, pas à l'en-tête.

**Travail.**
1. **Localiser le contrôle dans le code avant toute modification** — il s'agit du sélecteur qui bascule la palette de séries entre la dominante rouge (`--accent`, `--series-*`) et la dominante bleue (rampe `--ramp-*`). Ne pas le confondre avec le bascule de thème clair/sombre (`ThemeToggle`), qui reste où il est. Si l'identification est ambiguë à la lecture du code, s'arrêter et demander confirmation à l'utilisateur.
2. Le déplacer dans la barre de contrôles du graphique, **à côté des choix de forme** (Courbes, Barres, Classement…), sur la même ligne que la bande de KPI, en fin de rangée. Même traitement visuel que les autres contrôles segmentés (`.pathology-toggle`), pas un bouton d'un genre nouveau.
3. Le rendre présent et identique sur les quatre bases.
4. Le changement de palette est instantané, sans requête, sans remontage de l'instance ECharts (donc sans perte de transition), et il est reflété dans l'export PNG.
5. L'état de la palette vit dans l'URL comme le reste, pour que « Copier le lien » le restitue.

**Acceptation.** Sur les quatre bases, le choix rouge/bleu se trouve au niveau du graphique à côté des formes, s'applique instantanément et se retrouve dans le PNG exporté et dans le lien copié. **Commit.**

## Phase 3 — Pathologies : structure Panorama + Comparer

**Constat.** La lecture « Pathologies » (comparaison) est visuellement bancale et mal intégrée. La cause est structurelle : Pathologies mélange l'exploration d'une pathologie et la comparaison de plusieurs pathologies dans un seul écran.

**Défauts précis relevés sur capture (à corriger, pas à contourner) :**
- Le sélecteur de comparaison est **inséré entre le titre et le graphique**, avec un libellé « 1 pathologie comparée » collé à gauche dans le vide : il ne ressemble à aucun autre contrôle de l'application.
- Deux champs empilés font le même travail — un champ de recherche « Ajouter une pathologie… » **et** une liste déroulante native (`<select>`) qui affiche un libellé très long. La liste native n'a rien à faire là : elle ignore les jetons de thème et casse l'homogénéité. **Un seul sélecteur, du type `SeriesPicker`.**
- La puce « Diabète ✕ » **flotte par-dessus** le champ au lieu de s'aligner dans une rangée de puces sous le sélecteur.
- Le titre « Prévalence · 1 pathologie comparée » compte une comparaison à un seul élément, ce qui n'a pas de sens : avec une seule pathologie sélectionnée, la section Comparer affiche un état d'invite (« Ajoutez une pathologie pour comparer »), pas un graphique intitulé comme une comparaison.
- La mention « 118 pathologies disponibles » est une information de débogage : la déplacer dans le sélecteur lui-même, pas sous le champ.

**Travail.** Adopter exactement la structure de DAMIR : une coquille de page qui porte l'état partagé (filtres de population, mesure) et deux sections en onglets.

**Section Panorama** — une pathologie à la fois, choisie dans la hiérarchie Famille → Catégorie → Détail.
- Lectures : Évolution · Territoire · Âge · Sexe.
- Mesures : prévalence (%) · patients (effectif).
- Bande de KPI au format DAMIR.
- Réserves propres conservées : masquage Cnam (< 10) affiché et jamais comblé ; courbe France en pointillé quand une région est sélectionnée ; une prévalence absente reste absente.

**Section Comparer** — plusieurs pathologies mises en regard, sur le modèle de `damir/CompareSection.tsx`.
- Sélection de pathologies via un sélecteur du même type que `SeriesPicker` (recherche, classement par poids, maximum 8).
- Périmètre de population commun par défaut ; possibilité de séries sur mesure avec leur propre périmètre, comme dans DAMIR, avec le même avertissement quand les populations diffèrent.
- Vues nommées par la question à laquelle elles répondent, filtrées par le modèle : la **prévalence n'est jamais empilée ni en camembert** (mesure non additive) ; l'effectif de patients l'autorise.

Le clic sur une pathologie depuis Panorama ne produit plus un affichage parasite : il change le sujet de la lecture en cours, avec transition.

**Acceptation.** Pathologies se manipule exactement comme DAMIR ; comparer trois pathologies entre elles se fait dans la section Comparer, avec les mêmes gestes que comparer trois prestations. **Commit.**

## Phase 4 — CSP : Composition devient Comparer

**Travail.** Même structure à deux sections.

**Panorama** — un groupe ou une catégorie socioprofessionnelle à la fois. Lectures : Évolution · Territoire (carte cliquable conservée) · Âge · Sexe. Mesures : part (%) · effectif.

**Comparer** — remplace l'actuelle lecture « Composition ». On y met en regard plusieurs CSP (jusqu'à 8), aux deux niveaux de nomenclature (6 groupes ou 29 catégories), avec le même sélecteur et les mêmes vues que DAMIR. La composition d'un territoire reste atteignable ici sous forme de vue (parts empilées à 100 % sur les effectifs), au lieu d'être une lecture à part.

Réserve à conserver et à afficher : une **part n'est pas additive entre régions**, donc les formes cumulatives ne sont pas offertes sur la mesure « part ».

**Acceptation.** Plus de lecture « Composition » isolée ; CSP se manipule comme DAMIR et Pathologies. **Commit.**

## Phase 5 — Mortalité : Comparer les causes

**Travail.** Même structure à deux sections, avec une différence assumée.

**Panorama** — une cause à la fois (sélecteur hiérarchique `SearchableCauseSelect` conservé). Lectures : Évolution · Âge · Sexe. Mesures : décès (effectif) · part (%).

**⚠️ Pas de lecture Territoire sur Mortalité.** La source CépiDc est nationale : il n'existe pas de découpage régional, ni de taux par habitant. Le modèle ne propose donc pas cette lecture, et le bloc « Ce que ce graphique ne montre pas » en donne la raison. **Ne pas simuler une régionalisation.** C'est la seule dérogation autorisée à l'uniformité des quatre bases.

**Comparer** — mise en regard de plusieurs causes de décès (jusqu'à 8), avec le sélecteur hiérarchique et les vues du gabarit DAMIR. Les décès étant additifs, les formes cumulatives (empilé, camembert, aires à 100 %) sont licites ici — c'est la base où elles ont le plus de sens.

**Acceptation.** Mortalité se manipule comme les trois autres bases, à l'exception documentée de la lecture Territoire. **Commit.**

## Phase 6 — Transitions homogènes sur les quatre bases

**Constat.** Les transitions entre lectures et entre formes sont fluides sur DAMIR (Comparer en particulier) et absentes ou saccadées sur Pathologies, CSP et Mortalité.

**Travail.**
1. Comparer les chemins de rendu de DAMIR et des trois autres bases, et identifier ce qui diffère : application de `withMorphing()`, stabilité et unicité des `seriesKey`, options `notMerge` / `lazyUpdate`, `key` React sur le conteneur (piège connu : une `key` détruit l'instance et rend toute transition impossible), identité des `id` de séries d'une forme à l'autre.
2. Aligner les trois bases sur le comportement de DAMIR, pour les changements de **forme** comme pour les changements de **lecture**.
3. Séries `map` et `custom` : elles ne participent pas au morphing (comportement attendu d'ECharts) ; la transition vers et depuis la carte doit être un fondu court et propre, pas un à-coup.
4. Conserver l'état `stale` (opacité réduite, jamais de squelette) et `prefers-reduced-motion`.
5. Enregistrer dans `EChart.tsx` tout module ECharts nouvellement nécessaire — un module non enregistré échoue **en silence** (piège déjà rencontré sur PieChart et LabelLayout).

**Acceptation.** Sur les quatre bases, enchaîner Évolution → Territoire → Âge → Sexe et Courbes → Barres → Classement donne la même sensation que sur DAMIR. **Commit + tag `v4`.**

---

## Interdits (rappel)

Aucune nouvelle dépendance · aucune couleur en dur · aucun `None` remplacé par 0 · aucune forme non licite offerte · rien ajouté à `styles.css` (tout nouveau style dans un fichier dédié adossé aux jetons) · aucune capacité supprimée sans équivalent · pas deux phases enchaînées sans validation de l'utilisateur.

## Méthode

Une phase à la fois. Plan bref avant de coder. `npm run build` et `python -m pytest` verts avant chaque commit. Message de commit en français. 3 à 5 lignes ajoutées à `docs/PROGRESS.md` à la fin de chaque phase (fait / écarté / décisions). Captures d'écran en thème clair **et** sombre, aux largeurs 1400 / 1240 / 860 / 720 / 620 px, pour critiquer le rendu avant de conclure une phase.

## Recette finale

1. Un seul format de KPI (celui de DAMIR) sur les quatre bases ; aux cinq largeurs et dans les deux thèmes, aucun chevauchement KPI/graphique, aucun tracé ni titre d'axe coupé.
1 bis. Aucune abréviation anglaise (`Bn`), aucun point décimal, aucun `+` devant un niveau.
2. Le choix rouge/bleu se trouve à côté des choix de forme, sur les quatre bases ; il est instantané, exporté dans le PNG, restitué par le lien copié.
3. Pathologies : Panorama (une pathologie) + Comparer (jusqu'à 8), prévalence jamais empilée, masquage Cnam visible.
4. CSP : Panorama + Comparer, carte cliquable conservée, part non additive entre régions respectée.
5. Mortalité : Panorama + Comparer les causes, aucune lecture Territoire, raison affichée dans les réserves.
6. Sur les quatre bases, les transitions de lecture et de forme sont celles de DAMIR.
7. `python -m pytest` vert · `npm run build` vert.
