/** Le modèle de la fiche Mortalité : quelles lectures existent, quelles formes
 *  chacune peut honnêtement prendre, et ce qu'elles ne montrent pas.
 *
 *  Deux absences sont structurelles et **énoncées plutôt que simulées** :
 *  la source n'a pas de dimension régionale — il n'y a donc pas de lecture
 *  Territoire, et ce n'est pas un oubli — et elle ne publie que des effectifs
 *  bruts, sans population de référence, donc jamais de taux de mortalité.
 */

import { buildOption, type ChartForm, type ChartSeries } from "../charts/buildOption";
import { buildCompareReading } from "../charts/compareReading";
import type { ChartTokens } from "../charts/tokens";
import { resolveForm, type FormOption, type Reading } from "../charts/reading";
import { formatValue } from "../utils";
import type { MortalityOverview } from "../types";

export type MortalityReadingKey = "evolution" | "age" | "sex";

export const MORTALITY_READINGS: FormOption[] = [
  { key: "evolution", label: "Évolution" },
  { key: "age", label: "Âge" },
  { key: "sex", label: "Sexe" },
];

const SCOPE_NOTE = "Source nationale : ni région, ni taux de mortalité — le CépiDc ne publie pas de population de référence pour ces effectifs. Une lecture territoriale serait inventée, elle n'est donc pas offerte.";
const ZERO_NOTE = "Les cellules vides restent non disponibles ou non applicables ; elles ne sont jamais interprétées comme un zéro.";

/** Le mot « part » recouvre ici deux dénominateurs, et il faut les distinguer.
 *
 *  Sur l'évolution et sur les causes, une part se rapporte au total toutes
 *  causes de l'année et de la population choisies. Sur les profils d'âge et de
 *  sexe, elle se rapporte aux décès de la seule cause affichée, répartis entre
 *  ses modalités. Les deux valent 100 % une fois sommées, mais sur des ensembles
 *  différents : les confondre ferait lire « 38 % des décès » là où il faut lire
 *  « 38 % des décès de cette cause ».
 */
const ALL_CAUSES_DENOMINATOR = "décès toutes causes";
const SAME_CAUSE_DENOMINATOR = "décès de cette cause";

export type MortalityInput = {
  overview: MortalityOverview | null;
  /** `deaths` (effectif) ou `share` (part parmi les décès publiés). */
  measure: "deaths" | "share";
  populationLabel: string;
  tokens: ChartTokens;
  forms: Partial<Record<MortalityReadingKey, string>>;
};

const CHART_HEIGHT = 430;

function seriesOf(key: string, label: string, values: Array<number | null>): ChartSeries {
  return { key, label, isOther: false, colorIndex: 0, values };
}

