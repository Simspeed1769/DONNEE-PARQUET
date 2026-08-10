# MISSION V3 — DAMIR Studio · uniformité, liberté de comparaison, lisibilité des axes

> **Mode d'emploi (humain).** Placer ce fichier à la racine, à côté de `CLAUDE.md`. Lancer les phases **une par une** :
> « Lis MISSION_V3.md et CLAUDE.md en entier. Exécute la Phase 1 uniquement. Plan bref avant de coder, commit à la fin, puis arrête-toi. »

La v2 est livrée : ECharts partout, DAMIR en deux sections (Panorama + Comparer), Croisements avec un mode Guidé, exports PNG 16:9 généralisés. Cette v3 corrige six points relevés à l'usage. Les principes de `CLAUDE.md` restent la loi (aucune nouvelle dépendance, jetons `theme.css` seuls, ratio sans dénominateur = `None`, formes non licites absentes plutôt que grisées, langage écologique dans Croisements).

**Référence de qualité pour tout ce document : la section Comparer de DAMIR.** Ses transitions et son ergonomie sont le standard à atteindre partout ailleurs. Quand une spécification ci-dessous est ambiguë, la réponse est « fais comme Comparer ».

---

## Phase 1 — Transitions homogènes dans Panorama

**Constat.** Les changements de forme dans Comparer sont fluides (morphing d'une forme à l'autre) ; dans Panorama ils ne le sont pas de la même façon.

**Travail.**
1. Comparer les deux chemins de rendu : `damir/CompareSection.tsx` + son builder d'options, contre `damir/PanoramaSection.tsx` + `panorama/charts.ts`. Identifier précisément ce qui diffère : application de `withMorphing()`, présence et stabilité des `seriesKey`, options `notMerge` / `lazyUpdate`, remontage éventuel du composant, identité des `id` de séries entre deux formes.
2. Aligner Panorama sur le comportement de Comparer pour les quatre lectures (Évolution, Territoire, Âge, Sexe) et toutes leurs formes.
3. Cas particuliers à traiter explicitement : les séries `map` et `custom` ne participent pas au morphing (comportement attendu) — la transition vers/depuis la carte doit rester propre (fondu court) plutôt que saccadée.
4. Vérifier qu'aucune `key` React sur le conteneur de graphique ne détruit l'instance (piège déjà rencontré : instance détruite = transition impossible).

**Acceptation.** Sur Panorama, passer Courbe → Barres → Aires → Base 100 donne exactement la même sensation que dans Comparer : morphing continu, aucun saut de mise en page, `prefers-reduced-motion` respecté. **Commit.**

## Phase 2 — Comparer : comparer n'importe quoi, et le dire en haut

**Constat.** Aujourd'hui le bloc « ce que je compare » se limite en pratique aux prestations et se trouve sous le graphique. Or l'utilisateur veut pouvoir comparer, par exemple, **les hommes de 60 ans aux femmes de 20 ans** — donc des séries qui diffèrent sur n'importe quel filtre, pas seulement sur la prestation.

**2.1 — Déplacer le bloc de comparaison au-dessus du graphique.**
Le bloc « Ce que je compare » devient la première chose sous le titre, avant la zone graphique. Il est compact et repliable, et son ouverture ne pousse jamais le graphique vers le bas (règle DESIGN.md : popovers en position absolue). Le choix de forme et la bande de KPI restent où ils sont.

