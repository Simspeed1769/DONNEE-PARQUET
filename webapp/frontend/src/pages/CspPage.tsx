import { useEffect, useMemo, useState } from "react";
import type { Data, Layout } from "plotly.js";
import PlotlyBasic from "plotly.js-basic-dist-min";
import PlotlyGeo from "plotly.js/dist/plotly-geo.min.js";
import createPlotlyComponent from "react-plotly.js/factory";
import { getCspGeography, getCspMetadata, getCspOverview } from "../api";
import type { CspMetadata, CspOverview } from "../types";

const Plot = createPlotlyComponent(PlotlyBasic);
const GeoPlot = createPlotlyComponent(PlotlyGeo);
const RED = "#ec4c53";
const NAVY = "#3b3633";
const PALE = "#c8cfda";

type Props = { routeVersion: number; onOpenExtraction: (params: URLSearchParams) => void; onOpenMethodology: () => void };
type MapMeasure = "share" | "effectif";
type TrendMeasure = "share" | "effectif";

function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits }).format(value);
}

function formatKpi(value: number | null, kind: string): string {
  if (kind === "percent") return `${formatNumber(value, 1)} %`;
  return formatNumber(value, 0);
}

function chartLayout(height: number): Partial<Layout> {
  return {
    height,
    margin: { l: 68, r: 24, t: 20, b: 64 },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: "Inter, Arial, sans-serif", color: "#514b47", size: 12 },
    hoverlabel: { bgcolor: "#fff", bordercolor: RED, font: { color: "#514b47" } },
  };
}

