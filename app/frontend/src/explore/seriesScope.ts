/** Le périmètre propre d'une série comparée.
 *
 *  L'écran Comparer part d'un périmètre unique découpé selon une dimension :
 *  toutes les séries y partagent exactement les mêmes filtres, et seule la
 *  modalité change. C'est la comparaison la plus sûre — une seule chose varie —
 *  mais elle ne sait répondre ni à « les hommes de plus de 60 ans dépensent-ils
 *  plus que l'ensemble des femmes ? », ni à « la pharmacie en Île-de-France
 *  contre l'hospitalisation en Bretagne ».
 *
 *  Ce module ouvre les deux. Une série peut porter **son jeu de filtres
 *  complet** — prestation, territoire, âge, sexe, assurance, enveloppe, motif —
 *  indépendant de celui des autres. Deux règles la tiennent honnête :
 *
 *  1. **La période n'est jamais propre à une série.** Toutes partagent l'axe du
 *     temps ; deux périodes différentes sur un même axe ne se comparent pas,
 *     elles se superposent par accident.
 *  2. **Ce qui diffère est écrit.** Chaque série affiche, sous son nom, les
 *     filtres qui la distinguent du périmètre commun. Sans cela la souplesse
 *     devient un piège : deux courbes semblables laisseraient croire à une
 *     comparaison toutes choses égales par ailleurs.
 */

import type { AdvancedFilters, CodeOption, Metadata } from "../types";

/** Le périmètre d'une série : un jeu de filtres complet, ou rien — auquel cas
 *  la série suit le périmètre commun. */
export type SeriesScope = AdvancedFilters;

/** Une série composée librement, qui ne descend d'aucune modalité. */
export const FREE_PREFIX = "free:";

export function isFree(key: string): boolean {
  return key.startsWith(FREE_PREFIX);
}

/** La dimension découpée ne peut pas être redéfinie par une série : restreindre
 *  le sexe d'une série alors qu'on compare les sexes ne veut rien dire. */
const BREAKDOWN_FIELD: Record<string, keyof AdvancedFilters> = {
  region: "regions",
  age: "ages",
  sex: "sexes",
  service: "service_codes",
  grand_post: "grand_post",
  post: "post",
  sub_post: "sub_post",
  insurance: "insurances",
  envelope: "envelopes",
  ald: "ald",
};

/** Les champs qu'une série tirée d'une modalité peut redéfinir. Une série
 *  libre, elle, les redéfinit tous : elle n'est rattachée à aucune modalité. */
export function lockedField(breakdown: string, free: boolean): keyof AdvancedFilters | null {
  return free ? null : BREAKDOWN_FIELD[breakdown] ?? null;
}

const ARRAY_FIELDS = [
  "service_codes", "sexes", "ages", "regions", "insurances", "envelopes",
] as const;

/** Le périmètre effectif d'une série : le sien s'il existe, sinon le commun.
 *  La période vient toujours du commun. */
export function applyScope(base: AdvancedFilters, scope: SeriesScope | undefined): AdvancedFilters {
  if (!scope) return base;
  return { ...scope, start_year: base.start_year, end_year: base.end_year };
}

export type ScopeChip = { field: string; text: string };

function named(codes: number[], options: CodeOption[],
               plural: (count: number) => string, limit = 2): string {
  if (codes.length <= limit) {
    return codes
      .map((code) => options.find((option) => option.code === code)?.label ?? String(code))
      .join(", ");
  }
  return plural(codes.length);
}

/** Tranche d'âge hors échelle : elle n'a pas de place dans un intervalle. */
const AGE_UNKNOWN = 99;

/** Les tranches d'âge se disent en intervalle quand elles en forment un.
 *
 *  « 3 tranches d'âge » n'apprend rien à qui lit une légende ; « 60 ans et
 *  plus » dit exactement ce que la série contient. */
function ageRange(codes: number[], options: CodeOption[]): string {
  const scale = options.filter((option) => option.code !== AGE_UNKNOWN)
    .map((option) => option.code)
    .sort((left, right) => left - right);
  const chosen = [...codes].sort((left, right) => left - right)
    .filter((code) => code !== AGE_UNKNOWN);
  if (!chosen.length) return "âge inconnu";

  const first = scale.indexOf(chosen[0]);
  const last = scale.indexOf(chosen[chosen.length - 1]);
  const contiguous = first >= 0 && last >= 0
    && last - first + 1 === chosen.length
    && chosen.every((code, index) => scale[first + index] === code);

  if (!contiguous) {
    return chosen.length <= 2
      ? chosen.map((code) => options.find((option) => option.code === code)?.label ?? String(code)).join(", ")
      : `${chosen.length} tranches d’âge`;
  }
  if (chosen.length === 1) {
    return options.find((option) => option.code === chosen[0])?.label ?? String(chosen[0]);
  }
  if (last === scale.length - 1) return `${chosen[0]} ans et plus`;
  if (first === 0) return `moins de ${chosen[chosen.length - 1] + 10} ans`;
  return `${chosen[0]}–${chosen[chosen.length - 1] + 9} ans`;
}

