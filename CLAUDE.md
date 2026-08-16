# CLAUDE.md

Instructions pour Claude Code sur ce dépôt.

## Où se trouve quoi

- `MISSION_3_BLOCS.md` — la feuille de route **en cours**, à la racine. Les
  missions achevées sont archivées dans `docs/missions/`.
- **`app/LISEZMOI.md` — la référence unique sur l'état du code.** Audit vérifié
  par lecture et par exécution : technologies, données, routes, écrans, règles,
  défauts connus. En cas de doute sur ce que fait l'application, c'est ce
  document qui fait foi, pas la mémoire. (Il remplace `docs/ETAT_DES_LIEUX.md`,
  supprimé : deux photos du code se contredisaient.)
- `docs/PROGRESS.md` — le journal des phases livrées : fait / écarté / décisions.
- `DESIGN.md`, `PRODUCT.md` — fichiers de convention lus par l'outillage de
  design ; ils restent à la racine pour cette raison.
- `app/` — le produit (`backend/`, `frontend/`). `data/` — les cubes.
  `tools/` — les scripts de fabrication des données, hors runtime.

## Principes non négociables

- **Rien ne quitte le poste.** Aucun appel réseau externe au runtime, aucune
  télémétrie, aucune API distante.
- **Une donnée absente reste absente.** Un ratio sans dénominateur renvoie
  `None`, jamais 0. Une valeur masquée (Cnam < 10) reste masquée. Un territoire
  sans donnée prend `--map-void`, pas le bas de rampe.
- **Une forme qui mentirait n'est pas offerte.** C'est le modèle (à la manière
  de `panorama/slides.ts`) qui décide des formes licites (additivité, nombre de
  séries, nature de l'axe) — jamais un bouton grisé, jamais un camembert sur une
  mesure non additive.
- **Langage écologique obligatoire pour les croisements.** Les unités
  d'observation sont des cellules région × âge × sexe, jamais des individus.
  Formulation type : « À âge et sexe comparables, les territoires où X est plus
  élevé présentent aussi… ». Toute formulation individuelle (« les agriculteurs
  consomment plus d'IJ ») est interdite dans l'interface, les phrases générées
  et les exports.
- **Les réserves voyagent.** Réserves méthodologiques et avertissements serveur
  accompagnent le graphique à l'écran **et** dans l'image exportée.
- **SQL paramétré uniquement** (motif `cube_where`), jamais de concaténation de
  valeurs utilisateur.
- **Aucune nouvelle dépendance** (front ou back) sans accord explicite de
  l'utilisateur : pas d'UI kit, pas de state manager, pas de router, pas de lib
  d'animation, pas de NumPy/pandas.
- **theme.css est la seule source des couleurs.** Aucune couleur en dur dans
  les composants ni dans les builders de graphiques. Ne rien ajouter à
  `styles.css` : tout nouveau style va dans un fichier CSS dédié adossé aux
  jetons.
- **Pas de sur-ingénierie.** Extraire un composant partagé seulement s'il sert
  au moins trois usages réels. Préférer une duplication légère et lisible à une
  abstraction prématurée.
- **Parité fonctionnelle.** Aucune capacité existante ne disparaît sans
  équivalent explicite documenté.
- **Le français de l'interface est soigné**, orienté utilisateur
  (« Enregistrer en PNG », questions affichées sur les vues), voix active,
  vocabulaire constant d'un écran à l'autre.

## Commandes du projet

```bash
# Frontend — depuis app/frontend
npm run build            # tsc -b && vite build ; doit rester vert
npm run dev               # serveur de dev Vite (proxy /api -> :8000)

# Backend — depuis app/backend
.venv/Scripts/python.exe -m pip install -r requirements-dev.txt
.venv/Scripts/python.exe -m pytest          # suite de tests
python -m uvicorn app.main:app --reload     # serveur seul, sans DAMIR.bat

# Lancement complet (Windows, à la racine)
preparer.bat              # première installation : venv, npm install, build, cube compact
DAMIR.bat                 # lance l'app sur http://127.0.0.1:8000
```

## Méthode de travail (issue de MISSION.md)

- Une phase à la fois, dans l'ordre du document. Avant de coder : un plan bref
  (fichiers touchés, risques, choix ouverts). Après : `npm run build` et
  `python -m pytest` verts, puis un commit au message descriptif en français.
- En cas d'ambiguïté de spécification : choisir l'option la plus simple, la
  signaler dans le message de commit.
- Pas de refactor opportuniste hors du périmètre de la phase en cours.
- Ne jamais enchaîner deux phases sans validation de l'utilisateur entre les deux.
