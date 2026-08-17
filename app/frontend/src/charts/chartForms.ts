/** Les six formes spécialisées : classement, écarts, carte de chaleur,
 *  pyramide, pentes, cascade.
 *
 *  Séparées du répartiteur au point 2.4, sans changement de rendu. Chacune
 *  porte encore le commentaire de l'incident qui l'a façonnée — c'est la vraie
 *  documentation de ce fichier.
 */

import type { EChartsOption } from "echarts";
import { paletteColor, seriesColor, type ChartTokens } from "./tokens";
import { formatValue } from "../utils";
import {
  AXIS_NAME_GAP,
  CATEGORY_NAME_TOP,
  END_LABEL_WIDTH,
  HTML_LEGEND,
  MARK_GAP,
  VALUE_NAME_TOP,
  axisCommon,
  axisName,
  horizontalValueName,
  readable,
  tooltipCommon,
  verticalAxisName,
  type ChartInput,
  type ChartSeries,
} from "./chartBase";

type RankRow = { label: string; note: string; value: number | null; color: string };

export function rankOption(input: ChartInput, scale: { label: string },
                    scaled: (value: number | null) => number | null): EChartsOption {
  const { tokens } = input;

  // Deux classements très différents partagent la même forme. Comparer met des
  // séries en rang sur leur dernière valeur connue ; une fiche met en rang les
  // catégories d'une série unique — régions, tranches d'âge, causes. Le second
  // encode une magnitude et non des identités : toutes ses barres portent donc
  // la même teinte, la longueur seule fait la différence.
  const byCategory = input.rankBy === "category";
  const rows: RankRow[] = byCategory
    ? (() => {
      const serie = input.series[0];
      const color = paletteColor(tokens, serie?.colorIndex ?? 0, 1, serie?.isOther ?? false);
      return input.categories.map((category, index) => ({
        label: String(category),
        note: serie?.label ?? "",
        value: serie?.values[index] ?? null,
        color,
      }));
    })()
    : input.series.map((item) => {
      const index = item.values.reduce<number>((last, value, position) => (value !== null ? position : last), -1);
      return {
        label: item.label,
        note: String(input.categories[index] ?? ""),
        value: index >= 0 ? item.values[index] : null,
        color: paletteColor(tokens, item.colorIndex, input.series.length, item.isOther),
      };
    });

  // Croissant : la plus grande valeur se lit en haut.
  const ranked = rows
    .filter((row) => row.value !== null)
    .sort((left, right) => (left.value ?? 0) - (right.value ?? 0));

  return {
    animationDuration: 380,
    grid: {
      left: 8, right: 56,
      top: input.xTitle ? CATEGORY_NAME_TOP : 8,
      bottom: 26,
      containLabel: true,
    },
    tooltip: {
      trigger: "item",
      ...tooltipCommon(tokens),
      formatter: (params: any) => {
        const row = ranked[params.dataIndex];
        return `<div style="font-weight:650;margin-bottom:4px">${row.label}</div>
          <div style="color:${tokens.inkSecondary}">${row.note} · <b style="color:${tokens.ink}">${readable(row.value, input.kind)}</b></div>`;
      },
    },
    xAxis: { type: "value", ...horizontalValueName(tokens, scale.label), ...axisCommon(tokens) },
    yAxis: {
      type: "category",
      data: ranked.map((row) => row.label),
      ...axisCommon(tokens),
      ...verticalAxisName(tokens, input.xTitle),
      splitLine: { show: false },
      axisLabel: { color: tokens.inkSecondary, fontSize: 11, fontFamily: tokens.font, width: 190, overflow: "truncate" },
    },
    series: [{
      id: "rank",
      type: "bar",
      data: ranked.map((row) => ({
        value: scaled(row.value),
        itemStyle: {
          color: row.color,
          borderRadius: [0, 4, 4, 0] as [number, number, number, number],
        },
      })),
      barMaxWidth: 26,
      label: {
        show: true, position: "right", distance: 8,
        color: tokens.inkSecondary, fontSize: 11, fontFamily: tokens.font,
        formatter: (params: any) => readable(ranked[params.dataIndex].value, input.kind),
      },
    }],
  };
}

