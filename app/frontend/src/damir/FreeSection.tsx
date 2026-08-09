/** Composer soi-même la comparaison.
 *
 *  Les deux autres sections répondent à des questions posées d'avance : « à
 *  quoi ressemble cette prestation », « laquelle pèse le plus ». Celle-ci ne
 *  pose aucune question — c'est l'utilisateur qui l'écrit, en assemblant trois
 *  choses et trois seulement :
 *
 *  1. **Ce qui court en abscisse** — les années, une dimension du cube, ou rien
 *     (auquel cas chaque série devient une barre, et c'est le cas le plus
 *     simple : deux barres, deux périmètres).
 *  2. **Ce qui se lit en ordonnée** — la mesure.
 *  3. **Ce qu'on met en regard** — des séries, chacune avec son propre jeu de
 *     filtres. C'est là qu'est la liberté : rien n'oblige deux séries à porter
 *     sur la même population, ni sur la même prestation.
 *
 *  La construction est progressive : à l'ouverture il n'y a qu'une série et un
 *  axe, et les commandes n'apparaissent qu'au fur et à mesure qu'elles ont un
 *  sens. On n'affiche jamais un formulaire de vingt champs.
 *
 *  Le prix de cette liberté est dit, pas caché : deux séries de périmètres
 *  différents ne s'additionnent pas, et chaque série porte ses filtres écrits
 *  sous son nom.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { runExplore } from "../api";
import { EChart } from "../charts/EChart";
import { buildOption, pieOption, type ChartForm, type ChartSeries } from "../charts/buildOption";
import { paletteColor, useChartTokens } from "../charts/tokens";
import { AdvancedFilterPanel } from "../components/AdvancedFilterPanel";
import { MultiSelect } from "../components/MultiSelect";
import {
  assignColorSlots, evaluate, periodValueOf, valuesOf,
  type ExploreMeasure, type ExploreResponse, type ExploreSeries,
} from "../explore/model";
import { scopeChips } from "../explore/seriesScope";
import type { AdvancedFilters } from "../types";
import { csvFromRows, defaultFilters, formatValue, writeFilters } from "../utils";
import type { SectionProps } from "./PanoramaSection";

/** L'axe des abscisses. `none` met une barre par série — la forme la plus
 *  directe de « je compare ces deux choses ». */
type AxisKey = "year" | "none" | string;

const MAX_SERIES = 8;
const CHART_HEIGHT = 452;

type FreeSeries = {
  key: string;
  /** Nom donné par l'utilisateur ; vide, il se déduit des filtres. */
  name: string;
  filters: AdvancedFilters;
};

type ViewKey = "line" | "bar" | "stack" | "rank" | "pie";

const VIEWS: Array<{ key: ViewKey; label: string; form: ChartForm; needsAxis?: boolean; needsAdditive?: boolean }> = [
  { key: "line", label: "Courbes", form: "line", needsAxis: true },
  { key: "bar", label: "Barres", form: "bar" },
  { key: "stack", label: "Empilé", form: "stack", needsAxis: true, needsAdditive: true },
  { key: "rank", label: "Classement", form: "rank" },
  { key: "pie", label: "Camembert", form: "pie", needsAdditive: true },
];

