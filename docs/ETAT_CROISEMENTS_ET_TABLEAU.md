# Croisements et Tableau — état des lieux, à l'attention de la prochaine session

Note écrite pour Claude, à lire avant de toucher à ces deux écrans. Elle dit ce
qui existe, ce qui cloche, ce que je propose, et **elle pose des questions
auxquelles je n'ai pas la réponse**. Rien n'a été modifié en l'écrivant.

*Relevé du 18 août 2026, branche `v2`.*

## Une correction de périmètre, d'abord

La demande portait sur **trois** écrans : Croisements, Tableau et Repères.
**« Repères » n'existe plus.** Il a été remplacé par le Tableau ; l'ancienne
adresse `?page=benchmarks` y redirige (`App.tsx:99`). Il choisissait une source,
puis un calcul parmi six, et produisait **un chiffre**. Ses six calculs sont
devenus le menu « Agrégation » du Tableau, et le Panorama affichait déjà la
dernière valeur, la variation et le cumul.

Il ne reste donc que deux écrans à examiner. Si tu cherchais Repères pour autre
chose que ces six calculs, dis-le : quelque chose s'est peut-être perdu que je
n'ai pas su voir.

---

# 1 · Croisements — « Expliquer un indicateur »

## Ce qu'il y a

Un écran, un modèle, trois temps numérotés dans un seul panneau :

| Temps | Ce qu'on y choisit |
|---|---|
| **1 · Que voulez-vous expliquer ?** | Deux boutons radio — une mesure DAMIR rapportée à la population, ou la prévalence d'une pathologie — puis la mesure précise. |
| **2 · Par quoi l'expliquer ?** | Une variable explicative (source + modalité), avec « + Ajouter une variable » jusqu'à **quatre**. |
| **3 · Contrôles** | « À âge et sexe comparables » (coché par défaut), « Tenir compte de la région », et la période. |

Sous le panneau, dans cet ordre :

1. ~~un encart rose permanent « Comment lire ces résultats »~~ — **supprimé.** La
   règle écologique tient désormais sur la ligne permanente en tête de panneau
   (« … — jamais une personne »), et l'exemple, plus long, est passé derrière un
   « ? ». L'avertissement n'est pas caché : il est raccourci ;
2. **le verdict en une phrase**, en corps de texte ;
3. le **nuage des cellules** (191 points), ses deux axes nommés, un sélecteur
   d'abscisse quand il y a plusieurs variables, et **treize pastilles de régions**
   cliquables pour en surligner une ;
4. une ligne de bilan : « 191 cellules · 91 % de l'écart entre cellules est
   expliqué par ce modèle » ;
5. **« ▶ Ce que ce modèle ne dit pas »**, replié.

Sous le capot : quatre unités d'observation (`région × âge × sexe`,
`région × année`, `région`, `année`), neuf indicateurs répartis sur quatre
sources, un GLM maison (`glm.py`, 287 lignes) à trois lois — gaussienne, gamma,
Poisson — et **douze régions communes seulement**, ce que le catalogue annonce
honnêtement.

## Ce qui me gêne

**a. Le « 91 % » est le chiffre le plus visible et le plus trompeur.** C'est un
R². Avec « Tenir compte de la région » coché, il monte mécaniquement — on ajoute
douze indicatrices — et il monterait encore avec l'âge et le sexe. Un lecteur
pressé lit « mon modèle explique 91 % » alors que la phrase juste au-dessus dit
que **le lien n'est pas établi**. Les deux se contredisent à l'œil.

**b. Le verdict est noyé.** La seule phrase qui répond à la question est prise en
sandwich entre un encart rose et un grand nuage. Elle devrait être le premier
élément lu après les réglages.

**c. ~~Le nuage est monochrome.~~ Corrigé.** Un sélecteur *Région / Âge / Sexe*
surmonte les pastilles : les trois dimensions de la cellule se surlignent
désormais, une modalité à la fois. Le surlignage a été préféré à une couleur par
modalité — douze régions ou huit tranches d'âge dépassent le nombre de teintes
qu'un œil sépare simultanément.

**d. ~~Le sous-titre~~ — supprimé.**

**e. ~~Rien ne dit combien de cellules ont été perdues.~~ Corrigé.** Le serveur
renvoie `coverage` ; l'écran affiche « 1 écartée — non renseignée dans
« Part dans la population active » ». La cellule manquante est
Île-de-France · moins de 20 ans · femmes, absente de la source CSP.

## Ce que je propose

1. **Remonter le verdict** juste sous les réglages. C'est la réponse ; tout le
   reste est justification.
2. **Reléguer le R²** hors de la ligne de bilan, dans « Ce que ce modèle ne dit
   pas », avec la phrase qui manque : *ce pourcentage monte mécaniquement quand
   on ajoute des contrôles, il ne mesure pas la force du lien*.
3. ~~Colorer le nuage par région~~ — **fait autrement** : un sélecteur des trois
   dimensions, et le surlignage plutôt que la couleur (voir **c**).
4. ~~Supprimer le sous-titre~~ — **fait.**
5. ~~Afficher les cellules écartées~~ — **fait.**

Sur l'encart rose, la note disait qu'il devait **rester visible**, `CLAUDE.md`
interdisant de cacher un avertissement de comparabilité. Il a été supprimé, et
la règle reste pourtant affichée en permanence : `CLAUDE.md` demande aussi
qu'« une explication de plus d'une ligne ne s'affiche pas en permanence ». Les
deux se concilient en séparant la **règle** — « chaque point compare une région,
une tranche d'âge et un sexe — jamais une personne », toujours à l'écran — de
son **exemple**, qui est long et vit derrière le « ? ».

