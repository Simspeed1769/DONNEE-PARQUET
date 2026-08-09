/** Modèle de l'exploration DAMIR.
 *
 * Le serveur envoie des **composantes brutes** (remboursements, dépenses,
 * quantités…) par année et par modalité, accompagnées de la spécification des
 * formules. Tout le reste — indicateurs, classements, lectures — se dérive ici
 * sans requête supplémentaire. Changer d'indicateur est donc instantané.
 */

export type FormulaSpec = {
  numerator: Record<string, number>;
  denominator: Record<string, number> | null;
  factor: number;
};

export type ExploreMeasure = {
  key: string;
  label: string;
  kind: "money" | "quantity" | "percent";
  family: string;
  definition: string;
  formula: string;
  caveat: string | null;
  additive: boolean;
  unit_key: "eur_total" | "eur_per_unit" | "service_unit" | "percent";
  unit_label: string;
  unavailable_reason: string | null;
  formula_spec: FormulaSpec;
};

export type ExploreSeries = {
  key: string;
  label: string;
  is_other: boolean;
  components: Record<string, number[]>;
};

export type ExploreResponse = {
  breakdown: string;
  breakdown_label: string;
  time_axis: "care" | "payment";
  years: number[];
  components: string[];
  series: ExploreSeries[];
  total: ExploreSeries;
  bucket_count: number;
  folded_count: number;
  measures: ExploreMeasure[];
  dimensions: Array<{ key: string; label: string }>;
  warnings: string[];
};

export type Reading = "value" | "index" | "change" | "share";

export const OTHER_KEY = "__other__";

function combine(components: Record<string, number>, terms: Record<string, number>): number {
  return Object.entries(terms).reduce((total, [name, weight]) => total + (components[name] ?? 0) * weight, 0);
}

/** Évalue la spécification renvoyée par le serveur. Un ratio sans dénominateur
 *  vaut `null`, pas zéro : l'absence de donnée n'est pas une valeur nulle. */
export function evaluate(components: Record<string, number>, spec: FormulaSpec): number | null {
  const numerator = combine(components, spec.numerator);
  if (!spec.denominator) return spec.factor * numerator;
  const denominator = combine(components, spec.denominator);
  if (!denominator) return null;
  return (spec.factor * numerator) / denominator;
}

function cellAt(series: ExploreSeries, index: number, names: string[]): Record<string, number> {
  const cell: Record<string, number> = {};
  names.forEach((name) => { cell[name] = series.components[name]?.[index] ?? 0; });
  return cell;
}

function sumCells(series: ExploreSeries, names: string[]): Record<string, number> {
  const total: Record<string, number> = {};
  names.forEach((name) => {
    total[name] = (series.components[name] ?? []).reduce((sum, value) => sum + value, 0);
  });
  return total;
}

/** Valeurs annuelles d'une modalité pour un indicateur donné. */
export function valuesOf(series: ExploreSeries, measure: ExploreMeasure,
                         components: string[], yearCount: number): Array<number | null> {
  return Array.from({ length: yearCount }, (_, index) =>
    evaluate(cellAt(series, index, components), measure.formula_spec));
}

/** Valeur agrégée sur toute la période. Les composantes sont additionnées
 *  **avant** l'application de la formule : c'est ce qui rend le cumul correct
 *  y compris pour un taux ou une moyenne, qu'on ne peut pas sommer. */
export function periodValueOf(series: ExploreSeries, measure: ExploreMeasure,
                              components: string[]): number | null {
  return evaluate(sumCells(series, components), measure.formula_spec);
}

function addInto(target: Record<string, number[]>, source: Record<string, number[]>,
                 names: string[], length: number): void {
  names.forEach((name) => {
    const existing = target[name] ?? Array.from({ length }, () => 0);
    const incoming = source[name] ?? [];
    target[name] = existing.map((value, index) => value + (incoming[index] ?? 0));
  });
}

/** Modalités classées par poids selon l'indicateur affiché. Sert à proposer une
 *  sélection par défaut, jamais à l'imposer. */
