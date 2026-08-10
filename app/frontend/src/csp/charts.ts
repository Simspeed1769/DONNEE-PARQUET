/** Les formes de la fiche CSP — sur le modèle de `panorama/charts.ts`.
 *
 *  Quatre lectures : une carte régionale (le fond de carte partagé de
 *  `charts/frenchMap.ts`), une évolution par millésime, un profil âge×sexe,
 *  une composition en groupes ou catégories. La carte encode une magnitude
 *  simple — part ou effectif — donc une rampe séquentielle, jamais la
 *  palette divergente réservée aux indices centrés sur un pivot.
 */

import type { EChartsOption } from "../charts/EChart";
import type { ChartTokens } from "../charts/tokens";
import { seriesColor, soloColor } from "../charts/tokens";
import { FRENCH_MAP } from "../charts/frenchMap";
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

/* — Évolution — */

export type EvolutionInput = {
  years: number[];
  values: Array<number | null>;
  currentYear: number;
  kind: string;
  tokens: ChartTokens;
};

export function evolutionOption({ years, values, currentYear, kind, tokens }: EvolutionInput): EChartsOption {
  const color = soloColor(tokens);
  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 24, top: 16, bottom: 12, containLabel: true },
    tooltip: {
      trigger: "axis",
      ...tooltipCommon(tokens),
      axisPointer: { type: "line", lineStyle: { color: tokens.line, width: 1 } },
      formatter: (params: any) => {
        const point = Array.isArray(params) ? params[0] : params;
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
      connectNulls: false,
      smooth: false,
      symbol: "circle",
      symbolSize: 7,
      lineStyle: { width: 3, color },
      itemStyle: { color, borderColor: tokens.surface, borderWidth: 1.5 },
      markLine: years.includes(currentYear) ? {
        silent: true,
        symbol: "none" as const,
        lineStyle: { color: tokens.inkMuted, type: "dotted" as const, width: 1.5 },
        data: [{ xAxis: String(currentYear) }],
      } : undefined,
    }],
  } as EChartsOption;
}

/* — Profil âge × sexe — */

export type AgeSexRow = { label: string; sexCode: number; values: Array<number | null> };

export type AgeSexInput = {
  ages: string[];
  rows: AgeSexRow[];
  kind: string;
  tokens: ChartTokens;
};

/** Une ou deux séries selon le filtre de sexe : le code 2 (femmes) porte
 *  toujours le même emplacement de couleur que le code 1 (hommes), qu'il
 *  soit seul ou accompagné — l'identité ne dépend pas de qui d'autre est là. */
export function ageSexOption({ ages, rows, kind, tokens }: AgeSexInput): EChartsOption {
  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 20, top: 40, bottom: 56, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...tooltipCommon(tokens),
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params];
        const head = `<div style="font-weight:650;margin-bottom:6px">${list[0]?.axisValueLabel ?? ""}</div>`;
        return head + list.map((item: any) => {
          const row = rows.find((candidate) => candidate.label === item.seriesName);
          return `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">
            <span style="width:8px;height:8px;border-radius:2px;background:${item.color};flex:0 0 auto"></span>
            <span style="flex:1;color:${tokens.inkSecondary}">${item.seriesName}</span>
            <b style="font-variant-numeric:tabular-nums">${readable(row?.values[item.dataIndex], kind)}</b></div>`;
        }).join("");
      },
    },
    legend: rows.length > 1 ? {
      show: true, top: 4, left: "center", itemWidth: 14, itemHeight: 8,
      textStyle: { color: tokens.inkSecondary, fontFamily: tokens.font, fontSize: 12 },
    } : { show: false },
    xAxis: {
      type: "category",
      data: ages,
      axisLine: { lineStyle: { color: tokens.line } },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), rotate: 32, hideOverlap: true },
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
    series: rows.map((row) => {
      // Le code 2 (femmes) occupe toujours l'emplacement 0, le code 1
      // (hommes) l'emplacement 1 : la couleur suit l'identité, pas la
      // position dans la vue courante, qu'une seule ou deux séries y soient.
      const colorIndex = row.sexCode === 2 ? 0 : 1;
      return {
        name: row.label,
        type: "bar" as const,
        data: row.values,
        color: seriesColor(tokens, colorIndex),
        itemStyle: { color: seriesColor(tokens, colorIndex) },
        barMaxWidth: rows.length > 1 ? 24 : 40,
        emphasis: { focus: "series" as const },
      };
    }),
  } as EChartsOption;
}

/* — Composition — */

export type CompositionRow = { code: string; label: string; value: number; franceValue?: number };

export type CompositionInput = {
  rows: CompositionRow[];
  ownCode: string;
  contextual: boolean;
  regionLabel: string;
  kind: string;
  tokens: ChartTokens;
};

export function compositionOption({ rows, ownCode, contextual, regionLabel, kind, tokens }: CompositionInput): EChartsOption {
  const categories = rows.map((row) => row.label);
  const own = {
    name: regionLabel,
    type: "bar" as const,
    data: rows.map((row) => ({
      value: row.value,
      itemStyle: { color: row.code === ownCode ? soloColor(tokens) : tokens.ramp[4], borderRadius: [0, 4, 4, 0] as [number, number, number, number] },
    })),
    barMaxWidth: contextual ? 12 : 20,
  };
  const series: NonNullable<EChartsOption["series"]> = [own];
  if (contextual) {
    series.push({
      name: "France entière",
      type: "bar",
      data: rows.map((row) => row.franceValue ?? null),
      itemStyle: { color: tokens.seriesOther, borderRadius: [0, 4, 4, 0] as [number, number, number, number] },
      barMaxWidth: 12,
    });
  }

  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 32, top: contextual ? 36 : 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...tooltipCommon(tokens),
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params];
        const head = `<div style="font-weight:650;margin-bottom:6px">${list[0]?.axisValueLabel ?? ""}</div>`;
        return head + list.map((item: any) => `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">
          <span style="width:8px;height:8px;border-radius:2px;background:${item.color};flex:0 0 auto"></span>
          <span style="flex:1;color:${tokens.inkSecondary}">${item.seriesName}</span>
          <b style="font-variant-numeric:tabular-nums">${readable(item.value, kind)}</b></div>`).join("");
      },
    },
    legend: contextual ? {
      show: true, top: 4, left: "center", itemWidth: 14, itemHeight: 8,
      textStyle: { color: tokens.inkSecondary, fontFamily: tokens.font, fontSize: 12 },
    } : { show: false },
    xAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), formatter: (value: number) => formatValue(value, kind) },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    yAxis: {
      type: "category",
      data: categories,
      // La première ligne du périmètre apparaît en haut, dans l'ordre où
      // l'API la donne — pas dans l'ordre de tri d'un classement.
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), color: tokens.inkSecondary, width: 220, overflow: "truncate" },
    },
    series,
  } as EChartsOption;
}
