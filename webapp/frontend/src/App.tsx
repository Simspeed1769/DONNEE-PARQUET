import { Component, lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { ComponentType, ErrorInfo, LazyExoticComponent, ReactNode } from "react";
import { getMetadata } from "./api";
import type { Metadata, PageKey, PanoramaFilters } from "./types";

const CHUNK_RELOAD_KEY = "damir-chunk-reload";
const DEFAULT_PANORAMA_START_YEAR = 2015;
const DEFAULT_PANORAMA_END_YEAR = 2024;

function lazyPage<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => loader()
    .then((module) => {
      window.sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return module;
    })
    .catch((reason: unknown) => {
      if (!window.sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        window.sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
        window.location.reload();
      }
      return Promise.reject(reason);
    }));
}

const pageImports = {
  panorama: () => import("./pages/PanoramaPage"),
  pathologies: () => import("./pages/PathologyPage"),
  csp: () => import("./pages/CspPage"),
  mortality: () => import("./pages/MortalityPage"),
  analysis: () => import("./pages/AnalysisPage"),
  benchmarks: () => import("./pages/BenchmarksPage"),
  extraction: () => import("./pages/ExtractionPage"),
  methodology: () => import("./pages/MethodologyPage"),
};

const PanoramaPage = lazyPage(() => pageImports.panorama().then((module) => ({ default: module.PanoramaPage })));
const PathologyPage = lazyPage(() => pageImports.pathologies().then((module) => ({ default: module.PathologyPage })));
const CspPage = lazyPage(() => pageImports.csp().then((module) => ({ default: module.CspPage })));
const MortalityPage = lazyPage(() => pageImports.mortality().then((module) => ({ default: module.MortalityPage })));
const AnalysisPage = lazyPage(() => pageImports.analysis().then((module) => ({ default: module.AnalysisPage })));
const BenchmarksPage = lazyPage(() => pageImports.benchmarks().then((module) => ({ default: module.BenchmarksPage })));
const ExtractionPage = lazyPage(() => pageImports.extraction().then((module) => ({ default: module.ExtractionPage })));
const MethodologyPage = lazyPage(() => pageImports.methodology().then((module) => ({ default: module.MethodologyPage })));

function preloadPage(page: PageKey) {
  void pageImports[page]().catch(() => undefined);
}

class PageErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || "La page n’a pas pu être chargée." };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("DAMIR page error", error, info);
  }

  render() {
    if (this.state.message) {
      return <div className="page-load-error"><strong>La page n’a pas pu s’ouvrir</strong><span>Une nouvelle version de l’application est disponible.</span><button type="button" onClick={() => window.location.reload()}>Recharger la page</button></div>;
    }
    return this.props.children;
  }
}

type IconName = "grid" | "chart" | "download" | "book" | "panel";
type ExtractionSource = "damir" | "pathologies" | "csp" | "mortality";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    chart: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z"/></>,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function pageFromLocation(): PageKey {
  const page = new URLSearchParams(window.location.search).get("page");
  return (["panorama", "pathologies", "csp", "mortality", "analysis", "benchmarks", "extraction", "methodology"] as PageKey[]).includes(page as PageKey)
    ? page as PageKey
    : "panorama";
}

function Loader() {
  return <div className="page-loader"><div className="skeleton" /></div>;
}

