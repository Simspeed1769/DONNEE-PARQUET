import type { AdvancedFilters, Metadata, MetricKind } from "./types";

/** L'échelle courte du métier, et rien au-dessus du milliard.
 *
 *  La notation compacte d'`Intl` monte au-delà : au millier de milliards elle
 *  écrit « 1,25 Bn € ». C'est du français correct — en français, un billion
 *  vaut mille milliards — mais personne ne le lit ainsi dans un service de
 *  l'Assurance Maladie, où `Bn` évoque l'anglais *billion*, c'est-à-dire un
 *  milliard. Le même signe portait donc deux valeurs à mille près selon le
 *  lecteur. On s'arrête au milliard : 1 250 Md €, une seule unité, celle que
 *  le métier emploie. */
const COMPACT_STEPS = [
  { from: 1e9, divisor: 1e9, unit: "Md" },
  { from: 1e6, divisor: 1e6, unit: "M" },
  { from: 1e3, divisor: 1e3, unit: "k" },
] as const;

function compact(value: number, suffix: string): string {
  const magnitude = Math.abs(value);
  const step = COMPACT_STEPS.find((candidate) => magnitude >= candidate.from);
  const scaled = step ? value / step.divisor : value;
  // Deux décimales tant qu'on reste sous le millier d'unités ; au-delà, le
  // nombre est déjà long et les centièmes n'apprennent plus rien.
  const digits = Math.abs(scaled) >= 1000 ? 0 : 2;
  const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(scaled);
  return [number, step?.unit, suffix].filter(Boolean).join(" ");
}

/** Un repère chiffré. Un **niveau** s'écrit nu ; seule une **variation** porte
 *  son signe. « +6,6 % » de prévalence laisserait croire à une hausse alors
 *  qu'il s'agit de la valeur elle-même. */
export function formatKpi(value: number | null | undefined, kind: string,
                          signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (kind === "quantity") {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
  }
  if (kind === "percent") {
    return `${new Intl.NumberFormat("fr-FR", {
      maximumFractionDigits: 1,
      signDisplay: signed ? "exceptZero" : "auto",
    }).format(value)} %`;
  }
  if (kind === "money") return compact(value, "€");
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} ×`;
}

export function formatValue(value: number | null | undefined, kind: MetricKind | string, signed = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const prefix = signed && value > 0 ? "+" : "";
  if (kind === "percent") {
    return `${prefix}${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value)} %`;
  }
  if (kind === "index") {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)} pts`;
  }
  // Un indice base 100 est un nombre nu : l'écrire « 112 pts » laisserait croire
  // à un écart de points de pourcentage, qui n'est pas ce qu'il mesure.
  if (kind === "base100") {
    return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value);
  }
  if (kind === "money") return `${prefix}${compact(value, "€")}`;
  return `${prefix}${compact(value, "")}`;
}

export function scaleFor(values: number[], kind: string): { divisor: number; label: string } {
  const maximum = Math.max(...values.map(Math.abs), 0);
  if (kind === "money") {
    if (maximum >= 2e9) return { divisor: 1e9, label: "Md €" };
    if (maximum >= 2e6) return { divisor: 1e6, label: "M €" };
    if (maximum >= 2e3) return { divisor: 1e3, label: "k €" };
    return { divisor: 1, label: "€" };
  }
  if (kind === "quantity") {
    if (maximum >= 2e9) return { divisor: 1e9, label: "Md unités" };
    if (maximum >= 2e6) return { divisor: 1e6, label: "M unités" };
    if (maximum >= 2e3) return { divisor: 1e3, label: "k unités" };
    return { divisor: 1, label: "unités" };
  }
  if (kind === "base100") return { divisor: 1, label: "Indice · 100 à la première année" };
  return { divisor: 1, label: kind === "index" ? "Indice base 100" : "%" };
}

/** Part liquidée d'un exercice, en pourcentage entier — `null` si inconnue.
 *
 *  Arrondi à l'entier parce que la grandeur est une **estimation** : écrire
 *  « 91,4 % » donnerait à un redressement une précision qu'il n'a pas.
 */
export function completenessRate(metadata: Metadata, year: number): number | null {
  const row = metadata.reliability.completeness?.find((item) => item.year === year);
  return row?.ratio == null ? null : Math.round(row.ratio * 100);
}

export function yearStatusLabel(metadata: Metadata, year: number): string {
  const consolidated = metadata.reliability.consolidated_through;
  if (consolidated === null || year <= consolidated) return String(year);
  // Le taux quand on l'a : « en consolidation » dit qu'il manque quelque chose,
  // « liquidé à 91 % » dit combien — et c'est la seule des deux formulations
  // avec laquelle on peut décider de lire le point ou de l'ignorer.
  const rate = completenessRate(metadata, year);
  return rate === null ? `${year} · en consolidation` : `${year} · liquidé à ${rate} %`;
}

export function defaultFilters(metadata: Metadata): AdvancedFilters {
  return {
    start_year: metadata.default_start_year,
    end_year: metadata.default_end_year,
    grand_post: null,
    post: null,
    sub_post: null,
    service_codes: [],
    sexes: [],
    ages: [],
    regions: [],
    insurances: [],
    envelopes: [],
    ald: null,
  };
}

const ARRAY_FIELDS = ["service_codes", "sexes", "ages", "regions", "insurances", "envelopes"] as const;

export function filtersFromSearch(metadata: Metadata, params: URLSearchParams, prefix = ""): AdvancedFilters {
  const defaults = defaultFilters(metadata);
  const read = (key: string) => params.get(`${prefix}${key}`);
  const start = Number(read("start_year"));
  const end = Number(read("end_year"));
  const result: AdvancedFilters = {
    ...defaults,
    start_year: Number.isFinite(start) && start ? start : defaults.start_year,
    end_year: Number.isFinite(end) && end ? end : defaults.end_year,
    grand_post: read("grand_post") || null,
    post: read("post") || null,
    sub_post: read("sub_post") || null,
    ald: read("ald") === null ? null : Number(read("ald")),
  };
  ARRAY_FIELDS.forEach((field) => {
    const raw = read(field);
    result[field] = raw ? raw.split(",").map(Number).filter(Number.isFinite) : [];
  });
  return result;
}

export function writeFilters(params: URLSearchParams, filters: AdvancedFilters, prefix = ""): void {
  const put = (key: string, value: string | number | null) => {
    const name = `${prefix}${key}`;
    if (value === null || value === "") params.delete(name);
    else params.set(name, String(value));
  };
  put("start_year", filters.start_year);
  put("end_year", filters.end_year);
  put("grand_post", filters.grand_post);
  put("post", filters.post);
  put("sub_post", filters.sub_post);
  put("ald", filters.ald);
  ARRAY_FIELDS.forEach((field) => put(field, filters[field].length ? filters[field].join(",") : null));
}

export async function copyCurrentUrl(): Promise<void> {
  await navigator.clipboard.writeText(window.location.href);
}

export function csvFromRows(columns: Array<{ key: string; label: string }>, rows: Array<Record<string, unknown>>): string {
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return `\uFEFF${columns.map((column) => escape(column.label)).join(";")}\n${rows
    .map((row) => columns.map((column) => escape(row[column.key])).join(";"))
    .join("\n")}`;
}
