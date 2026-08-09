# MISSION — DAMIR Studio v2 · « l'outil du pôle prévoyance santé »

> **Comment utiliser ce document (pour l'humain).** Place ce fichier à la racine du dépôt. Colle aussi l'état des lieux du 9 août 2026 dans `docs/ETAT_DES_LIEUX.md`. Puis, dans Claude Code, lance les phases **une par une** :
> « Lis MISSION.md en entier, ainsi que les fichiers de la section Lecture obligatoire. Puis exécute la Phase 0 uniquement. Présente-moi un plan bref avant de coder, et arrête-toi après le commit de la phase. »

---

## 1. Contexte et objectif produit

DAMIR Studio est une application web **locale mono-poste** (FastAPI + DuckDB + React/TypeScript) d'exploration de quatre bases publiques de santé : Open DAMIR (dépenses d'Assurance Maladie), Cartographie des pathologies (Cnam), CSP (recensement Insee), Mortalité (CépiDc). Rien ne quitte le poste, aucun serveur distant.

Elle devient **l'outil d'information du pôle prévoyance santé** : des managers non-spécialistes doivent pouvoir ouvrir l'outil, manipuler librement les quatre bases, produire un graphique propre pour une présentation, et croiser les bases entre elles — le tout jugé aussi sur sa **rigueur actuarielle**. C'est un outil d'information, pas un outil de calcul ni de projection.

Décisions produit arrêtées (ne pas les rediscuter) :
1. **Liberté totale de lecture** : pas de « questions préparées », pas de synthèse imposée. Le manager choisit ce qu'il regarde. En contrepartie, chaque écran doit s'ouvrir sur un état par défaut immédiatement parlant.
2. **Uniformité des 4 bases** : mêmes repères visuels, mêmes gestes, mêmes exports partout. DAMIR reste la base la plus riche, les trois autres suivent son gabarit.
3. **DAMIR passe de 3 sections à 2** : Panorama (inchangé sur le fond) et Comparer (fusion de « Comparer les prestations » et « Comparaison libre »).
4. **Croisements gagne un mode guidé** par défaut (expliquer Y par X via le GLM existant), les modes actuels restent en accès avancé.
5. **Un seul moteur graphique : ECharts.** Plotly est supprimé.
6. **Exports irréprochables partout** : PNG 16:9, fond toujours clair, titre éditable.
7. **Aucune IA générative, aucune nouvelle dépendance** dans cette version.

## 2. Lecture obligatoire avant toute modification

Lire dans cet ordre, avant la Phase 0 :
1. `PRODUCT.md` et `DESIGN.md` (intentions ; les 17 règles de DESIGN.md font loi)
2. `docs/ETAT_DES_LIEUX.md` (photo complète du code au 9 août 2026 — fiable, contrairement à `app/LISEZMOI.md` qui est périmé)
3. `app/backend/app/analysis.py` (METRICS, DIMENSIONS, FilterPayload, cube_where)
4. `app/backend/app/explore.py` (moteur générique, FORMULAS envoyées au client)
5. `app/backend/app/main.py` (DamirRepository, création des vues DuckDB)
6. `app/frontend/src/pages/DamirPage.tsx`, `damir/PanoramaSection.tsx`, `panorama/slides.ts`
7. `app/frontend/src/charts/EChart.tsx`, `charts/buildOption.ts`, `charts/tokens.ts`, `charts/frenchMap.ts`
8. `app/backend/app/correlations.py`, `glm.py`, `statistics.py`
9. `app/frontend/src/App.tsx`, `theme.css`

## 3. Principes non négociables

À recopier tels quels dans un `CLAUDE.md` créé à la racine en Phase 0, pour qu'ils survivent à toutes les sessions :