/** Ce qui distingue une série du périmètre commun, champ par champ.
 *
 *  C'est ce que l'écran affiche en gris sous chaque série : la liste exacte de
 *  ce qu'elle contient de particulier. Une série sans puce partage le périmètre
 *  commun, et c'est visible d'un coup d'œil.
 */
export function scopeChips(scope: SeriesScope | undefined, base: AdvancedFilters,
                           metadata: Metadata): ScopeChip[] {
  if (!scope) return [];
  const chips: ScopeChip[] = [];

  (["grand_post", "post", "sub_post"] as const).forEach((field) => {
    if (scope[field] && scope[field] !== base[field]) {
      chips.push({ field, text: String(scope[field]) });
    }
  });

  const differs = (field: (typeof ARRAY_FIELDS)[number]) =>
    JSON.stringify([...scope[field]].sort()) !== JSON.stringify([...base[field]].sort());

  if (differs("service_codes") && scope.service_codes.length) {
    chips.push({
      field: "service_codes",
      text: scope.service_codes.length === 1
        ? `prestation ${scope.service_codes[0]}`
        : `${scope.service_codes.length} prestations`,
    });
  }
  if (differs("ages") && scope.ages.length) {
    chips.push({ field: "ages", text: ageRange(scope.ages, metadata.ages) });
  }
  if (differs("sexes") && scope.sexes.length) {
    chips.push({
      field: "sexes",
      text: named(scope.sexes, metadata.sexes, (count) => `${count} modalités de sexe`),
    });
  }
  if (differs("regions") && scope.regions.length) {
    chips.push({
      field: "regions",
      text: named(scope.regions, metadata.regions, (count) => `${count} territoires`),
    });
  }
  if (differs("insurances") && scope.insurances.length) {
    chips.push({
      field: "insurances",
      text: named(scope.insurances, metadata.insurances, (count) => `${count} natures d’assurance`),
    });
  }
  if (differs("envelopes") && scope.envelopes.length) {
    chips.push({
      field: "envelopes",
      text: named(scope.envelopes, metadata.envelopes, (count) => `${count} enveloppes`),
    });
  }
  if (scope.ald !== base.ald && scope.ald !== null) {
    chips.push({ field: "ald", text: scope.ald ? "ALD" : "hors ALD" });
  }

  return chips;
}

export function isEmpty(scope: SeriesScope | undefined, base: AdvancedFilters,
                        metadata: Metadata): boolean {
  return scopeChips(scope, base, metadata).length === 0;
}

/** Le libellé complet d'une série : sa modalité, puis ce qui la distingue.
 *
 *  Une série libre n'a pas de modalité : elle **est** son périmètre, et son nom
 *  se lit entièrement dans ses filtres. Sans filtre, elle porte le périmètre
 *  commun et le dit. */
export function scopedLabel(base_label: string, scope: SeriesScope | undefined,
                            base: AdvancedFilters, metadata: Metadata,
                            free = false): string {
  const chips = scopeChips(scope, base, metadata);
  if (free) return chips.length ? chips.map((chip) => chip.text).join(" · ") : "Périmètre commun";
  return chips.length ? `${base_label} · ${chips.map((chip) => chip.text).join(" · ")}` : base_label;
}

/** Clé de cache d'un périmètre, pour ne relancer que ce qui a changé. */
export function scopeKey(scope: SeriesScope | undefined): string {
  return scope ? JSON.stringify(scope) : "";
}

/** Lecture / écriture dans l'adresse : une comparaison composée doit pouvoir
 *  être partagée telle quelle. */
export function scopesToParam(scopes: Record<string, SeriesScope>): string | null {
  const kept = Object.entries(scopes);
  return kept.length ? JSON.stringify(Object.fromEntries(kept)) : null;
}

export function scopesFromParam(raw: string | null): Record<string, SeriesScope> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, SeriesScope>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Une adresse tronquée ou bricolée ne doit pas empêcher l'écran de s'ouvrir.
    return {};
  }
}
