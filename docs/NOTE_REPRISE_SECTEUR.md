# Note de reprise — secteur public/privé dans les cubes et dans l'outil

*Écrite le 23 septembre 2026, à l'attention de la session suivante. La mission
décrite dans `docs/PROMPT_VARIABLES_ETABLISSEMENT.md` est **faite, ses trois
étapes comprises**. Cette note dit ce qui a changé, ce que les cubes
contiennent désormais, et les décisions qui restent ouvertes.*

---

## En une phrase

Les cubes portent maintenant le secteur public/privé et le type
d'établissement, l'application sait les filtrer et les découper, et la question
du client a sa réponse chiffrée : **92,5 % des séjours facturés dans DAMIR
viennent d'établissements privés, 7,1 % du public — et ces 7,1 % ne sont pas
des séjours** mais du ticket modérateur, du forfait journalier, du régime local
d'Alsace-Moselle et du SSR.

## Ce qui a été fait

**Étape A — mesurer.** `tools/mesure_secteur.py`, lecture seule, sur un mois de
flux (juin 2024, 37,4 M lignes, 30 s). Résultats complets et commentés dans
`docs/MESURE_SECTEUR_PUBLIC_PRIVE.md`. C'est le document à lire avant de
toucher au sujet.

**Étape B — reconstruire.** `tools/build_cube_damir.py` lit les 132 `.csv.gz`
**directement**, sans passer par les parquets annuels intermédiaires que
l'ancien pipeline fabriquait (46 Go économisés). 75 minutes. Contrôlé par
`tools/verifier_cube_v2.py` : agrégé aux neuf clés d'origine, le nouveau cube
est **identique à l'ancien**, année par année et grand poste par grand poste,
sur les neuf mesures.

**Étape C — exposer.** Dimensions `sector` et `facility`, filtres dans le
panneau avancé et dans le tiroir de la barre de portée, état dans l'URL.
`METADATA_SCHEMA` passé de 4 à 5.

## La structure des cubes, après

| Fichier | Taille | Lignes | Colonnes |
|---|---:|---:|---:|
| `data/cube_damir.parquet` | 2,02 Go | 94 214 107 | 22 |
| `data/cube_damir_compact.parquet` | 226 Mo | 9 834 443 | 18 |
| `data/cube_delais.parquet` | 13 Mo | 1 821 268 | 5 |
| `data/cube_reglement.parquet` | — | — | **absent du poste** |

```
cube_damir           soi_ann soi_moi prs_nat asu_nat age sexe region env ald
  (source de vérité)   sec ete_typ mdt taa
                       rem bse dep depas qte rem_ref bse_ref rem_neg nb

cube_damir_compact   soi_ann prs_nat asu_nat age sexe region env ald
  (lu par l'appli)     sec ete_typ
                       rem bse dep depas qte rem_ref bse_ref rem_neg

cube_delais          soi_ann soi_moi flx prs_nat rem      (inchangé)
```

Les quatre colonnes nouvelles, et leur origine :

| Colonne | Source SNDS | Modalités |
|---|---|---|
| `sec` | `PRS_PPU_SEC` | 1 public · 2 privé · (9 inconnue, **jamais employée**) |
| `ete_typ` | `ETE_TYP_SNDS` | 0 ambulatoire libéral · 1 public · 2 PSPH · 3 ex-PJP · 4 privé lucratif · 6 privé non lucratif · 99 inconnue |
| `mdt` | `MDT_TYP_COD` | 1 séjourné · 2 externe · 3 domicile · 9 sans objet |
| `taa` | `ETE_IND_TAA` | 0 hors TAA · 1 TAA publique · 2 TAA privé · 8 non transmis · 9 inconnue |

Leur remplissage réel, sur les 11 années, en part de dépense :

```
sec       2 privé 94,9 %  |  1 public 5,1 %          aucune valeur nulle
ete_typ  99 : 73,8 %  4 : 16,7 %  1 : 4,8 %  6 : 4,2 %  2 : 0,5 %  3 : 0,1 %  0 : 0 %
mdt       9 : 90,3 %  2 : 5,1 %   1 : 4,4 %  3 : 0,1 %
taa       9 : 73,8 %  2 : 12,8 %  0 : 11,1 %  1 : 2,2 %  8 : 0 %
```

