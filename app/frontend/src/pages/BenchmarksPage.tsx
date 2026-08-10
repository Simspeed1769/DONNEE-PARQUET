import { useEffect, useMemo, useState } from "react";
import type { ECharts } from "echarts/core";
import {
  downloadText,
  getCspMetadata,
  getCspOverview,
  getMortalityMetadata,
  getMortalityOverview,
  getPathologyMetadata,
  getPathologyOverview,
  runWorkbench,
} from "../api";
import { SearchableCauseSelect } from "../components/SearchableCauseSelect";
import { EChart } from "../charts/EChart";
import { useChartTokens } from "../charts/tokens";
import { rankOption, trendOption } from "../benchmarks/charts";
import type {
  AdvancedFilters,
  CspMetadata,
  CspOverview,
  Metadata,
  MetricKind,
  MortalityMetadata,
  MortalityOverview,
  PathologyMetadata,
  PathologyOverview,
  WorkbenchRequest,
  WorkbenchResult,
} from "../types";
import {
  csvFromRows,
  defaultFilters,
  filtersFromSearch,
  formatValue,
  writeFilters,
  yearStatusLabel,
} from "../utils";

type RepereSource = "damir" | "pathologies" | "csp" | "mortality";
type CalculationKey = "value" | "period_total" | "average_unit" | "cagr" | "change" | "dispersion";

type Props = {
  metadata: Metadata;
  routeVersion: number;
  onOpenExtraction: (params: URLSearchParams) => void;
  onOpenMethodology: () => void;
};

type CalculationOption = {
  key: CalculationKey;
  label: string;
  shortLabel: string;
};

type ReperePoint = {
  label: string;
  value: number;
};

type RepereModel = {
  sourceLabel: string;
  sourceNote: string;
  title: string;
  eyebrow: string;
  period: string;
  value: number | null;
  valueKind: MetricKind | "raw";
  unitLabel: string;
  sentence: string;
  comparison: string | null;
  comparisonTone: "up" | "down" | "neutral";
  badges: string[];
  seriesLabel: string;
  seriesKind: MetricKind | "raw";
  seriesUnitLabel: string;
  points: ReperePoint[];
  chartType: "line" | "bar";
  method: {
    definition: string;
    formula: string;
    denominator: string;
    limitation: string;
  };
  warning: string | null;
};

const SOURCE_OPTIONS: Array<{ key: RepereSource; label: string; detail: string }> = [
  { key: "damir", label: "DAMIR", detail: "Dépenses et activité" },
  { key: "pathologies", label: "Pathologies", detail: "Patients et prévalence" },
  { key: "csp", label: "CSP", detail: "Population en emploi" },
  { key: "mortality", label: "Mortalité", detail: "Causes de décès" },
];

const CALCULATION_LABELS: Record<CalculationKey, string> = {
  value: "Valeur du dernier millésime",
  period_total: "Cumul sur la période",
  average_unit: "Moyenne par unité",
  cagr: "Évolution annuelle moyenne",
  change: "Évolution en points",
  dispersion: "Dispersion territoriale",
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function annualizedChange(points: ReperePoint[]): number | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points.at(-1)!;
  const elapsed = Number(last.label) - Number(first.label);
  if (!Number.isFinite(elapsed) || elapsed <= 0 || first.value <= 0 || last.value < 0) return null;
  return 100 * ((last.value / first.value) ** (1 / elapsed) - 1);
}

function relativeChange(current: number | null, previous: number | null): number | null {
  return current !== null && previous !== null && previous !== 0
    ? 100 * (current / previous - 1)
    : null;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatHero(value: number | null, kind: string, unitLabel: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (unitLabel === "points") {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} pts`;
  }
  if (unitLabel === "ratio") {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} ×`;
  }
  return formatValue(value, kind);
}

function formatExact(value: number, kind: string, unitLabel: string): string {
  const formatted = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: kind === "percent" || unitLabel === "points" ? 2 : 0,
  }).format(value);
  if (unitLabel === "points") return `${formatted} points`;
  if (kind === "money") return `${formatted} €`;
  if (kind === "percent") return `${formatted} %`;
  return formatted;
}

function toneFor(value: number | null): "up" | "down" | "neutral" {
  if (value === null || value === 0) return "neutral";
  return value > 0 ? "up" : "down";
}

