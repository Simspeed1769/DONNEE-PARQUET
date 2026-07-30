# DAMIR Studio

Prototype web local et parallèle à l’outil Streamlit existant. Le dossier parent reste la source des cubes Parquet et de la table de correspondance des prestations.

## Lancement immédiat

Dans ce dossier de travail, l’environnement est déjà préparé. Double-cliquer sur `lancer_damir_studio.bat`. L’application s’ouvre à l’adresse <http://127.0.0.1:8000>.

## Réinstaller si nécessaire

1. Vérifier que Python et Node.js sont disponibles.
2. Double-cliquer sur `preparer.bat`.
3. Attendre la fin de l’installation et de la construction.

## Architecture fonctionnelle

L’interface est organisée autour de quatre sources et de quatre espaces communs :

- **Panorama** : quatre indicateurs, tendance, moteurs de variation,
  concentration et statut de consolidation. L’année de référence est libre et
  les graphiques basculent entre remboursements et dépenses. À l’ouverture, le
  périmètre couvre 2015–2024.
- **Pathologies** : fiche de lecture chiffrée issue de la Cartographie des
  pathologies de la Cnam : patients, prévalence, évolution, profil âge-sexe et
  valeurs territoriales observées sur la période 2015–2024.
- **CSP** : fiche Insee 2023 des actifs ayant un emploi, disponible en 6 grands
  groupes ou 29 catégories : carte de France cliquable, classement des 17
  régions et profil âge-sexe.
- **Mortalité** : fiche nationale CépiDc des effectifs de décès par cause,
  avec recherche hiérarchique, millésime (2015–2024), sexe et trois grandes tranches d’âge. Cette source
  est nationale : elle ne permet pas de carte régionale ni de taux par
  habitant.
- **Atelier** : espace DAMIR guidé par trois questions — évolution, comparaison et
  liquidation. La comparaison de deux indicateurs conserve leur unité réelle
  lorsqu’elle est commune ; la base 100 n’est utilisée que lorsque leurs unités
  diffèrent.
- **Repères** : espace statistique guidé commun aux quatre sources. Il présente
  un chiffre principal, son périmètre, son contexte et sa méthode. Les calculs
  disponibles dépendent de l’indicateur : valeur, cumul, moyenne par unité,
  évolution annuelle, variation en points ou dispersion territoriale. Les
  statistiques non défendables sur des cellules agrégées ne sont pas proposées.
- **Extraire** : sélecteur de source Dépenses/Pathologies/CSP/Mortalité, choix des dimensions
  et mesures, aperçu paginé, CSV et classeur Excel auto-documenté. Une limite
  explicite de 250 000 lignes empêche les extractions silencieusement tronquées.
- **Méthode** : dictionnaire des indicateurs, formules, limites, cadence de
  liquidation et catalogue des sources DAMIR, Pathologies, CSP et CépiDc.

Douze indicateurs DAMIR sont disponibles, notamment remboursement, dépense,
reste à charge, ticket modérateur, dépassements, volume de la prestation,
remboursement moyen par unité et dépense moyenne par unité. Les
filtres couvrent les années, la hiérarchie des prestations, le sexe, l’âge, la
région, l’assurance, l’enveloppe et l’ALD. L’état des pages est conservé dans
l’URL afin qu’une analyse puisse être partagée et reproduite. Le Panorama se
met à jour automatiquement avec une courte temporisation ; les analyses et
comparaisons suivent le même fonctionnement avec annulation des requêtes
devenues obsolètes.

## Socle technique

- Interface : React 19, TypeScript, Vite et Plotly.
- API locale : Python, FastAPI et Uvicorn.
- Moteur analytique : DuckDB interrogeant directement les cubes Parquet, avec
  lecture parallèle par requête HTTP et cache des métadonnées.
- CSP : cœur 2023 ZSTD de 1,3 Mo généré depuis le fichier individuel Insee de
  638 Mo par `../CSP/build_csp_core.py`, sans modification du fichier source.
- Mortalité : cœur Parquet ZSTD généré par `../Mortalité/build_mortality_core.py` depuis le classeur national CépiDc. Le classeur original reste conservé.
- Exports : CSV natif et Excel via OpenPyXL.

Il n’y a pas de Java dans cette application : JavaScript/TypeScript est utilisé
côté interface et Python côté serveur.

Le ticket modérateur conserve les garde-fous de l’outil Streamlit : les
prestations sans base de remboursement sont exclues du périmètre global et un
avertissement est affiché lorsqu’un poste incompatible est choisi.

## Ergonomie

L’interface suit un système visuel « publication d’institut » : palette chaude,
rouge réservé aux états actifs, chiffres tabulaires, filets plutôt qu’ombres et
tableaux accessibles au clavier. La navigation se replie avec `Ctrl+\`. Dans
l’Atelier, `F` affiche le résultat en plein écran et `E` exporte ses valeurs.
Les animations sont automatiquement désactivées lorsque la réduction des
mouvements est demandée par le système.

Le prototype n’inclut volontairement ni comptes utilisateurs, ni hébergement,
ni fonctions d’administration.
