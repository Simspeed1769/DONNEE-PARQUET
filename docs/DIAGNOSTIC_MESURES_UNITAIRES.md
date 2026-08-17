# Diagnostic — Volume, remboursement moyen, dépense moyenne « indisponibles »

Point 1 de la mission « Alléger ». **Aucun code n'a été modifié.**

*Relevé du 17 août 2026, sur la branche `v2`.*

## Verdict en une phrase

La règle est juste, la donnée est intacte, et **le refus n'est ni expliqué ni
appliqué partout** : le Panorama refuse en silence là où c'est fondé, tandis que
Comparer, le Tableau et Extraire acceptent sans réserve ce que le Panorama
refuse.

Les trois mesures ne sont pas cassées. Elles fonctionnent dès qu'une prestation
unique est choisie — vérifié à l'écran : `service_codes=3313` affiche
« Volume de la prestation, 2015–2024 », 1,18 Md unités en 2024, +1,7 % vs 2023.

## Les trois hypothèses, départagées

### 1. La colonne `qte` serait perdue ou nulle dans le cube compact — **réfutée**

| | Lignes | Somme de `qte` | `qte IS NULL` |
|---|---:|---:|---:|
| `cube_damir.parquet` (source) | 45 213 071 | 133 320 833 455 | 0 |
| `cube_damir_compact.parquet` | 5 762 787 | **133 320 833 455** | 0 |

**Écart : 0,000000 %.** `tools/build_cube_compact.py` agrège par `SUM(qte)` sur
une clé qui ne perd que le mois — la somme est donc exacte par construction, et
elle est vérifiée.

Dans le cube compact : 4 532 642 lignes à quantité strictement positive,
1 171 818 à zéro (20,3 %), 58 327 négatives. Le zéro est concentré sur des
prestations qui n'ont légitimement pas d'unité (forfaits), pas sur un poste
entier :

| Grand poste | % `qte = 0` | Coût moyen déduit |
|---|---:|---:|
| Pharmacie | 18,4 % | 4,64 € / boîte |
| Hospitalisation | 18,6 % | 99,62 € / journée |
| Indemnités Journalières | 0,7 % | 37,18 € / jour |
| Optique | 43,3 % | 6,11 € |

Tous les grands postes rendent un coût moyen plausible. **Le cube n'est pas à
reconstruire.**

### 2. Une condition trop large marquerait les mesures indisponibles — **partiellement vraie, et c'est l'essentiel**

Le drapeau vient de `panorama.py::_availability` (l. 193-223) :

```python
single_service = (payload.subject_dimension == "service" and len(payload.subjects) == 1) \
                 or len(payload.service_codes) == 1
unit_dependent = metric.unit_key in ("eur_per_unit", "service_unit")
if unit_dependent and not single_service:
    reason = "Chaque prestation compte dans son unité propre : …"
```

Les trois mesures visées sont exactement les trois `unit_key` concernés :

| Clé | Libellé | `unit_key` |
|---|---|---|
| `quantity` | Volume de la prestation | `service_unit` |
| `average_reimbursed` | Remboursement moyen par unité | `eur_per_unit` |
| `average_expense` | Dépense moyenne par unité | `eur_per_unit` |

Mesuré : sans sujet → les trois indisponibles ; **une** prestation → les trois
disponibles ; **deux** prestations → les trois indisponibles. La règle est donc
correcte et bien appliquée. Le défaut est ailleurs, en deux endroits.

**a. Le refus est muet.** Le serveur envoie une phrase complète ; l'écran la
jette. `PanoramaSection.tsx:365` et `CompareSection.tsx:518` rendent
`{item.label}{item.unavailable_reason ? " · indisponible" : ""}` sur une
`<option disabled>`. Relevé dans le DOM :

```
"Volume de la prestation · indisponible"          desactive: true, titre: null
"Remboursement moyen par unité · indisponible"    desactive: true, titre: null
"Dépense moyenne par unité · indisponible"        desactive: true, titre: null
```

Ni infobulle, ni `title`. L'utilisateur lit un mot sec, exactement le constat de
la mission. Et c'est un manquement à `CLAUDE.md` : *« une forme qui mentirait
n'est pas offerte […] jamais un bouton grisé »* — ici, trois options grisées.

