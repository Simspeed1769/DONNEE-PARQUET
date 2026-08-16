# MISSION — DAMIR Studio · réparer, refondre, approfondir

> **Mode d'emploi (humain).** Placer ce fichier à la racine, à côté de `CLAUDE.md`.
> Lancer **un bloc à la fois**, et à l'intérieur d'un bloc, **un point à la fois** :
> « Lis MISSION_3_BLOCS.md, CLAUDE.md et LISEZMOI.md en entier. Exécute le Bloc 1, point 1.1 uniquement. Plan bref avant de coder, commit à la fin, puis arrête-toi. »

**Document de référence : `LISEZMOI.md` (audit du 15 août 2026)**, vérifié par lecture du code et par exécution. `docs/ETAT_DES_LIEUX.md` (9 août) est périmé — ne pas s'y fier, et le supprimer au point 1.9.

Les principes de `CLAUDE.md` restent la loi : rien ne quitte le poste · une donnée absente reste absente · une forme qui mentirait n'est pas offerte · langage écologique dans Croisements · SQL paramétré · aucune couleur en dur · rien ajouté à `styles.css` · aucune nouvelle dépendance sans accord explicite (**une seule exception, au point 3.1**).

Contrôles avant chaque commit : `npm run build` vert et `python -m pytest` vert (54 tests au départ, jamais moins). Message de commit en français. 3 à 5 lignes ajoutées à `docs/PROGRESS.md` par point (fait / écarté / non vérifié).

---

# BLOC 1 — Réparer et faire respirer

Défauts visibles, correctifs courts. Ce bloc doit tenir en une journée et supprime tout ce qui fait douter de la qualité de l'outil.

## 1.1 — Trancher le thème sombre

`theme.css` porte **deux thèmes complets** et la bascule est dans la barre du haut, mais deux règles annulent le sombre sur les panneaux de contenu :

```
styles.css:151    .panel { … background: #fff; }
styles.css:2084   .content-wrap :is(select, input:not([type="checkbox"])) {
                    background-color: #fff !important; }
```

Conséquence : **en thème sombre, les panneaux restent blancs dans toute l'application**, à côté du tiroir des séries qui, lui, est correctement thémé.

**Travail.** Passer ces deux règles aux jetons. Puis parcourir chaque écran en thème sombre forcé (`data-theme="dark"`) et corriger les couleurs en dur qui ressortent — panneaux, champs, listes, popovers, tiroir, tableaux repliés, bandeau de comparaison. Captures écran par écran.

Si le résultat ne peut pas être rendu propre partout, **le signaler et s'arrêter** : l'utilisateur préférera retirer la bascule plutôt que proposer un mode à moitié appliqué. Ne pas décider seul.

## 1.2 — Revue responsive sous 1272 px

**Jamais faite, signalée deux fois dans l'audit.** Parcourir les neuf écrans aux largeurs **1400 / 1272 / 1240 / 1024 / 860 / 720 / 620 px**, dans les deux thèmes, captures à l'appui.