export function buildMortalityReadings(input: MortalityInput): Reading[] {
  const { overview, measure, populationLabel, tokens, forms } = input;
  const isShare = measure === "share";
  const kind = isShare ? "percent" : "quantity";
  const year = overview?.context.year ?? "";
  const cause = overview?.context.cause_label ?? "";
  const base = [SCOPE_NOTE, ZERO_NOTE];

  /* — Le dénominateur, écrit sur l'axe et rappelé en réserve — */

  const unitOf = (denominator: string) => (isShare ? `% des ${denominator}` : "décès");
  const measureOf = (denominator: string) =>
    (isShare ? `Part des ${denominator}` : "Décès publiés");
  const denominatorNote = (denominator: string) =>
    (isShare
      ? [`Le dénominateur de cette part est le nombre de ${denominator}, sur la même année et la même population : c'est lui qui vaut 100 %.`]
      : []);

  const table = (head: string, denominator: string, rows: Array<[string, number | null]>) => ({
    columns: [head, measureOf(denominator)],
    rows: rows.map(([label, value]) => [label, formatValue(value, kind)]),
  });

  const chart = (form: string, categories: Array<string | number>, series: ChartSeries[],
                 xTitle: string, denominator: string) =>
    buildOption({
      form: form as ChartForm, categories, series, kind, unitLabel: unitOf(denominator), tokens,
      directLabels: false, xTitle,
    });

  /* — Évolution — */
  const annual = overview?.annual ?? [];
  const evolutionForms: FormOption[] = [
    { key: "line", label: "Courbe" },
    { key: "bar", label: "Barres" },
  ];
  const evolutionForm = resolveForm(evolutionForms, forms.evolution);
  const evolutionValues = annual.map((item) => (isShare ? item.share : item.deaths));

  /* — Âge — */
  const ageRows = overview?.profiles.age ?? [];
  const ageForms: FormOption[] = [
    { key: "bar", label: "Barres" },
    { key: "rank", label: "Barres horizontales" },
  ];
  const ageForm = resolveForm(ageForms, forms.age);

  /* — Sexe — */
  const sexRows = overview?.profiles.sex ?? [];
  const sexForms: FormOption[] = [
    { key: "bar", label: "Barres" },
    { key: "rank", label: "Barres horizontales" },
    // Un effectif de décès se partage en un tout ; une part parmi les décès,
    // déjà rapportée à ce tout, ne se redécompose pas en camembert.
    ...(!isShare ? [{ key: "pie", label: "Camembert" }] : []),
  ];
  const sexForm = resolveForm(sexForms, forms.sex);

  const categorical = (
    key: MortalityReadingKey, nav: string, title: string, question: string, xTitle: string,
    denominator: string,
    rows: Array<{ label: string; value: number | null }>, offered: FormOption[], form: string,
    extraCaveats: string[] = [],
  ): Reading => {
    // Un camembert décompose un tout : il prend une part par modalité, pas une
    // suite. Les autres formes portent les modalités en catégories.
    const asPie = form === "pie";
    const series: ChartSeries[] = asPie
      ? rows.map((row, index) => ({ key: row.label, label: row.label, isOther: false, colorIndex: index, values: [row.value] }))
      : [seriesOf(key, measureOf(denominator), rows.map((row) => row.value))];
    return {
      key, nav, title, question,
      caveats: [...base, ...denominatorNote(denominator), ...extraCaveats],
      forms: offered, form,
      option: rows.length
        ? buildOption({
          form: form as ChartForm,
          categories: asPie ? [title] : rows.map((row) => row.label),
          series, kind, unitLabel: unitOf(denominator), tokens, directLabels: false,
          // Une seule série porte toutes les modalités : le classement met en
          // rang les tranches, les sexes ou les causes, pas des séries.
          rankBy: "category",
          // Un camembert n'a pas d'axe à nommer.
          xTitle: asPie ? undefined : xTitle,
        })
        : null,
      table: table(xTitle, denominator, rows.map((row) => [row.label, row.value] as [string, number | null])),
      ariaLabel: `${title} · ${cause}`,
      // Un classement a besoin d'une ligne par modalité.
      height: form === "rank" ? Math.max(CHART_HEIGHT, 80 + rows.length * 26) : CHART_HEIGHT,
      empty: rows.length ? null : "Aucune donnée publiée sur ce périmètre.",
      xTitle,
    };
  };

  return [
    {
      key: "evolution",
      nav: "Évolution",
      title: `${measureOf(ALL_CAUSES_DENOMINATOR)}, ${annual[0]?.year ?? ""}–${annual.at(-1)?.year ?? ""}`,
      question: "Comment cela évolue-t-il dans le temps ?",
      caveats: [...base, ...denominatorNote(ALL_CAUSES_DENOMINATOR)],
      forms: evolutionForms,
      form: evolutionForm,
      option: annual.length
        ? chart(evolutionForm, annual.map((item) => item.year),
                [seriesOf("evolution", `${cause} · ${populationLabel}`, evolutionValues)],
                "Année", ALL_CAUSES_DENOMINATOR)
        : null,
      table: table("Année", ALL_CAUSES_DENOMINATOR,
                   annual.map((item, index) => [String(item.year), evolutionValues[index]] as [string, number | null])),
      ariaLabel: `${measureOf(ALL_CAUSES_DENOMINATOR)} par année · ${cause}`,
      height: CHART_HEIGHT,
      empty: annual.length ? null : "Aucune année publiée sur ce périmètre.",
      xTitle: "Année",
    },
    // Âge et sexe répartissent les décès de la cause affichée entre leurs
    // modalités : leur dénominateur est cette cause, pas le total toutes causes.
    categorical("age", "Âge", `${measureOf(SAME_CAUSE_DENOMINATOR)} par tranche d’âge`,
      "Quelles tranches d’âge pèsent le plus ?", "Tranche d’âge", SAME_CAUSE_DENOMINATOR,
      ageRows.map((item) => ({ label: item.label, value: isShare ? item.share : item.deaths })),
      ageForms, ageForm,
      ["Trois tranches larges seulement : la source ne publie pas d’âge fin."]),
    categorical("sex", "Sexe", `${measureOf(SAME_CAUSE_DENOMINATOR)} selon le sexe`,
      "Comment cela se partage-t-il entre femmes et hommes ?", "Sexe", SAME_CAUSE_DENOMINATOR,
      sexRows.map((item) => ({ label: item.label, value: isShare ? item.share : item.deaths })),
      sexForms, sexForm),
  ];
}

