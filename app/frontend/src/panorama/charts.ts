/** Les formes du panorama.
 *
 *  Chaque graphique de cet écran a vocation à quitter l'outil : il est projeté
 *  devant un public qui n'a ni la souris, ni le contexte, ni la légende
 *  mentale de celui qui l'a fabriqué. Quatre règles en découlent, et elles
 *  commandent tout ce module.
 *
 *  1. **Le graphique parle seul.** Pas de phrase de commentaire à côté, pas de
 *     chiffre répété sous le titre : ce qui doit se lire se lit sur le tracé.
 *  2. **Rien ne disparaît en silence.** Une modalité qu'une forme ne peut pas
 *     porter — l'âge inconnu sur une échelle ordinale, la région non
 *     renseignée sur une carte — sort du graphique et se dit en clair à côté.
 *     Elle ne se fond pas dans le dégradé.
 *  3. **La forme suit la question, et le nombre de sujets.** Une carte encode
 *     une valeur par territoire ; à deux sujets elle ne peut plus rien dire.
 *  4. **On ne propose jamais une forme qui mentirait.** Empiler exige une
 *     mesure qui s'additionne ; un camembert exige un tout ; un axe ordinal
 *     exige un ordre. Les formes indisponibles sont retirées du choix, pas
 *     dessinées de travers.
 *
 *  La couleur ne double jamais la longueur : un classement de territoires est
 *  d'une seule teinte, parce que la barre dit déjà la grandeur. Le dégradé est
 *  réservé à la carte, où il est la seule façon d'encoder la valeur.
 */

import type { EChartsOption } from "../charts/EChart";
import type { ChartTokens } from "../charts/tokens";
import { paletteColor, seriesColor } from "../charts/tokens";
import { FRENCH_MAP } from "../charts/frenchMap";
import { formatValue, scaleFor } from "../utils";
import type { MapReading } from "./model";

/* — Fondations communes — */

