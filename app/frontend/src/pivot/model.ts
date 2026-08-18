/** Modèle du tableau croisé.
 *
 *  Le serveur envoie, par cellule, trois paquets de **composantes brutes** — la
 *  période entière, la première année, la dernière — plus la spécification des
 *  formules. Les six agrégations et les douze mesures se dérivent ici, sans
 *  requête : changer de mesure ou d'agrégation est instantané, exactement comme
 *  sur les autres écrans.
 */

import { evaluate, type ExploreMeasure } from "../explore/model";

export type Bundle = Record<string, number>;
export type CellBundles = { period: Bundle; first: Bundle; last: Bundle };

export type PivotCell = CellBundles & { row: string; column: string };
export type PivotAxisKey = { key: string; label: string };

export type PivotResponse = {
  rows: string;
  rows_label: string;
  columns: string;
  columns_label: string;
  row_keys: PivotAxisKey[];
  column_keys: PivotAxisKey[];
  cells: PivotCell[];
  row_totals: Array<CellBundles & { row: string }>;
  column_totals: Array<CellBundles & { column: string }>;
  total: CellBundles;
  first_year: number;
  last_year: number;
  years: number[];
  components: string[];
  measures: ExploreMeasure[];
  dimensions: PivotAxisKey[];
  warnings: string[];
};

/** Les six calculs de l'ancien écran « Repères », devenus un seul menu.
 *
 *  Ils s'appliquaient là à un chiffre unique ; ici ils s'appliquent à chaque
 *  cellule, ce qui est le même calcul rendu comparable.
 */
export type Aggregation = "last" | "period" | "average_unit" | "change" | "cagr" | "share";

export const AGGREGATIONS: Array<{ key: Aggregation; label: string; hint: string }> = [
  { key: "last", label: "Dernière année", hint: "La valeur du dernier exercice de la période." },
  { key: "period", label: "Cumul de la période", hint: "Les composantes sont sommées avant la formule." },
  { key: "average_unit", label: "Moyenne par an", hint: "Le cumul rapporté au nombre d’années." },
  { key: "change", label: "Variation", hint: "Écart en % entre la première et la dernière année." },
  { key: "cagr", label: "Taux de croissance annuel moyen", hint: "Croissance annualisée sur la période." },
  { key: "share", label: "Part du total", hint: "Le poids de la cellule dans le total général." },
];


/** Les agrégations que ce croisement autorise.
 *
 *  **Variation et TCAM comparent la première année à la dernière, cellule par
 *  cellule.** Quand l'un des deux axes *est* l'année, chaque cellule ne porte
 *  qu'une seule année : elle se comparerait à elle-même, et le tableau se
 *  remplirait de tirets sans que rien ne dise pourquoi. Ces deux agrégations
 *  ne sont donc pas offertes dans ce cas — pas grisées, absentes, comme
 *  partout ailleurs dans le produit.
 */
export function offeredAggregations(response: PivotResponse | null): typeof AGGREGATIONS {
  const onTimeAxis = response?.rows === "year" || response?.columns === "year";
  return onTimeAxis
    ? AGGREGATIONS.filter((item) => item.key !== "change" && item.key !== "cagr")
    : AGGREGATIONS;
}

/** La raison, en français, pour laquelle deux agrégations manquent à l'appel.
 *  `null` quand elles sont toutes là. */
export function aggregationNote(response: PivotResponse | null): string | null {
  const onTimeAxis = response?.rows === "year" || response?.columns === "year";
  if (!onTimeAxis) return null;
  return "L’année est déjà l’un des axes : « Variation » et « Taux de croissance annuel moyen » "
    + "compareraient chaque cellule à elle-même. Mettez l’année en ligne ou en colonne, "
    + "et l’autre dimension sur l’axe opposé, pour les retrouver.";
}

/** Une agrégation qui produit un pourcentage ne se lit pas dans l'unité de la
 *  mesure : le tableau doit le savoir pour formater et pour teinter. */
export function isRatio(aggregation: Aggregation): boolean {
  return aggregation === "change" || aggregation === "cagr" || aggregation === "share";
}

/** Nombre d'années **effectivement couvertes**, bornes comprises.
 *
 *  Sert de dénominateur à la moyenne annuelle et d'exposant au TCAM. Une seule
 *  année donne un intervalle nul : le TCAM n'a alors pas de sens, et la
 *  fonction renvoie `null` plutôt qu'une division par zéro déguisée. */
function span(response: PivotResponse): number {
  return response.last_year - response.first_year;
}

/** La valeur d'une cellule pour une mesure et une agrégation données.
 *
 *  `null` partout où le calcul n'a pas de sens — pas zéro. Un taux sans
 *  dénominateur, une variation depuis zéro, un TCAM sur une seule année : ce
 *  sont des absences, et le tableau les montre comme telles.
 */
export function cellValue(
  bundles: CellBundles, measure: ExploreMeasure, aggregation: Aggregation,
  response: PivotResponse, grandTotal: number | null,
): number | null {
  const at = (bundle: Bundle) => evaluate(bundle, measure.formula_spec);

  if (aggregation === "last") return at(bundles.last);
  if (aggregation === "period") return at(bundles.period);

  if (aggregation === "average_unit") {
    const cumulative = at(bundles.period);
    const years = response.years.length;
    if (cumulative === null || years === 0) return null;
    // Une mesure non additive est déjà une moyenne pondérée sur la période :
    // la diviser par le nombre d'années donnerait un chiffre qui ne désigne
    // rien. On la rend telle quelle.
    return measure.additive ? cumulative / years : cumulative;
  }

  if (aggregation === "change" || aggregation === "cagr") {
    const from = at(bundles.first);
    const to = at(bundles.last);
    if (from === null || to === null || from === 0) return null;
    // Une base négative rend le rapport ininterprétable : une « hausse » de
    // −100 à −50 n'est pas +50 %. Mieux vaut ne rien dire.
    if (from < 0) return null;
    if (aggregation === "change") return ((to - from) / from) * 100;
    const years = span(response);
    if (years <= 0 || to <= 0) return null;
    return ((to / from) ** (1 / years) - 1) * 100;
  }

  // share
  const value = at(bundles.period);
  if (value === null || grandTotal === null || grandTotal === 0) return null;
  return (value / grandTotal) * 100;
}