/** Barres divergentes : des valeurs signées, de part et d'autre de zéro.
 *
 *  Ici la couleur porte un **signe et une ampleur**, pas une identité : c'est
 *  donc la rampe divergente — deux teintes autour d'un gris neutre — et jamais
 *  la palette catégorielle. Une seule série, une barre par modalité, l'axe zéro
 *  marqué : c'est lui qui donne son sens à la forme.
 */
export function divergingOption(input: ChartInput, scale: { label: string },
                         scaled: (value: number | null) => number | null): EChartsOption {
  const { tokens } = input;

  // Deux dispositions, comme pour le classement. Une série unique de valeurs
  // déjà signées se lit modalité par modalité ; plusieurs séries se lisent sur
  // leur écart entre la première et la dernière période — qui progresse, qui
  // recule.
  const first = 0;
  const last = input.categories.length - 1;
  const rows = (input.rankBy === "category" || input.series.length <= 1
    ? input.categories.map((category, index) => ({
      label: String(category),
      value: input.series[0]?.values[index] ?? null,
    }))
    : input.series.map((serie) => {
      const start = serie.values[first];
      const end = serie.values[last];
      return {
        label: serie.label,
        value: start === null || start === undefined || end === null || end === undefined
          ? null
          : end - start,
      };
    })
  ).filter((row) => row.value !== null);

  // Les extrêmes des deux côtés, pour graduer la rampe symétriquement : sans
  // cela, un côté peu étendu saturerait sa teinte et paraîtrait plus fort.
  const magnitude = Math.max(...rows.map((row) => Math.abs(row.value ?? 0)), 0) || 1;
  const middle = (tokens.diverge.length - 1) / 2;

  const shade = (value: number): string => {
    const position = middle + (value / magnitude) * middle;
    const index = Math.round(Math.min(tokens.diverge.length - 1, Math.max(0, position)));
    return tokens.diverge[index];
  };

  return {
    animationDuration: 380,
    grid: {
      left: 8, right: 56,
      top: input.xTitle ? CATEGORY_NAME_TOP : 8,
      bottom: 26,
      containLabel: true,
    },
    tooltip: {
      trigger: "item",
      ...tooltipCommon(tokens),
      formatter: (params: any) => {
        const row = rows[params.dataIndex];
        return `<div style="font-weight:650;margin-bottom:4px">${row.label}</div>
          <div style="color:${tokens.inkSecondary}"><b style="color:${tokens.ink}">${formatValue(row.value, input.kind, true)}</b></div>`;
      },
    },
    xAxis: { type: "value", ...horizontalValueName(tokens, scale.label), ...axisCommon(tokens) },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      inverse: true,
      ...axisCommon(tokens),
      ...verticalAxisName(tokens, input.xTitle, true),
      splitLine: { show: false },
      axisLabel: { color: tokens.inkSecondary, fontSize: 11, fontFamily: tokens.font, width: 190, overflow: "truncate" },
    },
    series: [{
      id: "diverging",
      type: "bar",
      data: rows.map((row) => {
        const positive = (row.value ?? 0) >= 0;
        return {
          value: scaled(row.value),
          itemStyle: {
            color: shade(row.value ?? 0),
            borderRadius: (positive ? [0, 4, 4, 0] : [4, 0, 0, 4]) as [number, number, number, number],
          },
          // L'étiquette se pose du côté où la barre s'étend, sinon elle
          // chevaucherait l'axe zéro sur les valeurs négatives.
          label: { position: positive ? "right" : "left" },
        };
      }),
      barMaxWidth: 24,
      label: {
        show: true, distance: 8,
        color: tokens.inkSecondary, fontSize: 11, fontFamily: tokens.font,
        formatter: (params: any) => formatValue(rows[params.dataIndex].value, input.kind, true),
      },
      markLine: {
        silent: true,
        symbol: "none",
        data: [{ xAxis: 0 }],
        lineStyle: { color: tokens.line, width: 1 },
        label: { show: false },
      },
    }],
  };
}