function baseTooltip(tokens: ChartTokens) {
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

/** L'indice se lit en base 100, pas en points d'écart : « 112 » et non
 *  « 112,3 pts », qui laisserait croire à une différence de pourcentages. */
function formatIndex(value: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
}

/** Bornes symétriques autour du pivot.
 *
 *  Une échelle divergente calée sur le minimum et le maximum bruts placerait
 *  le pivot ailleurs qu'au centre : un territoire à 90 apparaîtrait dans les
 *  teintes du dessus. On prend donc le plus grand écart des deux côtés.
 */
function symmetricBounds(values: Array<number | null>, center: number): [number, number] {
  const spread = values.reduce<number>((widest, value) => {
    if (value === null || !Number.isFinite(value)) return widest;
    return Math.max(widest, Math.abs(value - center));
  }, 0);
  const half = spread > 0 ? spread : Math.max(1, Math.abs(center) * 0.1);
  return [center - half, center + half];
}

/** Le nom de l'axe des modalités.
 *
 *  Un axe dont on ignore la nature se lit de travers, et une image exportée n'a
 *  personne pour l'expliquer. Horizontal, le titre se pose au milieu sous
 *  l'axe ; vertical, il se pose en haut — au milieu, il faudrait le coucher, et
 *  un libellé pivoté se lit mal.
 */
const AXIS_NAME_GAP = 30;

function axisName(tokens: ChartTokens, title: string | undefined, vertical = false) {
  if (!title) return {};
  return vertical
    ? {
      name: title,
      nameLocation: "end" as const,
      nameGap: 12,
      nameTextStyle: { ...axisLabelStyle(tokens, 12), align: "right" as const },
    }
    : {
      name: title,
      nameLocation: "middle" as const,
      nameGap: AXIS_NAME_GAP,
      nameTextStyle: axisLabelStyle(tokens, 12),
    };
}

export type ChartRow = {
  key: string;
  label: string;
  /** Emplacement de couleur **de l'entité**, jamais son rang dans la vue :
   *  retirer un sujet ne doit pas repeindre les survivants. */
  colorIndex: number;
  values: Array<number | null>;
};

/** Teinte d'accompagnement, dérivée de la couleur de série plutôt que grise :
 *  un aplat gris sous une courbe colorée se lit comme une seconde série. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (!hex.startsWith("#")) return hex;
  const full = hex.length === 4
    ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
    : hex;
  const red = parseInt(full.slice(1, 3), 16);
  const green = parseInt(full.slice(3, 5), 16);
  const blue = parseInt(full.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/** Infobulle commune aux formes à catégories : une ligne par série, la valeur
 *  lue sur la donnée d'origine et non sur l'échelle du tracé. */
function categoryTooltip(rows: ChartRow[], kind: string, tokens: ChartTokens,
                         pointer: "line" | "shadow") {
  return {
    trigger: "axis" as const,
    ...baseTooltip(tokens),
    axisPointer: pointer === "line"
      ? { type: "line" as const, lineStyle: { color: tokens.line, width: 1 } }
      : { type: "shadow" as const, shadowStyle: { color: withAlpha(tokens.inkMuted, 0.08) } },
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
  };
}

/* — 1. Séries dans le temps : évolution et sexe partagent ces formes — */

/** Les formes qu'une suite annuelle accepte. */
export type SeriesForm = "line" | "bar" | "area" | "index";

export type SeriesInput = {
  years: number[];
  rows: ChartRow[];
  kind: string;
  tokens: ChartTokens;
  /** Dernière année consolidée. Au-delà, la donnée bouge encore : la zone est
   *  marquée dans le graphique, faute de quoi le dernier point serait lu comme
   *  un retournement alors qu'il n'est qu'incomplet. */
  consolidatedThrough: number | null;
  form: SeriesForm;
};

/** La zone encore en consolidation, posée une seule fois. */
function provisionalMark(years: number[], consolidatedThrough: number | null,
                         tokens: ChartTokens) {
  const from = consolidatedThrough === null
    ? -1
    : years.findIndex((year) => year > consolidatedThrough);
  if (from < 0) return undefined;
  return {
    silent: true,
    itemStyle: { color: withAlpha(tokens.inkMuted, tokens.mode === "dark" ? 0.14 : 0.08) },
    label: {
      show: true,
      position: "insideTop" as const,
      distance: 6,
      color: tokens.inkMuted,
      fontFamily: tokens.font,
      fontSize: 11,
      formatter: "en consolidation",
    },
    data: [[{ xAxis: String(years[from]) }, { xAxis: String(years[years.length - 1]) }]],
  };
}

/** La trajectoire, sous la forme choisie.
 *
 *  Les montants écrits sur chaque point encombraient la lecture qu'ils
 *  devaient servir : ce qu'on regarde ici est une pente, pas dix nombres. Les
 *  valeurs restent au survol et dans le tableau. Seules les formes à peu de
 *  colonnes — deux ou trois années côte à côte — les portent en clair, parce
 *  qu'alors la comparaison *est* la lecture.
 */
export function seriesOption({
  years, rows, kind, tokens, consolidatedThrough, form,
}: SeriesInput): EChartsOption {
  const stacked = form === "area";
  const asBar = form === "bar";
  const single = rows.length === 1;

  const flat = rows.flatMap((row) => row.values.filter((value): value is number => value !== null));
  const scale = scaleFor(flat, kind);
  const mark = provisionalMark(years, consolidatedThrough, tokens);

  // Peu de colonnes : la valeur tient au-dessus de chacune, et la comparaison
  // se lit sans survol — donc aussi une fois projetée.
  const columnLabels = asBar && years.length <= 6;

  const series = rows.map((row, index) => {
    const color = paletteColor(tokens, row.colorIndex, rows.length);
    const data = row.values.map((value) => (value === null ? null : value / scale.divisor));

    if (asBar) {
      return {
        id: row.key,
        name: row.label,
        type: "bar" as const,
        data,
        color,
        barMaxWidth: single ? (years.length <= 3 ? 96 : 52) : 34,
        itemStyle: { color, borderRadius: [4, 4, 0, 0] as [number, number, number, number] },
        emphasis: { focus: "series" as const },
        label: columnLabels ? {
          show: true,
          position: "top" as const,
          distance: 8,
          color: tokens.inkSecondary,
          fontFamily: tokens.font,
          fontSize: 13,
          fontWeight: 650 as const,
          formatter: (params: any) => readable(row.values[params.dataIndex], kind),
        } : { show: false },
        labelLayout: columnLabels ? { hideOverlap: true } : undefined,
        markArea: index === 0 ? mark : undefined,
      };
    }

    return {
      id: row.key,
      name: row.label,
      type: "line" as const,
      data,
      color,
      stack: stacked ? "total" : undefined,
      smooth: false,
      symbol: "circle",
      symbolSize: single ? 8 : 7,
      lineStyle: { width: single ? 3 : 2.25, color },
      itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
      emphasis: { focus: "series" as const },
      areaStyle: stacked
        ? { color, opacity: tokens.mode === "dark" ? 0.34 : 0.22 }
        : single ? {
          color: {
            type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(color, tokens.mode === "dark" ? 0.34 : 0.22) },
              { offset: 1, color: withAlpha(color, 0) },
            ],
          },
        } : undefined,
      // L'étiquette en bout de courbe évite que la couleur porte seule
      // l'identité. Au-delà de six séries elles se chevauchent : c'est alors
      // la légende, sous le graphique, qui la porte.
      endLabel: !single && rows.length <= 6 ? {
        show: true,
        formatter: () => row.label,
        color: tokens.inkSecondary,
        fontFamily: tokens.font,
        fontSize: 12,
        distance: 8,
      } : { show: false },
      markArea: index === 0 ? mark : undefined,
    };
  });

  const directLabels = !single && rows.length <= 6 && !asBar;

  return {
    animationDuration: 420,
    animationEasing: "cubicOut",
    backgroundColor: "transparent",
    grid: {
      left: 12,
      right: directLabels ? 148 : 24,
      // Le nom de l'axe des valeurs s'écrit au-dessus de la grille sans entrer
      // dans `containLabel` : sans cette marge, il est coupé en deux.
      top: columnLabels ? 44 : 30,
      // `containLabel` ne tient pas compte du nom de l'axe.
      bottom: AXIS_NAME_GAP,
      containLabel: true,
    },
    tooltip: categoryTooltip(rows, kind, tokens, asBar ? "shadow" : "line"),
    xAxis: {
      type: "category",
      data: years.map(String),
      boundaryGap: asBar,
      ...axisName(tokens, "Année"),
      axisLine: { lineStyle: { color: tokens.line } },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens, 12), hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      name: scale.label,
      nameTextStyle: { ...axisLabelStyle(tokens, 11), align: "left" },
      nameGap: 14,
      // Un axe tronqué exagère la pente : sur un cumul, il part de zéro. Un
      // indice base 100, lui, se lit autour de son pivot.
      min: kind === "money" || kind === "quantity" ? 0 : undefined,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: axisLabelStyle(tokens, 12),
      splitLine: { lineStyle: { color: tokens.grid } },
      // Le repère du 100 rend l'indice lisible : sans lui, deux courbes qui
      // montent ne disent pas laquelle a dépassé son point de départ.
      ...(kind === "base100" ? {
        axisLine: { show: false },
      } : {}),
    },
    series: series.map((item, index) => (
      kind === "base100" && index === 0
        ? {
          ...item,
          markLine: {
            silent: true,
            symbol: "none" as const,
            lineStyle: { color: tokens.ink, type: "dashed" as const, width: 1.25, opacity: 0.45 },
            label: {
              show: true, position: "end" as const, formatter: "100",
              color: tokens.inkMuted, fontFamily: tokens.font, fontSize: 11,
            },
            data: [{ yAxis: 100 }],
          },
        }
        : item
    )) as EChartsOption["series"],
  } as EChartsOption;
}