/** Le total général pour la mesure courante, qui sert de base à « Part du
 *  total ». Calculé une fois et passé à chaque cellule. */
export function grandTotalOf(response: PivotResponse, measure: ExploreMeasure): number | null {
  return evaluate(response.total.period, measure.formula_spec);
}

export type PivotTable = {
  rowKeys: PivotAxisKey[];
  columnKeys: PivotAxisKey[];
  /** `values[rowKey][columnKey]`, avec `null` pour une cellule sans donnée —
   *  distinct d'une cellule à zéro. */
  values: Map<string, Map<string, number | null>>;
  rowTotals: Map<string, number | null>;
  columnTotals: Map<string, number | null>;
  total: number | null;
  /** Les extrêmes des cellules. Les totaux en sont exclus : ils écraseraient
   *  l'échelle et toutes les cellules paraîtraient pâles. */
  min: number | null;
  max: number | null;
  /** Toutes les valeurs de cellule, triées. C'est **la distribution réelle**,
   *  et c'est sur elle que se calcule la teinte — pas sur l'étendue brute.
   *
   *  Sur une étendue brute, un poste à 22 Md € et quinze postes sous 1 Md €
   *  donnaient quinze cellules dans la même marche : la couleur ne distinguait
   *  plus rien. Sur les rangs, chaque marche reçoit la même part de cellules. */
  sorted: number[];
};

export type SortState = { column: string | null; direction: "asc" | "desc" };

/** Compose le tableau affichable : valeurs, totaux, extrêmes, ordre des lignes. */
export function buildTable(
  response: PivotResponse, measure: ExploreMeasure,
  aggregation: Aggregation, sort: SortState,
): PivotTable {
  const grand = grandTotalOf(response, measure);
  const compute = (bundles: CellBundles) => cellValue(bundles, measure, aggregation, response, grand);

  const values = new Map<string, Map<string, number | null>>();
  for (const cell of response.cells) {
    if (!values.has(cell.row)) values.set(cell.row, new Map());
    values.get(cell.row)!.set(cell.column, compute(cell));
  }

  const rowTotals = new Map(response.row_totals.map((item) => [item.row, compute(item)]));
  const columnTotals = new Map(response.column_totals.map((item) => [item.column, compute(item)]));

  const flat: number[] = [];
  for (const row of values.values()) {
    for (const value of row.values()) {
      if (value !== null) flat.push(value);
    }
  }
  const sorted = [...flat].sort((left, right) => left - right);
  const min = sorted.length ? sorted[0] : null;
  const max = sorted.length ? sorted[sorted.length - 1] : null;

  // Tri : sur une colonne, sur le total, ou l'ordre naturel de l'axe.
  const rowKeys = [...response.row_keys];
  if (sort.column) {
    const keyOf = (key: string): number | null =>
      sort.column === TOTAL_COLUMN ? rowTotals.get(key) ?? null : values.get(key)?.get(sort.column!) ?? null;
    rowKeys.sort((a, b) => {
      const left = keyOf(a.key);
      const right = keyOf(b.key);
      // Une cellule sans valeur va toujours en fin de tri, dans les deux sens :
      // une absence n'est ni la plus grande ni la plus petite des valeurs.
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return sort.direction === "asc" ? left - right : right - left;
    });
  }

  return {
    rowKeys,
    columnKeys: response.column_keys,
    values,
    rowTotals,
    columnTotals,
    total: compute(response.total),
    min,
    max,
    sorted,
  };
}

/** La clé réservée à la colonne « Total », qui n'est pas une modalité. */
export const TOTAL_COLUMN = "__total__";

/** Nombre de marches de teinte. Cinq, et pas huit : au-delà, deux marches
 *  voisines ne se distinguent plus, et la teinte cesse de servir à quelque
 *  chose tout en fatiguant l'œil. */
export const TINT_STEPS = 5;

/** Marche de teinte d'une valeur, de 1 à `TINT_STEPS` — `null` si aucune.
 *
 *  Calculée sur le **rang** dans la distribution et non sur l'étendue brute :
 *  chaque marche reçoit ainsi la même part de cellules, et une valeur extrême
 *  ne pousse plus tout le reste dans la même teinte.
 *
 *  `null` quand la valeur est absente ou que toutes se valent — une cellule
 *  sans teinte est plus honnête qu'un milieu de rampe arbitraire.
 */
export function tintStep(value: number | null, sorted: number[]): number | null {
  if (value === null || sorted.length < 2) return null;
  if (sorted[0] === sorted[sorted.length - 1]) return null;
  // Rang du premier élément égal : deux cellules de même valeur reçoivent la
  // même marche, ce qu'une recherche du dernier rang ne garantirait pas.
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }
  const quantile = low / (sorted.length - 1);
  return Math.min(TINT_STEPS, Math.floor(quantile * TINT_STEPS) + 1);
}
