# Audit des chiffres — Phase 0 : cadrage

*Établi le 19 août 2026, branche `v2`, commit `2d551d7`. Aucun contrôle n'a été
écrit ni exécuté à ce stade : ce document est le plan soumis à validation.*

Le livrable final sera `docs/AUDIT_CHIFFRES.md`. Ce fichier-ci ne contient que le
cadrage exigé par la Phase 0 : l'inventaire des chemins de calcul, la politique
de tolérance, la liste numérotée des contrôles, et le squelette du harnais.

---

## 1. Inventaire des chemins de calcul

### 1.1 DAMIR — quatre chemins, et deux définitions des indicateurs

C'est le point central de tout l'audit, et il n'est pas celui que j'attendais.

**Le SQL d'agrégation est partagé.** `_COMPONENT_SQL` est défini **une seule
fois** (`explore.py:45`) et importé tel quel par `panorama.py:45` et
`pivot.py:40`. Le filtre `cube_where()` (`analysis.py:230`) est lui aussi
unique, paramétré, utilisé par les cinq appelants. À ce niveau, il n'y a pas de
duplication à craindre.

**En revanche, les douze indicateurs existent en deux exemplaires**, écrits dans
deux langages et selon deux logiques :

| | `FORMULAS` (`explore.py:102`) | `METRICS` (`analysis.py:143`) |
|---|---|---|
| Forme | table `numérateur / dénominateur × facteur` | expression SQL par indicateur |
| Évaluée par | le **client** (`explore/model.ts::evaluate`) et le serveur (`measure_value`) | **DuckDB**, dans la requête |
| Sert | Panorama, Explorer/Comparer, Tableau | **Extraire**, et les métadonnées de `/api/meta` |

Deux définitions d'une même grandeur qui peuvent diverger sans que rien ne le
signale : c'est exactement le risque que la Phase 2 doit mesurer.

**Une divergence est déjà lisible à l'œil nu, sur le ticket modérateur :**

- `FORMULAS["copayment"]` = `bse_tm − rem_tm`, où `bse_tm` vaut
  `SUM(CASE WHEN grand_poste NOT IN POSTES_SANS_BASE THEN bse_ref END)`. Les six
  grands postes sans base sont **mis à zéro**, leurs lignes restent.
