import type { EChartsOption } from "echarts";
import type { ChartTokens } from "./tokens";
import { paletteColor, seriesColor } from "./tokens";
import { formatValue, scaleFor } from "../utils";

export type ChartForm = "line" | "area" | "bar" | "stack" | "share" | "rank" | "slope" | "waterfall" | "pie";

export type ChartSeries = {
  key: string;
  label: string;
  isOther: boolean;
  /** Index stable de la modalité : la couleur suit l'entité, jamais son rang,
   *  pour qu'un filtre qui retire une série ne repeigne pas les survivantes. */
  colorIndex: number;
  values: Array<number | null>;
};

export type ChartInput = {
  form: ChartForm;
  categories: Array<string | number>;
  series: ChartSeries[];
  kind: string;
  unitLabel: string;
  tokens: ChartTokens;
  /** Étiquette directe en bout de courbe : elle évite que la couleur porte
   *  seule l'identité, et compense le contraste faible de certaines teintes. */
  directLabels: boolean;
};

const MARK_GAP = 2;

function axisCommon(tokens: ChartTokens) {
  return {
    axisLine: { show: true, lineStyle: { color: tokens.line, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: tokens.inkMuted, fontSize: 11, fontFamily: tokens.font },
    splitLine: { show: true, lineStyle: { color: tokens.grid, width: 1, type: "solid" as const } },
  };
}

function tooltipCommon(tokens: ChartTokens) {
  return {
    backgroundColor: tokens.surface,
    borderColor: tokens.line,
    borderWidth: 1,
    padding: [10, 12] as [number, number],
    textStyle: { color: tokens.ink, fontSize: 12, fontFamily: tokens.font },
    extraCssText: "box-shadow: 0 8px 28px rgba(0,0,0,.14); border-radius: 10px;",
  };
}

function scaleOf(input: ChartInput) {
  const flat = input.series.flatMap((series) => series.values.filter((value): value is number => value !== null));
  if (input.kind === "percent" || input.kind === "index") return { divisor: 1, label: input.unitLabel };
  const scale = scaleFor(flat, input.kind);
  return {
    divisor: scale.divisor,
    label: input.unitLabel.includes("/") ? `${scale.label}/unité` : scale.label,
  };
}

/** Une valeur formatée telle qu'elle se lit, indépendamment de l'échelle de l'axe. */
function readable(value: number | null, kind: string): string {
  return value === null ? "—" : formatValue(value, kind);
}

// La légende vit dans le HTML de la page, pas dans le canevas : elle y est
// sélectionnable, accessible au clavier et lisible par un lecteur d'écran.
const HTML_LEGEND = { show: false } as const;

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

  const stacked = form === "area" || form === "stack" || form === "share";
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
      symbol: "circle",
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
      } : { show: false },
    };
  });

  return {
    animationDuration: 380,
    grid: {
      left: 8, right: input.directLabels ? 132 : 16, top: 16, bottom: 8,
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
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: scale.label,
      nameTextStyle: { color: tokens.inkMuted, fontSize: 11, fontFamily: tokens.font, align: "left" },
      nameGap: 12,
      max: form === "share" ? 100 : undefined,
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

function rankOption(input: ChartInput, scale: { label: string },
                    scaled: (value: number | null) => number | null): EChartsOption {
  const { tokens } = input;
  // Dernière valeur non nulle de chaque modalité, triée croissante pour que la
  // plus grande se lise en haut.
  const rows = input.series
    .map((item) => {
      const index = item.values.reduce<number>((last, value, position) => (value !== null ? position : last), -1);
      return { item, value: index >= 0 ? item.values[index] : null, category: input.categories[index] };
    })
    .filter((row) => row.value !== null)
    .sort((left, right) => (left.value ?? 0) - (right.value ?? 0));

  return {
    animationDuration: 380,
    grid: { left: 8, right: 56, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      ...tooltipCommon(tokens),
      formatter: (params: any) => {
        const row = rows[params.dataIndex];
        return `<div style="font-weight:650;margin-bottom:4px">${row.item.label}</div>
          <div style="color:${tokens.inkSecondary}">${row.category} · <b style="color:${tokens.ink}">${readable(row.value, input.kind)}</b></div>`;
      },
    },
    xAxis: { type: "value", name: scale.label, nameTextStyle: { color: tokens.inkMuted, fontSize: 11 }, ...axisCommon(tokens) },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.item.label),
      ...axisCommon(tokens),
      splitLine: { show: false },
      axisLabel: { color: tokens.inkSecondary, fontSize: 11, fontFamily: tokens.font, width: 190, overflow: "truncate" },
    },
    series: [{
      type: "bar",
      data: rows.map((row) => ({
        value: scaled(row.value),
        itemStyle: {
          color: paletteColor(tokens, row.item.colorIndex, rows.length, row.item.isOther),
          borderRadius: [0, 4, 4, 0] as [number, number, number, number],
        },
      })),
      barMaxWidth: 26,
      label: {
        show: true, position: "right", distance: 8,
        color: tokens.inkSecondary, fontSize: 11, fontFamily: tokens.font,
        formatter: (params: any) => readable(rows[params.dataIndex].value, input.kind),
      },
    }],
  };
}

