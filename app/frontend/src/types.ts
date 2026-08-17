export type PageKey = "damir" | "pathologies" | "csp" | "mortality" | "population" | "correlations" | "pivot" | "extraction" | "methodology";
export type MetricKind = "money" | "quantity" | "percent" | "index" | "raw";

export type Region = { code: number; label: string };
export type CodeOption = { code: number; label: string };

export type MeasureOption = {
  key: string;
  label: string;
  kind: "money" | "quantity" | "percent";
  family: string;
  definition: string;
  formula: string;
  caveat: string | null;
  requires_homogeneous_unit: boolean;
  additive: boolean;
  unit_key: "eur_total" | "eur_per_unit" | "service_unit" | "percent";
  unit_label: string;
  invalid_grand_posts: string[];
};

export type DimensionOption = { key: string; label: string };

export type Reliability = {
  available: boolean;
  status: string;
  consolidated_through: number | null;
  latest_flow: number | null;
  latest_flow_label?: string;
  liquidation_observed_through?: number | null;
  thresholds: Record<string, number | null>;
  curve: Array<{ delay: number; label: string; value: number }>;
};

export type Metadata = {
  years: number[];
  default_start_year: number;
  default_end_year: number;
  grand_posts: string[];
  regions: Region[];
  source: string;
  cube_size_bytes: number;
  measures: MeasureOption[];
  dimensions: DimensionOption[];
  sexes: CodeOption[];
  ages: CodeOption[];
  insurances: CodeOption[];
  envelopes: CodeOption[];
  has_delays: boolean;
  reliability: Reliability;
  semantic_version: string;
};

export type AdvancedFilters = {
  start_year: number;
  end_year: number;
  grand_post: string | null;
  post: string | null;
  sub_post: string | null;
  service_codes: number[];
  sexes: number[];
  ages: number[];
  regions: number[];
  insurances: number[];
  envelopes: number[];
  ald: number | null;
};

export type HierarchyOptions = {
  posts: string[];
  sub_posts: string[];
  services: Array<{ code: number; label: string; amount: number }>;
};

/* Le vocabulaire de l'ancien ecran « Reperes » — `AnalysisQuestion`,
   `Comparator`, `WorkbenchRequest`, `WorkbenchResult`, `ResultColumn`,
   `ResultRow` — est parti avec lui (point 2.1). Le Tableau ne parle plus
   qu'en composantes brutes et en formules : voir `pivot/model.ts`. */

export type ExtractionRequest = AdvancedFilters & {
  dimensions: string[];
  measures: string[];
  limit: number;
};

/** Une colonne d'apercu d'extraction, et sa ligne. Ces deux formes portaient
 *  les noms generiques `ResultColumn` / `ResultRow` du temps ou l'ancien ecran
 *  « Reperes » les partageait ; elles ne servent plus qu'ici. */
export type PreviewColumn = { key: string; label: string; kind: string };
export type PreviewRow = Record<string, string | number | null>;

export type ExtractionPreview = {
  columns: PreviewColumn[];
  rows: PreviewRow[];
  total_rows: number;
  limited: boolean;
};

export type PathologyMetadata = {
  available: boolean;
  levels: 3;
  years: number[];
  default_year: number;
  families: Array<{
    label: string;
    code: string;
    /** Patients sur le dernier millésime, France entière : sert à **classer**
     *  les pathologies dans le sélecteur de comparaison, jamais à afficher un
     *  chiffre. `null` quand la source n'en publie pas. */
    patients?: number | null;
    groups: Array<{
      label: string;
      code: string;
      patients?: number | null;
      pathologies: Array<{ code: string; label: string; patients?: number | null }>;
    }>;
  }>;
  regions: Array<{ code: string; label: string }>;
  ages: Array<{ code: string; label: string }>;
  sexes: Array<{ code: string; label: string }>;
  dimensions: Array<{ key: string; label: string }>;
  measures: Array<{ key: string; label: string; kind: "quantity" | "percent" }>;
  source: string;
};

