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
import { mapOption } from "../charts/mapOption";
import type { PathologyOverview } from "../types";

export type PathologyReadingKey = "evolution" | "territory" | "age" | "sex";

export const PATHOLOGY_READINGS: FormOption[] = [
  { key: "evolution", label: "Évolution" },
  { key: "territory", label: "Territoire" },
  { key: "age", label: "Âge" },
  { key: "sex", label: "Sexe" },
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
  measure: "prevalence" | "patients";
  regionLabel: string;
  isFrance: boolean;
  hiddenTerritories: string[];
  /** La carte n'est offerte qu'une fois le fond de carte chargé : sans lui,
   *  ECharts dessinerait un cadre vide. */
  mapReady: boolean;
  mapError: string | null;
  tokens: ChartTokens;
  forms: Partial<Record<PathologyReadingKey, string>>;
};

const CHART_HEIGHT = 430;

export function buildPathologyReadings(input: PathologyInput): Reading[] {
  const { overview, measure, regionLabel, isFrance, hiddenTerritories,
          mapReady, mapError, tokens, forms } = input;
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
  const territoryForms: FormOption[] = [
    { key: "map", label: "Carte" },
    { key: "rank", label: "Classement" },
    { key: "bar", label: "Barres" },
  ];
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
  const ageForms: FormOption[] = [
    { key: "bar", label: "Barres" },
    { key: "line", label: "Courbe" },
    // Une pyramide adosse deux effectifs au même axe : elle compte des
    // personnes. Sur une prévalence, les deux ailes seraient des taux, et leur
    // longueur ne se lirait plus comme un nombre de patients.
    ...(!isRate && ageSeries.length === 2 ? [{ key: "pyramid", label: "Pyramide" }] : []),
  ];
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
    ((): Reading => {
      const rows = territories.map((item) => ({
        code: item.code, label: item.label, value: valueOf(item),
      }));
      const quality = [
        ...(overview?.quality.masked_cells ? [`${overview.quality.masked_cells} cellule(s) masquée(s) par la source sur ce périmètre.`] : []),
        ...(overview?.quality.unavailable_territories ? [`${overview.quality.unavailable_territories} territoire(s) sans valeur exploitable, exclus du classement.`] : []),
      ];
      const onMap = territoryForm === "map";
      // La carte ne reçoit que les territoires dont la valeur est publiée. Les
      // autres — masquage Cnam — restent en `--map-void` : une absence n'est
      // pas une valeur basse, et le bas de rampe la ferait lire comme telle.
      const mainland = rows.filter((row) => Number(row.code) >= 11 && row.value !== null);

      if (!onMap) {
        return categorical("territory", "Territoire", `${measureLabel} par territoire`,
          "Quels territoires sont les plus touchés ?", "Région",
          rows.map(({ label, value }) => ({ label, value })),
          territoryForms, territoryForm, quality);
      }

      return {
        key: "territory",
        nav: "Territoire",
        title: `${measureLabel} par territoire`,
        question: "Où est-ce le plus fort ?",
        caveats: [
          ...base,
          "Un territoire sans valeur publiée reste en gris : c'est une absence, pas une valeur basse.",
          "Les DROM sont hors du cadrage métropolitain de la carte ; le classement les porte.",
          ...quality,
        ],
        forms: territoryForms,
        form: territoryForm,
        option: mapReady && mainland.length
          ? mapOption({
            rows: mainland.map((row) => ({ code: row.code, label: row.label, value: row.value as number })),
            highlighted: isFrance ? null : null,
            kind, tokens,
          })
          : null,
        table: {
          columns: ["Région", measureLabel],
          rows: rows.map((row) => [row.label, formatValue(row.value, kind)]),
        },
        ariaLabel: `${measureLabel} par région · ${label}`,
        height: 520,
        empty: mapReady
          ? (mainland.length ? null : "Aucun territoire métropolitain avec une valeur publiée.")
          : mapError,
        xTitle: "Région",
      };
    })(),
    {
      key: "age",
      nav: "Âge",
      title: `${measureLabel} par âge et sexe`,
      question: ageForm === "pyramid"
        ? "Comment les patientes et les patients se répartissent-ils par âge ?"
        : "Quels âges sont les plus touchés, et cela diffère-t-il entre femmes et hommes ?",
      caveats: base,
      forms: ageForms,
      form: ageForm,
      option: ageLabels.length ? chart(ageForm, ageLabels, ageSeries, "Tranche d’âge", true) : null,
      table: {
        columns: ["Tranche d’âge", ...ageSeries.map((item) => item.label)],
        rows: ageLabels.map((ageLabel, index) => [ageLabel, ...ageSeries.map((serie) => formatValue(serie.values[index], kind))]),
      },
      ariaLabel: `${measureLabel} par âge et sexe · ${label}`,
      // Une pyramide a besoin d'une ligne par tranche d'âge.
      height: ageForm === "pyramid"
        ? Math.max(CHART_HEIGHT, 80 + ageLabels.length * 26)
        : CHART_HEIGHT,
      empty: ageLabels.length ? null : "Aucune tranche d’âge renseignée.",
      xTitle: "Tranche d’âge",
    },
    categorical("sex", "Sexe", `${measureLabel} selon le sexe`,
      "Comment cela se partage-t-il entre femmes et hommes ?", "Sexe",
      sexRows, sexForms, sexForm,
      isRate ? ["La prévalence par sexe est reconstruite sur les effectifs et leur population de référence, jamais moyennée sur les tranches d'âge."] : []),
  ];
}

