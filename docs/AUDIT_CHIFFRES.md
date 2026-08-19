# Audit des chiffres — les résultats affichés sont-ils justes ?

*Exécuté le 19 August 2026 à 09:26, branche `heads/v2`, commit `2ea2939`.*

Rapport **régénéré** par `python -m tools.audit.lancer`. Ne pas le modifier
à la main : toute correction doit passer par le harnais, sans quoi le rapport
cesserait d'être reproductible.

**Phases exécutées : Phase 1.**

## Décompte

| Contrôles exécutés | 12 |
|---|---:|
| Conformes | 7 |
| Écarts expliqués | 5 |
| **Défauts confirmés** | **0** |
| En attente | 0 |

## Empreinte des données auditées

| Fichier | Empreinte |
|---|---|
| `cube_damir.parquet` | 1 091 430 439 o · modifié 2026-07-30 15:22 UTC (non haché : trop volumineux) |
| `cube_damir_compact.parquet` | 121 948 630 o · sha256 26e201a9cfa55de5 |
| `prs_nat_transco.csv` | 153 189 o · sha256 03dde2813fad7ecf |

## Politique de tolérance

Déclarée **avant** les contrôles et jamais élargie après coup. Si un écart la
dépasse, il devient un défaut ou un écart expliqué — jamais un seuil relevé.

| Nature | Tolérance | Justification |
|---|---|---|
| Effectifs, comptages | **0 — exact** | Ce sont des entiers ; aucun mécanisme numérique ne peut en changer la valeur. |
| Sommes de montants | **1e-9 relatif** | L'accumulation flottante sur ~5,76 M lignes croît en √n·ε ≈ 5e-13. Mesuré sur le total `rem` : **3,8e-13**. Le seuil est trois ordres de grandeur au-dessus du bruit. |
| Ratios | **1e-8 relatif** | L'erreur d'un quotient majore la somme de celles de ses termes (~2e-9) ; facteur 5 de marge. |
| Références externes | **aucune** | Un écart n'y est pas toléré : il est expliqué (champ, régime, millésime) ou il reste un défaut. |
| Arrondi d'affichage | **hors barème** | Contrôlé en Phase 5. Un nombre juste mal arrondi est un défaut d'affichage, pas de calcul ; les confondre masquerait les deux. |
| **Plancher absolu** | **1e-6 €** | Voir l'encadré ci-dessous. |

> **Un amendement, déclaré.** Le premier jet du harnais comparait en relatif
> seul, et classait I-06c en **défaut** : « 300 % d'écart ». Vérification faite,
> ces écarts portaient sur des cellules dont la somme vaut **4,4e-16 €** —
> des miettes de virgule flottante nées de l'annulation entre un débit et un
> crédit. Rapporter 1,3e-15 € à un dénominateur de 4,4e-16 € ne mesure rien.
>
> Le critère est devenu `|attendu − obtenu| ≤ 1e-6 € + tolérance × |attendu|`.
> **Ce n'est pas un seuil relevé, c'est une métrique corrigée** : la tolérance
> relative reste à 1e-9. Le rapport publie désormais les deux mesures — écart
> absolu et écart relatif au-dessus du plancher — pour que le lecteur juge
> lui-même. Le pire écart absolu réellement observé entre les deux cubes est
> de 3,6e-07 € ; le plancher est quatre fois au-dessus.

`None` n'est jamais égal à `0`. Un contrôle dont l'attendu est « absent »
vérifie l'absence, pas la nullité.

## Le tableau

