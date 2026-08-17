/** Le répartiteur : une lecture typée entre, une option ECharts sort.
 *
 *  Aucune option n'est fabriquée dans du JSX. Ce fichier reçoit
 *  `{ form, categories, series, kind, unitLabel, tokens, … }` et rend une
 *  `EChartsOption` — fonction pure, testable de tête.
 *
 *  Il garde les formes du quotidien (courbe, aire, barres, empilé, part) et le
 *  camembert ; les six formes spécialisées vivent dans `chartForms.ts`, le
 *  socle partagé dans `chartBase.ts`.
 */

import type { EChartsOption } from "echarts";
import { paletteColor, seriesColor, type ChartTokens } from "./tokens";
import { formatValue } from "../utils";
import {
  AXIS_NAME_GAP,
  END_LABEL_WIDTH,
  HTML_LEGEND,
  MARK_GAP,
  VALUE_NAME_TOP,
  axisCommon,
  axisName,
  readable,
  scaleOf,
  tooltipCommon,
  verticalAxisName,
  type ChartInput,
} from "./chartBase";
import {
  divergingOption,
  heatmapOption,
  pyramidOption,
  rankOption,
  slopeOption,
  waterfallOption,
} from "./chartForms";

/* Les types restent exportés d'ici : une trentaine de fichiers les importent
   de `buildOption`, et les faire déménager n'apprendrait rien à personne. */
export type { ChartForm, ChartInput, ChartSeries } from "./chartBase";

export function buildOption(input: ChartInput): EChartsOption {
  const { tokens, form } = input;
  const scale = scaleOf(input);
  const scaled = (value: number | null) => (value === null ? null : value / scale.divisor);

  // Le camembert ne prend pas une suite d'années mais une valeur cumulée par
  // modalité : l'appelant l'obtient de son modèle et appelle `pieOption` lui-
  // même. On le reçoit ici avec une seule catégorie, où `values[0]` porte déjà
  // ce cumul.
  if (form === "pie") {
    return pieOption({
      slices: input.series.map((item) => ({
        key: item.key, label: item.label, colorIndex: item.colorIndex, value: item.values[0] ?? null,
      })),
      tokens,
      kind: input.kind,
      centerLabel: String(input.categories[0] ?? input.unitLabel),
    });
  }
  if (form === "rank") return rankOption(input, scale, scaled);
  if (form === "waterfall") return waterfallOption(input, scale, scaled);
  if (form === "slope") return slopeOption(input, scale, scaled);
  if (form === "diverging") return divergingOption(input, scale, scaled);
  if (form === "heatmap") return heatmapOption(input);
  if (form === "pyramid") return pyramidOption(input, scale, scaled);

  // L'aire empilée à 100 % partage toute sa mécanique avec la pile à 100 % : ce
  // qui change est le remplissage continu, qui donne à voir une composition qui
  // se déforme d'une année à l'autre plutôt qu'une suite de compositions.
  const stacked = form === "area" || form === "stack" || form === "share" || form === "shareArea";
  const asBar = form === "bar" || form === "stack" || form === "share";
  // Une série unique en barres laisse la place d'écrire chaque valeur au-dessus
  // de sa colonne. C'est ce qui rend une comparaison de deux années lisible
  // sans survol — et donc lisible une fois projetée.
  const barValueLabels = asBar && !stacked && input.series.length === 1;

  const series = input.series.map((item) => {
    const color = paletteColor(tokens, item.colorIndex, input.series.length, item.isOther);
    const base = {
      id: item.key,
      name: item.label,
      data: item.values.map(scaled),
      color,
      emphasis: { focus: "series" as const },
    };
    if (asBar) {
      return {
        ...base,
        type: "bar" as const,
        stack: stacked ? "total" : undefined,
        barMaxWidth: 42,
        // 4px d'arrondi en bout de donnée, et 2px de surface entre les
        // remplissages : la séparation se fait par le vide, pas par un contour.
        itemStyle: {
          color,
          borderRadius: stacked ? 0 : [4, 4, 0, 0] as [number, number, number, number],
          borderColor: tokens.surface,
          borderWidth: stacked ? MARK_GAP : 0,
        },
        label: barValueLabels ? {
          show: true,
          position: "top" as const,
          distance: 8,
          color: tokens.inkSecondary,
          fontSize: 12,
          fontWeight: 600 as const,
          fontFamily: tokens.font,
          formatter: (params: any) => readable(item.values[params.dataIndex] ?? null, input.kind),
        } : { show: false },
        labelLayout: barValueLabels ? { hideOverlap: true } : undefined,
      };
    }
    return {
      ...base,
      type: "line" as const,
      stack: stacked ? "total" : undefined,
      smooth: false,
      // Une marque à chaque point sur cinquante-deux années donnait un
      // pointillé : les marques s'espacent, la courbe passe toujours par toutes
      // les valeurs et l'infobulle les donne toutes.
      symbol: input.markers
        ? ((_value: unknown, params: any) => (input.markers!.has(params.dataIndex) ? "circle" : "none"))
        : "circle",
      symbolSize: 8,
      lineStyle: { width: 2, color },
      itemStyle: { color, borderColor: tokens.surface, borderWidth: MARK_GAP },
      areaStyle: stacked ? { color, opacity: tokens.mode === "dark" ? 0.32 : 0.2 } : undefined,
      endLabel: input.directLabels ? {
        show: true,
        formatter: () => item.label,
        color: tokens.inkSecondary,
        fontSize: 11,
        fontFamily: tokens.font,
        distance: 8,
        // L'étiquette tient dans la marge qui lui est réservée, ou elle est
        // coupée par un « … » qui le dit. Sans cette borne, un libellé long
        // sortait du canevas — « Cadres et professions intellec ».
        width: END_LABEL_WIDTH,
        overflow: "truncate",
      } : { show: false },
      // Deux courbes qui finissent au même niveau posaient leurs noms l'un sur
      // l'autre. La légende HTML porte l'identité de toutes les séries ; celle
      // qui ne peut pas s'écrire sans en recouvrir une autre s'efface.
      labelLayout: input.directLabels ? { hideOverlap: true } : undefined,
    };
  });

  return {
    animationDuration: 380,
    grid: {
      left: 8, right: input.directLabels ? 132 : 16, top: VALUE_NAME_TOP,
      // `containLabel` ne tient pas compte du nom de l'axe : sans cette marge,
      // le titre se poserait sous le bord du graphique.
      bottom: input.xTitle ? AXIS_NAME_GAP : 8,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      ...tooltipCommon(tokens),
      axisPointer: { type: "line", lineStyle: { color: tokens.line, width: 1 } },
      formatter: (params: any) => {
        const rows = (Array.isArray(params) ? params : [params]);
        const head = `<div style="font-weight:650;margin-bottom:6px">${rows[0]?.axisValueLabel ?? ""}</div>`;
        const body = rows.map((row: any) => {
          const raw = input.series.find((item) => item.label === row.seriesName)?.values[row.dataIndex] ?? null;
          return `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">
            <span style="width:8px;height:8px;border-radius:50%;background:${row.color};flex:0 0 auto"></span>
            <span style="flex:1;color:${tokens.inkSecondary}">${row.seriesName}</span>
            <b style="font-variant-numeric:tabular-nums">${readable(raw, input.kind)}</b></div>`;
        }).join("");
        return head + body;
      },
    },
    legend: HTML_LEGEND,
    xAxis: {
      type: "category",
      data: input.categories,
      boundaryGap: asBar,
      ...axisCommon(tokens),
      // Les graduations suivent les marqueurs : une année sur cinq quand la
      // série est longue, toutes sinon.
      ...(input.markers
        ? { axisLabel: { ...axisCommon(tokens).axisLabel, interval: (index: number) => input.markers!.has(index) } }
        : {}),
      ...axisName(tokens, input.xTitle),
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: scale.label,
      nameTextStyle: { color: tokens.inkMuted, fontSize: 11, fontFamily: tokens.font, align: "left" },
      nameGap: 12,
      max: form === "share" || form === "shareArea" ? 100 : undefined,
      ...axisCommon(tokens),
    },
    series: series as EChartsOption["series"],
  };
}

