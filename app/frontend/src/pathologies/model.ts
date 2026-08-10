/** Le modèle de la fiche Pathologies : quelles lectures existent, et ce
 *  qu'elles ne montrent pas — sur le principe de `panorama/slides.ts`, mais
 *  borné à ce que la fiche offre réellement aujourd'hui. Aucune des trois
 *  lectures n'expose de choix de forme : la prévalence par territoire n'a
 *  qu'une forme licite (le classement, pas de carte ici — voir CSP), l'âge
 *  n'en a qu'une (des colonnes groupées), et l'évolution n'admet pas
 *  l'empilement, une seule série à la fois y étant montrée.
 */

export type PathologyReadingKey = "evolution" | "ageSex" | "territory";

const MASKING_NOTE = "Cellules inférieures à 10 patients masquées par la Cnam ; une valeur masquée reste masquée, elle n'est jamais remplacée par 0.";

export function pathologyCaveats(
  key: PathologyReadingKey,
  context: { maskedCells: number; unavailableTerritories: number },
): string[] {
  if (key !== "territory") return [MASKING_NOTE];
  const list = [MASKING_NOTE];
  if (context.maskedCells > 0) {
    list.push(`${context.maskedCells} cellule(s) masquée(s) par la source sur ce périmètre.`);
  }
  if (context.unavailableTerritories > 0) {
    list.push(`${context.unavailableTerritories} territoire(s) sans prévalence exploitable, exclus du classement.`);
  }
  return list;
}