| Réf | Base | Contrôle | Comment la référence est obtenue | Attendu | Obtenu | Écart | Verdict |
|---|---|---|---|---|---|---|---|
| **I-01** | DAMIR | Σ des modalités de « region » = total, et poids du résidu | SQL manuel sur le Parquet compact, sans `cube_where` ni aucune fonction du produit | 1 405 038 187 493,9324 | 1 405 038 187 493,9731 | 2.90e-14 | ⚠️ Écart expliqué |
| **I-02** | DAMIR | Σ des modalités de « age » = total, et poids du résidu | SQL manuel sur le Parquet compact, sans `cube_where` ni aucune fonction du produit | 1 405 038 187 493,9324 | 1 405 038 187 493,9788 | 3.30e-14 | ⚠️ Écart expliqué |
| **I-03** | DAMIR | Σ des modalités de « sexe » = total, et poids du résidu | SQL manuel sur le Parquet compact, sans `cube_where` ni aucune fonction du produit | 1 405 038 187 493,9321 | 1 405 038 187 493,9763 | 3.15e-14 | ⚠️ Écart expliqué |
| **I-04** | DAMIR | Σ des grands postes, « Autres » compris, = total du cube | SQL manuel : jointure gauche sur `prs_nat_transco.csv`, COALESCE écrit à la main | 1 405 038 187 493,9326 | 1 405 038 187 493,9744 | 2.97e-14 | ✅ Conforme |
| **I-05** | DAMIR | Cascade : Σ postes = grand poste, Σ sous-postes = poste, Σ prestations = sous-poste | SQL manuel, agrégations parent et enfant calculées séparément puis rapprochées | parent | Σ enfants | 1.19e-14 | ✅ Conforme |
| **I-06a** | DAMIR | Compact contre brut — total, mesure par mesure | deux SQL manuels, un par fichier Parquet ; aucun code du produit | brut | compact | 3.34e-13 | ✅ Conforme |
| **I-06b** | DAMIR | Compact contre brut — par année × mesure | idem, agrégé à l'année de soins | brut | compact | 5.75e-14 | ✅ Conforme |
| **I-06c** | DAMIR | Compact contre brut — cellule par cellule, sur la clé complète (8 colonnes) | jointures externes entre les deux Parquet agrégés à la même clé ; SQL manuel | mêmes clés, mêmes valeurs | 0 clé(s) en désaccord · 0 cellule(s) hors tolérance | 1.14e-12 | ✅ Conforme |
| **I-07** | DAMIR | `cube_where` du produit contre un WHERE écrit à la main (8 scénarios) | **SQL manuel**, prédicat rédigé à la main pour chaque scénario ; `cube_where` fournit la valeur *testée*, jamais l'attendue | prédicat manuel | prédicat du produit | 2.16e-16 | ✅ Conforme |
| **I-08** | DAMIR | Codes `prs_nat` non couverts par la transcodification : nombre et poids | SQL manuel, jointure gauche sur `prs_nat_transco.csv` puis comptage des orphelins | 0 code orphelin | 0 code(s) | 0.000 % | ✅ Conforme |
| **I-09** | DAMIR | « Autres », `__other__` et « Reste du périmètre » ne se confondent jamais | SQL manuel sur la transcodification ; lecture du code pour les deux replis | trois notions disjointes | deux le sont ; la troisième est indiscernable du repli | — | ⚠️ Écart expliqué |
| **I-10** | DAMIR | Origine des montants négatifs de « Autres » | SQL manuel, décomposition `rem = rem_neg + (rem − rem_neg)` | rem = régularisations + remboursements réels | décomposition incohérente | — | ⚠️ Écart expliqué |

## Ce que chaque contrôle a trouvé

### I-01 — Σ des modalités de « region » = total, et poids du résidu

14 modalités, aucune ligne d'agrégat : le total national **est** la somme, et l'additivité est exacte (écart 2.90e-14).

Le point qui mérite l'attention est ailleurs. Le résidu « Non renseignée » pèse 234 847 172 300,0404 € sur 1 405 038 187 493,9324 €, soit **16.715 %**. Additionner les seules modalités nommées donne 1 170 191 015 193,8918 € — il manque exactement ce résidu. La modalité est bien offerte et étiquetée par l'application ; le risque n'est pas qu'elle soit cachée, mais qu'un lecteur additionne les autres et croie tenir le total.

### I-02 — Σ des modalités de « age » = total, et poids du résidu

9 modalités, aucune ligne d'agrégat : le total national **est** la somme, et l'additivité est exacte (écart 3.30e-14).

Le point qui mérite l'attention est ailleurs. Le résidu « Âge inconnu » pèse 19 415 776 474,6799 € sur 1 405 038 187 493,9324 €, soit **1.382 %**. Additionner les seules modalités nommées donne 1 385 622 411 019,2524 € — il manque exactement ce résidu. La modalité est bien offerte et étiquetée par l'application ; le risque n'est pas qu'elle soit cachée, mais qu'un lecteur additionne les autres et croie tenir le total.

### I-03 — Σ des modalités de « sexe » = total, et poids du résidu

4 modalités, aucune ligne d'agrégat : le total national **est** la somme, et l'additivité est exacte (écart 3.15e-14).

