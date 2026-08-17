/** Les lectures Territoire, Âge et Sexe du Panorama.
 *
 *  Séparées de la lecture Évolution au point 2.4, sans changement de rendu.
 *  Le socle commun — infobulles, noms d'axe, bornes symétriques, teinte — reste
 *  dans `charts.ts` et s'importe d'ici.
 */

import type { EChartsOption } from "../charts/EChart";
import type { ChartTokens } from "../charts/tokens";
import { paletteColor, seriesColor } from "../charts/tokens";
import { FRENCH_MAP } from "../charts/frenchMap";
import { formatValue, scaleFor } from "../utils";
import type { MapReading } from "./model";
import {
  AXIS_NAME_GAP,
  axisLabelStyle,
  axisName,
  baseTooltip,
  categoryTooltip,
  formatIndex,
  readable,
  symmetricBounds,
  withAlpha,
  type ChartRow,
  type TerritoryInput,
} from "./charts";

export function territoryOption({
  reading, labels, tokens, kind, highlighted,
}: TerritoryInput): EChartsOption {
  const entries = [...reading.values.entries()].filter(([, value]) => value !== null);
  const numeric = entries.map(([, value]) => value);
  const center = reading.center;
  const bounds = center !== null
    ? symmetricBounds(numeric, center)
    : [
      Math.min(...numeric.filter((value): value is number => value !== null), 0),
      Math.max(...numeric.filter((value): value is number => value !== null), 0),
    ] as [number, number];

  const palette = center !== null ? tokens.diverge : tokens.ramp;
  const show = (value: number) =>
    reading.kind === "index" ? formatIndex(value) : formatValue(value, kind);

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    tooltip: {
      ...baseTooltip(tokens),
      trigger: "item",
      formatter: (params: any) => {
        const label = labels.get(params.name) ?? params.name;
        if (params.value === undefined || params.value === null || Number.isNaN(params.value)) {
          return `<strong>${label}</strong><br><span style="color:${tokens.inkMuted}">Pas de donnée sur ce périmètre</span>`;
        }
        return `<strong>${label}</strong><br>${show(params.value)}`
          + (reading.kind === "index"
            ? `<br><span style="color:${tokens.inkMuted}">100 = le territoire recourt à hauteur de son poids</span>`
            : "");
      },
    },
    // L'échelle est posée assez haut pour que ses deux bornes chiffrées tiennent
    // dans le canevas : collée au bord, elle perdait ses étiquettes et ne disait
    // plus que « plus foncé ici ».
    visualMap: {
      type: "continuous",
      min: bounds[0],
      max: bounds[1],
      show: true,
      seriesIndex: 0,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 8,
      itemWidth: 14,
      itemHeight: 160,
      textGap: 10,
      textStyle: axisLabelStyle(tokens, 12),
      // `text[0]` est la borne haute.
      text: [show(bounds[1]), show(bounds[0])],
      formatter: (value: number) => show(value),
      inRange: { color: palette },
    },
    series: [{
      id: "territory",
      type: "map" as const,
      map: FRENCH_MAP,
      roam: false,
      // Cadrage explicite : `layoutSize` en pourcentage se rapporte au côté le
      // plus court, donc à la hauteur. La carte garde son rapport d'aspect au
      // lieu d'être étirée à la largeur du panneau.
      layoutCenter: ["50%", "46%"],
      layoutSize: "92%",
      // Le fond porte la Corse, que le cube DAMIR ne renseigne pas : elle reste
      // dessinée mais sans couleur, faute de quoi son absence passerait pour
      // une valeur nulle.
      itemStyle: {
        areaColor: tokens.mapVoid,
        borderColor: tokens.surface,
        borderWidth: 1,
      },
      emphasis: {
        itemStyle: { areaColor: undefined, borderColor: tokens.ink, borderWidth: 1.5 },
        label: { show: false },
      },
      select: { disabled: true },
      label: { show: false },
      data: entries.map(([key, value]) => ({
        name: key,
        value: value as number,
        itemStyle: highlighted === key
          ? { borderColor: tokens.ink, borderWidth: 2.5 }
          : undefined,
      })),
    }],
  } as EChartsOption;
}

/** Le même territoire, en classement.
 *
 *  La carte montre *où*, le classement montre *combien* — et permet de lire
 *  l'écart entre deux régions, ce qu'un dégradé ne donne jamais. Les barres
 *  sont **d'une seule teinte** : leur longueur porte déjà la grandeur, et la
 *  recolorer par valeur brûlerait le seul canal libre pour redire la même
 *  chose.
 */
