# Design

<!-- impeccable:design-schema 1 -->

Ce document décrit le système visuel **tel qu'il est bâti**, pas tel qu'on
l'aurait voulu. La source de vérité des valeurs est `app/frontend/src/theme.css` ;
ce fichier explique ce qu'elles signifient et quand les employer.

## Monde visuel

Un instrument de mesure sur papier chaud. Fond ivoire légèrement chaud plutôt
que blanc pur, encre presque noire, un seul accent rouge de marque, et une
palette de séries qui n'appartient qu'aux données. L'interface ne colore rien
qui ne porte pas d'information : le rouge est réservé à l'action et à la
sélection, les huit teintes de série aux modalités, les rampes aux échelles.

Le mode sombre est **choisi, pas inversé**. Ses teintes de série sont des
marches distinctes, validées contre la surface sombre, et ses rampes sont
retournées (le foncé devient le bas de l'échelle).

## Couleur

Stratégie : **retenue** — neutres plus un accent. C'est ce qu'appelle une
surface où l'on vient travailler dix minutes d'affilée sur des chiffres.

| Rôle | Jeton | Clair | Sombre |
|---|---|---|---|
| Fond de page | `--paper` | `#f7f6f3` | `#0e0d0c` |
| Surface | `--surface` | `#ffffff` | `#171614` |
| Surface creusée | `--surface-sunken` | `#f2f1ed` | `#121110` |
| Encre | `--ink` | `#14130f` | `#f6f5f1` |
| Encre secondaire | `--ink-secondary` | `#4e4c45` | `#b9b6ac` |
| Encre atténuée | `--ink-muted` | `#7d7a71` | `#8b8880` |
| Filet | `--line` / `--line-strong` | `#e4e2db` / `#cfccc2` | `#2c2a26` / `#3d3a35` |
| Accent | `--accent` | `#d8383c` | `#f0575b` |

**Palette de séries** (`--series-1..8`, plus `--series-other` pour les replis).
Ordre fixe, jamais recyclé : la couleur désigne une entité, jamais son rang.
Retirer une série d'un graphique ne repeint pas les survivantes —
`assignColorSlots` mémorise l'attribution.

Le **rouge de marque ouvre la série** : la première modalité d'un graphique
porte la teinte qui répond à l'accent de l'interface. L'ordre a été choisi sous
contrainte, pas par goût — mettre le rouge devant l'orange fait tomber la paire
à ΔE 5,6 en deutéranopie, sous le plancher ; c'est le bleu qui le suit. L'ordre
retenu passe les six contrôles dans les deux thèmes.

**Une série seule ne prend pas la palette** : elle prend `--accent`
(`paletteColor`). Sans personne dont se distinguer, la couleur catégorielle
n'encode rien, et son premier emplacement n'est qu'un choix arbitraire. Dès
qu'il y a deux séries, la palette reprend la main — là, la couleur doit
distinguer.

**Rampe séquentielle** (`--ramp-1..8`) pour une grandeur qui va du peu au
beaucoup. **Rampe divergente** (`--diverge-1..7`, orange contre bleu) pour ce
qui se lit de part et d'autre d'un pivot — l'indice de spécialisation
territoriale. Le rouge-vert est exclu ; l'orange-bleu reste séparable pour les
deutéranopies et protanopies.

**`--map-void`** est une couleur à part : le territoire *sans donnée*. Il ne
doit jamais ressembler à une valeur basse de la rampe.

> Les deux thèmes doivent porter **tous** les jetons. Un jeton défini seulement
> sous `@media (prefers-color-scheme: dark)` retombe sur sa valeur claire dès
> que l'utilisateur bascule le thème à la main.

## Typographie

Pile système (`--font`), en pratique la face de l'OS. C'est un choix, pas un
défaut : une surface d'opération se lit mieux dans la face que le lecteur lit
déjà toute la journée, et les rendus de chiffres y sont natifs.

Échelle : `--text-2xs` .688rem → `--text-hero` clamp(2.25rem, 4vw, 3rem).
Titres à 640–680 de graisse, interlettrage resserré (−.022em) ; corps à 400.
Tout chiffre porte `font-variant-numeric: tabular-nums`, sans quoi une colonne
de montants danse d'une ligne à l'autre.

## Espacement, rayons, ombres

Échelle de 4 px (`--space-1` … `--space-12`). Rayons : `--radius-sm` 6px pour
les contrôles, `--radius` 10px pour les panneaux, `--radius-lg` 14px pour la
scène, `--radius-pill` pour les pastilles d'état. Trois ombres seulement, toutes
avec décalage **et** flou.

## Formes propres au produit

- **Sections DAMIR** (`.damir-sections`) — trois profondeurs d'une même
  exploration, pas trois outils : le Panorama d'une prestation, la comparaison
  de plusieurs prestations, la comparaison composée de bout en bout. Chaque
  onglet porte la question à laquelle il répond, ce qui permet de choisir sans
  avoir à essayer. Le périmètre et la mesure suivent d'une section à l'autre :
  changer de section est un changement de question, pas de sujet.
- **Séries libres** (`.free-series`) — dans la comparaison libre, chaque série
  est une ligne nommable, avec ses filtres écrits en gris dessous et son
  panneau de filtres qui ne s'ouvre qu'à la demande. La construction est
  progressive : une série et un axe à l'ouverture, jamais un formulaire.
- **Barre de portée** (`.scope-bar`, `panorama.css`) — tout le paramétrage d'un
  écran DAMIR sur deux lignes : ce qu'on regarde (grand poste → poste →
  sous-poste → prestation, puis la mesure), puis sur qui et quand. Les filtres
  rares vivent dans un tiroir « Plus de filtres ». Sa règle constitutive est que
  **sa hauteur ne dépend pas de ce qui est ouvert** : listes et tiroir se posent
  *au-dessus* du contenu, jamais entre la barre et le graphique.
