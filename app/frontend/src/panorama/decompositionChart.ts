/** Les deux formes de la décomposition volume × coût moyen.
 *
 *  **La cascade** répond à « d'où vient l'écart » en une lecture : on part du
 *  montant de la première année, on pose l'effet volume, puis l'effet coût, et
 *  on arrive au montant de la dernière. Ses marches se referment exactement —
 *  c'est la propriété de la forme symétrique employée dans `decomposition.ts`,
 *  et sans elle la forme serait fausse.
 *
 *  **Le détail par poste** répond à « lequel » : une barre par grand poste,
 *  sa contribution nette à l'écart. Le partage volume/coût de chaque poste est
 *  au survol et dans le tableau — c'est-à-dire là où on va le chercher, une
 *  fois le poste repéré.
 *
 *  Dans les deux formes, la couleur porte un **signe** et jamais une identité :
 *  c'est la paire divergente, et le nom des effets est écrit sur l'axe de la
 *  cascade. Rien ne dépend donc d'une légende — ce qui tombe bien, le panorama
 *  n'en dessine pas.
 */

import type { EChartsOption } from "echarts";
import type { ChartTokens } from "../charts/tokens";
import { formatValue } from "../utils";
import { axisLabelStyle, axisName, baseTooltip } from "./charts";
import type { Decomposition } from "./decomposition";

/** Une marche de la cascade. */
type Step = {
  label: string;
  /** Absolu pour les bornes (départ, arrivée), relatif pour les effets. */
  absolute: boolean;
  value: number;
};

function steps(decomposition: Decomposition): Step[] {
  const [from, to] = decomposition.years;
  const list: Step[] = [
    { label: String(from), absolute: true, value: decomposition.from },
    { label: "Effet volume", absolute: false, value: decomposition.volume },
    { label: "Effet coût moyen", absolute: false, value: decomposition.cost },
  ];
  // La marche des postes écartés n'apparaît que s'ils pèsent : une marche nulle
  // occuperait une colonne pour ne rien dire, et laisserait croire à un effet.
  if (Math.abs(decomposition.unexplained) > 0.005 * Math.abs(decomposition.to || 1)) {
    list.push({ label: "Postes non décomposables", absolute: false, value: decomposition.unexplained });
  }
  list.push({ label: String(to), absolute: true, value: decomposition.to });
  return list;
}

export function bridgeOption(decomposition: Decomposition, kind: string,
                             tokens: ChartTokens): EChartsOption {
  const list = steps(decomposition);

  // La cascade se dessine avec deux séries : un socle transparent qui porte la
  // hauteur de départ de chaque marche, et la marche elle-même par-dessus.
  const base: number[] = [];
  const span: number[] = [];
  let running = 0;
  list.forEach((step) => {
    if (step.absolute) {
      base.push(0);
      span.push(step.value);
      running = step.value;
      return;
    }
    base.push(Math.min(running, running + step.value));
    span.push(Math.abs(step.value));
    running += step.value;
  });

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    grid: { left: 12, right: 20, top: 34, bottom: 12, containLabel: true },
    tooltip: {
      trigger: "item",
      ...baseTooltip(tokens),
      formatter: (params: any) => {
        const step = list[params.dataIndex];
        if (!step) return "";
        const shown = step.absolute ? step.value : step.value;
        return `<div style="font-weight:650;margin-bottom:4px">${step.label}</div>`
          + `<div>${formatValue(shown, kind, !step.absolute)}</div>`;
      },
    },
    xAxis: {
      type: "category",
      data: list.map((step) => step.label),
      ...axisName(tokens, undefined),
      axisLine: { lineStyle: { color: tokens.line } },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens, 12), interval: 0, hideOverlap: true },
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
      {
        id: "socle",
        type: "bar",
        stack: "pont",
        data: base,
        itemStyle: { color: "transparent" },
        // Le socle ne se survole pas : il n'existe que pour porter la marche.
        silent: true,
        emphasis: { disabled: true },
        tooltip: { show: false },
      },
      {
        id: "marche",
        type: "bar",
        stack: "pont",
        barMaxWidth: 56,
        data: list.map((step) => ({
          value: span[list.indexOf(step)],
          itemStyle: {
            color: step.absolute
              ? tokens.inkSecondary
              : step.value >= 0 ? tokens.series[0] : tokens.series[7],
            borderRadius: [4, 4, 0, 0] as [number, number, number, number],
          },
        })),
        label: {
          show: true,
          position: "top" as const,
          distance: 8,
          color: tokens.inkSecondary,
          fontFamily: tokens.font,
          fontSize: 12,
          fontWeight: 600 as const,
          formatter: (params: any) => {
            const step = list[params.dataIndex];
            return step ? formatValue(step.value, kind, !step.absolute) : "";
          },
        },
        labelLayout: { hideOverlap: true },
      },
    ] as EChartsOption["series"],
  } as EChartsOption;
}