- `METRICS["copayment"]` = `SUM(c.bse_ref) − SUM(c.rem_ref)`, brut, mais
  l'appelant passe `cube_where(payload, exclude_base_less="copayment" in
  payload.measures)` (`analysis.py:415`). Les lignes concernées sont
  **retirées de la requête entière**.

Sur le ticket modérateur lui-même, les deux mécanismes devraient concorder.
**Mais le second s'applique à toute la requête** : dans Extraire, cocher
« Ticket modérateur » à côté de « Montant remboursé » retire les six grands
postes du remboursé aussi. Le même montant remboursé, sur le même périmètre,
n'aurait donc pas la même valeur selon qu'une autre case est cochée ou non.

Je ne le déclare pas comme défaut : je l'ai lu, je ne l'ai pas mesuré. Il devient
le contrôle **P-07**, et il est prioritaire.

**Les chemins, un par un :**

| Chemin | Route | Agrégation SQL | Formule appliquée | Où |
|---|---|---|---|---|
| Panorama | `POST /api/panorama` | `panorama.py:150`, `_COMPONENT_SQL` | `FORMULAS` | client |
| Explorer / Comparer | `POST /api/explore` | `explore.py:178` et `:294` | `FORMULAS` | client |
| Tableau | `POST /api/pivot` | `pivot.py:111` | `FORMULAS` | client |
| Extraire | `POST /api/extraction/preview`, `.csv`, `.xlsx` | `analysis.py:390` et `:415` | **`METRICS`, en SQL** | serveur |
| Repères chiffrés | `panorama.py:249` (`reference_block`) | même balayage | `FORMULAS` | serveur |
| Croisements | `POST /api/correlations/regression` | `correlations.py:267` | agrégat propre, puis GLM | serveur |
| Fiabilité / liquidation | `studio.py:63`, `:125` | cube **des délais**, pas le cube DAMIR | — | serveur |

Deux remarques qui pèseront sur les contrôles :

- **Croisements a son propre SQL** (`correlations.py:252`, `_damir_series`) et ne
  passe ni par `_COMPONENT_SQL` ni par `FORMULAS`. C'est un cinquième chemin.
- **`studio.py` lit `cube_delais.parquet`**, au grain mois × flux. Les taux de
  complétude n'ont donc aucune raison d'être comparables au cube compact, qui
  est agrégé à l'année et ne porte pas le flux.

### 1.2 Les quatre autres bases

Chacune est autonome : un module, son propre SQL, ses propres mesures.

| Base | Module | Ce qui est calculé côté serveur | Réserve structurante à retenir |
|---|---|---|---|
| Pathologies | `pathologies.py` | effectifs `ntop`, prévalence `ntop/npop` | effectifs < 10 masqués **à la source** |
| CSP | `csp.py` | effectif pondéré IPONDI, part | champ = actifs **ayant un emploi** ; rupture PCS 2003 → 2020 |
| Population | `population.py` | population, part | au **1er janvier**, pas une moyenne annuelle |
| Mortalité | `mortality.py` | décès, part | **aucune population exposée** : jamais de taux |

### 1.3 Ce que l'application ne calcule pas elle-même

`data/` est en lecture seule au runtime. Les cinq cubes sont fabriqués hors
runtime par `tools/build_*.py`. Un défaut de fabrication ne serait donc pas un
défaut de l'application — mais il produirait quand même un chiffre faux à
l'écran. Les contrôles **C-xx** portent sur cette frontière.

---

## 2. Politique de tolérance

Déclarée avant tout contrôle, et justifiée. Aucune tolérance ne sera élargie
après coup pour faire passer une ligne : si un écart dépasse le seuil, il devient
un **Défaut** ou un **Écart expliqué**, jamais un seuil relevé.

| Nature | Tolérance | Justification |
|---|---|---|
| **Effectifs, comptages, nombres de lignes** | **0 — égalité exacte** | Ce sont des entiers. Aucun mécanisme numérique ne peut en changer la valeur. Tout écart est un défaut de logique. |
| **Sommes de montants** | **1e-9 en relatif** | `SUM(...)::DOUBLE` sur ~5,76 M lignes. L'erreur d'accumulation d'une somme flottante croît en √n·ε : √5,76e6 ≈ 2 400, ε ≈ 2,2e-16, soit ~5e-13 en relatif. **1e-9 est trois ordres de grandeur au-dessus du bruit** — assez large pour ne jamais faussement accuser, assez serré pour attraper toute erreur de logique, qui se compte en pourcents et non en 1e-9. |
| **Ratios** | **1e-8 en relatif** | L'erreur relative d'un quotient majore la somme des erreurs relatives de ses termes, soit ~2e-9. Le seuil retenu garde un facteur 5 de marge. |
| **Égalités d'additivité** (Σ parties = tout) | **1e-9 en relatif**, et **0 pour les comptages** | Même somme, même nature d'erreur. |
| **Valeurs de référence externes** | **aucune tolérance a priori** | Un écart n'y est jamais « toléré » : il est **expliqué** (champ, régime, millésime, date d'arrêté) ou il reste un défaut. Une tolérance numérique n'aurait aucun sens en face d'un périmètre différent. |
| **Arrondi d'affichage** | **hors de ce barème** | Contrôlé séparément en Phase 5. Un nombre juste mal arrondi est un défaut d'affichage, jamais un défaut de calcul, et les confondre masquerait les deux. |

**Comparaison des absents.** `None` n'est jamais égal à `0`. Un contrôle dont
l'attendu est « absent » vérifie l'absence, pas la nullité. C'est une règle de
`CLAUDE.md` avant d'être une règle d'audit.

---

## 3. Les contrôles proposés

Numérotés, groupés par phase. Chacun porte la façon dont sa référence est
obtenue — c'est la colonne qui décide s'il vaut quelque chose.

### Phase 1 — Cohérence interne de DAMIR (`I-xx`)

| Réf | Contrôle | Référence obtenue par |
|---|---|---|
| I-01 | Σ régions = France entière, par année × mesure additive | SQL manuel sur le Parquet |
| I-02 | Σ tranches d'âge = tous âges | idem |
| I-03 | Σ sexes, **modalité non renseignée comprise** = tous sexes | idem |
| I-04 | Σ grands postes, **« Autres » compris** = total du cube | idem |
| I-05 | Σ postes d'un grand poste = ce grand poste ; idem sous-postes, idem prestations | idem, en cascade |
| **I-06** | **Compact contre brut**, mesure par mesure, toutes années, tous grands postes | deux SQL manuels, un par fichier |
| I-07 | Filtrer sur **toutes** les modalités d'une dimension = ne pas filtrer (région, âge, sexe, 4 niveaux de prestation) | l'application contre elle-même, **assumé partiellement circulaire** — voir §5 |
| I-08 | Codes `prs_nat` non couverts par `prs_nat_transco.csv` : nombre et poids en montant | SQL manuel, anti-jointure |
| I-09 | « Autres » (non transcodé), `__other__` (repli au-delà de 60 modalités) et « Reste du périmètre » (complément de sélection) sont trois choses distinctes et ne se confondent jamais | lecture du code + SQL |
| I-10 | Origine exacte des montants négatifs de « Autres » : composante, codes, volume | SQL manuel, décomposition |

**I-06 est le contrôle le plus important de la phase.** Le compact est déclaré
« strictement équivalent » au brut agrégé à l'année ; s'il ne l'est pas, tous les
chiffres de l'outil sont faux et rien ne le signale. Le brut fait 1,1 Go : ce
contrôle sera long, et c'est normal.

### Phase 2 — Parité entre les écrans (`P-xx`)

Au moins vingt scénarios, croisant : national / régional · avec et sans filtre
d'âge · avec et sans filtre de sexe · les quatre niveaux de la hiérarchie de
prestations · mesures additives et ratios.

| Réf | Contrôle |
|---|---|
| P-01 … P-06 | Le même périmètre et la même mesure dans **Panorama, Explorer, Tableau, Extraire** — quatre chemins, un seul nombre attendu |
| **P-07** | **Le remboursé d'Extraire change-t-il selon que « Ticket modérateur » est coché ?** (voir §1.1) |
| P-08 | `FORMULAS` contre `METRICS`, indicateur par indicateur, sur un périmètre fixe : les deux définitions donnent-elles le même nombre ? |
| P-09 | Croisements (cinquième chemin, SQL propre) contre Panorama, sur la même maille |
| P-10 | Parité **serveur / client** : réimplémentation Python de la `formula_spec` renvoyée par l'API, comparée à la valeur affichée |

**Tout écart est un défaut**, y compris de dernière décimale : c'est la signature
d'un calcul dupliqué qui a divergé.

### Phase 3 — Valeurs de référence externes (`R-xx`)

| Réf | Base | Valeur à confronter | État de la référence |
|---|---|---|---|
| R-01 | DAMIR | dépense remboursée totale par année | **à fournir** — ameli.fr, série labellisée. `tools/calage_damir.py` prépare déjà les colonnes vides et documente l'écart attendu régime général → tous régimes (**+8 à 12 %**) |
| R-02 | DAMIR | remboursé par grand poste | **à fournir** |
| R-03 | Population | France au 1er janvier 2026 — l'application affiche **69 081 996** | **à fournir** — Insee |
| R-04 | Pathologies | prévalence d'une pathologie majeure | **à fournir** — Cnam |
| R-05 | Mortalité | décès totaux d'une année | **à fournir** — CépiDc ou Insee |
| R-06 | CSP | effectif d'un groupe socioprofessionnel | **à fournir** — Insee |

**Aucune de ces six valeurs ne sera écrite de mémoire.** Le poste est hors ligne
par principe (`CLAUDE.md` : « rien ne quitte le poste »), et je ne peux donc pas
les consulter moi-même. Ces six lignes resteront **En attente** tant que tu ne
m'auras pas fourni les chiffres et leurs sources — organisme, titre, millésime,
date de consultation. C'est la limite la plus importante de cet audit, et je
préfère l'annoncer maintenant que la découvrir en Phase 3.

### Phase 4 — Invariants et cas limites (`V-xx`)

| Réf | Contrôle |
|---|---|
| V-01 | Taux de prise en charge ≤ 100 % ; prévalence et parts dans [0, 100] ; effectifs ≥ 0 |
| V-02 | Un ratio sans dénominateur renvoie `None`, **jamais 0** — sur le serveur et dans la valeur affichée |
| V-03 | Une prévalence masquée (effectif < 10) reste absente ; un territoire sans donnée reçoit `--map-void` et non le bas de rampe |
| V-04 | Le ticket modérateur ne ressort **jamais négatif**, sur aucun périmètre |
| V-05 | Projection des mailles d'âge (DAMIR décennal, Cnam quinquennal, Insee quinquennal, CSP âge révolu) : les totaux sont conservés, rien n'est perdu ni dupliqué. Attention particulière à « 95 ans et plus » |
| V-06 | Dénominateur de population : moyenne des 1ers janvier N et N+1, ou 1er janvier seul ? Que fait le code sur la **dernière année**, où N+1 manque ? Aucun chemin n'utilise-t-il encore le `npop` de la Cartographie là où l'Insee est annoncé ? |
| V-07 | Croisements : 12 × 8 × 2 = 192 cellules attendues, 191 présentes — **déjà identifié** |

**V-07 est déjà résolu** et sera reporté tel quel, avec sa preuve : la cellule
manquante est **Île-de-France · moins de 20 ans · femmes**. DAMIR la porte, la
CSP non, parce que le recensement n'y compte aucun « Agriculteur exploitant » —
cinq groupes sur six présents. Le serveur expose désormais ce décompte
(`coverage`) et l'écran le nomme.

### Phase 5 — L'affichage (`A-xx`)

| Réf | Contrôle |
|---|---|
| A-01 | Unités et abréviations : aucune abréviation anglaise |
| A-02 | Séparateur décimal = virgule ; séparateur de milliers = espace insécable |
| A-03 | Signe : aucun `+` devant un niveau, `+` obligatoire devant une variation positive |
| A-04 | Cohérence d'unité entre une valeur et son cumul |
| A-05 | Arrondi : la somme des valeurs arrondies affichées peut différer du total arrondi — **le documenter, pas le masquer** |

---

## 4. Le squelette du harnais

```
tools/audit/
  __init__.py
  lancer.py          # point d'entrée unique : régénère docs/AUDIT_CHIFFRES.md
  socle.py           # connexion DuckDB en lecture seule, tolérances, verdicts
  reference.py       # SQL écrit à la main, sans aucun import de app/
  phase1_interne.py
  phase2_parite.py
  phase3_externe.py  # lit docs/audit/references_externes.csv, jamais de valeur en dur
  phase4_invariants.py
  phase5_affichage.py
  rapport.py         # rend le tableau Markdown
