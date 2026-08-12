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

import type { RailOption } from "../components/SeriesRail";
import type { PathologyMetadata } from "../types";

export function pathologyCatalogue(metadata: PathologyMetadata | null): RailOption[] {
  const seen = new Set<string>();
  const rows: RailOption[] = [];
  const push = (code: string, label: string, group: string, patients?: number | null) => {
    if (seen.has(code)) return;
    seen.add(code);
    rows.push({ code, label, group, weight: patients ?? null });
  };
  (metadata?.families ?? []).forEach((family) => {
    push(family.code, family.label, family.label, family.patients);
    family.groups.forEach((item) => {
      push(item.code, item.label, family.label, item.patients);
      item.pathologies.forEach((leaf) => push(leaf.code, leaf.label, family.label, leaf.patients));
    });
  });
  return rows.sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0));
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

export function openingSelection(catalogue: RailOption[]): {
  codes: string[];
  /** Ce qui a été pris à la place de ce qui était demandé : l'écran le dit en
   *  réserve plutôt que de laisser croire que la nomenclature porte ce nom. */
  substituted: Array<{ wanted: string; taken: string; code: string }>;
} {
  const codes: string[] = [];
  const substituted: Array<{ wanted: string; taken: string; code: string }> = [];
  const normalise = (value: string) => value
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .trim();
  const words = (value: string) => new Set(normalise(value).split(/[^a-z0-9]+/).filter((word) => word.length > 3));

  OPENING_LABELS.forEach((wanted) => {
    const free = catalogue.filter((item) => !codes.includes(item.code));
    const target = normalise(wanted);

    // Le libellé exact de la nomenclature Cnam d'abord.
    let found = free.find((item) => normalise(item.label) === target);

    // Sinon la plus proche : « Maladies neurologiques ou dégénératives » n'existe
    // pas sous ce nom, la Cartographie publie « Maladies neurologiques ». Un
    // libellé qui en contient un autre désigne la même chose ; à défaut, celui
    // qui partage le plus de mots pleins. Le catalogue étant classé par poids,
    // à égalité c'est la plus lourde qui l'emporte.
    if (!found) {
      found = free.find((item) => {
        const label = normalise(item.label);
        return label.startsWith(target) || target.startsWith(label);
      });
    }
    if (!found) {
      const wantedWords = words(wanted);
      let best = 0;
      free.forEach((item) => {
        const shared = [...words(item.label)].filter((word) => wantedWords.has(word)).length;
        if (shared > best) { best = shared; found = item; }
      });
    }
    if (!found) found = free[0];
    if (!found) return;

    codes.push(found.code);
    if (normalise(found.label) !== target) {
      substituted.push({ wanted, taken: found.label, code: found.code });
    }
  });

  return { codes, substituted };
}
