/** Ce que la coquille Mortalité partage avec ses deux sections.
 *
 *  Millésime, population et mesure suivent l'utilisateur d'une section à
 *  l'autre : passer du panorama à la comparaison est un changement de question,
 *  pas de sujet.
 *
 *  **Aucune dimension territoriale ici, et c'est assumé.** Le CépiDc publie des
 *  effectifs nationaux : il n'existe ni découpage régional, ni population de
 *  référence permettant un taux par habitant. Ni le panorama ni la comparaison
 *  n'offrent donc de lecture Territoire, et les réserves en donnent la raison.
 *  C'est la seule dérogation à l'uniformité des quatre bases.
 */

import type { EntityOption } from "../components/EntityPicker";
import type { MortalityMetadata, MortalityOverview } from "../types";

export type MortalityMeasure = "deaths" | "share";

export type MortalitySectionProps = {
  metadata: MortalityMetadata;
  year: number;
  population: string;
  measure: MortalityMeasure;
  setMeasure: (next: MortalityMeasure) => void;
  onOpenExtraction: (params: URLSearchParams) => void;
  routeVersion: number;
};

export const MAX_COMPARED = 8;

/** Le catalogue des causes, classé par nombre de décès quand on le connaît.
 *
 *  Les poids viennent du classement que renvoie la fiche courante : c'est la
 *  seule source de volume dont l'écran dispose sans requête supplémentaire.
 *  Les causes qu'il ne cite pas gardent l'ordre de la nomenclature, derrière —
 *  la recherche sert à les atteindre. */
export function causeCatalogue(metadata: MortalityMetadata | null,
                               overview: MortalityOverview | null): EntityOption[] {
  const weights = new Map(
    (overview?.top_causes ?? []).map((item) => [item.code, item.deaths ?? 0]),
  );
  return (metadata?.causes ?? [])
    .map((cause, index) => ({
      code: cause.code,
      label: cause.label,
      group: "Causes de décès",
      weight: weights.get(cause.code) ?? -index,
    }))
    .sort((left, right) => right.weight - left.weight)
    .map(({ code, label, group }) => ({ code, label, group }));
}
