# Couverture réelle des sources

Ce que les fichiers du poste contiennent **vraiment**, par opposition à ce qu'on
croit qu'ils contiennent. La différence n'est pas théorique : DAMIR s'arrête en
2025 dans les fichiers, l'interface propose 2025 au choix, et l'année n'est
complète qu'à 91 %. Un utilisateur qui étend la période jusqu'au bout lit une
baisse de 2,7 % qui n'a pas eu lieu.

Tous les chiffres de cette page sortent d'une commande, pas d'une mémoire :

```bash
# depuis app/backend
.venv/Scripts/python.exe ../../tools/inventaire_sources.py
```

`tools/inventaire_sources.py` relit les Parquet par la couche DuckDB du produit.
Le relancer après tout remplacement de fichier ; si un chiffre d'ici ne
correspond plus à sa sortie, c'est cette page qui a tort.

*Relevé du 17 août 2026.*

## Vue d'ensemble

| Source | Première | Dernière | Années | Trous | Années creuses |
|---|---:|---:|---:|---|---|
| Open DAMIR | 2014 | 2025 | 12 | aucun | aucune |
| Cube des délais *(années de flux)* | 2015 | 2025 | 11 | aucun | aucune |
| Cartographie des pathologies | 2015 | 2024 | 10 | aucun | aucune |
| CSP · recensement | 2015 | 2023 | 9 | aucun | aucune |
| Population · Insee | 1975 | 2026 | 52 | aucun | aucune |
| Mortalité · CépiDc | 2015 | 2024 | 10 | aucun | aucune |

**Aucune série n'a de trou.** C'est la bonne nouvelle de ce relevé, et elle
méritait d'être vérifiée plutôt que supposée : une année manquante au milieu
d'une série ne se voit nulle part à l'écran — la courbe relie simplement ses
voisines et la pente ment.

Les bornes, elles, ne se recouvrent pas. **2023 est la dernière année où les
cinq bases sont toutes présentes.** Tout croisement qui va au-delà repose sur
une base au moins qui s'est arrêtée avant.

## Open DAMIR

Producteur : Assurance Maladie. Granularité : année de soins.

| Année | Remboursé | Part de la plus lourde | Offerte au choix |
|---:|---:|---:|---|
| 2014 | 7,9 Md € | 5,4 % | non |
| 2015 | 107,0 Md € | 72,7 % | oui |
| 2016 | 110,2 Md € | 74,9 % | oui |
| 2017 | 113,0 Md € | 76,8 % | oui |
| 2018 | 115,5 Md € | 78,5 % | oui |
| 2019 | 117,9 Md € | 80,2 % | oui |
| 2020 | 123,8 Md € | 84,1 % | oui |
| 2021 | 137,0 Md € | 93,2 % | oui |
| 2022 | 140,9 Md € | 95,8 % | oui |
| 2023 | 141,7 Md € | 96,3 % | oui |
| 2024 | 147,1 Md € | 100,0 % | oui |
| 2025 | 143,1 Md € | 97,3 % | oui |

### 2014 est présent dans le fichier et absent de l'interface

Le cube contient 302 447 lignes pour 2014, soit 7,9 Md € — 5,4 % d'une année
pleine. C'est un exercice partiel, et l'écarter est le bon choix.

Mais il faut savoir **par quoi** il est écarté : par un plancher en dur,
`WHERE soi_ann >= 2015` dans `repository.metadata()`, et non par le seuil de 1 %
qui suit. À 5,4 %, 2014 aurait passé le seuil sans difficulté. Les deux règles
ne sont donc pas redondantes, et le seuil ne protège de rien ici : c'est la date
écrite en dur qui travaille. Si un jour le cube est reconstruit avec un 2014
complet, il faudra lever le plancher à la main.

### 2025 est offerte au choix et incomplète

2025 pèse 97,3 % de 2024 : elle passe le seuil, elle est dans la liste des
années sélectionnables. Seule la **période par défaut** s'arrête à 2024
(`default_end_year`). Rien n'empêche d'aller jusqu'à 2025, et rien ne prévient
de ce qu'on y lit.

Or les douze flux mensuels de 2025 sont bien là — le fichier est complet — mais
une année de *soins* ne se clôt pas avec son dernier flux : les soins de
décembre se remboursent l'année suivante. Le cube des délais donne le profil :

| Après | Part remboursée |
|---:|---:|
| +0 mois | 50,25 % |
| +1 mois | 84,79 % |
| +2 mois | 92,38 % |
| +3 mois | 94,99 % |
| +6 mois | 97,59 % |
| +12 mois | 98,79 % |
| +23 mois | 99,91 % |

*Mesuré sur les soins 2016–2022, années entièrement liquidées dans la fenêtre
observée. Mesurer le profil sur des années récentes reviendrait à l'estimer sur
sa propre troncature.*

La moitié d'un mois de soins se rembourse le mois même, 95 % en un trimestre, et
le dernier point de pourcentage met deux ans. En appliquant ce profil mois par
mois à 2025 — les soins de janvier ont été observés douze mois, ceux de décembre
un seul :

> **Complétude de l'année de soins 2025 : 91,4 %.**
> 143,1 Md € observés pour 156,5 Md € estimés à maturité.

D'où le piège annoncé en tête : à l'écran, 2025 (143,1 Md €) est **en baisse**
de 2,7 % par rapport à 2024 (147,1 Md €). À maturité, l'écart est une **hausse**
d'environ 6 %. La courbe affichée ne se contente pas de sous-estimer : elle
inverse le signe.

C'est la raison d'être du point 3.4 de la mission. Tant qu'il n'est pas livré,
cette page est le seul endroit où l'avertissement existe.

## Cube des délais

