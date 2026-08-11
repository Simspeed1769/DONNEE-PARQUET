import { useEffect, useMemo, useState } from "react";
import { getMortalityMetadata, getMortalityOverview } from "../api";
import { SearchableCauseSelect } from "../components/SearchableCauseSelect";
import { PageHero } from "../components/PageHero";
import type { KpiItem } from "../components/KpiStrip";
import { ChartShell } from "../components/ChartShell";
import { paletteParams, readPalette } from "../charts/palette";
import { formatKpi } from "../utils";
import { useChartTokens, type ChartTokens } from "../charts/tokens";
import { MORTALITY_READINGS, buildMortalityReadings, type MortalityReadingKey } from "../mortality/model";
import type { MortalityMetadata, MortalityOverview } from "../types";

type EvolutionMeasure = "deaths" | "share";
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

export function MortalityPage({ routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const initial = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const [metadata, setMetadata] = useState<MortalityMetadata | null>(null);
  const [cause, setCause] = useState(initial.get("cause") ?? "");
  const [population, setPopulation] = useState(initial.get("population") ?? "ensemble");
  const [year, setYear] = useState(Number(initial.get("year")) || 0);
  const [measure, setMeasure] = useState<EvolutionMeasure>(initial.get("measure") === "share" ? "share" : "deaths");
  const [reading, setReading] = useState<MortalityReadingKey>(() => {
    const raw = initial.get("view");
    return MORTALITY_READINGS.some((item) => item.key === raw) ? raw as MortalityReadingKey : "evolution";
  });
  const [forms, setForms] = useState<Partial<Record<MortalityReadingKey, string>>>(() => {
    const next: Partial<Record<MortalityReadingKey, string>> = {};
    MORTALITY_READINGS.forEach((item) => {
      const raw = initial.get(`form_${item.key}`);
      if (raw) next[item.key as MortalityReadingKey] = raw;
    });
    return next;
  });
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
      if (!next.populations.some((item) => item.code === population)) setPopulation("ensemble");
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
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [cause, population, year]);

  // L'état complet vit dans l'adresse : « Copier le lien » restitue l'écran.
  useEffect(() => {
    if (!cause || !year) return;
    const params = new URLSearchParams({
      page: "mortality", cause, population, year: String(year), measure, view: reading,
      ...paletteParams(readPalette()),
    });
    Object.entries(forms).forEach(([key, value]) => { if (value) params.set(`form_${key}`, value); });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [cause, population, year, measure, reading, forms]);

  const populationLabel = metadata?.populations.find((item) => item.code === population)?.label ?? "Ensemble";
  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    source: "mortality", cause, population,
    start_year: String(metadata?.years[0] ?? year), end_year: String(year),
    dimensions: "year,cause,population", measures: "deaths,share",
  }));

  const readingInput = useMemo(() => ({ overview, measure, populationLabel, forms }), [overview, measure, populationLabel, forms]);
  const readings = useMemo(() => buildMortalityReadings({ ...readingInput, tokens }), [readingInput, tokens]);
  const current = readings.find((item) => item.key === reading) ?? readings[0];

  const visibleKpis = useMemo(() => {
    if (!overview) return [];
    const isAllCauses = overview.context.cause_label.toLocaleLowerCase("fr-FR") === "toutes causes";
    return overview.kpis
      .filter((kpi) => !(isAllCauses && (kpi.key === "share" || kpi.key === "total")))
      .map((kpi) => ({
        ...kpi,
        label: kpi.key === "deaths" ? (isAllCauses ? "Décès publiés" : "Décès pour cette cause")
          : kpi.key === "share" ? "Part parmi tous les décès"
            : kpi.key === "total" ? "Décès toutes causes" : kpi.label,
      }));
  }, [overview]);

  const kpiItems: KpiItem[] = visibleKpis.map((kpi) => ({
    key: kpi.key, label: kpi.label, detail: kpi.detail,
    // Seule l'évolution est une variation : elle seule porte un signe.
    value: formatKpi(kpi.value, kpi.kind, kpi.key === "evolution"),
  }));

  const sourceLine = `Source · ${metadata?.source} · ${metadata?.scope}`;
  const scope = `${overview?.context.cause_label ?? ""} · ${populationLabel} · ${overview?.context.year ?? ""} · effectifs bruts, sans taux`;

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
    {overview && current ? <>
      <section className="mortality-title-line"><div><span>LECTURE NATIONALE</span><h2>{overview.context.cause_label}</h2><small>{populationLabel} · {overview.context.year}</small></div><div className="mortality-title-actions"><span className="mortality-scope-chip">Effectifs bruts · sans taux</span><button type="button" onClick={openExtraction}>Extraire</button><button type="button" onClick={onOpenMethodology}>Voir les limites →</button></div></section>

      <ChartShell
        kicker={`Mortalité · ${populationLabel.toLowerCase()}`}
        title={current.title}
        readings={MORTALITY_READINGS}
        reading={reading}
        onReading={(key) => setReading(key as MortalityReadingKey)}
        forms={current.forms}
        form={current.form}
        onForm={(key) => setForms((value) => ({ ...value, [reading]: key }))}
        question={current.question}
        highlights={kpiItems}
        headerActions={<div className="pathology-toggle" aria-label="Mesure"><button type="button" className={measure === "deaths" ? "active" : ""} onClick={() => setMeasure("deaths")}>Nombre</button><button type="button" className={measure === "share" ? "active" : ""} onClick={() => setMeasure("share")}>Part</button></div>}
        height={current.height}
        option={current.option}
        exportOption={(t) => buildMortalityReadings({ ...readingInput, tokens: t })
          .find((item) => item.key === current.key)?.option ?? current.option!}
        empty={current.empty}
        loading={loading}
        ariaLabel={current.ariaLabel}
        tableColumns={current.table.columns}
        tableRows={current.table.rows}
        caveats={current.caveats}
        sourceLine={sourceLine}
        filenamePrefix="mortalite"
        scope={scope}
        onExtract={openExtraction}
        className="mortality-stage"
      />

      <div className="mortality-quality-note"><strong>À garder en tête</strong><span>Source nationale sans région ni âge fin. Les cellules vides restent non disponibles ou non applicables ; elles ne sont pas interprétées comme zéro.</span><button type="button" onClick={onOpenMethodology}>Méthode →</button></div>
      <footer className="pathology-footer csp-footer"><span>{sourceLine}</span></footer>
    </> : null}
  </div>;
}

export default MortalityPage;
