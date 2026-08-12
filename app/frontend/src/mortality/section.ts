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

import type { RailOption, ScopeField, SeriesScope } from "../components/SeriesRail";
import type { MortalityMetadata } from "../types";

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

/** Le code du total publié, celui qui vaut 100 % : « Toutes causes ». */
export function allCausesCode(metadata: MortalityMetadata | null): string | null {
  return metadata?.causes.find((item) => item.label === "Toutes causes")?.code ?? null;
}

/** Le catalogue des causes, classé par nombre de décès.
 *
 *  Les poids viennent désormais des métadonnées — décès de la dernière année,
 *  ensemble de la population — et non plus de la fiche affichée : le classement
 *  couvre ainsi les 86 causes et non les douze que la fiche cite. Le chapitre
 *  s'affiche en regard de chaque détail : la nomenclature du CépiDc emboîte
 *  « dont tumeur maligne du sein » dans « Tumeurs », et lire l'un sans l'autre
 *  fait perdre l'échelle.
 *
 *  Le total « Toutes causes » n'y figure pas : ce n'est pas une cause qu'on met
 *  en regard des autres, c'est ce à quoi elles se rapportent.
 */
export function causeCatalogue(metadata: MortalityMetadata | null): RailOption[] {
  const total = allCausesCode(metadata);
  return (metadata?.causes ?? [])
    .filter((cause) => cause.code !== total)
    .map((cause) => ({
      code: cause.code,
      label: cause.label,
      group: cause.detail ? (cause.chapter ?? "Détail") : "Chapitre",
      weight: cause.deaths ?? null,
    }))
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0));
}

/** Vrai pour un chapitre de la nomenclature : deux chapitres sont disjoints,
 *  un chapitre et l'un de ses détails ne le sont pas. */
export function isChapter(metadata: MortalityMetadata | null, code: string): boolean {
  const cause = metadata?.causes.find((item) => item.code === code);
  return Boolean(cause) && !cause!.detail && cause!.code !== allCausesCode(metadata);
}

/** La sélection d'ouverture : les trois causes les plus fréquentes de la
 *  dernière année, chapitres seulement — un chapitre et l'un de ses détails
 *  côte à côte compteraient deux fois les mêmes décès. */
export function mortalityOpeningSelection(metadata: MortalityMetadata | null,
                                          catalogue: RailOption[], howMany = 3): string[] {
  return catalogue
    .filter((item) => isChapter(metadata, item.code))
    .slice(0, howMany)
    .map((item) => item.code);
}

/** Le seul filtre qu'une série peut porter en propre : la population publiée.
 *  Le CépiDc n'en offre pas d'autre, et la période reste commune. */
export function mortalityScopeFields(metadata: MortalityMetadata): ScopeField[] {
  return [
    {
      key: "population",
      label: "Population",
      options: metadata.populations.map((item) => ({ value: item.code, label: item.label })),
    },
  ];
}

export function mortalityScopeOf(scope: SeriesScope | undefined, population: string): string {
  return scope?.population ?? population;
}