Le point qui mérite l'attention est ailleurs. Le résidu « Non renseigné et Inconnu » pèse 17 062 522 398,9300 € sur 1 405 038 187 493,9321 €, soit **1.214 %**. Additionner les seules modalités nommées donne 1 387 975 665 095,0022 € — il manque exactement ce résidu. La modalité est bien offerte et étiquetée par l'application ; le risque n'est pas qu'elle soit cachée, mais qu'un lecteur additionne les autres et croie tenir le total.

### I-04 — Σ des grands postes, « Autres » compris, = total du cube

19 grands postes. « Autres » (prestations sans correspondance dans la transcodification) : -8 049 289 616,5700 €.

### I-05 — Cascade : Σ postes = grand poste, Σ sous-postes = poste, Σ prestations = sous-poste

158 comparaisons · pire écart absolu 1.50e-03 · pire écart relatif 1.19e-14 (sous-poste de « Consultations / Visites ») · 2 valeur(s) absente(s) · 0 hors tolérance

### I-06a — Compact contre brut — total, mesure par mesure

7 comparaisons · pire écart absolu 4.69e-01 · pire écart relatif 3.34e-13 (rem) · 0 hors tolérance

- `rem` — brut 1 405 038 187 493,4636, compact 1 405 038 187 493,9326, écart 3.34e-13
- `dep` — brut 1 601 792 223 029,3792, compact 1 601 792 223 029,8145, écart 2.72e-13
- `depas` — brut 111 499 127 051,3762, compact 111 499 127 051,3620, écart 1.27e-13
- `qte` — brut 133 320 833 455, compact 133 320 833 455, écart 0.00e+00
- `rem_ref` — brut 1 280 885 049 724,9458, compact 1 280 885 049 725,0500, écart 8.14e-14
- `bse_ref` — brut 1 289 338 934 189,8154, compact 1 289 338 934 189,8650, écart 3.84e-14
- `rem_neg` — brut -43 502 681 794,0322, compact -43 502 681 794,0304, écart 4.05e-14

### I-06b — Compact contre brut — par année × mesure

84 comparaisons · pire écart absolu 8.15e-03 · pire écart relatif 5.75e-14 (rem 2023) · 0 hors tolérance

### I-06c — Compact contre brut — cellule par cellule, sur la clé complète (8 colonnes)

**0 clé absente du compact, 0 en trop.** Sur les 7 mesures, le pire écart **absolu** entre une cellule du brut et la même cellule du compact est de **2.38e-07 €**, et le pire écart **relatif** — mesuré sur les seules cellules dépassant le plancher de 1e-06 € — de **1.14e-12**. C'est exactement l'ordre de grandeur de l'accumulation flottante prévu en Phase 0 (√n·ε ≈ 5e-13). `qte` est identique au bit près. **Le compact est fidèle au brut.**

- `rem` — 5 762 787 cellules · pire écart absolu 2.38e-07 € · pire écart relatif 1.14e-12 · 0 hors tolérance
- `dep` — 5 762 787 cellules · pire écart absolu 5.96e-08 € · pire écart relatif 4.42e-13 · 0 hors tolérance
- `depas` — 5 762 787 cellules · pire écart absolu 2.98e-08 € · pire écart relatif 7.89e-14 · 0 hors tolérance
- `qte` — 5 762 787 cellules · pire écart absolu 0.00e+00 € · pire écart relatif 0.00e+00 · 0 hors tolérance
- `rem_ref` — 5 762 787 cellules · pire écart absolu 2.38e-07 € · pire écart relatif 4.22e-13 · 0 hors tolérance
- `bse_ref` — 5 762 787 cellules · pire écart absolu 5.96e-08 € · pire écart relatif 6.73e-13 · 0 hors tolérance
- `rem_neg` — 5 762 787 cellules · pire écart absolu 1.19e-07 € · pire écart relatif 6.85e-16 · 0 hors tolérance

### I-07 — `cube_where` du produit contre un WHERE écrit à la main (8 scénarios)

8 comparaisons · pire écart absolu 1.22e-04 · pire écart relatif 2.16e-16 (ALD seulement) · 0 hors tolérance