**2.2 — Chaque série accède à tous les filtres.**
Chaque série de la comparaison expose l'`AdvancedFilterPanel` complet : prestations (cascade grand poste → poste → sous-poste → prestation), région, tranche d'âge, sexe, et toute autre dimension du cube. Comportements exigés :
- Nom de série éditable ; à défaut, nom généré automatiquement à partir de ce qui **distingue** cette série des autres (ex. « Hommes · 60-69 ans », « Femmes · 20-29 ans ») — pas la liste complète des filtres.
- Sous le nom, en gris, le résumé des filtres appliqués (comportement existant à conserver).
- Une nouvelle série part du périmètre de la précédente (comportement existant).
- Maximum 8 séries, période commune (l'axe du temps reste partagé).
- Dès que deux séries ne décrivent pas la même population, l'avertissement existant s'affiche (« les courbes ne décrivent pas la même population et ne s'additionnent pas ») et les formes cumulatives (Aires empilées, Camembert) deviennent indisponibles — retirées, pas grisées.

**2.3 — Conserver le mode rapide.**
Le mode « comparer selon une dimension » (les modalités deviennent les séries, via `SeriesPicker`) reste le point d'entrée par défaut : il couvre 80 % des usages en un clic. Le mode « séries sur mesure » du 2.2 est l'extension, accessible depuis le même bloc, sans changer d'écran.

**Acceptation.** Le scénario « comparer les hommes de 60-69 ans aux femmes de 20-29 ans sur les indemnités journalières » se construit entièrement depuis le bloc en haut du graphique, produit deux courbes nommées lisiblement, et affiche l'avertissement de population. **Commit.**

## Phase 3 — Pathologies, CSP, Mortalité : un seul graphique piloté

**Constat.** Ces trois pages empilent encore plusieurs graphiques distincts. DAMIR fonctionne autrement, et mieux : **un seul graphique**, dont on change la lecture et la forme.

**Travail.** Refondre les trois pages sur le gabarit de DAMIR : un graphique unique, une barre de lectures, une barre de formes, la bande de KPI, les blocs repliés « Valeurs » et « Ce que ce graphique ne montre pas », le pied d'export. Les transitions sont celles de Comparer (Phase 1).

Chaque base déclare dans son modèle (`pathologies/model.ts`, `csp/model.ts`, `mortality/model.ts`) ses lectures et, pour chacune, les formes licites :

| Base | Mesures | Lectures | Notes |
|---|---|---|---|
| Pathologies | prévalence (%), patients (effectif) | Évolution · Territoire · Âge · Sexe · Pathologies (comparaison de plusieurs pathologies) | prévalence jamais empilée ni en camembert ; masquage Cnam (< 10) affiché, jamais comblé ; courbe France en pointillé quand une région est choisie |
| CSP | part (%), effectif | Évolution · Territoire · Âge · Sexe · Composition (CSP comparées entre elles) | carte cliquable conservée ; part non additive entre régions |
| Mortalité | décès (effectif), part (%) | Évolution · Âge · Sexe · Causes | **pas de lecture Territoire** : source nationale — le modèle l'énonce dans les réserves au lieu de la simuler ; pas de taux par habitant |

Aucune capacité existante ne disparaît : tout ce qui était visible sur les anciens graphiques doit être atteignable comme lecture ou comme forme.

**Acceptation.** Passer de DAMIR à Pathologies, CSP ou Mortalité ne change pas les gestes : mêmes emplacements, mêmes libellés, mêmes transitions. Chaque base garde ses réserves propres. **Commit.**

## Phase 4 — Croisements : ne garder que le mode Guidé

**Travail.** L'écran Croisements n'expose plus qu'un seul parcours, le mode Guidé. Les onglets « Lien » et « Modèle » disparaissent de l'interface.

**Ne pas supprimer le code.** `RegressionPanel.tsx` et les endpoints de corrélation restent en place, simplement non routés — ils seront réexposés plus tard. Retirer les onglets, pas les modules. Documenter ce choix en une ligne dans `docs/PROGRESS.md`.

Le mode Guidé occupe alors tout l'écran : question Y, variables X, contrôles (« à âge et sexe comparables » coché d'office), phrases au gabarit écologique, graphique des effets avec IC à 95 %, nuage interactif cliquable.

**Acceptation.** Croisements s'ouvre directement sur le parcours guidé, sans onglet. Aucune régression du moteur statistique. **Commit.**

## Phase 5 — Axes lisibles : dire de quoi on parle et par rapport à quoi

**Constat.** L'axe des ordonnées est correctement titré ; l'axe des abscisses ne l'est pas, et certaines mesures rapportées à une population ne disent pas **à quelle population** elles se rapportent. C'est le point le plus important de cette v3 : un graphique dont on ne sait pas ce que compte l'axe n'est pas exploitable.

**5.1 — Titrer l'axe des abscisses partout.**
Chaque graphique de chaque base porte un titre d'axe X explicite, dérivé de la dimension affichée : « Année », « Région », « Tranche d'âge », « Sexe », « Prestation », « Pathologie », « Groupe socioprofessionnel », « Cause de décès ». Quand l'axe porte les séries elles-mêmes, le titre est « Séries comparées ». Le titre suit la même typographie et les mêmes jetons que celui de l'axe Y, et il est repris dans l'export PNG.

**5.2 — Expliciter le dénominateur de toute mesure rapportée à une population.**
Pour chaque mesure « par habitant » ou en pourcentage, le libellé doit nommer la population de référence, sans ambiguïté possible. Deux niveaux :
- **Dans le titre d'axe et dans la légende** : le libellé court, ex. « Dépense par habitant (population couverte, tous âges) » — pas « par habitant » seul.
- **Dans le bloc replié « Ce que ce graphique ne montre pas »** : une phrase qui dit d'où vient ce dénominateur et sur quelle maille il est calculé.

**Travail préalable indispensable.** Établir la vérité du code avant d'écrire les libellés : inspecter `analysis.py` (METRICS), `explore.py` (FORMULAS) et `correlations.py` pour déterminer, mesure par mesure, quel dénominateur est réellement utilisé — en particulier la population de référence tirée de `npop` de la Cartographie des pathologies avec `MAX(npop)` par cellule âge × sexe. **Ne rien inventer** : si le dénominateur d'une mesure est incertain à la lecture du code, le signaler à l'utilisateur au lieu de rédiger un libellé approximatif.

Produire ensuite un tableau récapitulatif dans `app/backend/app/methodology` (ou l'équivalent alimentant l'écran « Données & méthode ») : pour chaque mesure — numérateur, dénominateur, source du dénominateur, maille, réserve. L'écran Méthodologie affiche ce tableau, et chaque graphique y renvoie.

**Acceptation.** Sur n'importe quel graphique de n'importe quelle base, les deux axes sont titrés, et aucune mesure rapportée à une population ne laisse le lecteur se demander « par rapport à quelle population ». Le tableau numérateur/dénominateur est visible dans Méthodologie. **Commit.**

## Phase 6 — Quelques formes de plus, choisies

**Constat.** Le catalogue de formes est un peu court. L'ajout doit rester **sobre** : chaque forme nouvelle répond à une question qu'aucune forme existante ne traite. Pas de galerie.

**Formes à ajouter, sous condition de licéité déclarée par le modèle :**
1. **Aires empilées à 100 %** — « comment se répartit le total, et cette répartition se déforme-t-elle ? ». Réservée aux mesures additives, séries de même population.
2. **Barres divergentes** (variation vs période précédente, positif/négatif de part et d'autre de zéro) — « qui progresse, qui recule ? ». Utiliser la rampe divergente existante `--diverge-1..7`.
3. **Heatmap année × modalité** — « où et quand ça bouge ? ». Le module `Heatmap` est déjà enregistré dans `EChart.tsx`. Réservée aux cas avec assez de modalités (≥ 4) et plus d'une année.
4. **Pyramide des âges** (barres horizontales opposées hommes/femmes) — uniquement sur les lectures Âge quand le sexe est disponible et non filtré. C'est la forme naturelle du profil âge × sexe, et elle parle immédiatement.

Règles : chaque forme est déclarée dans le modèle de chaque base (une forme qui mentirait n'est pas offerte), chaque forme affiche la question à laquelle elle répond, chaque forme participe au morphing quand c'est possible, chaque forme est exportable en PNG 16:9 fond clair. Enregistrer dans `EChart.tsx` tout module ECharts nouvellement nécessaire — un module non enregistré échoue en silence.

**Acceptation.** Les quatre formes fonctionnent là où elles sont licites et sont absentes ailleurs. Aucune régression sur les formes existantes. **Commit + tag `v3`.**

---

## Interdits (rappel)

Aucune nouvelle dépendance · aucune couleur en dur · aucun `None` remplacé par 0 · aucune forme non licite offerte · aucune formulation individuelle dans Croisements · rien ajouté à `styles.css` · aucune capacité supprimée sans équivalent · pas deux phases enchaînées sans validation.

## Méthode

Une phase à la fois. Plan bref avant de coder. `npm run build` et `python -m pytest` verts avant chaque commit. Message de commit en français. 3 à 5 lignes ajoutées à `docs/PROGRESS.md` à la fin de chaque phase (fait / écarté / décisions). Captures d'écran en thème clair **et** sombre pour critiquer le rendu quand l'environnement le permet.

## Recette finale

1. Panorama : Courbe → Barres → Aires → Base 100, transitions identiques à Comparer.
2. Comparer : bloc de comparaison en haut, construction de « hommes 60-69 » vs « femmes 20-29 », avertissement de population, formes cumulatives retirées.
3. Pathologies / CSP / Mortalité : un seul graphique piloté, gestes identiques à DAMIR, réserves propres à chaque base.
4. Croisements : mode Guidé seul, plein écran, moteur intact.
5. Les deux axes titrés sur tous les graphiques ; aucune mesure « par habitant » sans population de référence nommée ; tableau numérateur/dénominateur visible dans Méthodologie.
6. Les quatre nouvelles formes présentes là où elles sont licites, absentes ailleurs, exportables.
7. `python -m pytest` vert · `npm run build` vert.