/* ── Comparer plusieurs pathologies ──────────────────────────────────────────
 *
 * La section Comparer répond à une autre question que le panorama : non plus
 * « où en est cette pathologie ? » mais « laquelle pèse le plus, et laquelle
 * progresse ? ». Elle reprend donc les vues de DAMIR Comparer, nommées par la
 * question à laquelle elles répondent.
 *
 * **Le modèle décide, pas un bouton grisé.** Une prévalence est un rapport à
 * une population de référence : deux prévalences ne s'additionnent pas, et
 * aucune forme qui composerait un tout — camembert, aires empilées — n'est
 * offerte sur cette mesure. Les effectifs de patients, eux, se cumulent et les
 * ouvrent.
 */

export type PathologyCompareView = {
  key: string;
  label: string;
  form: ChartForm;
  question: string;
  /** Forme qui compose un tout : elle ment sur une mesure non additive. */
  needsAdditive?: boolean;
  /** Nombre d'années sous lequel la forme n'a rien à montrer. */
  needsYears?: number;
};

export const PATHOLOGY_COMPARE_VIEWS: PathologyCompareView[] = [
  { key: "line", label: "Courbes", form: "line", question: "Comment leurs trajectoires se comparent-elles ?" },
  { key: "bar", label: "Barres", form: "bar", question: "Combien, année par année ?" },
  { key: "rank", label: "Classement", form: "rank", question: "Laquelle pèse le plus ?" },
  { key: "diverging", label: "Écarts", form: "diverging", needsYears: 2,
    question: "Laquelle progresse, laquelle recule sur la période ?" },
  { key: "heatmap", label: "Carte de chaleur", form: "heatmap", needsYears: 2,
    question: "Où et quand est-ce le plus fort ?" },
  { key: "stack", label: "Empilé", form: "stack", needsAdditive: true,
    question: "Combien pèsent-elles ensemble, et qui apporte quoi ?" },
  { key: "pie", label: "Camembert", form: "pie", needsAdditive: true,
    question: "Comment le total se partage-t-il ?" },
];

export type PathologyCompareInput = {
  compared: Array<{ code: string; label: string; overview: PathologyOverview }>;
  measure: "prevalence" | "patients";
  scopeLabel: string;
  tokens: ChartTokens;
  view: string;
};

export function buildPathologyCompare(input: PathologyCompareInput): Reading {
  const { compared, measure, scopeLabel, tokens, view } = input;
  const isRate = measure === "prevalence";
  const kind = isRate ? "percent" : "quantity";
  const unitLabel = isRate ? "% de la population de référence Cnam" : "patients";
  const measureLabel = isRate ? "Prévalence" : "Patients";

  // Les années communes à toutes les séries : comparer sur un axe où l'une
  // manque ferait passer une absence pour une chute.
  const years = compared.length
    ? compared
      .map((item) => item.overview.annual.map((row) => row.year))
      .reduce((shared, next) => shared.filter((year) => next.includes(year)))
    : [];

  const valueOf = (row: { prevalence: number | null; patients: number | null }) =>
    (isRate ? row.prevalence : row.patients);

  const series: ChartSeries[] = compared.map((item, index) => ({
    key: item.code,
    label: item.label,
    isOther: false,
    colorIndex: index,
    values: years.map((year) => {
      const row = item.overview.annual.find((candidate) => candidate.year === year);
      return row ? valueOf(row) : null;
    }),
  }));

  const offered = PATHOLOGY_COMPARE_VIEWS.filter((item) =>
    (!item.needsAdditive || !isRate) && years.length >= (item.needsYears ?? 0));
  const chosen = offered.find((item) => item.key === view) ?? offered[0];
  const form = chosen?.form ?? "line";

  // Un camembert ne prend pas une suite d'années mais un cumul par modalité.
  const asPie = form === "pie";
  const pieSeries: ChartSeries[] = series.map((item) => ({
    ...item,
    values: [item.values.reduce<number | null>(
      (total, value) => (value === null ? total : (total ?? 0) + value), null)],
  }));

  // Une comparaison à un élément n'en est pas une : l'écran invite à en
  // ajouter une seconde au lieu d'afficher un graphique intitulé comme une
  // mise en regard.
  const enough = compared.length >= 2;

  return {
    key: "compare",
    nav: "Comparer",
    title: enough
      ? `${measureLabel} · ${compared.length} pathologies comparées`
      : "Comparer des pathologies",
    question: chosen?.question ?? "",
    caveats: [
      MASKING_NOTE,
      ...(isRate ? [DENOMINATOR_NOTE, RATE_NOTE] : []),
      `Toutes les pathologies comparées partagent le même périmètre : ${scopeLabel}.`,
      ...(years.length ? [] : ["Aucune année n’est commune aux pathologies retenues."]),
    ],
    forms: offered.map((item) => ({ key: item.key, label: item.label })),
    form: chosen?.key ?? "line",
    option: enough && years.length
      ? buildOption({
        form,
        categories: asPie ? [scopeLabel] : years,
        series: asPie ? pieSeries : series,
        kind, unitLabel, tokens,
        directLabels: form === "line" && series.length <= 6,
        xTitle: asPie ? undefined
          : (form === "rank" || form === "diverging" ? "Pathologies comparées" : "Année"),
      })
      : null,
    table: {
      columns: ["Année", ...series.map((item) => item.label)],
      rows: years.map((year, index) => [
        String(year), ...series.map((item) => formatValue(item.values[index], kind)),
      ]),
    },
    ariaLabel: `${measureLabel}, ${compared.length} pathologies comparées`,
    height: form === "rank" || form === "diverging"
      ? Math.max(430, 80 + series.length * 26)
      : 430,
    empty: !enough
      ? "Ajoutez une deuxième pathologie : une comparaison à un seul élément n’en est pas une."
      : (years.length ? null : "Aucune année commune aux pathologies retenues."),
    xTitle: "Année",
  };
}