function App() {
  const [page, setPage] = useState<PageKey>(pageFromLocation);
  const [routeVersion, setRouteVersion] = useState(0);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem("damir-sidebar-collapsed") === "1");
  const [extractionSource, setExtractionSource] = useState<ExtractionSource>(() => {
    const value = new URLSearchParams(window.location.search).get("source");
    return value === "pathologies" || value === "csp" || value === "mortality" ? value : "damir";
  });

  useEffect(() => {
    const controller = new AbortController();
    getMetadata(controller.signal)
      .then(setMetadata)
      .catch((reason: Error) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPage(pageFromLocation());
      const value = new URLSearchParams(window.location.search).get("source");
      setExtractionSource(value === "pathologies" || value === "csp" || value === "mortality" ? value : "damir");
      setRouteVersion((value) => value + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("damir-sidebar-collapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "\\") {
        event.preventDefault();
        setSidebarCollapsed((collapsed) => !collapsed);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = (nextPage: PageKey, supplied?: URLSearchParams) => {
    const params = supplied ?? new URLSearchParams();
    params.set("page", nextPage);
    const commitNavigation = () => {
      window.history.pushState(null, "", `${window.location.pathname}?${params.toString()}`);
      setPage(nextPage);
      if (nextPage === "extraction") {
        const source = params.get("source");
        setExtractionSource(source === "pathologies" || source === "csp" || source === "mortality" ? source : "damir");
      }
      setRouteVersion((value) => value + 1);
    };
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startViewTransition = (document as Document & {
      startViewTransition?: (update: () => void) => unknown;
    }).startViewTransition;
    if (startViewTransition && !reducedMotion) startViewTransition.call(document, commitNavigation);
    else commitNavigation();
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };

  const panoramaFilters = useMemo<PanoramaFilters>(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedStartYear = Number(params.get("start_year"));
    const requestedEndYear = Number(params.get("end_year"));
    const defaultPeriodRequested = params.get("period_mode") === "default"
      || (!requestedStartYear && !requestedEndYear)
      || (requestedStartYear === 2019 && requestedEndYear === 2024 && !params.has("period_mode"));
    return {
      startYear: defaultPeriodRequested ? DEFAULT_PANORAMA_START_YEAR : requestedStartYear || DEFAULT_PANORAMA_START_YEAR,
      endYear: defaultPeriodRequested ? DEFAULT_PANORAMA_END_YEAR : requestedEndYear || DEFAULT_PANORAMA_END_YEAR,
      referenceYear: defaultPeriodRequested ? DEFAULT_PANORAMA_END_YEAR - 1 : Number(params.get("reference_year")) || DEFAULT_PANORAMA_END_YEAR - 1,
      measure: params.get("measure") === "expense" ? "expense" : "reimbursed",
      grandPost: params.get("grand_post") || "",
      region: params.get("region") || "",
    };
  }, [metadata, routeVersion]);

  const sourceLabel = useMemo(() => {
    if (page === "pathologies" || (page === "extraction" && extractionSource === "pathologies")) {
      return "Cartographie Cnam";
    }
    if (page === "csp" || (page === "extraction" && extractionSource === "csp")) return "Recensement Insee · 2015–2023";
    if (page === "mortality" || (page === "extraction" && extractionSource === "mortality")) return "CépiDc · 2015–2024";
    if (page === "benchmarks") return "Repères multi-sources";
    if (page === "methodology") return "Sources & définitions";
    return "Open DAMIR";
  }, [page, extractionSource]);

  const sourceContext = useMemo(() => {
    if (page === "pathologies" || (page === "extraction" && extractionSource === "pathologies")) return "Pathologies";
    if (page === "csp" || (page === "extraction" && extractionSource === "csp")) return "CSP";
    if (page === "mortality" || (page === "extraction" && extractionSource === "mortality")) return "Mortalité";
    if (page === "benchmarks") return "Repères";
    if (page === "methodology") return "Référentiel";
    return "DAMIR";
  }, [page, extractionSource]);

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar" id="main-sidebar">
        <div className="brand"><div className="brand-mark"><span /></div><div><strong>DAMIR</strong><small>Studio</small></div></div>
        <nav className="main-nav" aria-label="Navigation principale">
          <div className="nav-section">
            <span className="nav-caption">EXPLORER</span>
            <button type="button" title="DAMIR" aria-current={page === "panorama" ? "page" : undefined} className={`nav-item nav-source-item ${page === "panorama" ? "active" : ""}`} onPointerEnter={() => preloadPage("panorama")} onFocus={() => preloadPage("panorama")} onClick={() => navigate("panorama")}><Icon name="grid" /><span className="nav-label">DAMIR</span></button>
            <button type="button" title="Pathologies" aria-current={page === "pathologies" ? "page" : undefined} className={`nav-item nav-source-item ${page === "pathologies" ? "active" : ""}`} onPointerEnter={() => preloadPage("pathologies")} onFocus={() => preloadPage("pathologies")} onClick={() => navigate("pathologies")}><Icon name="chart" /><span className="nav-label">Pathologies</span></button>
            <button type="button" title="CSP" aria-current={page === "csp" ? "page" : undefined} className={`nav-item nav-source-item ${page === "csp" ? "active" : ""}`} onPointerEnter={() => preloadPage("csp")} onFocus={() => preloadPage("csp")} onClick={() => navigate("csp")}><Icon name="grid" /><span className="nav-label">CSP</span></button>
            <button type="button" title="Mortalité" aria-current={page === "mortality" ? "page" : undefined} className={`nav-item nav-source-item ${page === "mortality" ? "active" : ""}`} onPointerEnter={() => preloadPage("mortality")} onFocus={() => preloadPage("mortality")} onClick={() => navigate("mortality")}><Icon name="chart" /><span className="nav-label">Mortalité</span></button>
          </div>
          <div className="nav-section">
            <span className="nav-caption">ANALYSER</span>
            <button type="button" title="Atelier d’analyse DAMIR" aria-current={page === "analysis" ? "page" : undefined} className={`nav-item ${page === "analysis" ? "active" : ""}`} onPointerEnter={() => preloadPage("analysis")} onFocus={() => preloadPage("analysis")} onClick={() => navigate("analysis")}><Icon name="chart" /><span className="nav-label">Atelier</span><span className="nav-pill">DAMIR</span></button>
            <button type="button" title="Repères statistiques · 4 sources" aria-current={page === "benchmarks" ? "page" : undefined} className={`nav-item ${page === "benchmarks" ? "active" : ""}`} onPointerEnter={() => preloadPage("benchmarks")} onFocus={() => preloadPage("benchmarks")} onClick={() => navigate("benchmarks")}><Icon name="grid" /><span className="nav-label">Repères</span><span className="nav-pill">4 sources</span></button>
          </div>
          <div className="nav-section nav-section-tools">
            <span className="nav-caption">EXTRAIRE</span>
            <button type="button" title="Extraire les données" aria-current={page === "extraction" ? "page" : undefined} className={`nav-item ${page === "extraction" ? "active" : ""}`} onPointerEnter={() => preloadPage("extraction")} onFocus={() => preloadPage("extraction")} onClick={() => navigate("extraction")}><Icon name="download" /><span className="nav-label">Extraire</span></button>
          </div>
          <div className="nav-section nav-section-method">
            <span className="nav-caption">RÉFÉRENTIEL</span>
            <button type="button" title="Données et méthode" aria-current={page === "methodology" ? "page" : undefined} className={`nav-item ${page === "methodology" ? "active" : ""}`} onPointerEnter={() => preloadPage("methodology")} onFocus={() => preloadPage("methodology")} onClick={() => navigate("methodology")}><Icon name="book" /><span className="nav-label">Données & méthode</span></button>
          </div>
        </nav>
        <div className="sidebar-status"><span className="live-dot"/><div><strong>{metadata?.reliability.status ?? "Chargement des données"}</strong><small>Référentiel commun</small></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-leading">
            <button type="button" className="sidebar-toggle" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-controls="main-sidebar" aria-expanded={!sidebarCollapsed} title={`${sidebarCollapsed ? "Déployer" : "Replier"} la navigation · Ctrl+\\`}><Icon name="panel" /></button>
            <div className="topbar-context"><span>Forsides</span><i /><span>{sourceContext}</span></div>
          </div>
          <div className="topbar-actions"><span className="source-chip">{sourceLabel}</span><div className="avatar" title="Espace local">FS</div></div>
        </header>
        {error ? <div className="content-wrap"><div className="error-banner"><strong>Impossible de démarrer DAMIR Studio</strong><span>{error}</span></div></div> : null}
        {!metadata ? <Loader /> : <PageErrorBoundary key={`${page}-${routeVersion}`}><Suspense fallback={<Loader />}>
          {page === "panorama" ? <PanoramaPage metadata={metadata} initialFilters={panoramaFilters} onOpenAnalysis={(params) => navigate("analysis", params)} /> : null}
          {page === "pathologies" ? <PathologyPage key={`pathologies-${routeVersion}`} routeVersion={routeVersion} onOpenExtraction={(params) => navigate("extraction", params)} onOpenMethodology={() => navigate("methodology")} /> : null}
          {page === "csp" ? <CspPage key={`csp-${routeVersion}`} routeVersion={routeVersion} onOpenExtraction={(params) => navigate("extraction", params)} onOpenMethodology={() => navigate("methodology")} /> : null}
          {page === "mortality" ? <MortalityPage key={`mortality-${routeVersion}`} routeVersion={routeVersion} onOpenExtraction={(params) => navigate("extraction", params)} onOpenMethodology={() => navigate("methodology")} /> : null}
          {page === "analysis" ? <AnalysisPage key={`analysis-${routeVersion}`} metadata={metadata} routeVersion={routeVersion} onOpenExtraction={(params) => navigate("extraction", params)} onOpenMethodology={() => navigate("methodology")} /> : null}
          {page === "benchmarks" ? <BenchmarksPage key={`benchmarks-${routeVersion}`} metadata={metadata} routeVersion={routeVersion} onOpenExtraction={(params) => navigate("extraction", params)} onOpenMethodology={() => navigate("methodology")} /> : null}
          {page === "extraction" ? <ExtractionPage key={`extraction-${routeVersion}`} metadata={metadata} routeVersion={routeVersion} onSourceChange={setExtractionSource} /> : null}
          {page === "methodology" ? <MethodologyPage /> : null}
        </Suspense></PageErrorBoundary>}
      </main>
    </div>
  );
}

export default App;
