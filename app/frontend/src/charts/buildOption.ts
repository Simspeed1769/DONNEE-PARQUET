import type { EChartsOption } from "echarts";
import type { ChartTokens } from "./tokens";
import { paletteColor, seriesColor } from "./tokens";
import { formatValue, scaleFor } from "../utils";

export type ChartForm = "line" | "area" | "bar" | "stack" | "share" | "rank" | "slope"
  | "waterfall" | "pie" | "shareArea" | "diverging" | "heatmap" | "pyramid";

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
  /** Ce que le classement met en rang. `series` compare des séries entre elles
   *  sur leur dernière valeur connue — c'est la lecture de DAMIR Comparer.
   *  `category` classe les catégories d'une série unique : les régions, les
   *  tranches d'âge, les causes. Sans mention, on garde `series`. */
  rankBy?: "series" | "category";
  /** Ce que portent les catégories : « Année », « Région », « Cause de décès ».
   *  Un axe dont on ignore la nature se lit de travers — et une image exportée
   *  n'a personne pour l'expliquer. Le titre suit l'axe des modalités, qui
   *  bascule en ordonnée sur les formes horizontales. */
  xTitle?: string;
  /** Les positions qui portent un marqueur, sur une courbe.
   *
   *  Cinquante-deux années de population donnaient cinquante-deux points
   *  collés : un pointillé, pas une courbe. Le tracé garde **toutes** ses
   *  valeurs — rien n'est caché — mais ne pose ses marques et ses graduations
   *  que sur les positions indiquées. Absent, toutes les positions en portent. */
  markers?: Set<number>;
};

const AXIS_NAME_GAP = 30;
/** La largeur réservée à une étiquette de bout de courbe, dans la marge de
 *  droite du tracé. Au-delà, le nom est tronqué plutôt que débordé. */
const END_LABEL_WIDTH = 118;

/** La place qu'il faut au-dessus du tracé pour le nom de l'axe des valeurs.
 *
 *  ECharts écrit ce nom **au-dessus** de la grille, sans l'inclure dans le
 *  calcul de `containLabel`. Avec 16 px de marge haute, « % de la population de
 *  référence Cnam » était coupé horizontalement en deux : on ne lisait que le
 *  bas des lettres. Il faut l'écart au sommet de l'axe plus la hauteur d'une
 *  ligne. */
const VALUE_NAME_TOP = 30;

/** Le nom de l'axe des **valeurs** d'une forme horizontale — classement,
 *  cascade, écarts — se pose au milieu, **sous** l'axe.
 *
 *  ECharts le mettrait par défaut au bout de l'axe, c'est-à-dire en haut à
 *  droite du tracé : exactement là où arrive l'étiquette de la plus longue
 *  barre. Les deux textes se superposaient et devenaient illisibles tous les
 *  deux. Sous l'axe, la place est libre. */
function horizontalValueName(tokens: ChartTokens, label: string) {
  return {
    name: label,
    nameLocation: "middle" as const,
    nameGap: 26,
    nameTextStyle: { color: tokens.inkMuted, fontSize: 11, fontFamily: tokens.font },
  };
}

/** La hauteur qu'il faut au-dessus d'une forme horizontale pour que le titre
 *  des modalités ne soit pas rogné par le bord du conteneur : l'écart à l'axe,
 *  plus une ligne de texte, plus une marge de sécurité. */
const CATEGORY_NAME_TOP = 34;

/** Le même titre, pour un axe de modalités devenu vertical. Écrit en haut de
 *  l'axe plutôt qu'en son milieu : au milieu, il faudrait le coucher, et un
 *  libellé pivoté se lit mal.
 *
 *  Sur un axe inversé — le classement, la cascade — le haut est le *début* de
 *  l'axe et non sa fin : sans ce détour, le titre irait se poser en bas, contre
 *  les graduations de l'axe des valeurs. */
function verticalAxisName(tokens: ChartTokens, title: string | undefined, inverse = false) {
  return title
    ? {
      name: title,
      nameLocation: (inverse ? "start" : "end") as "start" | "end",
      nameGap: 14,
      nameTextStyle: {
        color: tokens.inkSecondary, fontSize: 12, fontFamily: tokens.font,
        // Le texte s'étend vers la **droite**, dans l'aire du tracé. Aligné à
        // droite il partait vers la gauche depuis l'axe, c'est-à-dire dans la
        // gouttière des libellés puis hors du cadre : on n'en lisait que la fin.
        align: "left" as const,
      },
    }
    : {};
}

function axisName(tokens: ChartTokens, title: string | undefined) {
  return title
    ? {
      name: title,
      nameLocation: "middle" as const,
      nameGap: AXIS_NAME_GAP,
      nameTextStyle: { color: tokens.inkSecondary, fontSize: 12, fontFamily: tokens.font },
    }
    : {};
}

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
  if (input.unitLabel.includes("/")) return { divisor: scale.divisor, label: `${scale.label}/unité` };
  // « M unités » ne dit pas ce qu'on compte. L'appelant sait de quoi il s'agit
  // — des patients, des décès, des personnes — et c'est son mot qu'on garde,
  // précédé du seul multiplicateur.
  if (input.kind === "quantity" && input.unitLabel) {
    const multiplier = scale.label.replace(/\s*unités$/, "").trim();
    return { divisor: scale.divisor, label: multiplier ? `${multiplier} ${input.unitLabel}` : input.unitLabel };
  }
  return { divisor: scale.divisor, label: scale.label };
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

type RankRow = { label: string; note: string; value: number | null; color: string };

function rankOption(input: ChartInput, scale: { label: string },
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
function divergingOption(input: ChartInput, scale: { label: string },
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
function heatmapOption(input: ChartInput): EChartsOption {
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
function pyramidOption(input: ChartInput, scale: { label: string },
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

function slopeOption(input: ChartInput, scale: { label: string },
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