export function BenchmarksPage({ metadata, routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const initial = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const initialSource = initial.get("source");
  const initialCalculation = initial.get("calculation");

  const [source, setSource] = useState<RepereSource>(
    initialSource === "pathologies" || initialSource === "csp" || initialSource === "mortality"
      ? initialSource
      : "damir",
  );
  const [calculation, setCalculation] = useState<CalculationKey>(
    (["value", "period_total", "average_unit", "cagr", "change", "dispersion"].includes(initialCalculation ?? "")
      ? initialCalculation
      : "value") as CalculationKey,
  );
  const [scopeOpen, setScopeOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [valuesOpen, setValuesOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState<ReperePoint | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokens = useChartTokens();
  const [plotInstance, setPlotInstance] = useState<ECharts | null>(null);

  const [damirFilters, setDamirFilters] = useState<AdvancedFilters>(() => filtersFromSearch(metadata, initial));
  const [damirMeasure, setDamirMeasure] = useState(() => {
    const requested = initial.get("measure");
    return requested && metadata.measures.some((item) => item.key === requested && !item.key.startsWith("average_"))
      ? requested
      : "reimbursed";
  });
  const [damirResult, setDamirResult] = useState<WorkbenchResult | null>(null);

  const [pathologyMetadata, setPathologyMetadata] = useState<PathologyMetadata | null>(null);
  const [pathologyTop, setPathologyTop] = useState(initial.get("top") ?? "");
  const [pathologyStartYear, setPathologyStartYear] = useState(Number(initial.get("start_year")) || 2015);
  const [pathologyEndYear, setPathologyEndYear] = useState(Number(initial.get("end_year")) || 2024);
  const [pathologyRegion, setPathologyRegion] = useState(initial.get("region") ?? "99");
  const [pathologyAge, setPathologyAge] = useState(initial.get("age") ?? "tsage");
  const [pathologySex, setPathologySex] = useState(initial.get("sex") ?? "tous sexes");
  const [pathologyMeasure, setPathologyMeasure] = useState<"patients" | "prevalence">(
    initial.get("measure") === "patients" ? "patients" : "prevalence",
  );
  const [pathologyOverview, setPathologyOverview] = useState<PathologyOverview | null>(null);

  const [cspMetadata, setCspMetadata] = useState<CspMetadata | null>(null);
  const [cspLevel, setCspLevel] = useState<"groupe_6" | "categorie_29">(
    initial.get("level") === "categorie_29" ? "categorie_29" : "groupe_6",
  );
  const [cspCode, setCspCode] = useState(initial.get("csp") ?? "3");
  const [cspStartYear, setCspStartYear] = useState(Number(initial.get("start_year")) || 2015);
  const [cspEndYear, setCspEndYear] = useState(Number(initial.get("end_year")) || 2023);
  const [cspRegion, setCspRegion] = useState(initial.get("region") ?? "FR");
  const [cspAge, setCspAge] = useState(initial.get("age") ?? "all");
  const [cspSex, setCspSex] = useState(Number(initial.get("sex")) || 0);
  const [cspMeasure, setCspMeasure] = useState<"effectif" | "share">(
    initial.get("measure") === "effectif" ? "effectif" : "share",
  );
  const [cspOverview, setCspOverview] = useState<CspOverview | null>(null);

  const [mortalityMetadata, setMortalityMetadata] = useState<MortalityMetadata | null>(null);
  const [mortalityCause, setMortalityCause] = useState(initial.get("cause") ?? "");
  const [mortalityPopulation, setMortalityPopulation] = useState(initial.get("population") ?? "ensemble");
  const [mortalityStartYear, setMortalityStartYear] = useState(Number(initial.get("start_year")) || 2015);
  const [mortalityEndYear, setMortalityEndYear] = useState(Number(initial.get("end_year")) || 2024);
  const [mortalityMeasure, setMortalityMeasure] = useState<"deaths" | "share">(
    initial.get("measure") === "share" ? "share" : "deaths",
  );
  const [mortalityOverview, setMortalityOverview] = useState<MortalityOverview | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      getPathologyMetadata(controller.signal),
      getCspMetadata(controller.signal),
      getMortalityMetadata(controller.signal),
    ]).then(([pathology, csp, mortality]) => {
      setPathologyMetadata(pathology);
      const pathologyCatalog = pathology.families.flatMap((family) => [
        { code: family.code, label: family.label },
        ...family.groups.flatMap((group) => [
          { code: group.code, label: group.label },
          ...group.pathologies,
        ]),
      ]);
      const preferredPathology = pathologyCatalog.find((item) => item.code === pathologyTop)
        ?? pathologyCatalog.find((item) => item.label.toLocaleLowerCase("fr").includes("diab"))
        ?? pathologyCatalog[0];
      if (preferredPathology) setPathologyTop(preferredPathology.code);
      setPathologyStartYear((year) => pathology.years.includes(year) ? year : pathology.years[0]);
      setPathologyEndYear((year) => pathology.years.includes(year) ? year : pathology.default_year);

      setCspMetadata(csp);
      const level = csp.levels.find((item) => item.key === cspLevel) ?? csp.levels[0];
      const preferredCsp = level.options.find((item) => item.code === cspCode)
        ?? level.options.find((item) => item.code === (cspLevel === "groupe_6" ? "3" : "38"))
        ?? level.options[0];
      if (preferredCsp) setCspCode(preferredCsp.code);
      setCspStartYear((year) => csp.years.includes(year) ? year : csp.years[0]);
      setCspEndYear((year) => csp.years.includes(year) ? year : csp.default_year);

      setMortalityMetadata(mortality);
      const preferredCause = mortality.causes.find((item) => item.code === mortalityCause)
        ?? mortality.causes.find((item) => item.label.toLocaleLowerCase("fr") === "tumeurs")
        ?? mortality.causes[0];
      if (preferredCause) setMortalityCause(preferredCause.code);
      setMortalityStartYear((year) => mortality.years.includes(year) ? year : mortality.years[0]);
      setMortalityEndYear((year) => mortality.years.includes(year) ? year : mortality.default_year);
    }).catch((reason: Error) => {
      if (reason.name !== "AbortError") {
        setError(reason.message);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, []);

  const damirRequestedMeasure = calculation === "average_unit"
    ? damirMeasure === "expense" ? "average_expense" : "average_reimbursed"
    : damirMeasure;

  const damirRequest = useMemo<WorkbenchRequest>(() => ({
    ...damirFilters,
    question: "calculator",
    measure: damirRequestedMeasure,
    time_axis: "care",
    display: "raw",
    comparator: "years",
    reference: null,
    comparison_year_a: null,
    comparison_year_b: null,
    comparison_regions: [],
    reference_measure: null,
    reference_time_axis: null,
    comparison_display: "auto",
    decomposition_basis: "total",
    dimension: "year",
    limit: 100,
  }), [damirFilters, damirRequestedMeasure]);

  useEffect(() => {
    if (source !== "damir") return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      runWorkbench(damirRequest, controller.signal)
        .then((result) => { if (active) setDamirResult(result); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, damirRequest]);

  useEffect(() => {
    if (source !== "pathologies" || !pathologyMetadata || !pathologyTop) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      getPathologyOverview(pathologyTop, pathologyEndYear, {
        region: pathologyRegion,
        age: pathologyAge,
        sex: pathologySex,
      }, controller.signal)
        .then((result) => { if (active) setPathologyOverview(result); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, pathologyMetadata, pathologyTop, pathologyEndYear, pathologyRegion, pathologyAge, pathologySex]);

  useEffect(() => {
    if (source !== "csp" || !cspMetadata || !cspCode) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      getCspOverview({
        year: cspEndYear,
        level: cspLevel,
        csp_code: cspCode,
        region: cspRegion,
        age: cspAge,
        sex: cspSex,
      }, controller.signal)
        .then((result) => { if (active) setCspOverview(result); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, cspMetadata, cspEndYear, cspLevel, cspCode, cspRegion, cspAge, cspSex]);

  useEffect(() => {
    if (source !== "mortality" || !mortalityMetadata || !mortalityCause) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    const timer = window.setTimeout(() => {
      getMortalityOverview({
        cause: mortalityCause,
        population: mortalityPopulation,
        year: mortalityEndYear,
      }, controller.signal)
        .then((result) => { if (active) setMortalityOverview(result); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, mortalityMetadata, mortalityCause, mortalityPopulation, mortalityEndYear]);

  const cspComparableRows = useMemo(() => {
    const rows = cspOverview?.evolution ?? cspOverview?.annual ?? [];
    const inPeriod = rows.filter((row) => row.year >= cspStartYear && row.year <= cspEndYear);
    if (cspLevel === "groupe_6") return inPeriod;
    const selectedNomenclature = cspMetadata?.nomenclatures?.find((item) => item.year === cspEndYear)?.nomenclature;
    return selectedNomenclature
      ? inPeriod.filter((row) => cspMetadata?.nomenclatures?.find((item) => item.year === row.year)?.nomenclature === selectedNomenclature)
      : inPeriod.slice(-1);
  }, [cspOverview, cspStartYear, cspEndYear, cspLevel, cspMetadata]);

  const calculationOptions = useMemo<CalculationOption[]>(() => {
    const option = (key: CalculationKey, shortLabel: string): CalculationOption => ({
      key,
      shortLabel,
      label: CALCULATION_LABELS[key],
    });
    if (source === "damir") {
      const metric = metadata.measures.find((item) => item.key === damirMeasure);
      const options = [option("value", "Valeur")];
      if (metric?.additive) options.push(option("period_total", "Cumul"));
      if (damirMeasure === "reimbursed" || damirMeasure === "expense") options.push(option("average_unit", "Moyenne/unité"));
      options.push(metric?.kind === "percent" ? option("change", "Évolution") : option("cagr", "TCAM"));
      return options;
    }
    if (source === "pathologies") {
      return [
        option("value", "Valeur"),
        pathologyMeasure === "patients" ? option("cagr", "TCAM") : option("change", "Évolution"),
        ...(pathologyMeasure === "prevalence" ? [option("dispersion", "Territoires")] : []),
      ];
    }
    if (source === "csp") {
      return [
        option("value", "Valeur"),
        ...(cspComparableRows.length > 1
          ? [cspMeasure === "effectif" ? option("cagr", "TCAM") : option("change", "Évolution")]
          : []),
        ...(cspMeasure === "share" ? [option("dispersion", "Territoires")] : []),
      ];
    }
    return [
      option("value", "Valeur"),
      mortalityMeasure === "deaths" ? option("cagr", "TCAM") : option("change", "Évolution"),
    ];
  }, [
    source,
    metadata.measures,
    damirMeasure,
    pathologyMeasure,
    cspComparableRows.length,
    cspMeasure,
    mortalityMeasure,
  ]);

  useEffect(() => {
    if (!calculationOptions.some((item) => item.key === calculation)) {
      setCalculation(calculationOptions[0]?.key ?? "value");
    }
  }, [calculation, calculationOptions]);

  const pathologyCatalog = useMemo(() => {
    const options = pathologyMetadata?.families.flatMap((family) => [
      { code: family.code, label: `${family.label} · ensemble` },
      ...family.groups.flatMap((group) => [
        { code: group.code, label: `${family.label} · ${group.label}` },
        ...group.pathologies
          .filter((item) => item.code !== group.code)
          .map((item) => ({ code: item.code, label: `${family.label} · ${item.label}` })),
      ]),
    ]) ?? [];
    return [...new Map(options.map((item) => [item.code, item])).values()];
  }, [pathologyMetadata]);

  const model = useMemo<RepereModel | null>(() => {
    if (source === "damir" && damirResult) {
      const queryMetric = metadata.measures.find((item) => item.key === damirRequestedMeasure);
      const baseMetric = metadata.measures.find((item) => item.key === damirMeasure);
      const points = (damirResult.series[0]?.points ?? [])
        .filter((point) => finite(point.y))
        .map((point) => ({ label: String(point.x), value: Number(point.y) }));
      const current = points.at(-1) ?? null;
      const previous = points.at(-2) ?? null;
      const change = baseMetric?.kind === "percent"
        ? current && previous ? current.value - previous.value : null
        : relativeChange(current?.value ?? null, previous?.value ?? null);
      let value = current?.value ?? null;
      let valueKind: MetricKind | "raw" = damirResult.unit;
      let unitLabel = damirResult.unit_label ?? queryMetric?.unit_label ?? "";
      let title = `${queryMetric?.label ?? damirRequestedMeasure}, ${current?.label ?? damirFilters.end_year}`;
      let sentence = "Valeur du dernier millésime sur le périmètre actif.";
      if (calculation === "period_total") {
        value = damirResult.summary.value_a;
        title = `Cumul · ${queryMetric?.label ?? damirRequestedMeasure}`;
        sentence = "Somme des montants annuels du périmètre.";
      } else if (calculation === "average_unit") {
        title = `${queryMetric?.label ?? "Moyenne par unité"}, ${current?.label ?? damirFilters.end_year}`;
        sentence = "Rapport entre les montants et les volumes du même périmètre.";
      } else if (calculation === "cagr") {
        value = annualizedChange(points);
        valueKind = "percent";
        unitLabel = "%";
        title = `Évolution annuelle moyenne · ${baseMetric?.label ?? damirMeasure}`;
        sentence = `Rythme annuel composé entre ${points[0]?.label ?? "le début"} et ${points.at(-1)?.label ?? "la fin"} de la période.`;
      } else if (calculation === "change") {
        value = points.length > 1 ? points.at(-1)!.value - points[0].value : null;
        valueKind = "raw";
        unitLabel = "points";
        title = `Évolution du taux · ${baseMetric?.label ?? damirMeasure}`;
        sentence = `Écart entre ${points[0]?.label ?? "le début"} et ${points.at(-1)?.label ?? "la fin"} de la période.`;
      }
      return {
        sourceLabel: "DAMIR",
        sourceNote: "Assurance Maladie · données agrégées",
        title,
        eyebrow: CALCULATION_LABELS[calculation],
        period: `${damirFilters.start_year}–${damirFilters.end_year}`,
        value,
        valueKind,
        unitLabel,
        sentence,
        comparison: !["value", "average_unit"].includes(calculation) || change === null
          ? null
          : baseMetric?.kind === "percent"
            ? `${change >= 0 ? "+" : ""}${change.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} point(s) vs ${previous?.label}`
            : `${change >= 0 ? "+" : ""}${change.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % vs ${previous?.label}`,
        comparisonTone: toneFor(change),
        badges: [
          damirFilters.end_year > (metadata.reliability.consolidated_through ?? damirFilters.end_year)
            ? "En consolidation"
            : "Consolidé",
          "Calcul agrégé",
        ],
        seriesLabel: queryMetric?.label ?? damirRequestedMeasure,
        seriesKind: damirResult.unit,
        seriesUnitLabel: damirResult.unit_label ?? queryMetric?.unit_label ?? "",
        points,
        chartType: "line",
        method: {
          definition: queryMetric?.definition ?? "Indicateur DAMIR calculé sur le périmètre sélectionné.",
          formula: calculation === "cagr"
            ? "(valeur finale / valeur initiale)^(1 / nombre d’années) − 1"
            : calculation === "change"
              ? "valeur finale − valeur initiale"
              : queryMetric?.formula ?? "Agrégation DAMIR",
          denominator: queryMetric?.additive === false
            ? "Le ratio est recalculé à partir des sommes du numérateur et du dénominateur."
            : "Aucun dénominateur pour cette mesure additive.",
          limitation: queryMetric?.caveat
            ?? "Les données sont agrégées : aucune distribution individuelle n’est disponible.",
        },
        warning: damirResult.warnings[0] ?? null,
      };
    }

    if (source === "pathologies" && pathologyOverview && pathologyMetadata) {
      const points = pathologyOverview.annual
        .filter((row) => row.year >= pathologyStartYear && row.year <= pathologyEndYear)
        .flatMap((row) => {
          const value = pathologyMeasure === "patients" ? row.patients : row.prevalence;
          return finite(value) ? [{ label: String(row.year), value }] : [];
        });
      const current = points.at(-1) ?? null;
      const previous = points.at(-2) ?? null;
      const relative = pathologyMeasure === "patients"
        ? relativeChange(current?.value ?? null, previous?.value ?? null)
        : current && previous ? current.value - previous.value : null;
      const territoryValues = pathologyOverview.territories
        .filter((item): item is typeof item & { prevalence: number } => finite(item.prevalence))
        .map((item) => ({ label: item.label, value: item.prevalence }));
      let resultPoints = points;
      let value = current?.value ?? null;
      let valueKind: MetricKind | "raw" = pathologyMeasure === "patients" ? "quantity" : "percent";
      let unitLabel = pathologyMeasure === "patients" ? "patients" : "%";
      let title = `${pathologyMeasure === "patients" ? "Patients" : "Prévalence"} · ${pathologyOverview.context.label}`;
      let chartType: "line" | "bar" = "line";
      let sentence = pathologyMeasure === "patients"
        ? "Effectif publié par la Cnam."
        : "Rapport entre patients et population de référence.";
      if (calculation === "cagr") {
        value = annualizedChange(points);
        valueKind = "percent";
        unitLabel = "%";
        title = `Évolution annuelle moyenne · ${pathologyOverview.context.label}`;
        sentence = `Rythme annuel composé du nombre de patients entre ${points[0]?.label ?? "le début"} et ${points.at(-1)?.label ?? "la fin"} de la période.`;
      } else if (calculation === "change") {
        value = points.length > 1 ? points.at(-1)!.value - points[0].value : null;
        valueKind = "raw";
        unitLabel = "points";
        title = `Évolution de la prévalence · ${pathologyOverview.context.label}`;
        sentence = `Écart de prévalence entre ${points[0]?.label ?? "le début"} et ${points.at(-1)?.label ?? "la fin"} de la période.`;
      } else if (calculation === "dispersion") {
        const values = territoryValues.map((item) => item.value);
        value = values.length ? Math.max(...values) - Math.min(...values) : null;
        valueKind = "raw";
        unitLabel = "points";
        title = `Amplitude territoriale · ${pathologyOverview.context.label}`;
        resultPoints = [...territoryValues].sort((left, right) => left.value - right.value);
        chartType = "bar";
        const middle = median(values);
        sentence = values.length
          ? `Min ${Math.min(...values).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} % · médiane ${middle?.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} % · max ${Math.max(...values).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %.`
          : "Aucune prévalence territoriale disponible.";
      }
      return {
        sourceLabel: "Pathologies",
        sourceNote: "Cartographie des pathologies · Cnam",
        title,
        eyebrow: CALCULATION_LABELS[calculation],
        period: `${pathologyStartYear}–${pathologyEndYear}`,
        value,
        valueKind,
        unitLabel,
        sentence,
        comparison: calculation !== "value" || relative === null
          ? null
          : pathologyMeasure === "patients"
            ? `${relative >= 0 ? "+" : ""}${relative.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % vs ${previous?.label}`
            : `${relative >= 0 ? "+" : ""}${relative.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} point(s) vs ${previous?.label}`,
        comparisonTone: toneFor(relative),
        badges: [
          pathologyMetadata.regions.find((item) => item.code === pathologyRegion)?.label ?? "Périmètre sélectionné",
          pathologyOverview.quality.masked_cells
            ? `${pathologyOverview.quality.masked_cells} cellule(s) masquée(s)`
            : "Aucun masquage",
        ],
        seriesLabel: pathologyMeasure === "patients" ? "Patients" : "Prévalence",
        seriesKind: pathologyMeasure === "patients" ? "quantity" : "percent",
        seriesUnitLabel: pathologyMeasure === "patients" ? "patients" : "%",
        points: resultPoints,
        chartType,
        method: {
          definition: pathologyMeasure === "patients"
            ? "Nombre de personnes prises en charge pour la pathologie sélectionnée."
            : "Part des patients dans la population de référence publiée.",
          formula: calculation === "cagr"
            ? "(valeur finale / valeur initiale)^(1 / nombre d’années) − 1"
            : calculation === "change"
              ? "prévalence finale − prévalence initiale"
              : calculation === "dispersion"
                ? "prévalence régionale maximale − prévalence régionale minimale"
                : pathologyMeasure === "patients"
                  ? "Effectif Cnam publié"
                  : "100 × patients / population de référence",
          denominator: pathologyMeasure === "patients"
            ? "Aucun dénominateur."
            : "Population de référence correspondant au même âge, sexe, territoire et millésime.",
          limitation: "Les petites cellules peuvent être masquées à la source et ne sont jamais remplacées par zéro.",
        },
        warning: pathologyOverview.quality.unavailable_territories
          ? `${pathologyOverview.quality.unavailable_territories} territoire(s) sans prévalence sont exclus du repère territorial.`
          : null,
      };
    }

    if (source === "csp" && cspOverview && cspMetadata) {
      const points = cspComparableRows.flatMap((row) => {
        const value = cspMeasure === "effectif" ? row.effectif : row.share;
        return finite(value) ? [{ label: String(row.year), value }] : [];
      });
      const current = points.at(-1) ?? null;
      const previous = points.at(-2) ?? null;
      const relative = cspMeasure === "effectif"
        ? relativeChange(current?.value ?? null, previous?.value ?? null)
        : current && previous ? current.value - previous.value : null;
      const territoryValues = cspOverview.territories.map((item) => ({ label: item.label, value: item.share }));
      let resultPoints = points;
      let value = current?.value ?? null;
      let valueKind: MetricKind | "raw" = cspMeasure === "effectif" ? "quantity" : "percent";
      let unitLabel = cspMeasure === "effectif" ? "personnes" : "%";
      let title = `${cspMeasure === "effectif" ? "Effectif pondéré" : "Part"} · ${cspOverview.context.csp_label}`;
      let chartType: "line" | "bar" = "line";
      let sentence = cspMeasure === "effectif"
        ? "Effectif pondéré dans le recensement."
        : "Part parmi les actifs ayant un emploi.";
      if (calculation === "cagr") {
        value = annualizedChange(points);
        valueKind = "percent";
        unitLabel = "%";
        title = `Évolution annuelle moyenne · ${cspOverview.context.csp_label}`;
        sentence = `Rythme annuel composé de l’effectif entre ${points[0]?.label ?? "le début"} et ${points.at(-1)?.label ?? "la fin"} de la période comparable.`;
      } else if (calculation === "change") {
        value = points.length > 1 ? points.at(-1)!.value - points[0].value : null;
        valueKind = "raw";
        unitLabel = "points";
        title = `Évolution de la part · ${cspOverview.context.csp_label}`;
        sentence = `Écart de part entre ${points[0]?.label ?? "le début"} et ${points.at(-1)?.label ?? "la fin"} de la période comparable.`;
      } else if (calculation === "dispersion") {
        const values = territoryValues.map((item) => item.value);
        value = values.length ? Math.max(...values) - Math.min(...values) : null;
        valueKind = "raw";
        unitLabel = "points";
        title = `Amplitude territoriale · ${cspOverview.context.csp_label}`;
        resultPoints = [...territoryValues].sort((left, right) => left.value - right.value);
        chartType = "bar";
        const middle = median(values);
        sentence = values.length
          ? `Min ${Math.min(...values).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} % · médiane ${middle?.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} % · max ${Math.max(...values).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %.`
          : "Aucune part territoriale disponible.";
      }
      return {
        sourceLabel: "CSP",
        sourceNote: "Recensement de la population · Insee",
        title,
        eyebrow: CALCULATION_LABELS[calculation],
        period: points.length > 1 ? `${points[0].label}–${points.at(-1)!.label}` : String(cspEndYear),
        value,
        valueKind,
        unitLabel,
        sentence,
        comparison: calculation !== "value" || relative === null
          ? null
          : cspMeasure === "effectif"
            ? `${relative >= 0 ? "+" : ""}${relative.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % vs ${previous?.label}`
            : `${relative >= 0 ? "+" : ""}${relative.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} point(s) vs ${previous?.label}`,
        comparisonTone: toneFor(relative),
        badges: ["Pondéré Insee", cspOverview.context.level_label],
        seriesLabel: cspMeasure === "effectif" ? "Effectif pondéré" : "Part de la CSP",
        seriesKind: cspMeasure === "effectif" ? "quantity" : "percent",
        seriesUnitLabel: cspMeasure === "effectif" ? "personnes" : "%",
        points: resultPoints,
        chartType,
        method: {
          definition: cspMeasure === "effectif"
            ? "Estimation pondérée du nombre d’actifs ayant un emploi dans la CSP sélectionnée."
            : "Poids de la CSP parmi les actifs ayant un emploi du même périmètre.",
          formula: calculation === "cagr"
            ? "(valeur finale / valeur initiale)^(1 / nombre d’années) − 1"
            : calculation === "change"
              ? "part finale − part initiale"
              : calculation === "dispersion"
                ? "part régionale maximale − part régionale minimale"
                : cspMeasure === "effectif"
                  ? "Somme des poids individuels Insee"
                  : "100 × effectif de la CSP / actifs ayant un emploi",
          denominator: cspMeasure === "effectif"
            ? "Aucun dénominateur."
            : "Ensemble des actifs ayant un emploi dans le même périmètre.",
          limitation: cspOverview.evolution_note
            ?? "Les évolutions détaillées restent limitées à une nomenclature comparable.",
        },
        warning: cspOverview.evolution_note ?? null,
      };
    }

    if (source === "mortality" && mortalityOverview && mortalityMetadata) {
      const points = mortalityOverview.annual
        .filter((row) => row.year >= mortalityStartYear && row.year <= mortalityEndYear)
        .flatMap((row) => {
          const value = mortalityMeasure === "deaths" ? row.deaths : row.share;
          return finite(value) ? [{ label: String(row.year), value }] : [];
        });
      const current = points.at(-1) ?? null;
      const previous = points.at(-2) ?? null;
      const relative = mortalityMeasure === "deaths"
        ? relativeChange(current?.value ?? null, previous?.value ?? null)
        : current && previous ? current.value - previous.value : null;
      let value = current?.value ?? null;
      let valueKind: MetricKind | "raw" = mortalityMeasure === "deaths" ? "quantity" : "percent";
      let unitLabel = mortalityMeasure === "deaths" ? "décès" : "%";
      let title = `${mortalityMeasure === "deaths" ? "Décès" : "Part des décès"} · ${mortalityOverview.context.cause_label}`;
      let sentence = mortalityMeasure === "deaths"
        ? "Effectif brut publié, sans estimation."
        : "Part de la cause parmi tous les décès.";
      if (calculation === "cagr") {
        value = annualizedChange(points);
        valueKind = "percent";
        unitLabel = "%";
        title = `Évolution annuelle moyenne · ${mortalityOverview.context.cause_label}`;
        sentence = `Rythme annuel composé du nombre de décès entre ${points[0]?.label ?? "le début"} et ${points.at(-1)?.label ?? "la fin"} de la période.`;
      } else if (calculation === "change") {
        value = points.length > 1 ? points.at(-1)!.value - points[0].value : null;
        valueKind = "raw";
        unitLabel = "points";
        title = `Évolution de la part · ${mortalityOverview.context.cause_label}`;
        sentence = `Écart de part entre ${points[0]?.label ?? "le début"} et ${points.at(-1)?.label ?? "la fin"} de la période.`;
      }
      return {
        sourceLabel: "Mortalité",
        sourceNote: "INSERM–CépiDc · effectifs publiés",
        title,
        eyebrow: CALCULATION_LABELS[calculation],
        period: `${mortalityStartYear}–${mortalityEndYear}`,
        value,
        valueKind,
        unitLabel,
        sentence,
        comparison: calculation !== "value" || relative === null
          ? null
          : mortalityMeasure === "deaths"
            ? `${relative >= 0 ? "+" : ""}${relative.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % vs ${previous?.label}`
            : `${relative >= 0 ? "+" : ""}${relative.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} point(s) vs ${previous?.label}`,
        comparisonTone: toneFor(relative),
        badges: [mortalityOverview.context.population_label, "Effectifs bruts"],
        seriesLabel: mortalityMeasure === "deaths" ? "Décès" : "Part des décès",
        seriesKind: mortalityMeasure === "deaths" ? "quantity" : "percent",
        seriesUnitLabel: mortalityMeasure === "deaths" ? "décès" : "%",
        points,
        chartType: "line",
        method: {
          definition: mortalityMeasure === "deaths"
            ? "Nombre de décès enregistrés pour la cause et la population sélectionnées."
            : "Poids de la cause parmi tous les décès du même périmètre.",
          formula: calculation === "cagr"
            ? "(valeur finale / valeur initiale)^(1 / nombre d’années) − 1"
            : calculation === "change"
              ? "part finale − part initiale"
              : mortalityMeasure === "deaths"
                ? "Effectif CépiDc publié"
                : "100 × décès de la cause / décès toutes causes",
          denominator: mortalityMeasure === "deaths"
            ? "Aucun dénominateur."
            : "Décès toutes causes pour le même millésime et la même population.",
          limitation: "Les effectifs ne sont pas rapportés à une population exposée et ne mesurent pas un risque de mortalité.",
        },
        warning: mortalityMetadata.limitations[0] ?? null,
      };
    }
    return null;
  }, [
    source,
    calculation,
    metadata,
    damirResult,
    damirRequestedMeasure,
    damirMeasure,
    damirFilters,
    pathologyOverview,
    pathologyMetadata,
    pathologyStartYear,
    pathologyEndYear,
    pathologyMeasure,
    pathologyRegion,
    cspOverview,
    cspMetadata,
    cspComparableRows,
    cspMeasure,
    cspEndYear,
    mortalityOverview,
    mortalityMetadata,
    mortalityStartYear,
    mortalityEndYear,
    mortalityMeasure,
  ]);

  useEffect(() => {
    const params = new URLSearchParams({ page: "benchmarks", source, calculation });
    if (source === "damir") {
      params.set("measure", damirMeasure);
      writeFilters(params, damirFilters);
    } else if (source === "pathologies") {
      params.set("top", pathologyTop);
      params.set("measure", pathologyMeasure);
      params.set("start_year", String(pathologyStartYear));
      params.set("end_year", String(pathologyEndYear));
      params.set("region", pathologyRegion);
      params.set("age", pathologyAge);
      params.set("sex", pathologySex);
    } else if (source === "csp") {
      params.set("level", cspLevel);
      params.set("csp", cspCode);
      params.set("measure", cspMeasure);
      params.set("start_year", String(cspStartYear));
      params.set("end_year", String(cspEndYear));
      params.set("region", cspRegion);
      params.set("age", cspAge);
      params.set("sex", String(cspSex));
    } else {
      params.set("cause", mortalityCause);
      params.set("population", mortalityPopulation);
      params.set("measure", mortalityMeasure);
      params.set("start_year", String(mortalityStartYear));
      params.set("end_year", String(mortalityEndYear));
    }
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [
    source,
    calculation,
    damirMeasure,
    damirFilters,
    pathologyTop,
    pathologyMeasure,
    pathologyStartYear,
    pathologyEndYear,
    pathologyRegion,
    pathologyAge,
    pathologySex,
    cspLevel,
    cspCode,
    cspMeasure,
    cspStartYear,
    cspEndYear,
    cspRegion,
    cspAge,
    cspSex,
    mortalityCause,
    mortalityPopulation,
    mortalityMeasure,
    mortalityStartYear,
    mortalityEndYear,
  ]);

  const plotHeight = model?.chartType === "bar" ? Math.max(320, model.points.length * 25 + 90) : 315;
  const plot = useMemo(() => {
    if (!model) return null;
    const format = (value: number) => formatExact(value, model.seriesKind, model.seriesUnitLabel);
    return model.chartType === "bar"
      ? rankOption({ rows: model.points, format, kind: model.seriesKind, tokens })
      : trendOption({ rows: model.points, format, kind: model.seriesKind, tokens });
  }, [model, tokens]);

  useEffect(() => {
    if (!plotInstance || !model) return;
    const points = model.points;
    const onHover = (params: any) => {
      const point = points[params.dataIndex];
      if (point) setHoveredPoint(point);
    };
    const onLeave = () => setHoveredPoint(null);
    plotInstance.on("mouseover", onHover);
    plotInstance.on("mouseout", onLeave);
    return () => {
      plotInstance.off("mouseover", onHover);
      plotInstance.off("mouseout", onLeave);
    };
  }, [plotInstance, model]);

  const selectSource = (next: RepereSource) => {
    setSource(next);
    setCalculation("value");
    setHoveredPoint(null);
    setScopeOpen(false);
    setContextOpen(false);
    setValuesOpen(false);
    setMethodOpen(false);
  };

  const updateDamirPeriod = (key: "start_year" | "end_year", value: number) => {
    setDamirFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "start_year" && value > current.end_year ? { end_year: value } : {}),
      ...(key === "end_year" && value < current.start_year ? { start_year: value } : {}),
    }));
  };

  const changeCspLevel = (next: "groupe_6" | "categorie_29") => {
    setCspLevel(next);
    const level = cspMetadata?.levels.find((item) => item.key === next);
    const preferred = level?.options.find((item) => item.code === (next === "groupe_6" ? "3" : "38"))
      ?? level?.options[0];
    if (preferred) setCspCode(preferred.code);
  };

  const resetScope = () => {
    if (source === "damir") setDamirFilters(defaultFilters(metadata));
    if (source === "pathologies" && pathologyMetadata) {
      setPathologyStartYear(pathologyMetadata.years[0]);
      setPathologyEndYear(pathologyMetadata.default_year);
      setPathologyRegion("99");
      setPathologyAge("tsage");
      setPathologySex("tous sexes");
    }
    if (source === "csp" && cspMetadata) {
      setCspStartYear(cspMetadata.years[0]);
      setCspEndYear(cspMetadata.default_year);
      setCspRegion("FR");
      setCspAge("all");
      setCspSex(0);
    }
    if (source === "mortality" && mortalityMetadata) {
      setMortalityStartYear(mortalityMetadata.years[0]);
      setMortalityEndYear(mortalityMetadata.default_year);
      setMortalityPopulation("ensemble");
    }
  };

  const exportCsv = () => {
    if (!model) return;
    downloadText(
      `reperes_${source}.csv`,
      csvFromRows(
        [{ key: "label", label: model.chartType === "line" ? "Millésime" : "Territoire" }, { key: "value", label: model.seriesLabel }],
        model.points,
      ),
    );
  };

  const openExtraction = () => {
    const params = new URLSearchParams({ source });
    if (source === "damir") {
      writeFilters(params, damirFilters);
      params.set("dimensions", "year");
      params.set("measures", damirRequestedMeasure);
    } else if (source === "pathologies") {
      params.set("top", pathologyTop);
      params.set("start_year", String(pathologyStartYear));
      params.set("end_year", String(pathologyEndYear));
      params.set("dimensions", "year");
      params.set("measures", pathologyMeasure);
    } else if (source === "csp") {
      params.set("level", cspLevel);
      params.set("csp", cspCode);
      params.set("year", String(cspEndYear));
      params.set("dimensions", "region");
      params.set("measures", cspMeasure);
    } else {
      params.set("cause", mortalityCause);
      params.set("population", mortalityPopulation);
      params.set("start_year", String(mortalityStartYear));
      params.set("end_year", String(mortalityEndYear));
      params.set("dimensions", "year,cause,population");
      params.set("measures", mortalityMeasure);
    }
    onOpenExtraction(params);
  };

  const displayValue = hoveredPoint?.value ?? model?.value ?? null;
  const displayKind = hoveredPoint ? model?.seriesKind ?? "raw" : model?.valueKind ?? "raw";
  const displayUnit = hoveredPoint ? model?.seriesUnitLabel ?? "" : model?.unitLabel ?? "";
  const displayTitle = hoveredPoint ? `${model?.seriesLabel} · ${hoveredPoint.label}` : model?.title;

  return <div className="content-wrap benchmarks-page">
    <section className="benchmarks-hero">
      <div>
        <div className="eyebrow"><span>Chiffres défendables</span> Toutes les sources</div>
        <h1>Repères</h1>
        <p>Un chiffre clair, son périmètre et sa méthode. Les calculs proposés s’adaptent à la nature de chaque indicateur.</p>
      </div>
      <div className="benchmarks-hero-actions">
        <button type="button" onClick={() => setMethodOpen((open) => !open)} aria-pressed={methodOpen}>Méthode ⓘ</button>
        <button type="button" onClick={exportCsv} disabled={!model}>Exporter CSV</button>
      </div>
    </section>

    <nav className="benchmarks-source-switch" aria-label="Source du repère">
      {SOURCE_OPTIONS.map((item) => <button type="button" key={item.key} className={source === item.key ? "active" : ""} onClick={() => selectSource(item.key)}>
        <strong>{item.label}</strong><small>{item.detail}</small>
      </button>)}
    </nav>

    <section className="benchmarks-controls" aria-label="Définition du repère">
      <div className="benchmarks-primary-controls" data-source={source}>
        {source === "damir" ? <label className="benchmarks-indicator-control"><span>Indicateur</span><select value={damirMeasure} onChange={(event) => { setDamirMeasure(event.target.value); setCalculation("value"); }}>{metadata.measures.filter((item) => !item.key.startsWith("average_")).map((item) => <option value={item.key} key={item.key}>{item.label}</option>)}</select></label> : null}
        {source === "pathologies" ? <div className="benchmarks-indicator-control"><span>Pathologie observée</span><SearchableCauseSelect options={pathologyCatalog} value={pathologyTop} onChange={setPathologyTop} groupedDetails={false} searchPlaceholder="Rechercher une pathologie…" searchLabel="Rechercher une pathologie" selectLabel="Pathologie observée" itemLabel="pathologies disponibles" /></div> : null}
        {source === "csp" ? <>
          <label className="benchmarks-level-control"><span>Niveau</span><select value={cspLevel} onChange={(event) => changeCspLevel(event.target.value as "groupe_6" | "categorie_29")}><option value="groupe_6">6 grands groupes</option><option value="categorie_29">29 catégories</option></select></label>
          <label className="benchmarks-indicator-control"><span>CSP observée</span><select value={cspCode} onChange={(event) => setCspCode(event.target.value)}>{cspMetadata?.levels.find((item) => item.key === cspLevel)?.options.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
        </> : null}
        {source === "mortality" ? <div className="benchmarks-indicator-control"><span>Cause observée</span><SearchableCauseSelect options={mortalityMetadata?.causes ?? []} value={mortalityCause} onChange={setMortalityCause} /></div> : null}

        {source === "pathologies" ? <label className="benchmarks-measure-control"><span>Mesure</span><select value={pathologyMeasure} onChange={(event) => { setPathologyMeasure(event.target.value as "patients" | "prevalence"); setCalculation("value"); }}><option value="prevalence">Prévalence</option><option value="patients">Patients</option></select></label> : null}
        {source === "csp" ? <label className="benchmarks-measure-control"><span>Mesure</span><select value={cspMeasure} onChange={(event) => { setCspMeasure(event.target.value as "effectif" | "share"); setCalculation("value"); }}><option value="share">Part de la CSP</option><option value="effectif">Effectif pondéré</option></select></label> : null}
        {source === "mortality" ? <label className="benchmarks-measure-control"><span>Mesure</span><select value={mortalityMeasure} onChange={(event) => { setMortalityMeasure(event.target.value as "deaths" | "share"); setCalculation("value"); }}><option value="deaths">Nombre de décès</option><option value="share">Part des décès</option></select></label> : null}

        {source === "damir" ? <>
          <label className="benchmarks-period-control"><span>De</span><select value={damirFilters.start_year} onChange={(event) => updateDamirPeriod("start_year", Number(event.target.value))}>{metadata.years.filter((year) => year <= damirFilters.end_year).map((year) => <option value={year} key={year}>{yearStatusLabel(metadata, year)}</option>)}</select></label>
          <label className="benchmarks-period-control"><span>À</span><select value={damirFilters.end_year} onChange={(event) => updateDamirPeriod("end_year", Number(event.target.value))}>{metadata.years.filter((year) => year >= damirFilters.start_year).map((year) => <option value={year} key={year}>{yearStatusLabel(metadata, year)}</option>)}</select></label>
        </> : null}
        {source === "pathologies" ? <>
          <label className="benchmarks-period-control"><span>De</span><select value={pathologyStartYear} onChange={(event) => setPathologyStartYear(Number(event.target.value))}>{pathologyMetadata?.years.filter((year) => year <= pathologyEndYear).map((year) => <option value={year} key={year}>{year}</option>)}</select></label>
          <label className="benchmarks-period-control"><span>À</span><select value={pathologyEndYear} onChange={(event) => setPathologyEndYear(Number(event.target.value))}>{pathologyMetadata?.years.filter((year) => year >= pathologyStartYear).map((year) => <option value={year} key={year}>{year}</option>)}</select></label>
        </> : null}
        {source === "csp" ? <>
          <label className="benchmarks-period-control"><span>De</span><select value={cspStartYear} onChange={(event) => setCspStartYear(Number(event.target.value))}>{cspMetadata?.years.filter((year) => year <= cspEndYear).map((year) => <option value={year} key={year}>{year}</option>)}</select></label>
          <label className="benchmarks-period-control"><span>À</span><select value={cspEndYear} onChange={(event) => setCspEndYear(Number(event.target.value))}>{cspMetadata?.years.filter((year) => year >= cspStartYear).map((year) => <option value={year} key={year}>{year}</option>)}</select></label>
        </> : null}
        {source === "mortality" ? <>
          <label className="benchmarks-period-control"><span>De</span><select value={mortalityStartYear} onChange={(event) => setMortalityStartYear(Number(event.target.value))}>{mortalityMetadata?.years.filter((year) => year <= mortalityEndYear).map((year) => <option value={year} key={year}>{year}</option>)}</select></label>
          <label className="benchmarks-period-control"><span>À</span><select value={mortalityEndYear} onChange={(event) => setMortalityEndYear(Number(event.target.value))}>{mortalityMetadata?.years.filter((year) => year >= mortalityStartYear).map((year) => <option value={year} key={year}>{year}</option>)}</select></label>
        </> : null}
      </div>

      <details className="benchmarks-scope" open={scopeOpen} onToggle={(event) => setScopeOpen(event.currentTarget.open)}>
        <summary><span>Périmètre</span><strong>
          {source === "damir" ? `${damirFilters.grand_post ?? "Tous postes"} · ${damirFilters.regions.length ? metadata.regions.find((item) => item.code === damirFilters.regions[0])?.label : "France entière"}`
            : source === "pathologies" ? `${pathologyMetadata?.regions.find((item) => item.code === pathologyRegion)?.label ?? "France entière"} · ${pathologyMetadata?.ages.find((item) => item.code === pathologyAge)?.label ?? "Tous âges"} · ${pathologyMetadata?.sexes.find((item) => item.code === pathologySex)?.label ?? "Tous sexes"}`
              : source === "csp" ? `${cspMetadata?.regions.find((item) => item.code === cspRegion)?.label ?? "France entière"} · ${cspMetadata?.ages.find((item) => item.code === cspAge)?.label ?? "Tous âges"} · ${cspMetadata?.sexes.find((item) => item.code === cspSex)?.label ?? "Tous sexes"}`
                : mortalityMetadata?.populations.find((item) => item.code === mortalityPopulation)?.label ?? "Ensemble"
          }</strong><em>Modifier</em></summary>
        <div className="benchmarks-scope-grid">
          {source === "damir" ? <>
            <label><span>Grand poste</span><select value={damirFilters.grand_post ?? ""} onChange={(event) => setDamirFilters((current) => ({ ...current, grand_post: event.target.value || null, post: null, sub_post: null, service_codes: [] }))}><option value="">Tous les postes</option>{metadata.grand_posts.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>Territoire</span><select value={damirFilters.regions[0] ?? ""} onChange={(event) => setDamirFilters((current) => ({ ...current, regions: event.target.value ? [Number(event.target.value)] : [] }))}><option value="">France entière</option>{metadata.regions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
          </> : null}
          {source === "pathologies" ? <>
            <label><span>Territoire</span><select value={pathologyRegion} onChange={(event) => setPathologyRegion(event.target.value)}>{pathologyMetadata?.regions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
            <label><span>Âge</span><select value={pathologyAge} onChange={(event) => setPathologyAge(event.target.value)}>{pathologyMetadata?.ages.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
            <label><span>Sexe</span><select value={pathologySex} onChange={(event) => setPathologySex(event.target.value)}>{pathologyMetadata?.sexes.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
          </> : null}
          {source === "csp" ? <>
            <label><span>Territoire</span><select value={cspRegion} onChange={(event) => setCspRegion(event.target.value)}>{cspMetadata?.regions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
            <label><span>Âge</span><select value={cspAge} onChange={(event) => setCspAge(event.target.value)}>{cspMetadata?.ages.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
            <label><span>Sexe</span><select value={cspSex} onChange={(event) => setCspSex(Number(event.target.value))}>{cspMetadata?.sexes.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
          </> : null}
          {source === "mortality" ? <label><span>Population publiée</span><select value={mortalityPopulation} onChange={(event) => setMortalityPopulation(event.target.value)}>{mortalityMetadata?.populations.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label> : null}
          <button type="button" onClick={resetScope}>Réinitialiser le périmètre</button>
        </div>
      </details>
    </section>

    <div className={`benchmarks-loading-track ${loading ? "active" : ""}`} role="status" aria-label={loading ? "Repère en cours d’actualisation" : "Repère à jour"}><span /></div>
    {error ? <div className="analysis-error"><strong>Le repère n’a pas pu être calculé</strong><span>{error}</span></div> : null}

    <section className={`benchmarks-result-shell ${methodOpen ? "method-visible" : ""}`}>
      <article className={`benchmarks-result ${loading ? "updating" : ""}`}>
        {model ? <>
          <header><div><span>{model.sourceLabel}</span><small>{model.sourceNote}</small></div><em>{model.period}</em></header>
          <div className="benchmarks-number-stage">
            <span>{model.eyebrow}</span>
            <h2>{displayTitle}</h2>
            <strong key={`${displayTitle}-${displayValue}`} className="benchmarks-hero-value">{formatHero(displayValue, displayKind, displayUnit)}</strong>
            <div className="benchmarks-comparison">
              {!hoveredPoint && model.comparison ? <span className={model.comparisonTone}>{model.comparisonTone === "up" ? "↑" : model.comparisonTone === "down" ? "↓" : "→"} {model.comparison}</span> : null}
              <p>{hoveredPoint ? "Valeur du point survolé" : model.sentence}</p>
            </div>
            <div className="benchmarks-badges">{model.badges.map((badge) => <span key={badge}>● {badge}</span>)}</div>
          </div>

          <div className="benchmarks-calculations" aria-label="Lecture statistique">
            {calculationOptions.map((item) => <button type="button" key={item.key} className={calculation === item.key ? "active" : ""} onClick={() => { setCalculation(item.key); setHoveredPoint(null); }} title={item.label}>{item.shortLabel}</button>)}
          </div>

          {model.warning ? <div className="benchmarks-warning"><span>ⓘ</span><p>{model.warning}</p></div> : null}

          <details className="benchmarks-context" open={contextOpen && !methodOpen} onToggle={(event) => {
            setContextOpen(event.currentTarget.open);
            if (event.currentTarget.open) setValuesOpen(false);
          }}>
            <summary>Voir le contexte <span>Évolution ou classement</span></summary>
            {plot ? <div className="benchmarks-chart"><EChart option={plot} height={plotHeight} ariaLabel={`Contexte · ${model.seriesLabel}`} onInstance={setPlotInstance} /></div> : null}
          </details>

          <details className="benchmarks-values" open={valuesOpen} onToggle={(event) => setValuesOpen(event.currentTarget.open)}>
            <summary>Voir les valeurs <span>{model.points.length} observation{model.points.length > 1 ? "s" : ""}</span></summary>
            <div className="advanced-table-wrap" role="region" aria-label={`Valeurs du repère · ${model.title}`} tabIndex={0}><table className="advanced-table"><caption className="sr-only">Valeurs détaillées du repère {model.title}</caption><thead><tr><th scope="col">{model.chartType === "line" ? "Millésime" : "Territoire"}</th><th scope="col">{model.seriesLabel}</th></tr></thead><tbody>{model.points.map((point) => <tr key={point.label}><td>{point.label}</td><td className="numeric">{formatExact(point.value, model.seriesKind, model.seriesUnitLabel)}</td></tr>)}</tbody></table></div>
          </details>
        </> : <div className="benchmarks-empty"><div className="skeleton" /></div>}
      </article>

      {methodOpen && model ? <aside className="benchmarks-method">
        <header><div><span>Méthode du repère</span><h3>{model.seriesLabel}</h3></div><button type="button" onClick={() => setMethodOpen(false)} aria-label="Fermer la méthode">×</button></header>
        <section><span>Définition</span><p>{model.method.definition}</p></section>
        <section><span>Formule</span><strong>{model.method.formula}</strong></section>
        <section><span>Dénominateur</span><p>{model.method.denominator}</p></section>
        <section className="limitation"><span>Point de vigilance</span><p>{model.method.limitation}</p></section>
        <div className="benchmarks-method-rule">Les calculs portent sur des données agrégées. Aucune statistique de distribution individuelle n’est présentée.</div>
        <footer><button type="button" onClick={openExtraction}>Extraire ces données</button><button type="button" onClick={onOpenMethodology}>Méthode complète</button></footer>
      </aside> : null}
    </section>
  </div>;
}