/* — 2. Territoire — */

export type TerritoryForm = "map" | "rank";

export type TerritoryInput = {
  reading: MapReading;
  labels: Map<string, string>;
  tokens: ChartTokens;
  kind: string;
  highlighted: string | null;
};

/** La carte, seule et à ses proportions.
 *
 *  Étalée sur toute la largeur d'un panneau, la France se déformait : le cadre
 *  imposait son rapport, et la silhouette n'était plus reconnaissable.
 *  `layoutCenter` et `layoutSize` la cadrent sur le **côté le plus court** du
 *  panneau, ce qui lui rend sa forme quelle que soit la largeur de l'écran.
 */
export function territoryOption({
  reading, labels, tokens, kind, highlighted,
}: TerritoryInput): EChartsOption {
  const entries = [...reading.values.entries()].filter(([, value]) => value !== null);
  const numeric = entries.map(([, value]) => value);
  const center = reading.center;
  const bounds = center !== null
    ? symmetricBounds(numeric, center)
    : [
      Math.min(...numeric.filter((value): value is number => value !== null), 0),
      Math.max(...numeric.filter((value): value is number => value !== null), 0),
    ] as [number, number];

  const palette = center !== null ? tokens.diverge : tokens.ramp;
  const show = (value: number) =>
    reading.kind === "index" ? formatIndex(value) : formatValue(value, kind);

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    tooltip: {
      ...baseTooltip(tokens),
      trigger: "item",
      formatter: (params: any) => {
        const label = labels.get(params.name) ?? params.name;
        if (params.value === undefined || params.value === null || Number.isNaN(params.value)) {
          return `<strong>${label}</strong><br><span style="color:${tokens.inkMuted}">Pas de donnée sur ce périmètre</span>`;
        }
        return `<strong>${label}</strong><br>${show(params.value)}`
          + (reading.kind === "index"
            ? `<br><span style="color:${tokens.inkMuted}">100 = le territoire recourt à hauteur de son poids</span>`
            : "");
      },
    },
    // L'échelle est posée assez haut pour que ses deux bornes chiffrées tiennent
    // dans le canevas : collée au bord, elle perdait ses étiquettes et ne disait
    // plus que « plus foncé ici ».
    visualMap: {
      type: "continuous",
      min: bounds[0],
      max: bounds[1],
      show: true,
      seriesIndex: 0,
      calculable: false,
      orient: "horizontal",
      left: "center",
      bottom: 8,
      itemWidth: 14,
      itemHeight: 160,
      textGap: 10,
      textStyle: axisLabelStyle(tokens, 12),
      // `text[0]` est la borne haute.
      text: [show(bounds[1]), show(bounds[0])],
      formatter: (value: number) => show(value),
      inRange: { color: palette },
    },
    series: [{
      id: "territory",
      type: "map" as const,
      map: FRENCH_MAP,
      roam: false,
      // Cadrage explicite : `layoutSize` en pourcentage se rapporte au côté le
      // plus court, donc à la hauteur. La carte garde son rapport d'aspect au
      // lieu d'être étirée à la largeur du panneau.
      layoutCenter: ["50%", "46%"],
      layoutSize: "92%",
      // Le fond porte la Corse, que le cube DAMIR ne renseigne pas : elle reste
      // dessinée mais sans couleur, faute de quoi son absence passerait pour
      // une valeur nulle.
      itemStyle: {
        areaColor: tokens.mapVoid,
        borderColor: tokens.surface,
        borderWidth: 1,
      },
      emphasis: {
        itemStyle: { areaColor: undefined, borderColor: tokens.ink, borderWidth: 1.5 },
        label: { show: false },
      },
      select: { disabled: true },
      label: { show: false },
      data: entries.map(([key, value]) => ({
        name: key,
        value: value as number,
        itemStyle: highlighted === key
          ? { borderColor: tokens.ink, borderWidth: 2.5 }
          : undefined,
      })),
    }],
  } as EChartsOption;
}

