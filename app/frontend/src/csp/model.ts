/** Le modèle de la fiche CSP : ses lectures, leurs formes licites, ses réserves.
 *
 *  Une part n'est pas additive entre régions : la somme des parts régionales
 *  n'a aucun sens, et les formes qui composent un tout (camembert, pile) ne
 *  sont donc offertes qu'aux effectifs. La carte, elle, reste la lecture
 *  naturelle du territoire — cliquable, comme avant.
 */

import { buildOption, type ChartForm, type ChartSeries } from "../charts/buildOption";
import type { ChartTokens } from "../charts/tokens";
import { resolveForm, type FormOption, type Reading } from "../charts/reading";
import { formatValue } from "../utils";
import { mapOption } from "./charts";
import type { CspOverview } from "../types";

export type CspReadingKey = "evolution" | "territory" | "age" | "sex" | "composition";

export const CSP_READINGS: FormOption[] = [
  { key: "evolution", label: "Évolution" },
  { key: "territory", label: "Territoire" },
  { key: "age", label: "Âge" },
  { key: "sex", label: "Sexe" },
  { key: "composition", label: "Composition" },
];

const WEIGHTED_NOTE = "Effectifs pondérés par l'Insee, pas des comptages directs.";
const NOMENCLATURE_NOTE = "La nomenclature des catégories socioprofessionnelles a évolué entre certains millésimes : une rupture de série n'y est pas toujours une évolution réelle.";
const SHARE_NOTE = "Une part se lit territoire par territoire : les parts régionales ne s'additionnent pas, et aucune forme qui composerait un tout n'est offerte sur cette mesure.";

export type CspInput = {
  overview: CspOverview | null;
  annual: Array<{ year: number; effectif: number | null; share: number | null }>;
  /** `share` (part parmi les actifs en emploi) ou `effectif` (pondéré). */
  measure: "share" | "effectif";
  region: string;
  mapReady: boolean;
  mapError: string | null;
  evolutionNote: string | null;
  tokens: ChartTokens;
  forms: Partial<Record<CspReadingKey, string>>;
};

const CHART_HEIGHT = 430;
const MAP_HEIGHT = 520;