export type PieSlice = {
  key: string;
  label: string;
  colorIndex: number;
  value: number | null;
  /** Teinte imposée, lorsque les parts sont ordonnées — des années, par exemple
   *  — et appellent une rampe séquentielle plutôt que la palette catégorielle. */
  color?: string;
};

export type PieInput = {
  slices: PieSlice[];
  tokens: ChartTokens;
  kind: string;
  /** Ce que le total représente, écrit au centre de l'anneau. */
  centerLabel: string;
};

/** Un anneau, ses parts, les pourcentages écrits sur le tracé.
 *
 *  Le camembert n'est juste que sur la décomposition d'un tout : il ne prend
 *  donc pas une suite d'années, mais une valeur cumulée par modalité. Les
 *  étiquettes portent le nom **et** la part, si bien que l'image reste lisible
 *  sans légende une fois projetée — et sans survol, ce qu'un vidéoprojecteur
 *  n'offre pas.
 */
export function pieOption({ slices, tokens, kind, centerLabel }: PieInput): EChartsOption {
  const kept = slices.filter((slice) => slice.value !== null && slice.value > 0);
  const total = kept.reduce((sum, slice) => sum + (slice.value ?? 0), 0);

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    tooltip: {
      ...tooltipCommon(tokens),
      trigger: "item",
      formatter: (params: any) =>
        `<strong>${params.name}</strong><br>${readable(params.value, kind)}`
        + `<br><span style="color:${tokens.inkMuted}">${formatValue(params.percent, "percent")} du total</span>`,
    },
    legend: HTML_LEGEND,
    series: [{
      id: "pie",
      type: "pie",
      radius: ["42%", "68%"],
      center: ["50%", "50%"],
      avoidLabelOverlap: true,
      padAngle: 1.5,
      itemStyle: { borderColor: tokens.surface, borderWidth: 2, borderRadius: 4 },
      label: {
        show: true,
        formatter: (params: any) =>
          `{name|${params.name}}\n{value|${formatValue(params.percent, "percent")}}`,
        rich: {
          name: { color: tokens.inkSecondary, fontFamily: tokens.font, fontSize: 13, lineHeight: 20 },
          value: { color: tokens.ink, fontFamily: tokens.font, fontSize: 17, fontWeight: 660, lineHeight: 24 },
        },
      },
      labelLine: { length: 16, length2: 20, lineStyle: { color: tokens.line } },
      emphasis: { scaleSize: 6 },
      data: kept.map((slice) => ({
        name: slice.label,
        value: slice.value ?? 0,
        itemStyle: { color: slice.color ?? paletteColor(tokens, slice.colorIndex, kept.length) },
      })),
    }],
    graphic: total > 0 ? [{
      type: "text",
      left: "center",
      top: "middle",
      style: {
        text: `${formatValue(total, kind)}\n${centerLabel}`,
        textAlign: "center",
        fill: tokens.inkSecondary,
        fontFamily: tokens.font,
        fontSize: 13,
        lineHeight: 20,
      },
    }] : undefined,
  } as EChartsOption;
}
