# ÉTAT DES LIEUX — DAMIR Studio

> Document produit par inspection du code au 9 août 2026. Tout ce qui suit est vérifié dans les fichiers du projet, pas déduit d'une conversation.

---

## 1. Vue d'ensemble

### Objectif
Application web **locale** d'analyse des dépenses d'Assurance Maladie. Elle s'exécute entièrement sur le poste : pas de serveur distant, pas de compte, pas d'hébergement. Aucune donnée ne quitte la machine.

Positionnement (`PRODUCT.md`) : explorer ~1 milliard de lignes Open DAMIR sans infrastructure serveur, en conservant la granularité prestation × population × territoire, grâce à DuckDB qui interroge directement les fichiers Parquet.

**Deux publics** assumés : des managers non-spécialistes qui reprennent les graphiques dans une présentation, et un public actuariel qui juge l'outil sur sa rigueur.

### Lancement
- `preparer.bat` — crée le venv Python, installe les deps, construit le frontend, génère le cube compact
- `DAMIR.bat` — lance uvicorn ; l'app s'ouvre sur `http://127.0.0.1:8000`
- Le backend FastAPI sert **à la fois** l'API et le frontend construit (`StaticFiles` monté sur `/`)

### Navigation
Barre latérale fixe, quatre groupes :

| Groupe | Entrées |
|---|---|
| **EXPLORER** | DAMIR · Pathologies · CSP · Mortalité |
| **CROISER** | Croisements · Repères (pastille « 4 ») |
| **EXTRAIRE** | Extraire |
| **RÉFÉRENTIEL** | Données & méthode |

Routage **maison**, sans react-router : `App.tsx` lit `?page=` dans l'URL, gère `popstate`, et utilise `history.pushState`. Chaque page est chargée en `lazy()` avec un `PageErrorBoundary` et une reprise automatique en cas de chunk périmé. Les anciennes adresses (`page=panorama`, `page=explore`, `page=analysis`) redirigent vers `damir`.

**L'état de chaque écran vit dans l'URL** (filtres, section, mesure, formes, séries) via `history.replaceState`.

### Ce qui est réellement fonctionnel
Toutes les pages listées fonctionnent et affichent des données réelles. Testé en cours de session : DAMIR (3 sections), Croisements (2 modes), Pathologies, CSP, Mortalité.

### Ce qui est incomplet / expérimental
- **Aucun export image sur 5 des 7 écrans de données** (détaillé §12)
- `/api/analysis` : endpoint vivant côté backend, **jamais appelé** par le frontend
- `copyCurrentUrl()` existe dans `utils.ts` et n'est appelé nulle part — la promesse « l'état vit dans l'URL » n'a aucun bouton
- Code orphelin issu de la dernière restructuration (détaillé §14)
- `app/LISEZMOI.md` décrit **l'ancienne** structure de DAMIR (« classement des grands postes… Panorama / Analyser ») — documentation périmée

---

## 2. Les grands compartiments

### 2.1 DAMIR (`pages/DamirPage.tsx` → 3 sections)
Écran principal. Détaillé au §3.

### 2.2 Croisements (`pages/CorrelationsPage.tsx`, 691 l.)
**Objectif** : relier deux indicateurs venus de sources différentes, puis modéliser.

Deux modes en onglets (`Lien` / `Modèle`) :

**Mode « Lien »** — corrélation
- Données : les 4 sources, appariées sur une unité d'observation commune
- Unités : Région × âge × sexe (192 cellules) · Région × année · Région (12) · Année (national)
- Filtres : période, sexe (tous/hommes/femmes), tranche d'âge, retrait de tendance (`detrend`, unité région×année seulement)
- Indicateurs : 9 au catalogue (`METRICS` dans `correlations.py`) — dépense/habitant, taux de prise en charge, remboursement moyen, dépense totale, prévalence, patients, part CSP, décès, taux de décès
- Sortie : nuage de points ECharts + verdict en français + `StrengthScale` (intervalle de confiance dessiné à sa vraie largeur sur un axe −1→+1) + détail statistique replié + avertissements typés (`critical`/`warning`/`info`)
- Export : PNG composé

**Mode « Modèle »** — GLM (`correlations/RegressionPanel.tsx`, 602 l.)
- Réponse : 4 mesures DAMIR (`RESPONSE_METRICS`)
- Variables : jusqu'à 4 prédicteurs numériques + facteurs catégoriels (âge, sexe, région) via les puces « Tenir constant »
- Sortie : tableau de coefficients **manipulable** (glisser pour réordonner, décocher pour réajuster sans la variable, trier par colonne), graphique des effets avec intervalles à 95 %, phrases en français, part expliquée
- Export : aucun

### 2.3 Pathologies (`pages/PathologyPage.tsx`, 278 l.)
- Données : Cartographie des pathologies Cnam (`data/pathologies/effectifs.parquet`, 49 Mo)
- Hiérarchie à 3 niveaux : Famille → Catégorie → Détail, + Année
- Filtres population : région, âge, sexe
- Mesures : prévalence (%) et patients (effectif)
- Graphiques Plotly : trajectoire nationale (+ courbe France en pointillé si une région est choisie), profil âge×sexe en barres groupées, classement territorial horizontal avec ligne de référence France
- Interactions : bascule Prévalence/Patients, bascule Profil/Territoires, retrait de territoires (`MultiSelect`), affichage du masquage Cnam (effectifs < 10 non publiés)
- **Logique métier notable** : une prévalence absente reste absente, jamais remplacée par 0
- Export : lien vers l'écran Extraire. **Aucun export image**

### 2.4 CSP (`pages/CspPage.tsx`, 332 l.)
- Données : Recensement Insee (`data/csp/csp_core.parquet` + 9 fichiers annuels 2015–2023)
- Niveaux : 6 groupes ou 29 catégories
- Filtres : millésime, CSP, région, âge, sexe
- Mesures : part (%) ou effectif
- Graphiques Plotly : **carte choroplèthe cliquable** (`GeoPlot`, GeoJSON servi par `/api/csp/regions.geojson`), évolution, profil âge×sexe, composition
- Export : aucun

