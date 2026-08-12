/** Le gabarit « Comparer », commun aux bases qui mettent des objets en regard.
 *
 *  Pathologies, CSP et Mortalité posent la même question — « laquelle pèse le
 *  plus, laquelle progresse ? » — et l'ont longtemps posée chacune à sa façon :
 *  trois listes de vues voisines mais jamais identiques, trois façons de nommer
 *  la même forme. La consigne est pourtant que la comparaison **s'utilise à
 *  l'identique** d'une base à l'autre ; trois copies dérivent, une seule
 *  définition tient.
 *
 *  Ce que ce module décide : le catalogue des vues, la lecture appliquée aux
 *  valeurs, la forme dessinée, la hauteur, le tableau, les réserves communes.
 *  Ce qu'il ne décide pas : **quelles vues sont licites**. C'est le modèle de
 *  chaque base qui le dit, en déclarant si sa mesure est additive et si les
 *  séries décrivent la même population — une forme qui composerait un tout
 *  inexistant est **retirée**, jamais offerte grisée.
 */

import { buildOption, type ChartForm, type ChartSeries } from "./buildOption";
import { paletteColor, type ChartTokens } from "./tokens";
import type { FormOption, Reading } from "./reading";
import { applyReading } from "../explore/model";
import { formatValue } from "../utils";

export type CompareView = {
  key: string;
  label: string;
  form: ChartForm;
  /** Ce qu'on lit des valeurs : le niveau, la trajectoire base 100, la
   *  variation d'une période à l'autre. */
  reading: "value" | "index" | "change";
  question: string;
  /** Forme qui compose un tout à partir des séries : elle ment sur une mesure
   *  non additive, et elle ment aussi dès que deux séries ne portent pas sur la
   *  même population. */
  cumulative?: boolean;
  /** Nombre de périodes sous lequel la forme n'a rien à montrer : une
   *  déformation dans le temps demande au moins deux points, un écart aussi. */
  needsPeriods?: number;
  /** Nombre de séries sous lequel la forme est moins lisible que celle qu'elle
   *  remplacerait : une carte de chaleur à deux lignes est un tableau. */
  needsSeries?: number;
};

/** Les vues de DAMIR Comparer, dans son ordre et avec ses questions.
 *
 *  « Empilé » s'y ajoute, que DAMIR n'offre pas : les trois bases l'avaient
 *  déjà, et sur des effectifs — patients, actifs, décès — il répond à une
 *  question que rien d'autre ne pose. Le retirer au nom de l'uniformité
 *  supprimerait une capacité ; c'est le seul écart, et il va dans le sens de
 *  l'offre.
 */
export const COMPARE_VIEWS: CompareView[] = [
  { key: "line", label: "Courbes", form: "line", reading: "value",
    question: "Combien, et comment cela évolue-t-il ?" },
  // `{p}` porte le nom de la période — « année » ici, « millésime » sur CSP.
  { key: "bar", label: "Barres", form: "bar", reading: "value",
    question: "Combien, {p} par {p} ?" },
  { key: "rank", label: "Classement", form: "rank", reading: "value",
    question: "Laquelle pèse le plus ?" },
  { key: "index", label: "Base 100", form: "line", reading: "index",
    question: "Laquelle progresse le plus vite, quelle que soit sa taille ?" },
  { key: "change", label: "Variation", form: "bar", reading: "change",
    question: "De combien chacune varie-t-elle d’une période à l’autre ?" },
  { key: "stack", label: "Empilé", form: "stack", reading: "value", cumulative: true,
    question: "Combien pèsent-elles ensemble, et qui apporte quoi ?" },
  { key: "pie", label: "Camembert", form: "pie", reading: "value", cumulative: true,
    question: "Comment le total se partage-t-il à la dernière période ?" },
  { key: "shareArea", label: "Aires empilées", form: "shareArea", reading: "value",
    cumulative: true, needsPeriods: 2,
    question: "Comment le partage du total se déforme-t-il d’une période à l’autre ?" },
  { key: "diverging", label: "Écarts", form: "diverging", reading: "value", needsPeriods: 2,
    question: "Qui progresse, qui recule sur la période ?" },
  { key: "heatmap", label: "Carte de chaleur", form: "heatmap", reading: "value",
    needsPeriods: 2, needsSeries: 4,
    question: "Où et quand est-ce le plus fort ?" },
];

const CHART_HEIGHT = 430;

export type CompareInput = {
  /** Les périodes communes à toutes les séries, déjà croisées par la base :
   *  comparer sur un axe où l'une manque ferait passer une absence pour une
   *  chute. */
  periods: number[];
  /** Les séries, valeurs brutes. Le repli « Reste du périmètre » y figure comme
   *  les autres, avec `isOther`. */
  series: ChartSeries[];
  /** Faux quand la mesure est un rapport : aucune forme cumulative n'est alors
   *  offerte. */
  additive: boolean;
  /** Vrai dès que deux séries portent des périmètres différents : le tout que
   *  composeraient les formes cumulatives n'existe pas. */
  mixed: boolean;
  kind: string;
  unitLabel: string;
  measureLabel: string;
  tokens: ChartTokens;
  view: string;
  /** Le mot de la base : « pathologies », « catégories », « causes ». */
  nounPlural: string;
  /** Ce que portent les catégories quand l'axe est le temps : « Année »,
   *  « Millésime ». Le même mot en minuscules sert dans les questions. */
  periodTitle: string;
  /** Ce que porte l'axe des modalités sur les formes horizontales. */
  seriesTitle: string;
  /** Le périmètre en une ligne, pour le camembert et les réserves. */
  scopeLabel: string;
  /** Les réserves propres à la base, avant celles que le gabarit ajoute. */
  caveats: string[];
};

