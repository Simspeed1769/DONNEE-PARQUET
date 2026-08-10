/** Les formes de la fiche Pathologies — sur le modèle de `panorama/charts.ts`.
 *
 *  Trois lectures : une trajectoire nationale (avec repère France en
 *  pointillé quand un territoire est choisi), un profil âge×sexe où la
 *  tranche observée se détache des autres, un classement territorial avec
 *  le repère France et le masquage Cnam explicites.
 */

import type { EChartsOption } from "../charts/EChart";
import type { ChartTokens } from "../charts/tokens";
import { paletteColor, seriesColor, soloColor } from "../charts/tokens";
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

function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (!hex.startsWith("#")) return hex;
  const full = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const red = parseInt(full.slice(1, 3), 16);
  const green = parseInt(full.slice(3, 5), 16);
  const blue = parseInt(full.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/* — Évolution — */

export type EvolutionInput = {
  years: number[];
  values: Array<number | null>;
  regionLabel: string;
  /** Repère national, uniquement quand un territoire précis est observé :
   *  sur la France entière, la comparaison à elle-même n'aurait aucun sens. */
  franceYears?: number[];
  franceValues?: Array<number | null>;
  /** Aire sous la courbe : réservée à la lecture nationale seule, où il n'y a
   *  pas de second repère avec lequel elle entrerait en concurrence visuelle. */
  filled: boolean;
  kind: string;
  tokens: ChartTokens;
};

export function evolutionOption({
  years, values, regionLabel, franceYears, franceValues, filled, kind, tokens,
}: EvolutionInput): EChartsOption {
  const showFrance = !!franceValues && franceValues.some((value) => value !== null);
  const color = showFrance ? paletteColor(tokens, 0, 2) : soloColor(tokens);
  const franceColor = tokens.inkSecondary;

  const series: NonNullable<EChartsOption["series"]> = [{
    id: "selected",
    name: regionLabel,
    type: "line",
    data: values,
    color,
    smooth: false,
    symbol: "circle",
    symbolSize: 8,
    lineStyle: { width: 3, color },
    itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
    areaStyle: filled ? {
      color: {
        type: "linear", x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: withAlpha(color, tokens.mode === "dark" ? 0.3 : 0.18) },
          { offset: 1, color: withAlpha(color, 0) },
        ],
      },
    } : undefined,
  }];
  if (showFrance) {
    series.push({
      id: "france",
      name: "France entière",
      type: "line",
      data: franceValues!,
      color: franceColor,
      smooth: false,
      symbol: "circle",
      symbolSize: 6,
      lineStyle: { width: 2, type: "dashed", color: franceColor },
      itemStyle: { color: franceColor, borderColor: tokens.surface, borderWidth: 1.5 },
    });
  }

  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 24, top: showFrance ? 40 : 16, bottom: 12, containLabel: true },
    tooltip: {
      trigger: "axis",
      ...tooltipCommon(tokens),
      axisPointer: { type: "line", lineStyle: { color: tokens.line, width: 1 } },
      formatter: (params: any) => {
        const rows = Array.isArray(params) ? params : [params];
        const head = `<div style="font-weight:650;margin-bottom:6px">${rows[0]?.axisValueLabel ?? ""}</div>`;
        return head + rows.map((row: any) => `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">
          <span style="width:8px;height:8px;border-radius:50%;background:${row.color};flex:0 0 auto"></span>
          <span style="flex:1;color:${tokens.inkSecondary}">${row.seriesName}</span>
          <b style="font-variant-numeric:tabular-nums">${readable(row.data, kind)}</b></div>`).join("");
      },
    },
    legend: showFrance ? {
      show: true, top: 4, right: 0, itemWidth: 14, itemHeight: 8,
      textStyle: { color: tokens.inkSecondary, fontFamily: tokens.font, fontSize: 12 },
    } : { show: false },
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
    series,
  } as EChartsOption;
}

/* — Profil âge × sexe — */