## Trois pièges de lecture, à ne pas répéter

**1. « Privé » n'est pas « clinique privée ».** La modalité privée de `sec`
couvre toute la médecine de ville — pharmacies, dentistes, opticiens, libéraux
— et pèse pour cette seule raison 94,9 % de la dépense. Le chiffre ne dit rien
des cliniques. C'est `ete_typ` qui sépare l'hôpital de la clinique. Les deux
variables sont emboîtées : `sec = 1` ⇔ `ete_typ ∈ {1, 2, 3}`, au million près.

**2. La modalité 99 d'`ete_typ` confond deux choses** : « soin de ville, aucun
établissement » et « établissement inconnu ». La modalité 0, qui devrait porter
le premier cas, n'est jamais employée. On ne peut donc pas distinguer un vrai
manquant d'un soin de ville. D'où son libellé dans l'interface : **« Hors
établissement ou non renseigné »**, et non « Non renseigné », qui aurait laissé
croire à un trou de données de 74 %.

**3. `CPT_ENV_TYP` ne sépare pas public et privé.** Son enveloppe 2 mélange
« les versements aux établissements de santé publics, privés et
médico-sociaux ». Ne pas s'en servir pour cette question.

## Les décisions prises, et pourquoi

**Les quatre variables sont dans le cube brut ; seules `sec` et `ete_typ` sont
dans le compact.** Le prompt de mission désignait `PRS_PPU_SEC` et
`MDT_TYP_COD` comme le couple porteur. La mesure dit le contraire :

- `mdt` est « sans objet » sur 90,3 % de la dépense et — plus grave — sur
  **82 % du poste `Hospitalisation Séjour`**. Un séjour en clinique n'est pas
  marqué « séjourné ». La variable ne peut pas porter la distinction séjour /
  consultation externe.
- `taa` ne cible pas les ACE comme le descriptif SNDS l'annonce : sur la TAA
  publique, 75,8 % est en mode « sans objet » et 24 % en consultation externe.

Ce n'est pas une question de taille — le compact à quatre clés tiendrait sous
les 15 M lignes que le prompt fixait comme limite. C'est une question
d'honnêteté : trop peu renseignées pour qu'un écran s'y appuie sans mentir.
**`mdt` et `taa` restent dans le cube brut**, disponibles par script pour une
étude qui saurait ce qu'elle fait.

**Pas de mesure « part du secteur » dédiée.** Une part par secteur n'est pas
une formule sur les composantes d'une ligne mais un rapport au total du
périmètre, que le moteur d'`explore.py` (`facteur × Σnum / Σdén` sur une même
ligne) ne sait pas évaluer. Le découpage par `sector` donne les modalités côte
à côte et la part s'en lit directement. Le prompt demandait de ne pas forcer.

**`ignore_facility=True` dans `cube_where`.** Le cube des règlements n'a pas
les deux nouvelles dimensions — son script ne sait pas les produire et le
fichier est absent du poste. Les deux appels en année de règlement
(`explore.py:197`, `time_basis.py:62`) passent ce drapeau, sur le modèle
d'`ignore_sex` qui existait déjà. Le jour où `build_cube_reglement.py` ajoute
les deux dimensions, le drapeau disparaît et rien d'autre ne bouge.

## Deux choses que le prompt de mission affirmait, et qui étaient fausses

