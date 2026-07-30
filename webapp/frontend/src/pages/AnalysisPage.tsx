import { useEffect, useMemo, useRef, useState } from "react";
import type { Data, Layout } from "plotly.js";
import Plotly from "plotly.js-basic-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import { downloadText, runWorkbench } from "../api";
import { AdvancedFilterPanel, type FilterField } from "../components/AdvancedFilterPanel";
import { MultiSelect } from "../components/MultiSelect";
import type {
  AdvancedFilters,
  AnalysisQuestion,
  Comparator,
  Metadata,
  MetricKind,
  WorkbenchRequest,
  WorkbenchResult,
} from "../types";
import { copyCurrentUrl, csvFromRows, defaultFilters, filtersFromSearch, formatValue, scaleFor, writeFilters, yearStatusLabel } from "../utils";

type Props = {
  metadata: Metadata;
  routeVersion: number;
  onOpenExtraction: (params: URLSearchParams) => void;
  onOpenMethodology: () => void;
};

type PrimaryQuestion = "evolution" | "comparison" | "liquidation";
const QUESTIONS: Array<{ key: PrimaryQuestion; label: string; description: string; number: string }> = [
  { key: "evolution", label: "Suivre une évolution", description: "Voir comment un indicateur évolue", number: "01" },
  { key: "comparison", label: "Comparer", description: "Mettre des valeurs ou trajectoires face à face", number: "02" },
  { key: "liquidation", label: "Analyser la liquidation", description: "Mesurer la maturité des remboursements", number: "03" },
];

type CompareChoice = Comparator | "indicators";
const COMPARE_CHOICES: Array<{ key: CompareChoice; label: string; detail: string }> = [
  { key: "years", label: "Deux années", detail: "Une valeur à deux dates" },
  { key: "women_men", label: "Femmes / Hommes", detail: "Deux populations" },
  { key: "regions", label: "Des régions", detail: "Deux territoires ou plus" },
  { key: "indicators", label: "Deux indicateurs", detail: "Deux mesures, un périmètre commun" },
];

const COLORS = ["#d64047", "#3b3633", "#3f786b", "#a66f2f", "#75558a", "#6f743d"];
const Plot = createPlotlyComponent(Plotly);
type ChartView = "curve" | "bars" | "slope" | "ranking" | "triangle";
type CompareMode = "same_measure" | "two_indicators";

function friendlyMetricLabel(label: string): string {
  return label.replaceAll("Montant remboursé", "Remboursements versés");
}

function scaleForUnit(values: number[], kind: string, unitKey?: string): { divisor: number; label: string } {
  const scale = scaleFor(values, kind);
  if (unitKey === "eur_per_unit") return { ...scale, label: scale.label.replace("€", "€/unité") };
  return scale;
}

function withoutFields(filters: AdvancedFilters, fields: FilterField[]): AdvancedFilters {
  const next = { ...filters };
  fields.forEach((field) => {
    if (field === "grand_post" || field === "post" || field === "sub_post") next[field] = null;
    else if (field === "ald") next.ald = null;
    else if (field !== "start_year" && field !== "end_year") next[field] = [];
  });
  return next;
}

function formatCell(value: string | number | null, kind: string): string {
  if (typeof value !== "number" || kind === "dimension") return String(value ?? "—");
  return formatValue(value, kind);
}

function activeLabels(filters: AdvancedFilters, metadata: Metadata): string[] {
  const labels: string[] = [];
  if (filters.grand_post) labels.push(filters.grand_post);
  if (filters.post) labels.push(filters.post);
  if (filters.sub_post) labels.push(filters.sub_post);
  if (filters.service_codes.length) labels.push(`${filters.service_codes.length} prestation(s)`);
  if (filters.regions.length) labels.push(filters.regions.map((code) => metadata.regions.find((item) => item.code === code)?.label ?? code).join(" + "));
  if (filters.sexes.length) labels.push(`${filters.sexes.length} sexe(s)`);
  if (filters.ages.length) labels.push(`${filters.ages.length} tranche(s) d’âge`);
  if (filters.insurances.length) labels.push(`${filters.insurances.length} assurance(s)`);
  if (filters.envelopes.length) labels.push(`${filters.envelopes.length} enveloppe(s)`);
  if (filters.ald !== null) labels.push(filters.ald === 1 ? "ALD" : "Hors ALD");
  return labels;
}

