import { useEffect, useMemo, useState } from "react";
import { downloadCspExtraction, downloadExtraction, downloadMortalityExtraction, downloadPathologyExtraction, downloadPopulationExtraction, getCspExtractionPreview, getCspMetadata, getExtractionPreview, getMortalityExtractionPreview, getMortalityMetadata, getPathologyExtractionPreview, getPathologyMetadata, getPopulationExtractionPreview, getPopulationMetadata } from "../api";
import { AdvancedFilterPanel } from "../components/AdvancedFilterPanel";
import { InfoHint } from "../components/InfoHint";
import { PageHero } from "../components/PageHero";
import { SearchableCauseSelect } from "../components/SearchableCauseSelect";
import type { CspExtractionRequest, CspMetadata, ExtractionPreview, ExtractionRequest, Metadata, MortalityExtractionRequest, MortalityMetadata, PathologyExtractionRequest, PathologyMetadata, PopulationExtractionRequest, PopulationMetadata } from "../types";
import { filtersFromSearch, writeFilters } from "../utils";

type ExtractionSource = "damir" | "pathologies" | "csp" | "mortality" | "population";
type Props = {
  metadata: Metadata;
  routeVersion: number;
  onSourceChange?: (source: ExtractionSource) => void;
  onOpenMethodology?: () => void;
};

/** Les cinq sources, en onglets — la même charpente que les cinq bases.
 *
 *  Elles étaient cinq boutons posés dans le titre de la page, sous une barre de
 *  filtres latérale propre à chacune : le même produit se présentait de deux
 *  façons selon qu'on explorait une base ou qu'on en extrayait une. */
const SOURCES: Array<{ key: ExtractionSource; label: string; hint: string }> = [
  { key: "damir", label: "Dépenses DAMIR", hint: "Remboursements par prestation" },
  { key: "pathologies", label: "Pathologies", hint: "Effectifs et prévalence" },
  { key: "csp", label: "CSP", hint: "Actifs par catégorie" },
  { key: "mortality", label: "Mortalité", hint: "Décès publiés par cause" },
  { key: "population", label: "Population", hint: "Habitants au 1er janvier" },
];

const PREVIEW_PAGE_SIZE = 40;