export type AgeSexInput = {
  ages: string[];
  femmes: Array<number | null>;
  hommes: Array<number | null>;
  /** Tranche à faire ressortir ; `null` quand le filtre porte sur tous les
   *  âges, auquel cas aucune tranche ne s'efface au profit d'une autre. */
  highlightLabel: string | null;
  kind: string;
  tokens: ChartTokens;
};

export function ageSexOption({ ages, femmes, hommes, highlightLabel, kind, tokens }: AgeSexInput): EChartsOption {
  const rows = [
    { label: "Femmes", values: femmes, color: seriesColor(tokens, 0) },
    { label: "Hommes", values: hommes, color: seriesColor(tokens, 1) },
  ];
  const opacityAt = (age: string) => (highlightLabel === null || age === highlightLabel ? 1 : 0.32);

  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 20, top: 40, bottom: 60, containLabel: true },
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
    legend: {
      show: true, top: 4, left: "center", itemWidth: 14, itemHeight: 8,
      textStyle: { color: tokens.inkSecondary, fontFamily: tokens.font, fontSize: 12 },
    },
    xAxis: {
      type: "category",
      data: ages,
      axisLine: { lineStyle: { color: tokens.line } },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), rotate: 42, hideOverlap: true },
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
    series: rows.map((row) => ({
      name: row.label,
      type: "bar" as const,
      data: row.values.map((value, index) => ({
        value,
        itemStyle: { color: row.color, opacity: opacityAt(ages[index]) },
      })),
      barMaxWidth: 24,
      emphasis: { focus: "series" as const },
    })),
  } as EChartsOption;
}

/* — Classement territorial — */

export type TerritoryRow = {
  code: string;
  label: string;
  value: number;
  patients: number | null;
  maskedCells: number;
  totalCells: number;
};

export type TerritoryRankInput = {
  rows: TerritoryRow[];
  /** Territoire de la fiche, mis en avant s'il figure dans le classement. */
  ownRegion: string | null;
  franceValue: number | null;
  showMaskedDetails: boolean;
  kind: string;
  tokens: ChartTokens;
};

export function territoryRankOption({
  rows, ownRegion, franceValue, showMaskedDetails, kind, tokens,
}: TerritoryRankInput): EChartsOption {
  const ranked = [...rows].sort((left, right) => left.value - right.value);

  return {
    animationDuration: 380,
    backgroundColor: "transparent",
    grid: { left: 12, right: 32, top: franceValue !== null ? 28 : 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      ...tooltipCommon(tokens),
      formatter: (params: any) => {
        const row = ranked[params.dataIndex];
        const masked = showMaskedDetails
          ? `<br><span style="color:${tokens.inkMuted}">Cellules masquées par la source : ${row.maskedCells}</span>` : "";
        return `<div style="font-weight:650;margin-bottom:4px">${row.label}</div>
          <div>Prévalence : <b>${readable(row.value, kind)}</b></div>
          <div style="color:${tokens.inkSecondary}">Patients : ${row.patients === null ? "—" : new Intl.NumberFormat("fr-FR").format(row.patients)}</div>${masked}`;
      },
    },
    xAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), formatter: (value: number) => formatValue(value, kind) },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    yAxis: {
      type: "category",
      data: ranked.map((row) => row.label),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { ...axisLabelStyle(tokens), color: tokens.inkSecondary, width: 200, overflow: "truncate" },
    },
    series: [{
      type: "bar",
      data: ranked.map((row) => ({
        value: row.value,
        itemStyle: {
          color: row.code === ownRegion ? soloColor(tokens) : tokens.ramp[4],
          borderRadius: [0, 4, 4, 0] as [number, number, number, number],
        },
      })),
      barMaxWidth: 20,
      markLine: franceValue !== null ? {
        silent: true,
        symbol: "none" as const,
        lineStyle: { color: tokens.inkSecondary, type: "dashed" as const, width: 1.25, opacity: 0.7 },
        label: {
          show: true, position: "end" as const, rotate: 0, align: "center" as const,
          formatter: `France · ${formatValue(franceValue, kind)}`,
          color: tokens.inkSecondary, fontFamily: tokens.font, fontSize: 11,
        },
        data: [{ xAxis: franceValue }],
      } : undefined,
    }],
  } as EChartsOption;
}