export type PathologyOverview = {
  context: { top: string; label: string; family: string; year: number; region: string; age: string; sex: string };
  kpis: Array<{ key: string; label: string; value: number | null; kind: "quantity" | "percent" | "ratio"; detail: string }>;
  annual: Array<{ year: number; patients: number | null; prevalence: number | null }>;
  france_annual: Array<{ year: number; patients: number | null; prevalence: number | null }>;
  age_sex: Array<{ age: string; sex: string; patients: number | null; prevalence: number | null }>;
  territories: Array<{
    code: string;
    label: string;
    patients: number | null;
    prevalence: number | null;
    masked_cells: number;
    total_cells: number;
    masked_share: number;
  }>;
  france_reference: { patients: number | null; prevalence: number | null };
  quality: {
    masked_cells: number;
    total_cells: number;
    masked_share: number;
    unavailable_territories: number;
    available_territories: number;
  };
};

export type PathologyExtractionRequest = {
  top: string;
  start_year: number;
  end_year: number;
  dimensions: string[];
  measures: string[];
  limit: number;
};

export type CspOption = {
  code: string;
  label: string;
  group_code: string;
  group_label: string;
  /** Effectif du dernier millésime, France entière : sert à **classer** les
   *  catégories dans le sélecteur de comparaison et à désigner la sélection
   *  d'ouverture, jamais à afficher un chiffre. `null` quand la source n'en
   *  publie pas. */
  effectif?: number | null;
};

export type CspMetadata = {
  available: boolean;
  years: number[];
  default_year: number;
  levels: Array<{ key: "groupe_6" | "categorie_29"; label: string; options: CspOption[] }>;
  regions: Array<{ code: string; label: string }>;
  ages: Array<{ code: string; label: string }>;
  sexes: Array<{ code: number; label: string }>;
  source: string;
  nomenclatures?: Array<{ year: number; nomenclature: string }>;
  population_scope: string;
  core_size_bytes: number;
  geography_url: string;
};

export type CspOverview = {
  context: {
    year: number;
    level: "groupe_6" | "categorie_29";
    level_label: string;
    csp_code: string;
    csp_label: string;
    group_label: string;
    region: string;
    region_label: string;
    age: string;
    age_label: string;
    sex: number;
    sex_label: string;
  };
  kpis: Array<{ key: string; label: string; value: number | null; kind: "quantity" | "percent" | "ratio"; detail: string }>;
  /**
   * Série temporelle de la CSP dans le périmètre sélectionné. Elle est
   * facultative pour rester compatible avec une API qui ne connaît encore
   * qu'un seul millésime.
   */
  annual?: Array<{ year: number; effectif: number | null; share: number | null }>;
  /** Alias utilisé par l'endpoint d'évolution dédié. */
  evolution?: Array<{ year: number; population?: number | null; effectif: number | null; share: number | null }>;
  evolution_note?: string | null;
  nomenclatures?: Array<{ year: number; nomenclature: string }>;
  territories: Array<{ code: string; label: string; effectif: number; population: number; share: number }>;
  france_reference: { effectif: number; population: number; share: number };
  top_territory: { code: string; label: string; effectif: number; population: number; share: number } | null;
  age_sex: Array<{ age: string; age_order: number; sex_code: number; sex: string; effectif: number; population: number; share: number }>;
  composition: Array<{ code: string; label: string; group_label: string; effectif: number; share: number; france_share: number }>;
  quality: { regions: number; weighted: boolean; masked_cells: number; scope: string };
};

export type CspEvolution = {
  context: {
    level: "groupe_6" | "categorie_29";
    level_label: string;
    csp_code: string;
    csp_label: string;
    region: string;
    age: string;
    sex: number;
  };
  rows: Array<{ year: number; population: number | null; effectif: number | null; share: number | null }>;
};

export type CspExtractionRequest = {
  year: number;
  level: "groupe_6" | "categorie_29";
  csp_code: string;
  dimensions: string[];
  measures: string[];
  limit: number;
};