/** Le même territoire, en classement.
 *
 *  La carte montre *où*, le classement montre *combien* — et permet de lire
 *  l'écart entre deux régions, ce qu'un dégradé ne donne jamais. Les barres
 *  sont **d'une seule teinte** : leur longueur porte déjà la grandeur, et la
 *  recolorer par valeur brûlerait le seul canal libre pour redire la même
 *  chose.
 */
export function territoryRankOption({
  reading, labels, tokens, kind, highlighted,
}: TerritoryInput): EChartsOption {
  const ranked = [...reading.values.entries()]
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .sort((left, right) => right[1] - left[1]);
  const show = (value: number) =>
    reading.kind === "index" ? formatIndex(value) : formatValue(value, kind);

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    tooltip: {
      ...baseTooltip(tokens),
      trigger: "item",
      formatter: (params: any) =>
        `<strong>${labels.get(ranked[params.dataIndex]?.[0]) ?? params.name}</strong><br>`
        + show(params.value),
    },
    grid: { left: 12, right: 96, top: 24, bottom: 8, containLabel: true },
    xAxis: {
      type: "value",
      show: false,
      max: reading.kind === "index" ? undefined : "dataMax",
    },
    yAxis: {
      type: "category",
      data: ranked.map(([key]) => labels.get(key) ?? key),
      inverse: true,
      ...axisName(tokens, "Région", true),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        ...axisLabelStyle(tokens, 12),
        color: tokens.inkSecondary,
        width: 190,
        overflow: "truncate",
      },
    },
    series: [{
      // `id` stable : c'est la clé que `withMorphing` donne à
      // `universalTransition`. Sans elle, ECharts rapproche les séries par
      // position et la transition depuis une autre forme part de travers.
      id: "territory",
      type: "bar" as const,
      data: ranked.map(([key, value]) => ({
        value,
        name: key,
        itemStyle: {
          // Le pivot de la rampe : une teinte pleine, qui tient le contraste
          // dans les deux thèmes et à la taille d'une projection.
          color: tokens.ramp[4],
          borderRadius: [0, 4, 4, 0] as [number, number, number, number],
          ...(highlighted === key ? { borderColor: tokens.ink, borderWidth: 1.5 } : {}),
        },
      })),
      barMaxWidth: 18,
      label: {
        show: true,
        position: "right" as const,
        distance: 8,
        color: tokens.inkSecondary,
        fontFamily: tokens.font,
        fontSize: 12,
        fontWeight: 600 as const,
        formatter: (params: any) => show(params.value),
      },
    }],
  } as EChartsOption;
}

