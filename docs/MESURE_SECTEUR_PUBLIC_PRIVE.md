# Public et privé dans DAMIR — la mesure

*Étape A de la mission « variables d'établissement ». Mesuré le 23 septembre
2026 sur le flux de juin 2024 (`A202406.csv.gz`, 978 Mo, 37 363 788 lignes),
par `tools/mesure_secteur.py`. Aucun cube n'a été modifié.*

---

## Ce qu'on voulait savoir

`docs/ETUDE_HOSPITALISATION_PAR_POSTE.md` et le diaporama client reposent sur
une affirmation empruntée à la documentation du SNDS, jamais vérifiée sur les
données : les séjours des hôpitaux publics ne seraient pas dans Open DAMIR,
parce qu'ils sont financés par dotation et non facturés patient par patient ;
seuls les actes et consultations externes du public y figureraient.

**L'affirmation est exacte.** Elle est même plus nette que la formulation
prudente de l'étude. Voici le chiffre à la place de la déduction.

## La réponse, en un tableau

Frais de séjour hospitaliers présents dans DAMIR (poste `Hospitalisation
Séjour`, 1 321,1 M€ sur le mois), par type d'établissement exécutant
(`ETE_TYP_SNDS`) :

| Type d'établissement | Dépense | Part |
|---|---:|---:|
| Privé lucratif | 1 025,2 M€ | **77,6 %** |
| Privé non lucratif | 197,3 M€ | **14,9 %** |
| Public proprement dit | 79,7 M€ | 6,0 % |
| PSPH | 9,9 M€ | 0,7 % |
| Ex-PJP ayant opté pour le budget global | 4,4 M€ | 0,3 % |
| Inconnue | 4,6 M€ | 0,4 % |

**92,5 % des séjours facturés dans DAMIR viennent d'établissements privés.
7,1 % viennent du public et du service public hospitalier.**

## Et ces 7 % de public ne sont pas des séjours

C'est le point qui change la lecture. Les lignes de séjour rattachées au
public ne sont pas la dépense de séjour : ce sont les restes à charge
facturés par-dessus la dotation, et les régimes qui facturent autrement.
Détail des prestations du public en mode « séjourné » :

| Prestation | Dépense |
|---|---:|
| 2211 — Frais de séjour *(rééducation, SSR)* | 51,2 M€ |
| 2237 — TM prix de journée, part organismes complémentaires | 38,3 M€ |
| 2230 — Prix de journée **régime local** *(Alsace-Moselle)* | 36,7 M€ |
| 2250 — Forfait journalier, part organismes complémentaires | 17,2 M€ |
| 2251 / 2252 — Forfait journalier et forfait de sortie | 4,9 M€ |
| 2283 / 2284 — Participation assuré hospitalisation publique (CMU, AME, régime local) | 0,4 M€ |
| 2213 — Frais de séjour IME | 0,6 M€ |

Ticket modérateur, forfait journalier, régime local d'Alsace-Moselle, CMU et
AME, et le SSR qui facture encore au prix de journée. **Le séjour MCO du
public financé par dotation est absent de la base.** Ce qu'on en voit est sa
frange facturée.

## Le piège à ne pas tomber dedans

`PRS_PPU_SEC` donne « 94,5 % privé » sur l'ensemble du mois. **Ce chiffre ne
veut pas dire « 94,5 % de cliniques privées »** : la modalité « privé » de
cette variable couvre toute la médecine de ville — pharmacies, dentistes,
opticiens, libéraux. Le croisement avec `ETE_TYP_SNDS` le montre sans
ambiguïté, les deux variables étant emboîtées :

- `PRS_PPU_SEC = 1` (public) = `ETE_TYP_SNDS` ∈ {1 public, 2 PSPH, 3 ex-PJP} —
  799,1 M€, au million près.
- `PRS_PPU_SEC = 2` (privé) = tout le reste, dont 10 169,2 M€ sans
  établissement du tout.

