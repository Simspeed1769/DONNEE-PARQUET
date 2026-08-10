/** Le modèle de la fiche Mortalité : quelles lectures existent, quelles formes
 *  chacune peut honnêtement prendre, et ce qu'elles ne montrent pas.
 *
 *  Deux absences sont structurelles et **énoncées plutôt que simulées** :
 *  la source n'a pas de dimension régionale — il n'y a donc pas de lecture
 *  Territoire, et ce n'est pas un oubli — et elle ne publie que des effectifs
 *  bruts, sans population de référence, donc jamais de taux de mortalité.
 */

import { buildOption, type ChartForm, type ChartSeries } from "../charts/buildOption";
import type { ChartTokens } from "../charts/tokens";
import { resolveForm, type FormOption, type Reading } from "../charts/reading";
import { formatValue } from "../utils";
import type { MortalityOverview } from "../types";

export type MortalityReadingKey = "evolution" | "age" | "sex" | "causes";

export const MORTALITY_READINGS: FormOption[] = [
  { key: "evolution", label: "Évolution" },
  { key: "age", label: "Âge" },
  { key: "sex", label: "Sexe" },
  { key: "causes", label: "Causes" },
];

const SCOPE_NOTE = "Source nationale : ni région, ni taux de mortalité — le CépiDc ne publie pas de population de référence pour ces effectifs. Une lecture territoriale serait inventée, elle n'est donc pas offerte.";
const ZERO_NOTE = "Les cellules vides restent non disponibles ou non applicables ; elles ne sont jamais interprétées comme un zéro.";

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
  const unitLabel = isShare ? "% des décès publiés" : "décès";
  const measureLabel = isShare ? "Part parmi les décès publiés" : "Décès publiés";
  const year = overview?.context.year ?? "";
  const cause = overview?.context.cause_label ?? "";
  const base = [SCOPE_NOTE, ZERO_NOTE];

  const table = (head: string, rows: Array<[string, number | null]>) => ({
    columns: [head, measureLabel],
    rows: rows.map(([label, value]) => [label, formatValue(value, kind)]),
  });

  const chart = (form: string, categories: Array<string | number>, series: ChartSeries[]) =>
    buildOption({
      form: form as ChartForm, categories, series, kind, unitLabel, tokens,
      directLabels: false,
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

  /* — Causes — */
  const causeRows = overview?.top_causes ?? [];
  const causeForms: FormOption[] = [
    { key: "rank", label: "Classement" },
    { key: "bar", label: "Barres" },
    ...(!isShare ? [{ key: "pie", label: "Camembert" }] : []),
  ];
  const causeForm = resolveForm(causeForms, forms.causes);

  const categorical = (
    key: MortalityReadingKey, nav: string, title: string, question: string, xTitle: string,
    rows: Array<{ label: string; value: number | null }>, offered: FormOption[], form: string,
    extraCaveats: string[] = [],
  ): Reading => {
    // Un camembert décompose un tout : il prend une part par modalité, pas une
    // suite. Les autres formes portent les modalités en catégories.
    const asPie = form === "pie";
    const series: ChartSeries[] = asPie
      ? rows.map((row, index) => ({ key: row.label, label: row.label, isOther: false, colorIndex: index, values: [row.value] }))
      : [seriesOf(key, measureLabel, rows.map((row) => row.value))];
    return {
      key, nav, title, question,
      caveats: [...base, ...extraCaveats],
      forms: offered, form,
      option: rows.length
        ? buildOption({
          form: form as ChartForm,
          categories: asPie ? [title] : rows.map((row) => row.label),
          series, kind, unitLabel, tokens, directLabels: false,
          // Une seule série porte toutes les modalités : le classement met en
          // rang les tranches, les sexes ou les causes, pas des séries.
          rankBy: "category",
        })
        : null,
      table: table(xTitle, rows.map((row) => [row.label, row.value] as [string, number | null])),
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
      title: `${measureLabel}, ${annual[0]?.year ?? ""}–${annual.at(-1)?.year ?? ""}`,
      question: "Comment cela évolue-t-il dans le temps ?",
      caveats: base,
      forms: evolutionForms,
      form: evolutionForm,
      option: annual.length
        ? chart(evolutionForm, annual.map((item) => item.year),
                [seriesOf("evolution", `${cause} · ${populationLabel}`, evolutionValues)])
        : null,
      table: table("Année", annual.map((item, index) => [String(item.year), evolutionValues[index]] as [string, number | null])),
      ariaLabel: `${measureLabel} par année · ${cause}`,
      height: CHART_HEIGHT,
      empty: annual.length ? null : "Aucune année publiée sur ce périmètre.",
      xTitle: "Année",
    },
    categorical("age", "Âge", `${measureLabel} par tranche d’âge`,
      "Quelles tranches d’âge pèsent le plus ?", "Tranche d’âge",
      ageRows.map((item) => ({ label: item.label, value: isShare ? item.share : item.deaths })),
      ageForms, ageForm,
      ["Trois tranches larges seulement : la source ne publie pas d’âge fin."]),
    categorical("sex", "Sexe", `${measureLabel} selon le sexe`,
      "Comment cela se partage-t-il entre femmes et hommes ?", "Sexe",
      sexRows.map((item) => ({ label: item.label, value: isShare ? item.share : item.deaths })),
      sexForms, sexForm),
    categorical("causes", "Causes", `Principales causes de décès, ${year}`,
      "Quelles causes pèsent le plus ?", "Cause de décès",
      causeRows.map((item) => ({ label: item.label, value: isShare ? item.share : item.deaths })),
      causeForms, causeForm,
      ["Causes de premier niveau uniquement : le détail vit dans le sélecteur de cause."]),
  ];
}