```

Une seule commande :

```bash
.venv/Scripts/python.exe -m tools.audit.lancer
```

**Contraintes que le harnais s'impose :**

- **Il n'importe rien de `app/`** dans `reference.py`. C'est la règle
  fondamentale rendue mécanique : si le module de référence ne peut pas importer
  le code testé, il ne peut pas produire une valeur circulaire par accident.
- **Il ouvre DuckDB en lecture seule** et n'écrit jamais dans `data/`.
- **Aucune dépendance nouvelle.** Ni pandas, ni NumPy, ni pytest-benchmark.
  `tools/rapport_qualite.py` importe pandas et ne s'exécute pas sur un poste
  préparé par `preparer.bat` : le harnais ne refera pas cette erreur.
- **Réexécutable sans effet de bord**, et **idempotent** : deux exécutions de
  suite produisent le même rapport.
- **Les valeurs de référence externes vivent dans un CSV**, jamais dans le code :
  une ligne sans valeur produit un verdict **En attente**, pas une erreur.
- **En-tête du rapport** : date, branche, commit, empreinte des fichiers de
  données. Sur `cube_damir.parquet` (1,1 Go), l'empreinte sera **taille +
  date de modification**, pas un SHA-256 : hacher 1,1 Go à chaque exécution
  coûterait plus que tous les contrôles réunis. Le compact, lui, sera haché.

---

## 5. Ce qui ne pourra pas être contrôlé indépendamment

Trois limites, annoncées maintenant plutôt que découvertes en route.

**a. Les six valeurs de référence externes** (R-01 à R-06). Le poste est hors
ligne ; je ne peux consulter aucune publication. Elles resteront **En attente**
jusqu'à ce que tu les fournisses, avec leur source.

**b. Le contrôle I-07 est partiellement circulaire.** « Filtrer sur toutes les
modalités = ne pas filtrer » compare l'application à elle-même. Écrit en SQL
manuel, il ne testerait que DuckDB. Il garde une valeur — il attrape un `WHERE`
mal construit — mais il ne prouve pas que le filtre est juste. Ce sera dit dans
la colonne « comment la référence est obtenue », et non passé sous silence.

**c. L'exécution TypeScript des formules.** La Phase 2 réimplémentera la
`formula_spec` en Python, ce qui contrôle **la spécification** mais pas le code
client qui l'évalue. Les trois options te seront soumises en fin de Phase 2,
comme la mission le prévoit. Je ne trancherai pas seul.

---

## Ce que j'attends de toi avant la Phase 1

1. **La politique de tolérance** du §2 te convient-elle, en particulier le 1e-9 ?
2. **La liste des contrôles** est-elle complète ? Manque-t-il un écran, une
   mesure, un cas que tu sais fragile ?
3. **Les six valeurs de référence externes** : peux-tu les fournir, ou faut-il
   les laisser « En attente » et livrer un audit de cohérence interne seulement ?
4. **L'ordre.** I-06 (compact contre brut) est le plus coûteux et le plus
   important. Je propose de le passer **en premier** de la Phase 1, pour que, s'il
   échoue, tout le reste change de sens immédiatement.
