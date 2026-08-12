/** Ce que la coquille CSP partage avec ses deux sections.
 *
 *  Millésime, territoire, âge, sexe et mesure suivent l'utilisateur d'une
 *  section à l'autre : passer du panorama à la comparaison est un changement de
 *  question, pas de sujet.
 */

import type { RailOption, ScopeField, SeriesScope } from "../components/SeriesRail";
import type { CspMetadata } from "../types";

export type CspLevel = "groupe_6" | "categorie_29";
export type CspMeasure = "share" | "effectif";

export type CspSectionProps = {
  metadata: CspMetadata;
  year: number;
  region: string;
  age: string;
  sex: number;
  /** La carte du panorama est cliquable : elle change le territoire commun,
   *  qui vit dans la coquille. */
  setRegion: (next: string) => void;
  measure: CspMeasure;
  setMeasure: (next: CspMeasure) => void;
  onOpenExtraction: (params: URLSearchParams) => void;
  routeVersion: number;
};

export const SOURCE_LINE = "Source · Recensement de la population, Insee · Traitement Forsides";

/** Au-delà, deux teintes de la palette catégorielle ne se séparent plus de
 *  façon sûre — la même limite que les séries de DAMIR. */
export const MAX_COMPARED = 8;

/** Le catalogue plat des deux niveaux de nomenclature.
 *
 *  Les six grands groupes viennent d'abord, les vingt-neuf catégories ensuite :
 *  contrairement aux 118 pathologies, la nomenclature *est* ici l'ordre utile,
 *  et le niveau se lit en regard de chaque entrée. Le code porte son niveau,
 *  parce qu'une série ne sait pas d'où elle vient une fois choisie. */
export type CspEntry = RailOption & { level: CspLevel; raw: string };

export function cspCatalogue(metadata: CspMetadata | null): CspEntry[] {
  return (metadata?.levels ?? []).flatMap((level) =>
    level.options.map((option) => ({
      code: `${level.key}:${option.code}`,
      label: option.label,
      group: level.label,
      // L'effectif du dernier millésime : il classe la recherche et désigne la
      // sélection d'ouverture, il ne s'affiche jamais comme un résultat.
      weight: option.effectif ?? null,
      level: level.key,
      raw: option.code,
    })));
}

/** La sélection d'ouverture : les trois groupes les plus nombreux du dernier
 *  millésime. Arriver sur une comparaison à un élément n'apprend rien, et les
 *  six grands groupes sont le niveau où la question se pose d'abord. */
export function cspOpeningSelection(catalogue: CspEntry[], howMany = 3): string[] {
  return catalogue
    .filter((item) => item.level === "groupe_6")
    .slice()
    .sort((left, right) => (right.weight ?? 0) - (left.weight ?? 0))
    .slice(0, howMany)
    .map((item) => item.code);
}

/** Les filtres qu'une série peut porter en propre. Le millésime n'en est pas :
 *  la période reste commune. */
export function cspScopeFields(metadata: CspMetadata): ScopeField[] {
  return [
    { key: "region", label: "Territoire", options: metadata.regions.map((item) => ({ value: item.code, label: item.label })) },
    { key: "age", label: "Âge", options: metadata.ages.map((item) => ({ value: item.code, label: item.label })) },
    { key: "sex", label: "Sexe", options: metadata.sexes.map((item) => ({ value: String(item.code), label: item.label })) },
  ];
}

export function cspScopeOf(scope: SeriesScope | undefined,
                           region: string, age: string, sex: number) {
  return {
    region: scope?.region ?? region,
    age: scope?.age ?? age,
    sex: scope?.sex !== undefined ? Number(scope.sex) : sex,
  };
}

export function scopeLabel(metadata: CspMetadata, year: number,
                           region: string, age: string, sex: number): string {
  const label = <T extends { label: string }>(list: T[], match: (item: T) => boolean) =>
    list.find(match)?.label;
  return [
    label(metadata.regions, (item) => item.code === region) ?? region,
    label(metadata.ages, (item) => item.code === age) ?? age,
    label(metadata.sexes, (item) => item.code === sex) ?? String(sex),
    `millésime ${year}`,
  ].join(" · ");
}