/** Les vues que la donnée autorise. Une vue absente n'a pas de bouton. */
export function offeredViews(input: Pick<CompareInput, "additive" | "mixed" | "periods" | "series">): CompareView[] {
  const count = input.series.length;
  return COMPARE_VIEWS.filter((view) =>
    !(view.cumulative && (!input.additive || input.mixed))
    && input.periods.length >= (view.needsPeriods ?? 0)
    && count >= (view.needsSeries ?? 0));
}

export function buildCompareReading(input: CompareInput): Reading {
  const {
    periods, series, kind, unitLabel, measureLabel, tokens, view, mixed,
    nounPlural, periodTitle, seriesTitle, scopeLabel, caveats,
  } = input;

  const offered = offeredViews(input);
  const chosen = offered.find((item) => item.key === view) ?? offered[0];
  const form: ChartForm = chosen?.form ?? "line";
  const asPie = form === "pie";

  const read: ChartSeries[] = series.map((item) => ({
    ...item,
    values: applyReading(item.values, chosen?.reading ?? "value", []),
  }));

  /** Un camembert ne prend pas une suite de périodes mais une valeur par série.
   *
   *  **La dernière période, jamais le cumul.** DAMIR cumule des euros sur la
   *  période, et la somme de dix ans de remboursements est une somme qui
   *  existe. Ici on compte des personnes : patients pris en charge, actifs en
   *  emploi. Additionner dix millésimes d'un stock donnerait 247 millions
   *  d'actifs — un nombre qui ne désigne rien. Le partage se lit donc à la
   *  dernière période commune, et le centre du camembert dit laquelle. */
  const lastPeriod = periods.at(-1);
  const drawn: ChartSeries[] = asPie
    ? read.map((item) => ({ ...item, values: [item.values.at(-1) ?? null] }))
    : read;

  // Une comparaison à un élément n'en est pas une : l'écran invite à en ajouter
  // une seconde plutôt que d'afficher un graphique intitulé comme une mise en
  // regard.
  const enough = series.length >= 2;
  const horizontal = form === "rank" || form === "diverging";
  const readingUnit = chosen?.reading === "index" ? "base 100"
    : chosen?.reading === "change" ? "% de variation"
      : unitLabel;
  const readingKind = chosen?.reading === "value" ? kind : "percent";

  return {
    key: "compare",
    nav: "Comparer",
    title: enough
      ? `${measureLabel} · ${series.length} ${nounPlural} comparées`
      : `Comparer des ${nounPlural}`,
    question: (chosen?.question ?? "").replaceAll("{p}", periodTitle.toLocaleLowerCase("fr-FR")),
    caveats: [
      ...caveats,
      ...(mixed
        ? ["Une ou plusieurs séries portent leur propre périmètre : elles ne décrivent pas la même population et ne s’additionnent pas. Les formes qui composeraient un tout ne sont pas offertes."]
        : [`Toutes les séries partagent le même périmètre : ${scopeLabel}.`]),
      ...(periods.length ? [] : [`Aucune période n’est commune aux ${nounPlural} retenues.`]),
      ...(asPie && lastPeriod !== undefined
        ? [`Le camembert porte la seule période ${lastPeriod} : additionner les périodes d’un effectif ne donnerait aucun nombre qui existe.`]
        : []),
    ],
    forms: offered.map((item): FormOption => ({ key: item.key, label: item.label })),
    form: chosen?.key ?? "line",
    option: enough && periods.length
      ? buildOption({
        form,
        // Le centre du camembert porte cette étiquette : elle doit tenir dans
        // le trou, un périmètre entier y déborderait sur la couronne.
        categories: asPie ? [`en ${lastPeriod ?? ""}`] : periods,
        series: drawn,
        kind: readingKind,
        unitLabel: readingUnit,
        tokens,
        directLabels: form === "line" && drawn.length <= 6,
        xTitle: asPie ? undefined : (horizontal ? seriesTitle : periodTitle),
      })
      : null,
    table: {
      columns: [periodTitle, ...read.map((item) => item.label)],
      rows: periods.map((period, index) => [
        String(period), ...read.map((item) => formatValue(item.values[index], readingKind)),
      ]),
    },
    ariaLabel: `${measureLabel}, ${series.length} ${nounPlural} comparées`,
    // Un classement et des écarts ont besoin d'une ligne par série.
    height: horizontal ? Math.max(CHART_HEIGHT, 80 + series.length * 26) : CHART_HEIGHT,
    empty: !enough
      ? `Ajoutez une deuxième série : une comparaison à un seul élément n’en est pas une.`
      : (periods.length ? null : `Aucune période commune aux ${nounPlural} retenues.`),
    xTitle: periodTitle,
    legend: drawn.map((item) => ({
      key: item.key,
      label: item.label,
      color: paletteColor(tokens, item.colorIndex, drawn.length, item.isOther),
    })),
  };
}
