/** Population : la cinquième base, et le dénominateur des quatre autres.
 *
 *  **Une seule section, et c'est assumé.** Les quatre autres bases ont un
 *  Panorama et un Comparer ; comparer des tranches d'âge entre elles n'apprend
 *  rien que les lectures ne donnent déjà, et une section vide serait une
 *  promesse non tenue. L'écran est donc un panorama seul, sur le gabarit exact
 *  des autres : filtres dans la coquille, quatre lectures, formes décidées par
 *  le modèle, réserves et exports au même endroit.
 *
 *  La forme signature est la pyramide des âges, avec la silhouette de la
 *  première année de la période superposée en trait fin.
 */

import { useEffect, useMemo, useState } from "react";
import type { ECharts } from "echarts/core";
import { getPopulationMetadata, getPopulationOverview } from "../api";
import { ChartShell } from "../components/ChartShell";
import { PageHero } from "../components/PageHero";
import type { KpiItem } from "../components/KpiStrip";
import { useChartTokens } from "../charts/tokens";
import { useFrenchMap } from "../charts/frenchMap";
import { paletteParams, readPalette } from "../charts/palette";
import { formatKpi } from "../utils";
import {
  POPULATION_READINGS, buildPopulationReadings,
  type PopulationMeasure, type PopulationReadingKey,
} from "../population/model";
import type { PopulationMetadata, PopulationOverview } from "../types";

type Props = {
  routeVersion: number;
  onOpenExtraction: (params: URLSearchParams) => void;
  onOpenMethodology: () => void;
};