Corriger chevauchements, textes coupés, tracés rognés, contrôles qui débordent, popovers hors écran. Traiter la cause (hauteur fixe, `overflow`, `grid.top` insuffisant pour le nom d'axe et les étiquettes), **jamais en réduisant les polices**.

## 1.3 — `logical_names` périmé (bug utilisateur)

`main.py:1102` cite encore `ExplorePage` et `vendor-plotly` (disparus) et **omet `PopulationPage`, `CorrelationsPage`, `DamirPage`**. La récupération d'asset périmé ne couvre donc pas les trois écrans les plus récents : après un rebuild, un onglet resté ouvert sur Population donne un écran blanc au lieu d'une reprise.

Corriger la liste, et la dériver du manifeste de build plutôt que de la maintenir à la main si c'est possible sans complexité inutile.

## 1.4 — Chaînes et API périmées

- `MethodologyPage.tsx:72` : « 4 sources actives » alors que **cinq** fiches sont rendues. Dériver le nombre du catalogue, pas d'une chaîne en dur.
- `main.py:1139` : `@app.on_event("startup")` déprécié — passer au `lifespan` de FastAPI, faire disparaître le `DeprecationWarning` des tests.
- `DESIGN.md` § « Formes propres au produit » décrit encore **trois** sections DAMIR et la « comparaison libre » comme un écran : mettre à jour.

## 1.5 — Trancher la contradiction sur les réserves

`CLAUDE.md` affirme : « Les réserves voyagent … à l'écran **et** dans l'image exportée. »
`panorama/exportSlide.ts` les a délibérément retirées de l'image.

**Le principe écrit et le code se contredisent.** Proposer les deux options à l'utilisateur — réserves complètes dans le PNG, ou mention courte de source et de périmètre avec renvoi à l'écran — **et attendre sa décision**. Puis aligner celui des deux documents qui a tort.

## 1.6 — Supprimer `correlations/AdvancedCross.tsx`

673 lignes, **zéro import entrant**, maintenues en cohérence avec l'API pour aucun utilisateur. Git les conserve.

Supprimer le fichier. Vérifier que les endpoints qu'il consommait servent encore un appelant réel ; ceux qui ne servent plus personne partent avec lui.

## 1.7 — Disposition : faire respirer le haut de page

**Constat.** Sur Comparer, six bandes s'empilent avant le tracé : filtres → bandeau « Ce que je compare » → amorce → titre → axes de comparaison → question + vues + palette → repères chiffrés. Sur un portable, le graphique commence sous la ligne de flottaison. C'est aussi la cause structurelle des chevauchements du point 1.2.

**Travail.**
1. **Déplacer les axes de comparaison** (Grands postes · Postes · Sous-postes · Prestations · Région · Âge · Sexe · Année) **dans la barre de filtres**, avec le périmètre : c'est un choix de sujet, pas de représentation. La barre du graphique ne garde que les vues, la palette et les repères.
2. **Réduire les vues visibles.** Dix en permanence, c'est trop. Accès direct : Courbes, Barres, Classement, Base 100, Variation. Repliées derrière « Autres vues » : Camembert, Aires empilées, Écarts, Carte de chaleur. Le modèle continue de **retirer** celles qui mentiraient — le repli est cosmétique, pas une autorisation.
3. **Dédoublonner l'en-tête.** L'amorce, le titre et le premier repère chiffré disent la même chose sur trois lignes. Une seule amorce par écran, un titre qui porte l'information.
4. Appliquer le même dégraissage aux quatre autres bases.

**Ne rien supprimer de fonctionnel** : tout reste atteignable, seule la densité change.

## 1.8 — Tons : le rouge n'est plus la couleur par défaut des tracés

**Constat.** `paletteColor()` donne `--accent` (rouge Forsides `#d8383c`) à une série seule : tous les graphiques par défaut sont rouges. Dans un contexte santé et financier, le rouge signifie alerte — une courbe de dépenses qui monte se lit comme un problème alors qu'elle est neutre. Le bouton « Rouge / Bleu » est le symptôme de ce défaut, pas sa solution.

**Travail.**
1. Introduire un jeton de tracé neutre — graphite encre ou bleu profond, validé dans les deux thèmes — et en faire la **couleur par défaut d'une série seule**. Le rouge redevient l'accent de marque : amorces, titres, états actifs, jamais le tracé par défaut.
2. **Hiérarchiser la palette.** Les huit rangs sont saturés à luminance comparable : lisible à deux ou trois séries, confus à six. Pleine saturation sur les **trois premières**, désaturation progressive ensuite.
3. **Rejouer les six contrôles de daltonisme** dans les deux thèmes et consigner le résultat.
4. Le bouton de palette reste, en réglage secondaire.

**Avant de généraliser** : produire une capture du même graphique dans l'ancienne et la nouvelle couleur par défaut, et **attendre l'accord de l'utilisateur**.

## 1.9 — Ménage documentaire

Supprimer `docs/ETAT_DES_LIEUX.md`. `LISEZMOI.md` devient la référence unique, citée comme telle dans `CLAUDE.md`.

**Acceptation Bloc 1.** Thème sombre tranché et propre (ou bascule retirée sur décision) · aucun chevauchement ni texte coupé aux sept largeurs dans les deux thèmes · reprise d'asset fonctionnelle sur les neuf écrans · aucun `DeprecationWarning` · contradiction des réserves tranchée · `AdvancedCross.tsx` supprimé · haut de page dégraissé sur les cinq bases · couleur de tracé par défaut neutre validée · 54 tests verts.

---

# BLOC 2 — Refondre

## 2.1 — Repères devient un tableau croisé

**Constat.** L'écran choisit une source, puis un calcul parmi six (`value`, `period_total`, `average_unit`, `cagr`, `change`, `dispersion`), et produit **un chiffre**. Or Panorama affiche déjà dernière valeur, variation et cumul : seuls le CAGR et la dispersion apportent du neuf. Le nom ne dit rien, le serveur parle un autre vocabulaire que l'interface (`studio.py` : `evolution`, `comparison`, `juxtaposition`, `liquidation`, `decomposition`, `calculator`), et `BenchmarksPage.tsx` pèse 1 137 lignes en un composant.

**Cible : un tableau croisé dynamique** — l'objet que tout le monde a déjà manipulé dans Excel, donc zéro apprentissage.

**Interface.**
- Trois zones : **Lignes**, **Colonnes**, **Mesure**. On y dépose une dimension par glisser ou par menu (région, âge, sexe, année, grand poste, poste, prestation, pathologie, CSP, cause — selon la source).
- Un menu **Agrégation** qui absorbe les six calculs existants.
- Recalcul en direct : **totaux et sous-totaux**, tri par n'importe quelle colonne, cellules teintées par une rampe séquentielle pour repérer les extrêmes.
- Un bouton bascule le tableau en graphique (réutiliser les builders existants).
- **La méthode dépliée est conservée** — définition, formule, dénominateur, limitation. C'est ce qui distingue ce tableau d'un croisé Excel, et le cœur de la valeur de l'écran.
- Exports : CSV, Excel auto-documenté, PNG.

**Serveur.** Ajouter `POST /api/pivot` agrégeant sur **deux dimensions** et **respectant le contrat central** : composantes brutes + `formula_spec`, jamais un indicateur calculé. Réutiliser `cube_where` et le moteur d'`explore.py`, pas un second chemin d'agrégation. Plafonner le produit lignes × colonnes et lever une `ValueError` en français au-delà.

**Nommage.** L'entrée devient **Tableau** (ou **Croisé**). Mettre à jour barre latérale, liens entrants et `docs/`.

**Frontière avec Extraire, à énoncer dans l'écran :** Extraire sort des **lignes brutes** pour Excel ; le Tableau donne un **agrégat lisible à l'écran**.

Retirer de `studio.py` ce qui ne sert plus — mais **conserver `reliability_metadata`** (cadence de liquidation, seuils, année consolidée), qui alimente DAMIR et servira au point 3.4.

## 2.2 — Croisements : plus simple à comprendre

L'écran est déjà bon — porte unique, unité fixée à `region_age_sex`, encart écologique permanent. Trois simplifications.

1. **Une seule variable explicative par défaut.** Une variable, un nuage, une phrase — et « Ajouter une variable » pour aller plus loin. **Le graphique des effets n'apparaît qu'à partir de deux variables.**
2. **Couper la phrase en deux.** Verdict en français simple d'abord, en corps de texte ; effet et intervalle à 95 % en dessous, en plus petit. Le langage écologique et l'encart permanent restent **strictement inchangés**.
3. **Nettoyer après 1.6** : `correlations.py` (1 200 l.) contient croisements et régression ; retirer ce qui n'a plus d'appelant.

## 2.3 — Dette : les cinq copies de l'export

Le motif **CSV + Excel** est écrit **cinq fois** dans `main.py` (DAMIR, Pathologies, CSP, Population, Mortalité) : plus de 400 lignes quasi identiques. Le principe du dépôt — extraire au troisième usage réel — est atteint et dépassé.

Extraire un module unique paramétré par source. **Ne rien perdre** : feuilles Données et Métadonnées, en-têtes figées, largeurs, formats par nature de mesure, dictionnaire des mesures DAMIR, état de consolidation, limite de 250 000 lignes, règles de cohérence par source.

## 2.4 — Dette : découper les fichiers volumineux

Un fichier par commit, **sans changer de comportement** : `main.py` (1 171 l.), `correlations.py` (1 200 l.), `studio.py` (1 091 l. après 2.1), `buildOption.ts` (887 l.).

`styles.css` (2 214 l., 963 couleurs en dur) : **ne pas le réécrire en une passe**. Migrer page par page, en commençant par ce que le point 1.1 aura révélé.

**Acceptation Bloc 2.** Le Tableau produit un croisé à deux dimensions avec totaux, tri, teinte, méthode dépliée et trois exports · `/api/pivot` respecte le contrat composantes + formule · Croisements s'ouvre sur une variable et une phrase lisible · un seul module d'export · aucun fichier au-dessus de ~700 lignes hors `styles.css` · tests verts, plus ceux du pivot.

---

# ⇢ JALON — Montrer l'outil

**Ne pas enchaîner sur le Bloc 3 sans cette étape.** Installer l'outil sur un autre poste, le faire utiliser par un collègue sur une vraie question, noter ce qui bloque. Ce qui remonte de cet usage prime sur tout ce qui suit.

---

# BLOC 3 — Fluidifier et approfondir

## 3.1 — Motion sur le chrome de l'interface

**Unique exception au principe « aucune nouvelle dépendance », explicitement accordée.**

Ajouter **Motion** (ex-Framer Motion) et l'employer **uniquement** sur le chrome : tiroir des séries, popovers, entrée/sortie des puces, bascule Panorama ↔ Comparer, apparition des blocs repliés. **Ne pas toucher aux graphiques** : ECharts et `universalTransition` gardent les transitions de tracé.

Contraintes : motif `LazyMotion` + `m` pour le coût de bundle minimal · n'animer que `transform` et `opacity` · 200 à 300 ms, ressorts plutôt qu'easings linéaires · `prefers-reduced-motion` respecté sans exception · aucun saut de mise en page · mesurer le bundle avant/après et consigner l'écart.

Rester sobre : une animation qu'on remarque est une animation ratée.

## 3.2 — Couverture réelle des sources

Écrire `docs/SOURCES.md` : pour chacune des cinq bases, **première et dernière année présentes dans les fichiers**, trous éventuels, et en regard ce que publie le producteur. Un script d'inventaire relit les Parquet plutôt que de recopier une mémoire.

## 3.3 — Étendre les historiques

DAMIR d'abord. Trois pièges à traiter **avant** l'ingestion :
- **Réforme régionale de 2016** (22 régions avant, 13 après) : sans table de passage, les séries territoriales longues seront fausses **silencieusement**. La base Population Insee, elle, est rétropolée sur les 13 régions depuis 1975.
- **Nomenclature `prs_nat`** : si `prs_nat_transco.csv` ne couvre pas les codes anciens, « Autres » gonflera rétrospectivement.
- **Révisions CIM** côté CépiDc : comparabilité des causes cassée sur longue période.

Journaliser ce qui est ingéré, ce qui est écarté, et pourquoi.

## 3.4 — Exploiter le cube des délais

`cube_delais.parquet` (1,82 M lignes) n'alimente qu'une puce d'état. `reliability_metadata` calcule déjà la courbe cumulée et les seuils.

Afficher sur chaque lecture DAMIR le **taux de complétude de la dernière année** (« exercice 2024 liquidé à 87 % à date ») et **griser le dernier point** quand il n'est pas consolidé. Sans cela, toute tendance qui touche le dernier exercice ment vers le bas — c'est la condition technique du point 3.6.

## 3.5 — Décomposition fréquence × coût moyen

La lecture actuarielle qui manque : DAMIR répond à « combien », jamais à « d'où vient la hausse ».

Avec `qte` et les composantes déjà disponibles côté client, décomposer la variation en **effet volume** et **effet coût moyen**, avec contributions par poste (waterfall). Aucune requête supplémentaire — le contrat composantes + formule le permet. L'effet de structure est **hors périmètre**.

## 3.6 — Prolongation de tendance

**Seulement après 3.3, 3.4 et 3.5.** Log-linéaire sur les années retenues, horizon de deux ans, bande d'incertitude issue des résidus.

Trois conditions non négociables : **dernière année redressée ou exclue** du calage via les délais · **exercices COVID (2020-2021) exclus par défaut**, case décochable · **hypothèses affichées** (années retenues, exercice incomplet exclu, taux annuel implicite).

Libellé imposé partout, écran et export : « **prolongation de tendance** », jamais « prévision ».

**Acceptation Bloc 3.** Chrome animé sobrement, bundle mesuré, `prefers-reduced-motion` tenu · `docs/SOURCES.md` écrit · historiques étendus sans rupture silencieuse · complétude affichée et dernier point grisé · décomposition volume/coût sur DAMIR · prolongation encadrée par ses trois conditions.

---

## Interdits (rappel)

Aucune dépendance hors celle du point 3.1 · aucune couleur en dur · aucun `None` remplacé par 0 · aucune forme non licite offerte · aucune liste déroulante native dans les sélecteurs · aucune formulation individuelle dans Croisements · `styles.css` jamais réécrit en une passe · aucune capacité supprimée sans équivalent · **jamais deux points enchaînés sans validation de l'utilisateur**.

## Points qui exigent une décision de l'utilisateur, pas un choix autonome

1.1 (si le sombre ne peut pas être rendu propre partout) · 1.5 (réserves dans le PNG) · 1.8 (couleur de tracé par défaut, capture comparative à l'appui) · le passage du Bloc 2 au Bloc 3 (jalon).
