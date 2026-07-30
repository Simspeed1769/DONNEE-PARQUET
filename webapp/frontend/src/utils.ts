import type { AdvancedFilters, Metadata, MetricKind } from "./types";

export function formatValue(value: number | null | undefined, kind: MetricKind | string, signed = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const prefix = signed && value > 0 ? "+" : "";
  if (kind === "percent") {
    return `${prefix}${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(value)} %`;
  }
  if (kind === "index") {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)} pts`;
  }
  if (kind === "money") {
    return `${prefix}${new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: "EUR",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(value)}`;
  }
  return `${prefix}${new Intl.NumberFormat("fr-FR", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)}`;
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
  return { divisor: 1, label: kind === "index" ? "Indice base 100" : "%" };
}

export function yearStatusLabel(metadata: Metadata, year: number): string {
  const consolidated = metadata.reliability.consolidated_through;
  return consolidated !== null && year > consolidated ? `${year} · en consolidation` : String(year);
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