Producteur : Assurance Maladie. Granularité : mois de soins × mois de flux.

Le tableau d'ensemble compte ce cube par **année de flux** : 2015 à 2025, douze
mois présents pour chacune, y compris 2025. Ses années de *soins* vont plus
loin en arrière — 2014 à 2025 — puisqu'un flux rembourse aussi des soins des
exercices précédents.

Les 93 935 lignes du flux 2015 contre 130 607 en 2016 ne signalent pas un
fichier tronqué mais une montée en charge : le flux 2015 ne porte que deux
cohortes de soins (2014 et 2015), celui de 2016 en porte trois, et ainsi de
suite jusqu'à ce que la fenêtre soit plus large que la queue de liquidation.

Ce cube est le seul de l'ensemble qui rende la liquidation mesurable. Le profil
ci-dessus en sort, et avec lui la seule correction possible de la dernière
année.

## Cartographie des pathologies

Producteur : Cnam. Granularité : année, pathologie, âge quinquennal, sexe,
territoire.

Dix années, 2015 à 2024, sans trou. **579 600 lignes exactement chaque année** —
la grille est complète et rigoureusement identique d'un millésime à l'autre. Ce
n'est pas une régularité heureuse mais la signature d'un produit calé sur un
plan fixe.

Conséquence à ne pas perdre de vue : le nombre de lignes ne dira jamais rien de
la qualité d'un millésime ici. Une année entièrement masquée par le secret
statistique (effectifs < 10) aurait exactement le même compte qu'une année
pleine. Le décompte de lignes est aveugle sur cette base ; seule l'inspection
des valeurs est parlante.

## Professions et catégories socioprofessionnelles

Producteur : Insee. Granularité : millésime, région, âge, sexe, CSP.

Neuf années, 2015 à 2023, sans trou, autour de 77 000 lignes par millésime avec
une variation inférieure à 1,5 % — cohérent avec une structure de recensement
stable.

**C'est la base qui s'arrête le plus tôt.** Elle fixe seule la borne de 2023
au-delà de laquelle les cinq sources ne coexistent plus. Tout croisement
impliquant la CSP après 2023 est impossible, pas seulement imprudent.

## Population

Producteur : Insee. Granularité : année, région, âge, sexe.

Cinquante-deux années, 1975 à 2026, sans trou — de très loin la plus profonde.
Le décompte de lignes en révèle la structure par paliers :

| Période | Lignes/an | Ce que le palier traduit |
|---|---:|---|
| 1975–1989 | 520 | France métropolitaine seule |
| 1990–2013 | 680 | départements d'outre-mer intégrés |
| 2014–2026 | 720 | Mayotte intégrée |

Deux précautions en découlent. Un total « France » comparé de 1985 à 2020
compare deux périmètres différents, et la marche se lit comme une croissance.
Et 2026, présent dans les fichiers, est une estimation au 1er janvier — pas un
constat : la population de 2026 est connue avant que l'année soit vécue, ce qui
n'est vrai d'aucune autre source d'ici.

Aucune donnée DAMIR ne va au-delà de 2025 : le millésime 2026 ne sert donc
aujourd'hui à aucun dénominateur.

## Causes médicales de décès

Producteur : INSERM · CépiDc. Granularité : année, cause, sexe, tranche d'âge.

Dix années, 2015 à 2024, sans trou. **516 lignes exactement chaque année** :
comme la Cartographie, une grille fixe, et le même angle mort — le décompte de
lignes ne dira rien de la qualité d'un millésime.

Le champ est national et les effectifs sont bruts : les évolutions portent la
démographie autant que le risque. Cette réserve est déjà affichée dans
l'interface, à sa place.

## Ce que publie le producteur

Le poste ne fait **aucun appel réseau**, ni au runtime ni ici. Les bornes des
colonnes de gauche sont mesurées ; celles de droite ne peuvent pas l'être depuis
ce poste.

| Source | Dernière année sur le poste | À vérifier chez le producteur |
|---|---:|---|
| Open DAMIR | 2025 | Open DAMIR est publié en flux mensuels : vérifier si des flux 2026 sont parus, et si les flux 2025 déjà pris ont été révisés. |
| Cube des délais | 2025 | Même flux que ci-dessus. |
| Cartographie des pathologies | 2024 | Millésime annuel : vérifier la parution de 2025. |
| CSP · recensement | 2023 | Millésime annuel du recensement : vérifier la parution de 2024. C'est la borne limitante de l'ensemble. |
| Population | 2026 | Estimations et projections révisées chaque année, **y compris rétrospectivement** : un millésime déjà présent peut avoir changé de valeur. |
| Mortalité · CépiDc | 2024 | Les causes de décès sont consolidées avec plusieurs années de retard : les millésimes récents peuvent être provisoires. |

Deux de ces lignes ne sont pas de simples « y a-t-il du neuf ? ». La population
et la mortalité sont **révisées rétrospectivement** : remplacer leur fichier peut
changer des chiffres d'années anciennes, donc des dénominateurs, donc des taux
déjà lus et déjà exportés. Une mise à jour de ces deux bases n'est pas un ajout,
c'est une reconstruction.

## Ce qu'il reste à faire de ce constat

- **La complétude de 2025 doit atteindre l'écran** (point 3.4). Le chiffre existe
  et se calcule ; il n'est aujourd'hui écrit que sur cette page, que l'utilisateur
  n'a aucune raison d'ouvrir avant de lire une courbe.
- **2023 est la borne des croisements à cinq bases.** L'interface ne le dit nulle
  part.
- **Le plancher `soi_ann >= 2015` est une date en dur.** Elle survivrait à un
  cube reconstruit, et écarterait alors une année complète.
