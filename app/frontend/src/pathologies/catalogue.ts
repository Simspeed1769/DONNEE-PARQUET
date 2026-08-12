/** Le catalogue plat des pathologies, classé du plus lourd au plus léger.
 *
 *  Les trois niveaux y figurent : on compare une famille entière aussi bien
 *  qu'une pathologie précise, et le niveau d'un « top » ne se devine pas de son
 *  code. Un même code n'apparaît qu'une fois — la nomenclature répète le code
 *  d'une famille sur son groupe unique.
 *
 *  Le classement par nombre de patients n'est pas cosmétique : proposer 118
 *  pathologies dans l'ordre de la nomenclature demande de connaître la
 *  nomenclature, alors que les plus courantes se présentent d'elles-mêmes une
 *  fois classées par poids.
 */

import type { EntityOption } from "../components/EntityPicker";
import type { PathologyMetadata } from "../types";

export function pathologyCatalogue(metadata: PathologyMetadata | null): EntityOption[] {
  const seen = new Set<string>();
  const rows: Array<EntityOption & { patients: number }> = [];
  const push = (code: string, label: string, group: string, patients?: number | null) => {
    if (seen.has(code)) return;
    seen.add(code);
    rows.push({ code, label, group, patients: patients ?? 0 });
  };
  (metadata?.families ?? []).forEach((family) => {
    push(family.code, family.label, family.label, family.patients);
    family.groups.forEach((item) => {
      push(item.code, item.label, family.label, item.patients);
      item.pathologies.forEach((leaf) => push(leaf.code, leaf.label, family.label, leaf.patients));
    });
  });
  return rows
    .sort((left, right) => right.patients - left.patients)
    .map(({ code, label, group }) => ({ code, label, group }));
}

/** La sélection d'ouverture de la comparaison.
 *
 *  Trois pathologies lourdes et parlantes plutôt qu'une seule : arriver sur une
 *  comparaison à un élément n'apprend rien, et choisir soi-même trois entrées
 *  parmi 118 avant de voir quoi que ce soit décourage. Les libellés sont ceux
 *  de la nomenclature Cnam ; si l'un manque, on prend la pathologie la plus
 *  lourde encore libre — le catalogue étant classé par poids, c'est la première
 *  disponible — et l'appelant le signale en réserve.
 */
const OPENING_LABELS = [
  "Diabète",
  "Cancers",
  "Maladies neurologiques ou dégénératives",
];

export function openingSelection(catalogue: EntityOption[]): {
  codes: string[];
  missing: string[];
} {
  const codes: string[] = [];
  const missing: string[] = [];
  const normalise = (value: string) => value.toLocaleLowerCase("fr-FR").trim();

  OPENING_LABELS.forEach((wanted) => {
    const found = catalogue.find((item) => normalise(item.label) === normalise(wanted));
    if (found && !codes.includes(found.code)) { codes.push(found.code); return; }
    missing.push(wanted);
    const fallback = catalogue.find((item) => !codes.includes(item.code));
    if (fallback) codes.push(fallback.code);
  });

  return { codes, missing };
}