- **Rien ne quitte le poste.** Aucun appel réseau externe au runtime, aucune télémétrie, aucune API distante.
- **Une donnée absente reste absente.** Un ratio sans dénominateur renvoie `None`, jamais 0. Une valeur masquée (Cnam < 10) reste masquée. Un territoire sans donnée prend `--map-void`, pas le bas de rampe.
- **Une forme qui mentirait n'est pas offerte.** C'est le modèle (à la manière de `panorama/slides.ts`) qui décide des formes licites (additivité, nombre de séries, nature de l'axe) — jamais un bouton grisé, jamais un camembert sur une mesure non additive.
- **Langage écologique obligatoire pour les croisements.** Les unités d'observation sont des cellules région × âge × sexe, jamais des individus. Formulation type : « À âge et sexe comparables, les territoires où X est plus élevé présentent aussi… ». Toute formulation individuelle (« les agriculteurs consomment plus d'IJ ») est interdite dans l'interface, les phrases générées et les exports.
- **Les réserves voyagent.** Réserves méthodologiques et avertissements serveur accompagnent le graphique à l'écran **et** dans l'image exportée.
- **SQL paramétré uniquement** (motif `cube_where`), jamais de concaténation de valeurs utilisateur.
- **Aucune nouvelle dépendance** (front ou back) sans accord explicite de l'utilisateur : pas d'UI kit, pas de state manager, pas de router, pas de lib d'animation, pas de NumPy/pandas.
- **theme.css est la seule source des couleurs.** Aucune couleur en dur dans les composants ni dans les builders de graphiques. Ne rien ajouter à `styles.css` : tout nouveau style va dans un fichier CSS dédié adossé aux jetons.
- **Pas de sur-ingénierie.** Extraire un composant partagé seulement s'il sert au moins trois usages réels. Préférer une duplication légère et lisible à une abstraction prématurée.
- **Parité fonctionnelle.** Aucune capacité existante ne disparaît sans équivalent explicite dans ce document.
- **Le français de l'interface est soigné**, orienté utilisateur (« Enregistrer en PNG », questions affichées sur les vues), voix active, vocabulaire constant d'un écran à l'autre.

---

## Phase 0 — Filet de sécurité et hygiène

**Préalable : vérifier que `git status` est propre** (l'utilisateur doit avoir commité l'existant). Si ce n'est pas le cas, s'arrêter et le lui demander. Puis créer une branche `v2`.

1. Créer `CLAUDE.md` à la racine : les principes de la section 3, plus les commandes du projet (build front `npm run build` dans `app/frontend`, tests `python -m pytest app/backend/tests`, lancement `DAMIR.bat`).
2. Ajouter `pytest` aux dépendances de développement du venv ; vérifier que les 38 tests existants passent avec `python -m pytest`.
3. Écrire `app/backend/tests/test_glm.py` : données simulées à graine fixe pour les trois familles (gaussienne/identité, Gamma/log, Poisson/log), vérifier que les coefficients estimés retrouvent les coefficients vrais à tolérance raisonnable et que les intervalles à 95 % les couvrent. S'appuyer sur la validation faite en session (gaussien β = 2,00 / −1,00 ; Gamma-log 0,295 pour 0,30 ; Poisson-log 0,418 pour 0,40).
4. Supprimer le code mort : route `POST /api/analysis`, `run_analysis()` dans `analysis.py`, `legacy_payload()` dans `studio.py` (adapter ou supprimer les tests qui ne testaient que ce chemin) ; les 6 exports inutilisés de `explore/seriesScope.ts` ; les imports inutilisés (`filtersFromSearch` dans PanoramaSection, `MultiSelect` dans FreeSection).
5. Brancher `copyCurrentUrl()` (utils.ts) sur un bouton « Copier le lien » visible dans le shell de l'app (App.tsx), avec confirmation visuelle discrète. C'est le mode de partage entre collègues : il doit être présent sur tous les écrans.
6. Vider `app/LISEZMOI.md` de son contenu périmé ; le remplacer par trois lignes pointant vers `PRODUCT.md`, `DESIGN.md` et `docs/ETAT_DES_LIEUX.md` (réécriture complète en Phase 6).

**Acceptation :** pytest vert (38 + nouveaux tests GLM) · `npm run build` vert · bouton « Copier le lien » fonctionnel sur toutes les pages · plus aucune référence à `/api/analysis` hors historique git. **Commit.**

## Phase 1 — Un seul moteur graphique : ECharts partout

Migrer les quatre pages Plotly — `PathologyPage`, `CspPage`, `MortalityPage`, `BenchmarksPage` — vers le composant `charts/EChart.tsx` existant. **Aucun changement d'API backend.** Repères : migration graphique seule, pas de refonte de ses 1 170 lignes.