export function CspPage({ routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const initial = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const [metadata, setMetadata] = useState<CspMetadata | null>(null);
  const [geography, setGeography] = useState<Record<string, unknown> | null>(null);
  const [year, setYear] = useState(Number(initial.get("year")) || 2023);
  const [level, setLevel] = useState<"groupe_6" | "categorie_29">(initial.get("level") === "categorie_29" ? "categorie_29" : "groupe_6");
  const [cspCode, setCspCode] = useState(initial.get("csp") ?? "3");
  const [region, setRegion] = useState(initial.get("region") ?? "FR");
  const [age, setAge] = useState(initial.get("age") ?? "all");
  const [sex, setSex] = useState(Number(initial.get("sex")) || 0);
  const [mapMeasure, setMapMeasure] = useState<MapMeasure>("share");
  const [trendMeasure, setTrendMeasure] = useState<TrendMeasure>("share");
  const [overview, setOverview] = useState<CspOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getCspMetadata(controller.signal)
      .then((next) => {
        setMetadata(next);
        setYear(next.years.includes(year) ? year : next.default_year);
        const selectedLevel = next.levels.find((item) => item.key === level) ?? next.levels[0];
        const fallback = selectedLevel.options.find((item) => item.code === (level === "groupe_6" ? "3" : "38")) ?? selectedLevel.options[0];
        if (!selectedLevel.options.some((item) => item.code === cspCode)) setCspCode(fallback.code);
        if (!next.regions.some((item) => item.code === region)) setRegion("FR");
        if (!next.ages.some((item) => item.code === age)) setAge("all");
        if (!next.sexes.some((item) => item.code === sex)) setSex(0);
        return getCspGeography(next.geography_url, controller.signal);
      })
      .then(setGeography)
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") {
          setError(reason.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  const selectedLevel = metadata?.levels.find((item) => item.key === level) ?? null;
  const options = selectedLevel?.options ?? [];

  const changeLevel = (next: "groupe_6" | "categorie_29") => {
    setLevel(next);
    const nextLevel = metadata?.levels.find((item) => item.key === next);
    const preferred = nextLevel?.options.find((item) => item.code === (next === "groupe_6" ? "3" : "38")) ?? nextLevel?.options[0];
    if (preferred) setCspCode(preferred.code);
  };

  useEffect(() => {
    if (!metadata || !cspCode) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getCspOverview({ year, level, csp_code: cspCode, region, age, sex }, controller.signal)
        .then((next) => { if (active) setOverview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 240);
    const params = new URLSearchParams({ page: "csp", year: String(year), level, csp: cspCode, region, age, sex: String(sex) });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [metadata, year, level, cspCode, region, age, sex]);

  const map = useMemo(() => {
    const mainland = (overview?.territories ?? []).filter((item) => Number(item.code) >= 11);
    const z = mainland.map((item) => mapMeasure === "share" ? item.share : item.effectif);
    const data: Data[] = geography ? [{
      type: "choropleth",
      geojson: geography,
      featureidkey: "properties.code",
      locations: mainland.map((item) => item.code),
      z,
      customdata: mainland.map((item) => [item.label, item.share, item.effectif]),
      colorscale: [[0, "#f7e9ea"], [.25, "#f1bfc2"], [.55, "#ec7479"], [1, "#a92531"]],
      marker: { line: { color: "#ffffff", width: 1.4 } },
      colorbar: {
        title: { text: mapMeasure === "share" ? "%" : "Effectif" },
        thickness: 11,
        len: .68,
        outlinewidth: 0,
        tickformat: mapMeasure === "share" ? ".1f" : ".2s",
      },
      hovertemplate: mapMeasure === "share"
        ? "<b>%{customdata[0]}</b><br>Part : %{customdata[1]:.2f} %<extra></extra>"
        : "<b>%{customdata[0]}</b><br>Effectif pondéré : %{customdata[2]:,.0f}<br>Part : %{customdata[1]:.2f} %<extra></extra>",
    } as Data] : [];
    const layout = {
      height: 520,
      margin: { l: 0, r: 0, t: 4, b: 0 },
      paper_bgcolor: "rgba(0,0,0,0)",
      geo: {
        fitbounds: "locations",
        visible: false,
        bgcolor: "rgba(0,0,0,0)",
        projection: { type: "mercator" },
      },
    } satisfies Partial<Layout>;
    return { data, layout };
  }, [overview, geography, mapMeasure]);

  const ageSex = useMemo(() => {
    const ages = [...new Set(overview?.age_sex.map((item) => item.age) ?? [])];
    const visibleSexes = sex === 0 ? [2, 1] : [sex];
    const data: Data[] = visibleSexes.map((sexCode) => ({
      type: "bar",
      name: sexCode === 2 ? "Femmes" : "Hommes",
      x: ages,
      y: ages.map((ageLabel) => overview?.age_sex.find((item) => item.age === ageLabel && item.sex_code === sexCode)?.share ?? null),
      customdata: ages.map((ageLabel) => overview?.age_sex.find((item) => item.age === ageLabel && item.sex_code === sexCode)?.effectif ?? null),
      marker: { color: sexCode === 2 ? RED : NAVY, line: { color: "#fff", width: .6 } },
      hovertemplate: `<b>${sexCode === 2 ? "Femmes" : "Hommes"}</b><br>%{x}<br>Part : %{y:.2f} %<br>Effectif : %{customdata:,.0f}<extra></extra>`,
    } as Data));
    const layout = {
      ...chartLayout(430),
      margin: { l: 64, r: 22, t: 20, b: 96 },
      xaxis: { gridcolor: "#edf0f4", tickangle: -32, type: "category" as const },
      yaxis: { gridcolor: "#edf0f4", rangemode: "tozero" as const, ticksuffix: " %", tickformat: ".1f", title: { text: "Part dans la tranche" } },
      legend: { orientation: "h" as const, x: .5, xanchor: "center" as const, y: 1.12 },
      barmode: "group" as const,
      bargap: .22,
    } satisfies Partial<Layout>;
    return { data, layout };
  }, [overview, sex]);

  // L'API renvoie une série sur tous les millésimes disponibles pour le
  // périmètre courant. Le fallback garde la fiche utilisable pendant le
  // déploiement progressif du nouvel endpoint (ou avec une base mono-année).
  const annual = useMemo(() => {
    if (!overview) return [];
    const rows = (overview.annual ?? overview.evolution ?? []).filter((item) => Number.isFinite(Number(item.year)));
    if (rows.length) return [...rows].sort((a, b) => a.year - b.year);
    const selected = overview.kpis.find((item) => item.key === "selected")?.value ?? null;
    const share = overview.kpis.find((item) => item.key === "share")?.value ?? null;
    return [{ year: overview.context.year, effectif: selected, share }];
  }, [overview]);

  const evolution = useMemo(() => {
    const values = annual.map((item) => trendMeasure === "share" ? item.share : item.effectif);
    const isShare = trendMeasure === "share";
    const data: Data[] = [{
      type: "scatter",
      mode: "lines+markers",
      name: isShare ? "Part de la CSP" : "Effectif de la CSP",
      x: annual.map((item) => item.year),
      y: values,
      connectgaps: false,
      line: { color: RED, width: 3, shape: "spline" },
      marker: { color: RED, size: 7, line: { color: "#fff", width: 1.5 } },
      hovertemplate: isShare
        ? "<b>%{x}</b><br>Part : %{y:.2f} %<extra></extra>"
        : "<b>%{x}</b><br>Effectif : %{y:,.0f}<extra></extra>",
    } as Data];
    const years = annual.map((item) => item.year);
    const minYear = years.length ? Math.min(...years) : year;
    const maxYear = years.length ? Math.max(...years) : year;
    const layout = {
      ...chartLayout(365),
      margin: { l: 68, r: 25, t: 16, b: 62 },
      xaxis: {
        gridcolor: "#edf0f4",
        dtick: 1,
        tickmode: "linear" as const,
        range: years.length > 1 ? [minYear - .2, maxYear + .2] : undefined,
        title: { text: "Millésime" },
      },
      yaxis: {
        gridcolor: "#edf0f4",
        rangemode: "tozero" as const,
        tickformat: isShare ? ".1f" : ".2s",
        ticksuffix: isShare ? " %" : "",
        title: { text: isShare ? "Part parmi les actifs en emploi" : "Effectif pondéré" },
      },
      shapes: [{
        type: "line" as const,
        x0: overview?.context.year ?? year,
        x1: overview?.context.year ?? year,
        y0: 0,
        y1: 1,
        yref: "paper" as const,
        line: { color: PALE, width: 1, dash: "dot" as const },
      }],
    } satisfies Partial<Layout>;
    return { data, layout, minYear, maxYear };
  }, [annual, trendMeasure, year, overview]);

  const composition = useMemo(() => {
    const rows = overview?.composition ?? [];
    const contextual = overview?.context.region !== "FR";
    const data: Data[] = [{
      type: "bar",
      orientation: "h",
      name: overview?.context.region_label ?? "Périmètre",
      y: rows.map((item) => item.label).reverse(),
      x: rows.map((item) => item.share).reverse(),
      customdata: rows.map((item) => item.effectif).reverse(),
      marker: { color: rows.map((item) => item.code === cspCode ? RED : NAVY).reverse() },
      hovertemplate: "<b>%{y}</b><br>Part : %{x:.2f} %<br>Effectif : %{customdata:,.0f}<extra></extra>",
    }];
    if (contextual) data.push({
      type: "bar",
      orientation: "h",
      name: "France entière",
      y: rows.map((item) => item.label).reverse(),
      x: rows.map((item) => item.france_share).reverse(),
      marker: { color: PALE },
      hovertemplate: "<b>%{y}</b><br>France : %{x:.2f} %<extra></extra>",
    });
    const height = Math.max(430, rows.length * (contextual ? 28 : 25) + 130);
    const layout = {
      ...chartLayout(height),
      margin: { l: level === "categorie_29" ? 335 : 245, r: 28, t: 20, b: 58 },
      xaxis: { gridcolor: "#edf0f4", ticksuffix: " %", tickformat: ".1f", title: { text: "Part parmi les actifs en emploi" } },
      yaxis: { gridcolor: "rgba(0,0,0,0)", automargin: true },
      barmode: "group" as const,
      legend: { orientation: "h" as const, x: .5, xanchor: "center" as const, y: 1.08 },
      showlegend: contextual,
    } satisfies Partial<Layout>;
    return { data, layout, height };
  }, [overview, cspCode, level]);

  const ranking = overview?.territories ?? [];
  const rankingMax = Math.max(...ranking.map((item) => mapMeasure === "share" ? item.share : item.effectif), 1);
  const overseas = ranking.filter((item) => Number(item.code) < 11);
  const overseasMax = Math.max(...overseas.map((item) => mapMeasure === "share" ? item.share : item.effectif), 1);
  const coreSize = metadata ? `${(metadata.core_size_bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo` : "";
  const openExtraction = () => onOpenExtraction(new URLSearchParams({ page: "extraction", source: "csp", year: String(year), level, csp: cspCode }));

  if (!metadata && loading) return <div className="content-wrap csp-page"><div className="page-loader"><div className="skeleton" /></div></div>;

  return <div className="content-wrap csp-page">
    <section className="hero csp-hero">
      <div><div className="eyebrow"><span>Recensement Insee</span> Populations</div><h1>CSP</h1><p>Professions et catégories socioprofessionnelles des actifs ayant un emploi.</p></div>
      <button type="button" className="method-link" onClick={onOpenMethodology}>Données & méthode →</button>
    </section>

    <section className="panel csp-context">
      <div className="csp-primary-filters">
        <label><span>Niveau de lecture</span><select value={level} onChange={(event) => changeLevel(event.target.value as "groupe_6" | "categorie_29")}><option value="groupe_6">6 grands groupes</option><option value="categorie_29">29 catégories détaillées</option></select></label>
        <label className="csp-wide-filter"><span>CSP observée</span><select value={cspCode} onChange={(event) => setCspCode(event.target.value)}>{options.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
        <label><span>Millésime</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{metadata?.years.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="csp-population-filters">
        <label><span>Territoire de la fiche</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{metadata?.regions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
        <label><span>Âge</span><select value={age} onChange={(event) => setAge(event.target.value)}>{metadata?.ages.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
        <label><span>Sexe</span><select value={sex} onChange={(event) => setSex(Number(event.target.value))}>{metadata?.sexes.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
        <span className="csp-scope-chip">{year} · actifs en emploi</span>
      </div>
      <div className={`pathology-loading-track ${loading ? "active" : ""}`} role="status" aria-label={loading ? "Fiche CSP en cours d’actualisation" : "Fiche CSP à jour"}><span /></div>
    </section>

    {error ? <div className="analysis-error"><strong>La fiche CSP n’a pas pu être calculée</strong><span>{error}</span></div> : null}

    {overview ? <>
      <section className="pathology-title-line csp-title-line"><div><span>{overview.context.level_label}</span><h2>{overview.context.csp_label}</h2><small>{overview.context.region_label} · {overview.context.age_label} · {overview.context.sex_label}</small></div><div className="csp-title-actions"><div className="csp-title-chips"><span>Millésime {overview.context.year}</span><span>Pondéré Insee</span></div><button type="button" onClick={openExtraction}>Extraire les données →</button></div></section>
      <section className="pathology-kpis csp-kpis">{overview.kpis.map((kpi) => <article className="panel" key={kpi.key}><span>{kpi.label}</span><strong className={kpi.kind === "ratio" ? "ratio-sentence" : ""}>{kpi.kind === "ratio" ? kpi.detail : formatKpi(kpi.value, kpi.kind)}</strong>{kpi.kind !== "ratio" ? <small>{kpi.detail}</small> : null}</article>)}</section>

      <section className="csp-dashboard-grid">
        <article className="panel pathology-chart csp-evolution-card"><header><div><span className="section-kicker">Évolution</span><h3>{evolution.minYear === evolution.maxYear ? `Millésime ${evolution.minYear}` : `Évolution ${evolution.minYear}–${evolution.maxYear}`}</h3><p>{overview.context.csp_label} · {overview.context.region_label} · {overview.context.age_label} · {overview.context.sex_label}</p>{overview.evolution_note ? <p className="csp-evolution-note">{overview.evolution_note}</p> : null}</div><div className="pathology-toggle" aria-label="Mesure de l'évolution"><button className={trendMeasure === "share" ? "active" : ""} onClick={() => setTrendMeasure("share")}>Part</button><button className={trendMeasure === "effectif" ? "active" : ""} onClick={() => setTrendMeasure("effectif")}>Effectif</button></div></header>{annual.length > 1 ? <Plot data={evolution.data} layout={evolution.layout} config={{ responsive: true, displaylogo: false, displayModeBar: false }} style={{ width: "100%", height: "365px", opacity: loading ? .48 : 1 }} useResizeHandler /> : <div className="csp-evolution-empty">L'évolution sera disponible dès qu'un second millésime sera chargé.</div>}</article>
        <article className="panel csp-map-card">
          <header><div><span className="section-kicker">Territoires</span><h3>Répartition régionale</h3><p>{overview.context.csp_label}</p></div><div className="pathology-toggle"><button className={mapMeasure === "share" ? "active" : ""} onClick={() => setMapMeasure("share")}>Part</button><button className={mapMeasure === "effectif" ? "active" : ""} onClick={() => setMapMeasure("effectif")}>Effectif</button></div></header>
          {geography ? <GeoPlot data={map.data} layout={map.layout} config={{ responsive: true, displaylogo: false, displayModeBar: false }} style={{ width: "100%", height: "520px", opacity: loading ? .48 : 1 }} useResizeHandler onClick={(event) => { const code = String((event.points[0] as unknown as { location?: string }).location ?? ""); if (code) setRegion(code === region ? "FR" : code); }} /> : <div className="csp-map-loading"><div className="skeleton" /></div>}
          <div className="csp-overseas-insets"><span>DROM</span>{overseas.map((item) => {
            const value = mapMeasure === "share" ? item.share : item.effectif;
            const intensity = .12 + .76 * value / overseasMax;
            return <button type="button" key={item.code} className={item.code === region ? "selected" : ""} style={{ backgroundColor: `rgba(236,76,83,${intensity})` }} onClick={() => setRegion(item.code === region ? "FR" : item.code)}><strong>{item.label}</strong><small>{mapMeasure === "share" ? `${formatNumber(value, 2)} %` : formatNumber(value)}</small></button>;
          })}</div>
          <div className="csp-map-foot"><span>France · {formatNumber(overview.france_reference.share, 2)} %</span><span>Cliquer une région pour l’ouvrir</span></div>
        </article>

        <article className="panel csp-ranking-card">
          <header><div><span className="section-kicker">Classement</span><h3>17 régions</h3></div><button type="button" className={region === "FR" ? "active" : ""} onClick={() => setRegion("FR")}>France</button></header>
          <div className="csp-ranking-list">{ranking.map((item, index) => {
            const value = mapMeasure === "share" ? item.share : item.effectif;
            return <button type="button" key={item.code} className={item.code === region ? "selected" : ""} onClick={() => setRegion(item.code === region ? "FR" : item.code)}><i>{String(index + 1).padStart(2, "0")}</i><span><strong>{item.label}</strong><em><b style={{ width: `${100 * value / rankingMax}%` }} /></em></span><small>{mapMeasure === "share" ? `${formatNumber(value, 2)} %` : formatNumber(value)}</small></button>;
          })}</div>
        </article>

        <article className="panel pathology-chart csp-age-card"><header><div><span className="section-kicker">Âge & sexe</span><h3>Profil de la CSP</h3></div><span className="quality-badge">Part dans chaque population</span></header><Plot data={ageSex.data} layout={ageSex.layout} config={{ responsive: true, displaylogo: false, displayModeBar: false }} style={{ width: "100%", height: "430px", opacity: loading ? .48 : 1 }} useResizeHandler /></article>

        <article className="panel pathology-chart csp-composition-card"><header><div><span className="section-kicker">Structure</span><h3>{level === "groupe_6" ? "Composition en 6 groupes" : "Composition en 29 catégories"}</h3></div>{region !== "FR" ? <span className="quality-badge">Comparaison France</span> : <span className="quality-badge">France entière</span>}</header><Plot data={composition.data} layout={composition.layout} config={{ responsive: true, displaylogo: false, displayModeBar: false }} style={{ width: "100%", height: `${composition.height}px`, opacity: loading ? .48 : 1 }} useResizeHandler /></article>
      </section>
      <footer className="pathology-footer csp-footer"><span>Source · {metadata?.source ?? `Recensement de la population ${overview.context.year}, Insee`} · Champ : actifs ayant un emploi · Effectifs pondérés</span><div><span>Parquet optimisé · {coreSize}</span><button type="button" onClick={openExtraction}>Extraire</button></div></footer>
    </> : null}
  </div>;
}
