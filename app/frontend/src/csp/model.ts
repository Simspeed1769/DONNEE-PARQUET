/** Le modèle de la fiche CSP : quelles lectures existent, et ce qu'elles ne
 *  montrent pas — sur le principe de `panorama/slides.ts`. La carte encode
 *  une part ou un effectif, jamais un indice : il n'y a ici qu'un seul sujet
 *  à la fois, et l'indice de spécialisation de DAMIR n'a de sens qu'à en
 *  comparer plusieurs.
 */

export type CspReadingKey = "evolution" | "map" | "ageSex" | "composition";

const NOMENCLATURE_NOTE = "La nomenclature des catégories socioprofessionnelles a évolué entre certains millésimes : une rupture de série n'y est pas toujours une évolution réelle.";
const WEIGHTED_NOTE = "Effectifs pondérés par l'Insee, pas des comptages directs.";

export function cspCaveats(key: CspReadingKey, context: { evolutionNote: string | null }): string[] {
  const base = [WEIGHTED_NOTE, NOMENCLATURE_NOTE];
  if (key === "evolution" && context.evolutionNote) return [context.evolutionNote, ...base];
  return base;
}