export function buildCspReadings(input: CspInput): Reading[] {
  const { overview, annual, measure, region, mapReady, mapError, evolutionNote, tokens, forms } = input;
  const isShare = measure === "share";
  const kind = isShare ? "percent" : "quantity";
  const unitLabel = isShare ? "% des actifs en emploi" : "personnes";
  const measureLabel = isShare ? "Part parmi les actifs en emploi" : "Effectif pondéré (Insee)";
  const cspLabel = overview?.context.csp_label ?? "";
  const base = [WEIGHTED_NOTE, NOMENCLATURE_NOTE, ...(isShare ? [SHARE_NOTE] : [])];

  const chart = (form: string, categories: Array<string | number>, series: ChartSeries[], labels = false) =>
    buildOption({ form: form as ChartForm, categories, series, kind, unitLabel, tokens, directLabels: labels });

  const one = (key: string, values: Array<number | null>): ChartSeries[] =>
    [{ key, label: measureLabel, isOther: false, colorIndex: 0, values }];

  const table = (head: string, rows: Array<[string, number | null]>) => ({
    columns: [head, measureLabel],
    rows: rows.map(([label, value]) => [label, formatValue(value, kind)]),
  });

  /* — Évolution — */
  const evolutionForms: FormOption[] = [{ key: "line", label: "Courbe" }, { key: "bar", label: "Barres" }];
  const evolutionForm = resolveForm(evolutionForms, forms.evolution);
  const evolutionValues = annual.map((item) => (isShare ? item.share : item.effectif));

  /* — Territoire — */
  const territories = overview?.territories ?? [];
  const mainland = territories.filter((item) => Number(item.code) >= 11);
  const territoryForms: FormOption[] = [{ key: "map", label: "Carte" }, { key: "rank", label: "Classement" }];
  const territoryForm = resolveForm(territoryForms, forms.territory);
  const territoryValues = territories.map((item) => (isShare ? item.share : item.effectif));

  /* — Âge et sexe — */
  const ageLabels = [...new Set((overview?.age_sex ?? []).map((item) => item.age))];
  const sexes = [{ code: 2, label: "Femmes" }, { code: 1, label: "Hommes" }];
  const ageSeries: ChartSeries[] = sexes.map((sex, index) => ({
    key: `sex-${sex.code}`,
    label: sex.label,
    isOther: false,
    colorIndex: index,
    values: ageLabels.map((label) => {
      const row = (overview?.age_sex ?? []).find((item) => item.age === label && item.sex_code === sex.code);
      return row ? (isShare ? row.share : row.effectif) : null;
    }),
  }));
  const ageForms: FormOption[] = [{ key: "bar", label: "Barres" }, { key: "line", label: "Courbe" }];
  const ageForm = resolveForm(ageForms, forms.age);

  // La part d'un sexe se recalcule sur ses propres effectifs : moyenner des
  // parts par tranche d'âge donnerait un nombre qui ne veut rien dire.
  const sexRows = sexes.map((sex) => {
    const rows = (overview?.age_sex ?? []).filter((item) => item.sex_code === sex.code);
    const effectif = rows.reduce((sum, item) => sum + item.effectif, 0);
    const population = rows.reduce((sum, item) => sum + item.population, 0);
    return {
      label: sex.label,
      value: isShare ? (population ? (100 * effectif) / population : null) : effectif,
    };
  });
  const sexForms: FormOption[] = [
    { key: "bar", label: "Barres" },
    { key: "rank", label: "Barres horizontales" },
    ...(!isShare ? [{ key: "pie", label: "Camembert" }] : []),
  ];
  const sexForm = resolveForm(sexForms, forms.sex);

  /* — Composition — */
  const composition = overview?.composition ?? [];
  const compositionForms: FormOption[] = [
    { key: "rank", label: "Classement" },
    { key: "bar", label: "Barres" },
    ...(!isShare ? [{ key: "pie", label: "Camembert" }] : []),
  ];
  const compositionForm = resolveForm(compositionForms, forms.composition);
  // La composition ne connaît que la part : c'est ce que l'API renvoie.
  const compositionValues = composition.map((item) => item.share);

  const asPie = (form: string) => form === "pie";

  const categorical = (
    key: CspReadingKey, nav: string, title: string, question: string, xTitle: string,
    rows: Array<{ label: string; value: number | null }>, offered: FormOption[], form: string,
    extra: string[] = [], forceKind?: string,
  ): Reading => {
    const pie = asPie(form);
    const series: ChartSeries[] = pie
      ? rows.map((row, index) => ({ key: row.label, label: row.label, isOther: false, colorIndex: index, values: [row.value] }))
      : [{ key, label: measureLabel, isOther: false, colorIndex: 0, values: rows.map((row) => row.value) }];
    const localKind = forceKind ?? kind;
    return {
      key, nav, title, question,
      caveats: [...base, ...extra],
      forms: offered, form,
      option: rows.length
        ? buildOption({
          form: form as ChartForm,
          categories: pie ? [title] : rows.map((row) => row.label),
          series, kind: localKind, unitLabel: localKind === "percent" ? "%" : unitLabel, tokens,
          directLabels: false,
          // Une seule série porte toutes les modalités : c'est elles qu'on met
          // en rang, pas des séries entre elles.
          rankBy: "category",
        })
        : null,
      table: {
        columns: [xTitle, measureLabel],
        rows: rows.map((row) => [row.label, formatValue(row.value, localKind)]),
      },
      ariaLabel: `${title} · ${cspLabel}`,
      height: form === "rank" ? Math.max(CHART_HEIGHT, 80 + rows.length * 26) : CHART_HEIGHT,
      empty: rows.length ? null : "Aucune donnée sur ce périmètre.",
      xTitle,
    };
  };

  return [
    {
      key: "evolution",
      nav: "Évolution",
      title: annual.length > 1
        ? `${measureLabel}, ${annual[0]?.year}–${annual.at(-1)?.year}`
        : `${measureLabel}, millésime ${annual[0]?.year ?? ""}`,
      question: "Comment cela évolue-t-il d’un millésime à l’autre ?",
      caveats: [...base, ...(evolutionNote ? [evolutionNote] : [])],
      forms: evolutionForms,
      form: evolutionForm,
      option: annual.length > 1
        ? chart(evolutionForm, annual.map((item) => item.year), one("evolution", evolutionValues))
        : null,
      table: table("Millésime", annual.map((item, index) => [String(item.year), evolutionValues[index]] as [string, number | null])),
      ariaLabel: `${measureLabel} par millésime · ${cspLabel}`,
      height: CHART_HEIGHT,
      empty: annual.length > 1 ? null : "L’évolution sera disponible dès qu’un second millésime sera chargé.",
      xTitle: "Millésime",
    },
    {
      key: "territory",
      nav: "Territoire",
      title: `${measureLabel} par région`,
      question: territoryForm === "map" ? "Où est-ce le plus fort ?" : "Quels territoires pèsent le plus ?",
      caveats: [...base, "Les DROM sont hors du cadrage métropolitain de la carte : ils sont posés en encarts sous elle."],
      forms: territoryForms,
      form: territoryForm,
      option: territoryForm === "map"
        ? (mapReady
          ? mapOption({
            rows: mainland.map((item) => ({ code: item.code, label: item.label, value: isShare ? item.share : item.effectif })),
            highlighted: region !== "FR" ? region : null, kind, tokens,
          })
          : null)
        : (territories.length
          ? buildOption({
            form: "rank",
            categories: territories.map((item) => item.label),
            series: one("territory", territoryValues),
            kind, unitLabel, tokens, directLabels: false, rankBy: "category",
          })
          : null),
      table: table("Territoire", territories.map((item, index) => [item.label, territoryValues[index]] as [string, number | null])),
      ariaLabel: `${measureLabel} par région · ${cspLabel}`,
      height: territoryForm === "map" ? MAP_HEIGHT : Math.max(CHART_HEIGHT, 80 + territories.length * 26),
      empty: territoryForm === "map" && !mapReady ? (mapError ?? null) : (territories.length ? null : "Aucun territoire renseigné."),
      xTitle: "Région",
    },
    {
      key: "age",
      nav: "Âge",
      title: `${measureLabel} par âge et sexe`,
      question: "Comment cela se répartit-il selon l’âge ?",
      caveats: base,
      forms: ageForms,
      form: ageForm,
      option: ageLabels.length ? chart(ageForm, ageLabels, ageSeries, true) : null,
      table: {
        columns: ["Tranche d’âge", ...ageSeries.map((item) => item.label)],
        rows: ageLabels.map((label, index) => [label, ...ageSeries.map((item) => formatValue(item.values[index], kind))]),
      },
      ariaLabel: `${measureLabel} par âge et sexe · ${cspLabel}`,
      height: CHART_HEIGHT,
      empty: ageLabels.length ? null : "Aucune tranche d’âge renseignée.",
      xTitle: "Tranche d’âge",
    },
    categorical("sex", "Sexe", `${measureLabel} selon le sexe`,
      "Comment cela se partage-t-il entre femmes et hommes ?", "Sexe",
      sexRows, sexForms, sexForm),
    categorical("composition", "Composition",
      overview?.context.level === "groupe_6" ? "Composition en 6 groupes" : "Composition en 29 catégories",
      "Comment se répartit la population active ?", "Groupe socioprofessionnel",
      composition.map((item, index) => ({ label: item.label, value: compositionValues[index] })),
      [{ key: "rank", label: "Classement" }, { key: "bar", label: "Barres" }, { key: "pie", label: "Camembert" }],
      resolveForm([{ key: "rank", label: "Classement" }, { key: "bar", label: "Barres" }, { key: "pie", label: "Camembert" }], forms.composition ?? compositionForm),
      ["La composition est toujours lue en part de la population active du périmètre, quelle que soit la mesure choisie ailleurs."],
      "percent"),
  ];
}