La vraie partition du mois, celle qu'il faut présenter :

| Nature | Dépense | Part du mois |
|---|---:|---:|
| Ville, ambulatoire libéral *(`ETE_TYP_SNDS` = 99)* | 10 169,2 M€ | 69,4 % |
| Établissements **privés** *(4 et 6)* | 3 656,0 M€ | 24,9 % |
| Établissements **publics et SPH** *(1, 2 et 3)* | 835,9 M€ | 5,7 % |

Rapporté aux seuls établissements (4 491,9 M€) : **81,4 % privé, 18,6 %
public**.

## Combien de l'hôpital public DAMIR montre-t-il ?

En annualisant grossièrement le mois (× 12 ; juin est un mois de flux fort, les
niveaux sont environ 5 % hauts — le total annualisé donne 175,9 Md€ quand
DAMIR 2024 en pèse 167) :

| | Ordre de grandeur annuel |
|---|---:|
| Tout le public présent dans DAMIR | ≈ 9,6 Md€ |
| dont séjours | ≈ 1,1 Md€ |
| Dépense de l'hôpital public, source DREES | 93,7 Md€ |

**DAMIR porte environ 10 % de l'activité de l'hôpital public, et cette part
est faite de consultations externes, d'imagerie, de biologie et de restes à
charge — pas de séjours.** Les séjours du public qu'on y trouve valent de
l'ordre de 1 % de sa dépense.

L'écart d'environ 90 Md€ entre DAMIR et la consommation de soins et biens
médicaux, que l'étude attribuait à l'hôpital public par déduction de taille,
est confirmé dans sa cause.

## Ce que les deux autres variables ne savent pas faire

Le prompt de mission désignait `MDT_TYP_COD` et `ETE_IND_TAA` comme porteuses
de la réponse. La mesure dit le contraire, et c'est important pour la suite.

**`MDT_TYP_COD` (mode de traitement) est trop peu renseignée.** « Sans objet »
couvre 91,9 % de la dépense du mois — et, plus gênant, **1 084,4 M€ des
1 321,1 M€ du poste `Hospitalisation Séjour`**, soit 82 % des séjours privés.
Un séjour en clinique n'est pas marqué « séjourné ». Cette variable ne peut
pas porter la distinction séjour / consultation externe.

| `MDT_TYP_COD` | Dépense | Part |
|---|---:|---:|
| 9 — Sans objet | 13 467,5 M€ | 91,9 % |
| 2 — Consultation externe | 674,8 M€ | 4,6 % |
| 1 — Séjourné | 502,2 M€ | 3,4 % |
| 3 — Domicile | 16,7 M€ | 0,1 % |

**`ETE_IND_TAA` ne cible pas les ACE comme annoncé.** Le descriptif dit que la
TAA publique permet de cibler les actes et consultations externes. Sur les
406,8 M€ de TAA publique du mois, 75,8 % sont en mode « sans objet » et
seulement 24,0 % en consultation externe. Et la TAA publique (406,8 M€) est
plus petite que le public total (799,1 M€) : elle n'en couvre que la moitié.

**`ETE_TYP_SNDS` est la variable qui répond.** Elle est renseignée partout où
il y a un établissement, elle distingue lucratif, non lucratif, PSPH et
public, et c'est elle qui donne le tableau de tête.

Une réserve sur sa modalité 99 : elle vaut 69,4 % de la dépense et **confond
deux choses** — « soin de ville, pas d'établissement » et « établissement
inconnu ». La modalité 0 « ambulatoire, secteur libéral », qui devrait porter
le premier cas, n'est jamais utilisée. On ne peut donc pas distinguer un vrai
manquant d'un soin de ville. Cette modalité reste affichée telle quelle, jamais
répartie au prorata.

## Deux anomalies rencontrées en chemin

