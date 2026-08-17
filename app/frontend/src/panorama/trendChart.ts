/** La courbe observée, et son prolongement.
 *
 *  Trois traits, et chacun doit se distinguer des deux autres **sans que la
 *  couleur seule ait à le faire** :
 *
 *  - l'**observé**, en trait plein, avec ses points ;
 *  - la **prolongation**, en trait tireté et sans point — un tireté dit
 *    « construit » là où un trait plein dirait « constaté », et c'est
 *    exactement la distinction à tenir ;
 *  - la **bande**, une aire pâle sans contour, qui ne se lit pas comme une
 *    troisième courbe.
 *
 *  Une ligne verticale sépare le dernier exercice ajusté de ce qui suit. Elle
 *  porte le mot « prolongation » : c'est le seul endroit du graphique où le mot
 *  apparaît, et il ne doit jamais devenir « prévision ».
 */

import type { EChartsOption } from "echarts";
import type { ChartTokens } from "../charts/tokens";
import { formatValue } from "../utils";
import { axisLabelStyle, axisName, baseTooltip, withAlpha } from "./charts";
import type { Trend } from "./trend";

type Input = {
  years: number[];
  values: Array<number | null>;
  label: string;
  kind: string;
  trend: Trend;
  tokens: ChartTokens;
};

export function trendOption({ years, values, label, kind, trend, tokens }: Input): EChartsOption {
  // L'axe porte les années observées, puis celles qui n'existent pas encore.
  // Une année écartée de l'ajustement mais bel et bien observée — 2025 non
  // consolidée, 2020 Covid — reste à sa place : la tendance la traverse.
  const beyond = trend.points.filter((point) => point.beyond);
  const axis = [...years, ...beyond.map((point) => point.year)];
  const pad = years.length;
  const color = tokens.series[0];

  const blanks = (count: number) => Array.from({ length: count }, () => null);
  const indexOf = (year: number) => {
    const observed = years.indexOf(year);
    if (observed >= 0) return observed;
    return pad + beyond.findIndex((point) => point.year === year);
  };

  const anchorIndex = years.indexOf(trend.anchor.year);
  const projected: Array<number | null> = blanks(axis.length);
  const low: Array<number | null> = blanks(axis.length);
  const span: Array<number | null> = blanks(axis.length);

  // Le trait et la bande partent du dernier point **ajusté** : la bande y est
  // d'épaisseur nulle, ce qui montre que l'incertitude naît de là.
  if (anchorIndex >= 0) {
    projected[anchorIndex] = trend.anchor.value;
    low[anchorIndex] = trend.anchor.value;
    span[anchorIndex] = 0;
  }
  trend.points.forEach((point) => {
    const at = indexOf(point.year);
    projected[at] = point.value;
    low[at] = point.low;
    span[at] = point.high - point.low;
  });

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    grid: { left: 12, right: 24, top: 34, bottom: 12, containLabel: true },
    tooltip: {
      trigger: "axis",
      ...baseTooltip(tokens),
      formatter: (params: any) => {
        const index = params?.[0]?.dataIndex ?? 0;
        const year = axis[index];
        const point = trend.points.find((item) => item.year === year);
        const head = (suffix: string) =>
          `<div style="font-weight:650;margin-bottom:4px">${year}${suffix}</div>`;
        const band = (item: NonNullable<typeof point>) =>
          `<div style="color:${tokens.inkMuted};font-size:11px;margin-top:4px">`
          + `entre ${formatValue(item.low, kind)} et ${formatValue(item.high, kind)}</div>`;

        // Année observée : la valeur constatée prime, et la tendance vient
        // après — un exercice écarté du calcul a les deux, et l'écart entre
        // elles est justement ce qu'on veut voir.
        if (index < pad) {
          const observed = `<div>${label} · <b>${formatValue(values[index], kind)}</b></div>`;
          if (!point) return head("") + observed;
          return head("") + observed
            + `<div style="color:${tokens.inkSecondary};margin-top:4px">`
            + `Tendance · ${formatValue(point.value, kind)}</div>` + band(point)
            + `<div style="color:${tokens.inkMuted};font-size:11px">exercice écarté de l’ajustement</div>`;
        }
        if (!point) return "";
        return head(" · prolongation de tendance")
          + `<div>${formatValue(point.value, kind)}</div>` + band(point);
      },
    },
    xAxis: {
      type: "category",
      data: axis.map(String),
      ...axisName(tokens, "Année"),
      axisLine: { lineStyle: { color: tokens.line } },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens, 12), hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens, 12), formatter: (value: number) => formatValue(value, kind) },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    series: [
      // La bande, en deux séries empilées : un socle transparent jusqu'à la
      // borne basse, puis l'épaisseur de l'intervalle.
      {
        id: "bande-socle",
        type: "line",
        stack: "bande",
        data: low,
        lineStyle: { opacity: 0 },
        symbol: "none",
        silent: true,
        emphasis: { disabled: true },
        tooltip: { show: false },
      },
      {
        id: "bande",
        type: "line",
        stack: "bande",
        data: span,
        lineStyle: { opacity: 0 },
        areaStyle: { color: withAlpha(color, tokens.mode === "dark" ? 0.22 : 0.14) },
        symbol: "none",
        silent: true,
        emphasis: { disabled: true },
        tooltip: { show: false },
      },
      {
        id: "observe",
        name: label,
        type: "line",
        data: [...values, ...blanks(beyond.length)],
        color,
        smooth: false,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: 3, color },
        itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
      },
      {
        id: "prolongation",
        name: "Prolongation de tendance",
        type: "line",
        data: projected,
        color,
        smooth: false,
        symbol: "none",
        // Tireté : la forme dit « construit », et elle le dit aussi en noir et
        // blanc, à l'impression, et pour qui ne distingue pas les teintes.
        lineStyle: { width: 2.5, color, type: "dashed" as const },
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: tokens.line, type: "solid" as const, width: 1 },
          label: {
            show: true,
            position: "end" as const,
            formatter: "prolongation",
            color: tokens.inkMuted,
            fontFamily: tokens.font,
            fontSize: 11,
          },
          data: [{ xAxis: pad - 0.5 }],
        },
      },
    ] as EChartsOption["series"],
  } as EChartsOption;
}
