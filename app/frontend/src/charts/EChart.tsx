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

/** Ce qui identifie l'apparence courante : la palette et le thème.
 *
 *  Les deux vivent en attributs sur la racine du document et changent les
 *  couleurs sans toucher aux données. C'est exactement le cas que la transition
 *  universelle traite mal — voir `withoutMorphing`. */
function styleEpoch(): string {
  const root = document.documentElement;
  return [
    root.getAttribute("data-palette") ?? "red",
    root.getAttribute("data-theme")
      ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
  ].join(":");
}

/** La même option, transition universelle éteinte.
 *
 *  **Pourquoi il faut l'éteindre quand seules les couleurs changent.** La
 *  transition universelle apparie les marques de l'ancien tracé à celles du
 *  nouveau pour les faire morpher. Quand les données sont identiques et que
 *  seule la palette a bougé, l'appariement est parfait — et ECharts **garde les
 *  éléments existants avec leur style**. Le tracé restait donc rouge après un
 *  passage au bleu, l'infobulle reprenait `row.color`, c'est-à-dire la couleur
 *  périmée, et la surbrillance avec. Le restylage n'arrivait qu'au changement
 *  suivant de forme ou de donnée.
 *
 *  Sans appariement, ECharts refait ses éléments et anime la couleur : c'est la
 *  bascule douce attendue, sans remonter l'instance. */
function withoutMorphing(option: EChartsOption): EChartsOption {
  const series = (option as { series?: unknown }).series;
  if (!Array.isArray(series)) return option;
  return {
    ...option,
    series: series.map((item: any) => (
      item && typeof item === "object" ? { ...item, universalTransition: { enabled: false } } : item
    )),
  } as EChartsOption;
}

function withMorphing(option: EChartsOption): EChartsOption {
  const series = (option as { series?: unknown }).series;
  if (!Array.isArray(series)) return option;
  if (reducedMotion()) {
    return { ...withoutMorphing(option), animation: false } as EChartsOption;
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
  /** L'apparence du rendu précédent, pour reconnaître un changement de palette
   *  ou de thème — le seul cas où le morphing doit se taire. */
  const epoch = useRef(styleEpoch());

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
    // Changement de palette ou de thème : on rejoue l'option sans appariement,
    // sans quoi les marques survivraient avec leurs anciennes couleurs.
    const current = styleEpoch();
    const restyled = current !== epoch.current;
    epoch.current = current;
    // Une infobulle affichée au moment de la bascule garde son HTML jusqu'au
    // prochain mouvement de souris : elle montrerait l'ancienne palette une
    // dernière fois. On la referme, le survol suivant la redessine.
    if (restyled) chart.dispatchAction({ type: "hideTip" });
    chart.setOption(restyled ? withoutMorphing(option) : withMorphing(option),
                    { notMerge: true, lazyUpdate: true });
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
