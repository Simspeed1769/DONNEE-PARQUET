import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import {
  BarChart,
  CustomChart,
  HeatmapChart,
  LineChart,
  MapChart,
  PieChart,
  ScatterChart,
} from "echarts/charts";
import {
  AxisPointerComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
} from "echarts/components";
// Dans une construction élaguée, ces deux capacités ne sont pas là par défaut :
// sans elles, `universalTransition` et `labelLayout` sont ignorés en silence —
// les formes basculent d'un coup, et les étiquettes se chevauchent au lieu de
// s'effacer.
import { LabelLayout, UniversalTransition } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

echarts.use([
  BarChart,
  CustomChart,
  HeatmapChart,
  LineChart,
  MapChart,
  PieChart,
  ScatterChart,
  AxisPointerComponent,
  DatasetComponent,
  GraphicComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
  VisualMapComponent,
  LabelLayout,
  UniversalTransition,
  CanvasRenderer,
]);

/** Séries qu'on ne fait pas morpher.
 *
 *  Une carte n'a pas de marque à rattacher à une barre : sa géométrie *est* le
 *  fond de carte, et tenter de l'interpoler produit un fondu de territoires
 *  qui ne veut rien dire. Le rendu personnalisé, lui, dessine ses formes à la
 *  main et n'a pas d'identité à suivre. */
const NO_MORPH = new Set(["map", "custom"]);

/** Attache à chaque série son identité de transition.
 *
 *  `seriesKey` dit à ECharts quelles marques sont « la même chose » d'une forme
 *  à l'autre. Sans lui, il rapprocherait les séries par leur position, et
 *  changer de forme après avoir retiré une série ferait glisser les marques les
 *  unes dans les autres.
 */
/** Le réglage système « réduire les animations ».
 *
 *  Une transition morphée est précisément ce qu'il demande d'éteindre : elle
 *  déplace des marques sur tout l'écran. On la coupe donc à la source plutôt
 *  que de la laisser jouer plus vite — un mouvement bref reste un mouvement. */
function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function withMorphing(option: EChartsOption): EChartsOption {
  const series = (option as { series?: unknown }).series;
  if (!Array.isArray(series)) return option;
  if (reducedMotion()) {
    return {
      ...option,
      animation: false,
      series: series.map((item: any) => (
        item && typeof item === "object" ? { ...item, universalTransition: { enabled: false } } : item
      )),
    } as EChartsOption;
  }
  return {
    ...option,
    series: series.map((item: any) => (
      item && typeof item === "object" && !NO_MORPH.has(item.type)
        ? {
          ...item,
          universalTransition: {
            enabled: true,
            seriesKey: item.id ?? item.name,
            // Quand rien ne s'apparie — on change de lecture, pas seulement de
            // forme — les marques se divisent et se recombinent au lieu de
            // disparaître d'un bloc. C'est ce qui donne le même enchaînement
            // entre Évolution, Territoire et Sexe qu'entre deux formes d'une
            // même lecture.
            divideShape: "clone" as const,
          },
        }
        : item
    )),
  } as EChartsOption;
}

type Props = {
  option: EChartsOption;
  height: number;
  /** Marque le rendu comme périmé sans provoquer de saut de mise en page :
   *  on garde le tracé précédent en opacité réduite au lieu d'un squelette. */
  stale?: boolean;
  ariaLabel: string;
  onInstance?: (instance: echarts.ECharts | null) => void;
};

/** La durée du seul fondu qui reste : celui qui signale un tracé périmé
 *  pendant qu'une requête est en vol. */
const FADE_MS = 130;

export function EChart({ option, height, stale = false, ariaLabel, onInstance }: Props) {
  const container = useRef<HTMLDivElement | null>(null);
  const instance = useRef<echarts.ECharts | null>(null);
  const notify = useRef(onInstance);
  notify.current = onInstance;

  useEffect(() => {
    if (!container.current) return;
    const chart = echarts.init(container.current, undefined, { renderer: "canvas" });
    instance.current = chart;
    notify.current?.(chart);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      notify.current?.(null);
      chart.dispose();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = instance.current;
    if (!chart) return;

    // `notMerge` : les séries changent de nombre et de type d'une lecture à
    // l'autre ; une fusion laisserait traîner celles de la vue précédente.
    //
    // Mais `notMerge` seul fait basculer d'une forme à l'autre d'un coup sec.
    // La transition universelle rattache les marques d'une forme à celles de la
    // suivante : une barre devient sa part de camembert, une colonne devient
    // son point de courbe. C'est ce qui rend le changement lisible — on **voit**
    // que c'est la même donnée sous un autre angle.
    //
    // Un fondu manuel encadrait auparavant les passages vers ou depuis une
    // carte. Il partait d'une bonne intention et produisait l'inverse : le
    // conteneur passait à l'opacité zéro *avant* qu'ECharts commence à dessiner
    // le fond de carte, si bien qu'on regardait un rectangle vide pendant tout
    // le temps du rendu. Le blanc n'était pas la transition, c'était l'attente.
    // ECharts enchaîne très bien seul ; on le laisse faire.
    chart.setOption(withMorphing(option), { notMerge: true, lazyUpdate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option]);

  useEffect(() => {
    instance.current?.resize();
  }, [height]);

  return (
    <div
      ref={container}
      role="img"
      aria-label={ariaLabel}
      style={{ width: "100%", height: `${height}px`, opacity: stale ? 0.5 : 1, transition: `opacity ${FADE_MS}ms` }}
    />
  );
}

export type { EChartsOption };
export { echarts };