/* — 3. Âge — */

export type AgeForm = "bar" | "hbar" | "line";

export type AgeInput = {
  /** Tranches dans leur ordre naturel. « Âge inconnu » n'y figure pas : une
   *  modalité non ordinale sur une échelle ordinale invente une pente. */
  order: Array<{ key: string; label: string }>;
  rows: ChartRow[];
  tokens: ChartTokens;
  /** Unité des valeurs : une part du sujet, ou la mesure elle-même. */
  kind: string;
  form: AgeForm;
};

/** Une distribution sur des tranches ordonnées.
 *
 *  Des colonnes disent ce qui est mesuré : une part par tranche. La courbe
 *  rend la comparaison de plusieurs sujets plus lisible qu'un peloton de
 *  barres. Les barres horizontales rendent leurs libellés — « 80 ans et plus »
 *  — lisibles sans les incliner.
 */
export function ageOption({ order, rows, tokens, kind, form }: AgeInput): EChartsOption {
  const single = rows.length === 1;
  const horizontal = form === "hbar";
  const asLine = form === "line";
  const categories = order.map((bucket) => bucket.label);

  const series = rows.map((row) => {
    const color = paletteColor(tokens, row.colorIndex, rows.length);
    if (asLine) {
      return {
        id: row.key,
        name: row.label,
        type: "line" as const,
        data: row.values,
        color,
        smooth: false,
        symbol: "circle",
        symbolSize: 8,
        lineStyle: { width: 2.25, color },
        itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
        emphasis: { focus: "series" as const },
        areaStyle: single ? {
          color: {
            type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: withAlpha(color, tokens.mode === "dark" ? 0.3 : 0.18) },
              { offset: 1, color: withAlpha(color, 0) },
            ],
          },
        } : undefined,
      };
    }
    return {
      id: row.key,
      name: row.label,
      type: "bar" as const,
      data: horizontal ? [...row.values].reverse() : row.values,
      color,
      barMaxWidth: single ? (horizontal ? 20 : 58) : 24,
      itemStyle: {
        color,
        borderRadius: (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]) as [number, number, number, number],
      },
      emphasis: { focus: "series" as const },
      // Un seul sujet en barres horizontales : la place est là, la valeur s'y
      // écrit et le graphique se lit sans survol.
      label: single && horizontal ? {
        show: true,
        position: "right" as const,
        distance: 8,
        color: tokens.inkSecondary,
        fontFamily: tokens.font,
        fontSize: 12,
        fontWeight: 600 as const,
        formatter: (params: any) => formatValue(params.value, kind),
      } : { show: false },
    };
  });

  const valueAxis = {
    type: "value" as const,
    name: kind === "percent" ? "% du sujet" : "",
    nameTextStyle: { ...axisLabelStyle(tokens, 11), align: "left" as const },
    nameGap: 14,
    min: 0,
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      ...axisLabelStyle(tokens, 12),
      formatter: (value: number) => formatValue(value, kind),
    },
    splitLine: { lineStyle: { color: tokens.grid } },
  };

  const categoryAxis = {
    type: "category" as const,
    data: horizontal ? [...categories].reverse() : categories,
    ...axisName(tokens, "Tranche d’âge", horizontal),
    axisLine: { lineStyle: { color: tokens.line } },
    axisTick: { show: false },
    axisLabel: { ...axisLabelStyle(tokens, 12), interval: 0, hideOverlap: true },
    splitLine: { show: false },
  };

  const rowsForTooltip: ChartRow[] = horizontal
    ? rows.map((row) => ({ ...row, values: [...row.values].reverse() }))
    : rows;

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    grid: horizontal
      ? { left: 12, right: single ? 84 : 24, top: 30, bottom: 12, containLabel: true }
      : { left: 12, right: 20, top: 34, bottom: AXIS_NAME_GAP, containLabel: true },
    tooltip: categoryTooltip(rowsForTooltip, kind, tokens, asLine ? "line" : "shadow"),
    xAxis: horizontal ? valueAxis : categoryAxis,
    yAxis: horizontal ? categoryAxis : valueAxis,
    series: series as EChartsOption["series"],
  } as EChartsOption;
}

