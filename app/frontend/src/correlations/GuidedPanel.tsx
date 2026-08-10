/** Le mode Guidé : la question posée dans l'ordre où elle se pose.
 *
 *  « Lien » demande de choisir un indicateur de chaque côté sans dire lequel
 *  correspond à quoi ; « Modèle » est un établi complet, fait pour qui sait
 *  déjà ce qu'il veut y poser. Aucun des deux n'accompagne le trajet complet
 *  d'un manager qui a une question précise — « la part des agriculteurs
 *  pèse-t-elle sur les indemnités journalières, à âge et sexe comparables ? »
 *  — et pas les moyens de la traduire en catalogue de métriques.
 *
 *  Trois temps, un seul écran : ce qu'on explique, par quoi, ce qu'on tient
 *  constant. Le moteur est celui de Modèle — même `runRegression`, même GLM —
 *  seule la façade change. Aucune statistique nouvelle : les avertissements
 *  déjà produits par le serveur suffisent et restent affichés.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ECharts } from "echarts/core";
import {
  runRegression,
  type CorrelationCatalogue,
  type RegressionRequest,
  type RegressionResult,
  type RegressionTerm,
} from "../api";
import { EChart, type EChartsOption } from "../charts/EChart";
import { useChartTokens, type ChartTokens } from "../charts/tokens";
import { effectsOption, formatEffect } from "./RegressionPanel";

type Props = { catalogue: CorrelationCatalogue | null };

type YKind = "damir" | "patho";
type XKind = "csp" | "patho" | "damir";
type XEntry = { id: string; kind: XKind; metric: string; selection: string | null };

const MAX_X = 3;
const DEFAULT_YEAR = 2022;
const SCATTER_HEIGHT = 380;

let counter = 0;
function newId(): string {
  counter += 1;
  return `x${counter}`;
}

function formatP(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (value < 0.001) return "< 0,001";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(value);
}

/** Une valeur observée, telle qu'elle se lit sur la cellule — pas un effet :
 *  `formatEffect` porte un signe pensé pour une variation, qui n'a rien à
 *  faire devant une part ou une dépense brute. */
function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

/** La phrase au gabarit imposé par le mode Guidé — distincte de celle du GLM
 *  générique (`_term_sentence`, utilisée par Modèle) : celle-ci nomme
 *  explicitement l'unité d'observation et ce qui est tenu constant, pour
 *  qu'aucune lecture individuelle n'y soit possible. */
function guidedSentence(term: RegressionTerm, yLabel: string, ageSexHeld: boolean): string {
  const prefix = ageSexHeld ? "À âge et sexe comparables, " : "";
  const crossesZero = term.ci_low <= 0 && term.ci_high >= 0;
  if (crossesZero || term.p_value === null) {
    return `${prefix}les cellules territoriales où « ${term.label} » est plus élevée ne se distinguent pas des autres sur ${yLabel.toLowerCase()} : le lien n’est pas établi sur ces données.`;
  }
  // « un » plutôt qu'un accord de genre : le libellé de la mesure n'est pas
  // toujours disponible sous une forme dont on puisse déduire le genre.
  const direction = term.effect >= 0 ? `un ${yLabel.toLowerCase()} plus élevé` : `un ${yLabel.toLowerCase()} plus bas`;
  const effectText = `effet : ${formatEffect(term.effect, term.effect_kind)} ; IC à 95 % : `
    + `${formatEffect(term.ci_low, term.effect_kind)} à ${formatEffect(term.ci_high, term.effect_kind)}`;
  return `${prefix}les cellules territoriales où « ${term.label} » est plus élevée présentent en moyenne ${direction} (${effectText}).`;
}

/** Le nuage observé × expliqué par la première variable choisie.
 *
 *  Avec deux ou trois variables X, les autres continuent de peser dans le
 *  modèle et dans le graphique des effets : le nuage n'en montre qu'une à la
 *  fois parce qu'un plan à deux axes ne peut pas en montrer plus.
 */