let counter = 0;
function newKey(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter}`;
}

export function FreeSection({
  metadata, routeVersion, filters, measureKey, setMeasureKey, onOpenExtraction,
}: SectionProps) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();

  const [axis, setAxis] = useState<AxisKey>(() => params.get("axis") || "year");
  const [viewKey, setViewKey] = useState<ViewKey>(() => {
    const raw = params.get("view_free");
    return VIEWS.some((item) => item.key === raw) ? raw as ViewKey : "line";
  });
  const [series, setSeries] = useState<FreeSeries[]>(() => {
    const raw = params.get("free");
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as FreeSeries[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      } catch {
        // Une adresse bricolée ne doit pas empêcher l'écran de s'ouvrir.
      }
    }
    return [{ key: newKey(), name: "", filters: { ...filters } }];
  });
  const [editing, setEditing] = useState<string | null>(null);

  const [results, setResults] = useState<Record<string, ExploreResponse>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const slotMemory = useRef<Map<string, number>>(new Map());

  const dimensions = useMemo(() => {
    const first = Object.values(results)[0];
    return first?.dimensions ?? [];
  }, [results]);

  /** Chaque série a son périmètre : chacune demande donc sa propre agrégation.
   *  Huit au plus, et le cube répond en quelques centaines de millisecondes. */
  const fetchKey = useMemo(
    () => JSON.stringify({ axis, series: series.map((item) => [item.key, item.filters]) }),
    [axis, series],
  );

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setLoading(true);
    setError(null);
    Promise.all(series.map((item) =>
      runExplore({
        ...item.filters,
        // L'axe décide du découpage demandé : les années n'en réclament aucun,
        // une dimension devient le découpage, « rien » non plus.
        breakdown: axis === "year" || axis === "none" ? "none" : axis,
        time_axis: "care",
        rank_by: measureKey,
        pinned: [],
      }, controller.signal).then((result) => [item.key, result] as const)))
      .then((entries) => { if (live) setResults(Object.fromEntries(entries)); })
      .catch((reason: Error) => {
        if (live && reason.name !== "AbortError") { setError(reason.message); setResults({}); }
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, measureKey]);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("axis", axis);
    next.set("view_free", viewKey);
    next.set("free", JSON.stringify(series));
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [axis, viewKey, series]);

  const sample = Object.values(results)[0] ?? null;
  const measure: ExploreMeasure | null = useMemo(
    () => sample?.measures.find((item) => item.key === measureKey) ?? sample?.measures[0] ?? null,
    [sample, measureKey],
  );
  const additive = measure?.additive ?? true;

  const measureFamilies = useMemo(() => {
    const groups = new Map<string, ExploreMeasure[]>();
    sample?.measures.forEach((item) => groups.set(item.family, [...(groups.get(item.family) ?? []), item]));
    return [...groups.entries()];
  }, [sample]);

  const slots = useMemo(
    () => assignColorSlots(series.map((item) => item.key), slotMemory.current, MAX_SERIES),
    [series],
  );

  /** Le nom d'une série : le sien s'il est écrit, sinon ce qui la distingue du
   *  périmètre par défaut — et « Tout le périmètre » si rien ne la distingue. */
  const nameOf = (item: FreeSeries): string => {
    if (item.name.trim()) return item.name.trim();
    const chips = scopeChips(item.filters, defaultFilters(metadata), metadata);
    return chips.length ? chips.map((chip) => chip.text).join(" · ") : "Tout le périmètre";
  };

  /* — Les catégories de l'axe — */

  const categories = useMemo<Array<{ key: string; label: string }>>(() => {
    if (axis === "year") {
      return (sample?.years ?? []).map((year) => ({ key: String(year), label: String(year) }));
    }
    if (axis === "none") return [{ key: "__all__", label: measure?.label ?? "" }];
    // Une dimension : l'union des modalités rencontrées, ordonnée par le poids
    // qu'elles ont dans la première série — un ordre stable d'une série à
    // l'autre, sans quoi l'axe danserait.
    const seen = new Map<string, string>();
    Object.values(results).forEach((result) => {
      result.series.forEach((bucket) => {
        if (!bucket.is_other) seen.set(bucket.key, bucket.label);
      });
    });
    const lead = Object.values(results)[0];
    const order = lead && measure
      ? lead.series.filter((bucket) => !bucket.is_other)
        .sort((left, right) =>
          Math.abs(periodValueOf(right, measure, lead.components) ?? 0)
          - Math.abs(periodValueOf(left, measure, lead.components) ?? 0))
        .map((bucket) => bucket.key)
      : [...seen.keys()];
    const ordered = [...order.filter((key) => seen.has(key)),
                     ...[...seen.keys()].filter((key) => !order.includes(key))];
    return ordered.map((key) => ({ key, label: seen.get(key) ?? key }));
  }, [axis, sample, results, measure]);

  const chartSeries = useMemo<ChartSeries[]>(() => {
    if (!measure) return [];
    return series.map((item) => {
      const result = results[item.key];
      const colorIndex = slots.get(item.key) ?? 0;
      if (!result) {
        return { key: item.key, label: nameOf(item), isOther: false, colorIndex, values: [] };
      }
      let values: Array<number | null>;
      if (axis === "year") {
        values = valuesOf(result.total, measure, result.components, result.years.length);
      } else if (axis === "none") {
        values = [periodValueOf(result.total, measure, result.components)];
      } else {
        const byKey = new Map(result.series.map((bucket) => [bucket.key, bucket]));
        values = categories.map((category) => {
          const bucket = byKey.get(category.key);
          return bucket ? periodValueOf(bucket, measure, result.components) : null;
        });
      }
      return { key: item.key, label: nameOf(item), isOther: false, colorIndex, values };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, results, measure, axis, categories, slots, metadata]);

  const availableViews = useMemo(
    () => VIEWS.filter((item) =>
      (!item.needsAxis || axis !== "none") && (!item.needsAdditive || additive)),
    [axis, additive],
  );
  const view = useMemo(
    () => availableViews.find((item) => item.key === viewKey) ?? availableViews[0] ?? VIEWS[1],
    [availableViews, viewKey],
  );

  const kind = measure?.kind ?? "money";
  const option = useMemo(() => {
    if (view.form === "pie") {
      return pieOption({
        slices: chartSeries.map((item) => ({
          key: item.key, label: item.label, colorIndex: item.colorIndex,
          // Un camembert décompose un tout : c'est la valeur de période de
          // chaque série, pas sa suite annuelle.
          value: item.values.reduce<number>((sum, value) => sum + (value ?? 0), 0),
        })),
        tokens, kind, centerLabel: "total des séries",
      });
    }
    return buildOption({
      form: view.form,
      categories: categories.map((item) => item.label),
      series: chartSeries,
      kind,
      unitLabel: measure?.unit_label ?? "",
      tokens,
      directLabels: view.form === "line" && chartSeries.length > 1 && chartSeries.length <= 6,
    });
  }, [view, categories, chartSeries, kind, measure, tokens]);

  /* — Composer — */

  const addSeries = () => {
    if (series.length >= MAX_SERIES) return;
    // La nouvelle série part du périmètre de la dernière : on compose en
    // partant de ce qu'on a, on ne recommence pas à zéro.
    const previous = series[series.length - 1];
    const key = newKey();
    setSeries((current) => [...current, {
      key, name: "", filters: { ...(previous?.filters ?? defaultFilters(metadata)) },
    }]);
    setEditing(key);
  };

  const update = (key: string, patch: Partial<FreeSeries>) =>
    setSeries((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));

  const remove = (key: string) =>
    setSeries((current) => (current.length <= 1 ? current : current.filter((item) => item.key !== key)));

  const tableRows = useMemo(
    () => chartSeries.map((item) => {
      const row: Record<string, string> = { label: item.label };
      categories.forEach((category, index) => {
        row[category.label] = formatValue(item.values[index], kind);
      });
      return row;
    }),
    [chartSeries, categories, kind],
  );

  const exportCsv = () => {
    const columns = [
      { key: "label", label: "Série" },
      ...categories.map((category) => ({ key: category.label, label: category.label })),
    ];
    const blob = new Blob([csvFromRows(columns, tableRows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `damir_comparaison_libre_${measureKey}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      {/* La barre de composition : trois choix, et rien d'autre. Les filtres
          n'y sont pas — ils appartiennent à chaque série, plus bas. */}
      <section className="panel scope-bar free-bar">
        <div className="scope-bar-row free-bar-row">
          <div className="scope-bar-field">
            <span>En abscisse</span>
            <select value={axis} onChange={(event) => setAxis(event.target.value)}>
              <option value="year">Les années</option>
              <option value="none">Une barre par série</option>
              {dimensions.map((dimension) => (
                <option key={dimension.key} value={dimension.key}>{dimension.label}</option>
              ))}
            </select>
          </div>

          <div className="scope-bar-field">
            <span>En ordonnée</span>
            <select value={measureKey} onChange={(event) => setMeasureKey(event.target.value)}>
              {measureFamilies.map(([family, items]) => (
                <optgroup key={family} label={family}>
                  {items.map((item) => (
                    <option key={item.key} value={item.key} disabled={Boolean(item.unavailable_reason)}>
                      {item.label}{item.unavailable_reason ? " · indisponible" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className="scope-bar-field">
            <span>Forme</span>
            <div className="pathology-toggle" role="group" aria-label="Forme du graphique">
              {availableViews.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={view.key === item.key}
                  className={view.key === item.key ? "active" : ""}
                  onClick={() => setViewKey(item.key)}
                >{item.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className={`pathology-loading-track ${loading ? "active" : ""}`}><span /></div>
      </section>

      {error ? (
        <div className="analysis-error"><strong>Le calcul n’a pas abouti</strong><span>{error}</span></div>
      ) : null}

      <article className="panel damir-stage">
        <header className="damir-stage-head">
          <div className="damir-stage-title">
            <span className="section-kicker">Comparaison libre</span>
            <h2>{measure?.label ?? "Chargement…"}{axis === "year" ? "" : axis === "none" ? "" : ` par ${dimensions.find((d) => d.key === axis)?.label.toLowerCase() ?? ""}`}</h2>
          </div>
        </header>

        <div className="damir-stage-chart">
          {measure && chartSeries.length ? (
            <EChart
              option={option}
              height={CHART_HEIGHT}
              stale={loading}
              ariaLabel={`${measure.label}, ${chartSeries.length} séries comparées`}
            />
          ) : <div className="damir-placeholder"><div className="skeleton" /></div>}
        </div>

        {chartSeries.length > 1 ? (
          <div className="chart-legend" role="list" aria-label="Séries affichées">
            {chartSeries.map((item) => (
              <span key={item.key} className="legend-item" role="listitem">
                <i style={{ background: paletteColor(tokens, item.colorIndex, chartSeries.length) }} />
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        ) : null}

        <footer className="damir-stage-foot">
          <span className="damir-source">Source · Open DAMIR, Assurance Maladie · Traitement Forsides</span>
          <div className="damir-actions">
            <button type="button" onClick={exportCsv} disabled={!measure}>Exporter le CSV</button>
            <button type="button" onClick={() => {
              const next = new URLSearchParams();
              writeFilters(next, series[0]?.filters ?? filters);
              onOpenExtraction(next);
            }}>Extraire la donnée</button>
          </div>
        </footer>

        {series.length > 1 ? (
          <p className="damir-note">
            Chaque série porte son propre périmètre : les courbes ne décrivent pas la même
            population et ne s’additionnent pas.
          </p>
        ) : null}

        <div className="damir-drawers">
          <details className="damir-details">
            <summary>Voir les valeurs ({tableRows.length} lignes)</summary>
            <div className="damir-table-scroll" tabIndex={0} role="group" aria-label="Valeurs du graphique">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Série</th>
                    {categories.map((category) => <th key={category.key} scope="col">{category.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {categories.map((category) => <td key={category.key}>{row[category.label]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      </article>

      {/* Les séries, sous le graphique : on regarde d'abord, on compose ensuite. */}
      <section className="panel free-series">
        <header>
          <div>
            <strong>Ce que je compare</strong>
            <small>Chaque série a son propre périmètre</small>
          </div>
          <button
            type="button"
            className="series-add"
            onClick={addSeries}
            disabled={series.length >= MAX_SERIES}
            title={series.length >= MAX_SERIES ? "Huit séries au maximum" : "Ajouter une série"}
          >+ Série</button>
        </header>

        <ul className="free-series-list">
          {series.map((item) => {
            const chips = scopeChips(item.filters, defaultFilters(metadata), metadata);
            return (
              <li key={item.key} className={editing === item.key ? "open" : ""}>
                <div className="free-series-head">
                  <span className="series-swatch" style={{ background: paletteColor(tokens, slots.get(item.key) ?? 0, series.length) }} />
                  <input
                    type="text"
                    value={item.name}
                    placeholder={nameOf(item)}
                    aria-label="Nom de la série"
                    onChange={(event) => update(item.key, { name: event.target.value })}
                  />
                  <button
                    type="button"
                    className={`series-scope-toggle ${chips.length ? "on" : ""}`}
                    aria-expanded={editing === item.key}
                    onClick={() => setEditing((current) => (current === item.key ? null : item.key))}
                    title="Régler le périmètre de cette série"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                    Filtres
                  </button>
                  <button
                    type="button"
                    className="free-series-remove"
                    onClick={() => remove(item.key)}
                    disabled={series.length <= 1}
                    aria-label="Retirer la série"
                  >✕</button>
                </div>

                {/* Les filtres de la série, en gris : on doit savoir ce que
                    contient chaque élément comparé sans avoir à l'ouvrir. */}
                {chips.length ? (
                  <div className="series-scope-note">
                    {chips.map((chip) => <em key={chip.field}>{chip.text}</em>)}
                  </div>
                ) : (
                  <div className="series-scope-note"><em>Tout le périmètre</em></div>
                )}

                {editing === item.key ? (
                  <div className="free-series-filters">
                    <AdvancedFilterPanel
                      metadata={metadata}
                      value={item.filters}
                      onChange={(next) => update(item.key, { filters: next })}
                      // L'axe des abscisses n'est pas un filtre : le restreindre
                      // ici viderait l'axe qu'on vient de choisir.
                      hiddenFields={axis === "year" || axis === "none" ? [] : [axisField(axis)]}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** Le champ de filtre que l'axe des abscisses réserve. */
function axisField(axis: string): keyof AdvancedFilters {
  const map: Record<string, keyof AdvancedFilters> = {
    region: "regions", age: "ages", sex: "sexes", service: "service_codes",
    grand_post: "grand_post", post: "post", sub_post: "sub_post",
    insurance: "insurances", envelope: "envelopes", ald: "ald",
  };
  return map[axis] ?? "service_codes";
}