**« Aucun script d'ingestion ne figure au dépôt. »** Ils existent, hors dépôt,
dans `..\Annee_Damir\` : `convertir_damir.py` (csv.gz → parquet annuel, 61
variables, 19 gardées) et `construire_cube.py` (parquet → cube). Ils font foi
sur la correspondance des colonnes.

**La correspondance des colonnes, « déduite des libellés », était fausse sur
cinq lignes.** La vraie, lue dans le code et désormais reprise dans
`tools/build_cube_damir.py` :

| Cube | Source réelle | Le prompt supposait |
|---|---|---|
| `dep` | `FLT_PAI_MNT` | `PRS_PAI_MNT` |
| `depas` | `FLT_DEP_MNT` | `PRS_DEP_MNT` |
| `qte` | `FLT_ACT_QTE` | `PRS_ACT_QTE` |
| `nb` | `count(*)` | `PRS_ACT_NBR` |
| `rem_ref` / `bse_ref` | `PRS_REM_MNT` / `PRS_REM_BSE` filtrés sur `PRS_REM_TYP = 0` | variantes `FLT_*` |
| `rem_neg` | somme des `PRS_REM_MNT` négatifs | — |

Les mesures `FLT_*` sont **préfiltrées à la source** : leur somme est identique
avec ou sans le filtre `SOI_ANN BETWEEN 2014 AND 2100`, là où `PRS_REM_MNT`
perd 8,8 % sur un mois de flux. C'est pourquoi le filtre de l'ancien cube a été
repris à l'identique.

## Un piège découvert en route : le schéma d'Open DAMIR bouge

Trois schémas distincts sur les 132 fichiers mensuels :

| Schéma | Colonnes | Période |
|---|---:|---|
| 1 | 56 | 01/2015 → 07/2023 |
| 2 | 55 | 08/2023 → 09/2024 |
| 3 | 57 | 10/2024 → 12/2025 |

Les colonnes de queue vont et viennent (`ETB_DCS_MCO` apparaît puis disparaît,
`PSP_STJ_SNDS` et `TOP_PS5_TRG` inversement). En plus, `A202301.csv.gz` porte
des lignes **plus courtes que son en-tête**, sur lesquelles le détecteur de
dialecte de duckdb abandonne. D'où, dans `build_cube_damir.py` :

- `null_padding=true` — les champs manquants deviennent NULL, la ligne est
  conservée. **Surtout pas `ignore_errors=true`**, qui ferait passer le fichier
  en supprimant les lignes fautives sans rien dire.
- un contrôle des 132 en-têtes **avant tout calcul**. Échouer en 30 secondes
  plutôt qu'à la 97ᵉ minute, ce qui est arrivé.

## Ce qui reste ouvert, pour toi

**Le cube des règlements.** Il n'existe pas sur ce poste et sa source
(`cube_parts3/`) non plus. Lui donner `sec` et `ete_typ` demanderait d'adapter
`tools/build_cube_reglement.py` pour qu'il parte du cube brut plutôt que de
tranches disparues. Tant que ce n'est pas fait, `ignore_facility=True` protège.

**`mdt` et `taa` dans le compact.** Écartées pour les raisons ci-dessus. Si un
usage précis les justifie, elles sont déjà dans le cube brut : il suffit de les
ajouter à `KEYS` dans `tools/build_cube_compact.py` et de relancer — 35
secondes, aucune reconstruction du cube brut nécessaire.

**Le poste `Hospitalisation` contient 548 M€/mois de `Transport`**, rangés là
par `prs_nat_transco.csv`. Tout pourcentage calculé sur ce grand poste en est
faussé. Le dépôt le sait en partie (commit « Les codes 4243-4247 de 2025 sont
des transports »), mais la correction ne couvre pas tous les mois.

**36,7 M€/mois portent `sec = 2` (privé) et `ete_typ = 1` (public)** — les deux
variables se contredisent. Marginal (0,25 %) mais réel : ne pas les présenter
comme interchangeables.

## Où sont les données, et ce qui ne passe pas par git

Les cubes **ne sont pas versionnés** dans l'état où ils sont ici :
`data/cube_damir.parquet` et `data/cube_delais.parquet` sont marqués
`skip-worktree`, et le compact est dans `.gitignore`. Le dépôt garde la version
d'avant. Les cubes se transfèrent à la main.

    git ls-files -v data/ | grep ^S      # pour voir le verrou
    git update-index --no-skip-worktree data/cube_damir.parquet   # pour le lever

Les 132 fichiers sources (`..\Annee_Damir\`, **109 Go**) ne sont sur aucun
dépôt et ne sont pas transférables autrement que par disque physique. Pour
rejouer une ingestion complète, il faut ce dossier ou re-télécharger les flux
mensuels depuis le portail de l'Assurance Maladie (~500 Mo à 1 Go par mois).

Une sauvegarde de l'ancien cube est gardée sous
`data/cube_damir_ancien.parquet` (1,09 Go, ignoré par git) le temps de valider
le nouveau. Elle peut être effacée sans regret une fois l'application vérifiée.