function formatCell(value: string | number | null, kind: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "number") return String(value);
  if (kind === "money") return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
  if (kind === "percent") return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)} %`;
  if (kind === "quantity") return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
  return String(value);
}

export function ExtractionPage({ metadata, routeVersion, onSourceChange, onOpenMethodology }: Props) {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const requestedSource = initialParams.get("source");
  const [source, setSource] = useState<ExtractionSource>(requestedSource === "pathologies" || requestedSource === "csp" || requestedSource === "mortality" || requestedSource === "population" ? requestedSource : "damir");
  const [filters, setFilters] = useState(() => filtersFromSearch(metadata, initialParams));
  const [dimensions, setDimensions] = useState(() => initialParams.get("dimensions")?.split(",").filter(Boolean) ?? ["year", "sex", "region"]);
  const [measures, setMeasures] = useState(() => initialParams.get("measures")?.split(",").filter(Boolean) ?? ["reimbursed"]);
  const [preview, setPreview] = useState<ExtractionPreview | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pathologyMetadata, setPathologyMetadata] = useState<PathologyMetadata | null>(null);
  const [pathologyFamily, setPathologyFamily] = useState("");
  const [pathologyGroup, setPathologyGroup] = useState("__family__");
  const [pathologyTop, setPathologyTop] = useState(initialParams.get("top") ?? "");
  const [pathologyStartYear, setPathologyStartYear] = useState(Number(initialParams.get("start_year")) || 2015);
  const [pathologyEndYear, setPathologyEndYear] = useState(Number(initialParams.get("end_year")) || 2024);
  const [pathologyDimensions, setPathologyDimensions] = useState<string[]>(["year", "sex", "region"]);
  const [pathologyMeasures, setPathologyMeasures] = useState<string[]>(["patients", "prevalence"]);
  const [cspMetadata, setCspMetadata] = useState<CspMetadata | null>(null);
  const [cspLevel, setCspLevel] = useState<"groupe_6" | "categorie_29">(initialParams.get("level") === "categorie_29" ? "categorie_29" : "groupe_6");
  const [cspCode, setCspCode] = useState(initialParams.get("csp") ?? "3");
  const [cspDimensions, setCspDimensions] = useState<string[]>(["region", "age", "sex"]);
  const [cspMeasures, setCspMeasures] = useState<string[]>(["effectif", "share"]);
  const [populationMetadata, setPopulationMetadata] = useState<PopulationMetadata | null>(null);
  const [populationRegion, setPopulationRegion] = useState(initialParams.get("region") ?? "__all__");
  const [populationAge, setPopulationAge] = useState(initialParams.get("age") ?? "__all__");
  const [populationSex, setPopulationSex] = useState(initialParams.get("sex") ?? "__all__");
  const [populationStartYear, setPopulationStartYear] = useState(Number(initialParams.get("start_year")) || 2015);
  const [populationEndYear, setPopulationEndYear] = useState(Number(initialParams.get("end_year")) || 2026);
  const [populationDimensions, setPopulationDimensions] = useState<string[]>(requestedSource === "population" ? initialParams.get("dimensions")?.split(",").filter(Boolean) ?? ["year", "region"] : ["year", "region"]);
  const [populationMeasures, setPopulationMeasures] = useState<string[]>(requestedSource === "population" ? initialParams.get("measures")?.split(",").filter(Boolean) ?? ["population"] : ["population"]);
  const [mortalityMetadata, setMortalityMetadata] = useState<MortalityMetadata | null>(null);
  const [mortalityCause, setMortalityCause] = useState(initialParams.get("cause") ?? "__all__");
  const [mortalityPopulation, setMortalityPopulation] = useState(initialParams.get("population") ?? "__all__");
  const [mortalityStartYear, setMortalityStartYear] = useState(Number(initialParams.get("start_year")) || 2015);
  const [mortalityEndYear, setMortalityEndYear] = useState(Number(initialParams.get("end_year")) || 2024);
  const [mortalityDimensions, setMortalityDimensions] = useState<string[]>(requestedSource === "mortality" ? initialParams.get("dimensions")?.split(",").filter(Boolean) ?? ["year", "cause", "population"] : ["year", "cause", "population"]);
  const [mortalityMeasures, setMortalityMeasures] = useState<string[]>(requestedSource === "mortality" ? initialParams.get("measures")?.split(",").filter(Boolean) ?? ["deaths", "share"] : ["deaths", "share"]);

  const damirRequest = useMemo<ExtractionRequest>(() => ({
    ...filters,
    dimensions,
    measures,
    limit: 500,
  }), [filters, dimensions, measures]);

  const pathologyRequest = useMemo<PathologyExtractionRequest>(() => ({
    top: pathologyTop,
    start_year: pathologyStartYear,
    end_year: pathologyEndYear,
    dimensions: pathologyDimensions,
    measures: pathologyMeasures,
    limit: 500,
  }), [pathologyTop, pathologyStartYear, pathologyEndYear, pathologyDimensions, pathologyMeasures]);

  const cspRequest = useMemo<CspExtractionRequest>(() => ({
    year: 2023,
    level: cspLevel,
    csp_code: cspCode,
    dimensions: cspDimensions,
    measures: cspMeasures,
    limit: 500,
  }), [cspLevel, cspCode, cspDimensions, cspMeasures]);

  const populationRequest = useMemo<PopulationExtractionRequest>(() => ({
    start_year: populationStartYear,
    end_year: populationEndYear,
    region: populationRegion,
    age: populationAge,
    sex: populationSex,
    dimensions: populationDimensions,
    measures: populationMeasures,
    limit: PREVIEW_PAGE_SIZE,
  }), [populationStartYear, populationEndYear, populationRegion, populationAge, populationSex, populationDimensions, populationMeasures]);

  const mortalityRequest = useMemo<MortalityExtractionRequest>(() => ({
    start_year: mortalityStartYear,
    end_year: mortalityEndYear,
    cause: mortalityCause,
    population: mortalityPopulation,
    dimensions: mortalityDimensions,
    measures: mortalityMeasures,
    limit: 500,
  }), [mortalityStartYear, mortalityEndYear, mortalityCause, mortalityPopulation, mortalityDimensions, mortalityMeasures]);

  useEffect(() => {
    const controller = new AbortController();
    getPathologyMetadata(controller.signal)
      .then((next) => {
        setPathologyMetadata(next);
        const flattened = next.families.flatMap((family) => [
          { code: family.code, label: family.label, family: family.label, group: "__family__" },
          ...family.groups.flatMap((group) => [
            { code: group.code, label: group.label, family: family.label, group: group.code },
            ...group.pathologies.map((pathology) => ({ ...pathology, family: family.label, group: group.code })),
          ]),
        ]);
        const selected = flattened.find((item) => item.code === pathologyTop)
          ?? flattened.find((item) => item.label.toLocaleLowerCase("fr").includes("diab"))
          ?? flattened[0];
        if (selected) {
          setPathologyFamily(selected.family);
          setPathologyGroup(selected.group);
          setPathologyTop(selected.code);
        }
        if (!next.years.includes(pathologyStartYear)) setPathologyStartYear(next.years[0]);
        if (!next.years.includes(pathologyEndYear)) setPathologyEndYear(next.default_year);
      })
      .catch(() => null);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getCspMetadata(controller.signal)
      .then((next) => {
        setCspMetadata(next);
        const selectedLevel = next.levels.find((item) => item.key === cspLevel) ?? next.levels[0];
        const fallback = selectedLevel.options.find((item) => item.code === (cspLevel === "groupe_6" ? "3" : "38")) ?? selectedLevel.options[0];
        if (!selectedLevel.options.some((item) => item.code === cspCode)) setCspCode(fallback.code);
      })
      .catch(() => null);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getPopulationMetadata(controller.signal)
      .then((next) => {
        setPopulationMetadata(next);
        if (!next.years.includes(populationStartYear)) setPopulationStartYear(next.years[0]);
        if (!next.years.includes(populationEndYear)) setPopulationEndYear(next.default_year);
      })
      // La base est optionnelle : sans elle, l'onglet Population reste vide
      // plutôt que de faire échouer l'écran.
      .catch(() => null);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getMortalityMetadata(controller.signal)
      .then((next) => {
        setMortalityMetadata(next);
        if (!next.years.includes(mortalityStartYear)) setMortalityStartYear(next.years[0]);
        if (!next.years.includes(mortalityEndYear)) setMortalityEndYear(next.default_year);
        if (mortalityCause !== "__all__" && !next.causes.some((item) => item.code === mortalityCause)) setMortalityCause("__all__");
        if (mortalityPopulation !== "__all__" && !next.populations.some((item) => item.code === mortalityPopulation)) setMortalityPopulation("__all__");
      })
      .catch(() => null);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (source !== "damir") return;
    const params = new URLSearchParams();
    params.set("page", "extraction");
    params.set("source", "damir");
    writeFilters(params, filters);
    params.set("dimensions", dimensions.join(","));
    params.set("measures", measures.join(","));
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [source, filters, dimensions, measures]);

  useEffect(() => {
    if (source !== "pathologies" || !pathologyTop) return;
    const params = new URLSearchParams({
      page: "extraction", source: "pathologies", top: pathologyTop,
      start_year: String(pathologyStartYear), end_year: String(pathologyEndYear),
      dimensions: pathologyDimensions.join(","), measures: pathologyMeasures.join(","),
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [source, pathologyTop, pathologyStartYear, pathologyEndYear, pathologyDimensions, pathologyMeasures]);

  useEffect(() => {
    if (source !== "csp" || !cspCode) return;
    const params = new URLSearchParams({
      page: "extraction", source: "csp", year: "2023", level: cspLevel, csp: cspCode,
      dimensions: cspDimensions.join(","), measures: cspMeasures.join(","),
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [source, cspLevel, cspCode, cspDimensions, cspMeasures]);

  useEffect(() => {
    if (source === "population") {
      const next = new URLSearchParams({
        page: "extraction", source: "population",
        region: populationRegion, age: populationAge, sex: populationSex,
        start_year: String(populationStartYear), end_year: String(populationEndYear),
        dimensions: populationDimensions.join(","), measures: populationMeasures.join(","),
      });
      window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
      return;
    }
    if (source !== "mortality") return;
    const params = new URLSearchParams({
      page: "extraction", source: "mortality", cause: mortalityCause, population: mortalityPopulation,
      start_year: String(mortalityStartYear), end_year: String(mortalityEndYear),
      dimensions: mortalityDimensions.join(","), measures: mortalityMeasures.join(","),
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [source, mortalityCause, mortalityPopulation, mortalityStartYear, mortalityEndYear, mortalityDimensions, mortalityMeasures]);

  useEffect(() => {
    if (source !== "damir") return;
    if (!dimensions.length || !measures.length) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getExtractionPreview(damirRequest, controller.signal)
        .then((next) => { if (active) setPreview(next); })
        .catch((reason: Error) => {
          if (active && reason.name !== "AbortError") setError(reason.message);
        })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, damirRequest, dimensions.length, measures.length]);

  useEffect(() => {
    if (source !== "pathologies" || !pathologyTop) return;
    if (!pathologyDimensions.length || !pathologyMeasures.length || pathologyStartYear > pathologyEndYear) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getPathologyExtractionPreview(pathologyRequest, controller.signal)
        .then((next) => { if (active) setPreview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, pathologyRequest, pathologyTop, pathologyDimensions.length, pathologyMeasures.length, pathologyStartYear, pathologyEndYear]);

  useEffect(() => {
    if (source !== "csp" || !cspCode) return;
    if (!cspDimensions.length || !cspMeasures.length) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getCspExtractionPreview(cspRequest, controller.signal)
        .then((next) => { if (active) setPreview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, cspRequest, cspCode, cspDimensions.length, cspMeasures.length]);

  useEffect(() => {
    if (source !== "population") return;
    if (!populationDimensions.length || !populationMeasures.length || populationStartYear > populationEndYear) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getPopulationExtractionPreview(populationRequest, controller.signal)
        .then((next) => { if (active) setPreview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, populationRequest, populationDimensions.length, populationMeasures.length, populationStartYear, populationEndYear]);

  useEffect(() => {
    if (source !== "mortality") return;
    if (!mortalityDimensions.length || !mortalityMeasures.length || mortalityStartYear > mortalityEndYear) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getMortalityExtractionPreview(mortalityRequest, controller.signal)
        .then((next) => { if (active) setPreview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, mortalityRequest, mortalityDimensions.length, mortalityMeasures.length, mortalityStartYear, mortalityEndYear]);

  const toggle = (key: string, values: string[], setValues: (items: string[]) => void) => {
    setValues(values.includes(key) ? values.filter((item) => item !== key) : [...values, key]);
  };

  useEffect(() => setPreviewPage(0), [preview]);

  const chooseSource = (next: ExtractionSource) => {
    // Recliquer la source déjà choisie vidait l'aperçu sans rien relancer : les
    // dépendances de l'effet n'avaient pas bougé, donc aucune requête ne
    // repartait, et le panneau restait mort jusqu'au prochain changement de
    // filtre. Le défaut existait avant les onglets ; ceux-ci invitent à cliquer.
    if (next === source) return;
    setSource(next);
    setPreview(null);
    onSourceChange?.(next);
  };

  const exportData = async (format: "csv" | "xlsx") => {
    if (source === "damir" && (!dimensions.length || !measures.length)) return;
    if (source === "pathologies" && (!pathologyDimensions.length || !pathologyMeasures.length || !pathologyTop)) return;
    if (source === "csp" && (!cspDimensions.length || !cspMeasures.length || !cspCode)) return;
    if (source === "mortality" && (!mortalityDimensions.length || !mortalityMeasures.length)) return;
    if (source === "population" && (!populationDimensions.length || !populationMeasures.length)) return;
    setExporting(format);
    setError(null);
    try {
      if (source === "damir") await downloadExtraction(format, damirRequest);
      else if (source === "pathologies") await downloadPathologyExtraction(format, pathologyRequest);
      else if (source === "csp") await downloadCspExtraction(format, cspRequest);
      else if (source === "population") await downloadPopulationExtraction(format, populationRequest);
      else await downloadMortalityExtraction(format, mortalityRequest);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "L’export n’a pas pu être généré.");
    } finally {
      setExporting(null);
    }
  };

  const selectedPathologyFamily = pathologyMetadata?.families.find((item) => item.label === pathologyFamily) ?? null;
  const pathologyGroups = selectedPathologyFamily ? [
    { label: `Ensemble · ${selectedPathologyFamily.label}`, code: "__family__", top: selectedPathologyFamily.code },
    ...selectedPathologyFamily.groups.map((item) => ({ label: item.label, code: item.code, top: item.code })),
  ] : [];
  const selectedPathologyGroup = pathologyGroup === "__family__" ? null : selectedPathologyFamily?.groups.find((item) => item.code === pathologyGroup) ?? null;
  const pathologyOptions = selectedPathologyFamily ? (selectedPathologyGroup ? [
    { code: selectedPathologyGroup.code, label: `Ensemble · ${selectedPathologyGroup.label}` },
    ...selectedPathologyGroup.pathologies.filter((item) => item.code !== selectedPathologyGroup.code),
  ] : [{ code: selectedPathologyFamily.code, label: selectedPathologyFamily.label }]) : [];
  const homogeneousUnitSelected = filters.service_codes.length === 1 || dimensions.includes("service");
  const selectedCspLevel = cspMetadata?.levels.find((item) => item.key === cspLevel) ?? null;
  const cspOptions = selectedCspLevel?.options ?? [];
  const chooseCspLevel = (nextLevel: "groupe_6" | "categorie_29") => {
    setCspLevel(nextLevel);
    const next = cspMetadata?.levels.find((item) => item.key === nextLevel);
    const preferred = next?.options.find((item) => item.code === (nextLevel === "groupe_6" ? "3" : "38")) ?? next?.options[0];
    if (preferred) setCspCode(preferred.code);
  };
  const choosePathologyFamily = (nextFamily: string) => {
    setPathologyFamily(nextFamily);
    const selected = pathologyMetadata?.families.find((item) => item.label === nextFamily);
    if (selected) {
      setPathologyGroup("__family__");
      setPathologyTop(selected.code);
    }
  };
  const choosePathologyGroup = (nextGroup: string) => {
    setPathologyGroup(nextGroup);
    const selected = pathologyGroups.find((item) => item.code === nextGroup);
    if (selected) setPathologyTop(selected.top);
  };
  const previewPageCount = Math.max(1, Math.ceil((preview?.rows.length ?? 0) / PREVIEW_PAGE_SIZE));
  const visiblePreviewRows = preview?.rows.slice(
    previewPage * PREVIEW_PAGE_SIZE,
    (previewPage + 1) * PREVIEW_PAGE_SIZE,
  ) ?? [];
  const previewStart = previewPage * PREVIEW_PAGE_SIZE + 1;
  const previewEnd = Math.min((previewPage + 1) * PREVIEW_PAGE_SIZE, preview?.rows.length ?? 0);

  /** Ce que l'export produira, et de quoi il faut se méfier. La réserve reste
   *  visible : c'est un avertissement de comparabilité, pas une précision. */
  const CONTEXTS: Record<ExtractionSource, { caveatTitle: string; caveat: string }> = {
    damir: {
      caveatTitle: "Liquidation",
      caveat: "Les derniers millésimes sont incomplets tant que les soins ne sont pas tous liquidés.",
    },
    pathologies: {
      caveatTitle: "Secret statistique",
      caveat: "Les petits effectifs peuvent être masqués à la source.",
    },
    csp: {
      caveatTitle: "Champ Insee",
      caveat: "Actifs ayant un emploi · effectifs pondérés avec IPONDI.",
    },
    mortality: {
      caveatTitle: "Effectifs bruts",
      caveat: "L’export porte les décès publiés, jamais un taux : le CépiDc ne publie pas de "
        + "population exposée. Les Croisements, eux, rapportent ces décès à la population résidente Insee.",
    },
    population: {
      caveatTitle: "Au 1er janvier",
      caveat: "Estimations Insee, rétropolées sur les 13 régions actuelles depuis 1975. Le total "
        + "« Ensemble » est recalculé par somme des hommes et des femmes.",
    },
  };

  /** Les filtres de la source courante, mis en rangée par la grille de
   *  `.extraction-filters` — la même charpente pour les cinq. */
  const filterRow = source === "damir" ? (
    <AdvancedFilterPanel metadata={metadata} value={filters} onChange={setFilters} />
  ) : source === "pathologies" ? (
    <>
      <label><span>Niveau 1 · Famille</span><select value={pathologyFamily} onChange={(event) => choosePathologyFamily(event.target.value)}>{pathologyMetadata?.families.map((item) => <option key={item.label}>{item.label}</option>)}</select></label>
      <label><span>Niveau 2 · Catégorie</span><select value={pathologyGroup} onChange={(event) => choosePathologyGroup(event.target.value)}>{pathologyGroups.map((item) => <option value={item.code} key={`${item.code}-${item.label}`}>{item.label}</option>)}</select></label>
      <label><span>Niveau 3 · Détail</span><select value={pathologyTop} onChange={(event) => setPathologyTop(event.target.value)}>{pathologyOptions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
      <div className="extraction-period"><span>Période</span><div><select aria-label="Première année" value={pathologyStartYear} onChange={(event) => setPathologyStartYear(Number(event.target.value))}>{pathologyMetadata?.years.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Dernière année" value={pathologyEndYear} onChange={(event) => setPathologyEndYear(Number(event.target.value))}>{pathologyMetadata?.years.map((item) => <option key={item}>{item}</option>)}</select></div></div>
    </>
  ) : source === "csp" ? (
    <>
      <label><span>Niveau de lecture</span><select value={cspLevel} onChange={(event) => chooseCspLevel(event.target.value as "groupe_6" | "categorie_29")}><option value="groupe_6">6 grands groupes</option><option value="categorie_29">29 catégories détaillées</option></select></label>
      <label><span>CSP observée</span><select value={cspCode} onChange={(event) => setCspCode(event.target.value)}>{cspOptions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
      <div className="extraction-fixed"><span>Millésime</span><strong>2023</strong></div>
    </>
  ) : source === "population" ? (
    <>
      <label><span>Territoire</span><select value={populationRegion} onChange={(event) => setPopulationRegion(event.target.value)}><option value="__all__">Tous les territoires</option>{populationMetadata?.regions.filter((item) => item.code !== "99").map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
      <label><span>Tranche d’âge</span><select value={populationAge} onChange={(event) => setPopulationAge(event.target.value)}><option value="__all__">Toutes les tranches</option>{populationMetadata?.ages.filter((item) => item.code !== "tsage").map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
      <label><span>Sexe</span><select value={populationSex} onChange={(event) => setPopulationSex(event.target.value)}><option value="__all__">Les deux</option><option value="femmes">Femmes</option><option value="hommes">Hommes</option></select></label>
      <div className="extraction-period"><span>Période</span><div><select aria-label="Première année" value={populationStartYear} onChange={(event) => setPopulationStartYear(Number(event.target.value))}>{populationMetadata?.years.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Dernière année" value={populationEndYear} onChange={(event) => setPopulationEndYear(Number(event.target.value))}>{populationMetadata?.years.map((item) => <option key={item}>{item}</option>)}</select></div></div>
    </>
  ) : (
    <>
      <label className="extraction-wide"><span>Cause de décès</span><SearchableCauseSelect options={mortalityMetadata?.causes ?? []} value={mortalityCause} onChange={setMortalityCause} allOption={{ code: "__all__", label: "Toutes les causes disponibles" }} /></label>
      <label><span>Population publiée</span><select value={mortalityPopulation} onChange={(event) => setMortalityPopulation(event.target.value)}><option value="__all__">Tous les périmètres publiés</option>{mortalityMetadata?.populations.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
      <div className="extraction-period"><span>Période</span><div><select aria-label="Première année" value={mortalityStartYear} onChange={(event) => setMortalityStartYear(Number(event.target.value))}>{mortalityMetadata?.years.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Dernière année" value={mortalityEndYear} onChange={(event) => setMortalityEndYear(Number(event.target.value))}>{mortalityMetadata?.years.map((item) => <option key={item}>{item}</option>)}</select></div></div>
    </>
  );

  /** Le constructeur de colonnes : cinq sources, une seule forme.
   *
   *  Les cinq blocs qu'il remplace étaient identiques au libellé près. Leurs
   *  seules différences réelles — une mesure qui exige une unité homogène, une
   *  dimension rendue obligatoire par le périmètre — passent par `note`. */
  const builder = (
    hint: string,
    dims: Array<{ key: string; label: string }>, dimValues: string[], setDims: (items: string[]) => void,
    meas: Array<{ key: string; label: string }>, measValues: string[], setMeas: (items: string[]) => void,
    dimensionsHint: string,
    note?: (kind: "dimension" | "measure", key: string, selected: boolean) => { disabled?: boolean; title?: string; suffix?: string },
  ) => (
    <article className="builder-card panel">
      <div className="builder-header">
        <div><span className="section-kicker">Structure de la base</span><h2>Choisir les colonnes</h2><p>{hint}</p></div>
        <span className="builder-count">{dimValues.length + measValues.length} colonnes</span>
      </div>
      <div className="builder-groups">
        <div><strong>Dimensions</strong><span>{dimensionsHint}</span><div className="choice-grid">{dims.map((item) => {
          const selected = dimValues.includes(item.key);
          const state = note?.("dimension", item.key, selected) ?? {};
          return <button type="button" key={item.key} className={selected ? "selected" : ""} disabled={state.disabled} title={state.title} onClick={() => toggle(item.key, dimValues, setDims)}><i>{selected ? "✓" : "+"}</i>{item.label}{state.suffix ?? ""}</button>;
        })}</div></div>
        <div><strong>Mesures</strong><span>Quels indicateurs calculer</span><div className="choice-grid measures-grid">{meas.map((item) => {
          const selected = measValues.includes(item.key);
          const state = note?.("measure", item.key, selected) ?? {};
          return <button type="button" key={item.key} className={selected ? "selected" : ""} disabled={state.disabled} title={state.title} onClick={() => toggle(item.key, measValues, setMeas)}><i>{selected ? "✓" : "+"}</i>{item.label}{state.suffix ?? ""}</button>;
        })}</div></div>
      </div>
    </article>
  );

  const CSP_DIMENSIONS = [{ key: "year", label: "Année" }, { key: "region", label: "Région" }, { key: "age", label: "Tranche d’âge" }, { key: "sex", label: "Sexe" }];
  const CSP_MEASURES = [{ key: "effectif", label: "Effectif pondéré" }, { key: "population", label: "Actifs en emploi" }, { key: "share", label: "Part de la CSP" }];

  const builderCard = source === "damir"
    ? builder("Chaque croisement des dimensions forme une ligne ; chaque mesure devient une colonne.",
        metadata.dimensions, dimensions, setDimensions, metadata.measures, measures, setMeasures,
        "Comment découper la donnée",
        (kind, key, selected) => {
          if (kind !== "measure") return {};
          const item = metadata.measures.find((entry) => entry.key === key);
          const disabled = Boolean(item?.requires_homogeneous_unit) && !homogeneousUnitSelected && !selected;
          return disabled
            ? { disabled, title: "Sélectionnez une prestation ou ajoutez la dimension Prestation", suffix: " · prestation" }
            : {};
        })
    : source === "pathologies"
    ? builder("Les totaux nationaux sont utilisés lorsqu’une dimension n’est pas sélectionnée.",
        pathologyMetadata?.dimensions ?? [], pathologyDimensions, setPathologyDimensions,
        pathologyMetadata?.measures ?? [], pathologyMeasures, setPathologyMeasures,
        "Comment découper la population")
    : source === "csp"
    ? builder("Chaque ligne décrit la CSP sélectionnée selon les découpages choisis.",
        CSP_DIMENSIONS, cspDimensions, setCspDimensions, CSP_MEASURES, cspMeasures, setCspMeasures,
        "Comment découper la population")
    : source === "population"
    ? builder("Une ligne correspond à un millésime et aux découpages retenus.",
        populationMetadata?.dimensions ?? [], populationDimensions, setPopulationDimensions,
        populationMetadata?.measures ?? [], populationMeasures, setPopulationMeasures,
        "Comment découper la population",
        (kind, key, selected) => {
          if (kind !== "dimension") return {};
          const required = (key === "year" && populationStartYear !== populationEndYear)
            || (key === "region" && populationRegion === "__all__");
          return required
            ? { disabled: selected, title: "Dimension nécessaire pour ce périmètre", suffix: " · requise" }
            : {};
        })
    : builder("Une ligne correspond à un millésime, une cause et un périmètre de population publiés.",
        mortalityMetadata?.dimensions ?? [], mortalityDimensions, setMortalityDimensions,
        mortalityMetadata?.measures ?? [], mortalityMeasures, setMortalityMeasures,
        "Comment découper les décès",
        (kind, key, selected) => {
          if (kind !== "dimension") return {};
          const required = (key === "year" && mortalityStartYear !== mortalityEndYear)
            || (key === "cause" && mortalityCause === "__all__")
            || (key === "population" && mortalityPopulation === "__all__");
          return required
            ? { disabled: selected, title: "Dimension nécessaire pour ce périmètre", suffix: " · requise" }
            : {};
        });

  const exportBlocked = Boolean(exporting) || !preview?.rows.length || preview.total_rows > 250000;

  return (
    <div className="content-wrap extraction-page">
      <PageHero
        variant="analysis-hero"
        eyebrowLabel="Base sur mesure"
        eyebrowDetail="Données agrégées"
        title="Extraire"
        mission="Composez une base propre, estimez son volume et emportez avec Excel les définitions et le périmètre utilisés."
        action={onOpenMethodology
          ? <button type="button" className="method-link" onClick={onOpenMethodology}>Données &amp; méthode →</button>
          : undefined}
      />

      {/* Cinq sources, une seule charpente — les mêmes onglets que les cinq
          bases, pour que changer de source soit un changement de sujet et non
          un changement d'outil. */}
      <nav className="damir-sections" role="tablist" aria-label="Source à extraire">
        {SOURCES.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={source === item.key}
            className={source === item.key ? "active" : ""}
            onClick={() => chooseSource(item.key)}
          >
            <strong>{item.label}</strong>
            <small>{item.hint}</small>
          </button>
        ))}
      </nav>

      {/* Le périmètre en haut, comme sur les cinq bases : l'écran se lit de
          haut en bas — quelle source, quel périmètre, quelles colonnes, ce que
          ça donne. */}
      <section className="panel extraction-context">
        <div className="extraction-filters">{filterRow}</div>
        <p className="extraction-caveat">
          <strong>{CONTEXTS[source].caveatTitle}</strong>
          <span>{CONTEXTS[source].caveat}</span>
        </p>
      </section>

      <div className={`extraction-loading-track ${loading ? "active" : ""}`} role="status" aria-label={loading ? "Aperçu en cours d’actualisation" : "Aperçu à jour"}><span /></div>

      {builderCard}

      <article className="preview-card panel">
        <div className="preview-header">
          <div>
            <span className="section-kicker">Aperçu dynamique</span>
            <h2>Base extraite</h2>
            <p>{preview ? `${new Intl.NumberFormat("fr-FR").format(preview.total_rows)} lignes estimées dans le périmètre` : "Sélectionnez au moins une dimension et une mesure"}</p>
          </div>
          {/* Les exports agissent sur ce tableau : leur place est ici, et non
              dans le titre de la page, où ils précédaient ce qu'ils exportent. */}
          <div className="extraction-actions">
            {preview?.limited ? <span className="extraction-sample">Échantillon des 500 premières lignes</span> : null}
            <button type="button" onClick={() => exportData("csv")} disabled={exportBlocked}>{exporting === "csv" ? "Préparation…" : "Exporter CSV"}</button>
            <button className="primary" type="button" onClick={() => exportData("xlsx")} disabled={exportBlocked}>{exporting === "xlsx" ? "Préparation…" : "Exporter Excel"}</button>
            <InfoHint label="le contenu du fichier Excel">Le classeur porte un onglet Métadonnées : source, période, filtres, définitions, formules, statut de consolidation et règles de masquage propres à la source.</InfoHint>
          </div>
        </div>
        {preview && preview.total_rows > 250000 ? <div className="analysis-warnings"><span>ⓘ L’export dépasse 250 000 lignes. Réduisez le périmètre ou le nombre de dimensions avant de lancer le téléchargement.</span></div> : null}
        {error ? <div className="analysis-error"><strong>Impossible de générer l’aperçu</strong><span>{error}</span></div> : null}
        {loading ? <div className="preview-loading"><div className="skeleton" /></div> : preview?.rows.length ? (
          <>
            <div className="advanced-table-wrap" role="region" aria-label="Aperçu de la base extraite" tabIndex={0}>
              <table className="advanced-table"><caption className="sr-only">Aperçu paginé des données qui seront exportées</caption><thead><tr>{preview.columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead><tbody>{visiblePreviewRows.map((row, index) => <tr key={`${previewPage}-${index}`}>{preview.columns.map((column) => <td key={column.key} title={formatCell(row[column.key], column.kind)} className={column.kind === "dimension" ? "" : "numeric"}>{formatCell(row[column.key], column.kind)}</td>)}</tr>)}</tbody></table>
            </div>
            <nav className="preview-pagination" aria-label="Pagination de l’aperçu"><span>Lignes {previewStart}–{previewEnd} sur {new Intl.NumberFormat("fr-FR").format(preview.rows.length)} affichables</span><div><button type="button" disabled={previewPage === 0} onClick={() => setPreviewPage((page) => Math.max(0, page - 1))}>← Précédent</button><strong>{previewPage + 1} / {previewPageCount}</strong><button type="button" disabled={previewPage >= previewPageCount - 1} onClick={() => setPreviewPage((page) => Math.min(previewPageCount - 1, page + 1))}>Suivant →</button></div></nav>
          </>
        ) : <div className="empty-extraction"><span>＋</span><strong>Votre base apparaîtra ici</strong><p>Ajoutez des dimensions et des mesures pour lancer l’agrégation.</p></div>}
      </article>
    </div>
  );
}

export default ExtractionPage;