export function territoryRankOption({
  reading, labels, tokens, kind, highlighted,
}: TerritoryInput): EChartsOption {
  const ranked = [...reading.values.entries()]
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .sort((left, right) => right[1] - left[1]);
  const show = (value: number) =>
    reading.kind === "index" ? formatIndex(value) : formatValue(value, kind);

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    tooltip: {
      ...baseTooltip(tokens),
      trigger: "item",
      formatter: (params: any) =>
        `<strong>${labels.get(ranked[params.dataIndex]?.[0]) ?? params.name}</strong><br>`
        + show(params.value),
    },
    grid: { left: 12, right: 96, top: 24, bottom: 8, containLabel: true },
    xAxis: {
      type: "value",
      show: false,
      max: reading.kind === "index" ? undefined : "dataMax",
    },
    yAxis: {
      type: "category",
      data: ranked.map(([key]) => labels.get(key) ?? key),
      inverse: true,
      ...axisName(tokens, "Région", true),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        ...axisLabelStyle(tokens, 12),
        color: tokens.inkSecondary,
        width: 190,
        overflow: "truncate",
      },
    },
    series: [{
      // `id` stable : c'est la clé que `withMorphing` donne à
      // `universalTransition`. Sans elle, ECharts rapproche les séries par
      // position et la transition depuis une autre forme part de travers.
      id: "territory",
      type: "bar" as const,
      data: ranked.map(([key, value]) => ({
        value,
        name: key,
        itemStyle: {
          // Le pivot de la rampe : une teinte pleine, qui tient le contraste
          // dans les deux thèmes et à la taille d'une projection.
          color: tokens.ramp[4],
          borderRadius: [0, 4, 4, 0] as [number, number, number, number],
          ...(highlighted === key ? { borderColor: tokens.ink, borderWidth: 1.5 } : {}),
        },
      })),
      barMaxWidth: 18,
      label: {
        show: true,
        position: "right" as const,
        distance: 8,
        color: tokens.inkSecondary,
        fontFamily: tokens.font,
        fontSize: 12,
        fontWeight: 600 as const,
        formatter: (params: any) => show(params.value),
      },
    }],
  } as EChartsOption;
}

/* — 3. Âge — */

export type AgeForm = "bar" | "hbar" | "line";

export type AgeInput = {
  /** Tranches dans leur ordre naturel. « Âge inconnu » n'y figure pas : une
   *  modalité non ordinale sur une échelle ordinale invente une pente. */
  order: Array<{ key: string; label: string }>;
  rows: ChartRow[];
  tokens: ChartTokens;
  /** Unité des valeurs : une part du sujet, ou la mesure elle-même. */
  kind: string;
  form: AgeForm;
};

/** Une distribution sur des tranches ordonnées.
 *
 *  Des colonnes disent ce qui est mesuré : une part par tranche. La courbe
 *  rend la comparaison de plusieurs sujets plus lisible qu'un peloton de
 *  barres. Les barres horizontales rendent leurs libellés — « 80 ans et plus »
 *  — lisibles sans les incliner.
 */