function syncAnalysisUrl(request: WorkbenchRequest): void {
  const params = new URLSearchParams();
  params.set("page", "analysis");
  params.set("question", request.question === "juxtaposition" ? "comparison" : request.question);
  if (request.question === "comparison") params.set("compare_mode", "same_measure");
  if (request.question === "juxtaposition") params.set("compare_mode", "two_indicators");
  params.set("measure", request.measure);
  params.set("time_axis", request.time_axis);
  params.set("display", request.display);
  params.set("comparator", request.comparator);
  if (request.comparison_year_a != null) params.set("year_a", String(request.comparison_year_a));
  if (request.comparison_year_b != null) params.set("year_b", String(request.comparison_year_b));
  if (request.comparison_regions.length) params.set("comparison_regions", request.comparison_regions.join(","));
  writeFilters(params, request);
  if (request.reference_measure) params.set("b_measure", request.reference_measure);
  params.set("comparison_display", request.comparison_display);
  const chartView = new URLSearchParams(window.location.search).get("chart_view");
  if (chartView) params.set("chart_view", chartView);
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

export function AnalysisPage({ metadata, routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const initialFilters = useMemo(() => filtersFromSearch(metadata, initialParams), [metadata, initialParams]);
  const initialQuestionParam = initialParams.get("question");
  const initialQuestion = (initialQuestionParam === "juxtaposition" ? "comparison"
    : ["comparison", "liquidation"].includes(initialQuestionParam ?? "") ? initialQuestionParam : "evolution") as PrimaryQuestion;
  const initialCompareMode: CompareMode = initialQuestionParam === "juxtaposition"
    || initialParams.get("compare_mode") === "two_indicators" ? "two_indicators" : "same_measure";
  const initialComparator = (["years", "women_men", "regions"].includes(initialParams.get("comparator") ?? "")
    ? initialParams.get("comparator") : "years") as Comparator;
  const initialYearA = Number(initialParams.get("year_a")) || initialFilters.end_year;
  const initialYearB = Number(initialParams.get("year_b")) || Math.max(metadata.years[0], initialFilters.end_year - 1);
  const initialRegions = initialParams.get("comparison_regions")?.split(",").map(Number).filter(Number.isFinite) ?? [];
  const initialMeasure = initialParams.get("measure") || "reimbursed";

  const [filters, setFilters] = useState(() => initialQuestion === "liquidation" ? {
    ...initialFilters,
    end_year: Math.min(initialFilters.end_year, metadata.reliability.liquidation_observed_through ?? metadata.reliability.consolidated_through ?? metadata.default_end_year),
    sexes: [],
    ages: [],
    regions: [],
    insurances: [],
    envelopes: [],
    ald: null,
  } : initialFilters);
  const [question, setQuestion] = useState<PrimaryQuestion>(initialQuestion);
  const [measure, setMeasure] = useState(initialMeasure);
  const [timeAxis, setTimeAxis] = useState<"care" | "payment">(initialParams.get("time_axis") === "payment" ? "payment" : "care");
  const [display, setDisplay] = useState<"raw" | "change" | "index">((initialParams.get("display") as "raw" | "change" | "index") || "raw");
  const [compareMode, setCompareMode] = useState<CompareMode>(initialCompareMode);
  const [comparator, setComparator] = useState<Comparator>(initialComparator);
  const [yearA, setYearA] = useState(initialYearA);
  const [yearB, setYearB] = useState(initialYearB);
  const [comparisonRegions, setComparisonRegions] = useState<number[]>(initialRegions);
  const [referenceMeasure, setReferenceMeasure] = useState(
    initialParams.get("b_measure") || (initialMeasure === "expense" ? "reimbursed" : "expense"),
  );
  const [comparisonDisplay, setComparisonDisplay] = useState<"auto" | "raw" | "index">(
    initialParams.get("comparison_display") === "raw" ? "raw"
      : initialParams.get("comparison_display") === "index" ? "index" : "auto",
  );
  const [result, setResult] = useState<WorkbenchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [plotElement, setPlotElement] = useState<HTMLElement | null>(null);
  const initialChartView = initialParams.get("chart_view");
  const [chartView, setChartView] = useState<ChartView>(
    (["curve", "bars", "slope", "ranking", "triangle"].includes(initialChartView ?? "") ? initialChartView : "curve") as ChartView,
  );
  const [showTable, setShowTable] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const resultCardRef = useRef<HTMLElement | null>(null);
  const previousPreciseService = useRef(initialFilters.service_codes.length === 1);

  const hiddenFields = useMemo<FilterField[]>(() => {
    if (question !== "comparison" || compareMode !== "same_measure") return [];
    if (comparator === "years") return ["start_year", "end_year"];
    if (comparator === "women_men") return ["sexes"];
    if (comparator === "regions") return ["regions"];
    return [];
  }, [question, compareMode, comparator]);

  const disabledFields = useMemo<FilterField[]>(() => question === "liquidation" || timeAxis === "payment"
    ? ["sexes", "ages", "regions", "insurances", "envelopes", "ald"]
    : [], [question, timeAxis]);
  const effectiveFilters = useMemo(() => withoutFields(filters, [...hiddenFields, ...disabledFields]), [filters, hiddenFields, disabledFields]);
  const indicatorComparison = question === "comparison" && compareMode === "two_indicators";
  const selectedMeasureOption = metadata.measures.find((item) => item.key === measure);
  const selectedReferenceMeasureOption = metadata.measures.find((item) => item.key === referenceMeasure);
  const indicatorsSameUnit = selectedMeasureOption?.unit_key === selectedReferenceMeasureOption?.unit_key;

  useEffect(() => {
    if (indicatorComparison && indicatorsSameUnit && comparisonDisplay === "index") setComparisonDisplay("auto");
  }, [indicatorComparison, indicatorsSameUnit, comparisonDisplay]);

  const backendQuestion: AnalysisQuestion = indicatorComparison ? "juxtaposition" : question;
  const requestDraft = useMemo<WorkbenchRequest>(() => ({
    ...effectiveFilters,
    question: backendQuestion,
    measure,
    time_axis: timeAxis,
    display,
    comparator: indicatorComparison ? "custom" : comparator,
    reference: indicatorComparison ? effectiveFilters : null,
    comparison_year_a: !indicatorComparison && question === "comparison" && comparator === "years" ? yearA : null,
    comparison_year_b: !indicatorComparison && question === "comparison" && comparator === "years" ? yearB : null,
    comparison_regions: !indicatorComparison && question === "comparison" && comparator === "regions" ? comparisonRegions : [],
    reference_measure: indicatorComparison ? referenceMeasure : null,
    reference_time_axis: indicatorComparison ? timeAxis : null,
    comparison_display: indicatorComparison ? comparisonDisplay : "auto",
    decomposition_basis: "change",
    dimension: "auto",
    limit: 20,
  }), [effectiveFilters, backendQuestion, indicatorComparison, question, measure, timeAxis, display, comparator, yearA, yearB, comparisonRegions, referenceMeasure, comparisonDisplay]);

  const [appliedRequest, setAppliedRequest] = useState<WorkbenchRequest>(requestDraft);
  const dirty = JSON.stringify(requestDraft) !== JSON.stringify(appliedRequest);

  const unavailable = (item: Metadata["measures"][number], scope: AdvancedFilters, axis: "care" | "payment") =>
    (item.key === "copayment" && Boolean(scope.grand_post && item.invalid_grand_posts.includes(scope.grand_post)))
    || (item.requires_homogeneous_unit && scope.service_codes.length !== 1)
    || (axis === "payment" && item.key !== "reimbursed");

  const chooseComparator = (next: Comparator) => {
    setComparator(next);
    setConfigurationError(null);
    if ((next === "women_men" || next === "regions") && timeAxis === "payment") setTimeAxis("care");
  };

  const chooseCompareMode = (next: CompareMode) => {
    setCompareMode(next);
    if (next === "two_indicators" && referenceMeasure === measure) {
      const fallback = metadata.measures.find((item) => item.key !== measure && !unavailable(item, filters, timeAxis));
      if (fallback) setReferenceMeasure(fallback.key);
    }
    setConfigurationError(null);
    setShowTable(false);
    setChartView("curve");
  };

  const chooseCompareChoice = (next: CompareChoice) => {
    if (next === "indicators") chooseCompareMode("two_indicators");
    else {
      chooseCompareMode("same_measure");
      chooseComparator(next);
    }
  };

  const chooseQuestion = (next: PrimaryQuestion) => {
    setQuestion(next);
    setShowTable(false);
    setConfigurationError(null);
    setChartView(next === "liquidation" ? "curve" : "curve");
    if (next === "liquidation") {
      const eligibleYear = metadata.reliability.liquidation_observed_through ?? metadata.reliability.consolidated_through ?? metadata.default_end_year;
      setFilters((current) => ({
        ...current,
        start_year: Math.min(current.start_year, eligibleYear),
        end_year: Math.min(current.end_year, eligibleYear),
        sexes: [],
        ages: [],
        regions: [],
        insurances: [],
        envelopes: [],
        ald: null,
      }));
      setMeasure("reimbursed");
      setTimeAxis("care");
      setDisplay("raw");
    }
  };

  useEffect(() => {
    const precise = filters.service_codes.length === 1;
    if (precise && !previousPreciseService.current && measure === "reimbursed" && timeAxis === "care") {
      setMeasure("average_reimbursed");
    }
    previousPreciseService.current = precise;
  }, [filters.service_codes.length, measure, timeAxis]);

  const chooseTimeAxis = (axis: "care" | "payment") => {
    setTimeAxis(axis);
    if (axis === "payment") {
      setMeasure("reimbursed");
      if (indicatorComparison) setReferenceMeasure("reimbursed");
    }
  };

  const configurationIssue = useMemo(() => {
    if (question === "liquidation") return null;
    const selectedMetric = metadata.measures.find((item) => item.key === measure);
    if (selectedMetric && unavailable(selectedMetric, filters, timeAxis)) {
      return "La mesure A n’est pas compatible avec le périmètre choisi.";
    }
    const referenceMetricKey = indicatorComparison ? referenceMeasure : measure;
    const selectedReferenceMetric = metadata.measures.find((item) => item.key === referenceMetricKey);
    if (indicatorComparison && selectedReferenceMetric && unavailable(selectedReferenceMetric, filters, timeAxis)) {
      return "La mesure B n’est pas compatible avec le périmètre choisi.";
    }
    if (indicatorComparison && referenceMeasure === measure) {
      return "Choisissez deux indicateurs différents.";
    }
    if (!indicatorComparison && question === "comparison" && comparator === "years" && yearA === yearB) {
      return "Choisissez deux années différentes.";
    }
    if (!indicatorComparison && question === "comparison" && comparator === "regions" && comparisonRegions.length < 2) {
      return "Sélectionnez au moins deux régions.";
    }
    return null;
  }, [metadata.measures, measure, filters, timeAxis, referenceMeasure, question, comparator, yearA, yearB, comparisonRegions, indicatorComparison]);

  useEffect(() => {
    setConfigurationError(configurationIssue);
    if (configurationIssue || !dirty) return;
    const timer = window.setTimeout(() => {
      setAppliedRequest(requestDraft);
      syncAnalysisUrl(requestDraft);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [configurationIssue, dirty, requestDraft]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    runWorkbench(appliedRequest, controller.signal)
      .then((nextResult) => { if (active) setResult(nextResult); })
      .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [appliedRequest]);

  const chartOptions = useMemo<Array<{ key: ChartView; label: string }>>(() => {
    if (question === "liquidation") return [{ key: "curve", label: "Courbes" }, { key: "triangle", label: "Triangle" }];
    if (result?.chart_type === "bar" && result.bars.length === 2) {
      return [{ key: "bars", label: "Barres" }, { key: "slope", label: "Pente" }];
    }
    if (!indicatorComparison && question === "comparison" && comparator === "regions" && result?.series.length) {
      return [{ key: "curve", label: "Courbes" }, { key: "ranking", label: "Dernière année" }];
    }
    if (question === "evolution" && display === "change") return [{ key: "bars", label: "Variations" }];
    return [{ key: "curve", label: "Courbe" }];
  }, [question, comparator, display, result, indicatorComparison]);

  useEffect(() => {
    if (!chartOptions.some((option) => option.key === chartView)) setChartView(chartOptions[0].key);
  }, [chartOptions, chartView]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("chart_view", chartView);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [chartView]);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === resultCardRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const plot = useMemo(() => {
    const data: Data[] = [];
    const seriesKinds = result?.series.map((series) => series.unit ?? result.unit) ?? [];
    const seriesUnitKeys = result?.series.map((series) => series.unit_key ?? series.unit ?? result.unit) ?? [];
    const mixedUnits = new Set(seriesUnitKeys).size > 1;
    const primaryKind = seriesKinds[0] ?? result?.unit ?? "money";
    const primaryValues = result?.series.filter((_, index) => !mixedUnits || index === 0).flatMap((series) => series.points.map((point) => point.y)) ?? [];
    const secondaryKind = seriesKinds[1] ?? primaryKind;
    const secondaryValues = result?.series.slice(1).flatMap((series) => series.points.map((point) => point.y)) ?? [];
    const primaryScale = scaleForUnit(
      primaryValues.length ? primaryValues : (result?.bars.map((item) => item.value) ?? []),
      primaryKind,
      seriesUnitKeys[0] ?? result?.unit_key,
    );
    const secondaryScale = mixedUnits
      ? scaleForUnit(secondaryValues, secondaryKind, seriesUnitKeys[1])
      : primaryScale;
    const height = fullscreen ? Math.max(560, window.innerHeight - 245) : 470;
    let xaxis: Partial<Layout["xaxis"]> = { gridcolor: "#edf0f4" };
    let yaxis: Partial<Layout["yaxis"]> = {
      gridcolor: "#edf0f4",
      zerolinecolor: "#9aa4b2",
      title: { text: primaryScale.label },
      automargin: true,
    };
    let showlegend = (result?.series.length ?? 0) > 1;

    if (result?.question === "liquidation" && chartView === "triangle") {
      const delays = result.series[0]?.points.map((point) => point.x) ?? [];
      data.push({
        type: "heatmap",
        x: delays,
        y: result.series.map((series) => series.name),
        z: result.series.map((series) => series.points.map((point) => point.y)),
        colorscale: [[0, "#eef1f5"], [.45, "#f4bec1"], [1, "#b72f39"]],
        zmin: 0,
        zmax: 100,
        colorbar: { title: { text: "% cumulé" }, thickness: 12, outlinewidth: 0 },
        hovertemplate: "<b>Soins %{y}</b><br>M+%{x}<br>%{z:.2f} % liquidé<extra></extra>",
      });
      xaxis = { title: { text: "Mois après les soins" }, dtick: 1, gridcolor: "#fff" };
      yaxis = { title: { text: "Année de soins" }, type: "category", gridcolor: "#fff" };
      showlegend = false;
    } else if (result && chartView === "ranking" && result.series.length) {
      const latest = result.series.map((series) => ({
        label: series.name,
        point: series.points.at(-1),
      })).filter((item): item is { label: string; point: { x: string | number; y: number } } => Boolean(item.point))
        .sort((left, right) => left.point.y - right.point.y);
      data.push({
        type: "bar",
        orientation: "h",
        y: latest.map((item) => item.label),
        x: latest.map((item) => item.point.y / primaryScale.divisor),
        customdata: latest.map((item) => item.point.x),
        marker: { color: latest.map((_, index) => COLORS[index % COLORS.length]) },
        hovertemplate: `<b>%{y}</b><br>%{x:,.2f} ${primaryScale.label}<br>Année %{customdata}<extra></extra>`,
      });
      xaxis = { gridcolor: "#edf0f4", title: { text: primaryScale.label } };
      yaxis = { gridcolor: "rgba(0,0,0,0)", automargin: true };
      showlegend = false;
    } else if (result && chartView === "slope" && result.bars.length === 2) {
      data.push({
        type: "scatter",
        mode: "text+lines+markers",
        x: result.bars.map((item) => item.label),
        y: result.bars.map((item) => item.value / primaryScale.divisor),
        text: result.bars.map((item) => formatValue(item.value, result.unit)),
        textposition: "top center",
        line: { color: "#8d98a8", width: 3 },
        marker: { color: [COLORS[0], COLORS[1]], size: 15, line: { color: "#fff", width: 2 } },
        hovertemplate: `<b>%{x}</b><br>%{y:,.2f} ${primaryScale.label}<extra></extra>`,
      });
      xaxis = { gridcolor: "rgba(0,0,0,0)", type: "category" };
      showlegend = false;
    } else if (result?.chart_type === "line") {
      result.series.forEach((series, index) => {
        const secondary = mixedUnits && index > 0;
        const scale = secondary ? secondaryScale : primaryScale;
        const seriesName = friendlyMetricLabel(series.name);
        if (chartView === "bars") {
          data.push({
            type: "bar",
            name: seriesName,
            x: series.points.map((point) => point.x),
            y: series.points.map((point) => point.y / scale.divisor),
            marker: { color: COLORS[index % COLORS.length] },
            hovertemplate: `<b>${seriesName}</b><br>%{x}<br>%{y:,.2f} ${scale.label}<extra></extra>`,
          });
        } else {
          data.push({
            type: "scatter",
            mode: "lines+markers",
            name: seriesName,
            x: series.points.map((point) => point.x),
            y: series.points.map((point) => point.y / scale.divisor),
            yaxis: secondary ? "y2" : "y",
            line: { color: COLORS[index % COLORS.length], width: index === result.series.length - 1 && result.question === "liquidation" ? 4 : 2.7 },
            marker: { color: COLORS[index % COLORS.length], size: 6.5 },
            hovertemplate: `<b>${seriesName}</b><br>%{x}<br>%{y:,.2f} ${scale.label}<extra></extra>`,
          });
        }
      });
      xaxis = result.question === "liquidation"
        ? { gridcolor: "#edf0f4", dtick: 1, title: { text: "Mois après les soins" } }
        : { gridcolor: "#edf0f4", tickmode: "linear", tick0: metadata.years[0], dtick: 1, tickformat: "d" };
      if (result.question === "liquidation") yaxis = { gridcolor: "#edf0f4", range: [0, 102], ticksuffix: " %", title: { text: "Part cumulée à 24 mois" } };
    } else if (result) {
      data.push({
        type: "bar",
        x: result.bars.map((item) => item.label),
        y: result.bars.map((item) => item.value / primaryScale.divisor),
        marker: { color: result.bars.map((_, index) => COLORS[index % COLORS.length]) },
        hovertemplate: `<b>%{x}</b><br>%{y:,.2f} ${primaryScale.label}<extra></extra>`,
      });
      showlegend = false;
    }
    const layout: Partial<Layout> = {
      height,
      margin: { l: 78, r: mixedUnits ? 82 : 36, t: 30, b: 66 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: "Inter, Arial, sans-serif", color: "#514b47", size: 12 },
      showlegend,
      legend: { orientation: "h", y: -0.2, x: 0.5, xanchor: "center" },
      xaxis,
      yaxis,
      bargap: 0.36,
      ...(mixedUnits && chartView !== "triangle" ? { yaxis2: { overlaying: "y", side: "right", title: { text: secondaryScale.label }, showgrid: false, automargin: true } } : {}),
    };
    return { data, layout };
  }, [result, metadata.years, chartView, fullscreen]);

  const copyLink = async () => {
    await copyCurrentUrl();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const exportTable = () => {
    if (result) downloadText("damir_analyse.csv", csvFromRows(result.table.columns, result.table.rows));
  };

  const exportPng = async () => {
    if (plotElement) await Plotly.downloadImage(plotElement, { format: "png", filename: "damir_analyse", width: 1800, height: 980 });
  };

  const toggleFullscreen = async () => {
    if (!resultCardRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await resultCardRef.current.requestFullscreen();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea") || target?.isContentEditable || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLocaleLowerCase("fr") === "f") {
        event.preventDefault();
        void toggleFullscreen();
      }
      if (event.key.toLocaleLowerCase("fr") === "e" && result) {
        event.preventDefault();
        exportTable();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [result]);

  const openExtraction = () => {
    const params = new URLSearchParams();
    params.set("page", "extraction");
    writeFilters(params, filters);
    onOpenExtraction(params);
  };

  const resetTargetFilters = useMemo(() => {
    const next = defaultFilters(metadata);
    if (question === "liquidation") {
      next.end_year = Math.min(next.end_year, metadata.reliability.liquidation_observed_through ?? next.end_year);
      next.start_year = Math.min(next.start_year, next.end_year);
    }
    return next;
  }, [metadata, question]);
  const filtersCanBeReset = JSON.stringify(filters) !== JSON.stringify(resetTargetFilters);

  const resetAnalysisFilters = () => setFilters(resetTargetFilters);

  const measureLabel = (item: Metadata["measures"][number], scope: AdvancedFilters, axis: "care" | "payment") => {
    const label = item.key === "reimbursed" ? `${friendlyMetricLabel(item.label)} · total` : friendlyMetricLabel(item.label);
    if (!unavailable(item, scope, axis)) return label;
    if (item.requires_homogeneous_unit && scope.service_codes.length !== 1) return `${label} · sélectionnez une prestation`;
    return `${label} · non compatible`;
  };

  const measureFamilies = useMemo(() => {
    const groups = new Map<string, Metadata["measures"]>();
    metadata.measures.forEach((item) => groups.set(item.family, [...(groups.get(item.family) ?? []), item]));
    return [...groups.entries()];
  }, [metadata.measures]);

  const commonSettings = (scope: AdvancedFilters, axis: "care" | "payment", selectedMeasure: string, side: "a" | "b") => <div className="comparison-settings">
    <label><span>Indicateur</span><select value={selectedMeasure} onChange={(event) => side === "a" ? setMeasure(event.target.value) : setReferenceMeasure(event.target.value)}>{measureFamilies.map(([family, items]) => <optgroup key={family} label={family}>{items.map((item) => <option key={item.key} value={item.key} disabled={unavailable(item, scope, axis)}>{measureLabel(item, scope, axis)}</option>)}</optgroup>)}</select>{scope.service_codes.length === 1 && selectedMeasure === "average_reimbursed" ? <small className="contextual-default-note">Moyenne proposée pour la prestation précise sélectionnée</small> : null}</label>
    <label><span>Référentiel temporel</span><select value={axis} onChange={(event) => chooseTimeAxis(event.target.value as "care" | "payment")}><option value="care">Date de soins</option>{metadata.has_delays ? <option value="payment" disabled={question === "comparison" && (comparator === "women_men" || comparator === "regions")}>Date de remboursement</option> : null}</select></label>
  </div>;

  const periodSettings = (
    scope: AdvancedFilters,
    onChange: (next: AdvancedFilters) => void,
    label = "Période",
  ) => <div className="analysis-period-setting">
    <span>{label}</span>
    <div>
      <label><small>De</small><select value={scope.start_year} onChange={(event) => onChange({ ...scope, start_year: Number(event.target.value) })}>{metadata.years.filter((year) => year <= scope.end_year).map((year) => <option key={year} value={year}>{yearStatusLabel(metadata, year)}</option>)}</select></label>
      <label><small>À</small><select value={scope.end_year} onChange={(event) => onChange({ ...scope, end_year: Number(event.target.value) })}>{metadata.years.filter((year) => year >= scope.start_year).map((year) => <option key={year} value={year}>{yearStatusLabel(metadata, year)}</option>)}</select></label>
    </div>
  </div>;

  const filterDrawer = (
    scope: AdvancedFilters,
    onChange: (next: AdvancedFilters) => void,
    drawerHiddenFields: FilterField[] = [],
    drawerDisabledFields: FilterField[] = [],
    title = "Filtres avancés",
  ) => {
    const visibleScope = withoutFields(scope, [...drawerHiddenFields, ...drawerDisabledFields]);
    const labels = activeLabels(visibleScope, metadata);
    return <details className="analysis-filter-drawer">
      <summary>
        <span className="filter-drawer-icon">⌁</span>
        <div><strong>{title}</strong><small>{labels.length ? labels.slice(0, 3).join(" · ") : "Aucun filtre supplémentaire"}</small></div>
        <em>{labels.length ? `${labels.length} actif${labels.length > 1 ? "s" : ""}` : "Optionnel"}</em>
        <span className="filter-drawer-chevron">⌄</span>
      </summary>
      <AdvancedFilterPanel metadata={metadata} value={scope} onChange={onChange} hiddenFields={drawerHiddenFields} disabledFields={drawerDisabledFields} />
    </details>;
  };

  const resultLabels = activeLabels(appliedRequest, metadata);
  const selectedMeasureLabel = friendlyMetricLabel(selectedMeasureOption?.label ?? measure);
  const selectedReferenceMeasureLabel = friendlyMetricLabel(selectedReferenceMeasureOption?.label ?? referenceMeasure);
  const comparisonSummary = useMemo(() => {
    if (question !== "comparison") return null;
    if (indicatorComparison) return {
      kind: "pair" as const,
      eyebrow: comparisonDisplay === "index" || (comparisonDisplay === "auto" && !indicatorsSameUnit)
        ? "Comparaison de trajectoires · base 100"
        : "Comparaison de trajectoires · valeurs réelles",
      a: { title: selectedMeasureLabel, detail: activeLabels(filters, metadata).join(" · ") || "Périmètre commun" },
      b: { title: selectedReferenceMeasureLabel, detail: activeLabels(filters, metadata).join(" · ") || "Périmètre commun" },
    };
    if (comparator === "regions") {
      const labels = comparisonRegions.map((code) => metadata.regions.find((item) => item.code === code)?.label ?? String(code));
      return {
        kind: "multiple" as const,
        eyebrow: `${selectedMeasureLabel} · comparaison de valeurs`,
        title: labels.length ? `${labels.length} régions comparées` : "Régions à sélectionner",
        detail: labels.join(" · ") || "Choisissez au moins deux territoires",
      };
    }
    if (comparator === "years") return {
      kind: "pair" as const,
      eyebrow: `${selectedMeasureLabel} · comparaison de valeurs`,
      a: { title: String(yearA), detail: "Année A" },
      b: { title: String(yearB), detail: "Année B" },
    };
    if (comparator === "women_men") return {
      kind: "pair" as const,
      eyebrow: `${selectedMeasureLabel} · comparaison de valeurs`,
      a: { title: "Femmes", detail: "Population A" },
      b: { title: "Hommes", detail: "Population B" },
    };
    return null;
  }, [question, indicatorComparison, comparisonDisplay, indicatorsSameUnit, selectedMeasureLabel, selectedReferenceMeasureLabel, filters, metadata, comparator, comparisonRegions, yearA, yearB]);

  return (
    <div className="content-wrap analysis-page workbench-page">
      <section className="hero workbench-hero"><div><div className="eyebrow"><span>Atelier DAMIR</span> Analyse guidée</div><h1>Analyser</h1><p>Choisissez ce que vous voulez comprendre.</p></div><button type="button" className="method-link" onClick={onOpenMethodology}>Définitions & méthode →</button></section>

      <nav className="question-switcher" aria-label="Question d’analyse">
        {QUESTIONS.map((item) => <button key={item.key} type="button" className={question === item.key ? "active" : ""} onClick={() => chooseQuestion(item.key)}><em>{item.number}</em><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}
      </nav>

      {question === "comparison" ? <section className="comparator-strip comparison-intentions" aria-label="Éléments à comparer">
        <div><strong>Je compare</strong><small>Choisissez simplement les éléments à mettre face à face</small></div>
        {COMPARE_CHOICES.map((item) => {
          const active = item.key === "indicators" ? indicatorComparison : !indicatorComparison && comparator === item.key;
          return <button type="button" key={item.key} className={active ? "active" : ""} onClick={() => chooseCompareChoice(item.key)}><strong>{item.label}</strong><small>{item.detail}</small></button>;
        })}
      </section> : null}

      {question === "evolution" ? <section className="parameter-stage">
        <article className="panel analysis-main-settings"><div><span className="section-kicker">Évolution</span><h2>Indicateur et période</h2></div><div className="analysis-essential-settings">{commonSettings(filters, timeAxis, measure, "a")}{periodSettings(filters, setFilters)}</div></article>
        {filterDrawer(filters, setFilters, ["start_year", "end_year"], disabledFields)}
      </section> : null}

      {question === "liquidation" ? <section className="parameter-stage liquidation-stage">
        <article className="panel analysis-main-settings liquidation-settings">
          <div><span className="section-kicker">Maturité DAMIR</span><h2>Remboursements observés à 24 mois</h2><p>Lecture observée, sans projection.</p></div>
          <div className="analysis-essential-settings liquidation-essential">{periodSettings(filters, setFilters)}<div className="liquidation-setting-badges"><span>Remboursements versés</span><span>Horizon · 24 mois</span><span>Jusqu’en {metadata.reliability.liquidation_observed_through ?? "—"}</span></div></div>
        </article>
        {filterDrawer(filters, setFilters, ["start_year", "end_year"], disabledFields, "Périmètre DAMIR")}
      </section> : null}

      {question === "comparison" && compareMode === "same_measure" ? <section className="comparison-stage">
        <article className="panel comparison-choice-card">
          <div className="comparison-choice-heading"><span className="section-kicker">1 · Comparaison demandée</span><h2>{comparator === "years" ? "Choisissez les deux années" : comparator === "women_men" ? "Femmes face aux hommes" : "Choisissez au moins deux régions"}</h2></div>
          {comparator === "years" ? <div className="ab-year-grid"><label className="scope-a"><span>A</span><strong>Année analysée</strong><select value={yearA} onChange={(event) => setYearA(Number(event.target.value))}>{metadata.years.map((year) => <option key={year}>{yearStatusLabel(metadata, year)}</option>)}</select></label><div className="versus">VS</div><label className="scope-b"><span>B</span><strong>Année comparée</strong><select value={yearB} onChange={(event) => setYearB(Number(event.target.value))}>{metadata.years.map((year) => <option key={year}>{yearStatusLabel(metadata, year)}</option>)}</select></label></div> : null}
          {comparator === "women_men" ? <div className="ab-year-grid population-versus"><div className="scope-a"><span>A</span><strong>Femmes</strong><small>Code sexe 2</small></div><div className="versus">VS</div><div className="scope-b"><span>B</span><strong>Hommes</strong><small>Code sexe 1</small></div></div> : null}
          {comparator === "regions" ? <div className="region-comparison-picker"><MultiSelect label="Régions à comparer" emptyLabel="Sélectionnez 2 régions ou plus" options={metadata.regions.map((item) => ({ value: item.code, label: item.label }))} value={comparisonRegions} onChange={setComparisonRegions} /></div> : null}
        </article>
        <article className="panel analysis-main-settings"><div><span className="section-kicker">2 · Indicateur commun</span><h2>Indicateur et période</h2></div><div className="analysis-essential-settings">{commonSettings(filters, timeAxis, measure, "a")}{comparator !== "years" ? periodSettings(filters, setFilters) : null}</div></article>
        <div className="common-filter-stage"><div className="stage-title"><span>3</span><div><strong>Périmètre commun</strong><small>Ces filtres s’appliquent aux deux choix</small></div></div>{filterDrawer(filters, setFilters, Array.from(new Set<FilterField>([...hiddenFields, "start_year", "end_year"])), disabledFields)}</div>
      </section> : null}

      {question === "comparison" && compareMode === "two_indicators" ? <section className="indicator-comparison-stage">
        <div className="custom-intro"><span className="section-kicker">Deux trajectoires</span><h2>Deux indicateurs, un seul périmètre</h2><p>La période et les filtres sont communs afin que la comparaison reste lisible.</p></div>
        <article className="panel indicator-pair-card">
          <div className="indicator-pair-grid">
            <label className="indicator-choice scope-a"><span>A</span><strong>Indicateur principal</strong><select value={measure} onChange={(event) => setMeasure(event.target.value)}>{measureFamilies.map(([family, items]) => <optgroup key={family} label={family}>{items.map((item) => <option key={item.key} value={item.key} disabled={item.key === referenceMeasure || unavailable(item, filters, timeAxis)}>{measureLabel(item, filters, timeAxis)}</option>)}</optgroup>)}</select><small>{selectedMeasureOption?.unit_label}</small></label>
            <div className="indicator-versus">VS</div>
            <label className="indicator-choice scope-b"><span>B</span><strong>Indicateur comparé</strong><select value={referenceMeasure} onChange={(event) => setReferenceMeasure(event.target.value)}>{measureFamilies.map(([family, items]) => <optgroup key={family} label={family}>{items.map((item) => <option key={item.key} value={item.key} disabled={item.key === measure || unavailable(item, filters, timeAxis)}>{measureLabel(item, filters, timeAxis)}</option>)}</optgroup>)}</select><small>{selectedReferenceMeasureOption?.unit_label}</small></label>
          </div>
          <div className="indicator-common-settings">
            <label><span>Référentiel temporel</span><select value={timeAxis} onChange={(event) => chooseTimeAxis(event.target.value as "care" | "payment")}><option value="care">Date de soins</option>{metadata.has_delays ? <option value="payment" disabled>Un seul indicateur disponible en date de remboursement</option> : null}</select></label>
            {periodSettings(filters, setFilters)}
            <div className="indicator-reading-mode"><span>Lecture</span>{indicatorsSameUnit
              ? <strong>Valeurs réelles · axe commun</strong>
              : <div><button type="button" className={comparisonDisplay !== "raw" ? "active" : ""} onClick={() => setComparisonDisplay("auto")}>Base 100</button><button type="button" className={comparisonDisplay === "raw" ? "active" : ""} onClick={() => setComparisonDisplay("raw")}>Valeurs réelles · 2 axes</button></div>}</div>
          </div>
        </article>
        <div className="common-filter-stage"><div className="stage-title"><span>2</span><div><strong>Périmètre commun</strong><small>Ces filtres s’appliquent aux deux indicateurs</small></div></div>{filterDrawer(filters, setFilters, ["start_year", "end_year"], disabledFields)}</div>
      </section> : null}

      {comparisonSummary ? <section className={`comparison-readable-summary ${comparisonSummary.kind}`}>
        <div className="comparison-summary-label"><span>Comparaison active</span><strong>{comparisonSummary.eyebrow}</strong></div>
        {comparisonSummary.kind === "pair" ? <>
          <article className="summary-a"><span>A</span><div><strong>{comparisonSummary.a.title}</strong><small>{comparisonSummary.a.detail}</small></div></article>
          <em>VS</em>
          <article className="summary-b"><span>B</span><div><strong>{comparisonSummary.b.title}</strong><small>{comparisonSummary.b.detail}</small></div></article>
        </> : <article className="summary-multiple"><span>↔</span><div><strong>{comparisonSummary.title}</strong><small>{comparisonSummary.detail}</small></div></article>}
      </section> : null}

      <div className={`analysis-auto-progress ${loading || (dirty && !configurationIssue) ? "active" : ""}`} role="status" aria-label={configurationIssue ? "Configuration à compléter" : loading || dirty ? "Résultat en cours d’actualisation" : "Résultat à jour"}><span /></div>
      {configurationError ? <div className="analysis-error"><strong>Choix incomplet</strong><span>{configurationError}</span></div> : null}

      <section className="workbench-result analysis-result-below">
        <article className="panel result-card" ref={resultCardRef}>
          <header className="result-header">
            <div><span>{result?.question === "comparison" ? "Comparaison de valeurs" : result?.question === "juxtaposition" ? "Comparaison de trajectoires" : result?.question === "liquidation" ? "Liquidation" : "Évolution"}</span><h2>{friendlyMetricLabel(result?.title ?? "Analyse DAMIR")}</h2><p>{friendlyMetricLabel(result?.subtitle ?? "Le résultat suit automatiquement les paramètres")}</p></div>
            <div className="chart-command-area">
              <div className="chart-reading-controls">
                {question === "evolution" ? <div className="chart-command"><span>Lecture</span><div>
                  <button type="button" className={display === "raw" ? "active" : ""} onClick={() => setDisplay("raw")}>Valeur</button>
                  <button type="button" className={display === "change" ? "active" : ""} onClick={() => setDisplay("change")}>Variation</button>
                  <button type="button" className={display === "index" ? "active" : ""} onClick={() => setDisplay("index")}>Base 100</button>
                </div></div> : null}
                {chartOptions.length > 1 ? <div className="chart-command"><span>Affichage</span><div>{chartOptions.map((option) => <button type="button" key={option.key} className={chartView === option.key ? "active" : ""} onClick={() => setChartView(option.key)}>{option.label}</button>)}</div></div> : null}
                {question === "liquidation" ? <span className="chart-method-chip">Observé · sans projection</span> : null}
                {question !== "liquidation" ? <span className={`chart-method-chip ${metadata.reliability.consolidated_through !== null && appliedRequest.end_year > metadata.reliability.consolidated_through ? "provisional" : "reliable"}`}>{metadata.reliability.consolidated_through !== null && appliedRequest.end_year > metadata.reliability.consolidated_through ? `${appliedRequest.end_year} · en consolidation` : metadata.reliability.status}</span> : null}
              </div>
              <div className="result-actions"><button type="button" onClick={copyLink}>{copied ? "Lien copié" : "Copier le lien"}</button><button type="button" onClick={exportTable} disabled={!result} title="Exporter les valeurs · raccourci E">CSV</button><button type="button" onClick={exportPng} disabled={!plotElement}>PNG</button><button type="button" className="fullscreen-button" onClick={toggleFullscreen} aria-label={fullscreen ? "Quitter le plein écran" : "Afficher le graphique en plein écran"} title={fullscreen ? "Réduire · raccourci F" : "Plein écran · raccourci F"}>{fullscreen ? "↙" : "⛶"}</button></div>
            </div>
          </header>
          <div className="active-filter-line analysis-filter-summary"><span>Périmètre actif</span><strong>{appliedRequest.start_year}–{appliedRequest.end_year}</strong>{resultLabels.map((label) => <em key={label}>{label}</em>)}{filtersCanBeReset ? <button type="button" onClick={resetAnalysisFilters}>Tout réinitialiser</button> : null}</div>
          {error ? <div className="analysis-error"><strong>Le calcul n’a pas abouti</strong><span>{error}</span></div> : null}
          {!result && loading ? <div className="analysis-loading"><div className="skeleton" /></div> : result ? <Plot data={plot.data} layout={plot.layout} config={{ responsive: true, displaylogo: false, displayModeBar: false }} style={{ width: "100%", height: `${plot.layout.height}px`, opacity: loading ? .55 : 1 }} useResizeHandler onError={(reason: Error) => setError(`Graphique : ${reason.message}`)} onInitialized={(_, graphDiv) => setPlotElement(graphDiv)} onUpdate={(_, graphDiv) => setPlotElement(graphDiv)} /> : null}
          {result?.liquidation ? <section className="liquidation-reading"><header><span>Lecture de maturité</span><strong>Repères observés</strong></header><div>{result.liquidation.kpis.map((kpi) => <article key={kpi.key}><span>{kpi.label}</span><strong>{kpi.value === null ? "—" : kpi.kind === "delay" ? `M+${Math.round(kpi.value)}` : formatValue(kpi.value, "percent")}</strong><small>{kpi.detail}</small></article>)}</div></section> : null}
          <footer className="analysis-result-footer"><span>Source · Open DAMIR, Assurance Maladie · Traitement Forsides</span><div>{result?.question === "evolution" ? <button type="button" onClick={openExtraction}>Extraire</button> : null}<button type="button" onClick={() => setShowTable((value) => !value)} disabled={!result}>{showTable ? "Masquer les valeurs" : "Voir les valeurs"}</button></div></footer>
          {showTable && result ? <div className="inline-result-table"><div className="advanced-table-wrap" role="region" aria-label={`Valeurs de l’analyse · ${result.title}`} tabIndex={0}><table className="advanced-table"><caption className="sr-only">Valeurs détaillées du graphique {result.title}</caption><thead><tr>{result.table.columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead><tbody>{result.table.rows.map((row, index) => <tr key={index}>{result.table.columns.map((column) => <td key={column.key} title={formatCell(row[column.key], column.kind)} className={column.kind === "dimension" ? "" : "numeric"}>{formatCell(row[column.key], column.kind)}</td>)}</tr>)}</tbody></table></div></div> : null}
        </article>

        {result?.warnings.length ? <div className="analysis-warnings">{result.warnings.map((warning) => <span key={warning}>ⓘ {warning}</span>)}</div> : null}
      </section>
    </div>
  );
}
