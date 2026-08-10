/** Le modèle, réduit à ce qu'on en fait.
 *
 *  Un croisement répond à « est-ce que ceci va avec cela ? ». Un modèle répond
 *  à la question d'après : « une fois le reste tenu constant, que pèse chaque
 *  variable ? ». C'est tout ce que cet écran ajoute, et il tient en trois
 *  choses : ce qu'on explique, par quoi, et le tableau des effets.
 *
 *  Le tableau **est** l'interface. On y range les variables dans l'ordre qu'on
 *  veut, on trie sur n'importe quelle colonne, et on éteint une variable pour
 *  voir ce qu'elle portait — le modèle se réajuste sans elle. Rien de tout cela
 *  n'est un réglage à remplir d'avance : ce sont des gestes sur le résultat.
 *
 *  Ce qui n'y est pas, volontairement : la sélection automatique de variables,
 *  les interactions, les diagnostics de résidus. Ce n'est pas un logiciel de
 *  modélisation, c'est une première lecture — et ses limites sont écrites avec
 *  elle plutôt que laissées à deviner.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  runRegression,
  type CorrelationCatalogue,
  type RegressionResult,
  type RegressionTerm,
} from "../api";
import { EChart, type EChartsOption } from "../charts/EChart";
import { useChartTokens, type ChartTokens } from "../charts/tokens";

type Props = {
  catalogue: CorrelationCatalogue | null;
  unit: string;
  startYear: number;
  endYear: number;
  sex: "all" | "men" | "women";
  ageBand: string | null;
};

/** Une variable candidate : l'indicateur, et la modalité qu'il exige. */
type Predictor = { source: string; metric: string; selection: string | null; enabled: boolean };

type SortKey = "label" | "effect" | "p_value";

const CHART_HEIGHT = 260;

export function formatEffect(value: number | null | undefined, kind: "percent" | "absolute"): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const number = new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: kind === "percent" ? 1 : 2,
    signDisplay: "exceptZero",
  }).format(value);
  return kind === "percent" ? `${number} %` : number;
}

function formatP(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (value < 0.001) return "< 0,001";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 3 }).format(value);
}

/** Les effets et leur incertitude, sur un seul axe.
 *
 *  Une barre seule se lit comme une certitude. L'intervalle dessiné à sa vraie
 *  largeur montre d'un coup ce qui est établi et ce qui ne l'est pas : un effet
 *  dont l'intervalle traverse zéro ne distingue rien, et cela se voit sans
 *  lire une p-value.
 */
