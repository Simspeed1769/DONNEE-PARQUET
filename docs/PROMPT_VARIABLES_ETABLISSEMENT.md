# Prompt — faire entrer le secteur public/privé dans DAMIR Studio

*À copier dans une session d'agent ouverte à la racine du dépôt `Outil_DAMIR`.
Écrit le 23 septembre 2026. Ce document est autonome : tout ce qu'il faut savoir
est dedans.*

---

## Ta mission

Les cubes de ce dépôt ne portent aucune information d'établissement. Impossible
d'y distinguer ce qui vient d'un hôpital public de ce qui vient d'une clinique
privée, ni de séparer un séjour d'une consultation externe. Cette mission
répare ce manque, en trois étapes que tu mèneras **dans l'ordre**, en
t'arrêtant après chacune pour montrer les résultats.

**A.** Mesurer, sur un seul mois de fichier source, la répartition public /
privé / inconnu par poste. Peu de téléchargement, réponse immédiate.

**B.** Si l'étape A le justifie, reconstruire les cubes avec les nouvelles
variables.

**C.** Les exposer dans l'application, comme dimensions de découpage et comme
filtres, pour qu'on puisse lire un pourcentage public / privé sur n'importe
quel écran.

## Pourquoi, en deux paragraphes

Le projet a produit une étude sur la dérive de l'hospitalisation
(`docs/ETUDE_HOSPITALISATION_PAR_POSTE.md`) et un diaporama client. Sa
conclusion repose sur une affirmation empruntée à la documentation du SNDS :
les séjours des hôpitaux publics ne sont pas dans Open DAMIR, parce qu'ils sont
financés par dotation et non facturés patient par patient, alors que les
cliniques privées facturent chaque séjour. Seuls les actes et consultations
externes du public y figurent.

Cette affirmation n'a jamais été **mesurée** sur les données. Elle est
vraisemblable — la base fait 167 Md€ de dépense en 2024 quand la consommation
de soins et biens médicaux française approche 257 Md€, et l'écart d'environ
90 Md€ a la taille de l'hôpital public, qui pèse 93,7 Md€ selon la DREES — mais
un ordre de grandeur n'est pas un chiffre. Le client a besoin d'un chiffre.

## Ce que contient le fichier source, et ce qui manque aux cubes

Le descriptif officiel des variables est **dans le dépôt** :
`2023_descriptif-variables-extract_open-damir-base-complete.xlsx`, onglet
« OPEN DAMIR » pour la liste, onglet « MOD OPEN DAMIR » pour les modalités.
Lis-le avant de coder, il fait foi.

Open DAMIR porte une soixantaine de variables. Les cubes du dépôt n'en ont
gardé que dix-huit. Correspondance entre les noms du fichier source et ceux des
cubes :

| Fichier source | Cube | Rôle |
|---|---|---|
| `SOI_ANN`, `SOI_MOI` | `soi_ann`, `soi_moi` | année et mois de soins |
| `PRS_NAT` | `prs_nat` | nature de prestation |
| `ASU_NAT` | `asu_nat` | nature d'assurance |
| `AGE_BEN_SNDS` | `age` | tranche d'âge |
| `BEN_SEX_COD` | `sexe` | sexe |
| `BEN_RES_REG` | `region` | région de résidence |
| `CPT_ENV_TYP` | `env` | type d'enveloppe ONDAM |
| `EXO_MTF` | `ald` | motif d'exonération, réduit à un booléen ALD |
| `PRS_REM_MNT` | `rem` | montant remboursé |
| `PRS_REM_BSE` | `bse` | base de remboursement |
| `PRS_PAI_MNT` | `dep` | montant de la dépense |
| `PRS_DEP_MNT` | `depas` | montant du dépassement |
| `PRS_ACT_QTE` | `qte` | quantité |
| `PRS_ACT_NBR` | `nb` | dénombrement |
| `FLT_REM_MNT`, … | `rem_ref`, `bse_ref`, `rem_neg` | variantes préfiltrées, à confirmer |

Cette correspondance est **déduite des libellés**, pas documentée dans le
dépôt : aucun script d'ingestion n'y figure, les cubes sont arrivés déjà
construits. Tu la valideras par le contrôle décrit plus bas. Les trois
dernières lignes sont les moins sûres ; si tu ne retrouves pas `rem_ref`,
`bse_ref` et `rem_neg` à l'identique, dis-le plutôt que d'approximer.

