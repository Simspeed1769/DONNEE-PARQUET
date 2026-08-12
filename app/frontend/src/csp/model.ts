/** Le modèle de la fiche CSP : ses lectures, leurs formes licites, ses réserves.
 *
 *  Une part n'est pas additive entre régions : la somme des parts régionales
 *  n'a aucun sens, et les formes qui composent un tout (camembert, pile) ne
 *  sont donc offertes qu'aux effectifs. La carte, elle, reste la lecture
 *  naturelle du territoire — cliquable, comme avant.
 */

import { buildOption, type ChartForm, type ChartSeries } from "../charts/buildOption";
import { buildCompareReading } from "../charts/compareReading";
import type { ChartTokens } from "../charts/tokens";
import { resolveForm, type FormOption, type Reading } from "../charts/reading";
import { formatValue } from "../utils";
import { mapOption } from "../charts/mapOption";
import type { CspOverview } from "../types";

export type CspReadingKey = "evolution" | "territory" | "age" | "sex";

export const CSP_READINGS: FormOption[] = [
  { key: "evolution", label: "Évolution" },
  { key: "territory", label: "Territoire" },
  { key: "age", label: "Âge" },
  { key: "sex", label: "Sexe" },
];

const WEIGHTED_NOTE = "Effectifs pondérés par l'Insee, pas des comptages directs.";
const NOMENCLATURE_NOTE = "La nomenclature des catégories socioprofessionnelles a évolué entre certains millésimes : une rupture de série n'y est pas toujours une évolution réelle.";
/** Le dénominateur, nommé. Vérifié sur les données : `population_reference`
 *  vaut exactement la somme des effectifs des six groupes d'une même cellule
 *  année × région × âge × sexe. La part se lit donc bien parmi les actifs
 *  occupés, et non parmi l'ensemble de la population. */
const DENOMINATOR_NOTE = "Part = 100 × effectif pondéré du groupe ÷ actifs ayant un emploi (TACT = 11) du même périmètre. Ni les chômeurs, ni les inactifs, ni les retraités n'entrent dans ce dénominateur.";
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
  const base = [WEIGHTED_NOTE, NOMENCLATURE_NOTE, ...(isShare ? [DENOMINATOR_NOTE, SHARE_NOTE] : [])];

  const chart = (form: string, categories: Array<string | number>, series: ChartSeries[],
                 xTitle: string, labels = false) =>
    buildOption({ form: form as ChartForm, categories, series, kind, unitLabel, tokens,
                  directLabels: labels, xTitle });

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
  const ageForms: FormOption[] = [
    { key: "bar", label: "Barres" },
    { key: "line", label: "Courbe" },
    // Une pyramide compte des personnes de part et d'autre d'un axe : sur une
    // part, ses deux ailes seraient des pourcentages et sa forme mentirait sur
    // le poids réel de chaque tranche.
    ...(!isShare && ageSeries.length === 2 ? [{ key: "pyramid", label: "Pyramide" }] : []),
  ];
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
          // Un camembert n'a pas d'axe à nommer.
          xTitle: pie ? undefined : xTitle,
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
        ? chart(evolutionForm, annual.map((item) => item.year), one("evolution", evolutionValues), "Millésime")
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
            xTitle: "Région",
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
      question: ageForm === "pyramid"
        ? "Comment les femmes et les hommes du groupe se répartissent-ils par âge ?"
        : "Comment cela se répartit-il selon l’âge ?",
      caveats: base,
      forms: ageForms,
      form: ageForm,
      option: ageLabels.length ? chart(ageForm, ageLabels, ageSeries, "Tranche d’âge", true) : null,
      table: {
        columns: ["Tranche d’âge", ...ageSeries.map((item) => item.label)],
        rows: ageLabels.map((label, index) => [label, ...ageSeries.map((item) => formatValue(item.values[index], kind))]),
      },
      ariaLabel: `${measureLabel} par âge et sexe · ${cspLabel}`,
      // Une pyramide a besoin d'une ligne par tranche d'âge.
      height: ageForm === "pyramid"
        ? Math.max(CHART_HEIGHT, 80 + ageLabels.length * 26)
        : CHART_HEIGHT,
      empty: ageLabels.length ? null : "Aucune tranche d’âge renseignée.",
      xTitle: "Tranche d’âge",
    },
    categorical("sex", "Sexe", `${measureLabel} selon le sexe`,
      "Comment cela se partage-t-il entre femmes et hommes ?", "Sexe",
      sexRows, sexForms, sexForm),
  ];
}

/* ── Comparer plusieurs catégories socioprofessionnelles ────────────────────
 *
 * Remplace l'ancienne lecture « Composition », qui répondait à une question
 * différente des trois autres : non plus « où en est ce groupe ? » mais
 * « comment se répartit la population active ? ». C'était une comparaison
 * déguisée en lecture ; elle redevient ce qu'elle est, et la composition d'un
 * territoire s'obtient ici comme une **vue** — les parts empilées sur les
 * effectifs — plutôt que comme un écran à part.
 *
 * **Une part n'est pas additive entre régions.** La somme des parts régionales
 * n'a aucun sens, et aucune forme qui composerait un tout n'est offerte sur
 * cette mesure : ce sont les effectifs qui les ouvrent.
 */

export type CspCompareInput = {
  compared: Array<{
    label: string;
    isOther?: boolean;
    annual: Array<{ year: number; effectif: number | null; share: number | null }>;
  }>;
  measure: "share" | "effectif";
  scopeLabel: string;
  tokens: ChartTokens;
  view: string;
  /** Vrai dès qu'une série porte son propre périmètre. */
  mixed: boolean;
};

export function buildCspCompare(input: CspCompareInput): Reading {
  const { compared, measure, scopeLabel, tokens, view, mixed } = input;
  const isShare = measure === "share";
  const kind = isShare ? "percent" : "quantity";
  const unitLabel = isShare ? "% des actifs en emploi" : "personnes";
  const measureLabel = isShare ? "Part parmi les actifs en emploi" : "Effectif pondéré (Insee)";

  // Les millésimes communs à toutes les séries : comparer sur un axe où l'un
  // manque ferait passer une absence pour une chute.
  const years = compared.length
    ? compared
      .map((item) => item.annual.map((row) => row.year))
      .reduce((shared, next) => shared.filter((year) => next.includes(year)))
    : [];

  const series: ChartSeries[] = compared.map((item, index) => ({
    key: `${index}-${item.label}`,
    label: item.label,
    isOther: Boolean(item.isOther),
    colorIndex: index,
    values: years.map((year) => {
      const row = item.annual.find((candidate) => candidate.year === year);
      if (!row) return null;
      return isShare ? row.share : row.effectif;
    }),
  }));

  return buildCompareReading({
    periods: years,
    series,
    additive: !isShare,
    mixed,
    kind, unitLabel, measureLabel, tokens, view,
    nounPlural: "catégories",
    periodTitle: "Millésime",
    seriesTitle: "Groupes comparés",
    scopeLabel,
    caveats: [
      WEIGHTED_NOTE,
      NOMENCLATURE_NOTE,
      ...(isShare ? [DENOMINATOR_NOTE, SHARE_NOTE] : []),
    ],
  });
}
