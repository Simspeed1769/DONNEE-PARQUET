/** Le modèle de la base Population : ses lectures, leurs formes licites, ses
 *  réserves.
 *
 *  Une seule mesure de fond — un effectif — et une mesure dérivée, la part du
 *  périmètre. Un effectif s'additionne : les formes qui composent un tout y
 *  sont toutes licites, ce qui n'était le cas d'aucune des quatre autres bases
 *  sur leur mesure principale.
 *
 *  **La pyramide des âges est la forme signature de cette base.** Elle n'est
 *  offerte que sur la lecture Âge et seulement quand le sexe n'est pas filtré :
 *  une pyramide à un seul versant n'est pas une pyramide. Une silhouette de
 *  référence — la pyramide de la première année de la période — se superpose en
 *  trait fin : le vieillissement se voit alors d'un coup d'œil, sans animation
 *  ni artifice.
 */

import { buildOption, type ChartForm, type ChartSeries } from "../charts/buildOption";
import { mapOption } from "../charts/mapOption";
import { resolveForm, type FormOption, type Reading } from "../charts/reading";
import type { ChartTokens } from "../charts/tokens";
import { formatValue } from "../utils";
import type { PopulationCell, PopulationOverview } from "../types";

export type PopulationReadingKey = "evolution" | "territory" | "age" | "sex";
export type PopulationMeasure = "population" | "share";

export const POPULATION_READINGS: FormOption[] = [
  { key: "evolution", label: "Évolution" },
  { key: "territory", label: "Territoire" },
  { key: "age", label: "Âge" },
  { key: "sex", label: "Sexe" },
];

const JANUARY_NOTE = "Population au 1er janvier de l’année : ce n’est pas une population moyenne annuelle. Le dénominateur des taux des autres bases, lui, est la moyenne des 1er janvier N et N+1.";
const COVERAGE_NOTE = "1975 à 1989 : métropole seule, la source ne publie pas les DROM par sexe et âge. La courbe France entière porte donc une rupture en 1990, quand les DROM y entrent, et une seconde en 2014 avec Mayotte : ce sont des changements de champ, pas des variations de population.";
const PROVISIONAL_NOTE = "Les derniers millésimes sont provisoires ou précoces : l’Insee les révisera.";
const ENSEMBLE_NOTE = "Le total « Ensemble » du classeur n’est pas chargé : il est recalculé par somme des hommes et des femmes, et le recalcul retrouve exactement le total publié.";
const LUMPED_NOTE = "Sur quelques cellules d’outre-mer des années 1990, la tranche « 90–94 ans » porte en réalité tous les 90 ans et plus : la source ne détaille pas au-delà, et la case « 95 ans et + » reste vide plutôt que d’être remplie par zéro.";

const CHART_HEIGHT = 430;
const MAP_HEIGHT = 520;

export type PopulationInput = {
  overview: PopulationOverview | null;
  measure: PopulationMeasure;
  /** La carte n'est offerte qu'une fois le fond de carte chargé. */
  mapReady: boolean;
  mapError: string | null;
  tokens: ChartTokens;
  forms: Partial<Record<PopulationReadingKey, string>>;
};

