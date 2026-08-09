# DAMIR Studio

Application web locale d’analyse des dépenses d’assurance maladie. Elle
s’exécute entièrement sur le poste : aucune donnée ne sort de la machine, et il
n’y a ni compte utilisateur, ni hébergement, ni administration.

## Lancement

Double-cliquer sur `DAMIR.bat` à la racine du projet. L’application s’ouvre sur
<http://127.0.0.1:8000>.

Si l’environnement n’est pas encore préparé, lancer d’abord `preparer.bat`
(Python et Node.js requis). Cette préparation installe les dépendances,
construit l’interface, puis génère le cube compact décrit plus bas.

## Organisation du projet

```
DAMIR.bat        lance l’application
preparer.bat     installe et construit tout
app/             l’application (backend FastAPI + frontend React)
data/            les cubes Parquet et fichiers sources — jamais modifiés
tools/           scripts de préparation des données, lancés à la demande
```

Les scripts de `tools/` ne sont pas nécessaires à l’usage courant : ils servent
à reconstruire les données dérivées après une mise à jour des sources.

## Les écrans

- **DAMIR** — l’écran principal. Il s’ouvre sur le classement des grands postes
  de dépense, dont on choisit ceux que l’on garde. Sélectionner un poste ouvre
  son détail : indicateurs, évolution, classement de ses sous-postes, et
  comparaison au choix. Les paramètres restent à gauche, le résultat à droite.
- **Pathologies** — Cartographie des pathologies de la Cnam : patients,
  prévalence, évolution, profil âge-sexe et valeurs territoriales (2015–2024).
- **CSP** — fiche Insee 2023 des actifs ayant un emploi, en 6 grands groupes ou
  29 catégories : carte cliquable, classement des 17 régions, profil âge-sexe.
- **Mortalité** — effectifs de décès par cause (CépiDc), avec recherche
  hiérarchique, millésime, sexe et tranches d’âge. Cette source est nationale :
  ni carte régionale, ni taux par habitant.
- **Croisements** — cherche des liens statistiques entre les quatre bases :
  deux indicateurs de sources différentes, un nuage de points, et un diagnostic
  qui dit si le rattachement tient. Voir « Ce que les croisements peuvent
  et ne peuvent pas dire » plus bas.
- **Repères** — espace statistique commun aux quatre sources. Les calculs
  proposés dépendent de l’indicateur ; ceux qui ne sont pas défendables sur des
  cellules agrégées ne sont pas offerts.
- **Extraire** — choix de la source, des dimensions et des mesures, aperçu
  paginé, export CSV et Excel auto-documenté. La limite explicite de 250 000
  lignes évite les extractions silencieusement tronquées.
- **Méthode** — dictionnaire des indicateurs, formules, limites, cadence de
  liquidation et catalogue des sources.

Douze indicateurs DAMIR sont disponibles — remboursement, dépense, reste à
charge, ticket modérateur, dépassements, volume, moyennes par unité, entre
autres. Les filtres couvrent les années, la hiérarchie des prestations, le sexe,
l’âge, la région, l’assurance, l’enveloppe et l’ALD. L’état des pages est
conservé dans l’URL : une analyse peut être partagée et reproduite telle quelle.

## Ce que les croisements peuvent et ne peuvent pas dire

Les quatre bases n’ont ni les mêmes régions, ni les mêmes tranches d’âge. Plutôt
que d’apparier ce qui ne se correspond pas, l’écran Croisements travaille sur
l’intersection réelle et affiche ses limites :

- **Douze régions** seulement sont communes aux trois sources régionales. La
  Corse est absente de DAMIR, où les DOM sont par ailleurs agrégés. Avec douze
  points, un coefficient inférieur à **0,58** ne peut pas être distingué du
  hasard : l’écran affiche ce seuil plutôt que de laisser conclure à tort.
- **La mortalité n’a pas de dimension régionale** et ses tranches d’âge
  (0-64 / 65-84 / 85 ans et plus) ne recouvrent pas les tranches décennales des
  autres sources. Elle n’est donc croisable qu’au niveau national, par année.
- **Deux effectifs bruts corrèlent toujours.** L’Île-de-France dépense plus et
  compte plus de malades parce qu’elle est plus peuplée : la corrélation obtenue
  mesure la taille des régions. L’écran rapporte les indicateurs à la population
  quand il le peut, et refuse de conclure quand il ne le peut pas.
- **Une association n’est pas une cause**, et une relation observée entre
  territoires ne dit rien des individus qui les composent — c’est le sophisme
  écologique, rappelé à chaque résultat.

Sont affichés à chaque croisement : coefficient de Pearson, coefficient de
Spearman (sur les rangs, robuste aux valeurs extrêmes), p-value bilatérale,
intervalle de confiance à 95 % par transformation de Fisher, R², et le nombre
d’observations réellement appariées. Les formules sont écrites dans
`app/backend/app/statistics.py` et vérifiées contre des valeurs de référence.

## Rapidité au démarrage

Trois mécanismes se combinent pour que le premier écran s’affiche vite :

- **Cube compact** — `tools/build_cube_compact.py` agrège le cube brut à
  l’année, ce qui le ramène de 45 à 5,8 millions de lignes et de 1,09 Go à
  122 Mo. Aucune information exploitable n’est perdue : le mois de soins n’est
  utilisé que par l’écran de cadence de liquidation, qui lit un autre fichier.
  Le script vérifie lui-même que les totaux annuels sont conservés.
- **Cache disque** — les métadonnées, qui coûtaient plusieurs balayages complets
  du cube à chaque lancement, sont conservées dans `data/.cache`. L’empreinte
  des fichiers source les invalide automatiquement : il n’y a jamais de cache à
  vider à la main.
- **Préchauffage** — le serveur calcule les métadonnées et la première vue
  pendant que le navigateur s’ouvre, au lieu d’attendre la première requête.

Le cube brut reste la source de vérité et n’est jamais modifié. Si le cube
compact est plus ancien que lui, l’application lit le cube brut et l’indique
dans la console plutôt que de servir des chiffres périmés.

## Socle technique

- Interface : React 19, TypeScript et Vite. Les graphiques de l’écran DAMIR
  utilisent ECharts ; les autres écrans utilisent encore Plotly. Chaque page est
  chargée à la demande, si bien que Plotly n’est téléchargé qu’à l’ouverture des
  écrans qui s’en servent.
- API locale : Python, FastAPI et Uvicorn.
- Moteur analytique : DuckDB interrogeant directement les Parquet, avec lecture
  parallèle par requête HTTP.
- Exports : CSV natif et Excel via OpenPyXL.

Il n’y a pas de Java dans cette application : TypeScript côté interface, Python
côté serveur.

Le ticket modérateur conserve les garde-fous de l’outil Streamlit d’origine :
les prestations sans base de remboursement sont exclues du périmètre global, et
un avertissement s’affiche lorsqu’un poste incompatible est choisi.

## Ergonomie

Palette sobre, chiffres tabulaires, filets plutôt qu’ombres, tableaux
accessibles au clavier. La navigation se replie avec `Ctrl+\`. Les animations
sont désactivées lorsque le système demande une réduction des mouvements.

## Tests

```
app\backend\.venv\Scripts\python.exe -m unittest discover -s tests -t .
```
(depuis `app/backend`)