/** Carte de chaleur année × modalité.
 *
 *  Elle répond à une question que ni la courbe ni la barre ne posent bien quand
 *  les modalités se comptent par dizaines : *où et quand* est-ce fort ? Une
 *  magnitude simple appelle une rampe séquentielle d'une seule teinte, du clair
 *  au foncé — jamais un arc-en-ciel, dont les paliers ne s'ordonnent pas.
 */
export function heatmapOption(input: ChartInput): EChartsOption {
  const { tokens } = input;
  const cells: Array<[number, number, number | null]> = [];
  input.series.forEach((serie, row) => {
    input.categories.forEach((_, column) => {
      cells.push([column, row, serie.values[column] ?? null]);
    });
  });
  const known = cells.map(([, , value]) => value).filter((value): value is number => value !== null);
  const bounds: [number, number] = [Math.min(...known, 0), Math.max(...known, 0)];

  return {
    animationDuration: 380,
    grid: {
      left: 8, right: 16, top: 8,
      // Trois choses s'empilent sous la grille : les graduations, le titre de
      // l'axe, puis la légende de la rampe. Chacune a sa bande.
      bottom: input.xTitle ? 66 : 40,
      containLabel: true,
    },
    tooltip: {
      trigger: "item",
      ...tooltipCommon(tokens),
      formatter: (params: any) => {
        const [column, row, value] = params.data as [number, number, number | null];
        return `<div style="font-weight:650;margin-bottom:4px">${input.series[row]?.label ?? ""}</div>
          <div style="color:${tokens.inkSecondary}">${input.categories[column]} ·
          <b style="color:${tokens.ink}">${readable(value, input.kind)}</b></div>`;
      },
    },
    xAxis: {
      type: "category",
      data: input.categories,
      ...axisCommon(tokens),
      ...axisName(tokens, input.xTitle),
      splitLine: { show: false },
      splitArea: { show: false },
    },
    yAxis: {
      type: "category",
      data: input.series.map((serie) => serie.label),
      ...axisCommon(tokens),
      splitLine: { show: false },
      splitArea: { show: false },
      axisLabel: { color: tokens.inkSecondary, fontSize: 11, fontFamily: tokens.font, width: 190, overflow: "truncate" },
    },
    visualMap: {
      type: "continuous",
      min: bounds[0],
      max: bounds[1],
      calculable: false,
      orient: "horizontal",
      left: "center",
      // Sous le titre d'axe, jamais dessus.
      bottom: 2,
      itemWidth: 14,
      itemHeight: 120,
      textGap: 10,
      textStyle: { color: tokens.inkMuted, fontSize: 11, fontFamily: tokens.font },
      text: [formatValue(bounds[1], input.kind), formatValue(bounds[0], input.kind)],
      inRange: { color: tokens.ramp },
    },
    series: [{
      id: "heatmap",
      type: "heatmap",
      data: cells.filter((cell) => cell[2] !== null),
      // 2 px de surface entre les cellules : la séparation se fait par le vide.
      itemStyle: { borderColor: tokens.surface, borderWidth: MARK_GAP },
      emphasis: { itemStyle: { borderColor: tokens.ink, borderWidth: 1.5 } },
      progressive: 0,
    }],
  } as EChartsOption;
}

/** Pyramide des âges : deux profils adossés au même axe.
 *
 *  Les femmes s'étendent vers la gauche, les hommes vers la droite. Le signe
 *  négatif n'est qu'un procédé de tracé : les valeurs affichées, en infobulle
 *  comme sur l'axe, restent positives — une pyramide qui annoncerait « −12 000
 *  femmes » mentirait sur ce qu'elle montre.
 */