- **Fiche d'analyse** (`.damir-stage`) — un titre, des onglets de lecture à sa
  droite, le graphique en pleine largeur, et rien d'autre au-dessus de lui.
  Réserves et tableau de valeurs sont repliés sous le graphique.
- **Bande de lecture** (`.damir-strip`) — trois repères chiffrés à gauche, le
  choix de forme à droite, sur une seule ligne. Les repères sont revenus sous
  cette forme après avoir été retirés : c'est un bandeau de tuiles qui poussait
  le graphique hors de l'écran, pas les chiffres eux-mêmes.
- **Périmètre par série** (`.scope-editor`) — toute série porte son jeu de
  filtres complet, indépendant des autres ; une **série libre** ne descend même
  d'aucune modalité et n'est que son périmètre. Le réglage vit sur la ligne de
  la série et n'apparaît qu'au survol ; ce qui distingue la série, lui, est
  écrit en permanence — en gris sous son nom (`.series-scope-note`) et dans son
  libellé sur le graphique.
- **Puces « Tenir constant »** (`.regression-factors`) — les dimensions de
  l'observation qu'on met dans le modèle. Trois puces, une ligne : le geste le
  plus important de l'écran doit être le plus court à faire, pas le plus voyant.
- **Tableau de modèle** (`.regression-table`) — le tableau *est* l'interface :
  on y range les variables par glissement, on trie sur une colonne, on éteint
  une variable pour voir le modèle sans elle. Les paramètres ne sont pas un
  formulaire à remplir d'avance, ce sont des gestes sur le résultat.
- **Réponse et échelle de force** (`correlations.css`) — la conclusion en
  français d'abord, l'intervalle de confiance dessiné à sa vraie largeur sur un
  axe −1 → +1. Le raisonnement et le détail statistique sont repliés, jamais
  retirés.
- **Réserves** (`.damir-caveats`) — ce qu'un graphique ne peut pas porter, écrit
  et chiffré à côté de lui. Ce bloc n'est pas décoratif : il est la condition
  pour que le chiffre reste défendable. Il est rangé à l'écran, mais il repart
  **entier dans l'image exportée**, où personne n'est là pour le rappeler.

## Règles qui tiennent tout

1. **Les valeurs se lisent sans survol.** L'infobulle est un supplément. Un
   graphique projeté n'a pas de souris.
2. **La couleur ne porte jamais seule.** Étiquettes directes, noms écrits,
   tableau de valeurs — toujours au moins un doublon non chromatique.
