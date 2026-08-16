/** Une catégorie socioprofessionnelle, quatre angles.
 *
 *  Le pendant du Panorama de DAMIR : un sujet choisi dans la nomenclature —
 *  six grands groupes ou vingt-neuf catégories — et quatre lectures. La carte
 *  reste cliquable : un clic ouvre la région, et comme le territoire est commun
 *  aux deux sections, la comparaison le suit.
 */

import { useEffect, useMemo, useState } from "react";
import type { ECharts } from "echarts/core";
import { getCspOverview } from "../api";
import type { KpiItem } from "../components/KpiStrip";
import { ChartShell } from "../components/ChartShell";
import { useChartTokens } from "../charts/tokens";
import { useFrenchMap } from "../charts/frenchMap";
import { formatKpi } from "../utils";
import { CSP_READINGS, buildCspReadings, type CspReadingKey } from "./model";
import { scopeLabel, type CspLevel, type CspSectionProps } from "./section";
import type { CspOverview } from "../types";

const CHAMP = "Champ : actifs ayant un emploi · Effectifs pondérés";

type Props = CspSectionProps & {
  level: CspLevel;
  setLevel: (next: CspLevel) => void;
  cspCode: string;
  setCspCode: (next: string) => void;
};

function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value);
}

export function PanoramaSection({
  metadata, year, region, setRegion, age, sex, measure, setMeasure,
  onOpenExtraction, routeVersion, level, setLevel, cspCode, setCspCode,
}: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();
  const franceMap = useFrenchMap();
  const [mapInstance, setMapInstance] = useState<ECharts | null>(null);

  const [overview, setOverview] = useState<CspOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reading, setReading] = useState<CspReadingKey>(() => {
    const raw = params.get("view");
    return CSP_READINGS.some((item) => item.key === raw) ? raw as CspReadingKey : "evolution";
  });
  const [forms, setForms] = useState<Partial<Record<CspReadingKey, string>>>(() => {
    const next: Partial<Record<CspReadingKey, string>> = {};
    CSP_READINGS.forEach((item) => {
      const raw = params.get(`form_${item.key}`);
      if (raw) next[item.key as CspReadingKey] = raw;
    });
    return next;
  });

  const selectedLevel = metadata.levels.find((item) => item.key === level) ?? null;
  const options = selectedLevel?.options ?? [];

  useEffect(() => {
    if (!cspCode) return;
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
  }, [year, level, cspCode, region, age, sex]);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("view", reading);
    Object.entries(forms).forEach(([key, value]) => { if (value) next.set(`form_${key}`, value); });
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [reading, forms]);

  // L'API renvoie une série sur tous les millésimes disponibles pour le
  // périmètre courant. Le repli garde la fiche utilisable avec une base
  // mono-année.
  const annual = useMemo(() => {
    if (!overview) return [];
    const rows = (overview.annual ?? overview.evolution ?? [])
      .filter((item) => Number.isFinite(Number(item.year)));
    if (rows.length) {
      return [...rows].sort((left, right) => left.year - right.year)
        .map((item) => ({ year: item.year, effectif: item.effectif, share: item.share }));
    }
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
    const handler = (event: any) => {
      const code = String(event.name ?? "");
      if (code) setRegion(code === region ? "FR" : code);
    };
    mapInstance.on("click", handler);
    return () => { mapInstance.off("click", handler); };
  }, [mapInstance, region, setRegion]);

  const kpiItems: KpiItem[] = (overview?.kpis ?? []).map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    // Seule l'évolution est une variation : elle seule porte un signe.
    value: kpi.kind === "ratio" ? kpi.detail : formatKpi(kpi.value, kpi.kind, kpi.key === "evolution"),
    detail: kpi.detail,
  }));

  const overseas = (overview?.territories ?? []).filter((item) => Number(item.code) < 11);
  const overseasMax = Math.max(...overseas.map((item) => (measure === "share" ? item.share : item.effectif)), 1);
  const sourceLine = `Source · ${metadata.source ?? "Recensement de la population, Insee"} · ${CHAMP}`;
  const scope = `${overview?.context.csp_label ?? ""} · ${scopeLabel(metadata, year, region, age, sex)}`;
  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    page: "extraction", source: "csp", year: String(year), level, csp: cspCode,
  }));

  return <>
    <section className="panel csp-context">
      <div className="csp-primary-filters">
        <label><span>Niveau de lecture</span>
          <select value={level} onChange={(event) => {
            const next = event.target.value as CspLevel;
            setLevel(next);
            const nextLevel = metadata.levels.find((item) => item.key === next);
            const preferred = nextLevel?.options.find((item) => item.code === (next === "groupe_6" ? "3" : "38"))
              ?? nextLevel?.options[0];
            if (preferred) setCspCode(preferred.code);
          }}>
            <option value="groupe_6">6 grands groupes</option>
            <option value="categorie_29">29 catégories détaillées</option>
          </select>
        </label>
        <label className="csp-wide-filter"><span>CSP observée</span>
          <select value={cspCode} onChange={(event) => setCspCode(event.target.value)}>
            {options.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className={`pathology-loading-track ${loading ? "active" : ""}`} role="status"
        aria-label={loading ? "Fiche CSP en cours d’actualisation" : "Fiche CSP à jour"}><span /></div>
    </section>

    {error ? <div className="analysis-error"><strong>La fiche CSP n’a pas pu être calculée</strong><span>{error}</span></div> : null}

    {overview && current ? <>
      <section className="pathology-title-line csp-title-line">
        <div>
          <span>{overview.context.level_label}</span>
          <h2>{overview.context.csp_label}</h2>
          <small>{scopeLabel(metadata, year, region, age, sex)}</small>
        </div>
        <div className="csp-title-actions">
          <div className="csp-title-chips"><span>Millésime {overview.context.year}</span><span>Pondéré Insee</span></div>
          <button type="button" onClick={openExtraction}>Extraire les données →</button>
        </div>
      </section>

      <ChartShell
        kicker={overview.context.csp_label}
        title={current.title}
        readings={CSP_READINGS}
        reading={reading}
        onReading={(key) => setReading(key as CspReadingKey)}
        forms={current.forms}
        form={current.form}
        onForm={(key) => setForms((value) => ({ ...value, [reading]: key }))}
        question={current.question}
        highlights={kpiItems}
        headerActions={
          <div className="pathology-toggle" aria-label="Mesure">
            <button type="button" className={measure === "share" ? "active" : ""}
              onClick={() => setMeasure("share")}>Part</button>
            <button type="button" className={measure === "effectif" ? "active" : ""}
              onClick={() => setMeasure("effectif")}>Effectif</button>
          </div>
        }
        height={current.height}
        option={current.option}
        exportOption={(palette) => buildCspReadings({ ...readingInput, tokens: palette })
          .find((item) => item.key === current.key)?.option ?? current.option!}
        empty={current.empty}
        loading={loading}
        ariaLabel={current.ariaLabel}
        onInstance={current.key === "territory" && current.form === "map" ? setMapInstance : undefined}
        afterChart={current.key === "territory" && current.form === "map" ? <>
          <div className="csp-overseas-insets"><span>DROM</span>{overseas.map((item) => {
            const value = measure === "share" ? item.share : item.effectif;
            const intensity = 0.12 + 0.76 * value / overseasMax;
            return (
              <button type="button" key={item.code} className={item.code === region ? "selected" : ""}
                style={{ backgroundColor: `rgba(236,76,83,${intensity})` }}
                onClick={() => setRegion(item.code === region ? "FR" : item.code)}>
                <strong>{item.label}</strong>
                <small>{measure === "share" ? `${formatNumber(value, 2)} %` : formatNumber(value)}</small>
              </button>
            );
          })}</div>
          <div className="csp-map-foot">
            <span>France · {formatNumber(overview.france_reference.share, 2)} %</span>
            <span>Cliquer une région pour l’ouvrir</span>
          </div>
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
    </> : null}
  </>;
}
