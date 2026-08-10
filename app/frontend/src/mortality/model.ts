/** Le modèle de la fiche Mortalité : quelles lectures existent, et ce
 *  qu'elles ne montrent pas — sur le principe de `panorama/slides.ts`.
 *
 *  Deux absences structurelles, énoncées ici plutôt que simulées : la source
 *  n'a pas de dimension régionale (pas de carte, pas de classement
 *  territorial), et elle ne publie que des effectifs bruts, sans population
 *  de référence — donc jamais de taux de mortalité.
 */

export type MortalityReadingKey = "evolution" | "causes" | "sex" | "age";

const SCOPE_NOTE = "Source nationale : ni région, ni taux de mortalité — la Cnam ne publie pas de population de référence pour ces effectifs.";
const ZERO_NOTE = "Les cellules vides restent non disponibles ou non applicables ; elles ne sont jamais interprétées comme un zéro.";

export function mortalityCaveats(_key: MortalityReadingKey): string[] {
  return [SCOPE_NOTE, ZERO_NOTE];
}