- **`Transport` pèse 548,3 M€ dans le grand poste `Hospitalisation`**, à
  100 % privé. C'est la nomenclature `prs_nat_transco.csv` qui les y range. Le
  dépôt le sait déjà en partie (commit « Les codes 4243-4247 de 2025 sont des
  transports, pas de l'hospitalisation ») mais la correction ne couvre pas ce
  mois. Tout pourcentage calculé sur le grand poste `Hospitalisation` est
  faussé de ce montant.
- **36,7 M€ portent `PRS_PPU_SEC = 2` (privé) et `ETE_TYP_SNDS = 1`
  (public)** — les deux variables se contredisent sur ces lignes. C'est
  marginal (0,25 % du mois) mais réel ; ne pas présenter les deux variables
  comme interchangeables.

## Portée de la mesure

Un seul mois de flux, juin 2024. Un mois de flux mélange plusieurs mois de
soins : 54,0 % de la dépense est en soins de juin 2024, 29,2 % en mai, 9,1 %
en avril. **Une structure se lit sur un mois ; un niveau annuel ne s'en déduit
pas**, et les ordres de grandeur annuels ci-dessus sont donnés comme tels.

Le contrôle de cohérence est bon : le mois annualisé donne 175,9 Md€ contre
167 Md€ pour DAMIR 2024, écart cohérent avec un mois de flux supérieur à la
moyenne.

## Correspondance des colonnes — corrigée

Le prompt de mission affirmait qu'aucun script d'ingestion ne figure au dépôt
et proposait une correspondance déduite des libellés. Les scripts existent,
hors dépôt, dans `..\Annee_Damir\` : `convertir_damir.py` (csv.gz → parquet
annuel, 61 variables, 19 gardées) et `construire_cube.py` (parquet → cube).
La correspondance réelle, lue dans le code :

| Cube | Colonne source réelle | Le prompt supposait |
|---|---|---|
| `rem` | `PRS_REM_MNT` | idem |
| `bse` | `PRS_REM_BSE` | idem |
| `dep` | **`FLT_PAI_MNT`** | `PRS_PAI_MNT` |
| `depas` | **`FLT_DEP_MNT`** | `PRS_DEP_MNT` |
| `qte` | **`FLT_ACT_QTE`** | `PRS_ACT_QTE` |
| `nb` | **`count(*)`** | `PRS_ACT_NBR` |
| `rem_ref` / `bse_ref` | **`PRS_REM_MNT` / `PRS_REM_BSE` filtrés sur `PRS_REM_TYP = 0`** | variantes `FLT_*`, à confirmer |
| `rem_neg` | **somme des `PRS_REM_MNT` négatifs** | à confirmer |
| `ald` | `EXO_MTF` entre 41 et 46 | idem |

Et un fait qui allège l'étape B : **`PRS_PPU_SEC` est déjà conservée** dans les
parquets annuels de `Annee_Damir/parquet/`. C'est la construction du cube qui
la laisse tomber, pas la conversion.

## Ce que cette mesure recommande pour la suite

L'étape B se justifie : il y a bien une information exploitable, et elle
répond à la question du client. Mais **pas avec les quatre variables prévues**.

- **Garder `PRS_PPU_SEC` et `ETE_TYP_SNDS`.** Ce sont elles qui portent la
  réponse. Six modalités et deux modalités, fortement corrélées à `prs_nat` :
  le gonflement du cube compact restera modéré.
- **Laisser `MDT_TYP_COD` et `ETE_IND_TAA` au seul cube brut**, ou les écarter.
  Elles sont trop peu renseignées pour qu'un écran s'y appuie sans mentir.
- **Conserver `bse` dans le cube compact**, que l'étude réclame pour
  décomposer la part AMO.

Le prompt proposait `PRS_PPU_SEC` + `MDT_TYP_COD` comme couple de repli. La
mesure dit que le bon couple est `PRS_PPU_SEC` + `ETE_TYP_SNDS`.