export function buildPopulationReadings(input: PopulationInput): Reading[] {
  const { overview, measure, mapReady, mapError, tokens, forms } = input;
  const isShare = measure === "share";
  const kind = isShare ? "percent" : "quantity";
  const unitLabel = isShare ? "% du périmètre" : "habitants";
  const measureLabel = isShare ? "Part du périmètre" : "Population";
  const context = overview?.context;
  const scope = context ? `${context.region_label} · ${context.age_label} · ${context.sex_label}` : "";
  const base = [JANUARY_NOTE, COVERAGE_NOTE, PROVISIONAL_NOTE, ENSEMBLE_NOTE,
    ...(overview?.quality.lumped_90_plus ? [LUMPED_NOTE] : [])];

  const valueOf = (row: { population: number | null; share: number | null }) =>
    (isShare ? row.share : row.population);

  /* — Évolution : la plus longue série de tout l'outil — */
  const annual = overview?.annual ?? [];
  const evolutionForms: FormOption[] = [{ key: "line", label: "Courbe" }, { key: "bar", label: "Barres" }];
  const evolutionForm = resolveForm(evolutionForms, forms.evolution);
  const evolutionSeries: ChartSeries[] = [{
    key: "population", label: measureLabel, isOther: false, colorIndex: 0,
    values: annual.map(valueOf),
  }];

  /* — Territoire — */
  const territories = (overview?.territories ?? []).filter((item) => valueOf(item) !== null);
  const territoryForms: FormOption[] = [
    { key: "map", label: "Carte" },
    { key: "rank", label: "Classement" },
    { key: "bar", label: "Barres" },
  ];
  const territoryForm = resolveForm(territoryForms, forms.territory);
  // La carte métropolitaine ne reçoit que les régions qu'elle sait dessiner ;
  // les DROM restent au classement, qui les porte.
  const mainland = territories.filter((item) => Number(item.code) >= 11);

  /* — Âge et sexe : la pyramide — */
  const cells = overview?.age_sex ?? [];
  const ageLabels = [...new Set(cells.map((item) => item.age_label))];
  const sexFiltered = (context?.sex ?? "tous sexes") !== "tous sexes";
  const bySex = (rows: PopulationCell[], sex: string) =>
    ageLabels.map((label) => rows.find((item) => item.age_label === label && item.sex === sex)?.population ?? null);
  const ageSeries: ChartSeries[] = ["Hommes", "Femmes"].map((sex, index) => ({
    key: sex, label: sex, isOther: false, colorIndex: index, values: bySex(cells, sex),
  }));
  const referenceCells = overview?.age_sex_reference ?? [];
  const referenceYear = context?.reference_year ?? null;
  const overlay: ChartSeries[] = referenceCells.length
    ? ["Hommes", "Femmes"].map((sex, index) => ({
      key: `ref-${sex}`, label: `${sex} · ${referenceYear}`, isOther: true, colorIndex: index,
      values: bySex(referenceCells, sex),
    }))
    : [];
  const ageForms: FormOption[] = [
    // La pyramide adosse deux effectifs au même axe : elle n'existe qu'avec ses
    // deux versants, et seulement sur des personnes comptées, pas sur des parts.
    ...(!sexFiltered && !isShare ? [{ key: "pyramid", label: "Pyramide" }] : []),
    { key: "bar", label: "Barres" },
    { key: "line", label: "Courbe" },
  ];
  const ageForm = resolveForm(ageForms, forms.age);

  /* — Sexe — */
  const sexRows = (overview?.sex_profile ?? []).map((row) => ({
    label: row.label, value: valueOf(row),
  }));
  const sexForms: FormOption[] = [
    { key: "bar", label: "Barres" },
    { key: "rank", label: "Barres horizontales" },
    ...(!isShare ? [{ key: "pie", label: "Camembert" }] : []),
  ];
  const sexForm = resolveForm(sexForms, forms.sex);

  const categorical = (
    key: PopulationReadingKey, nav: string, title: string, question: string, xTitle: string,
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
          rankBy: "category",
          xTitle: pie ? undefined : xTitle,
        })
        : null,
      table: {
        columns: [xTitle, measureLabel],
        rows: rows.map((row) => [row.label, formatValue(row.value, kind)]),
      },
      ariaLabel: `${title} · ${scope}`,
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
      question: "Comment la population évolue-t-elle dans le temps ?",
      caveats: base,
      forms: evolutionForms,
      form: evolutionForm,
      option: annual.length
        ? buildOption({
          form: evolutionForm as ChartForm,
          categories: annual.map((item) => item.year),
          series: evolutionSeries, kind, unitLabel, tokens,
          directLabels: false, xTitle: "Année",
        })
        : null,
      table: {
        columns: ["Année", measureLabel],
        rows: annual.map((item) => [String(item.year), formatValue(valueOf(item), kind)]),
      },
      ariaLabel: `${measureLabel} par année · ${scope}`,
      height: CHART_HEIGHT,
      empty: annual.length ? null : "Aucune année renseignée sur ce périmètre.",
      xTitle: "Année",
    },
    ((): Reading => {
      const rows = territories.map((item) => ({ label: item.label, value: valueOf(item) }));
      if (territoryForm !== "map") {
        return categorical("territory", "Territoire", `${measureLabel} par territoire`,
          "Où vivent-ils ?", "Région", rows, territoryForms, territoryForm);
      }
      return {
        key: "territory",
        nav: "Territoire",
        title: `${measureLabel} par territoire`,
        question: "Où vivent-ils ?",
        caveats: [...base,
          "Les DROM sont hors du cadrage métropolitain de la carte ; le classement les porte.",
        ],
        forms: territoryForms,
        form: territoryForm,
        option: mapReady && mainland.length
          ? mapOption({
            rows: mainland.map((row) => ({ code: row.code, label: row.label, value: valueOf(row) as number })),
            highlighted: null, kind, tokens,
          })
          : null,
        table: {
          columns: ["Région", measureLabel],
          rows: territories.map((row) => [row.label, formatValue(valueOf(row), kind)]),
        },
        ariaLabel: `${measureLabel} par région · ${scope}`,
        height: MAP_HEIGHT,
        empty: mapReady
          ? (mainland.length ? null : "Aucun territoire métropolitain sur ce millésime.")
          : mapError,
        xTitle: "Région",
      };
    })(),
    ((): Reading => {
      const isPyramid = ageForm === "pyramid";
      return {
        key: "age",
        nav: "Âge",
        title: isPyramid
          ? `Pyramide des âges · ${context?.region_label ?? ""} ${context?.year ?? ""}`
          : `${measureLabel} par âge`,
        question: isPyramid
          ? "Quelle est la forme de cette population, et comment a-t-elle vieilli ?"
          : "Comment la population se répartit-elle par âge ?",
        caveats: [...base,
          ...(isPyramid && referenceYear
            ? [`La silhouette en trait fin est la pyramide de ${referenceYear}, première année de la période : elle sert de repère, pas de mesure.`]
            : []),
          ...(isPyramid
            ? ["Les deux versants portent des effectifs, pas des parts : la largeur se lit comme un nombre de personnes."]
            : []),
        ],
        forms: ageForms,
        form: ageForm,
        option: ageLabels.length
          ? buildOption({
            form: (isPyramid ? "pyramid" : ageForm) as ChartForm,
            categories: ageLabels,
            series: isPyramid || !isShare ? ageSeries : ageSeries,
            overlay: isPyramid ? overlay : undefined,
            kind: "quantity",
            unitLabel: "habitants",
            tokens,
            directLabels: !isPyramid,
            xTitle: "Tranche d’âge",
          })
          : null,
        table: {
          columns: ["Tranche d’âge", "Hommes", "Femmes"],
          rows: ageLabels.map((label, index) => [
            label,
            formatValue(ageSeries[0].values[index], "quantity"),
            formatValue(ageSeries[1].values[index], "quantity"),
          ]),
        },
        ariaLabel: `Population par âge et sexe · ${scope}`,
        // Une pyramide a besoin d'une ligne par tranche d'âge — vingt ici.
        height: isPyramid ? Math.max(CHART_HEIGHT, 80 + ageLabels.length * 22) : CHART_HEIGHT,
        empty: ageLabels.length ? null : "Aucune tranche d’âge renseignée.",
        xTitle: "Tranche d’âge",
        legend: [
          ...ageSeries.map((serie, index) => ({
            key: serie.key, label: serie.label,
            color: tokens.series[index % tokens.series.length],
          })),
          ...(isPyramid && overlay.length
            ? [{ key: "silhouette", label: `Silhouette ${referenceYear}`, color: tokens.inkMuted }]
            : []),
        ],
      };
    })(),
    categorical("sex", "Sexe", `${measureLabel} selon le sexe`,
      "Comment la population se partage-t-elle entre femmes et hommes ?", "Sexe",
      sexRows, sexForms, sexForm),
  ];
}