function slopeOption(input: ChartInput, scale: { label: string },
                     scaled: (value: number | null) => number | null): EChartsOption {
  const { tokens } = input;
  const firstIndex = 0;
  const lastIndex = input.categories.length - 1;
  return {
    animationDuration: 380,
    grid: { left: 8, right: 140, top: 20, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      ...tooltipCommon(tokens),
      formatter: (params: any) => `<div style="font-weight:650">${params.seriesName}</div>
        <div style="color:${tokens.inkSecondary}">${params.name} · <b style="color:${tokens.ink}">${readable(
          input.series.find((item) => item.label === params.seriesName)?.values[params.dataIndex] ?? null, input.kind)}</b></div>`,
    },
    xAxis: {
      type: "category",
      data: [input.categories[firstIndex], input.categories[lastIndex]],
      boundaryGap: true,
      ...axisCommon(tokens),
      splitLine: { show: false },
    },
    yAxis: { type: "value", name: scale.label, nameTextStyle: { color: tokens.inkMuted, fontSize: 11 }, ...axisCommon(tokens) },
    series: input.series.map((item) => {
      const color = paletteColor(tokens, item.colorIndex, input.series.length, item.isOther);
      return {
        id: item.key,
        name: item.label,
        type: "line" as const,
        data: [scaled(item.values[firstIndex]), scaled(item.values[lastIndex])],
        color,
        symbol: "circle",
        symbolSize: 11,
        lineStyle: { width: 2, color },
        itemStyle: { color, borderColor: tokens.surface, borderWidth: MARK_GAP },
        endLabel: {
          show: true,
          formatter: () => item.label,
          color: tokens.inkSecondary,
          fontSize: 11,
          fontFamily: tokens.font,
          distance: 8,
        },
      };
    }) as EChartsOption["series"],
  };
}

function waterfallOption(input: ChartInput, scale: { label: string },
                         scaled: (value: number | null) => number | null): EChartsOption {
  const { tokens } = input;
  // Contribution de chaque modalité à l'écart entre la première et la dernière
  // période : la couleur porte ici un signe, pas une identité — c'est donc la
  // paire divergente (positif / négatif), jamais la palette catégorielle.
  const first = 0;
  const last = input.categories.length - 1;
  const rows = input.series
    .map((item) => {
      const start = item.values[first];
      const end = item.values[last];
      return { label: item.label, delta: start === null || end === null ? null : end - start };
    })
    .filter((row) => row.delta !== null)
    .sort((left, right) => Math.abs(right.delta ?? 0) - Math.abs(left.delta ?? 0));

  return {
    animationDuration: 380,
    grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      ...tooltipCommon(tokens),
      formatter: (params: any) => {
        const row = rows[params.dataIndex];
        return `<div style="font-weight:650;margin-bottom:4px">${row.label}</div>
          <div style="color:${tokens.inkSecondary}">Écart ${input.categories[first]} → ${input.categories[last]} ·
          <b style="color:${(row.delta ?? 0) >= 0 ? tokens.good : tokens.critical}">${formatValue(row.delta, input.kind, true)}</b></div>`;
      },
    },
    xAxis: { type: "value", name: scale.label, nameTextStyle: { color: tokens.inkMuted, fontSize: 11 }, ...axisCommon(tokens) },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      inverse: true,
      ...axisCommon(tokens),
      splitLine: { show: false },
      axisLabel: { color: tokens.inkSecondary, fontSize: 11, fontFamily: tokens.font, width: 190, overflow: "truncate" },
    },
    series: [{
      type: "bar",
      data: rows.map((row) => {
        const positive = (row.delta ?? 0) >= 0;
        return {
          value: scaled(row.delta),
          itemStyle: {
            color: positive ? tokens.series[0] : tokens.series[7],
            borderRadius: (positive
              ? [0, 4, 4, 0]
              : [4, 0, 0, 4]) as [number, number, number, number],
          },
          // L'étiquette se place du côté où la barre s'étend, sans quoi elle
          // chevaucherait l'axe zéro sur les contributions négatives.
          label: { position: positive ? "right" : "left" },
        };
      }),
      barMaxWidth: 22,
      label: {
        show: true,
        distance: 8,
        color: tokens.inkSecondary,
        fontSize: 11,
        fontFamily: tokens.font,
        formatter: (params: any) => formatValue(rows[params.dataIndex].delta, input.kind, true),
      },
    }],
  };
}
