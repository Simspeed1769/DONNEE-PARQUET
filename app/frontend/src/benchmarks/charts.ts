/** Les deux formes du contexte de Repères — sur le modèle de `panorama/charts.ts`.
 *
 *  Un repère se lit comme un chiffre unique ; le graphique n'est qu'un
 *  contexte replié par défaut (« Voir le contexte »). Deux formes seulement,
 *  choisies en amont par le modèle de chaque source : un classement de
 *  territoires ou de causes, ou une trajectoire par millésime. Le formatage
 *  exact des valeurs reste la responsabilité de la page, qui connaît les cas
 *  particuliers (points, ratio) propres à chaque calcul proposé.
 */

import type { EChartsOption } from "../charts/EChart";
import type { ChartTokens } from "../charts/tokens";
import { soloColor } from "../charts/tokens";
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

export type RepereRow = { label: string; value: number };

export type RepereChartInput = {
  rows: RepereRow[];
  /** Formatage exact (précision complète), pour l'infobulle et l'étiquette
   *  sur la barre : une valeur unique par marque supporte l'écriture entière. */
  format: (value: number) => string;
  /** Nature de la mesure, pour l'axe seul : ses graduations, elles, ont
   *  besoin d'une écriture compacte pour rester lisibles côte à côte. */
  kind: string;
  tokens: ChartTokens;
};

/** Le classement, dans l'ordre donné par le modèle de la source — pas
 *  retrié ici. Le dernier point porte l'accent : c'est celui que la fiche
 *  met en avant, le territoire ou la cause de la lecture courante. */
export function rankOption({ rows, format, tokens }: RepereChartInput): EChartsOption {
  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      ...tooltipCommon(tokens),
      formatter: (params: any) => `<div style="font-weight:650">${rows[params.dataIndex]?.label ?? ""}</div>${format(rows[params.dataIndex]?.value ?? 0)}`,
    },
    xAxis: { type: "value", show: false },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), color: tokens.inkSecondary, width: 190, overflow: "truncate" },
    },
    series: [{
      type: "bar",
      data: rows.map((row, index) => ({
        value: row.value,
        itemStyle: {
          color: index === rows.length - 1 ? soloColor(tokens) : tokens.ramp[4],
          borderRadius: [0, 4, 4, 0] as [number, number, number, number],
        },
      })),
      barMaxWidth: 20,
      label: {
        show: true, position: "right", distance: 8,
        color: tokens.inkSecondary, fontFamily: tokens.font, fontSize: 11,
        formatter: (params: any) => format(rows[params.dataIndex]?.value ?? 0),
      },
    }],
  } as EChartsOption;
}

/** La trajectoire par millésime, une série unique. */
export function trendOption({ rows, format, kind, tokens }: RepereChartInput): EChartsOption {
  const color = soloColor(tokens);
  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 20, top: 16, bottom: 12, containLabel: true },
    tooltip: {
      trigger: "axis",
      ...tooltipCommon(tokens),
      axisPointer: { type: "line", lineStyle: { color: tokens.line, width: 1 } },
      formatter: (params: any) => {
        const point = Array.isArray(params) ? params[0] : params;
        return `<div style="font-weight:650">${point.axisValueLabel}</div>${format(rows[point.dataIndex]?.value ?? 0)}`;
      },
    },
    xAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      axisLine: { lineStyle: { color: tokens.line } },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), formatter: (value: number) => formatValue(value, kind) },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    series: [{
      id: "trend",
      type: "line",
      data: rows.map((row) => row.value),
      color,
      smooth: false,
      symbol: "circle",
      symbolSize: 7,
      lineStyle: { width: 3, color },
      itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
    }],
  } as EChartsOption;
}
