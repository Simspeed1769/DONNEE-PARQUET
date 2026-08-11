import { useEffect, useMemo, useState } from "react";
import type { ECharts } from "echarts/core";
import { getCspMetadata, getCspOverview } from "../api";
import { PageHero } from "../components/PageHero";
import type { KpiItem } from "../components/KpiStrip";
import { ChartShell } from "../components/ChartShell";
import { paletteParams, readPalette } from "../charts/palette";
import { formatKpi } from "../utils";
import { useChartTokens } from "../charts/tokens";
import { useFrenchMap } from "../charts/frenchMap";
import { CSP_READINGS, buildCspReadings, type CspReadingKey } from "../csp/model";
import type { CspMetadata, CspOverview } from "../types";

const SOURCE_LINE_BASE = "Champ : actifs ayant un emploi · Effectifs pondérés";

type Props = { routeVersion: number; onOpenExtraction: (params: URLSearchParams) => void; onOpenMethodology: () => void };
type Measure = "share" | "effectif";

function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits }).format(value);
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
  const [measure, setMeasure] = useState<Measure>(initial.get("measure") === "effectif" ? "effectif" : "share");
  const [reading, setReading] = useState<CspReadingKey>(() => {
    const raw = initial.get("view");
    return CSP_READINGS.some((item) => item.key === raw) ? raw as CspReadingKey : "evolution";
  });
  const [forms, setForms] = useState<Partial<Record<CspReadingKey, string>>>(() => {
    const next: Partial<Record<CspReadingKey, string>> = {};
    CSP_READINGS.forEach((item) => {
      const raw = initial.get(`form_${item.key}`);
      if (raw) next[item.key as CspReadingKey] = raw;
    });
    return next;
  });
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
        if (reason.name !== "AbortError") { setError(reason.message); setLoading(false); }
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
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [metadata, year, level, cspCode, region, age, sex]);

  useEffect(() => {
    const params = new URLSearchParams({
      page: "csp", year: String(year), level, csp: cspCode, region, age, sex: String(sex),
      measure, view: reading,
      ...paletteParams(readPalette()),
    });
    Object.entries(forms).forEach(([key, value]) => { if (value) params.set(`form_${key}`, value); });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [year, level, cspCode, region, age, sex, measure, reading, forms]);

  // L'API renvoie une série sur tous les millésimes disponibles pour le
  // périmètre courant. Le repli garde la fiche utilisable avec une base
  // mono-année.
  const annual = useMemo(() => {
    if (!overview) return [];
    const rows = (overview.annual ?? overview.evolution ?? []).filter((item) => Number.isFinite(Number(item.year)));
    if (rows.length) return [...rows].sort((a, b) => a.year - b.year).map((item) => ({ year: item.year, effectif: item.effectif, share: item.share }));
    const selected = overview.kpis.find((item) => item.key === "selected")?.value ?? null;
    const share = overview.kpis.find((item) => item.key === "share")?.value ?? null;
    return [{ year: overview.context.year, effectif: selected, share }];
  }, [overview]);

  const readingInput = useMemo(() => ({
    overview, annual, measure, region,
    mapReady: franceMap.ready, mapError: franceMap.error,
    evolutionNote: overview?.evolution_note ?? null, forms,
  }), [overview, annual, measure, region, franceMap.ready, franceMap.error, forms]);
  const readings = useMemo(() => buildCspReadings({ ...readingInput, tokens }), [readingInput, tokens]);
  const current = readings.find((item) => item.key === reading) ?? readings[0];

  // Le clic-carte ne vaut que sur la lecture Territoire en forme Carte.
  useEffect(() => {
    if (!mapInstance) return;
    const handler = (params: any) => {
      const code = String(params.name ?? "");
      if (code) setRegion(code === region ? "FR" : code);
    };
    mapInstance.on("click", handler);
    return () => { mapInstance.off("click", handler); };
  }, [mapInstance, region]);

  const kpiItems: KpiItem[] = (overview?.kpis ?? []).map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    // Seule l'évolution est une variation : elle seule porte un signe.
    value: kpi.kind === "ratio" ? kpi.detail : formatKpi(kpi.value, kpi.kind, kpi.key === "evolution"),
    detail: kpi.detail,
    sentence: kpi.kind === "ratio",
  }));

  const overseas = (overview?.territories ?? []).filter((item) => Number(item.code) < 11);
  const overseasMax = Math.max(...overseas.map((item) => (measure === "share" ? item.share : item.effectif)), 1);
  const coreSize = metadata ? `${(metadata.core_size_bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo` : "";
  const sourceLine = `Source · ${metadata?.source ?? `Recensement de la population ${overview?.context.year ?? year}, Insee`} · ${SOURCE_LINE_BASE}`;
  const scope = `${overview?.context.csp_label ?? ""} · ${overview?.context.region_label ?? ""} · ${overview?.context.age_label ?? ""} · ${overview?.context.sex_label ?? ""} · millésime ${overview?.context.year ?? year}`;
  const openExtraction = () => onOpenExtraction(new URLSearchParams({ page: "extraction", source: "csp", year: String(year), level, csp: cspCode }));

  if (!metadata && loading) return <div className="content-wrap csp-page"><div className="page-loader"><div className="skeleton" /></div></div>;

  return <div className="content-wrap csp-page">
    <PageHero
      variant="csp-hero"
      eyebrowLabel="Recensement Insee"
      eyebrowDetail="Populations"
      title="CSP"
      mission="Professions et catégories socioprofessionnelles des actifs ayant un emploi."
      action={<button type="button" className="method-link" onClick={onOpenMethodology}>Données & méthode →</button>}
    />

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

    {overview && current ? <>
      <section className="pathology-title-line csp-title-line"><div><span>{overview.context.level_label}</span><h2>{overview.context.csp_label}</h2><small>{overview.context.region_label} · {overview.context.age_label} · {overview.context.sex_label}</small></div><div className="csp-title-actions"><div className="csp-title-chips"><span>Millésime {overview.context.year}</span><span>Pondéré Insee</span></div><button type="button" onClick={openExtraction}>Extraire les données →</button></div></section>

      <ChartShell
        kicker={`CSP · ${overview.context.csp_label}`}
        title={current.title}
        readings={CSP_READINGS}
        reading={reading}
        onReading={(key) => setReading(key as CspReadingKey)}
        forms={current.forms}
        form={current.form}
        onForm={(key) => setForms((value) => ({ ...value, [reading]: key }))}
        question={current.question}
        highlights={kpiItems}
        headerActions={<div className="pathology-toggle" aria-label="Mesure"><button type="button" className={measure === "share" ? "active" : ""} onClick={() => setMeasure("share")}>Part</button><button type="button" className={measure === "effectif" ? "active" : ""} onClick={() => setMeasure("effectif")}>Effectif</button></div>}
        height={current.height}
        option={current.option}
        exportOption={(t) => buildCspReadings({ ...readingInput, tokens: t })
          .find((item) => item.key === current.key)?.option ?? current.option!}
        empty={current.empty}
        loading={loading}
        ariaLabel={current.ariaLabel}
        onInstance={current.key === "territory" && current.form === "map" ? setMapInstance : undefined}
        afterChart={current.key === "territory" && current.form === "map" ? <>
          <div className="csp-overseas-insets"><span>DROM</span>{overseas.map((item) => {
            const value = measure === "share" ? item.share : item.effectif;
            const intensity = .12 + .76 * value / overseasMax;
            return <button type="button" key={item.code} className={item.code === region ? "selected" : ""} style={{ backgroundColor: `rgba(236,76,83,${intensity})` }} onClick={() => setRegion(item.code === region ? "FR" : item.code)}><strong>{item.label}</strong><small>{measure === "share" ? `${formatNumber(value, 2)} %` : formatNumber(value)}</small></button>;
          })}</div>
          <div className="csp-map-foot"><span>France · {formatNumber(overview.france_reference.share, 2)} %</span><span>Cliquer une région pour l’ouvrir</span></div>
        </> : null}
        tableColumns={current.table.columns}
        tableRows={current.table.rows}
        caveats={current.caveats}
        sourceLine={sourceLine}
        filenamePrefix="csp"
        scope={scope}
        onExtract={openExtraction}
        className="csp-stage"
      />

      <footer className="pathology-footer csp-footer"><span>{sourceLine}</span><div><span>Parquet optimisé · {coreSize}</span><button type="button" onClick={openExtraction}>Extraire</button></div></footer>
    </> : null}
  </div>;
}