### 2.5 Mortalité (`pages/MortalityPage.tsx`, 221 l.)
- Données : CépiDc (`data/mortalite/mortalite_core.parquet`, 5 160 lignes seulement)
- Filtres : cause (recherche hiérarchique via `SearchableCauseSelect`), population, millésime
- Mesures : décès (effectif) ou part (%)
- Graphiques Plotly : évolution, top causes, profil sexe, profil âge
- **Contrainte structurante assumée** : source nationale — ni carte régionale, ni taux par habitant
- Export : lien vers Extraire. **Aucun export image**

### 2.6 Repères (`pages/BenchmarksPage.tsx`, 1 170 l. — le plus gros fichier front)
- Espace statistique commun aux 4 sources : on choisit une source, un calcul, et l'écran n'offre que les calculs défendables sur cette source
- Utilise `/api/workbench` (→ `studio.py`, 1 064 l.) pour DAMIR, et les endpoints overview pour les trois autres
- Export : CSV client

### 2.7 Extraire (`pages/ExtractionPage.tsx`, 458 l.)
- 4 sources au choix (DAMIR / Pathologies / CSP / Mortalité)
- Choix des dimensions et mesures, aperçu paginé
- Export **CSV et Excel** (Excel auto-documenté avec feuille de métadonnées)
- **Limite explicite à 250 000 lignes** — les boutons se désactivent au-delà plutôt que de tronquer silencieusement

### 2.8 Données & méthode (`pages/MethodologyPage.tsx`, 158 l.)
Dictionnaire des 12 indicateurs DAMIR (définition, formule, réserve), catalogue des 4 sources avec limites de lecture, cadence de liquidation.

---

## 3. État précis de DAMIR

### Structure actuelle
`pages/DamirPage.tsx` (116 l.) est une coquille qui possède **l'état partagé** — `filters`, `measureKey`, `section` — et rend l'une de trois sections. Le périmètre et la mesure **suivent** d'une section à l'autre.

```
DamirPage
├── hero (eyebrow + titre « DAMIR », sans phrase d'accroche)
├── nav .damir-sections  [Panorama | Comparer les prestations | Comparaison libre]
├── PanoramaSection.tsx   (508 l.)
├── ServicesSection.tsx   (456 l.)
└── FreeSection.tsx       (520 l.)
```

### 3.1 Panorama (`damir/PanoramaSection.tsx`)
Appelle `POST /api/panorama`. Une seule requête ramène les composantes brutes par année × sujet × facette ; **les 12 indicateurs sont dérivés côté client**, donc changer de mesure ne relance aucune requête.

**Quatre lectures**, chacune avec ses formes :

| Lecture | Formes offertes | Conditions |
|---|---|---|
| Évolution | Courbe · Barres · Aires empilées · Base 100 | Aires : ≥2 sujets **et** mesure additive · Base 100 : ≥2 sujets |
| Territoire | Carte · Classement | toujours |
| Âge | Barres · Barres horizontales · Courbe | toujours |
| Sexe | Courbe · Barres · Camembert | Camembert : mesure additive uniquement |

C'est le **modèle** (`panorama/slides.ts`) qui décide des formes offertes, pas l'interface : une forme qui mentirait n'est pas grisée, elle n'est pas là.

**KPI** : trois repères sur une ligne partagée avec le choix de forme (`.damir-strip`) — dernière année, variation vs année précédente (coloriée), cumul de la période. Pas de bandeau de tuiles.

**Exports** : « Enregistrer en PNG » (image composée : périmètre + titre + réserves + source) et « Extraire la donnée ».

**Sous le graphique**, replié : tableau des valeurs, et « Ce que ce graphique ne montre pas » (réserves + avertissements serveur).

### 3.2 Comparer les prestations (`damir/ServicesSection.tsx`)
Appelle `POST /api/explore` avec `breakdown` = niveau choisi.

