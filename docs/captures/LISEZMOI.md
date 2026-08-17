# Captures d'écran

Les douze écrans de DAMIR Studio, dans l'ordre de la barre latérale. Prises sur
le code de la branche `v2`, en thème clair et palette rouge, à 1568 px de large.

*Relevé du 17 août 2026.*

| Fichier | Écran | Ce qu'on y voit |
|---|---|---|
| `01-damir-panorama-evolution.jpg` | DAMIR · Panorama | La lecture Évolution, courbe unique en rouge. |
| `02-damir-comparer.jpg` | DAMIR · Comparer | Cinq grands postes en regard, étiquetés en bout de courbe. |
| `03-damir-decomposition-cascade.jpg` | DAMIR · Décomposition | La cascade volume × coût moyen : 107,01 Md € → +22,12 volume → +18,15 coût → 147,09 Md €. |
| `04-damir-prolongation-tendance.jpg` | DAMIR · Prolongation | La tendance prolongée de deux ans, sa bande, et la case Covid décochable. |
| `05-pathologies.jpg` | Pathologies | La bande de repères au-dessus du graphique, puis le graphique seul. |
| `06-csp.jpg` | CSP | Même gabarit, quatre repères dont un ratio. |
| `07-mortalite.jpg` | Mortalité | Même gabarit, deux repères. |
| `08-population.jpg` | Population | Même gabarit, trois repères. |
| `09-croisements.jpg` | Croisements | « Expliquer un indicateur », les trois temps. |
| `10-tableau.jpg` | Tableau | Le croisé dynamique sur le cube. |
| `11-extraire.jpg` | Extraire | Le compositeur de base, cinq sources en onglets. |
| `12-donnees-methode.jpg` | Données & méthode | Le catalogue des cinq sources et leurs réserves. |

## Comment les refaire

Les captures montrent l'état du code à une date : elles se périment. Pour les
reprendre, lancer l'application puis parcourir les URL de la colonne ci-dessous
en attendant que chaque écran ait fini de charger — une capture prise trop tôt
montre un squelette, ce qui est pire qu'une capture absente.

```
/?page=damir&section=panorama&view=evolution
/?page=damir&section=compare
/?page=damir&section=panorama&view=decomposition
/?page=damir&section=panorama&end_year=2025&view=evolution&form_evolution=trend
/?page=pathologies
/?page=csp
/?page=mortality
/?page=population
/?page=correlations
/?page=pivot
/?page=extraction
/?page=methodology
```