export function posteOption(decomposition: Decomposition, kind: string,
                            tokens: ChartTokens): EChartsOption {
  // Les postes les plus contributeurs en haut : c'est l'ordre dans lequel on
  // lit la réponse à « lequel ». Inversé, parce que l'axe catégoriel monte.
  const postes = [...decomposition.postes].reverse();
  const labels = postes.map((poste) => poste.label);

  // **Une seule barre par poste : sa contribution nette à l'écart.**
  //
  // Deux barres par poste — volume et coût — auraient demandé une légende, et
  // il n'y en a pas ici : `LegendComponent` n'est pas enregistré dans
  // `EChart.tsx`, tout le produit employant des légendes HTML, que le panorama
  // ne dessine pas. Une clé `legend` y serait une configuration morte, et deux
  // étiquettes directes posées à quatorze pixels l'une de l'autre se
  // chevauchaient (vérifié à l'écran).
  //
  // Une série unique lève la question : la couleur n'y porte plus une identité
  // mais un **signe**, ce qui se lit sans nomenclature. Le partage volume/coût,
  // lui, est au survol et dans le tableau — là où on va le chercher quand on a
  // repéré le poste, c'est-à-dire après.
  const series = {
    id: "contribution",
    type: "bar" as const,
    barMaxWidth: 18,
    data: postes.map((poste) => ({
      value: poste.delta,
      itemStyle: {
        color: poste.delta >= 0 ? tokens.series[0] : tokens.series[7],
        borderRadius: (poste.delta >= 0
          ? [0, 4, 4, 0]
          : [4, 0, 0, 4]) as [number, number, number, number],
      },
      label: { position: (poste.delta >= 0 ? "right" : "left") as "right" | "left" },
    })),
    label: {
      show: true,
      distance: 8,
      color: tokens.inkSecondary,
      fontFamily: tokens.font,
      fontSize: 11,
      fontWeight: 600 as const,
      formatter: (params: any) => formatValue(postes[params.dataIndex]?.delta ?? null, kind, true),
    },
    labelLayout: { hideOverlap: true },
  };

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    grid: { left: 8, right: 96, top: 16, bottom: 26, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      ...baseTooltip(tokens),
      formatter: (params: any) => {
        const index = params?.[0]?.dataIndex;
        const poste = postes[index];
        if (!poste) return "";
        const line = (name: string, value: number) =>
          `<div style="display:flex;justify-content:space-between;gap:18px">`
          + `<span style="color:${tokens.inkSecondary}">${name}</span>`
          + `<b>${formatValue(value, kind, true)}</b></div>`;
        return `<div style="font-weight:650;margin-bottom:4px">${poste.label}</div>`
          + line("Effet volume", poste.volume)
          + line("Effet coût moyen", poste.cost)
          + line("Écart total", poste.delta)
          + `<div style="margin-top:6px;color:${tokens.inkMuted};font-size:11px">`
          + `Coût moyen ${formatValue(poste.unitFrom, "money")} → ${formatValue(poste.unitTo, "money")}</div>`;
      },
    },
    xAxis: {
      type: "value",
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens, 12), formatter: (value: number) => formatValue(value, kind) },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    yAxis: {
      type: "category",
      data: labels,
      axisLine: { lineStyle: { color: tokens.line } },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens, 12), width: 190, overflow: "truncate" },
      splitLine: { show: false },
    },
    series: [series] as EChartsOption["series"],
  } as EChartsOption;
}