### Les variables à faire entrer

| Variable | Libellé officiel | Modalités |
|---|---|---|
| **`PRS_PPU_SEC`** | Code Secteur Privé/Public | 1 = public, 2 = privé, 9 = inconnue |
| **`ETE_TYP_SNDS`** | Type Étb Exécutant | 0 = ambulatoire secteur libéral · 1 = public proprement dit · 2 = PSPH privé à but non lucratif participant au service public hospitalier · 3 = ex PJP ayant opté pour le BG · 4 = privé lucratif · 6 = privé non lucratif · 99 = inconnue |
| **`MDT_TYP_COD`** | Mode de Traitement Étb Exécutant | 1 = séjourné · 2 = externe · 3 = domicile · 9 = sans objet |
| **`ETE_IND_TAA`** | Indicateur TAA Privé/Public | 0 = hors TAA · 1 = TAA publique · 2 = TAA privé · 8 = non transmis · 9 = inconnue |

Deux remarques que le descriptif porte explicitement et qui orientent tout le
travail :

- Le commentaire d'`ETE_IND_TAA` dit : « permet de cibler les prestations en
  facturation directe à l'Assurance maladie : **Actes et Consultations
  Externes**. Pour les cibler, il faut prendre l'indicateur TAA public. » C'est
  donc cette variable qui isole la part du public réellement présente dans la
  base. Traite-la comme la variable de référence pour la question posée.
- Le commentaire de `CPT_ENV_TYP` dit que l'enveloppe 1 contient « les
  honoraires et prescriptions des **cliniques privées** » et l'enveloppe 2 « les
  versements aux établissements de santé publics, privés et médico-sociaux ».
  L'enveloppe ne sépare donc pas public et privé : ne l'utilise pas pour ça,
  c'est un piège.

Deux variables voisines existent et peuvent servir de recoupement sans être
ajoutées aux cubes : `MFT_COD` (mode de fixation des tarifs, dont la modalité 3
est « dotation globale fixée par ARH pour établissements publics ») et
`ETE_CAT_SNDS` (catégorie d'établissement).

## Où prendre les données

Open DAMIR est publié en flux mensuels, environ 500 Mo par mois compressés, sur
le portail de l'Assurance Maladie
(<https://www.assurance-maladie.ameli.fr/etudes-et-donnees/open-damir-depenses-sante-interregimes>)
et sur data.gouv.fr. **Ne télécharge rien sans l'accord explicite de
l'utilisateur** : c'est du volume, et le poste a une interception SSL qui fait
échouer les outils n'utilisant pas le magasin de certificats Windows (voir plus
bas).

Pose la question avant : quel mois, quel emplacement sur le disque. Le dépôt
prévoit `data/source/` pour les fichiers à ingérer.

## Étape A — mesurer sur un mois

Écris `tools/mesure_secteur.py`, en lecture seule, qui lit **un** fichier
mensuel et imprime, sans rien écrire sur le disque :

1. La liste des colonnes du fichier, avant tout traitement. Ne suppose aucun
   nom : affiche ce que tu trouves et compare au tableau ci-dessus. Si un nom
   diffère, signale-le et arrête-toi.
2. Pour chaque modalité de `PRS_PPU_SEC`, `ETE_TYP_SNDS`, `MDT_TYP_COD` et
   `ETE_IND_TAA` : le montant remboursé, la dépense, et leur part du total.
   Les libellés des modalités, pas seulement les codes.
3. Le croisement **grand poste × secteur**, en rattachant `PRS_NAT` aux postes
   par `data/prs_nat_transco.csv` (colonnes `PRS_NAT;libelle;grand_poste;poste;sous_poste`,
   séparateur `;`, encodage UTF-8 avec BOM). Une ligne par grand poste, les
   colonnes public / privé / inconnu en euros et en pourcentage.
4. Le même croisement restreint au grand poste `Hospitalisation`, poste par
   poste. C'est le tableau que le client attend.
5. Le croisement **secteur × mode de traitement**, qui dira combien du public
   est en séjour et combien en externe. C'est le test décisif de l'affirmation
   de l'étude.

Commente le script : il doit expliquer ce qu'il mesure, pas seulement comment.
Un mois suffit pour la structure, mais dis dans la sortie que c'est un mois, et
lequel.

**Arrête-toi là et montre les résultats.** L'étape B ne se décide qu'après.

## Étape B — reconstruire les cubes

Seulement si l'utilisateur le demande après avoir vu l'étape A.

Le dépôt a deux cubes. `data/cube_damir.parquet` (1,09 Go, environ 45 M lignes,
grain mois) est la source de vérité. `data/cube_damir_compact.parquet` (117 Mo,
5,76 M lignes, grain année) est ce que l'application interroge, construit par
`tools/build_cube_compact.py`, qui agrège le mois et laisse tomber `bse` et
`nb`. `DamirRepository._resolve_cube()` dans `app/backend/app/main.py` compare
les dates de modification : si le compact est plus ancien que le brut, il lit
le brut. Le dérivé ne prend jamais le pas sur sa source.

Écris `tools/build_cube_damir.py`, qui reconstruit le cube brut depuis les
fichiers mensuels avec les colonnes actuelles **plus** les quatre nouvelles.
Puis adapte `build_cube_compact.py` : ajoute les nouvelles clés à `KEYS`, et
profites-en pour **conserver `bse`**, que l'étude réclame (la part AMO se
décompose en « remboursé ÷ base » × « base ÷ dépense », et cette décomposition
montre que la dérive de l'anesthésie vient des dépassements et non d'un
changement de règle).