3. **Rien ne disparaît en silence.** Une modalité qu'une forme ne peut pas
   porter sort du graphique et se dit en clair, chiffrée.
4. **La légende vit dans le HTML**, pas dans le canevas : sélectionnable,
   accessible au clavier, lisible par un lecteur d'écran.
5. **Un axe de cumul part de zéro.** Un axe tronqué exagère la pente.
6. **Un seul moment de mouvement par écran**, en décélération exponentielle
   depuis un état déjà visible, désactivé sous `prefers-reduced-motion`.
7. **Le graphique parle, le texte se tait.** Pas de phrase de commentaire
   calculée à côté d'un tracé, pas de chiffre répété sous le titre : ce qui doit
   se lire se lit sur le graphique. Le texte reste pour ce qu'un graphique ne
   peut pas dire — les réserves.
8. **Rien ne pousse le graphique vers le bas.** Tout contrôle qui s'ouvre —
   liste multiple, tiroir de filtres — se superpose au contenu. La position du
   graphique ne doit pas dépendre de l'état des filtres.
9. **Une seule sortie image, et c'est un fichier.** Le presse-papiers doublait
   le même geste avec ses propres échecs selon le navigateur.
10. **Une teinte par entité, une rampe par ordre.** Des années se colorent sur
    la rampe séquentielle, jamais sur la palette catégorielle : à huit
    emplacements, celle-ci donnerait le même bleu à 2015 et à 2023.
11. **La couleur ne redit jamais la longueur.** Un classement de territoires est
    d'une seule teinte : la barre porte déjà la grandeur, et la recolorer par
    valeur brûlerait le seul canal libre. Le dégradé est réservé à la carte, où
    il est la seule façon d'encoder la valeur.
12. **Une forme qui mentirait n'est pas proposée.** Empiler exige une mesure qui
    s'additionne, un camembert exige un tout, un axe ordinal exige un ordre. Le
    modèle décide de ce qui est offert ; l'interface ne connaît aucune règle
    statistique.
13. **Une comparaison dont les côtés diffèrent le dit dans son libellé.** Une
    série au périmètre propre s'appelle « Hommes · 60 ans et plus », jamais
    « Hommes ». Sans cela, la souplesse devient un piège.
14. **Un effet s'affiche avec son incertitude.** Une barre seule se lit comme une
    certitude ; l'intervalle dessiné à sa vraie largeur montre ce qui traverse
    zéro. L'axe contient toujours l'intervalle entier, pas seulement l'estimation.
15. **Changer de forme est un mouvement, pas un remplacement.** L'instance du
    graphique survit au changement, et `universalTransition` rattache les
    marques par leur identité : une barre devient sa part de camembert. On doit
    *voir* que c'est la même donnée sous un autre angle. Corollaire : jamais de
    `key` React sur un conteneur de graphique — elle détruit l'instance et avec
    elle toute transition.
16. **Un repli se nomme et se chiffre.** « Autres » peut peser un tiers du
    graphique sans dire de quoi il est fait ; il s'appelle « Reste du périmètre ·
    14 grands postes » et ne s'affiche pas de lui-même.
17. **L'âge et le sexe entrent dans le modèle, ils ne le filtrent pas.** Tant
    qu'ils sont des filtres, un modèle de la dépense attribue à ses variables une
    bonne part de la démographie du territoire — sur données réelles, l'effet
    apparent de la CSP est presque divisé par deux une fois l'âge tenu constant.
    C'est la raison d'être de l'unité région × âge × sexe.

## Ce qu'on ne fait pas

Pas de liseré de couleur épais sur le côté d'une carte ; pas de texte en
dégradé ; pas de numérotation de sections (01/02/03) ; pas de sur-titre
au-dessus d'un titre ; pas de verre dépoli décoratif — le flou de la barre de
portée est un effet fonctionnel, il sépare une couche collante de ce qui défile
dessous.

## Dette connue

`styles.css` porte encore cinq liserés latéraux colorés (`.kpi-card`,
`.method-catalog-card`, alertes) et deux transitions sur `width`/`margin-left`
au repli de la barre latérale. Ces éléments appartiennent aux écrans
Pathologies, CSP, Mortalité, Repères et Méthodologie, qui n'ont pas encore été
repris.
