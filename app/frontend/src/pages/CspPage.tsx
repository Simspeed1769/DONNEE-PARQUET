import { useEffect, useMemo, useState } from "react";
import type { ECharts } from "echarts/core";
import { getCspMetadata, getCspOverview } from "../api";
import { PageHero } from "../components/PageHero";
import { KpiStrip, type KpiItem } from "../components/KpiStrip";
import { ChartShell } from "../components/ChartShell";
import { useChartTokens } from "../charts/tokens";
import { useFrenchMap } from "../charts/frenchMap";
import { ageSexOption, compositionOption, evolutionOption, mapOption } from "../csp/charts";
import { cspCaveats } from "../csp/model";
import { formatValue } from "../utils";
import type { CspMetadata, CspOverview } from "../types";

const SOURCE_LINE_BASE = "Champ : actifs ayant un emploi · Effectifs pondérés";

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

  /* Les arguments de chaque lecture vivent à part de la palette : l'écran les
     assemble avec le thème courant, l'export les réassemble en clair. */
  const mapInput = useMemo(() => {
    const mainland = (overview?.territories ?? []).filter((item) => Number(item.code) >= 11);
    return {
      rows: mainland.map((item) => ({ code: item.code, label: item.label, value: mapMeasure === "share" ? item.share : item.effectif })),
      highlighted: region !== "FR" ? region : null,
      kind: mapMeasure === "share" ? "percent" : "quantity",
    };
  }, [overview, mapMeasure, region]);
  const map = useMemo(() => mapOption({ ...mapInput, tokens }), [mapInput, tokens]);

  useEffect(() => {
    if (!mapInstance) return;
    const handler = (params: any) => {
      const code = String(params.name ?? "");
      if (code) setRegion(code === region ? "FR" : code);
    };
    mapInstance.on("click", handler);
    return () => { mapInstance.off("click", handler); };
  }, [mapInstance, region]);

  const ageSexInput = useMemo(() => {
    const ages = [...new Set(overview?.age_sex.map((item) => item.age) ?? [])];
    const visibleSexes = sex === 0 ? [2, 1] : [sex];
    return {
      ages,
      rows: visibleSexes.map((sexCode) => ({
        label: sexCode === 2 ? "Femmes" : "Hommes",
        sexCode,
        values: ages.map((ageLabel) => overview?.age_sex.find((item) => item.age === ageLabel && item.sex_code === sexCode)?.share ?? null),
      })),
      kind: "percent",
    };
  }, [overview, sex]);
  const ageSex = useMemo(() => ageSexOption({ ...ageSexInput, tokens }), [ageSexInput, tokens]);

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
  const evolutionInput = useMemo(() => ({
    years: evolutionYears,
    values: annual.map((item) => (trendMeasure === "share" ? item.share : item.effectif)),
    currentYear: overview?.context.year ?? year,
    kind: trendMeasure === "share" ? "percent" : "quantity",
  }), [annual, evolutionYears, trendMeasure, year, overview]);
  const evolution = useMemo(() => evolutionOption({ ...evolutionInput, tokens }), [evolutionInput, tokens]);

  const compositionInput = useMemo(() => {
    const rows = (overview?.composition ?? []).map((item) => ({
      code: item.code, label: item.label, value: item.share, franceValue: item.france_share,
    }));
    const contextual = overview?.context.region !== "FR";
    return {
      input: {
        rows, ownCode: cspCode, contextual,
        regionLabel: overview?.context.region_label ?? "Périmètre", kind: "percent",
      },
      height: Math.max(430, rows.length * (contextual ? 28 : 25) + 130),
    };
  }, [overview, cspCode]);
  const composition = useMemo(() => ({
    option: compositionOption({ ...compositionInput.input, tokens }),
    height: compositionInput.height,
  }), [compositionInput, tokens]);

  const evolutionTable = useMemo(() => ({
    columns: ["Millésime", trendMeasure === "share" ? "Part" : "Effectif"],
    rows: annual.map((item) => [String(item.year), formatValue(trendMeasure === "share" ? item.share : item.effectif, trendMeasure === "share" ? "percent" : "quantity")]),
  }), [annual, trendMeasure]);

  const mapTable = useMemo(() => ({
    columns: ["Territoire", mapMeasure === "share" ? "Part" : "Effectif"],
    rows: [...(overview?.territories ?? [])]
      .sort((left, right) => (mapMeasure === "share" ? right.share - left.share : right.effectif - left.effectif))
      .map((item) => [item.label, formatValue(mapMeasure === "share" ? item.share : item.effectif, mapMeasure === "share" ? "percent" : "quantity")]),
  }), [overview, mapMeasure]);

  const ageSexTable = useMemo(() => {
    const ages = [...new Set(overview?.age_sex.map((item) => item.age) ?? [])];
    const visibleSexes = sex === 0 ? [2, 1] : [sex];
    return {
      columns: ["Tranche d’âge", ...visibleSexes.map((code) => (code === 2 ? "Femmes" : "Hommes"))],
      rows: ages.map((ageLabel) => [
        ageLabel,
        ...visibleSexes.map((code) => formatValue(overview?.age_sex.find((item) => item.age === ageLabel && item.sex_code === code)?.share ?? null, "percent")),
      ]),
    };
  }, [overview, sex]);

  const compositionTable = useMemo(() => {
    const contextual = overview?.context.region !== "FR";
    return {
      columns: ["Modalité", overview?.context.region_label ?? "Périmètre", ...(contextual ? ["France entière"] : [])],
      rows: (overview?.composition ?? []).map((item) => [
        item.label, formatValue(item.share, "percent"), ...(contextual ? [formatValue(item.france_share, "percent")] : []),
      ]),
    };
  }, [overview]);

  const kpiItems: KpiItem[] = (overview?.kpis ?? []).map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    value: kpi.kind === "ratio" ? kpi.detail : formatKpi(kpi.value, kpi.kind),
    detail: kpi.detail,
    sentence: kpi.kind === "ratio",
  }));

  const sourceLine = `Source · ${metadata?.source ?? `Recensement de la population ${overview?.context.year ?? year}, Insee`} · ${SOURCE_LINE_BASE}`;
  const ranking = overview?.territories ?? [];
  const rankingMax = Math.max(...ranking.map((item) => mapMeasure === "share" ? item.share : item.effectif), 1);
  const overseas = ranking.filter((item) => Number(item.code) < 11);
  const overseasMax = Math.max(...overseas.map((item) => mapMeasure === "share" ? item.share : item.effectif), 1);
  const coreSize = metadata ? `${(metadata.core_size_bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo` : "";
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

    {overview ? <>
      <section className="pathology-title-line csp-title-line"><div><span>{overview.context.level_label}</span><h2>{overview.context.csp_label}</h2><small>{overview.context.region_label} · {overview.context.age_label} · {overview.context.sex_label}</small></div><div className="csp-title-actions"><div className="csp-title-chips"><span>Millésime {overview.context.year}</span><span>Pondéré Insee</span></div><button type="button" onClick={openExtraction}>Extraire les données →</button></div></section>
      <KpiStrip items={kpiItems} className="csp-kpis" />

      <section className="csp-dashboard-grid">
        <ChartShell
          kicker="Évolution"
          title={evolutionMinYear === evolutionMaxYear ? `Millésime ${evolutionMinYear}` : `Évolution ${evolutionMinYear}–${evolutionMaxYear}`}
          headerActions={<div className="pathology-toggle" aria-label="Mesure de l'évolution"><button className={trendMeasure === "share" ? "active" : ""} onClick={() => setTrendMeasure("share")}>Part</button><button className={trendMeasure === "effectif" ? "active" : ""} onClick={() => setTrendMeasure("effectif")}>Effectif</button></div>}
          height={365}
          option={annual.length > 1 ? evolution : null}
          exportOption={(t) => evolutionOption({ ...evolutionInput, tokens: t })}
          empty={annual.length > 1 ? undefined : "L'évolution sera disponible dès qu'un second millésime sera chargé."}
          loading={loading}
          ariaLabel={`Évolution de la CSP · ${overview.context.csp_label}`}
          tableColumns={evolutionTable.columns}
          tableRows={evolutionTable.rows}
          caveats={cspCaveats("evolution", { evolutionNote: overview.evolution_note ?? null })}
          sourceLine={sourceLine}
          filenamePrefix="csp"
          scope={`${overview.context.csp_label} · ${overview.context.region_label} · ${overview.context.age_label} · ${overview.context.sex_label}`}
          onExtract={openExtraction}
          className="csp-evolution-card"
        />
        <ChartShell
          kicker="Territoires"
          title="Répartition régionale"
          headerActions={<div className="pathology-toggle"><button className={mapMeasure === "share" ? "active" : ""} onClick={() => setMapMeasure("share")}>Part</button><button className={mapMeasure === "effectif" ? "active" : ""} onClick={() => setMapMeasure("effectif")}>Effectif</button></div>}
          height={520}
          option={franceMap.ready ? map : null}
          exportOption={(t) => mapOption({ ...mapInput, tokens: t })}
          empty={franceMap.error ?? undefined}
          loading={loading}
          ariaLabel={`Répartition régionale · ${overview.context.csp_label}`}
          onInstance={setMapInstance}
          afterChart={<>
            <div className="csp-overseas-insets"><span>DROM</span>{overseas.map((item) => {
              const value = mapMeasure === "share" ? item.share : item.effectif;
              const intensity = .12 + .76 * value / overseasMax;
              return <button type="button" key={item.code} className={item.code === region ? "selected" : ""} style={{ backgroundColor: `rgba(236,76,83,${intensity})` }} onClick={() => setRegion(item.code === region ? "FR" : item.code)}><strong>{item.label}</strong><small>{mapMeasure === "share" ? `${formatNumber(value, 2)} %` : formatNumber(value)}</small></button>;
            })}</div>
            <div className="csp-map-foot"><span>France · {formatNumber(overview.france_reference.share, 2)} %</span><span>Cliquer une région pour l’ouvrir</span></div>
          </>}
          tableColumns={mapTable.columns}
          tableRows={mapTable.rows}
          caveats={cspCaveats("map", { evolutionNote: null })}
          sourceLine={sourceLine}
          filenamePrefix="csp"
          scope={`${overview.context.csp_label} · répartition régionale · millésime ${overview.context.year}`}
          onExtract={openExtraction}
          className="csp-map-card"
        />

        <article className="panel csp-ranking-card">
          <header><div><span className="section-kicker">Classement</span><h3>17 régions</h3></div><button type="button" className={region === "FR" ? "active" : ""} onClick={() => setRegion("FR")}>France</button></header>
          <div className="csp-ranking-list">{ranking.map((item, index) => {
            const value = mapMeasure === "share" ? item.share : item.effectif;
            return <button type="button" key={item.code} className={item.code === region ? "selected" : ""} onClick={() => setRegion(item.code === region ? "FR" : item.code)}><i>{String(index + 1).padStart(2, "0")}</i><span><strong>{item.label}</strong><em><b style={{ width: `${100 * value / rankingMax}%` }} /></em></span><small>{mapMeasure === "share" ? `${formatNumber(value, 2)} %` : formatNumber(value)}</small></button>;
          })}</div>
        </article>

        <ChartShell
          kicker="Âge & sexe"
          title="Profil de la CSP"
          headerActions={<span className="quality-badge">Part dans chaque population</span>}
          height={430}
          option={ageSex}
          exportOption={(t) => ageSexOption({ ...ageSexInput, tokens: t })}
          loading={loading}
          ariaLabel={`Profil âge et sexe · ${overview.context.csp_label}`}
          tableColumns={ageSexTable.columns}
          tableRows={ageSexTable.rows}
          caveats={cspCaveats("ageSex", { evolutionNote: null })}
          sourceLine={sourceLine}
          filenamePrefix="csp"
          scope={`${overview.context.csp_label} · profil âge et sexe · ${overview.context.region_label}`}
          onExtract={openExtraction}
          className="csp-age-card"
        />

        <ChartShell
          kicker="Structure"
          title={level === "groupe_6" ? "Composition en 6 groupes" : "Composition en 29 catégories"}
          headerActions={region !== "FR" ? <span className="quality-badge">Comparaison France</span> : <span className="quality-badge">France entière</span>}
          height={composition.height}
          option={composition.option}
          exportOption={(t) => compositionOption({ ...compositionInput.input, tokens: t })}
          loading={loading}
          ariaLabel={`Composition · ${overview.context.region_label}`}
          tableColumns={compositionTable.columns}
          tableRows={compositionTable.rows}
          caveats={cspCaveats("composition", { evolutionNote: null })}
          sourceLine={sourceLine}
          filenamePrefix="csp"
          scope={`Composition · ${overview.context.region_label} · millésime ${overview.context.year}`}
          onExtract={openExtraction}
          className="csp-composition-card"
        />
      </section>
      <footer className="pathology-footer csp-footer"><span>Source · {metadata?.source ?? `Recensement de la population ${overview.context.year}, Insee`} · {SOURCE_LINE_BASE}</span><div><span>Parquet optimisé · {coreSize}</span><button type="button" onClick={openExtraction}>Extraire</button></div></footer>
    </> : null}
  </div>;
}