/* — 4. Sexe, plusieurs sujets — */

/** Comparaison de sujets sur une seule modalité de sexe.
 *
 *  Empiler huit prestations sur dix ans donnerait quatre-vingts colonnes. La
 *  question devient alors « laquelle penche le plus », à laquelle un
 *  classement répond mieux qu'une pile.
 */
export function sexCompareOption({
  rows, tokens, modalityLabel, axisTitle,
}: { rows: ChartRow[]; tokens: ChartTokens; modalityLabel: string;
     axisTitle: string }): EChartsOption {
  const ranked = [...rows].sort((left, right) => (right.values[0] ?? 0) - (left.values[0] ?? 0));

  return {
    animationDuration: 420,
    backgroundColor: "transparent",
    grid: { left: 12, right: 72, top: 26, bottom: 12, containLabel: true },
    tooltip: {
      trigger: "item",
      ...baseTooltip(tokens),
      formatter: (params: any) =>
        `<strong>${ranked[params.dataIndex]?.label ?? ""}</strong><br>`
        + `${formatValue(params.value, "percent")} · ${modalityLabel}`,
    },
    xAxis: {
      type: "value",
      min: 0,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabelStyle(tokens, 12), formatter: (value: number) => formatValue(value, "percent") },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    yAxis: {
      type: "category",
      data: ranked.map((row) => row.label),
      inverse: true,
      ...axisName(tokens, axisTitle, true),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { ...axisLabelStyle(tokens, 12), color: tokens.inkSecondary, width: 200, overflow: "truncate" },
    },
    series: [{
      id: "sex-compare",
      type: "bar" as const,
      data: ranked.map((row) => ({
        value: row.values[0],
        itemStyle: {
          color: seriesColor(tokens, row.colorIndex),
          borderRadius: [0, 4, 4, 0] as [number, number, number, number],
        },
      })),
      barMaxWidth: 22,
      label: {
        show: true,
        position: "right" as const,
        distance: 8,
        color: tokens.inkSecondary,
        fontFamily: tokens.font,
        fontSize: 12,
        fontWeight: 600 as const,
        formatter: (params: any) => formatValue(params.value, "percent"),
      },
      markLine: {
        silent: true,
        symbol: "none" as const,
        lineStyle: { color: tokens.ink, type: "dashed" as const, width: 1.25, opacity: 0.5 },
        label: { show: true, position: "end" as const, formatter: "50 %", color: tokens.inkMuted, fontFamily: tokens.font, fontSize: 11 },
        data: [{ xAxis: 50 }],
      },
    }],
  } as EChartsOption;
}