export function rankedKeys(response: ExploreResponse, measure: ExploreMeasure): string[] {
  return [...response.series]
    .filter((series) => !series.is_other)
    .sort((left, right) =>
      Math.abs(periodValueOf(right, measure, response.components) ?? 0)
      - Math.abs(periodValueOf(left, measure, response.components) ?? 0))
    .map((series) => series.key);
}

/** Séries à tracer : celles que l'utilisateur a choisies, dans son ordre, plus
 *  le repli « Autres » s'il le demande.
 *
 *  C'est ici que se joue la maîtrise de l'écran : le graphique montre une liste
 *  explicite, et non les N premières décidées à sa place. Le repli additionne
 *  les composantes de tout le reste, si bien que les totaux et les moyennes
 *  restent exacts quelle que soit la sélection.
 */
export function selectSeries(response: ExploreResponse, selection: string[],
                             showOther: boolean): ExploreSeries[] {
  const byKey = new Map(response.series.map((series) => [series.key, series]));
  const chosen = selection
    .map((key) => byKey.get(key))
    .filter((series): series is ExploreSeries => Boolean(series) && !series!.is_other);

  if (!showOther) return chosen;

  const picked = new Set(chosen.map((series) => series.key));
  const rest = response.series.filter((series) => !picked.has(series.key));
  if (!rest.length) return chosen;

  const merged: Record<string, number[]> = {};
  rest.forEach((series) =>
    addInto(merged, series.components, response.components, response.years.length));
  return [...chosen, { key: OTHER_KEY, label: "Autres", is_other: true, components: merged }];
}

/** Applique la lecture choisie à une suite de valeurs annuelles. */
export function applyReading(values: Array<number | null>, reading: Reading,
                             totals: Array<number | null>): Array<number | null> {
  if (reading === "value") return values;
  if (reading === "index") {
    const base = values.find((value) => value !== null && value !== 0);
    if (base === undefined || base === null) return values.map(() => null);
    return values.map((value) => (value === null ? null : (100 * value) / base));
  }
  if (reading === "change") {
    return values.map((value, index) => {
      const previous = values[index - 1];
      if (index === 0 || value === null || previous === null || !previous) return null;
      return (100 * (value - previous)) / Math.abs(previous);
    });
  }
  return values.map((value, index) => {
    const total = totals[index];
    if (value === null || total === null || !total) return null;
    return (100 * value) / total;
  });
}

/** Attribue à chaque modalité un emplacement de couleur **qui lui reste
 *  attaché**. Retirer une série de la sélection ne doit pas repeindre les
 *  autres : la couleur désigne une entité, jamais un rang. Le souvenir des
 *  attributions passées est fourni par l'appelant et enrichi ici, de sorte
 *  qu'une modalité retirée puis remise retrouve sa teinte.
 */
export function assignColorSlots(selection: string[], memory: Map<string, number>,
                                 slotCount: number): Map<string, number> {
  const slots = new Map<string, number>();
  const used = new Set<number>();

  selection.forEach((key) => {
    const remembered = memory.get(key);
    if (remembered !== undefined && !used.has(remembered)) {
      slots.set(key, remembered);
      used.add(remembered);
    }
  });

  selection.forEach((key) => {
    if (slots.has(key)) return;
    let slot = 0;
    while (used.has(slot) && slot < slotCount) slot += 1;
    // Au-delà des emplacements disponibles on réutilise le début de la palette
    // plutôt que d'inventer une teinte : le sélecteur borne déjà la sélection.
    const chosen = slot % slotCount;
    slots.set(key, chosen);
    used.add(chosen);
    memory.set(key, chosen);
  });

  return slots;
}

export const READING_KIND: Record<Reading, "money" | "quantity" | "percent" | "index"> = {
  value: "money",
  index: "index",
  change: "percent",
  share: "percent",
};

export function readingKind(reading: Reading, measure: ExploreMeasure): string {
  return reading === "value" ? measure.kind : READING_KIND[reading];
}

export function readingUnitLabel(reading: Reading, measure: ExploreMeasure): string {
  if (reading === "value") return measure.unit_label;
  if (reading === "index") return "base 100";
  if (reading === "change") return "% par an";
  return "% du total";
}
