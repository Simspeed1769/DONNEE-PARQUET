/** Le modèle de la fiche Pathologies : ses lectures, leurs formes licites,
 *  ses réserves.
 *
 *  Une prévalence est un rapport, pas un cumul : elle ne s'empile jamais et ne
 *  se décompose jamais en camembert — additionner des prévalences de tranches
 *  d'âge ne donne rien qui existe. Les effectifs de patients, eux, se cumulent
 *  et ouvrent ces formes. Le masquage Cnam (moins de 10 patients) est affiché
 *  et chiffré, jamais comblé.
 */

import { buildOption, type ChartForm, type ChartSeries } from "../charts/buildOption";
import type { ChartTokens } from "../charts/tokens";
import { resolveForm, type FormOption, type Reading } from "../charts/reading";
import { formatValue } from "../utils";
import type { PathologyOverview } from "../types";

export type PathologyReadingKey = "evolution" | "territory" | "age" | "sex" | "compare";

export const PATHOLOGY_READINGS: FormOption[] = [
  { key: "evolution", label: "Évolution" },
  { key: "territory", label: "Territoire" },
  { key: "age", label: "Âge" },
  { key: "sex", label: "Sexe" },
  { key: "compare", label: "Pathologies" },
];

const MASKING_NOTE = "Cellules inférieures à 10 patients masquées par la Cnam ; une valeur masquée reste masquée, elle n'est jamais remplacée par 0.";
const RATE_NOTE = "La prévalence est un rapport à la population de référence, pas un cumul : les tranches ne s'additionnent pas et aucune forme qui composerait un tout n'est offerte sur cette mesure.";
/** Le dénominateur, nommé — sans quoi « % » ne dit pas de quoi.
 *
 *  La population de référence est celle que la Cartographie publie avec ses
 *  effectifs (`npop`), cellule par cellule : région × tranche d'âge × sexe. Ce
 *  n'est pas la population Insee du territoire, et les deux ne coïncident pas. */
const DENOMINATOR_NOTE = "Prévalence = 100 × patients pris en charge ÷ population de référence de la Cartographie, sur la même cellule région × âge × sexe. Cette population de référence est celle que publie la Cnam avec ses effectifs, et non la population Insee du territoire.";

export type PathologyInput = {
  overview: PathologyOverview | null;
  /** Les autres pathologies mises en regard, quand la lecture le demande. */
  compared: Array<{ code: string; label: string; overview: PathologyOverview }>;
  measure: "prevalence" | "patients";
  regionLabel: string;
  isFrance: boolean;
  hiddenTerritories: string[];
  tokens: ChartTokens;
  forms: Partial<Record<PathologyReadingKey, string>>;
};

const CHART_HEIGHT = 430;