export function ageOption({ order, rows, tokens, kind, form }: AgeInput): EChartsOption {
  const single = rows.length === 1;
  const horizontal = form === "hbar";
  const asLine = form === "line";
  const categories = order.map((bucket) => bucket.label);

  const series = rows.map((row) => {
    const color = paletteColor(tokens, row.colorIndex, rows.length);
    if (asLine) {
      return {
        id: row.key,
        name: row.label,
        type: "line" as const,
        data: row.values,
        color,
        smooth: false,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: 2.25, color },
        itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
        emphasis: { focus: "series" as const },
        areaStyle: single ? {
          color: {
            type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(color, tokens.mode === "dark" ? 0.3 : 0.18) },
              { offset: 1, color: withAlpha(color, 0) },
            ],
          },
        } : undefined,
      };
    }
    return {
      id: row.key,
      name: row.label,
      type: "bar" as const,
      data: horizontal ? [...row.values].reverse() : row.values,
      color,
      barMaxWidth: single ? (horizontal ? 20 : 58) : 24,
      itemStyle: {
        color,
        borderRadius: (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) as [number, number, number, number],
      },
      emphasis: { focus: "series" as const },
      // Un seul sujet en barres horizontales : la place est là, la valeur s'y
      // écrit et le graphique se lit sans survol.
      label: single && horizontal ? {
        show: true,
        position: "right" as const,
        distance: 8,
        color: tokens.inkSecondary,
        fontFamily: tokens.font,
        fontSize: 12,
        fontWeight: 600 as const,
        formatter: (params: any) => formatValue(params.value, kind),
      } : { show: false },
    };
  });

  const valueAxis = {
    type: "value" as const,
    name: kind === "percent" ? "% du sujet" : "",
    nameTextStyle: { ...axisLabelStyle(tokens, 11), align: "left" as const },
    nameGap: 14,
    min: 0,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      ...axisLabelStyle(tokens, 12),
      formatter: (value: number) => formatValue(value, kind),
    },
    splitLine: { lineStyle: { color: tokens.grid } },
  };

  const categoryAxis = {
    type: "category" as const,
    data: horizontal ? [...categories].reverse() : categories,
    ...axisName(tokens, "Tranche d’âge", horizontal),
    axisLine: { lineStyle: { color: tokens.line } },
    axisTick: { show: false },
    axisLabel: { ...axisLabelStyle(tokens, 12), interval: 0, hideOverlap: true },
    splitLine: { show: false },
  };

  const rowsForTooltip: ChartRow[] = horizontal
    ? rows.map((row) => ({ ...row, values: [...row.values].reverse() }))
    : rows;

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    grid: horizontal
      ? { left: 12, right: single ? 84 : 24, top: 30, bottom: 12, containLabel: true }
      : { left: 12, right: 20, top: 34, bottom: AXIS_NAME_GAP, containLabel: true },
    tooltip: categoryTooltip(rowsForTooltip, kind, tokens, asLine ? "line" : "shadow"),
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: series as EChartsOption["series"],
  } as EChartsOption;
}

/* — 4. Sexe, plusieurs sujets — */

/** Comparaison de sujets sur une seule modalité de sexe.
 *
 *  Empiler huit prestations sur dix ans donnerait quatre-vingts colonnes. La
 *  question devient alors « laquelle penche le plus », à laquelle un
 *  classement répond mieux qu'une pile.
 */
export function sexCompareOption({
  rows, tokens, modalityLabel, axisTitle,
}: { rows: ChartRow[]; tokens: ChartTokens; modalityLabel: string;
     axisTitle: string }): EChartsOption {
  const ranked = [...rows].sort((left, right) => (right.values[0] ?? 0) - (left.values[0] ?? 0));

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    grid: { left: 12, right: 72, top: 26, bottom: 12, containLabel: true },
    tooltip: {
      trigger: "item",
      ...baseTooltip(tokens),
      formatter: (params: any) =>
        `<strong>${ranked[params.dataIndex]?.label ?? ""}</strong><br>`
        + `${formatValue(params.value, "percent")} · ${modalityLabel}`,
    },
    xAxis: {
      type: "value",
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens, 12), formatter: (value: number) => formatValue(value, "percent") },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    yAxis: {
      type: "category",
      data: ranked.map((row) => row.label),
      inverse: true,
      ...axisName(tokens, axisTitle, true),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { ...axisLabelStyle(tokens, 12), color: tokens.inkSecondary, width: 200, overflow: "truncate" },
    },
    series: [{
      id: "sex-compare",
      type: "bar" as const,
      data: ranked.map((row) => ({
        value: row.values[0],
        itemStyle: {
          color: seriesColor(tokens, row.colorIndex),
          borderRadius: [0, 4, 4, 0] as [number, number, number, number],
        },
      })),
      barMaxWidth: 22,
      label: {
        show: true,
        position: "right" as const,
        distance: 8,
        color: tokens.inkSecondary,
        fontFamily: tokens.font,
        fontSize: 12,
        fontWeight: 600 as const,
        formatter: (params: any) => formatValue(params.value, "percent"),
      },
      markLine: {
        silent: true,
        symbol: "none" as const,
        lineStyle: { color: tokens.ink, type: "dashed" as const, width: 1.25, opacity: 0.5 },
        label: { show: true, position: "end" as const, formatter: "50 %", color: tokens.inkMuted, fontFamily: tokens.font, fontSize: 11 },
        data: [{ xAxis: 50 }],
      },
    }],
  } as EChartsOption;
}
