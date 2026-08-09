# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Deux publics, sur le même outil :

- des **managers curieux des statistiques**, intéressés par les chiffres sans
  être spécialistes. Ils explorent une tendance, puis **reprennent les
  graphiques dans une présentation** ;
- un **public actuariel**, qui connaît la nomenclature, lit une série longue et
  jugera l'outil sur la rigueur de ce qu'il affiche.

Cette double audience est la contrainte structurante de l'interface : elle doit
s'ouvrir sans prérequis et rester juste sous l'œil d'un spécialiste. Concrètement,
les valeurs par défaut doivent être compréhensibles sans connaître la
nomenclature ; la profondeur d'analyse et les précautions statistiques ne sont
jamais retirées, mais rangées. Un raccourci qui simplifierait au prix de la
justesse est exclu — c'est l'actuaire qui le verrait, et la crédibilité du
manager qui présente en dépend.

Tout graphique produit doit par ailleurs être lisible hors de l'application —
projeté, dans une diapositive, sans la légende mentale de celui qui l'a fabriqué.

## Product Purpose

Rendre exploitable la donnée publique Open DAMIR de l'Assurance Maladie, en
permettant d'explorer les dépenses par prestation, population et territoire sur
une décennie, puis d'en extraire des graphiques et des tableaux communicables.

## Positioning

**Explorer environ un milliard de lignes sans serveur.** DuckDB interroge
directement les fichiers Parquet sur le poste, ce qui maintient la granularité
prestation × population × territoire interrogeable en quelques centaines de
millisecondes sur une machine ordinaire. Les tableaux de bord publics
équivalents pré-agrègent leurs données et ferment donc cette granularité ; les
outils qui la conservent supposent une infrastructure serveur.

## Operating Context

- L'application s'exécute localement et s'ouvre dans le navigateur sur
  `127.0.0.1:8000`. Elle est lancée par `DAMIR.bat`, préparée par
  `preparer.bat` ; aucune ligne de commande n'est requise à l'usage.
- Les cubes Parquet et les fichiers sources vivent dans `data/` et ne sont
  jamais modifiés par l'application.
- **La sortie utile est une présentation.** Les graphiques et les extractions
  quittent l'outil pour être commentés ailleurs, devant un public qui n'a pas
  accès à l'application.
- L'état de chaque écran est conservé dans l'URL, ce qui permet de revenir à une
  analyse exactement telle qu'elle a été produite.

## Capabilities and Constraints

- Quatre sources : dépenses Open DAMIR, Cartographie des pathologies (Cnam),
  CSP (Insee 2023), mortalité par cause (CépiDc). La source mortalité est
  nationale : ni carte régionale ni taux par habitant n'en sont dérivables.
- Douze indicateurs DAMIR dérivés des mêmes composantes brutes ; dix dimensions
  de découpage ; 1 342 prestations distinctes.
- Les mesures non additives (moyennes, taux) ne peuvent pas être sommées : les
  composantes sont cumulées avant application de la formule.
- Extraction bornée à 250 000 lignes, limite explicite plutôt que troncature
  silencieuse.
- Ni compte utilisateur, ni hébergement, ni administration.

## Brand Commitments

Les productions portent la mention « Source · Open DAMIR, Assurance Maladie ·
Traitement Forsides ».

## Evidence on Hand

Données réelles présentes dans le dépôt : cube DAMIR (~1,09 Go, 45 M lignes,
2015–2024), cube des délais de liquidation, effectifs pathologies, cœur CSP,
mortalité CépiDc, table de correspondance des prestations.

Aucun retour utilisateur formalisé, aucune mesure d'usage, aucun test
utilisateur n'existe à ce jour : les décisions d'interface ne doivent pas être
présentées comme validées par des utilisateurs.

## Product Principles

1. **Le chiffre doit pouvoir être défendu.** Les garde-fous méthodologiques sont
   la contrainte que toute évolution doit conserver : signalement des années
   encore en consolidation, exclusion des prestations sans base de
   remboursement du ticket modérateur, refus des statistiques indéfendables sur
   des cellules agrégées, distinction entre absence de donnée et valeur nulle.
2. **Un graphique doit survivre à sa sortie de l'outil.** Il est destiné à être
   projeté et commenté : titres explicites, identité jamais portée par la seule
   couleur, valeurs lisibles sans survol.
3. **Ne pas présupposer l'expertise.** Le vocabulaire métier est expliqué là où
   il apparaît ; l'utilisateur ne doit pas avoir à connaître la nomenclature
   pour trouver ce qu'il cherche.
4. **La granularité est la raison d'être.** Toute optimisation qui pré-agrège au
   point de fermer un axe d'analyse détruit le positionnement.
5. **L'utilisateur garde la main.** Les valeurs par défaut rendent l'outil
   utilisable immédiatement, mais aucune ne doit être un plafond : ce que montre
   un graphique reste modifiable.

## Accessibility & Inclusion

Contraintes déjà tenues par l'implémentation et à préserver : tableaux
accessibles au clavier, identité des séries jamais portée par la seule couleur,
palette catégorielle validée pour les visions atypiques des couleurs en thèmes
clair et sombre, animations désactivées lorsque le système demande une réduction
des mouvements.