/* ── Comparer plusieurs causes de décès ─────────────────────────────────────
 *
 * Remplace l'ancienne lecture « Causes », qui classait les douze premières :
 * c'était une comparaison, présentée comme une lecture. On choisit désormais
 * les causes qu'on met en regard, et le catalogue est classé par nombre de
 * décès, si bien que retenir les premières reproduit exactement l'ancien
 * classement.
 *
 * **C'est la base où les formes cumulatives ont le plus de sens** : les décès
 * s'additionnent, et la somme de plusieurs causes est un nombre de décès qui
 * existe. Empilé, camembert et aires empilées y sont donc licites sur les
 * effectifs. Sur la part, non : elle est déjà rapportée au total toutes causes,
 * et la redécomposer reviendrait à composer un tout avec des morceaux du tout.
 */

export type MortalityCompareInput = {
  compared: Array<{ label: string; isOther?: boolean; overview: MortalityOverview }>;
  measure: "deaths" | "share";
  populationLabel: string;
  tokens: ChartTokens;
  view: string;
  /** Vrai dès qu'une série porte sa propre population. */
  mixed: boolean;
};

export function buildMortalityCompare(input: MortalityCompareInput): Reading {
  const { compared, measure, populationLabel, tokens, view, mixed } = input;
  const isShare = measure === "share";
  const kind = isShare ? "percent" : "quantity";
  const unitLabel = isShare ? `% des ${ALL_CAUSES_DENOMINATOR}` : "décès";
  const measureLabel = isShare ? `Part des ${ALL_CAUSES_DENOMINATOR}` : "Décès publiés";

  const years = compared.length
    ? compared
      .map((item) => item.overview.annual.map((row) => row.year))
      .reduce((shared, next) => shared.filter((year) => next.includes(year)))
    : [];

  const series: ChartSeries[] = compared.map((item, index) => ({
    key: `${index}-${item.label}`,
    label: item.label,
    isOther: Boolean(item.isOther),
    colorIndex: index,
    values: years.map((year) => {
      const row = item.overview.annual.find((candidate) => candidate.year === year);
      if (!row) return null;
      return isShare ? row.share : row.deaths;
    }),
  }));

  return buildCompareReading({
    periods: years,
    series,
    // Les décès s'additionnent : la somme de plusieurs causes est un nombre de
    // décès qui existe. La part, elle, est déjà rapportée au total toutes
    // causes ; la redécomposer reviendrait à composer un tout avec des morceaux
    // du tout.
    additive: !isShare,
    mixed,
    kind, unitLabel, measureLabel, tokens, view,
    nounPlural: "causes",
    periodTitle: "Année",
    seriesTitle: "Causes comparées",
    scopeLabel: populationLabel,
    caveats: [
      SCOPE_NOTE,
      ZERO_NOTE,
      ...(isShare
        ? [`Le dénominateur de ces parts est le nombre de ${ALL_CAUSES_DENOMINATOR}, sur la même année et la même population : c'est lui qui vaut 100 %.`]
        : []),
      "Les causes de la nomenclature s'emboîtent : additionner un chapitre et l'un de ses détails compterait deux fois les mêmes décès. Le reste du périmètre n'est donc offert qu'entre chapitres.",
    ],
  });
}
