
## v3 · Phase 1 — Transitions homogènes dans Panorama

- **Fait** : hauteur de graphique constante **par lecture** et non plus par forme
  (Territoire 520 partout, Âge 430 partout) ; `id` de série stable ajouté aux
  builders mono-série qui n'en avaient pas (classement territorial, comparaison
  par sexe, `rankOption`, `pieOption`, `waterfallOption`) ; fondu court de 130 ms
  dans `EChart` quand la transition passe par une forme non morphable (carte).
- **Diagnostic** : le remontage de composant, suspecté, a été écarté par la
  mesure — le conteneur n'enregistre aucune mutation d'enfant. Les deux vraies
  causes étaient le redimensionnement du conteneur au milieu de l'animation et
  l'absence de `seriesKey` (aucun `id`) sur les formes mono-série.
- **Écarté** : rien.

## v3 · Phase 2 — Comparer n'importe quoi, et le dire en haut

- **Fait** : le bloc « Ce que je compare » remonte sous le titre, réduit à un
  résumé d'une ligne ; son édition s'ouvre en `position: absolute` (graphique
  déplacé de 0 px, mesuré). Nom de série éditable et persisté dans l'URL
  (`series_names`), avec un nom auto tiré de **ce qui distingue** la série des
  autres et non de tous ses filtres. Les formes cumulatives (Camembert) sont
  retirées — pas grisées — dès que deux séries diffèrent de population.
- **Décision** : le mode « comparer selon une dimension » reste le défaut ; les
  séries sur mesure sont l'extension, dans le même bloc, sans changer d'écran.
- **Écarté** : rien.

## v3 · Phase 3 — Pathologies, CSP et Mortalité sur le gabarit DAMIR

- **Fait** : les trois fiches n'ont plus qu'**un seul graphique piloté** par une
  barre de lectures et une barre de formes, comme DAMIR. Chaque base déclare ses
  lectures et ses formes licites dans son modèle (`pathologies/model.ts`,
  `csp/model.ts`, `mortality/model.ts`), sur le vocabulaire commun
  `charts/reading.ts`. Lecture, forme et mesure sont persistées dans l'URL.
- **Décision** : Mortalité n'offre **pas** de lecture Territoire et le dit — le
  CépiDc est une source nationale sans population de référence ; une carte y
  serait inventée. Les prévalences et les parts n'ouvrent ni camembert ni pile :
  ce sont des rapports, ils ne composent pas un tout.
- **Correction** : le classement (`rank`) mettait en rang des **séries** sur leur
  dernière valeur. Une fiche met en rang des **modalités** d'une série unique —
  régions, tranches, causes. `buildOption` prend désormais un `rankBy` explicite,
  et le classement par modalité porte une teinte unique : il encode une
  magnitude, pas des identités.
- **Écarté** : `pathologies/charts.ts` et `mortality/charts.ts`, devenus vides de
  sens une fois les formes tirées de `buildOption` ; `csp/charts.ts` se réduit à
  la carte, seule forme sans équivalent générique.

## v3 · Phase 4 — Croisements : une seule porte d'entrée

- **Décision** : Croisements n'expose plus que le mode Guidé. Choisir entre
  « Lien », « Modèle » et « Guidé » était déjà une question de spécialiste,
  posée avant même la question de fond.
- **Fait** : l'écran avancé part entier dans `correlations/AdvancedCross.tsx`,
  compilé mais non routé — le rebrancher tient en une ligne de rendu.
  `RegressionPanel.tsx` et les endpoints de corrélation restent en place et
  servis. Preuve que rien n'est embarqué pour rien : le lot Croisements passe de
  41,5 ko à 17,5 ko.
- **Écarté** : rien n'est supprimé.
