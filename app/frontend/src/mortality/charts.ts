/** Les formes de la fiche Mortalité — sur le modèle de `panorama/charts.ts`.
 *
 *  Quatre lectures, une source nationale sans région : une trajectoire par
 *  année, un classement des causes, un profil par sexe (deux points), un
 *  profil par âge (trois tranches, non fines). Aucune ne porte de taux — la
 *  source ne fournit que des effectifs bruts, jamais une population de
 *  référence pour en faire un taux de mortalité.
 */

import type { EChartsOption } from "../charts/EChart";
import type { ChartTokens } from "../charts/tokens";
import { seriesColor, soloColor } from "../charts/tokens";
import { formatValue } from "../utils";

function tooltipCommon(tokens: ChartTokens) {
  return {
    backgroundColor: tokens.surface,
    borderColor: tokens.line,
    borderWidth: 1,
    padding: [10, 12] as [number, number],
    textStyle: { color: tokens.ink, fontFamily: tokens.font, fontSize: 12 },
    extraCssText: "box-shadow: 0 8px 28px rgba(0,0,0,.14); border-radius: 10px;",
  };
}

function axisLabelStyle(tokens: ChartTokens, size = 12) {
  return { color: tokens.inkMuted, fontFamily: tokens.font, fontSize: size };
}

function readable(value: number | null | undefined, kind: string): string {
  return value === null || value === undefined ? "—" : formatValue(value, kind);
}

/* — Évolution — */

export type EvolutionInput = {
  years: number[];
  values: Array<number | null>;
  kind: string;
  tokens: ChartTokens;
};

export function evolutionOption({ years, values, kind, tokens }: EvolutionInput): EChartsOption {
  const color = soloColor(tokens);
  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 24, top: 20, bottom: 12, containLabel: true },
    tooltip: {
      trigger: "axis",
      ...tooltipCommon(tokens),
      axisPointer: { type: "line", lineStyle: { color: tokens.line, width: 1 } },
      formatter: (params: any) => {
        const point = (Array.isArray(params) ? params[0] : params);
        return `<div style="font-weight:650">${point.axisValueLabel}</div>${readable(values[point.dataIndex], kind)}`;
      },
    },
    xAxis: {
      type: "category",
      data: years.map(String),
      axisLine: { lineStyle: { color: tokens.line } },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), formatter: (value: number) => formatValue(value, kind) },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    series: [{
      id: "evolution",
      type: "line",
      data: values,
      color,
      smooth: false,
      symbol: "circle",
      symbolSize: 8,
      lineStyle: { width: 3, color },
      itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
    }],
  } as EChartsOption;
}

/* — Classement (causes) — */

export type RankedRow = { key: string; label: string; value: number | null };

export type TopCausesInput = { rows: RankedRow[]; kind: string; tokens: ChartTokens };

/** Les causes principales, la plus fréquente mise en avant.
 *
 *  Les barres sont d'une seule teinte, sauf la tête de classement qui porte
 *  l'accent : c'est la lecture que l'écran met en avant, pas une identité
 *  catégorielle à retenir barre à barre.
 */
export function topCausesOption({ rows, kind, tokens }: TopCausesInput): EChartsOption {
  const ranked = [...rows].sort((left, right) => (left.value ?? 0) - (right.value ?? 0));
  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 64, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      ...tooltipCommon(tokens),
      formatter: (params: any) => `<div style="font-weight:650">${ranked[params.dataIndex]?.label ?? ""}</div>${readable(ranked[params.dataIndex]?.value, kind)}`,
    },
    xAxis: { type: "value", show: false },
    yAxis: {
      type: "category",
      data: ranked.map((row) => row.label),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), color: tokens.inkSecondary, width: 220, overflow: "truncate" },
    },
    series: [{
      type: "bar",
      data: ranked.map((row, index) => ({
        value: row.value,
        itemStyle: {
          color: index === ranked.length - 1 ? soloColor(tokens) : tokens.ramp[4],
          borderRadius: [0, 4, 4, 0] as [number, number, number, number],
        },
      })),
      barMaxWidth: 22,
      label: {
        show: true, position: "right", distance: 8,
        color: tokens.inkSecondary, fontFamily: tokens.font, fontSize: 12,
        formatter: (params: any) => readable(ranked[params.dataIndex]?.value, kind),
      },
    }],
  } as EChartsOption;
}

/* — Profil sexe — */

/** Deux effectifs, posés en points plutôt qu'en barres : la comparaison de
 *  deux valeurs seules se lit aussi bien sur un repère ponctuel, qui laisse
 *  toute la place à l'étiquette de valeur juste à côté du point.
 */
export function sexProfileOption({ rows, kind, tokens }: TopCausesInput): EChartsOption {
  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 120, top: 24, bottom: 12, containLabel: true },
    tooltip: {
      trigger: "item",
      ...tooltipCommon(tokens),
      formatter: (params: any) => `<div style="font-weight:650">${rows[params.dataIndex]?.label ?? ""}</div>${readable(rows[params.dataIndex]?.value, kind)}`,
    },
    xAxis: {
      type: "value", min: 0,
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), formatter: (value: number) => formatValue(value, kind) },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), color: tokens.inkSecondary },
    },
    series: [{
      type: "scatter",
      symbolSize: 16,
      data: rows.map((row, index) => ({
        value: row.value,
        itemStyle: { color: seriesColor(tokens, index), borderColor: tokens.surface, borderWidth: 2 },
      })),
      label: {
        show: true, position: "right", distance: 10,
        color: tokens.inkSecondary, fontFamily: tokens.font, fontSize: 12, fontWeight: 600 as const,
        formatter: (params: any) => readable(rows[params.dataIndex]?.value, kind),
      },
    }],
  } as EChartsOption;
}

/* — Profil âge — */

/** Trois tranches non fines, dans leur ordre : une rampe séquentielle plutôt
 *  que la palette catégorielle, parce que la lecture est celle d'un gradient
 *  d'âge, pas de trois sujets indépendants.
 */
export function ageProfileOption({ rows, kind, tokens }: TopCausesInput): EChartsOption {
  const steps = [tokens.ramp[1], tokens.ramp[4], tokens.ramp[7]];
  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 96, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      ...tooltipCommon(tokens),
      formatter: (params: any) => `<div style="font-weight:650">${rows[params.dataIndex]?.label ?? ""}</div>${readable(rows[params.dataIndex]?.value, kind)}`,
    },
    xAxis: { type: "value", show: false },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), color: tokens.inkSecondary },
    },
    series: [{
      type: "bar",
      data: rows.map((row, index) => ({
        value: row.value,
        itemStyle: { color: steps[index % steps.length], borderRadius: [0, 4, 4, 0] as [number, number, number, number] },
      })),
      barMaxWidth: 26,
      label: {
        show: true, position: "right", distance: 8,
        color: tokens.inkSecondary, fontFamily: tokens.font, fontSize: 12,
        formatter: (params: any) => readable(rows[params.dataIndex]?.value, kind),
      },
    }],
  } as EChartsOption;
}
