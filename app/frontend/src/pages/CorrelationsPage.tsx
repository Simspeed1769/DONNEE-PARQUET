/** Croiser deux indicateurs — et savoir si le lien tient.
 *
 *  L'écran répond à une question qui se pose en une phrase : « est-ce que ceci
 *  va avec cela ? ». La version précédente y répondait en quatre coefficients
 *  alignés — Pearson, Spearman, p, n — ce qui suppose de savoir lesquels
 *  regarder, et dans quel ordre. Un manager n'a pas cette grille ; un actuaire
 *  l'a, mais ce n'est pas à lui que l'écran doit s'adresser en premier.
 *
 *  L'ordre est donc inversé : **la conclusion en français d'abord**, avec
 *  l'échelle de force qui montre l'estimation *et* son incertitude, puis le
 *  nuage, puis le détail statistique, replié mais entier. Rien n'est retiré —
 *  ce serait perdre l'actuaire — tout est rangé.
 *
 *  L'intervalle de confiance est traité comme le résultat principal, pas comme
 *  une note de bas de page. Sur douze régions il traverse presque toujours
 *  zéro, et c'est précisément ce qu'il faut voir : un r de 0,29 sans son
 *  intervalle se lit comme une tendance, alors qu'il ne distingue rien.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ECharts } from "echarts/core";
import {
  getCorrelationCatalogue,
  runCorrelation,
  type CorrelationCatalogue,
  type CorrelationResult,
} from "../api";
import { EChart, type EChartsOption } from "../charts/EChart";
import { useChartTokens } from "../charts/tokens";
import { RegressionPanel } from "../correlations/RegressionPanel";
import { download, renderSlide, SOURCE_LINE } from "../panorama/exportSlide";

type Props = { onOpenMethodology: () => void };

type Side = "x" | "y";
/** Deux questions, deux écrans : « est-ce que ceci va avec cela ? » et « une
 *  fois le reste tenu constant, que pèse chaque variable ? ». Elles partagent
 *  le périmètre — même unité, même période, même population — et rien d'autre. */
type Mode = "link" | "model";

const CHART_HEIGHT = 440;

/** Force du lien, en toutes lettres. Les seuils n'ont rien d'universel : ils
 *  décrivent l'ampleur observée, jamais une preuve. */
function strength(r: number): string {
  const value = Math.abs(r);
  if (value >= 0.8) return "très fort";
  if (value >= 0.6) return "fort";
  if (value >= 0.4) return "modéré";
  if (value >= 0.2) return "faible";
  return "négligeable";
}

