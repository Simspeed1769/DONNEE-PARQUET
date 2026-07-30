import { useEffect, useMemo, useState } from "react";
import { getPanorama } from "../api";
import { TrendChart } from "../components/TrendChart";
import type { Metadata, Panorama, PanoramaFilters } from "../types";
import { formatValue, yearStatusLabel } from "../utils";

type Props = {
  metadata: Metadata;
  initialFilters: PanoramaFilters;
  onOpenAnalysis: (params: URLSearchParams) => void;
};

type PanoramaView = "trend" | "drivers" | "concentration";
type TrendReading = "total" | "average";
type TrendMetric = "reimbursed" | "expense" | "average_reimbursed" | "average_expense";
const DEFAULT_START_YEAR = 2015;
const DEFAULT_END_YEAR = 2024;

const PANORAMA_VIEWS: Array<{ key: PanoramaView; label: string; detail: string }> = [
  { key: "trend", label: "Évolution", detail: "Suivre dans le temps" },
  { key: "drivers", label: "Explication", detail: "Comprendre la variation" },
  { key: "concentration", label: "Répartition", detail: "Localiser les montants" },
];

export function PanoramaPage({ metadata, initialFilters, onOpenAnalysis }: Props) {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const [draft, setDraft] = useState(initialFilters);
  const [filters, setFilters] = useState(initialFilters);
  const [view, setView] = useState<PanoramaView>(
    (["trend", "drivers", "concentration"].includes(initialParams.get("view") ?? "")
      ? initialParams.get("view") : "trend") as PanoramaView,
  );
  const [trendReading, setTrendReading] = useState<TrendReading>(
    initialParams.get("reading") === "average" ? "average" : "total",
  );
  const [result, setResult] = useState<Panorama | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", "panorama");
    params.set("start_year", String(filters.startYear));
    params.set("end_year", String(filters.endYear));
    params.set("reference_year", String(filters.referenceYear));
    params.set(
      "period_mode",
      filters.startYear === DEFAULT_START_YEAR && filters.endYear === DEFAULT_END_YEAR ? "default" : "custom",
    );
    params.set("measure", filters.measure);
    filters.grandPost ? params.set("grand_post", filters.grandPost) : params.delete("grand_post");
    filters.region ? params.set("region", filters.region) : params.delete("region");
    params.set("view", view);
    params.set("reading", trendReading);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [filters, view, trendReading]);

  useEffect(() => {
    if (JSON.stringify(draft) === JSON.stringify(filters)) return;
    const timer = window.setTimeout(() => setFilters(draft), 250);
    return () => window.clearTimeout(timer);
  }, [draft, filters]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    getPanorama(filters, controller.signal)
      .then((next) => { if (active) setResult(next); })
      .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => {
      active = false;
      controller.abort();
    };
  }, [filters]);

  const pending = loading || JSON.stringify(draft) !== JSON.stringify(filters);

  const regionLabel = useMemo(() => {
    if (!filters.region) return "France entière";
    return metadata.regions.find((item) => String(item.code) === filters.region)?.label ?? "Territoire sélectionné";
  }, [filters.region, metadata.regions]);

  const maximumDriver = Math.max(...(result?.drivers.map((item) => Math.abs(item.delta)) ?? [1]), 1);
  const selectedMeasureLabel = filters.measure === "expense" ? "Dépenses présentées" : "Remboursements versés";
  const trendMetric: TrendMetric = trendReading === "average"
    ? filters.measure === "expense" ? "average_expense" : "average_reimbursed"
    : filters.measure;
  const trendMetricLabel = trendReading === "average"
    ? filters.measure === "expense" ? "Dépense moyenne par unité" : "Remboursement moyen par unité"
    : selectedMeasureLabel;
  const chooseMeasure = (measure: PanoramaFilters["measure"]) => {
    setDraft((current) => ({ ...current, measure }));
  };

  const updateEndYear = (endYear: number) => {
    const referenceYear = draft.referenceYear === endYear
      ? metadata.years.filter((year) => year !== endYear && year < endYear).at(-1) ?? metadata.years.find((year) => year !== endYear) ?? endYear - 1
      : draft.referenceYear;
    setDraft({ ...draft, endYear, startYear: Math.min(draft.startYear, endYear), referenceYear });
  };

  const openInAnalysis = () => {
    const params = new URLSearchParams({
      question: "evolution",
      measure: trendMetric,
      start_year: String(filters.startYear),
      end_year: String(filters.endYear),
    });
    if (filters.grandPost) params.set("grand_post", filters.grandPost);
    if (filters.region) params.set("regions", filters.region);
    onOpenAnalysis(params);
  };

  return (
    <div className="content-wrap panorama-page">
      <section className="hero panorama-hero">
        <div>
          <div className="eyebrow"><span>Vue d’ensemble</span> Open DAMIR</div>
          <h1>Panorama</h1>
          <p>Les montants, leur évolution et les postes qui expliquent la variation.</p>
        </div>
        <span className={`quality-badge ${result && result.reliability.consolidated_through !== null && filters.endYear > result.reliability.consolidated_through ? "provisional" : "reliable"}`}>
          {result?.reliability.status ?? metadata.reliability.status}
        </span>
      </section>

      <section className="context-bar panorama-context panel" aria-label="Paramètres du Panorama">
        <label><span>De</span><select value={draft.startYear} onChange={(event) => setDraft({ ...draft, startYear: Number(event.target.value) })}>{metadata.years.filter((year) => year <= draft.endYear).map((year) => <option key={year} value={year}>{yearStatusLabel(metadata, year)}</option>)}</select></label>
        <label><span>À</span><select value={draft.endYear} onChange={(event) => updateEndYear(Number(event.target.value))}>{metadata.years.filter((year) => year >= draft.startYear).map((year) => <option key={year} value={year}>{yearStatusLabel(metadata, year)}</option>)}</select></label>
        <label><span>Référence des KPI</span><select value={draft.referenceYear} onChange={(event) => setDraft({ ...draft, referenceYear: Number(event.target.value) })}>{metadata.years.filter((year) => year !== draft.endYear).map((year) => <option key={year} value={year}>{yearStatusLabel(metadata, year)}</option>)}</select></label>
        <label className="context-wide"><span>Grand poste</span><select value={draft.grandPost} onChange={(event) => setDraft({ ...draft, grandPost: event.target.value })}><option value="">Toutes les prestations</option>{metadata.grand_posts.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="context-wide"><span>Territoire</span><select value={draft.region} onChange={(event) => setDraft({ ...draft, region: event.target.value })}><option value="">France entière</option>{metadata.regions.map((region) => <option key={region.code} value={region.code}>{region.label}</option>)}</select></label>
        <div className={`panorama-loading-track ${pending ? "active" : ""}`} aria-label={pending ? "Mise à jour du Panorama" : undefined}><span /></div>
      </section>

      <div className="scope-line panorama-scope"><div><span className="live-dot" />Périmètre affiché</div><strong>{filters.grandPost || "Toutes prestations"}</strong><span>{regionLabel}</span><span>{filters.startYear}–{filters.endYear}</span><span>Réf. {filters.referenceYear}</span><span>{selectedMeasureLabel}</span><button type="button" onClick={openInAnalysis}>Analyser ce périmètre →</button></div>

      {error ? <div className="error-banner"><strong>Impossible de calculer le Panorama</strong><span>{error}</span></div> : null}

      <section className="kpi-grid panorama-kpis" aria-label="Indicateurs essentiels">
        {!result && loading ? Array.from({ length: 4 }, (_, index) => <article className="kpi-card" key={index}><div className="skeleton" /></article>) : result?.kpis.map((kpi, index) => (
          <article className={`kpi-card ${index === 0 ? "accent" : ""} ${kpi.type === "driver" ? "driver-kpi" : ""}`} key={kpi.key} title={kpi.definition}>
            <div className="kpi-top"><div className="kpi-index-reference"><span className="kpi-order">0{index + 1}</span><span className="kpi-reference">Réf. {filters.referenceYear}</span></div><span className={`delta ${(kpi.delta ?? 0) >= 0 ? "positive" : "negative"}`}>{formatValue(kpi.delta_pct, "percent", true)}</span></div>
            <small>{kpi.label}</small>
            <strong>{kpi.text ?? formatValue(kpi.value, kpi.kind)}</strong>
            <p>{kpi.type === "driver" ? "Contribution à l’écart" : "Écart"} {filters.endYear} vs {filters.referenceYear} : {formatValue(kpi.type === "driver" ? kpi.value : kpi.delta, kpi.kind, true)}</p>
          </article>
        ))}
      </section>

      <section className="panel panorama-reading-hub">
        <header className="panorama-hub-toolbar">
          <nav className="panorama-view-switch" aria-label="Lecture du Panorama">
            {PANORAMA_VIEWS.map((item) => <button type="button" key={item.key} className={view === item.key ? "active" : ""} onClick={() => setView(item.key)}><strong>{item.label}</strong><small>{item.detail}</small></button>)}
          </nav>
          <div className="panorama-local-switches">
            <div className="panorama-local-switch"><span>Montant</span><div><button type="button" className={draft.measure === "reimbursed" ? "active" : ""} onClick={() => chooseMeasure("reimbursed")}>Remboursements</button><button type="button" className={draft.measure === "expense" ? "active" : ""} onClick={() => chooseMeasure("expense")}>Dépenses</button></div></div>
            {view === "trend" ? <div className="panorama-local-switch"><span>Lecture</span><div><button type="button" className={trendReading === "total" ? "active" : ""} onClick={() => setTrendReading("total")}>Total</button><button type="button" className={trendReading === "average" ? "active" : ""} onClick={() => setTrendReading("average")}>Moyenne par unité</button></div></div> : null}
          </div>
        </header>

        <div className={`panorama-hub-content ${pending ? "updating" : ""}`}>
          {view === "trend" ? <>
            <div className="panorama-reading-title"><div><span className="section-kicker">Évolution annuelle</span><h2>{trendMetricLabel}</h2><p>Date de soins · {filters.grandPost || "toutes prestations"} · {regionLabel}</p></div><span className="period-chip">{filters.startYear} — {filters.endYear}</span></div>
            {!result && loading ? <div className="skeleton panorama-hub-skeleton" /> : <TrendChart data={result?.annual ?? []} metric={trendMetric} provisionalAfter={result?.reliability.consolidated_through ?? undefined} />}
            {trendReading === "average" ? <div className="panorama-average-note"><span>÷</span><strong>{filters.measure === "expense" ? "Dépenses présentées" : "Remboursements versés"} / volume de la prestation</strong><small>Moyenne de mix lorsque plusieurs prestations sont réunies</small></div> : null}
          </> : null}

          {view === "drivers" ? <>
            <div className="panorama-reading-title"><div><span className="section-kicker">Explication</span><h2>Ce qui explique l’écart · {filters.endYear} vs {filters.referenceYear}</h2><p>{selectedMeasureLabel} · contributions positives et négatives</p></div><span className="panel-badge">Contribution absolue</span></div>
            <div className="driver-list panorama-central-list">
              {!result && loading ? <div className="skeleton panorama-hub-skeleton" /> : result?.drivers.map((driver) => {
                const width = Math.max((Math.abs(driver.delta) / maximumDriver) * 48, 1.5);
                return <div key={driver.label} className="driver-row"><strong title={driver.label}>{driver.label}</strong><div className="driver-axis"><i className="driver-zero" /><span className={driver.delta >= 0 ? "positive" : "negative"} style={driver.delta >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }} /></div><em className={driver.delta >= 0 ? "positive-text" : "negative-text"}>{formatValue(driver.delta, "money", true)}<small>{formatValue(driver.contribution_pct, "percent", true)} de la variation</small></em></div>;
              })}
            </div>
          </> : null}

          {view === "concentration" ? <>
            <div className="panorama-reading-title"><div><span className="section-kicker">Répartition</span><h2>Où se concentrent les montants en {filters.endYear}</h2><p>{selectedMeasureLabel} · par {result?.context.dimension_label.toLowerCase() ?? "poste"}</p></div><span className="panel-badge">Top 5 + autres</span></div>
            <div className="concentration-list panorama-concentration-central">
              {!result && loading ? <div className="skeleton panorama-hub-skeleton" /> : result?.concentration.map((item, index) => <div className="concentration-row" key={item.label}><span>{String(index + 1).padStart(2, "0")}</span><div><strong title={item.label}>{item.label}</strong><i><b style={{ width: `${Math.max(item.share, 1)}%` }} /></i></div><em>{formatValue(item.value, "money")}<small>{formatValue(item.share, "percent")}</small></em></div>)}
            </div>
          </> : null}
        </div>
      </section>
    </div>
  );
}
