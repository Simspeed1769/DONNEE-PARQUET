import { useEffect, useMemo, useState } from "react";
import { getMortalityMetadata, getMortalityOverview } from "../api";
import { SearchableCauseSelect } from "../components/SearchableCauseSelect";
import { PageHero } from "../components/PageHero";
import { KpiStrip, type KpiItem } from "../components/KpiStrip";
import { ChartShell } from "../components/ChartShell";
import { useChartTokens, type ChartTokens } from "../charts/tokens";
import { ageProfileOption, evolutionOption, sexProfileOption, topCausesOption } from "../mortality/charts";
import { mortalityCaveats } from "../mortality/model";
import { formatValue } from "../utils";
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

  /* Les arguments de chaque lecture vivent à part de la palette : l'écran les
     assemble avec le thème courant, l'export les réassemble en clair. */
  const evolutionInput = useMemo(() => {
    const isShare = evolutionMeasure === "share";
    return {
      years: overview?.annual.map((item) => item.year) ?? [],
      values: overview?.annual.map((item) => (isShare ? item.share : item.deaths)) ?? [],
      kind: isShare ? "percent" : "quantity",
    };
  }, [overview, evolutionMeasure]);
  const evolution = useMemo(() => evolutionOption({ ...evolutionInput, tokens }), [evolutionInput, tokens]);

  const topCausesHeight = Math.max(360, (overview?.top_causes.length ?? 0) * 29 + 95);
  const topCausesInput = useMemo(() => ({
    rows: (overview?.top_causes ?? []).map((item) => ({ key: item.code, label: item.label, value: item.deaths })),
    kind: "quantity",
  }), [overview]);
  const sexProfileInput = useMemo(() => ({
    rows: (overview?.profiles.sex ?? []).map((item) => ({ key: item.code, label: item.label, value: item.deaths })),
    kind: "quantity",
  }), [overview]);
  const ageProfileInput = useMemo(() => ({
    rows: (overview?.profiles.age ?? []).map((item) => ({ key: item.code, label: item.label, value: item.deaths })),
    kind: "quantity",
  }), [overview]);

  const topChart = useMemo(() => topCausesOption({ ...topCausesInput, tokens }), [topCausesInput, tokens]);
  const profileCharts = useMemo(() => ({
    sex: sexProfileOption({ ...sexProfileInput, tokens }),
    age: ageProfileOption({ ...ageProfileInput, tokens }),
  }), [sexProfileInput, ageProfileInput, tokens]);

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
    ? { title: "Principales causes de décès", note: `${overview?.context.year ?? ""} · ${selectedPopulationLabel} · causes principales`, chart: topChart, height: topCausesHeight, readingKey: "causes" as const, build: (t: ChartTokens) => topCausesOption({ ...topCausesInput, tokens: t }) }
    : complementaryView === "sex"
      ? { title: "Femmes / hommes", note: `${overview?.context.cause_label ?? ""} · ${overview?.context.year ?? ""} · effectifs publiés`, chart: profileCharts.sex, height: 290, readingKey: "sex" as const, build: (t: ChartTokens) => sexProfileOption({ ...sexProfileInput, tokens: t }) }
      : { title: "Tranches d’âge", note: `${overview?.context.cause_label ?? ""} · ${overview?.context.year ?? ""} · effectifs publiés`, chart: profileCharts.age, height: 310, readingKey: "age" as const, build: (t: ChartTokens) => ageProfileOption({ ...ageProfileInput, tokens: t }) };

  const evolutionTable = useMemo(() => ({
    columns: ["Année", evolutionMeasure === "share" ? "Part" : "Décès"],
    rows: (overview?.annual ?? []).map((item) => [String(item.year), formatValue(evolutionMeasure === "share" ? item.share : item.deaths, evolutionMeasure === "share" ? "percent" : "quantity")]),
  }), [overview, evolutionMeasure]);

  const complementaryTable = useMemo(() => {
    const rows = complementaryView === "causes" ? (overview?.top_causes ?? []).map((item) => [item.label, formatValue(item.deaths, "quantity")])
      : complementaryView === "sex" ? (overview?.profiles.sex ?? []).map((item) => [item.label, formatValue(item.deaths, "quantity")])
        : (overview?.profiles.age ?? []).map((item) => [item.label, formatValue(item.deaths, "quantity")]);
    return { columns: [complementaryView === "causes" ? "Cause" : complementaryView === "sex" ? "Sexe" : "Tranche d’âge", "Décès"], rows };
  }, [overview, complementaryView]);

  const kpiItems: KpiItem[] = visibleKpis.map((kpi) => ({
    key: kpi.key, label: kpi.label, value: formatKpi(kpi.value, kpi.kind), detail: kpi.detail,
  }));

  const sourceLine = `Source · ${metadata?.source} · ${metadata?.scope}`;

  if (!metadata && loading) return <div className="content-wrap mortality-page"><div className="page-loader"><div className="skeleton" /></div></div>;
  return <div className="content-wrap mortality-page">
    <PageHero
      variant="mortality-hero"
      eyebrowLabel="CépiDc · Inserm"
      eyebrowDetail="Source nationale"
      title="Mortalité"
      mission="Lire les décès publiés par cause, dans le temps et selon les grands profils de population."
      action={<span className="semantic-badge">France · Métropole et DROM</span>}
    />
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
      <KpiStrip items={kpiItems} className="mortality-kpis" />
      <section className="mortality-chart-stack">
        <ChartShell
          kicker="ÉVOLUTION"
          title={evolutionMeasure === "share" ? "Part de la cause parmi les décès" : "Nombre de décès"}
          headerActions={<div className="pathology-toggle"><button type="button" className={evolutionMeasure === "deaths" ? "active" : ""} onClick={() => setEvolutionMeasure("deaths")}>Nombre</button><button type="button" className={evolutionMeasure === "share" ? "active" : ""} onClick={() => setEvolutionMeasure("share")}>Part</button></div>}
          height={365}
          option={evolution}
          exportOption={(t) => evolutionOption({ ...evolutionInput, tokens: t })}
          loading={loading}
          ariaLabel={`${evolutionMeasure === "share" ? "Part de la cause parmi les décès" : "Nombre de décès"} · ${overview.context.cause_label}`}
          tableColumns={evolutionTable.columns}
          tableRows={evolutionTable.rows}
          caveats={mortalityCaveats("evolution")}
          sourceLine={sourceLine}
          filenamePrefix="mortalite"
          scope={`${overview.context.cause_label} · ${selectedPopulationLabel} · effectifs bruts, sans taux de mortalité`}
          onExtract={openExtraction}
          className="mortality-evolution-card"
        />
        <ChartShell
          kicker="AUTRE LECTURE"
          title={complementary.title}
          headerActions={<div className="mortality-view-choice" aria-label="Vue complémentaire"><button type="button" className={complementaryView === "causes" ? "active" : ""} onClick={() => setComplementaryView("causes")}>Causes</button><button type="button" className={complementaryView === "sex" ? "active" : ""} onClick={() => setComplementaryView("sex")}>Sexe</button><button type="button" className={complementaryView === "age" ? "active" : ""} onClick={() => setComplementaryView("age")}>Âge</button></div>}
          height={complementary.height}
          option={complementary.chart}
          exportOption={complementary.build}
          loading={loading}
          ariaLabel={complementary.title}
          tableColumns={complementaryTable.columns}
          tableRows={complementaryTable.rows}
          caveats={mortalityCaveats(complementary.readingKey)}
          sourceLine={sourceLine}
          filenamePrefix="mortalite"
          scope={complementary.note}
          onExtract={openExtraction}
          className="mortality-complement-card"
        />
      </section>
      <div className="mortality-quality-note"><strong>À garder en tête</strong><span>Source nationale sans région ni âge fin. Les cellules vides restent non disponibles ou non applicables ; elles ne sont pas interprétées comme zéro.</span><button type="button" onClick={onOpenMethodology}>Méthode →</button></div>
      <footer className="pathology-footer csp-footer"><span>{sourceLine}</span></footer>
    </> : null}
  </div>;
}

export default MortalityPage;
