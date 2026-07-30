import type {
  ExtractionPreview,
  ExtractionRequest,
  HierarchyOptions,
  Metadata,
  Methodology,
  Panorama,
  PanoramaFilters,
  PathologyExtractionRequest,
  PathologyMetadata,
  PathologyOverview,
  CspMetadata,
  CspOverview,
  CspEvolution,
  CspExtractionRequest,
  MortalityExtractionRequest,
  MortalityMetadata,
  MortalityOverview,
  WorkbenchRequest,
  WorkbenchResult,
} from "./types";

function panoramaQuery(filters: PanoramaFilters): string {
  const params = new URLSearchParams({
    start_year: String(filters.startYear),
    end_year: String(filters.endYear),
    reference_year: String(filters.referenceYear),
    measure: filters.measure,
  });
  if (filters.grandPost) params.set("grand_post", filters.grandPost);
  if (filters.region) params.set("region", filters.region);
  return params.toString();
}

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.detail ?? "Le service DAMIR ne répond pas correctement.");
  }
  return response.json() as Promise<T>;
}

async function post<T>(url: string, payload: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail ?? "Le calcul DAMIR n’a pas pu aboutir.");
  }
  return response.json() as Promise<T>;
}

export function getMetadata(signal?: AbortSignal): Promise<Metadata> {
  return request<Metadata>("/api/meta", signal);
}

export function getPanorama(filters: PanoramaFilters, signal?: AbortSignal): Promise<Panorama> {
  return request<Panorama>(`/api/panorama?${panoramaQuery(filters)}`, signal);
}

export function getMethodology(signal?: AbortSignal): Promise<Methodology> {
  return request<Methodology>("/api/methodology", signal);
}

export function getHierarchy(
  grandPost: string | null,
  postValue: string | null,
  subPost: string | null,
  signal?: AbortSignal,
): Promise<HierarchyOptions> {
  const params = new URLSearchParams();
  if (grandPost) params.set("grand_post", grandPost);
  if (postValue) params.set("post", postValue);
  if (subPost) params.set("sub_post", subPost);
  return request<HierarchyOptions>(`/api/options?${params.toString()}`, signal);
}

export function runWorkbench(payload: WorkbenchRequest, signal?: AbortSignal): Promise<WorkbenchResult> {
  return post<WorkbenchResult>("/api/workbench", payload, signal);
}

export function getPathologyMetadata(signal?: AbortSignal): Promise<PathologyMetadata> {
  return request<PathologyMetadata>("/api/pathologies/meta", signal);
}

export function getPathologyOverview(
  top: string,
  year: number,
  scope: { region: string; age: string; sex: string },
  signal?: AbortSignal,
): Promise<PathologyOverview> {
  return post<PathologyOverview>("/api/pathologies/overview", { top, year, ...scope }, signal);
}

export function getCspMetadata(signal?: AbortSignal): Promise<CspMetadata> {
  return request<CspMetadata>("/api/csp/meta", signal);
}

export function getCspOverview(
  payload: { year: number; level: "groupe_6" | "categorie_29"; csp_code: string; region: string; age: string; sex: number },
  signal?: AbortSignal,
): Promise<CspOverview> {
  return post<CspOverview>("/api/csp/overview", payload, signal);
}

export function getCspEvolution(
  payload: {
    level: "groupe_6" | "categorie_29";
    csp_code: string;
    region: string;
    age: string;
    sex: number;
    start_year?: number;
    end_year?: number;
  },
  signal?: AbortSignal,
): Promise<CspEvolution> {
  return post<CspEvolution>("/api/csp/evolution", payload, signal);
}

export function getCspGeography(url: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(url, signal);
}

export function getMortalityMetadata(signal?: AbortSignal): Promise<MortalityMetadata> {
  return request<MortalityMetadata>("/api/mortality/meta", signal);
}

export function getMortalityOverview(
  payload: { cause: string; population: string; year: number },
  signal?: AbortSignal,
): Promise<MortalityOverview> {
  return post<MortalityOverview>("/api/mortality/overview", payload, signal);
}

export function getMortalityExtractionPreview(payload: MortalityExtractionRequest, signal?: AbortSignal): Promise<ExtractionPreview> {
  return post<ExtractionPreview>("/api/mortality/extraction/preview", payload, signal);
}

export async function downloadMortalityExtraction(format: "csv" | "xlsx", payload: MortalityExtractionRequest): Promise<void> {
  const response = await fetch(`/api/mortality/extraction.${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail ?? "L’export Mortalité n’a pas pu être généré.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `mortalite_extraction.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function getCspExtractionPreview(payload: CspExtractionRequest, signal?: AbortSignal): Promise<ExtractionPreview> {
  return post<ExtractionPreview>("/api/csp/extraction/preview", payload, signal);
}

export async function downloadCspExtraction(format: "csv" | "xlsx", payload: CspExtractionRequest): Promise<void> {
  const response = await fetch(`/api/csp/extraction.${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail ?? "L’export CSP n’a pas pu être généré.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `csp_extraction_${payload.year}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function getPathologyExtractionPreview(payload: PathologyExtractionRequest, signal?: AbortSignal): Promise<ExtractionPreview> {
  return post<ExtractionPreview>("/api/pathologies/extraction/preview", payload, signal);
}

export async function downloadPathologyExtraction(format: "csv" | "xlsx", payload: PathologyExtractionRequest): Promise<void> {
  const response = await fetch(`/api/pathologies/extraction.${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail ?? "L’export Pathologies n’a pas pu être généré.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `pathologies_extraction.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function getExtractionPreview(payload: ExtractionRequest, signal?: AbortSignal): Promise<ExtractionPreview> {
  return post<ExtractionPreview>("/api/extraction/preview", payload, signal);
}

export async function downloadExtraction(format: "csv" | "xlsx", payload: ExtractionRequest): Promise<void> {
  const response = await fetch(`/api/extraction.${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail ?? "L’export n’a pas pu être généré.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `damir_extraction_avancee.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