function scatterOption(
  points: RegressionResult["points"], term: RegressionTerm, yLabel: string,
  tokens: ChartTokens, highlightedRegion: string | null,
): EChartsOption {
  const data = points
    .map((point) => ({ point, x: point.predictors[term.key] }))
    .filter((item): item is { point: RegressionResult["points"][number]; x: number } => item.x !== undefined);

  return {
    animationDuration: 300,
    backgroundColor: "transparent",
    grid: { left: 12, right: 24, top: 20, bottom: 12, containLabel: true },
    tooltip: {
      trigger: "item",
      backgroundColor: tokens.surface,
      borderColor: tokens.line,
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: tokens.ink, fontSize: 12, fontFamily: tokens.font },
      extraCssText: "box-shadow: 0 8px 28px rgba(0,0,0,.14); border-radius: 10px;",
      formatter: (params: any) => {
        const item = data[params.dataIndex];
        if (!item) return "";
        return `<div style="font-weight:650;margin-bottom:4px">${item.point.label}</div>
          <div style="color:${tokens.inkSecondary}">${term.label} · <b style="color:${tokens.ink}">${formatValue(item.x)}</b></div>
          <div style="color:${tokens.inkSecondary}">${yLabel} · <b style="color:${tokens.ink}">${formatValue(item.point.observed)}</b></div>`;
      },
    },
    xAxis: {
      type: "value", scale: true, name: term.label, nameLocation: "middle", nameGap: 32,
      nameTextStyle: { color: tokens.inkSecondary, fontSize: 12, fontFamily: tokens.font },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: tokens.inkMuted, fontSize: 11, fontFamily: tokens.font },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    yAxis: {
      type: "value", scale: true, name: yLabel, nameLocation: "end", nameGap: 14,
      nameTextStyle: { color: tokens.inkSecondary, fontSize: 12, fontFamily: tokens.font, align: "left" },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: tokens.inkMuted, fontSize: 11, fontFamily: tokens.font },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    series: [{
      type: "scatter",
      data: data.map((item) => [item.x, item.point.observed]),
      symbolSize: 12,
      itemStyle: {
        color: (params: any) => {
          const region = data[params.dataIndex]?.point.region;
          return highlightedRegion && region !== highlightedRegion
            ? tokens.seriesOther : tokens.series[0];
        },
        borderColor: tokens.surface,
        borderWidth: 1.5,
      },
      emphasis: { itemStyle: { opacity: 1 }, scale: 1.3 },
      blur: { itemStyle: { opacity: 0.25 } },
    }],
  } as EChartsOption;
}