export function effectsOption(terms: RegressionTerm[], tokens: ChartTokens,
                       kind: "percent" | "absolute"): EChartsOption {
  const labels = terms.map((term) => term.label);
  const suffix = kind === "percent" ? " %" : "";

  // L'axe doit contenir les intervalles, pas seulement les estimations : borné
  // sur les seules barres, il rejetait hors du cadre la moitié de ce que
  // l'intervalle a d'informatif — précisément le côté qui traverse zéro. Le
  // zéro y figure toujours, sans quoi la ligne de référence sortirait du cadre.
  const bounds = terms.flatMap((term) => [term.ci_low, term.ci_high, term.effect, 0]);
  const low = Math.min(...bounds);
  const high = Math.max(...bounds);
  const padding = (high - low) * 0.08 || 1;

  return {
    animationDuration: 320,
    backgroundColor: "transparent",
    grid: { left: 12, right: 24, top: 12, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      backgroundColor: tokens.surface,
      borderColor: tokens.line,
      borderWidth: 1,
      padding: [10, 12],
      textStyle: { color: tokens.ink, fontSize: 12, fontFamily: tokens.font },
      extraCssText: "box-shadow: 0 8px 28px rgba(0,0,0,.14); border-radius: 10px;",
      formatter: (params: any) => {
        const term = terms[params.dataIndex];
        if (!term) return "";
        return `<strong>${term.label}</strong><br>`
          + `${formatEffect(term.effect, kind)} par unité en plus<br>`
          + `<span style="color:${tokens.inkMuted}">intervalle à 95 % : `
          + `${formatEffect(term.ci_low, kind)} à ${formatEffect(term.ci_high, kind)}</span>`;
      },
    },
    xAxis: {
      type: "value",
      min: low - padding,
      max: high + padding,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: tokens.inkMuted,
        fontSize: 11,
        fontFamily: tokens.font,
        formatter: (value: number) => `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)}${suffix}`,
      },
      splitLine: { lineStyle: { color: tokens.grid } },
    },
    yAxis: {
      type: "category",
      data: labels,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: {
        color: tokens.inkSecondary,
        fontSize: 12,
        fontFamily: tokens.font,
        width: 210,
        overflow: "truncate",
      },
    },
    // Une seule série de barres : ajouter une seconde décalerait les barres du
    // centre de leur catégorie, et l'intervalle dessiné par-dessus — lui centré
    // — ne tomberait plus en face de la barre qu'il qualifie.
    series: [
      {
        type: "bar",
        data: terms.map((term) => ({
          value: term.effect,
          itemStyle: {
            // La teinte porte le sens du signe, pas l'identité de la variable :
            // c'est la paire divergente, jamais la palette catégorielle.
            color: term.significant
              ? (term.effect >= 0 ? tokens.diverge[5] : tokens.diverge[1])
              : tokens.seriesOther,
            borderRadius: (term.effect >= 0 ? [0, 4, 4, 0] : [4, 0, 0, 4]) as [number, number, number, number],
          },
        })),
        barMaxWidth: 16,
        // Le zéro : la ligne qui décide si un effet dit quelque chose.
        markLine: {
          silent: true,
          symbol: "none",
          lineStyle: { color: tokens.ink, width: 1.25, opacity: 0.55 },
          label: { show: false },
          data: [{ xAxis: 0 }],
        },
      },
      // L'intervalle par-dessus la barre : deux traits et une capsule, dessinés
      // à la main faute de série native.
      {
        type: "custom",
        renderItem: (params: any, api: any) => {
          const term = terms[params.dataIndex];
          if (!term) return null;
          const low = api.coord([term.ci_low, params.dataIndex]);
          const high = api.coord([term.ci_high, params.dataIndex]);
          const y = low[1];
          const cap = 5;
          const style = { stroke: tokens.ink, lineWidth: 1.5, opacity: 0.75 };
          return {
            type: "group",
            children: [
              { type: "line", shape: { x1: low[0], y1: y, x2: high[0], y2: y }, style },
              { type: "line", shape: { x1: low[0], y1: y - cap, x2: low[0], y2: y + cap }, style },
              { type: "line", shape: { x1: high[0], y1: y - cap, x2: high[0], y2: y + cap }, style },
            ],
          };
        },
        data: terms.map((term) => [term.effect, term.label]),
        silent: true,
      },
    ],
  } as EChartsOption;
}