export function buildPathologyReadings(input: PathologyInput): Reading[] {
  const { overview, compared, measure, regionLabel, isFrance, hiddenTerritories, tokens, forms } = input;
  const isRate = measure === "prevalence";
  const kind = isRate ? "percent" : "quantity";
  const unitLabel = isRate ? "% de la population de référence Cnam" : "patients";
  const measureLabel = isRate ? "Prévalence" : "Patients";
  const label = overview?.context.label ?? "";
  const base = [MASKING_NOTE, ...(isRate ? [DENOMINATOR_NOTE, RATE_NOTE] : [])];

  const chart = (form: string, categories: Array<string | number>, series: ChartSeries[],
                 xTitle: string, labels = false) =>
    buildOption({ form: form as ChartForm, categories, series, kind, unitLabel, tokens,
                  directLabels: labels, xTitle });

  const valueOf = (row: { prevalence: number | null; patients: number | null }) =>
    (isRate ? row.prevalence : row.patients);

  /* — Évolution : la trajectoire, avec le repère France si l'on est en région — */
  const annual = overview?.annual ?? [];
  const showFrance = !isFrance;
  const evolutionSeries: ChartSeries[] = [
    { key: "selected", label: regionLabel, isOther: false, colorIndex: 0, values: annual.map(valueOf) },
    ...(showFrance ? [{
      key: "france", label: "France entière", isOther: true, colorIndex: 1,
      values: annual.map((item) => {
        const row = overview?.france_annual.find((france) => france.year === item.year);
        return row ? valueOf(row) : null;
      }),
    }] : []),
  ];
  const evolutionForms: FormOption[] = [{ key: "line", label: "Courbe" }, { key: "bar", label: "Barres" }];
  const evolutionForm = resolveForm(evolutionForms, forms.evolution);

  /* — Territoire — */
  const territories = (overview?.territories ?? [])
    .filter((item) => item.code !== "99" && !hiddenTerritories.includes(item.code))
    .filter((item) => valueOf(item) !== null);
  const territoryForms: FormOption[] = [{ key: "rank", label: "Classement" }, { key: "bar", label: "Barres" }];
  const territoryForm = resolveForm(territoryForms, forms.territory);

  /* — Âge × sexe — */
  const ageLabels = [...new Set((overview?.age_sex ?? []).map((item) => item.age))];
  const ageSeries: ChartSeries[] = ["femmes", "hommes"].map((sex, index) => ({
    key: sex,
    label: sex === "femmes" ? "Femmes" : "Hommes",
    isOther: false,
    colorIndex: index,
    values: ageLabels.map((ageLabel) => {
      const row = (overview?.age_sex ?? []).find((item) => item.age === ageLabel && item.sex === sex);
      return row ? valueOf(row) : null;
    }),
  }));
  const ageForms: FormOption[] = [{ key: "bar", label: "Barres" }, { key: "line", label: "Courbe" }];
  const ageForm = resolveForm(ageForms, forms.age);

  /* — Sexe : le profil agrégé sur toutes les tranches — */
  const sexRows = ageSeries.map((serie) => {
    if (isRate) {
      // Une prévalence ne se moyenne pas sur des tranches de tailles
      // différentes : on la reconstruit sur les effectifs quand on les a.
      const rows = (overview?.age_sex ?? []).filter((item) => item.sex === serie.key);
      const patients = rows.reduce((sum, item) => sum + (item.patients ?? 0), 0);
      const known = rows.filter((item) => item.prevalence !== null && item.patients !== null);
      const denominator = known.reduce((sum, item) => sum + (item.patients! / (item.prevalence! / 100)), 0);
      return { label: serie.label, value: denominator ? (100 * patients) / denominator : null };
    }
    const rows = (overview?.age_sex ?? []).filter((item) => item.sex === serie.key);
    return { label: serie.label, value: rows.reduce((sum, item) => sum + (item.patients ?? 0), 0) };
  });
  const sexForms: FormOption[] = [
    { key: "bar", label: "Barres" },
    { key: "rank", label: "Barres horizontales" },
    ...(!isRate ? [{ key: "pie", label: "Camembert" }] : []),
  ];
  const sexForm = resolveForm(sexForms, forms.sex);

  /* — Pathologies comparées — */
  const compareRows = compared.map((item) => ({
    label: item.label,
    values: (overview?.annual ?? []).map((year) => {
      const row = item.overview.annual.find((candidate) => candidate.year === year.year);
      return row ? valueOf(row) : null;
    }),
  }));
  const compareSeries: ChartSeries[] = compareRows.map((row, index) => ({
    key: row.label, label: row.label, isOther: false, colorIndex: index, values: row.values,
  }));
  const compareForms: FormOption[] = [
    { key: "line", label: "Courbes" },
    { key: "bar", label: "Barres" },
    { key: "rank", label: "Classement" },
  ];
  const compareForm = resolveForm(compareForms, forms.compare);

  const categorical = (
    key: PathologyReadingKey, nav: string, title: string, question: string, xTitle: string,
    rows: Array<{ label: string; value: number | null }>, offered: FormOption[], form: string,
    extra: string[] = [],
  ): Reading => {
    const pie = form === "pie";
    const series: ChartSeries[] = pie
      ? rows.map((row, index) => ({ key: row.label, label: row.label, isOther: false, colorIndex: index, values: [row.value] }))
      : [{ key, label: measureLabel, isOther: false, colorIndex: 0, values: rows.map((row) => row.value) }];
    return {
      key, nav, title, question,
      caveats: [...base, ...extra],
      forms: offered, form,
      option: rows.length
        ? buildOption({
          form: form as ChartForm,
          categories: pie ? [title] : rows.map((row) => row.label),
          series, kind, unitLabel, tokens, directLabels: false,
          // Ce sont les modalités qu'on met en rang, pas des séries : une seule
          // série porte ici toutes les régions ou tous les sexes.
          rankBy: "category",
          // Un camembert n'a pas d'axe à nommer.
          xTitle: pie ? undefined : xTitle,
        })
        : null,
      table: {
        columns: [xTitle, measureLabel],
        rows: rows.map((row) => [row.label, formatValue(row.value, kind)]),
      },
      ariaLabel: `${title} · ${label}`,
      // Un classement a besoin d'une ligne par modalité : sa hauteur suit leur
      // nombre, là où les autres formes gardent la hauteur constante qui rend
      // les transitions calmes.
      height: form === "rank" ? Math.max(CHART_HEIGHT, 80 + rows.length * 26) : CHART_HEIGHT,
      empty: rows.length ? null : "Aucune donnée exploitable sur ce périmètre.",
      xTitle,
    };
  };

  return [
    {
      key: "evolution",
      nav: "Évolution",
      title: `${measureLabel}, ${annual[0]?.year ?? ""}–${annual.at(-1)?.year ?? ""}`,
      question: "Comment cela évolue-t-il dans le temps ?",
      caveats: [...base, ...(showFrance ? ["La courbe France entière sert de repère : elle porte le même indicateur sur l'ensemble du territoire."] : [])],
      forms: evolutionForms,
      form: evolutionForm,
      option: annual.length ? chart(evolutionForm, annual.map((item) => item.year), evolutionSeries, "Année", showFrance) : null,
      table: {
        columns: ["Année", ...evolutionSeries.map((item) => item.label)],
        rows: annual.map((item, index) => [String(item.year), ...evolutionSeries.map((serie) => formatValue(serie.values[index], kind))]),
      },
      ariaLabel: `${measureLabel} par année · ${label}`,
      height: CHART_HEIGHT,
      empty: annual.length ? null : "Aucune année renseignée sur ce périmètre.",
      xTitle: "Année",
    },
    categorical("territory", "Territoire", `${measureLabel} par territoire`,
      "Quels territoires sont les plus touchés ?", "Région",
      territories.map((item) => ({ label: item.label, value: valueOf(item) })),
      territoryForms, territoryForm,
      [
        ...(overview?.quality.masked_cells ? [`${overview.quality.masked_cells} cellule(s) masquée(s) par la source sur ce périmètre.`] : []),
        ...(overview?.quality.unavailable_territories ? [`${overview.quality.unavailable_territories} territoire(s) sans valeur exploitable, exclus du classement.`] : []),
      ]),
    {
      key: "age",
      nav: "Âge",
      title: `${measureLabel} par âge et sexe`,
      question: "Quels âges sont les plus touchés, et cela diffère-t-il entre femmes et hommes ?",
      caveats: base,
      forms: ageForms,
      form: ageForm,
      option: ageLabels.length ? chart(ageForm, ageLabels, ageSeries, "Tranche d’âge", true) : null,
      table: {
        columns: ["Tranche d’âge", ...ageSeries.map((item) => item.label)],
        rows: ageLabels.map((ageLabel, index) => [ageLabel, ...ageSeries.map((serie) => formatValue(serie.values[index], kind))]),
      },
      ariaLabel: `${measureLabel} par âge et sexe · ${label}`,
      height: CHART_HEIGHT,
      empty: ageLabels.length ? null : "Aucune tranche d’âge renseignée.",
      xTitle: "Tranche d’âge",
    },
    categorical("sex", "Sexe", `${measureLabel} selon le sexe`,
      "Comment cela se partage-t-il entre femmes et hommes ?", "Sexe",
      sexRows, sexForms, sexForm,
      isRate ? ["La prévalence par sexe est reconstruite sur les effectifs et leur population de référence, jamais moyennée sur les tranches d'âge."] : []),
    {
      key: "compare",
      nav: "Pathologies",
      title: compareSeries.length
        ? `${measureLabel} · ${compareSeries.length} pathologie${compareSeries.length > 1 ? "s" : ""} comparée${compareSeries.length > 1 ? "s" : ""}`
        : `${measureLabel} · comparer des pathologies`,
      question: "Laquelle pèse le plus, et comment leurs trajectoires se comparent-elles ?",
      caveats: [...base, "Toutes les pathologies comparées partagent le périmètre de la fiche : même territoire, même âge, même sexe."],
      forms: compareForms,
      form: compareForm,
      option: compareSeries.length
        ? chart(compareForm, (overview?.annual ?? []).map((item) => item.year), compareSeries, "Année", compareSeries.length <= 6)
        : null,
      table: {
        columns: ["Année", ...compareSeries.map((item) => item.label)],
        rows: (overview?.annual ?? []).map((item, index) => [
          String(item.year), ...compareSeries.map((serie) => formatValue(serie.values[index], kind)),
        ]),
      },
      ariaLabel: `${measureLabel}, pathologies comparées`,
      height: CHART_HEIGHT,
      empty: compareSeries.length ? null : "Ajoutez au moins une pathologie à comparer.",
      xTitle: "Année",
    },
  ];
}
