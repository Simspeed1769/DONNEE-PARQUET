/** Les anciennes adresses de « Comparer les prestations » et « Comparaison
 *  libre » redirigent proprement vers Comparer, plutôt que de perdre l'état
 *  d'un lien déjà partagé.
 *
 *  La traduction est de bonne foi, pas pixel pour pixel : l'axe en abscisse
 *  d'une dimension autre que l'année, et l'empilement, n'ont pas d'équivalent
 *  direct dans Comparer (voir le journal de la Phase 3) et retombent sur
 *  « Comparer selon : Année » et la vue Barres.
 */

const FREE_PREFIX = "free:";
let counter = 0;
function key(): string {
  counter += 1;
  return `${FREE_PREFIX}legacy${counter}`;
}

/** `true` si l'adresse porte encore la marque d'une ancienne section : sert à
 *  décider si l'écran doit réécrire l'adresse une fois montée. */
export function hasLegacyCompareParams(params: URLSearchParams): boolean {
  const section = params.get("section");
  return section === "services" || section === "free";
}

/** Traduit les paramètres hérités en ceux de Comparer. Ne touche pas aux
 *  paramètres communs à tout DAMIR (période, filtres, mesure) : ils restent
 *  lisibles tels quels par la nouvelle section. */
export function redirectLegacyCompareParams(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  const section = params.get("section");
  if (section !== "services" && section !== "free") return next;

  next.set("section", "compare");

  if (section === "services") {
    const level = params.get("level");
    if (level) next.set("compare_by", level);
    const view = params.get("view_services");
    if (view) next.set("view_compare", view);
    const compare = params.get("compare");
    if (compare) next.set("series", compare);
    const other = params.get("other");
    if (other) next.set("other", other);
    ["level", "view_services", "compare"].forEach((name) => next.delete(name));
    return next;
  }

  // section === "free"
  next.set("compare_by", "year");
  const view = params.get("view_free");
  const viewMap: Record<string, string> = { line: "line", bar: "bar", stack: "bar", rank: "rank", pie: "pie" };
  next.set("view_compare", (view && viewMap[view]) || "line");

  const raw = params.get("free");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Array<{ key: string; name?: string; filters: Record<string, unknown> }>;
      if (Array.isArray(parsed) && parsed.length) {
        const scopes: Record<string, unknown> = {};
        const keys = parsed.map((item) => {
          const generated = key();
          scopes[generated] = item.filters;
          return generated;
        });
        next.set("series", keys.join("~"));
        next.set("series_scopes", JSON.stringify(scopes));
      }
    } catch {
      // Une adresse bricolée réouvre Comparer sur une série libre vide plutôt
      // que d'empêcher l'écran de s'ouvrir.
    }
  }

  ["axis", "view_free", "free"].forEach((name) => next.delete(name));
  return next;
}
