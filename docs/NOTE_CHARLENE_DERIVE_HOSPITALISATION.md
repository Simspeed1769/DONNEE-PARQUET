# Note vérifiable pour Charlène — dérive hospitalisation

## Message court

Avec DAMIR, on peut mesurer une dérive de la dépense et de la part remboursée
par l'Assurance Maladie (AMO). On ne peut pas mesurer directement le ROC ni
séparer les établissements ROC et non-ROC : ces informations ne sont pas dans
la base disponible.

Sur le poste local **Hospitalisation Honoraires**, entre 2023 et 2024 :

| Indicateur | Résultat |
|---|---:|
| Dépense présentée | 1 322,45 → 1 382,36 M€ (**+4,53 %**) |
| Remboursement AMO | 886,08 → 902,71 M€ (**+1,88 %**) |
| Part AMO | 67,00 % → 65,30 % (**−1,70 point**) |
| Reste après AMO | 436,37 → 479,65 M€ (**+43,28 M€ ; +9,92 %**) |

La dépense augmente donc plus vite que le remboursement AMO. Le montant qui
reste après AMO augmente. C'est un **ordre de grandeur du besoin à financer**,
pas une mesure de ce que paie la complémentaire et pas une preuve d'un effet
ROC : le reste comprend aussi la part du patient.

Sur **Hospitalisation Sejour**, le signal est différent : dépense **+5,11 %**,
remboursement AMO **+5,54 %**, part AMO **+0,38 point** et reste après AMO
**+7,99 M€**. Une part AMO qui monte ne signifie donc pas automatiquement que
le reste en euros baisse.

## Comment vérifier dans l'outil

1. Ouvrir **DAMIR → Panorama**.
2. Régler **De 2023 à 2024**, grand poste **Hospitalisation**, et garder le
   périmètre France entière, tous âges, tous sexes, toutes assurances et toutes
   prestations.
3. Choisir successivement les mesures **Dépense présentée**, **Montant
   remboursé**, **Part financée par la Sécurité sociale** et **Reste à charge
   après AMO**. Pour la part, lire la variation en **points**.
4. Refaire exactement la même lecture avec le poste **Hospitalisation
   Honoraires**, puis **Hospitalisation Sejour**.
5. Pour transmettre les chiffres, utiliser **Voir les montants et la part
   Sécu** ou **Extraire** et conserver la dimension année.

Pour répondre à la question des cadences, utiliser en haut de Panorama la
lecture **Année de règlement AMO** ou **Comparer les deux**. Cette vue compare
les remboursements AMO par année de paiement avec ceux rattachés à l'année des
soins. Elle n'est pas une année comptable de complémentaire et ne fournit pas
la dépense, la part AMO ou le reste après AMO en date de règlement.

Le script reproductible est `tools/etude_part_secu.py` :

```powershell
app\backend\.venv\Scripts\python.exe tools\etude_part_secu.py
```

Il ne modifie pas les données et imprime les valeurs brutes en euros. Le
tableau complet et les limites d'interprétation sont dans
`docs/ETUDE_PART_SECU_HOSPITALISATION.md`.

## Limites à dire explicitement

- Le grand poste local « Hospitalisation » contient aussi Transport et des
  dotations/forfaits ; pour parler de garantie hospitalisation, privilégier les
  sous-postes et préciser le périmètre.
- Open DAMIR décrit notamment les établissements de soins **privés** ; il ne
  faut pas présenter ce résultat comme toute l'hospitalisation publique et
  privée.
- Les chiffres 2025 sont encore une année de remboursements observés et ne
  doivent pas être comparés à 2024 comme une année totalement consolidée sans
  réserve. La page officielle indique une période mensuelle allant jusqu'à
  décembre 2025 et une datation en date de remboursement :
  [Open DAMIR — Assurance Maladie](https://www.assurance-maladie.ameli.fr/etudes-et-donnees/open-damir-depenses-sante-interregimes).

## Formulation proposée

> « L'outil ne quantifie pas le ROC. Il documente en revanche où se situe la
> dérive AMO : sur les honoraires hospitaliers, la dépense 2023–2024 progresse
> de 4,53 %, contre 1,88 % pour le remboursement AMO ; le reste après AMO
> augmente de 43,28 M€. C'est un repère pour investiguer la dégradation de la
> garantie, à confronter aux données portefeuille et aux cadences de règlement,
> pas une attribution causale au ROC. »