export function RegressionPanel({ catalogue, unit, startYear, endYear, sex, ageBand }: Props) {
  const tokens = useChartTokens();

  const [response, setResponse] = useState("damir.spend_per_capita");
  const [family, setFamily] = useState<string | null>(null);
  const [predictors, setPredictors] = useState<Predictor[]>([]);
  /** `null` = pas encore choisi : on tient alors constant tout ce que l'unité
   *  permet. C'est le défaut défendable — un modèle de la dépense qui ignore
   *  l'âge attribue à ses variables une bonne part de la démographie. */
  const [factors, setFactors] = useState<string[] | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; ascending: boolean } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const [result, setResult] = useState<RegressionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allowedSources = useMemo(
    () => catalogue?.units.find((item) => item.key === unit)?.sources ?? [],
    [catalogue, unit],
  );

  /** Les indicateurs qui peuvent expliquer : tout sauf la mesure expliquée
   *  elle-même, et rien qui n'existe pas sur l'unité choisie. */
  const candidates = useMemo(
    () => (catalogue?.metrics ?? []).filter((metric) =>
      allowedSources.includes(metric.source) && metric.key !== response),
    [catalogue, allowedSources, response],
  );

  const responseOptions = useMemo(
    () => (catalogue?.metrics ?? []).filter((metric) => metric.key.startsWith("damir.")),
    [catalogue],
  );

  const choicesFor = (needs: string | null | undefined): string[] => {
    if (!catalogue) return [];
    if (needs === "pathology") return catalogue.pathologies;
    if (needs === "csp") return catalogue.csp_groups;
    if (needs === "cause") return catalogue.causes;
    return [];
  };

  // Une variable dont la source sort du périmètre de l'unité est retirée plutôt
  // que laissée à produire une erreur au prochain ajustement.
  useEffect(() => {
    setPredictors((current) => current.filter((item) => allowedSources.includes(item.source)));
  }, [allowedSources]);

  const active = useMemo(() => predictors.filter((item) => item.enabled), [predictors]);

  /** Les facteurs que cette unité rend possibles : sur « Région », toutes les
   *  cellules ont le même âge et l'indicatrice serait constante. */
  const offeredFactors = useMemo(
    () => (catalogue?.factors ?? []).filter((factor) =>
      (catalogue?.unit_factors?.[unit] ?? []).includes(factor.key)),
    [catalogue, unit],
  );

  // Par défaut on tient constant l'âge et le sexe — pas la région, dont
  // l'absorption est un choix d'analyse et non une précaution.
  const activeFactors = useMemo(() => {
    const offered = offeredFactors.map((factor) => factor.key);
    if (factors === null) return offered.filter((key) => key !== "factor.region");
    return factors.filter((key) => offered.includes(key));
  }, [factors, offeredFactors]);

  const payload = useMemo(() => ({
    unit,
    response,
    predictors: active.map(({ source, metric, selection }) => ({ source, metric, selection })),
    factors: activeFactors,
    start_year: startYear,
    end_year: endYear,
    sex,
    age_band: ageBand,
    family,
  }), [unit, response, active, activeFactors, startYear, endYear, sex, ageBand, family]);

  const payloadKey = JSON.stringify(payload);

  useEffect(() => {
    if (!active.length) { setResult(null); setError(null); return; }
    const controller = new AbortController();
    let live = true;
    setLoading(true);
    setError(null);
    runRegression(payload, controller.signal)
      .then((next) => { if (live) setResult(next); })
      .catch((reason: Error) => {
        if (live && reason.name !== "AbortError") { setError(reason.message); setResult(null); }
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  const addPredictor = (metricKey: string) => {
    const definition = candidates.find((item) => item.key === metricKey);
    if (!definition) return;
    const selection = definition.needs ? choicesFor(definition.needs)[0] ?? null : null;
    setPredictors((current) => {
      if (current.length >= (catalogue?.max_predictors ?? 4)) return current;
      return [...current, { source: definition.source, metric: definition.key, selection, enabled: true }];
    });
  };

  const rowKey = (item: Predictor) => `${item.metric}::${item.selection ?? ""}`;

  const update = (key: string, patch: Partial<Predictor>) =>
    setPredictors((current) => current.map((item) => (rowKey(item) === key ? { ...item, ...patch } : item)));

  const remove = (key: string) =>
    setPredictors((current) => current.filter((item) => rowKey(item) !== key));

  /* — Le tableau se manipule : on y range, on y trie, on y éteint — */

  const onDrop = (target: string) => {
    if (!dragging || dragging === target) return;
    setPredictors((current) => {
      const from = current.findIndex((item) => rowKey(item) === dragging);
      const to = current.findIndex((item) => rowKey(item) === target);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDragging(null);
  };

  const toggleSort = (key: SortKey) =>
    setSort((current) => (current?.key === key
      ? (current.ascending ? { key, ascending: false } : null)
      : { key, ascending: true }));

  const termFor = (item: Predictor): RegressionTerm | null =>
    result?.terms.find((term) => term.metric === item.metric
      && (term.selection ?? "") === (item.selection ?? "")) ?? null;

  /** L'ordre à l'écran : celui que l'utilisateur a composé, sauf s'il a demandé
   *  un tri. Le tri ne change rien au modèle — un GLM ne dépend pas de l'ordre
   *  de ses colonnes — c'est une façon de lire, pas une façon d'estimer. */
  const rows = useMemo(() => {
    const list = [...predictors];
    if (!sort) return list;
    const direction = sort.ascending ? 1 : -1;
    return list.sort((left, right) => {
      const a = termFor(left);
      const b = termFor(right);
      if (sort.key === "label") {
        return direction * (a?.label ?? left.metric).localeCompare(b?.label ?? right.metric, "fr");
      }
      if (sort.key === "effect") {
        return direction * (Math.abs(a?.effect ?? 0) - Math.abs(b?.effect ?? 0));
      }
      return direction * ((a?.p_value ?? 1) - (b?.p_value ?? 1));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [predictors, sort, result]);

  /** Les niveaux des facteurs, qui ne sont pas des lignes qu'on ajoute ou
   *  retire : ils suivent les dimensions tenues constantes. */
  const factorTerms = useMemo(
    () => (result?.terms ?? []).filter((term) => Boolean(term.group)),
    [result],
  );

  const orderedTerms = useMemo(
    () => [
      ...rows.map(termFor).filter((term): term is RegressionTerm => term !== null),
      ...factorTerms,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, result, factorTerms],
  );

  const effectKind = result?.link === "log" ? "percent" : "absolute";
  const chartRef = useRef<HTMLDivElement | null>(null);
  const full = predictors.length >= (catalogue?.max_predictors ?? 4);

  return (
    <div className="regression">
      <section className="regression-setup">
        <label>
          <span>Expliquer</span>
          <select value={response} onChange={(event) => setResponse(event.target.value)}>
            {responseOptions.map((metric) => (
              <option key={metric.key} value={metric.key}>{metric.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Par</span>
          <select
            value=""
            disabled={full}
            onChange={(event) => { addPredictor(event.target.value); event.target.value = ""; }}
          >
            <option value="">{full ? "Quatre variables au maximum" : "Ajouter une variable…"}</option>
            {candidates.map((metric) => (
              <option key={metric.key} value={metric.key}>{metric.label}</option>
            ))}
          </select>
        </label>

        {result ? (
          <label className="regression-family">
            <span>Lecture</span>
            <select value={family ?? result.family} onChange={(event) => setFamily(event.target.value)}>
              {result.families.filter((item) => item.available).map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </label>
        ) : null}
      </section>

      {/* — Ce qu'on tient constant —
          Le geste le plus important de l'écran, et le plus discret : sans
          l'âge dans le modèle, l'effet d'une variable sociale n'est en bonne
          partie que la pyramide des âges du territoire. */}
      {offeredFactors.length ? (
        <section className="regression-factors">
          <span className="regression-factors-label">Tenir constant</span>
          <div className="regression-factor-chips">
            {offeredFactors.map((factor) => {
              const on = activeFactors.includes(factor.key);
              return (
                <button
                  key={factor.key}
                  type="button"
                  aria-pressed={on}
                  className={on ? "on" : ""}
                  title={factor.hint}
                  onClick={() => setFactors(on
                    ? activeFactors.filter((key) => key !== factor.key)
                    : [...activeFactors, factor.key])}
                >{factor.label}</button>
              );
            })}
          </div>
          <p className="regression-factors-hint">
            {activeFactors.length
              ? "Les effets ci-dessous se lisent à ces dimensions constantes."
              : "Aucune dimension tenue constante : les effets absorbent la démographie du territoire."}
          </p>
        </section>
      ) : null}

      {!predictors.length ? (
        <p className="regression-empty">
          Choisissez une variable explicative : le modèle dira ce qu’elle pèse sur
          la mesure, les autres variables tenues constantes.
        </p>
      ) : null}

      {error ? (
        <div className="analysis-error"><strong>Le modèle n’a pas pu être ajusté</strong><span>{error}</span></div>
      ) : null}

      {predictors.length ? (
        <div className="regression-table-wrap">
          <table className="regression-table">
            <caption className="sr-only">
              Effet de chaque variable sur {result?.response.label ?? "la mesure"}
            </caption>
            <thead>
              <tr>
                <th scope="col" className="regression-grip" aria-label="Ordre" />
                <th scope="col">
                  <button type="button" onClick={() => toggleSort("label")} aria-label="Trier par variable">
                    Variable{sort?.key === "label" ? (sort.ascending ? " ↑" : " ↓") : ""}
                  </button>
                </th>
                <th scope="col">
                  <button type="button" onClick={() => toggleSort("effect")} aria-label="Trier par effet">
                    Effet{sort?.key === "effect" ? (sort.ascending ? " ↑" : " ↓") : ""}
                  </button>
                </th>
                <th scope="col">Intervalle à 95 %</th>
                <th scope="col">
                  <button type="button" onClick={() => toggleSort("p_value")} aria-label="Trier par p-value">
                    p{sort?.key === "p_value" ? (sort.ascending ? " ↑" : " ↓") : ""}
                  </button>
                </th>
                <th scope="col" aria-label="Retirer" />
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const key = rowKey(item);
                const term = termFor(item);
                const definition = catalogue?.metrics.find((metric) => metric.key === item.metric);
                const options = choicesFor(definition?.needs);
                return (
                  <tr
                    key={key}
                    draggable
                    onDragStart={() => setDragging(key)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => onDrop(key)}
                    onDragEnd={() => setDragging(null)}
                    className={`${item.enabled ? "" : "off"} ${dragging === key ? "dragging" : ""}`}
                  >
                    <td className="regression-grip">
                      <span aria-hidden="true">⠿</span>
                    </td>
                    <td>
                      <label className="regression-variable">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={(event) => update(key, { enabled: event.target.checked })}
                          aria-label={`Inclure ${definition?.label ?? item.metric} dans le modèle`}
                        />
                        <span>{definition?.label ?? item.metric}</span>
                      </label>
                      {options.length ? (
                        <select
                          className="regression-selection"
                          value={item.selection ?? ""}
                          onChange={(event) => update(key, { selection: event.target.value })}
                          aria-label="Modalité"
                        >
                          {options.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
                        </select>
                      ) : null}
                    </td>
                    <td className={`regression-effect ${term?.significant ? "strong" : ""}`}>
                      {item.enabled ? formatEffect(term?.effect, effectKind) : "—"}
                    </td>
                    <td className="regression-interval">
                      {item.enabled && term
                        ? `${formatEffect(term.ci_low, effectKind)} … ${formatEffect(term.ci_high, effectKind)}`
                        : "—"}
                    </td>
                    <td className="regression-p">{item.enabled ? formatP(term?.p_value ?? null) : "—"}</td>
                    <td>
                      <button type="button" className="regression-remove" onClick={() => remove(key)} aria-label="Retirer la variable">✕</button>
                    </td>
                  </tr>
                );
              })}

              {/* Les niveaux des facteurs : lisibles, mais pas manipulables ici
                  — ils suivent les puces « Tenir constant ». */}
              {factorTerms.map((term) => (
                <tr key={term.key} className="regression-factor-row">
                  <td className="regression-grip" />
                  <td>
                    <span className="regression-factor-group">{term.group}</span>
                    <span className="regression-factor-level">
                      {term.label}
                      <small> vs {term.reference_level}</small>
                    </span>
                  </td>
                  <td className={`regression-effect ${term.significant ? "strong" : ""}`}>
                    {formatEffect(term.effect, effectKind)}
                  </td>
                  <td className="regression-interval">
                    {formatEffect(term.ci_low, effectKind)} … {formatEffect(term.ci_high, effectKind)}
                  </td>
                  <td className="regression-p">{formatP(term.p_value)}</td>
                  <td />
                </tr>
              ))}
            </tbody>
          </table>
          <p className="regression-hint">
            Glissez une ligne pour la ranger, décochez-en une pour voir le modèle sans elle,
            cliquez un en-tête pour trier.
          </p>
        </div>
      ) : null}

      {result && orderedTerms.length ? (
        <div className="regression-chart" ref={chartRef}>
          <EChart
            option={effectsOption(orderedTerms, tokens, effectKind)}
            height={Math.max(CHART_HEIGHT, 70 + orderedTerms.length * 46)}
            stale={loading}
            ariaLabel={`Effet de chaque variable sur ${result.response.label}, avec intervalle à 95 %`}
          />
        </div>
      ) : null}

      {result ? (
        <>
          {/* Les phrases ne portent que les variables choisies : répéter huit
              tranches d'âge ferait un mur de texte pour dire une courbe. */}
          <ul className="regression-sentences">
            {orderedTerms.filter((term) => !term.group).map((term) => (
              <li key={term.key}>{term.sentence}</li>
            ))}
          </ul>

          <p className="regression-fit">
            {result.fit.n} observations · {result.unit_label.toLowerCase()} ·
            {" "}
            {result.fit.explained === null
              ? "part expliquée non calculable"
              : `${Math.round(result.fit.explained * 100)} % de l’écart au modèle sans variable est expliqué`}
          </p>

          <details className="regression-notes">
            <summary>Ce que ce modèle ne dit pas</summary>
            <ul>
              {result.warnings.map((warning) => <li key={warning.text}>{warning.text}</li>)}
            </ul>
          </details>
        </>
      ) : null}
    </div>
  );
}
