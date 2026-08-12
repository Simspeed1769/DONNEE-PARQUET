/** La carte choroplèthe, partagée par les bases qui ont un territoire.
 *
 *  Elle encode une magnitude simple — une part, un effectif, une prévalence —
 *  donc une rampe séquentielle, et jamais la palette divergente réservée aux
 *  indices centrés sur un pivot.
 *
 *  **Un territoire absent de `rows` prend `--map-void`**, la teinte du « pas de
 *  donnée ». C'est le point qui compte le plus ici : une région dont la valeur
 *  n'est pas publiée — masquage Cnam sous dix patients — ne doit jamais tomber
 *  au bas de la rampe, où elle se lirait comme une valeur faible. L'appelant ne
 *  passe donc que les territoires dont il a la valeur.
 */

import type { EChartsOption } from "./EChart";
import type { ChartTokens } from "./tokens";
import { FRENCH_MAP } from "./frenchMap";
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

/* — Carte — */

export type MapRow = { code: string; label: string; value: number };

export type MapInput = {
  rows: MapRow[];
  highlighted: string | null;
  kind: string;
  tokens: ChartTokens;
};

export function mapOption({ rows, highlighted, kind, tokens }: MapInput): EChartsOption {
  const values = rows.map((row) => row.value);
  const bounds: [number, number] = [Math.min(...values, 0), Math.max(...values, 0)];

  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    tooltip: {
      ...tooltipCommon(tokens),
      trigger: "item",
      formatter: (params: any) => {
        const row = rows.find((candidate) => candidate.code === params.name);
        if (!row) return `<strong>${params.name}</strong><br><span style="color:${tokens.inkMuted}">Pas de donnée sur ce périmètre</span>`;
        return `<strong>${row.label}</strong><br>${readable(row.value, kind)}`;
      },
    },
    visualMap: {
      type: "continuous",
      min: bounds[0],
      max: bounds[1],
      show: true,
      seriesIndex: 0,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 4,
      itemWidth: 14,
      itemHeight: 140,
      textGap: 10,
      textStyle: axisLabelStyle(tokens),
      text: [formatValue(bounds[1], kind), formatValue(bounds[0], kind)],
      formatter: (value: number) => formatValue(value, kind),
      inRange: { color: tokens.ramp },
    },
    series: [{
      id: "territory",
      type: "map",
      map: FRENCH_MAP,
      roam: false,
      layoutCenter: ["50%", "46%"],
      layoutSize: "94%",
      itemStyle: { areaColor: tokens.mapVoid, borderColor: tokens.surface, borderWidth: 1 },
      emphasis: {
        itemStyle: { areaColor: undefined, borderColor: tokens.ink, borderWidth: 1.5 },
        label: { show: false },
      },
      select: { disabled: true },
      label: { show: false },
      data: rows.map((row) => ({
        name: row.code,
        value: row.value,
        itemStyle: highlighted === row.code ? { borderColor: tokens.ink, borderWidth: 2.5 } : undefined,
      })),
    }],
  } as EChartsOption;
}