Attention au volume : quatre clés de plus multiplient les combinaisons. Mesure
le nombre de lignes du compact avant et après. S'il dépasse une quinzaine de
millions, propose de ne garder dans le compact que `PRS_PPU_SEC` et
`MDT_TYP_COD`, les deux qui portent la question, et de laisser
`ETE_TYP_SNDS` et `ETE_IND_TAA` au seul cube brut.

### Contrôles obligatoires avant de remplacer quoi que ce soit

Écris le nouveau cube sous un nom temporaire, contrôle, puis remplace. Jamais
l'inverse.

- **La correspondance des colonnes.** Agrège le nouveau cube aux mêmes clés que
  l'ancien et compare les totaux année par année et poste par poste. Ils
  doivent coïncider à l'euro près sur `rem`, `dep`, `depas`, `qte`. S'ils ne
  coïncident pas, tu as mal identifié une colonne : dis-le, ne corrige pas au
  jugé.
- **La couverture.** Le cube actuel porte les années 2014 à 2025 et 1 342
  prestations distinctes. Le nouveau doit au moins les égaler.
- **`tools/audit_pieges.py`**, que `docs/INGESTION.md` demande de lancer avant
  toute ingestion.
- **La suite de tests** : `app/backend/.venv/Scripts/python.exe -m pytest`,
  104 tests, doit rester verte.

## Étape C — exposer les variables dans l'application

L'architecture est décrite en détail dans `app/LISEZMOI.md`, à lire avant de
toucher au code. En résumé : le serveur n'envoie jamais un indicateur calculé,
il envoie les composantes additives brutes et la spécification des formules, et
le client dérive les indicateurs. Une formule n'existe qu'à un seul endroit.

Les fichiers à modifier, et ce qu'ils portent :