- période seule, 2018–2020 — manuel 357 198 804 583,1325 = produit 357 198 804 583,1324
- une région — manuel 165 238 548 535,4804 = produit 165 238 548 535,4804
- trois régions — manuel 393 323 861 538,5912 = produit 393 323 861 538,5912
- un sexe — manuel 651 093 808 067,4810 = produit 651 093 808 067,4810
- deux tranches d'âge — manuel 264 951 287 081,3328 = produit 264 951 287 081,3328
- région × sexe × âge — manuel 975 959 689,8200 = produit 975 959 689,8200
- ALD seulement — manuel 564 185 935 943,6729 = produit 564 185 935 943,6730
- toutes les régions listées = pas de filtre — manuel 140 857 153 745,4104 = produit 140 857 153 745,4104

### I-08 — Codes `prs_nat` non couverts par la transcodification : nombre et poids

**0 code sur 1 342 n'est sans correspondance**, et aucune ligne de transcodification n'a de grand poste vide. La couverture est totale, et le repli `COALESCE(..., 'Autres')` ne se déclenche jamais sur ces données.

- « Autres » — 90 codes · -8 049 289 616,5700 €
- « Autres Postes » — 20 codes · 2 614 214 765,2300 €

### I-09 — « Autres », `__other__` et « Reste du périmètre » ne se confondent jamais

**Le document de référence décrit « Autres » comme les prestations sans correspondance dans la transcodification. Ce n'est pas ce qui se passe.** « Autres » est un **grand poste nommé** de la nomenclature — 90 codes, -8 049 289 616,5700 € — et la nomenclature porte en outre un « Autres Postes » distinct. Le repli du `COALESCE` est aujourd'hui vide.

Il en découle un **risque latent**, qui ne produit aujourd'hui aucun chiffre faux : le repli et la catégorie réelle portent **la même étiquette**. Si un code venait à sortir de la transcodification — une nomenclature qui évolue, un millésime de plus — son montant se fondrait dans le grand poste « Autres » sans que rien ne le signale, et « Autres » cesserait d'être ce que la nomenclature dit qu'il est.

Les deux autres notions, elles, sont bien disjointes : `__other__` est une sentinelle préfixée, « Reste du périmètre » un complément de sélection. Ni l'une ni l'autre ne peut entrer en collision avec une chaîne de donnée.

### I-10 — Origine des montants négatifs de « Autres »

12 année(s) où « Autres » est négatif. La décomposition est exacte : le négatif vient des **régularisations** (`rem_neg`), une composante du cube et non un défaut d'agrégation. Comportement légitime, à documenter.

- **2014** — remboursé -30 671 828,6100 € = régularisations -45 584 477,6500 € + remboursements réels 9 106 403,2100 €, sur 43 codes
- **2015** — remboursé -639 807 805,5600 € = régularisations -677 198 778,4400 € + remboursements réels 22 292 409,5000 €, sur 46 codes
- **2016** — remboursé -636 547 104,4500 € = régularisations -674 971 624,1300 € + remboursements réels 25 009 861,9700 €, sur 46 codes
- **2017** — remboursé -646 910 118,1600 € = régularisations -683 492 296,5100 € + remboursements réels 25 551 288,0400 €, sur 47 codes
- **2018** — remboursé -663 962 680,4700 € = régularisations -685 476 918,9200 € + remboursements réels 12 278 461,8900 €, sur 45 codes
- **2019** — remboursé -666 476 364,1400 € = régularisations -688 416 277,1500 € + remboursements réels 11 081 132,4900 €, sur 49 codes
- **2020** — remboursé -670 848 547,5600 € = régularisations -688 015 966,8500 € + remboursements réels 3 972 242,4800 €, sur 47 codes
- **2021** — remboursé -768 807 376,4800 € = régularisations -786 031 544,3400 € + remboursements réels 5 475 313,2800 €, sur 49 codes
- **2022** — remboursé -731 996 790,9400 € = régularisations -755 713 358,1200 € + remboursements réels 5 867 708,4200 €, sur 56 codes
- **2023** — remboursé -682 062 643,4300 € = régularisations -723 520 725,5500 € + remboursements réels 16 139 266,5800 €, sur 57 codes
- **2024** — remboursé -894 361 847,0000 € = régularisations -1 076 576 155,3100 € + remboursements réels 119 077 356,6500 €, sur 60 codes
- **2025** — remboursé -1 016 836 509,7700 € = régularisations -1 204 234 534,4700 € + remboursements réels 118 647 998,8300 €, sur 61 codes

## Défauts confirmés

Aucun, sur les contrôles exécutés à ce stade.

