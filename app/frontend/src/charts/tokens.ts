import { useEffect, useState } from "react";

/** Jetons de design lus depuis le CSS, afin que le graphique et l'interface
 *  ne puissent pas diverger : une seule définition des couleurs. */
export type ChartTokens = {
  mode: "light" | "dark";
  surface: string;
  ink: string;
  inkSecondary: string;
  inkMuted: string;
  line: string;
  grid: string;
  accent: string;
  /** La teinte d'une série seule au graphique : elle suit la palette choisie
   *  (rouge par défaut, bleue au besoin) là où l'accent de marque, lui, ne
   *  bouge jamais. */
  accentChart: string;
  good: string;
  critical: string;
  series: string[];
  seriesOther: string;
  ramp: string[];
  /** Échelle de part et d'autre d'un pivot : l'indice de spécialisation. */
  diverge: string[];
  /** Territoire sans donnée — distinct d'une valeur basse. */
  mapVoid: string;
  font: string;
};

const SERIES_SLOTS = 8;
const RAMP_STEPS = 8;
const DIVERGE_STEPS = 7;

function read(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return styles.getPropertyValue(name).trim() || fallback;
}

export function readTokens(): ChartTokens {
  const styles = getComputedStyle(document.documentElement);
  const explicit = document.documentElement.getAttribute("data-theme");
  const mode: "light" | "dark" = explicit === "dark" ? "dark"
    : explicit === "light" ? "light"
    : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  return {
    mode,
    surface: read(styles, "--surface", "#ffffff"),
    ink: read(styles, "--ink", "#14130f"),
    inkSecondary: read(styles, "--ink-secondary", "#4e4c45"),
    inkMuted: read(styles, "--ink-muted", "#7d7a71"),
    line: read(styles, "--line", "#e4e2db"),
    grid: read(styles, "--grid", "#eceae3"),
    accent: read(styles, "--accent", "#d8383c"),
    accentChart: read(styles, "--accent-chart", "#d8383c"),
    good: read(styles, "--good-text", "#006300"),
    critical: read(styles, "--critical-text", "#a32020"),
    series: Array.from({ length: SERIES_SLOTS }, (_, index) =>
      read(styles, `--series-${index + 1}`, "#2a78d6")),
    seriesOther: read(styles, "--series-other", "#9a968c"),
    ramp: Array.from({ length: RAMP_STEPS }, (_, index) =>
      read(styles, `--ramp-${index + 1}`, "#2a78d6")),
    diverge: Array.from({ length: DIVERGE_STEPS }, (_, index) =>
      read(styles, `--diverge-${index + 1}`, "#2a78d6")),
    mapVoid: read(styles, "--map-void", "#e8e6df"),
    font: read(styles, "--font", "system-ui, sans-serif"),
  };
}

/** Les jetons du thème **clair**, quel que soit le thème affiché.
 *
 *  Une image exportée circule hors de l'outil : elle est projetée, collée dans
 *  une présentation, imprimée. Un fond sombre y devient un rectangle noir dans
 *  un document blanc. L'export compose donc toujours en clair — et il ne peut
 *  pas se contenter de lire les jetons courants, qui sont ceux du thème à
 *  l'écran.
 *
 *  Les valeurs claires vivent dans le `:root` de base de theme.css ; le sombre
 *  n'arrive que par `@media (prefers-color-scheme: dark)` — désarmé par
 *  `:where(:not([data-theme="light"]))` — ou par `:root[data-theme="dark"]`.
 *  Poser `data-theme="light"` le temps d'une lecture neutralise donc les deux.
 *  La restitution est synchrone : le navigateur recalcule les styles pour
 *  répondre à `getComputedStyle`, mais ne repeint pas avant la fin de la tâche,
 *  si bien que l'écran ne clignote pas.
 */
export function readLightTokens(): ChartTokens {
  const root = document.documentElement;
  const previous = root.getAttribute("data-theme");
  root.setAttribute("data-theme", "light");
  try {
    return { ...readTokens(), mode: "light" };
  } finally {
    if (previous === null) root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", previous);
  }
}

/** Suit à la fois la bascule manuelle et le réglage du système. */
export function useChartTokens(): ChartTokens {
  const [tokens, setTokens] = useState<ChartTokens>(readTokens);

  useEffect(() => {
    const refresh = () => setTokens(readTokens());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", refresh);
    const observer = new MutationObserver(refresh);
    observer.observe(document.documentElement, {
      attributes: true, attributeFilter: ["data-theme", "data-palette"],
    });
    return () => {
      media.removeEventListener("change", refresh);
      observer.disconnect();
    };
  }, []);

  return tokens;
}

/** La couleur suit l'entité, jamais son rang : un filtre qui retire une série
 *  ne doit pas repeindre les survivantes. L'index passé est donc l'index
 *  stable de la modalité, pas sa position dans la vue courante. */
export function seriesColor(tokens: ChartTokens, index: number, isOther = false): string {
  if (isOther) return tokens.seriesOther;
  return tokens.series[index % tokens.series.length];
}

/** La teinte d'une série **seule au graphique**.
 *
 *  Une courbe unique n'a personne dont se distinguer : la palette catégorielle
 *  n'y sert à rien, et son premier emplacement n'est qu'un choix arbitraire.
 *  Elle porte donc l'accent de marque, ce qui raccorde les graphiques au reste
 *  de l'application. Dès qu'il y a deux séries, c'est la palette qui reprend la
 *  main : là, la couleur doit distinguer, pas décorer.
 */
export function soloColor(tokens: ChartTokens): string {
  return tokens.accentChart;
}

/** La teinte d'une série selon qu'elle est seule ou en compagnie. */
export function paletteColor(tokens: ChartTokens, index: number, total: number,
                             isOther = false): string {
  if (isOther) return tokens.seriesOther;
  return total <= 1 ? soloColor(tokens) : seriesColor(tokens, index);
}
