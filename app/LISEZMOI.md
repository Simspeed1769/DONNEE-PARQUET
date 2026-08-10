# DAMIR Studio

Application web locale d'analyse de quatre bases publiques de santé. Elle
s'exécute entièrement sur le poste : aucune donnée ne sort de la machine,
aucun appel réseau au runtime, ni compte utilisateur, ni hébergement.

## Lancement

Double-cliquer sur `DAMIR.bat` à la racine du projet. L'application s'ouvre sur
<http://127.0.0.1:8000>.

Si l'environnement n'est pas encore préparé, lancer d'abord `preparer.bat`
(Python et Node.js requis) : il crée le venv, installe les dépendances,
construit l'interface et génère le cube compact.

## Commandes

```bash
# Interface — depuis app/frontend
npm run build      # tsc -b && vite build ; doit rester vert
npm run dev        # serveur de dev Vite (proxy /api -> :8000)

# Serveur — depuis app/backend
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt   # dont pytest
.venv/Scripts/python.exe -m pytest                                # 44 tests
python -m uvicorn app.main:app --reload                           # serveur seul
```

`requirements.txt` porte ce dont l'application a besoin pour tourner ;
`requirements-dev.txt` y ajoute la suite de tests. `preparer.bat` n'installe
que le premier : il prépare le poste d'un manager, pas celui d'un développeur.

## Carte des dossiers

```
DAMIR.bat          lance l'application
preparer.bat       installe et construit tout
data/              cubes Parquet et fichiers sources — jamais modifiés
tools/             scripts de préparation des données, lancés à la demande
app/backend/       API FastAPI + moteur DuckDB
app/frontend/      interface React / TypeScript / Vite
```

Dans `app/backend/app/`, un module par domaine : `main.py` (routes),
`explore.py` et `panorama.py` (agrégations DAMIR), `pathologies.py`, `csp.py`,
`mortality.py`, `correlations.py` (croisements et régression), `glm.py`
(l'ajustement, écrit à la main), `statistics.py`, `studio.py` (Repères),
`analysis.py` (extraction), `cache.py`.

Dans `app/frontend/src/`, un dossier par base ou par écran. Chacun sépare
systématiquement **le modèle** (ce que la base sait dire, ses réserves) des
**builders de graphiques** (des fonctions pures qui rendent une option
ECharts à partir de lignes typées et des jetons de couleur) :

```
charts/        EChart.tsx (le seul moteur), tokens.ts, frenchMap.ts, buildOption.ts
components/    briques partagées : PageHero, KpiStrip, ChartShell, ScopeBar,
               ExportPngButton, CopyLinkButton, MultiSelect…
damir/         PanoramaSection, CompareSection, redirections d'anciennes URLs
panorama/      modèle et formes du Panorama, exportSlide.ts (l'export d'image)
explore/       modèle d'agrégation DAMIR, SeriesPicker, périmètre par série
pathologies/   csp/   mortality/   benchmarks/     modèle + builders par base
correlations/  GuidedPanel (mode guidé), RegressionPanel (mode avancé)
pages/         un fichier par écran, qui assemble ce qui précède
```

## Les écrans

- **DAMIR** — deux sections. *Panorama* lit une prestation sous quatre angles
  (évolution, territoire, âge, sexe). *Comparer* met en regard ce qu'on veut :
  huit dimensions au choix (les quatre niveaux de la hiérarchie des
  prestations, région, âge, sexe, année), et des séries qui peuvent chacune
  porter leur propre périmètre — auquel cas l'écran le dit.
- **Pathologies** — Cartographie Cnam : trajectoire, profil âge×sexe,
  classement territorial, masquage des effectifs inférieurs à 10 explicité.
- **CSP** — recensement Insee : carte régionale cliquable, évolution, profil
  âge×sexe, composition en 6 groupes ou 29 catégories.
- **Mortalité** — CépiDc : évolution, principales causes, profils sexe et âge.
  Source nationale : ni carte régionale, ni taux de mortalité.
- **Croisements** — trois onglets. *Guidé* (par défaut) déroule une question en
  trois temps : ce qu'on explique, par quoi, à quoi comparable. *Lien* et
  *Modèle* restent le mode avancé.
- **Repères** — un chiffre, son périmètre et sa méthode, sur les quatre sources.
- **Extraire** — dimensions, mesures, aperçu paginé, CSV et Excel
  auto-documenté, limite explicite de 250 000 lignes.
- **Méthode** — dictionnaire des indicateurs, formules, limites, sources.

## Ce que l'outil refuse de faire

- **Une donnée absente reste absente.** Un ratio sans dénominateur vaut
  « — », jamais 0 ; une valeur masquée par la Cnam reste masquée ; un
  territoire sans donnée est dessiné dans une teinte propre, pas au bas de
  l'échelle.
- **Une forme qui mentirait n'est pas offerte.** C'est le modèle de chaque
  base qui décide des formes licites — pas un bouton grisé.
- **Les croisements parlent de territoires, jamais de personnes.** L'unité
  d'observation est la cellule région × âge × sexe. Les phrases produites
  disent « les territoires où X est plus élevé présentent aussi… », jamais
  « les X consomment plus ».
- **Les réserves voyagent.** Ce que l'écran range dans un tiroir, l'image
  exportée l'écrit.

## Exports

« Enregistrer en PNG » est présent sur toutes les lectures. L'image fait
toujours 1600 × 900 (16:9, densité 2), sur fond clair même si l'écran est en
thème sombre — le graphique est re-rendu pour l'occasion — avec le périmètre,
un titre modifiable avant génération, les réserves, la source et la date. Un
export CSV accompagne chaque tableau de valeurs.

« Copier le lien », dans la barre du haut, partage l'état exact de l'écran :
tout ce qui se règle vit dans l'adresse.

## Socle technique

Interface : React 19, TypeScript, Vite, **ECharts pour tous les graphiques**.
Serveur : Python, FastAPI, Uvicorn, DuckDB interrogeant directement les
Parquet. Exports : CSV natif, Excel via OpenPyXL. Pas de NumPy ni de pandas :
le GLM est écrit à la main dans `glm.py`.

## Rapidité au démarrage

Le cube compact (`tools/build_cube_compact.py`) agrège le cube brut à l'année
— 45 → 5,8 millions de lignes, 1,09 Go → 122 Mo — sans perte exploitable. Les
métadonnées sont mises en cache sur disque dans `data/.cache`, invalidées par
l'empreinte des sources. Le serveur préchauffe la première vue pendant que le
navigateur s'ouvre. Le cube brut reste la source de vérité : si le cube
compact est plus ancien que lui, l'application lit le brut et le signale.

## Voir aussi

- [`PRODUCT.md`](../PRODUCT.md) — ce que fait l'application, pour qui.
- [`DESIGN.md`](../DESIGN.md) — le système de design.
- [`CLAUDE.md`](../CLAUDE.md) — les principes non négociables du dépôt.
- [`docs/ETAT_DES_LIEUX.md`](../docs/ETAT_DES_LIEUX.md) — l'audit technique
  détaillé (photo d'avant la v2).