**b. Le repli est silencieux.** `PanoramaSection.tsx:187` fait
`if (measure?.unavailable_reason) setMeasureKey("reimbursed")`. Vérifié : ouvrir
`…&measure=quantity` sans prestation réécrit l'adresse en `measure=reimbursed`
sans un mot. La mesure demandée disparaît sous les doigts.

### 3. La quantité n'aurait de sens que sur certains postes — **fausse comme énoncée, vraie autrement**

Le clivage n'est pas entre postes mais entre **un poste et plusieurs** : additionner
des boîtes, des journées d'hospitalisation et des kilomètres ne produit rien
d'interprétable, quel que soit le poste. C'est bien ce que dit le message du
serveur.

## Le défaut miroir, non repéré par la mission

`explore.py::_measure_availability` (l. 218-230) est une **seconde** fonction,
qui teste un autre drapeau :

```python
elif metric.requires_homogeneous_unit and len(payload.service_codes) != 1:
```

Or **`requires_homogeneous_unit` n'est posé sur aucune des douze mesures** — il
vaut `False` partout (défaut de `analysis.py:57`). La branche est morte.

Conséquence mesurée :

| Surface | Fonction employée | Sans prestation |
|---|---|---|
| Panorama DAMIR | `panorama.py::_availability` | refuse (correct) |
| **Comparer DAMIR** | `explore.py::_measure_availability` | **accepte** |
| **Tableau** | idem (`pivot.py:177`) | **accepte** |
| **Extraire** | `analysis.py:346`, même drapeau | **accepte** |

Vérifié : `/api/explore` et `/api/pivot` renvoient `unavailable_reason: null` sur
les trois mesures, tous postes confondus. Et `_extraction_query` laisse passer
`measures=["quantity","average_reimbursed"], dimensions=["year"]` sans lever
l'erreur que `LISEZMOI.md` (l. 1323) documente pourtant comme appliquée.

**Le Tableau et Extraire offrent donc aujourd'hui un volume « tous postes
confondus » — 133 milliards d'unités qui mélangent des boîtes et des
journées.** C'est plus grave que le refus muet : le Panorama protège, les trois
autres surfaces ne protègent pas, et rien ne le signale.

## Portée réelle

- **Donnée** : intacte. Aucune reconstruction de cube.
- **Panorama** : la règle fonctionne ; ce sont sa restitution et son repli
  automatique qui sont fautifs. Défaut d'interface.
- **Comparer, Tableau, Extraire** : la règle ne s'applique pas du tout. Défaut
  de fond, silencieux, qui produit des nombres faux.
- **Documentation** : `LISEZMOI.md` l. 1323 décrit un garde-fou d'Extraire qui
  n'existe pas dans les faits.

## Correctif proposé, à valider

1. **Une seule règle, au bon endroit.** Retirer `requires_homogeneous_unit`, qui
   n'a jamais servi, et faire lire à `explore.py::_measure_availability` la
   même condition que `panorama.py::_availability` — l'`unit_key`, qui est juste.
   Les quatre surfaces refusent alors de la même façon. Corriger dans la foulée
   le garde-fou d'`_extraction_query`, et `LISEZMOI.md` avec.
2. **Dire pourquoi, au lieu de griser.** Le serveur envoie déjà la phrase.
   Conformément à `CLAUDE.md`, **retirer** l'option plutôt que la griser, et
   poser la raison à côté du sélecteur — une ligne, ou l'`InfoHint` du point 5
   de la mission, qui est fait pour cela.
3. **Ne plus rétrograder en silence.** Si la mesure choisie devient
   indisponible, le dire au lieu de réécrire l'adresse sans un mot.

Aucun de ces trois travaux n'ajoute d'élément visible : le point 2 en retire
même trois options du menu.

## Ce qui reste à trancher par l'utilisateur

Le point 6.3 de la mission ouvre le Tableau aux cinq sources. Si le correctif 1
est appliqué, le Tableau refusera Volume et les deux moyennes tant qu'une
prestation unique n'est pas choisie — ce qui est juste, mais retire une
possibilité qui existait, fût-elle fausse. À confirmer avant de coder.
