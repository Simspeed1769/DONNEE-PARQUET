import { useEffect, useMemo, useState } from "react";
import { getMortalityMetadata, getMortalityOverview } from "../api";
import { SearchableCauseSelect } from "../components/SearchableCauseSelect";
import { EChart } from "../charts/EChart";
import { useChartTokens } from "../charts/tokens";
import { ageProfileOption, evolutionOption, sexProfileOption, topCausesOption } from "../mortality/charts";
import type { MortalityMetadata, MortalityOverview } from "../types";

type EvolutionMeasure = "deaths" | "share";
type ComplementaryView = "causes" | "sex" | "age";
type Props = { routeVersion: number; onOpenExtraction: (params: URLSearchParams) => void; onOpenMethodology: () => void };

function formatNumber(value: number | null, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value);
}

function formatPercent(value: number | null, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value !== 0 && Math.abs(value) < 0.1) return "<0,1 %";
  return `${formatNumber(value, digits)} %`;
}

function formatKpi(value: number | null, kind: string): string {
  return kind === "quantity" ? formatNumber(value) : formatPercent(value, 1);
}

export function MortalityPage({ routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const initial = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const initialPopulation = initial.get("population") ?? "ensemble";
  const [metadata, setMetadata] = useState<MortalityMetadata | null>(null);
  const [cause, setCause] = useState(initial.get("cause") ?? "");
  const [population, setPopulation] = useState(initialPopulation);
  const [year, setYear] = useState(Number(initial.get("year")) || 0);
  const [evolutionMeasure, setEvolutionMeasure] = useState<EvolutionMeasure>(initial.get("measure") === "share" ? "share" : "deaths");
  const initialView = initial.get("view");
  const [complementaryView, setComplementaryView] = useState<ComplementaryView>(
    initialView === "sex" || initialView === "age" ? initialView : "causes",
  );
  const [overview, setOverview] = useState<MortalityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokens = useChartTokens();

  useEffect(() => {
    const controller = new AbortController();
    getMortalityMetadata(controller.signal).then((next) => {
      setMetadata(next);
      const preferred = next.causes.find((item) => item.label === "Toutes causes") ?? next.causes[0];
      if (!cause || !next.causes.some((item) => item.code === cause)) setCause(preferred?.code ?? "");
      if (!year || !next.years.includes(year)) setYear(next.default_year);
      if (!next.populations.some((item) => item.code === population)) {
        setPopulation("ensemble");
      }
    }).catch((reason: Error) => {
      if (reason.name !== "AbortError") { setError(reason.message); setLoading(false); }
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!cause || !year) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getMortalityOverview({ cause, population, year }, controller.signal)
        .then((next) => { if (active) setOverview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    const params = new URLSearchParams({ page: "mortality", cause, population, year: String(year), measure: evolutionMeasure, view: complementaryView });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [cause, population, year]);

  useEffect(() => {
    if (!cause || !year) return;
    const params = new URLSearchParams(window.location.search);
    params.set("measure", evolutionMeasure);
    params.set("view", complementaryView);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [cause, population, year, evolutionMeasure, complementaryView]);

  const selectedPopulationLabel = metadata?.populations.find((item) => item.code === population)?.label ?? "Ensemble";
  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    source: "mortality", cause, population,
    start_year: String(metadata?.years[0] ?? year), end_year: String(year),
    dimensions: "year,cause,population", measures: "deaths,share",
  }));

  const evolution = useMemo(() => {
    const isShare = evolutionMeasure === "share";
    return evolutionOption({
      years: overview?.annual.map((item) => item.year) ?? [],
      values: overview?.annual.map((item) => (isShare ? item.share : item.deaths)) ?? [],
      kind: isShare ? "percent" : "quantity",
      tokens,
    });
  }, [overview, evolutionMeasure, tokens]);

  const topCausesHeight = Math.max(360, (overview?.top_causes.length ?? 0) * 29 + 95);
  const topChart = useMemo(() => {
    const rows = (overview?.top_causes ?? []).map((item) => ({ key: item.code, label: item.label, value: item.deaths }));
    return topCausesOption({ rows, kind: "quantity", tokens });
  }, [overview, tokens]);

  const profileCharts = useMemo(() => {
    const sexRows = (overview?.profiles.sex ?? []).map((item) => ({ key: item.code, label: item.label, value: item.deaths }));
    const ageRows = (overview?.profiles.age ?? []).map((item) => ({ key: item.code, label: item.label, value: item.deaths }));
    return {
      sex: sexProfileOption({ rows: sexRows, kind: "quantity", tokens }),
      age: ageProfileOption({ rows: ageRows, kind: "quantity", tokens }),
    };
  }, [overview, tokens]);

  const visibleKpis = useMemo(() => {
    if (!overview) return [];
    const isAllCauses = overview.context.cause_label.toLocaleLowerCase("fr-FR") === "toutes causes";
    return overview.kpis
      .filter((kpi) => !(isAllCauses && (kpi.key === "share" || kpi.key === "total")))
      .map((kpi) => ({
        ...kpi,
        label: kpi.key === "deaths" ? (isAllCauses ? "Décès publiés" : "Décès pour cette cause")
          : kpi.key === "share" ? "Part parmi tous les décès"
            : kpi.key === "total" ? "Décès toutes causes"
              : kpi.label,
      }));
  }, [overview]);

  const complementary = complementaryView === "causes"
    ? { title: "Principales causes de décès", note: `${overview?.context.year ?? ""} · ${selectedPopulationLabel} · causes principales`, chart: topChart, height: topCausesHeight }
    : complementaryView === "sex"
      ? { title: "Femmes / hommes", note: `${overview?.context.cause_label ?? ""} · ${overview?.context.year ?? ""} · effectifs publiés`, chart: profileCharts.sex, height: 290 }
      : { title: "Tranches d’âge", note: `${overview?.context.cause_label ?? ""} · ${overview?.context.year ?? ""} · effectifs publiés`, chart: profileCharts.age, height: 310 };

  if (!metadata && loading) return <div className="content-wrap mortality-page"><div className="page-loader"><div className="skeleton" /></div></div>;
  return <div className="content-wrap mortality-page">
    <section className="hero mortality-hero"><div><div className="eyebrow"><span>CépiDc · Inserm</span> Source nationale</div><h1>Mortalité</h1><p>Lire les décès publiés par cause, dans le temps et selon les grands profils de population.</p></div><span className="semantic-badge">France · Métropole et DROM</span></section>
    <section className="panel mortality-context">
      <div className="mortality-filter-grid">
        <label className="mortality-cause-filter"><span>Cause de décès</span><SearchableCauseSelect options={metadata?.causes ?? []} value={cause} onChange={setCause} /></label>
        <label className="mortality-population-filter"><span>Population</span><select value={population} onChange={(event) => setPopulation(event.target.value)}>{metadata?.populations.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
        <label className="mortality-year-filter"><span>Millésime</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{metadata?.years.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      </div>
      <div className="pathology-loading-track"><span className={loading ? "active" : ""} /></div>
    </section>
    {error ? <div className="analysis-error"><strong>La fiche Mortalité n’a pas pu être calculée</strong><span>{error}</span></div> : null}
    {overview ? <>
      <section className="mortality-title-line"><div><span>LECTURE NATIONALE</span><h2>{overview.context.cause_label}</h2><small>{selectedPopulationLabel} · {overview.context.year}</small></div><div className="mortality-title-actions"><span className="mortality-scope-chip">Effectifs bruts · sans taux</span><button type="button" onClick={openExtraction}>Extraire</button><button type="button" onClick={onOpenMethodology}>Voir les limites →</button></div></section>
      <section className="pathology-kpis mortality-kpis">{visibleKpis.map((kpi) => <article className="panel" key={kpi.key}><span>{kpi.label}</span><strong>{formatKpi(kpi.value, kpi.kind)}</strong><small>{kpi.detail}</small></article>)}</section>
      <section className="mortality-chart-stack">
        <article className="panel pathology-chart mortality-evolution-card"><header><div><span className="section-kicker">ÉVOLUTION</span><h3>{evolutionMeasure === "share" ? "Part de la cause parmi les décès" : "Nombre de décès"}</h3><p>{overview.context.cause_label} · {selectedPopulationLabel} · effectifs bruts, sans taux de mortalité</p></div><div className="pathology-toggle"><button type="button" className={evolutionMeasure === "deaths" ? "active" : ""} onClick={() => setEvolutionMeasure("deaths")}>Nombre</button><button type="button" className={evolutionMeasure === "share" ? "active" : ""} onClick={() => setEvolutionMeasure("share")}>Part</button></div></header><EChart option={evolution} height={365} stale={loading} ariaLabel={`${evolutionMeasure === "share" ? "Part de la cause parmi les décès" : "Nombre de décès"} · ${overview.context.cause_label}`} /></article>
        <article className="panel pathology-chart mortality-complement-card">
          <header><div><span className="section-kicker">AUTRE LECTURE</span><h3>{complementary.title}</h3><p>{complementary.note}</p></div><div className="mortality-view-choice" aria-label="Vue complémentaire"><button type="button" className={complementaryView === "causes" ? "active" : ""} onClick={() => setComplementaryView("causes")}>Causes</button><button type="button" className={complementaryView === "sex" ? "active" : ""} onClick={() => setComplementaryView("sex")}>Sexe</button><button type="button" className={complementaryView === "age" ? "active" : ""} onClick={() => setComplementaryView("age")}>Âge</button></div></header>
          <EChart option={complementary.chart} height={complementary.height} stale={loading} ariaLabel={complementary.title} />
        </article>
      </section>
      <div className="mortality-quality-note"><strong>À garder en tête</strong><span>Source nationale sans région ni âge fin. Les cellules vides restent non disponibles ou non applicables ; elles ne sont pas interprétées comme zéro.</span><button type="button" onClick={onOpenMethodology}>Méthode →</button></div>
      <footer className="pathology-footer csp-footer"><span>Source · {metadata?.source} · {metadata?.scope}</span></footer>
    </> : null}
  </div>;
}

export default MortalityPage;
