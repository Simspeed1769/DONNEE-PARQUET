/** Le modèle de DAMIR Comparer : ses axes, ses vues, son adresse.
 *
 *  Séparé du composant au point 2.4. Ce qui vit ici ne rend rien : ce sont les
 *  **règles** de l'écran — selon quoi on peut comparer, quelles formes existent
 *  et à quelle question chacune répond, et comment tout cela se lit dans
 *  l'adresse. Le composant, lui, ne fait plus que les appliquer.
 *
 *  C'est la règle d'organisation du dépôt, tenue sur les cinq bases : le modèle
 *  d'un côté, les builders de graphiques de l'autre, aucune règle dans le JSX.
 */

import type { ChartForm } from "../charts/buildOption";
import type { Reading } from "../explore/model";
import type { SeriesScope } from "../explore/seriesScope";

export type BreakdownKey = "grand_post" | "post" | "sub_post" | "service" | "region" | "age" | "sex" | "year";

/** `field` est ce qu'on envoie à `/api/explore` ; `null` pour Année, qui
 *  n'est pas une dimension du serveur — elle demande simplement de ne pas en
 *  choisir une, et l'axe du temps reste l'axe du temps. */
export const BREAKDOWNS: Array<{ key: BreakdownKey; label: string; field: string | null }> = [
  { key: "grand_post", label: "Grands postes", field: "grand_post" },
  { key: "post", label: "Postes", field: "post" },
  { key: "sub_post", label: "Sous-postes", field: "sub_post" },
  { key: "service", label: "Prestations", field: "service" },
  { key: "region", label: "Région", field: "region" },
  { key: "age", label: "Âge", field: "age" },
  { key: "sex", label: "Sexe", field: "sex" },
  { key: "year", label: "Année", field: null },
];

export type ViewKey = "line" | "bar" | "rank" | "index" | "change" | "pie"
  | "shareArea" | "diverging" | "heatmap";

export type View = {
  key: ViewKey;
  label: string;
  form: ChartForm;
  reading: Reading;
  needsAdditive?: boolean;
  /** Forme qui compose un tout à partir des séries : elle ment dès qu'elles ne
   *  portent pas sur la même population. */
  cumulative?: boolean;
  /** Nombre d'années sous lequel la forme n'a rien à montrer : une déformation
   *  dans le temps demande au moins deux points, un écart aussi. */
  needsYears?: number;
  /** Nombre de séries sous lequel la forme est moins lisible que celles qu'elle
   *  remplacerait : une carte de chaleur à deux lignes est un tableau. */
  needsSeries?: number;
  question: string;
};

/** Les six vues de l'ancienne comparaison des prestations, reprises telles
 *  quelles : l'empilement de l'ancienne comparaison libre n'y figurait pas,
 *  il ne revient pas ici non plus. */
export const VIEWS: View[] = [
  { key: "line", label: "Courbes", form: "line", reading: "value", question: "Combien, et comment cela évolue-t-il ?" },
  { key: "bar", label: "Barres", form: "bar", reading: "value", question: "Combien, année par année ?" },
  { key: "rank", label: "Classement", form: "rank", reading: "value", question: "Laquelle pèse le plus ?" },
  { key: "index", label: "Base 100", form: "line", reading: "index", question: "Laquelle progresse le plus vite, quelle que soit sa taille ?" },
  { key: "change", label: "Variation", form: "bar", reading: "change", question: "De combien chacune varie-t-elle d'une année sur l'autre ?" },
  { key: "pie", label: "Camembert", form: "pie", reading: "value", needsAdditive: true, cumulative: true, question: "Comment le total se partage-t-il ?" },
  // « Aires 100 % » promettrait un empilement qui remplit la hauteur ; les
  // séries retenues ne pèsent qu'une partie du total, et le reste n'est pas
  // dessiné quand « Autres » est masqué. Le nom dit donc la forme, et l'axe dit
  // la part.
  { key: "shareArea", label: "Aires empilées", form: "shareArea", reading: "share", needsAdditive: true, cumulative: true, needsYears: 2, question: "Comment le partage du total se déforme-t-il d’une année à l’autre ?" },
  { key: "diverging", label: "Écarts", form: "diverging", reading: "value", needsYears: 2, question: "Qui progresse, qui recule sur la période ?" },
  { key: "heatmap", label: "Carte de chaleur", form: "heatmap", reading: "value", needsYears: 2, needsSeries: 4, question: "Où et quand est-ce le plus fort ?" },
];

export const MAX_SERIES = 8;
export const SERIES_COUNTS = [2, 5, 8] as const;
export const CHART_HEIGHT = 452;

export function breakdownFromParams(params: URLSearchParams): BreakdownKey {
  const raw = params.get("compare_by");
  return BREAKDOWNS.some((item) => item.key === raw) ? raw as BreakdownKey : "grand_post";
}

export function namesFromParams(params: URLSearchParams): Record<string, string> {
  const raw = params.get("series_names");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function scopesFromParams(params: URLSearchParams): Record<string, SeriesScope> {
  const raw = params.get("series_scopes");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, SeriesScope>;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}
