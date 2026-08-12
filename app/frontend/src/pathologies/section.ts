/** Ce que la coquille Pathologies partage avec ses deux sections.
 *
 *  Le périmètre de population — millésime, région, âge, sexe — et la mesure
 *  suivent l'utilisateur d'une section à l'autre : passer du panorama à la
 *  comparaison est un changement de question, pas de sujet. Chaque section
 *  garde en propre ce qui n'appartient qu'à elle : la pathologie affichée pour
 *  le panorama, la liste comparée pour l'autre.
 */

import type { PathologyMetadata } from "../types";

export type PathologyMeasure = "prevalence" | "patients";

export type PathologySectionProps = {
  metadata: PathologyMetadata;
  year: number;
  region: string;
  /** La carte du panorama est cliquable : elle change la région commune, qui
   *  vit dans la coquille. */
  setRegion: (next: string) => void;
  age: string;
  sex: string;
  measure: PathologyMeasure;
  setMeasure: (next: PathologyMeasure) => void;
  onOpenExtraction: (params: URLSearchParams) => void;
  routeVersion: number;
};

export const SOURCE_LINE = "Source · Cartographie des pathologies, Cnam · Traitement Forsides";

/** Au-delà, deux teintes de la palette catégorielle ne se séparent plus de
 *  façon sûre — la même limite que les séries de DAMIR. */
export const MAX_COMPARED = 8;

/** Le périmètre en une ligne, pour le titre et pour l'image exportée. */
export function scopeLabel(metadata: PathologyMetadata, year: number,
                           region: string, age: string, sex: string): string {
  const label = (list: Array<{ code: string; label: string }>, code: string) =>
    list.find((item) => item.code === code)?.label ?? code;
  return [
    label(metadata.regions, region),
    label(metadata.ages, age),
    label(metadata.sexes, sex),
    `millésime ${year}`,
  ].join(" · ");
}
