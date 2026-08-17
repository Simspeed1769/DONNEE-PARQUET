# DAMIR Studio — état des lieux complet

> **Ce document est un audit, pas une brochure.** Il décrit l'application telle
> qu'elle est dans le dépôt au 15 août 2026, vérifiée par lecture du code et par
> exécution (`npm run build` vert, `python -m pytest` : 54 tests passés). Il est
> écrit pour qu'une intelligence artificielle sans contexte préalable — ou un
> développeur qui arrive — puisse comprendre l'ensemble sans rien deviner :
> quelles technologies, quelles données, quelles routes, quels écrans, quelles
> règles, et où sont les défauts connus.
>
> Quand une affirmation n'a pas pu être vérifiée, elle est marquée
> **« non vérifié »**. Quand quelque chose est cassé ou incohérent, c'est écrit,
> avec le fichier et la ligne.

---

## Sommaire

1. [En une page](#1-en-une-page)
2. [Lancer, préparer, développer](#2-lancer-préparer-développer)
3. [Carte du dépôt](#3-carte-du-dépôt)
4. [Les données](#4-les-données)
5. [Le serveur](#5-le-serveur)
6. [L'API — les 37 routes](#6-lapi--les-37-routes)
7. [Les statistiques](#7-les-statistiques)
8. [L'interface — socle technique](#8-linterface--socle-technique)
9. [Le système graphique](#9-le-système-graphique)
10. [Les neuf écrans, en détail](#10-les-neuf-écrans-en-détail)
11. [Le système de design](#11-le-système-de-design)
12. [Les invariants méthodologiques](#12-les-invariants-méthodologiques)
13. [Performance](#13-performance)
14. [Accessibilité et confidentialité](#14-accessibilité-et-confidentialité)
15. [Tests et vérification](#15-tests-et-vérification)
16. [Dette technique et défauts connus](#16-dette-technique-et-défauts-connus)
17. [Guide d'intervention](#17-guide-dintervention)
18. [Glossaire](#18-glossaire)

---

## 1. En une page

**Ce que c'est.** Une application web **locale, mono-poste**, qui rend
exploitables cinq bases publiques de santé et de démographie françaises. Elle
tourne entièrement sur la machine de l'utilisateur : pas de serveur distant, pas
de compte, pas d'hébergement, aucun appel réseau externe au runtime.

**Pour qui.** Deux publics simultanés, et c'est la contrainte structurante :
des *managers* non-spécialistes qui explorent une tendance puis reprennent le
graphique dans une présentation, et un *public actuariel* qui juge l'outil sur
la rigueur de ce qu'il affiche. L'interface doit donc s'ouvrir sans prérequis et
rester juste sous l'œil d'un spécialiste.

**Positionnement technique.** Explorer environ un milliard de lignes sans
infrastructure : DuckDB interroge directement des fichiers Parquet posés sur le
disque, ce qui conserve la granularité prestation × population × territoire
interrogeable en quelques centaines de millisecondes.

**Le choix d'architecture central.** Le serveur **n'envoie jamais un indicateur
calculé**. Il envoie les *composantes additives brutes* (`rem`, `dep`, `depas`,
`qte`, `bse_tm`, `rem_tm`, `rem_neg`) **plus la spécification de la formule**
(`formula_spec`). Le client dérive les douze indicateurs. Conséquences : changer
de mesure ne provoque **aucune requête**, et une formule n'existe qu'à un seul
endroit (`FORMULAS` dans `explore.py`).

**Socle.**

| Couche | Technologies |
|---|---|
| Serveur | Python 3.13 · FastAPI · Uvicorn · DuckDB · openpyxl · Pydantic |
| Interface | React 19.1 · TypeScript 5.9 · Vite 7.1 · ECharts 6.1 · CSS natif |
| Explicitement absents | NumPy, SciPy, pandas, statsmodels · react-router, Redux/Zustand, Tailwind, MUI, axios, react-query, toute lib d'animation |

**Neuf écrans** : DAMIR · Pathologies · CSP · Mortalité · Population ·
Croisements · Tableau · Extraire · Données & méthode.

**État de santé au 15 août 2026.**

| Contrôle | Résultat |
|---|---|
| `npm run build` (tsc -b && vite build) | ✅ vert, 46 s |
| `python -m pytest` | ✅ **54 tests passés**, 61 s |
| Dépendances runtime | 4 côté serveur, 4 côté interface — aucune non déclarée |
| Historique Git | 36 commits, branche `v2`, arbre propre |
| Code mort connu | 1 fichier (673 l.), **délibéré et documenté** |
| Défauts connus non corrigés | 5, listés au §16 |

---

## 2. Lancer, préparer, développer

### Usage normal (poste Windows d'un utilisateur final)

```
preparer.bat     # une seule fois : venv, npm install, build, cube compact
DAMIR.bat        # à chaque usage → http://127.0.0.1:8000
```

`DAMIR.bat` refuse de démarrer si `app\backend\.venv\Scripts\python.exe` ou
`app\frontend\dist\index.html` manquent, et renvoie vers `preparer.bat`. Aucune
ligne de commande n'est demandée à l'utilisateur.

`preparer.bat` en quatre étapes : venv Python → `npm install` → `npm run build`
→ `tools/build_cube_compact.py` (ignoré si le cube source est absent). Il
n'installe **que** `requirements.txt` : il prépare le poste d'un manager, pas
celui d'un développeur.

### Développement

```bash
# Interface — depuis app/frontend
npm run build            # tsc -b && vite build ; doit rester vert
npm run dev              # serveur Vite sur :5173, proxy /api → 127.0.0.1:8000

# Serveur — depuis app/backend
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt   # ajoute pytest
.venv/Scripts/python.exe -m pytest                                # 54 tests
python -m uvicorn app.main:app --reload                           # serveur seul
```

En développement, deux processus tournent : Vite sert l'interface sur `:5173` et
proxifie `/api` vers Uvicorn sur `:8000`. En production locale, **un seul
processus** : FastAPI sert l'API *et* le `dist/` construit, monté en
`StaticFiles` sur `/` (`main.py:1170`).

`run.py` (34 lignes) lance Uvicorn et ouvre le navigateur ; il sonde
`/api/health` avant d'ouvrir.

### Variables d'environnement reconnues

Toutes optionnelles ; elles servent aux tests et à des déploiements décalés.

| Variable | Effet | Défaut |
|---|---|---|
| `DAMIR_DATA_DIR` | racine des données | `<projet>/data` |
| `PATHOLOGIES_DATA_PATH` | Parquet Cartographie | `data/pathologies/effectifs.parquet` |
| `CSP_DATA_PATH` | Parquet CSP (force la source) | découverte automatique |
| `CSP_GEOJSON_PATH` | fond de carte | `data/pathologies/regions.geojson` |
| `POPULATION_DATA_PATH` | Parquet population Insee | `data/population/population.parquet` |
| `MORTALITY_DATA_PATH` | source mortalité | Parquet si présent, sinon le `.xlsx` |

---

## 3. Carte du dépôt

```
Outil_DAMIR_V1/
├── DAMIR.bat                    lancement (Windows)
├── preparer.bat                 installation et construction
├── CLAUDE.md                    principes non négociables du dépôt
├── PRODUCT.md                   public, positionnement, principes produit
├── DESIGN.md                    le système visuel tel qu'il est bâti
├── MISSION_3_BLOCS.md           feuille de route en cours (racine)
├── docs/
│   ├── PROGRESS.md              journal des phases livrées (fait / écarté / décidé)
│   ├── missions/                MISSION_V1_V2 … V5, archivées
│   └── sources/                 originaux Word, non versionnés
├── data/                        ~1,3 Go — jamais modifié par l'application
├── tools/                       7 scripts de fabrication des données, hors runtime
└── app/
    ├── LISEZMOI.md              ← ce document
    ├── backend/                 7 962 lignes Python
    │   ├── run.py
    │   ├── requirements.txt · requirements-dev.txt
    │   ├── app/                 14 modules
    │   └── tests/               4 fichiers, 54 tests
    └── frontend/                22 564 lignes TS/TSX/CSS
        ├── index.html · vite.config.ts · tsconfig*.json · package.json
        └── src/                 80 fichiers
```

### Détail de `app/backend/app/`

| Fichier | Lignes | Rôle |
|---|---:|---|
| `main.py` | 1 171 | `DamirRepository` (DuckDB), les 37 routes, les exports Excel |
| `analysis.py` | 407 | `METRICS`, `DIMENSIONS`, `FilterPayload`, `cube_where`, extraction DAMIR |
| `explore.py` | 438 | moteur générique : composantes brutes + `FORMULAS` |
| `panorama.py` | 449 | sujets × facettes en un balayage (`GROUPING SETS`) |
| `correlations.py` | 1 200 | vocabulaire commun des 5 sources, corrélation, régression |
| `studio.py` | 320 | `methodology()` + cadence de liquidation |
| `pivot.py` | 213 | le Tableau : croisé à deux dimensions, composantes brutes |
| `csp.py` | 530 | base CSP (Insee, recensement) |
| `population.py` | 455 | base Population (Insee) + dénominateur de référence |
| `pathologies.py` | 416 | base Cartographie (Cnam) |
| `mortality.py` | 326 | base Mortalité (CépiDc) |
| `glm.py` | 287 | modèle linéaire généralisé par IRLS, écrit à la main |
| `statistics.py` | 191 | Pearson, Spearman, Student, Fisher, écrits à la main |
| `cache.py` | 75 | cache disque indexé sur une empreinte des fichiers source |

### Détail de `app/frontend/src/`

```
App.tsx              routeur maison + coquille (barre latérale, barre du haut)
main.tsx             point d'entrée, applique la palette AVANT le premier rendu
api.ts               toute la couche réseau (453 l.)
types.ts             contrats de données (435 l.)
utils.ts             formatage FR, filtres ↔ URL, CSV (153 l.)

charts/              le moteur graphique, partagé par tout le produit
  EChart.tsx           le SEUL composant graphique (233 l.)
  buildOption.ts       13 formes, fonctions pures (887 l.)
  mapOption.ts         la carte choroplèthe partagée
  frenchMap.ts         chargement du GeoJSON, mémorisé
  tokens.ts            lecture des jetons CSS au runtime
  palette.ts           bascule rouge/bleu
  reading.ts           le vocabulaire « lecture » (titre, réserves, formes, tableau)
  compareReading.ts    le gabarit « Comparer », commun aux bases

components/          briques partagées
  ChartShell · ScopeBar · AdvancedFilterPanel · CompareRail · SeriesRail
  SeriesDrawer · ExportPngButton · CopyLinkButton · ThemeToggle · PageHero
  KpiStrip · MultiSelect · ChoiceSelect · PaletteChoice · SearchableCauseSelect

damir/               PanoramaSection · CompareSection · legacyCompare
panorama/            model · slides (le modèle qui décide des formes) · charts · exportSlide
explore/             model (dérivation des indicateurs) · SeriesPicker · seriesScope
pathologies/  csp/  mortality/  population/     model + section + 2 sections React
correlations/        GuidedPanel (routé) · RegressionPanel · AdvancedCross (NON routé)
pivot/               model (agrégations, teinte, tri)
methodology/         denominators (33 lignes de dénominateurs, écrites à la main)
pages/               9 fichiers, un par écran
theme.css            LA source des couleurs (361 l.)
styles.css           l'héritage (2 214 l.) — voir §16
explore.css · panorama.css · correlations.css · methodology.css
components/*.css     4 feuilles adossées aux jetons
```

**Règle d'organisation, respectée partout** : chaque base sépare **le modèle**
(`*/model.ts` — ce que la base sait dire, ses réserves, les formes licites) des
**builders de graphiques** (fonctions pures qui rendent une option ECharts à
partir de lignes typées et de jetons de couleur). Aucun composant React ne
contient de règle statistique.

---

## 4. Les données

Cinq bases, plus deux fichiers d'appoint. **Rien n'est jamais modifié par
l'application** : `data/` est en lecture seule au runtime.

### Inventaire vérifié

| Fichier | Taille | Lignes | Colonnes |
|---|---:|---:|---|
| `cube_damir.parquet` | 1,09 Go | ~45 M | source de vérité, grain mois |
| `cube_damir_compact.parquet` | 117 Mo | **5 762 787** | 15 : `soi_ann, prs_nat, asu_nat, age, sexe, region, env, ald, rem, dep, depas, qte, rem_ref, bse_ref, rem_neg` |
| `cube_delais.parquet` | 13 Mo | **1 821 268** | 5 : `soi_ann, soi_moi, flx, prs_nat, rem` |
| `pathologies/effectifs.parquet` | 49 Mo | **5 796 000** | 16, dont `ntop` (patients), `npop` (population de référence), `dept`, `cla_age_5` |
| `csp/csp_core.parquet` | 12,7 Mo | **696 159** | 20, dont `effectif` (pondéré IPONDI), `population_reference` |
| `population/population.parquet` | 93 Ko | **33 480** | 9, dont `age_90_plus_agrege` |
| `mortalite/mortalite_core.parquet` | 19 Ko | **5 160** | 13, dont `is_detail`, `cause_order` |
| `prs_nat_transco.csv` | 152 Ko | **1 630** | `prs_nat, libelle, grand_poste, poste, sous_poste` |
| `pathologies/regions.geojson` | 1,1 Mo | — | fond de carte régional |

Le cube compact porte **1 342 prestations distinctes** et les années
**2014 → 2025** ; `/api/meta` filtre ensuite aux années dont le remboursement
atteint au moins 1 % du maximum, ce qui donne en pratique 2015–2024.

### Les cinq bases, et ce qu'elles ne peuvent pas dire

| Base | Producteur | Grain | Limite structurante |
|---|---|---|---|
| **Open DAMIR** | Assurance Maladie | année × prestation × région × âge × sexe × assurance × enveloppe × ALD | aucune population exposée : pas de fréquence ni de coût par assuré. Les quantités ne sont pas homogènes entre prestations. Les dernières années sont incomplètement liquidées. |
| **Cartographie des pathologies** | Cnam | année × pathologie × âge quinquennal × sexe × territoire | effectifs < 10 masqués à la source. Une personne compte dans plusieurs pathologies. Aucune dépense. |
| **CSP (recensement)** | Insee | millésime × région × âge × sexe × CSP (6 ou 29 postes) | champ = actifs **ayant un emploi** (TACT = 11). Effectifs pondérés. Rupture de nomenclature PCS 2003 → PCS 2020 sur les 29 postes. |
| **Mortalité** | INSERM–CépiDc | année × cause × 6 périmètres de population | **source nationale** : aucune région, aucune population de référence — donc jamais de taux de mortalité. Blocs sexe et âge publiés séparément : aucun croisement sexe × âge. |
| **Population** | Insee | année × région × sexe × âge quinquennal | population au **1er janvier**, pas une moyenne annuelle. Métropole seule avant 1990, Mayotte à partir de 2014. Régions rétropolées sur les 13 actuelles depuis 1975. |

### Le cube compact

`tools/build_cube_compact.py` agrège le cube brut **à l'année**. Justification
écrite dans le script : aucune requête de l'application n'utilise le mois de
soins (le seul écran qui raisonne en mois — la cadence de liquidation — lit le
cube des délais), et les colonnes `bse`/`nb` ne sont lues nulle part.

Résultat : **45 M → 5,76 M lignes, 1,09 Go → 117 Mo**, strictement équivalent,
requêtes ramenées de ~2 s à quelques centaines de millisecondes.

`DamirRepository._resolve_cube()` (`main.py:330`) compare les dates de
modification : **si le compact est plus ancien que le brut, il lit le brut** et
l'écrit dans la console. Le dérivé ne prend jamais le pas sur sa source.

### Les scripts de fabrication (`tools/`, hors runtime)

| Script | Lignes | Produit |
|---|---:|---|
| `build_cube_compact.py` | 110 | le cube compact |
| `build_csp_dataset.py` | 465 | jeu CSP depuis les fichiers détail du recensement |
| `build_csp_core.py` | 320 | `csp_core.parquet` consolidé |
| `build_population.py` | 288 | `population.parquet` depuis le classeur Insee |
| `build_mortality_core.py` | 85 | `mortalite_core.parquet` depuis le classeur CépiDc |
| `rapport_qualite.py` | 191 | classeur de contrôle qualité (inconnus, négatifs, hors-transco) |
| `calage_damir.py` | 129 | classeur de calage contre la statistique officielle Cnam |
| `download_insee_sources.ps1` | — | téléchargement des sources Insee |

`build_population.py` mérite d'être lu : il **vérifie la structure** des
53 onglets avant de lire une valeur, recalcule le bloc « Ensemble » par somme
des sexes et contrôle qu'il retrouve le total publié (zéro écart sur 936 lignes
région × année), écarte les agrégats (`France métropolitaine`, `DOM`) qui
compteraient deux fois les mêmes personnes, et marque en `age_90_plus_agrege`
les 144 cellules d'outre-mer où l'âge n'est pas détaillé au-delà de 90 ans.

> ⚠️ `tools/rapport_qualite.py` importe **pandas**, qui n'est ni dans
> `requirements.txt` ni dans `requirements-dev.txt`. C'est un script hors
> runtime, lancé à la demande ; il ne casse rien mais ne s'exécutera pas sur un
> poste préparé par `preparer.bat`.

---

## 5. Le serveur

### `DamirRepository` — la couche d'accès

Instancié une fois au démarrage du module (`main.py:410`). Il lève une
`RuntimeError` si `cube_damir.parquet` ou `prs_nat_transco.csv` manquent —
ce sont les deux seules données obligatoires. **Tout le reste est optionnel** et
dégrade proprement : `has_delays`, `has_pathologies`, `has_csp`,
`has_population`, `has_mortality`. Une base absente fait disparaître son écran,
elle ne fait pas tomber l'application.

Réglages DuckDB posés à la connexion :

```python
SET threads = max(2, min(cpu_count, 8))
SET enable_object_cache = true
SET preserve_insertion_order = false
```

**Tout est en vue, rien n'est chargé en mémoire** :

```sql
CREATE VIEW cube        AS SELECT * FROM read_parquet('…cube_damir_compact.parquet')
CREATE VIEW delays      AS SELECT * FROM read_parquet('…cube_delais.parquet')
CREATE VIEW pathologies AS SELECT * FROM read_parquet('…effectifs.parquet')
CREATE VIEW csp         AS SELECT * FROM read_parquet([…], union_by_name = true)
CREATE VIEW population  AS SELECT * FROM read_parquet('…population.parquet')
CREATE VIEW mortality   AS SELECT … FROM read_parquet('…mortalite_core.parquet')
```

**Une seule exception** : `transco` (152 Ko) est matérialisée en `CREATE TABLE`
puis `ANALYZE`, parce qu'elle est jointe à presque chaque requête.

La vue `mortality` normalise à la volée les codes de population
(`age_0_64` → `0-64`). Si le Parquet est absent, `_mortality_rows()` lit le
classeur Excel et matérialise une table — repli qui permet à un dépôt frais de
démarrer avant la conversion.

**Concurrence** : `query()` crée **une connexion DuckDB par thread**
(`threading.local` + `cursor()`), sous verrou uniquement à la création. Les vues
et `transco` restent partagées. Les requêtes HTTP en lecture ne sont donc pas
sérialisées. C'est testé (`test_studio.py::test_repository_supports_parallel_readers`).

### Le contrat central : composantes brutes + formules

`explore.py` définit sept composantes additives :

```python
COMPONENTS = ("rem", "dep", "depas", "qte", "bse_tm", "rem_tm", "rem_neg")
```

`bse_tm` et `rem_tm` sont les variantes « ticket modérateur » : elles
neutralisent les six grands postes sans base de remboursement
(`POSTES_SANS_BASE`), faute de quoi le ticket modérateur ressort artificiellement
négatif.

`FORMULAS` (`explore.py:102`) écrit chaque indicateur comme
`facteur × (Σ numérateur) / (Σ dénominateur)`, chaque terme portant son signe.
**Cette table est envoyée telle quelle au client**, qui l'évalue avec le même
code générique (`explore/model.ts::evaluate`). La formule n'existe donc qu'à un
seul endroit, et changer d'indicateur à l'écran ne déclenche aucune requête.

Règle inscrite dans les deux implémentations : **un ratio sans dénominateur
renvoie `None` / `null`, jamais 0.**

### Les douze indicateurs DAMIR

| Clé | Libellé | Famille | Additif | Réserve portée par le code |
|---|---|---|:---:|---|
| `reimbursed` | Montant remboursé | Dépenses | ✅ | — |
| `expense` | Dépense présentée | Dépenses | ✅ | — |
| `out_of_pocket` | Reste à charge après AMO | Dépenses | ✅ | pas le reste à charge final après complémentaire |
| `copayment` | Ticket modérateur | Avancé | ✅ | non pertinent sans base de remboursement |
| `excess_fees` | Dépassements | Dépenses | ✅ | — |
| `quantity` | Volume de la prestation | Activité | ✅ | unités hétérogènes entre prestations |
| `average_reimbursed` | Remboursement moyen par unité | Montants moyens | ❌ | ni coût par patient ni tarif ; dépend du mix |
| `average_expense` | Dépense moyenne par unité | Montants moyens | ❌ | idem |
| `coverage` | Taux de prise en charge AMO | Prise en charge | ❌ | une évolution agrégée peut n'être qu'un effet de structure |
| `negative` | Régularisations négatives | Avancé | ✅ | — |
| `gross_reimbursed` | Remboursé hors régularisations | Avancé | ✅ | — |
| `negative_share` | Part des régularisations | Avancé | ❌ | — |

### Les onze dimensions de découpage

`year` · `grand_post` · `post` · `sub_post` · `service` · `region` · `age` ·
`sex` · `insurance` · `envelope` · `ald`.

La hiérarchie des prestations n'est **pas** un arbre chargé d'un coup : c'est
une cascade de filtres. `GET /api/options?grand_post=&post=&sub_post=` renvoie
les niveaux disponibles, et les composants désactivent le niveau N+1 tant que N
n'est pas choisi.

```sql
grand_post → COALESCE(t.grand_poste, 'Autres')
post       → COALESCE(t.poste, 'Non classé')
sub_post   → COALESCE(t.sous_poste, 'Non classé')
service    → c.prs_nat  (+ jointure libellé)
```

> ⚠️ **Trois « autres » distincts, à ne jamais confondre.**
> 1. `COALESCE(t.grand_poste, 'Autres')` — les prestations sans correspondance
>    dans la table de transcodage. C'est une **modalité réelle** du découpage.
> 2. `OTHER_KEY = "__other__"` — le repli au-delà de `MAX_BUCKETS = 60`
>    modalités, pour que les totaux restent exacts.
> 3. Le **complément de sélection** dans les sélecteurs de séries, nommé
>    « Reste du périmètre · N modalités » et éteint par défaut.

### Filtrage : SQL paramétré, sans exception

`cube_where(payload)` (`analysis.py:168`) construit un `WHERE` **paramétré**
(`?`), jamais par concaténation de valeurs utilisateur. Deux options :
`ignore_sex` et `exclude_base_less` (ce dernier retire les postes sans base de
remboursement quand la mesure est le ticket modérateur).

### `panorama.py` — trois facettes en un balayage

`_facet_rows()` produit les découpages région, âge et sexe **en une seule
requête** via `GROUP BY GROUPING SETS`. Le commentaire du code explique
pourquoi : interroger facette par facette relisait le même cube autant de fois,
et la troisième lecture coûtait déjà sept fois la première (DuckDB n'a plus de
mémoire à consacrer au cache une fois les précédentes installées). `GROUPING()`
indique de quel découpage provient chaque ligne — information qu'on ne peut pas
déduire des `NULL`, puisqu'une région « non renseignée » est une modalité
réelle, pas une absence.

**L'indice de spécialisation** (`LOCATION_QUOTIENT`) est ce qui rend deux cartes
comparables :

```
indice[r, s] = 100 × (v[r, s] / v[·, s]) / (v[r, ·] / v[·, ·])
```

soit « la part de la région dans le sujet, rapportée à sa part dans le
périmètre ». 100 = le territoire recourt à hauteur de son poids. Le dénominateur
vient du **référentiel** (`reference_block`), calculé sur le périmètre sans
restriction aux sujets — d'où sa mise en cache séparée, qui fait tomber le geste
central de l'écran (ajouter une prestation) d'un balayage complet à une requête
filtrée.

### `correlations.py` — le vocabulaire commun des sources

Le module établit ce qui rend cinq bases hétérogènes croisables, et **affiche
bruyamment** ce que cela coûte.

**Douze régions communes** (`COMMON_REGIONS`) : DAMIR ne porte pas la Corse et
agrège les DOM sous un code unique. Retenir les autres produirait des
appariements faux plutôt que des observations manquantes.

**Quatre unités d'observation** :

| Unité | Points | Sources ouvertes |
|---|---:|---|
| `region_age_sex` | 192 cellules | DAMIR, Pathologies, CSP |
| `region_year` | région × année | DAMIR, Pathologies, CSP |
| `region` | 12 | DAMIR, Pathologies, CSP |
| `year` | ~10 | les quatre, **seul axe ouvert à la mortalité** |

**Projection des âges** : DAMIR est décennal, la Cartographie en bandes de cinq
ans, la CSP en âge révolu. Les trois sont projetés sur la tranche décennale, le
plus grossier des trois donc le seul commun. La mortalité (0-64 / 65-84 / 85+)
ne s'y ramène pas et reste hors de cet axe — le module lève une `ValueError`
explicite si on essaie.

**Le dénominateur des taux** : `_population()` prend la **population résidente
Insee** quand `population.parquet` est chargé, et retombe sur la population de
référence de la Cartographie sinon. `denominator_label()` dit laquelle a servi
et **l'écran l'écrit**. Ce n'est pas un détail : les deux ne mesurent pas la
même chose (résidents d'un territoire vs assurés protégés par la Cnam), et
l'écart médian mesuré sur les douze régions est de −1,8 %, de −5,9 % à +2,6 %.

`_insee_population()` calcule des **années-personnes** : la population de
l'année est la demi-somme des 1er janvier N et N+1, et le dénominateur cumule
les moyennes annuelles sur toute la période. Sans cela, quatre ans de dépenses
seraient rapportés à une seule année de population. Sur la dernière année
disponible, N+1 manque et le 1er janvier sert seul — la réserve le dit.

`_cartography_population()` porte un commentaire d'incident précieux : la table
de la Cartographie est **départementale et porte ses propres agrégats**
(`dept = '999'` = total régional, `cla_age_5 = 'tsage'` = tous âges,
`sexe = '9'` = tous sexes). Mélanger un agrégat avec les cellules qu'il résume
comptait deux fois la même population — l'Île-de-France pesait 25,3 millions
d'habitants au lieu de 12,5. Cinq tests verrouillent désormais ces nombres.

**Neuf indicateurs au catalogue**, chacun marqué `rate: true/false` :
dépense par habitant, taux de prise en charge, remboursement moyen par acte,
dépense totale, prévalence, patients, part CSP, décès, décès pour 100 000.
Le drapeau `rate` sert à produire un avertissement `critical` quand on croise
deux effectifs — leur corrélation ne mesurerait que la taille des régions.

**Les avertissements typés** (`critical` / `warning` / `info`) sont produits par
le serveur, pas par l'interface : nommage du dénominateur, deux effectifs
croisés, moins de 20 observations avec le `|r|` minimal détectable, deux séries
annuelles qui progressent, non-indépendance des années d'une même région,
divergence Pearson/Spearman > 0,25, et **toujours** la garde du sophisme
écologique.

### `studio.py` — fiabilité et méthodologie

Six « questions » : `evolution`, `comparison`, `juxtaposition`, `liquidation`,
`decomposition`, `calculator`. Chacune renvoie la même forme de réponse (titre,
type de graphique, séries, barres, résumé, tableau, avertissements).

Points notables :

- **`_points_total`** ne somme les points annuels que si la mesure est additive ;
  sinon il relance une agrégation sur tout le périmètre. Un taux moyen n'est pas
  la moyenne des taux annuels. C'est testé.
- **`_juxtaposition`** refuse de calculer un faux écart entre deux unités
  différentes : il passe en base 100 et le dit en réserve.
- **`reliability_metadata`** dérive la **cadence de liquidation** du cube des
  délais : courbe cumulée par mois d'écart, seuils 50/90/95/97 %, et une année
  « consolidée jusqu'à » calculée à partir du seuil 97 %. C'est cette valeur qui
  alimente la puce « en consolidation » sur DAMIR.
- **`methodology()`** compose la fiche des **cinq** sources avec, pour chacune,
  producteur, granularité, période réelle lue dans les données, dimensions,
  badges, et une liste de limitations écrites en toutes lettres.

### Gestion des erreurs

Motif uniforme, sans exception :

```python
# module métier
raise ValueError("Message en français destiné à l'utilisateur.")

# route
except ValueError as exc:
    raise HTTPException(status_code=422, detail=str(exc)) from exc
```

Côté client, `api.ts` lit `detail` et le remonte tel quel dans l'interface. Les
métadonnées d'une base absente renvoient un **404** plutôt qu'un 422.

---

## 6. L'API — les 37 routes

`GET` et `POST` uniquement. CORS ouvert aux seules origines de développement
(`localhost:5173`, `127.0.0.1:5173`). Un middleware pose `no-store` sur l'HTML
et `immutable, max-age=31536000` sur `/assets/`.

### Transverse

| Route | Rôle | Cache |
|---|---|---|
| `GET /api/health` | sonde, utilisée par `run.py` | — |
| `GET /api/meta` | métadonnées globales : années, grands postes, régions, 12 mesures, modalités de population, fiabilité | `lru_cache(1)` + **cache disque** |
| `GET /api/options` | cascade hiérarchique des prestations | `lru_cache(128)` |
| `GET /api/methodology` | dictionnaire des mesures et fiches des 5 sources | — |

### DAMIR

| Route | Rôle | Cache |
|---|---|---|
| `POST /api/explore` | agrégation générique par dimension | `lru_cache(64)` |
| `POST /api/explore/options` | modalités classées par poids + recherche | `lru_cache(32)` sur le **seul périmètre** |
| `POST /api/panorama` | sujets × facettes en un balayage | `lru_cache(64)` + référentiel en `lru_cache(16)` |
| `POST /api/pivot` | le croisé à deux dimensions : composantes brutes + formules | `lru_cache(32)` |

Astuce notable sur `/api/explore/options` : la clé de cache neutralise `query`
et `limit`, de sorte que **la frappe au clavier ne relance aucun balayage** —
seul le filtrage en Python est repayé.

### Croisements

| Route | Rôle | Cache |
|---|---|---|
| `GET /api/correlations/meta` | catalogue : unités, 9 indicateurs, pathologies, groupes CSP, causes, tranches, régions, facteurs | `lru_cache(1)` |
| `POST /api/correlations` | corrélation appariée + verdict + avertissements | `lru_cache(64)` |
| `POST /api/correlations/regression` | GLM | `lru_cache(64)` |

### Les cinq bases

| Base | Routes |
|---|---|
| Pathologies | `GET /meta` · `POST /overview` · `POST /extraction/preview` · `POST /extraction.csv` · `POST /extraction.xlsx` |
| CSP | `GET /meta` · `POST /overview` · **`POST /evolution`** · `POST /extraction/preview` · `.csv` · `.xlsx` · `GET /regions.geojson` |
| Mortalité | `GET /meta` · `POST /overview` · `POST /extraction/preview` · `.csv` · `.xlsx` |
| Population | `GET /meta` · `POST /overview` · `POST /extraction/preview` · `.csv` · `.xlsx` |
| DAMIR | `POST /api/extraction/preview` · `POST /api/extraction.csv` · `POST /api/extraction.xlsx` |

`GET /api/csp/regions.geojson` sert le fond de carte : il est consommé par la
page CSP **et** par `charts/frenchMap.ts` pour toutes les cartes du produit.

### Service de l'interface

`GET /assets/{asset_name}` sert les fichiers hachés et **récupère
transparemment un HTML périmé** : si le nom exact n'existe plus, il cherche le
fichier le plus récent portant le même nom logique et le sert en `no-store`
avec l'en-tête `X-DAMIR-Asset-Recovered: 1`. Côté client, `lazyPage` recharge la
page une fois sur échec de chunk. Les deux mécanismes couvrent le cas d'un
utilisateur laissant l'onglet ouvert pendant qu'on reconstruit l'interface.

> ⚠️ La liste `logical_names` (`main.py:1102`) mentionne encore `ExplorePage` et
> `vendor-plotly`, qui n'existent plus, et **ne mentionne pas** `PopulationPage`
> ni `CorrelationsPage`. Sans conséquence fonctionnelle (le chemin nominal
> fonctionne), mais la récupération ne couvre pas les nouveaux écrans.

### Préchauffage au démarrage

`@app.on_event("startup")` lance un **fil démon** qui calcule les métadonnées,
la première vue d'exploration et le classement des 1 342 prestations pendant que
le navigateur s'ouvre (≈ 1 s autrement perdue). Toute exception y est avalée et
imprimée : un préchauffage ne doit jamais tuer le serveur.

> ⚠️ `on_event` est déprécié par FastAPI au profit des gestionnaires `lifespan`.
> La suite de tests émet le `DeprecationWarning` ; le code fonctionne.

---

## 7. Les statistiques

Tout est **écrit à la main**, sans NumPy ni SciPy. Le motif est assumé et
documenté : l'installation doit rester un double-clic.

### `statistics.py` — corrélation

| Élément | État | Vérification |
|---|:---:|---|
| Pearson | ✅ | testé contre le quartet d'Anscombe |
| Spearman (rangs moyens pour les ex æquo) | ✅ | testé |
| p-value bilatérale de Student | ✅ | via la bêta incomplète régularisée (fraction continue de Lentz), testée contre tables |
| Intervalle de confiance à 95 % | ✅ | transformation z de Fisher ; testé, reste dans [−1, 1] |
| R² | ✅ | — |
| Droite de régression | ✅ | testé contre valeur publiée |
| `minimum_detectable_r` | ✅ | recherche dichotomique, testée contre seuils publiés |

`minimum_detectable_r(n)` est l'outil d'honnêteté du module : sur douze régions,
il vaut mieux afficher le `|r|` en deçà duquel on ne pourra rien conclure que de
laisser croire à une absence d'effet.

**Aucune de ces fonctions ne décide si une corrélation « existe ».** Elles
renvoient le coefficient, son intervalle et `n` ; c'est l'appelant qui pose les
avertissements et l'utilisateur qui conclut.

### `glm.py` — modèle linéaire généralisé

Moindres carrés repondérés itératifs (IRLS), élimination de Gauss avec **pivot
partiel** (sans lui, deux variables fortement corrélées produisent un pivot
minuscule et une solution absurde).

| Élément | État |
|---|:---:|
| Famille gaussienne / lien identité | ✅ |
| Famille Gamma / lien log | ✅ |
| Famille Poisson / lien log | ✅ |
| Choix automatique de la loi (`default_family`) — **proposé, jamais imposé** | ✅ |
| Écarts-types, statistique de Wald, p-values | ✅ dispersion par χ² de Pearson, covariance = disp × (XᵀWX)⁻¹ |
| Pseudo-R² de McFadden sur la déviance | ✅ |
| Facteurs catégoriels (âge, sexe, région) en indicatrices avec niveau de référence | ✅ dans `correlations.py` |
| Intervalles de confiance des effets | ✅ calculés sur l'échelle du coefficient **puis** transportés |
| Détrend (retrait de la tendance annuelle) | ✅ |
| **Erreurs-types robustes / clustering** | ❌ **non implémenté** — les p-values sur `region_year` sont optimistes, l'écran le signale sans corriger |
| Détection de colinéarité (VIF) | ❌ |
| Sélection automatique de variables | ❌ (délibérément) |
| Diagnostics de résidus | ❌ |
| Interactions, splines, offsets | ❌ |

Le module refuse explicitement et en français : `n <= p`, réponse négative ou
nulle sous Gamma/Poisson, matrice singulière, non-convergence après 60
itérations.

**Vérification** : `tests/test_glm.py` (183 lignes) ajuste les trois familles sur
données simulées et contrôle que les coefficients retrouvés et leurs intervalles
à 95 % couvrent les valeurs vraies — y compris la lecture en pourcentage que
`correlations.py` dérive du lien log.

### Ce que la doctrine du module dit de lui-même

`glm.py` l'écrit en tête : « Ce n'est pas un logiciel de modélisation : c'est une
première lecture, dont le résultat est rendu en français et dont les limites
sont dites avec lui. »

---

## 8. L'interface — socle technique

### Routage : maison, 40 lignes

Pas de react-router. `App.tsx` lit `?page=` dans l'URL, écoute `popstate`,
navigue par `history.pushState`. Neuf clés de page. Les anciennes adresses
(`page=analysis`, `page=explore`, `page=panorama`) redirigent vers `damir`.

Chaque page est chargée en `lazy()`, préchargée au survol et au focus du bouton
de navigation, entourée d'un `PageErrorBoundary` qui propose un rechargement, et
protégée par une reprise automatique en cas de chunk périmé (drapeau en
`sessionStorage` pour éviter la boucle de rechargement).

La navigation passe par la **View Transitions API** quand elle est disponible et
que `prefers-reduced-motion` ne l'interdit pas.

### L'état vit dans l'URL

Il n'y a **aucun store global** : `useState` local uniquement, sur trois
niveaux.

1. `App.tsx` — page courante, métadonnées, thème, repli de la barre latérale,
   source d'extraction.
2. La coquille de chaque écran — le périmètre partagé, la mesure, la section.
3. Chaque section — sa lecture, ses formes, ses séries.

Chaque écran écrit ses paramètres par `history.replaceState` et les relit au
montage. **Répartition des responsabilités** : la coquille n'écrit que ce qui
est commun aux sections, chaque section ajoute sa part. Un lien partagé rouvre
donc la bonne section sur le bon périmètre, dans la bonne forme.

Le bouton « Copier le lien » de la barre du haut (`CopyLinkButton`) est ce qui
rend cette promesse utilisable. La palette (`palette=blue`) voyage aussi dans
l'adresse, et les écrans qui réécrivent leur URL de bout en bout la reportent
explicitement — sans quoi ils l'effaceraient.

### Motifs récurrents dans les composants

- **Fetch** : `AbortController` + drapeau `live`/`active` pour ignorer une
  réponse périmée.
- **`fetchKey = JSON.stringify(request)`** comme dépendance d'effet, pour ne
  relancer que sur un vrai changement.
- **Popovers** : l'écouteur `pointerdown` sur `document` est posé à la **frame
  suivante**, sinon le clic d'ouverture le déclenche lui-même. Le piège est
  commenté à chaque occurrence.
- **`stale`** : pendant une requête, le tracé précédent passe à 50 %
  d'opacité — pas de squelette, donc pas de saut de mise en page.

### Débounce

`ScopeBar` tient un **brouillon** : les cases se cochent sans délai, mais la
requête ne part qu'après 250 ms d'immobilité. Un changement venu d'ailleurs (un
clic sur la carte, une réinitialisation) l'emporte sur le brouillon en cours et
annule ce qui n'est pas parti.

### Découpage du bundle (mesuré)

| Chunk | Brut | Gzip |
|---|---:|---:|
| `vendor-echarts` | 713,8 ko | 243,6 ko |
| `vendor-react` | 192,4 ko | 60,3 ko |
| `DamirPage` | 60,2 ko | 19,8 ko |
| `BenchmarksPage` | 37,1 ko | 9,9 ko |
| `ExtractionPage` | 28,6 ko | 6,5 ko |
| `index` | 24,1 ko | 7,4 ko |
| `PathologyPage` | 23,0 ko | 8,3 ko |
| `CspPage` | 22,0 ko | 8,0 ko |
| `MortalityPage` | 17,5 ko | 6,4 ko |
| `CorrelationsPage` | 17,4 ko | 5,9 ko |
| `PopulationPage` | 11,9 ko | 4,8 ko |
| `MethodologyPage` | 15,1 ko | 4,7 ko |
| CSS | 130 ko env. | — |

Vite avertit sur `vendor-echarts` (> 500 ko). C'est le prix d'un moteur
graphique unique et il est assumé : ECharts est chargé une fois pour tout le
produit, et l'ancienne coexistence avec Plotly (2,4 Mo) a été supprimée.

---

## 9. Le système graphique

**Un seul moteur : ECharts 6.1, partout.** Il n'y a plus aucune seconde
bibliothèque graphique dans le produit.

### `charts/EChart.tsx` — le seul composant graphique

Il enregistre à la main les modules nécessaires (tree-shaking) : `Bar`,
`Custom`, `Heatmap`, `Line`, `Map`, `Pie`, `Scatter`, plus `Tooltip`, `Grid`,
`VisualMap`, `Graphic`, `MarkLine`, `AxisPointer`, `Dataset`, **`LabelLayout`**,
**`UniversalTransition`**, `CanvasRenderer`.

> Les deux derniers ne sont pas là par défaut dans une construction élaguée.
> Sans eux, `universalTransition` et `labelLayout` sont **ignorés en silence** :
> les formes basculent d'un coup et les étiquettes se chevauchent au lieu de
> s'effacer. Le piège a été rencontré dans ce projet.

**Transitions.** `setOption(…, { notMerge: true, lazyUpdate: true })`.
`notMerge` est nécessaire (le nombre et le type des séries changent d'une
lecture à l'autre), mais seul il fait basculer d'un coup sec. `withMorphing()`
injecte donc `universalTransition: { enabled, seriesKey, divideShape: "clone" }`
sur chaque série sauf `map` et `custom` — une carte n'a pas de marque à
rattacher à une barre. `divideShape: "clone"` étend l'enchaînement au changement
de **lecture**, pas seulement de forme.

**Le bug de palette, corrigé et documenté.** Quand seules les couleurs changent,
l'appariement de la transition universelle est parfait — et ECharts **garde les
éléments existants avec leur style**. Le tracé restait rouge après un passage au
bleu. `EChart` compare donc une « époque de style » (`data-palette` +
`data-theme`) et, si elle a changé, rejoue l'option **sans appariement** et
ferme l'infobulle ouverte.

**`prefers-reduced-motion`** coupe à la fois l'animation ECharts et la
transition universelle — un mouvement bref reste un mouvement.

**Redimensionnement** : `ResizeObserver` + `requestAnimationFrame`. Redimensionner
depuis l'observateur qui mesure ce qu'on redimensionne boucle ; repousser d'une
frame casse le cycle. (Cette boucle a déjà figé le rendu une fois — voir
`docs/PROGRESS.md`, v6.)

**Jamais de `key` React sur un conteneur de graphique** : elle détruit
l'instance et avec elle toute possibilité de transition. C'est la règle 15 de
`DESIGN.md`.

### `charts/buildOption.ts` — treize formes, fonctions pures

```ts
type ChartForm = "line" | "area" | "bar" | "stack" | "share" | "rank" | "slope"
  | "waterfall" | "pie" | "shareArea" | "diverging" | "heatmap" | "pyramid";
```

Aucune option n'est fabriquée dans du JSX. Chaque forme reçoit
`{ form, categories, series, kind, unitLabel, tokens, directLabels, rankBy,
xTitle, markers }` et rend une `EChartsOption`.

Détails qui portent des corrections d'incidents réels, tous commentés :

- **`rankBy`** distingue un classement de *séries* (sur leur dernière valeur —
  la lecture de DAMIR Comparer) d'un classement de *modalités* d'une série
  unique (régions, tranches, causes). Un classement de modalités porte **une
  seule teinte** : la barre encode déjà la grandeur.
- **`markers`** : la courbe garde toutes ses valeurs mais ne pose ses marques
  que sur les positions indiquées. 52 années de population donnaient un
  pointillé illisible.
- Le nom de l'axe des **valeurs** d'une forme horizontale se pose au milieu,
  **sous** l'axe : par défaut ECharts le met en haut à droite, exactement là où
  arrive l'étiquette de la plus longue barre.
- `VALUE_NAME_TOP = 30` : ECharts écrit le nom de l'axe des valeurs **au-dessus**
  de la grille, hors de `containLabel`. Avec 16 px, « % de la population de
  référence Cnam » était coupé horizontalement en deux.
- Les étiquettes de bout de courbe sont bornées à 118 px et effacées quand elles
  se chevaucheraient.

### `charts/mapOption.ts` et `charts/frenchMap.ts`

Le GeoJSON est téléchargé **une seule fois** : la promesse est mémorisée au
niveau module, et les vingt cartes d'une grille comparative partagent le même
téléchargement. `normalize()` projette le code INSEE dans la propriété `name`
qu'ECharts lit pour apparier — sans quoi la carte se dessinerait entièrement en
« pas de donnée » alors que les valeurs sont là.

Deux tables nommées et exportées :

- `OFF_MAP_REGIONS` — codes DAMIR sans territoire à colorier (`99` non
  renseignée, `5` DOM agrégé). Ils **sortent de la carte** et sont énoncés à
  côté, chiffrés : « non renseignée » pèse à elle seule un sixième des
  remboursements.
- `ABSENT_FROM_CUBE` — la Corse, dessinée par le fond mais absente du cube.

La carte encode une magnitude simple, donc une **rampe séquentielle**, jamais la
palette divergente. Un territoire absent de `rows` prend `--map-void` : une
absence n'est pas une valeur basse.

### `charts/reading.ts` et `charts/compareReading.ts` — le vocabulaire commun

Une **lecture** n'est pas un graphique : c'est un graphique **plus ce qui ne
tient pas dedans**. Le type `Reading` porte donc :

```ts
{ key, nav, title, question, caveats[], forms[], form, option,
  table{columns, rows}, ariaLabel, height, empty, legend?, xTitle }
```

`compareReading.ts` porte le **catalogue de vues partagé** par les bases qui
comparent — dix vues, chacune avec sa question et ses conditions :

| Vue | Forme | Lecture | Condition |
|---|---|---|---|
| Courbes | `line` | valeur | — |
| Barres | `bar` | valeur | — |
| Classement | `rank` | valeur | — |
| Base 100 | `line` | index | — |
| Variation | `bar` | change | — |
| Empilé | `stack` | valeur | mesure additive **et** séries de même population |
| Camembert | `pie` | valeur | idem — porte la **dernière période**, jamais le cumul |
| Aires empilées | `shareArea` | valeur | idem + ≥ 2 périodes |
| Écarts | `diverging` | valeur | ≥ 2 périodes |
| Carte de chaleur | `heatmap` | valeur | ≥ 2 périodes **et** ≥ 4 séries |

`offeredViews()` **retire** les vues dont les conditions ne sont pas réunies :
elles n'ont pas de bouton grisé, elles n'ont pas de bouton.

> Le camembert porte la dernière période et non le cumul : DAMIR cumule des
> euros, mais Pathologies, CSP et Mortalité comptent des personnes. Additionner
> dix millésimes d'un stock donnerait 247 millions d'actifs — un nombre qui ne
> désigne rien. La réserve le dit et le centre du camembert nomme la période.

### `panorama/exportSlide.ts` — l'export PNG

Deux règles, valables pour **tous** les écrans :

1. **Format unique, 16:9** — 1600 × 900 logiques à `pixelRatio: 2`. L'image se
   pose dans une diapositive sans recadrage et reste nette une fois projetée.
   La hauteur du graphique à l'écran n'entre pas en compte.
2. **Toujours un fond clair** — le tracé est **re-rendu** dans une instance
   ECharts hors écran avec la palette claire, jamais capturé à l'écran. Un export
   lancé en thème sombre produit exactement la même image qu'en thème clair.
   C'est pourquoi `ExportPngButton` reçoit une *fabrique* d'options
   (`buildOption: (tokens) => EChartsOption`) et non une instance vivante.

`readLightTokens()` (`charts/tokens.ts`) pose temporairement
`data-theme="light"` sur la racine, lit les jetons, puis restaure. La
restitution est synchrone : le navigateur recalcule les styles pour répondre à
`getComputedStyle` mais ne repeint pas avant la fin de la tâche, donc l'écran ne
clignote pas.

L'image composée porte, de haut en bas : le **périmètre** en surtitre, le
**titre** (pré-rempli et modifiable avant génération), le tracé en grand, puis
la **mention de source** et la **date d'export**. `animation: false` est posé sur
l'instance hors écran, sinon la capture attrape le tracé au milieu de son
entrée.

> Les réserves méthodologiques restent à l'écran dans leur tiroir et **ne
> partent plus dans l'image** : l'image va dans une présentation, où un pavé de
> texte sous le graphique fait perdre le graphique. C'est un changement assumé
> par rapport aux versions antérieures.

La copie dans le presse-papiers a été retirée : elle doublait le même geste,
échouait silencieusement selon le navigateur (Firefox et tout contexte non
sécurisé n'ont pas de presse-papiers d'images), et obligeait l'interface à
annoncer laquelle des deux issues avait eu lieu.

---

## 10. Les neuf écrans, en détail

Navigation : barre latérale fixe, repliable (`Ctrl+\`, état en `localStorage`),
quatre groupes.

| Groupe | Entrées |
|---|---|
| **EXPLORER** | DAMIR · Pathologies · CSP · Mortalité · Population |
| **CROISER** | Croisements · Tableau |
| **EXTRAIRE** | Extraire |
| **RÉFÉRENTIEL** | Données & méthode |

La barre du haut porte : le fil « Forsides › contexte », une puce de source
contextuelle, **Copier le lien**, la bascule de thème (système / clair / sombre)
et un avatar « Espace local ». Le pied de la barre latérale affiche l'état de
consolidation venu de `/api/meta`.

**Quatre écrans sur cinq suivent la même coquille à deux sections** :
*Panorama* (un objet, quatre angles) et *Comparer* (plusieurs objets en regard).
Le périmètre et la mesure vivent dans la coquille et suivent d'une section à
l'autre : changer de section est un changement de question, pas de sujet.

---

### 10.1 DAMIR — `pages/DamirPage.tsx`

Coquille à deux sections. Elle possède l'état partagé (`filters`, `measureKey`,
`section`) et normalise les anciens paramètres d'URL **avant** que quoi que ce
soit ne les lise (`damir/legacyCompare.ts`) : un lien vers l'ancienne
« comparaison des prestations » ou l'ancienne « comparaison libre » rouvre
Comparer dans le même état, pas une page vide.

En-tête : amorce « Open DAMIR · Assurance Maladie », titre, puce de statut
(`{année} · en consolidation` si l'année de fin dépasse la consolidation), lien
« Données & méthode → ».

#### Panorama (`damir/PanoramaSection.tsx`, 511 l.)

Une prestation, **quatre lectures**, et c'est le modèle (`panorama/slides.ts`)
qui décide des formes offertes :

| Lecture | Formes | Conditions |
|---|---|---|
| **Évolution** | Courbe · Barres · Aires empilées · Base 100 | Aires : ≥ 2 sujets **et** mesure additive · Base 100 : ≥ 2 sujets |
| **Territoire** | Carte · Classement | toujours (hauteur fixée à 520 px pour les deux) |
| **Âge** | Barres · Barres horizontales · Courbe | toujours |
| **Sexe** | Courbe · Barres · Camembert | Camembert : mesure additive uniquement. À plusieurs sujets, la lecture bascule en classement sur la part des femmes |

Ce que ces lectures portent en plus du tracé :

- **Le sujet est la prestation choisie** — il n'y a plus de « dimension à
  observer » à désigner. Aucune prestation sélectionnée = tout le périmètre
  décrit par la hiérarchie.
- **Huit sujets au plus** (borne de la palette). Au-delà, une note dit combien
  sont comparées à l'écran et rappelle que le périmètre chiffré, lui, porte tout.
- **Trois repères chiffrés** sur une ligne partagée avec le choix de forme :
  dernière année, variation vs année précédente (coloriée), cumul de la période
  (ou « niveau moyen » si la mesure n'est pas additive).
- **Réserves calculées, chiffrées, par lecture** : années en consolidation ;
  « âge inconnu : X % du montant, retiré du profil » ; « sexe non renseigné :
  X % » ; « région non renseignée : X % du total, sans territoire à
  cartographier » ; la Corse dessinée mais non renseignée ; l'avertissement de
  l'indice de spécialisation quand on compare.
- **Navigation aux flèches** ← / → entre les quatre lectures (désactivée dans
  les champs de saisie).
- **Carte cliquable** : un clic sur un territoire restreint l'écran à cette
  région (uniquement à sujet unique, et jamais sur les codes hors carte).
- Sous le graphique, repliés : le **tableau des valeurs** et « **Ce que ce
  graphique ne montre pas** » (réserves de la lecture + avertissements serveur).
- Actions : **Enregistrer en PNG** · **Exporter le CSV** · **Extraire la donnée**.

#### Comparer (`damir/CompareSection.tsx`, 788 l.)

Fusion de deux anciens écrans. La question est posée dans l'ordre où elle se
pose : **selon quoi** comparer, **quelles modalités**, **avec quelle forme**.

**Huit axes de comparaison** : Grands postes · Postes · Sous-postes ·
Prestations · Région · Âge · Sexe · **Année**. « Année » n'est pas une dimension
du serveur : c'est le cas où l'on ne décompose pas, et où l'on compose la
comparaison entièrement avec des séries libres — exactement l'état initial de
l'ancienne comparaison libre, nommé plutôt qu'implicite.

**Dix vues**, chacune affichant **la question à laquelle elle répond** :
Courbes · Barres · Classement · Base 100 · Variation · Camembert · Aires
empilées · Écarts · Carte de chaleur. Les conditions sont les mêmes qu'au §9 —
une vue impossible est retirée, jamais grisée.

**Le bandeau « Ce que je compare »** (`components/CompareRail.tsx`) vit hors du
panneau blanc, entre les filtres et le graphique, sur **une seule ligne** :

- Une puce par série, avec sa pastille de couleur ; les libellés sont tronqués à
  28 caractères et le texte complet reste en infobulle.
- Ce qui ne tient pas se replie dans « **+N autres** », qui ouvre le tiroir.
- **Un clic sur une puce ouvre le réglage de cette série sur place** (popover,
  ou feuille ancrée en bas sous 720 px de large) : le périmètre complet via
  `AdvancedFilterPanel`, le nom éditable, la valeur, « Retirer ».
- La mesure de ce qui tient sur la ligne se fait sur une **rangée fantôme** hors
  écran, qui porte toujours toutes les puces à leur largeur réelle. Mesurer la
  rangée visible faisait osciller le rendu jusqu'à figer l'onglet ; la rangée
  fantôme ne change jamais. L'observateur ne réagit qu'à la **largeur**, jamais
  à la hauteur.

**Le tiroir** (`components/SeriesDrawer.tsx`) est ancré à droite et **pousse la
page** au lieu de la recouvrir : le graphique reste visible à gauche et se met à
jour pendant qu'on modifie. Un seul défilement. `Échap` ferme, le focus est
piégé pendant l'ouverture et revient sur le bouton qui a ouvert. Il porte
`SeriesPicker` : recherche temporisée (180 ms), liste classée **par poids réel**
et non alphabétique, raccourcis « Top 2 / 5 / 8 ».

**Le périmètre par série.** Toute série peut porter son propre jeu de filtres
complet. Une série issue d'une modalité **amorce** son périmètre avec sa
modalité (`scopeForSeries`) — sans quoi régler « Pharmacie » sur les femmes
donnerait *tous les postes, femmes*, et le montant triplerait sans que rien ne
l'annonce. Chaque série ainsi retouchée déclenche **sa propre requête**
`/api/explore`.

**Le nom automatique** d'une série composée est **ce qui la distingue des
autres**, pas la liste de ses filtres : entre « hommes de 60-69 ans » et
« femmes de 20-29 ans », seuls le sexe et l'âge varient, les nommer suffit.

**La période reste commune** — deux axes du temps différents ne se comparent
pas, ils se superposent par accident.

Dès qu'une série porte un périmètre propre, une note le dit et les formes
cumulatives disparaissent.

---

### 10.2 Pathologies — `pages/PathologyPage.tsx`

Source : Cartographie des pathologies (Cnam). Coquille à deux sections ;
millésime, région, âge, sexe et mesure (Prévalence / Patients) vivent dans la
coquille.

**Panorama** — quatre lectures :

| Lecture | Formes | Question posée à l'écran |
|---|---|---|
| Évolution | Courbe · Barres | « Comment cela évolue-t-il dans le temps ? » |
| Territoire | Carte · Classement · Barres | « Où est-ce le plus fort ? » |
| Âge | Barres · Courbe · **Pyramide** (effectifs seulement) | « Quels âges sont les plus touchés, et cela diffère-t-il entre femmes et hommes ? » |
| Sexe | Barres · Barres horizontales · Camembert (effectifs seulement) | « Comment cela se partage-t-il entre femmes et hommes ? » |

Ce que le modèle impose, et pourquoi :

- **La prévalence est un rapport, pas un cumul.** Aucune forme qui composerait
  un tout n'est offerte sur cette mesure. Les effectifs de patients, eux, les
  ouvrent.
- **La pyramide n'est offerte que sur des effectifs** : sur une prévalence, les
  deux ailes seraient des taux et leur longueur mentirait sur le nombre de
  personnes.
- **La prévalence par sexe est reconstruite sur les effectifs** et leur
  population de référence, jamais moyennée sur des tranches d'âge de tailles
  différentes.
- **Le masquage Cnam (< 10 patients) est affiché et chiffré**, jamais comblé.
  Une réserve compte les cellules masquées et les territoires sans valeur
  exploitable.
- **Le dénominateur est nommé** : « Prévalence = 100 × patients ÷ population de
  référence de la Cartographie, sur la même cellule région × âge × sexe. Cette
  population de référence est celle que publie la Cnam, et non la population
  Insee du territoire. »
- Un repère **France entière** en second tracé dès qu'on est en région.
- Un territoire sans valeur publiée reste en `--map-void`.

**Comparer** — jusqu'à huit pathologies, catalogue plat des trois niveaux
(famille / groupe / détail) **classé par nombre de patients**. Chaque série
porte son propre territoire, âge et sexe ; le bouton « dupliquer » permet de
comparer le diabète en Île-de-France au diabète en Occitanie.

> **Pathologies n'offre pas de « Reste du périmètre », et ce n'est pas un
> oubli** : la nomenclature Cnam s'emboîte et une même personne compte dans
> chacune de ses pathologies. Le tout dont on retrancherait la sélection
> n'existe pas ; l'offrir même éteint laisserait croire le contraire.

---

### 10.3 CSP — `pages/CspPage.tsx`

Source : recensement de la population (Insee), 2015–2023. Deux niveaux de
nomenclature : **6 grands groupes** ou **29 catégories détaillées**. Mesure :
Part parmi les actifs en emploi, ou Effectif pondéré.

Quatre lectures — Évolution, Territoire (carte cliquable, avec encarts DROM hors
du cadrage métropolitain), Âge, Sexe.

Réserves portées par le modèle :

- « Effectifs pondérés par l'Insee, pas des comptages directs. »
- « La nomenclature a évolué entre certains millésimes : une rupture de série
  n'y est pas toujours une évolution réelle. » Sur les 29 catégories, une note
  explicite invite à passer aux 6 groupes pour une évolution comparable.
- Dénominateur nommé et **vérifié sur les données** : `population_reference`
  vaut exactement la somme des effectifs des six groupes d'une même cellule
  année × région × âge × sexe. « Ni les chômeurs, ni les inactifs, ni les
  retraités n'entrent dans ce dénominateur. »
- **Une part n'est pas additive entre régions** : les formes cumulatives ne sont
  offertes que sur les effectifs.

La carte est cliquable et change le territoire **commun**, que la comparaison
suit.

CSP est la seule base à porter une route dédiée `/api/csp/evolution`, parce que
l'évolution renvoie aussi le dénominateur — c'est ce qui permet à sa section
Comparer de calculer un « Reste du périmètre » **exact**, à un seul niveau de
nomenclature à la fois.

---

### 10.4 Mortalité — `pages/MortalityPage.tsx`

Source : INSERM–CépiDc, statistiques nationales sur les causes de décès.
Mesure : Décès (effectif) ou Part des décès.

**Trois lectures seulement — Évolution, Âge, Sexe.** Il n'y a pas de lecture
Territoire, et le modèle l'écrit sur chaque graphique :

> « Source nationale : ni région, ni taux de mortalité — le CépiDc ne publie pas
> de population de référence pour ces effectifs. Une lecture territoriale serait
> inventée, elle n'est donc pas offerte. »

Le point méthodologique le plus fin de l'écran : **le mot « part » recouvre deux
dénominateurs**, et le modèle les distingue explicitement. Sur l'évolution et
les causes, une part se rapporte au **total toutes causes** de l'année et de la
population choisies. Sur les profils d'âge et de sexe, elle se rapporte aux
**décès de la seule cause affichée**. Les deux valent 100 % une fois sommées,
mais sur des ensembles différents ; les confondre ferait lire « 38 % des décès »
là où il faut lire « 38 % des décès de cette cause ».

Les trois filtres — **cause** (sélecteur unique avec recherche intégrée,
`SearchableCauseSelect`), **population**, **millésime** — tiennent sur une seule
rangée alignée.

Les décès étant additifs, empilé / aires empilées / camembert sont licites sur
la mesure « Décès » — c'est la base où ils ont le plus de sens. Sur la « Part »,
déjà rapportée au total, ils disparaissent.

`mortality_metadata` expose la **hiérarchie « dont … »** (`is_detail`,
`chapter`), qui dormait dans le cube. C'est ce qui permet de savoir quand un
« Reste du périmètre » est licite : additionner un chapitre et l'un de ses
détails compterait deux fois les mêmes décès.

Réserve permanente : « Les cellules vides restent non disponibles ou non
applicables ; elles ne sont jamais interprétées comme un zéro. »

---

### 10.5 Population — `pages/PopulationPage.tsx`

Source : estimations de population Insee par région, sexe et âge quinquennal,
1975 → 2026. **Cinquième base consultable, et dénominateur de référence des
mesures par habitant des autres bases.**

**Pas de section Comparer** — elle n'aurait rien apporté sur une base à une
seule mesure de fond. Quatre lectures : Évolution, Territoire, Âge, Sexe.

Un effectif s'additionne : **toutes les formes cumulatives y sont licites**, ce
qui n'était le cas d'aucune autre base sur sa mesure principale.

**La pyramide des âges est la forme signature.** Elle n'est offerte que sur la
lecture Âge et seulement quand le sexe n'est pas filtré : une pyramide à un seul
versant n'est pas une pyramide.

Sur l'évolution, la courbe **garde toutes ses valeurs** mais ne pose ses marques
et ses graduations que tous les cinq ans, plus la dernière année. 52 points
collés donnaient un pointillé, pas une courbe.

Cinq réserves permanentes, toutes vérifiées à l'ingestion :

1. Population au **1er janvier** — pas une population moyenne annuelle. Le
   dénominateur des taux des autres bases est la moyenne des 1er janvier N et
   N+1.
2. 1975–1989 : **métropole seule**. La courbe France entière porte une rupture
   en 1990 (entrée des DROM) et une seconde en 2014 (Mayotte) : ce sont des
   changements de **champ**, pas des variations de population.
3. Les derniers millésimes sont provisoires et seront révisés.
4. Le total « Ensemble » n'est pas chargé : il est recalculé par somme des sexes,
   et le recalcul retrouve exactement le total publié.
5. Sur quelques cellules d'outre-mer des années 1990, la tranche « 90–94 ans »
   porte en réalité tous les 90 ans et plus ; la case « 95 ans et + » reste vide
   plutôt que d'être remplie par zéro.

Les régions sont **rétropolées sur les 13 régions actuelles depuis 1975** : il
n'y a donc aucune réforme régionale à gérer, mais les chiffres anciens sont
reconstitués.

---

### 10.6 Croisements — `pages/CorrelationsPage.tsx` + `correlations/GuidedPanel.tsx`

**Une seule porte d'entrée : le mode Guidé.** L'écran a longtemps offert trois
modes ; choisir entre « Lien », « Modèle » et « Guidé » était déjà une question
de spécialiste, posée avant même la question de fond.

La question est parcourue en **trois temps**, sur un seul écran :

1. **Que voulez-vous expliquer ?** Une mesure DAMIR rapportée à la population,
   ou la prévalence d'une pathologie. (Un effectif brut n'a pas sa place comme
   mesure à expliquer par un territoire — le filtre `rate` du catalogue l'exclut.)
2. **Par quoi l'expliquer ?** Jusqu'à trois variables : part d'un groupe CSP,
   prévalence d'une pathologie, mesure DAMIR.
3. **Contrôles.** « À âge et sexe comparables » (coché par défaut), « Tenir
   compte de la région », et la période.

L'unité d'observation est **toujours** `region_age_sex` : 192 cellules. Le
moteur est le GLM de `Modèle` — même `runRegression`, même code — seule la
façade change. **Aucune statistique nouvelle** n'est produite ici.

Sorties :

- **Des phrases**, au gabarit imposé, qui nomment explicitement l'unité et ce
  qui est tenu constant : « À âge et sexe comparables, les cellules
  territoriales où « Agriculteurs » est plus élevée présentent en moyenne un
  taux plus élevé (effet : … ; IC à 95 % : … à …). » Quand l'intervalle traverse
  zéro : « le lien n'est pas établi sur ces données ».
- **Le graphique des effets**, avec intervalles à 95 %.
- **Le nuage des cellules** — observé × la variable choisie en abscisse.
  Survoler une région dans la légende la met en avant et estompe les autres ; un
  clic sur un point ouvre le détail de la cellule.
- **La part expliquée** : « N cellules · X % de l'écart entre cellules est
  expliqué par ce modèle — le reste tient à des dimensions non incluses. »
- « **Ce que ce modèle ne dit pas** », replié : les avertissements du serveur.

**Le langage écologique est imposé par construction.** Un encart permanent le
rappelle avant tout résultat :

> « Chaque point est une cellule région × âge × sexe, jamais une personne. Ces
> données peuvent dire "les territoires où les agriculteurs pèsent plus dépensent
> plus en indemnités journalières par habitant", jamais "un agriculteur consomme
> plus d'indemnités journalières". »

La même garde est le **premier élément** des réserves emportées dans l'image
exportée.

> `correlations/AdvancedCross.tsx` (673 lignes) contient l'écran avancé entier —
> mode « Lien » avec nuage, verdict, échelle de force, et mode « Modèle » avec
> tableau de coefficients manipulable. Il est **compilé mais non routé**. Les
> endpoints qu'il appelle sont toujours servis ; le rebrancher tient en une
> ligne de rendu. Preuve que rien n'est embarqué pour rien : le lot Croisements
> est passé de 41,5 ko à 17,4 ko.

---

### 10.7 Tableau — `pages/PivotPage.tsx`

Un **croisé dynamique** sur le cube DAMIR : deux axes, une mesure, une
agrégation. L'objet que tout le monde a manipulé dans un tableur, donc zéro
apprentissage.

Il remplace « Repères », qui choisissait une source puis un calcul parmi six et
produisait **un chiffre** — alors que Panorama affichait déjà la dernière
valeur, la variation et le cumul.

- **Trois zones** : Lignes, Colonnes (dans la barre de portée, avec le
  périmètre — un axe est un choix de sujet), et Mesure.
- **Six agrégations**, celles de l'ancien écran : dernière année, cumul,
  moyenne par an, variation, TCAM, part du total. Le modèle **retire** variation
  et TCAM quand l'année est déjà l'un des axes : chaque cellule se comparerait
  à elle-même.
- **Totaux de ligne, de colonne et général**, tri sur n'importe quelle colonne,
  cellules teintées par la rampe séquentielle. Les totaux sont exclus de
  l'échelle de teinte, sinon toutes les cellules paraîtraient pâles.
- **La méthode dépliée est conservée** : définition, formule, dénominateur,
  point de vigilance. C'est ce qui distingue ce tableau d'un croisé de tableur.
- **Exports** : CSV côté client, PNG par le chemin commun, Excel en passant le
  croisement à Extraire — une seule fabrique de classeur dans le produit.

Il consomme `POST /api/pivot`, qui respecte le contrat central : **composantes
brutes + `formula_spec`**, jamais un indicateur calculé. Changer de mesure ou
d'agrégation ne provoque donc aucune requête.

**Frontière avec Extraire**, écrite dans l'écran : Extraire sort des lignes
brutes pour un tableur ; le Tableau donne un agrégat lisible à l'écran.

---

### 10.8 Extraire — `pages/ExtractionPage.tsx` (552 l.)

**Cinq sources** au choix : DAMIR, Pathologies, CSP, Population, Mortalité.
Chacune expose ses dimensions et ses mesures ; l'écran affiche un **aperçu
paginé** (40 lignes par page, 500 lignes demandées au serveur) puis produit un
**CSV** ou un **Excel auto-documenté**.

L'Excel porte systématiquement deux feuilles : **Données** (en-têtes figées,
largeurs de colonnes, formats numériques par nature de mesure) et
**Métadonnées** (source, date d'extraction, champ, période, dimensions, mesures,
et une ou plusieurs **précautions** écrites en toutes lettres). Pour DAMIR,
l'onglet Métadonnées reprend en plus le dictionnaire des mesures sélectionnées —
définition, formule, précaution — et l'état de consolidation.

**Limite explicite à 250 000 lignes.** Au-delà, le serveur lève une
`ValueError` en français plutôt que de tronquer silencieusement.

Règles de cohérence appliquées avant la requête : on ne peut pas extraire
plusieurs millésimes sans garder la dimension Année, ni « toutes les causes »
sans garder la dimension Cause, ni « tous les territoires » sans la dimension
Région. Sur DAMIR, les volumes et montants moyens exigent une prestation unique
ou la dimension Prestation.

Les boutons « Extraire la donnée » des autres écrans arrivent ici avec le
périmètre pré-rempli par l'URL.

---

### 10.9 Données & méthode — `pages/MethodologyPage.tsx`

Trois blocs :

1. **Le catalogue des cinq sources** en cartes : producteur, période réelle,
   dimensions, nombre de mesures, statut, badges, et une précaution courte. Un
   clic ouvre un tiroir modal : description, **limites de lecture** en toutes
   lettres, et pour DAMIR le dictionnaire complet des 12 mesures groupées par
   famille (définition, formule, réserve) plus les **règles de compatibilité
   verrouillées**.
2. **« Ce que compte chaque mesure »** — la table des **33 dénominateurs**
   (`methodology/denominators.ts`), relevés dans le code du serveur et non de
   mémoire, pour les six surfaces (DAMIR, Pathologies, CSP, Mortalité,
   Croisements, Population). Chaque ligne donne le numérateur et le
   dénominateur ; un total affiche « Aucun — c'est un total » plutôt qu'une case
   vide, qui se lirait comme un oubli.
3. Une bande de rappel : « Les précautions utiles sont également affichées près
   des graphiques. »

> ⚠️ L'amorce du titre annonce « **4 sources actives** » (`MethodologyPage.tsx:72`)
> alors que cinq fiches sont rendues. Chaîne en dur à corriger.

---

## 11. Le système de design

### `theme.css` (361 l.) — la seule source des couleurs

Deux thèmes **complets**. Le mode sombre est *choisi*, pas obtenu en inversant
le clair : ses couleurs de série sont des marches distinctes des mêmes teintes,
validées contre la surface sombre.

Chaque jeton est déclaré sous **trois portées** : `:root` (le clair),
`@media (prefers-color-scheme: dark) :root:where(:not([data-theme="light"]))`
(le réglage système, désarmé par un choix manuel de clair), et
`:root[data-theme="dark"]` (la bascule manuelle, qui gagne dans les deux sens).

> Un jeton défini seulement sous la requête média retombe sur sa valeur claire
> dès que l'utilisateur bascule le thème à la main. Le piège a été rencontré :
> une carte basculée à la main gardait l'échelle divergente claire et peignait
> les territoires sans donnée en beige vif sur fond noir.

**Palette de séries** `--series-1..8`, ordre fixe, **jamais recyclé** :

```
#e34948  #2a78d6  #1baf7a  #eda100  #e87ba4  #008300  #4a3aa7  #eb6834
```

Le rouge de marque ouvre la série. L'ordre a été choisi **sous contrainte** :
mettre le rouge devant l'orange fait tomber la paire à ΔE 5,6 en deutéranopie,
sous le plancher ; c'est le bleu qui le suit. L'ordre retenu passe les six
contrôles de la méthode dataviz dans les deux thèmes.

**Trois autres échelles** :

- `--ramp-1..8` — rampe séquentielle, une teinte du clair au foncé (cartes,
  cartes de chaleur). Retournée en mode sombre.
- `--diverge-1..7` — rampe divergente **orange contre bleu**, pour ce qui se lit
  de part et d'autre d'un pivot (l'indice de spécialisation). Le rouge-vert est
  exclu ; l'orange-bleu reste séparable pour les deutéranopies et protanopies.
- `--map-void` — le territoire **sans donnée**. Ne doit jamais ressembler à une
  valeur basse.

**Deux palettes, un commutateur.** `data-palette="blue"` bascule la rampe
séquentielle et la teinte d'une série seule. Elle **ne change pas** la palette
catégorielle : là où la couleur code une *identité*, une famille unique ne
suffit pas — cinq nuances de rouge tombent à ΔE 11,7 entre voisines pour un
plancher de 15. Ce qui bascule, c'est l'**ordre** des teintes.

**Une série seule ne prend pas la palette** : elle prend `--accent-chart`
(`paletteColor`). Sans personne dont se distinguer, la couleur catégorielle
n'encode rien.

**La couleur suit l'entité, jamais son rang** : `assignColorSlots` mémorise
l'attribution, de sorte que retirer une série ne repeint pas les survivantes, et
qu'une série retirée puis remise retrouve sa teinte.

**Typographie** : `--font: "Inter", system-ui, …`. Échelle `--text-2xs` .688rem
→ `--text-hero` clamp(2.25rem, 4vw, 3rem). Titres 640–680 de graisse,
interlettrage −.022em. `font-variant-numeric: tabular-nums` global, sans quoi
une colonne de montants danse d'une ligne à l'autre.

**Espacement** : échelle de 4 px, `--space-1` … `--space-12`.
**Rayons** : 6 / 10 / 14 / pill. **Ombres** : trois niveaux.
**Animation** : `--ease: cubic-bezier(.22, .61, .36, 1)`.

### Les dix-sept règles de `DESIGN.md`

Résumées ici parce qu'elles sont **appliquées dans le code**, pas décoratives :

1. Les valeurs se lisent **sans survol** — un graphique projeté n'a pas de souris.
2. La couleur ne porte **jamais seule** — étiquettes directes, noms écrits,
   tableau de valeurs.
3. Rien ne disparaît en silence — une modalité qu'une forme ne peut pas porter
   sort du graphique et se dit en clair, **chiffrée**.
4. La légende vit **dans le HTML**, pas dans le canevas.
5. Un axe de cumul part de zéro.
6. Un seul moment de mouvement par écran, désactivé sous
   `prefers-reduced-motion`.
7. Le graphique parle, le texte se tait — pas de phrase de commentaire calculée.
8. **Rien ne pousse le graphique vers le bas** — tout contrôle qui s'ouvre se
   superpose.
9. Une seule sortie image, et c'est un fichier.
10. Une teinte par entité, une rampe par ordre.
11. La couleur ne redit jamais la longueur — un classement est d'une seule teinte.
12. **Une forme qui mentirait n'est pas proposée** — le modèle décide, l'interface
    ne connaît aucune règle statistique.
13. Une comparaison dont les côtés diffèrent le dit dans son libellé.
14. Un effet s'affiche avec son incertitude, et l'axe contient l'intervalle entier.
15. Changer de forme est un mouvement — jamais de `key` React sur un conteneur
    de graphique.
16. Un repli se nomme et se chiffre.
17. **L'âge et le sexe entrent dans le modèle, ils ne le filtrent pas.** Tant
    qu'ils sont des filtres, un modèle de la dépense attribue à ses variables une
    bonne part de la démographie du territoire.

### Formes propres au produit

`.damir-sections` (les deux profondeurs) · `.scope-bar` (tout le paramétrage sur
deux lignes, hauteur indépendante de ce qui est ouvert) · `.damir-stage` (la
fiche d'analyse) · `.damir-strip` (repères à gauche, formes à droite, une ligne)
· `.compare-rail` (le bandeau « Ce que je compare ») · `.series-drawer` (le
tiroir ancré) · `.damir-caveats` (les réserves) · `.chip-popover` (le réglage
d'une série sur place).

### Responsive

54 media queries au total, dont 36 dans `styles.css`. Ruptures principales :
1240 / 860 / 720 / 620 px.

> **Non vérifié** : le comportement réel sous 1272 px. La fenêtre du navigateur
> piloté refuse de descendre plus bas dans l'environnement de développement
> utilisé, et rétrécir la coquille ne déclenche pas les requêtes de média, qui
> portent sur la fenêtre. C'est signalé dans `docs/PROGRESS.md` à deux reprises.

---

## 12. Les invariants méthodologiques

Ce sont les règles que **le code applique** et qu'une modification ne doit pas
défaire. Elles sont la raison d'être du produit auprès du public actuariel.

### 1. Une donnée absente reste absente

- Un ratio sans dénominateur renvoie `None` côté serveur et `null` côté client,
  **jamais 0** (`explore.py::measure_value`, `explore/model.ts::evaluate`). Les
  distinguer évite qu'une courbe plonge vers zéro là où la donnée est simplement
  absente.
- Une valeur masquée par la Cnam (< 10 patients) **reste masquée** : elle n'est
  ni remplacée par zéro, ni réallouée, et aucune prévalence standardisée n'est
  recalculée à partir de cellules masquées.
- Un territoire sans donnée prend `--map-void`, pas le bas de la rampe.
- Chaque écran a un message d'état vide **avec sa raison** (`Reading.empty`).

### 2. Une forme qui mentirait n'est pas offerte

C'est le **modèle** de chaque base — `panorama/slides.ts`, `*/model.ts`,
`charts/compareReading.ts` — qui décide des formes licites, selon l'additivité,
le nombre de séries, le nombre de périodes, la nature de l'axe, et l'homogénéité
des populations. Jamais un bouton grisé : la forme est **absente**.

Un bouton désactivé laisse croire qu'il manque un réglage, alors que ce sont les
données qui ne s'y prêtent pas.

### 3. Langage écologique obligatoire pour les croisements

Les unités d'observation sont des **cellules région × âge × sexe**, jamais des
individus. Formulation type : « À âge et sexe comparables, les territoires où X
est plus élevé présentent aussi… ». Toute formulation individuelle (« les
agriculteurs consomment plus d'IJ ») est interdite dans l'interface, les phrases
générées et les exports. La garde est le premier élément des réserves.

### 4. Les réserves voyagent

Réserves méthodologiques et avertissements serveur accompagnent le graphique à
l'écran, dans un tiroir replié. (Depuis la version courante, l'image exportée
porte le périmètre, le titre, la source et la date, mais **plus** le bloc de
réserves — voir §9 pour la justification et §16 pour la tension que cela crée
avec le principe historique.)

### 5. SQL paramétré uniquement

Motif `cube_where`, placeholders `?`, jamais de concaténation de valeurs
utilisateur.

### 6. Aucune nouvelle dépendance sans accord explicite

Pas d'UI kit, pas de state manager, pas de router, pas de lib d'animation, pas
de NumPy ni de pandas au runtime. Vérifié : `package.json` déclare 6
dépendances (dont React, TypeScript et Vite) et 2 de développement ;
`requirements.txt` en déclare 4.

### 7. Parité fonctionnelle

Aucune capacité existante ne disparaît sans équivalent explicite documenté. Le
journal `docs/PROGRESS.md` porte une rubrique **« Écarté »** à chaque phase,
et le plus souvent elle dit « rien ».

### 8. Pas de sur-ingénierie

Extraire un composant partagé seulement s'il sert **au moins trois usages
réels**. Le seuil est appliqué : `EntityPicker` a été créé au troisième usage,
puis supprimé quand le rail partagé l'a rendu inutile.

---

## 13. Performance

### Optimisations en place, vérifiées

1. **Cube compact** — 8× plus petit, transparent pour l'application, avec repli
   sur le brut s'il est périmé.
2. **Cache disque à empreinte** (`data/.cache/metadata.json`) — les métadonnées
   coûtent plusieurs balayages ; l'empreinte (taille + mtime des sources) les
   invalide dès qu'un cube bouge. **Toute anomalie du cache se résout en
   recalculant** : le cache accélère, il ne conditionne jamais le fonctionnement.
   Écriture atomique par `mkstemp` + `os.replace`.
3. **16 `@lru_cache`** sur les fonctions coûteuses : métadonnées (`maxsize=1`),
   hiérarchie (128), explore (64), panorama (64) et son référentiel (16),
   options (32), corrélation (64), régression (64), et les métadonnées de chaque
   base (2).
4. **Cache de recherche découplé** — `/api/explore/options` met en cache le
   classement sur le seul périmètre ; taper au clavier ne relance aucun balayage.
5. **`reference_block` mis en cache à part** — ajouter une prestation au panorama
   passe d'un balayage complet à une requête filtrée.
6. **`GROUPING SETS`** — les trois facettes du panorama en un seul balayage.
7. **Connexion DuckDB par thread** — pas de verrou global sur les lectures.
8. **Composantes brutes + formules côté client** — changer de mesure = **zéro
   requête**.
9. **Préchauffage au démarrage** dans un fil démon.
10. **Chunks Vite séparés** et **pages en `lazy()`** avec préchargement au survol.
11. **Débounce de 250 ms** sur les filtres, **180 ms** sur la recherche de séries.
12. **`stale`** au lieu d'un squelette : pas de saut de mise en page.

### Points restant coûteux

- **Une requête `/api/explore` par série retouchée** dans DAMIR Comparer :
  jusqu'à 8 balayages en parallèle. C'est le point le plus coûteux du produit.
- Le **cube brut de 1,09 Go** est lu si le compact est absent ou périmé.
- **`styles.css` (2 214 lignes) est chargé sur toutes les pages.**
- La **régression** relance une requête complète à chaque changement de variable
  ou de contrôle.
- `vendor-echarts` à 714 ko brut est au-dessus du seuil d'avertissement de Vite.

---

## 14. Accessibilité et confidentialité

### Accessibilité — ce qui est tenu

- **Légendes en HTML**, pas dans le canevas : sélectionnables, accessibles au
  clavier, lisibles par un lecteur d'écran.
- **Tableau de valeurs** sous chaque graphique, avec `<th scope="row">` et
  `<th scope="col">`, dans un conteneur focalisable.
- **`role="img"` + `aria-label`** descriptif sur chaque graphique.
- **`role="tablist"` / `role="tab"` / `aria-selected`** sur les barres de
  lecture ; `aria-pressed` sur les choix de forme.
- **Identité des séries jamais portée par la seule couleur** : étiquettes
  directes en bout de courbe, noms dans la légende, tableau.
- **Palette validée** pour les visions atypiques des couleurs dans les deux
  thèmes.
- **`prefers-reduced-motion`** respecté : animation ECharts et transition
  universelle coupées, défilement en `auto`, View Transitions désactivées.
- **Focus** : le tiroir des séries piège le focus, `Échap` ferme et rend le
  focus au bouton qui a ouvert. Les popovers ferment sur `Échap` et rendent le
  focus.
- **Zones de clic** : la croix de suppression d'une série fait 44 px.
- **`aria-live="polite"`** sur la confirmation de « Copier le lien ».
- Aucune liste déroulante native dans les réglages de périmètre : `ChoiceSelect`
  et `MultiSelect` sont des composants maison, thémés, qui ouvrent leur panneau
  dans la page. (Le menu d'un `<select>` natif est dessiné par le système, hors
  de la page : il ignore `theme.css` et reste blanc en thème sombre.)

> **Non vérifié** : aucun audit automatisé (axe, Lighthouse) n'a été passé, et
> aucun test avec lecteur d'écran réel n'est documenté.

### Confidentialité et sécurité

- **Rien ne quitte le poste.** Aucun appel réseau externe au runtime, aucune
  télémétrie, aucune API distante. Les seules requêtes sortent vers
  `127.0.0.1:8000`.
- Ni compte utilisateur, ni authentification, ni administration — l'application
  suppose un poste de confiance.
- **SQL paramétré** partout où une valeur vient de l'utilisateur.
- `GET /assets/{asset_name}` rejette les chemins contenant un séparateur
  (`Path(asset_name).name != asset_name`) : pas de traversée de répertoire.
- CORS restreint aux origines de développement.
- `data/` n'est jamais écrit ; seul `data/.cache/` l'est.

> **Non vérifié** : aucune revue de sécurité formelle n'a été conduite. Les
> requêtes des modules `correlations.py` et `population.py` interpolent des
> valeurs **entières et littérales contrôlées** (années, codes de région issus
> de constantes du module) dans le SQL plutôt que de les paramétrer ; les
> valeurs textuelles venant de l'utilisateur, elles, passent bien par des
> placeholders. C'est sûr en l'état mais moins homogène que `cube_where`.

---

## 15. Tests et vérification

**54 tests, tous verts** (`python -m pytest`, 61 s). Écrits en `unittest`,
exécutés par pytest.

| Fichier | Tests | Ce qu'il verrouille |
|---|---:|---|
| `test_statistics.py` | 10 | Pearson et la droite de régression contre des **valeurs publiées** (quartet d'Anscombe) ; la p-value contre les **tables de Student** ; Spearman à 1 sur une relation monotone et le partage des rangs entre ex æquo ; l'intervalle de Fisher qui reste dans [−1, 1] ; l'absence de coefficient sur une série plate ou trop courte ; `minimum_detectable_r` contre des **seuils publiés** et sa décroissance avec `n` |
| `test_glm.py` | 10 | les trois familles retrouvent les coefficients vrais sur données simulées ; les IC à 95 % les couvrent ; la lecture en pourcentage sous lien log est bien celle que `correlations.py` dérive ; `default_family` propose la bonne loi selon la réponse |
| `test_correlation_denominators.py` | 10 | la population **contre la ligne qui fait autorité** dans la source ; l'absence de double comptage par l'agrégat « tous âges » ; le comptage en **années-personnes** sur une période ; les patients contre la ligne d'autorité ; la prévalence dans une plage plausible ; la moyenne des deux 1er janvier ; le repli sur le seul 1er janvier la dernière année ; l'écart entre les deux dénominateurs sous un dixième ; **que le dénominateur utilisé est bien celui qu'on croit** |
| `test_studio.py` | 24 | lectures parallèles du repository ; la comparaison « période précédente » ; le fait qu'une table transformée ne recalcule pas un second écart ; la disponibilité des mesures selon le périmètre ; **qu'une moyenne n'est pas la moyenne des moyennes annuelles** ; le refus de comparer deux mesures différentes ; la bascule en base 100 quand les unités diffèrent ; la réconciliation des contributions d'une décomposition avec l'écart total ; les exports Excel (feuilles Données + Métadonnées, formats numériques) ; les métadonnées et l'overview de Pathologies et CSP ; **qu'une prévalence masquée n'est jamais remplacée par zéro** ; que les filtres de population changent bien le dénominateur CSP |

### Ce que les tests ne couvrent pas

- **Aucun test frontend.** Pas de Vitest, pas de Testing Library, pas de
  Playwright. Le seul filet côté interface est `tsc -b`, qui bloque le build.
- **Aucun test passant par la couche HTTP.** Les tests appellent les modules
  métier — et, pour les exports Excel, les fonctions de route — **directement**.
  Il n'y a ni `TestClient` FastAPI, ni test de codes de statut, ni test de la
  conversion `ValueError` → `HTTPException(422)`.
- **Aucun test de `panorama.py`** ni de `explore.py` en tant que tels.
- **Aucun test de rendu graphique** ni de l'export PNG.
- **Aucune revue responsive automatisée** ni test de contraste automatisé.
- Les tests dépendent des **vraies données** du dépôt : ils ne tournent pas sur
  un poste où `data/` est vide, et certains verrouillent des valeurs numériques
  issues de ces fichiers précis.

---

## 16. Dette technique et défauts connus

Classés du plus concret au plus structurel. Tous vérifiés dans le code.

### 1. `styles.css` — 2 214 lignes, 963 couleurs en dur

17 sections empilées au fil des refontes, dont un bloc final « Système visuel ·
Publication d'institut » (l. 2076+) qui surcharge avec **15 `!important`**.

L'en-tête du fichier est honnête : « Les règles qui portent encore une couleur en
dur restent en clair — elles seront migrées avec leurs pages. »

Deux lignes précises, signalées à trois reprises dans `docs/PROGRESS.md`,
produisent le **défaut de thème sombre le plus visible du produit** :

```css
styles.css:151   .panel { … background: #fff; }
styles.css:2084  .content-wrap :is(select, input:not([type="checkbox"])) {
                   background-color: #fff !important; }
```

Conséquence : **en thème sombre, les panneaux de contenu restent blancs** dans
toute l'application, et le contraste saute aux yeux à côté du tiroir des séries,
correctement thémé. Deux lignes à passer aux jetons — mais qui repeignent toute
l'application, ce qui est la raison pour laquelle la décision a été laissée à
l'utilisateur.

### 2. `correlations/AdvancedCross.tsx` — 673 lignes non routées

**Zéro import entrant.** C'est délibéré et documenté (`docs/PROGRESS.md`, v3
phase 4) : l'écran avancé est conservé entier, compilé, et le rebrancher tient
en une ligne. Le coût est réel — 673 lignes à maintenir en cohérence avec l'API
sans qu'aucun utilisateur ne les exerce.

Décision à prendre : le rebrancher derrière un réglage, ou le supprimer en
laissant l'historique Git le porter.

### 3. Fichiers volumineux

| Fichier | Lignes |
|---|---:|
| `styles.css` | 2 214 |
| `correlations.py` | 1 200 — croisements **et** régression |
| `main.py` | 1 171 — routes + repository + conversions Excel |
| `BenchmarksPage.tsx` | 1 137 — un seul composant |
| `studio.py` | 1 091 |
| `explore.css` | 891 |
| `buildOption.ts` | 887 |
| `damir/CompareSection.tsx` | 788 |

### 4. Duplication résiduelle

- Le motif d'export **CSV + Excel** est écrit **cinq fois** dans `main.py`
  (DAMIR, Pathologies, CSP, Population, Mortalité), à quelques champs de
  métadonnées près — plus de 400 lignes quasi identiques.
- Le motif `fetch + AbortController + fetchKey` est réécrit une douzaine de fois
  côté interface.
- Le motif preview / rows / columns est dupliqué par source côté serveur.

Le principe « pas de sur-ingénierie » du dépôt (extraire au troisième usage
réel) est ici **atteint et dépassé** : cinq usages réels justifieraient une
extraction.

### 5. Chaînes et listes périmées

| Où | Problème |
|---|---|
| `MethodologyPage.tsx:72` | « 4 sources actives » alors que cinq fiches sont rendues |
| `main.py:1102` | `logical_names` cite encore `ExplorePage` et `vendor-plotly` (disparus) et **omet** `PopulationPage`, `CorrelationsPage`, `DamirPage` — la récupération d'asset périmé ne couvre pas les écrans récents |
| `main.py:1139` | `@app.on_event("startup")` est déprécié par FastAPI (`DeprecationWarning` à chaque exécution des tests) |
| `DESIGN.md` §« Formes propres au produit » | décrit encore **trois** sections DAMIR et la « comparaison libre » comme un écran ; il y en a deux depuis la fusion |

### 6. Tension entre deux principes documentés

`CLAUDE.md` pose : « **Les réserves voyagent.** Réserves méthodologiques et
avertissements serveur accompagnent le graphique à l'écran **et** dans l'image
exportée. »

`panorama/exportSlide.ts` a délibérément retiré les réserves de l'image, au
motif qu'un pavé de texte sous un graphique de présentation fait perdre le
graphique. Les deux positions se défendent, mais **le principe écrit et le code
ne disent plus la même chose**. À trancher explicitement.

### 7. Manques signalés et assumés

| Manque | Statut |
|---|---|
| Erreurs-types robustes / clustering dans le GLM | ❌ signalé à l'écran, pas corrigé — les p-values sur `region_year` sont optimistes |
| Détection de colinéarité (VIF) | ❌ |
| Diagnostics de résidus, interactions, splines | ❌ |
| Comparaison avec / sans variable dans le modèle | ⚠️ la variable se retire, l'écart entre les deux modèles n'est pas montré |
| Analyses nommées et enregistrées | ❌ l'URL seule |
| Panier de graphiques / export `.pptx` | ❌ |
| Tests frontend | ❌ aucun |
| Revue responsive sous 1272 px | ⚠️ **non vérifiée**, deux fois signalée |
| `tools/rapport_qualite.py` dépend de pandas | ⚠️ hors runtime, non installé par `preparer.bat` |

### 8. Ce qui est propre, et mérite d'être préservé

- **Séparation nette** modèle / builders / composants, tenue sur les cinq bases.
- **Densité de commentaires exceptionnelle**, et surtout : les commentaires
  expliquent **pourquoi**, presque jamais **quoi**. Beaucoup portent le récit
  d'un incident réel et de sa cause — ils sont la vraie documentation du dépôt.
- **Formules à un seul endroit**, envoyées au client.
- **Requêtes paramétrées** sur tout ce qui vient de l'utilisateur.
- **Dégradation gracieuse** partout : sources optionnelles, cache non bloquant,
  carte absente qui n'emporte pas l'écran, mesure indisponible qui retombe sur
  le montant remboursé.
- **Statistiques testées contre des valeurs publiées**, pas contre elles-mêmes.
- **Journal de mission tenu** (`docs/PROGRESS.md`), avec une rubrique
  « Écarté » et une rubrique « Non vérifié » à chaque phase.

---

## 17. Guide d'intervention

Pour une IA ou un développeur qui reprend ce code.

### Lire dans cet ordre

**Pour comprendre le modèle de données et le métier**

1. `app/backend/app/analysis.py` — `METRICS`, `DIMENSIONS`, `FilterPayload`,
   `cube_where`
2. `app/backend/app/explore.py` — le moteur générique et `FORMULAS`
3. `app/backend/app/main.py` l. 231–410 — `DamirRepository`, les vues DuckDB

**Pour comprendre l'interface**

4. `app/frontend/src/App.tsx` — routage et coquille
5. `app/frontend/src/pages/DamirPage.tsx` — la coquille à deux sections, l'état
   partagé
6. `app/frontend/src/panorama/slides.ts` — **le modèle qui décide des formes**
7. `app/frontend/src/charts/reading.ts` + `compareReading.ts` — le vocabulaire
   commun des quatre autres bases
8. `app/frontend/src/charts/EChart.tsx` + `buildOption.ts` — la fabrique de
   graphiques

**Pour comprendre les statistiques**

9. `app/backend/app/correlations.py` — unités d'observation, catalogue,
   dénominateurs, régression
10. `app/backend/app/glm.py` · `statistics.py`

**Les intentions**

11. `PRODUCT.md` — public, contraintes, principes
12. `DESIGN.md` — jetons, formes, les 17 règles
13. `CLAUDE.md` — les principes non négociables
14. `docs/PROGRESS.md` — **le journal**. Il dit ce qui a été essayé et écarté,
    et pourquoi. Le lire évite de refaire une erreur déjà payée.

### Recettes

**Ajouter un indicateur DAMIR**
Ajouter une entrée à `METRICS` (`analysis.py`) **et** à `FORMULAS`
(`explore.py`). Le client le reçoit automatiquement — il n'y a rien à écrire
côté interface. Si l'indicateur n'est pas additif, poser `additive=False` : les
formes cumulatives disparaîtront d'elles-mêmes. Ajouter une ligne à
`methodology/denominators.ts`.

**Ajouter une forme de graphique**
Étendre `ChartForm` et `buildOption` (`charts/buildOption.ts`), puis **déclarer
sa condition** dans le modèle de chaque base qui l'offre — jamais dans le
composant React. Vérifier que la forme accepte le `xTitle` et qu'elle porte un
`id` de série stable (sans quoi la transition ne s'accroche pas).

**Ajouter une base**
Suivre le gabarit : `app/backend/app/<base>.py` (métadonnées + overview +
extraction), les routes dans `main.py`, la vue DuckDB avec un drapeau
`has_<base>`, puis côté interface `<base>/model.ts` (lectures + formes licites +
**réserves**), `<base>/section.ts` (ce que la coquille partage),
`<base>/PanoramaSection.tsx`, `<base>/CompareSection.tsx` si la comparaison a un
sens, et `pages/<Base>Page.tsx`. Ajouter la clé à `PageKey` et à `PAGES`.

**Ajouter une couleur**
Non. `theme.css` est la seule source. Ajouter un **jeton** si un rôle nouveau
existe vraiment, sous les **trois portées** (`:root`, media query, `[data-theme]`).

**Ajouter du style**
Ne rien ajouter à `styles.css`. Créer un fichier CSS dédié adossé aux jetons et
l'importer depuis `main.tsx`.

### Pièges déjà payés — ne pas les repayer

Chacun de ces incidents est arrivé dans ce dépôt et est commenté sur place.

1. **`key` React sur un conteneur de graphique** → l'instance est détruite,
   aucune transition n'est possible.
2. **`LabelLayout` / `UniversalTransition` non enregistrés** → `hideOverlap` et
   `universalTransition` ignorés **en silence**.
3. **`PieChart` non enregistré** → tout camembert s'affiche vide.
4. **Écouteur `pointerdown` posé immédiatement** → le clic qui ouvre le popover
   le referme aussitôt. Poser à la frame suivante.
5. **`chart.resize()` appelé depuis le `ResizeObserver` qui le mesure** → boucle
   qui fige le rendu. Repousser d'une frame.
6. **Effet dépendant d'un `onClose` refait à chaque rendu** → le tiroir se pose
   et se dépose, la page vibre, le rendu fige. Passer par une référence.
7. **Mesurer une rangée dont on replie les éléments** → oscillation. Mesurer une
   rangée fantôme, et ne réagir qu'à la largeur.
8. **Transition universelle sur un simple changement de couleur** → ECharts
   garde les éléments existants **avec leur ancien style**.
9. **Attribut posé depuis un effet enfant** → React exécute les effets des
   enfants avant ceux des parents ; l'attribut arrive après la lecture des
   jetons. Poser avant le premier rendu (`main.tsx`).
10. **Mélanger un agrégat de source avec les cellules qu'il résume**
    (`dept='999'`, `cla_age_5='tsage'`, `sexe='9'`) → double comptage. L'Île-de-
    France a pesé 25,3 M d'habitants au lieu de 12,5.
11. **`'95 et +'` vs `'95et+'`** → 276 000 lignes silencieusement exclues du
    filtre « 80 ans et plus ».
12. **Rapporter N années de flux à 1 année de population** → taux divisés par N.
13. **Cumuler des périodes dans un camembert de stock** → 247 millions d'actifs.
14. **Un jeton défini seulement sous la media query** → il retombe en clair dès
    qu'on bascule le thème à la main.
15. **Initialiser le périmètre d'une série au périmètre commun** au lieu de sa
    modalité → la modalité se perd en silence et le montant triple.

### Méthode de travail attendue (issue de `CLAUDE.md`)

- Une phase à la fois, dans l'ordre du document de mission.
- Avant de coder : un plan bref — fichiers touchés, risques, choix ouverts.
- Après : `npm run build` **et** `python -m pytest` verts, puis un commit au
  message descriptif **en français**.
- En cas d'ambiguïté : choisir l'option la plus simple, et **le signaler dans le
  message de commit**.
- Pas de refactor opportuniste hors du périmètre de la phase.
- **Ne jamais enchaîner deux phases sans validation de l'utilisateur.**
- 3 à 5 lignes ajoutées à `docs/PROGRESS.md` en fin de mission, avec ce qui a été
  **écarté** et ce qui n'a **pas été vérifié**.

---

## 18. Glossaire

**AMO** — Assurance Maladie Obligatoire. Par opposition à la complémentaire.

**ALD** — Affection de Longue Durée. Motif d'exonération du ticket modérateur.

**Base de remboursement** (`bse_ref`) — le tarif de référence sur lequel
s'applique le taux de remboursement. Six grands postes n'en ont pas
(indemnités journalières, invalidité, rémunérations forfaitaires, forfaits
maternité, non remboursable, codes réservés) : d'où `POSTES_SANS_BASE`.

**Cadence / délai de liquidation** — le temps entre les soins et leur
remboursement effectif. Une année de soins récente est « en consolidation » tant
que les liquidations tardives n'y sont pas toutes remontées : le dernier point
d'une courbe est donc un **plancher**.

**CépiDc** — Centre d'épidémiologie sur les causes médicales de décès (INSERM).

**Composante** — une des sept grandeurs additives que le serveur agrège et
envoie au client (`rem`, `dep`, `depas`, `qte`, `bse_tm`, `rem_tm`, `rem_neg`).

**Cube** — le fichier Parquet principal. « Cube brut » = `cube_damir.parquet`
(grain mois) ; « cube compact » = le même agrégé à l'année.

**Facette** — dans le panorama, une dimension selon laquelle on détaille chaque
sujet : région, âge, sexe.

**Grand poste / poste / sous-poste / prestation** — les quatre niveaux de la
hiérarchie des prestations, portés par `prs_nat_transco.csv`.

**Indice de spécialisation** — 100 × (part de la région dans le sujet) ÷ (part de
la région dans le périmètre). 100 = recours à hauteur du poids du territoire.

**IRLS** — Iteratively Reweighted Least Squares, la méthode d'ajustement d'un
GLM.

**Lecture** — un graphique **plus** ce qui ne tient pas dedans : titre de
projection, réserves chiffrées, tableau, et les formes que la donnée autorise.

**Modalité** — une valeur d'une dimension : une région, une tranche d'âge, une
prestation.

**Prévalence** — 100 × patients pris en charge ÷ population de référence de la
Cartographie, sur la même cellule région × âge × sexe.

**PRS_NAT** — le code de nature de prestation dans DAMIR.

**Réserve** (*caveat*) — ce qu'un graphique ne peut pas porter, écrit et chiffré
à côté de lui.

**Sophisme écologique** — conclure d'une relation observée entre territoires
qu'elle vaut pour les individus qui les composent. C'est ce que l'écran
Croisements interdit par construction.

**Sujet** — dans le panorama, une modalité mise sous observation (une
prestation, un grand poste). Aucun sujet choisi = « tout confondu ».

**Ticket modérateur** — la part de la base de remboursement laissée à la charge
de l'assuré. Calculé ici comme `base de remboursement de référence − remboursement
de référence`, en excluant les postes sans base.

**TACT = 11** — la modalité du recensement Insee désignant les **actifs ayant un
emploi**. C'est le champ de la base CSP.

---

## Voir aussi

| Document | Contenu |
|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | les principes non négociables du dépôt |
| [`PRODUCT.md`](../PRODUCT.md) | public, positionnement, principes produit |
| [`DESIGN.md`](../DESIGN.md) | le système visuel tel qu'il est bâti, les 17 règles |
| [`MISSION_3_BLOCS.md`](../MISSION_3_BLOCS.md) | la feuille de route en cours |
| [`docs/PROGRESS.md`](../docs/PROGRESS.md) | le journal des phases : fait / écarté / décidé / non vérifié |
| [`docs/missions/`](../docs/missions/) | les feuilles de route V1 → V6, archivées |
| [`tools/LISEZMOI_csp.md`](../tools/LISEZMOI_csp.md) | la fabrication du jeu CSP |

---

*Document produit par inspection intégrale du code et exécution des contrôles,
le 15 août 2026. Toute affirmation non vérifiée y est marquée comme telle.*