| Fichier | Ce qu'il faut y faire |
|---|---|
| `app/backend/app/analysis.py` | ajouter les entrées dans `DIMENSIONS` (clé, libellé, expression SQL), les champs dans `FilterPayload` (listes d'entiers, comme `regions` ou `insurances`), et les clauses dans `cube_where` — **paramétré, jamais de concaténation** |
| `app/backend/app/main.py` | incrémenter `METADATA_SCHEMA` (actuellement 4). Sans ça le cache disque continuera de servir l'ancienne liste de dimensions et rien n'arrivera à l'écran : le piège est documenté dans le commentaire de la constante, il a déjà mordu deux fois |
| `app/backend/app/repository.py` | exposer les modalités dans les métadonnées, comme `REGIONS` ou les sexes, avec leurs libellés lisibles |
| `app/frontend/src/utils.ts` | ajouter les champs à `ARRAY_FIELDS`, `filtersFromSearch` et `writeFilters` pour que l'état vive dans l'URL |
| `app/frontend/src/types.ts` | le contrat de données |
| `app/frontend/src/components/AdvancedFilterPanel.tsx` et `ScopeBar.tsx` | les sélecteurs, sur le modèle de ceux de région ou d'enveloppe |

Libellés à employer dans l'interface, en français soigné et constant :
**Secteur** (Public, Privé, Non renseigné), **Type d'établissement**,
**Mode de prise en charge** (Séjour, Consultation externe, Domicile).

### Ce que l'utilisateur veut voir

Pouvoir lire, sur n'importe quel périmètre, la part du public, du privé et du
non renseigné. Deux façons de l'obtenir, à traiter dans cet ordre :

1. **Le découpage**, qui suffit et ne coûte presque rien : choisir « Secteur »
   comme dimension dans Panorama, Comparer, Tableau ou Extraire donne les trois
   modalités côte à côte, et les parts s'en déduisent avec les mesures qui
   existent déjà.
2. **Une mesure dédiée**, seulement si le découpage ne suffit pas à l'usage.
   Attention : une part par secteur n'est pas une formule sur les composantes
   d'une ligne, c'est un rapport d'une modalité au total du périmètre. Le
   moteur `explore.py` évalue `facteur × (Σ numérateur) / (Σ dénominateur)` sur
   une même ligne et ne sait pas faire ça. Ne force pas : soit tu t'appuies sur
   le référentiel du panorama, qui calcule déjà un dénominateur de périmètre
   séparé (`reference_block`), soit tu restes au découpage. **Demande avant de
   t'engager dans cette voie.**

## Les règles du dépôt, non négociables

Elles sont dans `CLAUDE.md` et `AGENTS.md`, à lire. Les plus exposées ici :

- **Rien ne quitte le poste au runtime** : aucun appel réseau externe dans
  l'application. Un téléchargement est un acte d'ingestion, manuel et
  demandé, pas une fonction du produit.
- **Une donnée absente reste absente.** Un ratio sans dénominateur renvoie
  `None`, jamais 0. La modalité « inconnue » d'une variable est une modalité
  réelle, à afficher comme telle, jamais à répartir au prorata ni à masquer.
- **SQL paramétré uniquement**, motif `cube_where`.
- **Aucune nouvelle dépendance** sans accord explicite.
- **Pas de sur-ingénierie** : n'extrais un composant partagé que s'il sert au
  moins trois usages réels.
- **Une phase à la fois**, avec un plan bref avant de coder et un commit au
  message descriptif en français après. Ne jamais enchaîner deux étapes sans
  validation.

## Pièges connus sur ce poste

- **Python** : utiliser `app/backend/.venv/Scripts/python.exe` (3.13). La
  commande `python` seule résout vers un 3.9 du PATH machine et échouera.
- **SSL** : Avast intercepte les connexions. `git` est configuré en
  `http.sslBackend=schannel` sur ce dépôt, `pip` passe seul en 3.13, npm a
  `NODE_USE_SYSTEM_CA=1`. Le `curl` de Git Bash échoue ; `Invoke-WebRequest`
  en PowerShell fonctionne.
- **Encodage** : `prs_nat_transco.csv` est en UTF-8 avec BOM, séparateur `;`,
  fins de ligne CRLF. Le réécrire sans conserver ces trois propriétés casse la
  nomenclature en silence.
- **Fichiers ouverts** : les `.pptx` et `.docx` de la racine sont souvent
  ouverts dans Office, ce qui rend l'écriture impossible. Ça ne concerne pas
  cette mission, mais ne t'en étonne pas.

## Ce qui est attendu à la fin

Un tableau, chiffré, qui dit quelle part de DAMIR est publique, privée et non
renseignée, globalement et pour le grand poste Hospitalisation, avec le
croisement séjour / consultation externe. Et, si les étapes B et C ont été
faites, la possibilité de refaire ce tableau depuis l'application sur
n'importe quel périmètre.

Si l'étape A montre que le public est effectivement réduit aux consultations
externes, l'étude n'est pas invalidée : elle devient exacte, avec un chiffre à
la place d'une déduction. Dis-le clairement dans ton compte rendu, sans
enjoliver et sans dramatiser.
