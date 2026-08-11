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