- **Niveau** en onglets : Grands postes · Postes · Sous-postes · Prestations
- **Six vues** (couple forme+lecture décidé dans le code, pas par l'utilisateur) : Courbes · Barres · Classement · Base 100 · Variation · Camembert. Chaque vue affiche **la question à laquelle elle répond**
- Sélection des modalités via `SeriesPicker` placé **sous** le graphique
- Toutes les séries partagent le même périmètre
- Export : CSV client + lien Extraire. **Pas de PNG**

### 3.3 Comparaison libre (`damir/FreeSection.tsx`)
N'utilise **pas** `SeriesPicker` — implémentation autonome.

- **Axe X** : Les années · Une barre par série · ou n'importe quelle dimension du cube (12 options)
- **Axe Y** : la mesure
- **Forme** : Courbes · Barres · Empilé · Classement · Camembert (filtrées par l'axe et l'additivité)
- **Séries** : jusqu'à 8, chacune avec **son propre jeu de filtres complet**, un nom éditable, et ses filtres écrits en gris dessous. Une requête `/api/explore` par série
- Une nouvelle série part du périmètre de la précédente
- Avertissement automatique dès 2 séries : « les courbes ne décrivent pas la même population et ne s'additionnent pas »
- Export : CSV client
- **Contrainte** : la période reste commune (l'axe du temps est partagé)

### 3.4 Gestion grand poste / poste / sous-poste / prestation

C'est **une hiérarchie de filtres**, pas une arborescence chargée d'un coup.

- Source : `data/prs_nat_transco.csv` (152 Ko) chargé en **table DuckDB** `transco` au démarrage (colonnes `prs_nat`, `libelle`, `grand_poste`, `poste`, `sous_poste`), puis `ANALYZE`
- Jointure : `cube c LEFT JOIN transco t USING (prs_nat)`
- Dimensions SQL (`analysis.py`) :
  - `grand_post` → `COALESCE(t.grand_poste, 'Autres')`
  - `post` → `COALESCE(t.poste, 'Non classé')`
  - `sub_post` → `COALESCE(t.sous_poste, 'Non classé')`
  - `service` → `c.prs_nat` (+ jointure libellé)
- **Cascade** : `GET /api/options?grand_post=&post=&sub_post=` renvoie les postes/sous-postes/prestations disponibles. `AdvancedFilterPanel` et `ScopeBar` désactivent le niveau N+1 tant que N n'est pas choisi
- Dans Panorama, `service_codes` sert **double emploi** : filtre du cube **et** liste des sujets comparés (`subjects`), plafonnée à 8

> ⚠️ **Le « Autres » signalé par l'utilisateur vient d'ici** : `COALESCE(t.grand_poste, 'Autres')` — ce sont les prestations sans correspondance dans la table de transcodage. C'est une **modalité réelle du découpage**, distincte du repli « Reste du périmètre » du sélecteur de séries (qui, lui, a été renommé et éteint par défaut).

---

## 4. Architecture technique

```
Outil_DAMIR_V1/
├── DAMIR.bat / preparer.bat          lancement et préparation (Windows)
├── PRODUCT.md · DESIGN.md            product brief + design system
├── data/                             ~1,3 Go, jamais modifié par l'app
│   ├── cube_damir.parquet            1,1 Go  (source)
│   ├── cube_damir_compact.parquet    117 Mo  (dérivé, 5 762 787 lignes)
│   ├── cube_delais.parquet            13 Mo  (1 821 268 lignes)
│   ├── prs_nat_transco.csv           152 Ko
│   ├── pathologies/effectifs.parquet  49 Mo  + regions.geojson
│   ├── csp/                           25 Mo  (core + 9 fichiers annuels)
│   ├── mortalite/mortalite_core.parquet      (5 160 lignes)
│   └── .cache/metadata.json           cache disque des métadonnées
├── tools/                            6 scripts de préparation (hors runtime)
└── app/
    ├── backend/  (7 031 lignes Python)
    │   ├── run.py                    uvicorn + ouverture navigateur
    │   ├── app/main.py       1047 l.  routes + DamirRepository (DuckDB)
    │   ├── app/analysis.py    574 l.  METRICS, DIMENSIONS, FilterPayload, cube_where
    │   ├── app/studio.py     1064 l.  workbench (Repères) + méthodologie
    │   ├── app/correlations.py 1042 l. croisements + régression
    │   ├── app/explore.py     438 l.  moteur d'exploration générique
    │   ├── app/panorama.py    449 l.  sujets × facettes
    │   ├── app/csp.py         515 l.
    │   ├── app/pathologies.py 379 l.
    │   ├── app/mortality.py   300 l.
    │   ├── app/glm.py         287 l.  IRLS écrit à la main
    │   ├── app/statistics.py  191 l.  Pearson/Spearman/Student écrits à la main
    │   ├── app/cache.py        75 l.  cache disque à empreinte
    │   └── tests/             3 fichiers, 38 tests unittest
    └── frontend/ (14 622 lignes TS/CSS)
        └── src/
            ├── App.tsx                routeur maison + shell
            ├── api.ts          408 l. toute la couche réseau
            ├── types.ts        360 l. contrats de données
            ├── utils.ts        118 l. formatage, filtres↔URL, CSV
            ├── theme.css       258 l. LE design system (jetons)
            ├── styles.css     2216 l. héritage + surcouche « institut »
            ├── explore.css · panorama.css · correlations.css
            ├── charts/         EChart, buildOption, tokens, frenchMap
            ├── components/     ScopeBar, AdvancedFilterPanel, MultiSelect,
            │                   SearchableCauseSelect, ThemeToggle
            ├── damir/          PanoramaSection, ServicesSection, FreeSection
            ├── panorama/       model, slides, charts, exportSlide
            ├── explore/        model, seriesScope, SeriesPicker
            ├── correlations/   RegressionPanel
            └── pages/          DamirPage, CorrelationsPage, PathologyPage,
                                CspPage, MortalityPage, BenchmarksPage,
                                ExtractionPage, MethodologyPage
```

### Circulation de la donnée

```
Parquet sur disque
   ↓  CREATE VIEW (lecture paresseuse, jamais chargé en mémoire)
DuckDB en processus — vues : cube, delays, pathologies, csp, mortality
                      table : transco (matérialisée, petite)
   ↓  SQL paramétré construit par cube_where() / _dimension_sql()
Module métier (explore.py, panorama.py, correlations.py…)
   ↓  agrège en COMPOSANTES BRUTES (rem, dep, depas, qte, bse_tm, rem_tm, rem_neg)
   ↓  + envoie la SPÉCIFICATION DES FORMULES (formula_spec)
FastAPI → JSON
   ↓  fetch() dans api.ts
explore/model.ts · panorama/model.ts
   ↓  evaluate(components, formula_spec) — les 12 indicateurs dérivés CÔTÉ CLIENT
charts/buildOption.ts · panorama/charts.ts → EChartsOption
   ↓
<EChart /> → canvas
```

**Le choix architectural central** : le serveur n'envoie jamais un indicateur calculé, il envoie les composantes additives + la formule. Conséquence : changer de mesure ne provoque **aucune requête**, et la formule n'existe qu'à un seul endroit (`FORMULAS` dans `explore.py`, envoyé tel quel au client).

---

## 5. Technologies réellement utilisées

### Backend
| Techno | Version | Rôle |
|---|---|---|
| **Python** | 3.13 | langage |
| **FastAPI** | ≥0.116,<1 | routes HTTP, validation Pydantic, sérialisation |
| **Uvicorn** | ≥0.35,<1 | serveur ASGI |
| **DuckDB** | ≥1.3,<2 | moteur analytique en processus, lit Parquet/CSV directement |
| **openpyxl** | ≥3.1,<4 | export Excel auto-documenté |
| **Pydantic** | via FastAPI | `FilterPayload` et tous les modèles de requête |

**Pas de NumPy, pas de SciPy, pas de pandas, pas de statsmodels.** C'est délibéré (installation en double-clic) : toutes les statistiques sont écrites à la main.

### Frontend
| Techno | Version | Rôle |
|---|---|---|
| **React** | 19.1.1 | UI |
| **TypeScript** | 5.9 | typage ; `tsc -b` bloque le build |
| **Vite** | 7.1 | build + dev server (proxy `/api` → :8000) |
| **ECharts** | 6.1.0 | tous les graphiques DAMIR + Croisements |
| **Plotly** (`plotly.js-basic-dist-min` + `react-plotly.js`) | 3.7 / 4.0 | graphiques Pathologies, CSP, Mortalité, Repères |
| **CSS natif** | — | aucun framework, aucune lib de composants |

**Pas de** react-router, Redux, Zustand, Tailwind, MUI, styled-components, axios, react-query.

---

## 6. Graphiques et visualisation

### Deux bibliothèques coexistent

| Bibliothèque | Pages |
|---|---|
| **ECharts** | DAMIR (3 sections), Croisements, RegressionPanel |
| **Plotly** | Pathologies, CSP, Mortalité, Repères |

`vite.config.ts` les isole en chunks séparés (`vendor-echarts`, `vendor-plotly`) précisément parce que Plotly ne sert qu'aux pages chargées à la demande. **Plotly pèse 2,4 Mo** (810 Ko gzippé) contre 667 Ko pour ECharts.

### Côté ECharts
- **`charts/EChart.tsx` (136 l.)** — le seul composant graphique réutilisable. Enregistre à la main les modules (tree-shaking) : Bar, Custom, Heatmap, Line, Map, Pie, Scatter + Tooltip, Grid, VisualMap, Graphic, MarkLine, AxisPointer, DatasetComponent, **LabelLayout**, **UniversalTransition**, CanvasRenderer
- **Construction** : les options sont fabriquées par des fonctions pures (`buildOption.ts` 449 l., `panorama/charts.ts` 690 l.), jamais dans le JSX
- **Cartes** : `charts/frenchMap.ts` télécharge le GeoJSON **une seule fois** (promesse mémorisée) et l'enregistre dans le registre global ECharts. Normalise `code` → `name` pour l'appariement. Cadrage par `layoutCenter` + `layoutSize` (calé sur le côté court, ce qui préserve les proportions)
- **Transitions** : `withMorphing()` injecte `universalTransition: { enabled, seriesKey }` sur chaque série sauf `map` et `custom`. `setOption(..., { notMerge: true, lazyUpdate: true })`
- **Tooltips** : formatters maison, lisant la donnée **d'origine** et non l'échelle du tracé
- **Légendes** : **en HTML, pas dans le canvas** (`HTML_LEGEND = { show: false }`) — sélectionnables, accessibles au clavier, lisibles par un lecteur d'écran
- **Rafraîchissement** : `stale` réduit l'opacité au lieu d'afficher un squelette (pas de saut de mise en page)

### Côté Plotly
Aucun composant partagé. Chaque page fait son propre `createPlotlyComponent(Plotly)` et écrit ses `Data`/`Layout` à la main, avec **deux couleurs en dur** (`RED = "#ec4c53"`, `NAVY = "#3b3633"`) qui ne viennent **pas** des jetons de thème. `displayModeBar: false` partout.

### Différence essentielle DAMIR vs Pathologies/CSP/Mortalité
| | DAMIR / Croisements | Pathologies / CSP / Mortalité |
|---|---|---|
| Bibliothèque | ECharts | Plotly |
| Couleurs | jetons `theme.css` lus au runtime | constantes en dur dans le fichier |
| Mode sombre | suivi (`useChartTokens` + MutationObserver) | **non suivi** |
| Transitions | `universalTransition` | aucune |
| Export image | oui (Panorama, Croisements) | **aucun** |

### Export PNG (`panorama/exportSlide.ts`, 195 l.)
Recompose une image complète autour du canvas : périmètre, titre, phrase de lecture optionnelle, réserves chiffrées, mention de source. Rendu à `pixelRatio: 2`. Le tracé vient de l'instance vivante, pas d'un rendu parallèle.
> ⚠️ Utilise `tokens.surface` comme fond : **en mode sombre, on obtient un PNG à fond noir**.

---

## 7. Design et système visuel

### Il existe un vrai design system, mais partiel
**`theme.css` (258 l.)** est la source de vérité : jetons de couleur, typographie, espacement, rayons, ombres, en **deux thèmes complets** (`:root`, `@media (prefers-color-scheme: dark)`, `:root[data-theme="dark"]`).

**`styles.css` (2 216 l.)** est l'héritage : les noms anciens sont redirigés vers les jetons, mais beaucoup de règles portent encore des couleurs en dur (`#172033`, `#edf0f4`, `#dfe4ea`…). Un bloc final « Système visuel · Publication d'institut » (l. 2078+) surcharge tout ça avec des `!important`.

### Couleurs
- Fond `--paper: #f7f6f3` (ivoire chaud), surface blanche, encre `#14130f`
- Accent de marque **`--accent: #d8383c`** (rouge Forsides)
- **Palette de séries** `--series-1..8`, ordre fixe, **rouge en tête** : `#e34948, #2a78d6, #1baf7a, #eda100, #e87ba4, #008300, #4a3aa7, #eb6834`
- Rampe séquentielle bleue `--ramp-1..8` (cartes), rampe divergente orange↔bleu `--diverge-1..7` (indice de spécialisation)
- `--map-void` : territoire **sans donnée**, distinct d'une valeur basse
- **Une série seule prend `--accent`** et non la palette (`paletteColor()`)

### Typographie
`--font: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif`. Échelle de `--text-2xs` (.688rem) à `--text-hero` (clamp 2.25–3rem). `font-variant-numeric: tabular-nums` global sur `body`.

### Composants visuels
- **Cards** : `.panel` — bordure 1px, rayon `--radius`, fond surface, pas d'ombre lourde
- **Filtres** : `.scope-bar` (2 lignes), `.advanced-filter-panel`, `MultiSelect` en `<details>` avec popover **positionné en absolu** (règle : rien ne pousse le graphique vers le bas)
- **Boutons/onglets** : `.pathology-toggle` (segmenté), `.damir-sections` (onglets avec libellé + question), `.dimension-grid` (puces)
- **KPI** : `.damir-highlights` — une ligne, pas de tuiles
- **Espacement** : `--space-1..12` (4→48px)
- **Animations** : `--ease: cubic-bezier(.22,.61,.36,1)`, transitions 160–420 ms, `View Transitions API` sur la navigation, **`prefers-reduced-motion` respecté**
- **Responsive** : 45 media queries au total (36 dans styles.css). Ruptures principales 1240 / 860 / 720 / 620 px

---

## 8. Gestion des données

### Principe commun
**Tout est en vue DuckDB, rien n'est chargé en mémoire.** `CREATE VIEW … AS SELECT * FROM read_parquet(...)` — DuckDB lit les colonnes et les fragments nécessaires à chaque requête.

**Seule exception** : `transco` (152 Ko) est matérialisée en `CREATE TABLE` puis `ANALYZE`, parce qu'elle est jointe à chaque requête.

| Base | Format | Chargement | Volume |
|---|---|---|---|
| **DAMIR** | Parquet | vue ; **cube compact préféré** au cube brut | 117 Mo / 5,76 M lignes (compact) contre 1,1 Go |
| **Délais** | Parquet | vue, optionnelle (`has_delays`) | 13 Mo / 1,82 M lignes |
| **Pathologies** | Parquet | vue | 49 Mo |
| **CSP** | Parquet ×10 | vue avec `read_parquet([...], union_by_name = true)` | 25 Mo |
| **Mortalité** | Parquet **ou** Excel | vue si Parquet ; **table matérialisée + ANALYZE** si xlsx (repli) | 5 160 lignes |

### Le cube compact
`tools/build_cube_compact.py` agrège le cube brut à l'année (l'app n'utilise jamais le mois de soins) : **8× plus petit, strictement équivalent**. `_resolve_cube()` vérifie la date de modification — si le compact est plus ancien que la source, il retombe sur le cube brut **et l'écrit dans la console**. Mieux vaut lent et juste.

### Application des filtres
`cube_where(payload)` dans `analysis.py` construit un WHERE **paramétré** (`?`), jamais par concaténation de valeurs utilisateur. Deux options : `ignore_sex` et `exclude_base_less`.

### Concurrence
`DamirRepository.query()` crée **une connexion DuckDB par thread** (`threading.local` + curseur), sous verrou uniquement à la création. Les vues et `transco` restent partagées. Les requêtes HTTP en lecture ne sont donc pas sérialisées.

### Transformations notables
- **Ticket modérateur** : `bse_tm`/`rem_tm` neutralisent les 6 grands postes sans base de remboursement (`POSTES_SANS_BASE`), faute de quoi le ticket ressort négatif
- **Croisements** : projection des trois découpages d'âge sur la tranche décennale commune (DAMIR décennal, Cartographie en bandes de 5 ans, CSP en âge révolu)
- **Population de référence** : tirée de `npop` de la Cartographie, avec `MAX(npop)` par cellule âge×sexe **avant** de sommer (sinon multipliée par le nombre de pathologies)

---

## 9. Backend et API

### 33 routes déclarées. Les principales :

| Route | Rôle | Consommateur |
|---|---|---|
| `GET /api/health` | sonde | `run.py` |
| `GET /api/meta` | métadonnées globales (années, grands postes, régions, mesures, fiabilité) | `App.tsx` au démarrage |
| `GET /api/options` | cascade hiérarchique prestations | `AdvancedFilterPanel`, `ScopeBar` |
| `POST /api/explore` | agrégation générique par dimension | ServicesSection, FreeSection |
| `POST /api/explore/options` | modalités classées par poids + recherche | `SeriesPicker` |
| `POST /api/panorama` | sujets × facettes en un balayage | PanoramaSection |
| `POST /api/workbench` | calculs guidés multi-sources | BenchmarksPage |
| `GET/POST /api/correlations*` | catalogue, corrélation, **régression** | CorrelationsPage, RegressionPanel |
| `GET /api/methodology` | dictionnaire des indicateurs | MethodologyPage |
| `*/meta`, `*/overview` ×3 | Pathologies, CSP, Mortalité | pages dédiées |
| `*/extraction/preview`, `.csv`, `.xlsx` ×4 | extractions | ExtractionPage |
| `GET /api/csp/regions.geojson` | fond de carte | CspPage, `frenchMap.ts` |
| `POST /api/analysis` | **orphelin** — jamais appelé par le frontend | (tests seulement) |

### Gestion des erreurs
Motif uniforme : le module métier lève `ValueError` avec un message **en français destiné à l'utilisateur**, la route la convertit en `HTTPException(422)`. Côté client, `api.ts` lit `detail` et le remonte tel quel dans l'interface.

### Valeurs manquantes et « pas de données »
- Un ratio sans dénominateur renvoie **`None`, pas 0** (`measure_value`) — pour qu'une courbe ne plonge pas là où la donnée est simplement absente
- Prévalence masquée par la Cnam (< 10 patients) : reste absente
- Territoire sans donnée : couleur `--map-void`, distincte du bas de rampe
- Chaque écran a un message d'état vide **avec sa raison** (`slide.empty`)

### Les catégories « Autre »
Trois mécanismes distincts, à ne pas confondre :
1. **`COALESCE(t.grand_poste, 'Autres')`** — prestations non transcodées. Modalité réelle du cube
2. **`OTHER_KEY = "__other__"`** — repli au-delà de `MAX_BUCKETS = 60` modalités, pour que les totaux restent exacts
3. **Complément de sélection** — dans `SeriesPicker`, tout ce qui n'est pas sélectionné. **Renommé « Reste du périmètre · N modalités » et éteint par défaut**

### Caches
- **`@lru_cache`** sur 8 fonctions : métadonnées (maxsize=1), explore (64), panorama (16), options (32), corrélations (64), régression (64)
- **`DiskCache`** (`data/.cache/metadata.json`) indexé sur une **empreinte des fichiers source** (taille + mtime). Toute mise à jour d'un cube invalide l'entrée automatiquement. Toute anomalie du cache se résout en recalculant : le cache accélère, il ne conditionne jamais le fonctionnement
- **`reference_block`** du panorama est mis en cache séparément : ajouter une prestation à la comparaison passe d'un balayage complet à une requête filtrée
- HTTP : `no-store` sur l'HTML, `immutable` 1 an sur `/assets/`

---

## 10. Frontend et composants

### Composants réutilisés
| Composant | Utilisé par |
|---|---|
| `charts/EChart.tsx` | les 5 fichiers ECharts |
| `components/AdvancedFilterPanel.tsx` | ScopeEditor, FreeSection, Benchmarks |
| `components/MultiSelect.tsx` | ScopeBar, AdvancedFilterPanel, PathologyPage |
| `components/ScopeBar.tsx` | PanoramaSection, ServicesSection |
| `components/ThemeToggle.tsx` | App |
| `charts/tokens.ts` | tous les graphiques ECharts |
| `utils.ts` | partout (formatage, filtres↔URL, CSV) |

### Spécifiques à une page
`SearchableCauseSelect` (Mortalité), `SeriesPicker` (ServicesSection seulement), `RegressionPanel` (Croisements), `panorama/slides.ts` (Panorama).

### Gestion de l'état
**`useState` local uniquement.** Aucun store global. Trois niveaux :
1. `App.tsx` : page courante, métadonnées, thème, repli de la barre latérale
2. `DamirPage` : `filters`, `measureKey`, `section` — partagés entre les 3 sections
3. Chaque section : sa vue, ses formes, ses séries

**L'URL est le vrai magasin d'état** : chaque écran écrit ses paramètres par `history.replaceState` et les relit au montage.

### Motifs récurrents
- Fetch : `AbortController` + drapeau `live`/`active` pour ignorer une réponse périmée
- `fetchKey = JSON.stringify(request)` comme dépendance d'effet, pour ne relancer que sur un vrai changement
- Popovers : écouteur `pointerdown` sur `document` posé à la **frame suivante** (sinon le clic d'ouverture le déclenche lui-même)

---

## 11. Partie statistique

| Élément | État | Où |
|---|---|---|
| **Pearson** | ✅ implémenté, testé contre le quartet d'Anscombe | `statistics.py` |
| **Spearman** | ✅ implémenté, rangs moyens pour les ex æquo, testé | `statistics.py` |
| **p-value bilatérale (Student)** | ✅ implémenté via bêta incomplète régularisée (fraction continue de Lentz), testé contre tables | `statistics.py` |
| **Intervalle de confiance à 95 %** | ✅ transformation z de Fisher, testé (reste dans [−1,1]) | `statistics.py` |
| **R²** | ✅ | `statistics.py` |
| **Droite de régression (pente/ordonnée)** | ✅ testé | `statistics.py` |
| **`minimum_detectable_r`** | ✅ recherche dichotomique, testé | `statistics.py` |
| **GLM par IRLS** | ✅ implémenté à la main, sans NumPy | `glm.py` |
| **Famille gaussienne / lien identité** | ✅ | `glm.py` |
| **Famille Gamma / lien log** | ✅ | `glm.py` |
| **Famille Poisson / lien log** | ✅ | `glm.py` |
| **Choix automatique de la loi** | ✅ `default_family()` — proposé, jamais imposé | `glm.py` |
| **Écarts-types, Wald, p-values des coefficients** | ✅ dispersion par χ² de Pearson, covariance = disp × (XᵀWX)⁻¹ | `glm.py` |
| **Intervalles de confiance des effets** | ✅ calculés sur l'échelle du coefficient **puis** transportés | `correlations.py` |
| **Pseudo-R² de McFadden sur la déviance** | ✅ | `glm.py` |
| **Facteurs catégoriels (âge/sexe/région)** | ✅ indicatrices avec niveau de référence | `correlations.py` |
| **Détrend (retrait de tendance annuelle)** | ✅ | `correlations.py` |
| **Erreurs-types robustes / clustering** | ❌ **pas implémenté** — les p-values sur région×année sont optimistes, l'écran le signale sans corriger |
| **Détection de colinéarité (VIF)** | ❌ pas implémenté |
| **Sélection automatique de variables** | ❌ pas implémenté (délibérément) |
| **Diagnostics de résidus** | ❌ pas implémenté |
| **Interactions, splines, offsets** | ❌ pas implémentés |

**Vérification** : `glm.py` a été validé en session sur données simulées — il retrouve les coefficients connus en gaussien (β=2,00 / −1,00 attendus 2 / −1), Gamma-log (0,295 attendu 0,30) et Poisson-log (0,418 attendu 0,40). Ce contrôle **n'est pas dans la suite de tests** — c'est un manque.

**38 tests unittest** existent (`test_statistics.py` 14, `test_studio.py` 24, `test_analysis_parity.py` 4). ⚠️ **`pytest` n'est pas installé dans le venv** — les tests ne peuvent pas tourner en l'état sans `python -m unittest`.

---

## 12. Exports — l'inventaire complet

| Écran | PNG | CSV | Excel | Lien Extraire |
|---|---|---|---|---|
| DAMIR · Panorama | ✅ | — | — | ✅ |
| DAMIR · Comparer prestations | ❌ | ✅ | — | ✅ |
| DAMIR · Comparaison libre | ❌ | ✅ | — | ✅ |
| Croisements (les 2 modes) | ✅ (mode Lien) | ❌ | — | — |
| Pathologies | ❌ | ❌ | — | ✅ |
| CSP | ❌ | ❌ | — | — |
| Mortalité | ❌ | ❌ | — | ✅ |
| Repères | ❌ | ✅ | — | — |
| **Extraire** | — | ✅ | ✅ | — |

**Deux écrans sur huit peuvent produire une image.** Les 4 pages Plotly ont `displayModeBar: false` : aucun moyen de récupérer le graphique autrement qu'une capture d'écran.

- **PNG** : `renderSlide()` compose l'image (périmètre + titre + réserves + source) à `pixelRatio: 2`. Fond = thème courant → **noir en mode sombre**
- **CSV client** : `csvFromRows()` avec BOM UTF-8 et séparateur `;` (Excel FR)
- **CSV/Excel serveur** : streaming pour le CSV, `openpyxl` en `write_only` pour Excel avec feuille de métadonnées. Limite 250 000 lignes

---

## 13. Performances

### Optimisations déjà en place
1. **Cube compact** — 8× plus petit, transparent pour l'app
2. **Cache disque à empreinte** — les métadonnées coûtent ~2 s de balayages, calculées une fois
3. **`lru_cache`** sur les 8 endpoints coûteux
4. **Connexion DuckDB par thread** — pas de verrou global sur les lectures
5. **`GROUPING SETS`** dans `panorama.py` — les 3 facettes en **un seul balayage** (le commentaire note que 3 lectures séparées coûtaient 7× la première)
6. **`reference_block` mis en cache à part** — ajouter une prestation ne rebalaie plus tout
7. **Composantes brutes + formules côté client** — changer de mesure = **0 requête**
8. **Chunks Vite séparés** — Plotly (2,4 Mo) ne pèse pas sur l'ouverture de DAMIR
9. **Pages en `lazy()`**
10. **Recherche temporisée** (180 ms) dans `SeriesPicker`
11. **`stale`** au lieu d'un squelette : pas de saut de mise en page

### Points potentiellement lourds
- **`FreeSection` lance une requête `/api/explore` par série** — jusqu'à 8 balayages du cube en parallèle. C'est le point le plus coûteux de l'app
- Le **cube brut de 1,1 Go** est lu si le compact est absent ou périmé
- **`styles.css` : 2 216 lignes** chargées sur toutes les pages
- Bundle total : ~3,3 Mo non compressé (dont 2,4 Mo Plotly)
- La **régression** relance une requête complète à chaque coche/décoche de variable

### Problème visible
Aucun *debounce* sur les changements de filtres dans `ScopeBar` : chaque modification déclenche immédiatement une requête. Sur DuckDB local c'est acceptable ; sur le cube brut, moins.

---

## 14. État du code — appréciation factuelle

### Ce qui est propre
- **Séparation nette** backend métier / routes / frontend
- **Densité de commentaires exceptionnelle** — les commentaires expliquent *pourquoi*, pas *quoi* (« un ratio sans dénominateur renvoie None plutôt que zéro : les distinguer évite qu'une courbe plonge vers zéro là où la donnée est simplement absente »)
- **Formules à un seul endroit** (`FORMULAS`, envoyé au client)
- **Requêtes paramétrées** partout
- **Dégradation gracieuse** : sources optionnelles (`has_delays`, `has_csp`…), cache jamais bloquant, carte absente n'emporte pas l'écran

### Dette technique visible

**1. Code orphelin issu de la dernière restructuration** (`ExplorePage.tsx` supprimé) :
- `explore/seriesScope.ts` : **6 exports sur 11 ne sont plus utilisés** — `FREE_PREFIX`, `applyScope`, `isEmpty`, `scopedLabel`, `scopesToParam`, `scopesFromParam`
- `SeriesPicker` porte toute la machinerie « série libre + périmètre par série » (props `scopes`, `onScopeChange`, `onAddFree`, `base`), mais son **unique appelant** (`ServicesSection`) passe `allowScopes={false}` et des fonctions vides. `FreeSection` a sa propre implémentation
- `utils.ts` : `copyCurrentUrl()` jamais appelé
- `PanoramaSection` importe `filtersFromSearch` sans l'utiliser ; `FreeSection` importe `MultiSelect` sans l'utiliser

**2. Chemin `/api/analysis` mort** : la route, `run_analysis()` (~230 l. dans `analysis.py`) et `legacy_payload()` dans `studio.py` ne servent plus qu'aux tests.

**3. Fichiers volumineux**
- `styles.css` — 2 216 l., 17 sections empilées au fil des refontes, dont un bloc final qui surcharge tout avec `!important`
- `BenchmarksPage.tsx` — 1 170 l. dans un seul composant
- `main.py` — 1 047 l. (routes + repository + conversions Excel)
- `studio.py` — 1 064 l.
- `correlations.py` — 1 042 l. (croisements **et** régression dans le même fichier)

**4. Incohérence majeure entre les deux moitiés de l'app**
DAMIR/Croisements et Pathologies/CSP/Mortalité ne partagent **ni la bibliothèque graphique, ni les couleurs, ni le suivi du thème, ni les exports**. Les pages Plotly ont des couleurs en dur et ne réagissent pas au mode sombre.

**5. Duplication**
- 4 implémentations Plotly quasi identiques de `baseLayout`/`chartLayout`
- Le motif « fetch + AbortController + fetchKey » est réécrit ~12 fois
- Motif d'extraction dupliqué 4× côté backend (preview/csv/xlsx par source)

**6. Contrôle de version**
Un seul commit (`e632b8e`). **78 fichiers marqués supprimés, 8 non suivis** — la totalité de la restructuration est **non commitée**. C'est le risque le plus concret du projet aujourd'hui.

**7. Documentation périmée**
`app/LISEZMOI.md` décrit l'ancienne architecture DAMIR (« Panorama / Analyser », « classement des grands postes »). `DESIGN.md` et `PRODUCT.md` sont à jour.

---

## 15. Ce qui a été modifié lors de la précédente session

> Point de départ de cette session : Panorama et Comparer étaient deux pages séparées, l'écran Panorama proposait un sélecteur « Observer » (dimension d'observation), et Croisements ne faisait que de la corrélation.

### Navigation et structure
- **Fusion de `PanoramaPage` + `ExplorePage` en un écran `DamirPage`** à trois sections
- `pages/ExplorePage.tsx` **supprimé** ; `pages/PanoramaPage.tsx` → `damir/PanoramaSection.tsx`
- Entrées de nav « Panorama » et « Comparer » → une seule entrée « DAMIR »
- Anciennes URLs redirigées

### Composants créés
`components/ScopeBar.tsx` · `pages/DamirPage.tsx` · `damir/ServicesSection.tsx` · `damir/FreeSection.tsx` · `explore/seriesScope.ts` · `correlations/RegressionPanel.tsx` · `backend/app/glm.py`

### Composants supprimés
`panorama/SubjectPicker.tsx` · `pages/ExplorePage.tsx` · `copyOrDownload()` dans `exportSlide.ts`

### Panorama
Sélecteur « Observer » retiré (la prestation *est* le sujet) · barre de filtres compacte qui ne pousse plus le contenu · phrases de commentaire calculées retirées · carte recadrée par `layoutCenter`/`layoutSize` · classement territorial en option · formes multiples sur les 4 lectures · bande de KPI sur une ligne · « Copier l'image » retiré

### Comparer
Axe « Année » · camembert · exclusion du sexe non renseigné · périmètre propre par série · séries libres · puis refonte complète en deux sections

### Croisements
Ajout du **mode Modèle** entier (GLM IRLS, facteurs, tableau manipulable, graphique des effets) · unité **Région × âge × sexe** (192 cellules au lieu de 12) · bloc de réponse replié

### Design
Palette réordonnée (**rouge en tête**, validé par les six contrôles CVD dans les deux thèmes) · série seule en accent · `universalTransition` + `LabelLayout` enregistrés · `key` de remontage retirée

### Bugs corrigés en chemin
| Bug | Impact |
|---|---|
| `PieChart` non enregistré dans ECharts | tout camembert s'affichait vide |
| `LabelLayout` non enregistré | tous les `hideOverlap` ignorés en silence |
| `key` React sur le conteneur de graphique | instance détruite à chaque changement → aucune transition possible |
| `'95 et +'` vs `'95et+'` dans `_patho_age_codes` | **276 000 lignes** silencieusement exclues du filtre « 80 ans et plus » |
| Effet de remise à zéro déclenché au premier rendu | toute comparaison partagée par lien se rouvrait sur les 5 modalités par défaut |
| « Comparer selon : Rien » | aucune courbe affichée |
| Intervalles de confiance hors du cadre | axe borné sur les seules estimations |
| Série de barres parasite | intervalles décalés de leur barre |

---

## 16. Synthèse

### Architecture actuelle
Application locale mono-poste. **FastAPI + DuckDB** interrogent des fichiers Parquet en vues (jamais chargés en mémoire) ; le backend renvoie des **composantes brutes + des spécifications de formule** ; un frontend **React 19 + TypeScript** dérive les 12 indicateurs côté client et les dessine avec **ECharts** (DAMIR, Croisements) ou **Plotly** (les trois autres sources). L'état de chaque écran vit dans l'URL. Routage maison, état local uniquement.

### Modules réellement présents
DAMIR (Panorama · Comparer les prestations · Comparaison libre) · Croisements (Lien · Modèle) · Pathologies · CSP · Mortalité · Repères · Extraire · Données & méthode

### Stack technique
`Python 3.13` · `FastAPI` · `Uvicorn` · `DuckDB` · `openpyxl` · `Pydantic` — **sans NumPy/SciPy/pandas**
`React 19.1` · `TypeScript 5.9` · `Vite 7.1` · `ECharts 6.1` · `Plotly 3.7` · **CSS natif sans framework**

### Forces actuelles
- Le modèle « composantes brutes + formule au client » : changer de mesure ne coûte **aucune requête**
- Rigueur méthodologique **incarnée dans le code** : ratio sans dénominateur = `None` et non 0 ; réserves chiffrées qui voyagent dans l'image exportée ; formes refusées quand elles mentiraient ; palette validée par script
- Statistiques écrites à la main **et testées contre des valeurs publiées**
- Dégradation gracieuse partout (sources optionnelles, cache non bloquant)
- Commentaires qui expliquent le *pourquoi*
- Performance : cube compact, `GROUPING SETS`, caches à empreinte, chunks séparés

### Points encore fragiles
1. **Deux bibliothèques graphiques** avec deux systèmes de couleurs, dont un ne suit pas le thème
2. **Code orphelin** issu de la dernière restructuration (`seriesScope`, machinerie de `SeriesPicker`, `/api/analysis`)
3. **`styles.css` de 2 216 lignes** empilées, avec un bloc final en `!important`
4. **Rien n'est commité** — 78 fichiers en attente sur un dépôt à un seul commit
5. `LISEZMOI.md` décrit une architecture qui n'existe plus
6. Tests non exécutables en l'état (`pytest` absent du venv)
7. Aucun test du GLM dans la suite
8. `FreeSection` : jusqu'à 8 requêtes parallèles sur le cube

### Fonctionnalités demandées mais **pas** implémentées
| Demande | État réel |
|---|---|
| Export image sur tous les écrans | ❌ 2 écrans sur 8 |
| Export PNG toujours sur fond clair | ❌ suit le thème → noir en mode sombre |
| Format 16:9 pour les diapositives | ❌ taille écran |
| Titre éditable avant export | ❌ |
| Panier de graphiques / export .pptx | ❌ |
| Bouton « copier le lien » | ❌ la fonction existe, aucun bouton |
| Exclusion d'un point au clic sur le nuage | ❌ |
| Budget statistique annoncé avant le résultat | ⚠️ `minimum_detectable_r` calculé, affiché seulement dans le détail replié |
| Comparaison avec/sans variable dans le GLM | ⚠️ la coche existe, l'écart n'est pas montré |
| Erreurs-types robustes (clustering) | ❌ signalé, pas corrigé |
| Détection de colinéarité | ❌ |
| Analyses nommées et enregistrées | ❌ URL seulement |

### Fichiers clés à lire en priorité

**Pour comprendre le modèle de données et le métier**
1. `app/backend/app/analysis.py` — `METRICS`, `DIMENSIONS`, `FilterPayload`, `cube_where`
2. `app/backend/app/explore.py` — le moteur générique et les `FORMULAS` envoyées au client
3. `app/backend/app/main.py` (l. 200–430) — `DamirRepository`, création des vues DuckDB

**Pour comprendre l'interface**
4. `app/frontend/src/pages/DamirPage.tsx` — la coquille et l'état partagé
5. `app/frontend/src/damir/PanoramaSection.tsx` + `app/frontend/src/panorama/slides.ts` — le modèle qui décide des formes offertes
6. `app/frontend/src/charts/EChart.tsx` + `charts/buildOption.ts` — la fabrique de graphiques
7. `app/frontend/src/App.tsx` — routage et coquille

**Pour comprendre les statistiques**
8. `app/backend/app/correlations.py` — unités d'observation, catalogue, régression
9. `app/backend/app/glm.py` — IRLS
10. `app/backend/app/statistics.py`

**Les intentions**
11. `PRODUCT.md` — public, contraintes, principes
12. `DESIGN.md` — jetons, formes, 17 règles qui tiennent le système

> ⚠️ Ne pas se fier à `app/LISEZMOI.md` pour la structure de DAMIR : il décrit l'organisation précédente.