/** La cinquième base : la population résidente publiée par l'Insee. */
export type PopulationMetadata = {
  available: boolean;
  years: number[];
  default_year: number;
  /** `depuis` dit à partir de quel millésime le territoire entre dans la série :
   *  Mayotte n'y figure qu'à partir de 2014, les DROM qu'à partir de 1990. */
  regions: Array<{ code: string; label: string; depuis: number }>;
  ages: Array<{ code: string; label: string; decennal: number | null }>;
  sexes: Array<{ code: string; label: string }>;
  dimensions: Array<{ key: string; label: string }>;
  measures: Array<{ key: string; label: string; kind: "quantity" | "percent" }>;
  source: string;
  scope: string;
  limitations: string[];
};

export type PopulationCell = {
  age: string;
  age_label: string;
  decennal: number;
  sex: string;
  population: number | null;
  /** Vrai là où « 90 à 94 ans » porte en réalité tous les 90 ans et plus. */
  lumped: boolean;
};

export type PopulationOverview = {
  context: {
    year: number; start_year: number; end_year: number;
    region: string; region_label: string;
    age: string; age_label: string;
    sex: string; sex_label: string;
  };
  kpis: Array<{ key: string; label: string; value: number | null; kind: "quantity" | "percent"; detail: string }>;
  annual: Array<{ year: number; population: number | null; share: number | null }>;
  territories: Array<{ code: string; label: string; population: number | null; share: number | null }>;
  age_sex: PopulationCell[];
  sex_profile: Array<{ code: string; label: string; population: number | null; share: number | null }>;
  quality: { source: string; scope: string; limitations: string[]; lumped_90_plus: boolean };
};

export type PopulationExtractionRequest = {
  start_year: number;
  end_year: number;
  region: string;
  age: string;
  sex: string;
  dimensions: string[];
  measures: string[];
  limit: number;
};

export type MortalityMetadata = {
  available: boolean;
  years: number[];
  default_year: number;
  causes: Array<{
    code: string;
    label: string;
    /** Vrai pour un détail « dont … », faux pour un chapitre. Deux chapitres
     *  sont disjoints ; un chapitre et l'un de ses détails ne le sont pas. */
    detail?: boolean;
    /** Le chapitre auquel un détail se rattache — lui-même pour un chapitre. */
    chapter?: string;
    /** Décès de la dernière année, ensemble de la population : classe le
     *  sélecteur et désigne la sélection d'ouverture. */
    deaths?: number | null;
  }>;
  populations: Array<{ code: string; label: string }>;
  dimensions: Array<{ key: string; label: string }>;
  measures: Array<{ key: string; label: string; kind: "quantity" | "percent" }>;
  source: string;
  scope: string;
  limitations: string[];
};

export type MortalityOverview = {
  context: { cause: string; cause_label: string; population: string; population_label: string; year: number };
  kpis: Array<{ key: string; label: string; value: number | null; kind: "quantity" | "percent"; detail: string }>;
  annual: Array<{ year: number; deaths: number | null; share: number | null }>;
  top_causes: Array<{ code: string; label: string; deaths: number | null; share: number | null }>;
  profiles: {
    sex: Array<{ code: string; label: string; deaths: number | null; share: number | null }>;
    age: Array<{ code: string; label: string; deaths: number | null; share: number | null }>;
  };
  quality: { source_note: string; scope: string; limitations: string[] };
};

export type MortalityExtractionRequest = {
  start_year: number;
  end_year: number;
  cause: string;
  population: string;
  dimensions: string[];
  measures: string[];
  limit: number;
};

export type MethodSource = {
  key: string;
  name: string;
  producer: string;
  description: string;
  granularity: string;
  limitations: string[];
  status?: string;
  period?: string;
  dimensions?: string[];
  measures_count?: number;
  badges?: string[];
  years?: number[];
  nomenclatures?: string[];
};

export type Methodology = {
  source: MethodSource;
  pathology_source?: MethodSource;
  csp_source?: MethodSource;
  mortality_source?: MethodSource;
  population_source?: MethodSource;
  reliability: Reliability;
  measures: MeasureOption[];
  dimensions: DimensionOption[];
  compatibility_rules: Array<{ key: string; label: string; status: string }>;
  catalog: Array<{ key: string; label: string; status: string; common_dimensions: string[] }>;
};