export function pyramidOption(input: ChartInput, scale: { label: string },
                       scaled: (value: number | null) => number | null): EChartsOption {
  const { tokens } = input;
  const [left, right] = input.series;
  const mirrored = (serie: ChartSeries | undefined, sign: number) =>
    (serie?.values ?? []).map((value) => {
      const next = scaled(value);
      return next === null ? null : next * sign;
    });

  const absolute = (serie: ChartSeries | undefined, index: number) =>
    readable(serie?.values[index] ?? null, input.kind);

  return {
    animationDuration: 380,
    grid: {
      left: 8, right: 16, top: 8,
      // L'axe des valeurs de la pyramide est horizontal : son nom se pose en
      // bas, avec le titre des modalités.
      bottom: input.xTitle ? AXIS_NAME_GAP + 18 : AXIS_NAME_GAP,
      containLabel: true,
    },
    tooltip: {
      trigger: "axis",
      ...tooltipCommon(tokens),
      axisPointer: { type: "shadow" },
      formatter: (params: any) => {
        const rows = Array.isArray(params) ? params : [params];
        const index = rows[0]?.dataIndex ?? 0;
        const head = `<div style="font-weight:650;margin-bottom:6px">${input.categories[index]}</div>`;
        return head + [left, right].map((serie, position) => {
          const color = paletteColor(tokens, serie?.colorIndex ?? position, 2, false);
          return `<div style="display:flex;align-items:center;gap:8px;margin:2px 0">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};flex:0 0 auto"></span>
            <span style="flex:1;color:${tokens.inkSecondary}">${serie?.label ?? ""}</span>
            <b style="font-variant-numeric:tabular-nums">${absolute(serie, index)}</b></div>`;
        }).join("");
      },
    },
    legend: HTML_LEGEND,
    xAxis: {
      type: "value",
      name: scale.label,
      nameLocation: "middle",
      nameGap: AXIS_NAME_GAP - 8,
      nameTextStyle: { color: tokens.inkMuted, fontSize: 11, fontFamily: tokens.font },
      ...axisCommon(tokens),
      // L'axe compte des effectifs de part et d'autre : ses graduations
      // restent positives des deux côtés.
      axisLabel: {
        color: tokens.inkMuted, fontSize: 11, fontFamily: tokens.font,
        formatter: (value: number) => formatValue(Math.abs(value), input.kind),
      },
    },
    yAxis: {
      type: "category",
      data: input.categories,
      ...axisCommon(tokens),
      ...verticalAxisName(tokens, input.xTitle),
      splitLine: { show: false },
      axisLabel: { color: tokens.inkSecondary, fontSize: 11, fontFamily: tokens.font },
    },
    series: [left, right].map((serie, position) => {
      const color = paletteColor(tokens, serie?.colorIndex ?? position, 2, false);
      return {
        id: serie?.key ?? `pyramid-${position}`,
        name: serie?.label ?? "",
        type: "bar" as const,
        stack: "pyramid",
        data: mirrored(serie, position === 0 ? -1 : 1),
        itemStyle: {
          color,
          borderColor: tokens.surface,
          borderWidth: MARK_GAP,
          borderRadius: (position === 0 ? [4, 0, 0, 4] : [0, 4, 4, 0]) as [number, number, number, number],
        },
        barMaxWidth: 26,
      };
    }) as EChartsOption["series"],
  };
}

export function slopeOption(input: ChartInput, scale: { label: string },
                     scaled: (value: number | null) => number | null): EChartsOption {
  const { tokens } = input;
  const firstIndex = 0;
  const lastIndex = input.categories.length - 1;
  return {
    animationDuration: 380,
    grid: { left: 8, right: 140, top: 20, bottom: input.xTitle ? AXIS_NAME_GAP : 8, containLabel: true },
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
      ...axisName(tokens, input.xTitle),
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

export function waterfallOption(input: ChartInput, scale: { label: string },
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
    grid: {
      left: 8, right: 64,
      top: input.xTitle ? CATEGORY_NAME_TOP : 8,
      bottom: 26,
      containLabel: true,
    },
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
    xAxis: { type: "value", ...horizontalValueName(tokens, scale.label), ...axisCommon(tokens) },
    yAxis: {
      type: "category",
      data: rows.map((row) => row.label),
      inverse: true,
      ...axisCommon(tokens),
      ...verticalAxisName(tokens, input.xTitle, true),
      splitLine: { show: false },
      axisLabel: { color: tokens.inkSecondary, fontSize: 11, fontFamily: tokens.font, width: 190, overflow: "truncate" },
    },
    series: [{
      id: "waterfall",
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
