/** Le socle des graphiques : types, mesures d'axe, échelles.
 *
 *  Ce fichier tenait dans `buildOption.ts`, qui portait à la fois le socle, le
 *  répartiteur de formes et les six formes spécialisées — 887 lignes. Il est
 *  isolé depuis le point 2.4, **sans rien changer au rendu** : chaque constante
 *  garde sa valeur, et chaque commentaire son incident.
 */

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

export const AXIS_NAME_GAP = 30;
/** La largeur réservée à une étiquette de bout de courbe, dans la marge de
 *  droite du tracé. Au-delà, le nom est tronqué plutôt que débordé. */
export const END_LABEL_WIDTH = 118;

/** La place qu'il faut au-dessus du tracé pour le nom de l'axe des valeurs.
 *
 *  ECharts écrit ce nom **au-dessus** de la grille, sans l'inclure dans le
 *  calcul de `containLabel`. Avec 16 px de marge haute, « % de la population de
 *  référence Cnam » était coupé horizontalement en deux : on ne lisait que le
 *  bas des lettres. Il faut l'écart au sommet de l'axe plus la hauteur d'une
 *  ligne. */
export const VALUE_NAME_TOP = 30;

/** Le nom de l'axe des **valeurs** d'une forme horizontale — classement,
 *  cascade, écarts — se pose au milieu, **sous** l'axe.
 *
 *  ECharts le mettrait par défaut au bout de l'axe, c'est-à-dire en haut à
 *  droite du tracé : exactement là où arrive l'étiquette de la plus longue
 *  barre. Les deux textes se superposaient et devenaient illisibles tous les
 *  deux. Sous l'axe, la place est libre. */
export function horizontalValueName(tokens: ChartTokens, label: string) {
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
export const CATEGORY_NAME_TOP = 34;

/** Le même titre, pour un axe de modalités devenu vertical. Écrit en haut de
 *  l'axe plutôt qu'en son milieu : au milieu, il faudrait le coucher, et un
 *  libellé pivoté se lit mal.
 *
 *  Sur un axe inversé — le classement, la cascade — le haut est le *début* de
 *  l'axe et non sa fin : sans ce détour, le titre irait se poser en bas, contre
 *  les graduations de l'axe des valeurs. */
export function verticalAxisName(tokens: ChartTokens, title: string | undefined, inverse = false) {
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

export function axisName(tokens: ChartTokens, title: string | undefined) {
  return title
    ? {
      name: title,
      nameLocation: "middle" as const,
      nameGap: AXIS_NAME_GAP,
      nameTextStyle: { color: tokens.inkSecondary, fontSize: 12, fontFamily: tokens.font },
    }
    : {};
}

export const MARK_GAP = 2;

export function axisCommon(tokens: ChartTokens) {
  return {
    axisLine: { show: true, lineStyle: { color: tokens.line, width: 1 } },
    axisTick: { show: false },
    axisLabel: { color: tokens.inkMuted, fontSize: 11, fontFamily: tokens.font },
    splitLine: { show: true, lineStyle: { color: tokens.grid, width: 1, type: "solid" as const } },
  };
}

export function tooltipCommon(tokens: ChartTokens) {
  return {
    backgroundColor: tokens.surface,
    borderColor: tokens.line,
    borderWidth: 1,
    padding: [10, 12] as [number, number],
    textStyle: { color: tokens.ink, fontSize: 12, fontFamily: tokens.font },
    extraCssText: "box-shadow: 0 8px 28px rgba(0,0,0,.14); border-radius: 10px;",
  };
}

export function scaleOf(input: ChartInput) {
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
export function readable(value: number | null, kind: string): string {
  return value === null ? "—" : formatValue(value, kind);
}

// La légende vit dans le HTML de la page, pas dans le canevas : elle y est
// sélectionnable, accessible au clavier et lisible par un lecteur d'écran.
export const HTML_LEGEND = { show: false } as const;