export function PopulationPage({ routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();
  const franceMap = useFrenchMap();
  const [mapInstance, setMapInstance] = useState<ECharts | null>(null);

  const [metadata, setMetadata] = useState<PopulationMetadata | null>(null);
  const [overview, setOverview] = useState<PopulationOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState(Number(params.get("year")) || 0);
  const [startYear, setStartYear] = useState(Number(params.get("start_year")) || 0);
  const [region, setRegion] = useState(params.get("region") ?? "99");
  const [age, setAge] = useState(params.get("age") ?? "tsage");
  const [sex, setSex] = useState(params.get("sex") ?? "tous sexes");
  const [measure, setMeasure] = useState<PopulationMeasure>(
    params.get("measure") === "share" ? "share" : "population",
  );
  const [reading, setReading] = useState<PopulationReadingKey>(() => {
    const raw = params.get("view");
    return POPULATION_READINGS.some((item) => item.key === raw) ? raw as PopulationReadingKey : "evolution";
  });
  const [forms, setForms] = useState<Partial<Record<PopulationReadingKey, string>>>(() => {
    const next: Partial<Record<PopulationReadingKey, string>> = {};
    POPULATION_READINGS.forEach((item) => {
      const raw = params.get(`form_${item.key}`);
      if (raw) next[item.key as PopulationReadingKey] = raw;
    });
    return next;
  });

  useEffect(() => {
    const controller = new AbortController();
    getPopulationMetadata(controller.signal)
      .then((next) => {
        setMetadata(next);
        setYear((current) => (next.years.includes(current) ? current : next.default_year));
        setStartYear((current) => (next.years.includes(current) ? current : next.years[0]));
        if (!next.regions.some((item) => item.code === region)) setRegion("99");
        if (!next.ages.some((item) => item.code === age)) setAge("tsage");
        if (!next.sexes.some((item) => item.code === sex)) setSex("tous sexes");
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") { setError(reason.message); setLoading(false); }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!year || !startYear) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getPopulationOverview(
        { year, start_year: startYear, end_year: year, region, age, sex }, controller.signal,
      )
        .then((next) => { if (active) setOverview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [year, startYear, region, age, sex]);

  useEffect(() => {
    if (!year) return;
    const next = new URLSearchParams(window.location.search);
    Object.entries({
      page: "population", year: String(year), start_year: String(startYear),
      region, age, sex, measure, view: reading, ...paletteParams(readPalette()),
    }).forEach(([key, value]) => next.set(key, value));
    if (readPalette() !== "blue") next.delete("palette");
    Object.entries(forms).forEach(([key, value]) => { if (value) next.set(`form_${key}`, value); });
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [year, startYear, region, age, sex, measure, reading, forms]);

  const readingInput = useMemo(() => ({
    overview, measure, mapReady: franceMap.ready, mapError: franceMap.error, forms,
  }), [overview, measure, franceMap.ready, franceMap.error, forms]);
  const readings = useMemo(
    () => buildPopulationReadings({ ...readingInput, tokens }), [readingInput, tokens]);
  const current = readings.find((item) => item.key === reading) ?? readings[0];

  // Le clic sur la carte ouvre la région, comme sur les autres bases.
  useEffect(() => {
    if (!mapInstance) return;
    const handler = (event: any) => {
      const code = String(event.name ?? "");
      if (code) setRegion(code === region ? "99" : code);
    };
    mapInstance.on("click", handler);
    return () => { mapInstance.off("click", handler); };
  }, [mapInstance, region]);

  if (!metadata) {
    return (
      <div className="content-wrap csp-page">
        {error
          ? <div className="analysis-error"><strong>La base Population n’a pas pu être chargée</strong><span>{error}</span></div>
          : <div className="page-loader"><div className="skeleton" /></div>}
      </div>
    );
  }

  const kpiItems: KpiItem[] = (overview?.kpis ?? []).map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    value: formatKpi(kpi.value, kpi.kind, kpi.key === "change"),
    detail: kpi.detail,
  }));
  const scope = overview
    ? `${overview.context.region_label} · ${overview.context.age_label} · ${overview.context.sex_label} · 1er janvier ${year}`
    : "";
  const sourceLine = `Source · ${metadata.source} · ${metadata.scope}`;
  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    page: "extraction", source: "population",
    start_year: String(startYear), end_year: String(year), region, age, sex,
  }));

  return (
    <div className="content-wrap csp-page">
      <PageHero
        variant="csp-hero"
        eyebrowLabel="Estimations Insee"
        eyebrowDetail="Populations"
        title="Population"
        mission="La population résidente par région, sexe et âge, de 1975 à aujourd’hui — et le dénominateur des mesures par habitant des autres bases."
        action={<button type="button" className="method-link" onClick={onOpenMethodology}>Données &amp; méthode →</button>}
      />

      {/* Le périmètre vit dans la coquille, comme sur CSP et Mortalité. */}
      <section className="panel csp-context">
        <div className="csp-population-filters">
          <label><span>Depuis</span>
            <select value={startYear} onChange={(event) => setStartYear(Number(event.target.value))}>
              {metadata.years.filter((item) => item <= year).map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label><span>Millésime</span>
            <select value={year} onChange={(event) => {
              const next = Number(event.target.value);
              setYear(next);
              if (startYear > next) setStartYear(metadata.years[0]);
            }}>
              {metadata.years.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label><span>Territoire</span>
            <select value={region} onChange={(event) => setRegion(event.target.value)}>
              {metadata.regions.map((item) => (
                <option value={item.code} key={item.code}>
                  {item.label}{item.depuis > metadata.years[0] ? ` · depuis ${item.depuis}` : ""}
                </option>
              ))}
            </select>
          </label>
          <label><span>Âge</span>
            <select value={age} onChange={(event) => setAge(event.target.value)}>
              {metadata.ages.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label><span>Sexe</span>
            <select value={sex} onChange={(event) => setSex(event.target.value)}>
              {metadata.sexes.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
            </select>
          </label>
          <span className="csp-scope-chip">{year} · population au 1er janvier</span>
        </div>
        <div className={`pathology-loading-track ${loading ? "active" : ""}`}><span /></div>
      </section>

      {error ? <div className="analysis-error"><strong>La fiche Population n’a pas pu être calculée</strong><span>{error}</span></div> : null}

      {current ? (
        <ChartShell
          kicker={`Population · ${overview?.context.region_label ?? ""}`}
          title={current.title}
          readings={POPULATION_READINGS}
          reading={reading}
          onReading={(key) => setReading(key as PopulationReadingKey)}
          forms={current.forms}
          form={current.form}
          onForm={(key) => setForms((value) => ({ ...value, [reading]: key }))}
          question={current.question}
          highlights={kpiItems}
          headerActions={
            <div className="pathology-toggle" aria-label="Mesure">
              <button type="button" className={measure === "population" ? "active" : ""}
                onClick={() => setMeasure("population")}>Effectif</button>
              <button type="button" className={measure === "share" ? "active" : ""}
                onClick={() => setMeasure("share")}>Part</button>
            </div>
          }
          height={current.height}
          option={current.option}
          exportOption={(palette) => buildPopulationReadings({ ...readingInput, tokens: palette })
            .find((item) => item.key === reading)?.option ?? current.option!}
          empty={current.empty}
          loading={loading}
          ariaLabel={current.ariaLabel}
          onInstance={setMapInstance}
          legend={current.legend}
          tableColumns={current.table.columns}
          tableRows={current.table.rows}
          caveats={current.caveats}
          sourceLine={sourceLine}
          filenamePrefix="population"
          scope={scope}
          onExtract={openExtraction}
          className="csp-stage"
        />
      ) : null}

      <footer className="pathology-footer csp-footer">
        <span>{sourceLine}</span>
        <div><span>Rétropolée sur les 13 régions actuelles depuis 1975</span></div>
      </footer>
    </div>
  );
}

export default PopulationPage;
