import type {
  ExtractionPreview,
  ExtractionRequest,
  HierarchyOptions,
  Metadata,
  Methodology,
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
  PopulationExtractionRequest,
  PopulationMetadata,
  PopulationOverview,
} from "./types";
import type { ExploreResponse } from "./explore/model";
import type { PanoramaResponse } from "./panorama/model";
import type { PivotResponse } from "./pivot/model";
import type { AdvancedFilters } from "./types";

export type ExploreRequest = AdvancedFilters & {
  breakdown: string;
  time_axis: "care" | "payment";
  rank_by: string;
  /** Modalités choisies explicitement : elles reviennent même si leur poids les
   *  placerait hors des premières. */
  pinned?: string[];
};

export type ExploreOptionsRequest = AdvancedFilters & {
  breakdown: string;
  rank_by: string;
  query: string;
  limit?: number;
};

export type ExploreOption = { key: string; label: string; value: number | null };

export type ExploreOptionsResponse = {
  breakdown: string;
  options: ExploreOption[];
  total_count: number;
  match_count: number;
};

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

export function runExplore(payload: ExploreRequest, signal?: AbortSignal): Promise<ExploreResponse> {
  return post<ExploreResponse>("/api/explore", payload, signal);
}

export type PivotRequest = AdvancedFilters & { rows: string; columns: string };

/** Le tableau croisé. Comme `/api/explore`, la réponse ne porte que des
 *  composantes brutes et des formules : changer de mesure ou d'agrégation se
 *  fait dans le navigateur, sans repasser par ici. */
export function runPivot(payload: PivotRequest, signal?: AbortSignal): Promise<PivotResponse> {
  return post<PivotResponse>("/api/pivot", payload, signal);
}

export type PanoramaRequest = AdvancedFilters & {
  subject_dimension: string;
  /** Modalités mises sous observation. Vide signifie « tout confondu ». */
  subjects: string[];
  facets: string[];
};

export function runPanorama(payload: PanoramaRequest, signal?: AbortSignal): Promise<PanoramaResponse> {
  return post<PanoramaResponse>("/api/panorama", payload, signal);
}

export type CorrelationCatalogue = {
  units: Array<{ key: string; label: string; hint: string; sources: string[] }>;
  metrics: Array<{
    key: string; source: string; label: string; unit: string;
    rate: boolean; needs: string | null;
  }>;
  pathologies: string[];
  csp_groups: string[];
  causes: string[];
  age_bands: Array<{ key: string; label: string }>;
  regions: Array<{ code: number; label: string }>;
  /** Ce qu'un modèle peut expliquer, et combien de variables il accepte. */
  response_metrics: string[];
  max_predictors: number;
  /** Dimensions de l'observation qui peuvent devenir des variables du modèle,
   *  et celles que chaque unité rend disponibles. */
  factors: Array<{ key: string; label: string; hint: string; dimension: string }>;
  unit_factors: Record<string, string[]>;
};

/* `CorrelationRequest` / `CorrelationResult` et `runCorrelation` sont partis
   avec l'écran avancé : la corrélation appariée n'avait plus d'appelant. Le
   catalogue, lui, sert toujours — c'est lui qui peuple Croisements. */

export function getCorrelationCatalogue(signal?: AbortSignal): Promise<CorrelationCatalogue> {
  return request<CorrelationCatalogue>("/api/correlations/meta", signal);
}

/** Modalités disponibles pour le sélecteur de séries, classées par poids réel. */
export function runExploreOptions(
  payload: ExploreOptionsRequest, signal?: AbortSignal,
): Promise<ExploreOptionsResponse> {
  return post<ExploreOptionsResponse>("/api/explore/options", payload, signal);
}

export type RegressionTerm = {
  key: string;
  metric: string;
  selection: string | null;
  label: string;
  unit: string;
  estimate: number;
  std_error: number;
  statistic: number | null;
  p_value: number | null;
  /** L'effet lu dans l'unité qui se dit : un pourcentage sous lien log, la
   *  variation de la réponse sous lien identité. */
  effect: number;
  ci_low: number;
  ci_high: number;
  effect_kind: "percent" | "absolute";
  significant: boolean;
  sentence: string;
  /** Renseigné pour un niveau de facteur : le nom du facteur, et la modalité
   *  contre laquelle ce niveau se lit. */
  group?: string;
  reference_level?: string;
};

export type RegressionResult = {
  unit: string;
  unit_label: string;
  response: { key: string; label: string; unit: string };
  family: string;
  link: string;
  family_label: string;
  families: Array<{ key: string; label: string; available: boolean }>;
  factors: Array<{ key: string; label: string; hint: string; active: boolean }>;
  intercept: { estimate: number; std_error: number; p_value: number | null };
  terms: RegressionTerm[];
  /** Ce que la maille a perdu à l'intersection des sources, et par la faute de
   *  quelle variable. Une cellule qu'une source connaît et qu'une autre ignore
   *  disparaît du modèle ; l'écran doit pouvoir le dire. */
  coverage: {
    kept: number;
    dropped: number;
    missing_in: string[];
  };
  fit: {
    n: number;
    parameters: number;
    explained: number | null;
    dispersion: number;
    deviance: number;
  };
  points: Array<{
    key: string; label: string; observed: number; fitted: number;
    region: string | null; age: string | null; sex: string | null;
    /** Valeur brute de chaque variable explicative pour cette cellule, indexée
     *  par la même clé que `RegressionTerm.key`. */
    predictors: Record<string, number>;
  }>;
  warnings: Array<{ level: string; text: string }>;
};

export type RegressionRequest = {
  unit: string;
  response: string;
  response_selection?: string | null;
  predictors: Array<{ source: string; metric: string; selection: string | null }>;
  factors: string[];
  start_year: number;
  end_year: number;
  sex: "all" | "men" | "women";
  age_band: string | null;
  family: string | null;
};

export function runRegression(payload: RegressionRequest, signal?: AbortSignal): Promise<RegressionResult> {
  return post<RegressionResult>("/api/correlations/regression", payload, signal);
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

export function getPopulationMetadata(signal?: AbortSignal): Promise<PopulationMetadata> {
  return request<PopulationMetadata>("/api/population/meta", signal);
}

export function getPopulationOverview(
  payload: {
    year: number; start_year: number; end_year: number;
    region: string; age: string; sex: string;
  },
  signal?: AbortSignal,
): Promise<PopulationOverview> {
  return post<PopulationOverview>("/api/population/overview", payload, signal);
}

export function getPopulationExtractionPreview(payload: PopulationExtractionRequest, signal?: AbortSignal): Promise<ExtractionPreview> {
  return post<ExtractionPreview>("/api/population/extraction/preview", payload, signal);
}

export async function downloadPopulationExtraction(format: "csv" | "xlsx", payload: PopulationExtractionRequest): Promise<void> {
  const response = await fetch(`/api/population/extraction.${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.detail ?? "L’export Population n’a pas pu être généré.");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `population_extraction.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