export function GuidedPanel({ catalogue }: Props) {
  const tokens = useChartTokens();
  const chart = useRef<ECharts | null>(null);

  const [yKind, setYKind] = useState<YKind>("damir");
  const [yMetric, setYMetric] = useState("damir.spend_per_capita");
  const [yPathology, setYPathology] = useState<string | null>(null);

  const [xEntries, setXEntries] = useState<XEntry[]>([{ id: newId(), kind: "csp", metric: "csp.share", selection: null }]);

  const [ageSexHeld, setAgeSexHeld] = useState(true);
  const [regionHeld, setRegionHeld] = useState(false);
  const [startYear, setStartYear] = useState(DEFAULT_YEAR);
  const [endYear, setEndYear] = useState(DEFAULT_YEAR);

  const [primaryKey, setPrimaryKey] = useState<string | null>(null);
  const [hoveredRegion, setHoveredRegion] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<RegressionResult["points"][number] | null>(null);

  const [result, setResult] = useState<RegressionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Les indicateurs DAMIR « rapportés à la population » : un effectif brut
  // n'a pas sa place comme mesure à expliquer par un territoire.
  const damirRateMetrics = useMemo(
    () => (catalogue?.metrics ?? []).filter((metric) => metric.source === "damir" && metric.rate),
    [catalogue],
  );
  const damirXMetrics = useMemo(
    () => (catalogue?.metrics ?? []).filter((metric) => metric.source === "damir"),
    [catalogue],
  );

  useEffect(() => {
    if (damirRateMetrics.length && !damirRateMetrics.some((metric) => metric.key === yMetric)) {
      setYMetric(damirRateMetrics[0].key);
    }
  }, [damirRateMetrics, yMetric]);

  useEffect(() => {
    if (yKind === "patho" && !yPathology && catalogue?.pathologies.length) {
      setYPathology(catalogue.pathologies[0]);
    }
  }, [yKind, yPathology, catalogue]);

  const yLabel = yKind === "damir"
    ? (damirRateMetrics.find((metric) => metric.key === yMetric)?.label ?? "la mesure")
    : `Prévalence · ${yPathology ?? ""}`;

  const addX = (kind: XKind) => {
    if (xEntries.length >= MAX_X) return;
    const metric = kind === "csp" ? "csp.share" : kind === "patho" ? "patho.prevalence" : damirXMetrics[0]?.key ?? "damir.spend_per_capita";
    const selection = kind === "csp" ? (catalogue?.csp_groups[0] ?? null)
      : kind === "patho" ? (catalogue?.pathologies[0] ?? null) : null;
    setXEntries((current) => [...current, { id: newId(), kind, metric, selection }]);
  };
  const updateX = (id: string, patch: Partial<XEntry>) =>
    setXEntries((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const removeX = (id: string) =>
    setXEntries((current) => (current.length <= 1 ? current : current.filter((item) => item.id !== id)));

  // La première variable existe avant que le catalogue n'ait répondu : sa
  // modalité par défaut ne peut être posée qu'une fois les groupes CSP et les
  // pathologies connus.
  useEffect(() => {
    if (!catalogue) return;
    setXEntries((current) => current.map((entry) => {
      if (entry.selection !== null || entry.kind === "damir") return entry;
      const fallback = entry.kind === "csp" ? catalogue.csp_groups[0] : catalogue.pathologies[0];
      return fallback ? { ...entry, selection: fallback } : entry;
    }));
  }, [catalogue]);

  const xReady = xEntries.every((entry) => entry.kind === "damir" || Boolean(entry.selection));
  const yReady = yKind === "damir" ? Boolean(yMetric) : Boolean(yPathology);
  const ready = Boolean(catalogue) && yReady && xReady && xEntries.length > 0;

  const factors = useMemo(() => {
    const list: string[] = [];
    if (ageSexHeld) list.push("factor.age", "factor.sex");
    if (regionHeld) list.push("factor.region");
    return list;
  }, [ageSexHeld, regionHeld]);

  const payload = useMemo<RegressionRequest>(() => ({
    unit: "region_age_sex",
    response: yKind === "damir" ? yMetric : "patho.prevalence",
    response_selection: yKind === "patho" ? yPathology : null,
    predictors: xEntries.map((entry) => ({
      source: entry.kind, metric: entry.metric, selection: entry.selection,
    })),
    factors,
    start_year: startYear,
    end_year: endYear,
    sex: "all",
    age_band: null,
    family: null,
  }), [yKind, yMetric, yPathology, xEntries, factors, startYear, endYear]);

  const payloadKey = JSON.stringify(payload);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let live = true;
    setLoading(true);
    setError(null);
    runRegression(payload, controller.signal)
      .then((next) => { if (live) { setResult(next); setSelectedPoint(null); } })
      .catch((reason: Error) => {
        if (live && reason.name !== "AbortError") { setError(reason.message); setResult(null); }
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey, ready]);

  const xTerms = useMemo(() => (result?.terms ?? []).filter((term) => !term.group), [result]);

  useEffect(() => {
    if (xTerms.length && !xTerms.some((term) => term.key === primaryKey)) {
      setPrimaryKey(xTerms[0].key);
    }
  }, [xTerms, primaryKey]);

  const primaryTerm = xTerms.find((term) => term.key === primaryKey) ?? xTerms[0] ?? null;

  const regionsInPlay = useMemo(() => {
    const seen = new Set<string>();
    (result?.points ?? []).forEach((point) => { if (point.region) seen.add(point.region); });
    return (catalogue?.regions ?? []).map((item) => item.label).filter((label) => seen.has(label));
  }, [result, catalogue]);

  return (
    <div className="guided">
      <ol className="guided-steps">
        <li>
          <span className="guided-step-label">1 · Que voulez-vous expliquer ?</span>
          <div className="guided-choice-row">
            <label className={`guided-choice ${yKind === "damir" ? "active" : ""}`}>
              <input type="radio" name="y-kind" checked={yKind === "damir"} onChange={() => setYKind("damir")} />
              <span>Une mesure DAMIR rapportée à la population</span>
            </label>
            <label className={`guided-choice ${yKind === "patho" ? "active" : ""}`}>
              <input type="radio" name="y-kind" checked={yKind === "patho"} onChange={() => setYKind("patho")} />
              <span>La prévalence d’une pathologie</span>
            </label>
          </div>
          {yKind === "damir" ? (
            <select value={yMetric} onChange={(event) => setYMetric(event.target.value)} aria-label="Mesure DAMIR expliquée">
              {damirRateMetrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
            </select>
          ) : (
            <select value={yPathology ?? ""} onChange={(event) => setYPathology(event.target.value)} aria-label="Pathologie expliquée">
              {catalogue?.pathologies.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          )}
        </li>

        <li>
          <span className="guided-step-label">2 · Par quoi l’expliquer ?</span>
          <ul className="guided-x-list">
            {xEntries.map((entry) => (
              <li key={entry.id} className="guided-x-row">
                <select
                  value={entry.kind}
                  aria-label="Type de variable"
                  onChange={(event) => {
                    const kind = event.target.value as XKind;
                    const metric = kind === "csp" ? "csp.share" : kind === "patho" ? "patho.prevalence" : (damirXMetrics[0]?.key ?? "damir.spend_per_capita");
                    const selection = kind === "csp" ? (catalogue?.csp_groups[0] ?? null)
                      : kind === "patho" ? (catalogue?.pathologies[0] ?? null) : null;
                    updateX(entry.id, { kind, metric, selection });
                  }}
                >
                  <option value="csp">Part d’un groupe CSP</option>
                  <option value="patho">Prévalence d’une pathologie</option>
                  <option value="damir">Une mesure DAMIR</option>
                </select>
                {entry.kind === "csp" ? (
                  <select value={entry.selection ?? ""} aria-label="Groupe CSP" onChange={(event) => updateX(entry.id, { selection: event.target.value })}>
                    {catalogue?.csp_groups.map((group) => <option key={group} value={group}>{group}</option>)}
                  </select>
                ) : entry.kind === "patho" ? (
                  <select value={entry.selection ?? ""} aria-label="Pathologie" onChange={(event) => updateX(entry.id, { selection: event.target.value })}>
                    {catalogue?.pathologies.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                ) : (
                  <select value={entry.metric} aria-label="Mesure DAMIR" onChange={(event) => updateX(entry.id, { metric: event.target.value })}>
                    {damirXMetrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
                  </select>
                )}
                <button type="button" className="guided-x-remove" onClick={() => removeX(entry.id)} disabled={xEntries.length <= 1} aria-label="Retirer cette variable">✕</button>
              </li>
            ))}
          </ul>
          <div className="guided-x-add">
            <button type="button" onClick={() => addX("csp")} disabled={xEntries.length >= MAX_X}>+ Groupe CSP</button>
            <button type="button" onClick={() => addX("patho")} disabled={xEntries.length >= MAX_X}>+ Pathologie</button>
            <button type="button" onClick={() => addX("damir")} disabled={xEntries.length >= MAX_X}>+ Mesure DAMIR</button>
            {xEntries.length >= MAX_X ? <span className="guided-x-max">Trois variables au plus, pour que les effets restent lisibles.</span> : null}
          </div>
        </li>

        <li>
          <span className="guided-step-label">3 · Contrôles</span>
          <label className="rail-check">
            <input type="checkbox" checked={ageSexHeld} onChange={(event) => setAgeSexHeld(event.target.checked)} />
            <span>À âge et sexe comparables</span>
          </label>
          <label className="rail-check">
            <input type="checkbox" checked={regionHeld} onChange={(event) => setRegionHeld(event.target.checked)} />
            <span>Tenir compte de la région</span>
          </label>
          <div className="period-grid">
            <label><span>De</span>
              <select value={startYear} onChange={(event) => setStartYear(Number(event.target.value))}>
                {Array.from({ length: 10 }, (_, index) => 2015 + index).filter((year) => year <= endYear).map((year) => <option key={year}>{year}</option>)}
              </select>
            </label>
            <label><span>À</span>
              <select value={endYear} onChange={(event) => setEndYear(Number(event.target.value))}>
                {Array.from({ length: 10 }, (_, index) => 2015 + index).filter((year) => year >= startYear).map((year) => <option key={year}>{year}</option>)}
              </select>
            </label>
          </div>
          <p className="rail-note">
            {startYear === endYear
              ? `Millésime ${startYear} : dernier millésime commun aux sources choisies, par défaut.`
              : `Période ${startYear}–${endYear}, cellules agrégées sur ces millésimes.`}
          </p>
        </li>
      </ol>

      <div className="guided-read-note">
        <strong>Comment lire ces résultats</strong>
        <p>
          Chaque point est une cellule région × âge × sexe, jamais une personne. Ces données peuvent dire
          « les territoires où les agriculteurs pèsent plus dépensent plus en indemnités journalières par
          habitant », jamais « un agriculteur consomme plus d’indemnités journalières ».
        </p>
      </div>

      {error ? <div className="explore-error"><strong>Le modèle n’a pas pu être ajusté</strong><span>{error}</span></div> : null}

      {result && xTerms.length ? (
        <>
          <ul className="guided-sentences">
            {xTerms.map((term) => <li key={term.key}>{guidedSentence(term, yLabel, ageSexHeld)}</li>)}
          </ul>

          <section className="guided-chart-card">
            <header><strong>Effet de chaque variable</strong><small>Intervalle à 95 %</small></header>
            <EChart
              option={effectsOption(xTerms, tokens, xTerms[0]?.effect_kind ?? "absolute")}
              height={Math.max(180, 70 + xTerms.length * 46)}
              stale={loading}
              ariaLabel={`Effet de chaque variable sur ${yLabel}, avec intervalle à 95 %`}
            />
          </section>

          {primaryTerm ? (
            <section className="guided-chart-card">
              <header>
                <div><strong>Nuage des cellules</strong><small>{primaryTerm.label} · {yLabel}</small></div>
                {xTerms.length > 1 ? (
                  <select value={primaryKey ?? ""} onChange={(event) => setPrimaryKey(event.target.value)} aria-label="Variable affichée en abscisse">
                    {xTerms.map((term) => <option key={term.key} value={term.key}>{term.label}</option>)}
                  </select>
                ) : null}
              </header>
              <EChart
                option={scatterOption(result.points, primaryTerm, yLabel, tokens, hoveredRegion)}
                height={SCATTER_HEIGHT}
                stale={loading}
                ariaLabel={`Nuage des cellules · ${primaryTerm.label} et ${yLabel}`}
                onInstance={(instance) => {
                  chart.current = instance;
                  if (!instance) return;
                  instance.off("click");
                  instance.on("click", (event: any) => {
                    const point = result.points.filter((item) => item.predictors[primaryTerm.key] !== undefined)[event.dataIndex];
                    if (point) setSelectedPoint(point);
                  });
                }}
              />
              {regionsInPlay.length ? (
                <div className="guided-region-legend" role="list" aria-label="Surligner une région">
                  {regionsInPlay.map((region) => (
                    <button
                      type="button"
                      key={region}
                      className={hoveredRegion === region ? "on" : ""}
                      onMouseEnter={() => setHoveredRegion(region)}
                      onMouseLeave={() => setHoveredRegion(null)}
                      onFocus={() => setHoveredRegion(region)}
                      onBlur={() => setHoveredRegion(null)}
                    >{region}</button>
                  ))}
                </div>
              ) : null}
              {selectedPoint ? (
                <div className="guided-detail-panel" role="dialog" aria-label="Détail de la cellule">
                  <header>
                    <strong>{selectedPoint.label}</strong>
                    <button type="button" onClick={() => setSelectedPoint(null)} aria-label="Fermer le détail">✕</button>
                  </header>
                  <dl>
                    <div><dt>Région</dt><dd>{selectedPoint.region ?? "—"}</dd></div>
                    <div><dt>Tranche d’âge</dt><dd>{selectedPoint.age ?? "—"}</dd></div>
                    <div><dt>Sexe</dt><dd>{selectedPoint.sex ?? "—"}</dd></div>
                    {xTerms.map((term) => (
                      <div key={term.key}><dt>{term.label}</dt><dd>{formatValue(selectedPoint.predictors[term.key])}</dd></div>
                    ))}
                    <div><dt>{yLabel}</dt><dd>{formatValue(selectedPoint.observed)}</dd></div>
                  </dl>
                </div>
              ) : null}
            </section>
          ) : null}

          <p className="guided-fit">
            {result.fit.n} cellules ·{" "}
            {result.fit.explained === null
              ? "part expliquée non calculable"
              : `${Math.round(result.fit.explained * 100)} % de l’écart entre cellules est expliqué par ce modèle`}
            {" — "}le reste tient à des dimensions non incluses.
          </p>

          <details className="regression-notes">
            <summary>Ce que ce modèle ne dit pas</summary>
            <ul>{result.warnings.map((warning) => <li key={warning.text}>{warning.text}</li>)}</ul>
          </details>
        </>
      ) : !error ? (
        <p className="regression-empty">
          {ready ? "Ajustement en cours…" : "Choisissez ce que vous voulez expliquer, et par quoi, pour voir le résultat."}
        </p>
      ) : null}
    </div>
  );
}
