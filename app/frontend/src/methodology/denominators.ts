/** Ce que compte chaque mesure : son numérateur, son dénominateur.
 *
 *  Un pourcentage sans dénominateur nommé ne veut rien dire, et deux mesures
 *  qui portent le même mot — « part » — peuvent se rapporter à deux ensembles
 *  différents. Cette table est le seul endroit où la réponse est écrite en
 *  toutes lettres.
 *
 *  **Chaque ligne a été relevée dans le code du serveur, pas reconstituée de
 *  mémoire.** Les expressions viennent de `analysis.py` (METRICS),
 *  `explore.py` (FORMULAS), `pathologies.py`, `csp.py`, `mortality.py` et
 *  `correlations.py`. Deux d'entre elles ont demandé une vérification sur les
 *  données elles-mêmes, notée en regard.
 */

export type Denominator = {
  measure: string;
  numerator: string;
  /** `null` lorsque la mesure est un total : il n'y a rien à rapporter. */
  denominator: string | null;
  note?: string;
};

export type DenominatorGroup = {
  source: string;
  intro: string;
  rows: Denominator[];
};

export const DENOMINATORS: DenominatorGroup[] = [
  {
    source: "DAMIR — dépenses",
    intro: "Aucune mesure DAMIR n'est rapportée à une population : les dénominateurs y sont internes aux remboursements eux-mêmes.",
    rows: [
      { measure: "Montant remboursé", numerator: "Somme des remboursements", denominator: null },
      { measure: "Dépense présentée", numerator: "Somme des dépenses présentées", denominator: null },
      { measure: "Reste à charge après AMO", numerator: "Dépense présentée − montant remboursé", denominator: null,
        note: "Avant intervention d'une complémentaire : ce n'est pas le reste à charge final de l'assuré." },
      { measure: "Ticket modérateur", numerator: "Base de remboursement de référence − remboursement de référence", denominator: null },
      { measure: "Dépassements", numerator: "Somme des dépassements", denominator: null },
      { measure: "Volume de la prestation", numerator: "Somme des quantités", denominator: null },
      { measure: "Remboursement moyen par unité", numerator: "Somme des remboursements", denominator: "Somme des quantités de la prestation",
        note: "Ce n'est ni un coût par patient ni un tarif : une moyenne d'ensemble dépend du mélange de prestations." },
      { measure: "Dépense moyenne par unité", numerator: "Somme des dépenses présentées", denominator: "Somme des quantités de la prestation" },
      { measure: "Taux de prise en charge AMO", numerator: "100 × somme des remboursements", denominator: "Somme des dépenses présentées" },
      { measure: "Régularisations négatives", numerator: "Somme des remboursements négatifs", denominator: null },
      { measure: "Remboursé hors régularisations", numerator: "Montant remboursé − régularisations négatives", denominator: null },
      { measure: "Part des régularisations", numerator: "−100 × régularisations négatives", denominator: "Remboursement hors régularisations" },
    ],
  },
  {
    source: "Pathologies — Cartographie Cnam",
    intro: "La population de référence est celle que la Cnam publie avec ses effectifs, cellule par cellule. Ce n'est pas la population Insee du territoire, et les deux ne coïncident pas.",
    rows: [
      { measure: "Patients", numerator: "Somme des patients pris en charge", denominator: null,
        note: "Les cellules de moins de 10 patients ne sont pas publiées ; elles restent absentes et ne deviennent jamais zéro." },
      { measure: "Population de référence", numerator: "Somme de la population de référence Cnam", denominator: null },
      { measure: "Prévalence", numerator: "100 × patients pris en charge", denominator: "Population de référence Cnam de la même cellule région × âge × sexe",
        note: "Les pathologies propres à un sexe — maternité, cancer de la prostate — portent la population de leur seul sexe, et non la population générale." },
    ],
  },
  {
    source: "CSP — recensement Insee",
    intro: "Le champ est celui des actifs ayant un emploi (TACT = 11). Ni les chômeurs, ni les inactifs, ni les retraités n'entrent dans ces dénominateurs.",
    rows: [
      { measure: "Effectif pondéré", numerator: "Somme des effectifs pondérés Insee", denominator: null,
        note: "Des effectifs pondérés, pas des comptages directs." },
      { measure: "Actifs en emploi", numerator: "Somme des actifs ayant un emploi", denominator: null },
      { measure: "Part parmi les actifs en emploi", numerator: "100 × effectif pondéré du groupe", denominator: "Actifs ayant un emploi du même périmètre",
        note: "Vérifié sur les données : ce dénominateur vaut exactement la somme des effectifs des six groupes d'une même cellule année × région × âge × sexe." },
    ],
  },
  {
    source: "Mortalité — CépiDc",
    intro: "Le CépiDc ne publie pas de population de référence : cette base ne porte donc aucun taux de mortalité, et le mot « part » y recouvre deux dénominateurs qu'il faut distinguer.",
    rows: [
      { measure: "Décès publiés", numerator: "Somme des décès publiés", denominator: null },
      { measure: "Part — évolution et causes", numerator: "100 × décès de la cause", denominator: "Décès toutes causes, même année et même population" },
      { measure: "Part — profils par âge et par sexe", numerator: "100 × décès de la modalité", denominator: "Décès de la même cause, toutes modalités du profil réunies",
        note: "Une part d'âge ou de sexe se rapporte à la cause affichée, jamais au total toutes causes : « 38 % » y signifie 38 % des décès de cette cause." },
      { measure: "Taux de mortalité", numerator: "Mesure non offerte",
        denominator: "Aucune population de référence n'est publiée par la source",
        note: "Volontairement absente : il faudrait un dénominateur que le CépiDc ne fournit pas. L'inventer produirait un chiffre sans origine, c'est pourquoi la fiche Mortalité n'offre ni taux ni lecture territoriale." },
    ],
  },
  {
    source: "Croisements",
    intro: "Les croisements rapprochent cinq sources. Depuis la v5, tous les taux « par habitant » se rapportent à la population résidente Insee, sur la maille commune région × âge × sexe × année ; la population de référence de la Cnam ne sert plus que de recours si le fichier Insee n'est pas installé, et l'écran dit alors laquelle divise.",
    rows: [
      { measure: "Dépense remboursée par habitant", numerator: "Somme des remboursements de la période", denominator: "Population résidente Insee, comptée en années-personnes sur la même période",
        note: "En années-personnes, pour qu'une période de quatre ans ne soit pas rapportée à une seule année de population. Chaque année compte la moyenne des 1er janvier N et N+1 ; la dernière année disponible n'a pas de N+1 et compte son 1er janvier seul." },
      { measure: "Taux de prise en charge", numerator: "100 × remboursements", denominator: "Dépenses présentées" },
      { measure: "Remboursement moyen par acte", numerator: "Remboursements", denominator: "Quantités" },
      { measure: "Prévalence", numerator: "100 × patients pris en charge", denominator: "Population résidente Insee de la même cellule",
        note: "Ce n'est pas la prévalence de la fiche Pathologies, qui divise par la population de référence de la Cnam : sur une région, l'écart entre les deux dénominateurs va de 2 à 5 %, et jusqu'à 12 % sur certaines cellules d'âge et de sexe." },
      { measure: "Part dans la population active", numerator: "100 × effectif pondéré du groupe", denominator: "Actifs ayant un emploi du même périmètre" },
      { measure: "Décès pour 100 000 habitants", numerator: "100 000 × décès publiés", denominator: "Population résidente Insee, en années-personnes",
        note: "Le CépiDc ne publie pas de population exposée : le dénominateur vient donc d'une autre source que le numérateur. Il vient désormais de l'Insee, dont c'est le métier, plutôt que de la Cartographie, dont ce n'était pas la fonction." },
    ],
  },
  {
    source: "Population — estimations Insee",
    intro: "La cinquième base, et le dénominateur de référence des autres. L'Insee publie une population au 1er janvier, par région, sexe et tranche d'âge quinquennale, rétropolée sur les 13 régions actuelles depuis 1975.",
    rows: [
      { measure: "Population", numerator: "Somme des effectifs du périmètre", denominator: null,
        note: "Au 1er janvier de l'année. Le total « Ensemble » de la source n'est pas chargé : il est recalculé par somme des hommes et des femmes, et le recalcul retrouve exactement le total publié." },
      { measure: "Part du périmètre", numerator: "100 × population du sous-ensemble retenu", denominator: "Population du même territoire et du même millésime, tous âges et tous sexes" },
      { measure: "Part des 65 ans et plus", numerator: "100 × population de 65 ans et plus", denominator: "Population du territoire, tous âges",
        note: "Se lit sur le territoire entier : le filtre d'âge ne s'y applique pas, il la rendrait tautologique." },
      { measure: "Population moyenne de l'année", numerator: "Population au 1er janvier N + population au 1er janvier N+1", denominator: "2",
        note: "C'est cette moyenne qui sert de dénominateur aux flux annuels des autres bases. Sur la dernière année disponible, N+1 n'existe pas encore : le 1er janvier sert seul, et la réserve le dit." },
    ],
  },
];