---

# 2 · Tableau — « Croiser deux dimensions »

## Ce qu'il y a

Un croisé dynamique sur le seul cube DAMIR : deux axes, une mesure, une
agrégation, des totaux, un tri par colonne, une teinte, une bascule
Tableau / Graphique, et trois exports — PNG, CSV, Excel.

Les six agrégations : dernière année · cumul de la période · moyenne par an ·
variation · taux de croissance annuel moyen · part du total. Les deux avant-
dernières disparaissent quand l'année est déjà en axe — la règle est juste, et
elle est expliquée derrière l'icône « ? ».

## Ce qui me gêne

**a. La teinte reste rouge, alors que la mission demandait le contraire.** Elle a
pourtant été refaite : échelle par rangs et non par étendue brute, cinq marches
de lavis au lieu de huit d'aplat, encre constante — le contraste va de 16,2:1 à
10,5:1. Mais elle emploie `--ramp-*`, **qui suit la palette de marque** et vaut
donc du rouge par défaut. Le point 6.1 disait « rampe neutre, jamais l'accent de
marque » : ce n'est pas fait. C'est le défaut le plus visible de l'écran.

**b. Les valeurs négatives partagent la rampe des positives.** La ligne
« Autres » est à −639,81 M€ en 2015 et reçoit une marche pâle, comme une petite
valeur positive. Le signe disparaît de la couleur. Il faudrait une rampe
divergente, ou aucune teinte sur les négatifs.

**c. Un avertissement s'affiche pour une mesure qui n'est pas sélectionnée.**
`pivot.py:219` émet « Le ticket modérateur exclut les prestations sans base de
remboursement » **dès qu'aucun grand poste n'est choisi**, quelle que soit la
mesure. Sur « Montant remboursé », il ne s'applique pas. Le serveur ne connaît
pas la mesure — elle est choisie côté client. **Défaut réel, non corrigé.**

**d. L'écran n'expose qu'une source sur cinq.** Pathologies, CSP, Mortalité et
Population n'y sont pas. C'est le point 6.3, non entamé : il demande de porter
dans le Tableau la machinerie par source qu'`Extraire` possède déjà — cinq
barres de portée, quatre chemins de requête, une table de licences d'agrégation.

**e. Le tableau défile horizontalement sans repère.** Dix colonnes d'années plus
un total, et la première colonne n'est pas figée : en défilant vers 2024, on ne
sait plus quelle ligne on lit.

## Ce que je propose

1. **Rampe neutre**, indépendante de la palette de marque. C'est le seul
   changement qui règle « le tableau fatigue ».
2. **Négatifs traités à part** : rampe divergente ou pas de teinte, à trancher
   sur capture.
3. **Conditionner l'avertissement à la mesure** — soit en la faisant remonter au
   serveur, soit en déplaçant l'avertissement côté client, où elle est connue.
4. **Figer la première colonne** au défilement horizontal.
5. Le point 6.3, entier, dans sa propre session.

---

# Questions, et ton avis

Je ne tranche pas ce qui suit, et je crois qu'il vaut mieux le décider avant de
coder qu'après.

1. **Le R² doit-il quitter la vue principale ?** Mon avis : oui, il fait plus de
   mal que de bien à côté d'un verdict qui dit l'inverse. Mais c'est peut-être
   le chiffre qu'on cite en réunion. Qu'en penses-tu ?

2. ~~**Le nuage : coloré par région, par âge, ou neutre ?**~~ **Tranché** : ni
   l'un ni l'autre en couleur simultanée — un sélecteur, et le surlignage d'une
   modalité à la fois. On peut donc faire les trois, successivement.

3. **La rampe du Tableau : neutre absolue, ou froide fixe ?** Une rampe grise
   distingue moins bien qu'une rampe bleue. La mission dit « neutre » ; je le lis
   comme « pas l'accent de marque », ce qui admettrait le bleu. À confirmer.

4. **Faut-il aligner Tableau, Comparer et Extraire sur la règle d'unité du
   Panorama ?** Ces trois surfaces offrent aujourd'hui un volume « tous postes
   confondus » — des boîtes plus des journées plus des kilomètres. Les aligner
   les rendrait cohérents mais **retirerait une possibilité existante**. C'est la
   seule question de cette note qui touche à la justesse des nombres, et elle
   attend un arbitrage depuis `docs/DIAGNOSTIC_MESURES_UNITAIRES.md`.

5. **Le Tableau aux cinq sources vaut-il son coût ?** C'est le plus gros travail
   restant. `Extraire` fait déjà « les cinq sources, en lignes brutes ». Si le
   besoin réel est « voir un croisé lisible sur Pathologies », c'est peut-être la
   fiche Pathologies qui doit gagner un croisé, plutôt que le Tableau quatre
   sources.

Sur l'ensemble : **les deux écrans souffrent du même mal — ils montrent d'abord
la mécanique, et le résultat en second.** Le Tableau montre une grille avant de
dire ce qu'elle raconte ; Croisements montre un formulaire et un nuage avant son
verdict. Si une seule chose devait être faite, ce serait celle-là : remonter la
réponse au-dessus de la démonstration. Es-tu d'accord ?