function formatNumber(value: number | null | undefined, digits = 3): string {
  return value === null || value === undefined || Number.isNaN(value)
    ? "—"
    : new Intl.NumberFormat("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatP(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (value < 0.0001) return "< 0,0001";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(value);
}

/** Chaque axe porte son unité propre : un pourcentage de prévalence et des
 *  euros par habitant ne se formatent pas de la même façon. */
function formatAxis(value: number, unit: string): string {
  const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
  return unit ? `${number} ${unit}` : number;
}

function withSelection(label: string, selection: string | null): string {
  return selection ? `${label} · ${selection}` : label;
}

export function CorrelationsPage({ onOpenMethodology }: Props) {
  const tokens = useChartTokens();

  const [catalogue, setCatalogue] = useState<CorrelationCatalogue | null>(null);
  const [mode, setMode] = useState<Mode>("link");
  const [unit, setUnit] = useState("region");
  const [startYear, setStartYear] = useState(2019);
  const [endYear, setEndYear] = useState(2022);
  const [sex, setSex] = useState<"all" | "men" | "women">("all");
  const [ageBand, setAgeBand] = useState<string | null>(null);
  const [detrend, setDetrend] = useState(false);

  const [xMetric, setXMetric] = useState("damir.spend_per_capita");
  const [xSelection, setXSelection] = useState<string | null>(null);
  const [yMetric, setYMetric] = useState("patho.prevalence");
  const [ySelection, setYSelection] = useState<string | null>(null);

  const [result, setResult] = useState<CorrelationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const chart = useRef<ECharts | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getCorrelationCatalogue(controller.signal)
      .then(setCatalogue)
      .catch((reason: Error) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, []);

  const metricsBySource = useMemo(() => {
    const groups = new Map<string, CorrelationCatalogue["metrics"]>();
    catalogue?.metrics.forEach((metric) => {
      groups.set(metric.source, [...(groups.get(metric.source) ?? []), metric]);
    });
    return groups;
  }, [catalogue]);

  const currentUnit = catalogue?.units.find((item) => item.key === unit) ?? null;
  const allowedSources = currentUnit?.sources ?? [];

  const definitionOf = (key: string) => catalogue?.metrics.find((item) => item.key === key) ?? null;
  const xDefinition = definitionOf(xMetric);
  const yDefinition = definitionOf(yMetric);

  const choicesFor = (needs: string | null | undefined): string[] => {
    if (!catalogue) return [];
    if (needs === "pathology") return catalogue.pathologies;
    if (needs === "csp") return catalogue.csp_groups;
    if (needs === "cause") return catalogue.causes;
    return [];
  };

  // Un indicateur dont la source sort du périmètre de l'unité choisie est
  // remplacé plutôt que laissé en erreur.
  useEffect(() => {
    if (!catalogue || !allowedSources.length) return;
    const repair = (metric: string, fallback: string) => {
      const definition = definitionOf(metric);
      return definition && allowedSources.includes(definition.source) ? metric : fallback;
    };
    setXMetric((current) => repair(current, "damir.spend_per_capita"));
    setYMetric((current) => repair(current, "patho.prevalence"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unit, catalogue]);

  useEffect(() => {
    const needs = xDefinition?.needs;
    if (needs && !xSelection) setXSelection(choicesFor(needs)[0] ?? null);
    if (!needs && xSelection) setXSelection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xMetric, catalogue]);

  useEffect(() => {
    const needs = yDefinition?.needs;
    if (needs && !ySelection) setYSelection(choicesFor(needs)[0] ?? null);
    if (!needs && ySelection) setYSelection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yMetric, catalogue]);

  const payload = useMemo(() => ({
    unit,
    x: { source: xDefinition?.source ?? "damir", metric: xMetric, selection: xSelection },
    y: { source: yDefinition?.source ?? "patho", metric: yMetric, selection: ySelection },
    start_year: startYear,
    end_year: endYear,
    sex,
    age_band: ageBand,
    detrend,
  }), [unit, xDefinition, xMetric, xSelection, yDefinition, yMetric, ySelection,
       startYear, endYear, sex, ageBand, detrend]);

  // En mode « Modèle », le nuage de points n'est pas à l'écran : le calculer
  // ferait balayer le cube pour un résultat que personne ne regarde.
  const ready = mode === "link"
    && Boolean(catalogue)
    && (!xDefinition?.needs || Boolean(xSelection))
    && (!yDefinition?.needs || Boolean(ySelection));

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    runCorrelation(payload, controller.signal)
      .then((next) => { if (active) setResult(next); })
      .catch((reason: Error) => {
        if (active && reason.name !== "AbortError") { setError(reason.message); setResult(null); }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [JSON.stringify(payload), ready]);

  const statistics = result?.statistics ?? null;

  /* — La question, telle qu'on la poserait à voix haute — */

  const question = useMemo(() => {
    if (!result) return null;
    return `${withSelection(result.y.label, result.y.selection)} en fonction de `
      + `${withSelection(result.x.label, result.x.selection).toLowerCase()}`;
  }, [result]);

  /* — La réponse — */

  const answer = useMemo(() => {
    if (!result || !statistics || statistics.pearson === null) return null;
    const r = statistics.pearson;
    const p = statistics.p_value ?? 1;
    const significant = p < 0.05;
    const crossesZero = statistics.ci_low !== null && statistics.ci_high !== null
      && statistics.ci_low <= 0 && statistics.ci_high >= 0;

    // Deux effectifs bruts corrèlent parce que les grandes régions sont
    // grandes. Ce n'est pas un résultat faible, c'est un résultat vide.
    if (!result.x.rate && !result.y.rate && result.unit !== "year") {
      return {
        tone: "critical" as const,
        verdict: "Ce croisement n’est pas interprétable",
        why: "Les deux axes sont des effectifs bruts. Ce qu’on mesure ici est la taille "
          + "des régions, pas un lien entre les deux phénomènes : les grandes régions ont "
          + "beaucoup des deux, les petites peu des deux.",
        fix: "Choisissez de part et d’autre un indicateur rapporté à la population — "
          + "une prévalence, un taux, une dépense par habitant.",
      };
    }
    if (!significant || crossesZero) {
      return {
        tone: "neutral" as const,
        verdict: "On ne peut rien conclure",
        why: `Avec ${statistics.n} observations, un coefficient de ${formatNumber(r, 2)} `
          + `n’est pas distinguable du hasard. L’intervalle de confiance contient zéro : `
          + "au vu de ces données, la relation pourrait tout aussi bien être inverse, ou nulle.",
        fix: result.minimum_detectable_r
          ? `Sur ce nombre d’observations, seul un lien d’au moins |r| = ${formatNumber(result.minimum_detectable_r, 2)} `
            + "pourrait être établi. Élargissez l’unité d’observation pour gagner des points."
          : null,
      };
    }
    return {
      tone: "positive" as const,
      verdict: `Lien ${strength(r)} et ${r > 0 ? "croissant" : "décroissant"}`,
      why: `Sur ${statistics.n} observations, quand ${result.x.label.toLowerCase()} augmente, `
        + `${result.y.label.toLowerCase()} ${r > 0 ? "augmente" : "diminue"} aussi. `
        + `La relation rend compte d’environ ${Math.round((statistics.r_squared ?? 0) * 100)} % `
        + "de ce qui varie d’une observation à l’autre.",
      fix: "Une association n’est pas une cause : les deux phénomènes peuvent dépendre "
        + "d’un troisième, l’âge de la population par exemple.",
    };
  }, [result, statistics]);

  /* — Le nuage — */

  const option = useMemo<EChartsOption>(() => {
    if (!result || !result.points.length) return {};
    const xs = result.points.map((point) => point.x);
    const minimum = Math.min(...xs);
    const maximum = Math.max(...xs);
    const slope = statistics?.slope ?? null;
    const intercept = statistics?.intercept ?? null;
    const conclusive = answer?.tone === "positive";

    return {
      animationDuration: 400,
      backgroundColor: "transparent",
      grid: { left: 12, right: 32, top: 28, bottom: 12, containLabel: true },
      tooltip: {
        trigger: "item",
        backgroundColor: tokens.surface,
        borderColor: tokens.line,
        borderWidth: 1,
        padding: [10, 12],
        textStyle: { color: tokens.ink, fontSize: 12, fontFamily: tokens.font },
        extraCssText: "box-shadow: 0 8px 28px rgba(0,0,0,.14); border-radius: 10px;",
        formatter: (params: any) => {
          const point = result.points[params.dataIndex];
          return `<div style="font-weight:650;margin-bottom:6px">${point.label}</div>
            <div style="color:${tokens.inkSecondary}">${result.x.label} · <b style="color:${tokens.ink}">${formatAxis(point.x, result.x.unit)}</b></div>
            <div style="color:${tokens.inkSecondary}">${result.y.label} · <b style="color:${tokens.ink}">${formatAxis(point.y, result.y.unit)}</b></div>`;
        },
      },
      xAxis: {
        type: "value", scale: true,
        name: `${result.x.label}${result.x.unit ? ` (${result.x.unit})` : ""}`,
        nameLocation: "middle", nameGap: 34,
        nameTextStyle: { color: tokens.inkSecondary, fontSize: 12, fontFamily: tokens.font },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: tokens.inkMuted, fontSize: 12, fontFamily: tokens.font },
        splitLine: { show: true, lineStyle: { color: tokens.grid, width: 1 } },
      },
      yAxis: {
        type: "value", scale: true,
        name: `${result.y.label}${result.y.unit ? ` (${result.y.unit})` : ""}`,
        nameLocation: "end", nameGap: 14,
        nameTextStyle: { color: tokens.inkSecondary, fontSize: 12, fontFamily: tokens.font, align: "left" },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: tokens.inkMuted, fontSize: 12, fontFamily: tokens.font },
        splitLine: { show: true, lineStyle: { color: tokens.grid, width: 1 } },
      },
      series: [
        {
          type: "scatter",
          data: result.points.map((point) => [point.x, point.y]),
          symbolSize: 14,
          itemStyle: {
            color: tokens.series[0],
            borderColor: tokens.surface,
            borderWidth: 2,
          },
          // Nommer chaque point ne tient qu'en petit nombre ; au-delà,
          // l'infobulle prend le relais.
          label: result.points.length <= 14 ? {
            show: true, position: "right", distance: 8,
            color: tokens.inkSecondary, fontSize: 11, fontFamily: tokens.font,
            formatter: (params: any) => result.points[params.dataIndex].region
              ?? result.points[params.dataIndex].label,
          } : { show: false },
          labelLayout: { hideOverlap: true },
        },
        // La droite d'ajustement n'est tracée que lorsqu'elle veut dire quelque
        // chose. Sur un résultat non concluant, elle donne à voir une pente que
        // les données ne soutiennent pas : c'est le trait qu'on retient.
        ...(conclusive && slope !== null && intercept !== null ? [{
          type: "line" as const,
          silent: true,
          symbol: "none" as const,
          data: [
            [minimum, intercept + slope * minimum],
            [maximum, intercept + slope * maximum],
          ],
          lineStyle: { color: tokens.inkMuted, width: 2, type: "dashed" as const },
        }] : []),
      ],
    } as EChartsOption;
  }, [result, statistics, tokens, answer]);

  /* — Emporter le nuage — */

  const scope = useMemo(() => {
    if (!result) return "";
    return [
      startYear === endYear ? String(startYear) : `${startYear}–${endYear}`,
      result.unit_label.toLowerCase(),
      sex === "all" ? "femmes et hommes" : sex === "men" ? "hommes" : "femmes",
      ageBand ? catalogue?.age_bands.find((band) => band.key === ageBand)?.label ?? null : "tous âges",
      result.detrended ? "tendance annuelle retirée" : null,
    ].filter((part): part is string => Boolean(part)).join(" · ");
  }, [result, startYear, endYear, sex, ageBand, catalogue]);

  /** Une seule sortie image, et c'est un fichier : le presse-papiers doublait
   *  le même geste avec ses propres échecs selon le navigateur. Ce que l'écran
   *  range — la conclusion, les réserves — repart en revanche dans l'image, qui
   *  circule sans personne pour la commenter. */
  const exportChart = useCallback(async () => {
    const instance = chart.current;
    if (!instance || !result || !question) return;
    setNotice(null);
    const title = question.charAt(0).toUpperCase() + question.slice(1);
    try {
      const blob = await renderSlide(instance, {
        title,
        reading: answer ? `${answer.verdict}. ${answer.why}` : null,
        caveats: [
          ...(result.warnings ?? []).map((warning) => warning.text),
          ...(answer?.fix ? [answer.fix] : []),
        ],
        scope,
      }, tokens);
      download(blob, title);
      setNotice("Image enregistrée.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "L’image n’a pas pu être produite.");
    }
  }, [result, question, answer, scope, tokens]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /* — Sélecteurs — */

  const metricPicker = (side: Side, caption: string) => {
    const metric = side === "x" ? xMetric : yMetric;
    const setMetric = side === "x" ? setXMetric : setYMetric;
    const selection = side === "x" ? xSelection : ySelection;
    const setSelection = side === "x" ? setXSelection : setYSelection;
    const definition = side === "x" ? xDefinition : yDefinition;
    const choices = choicesFor(definition?.needs);

    return (
      <div className="cross-field">
        <span className="cross-axis">{caption}</span>
        <select
          value={metric}
          onChange={(event) => { setMetric(event.target.value); setSelection(null); }}
          aria-label={caption}
        >
          {[...metricsBySource.entries()]
            .filter(([source]) => allowedSources.includes(source))
            .map(([source, metrics]) => (
              <optgroup key={source} label={
                source === "damir" ? "Dépenses DAMIR"
                  : source === "patho" ? "Pathologies"
                  : source === "csp" ? "Catégories socio-professionnelles"
                  : "Mortalité"
              }>
                {metrics.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}{item.rate ? "" : " · effectif brut"}
                  </option>
                ))}
              </optgroup>
            ))}
        </select>
        {choices.length ? (
          <select
            value={selection ?? ""}
            onChange={(event) => setSelection(event.target.value || null)}
            aria-label={`Modalité · ${caption}`}
          >
            {choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
          </select>
        ) : null}
      </div>
    );
  };

  const swap = () => {
    setXMetric(yMetric);
    setYMetric(xMetric);
    setXSelection(ySelection);
    setYSelection(xSelection);
  };

  const years = Array.from({ length: 2024 - 2015 + 1 }, (_, index) => 2015 + index);

  return (
    <div className="explore cross">
      <header className="explore-head">
        <div>
          <span className="explore-eyebrow">Croisements entre sources</span>
          <h1>{mode === "link" ? "Croiser deux indicateurs" : "Mesurer le poids d’une variable"}</h1>
          <p>
            {mode === "link"
              ? "Est-ce que l’un va avec l’autre — et le lien tient-il ?"
              : "Ce que chaque variable pèse sur la mesure, les autres tenues constantes."}
          </p>
        </div>
        <div className="explore-head-side">
          <div className="segmented" role="tablist" aria-label="Question posée">
            <button type="button" role="tab" aria-selected={mode === "link"}
              className={mode === "link" ? "active" : ""}
              onClick={() => setMode("link")}>Lien</button>
            <button type="button" role="tab" aria-selected={mode === "model"}
              className={mode === "model" ? "active" : ""}
              onClick={() => setMode("model")}>Modèle</button>
          </div>
          <button type="button" className="ghost-button" onClick={onOpenMethodology}>Définitions &amp; méthode</button>
        </div>
      </header>

      <div className="explore-body">
        <aside className="explore-rail" aria-label="Paramètres du croisement">
          {mode === "link" ? (
            <section className="rail-block">
              <div className="rail-title"><div><strong>Ce qu’on croise</strong><small>Deux indicateurs</small></div></div>
              {metricPicker("y", "On regarde")}
              {metricPicker("x", "en fonction de")}
              <button type="button" className="cross-swap" onClick={swap}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4v16M7 4 4 7m3-3 3 3M17 20V4m0 16-3-3m3 3 3-3"/></svg>
                Inverser les deux
              </button>
            </section>
          ) : null}

          <section className="rail-block">
            <div className="rail-title"><div><strong>Un point représente</strong><small>L’unité d’observation</small></div></div>
            <div className="dimension-grid">
              {catalogue?.units.map((item) => (
                <button key={item.key} type="button"
                  className={unit === item.key ? "active" : ""}
                  onClick={() => setUnit(item.key)}>{item.label}</button>
              ))}
            </div>
            {currentUnit ? <p className="rail-note">{currentUnit.hint}</p> : null}
            {unit === "region_year" ? (
              <label className="rail-check">
                <input type="checkbox" checked={detrend} onChange={(event) => setDetrend(event.target.checked)} />
                <span>Retirer la tendance commune des années</span>
              </label>
            ) : null}
          </section>

          <section className="rail-block">
            <div className="rail-title"><div><strong>Sur quelle population</strong><small>Le périmètre observé</small></div></div>
            <div className="period-grid">
              <label><span>De</span>
                <select value={startYear} onChange={(event) => setStartYear(Number(event.target.value))}>
                  {years.filter((year) => year <= endYear).map((year) => <option key={year}>{year}</option>)}
                </select>
              </label>
              <label><span>À</span>
                <select value={endYear} onChange={(event) => setEndYear(Number(event.target.value))}>
                  {years.filter((year) => year >= startYear).map((year) => <option key={year}>{year}</option>)}
                </select>
              </label>
            </div>
            <label className="rail-inline">
              <span>Sexe</span>
              <select value={sex} onChange={(event) => setSex(event.target.value as typeof sex)}>
                <option value="all">Tous</option>
                <option value="men">Hommes</option>
                <option value="women">Femmes</option>
              </select>
            </label>
            <label className="rail-inline">
              <span>Tranche d’âge</span>
              <select value={ageBand ?? ""} onChange={(event) => setAgeBand(event.target.value || null)}>
                <option value="">Tous les âges</option>
                {catalogue?.age_bands.map((band) => (
                  <option key={band.key} value={band.key}>{band.label}</option>
                ))}
              </select>
            </label>
            <p className="rail-note">
              Douze régions sont communes aux trois sources régionales. La Corse est absente
              de DAMIR et les DOM y sont agrégés ; elles sont écartées plutôt qu’appariées à tort.
            </p>
          </section>
        </aside>

        <main className="explore-canvas">
          {mode === "model" ? (
            <RegressionPanel
              catalogue={catalogue}
              unit={unit}
              startYear={startYear}
              endYear={endYear}
              sex={sex}
              ageBand={ageBand}
            />
          ) : <>
          {error ? <div className="explore-error"><strong>Ce croisement n’est pas possible</strong><span>{error}</span></div> : null}

          {/* — La réponse, avant tout le reste — */}
          {answer && statistics ? (
            <section className={`answer ${answer.tone}`} aria-label="Conclusion du croisement">
              <p className="answer-question">{question}</p>
              <h2>{answer.verdict}</h2>
              <StrengthScale
                r={statistics.pearson}
                low={statistics.ci_low}
                high={statistics.ci_high}
              />
              {/* Le verdict et l'échelle suffisent à décider ; le raisonnement
                  qui les justifie reste entier, mais replié — sans quoi il
                  poussait le nuage de points hors du premier écran. */}
              <details className="answer-detail">
                <summary>Pourquoi</summary>
                <p className="answer-why">{answer.why}</p>
                {answer.fix ? <p className="answer-fix">{answer.fix}</p> : null}
              </details>
            </section>
          ) : null}

          <section className="chart-card">
            <div className="chart-caption">
              <p>{scope}</p>
            </div>
            {result && result.points.length ? (
              <EChart
                option={option}
                height={CHART_HEIGHT}
                stale={loading}
                ariaLabel={`Nuage de points : ${question ?? ""}`}
                onInstance={(instance) => { chart.current = instance; }}
              />
            ) : (
              <div className="chart-placeholder"><div className="skeleton" /></div>
            )}
            <footer className="chart-footer">
              <span>{SOURCE_LINE.replace("Open DAMIR, Assurance Maladie", "Open DAMIR · Cartographie des pathologies · Insee · CépiDc")}</span>
              <div>
                {notice ? <span className="damir-notice" role="status">{notice}</span> : null}
                <button type="button" onClick={exportChart} disabled={!result?.points.length}>
                  Enregistrer en PNG
                </button>
              </div>
            </footer>
          </section>

          {/* — Le détail statistique : rangé, jamais retiré — */}
          <details className="stat-detail">
            <summary>Le détail statistique</summary>
            <dl>
              <div>
                <dt>Coefficient de Pearson</dt>
                <dd>{formatNumber(statistics?.pearson, 3)}</dd>
                <p>Mesure la force d’une relation <em>linéaire</em>, entre −1 et +1.</p>
              </div>
              <div>
                <dt>Intervalle de confiance à 95 %</dt>
                <dd>
                  {statistics?.ci_low === null || statistics?.ci_low === undefined ? "—"
                    : `[${formatNumber(statistics.ci_low, 2)} ; ${formatNumber(statistics.ci_high, 2)}]`}
                </dd>
                <p>La fourchette dans laquelle se trouve vraisemblablement le vrai coefficient.
                  S’il contient zéro, aucune direction ne peut être affirmée.</p>
              </div>
              <div>
                <dt>Coefficient de Spearman</dt>
                <dd>{formatNumber(statistics?.spearman, 3)}</dd>
                <p>La même chose sur les rangs plutôt que sur les valeurs : insensible aux
                  points extrêmes, et capable de repérer une relation qui monte sans être droite.</p>
              </div>
              <div>
                <dt>p-value</dt>
                <dd>{formatP(statistics?.p_value ?? null)}</dd>
                <p>Probabilité d’observer un lien au moins aussi marqué s’il n’en existait
                  aucun. Sous 0,05, on écarte l’hypothèse du hasard — sans rien prouver de plus.</p>
              </div>
              <div>
                <dt>Part de variation expliquée (r²)</dt>
                <dd>{statistics?.r_squared === null || statistics?.r_squared === undefined
                  ? "—" : `${Math.round(statistics.r_squared * 100)} %`}</dd>
                <p>Ce que la relation rend compte de l’écart entre observations. Le reste
                  tient à autre chose.</p>
              </div>
              <div>
                <dt>Observations</dt>
                <dd>{statistics?.n ?? "—"}</dd>
                <p>{result?.minimum_detectable_r
                  ? `Sur ce nombre, seul un lien d’au moins |r| = ${formatNumber(result.minimum_detectable_r, 2)} pourrait être établi.`
                  : "Nombre de points réellement appariés entre les deux sources."}</p>
              </div>
            </dl>
          </details>

          {result?.warnings.length ? (
            <div className="cross-warnings">
              {result.warnings.map((warning) => (
                <p key={warning.text} className={warning.level}>{warning.text}</p>
              ))}
            </div>
          ) : null}
          </>}
        </main>
      </div>
    </div>
  );
}

/** L'échelle de force : l'estimation **et** son incertitude, sur le même axe.
 *
 *  C'est la pièce qui remplace quatre coefficients alignés. Un point seul se
 *  lit comme une certitude ; le même point avec sa barre montre d'un coup s'il
 *  reste du côté de zéro. Sur douze régions, la barre traverse presque toujours
 *  zéro — et c'est là toute l'information.
 */
function StrengthScale({ r, low, high }: { r: number | null; low: number | null; high: number | null }) {
  if (r === null) return null;
  // −1 → 0 %, +1 → 100 %.
  const place = (value: number) => `${((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100}%`;
  const hasInterval = low !== null && high !== null;
  const crossesZero = hasInterval && low <= 0 && high >= 0;

  return (
    <figure className="strength" aria-hidden="true">
      <div className="strength-track">
        {hasInterval ? (
          <span
            className={`strength-band ${crossesZero ? "crosses" : ""}`}
            style={{ left: place(low), right: `calc(100% - ${place(high)})` }}
          />
        ) : null}
        <span className="strength-zero" />
        <span className="strength-mark" style={{ left: place(r) }}>
          <b>{new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(r)}</b>
        </span>
      </div>
      <figcaption>
        <span>−1 · lien inverse</span>
        <span>0 · aucun lien</span>
        <span>+1 · lien direct</span>
      </figcaption>
    </figure>
  );
}