Règles de migration :
- Options construites par des **fonctions pures** dans des builders dédiés (`pathologies/charts.ts`, `csp/charts.ts`, `mortality/charts.ts`), sur le modèle de `panorama/charts.ts`. Jamais d'options dans le JSX.
- Couleurs et typographies via `useChartTokens` (`charts/tokens.ts`) : le **mode sombre doit suivre en direct**, comme sur DAMIR. Supprimer les constantes en dur (`RED`, `NAVY`).
- Carte choroplèthe CSP : réutiliser `charts/frenchMap.ts` (le GeoJSON est déjà servi par `/api/csp/regions.geojson`) avec cadrage `layoutCenter`/`layoutSize` ; conserver le clic-région.
- **Enregistrer dans `EChart.tsx` tout module ECharts nouvellement utilisé.** Piège documenté du projet : un module non enregistré (PieChart, LabelLayout) échoue en silence.
- Activer `universalTransition` sur les changements de forme (via le mécanisme existant `withMorphing`).
- Légendes en HTML hors canvas, tooltips maison lisant la donnée d'origine — comme sur DAMIR.

Parité exigée, lecture par lecture :
- **Pathologies** : trajectoire nationale (+ courbe France en pointillé quand une région est choisie), profil âge×sexe en barres groupées, classement territorial horizontal avec ligne de référence France, affichage du masquage Cnam.
- **CSP** : carte cliquable, évolution, profil âge×sexe, composition.
- **Mortalité** : évolution, top causes, profil sexe, profil âge.
- **Repères** : les graphiques existants à l'identique.

Puis retirer `plotly.js-basic-dist-min` et `react-plotly.js` de `package.json` et le chunk `vendor-plotly` de `vite.config.ts`.

**Acceptation :** `npm run build` vert · `grep -ri plotly app/frontend/src` vide · bascule clair/sombre répercutée en direct sur les quatre pages · aucune couleur en dur dans les builders · les lectures listées ci-dessus rendent des données identiques à avant (comparer visuellement et sur le tableau de valeurs). **Commit.**

## Phase 2 — Gabarit commun des 4 bases

Objectif : passer de Pathologies à CSP ou Mortalité doit donner l'impression d'un même produit que DAMIR. Extraire de l'existant DAMIR trois composants partagés, sans framework générique :

1. **`components/PageHero`** : eyebrow + titre + une phrase de mission par base (rédiger ces phrases, sobres et factuelles).
2. **`components/KpiStrip`** : généralisation de `.damir-highlights` — dernière valeur, variation vs période précédente (colorée), et un troisième repère pertinent par base, sur une ligne partagée avec les choix de forme.
3. **`components/ChartShell`** : zone graphique + choix de formes + bloc replié « Valeurs » (tableau) + bloc replié « Ce que ce graphique ne montre pas » (réserves + avertissements serveur) + pied d'export (PNG, CSV quand pertinent, lien Extraire).

