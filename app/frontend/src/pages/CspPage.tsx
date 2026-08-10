import { useEffect, useMemo, useState } from "react";
import type { ECharts } from "echarts/core";
import { getCspMetadata, getCspOverview } from "../api";
import { EChart } from "../charts/EChart";
import { useChartTokens } from "../charts/tokens";
import { useFrenchMap } from "../charts/frenchMap";
import { ageSexOption, compositionOption, evolutionOption, mapOption } from "../csp/charts";
import type { CspMetadata, CspOverview } from "../types";

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

export function CspPage({ routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const initial = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const [metadata, setMetadata] = useState<CspMetadata | null>(null);
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
  const tokens = useChartTokens();
  const franceMap = useFrenchMap();
  const [mapInstance, setMapInstance] = useState<ECharts | null>(null);

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
      })
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
    const rows = mainland.map((item) => ({ code: item.code, label: item.label, value: mapMeasure === "share" ? item.share : item.effectif }));
    return mapOption({ rows, highlighted: region !== "FR" ? region : null, kind: mapMeasure === "share" ? "percent" : "quantity", tokens });
  }, [overview, mapMeasure, region, tokens]);

  useEffect(() => {
    if (!mapInstance) return;
    const handler = (params: any) => {
      const code = String(params.name ?? "");
      if (code) setRegion(code === region ? "FR" : code);
    };
    mapInstance.on("click", handler);
    return () => { mapInstance.off("click", handler); };
  }, [mapInstance, region]);

  const ageSex = useMemo(() => {
    const ages = [...new Set(overview?.age_sex.map((item) => item.age) ?? [])];
    const visibleSexes = sex === 0 ? [2, 1] : [sex];
    const rows = visibleSexes.map((sexCode) => ({
      label: sexCode === 2 ? "Femmes" : "Hommes",
      sexCode,
      values: ages.map((ageLabel) => overview?.age_sex.find((item) => item.age === ageLabel && item.sex_code === sexCode)?.share ?? null),
    }));
    return ageSexOption({ ages, rows, kind: "percent", tokens });
  }, [overview, sex, tokens]);

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

  const evolutionYears = useMemo(() => annual.map((item) => item.year), [annual]);
  const evolutionMinYear = evolutionYears.length ? Math.min(...evolutionYears) : year;
  const evolutionMaxYear = evolutionYears.length ? Math.max(...evolutionYears) : year;
  const evolution = useMemo(() => evolutionOption({
    years: evolutionYears,
    values: annual.map((item) => (trendMeasure === "share" ? item.share : item.effectif)),
    currentYear: overview?.context.year ?? year,
    kind: trendMeasure === "share" ? "percent" : "quantity",
    tokens,
  }), [annual, evolutionYears, trendMeasure, year, overview, tokens]);

  const composition = useMemo(() => {
    const rows = (overview?.composition ?? []).map((item) => ({
      code: item.code, label: item.label, value: item.share, franceValue: item.france_share,
    }));
    const contextual = overview?.context.region !== "FR";
    const height = Math.max(430, rows.length * (contextual ? 28 : 25) + 130);
    const option = compositionOption({
      rows, ownCode: cspCode, contextual, regionLabel: overview?.context.region_label ?? "Périmètre",
      kind: "percent", tokens,
    });
    return { option, height };
  }, [overview, cspCode, tokens]);

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
        <article className="panel pathology-chart csp-evolution-card"><header><div><span className="section-kicker">Évolution</span><h3>{evolutionMinYear === evolutionMaxYear ? `Millésime ${evolutionMinYear}` : `Évolution ${evolutionMinYear}–${evolutionMaxYear}`}</h3><p>{overview.context.csp_label} · {overview.context.region_label} · {overview.context.age_label} · {overview.context.sex_label}</p>{overview.evolution_note ? <p className="csp-evolution-note">{overview.evolution_note}</p> : null}</div><div className="pathology-toggle" aria-label="Mesure de l'évolution"><button className={trendMeasure === "share" ? "active" : ""} onClick={() => setTrendMeasure("share")}>Part</button><button className={trendMeasure === "effectif" ? "active" : ""} onClick={() => setTrendMeasure("effectif")}>Effectif</button></div></header>{annual.length > 1 ? <EChart option={evolution} height={365} stale={loading} ariaLabel={`Évolution de la CSP · ${overview.context.csp_label}`} /> : <div className="csp-evolution-empty">L'évolution sera disponible dès qu'un second millésime sera chargé.</div>}</article>
        <article className="panel csp-map-card">
          <header><div><span className="section-kicker">Territoires</span><h3>Répartition régionale</h3><p>{overview.context.csp_label}</p></div><div className="pathology-toggle"><button className={mapMeasure === "share" ? "active" : ""} onClick={() => setMapMeasure("share")}>Part</button><button className={mapMeasure === "effectif" ? "active" : ""} onClick={() => setMapMeasure("effectif")}>Effectif</button></div></header>
          {franceMap.ready ? <EChart option={map} height={520} stale={loading} ariaLabel={`Répartition régionale · ${overview.context.csp_label}`} onInstance={setMapInstance} /> : franceMap.error ? <div className="csp-map-loading"><span>{franceMap.error}</span></div> : <div className="csp-map-loading"><div className="skeleton" /></div>}
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

        <article className="panel pathology-chart csp-age-card"><header><div><span className="section-kicker">Âge & sexe</span><h3>Profil de la CSP</h3></div><span className="quality-badge">Part dans chaque population</span></header><EChart option={ageSex} height={430} stale={loading} ariaLabel={`Profil âge et sexe · ${overview.context.csp_label}`} /></article>

        <article className="panel pathology-chart csp-composition-card"><header><div><span className="section-kicker">Structure</span><h3>{level === "groupe_6" ? "Composition en 6 groupes" : "Composition en 29 catégories"}</h3></div>{region !== "FR" ? <span className="quality-badge">Comparaison France</span> : <span className="quality-badge">France entière</span>}</header><EChart option={composition.option} height={composition.height} stale={loading} ariaLabel={`Composition · ${overview.context.region_label}`} /></article>
      </section>
      <footer className="pathology-footer csp-footer"><span>Source · {metadata?.source ?? `Recensement de la population ${overview.context.year}, Insee`} · Champ : actifs ayant un emploi · Effectifs pondérés</span><div><span>Parquet optimisé · {coreSize}</span><button type="button" onClick={openExtraction}>Extraire</button></div></footer>
    </> : null}
  </div>;
}