Chaque base reçoit un **modèle** (`pathologies/model.ts`, `csp/model.ts`, `mortality/model.ts`) sur le motif de `panorama/slides.ts` : il déclare les lectures disponibles et les formes licites pour chacune. Exemples de décisions du modèle : pas de carte ni de taux par habitant en Mortalité (source nationale — le modèle l'énonce dans les réserves au lieu de le simuler) ; camembert seulement sur mesures additives ; prévalence jamais empilée.

Harmoniser l'état dans l'URL (mêmes conventions de paramètres que DAMIR) pour que « Copier le lien » restitue fidèlement chaque écran.

**Acceptation :** les trois pages utilisent PageHero, KpiStrip et ChartShell · chaque base affiche ses réserves propres (masquage Cnam, millésimes CSP, mortalité nationale) · un lien copié restitue l'état exact · aucune régression sur les filtres existants. **Commit.**

## Phase 3 — DAMIR : fusion en Panorama + Comparer

`DamirPage` passe à deux sections : **Panorama** (conservé tel quel, y compris exports) et **Comparer** (`damir/CompareSection.tsx`), qui remplace `ServicesSection` + `FreeSection`.

Spécification de Comparer :
- **« Comparer selon »** : une dimension au choix — grands postes, postes, sous-postes, prestations (cascade hiérarchique existante via `/api/options`), ou région, âge, sexe, année. Les modalités deviennent les séries, choisies via `SeriesPicker` (recherche, classement par poids via `/api/explore/options`, complément « Reste du périmètre · N modalités » éteint par défaut).
- **Séries libres** : à tout moment, ajouter une série avec son **propre périmètre complet** (AdvancedFilterPanel), nom éditable, filtres résumés en gris sous le nom — reprendre le comportement de FreeSection (une nouvelle série part du périmètre de la précédente). Dès qu'une série libre diverge du périmètre commun, afficher l'avertissement existant (« les courbes ne décrivent pas la même population et ne s'additionnent pas »).
- **Vues nommées par la question** à laquelle elles répondent (reprendre les six de ServicesSection : Courbes, Barres, Classement, Base 100, Variation, Camembert), filtrées par le modèle selon l'additivité, le nombre de séries et l'axe.
- Maximum 8 séries, période commune (l'axe du temps est partagé), exclusion du sexe non renseigné conservée.
- **Une seule machinerie de périmètres par série** à la fin : soit achever `SeriesPicker` + `seriesScope` (leurs props dormantes servent enfin), soit porter l'implémentation de FreeSection — choisir la plus simple, supprimer l'autre intégralement.
- Exports : PNG composé (Phase 5), CSV client, lien Extraire.
- Debounce de 250 ms sur les changements de filtres ; conserver `AbortController` + `fetchKey`.
- Rediriger les anciennes URLs (`section=services`, `section=free`, et les paramètres associés) vers la nouvelle section.

**Acceptation :** tout ce qui était faisable dans les deux anciennes sections reste faisable dans Comparer (dresser la liste et cocher) · plus aucun code de ServicesSection/FreeSection ni d'export mort de seriesScope · les liens anciens redirigent proprement. **Commit.**

## Phase 4 — Croisements : mode guidé

`CorrelationsPage` passe à trois onglets : **Guidé** (défaut), **Lien** et **Modèle** (les deux existants, inchangés, présentés comme mode avancé).

Parcours du mode Guidé, en trois temps sur un seul écran :
1. **« Que voulez-vous expliquer ? »** — la variable Y : une mesure DAMIR rapportée à la population (dépense par habitant, remboursement moyen, taux de prise en charge… depuis le catalogue METRICS de `correlations.py`), ou la prévalence d'une pathologie (sélecteur hiérarchique existant). *La mortalité est exclue de Y et de X dans le mode guidé (source nationale, incompatible avec l'unité territoriale) — une note le dit et renvoie au mode avancé.*
2. **« Par quoi l'expliquer ? »** — 1 à 3 variables X : part d'un groupe CSP (choix du groupe ou de la catégorie), prévalence d'une pathologie, ou une mesure DAMIR.
3. **Contrôles** : « À âge et sexe comparables » coché d'office (indicatrices âge et sexe du GLM existant) ; « Tenir compte de la région » optionnel ; choix de la période (par défaut, dernière année commune aux sources choisies, affichée explicitement).

Moteur : l'existant (`correlations.py`, `glm.py`), unité région × âge × sexe (192 cellules), famille proposée par `default_family()` — **aucune statistique nouvelle** (pas de VIF, pas d'erreurs robustes : les avertissements existants suffisent et restent affichés).

Restitution :
- **Une phrase principale par variable X**, gabarit imposé : « À âge et sexe comparables, les cellules territoriales où [X] est plus élevé présentent en moyenne [un Y plus élevé / plus bas] (effet : … ; IC à 95 % : …). » Si l'IC contient zéro : « … le lien n'est pas établi sur ces données. »
- Un encart permanent **« Comment lire ces résultats »** : deux ou trois phrases expliquant qu'on compare des territoires-cellules et non des personnes, avec l'exemple : ces données peuvent dire « les territoires où les agriculteurs pèsent plus dépensent plus en indemnités journalières par habitant », jamais « un agriculteur consomme plus d'indemnités journalières ».
- **Graphique des effets** avec intervalles à 95 % (réutiliser celui de RegressionPanel) et **nuage interactif** : chaque point est une cellule ; le clic ouvre un panneau de détail (région, tranche d'âge, sexe, valeurs X et Y) ; le survol d'une région dans la légende surligne ses points. Sobre — pas d'animation gratuite.
- Part expliquée (pseudo-R²) affichée avec sa réserve.

**Acceptation :** le scénario « dépense d'indemnités journalières par habitant expliquée par la part des agriculteurs, à âge et sexe comparables » se déroule en trois clics et produit la phrase au gabarit exact · aucune formulation individuelle nulle part · les onglets Lien et Modèle fonctionnent comme avant. **Commit.**

## Phase 5 — Exports irréprochables

Généraliser `panorama/exportSlide.ts` en un module d'export unique utilisé partout :
- **Format 16:9 fixe** (1600 × 900 logiques, `pixelRatio: 2`).
- **Fond toujours clair** : composer l'image avec les jetons du thème clair explicitement (ne pas lire le thème courant du DOM), y compris le re-rendu du graphique avec la palette claire. Un export lancé en mode sombre doit produire exactement la même image qu'en mode clair.
- **Titre éditable** : champ pré-rempli (titre calculé de la lecture) modifiable avant génération.
- Mentions systématiques : périmètre, réserves chiffrées, source, date d'export.

Déployer « Enregistrer en PNG » sur : toutes les lectures des quatre bases (via ChartShell), Comparer, Croisements guidé. Ajouter le CSV client partout où un tableau de valeurs existe.

**Acceptation :** depuis chaque écran de données, un PNG 16:9 à fond clair s'obtient en deux clics au plus, avec titre éditable, réserves et source visibles — vérifié en mode sombre. **Commit.**

## Phase 6 — Fluidité et finitions

1. Debounce 250 ms sur les changements de filtres de `ScopeBar` (Panorama compris).
2. Vérifier `universalTransition` sur tous les changements de forme des quatre bases ; conserver View Transitions sur la navigation, l'état `stale` (opacité réduite, pas de squelette), `prefers-reduced-motion`.
3. Focus clavier visible sur tous les nouveaux contrôles ; les légendes HTML restent navigables au clavier.
4. CSS : rien ajouté à `styles.css` pendant tout le chantier (vérifier) ; retirer uniquement les blocs devenus manifestement morts et identifiables sans risque.
5. Réécrire `app/LISEZMOI.md` : architecture réelle après v2, lancement, commandes, carte des dossiers. Mettre à jour `PRODUCT.md` / `DESIGN.md` si une décision de ce chantier les a fait bouger.

**Acceptation :** recette finale ci-dessous intégralement verte. **Commit final + tag `v2`.**

---

## Interdits absolus

- Ajouter une dépendance sans accord explicite de l'utilisateur.
- Remplacer un `None` par 0, offrir une forme non licite, formuler un résultat écologique en termes individuels.
- Concaténer des valeurs utilisateur dans du SQL.
- Tout appel réseau externe au runtime.
- Modifier `data/` ou `tools/` (sauf demande explicite).
- Réécrire `styles.css` en une passe.
- Supprimer une capacité existante sans équivalent prévu par ce document.
- Enchaîner deux phases sans validation de l'utilisateur entre les deux.

## Méthode de travail

- Une phase à la fois, dans l'ordre. Avant de coder : un plan bref (fichiers touchés, risques, choix ouverts). Après : `npm run build` et `python -m pytest` verts, puis un commit au message descriptif en français.
- En cas d'ambiguïté de spécification : choisir l'option la plus simple, la signaler dans le message de commit.
- Pas de refactor opportuniste hors du périmètre de la phase en cours.
- Prendre des captures d'écran quand l'environnement le permet pour critiquer visuellement le rendu (thème clair et sombre).

## Recette finale — la démo qui doit fonctionner

1. `preparer.bat` puis `DAMIR.bat` sur un poste vierge : l'app s'ouvre, DAMIR affiche un Panorama par défaut immédiatement lisible.
2. Filtrer sur les indemnités journalières, lecture Territoire, forme Carte.
3. « Enregistrer en PNG » **en mode sombre** : image 16:9 à fond clair, titre modifié à la main, réserves et source visibles.
4. « Copier le lien », l'ouvrir dans un onglet neuf : état strictement identique.
5. Comparer : grands postes en Courbes, puis vue Classement — transition par morphing, sans saut de mise en page.
6. Ajouter une série libre au périmètre différent : l'avertissement de population apparaît.
7. Pathologies : mêmes repères visuels que DAMIR (hero, KPI, formes, replis), thème sombre suivi, export PNG conforme.
8. CSP : carte cliquable ECharts, thème suivi.
9. Croisements · Guidé : dépense d'IJ par habitant expliquée par la part des agriculteurs, à âge et sexe comparables → phrase au gabarit écologique, effets avec IC, clic sur un point du nuage → détail de la cellule.
10. Extraire : inchangé et fonctionnel (aperçu, CSV, Excel, limite 250 000 lignes).
11. `python -m pytest` vert · `npm run build` vert · `grep -ri plotly app/frontend/src` vide.
