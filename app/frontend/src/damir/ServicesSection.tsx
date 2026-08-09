/** Comparer des prestations entre elles.
 *
 *  Une seule question : **laquelle pèse le plus, et comment cela bouge-t-il ?**
 *  Tout ici en découle. On choisit le niveau auquel on compare — grand poste,
 *  poste, sous-poste ou prestation précise — puis les modalités à mettre en
 *  regard, puis la vue.
 *
 *  Les « vues » remplacent l'ancien croisement intention × forme × lecture, qui
 *  demandait de comprendre trois notions pour obtenir un graphique. Ce sont
 *  maintenant six entrées d'une seule liste, nommées par ce qu'on y voit :
 *  courbes, barres, classement, base 100, variation, camembert. Chacune est un
 *  couple forme + lecture décidé ici, une fois, plutôt que par l'utilisateur à
 *  chaque fois.
 *
 *  Toutes les séries partagent le même périmètre : c'est ce qui rend la
 *  comparaison sûre — une seule chose varie, la prestation. Quand ce n'est plus
 *  ce qu'on veut, c'est la comparaison libre qu'il faut ouvrir.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { runExplore, type ExploreRequest } from "../api";
import { ScopeBar } from "../components/ScopeBar";
import { EChart } from "../charts/EChart";
import { buildOption, pieOption, type ChartForm, type ChartSeries } from "../charts/buildOption";
import { paletteColor, useChartTokens } from "../charts/tokens";
import { SeriesPicker } from "../explore/SeriesPicker";
import {
  applyReading, assignColorSlots, periodValueOf, rankedKeys, readingKind,
  readingUnitLabel, selectSeries, valuesOf,
  type ExploreMeasure, type ExploreResponse, type Reading,
} from "../explore/model";
import { csvFromRows, formatValue, writeFilters } from "../utils";
import type { SectionProps } from "./PanoramaSection";

/** Le niveau auquel on compare. La hiérarchie des prestations en donne quatre,
 *  du plus large au plus fin ; la barre de portée sert alors à **restreindre**
 *  le catalogue, pas à choisir un sujet. */
const LEVELS: Array<{ key: string; label: string }> = [
  { key: "grand_post", label: "Grands postes" },
  { key: "post", label: "Postes" },
  { key: "sub_post", label: "Sous-postes" },
  { key: "service", label: "Prestations" },
];

type ViewKey = "line" | "bar" | "rank" | "index" | "change" | "pie";

type View = {
  key: ViewKey;
  label: string;
  form: ChartForm;
  reading: Reading;
  /** Une vue qui suppose que les parts s'additionnent en un tout. */
  needsAdditive?: boolean;
  /** Ce que la vue répond, en une ligne — au-dessus du graphique. */
  question: string;
};

const VIEWS: View[] = [
  { key: "line", label: "Courbes", form: "line", reading: "value",
    question: "Combien, et comment cela évolue-t-il ?" },
  { key: "bar", label: "Barres", form: "bar", reading: "value",
    question: "Combien, année par année ?" },
  { key: "rank", label: "Classement", form: "rank", reading: "value",
    question: "Laquelle pèse le plus ?" },
  { key: "index", label: "Base 100", form: "line", reading: "index",
    question: "Laquelle progresse le plus vite, quelle que soit sa taille ?" },
  { key: "change", label: "Variation", form: "bar", reading: "change",
    question: "De combien chacune varie-t-elle d'une année sur l'autre ?" },
  { key: "pie", label: "Camembert", form: "pie", reading: "value", needsAdditive: true,
    question: "Comment le total se partage-t-il ?" },
];

const MAX_SERIES = 8;
const SERIES_COUNTS = [2, 5, 8] as const;
const CHART_HEIGHT = 452;

export function ServicesSection({
  metadata, routeVersion, filters, setFilters, measureKey, setMeasureKey, onOpenExtraction,
}: SectionProps) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();

  const [level, setLevel] = useState(() => {
    const raw = params.get("level");
    return LEVELS.some((item) => item.key === raw) ? raw as string : "grand_post";
  });
  const [viewKey, setViewKey] = useState<ViewKey>(() => {
    const raw = params.get("view_services");
    return VIEWS.some((item) => item.key === raw) ? raw as ViewKey : "line";
  });
  const [selection, setSelection] = useState<string[] | null>(() => {
    const raw = params.get("compare");
    return raw ? raw.split("~").filter(Boolean) : null;
  });
  const [seriesCount, setSeriesCount] = useState(5);
  const [showOther, setShowOther] = useState(params.get("other") === "1");
  const [showTable, setShowTable] = useState(false);

  const [response, setResponse] = useState<ExploreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const slotMemory = useRef<Map<string, number>>(new Map());

  const request = useMemo<ExploreRequest>(() => ({
    ...filters,
    breakdown: level,
    time_axis: "care",
    rank_by: measureKey,
    pinned: selection ?? [],
  }), [filters, level, measureKey, selection]);

  const fetchKey = useMemo(() => JSON.stringify({ ...request, rank_by: undefined }), [request]);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setLoading(true);
    setError(null);
    runExplore(request, controller.signal)
      .then((next) => { if (live) setResponse(next); })
      .catch((reason: Error) => { if (live && reason.name !== "AbortError") setError(reason.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  // Changer de niveau change les modalités : la sélection repart des plus
  // lourdes, faute de quoi elle désignerait des clés qui n'existent plus. Pas
  // au premier rendu, où elle vient de l'adresse.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    setSelection(null);
  }, [level]);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("level", level);
    next.set("view_services", viewKey);
    if (selection?.length) next.set("compare", selection.join("~"));
    else next.delete("compare");
    next.set("other", showOther ? "1" : "0");
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [level, viewKey, selection, showOther]);

  const measure: ExploreMeasure | null = useMemo(
    () => response?.measures.find((item) => item.key === measureKey) ?? response?.measures[0] ?? null,
    [response, measureKey],
  );
  const additive = measure?.additive ?? true;
  const responseIsCurrent = response?.breakdown === level;

  const eligibleKeys = useMemo(
    () => (response && measure ? rankedKeys(response, measure) : []),
    [response, measure],
  );

  useEffect(() => {
    if (!response || !measure || selection !== null || !responseIsCurrent) return;
    setSelection(eligibleKeys.slice(0, seriesCount));
  }, [response, measure, selection, responseIsCurrent, seriesCount, eligibleKeys]);

  // Une vue devenue impossible retombe sur les courbes, toujours valides.
  const view = useMemo(() => {
    const chosen = VIEWS.find((item) => item.key === viewKey) ?? VIEWS[0];
    return chosen.needsAdditive && !additive ? VIEWS[0] : chosen;
  }, [viewKey, additive]);

  const availableViews = useMemo(
    () => VIEWS.filter((item) => !item.needsAdditive || additive),
    [additive],
  );

  const active = selection ?? [];
  const slots = useMemo(() => assignColorSlots(active, slotMemory.current, MAX_SERIES), [active]);
  const drawn = useMemo(
    () => (response ? selectSeries(response, active, showOther) : []),
    [response, active, showOther],
  );

  const totalValues = useMemo(
    () => (response && measure ? valuesOf(response.total, measure, response.components, response.years.length) : []),
    [response, measure],
  );

  const periodLabel = useMemo(() => {
    const years = response?.years ?? [];
    if (!years.length) return "Période";
    return years.length === 1 ? String(years[0]) : `${years[0]}–${years.at(-1)}`;
  }, [response]);

  /** Le camembert décompose un tout : il ne lit pas une suite annuelle mais une
   *  valeur de période, les composantes cumulées avant la formule. */
  const asPie = view.form === "pie";

  const chartSeries = useMemo<ChartSeries[]>(() => {
    if (!response || !measure) return [];
    return drawn.map((item) => ({
      key: item.key,
      label: item.label,
      isOther: item.is_other,
      colorIndex: slots.get(item.key) ?? 0,
      values: asPie
        ? [periodValueOf(item, measure, response.components)]
        : applyReading(valuesOf(item, measure, response.components, response.years.length),
                       view.reading, totalValues),
    }));
  }, [response, measure, drawn, slots, asPie, view, totalValues]);

  const kind = asPie ? (measure?.kind ?? "money")
    : (measure ? readingKind(view.reading, measure) : "money");
  const unitLabel = asPie ? (measure?.unit_label ?? "")
    : (measure ? readingUnitLabel(view.reading, measure) : "");
  const categories = useMemo<Array<string | number>>(
    () => (asPie ? [periodLabel] : (response?.years ?? [])),
    [asPie, periodLabel, response],
  );

  const option = useMemo(() => {
    if (asPie) {
      return pieOption({
        slices: chartSeries.map((item) => ({
          key: item.key, label: item.label, colorIndex: item.colorIndex, value: item.values[0] ?? null,
        })),
        tokens, kind, centerLabel: `cumul ${periodLabel}`,
      });
    }
    return buildOption({
      form: view.form,
      categories,
      series: chartSeries,
      kind,
      unitLabel,
      tokens,
      directLabels: view.form === "line" && chartSeries.length > 1 && chartSeries.length <= 6,
    });
  }, [asPie, view, categories, chartSeries, kind, unitLabel, tokens, periodLabel]);

  const labelMap = useMemo(
    () => new Map((response?.series ?? []).map((item) => [item.key, item.label])),
    [response],
  );
  const valueMap = useMemo(() => {
    const map = new Map<string, number | null>();
    if (response && measure) {
      response.series.forEach((item) => map.set(item.key, periodValueOf(item, measure, response.components)));
    }
    return map;
  }, [response, measure]);

  const otherCount = Math.max(0, (response?.bucket_count ?? 0) - active.length);
  const levelLabel = LEVELS.find((item) => item.key === level)?.label.toLowerCase() ?? "modalités";

  const measureFamilies = useMemo(() => {
    const groups = new Map<string, ExploreMeasure[]>();
    response?.measures.forEach((item) => groups.set(item.family, [...(groups.get(item.family) ?? []), item]));
    return [...groups.entries()];
  }, [response]);

  const tableColumns = useMemo(
    () => (asPie ? [periodLabel] : (response?.years ?? []).map(String)),
    [asPie, periodLabel, response],
  );
  const tableRows = useMemo(
    () => chartSeries.map((item) => {
      const row: Record<string, string> = { label: item.label };
      tableColumns.forEach((column, index) => { row[column] = formatValue(item.values[index], kind); });
      return row;
    }),
    [chartSeries, tableColumns, kind],
  );

  const exportCsv = () => {
    const columns = [
      { key: "label", label: response?.breakdown_label ?? "Modalité" },
      ...tableColumns.map((column) => ({ key: column, label: column })),
    ];
    const blob = new Blob([csvFromRows(columns, tableRows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `damir_${measureKey}_${level}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <ScopeBar
        metadata={metadata}
        value={filters}
        onChange={setFilters}
        loading={loading}
        // La prestation précise n'est pas un filtre ici : c'est ce qu'on
        // compare, et cela se choisit dans la liste des séries.
        hidden={level === "service" ? ["service_codes"] : []}
      >
        <label className="scope-bar-measure">
          <span>Mesure</span>
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
        </label>
      </ScopeBar>

      {error ? (
        <div className="analysis-error"><strong>Le calcul n’a pas abouti</strong><span>{error}</span></div>
      ) : null}

      <article className="panel damir-stage">
        <header className="damir-stage-head">
          <div className="damir-stage-title">
            <span className="section-kicker">Comparer · {levelLabel}</span>
            <h2>{measure?.label ?? "Chargement…"} — {chartSeries.length} {levelLabel} comparés</h2>
          </div>
          <div className="pathology-toggle damir-views" role="tablist" aria-label="Niveau de comparaison">
            {LEVELS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={level === item.key}
                className={level === item.key ? "active" : ""}
                onClick={() => setLevel(item.key)}
              >{item.label}</button>
            ))}
          </div>
        </header>

        <div className="damir-strip">
          <p className="damir-question">{view.question}</p>
          <div className="pathology-toggle damir-forms" role="group" aria-label="Vue">
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

        <div className="damir-stage-chart">
          {response && measure ? (
            <EChart
              option={option}
              height={CHART_HEIGHT}
              stale={loading}
              ariaLabel={`${measure.label} par ${response.breakdown_label}, ${response.years[0]} à ${response.years.at(-1)}`}
            />
          ) : <div className="damir-placeholder"><div className="skeleton" /></div>}
        </div>

        {chartSeries.length > 1 ? (
          <div className="chart-legend" role="list" aria-label="Séries affichées">
            {chartSeries.map((item) => (
              <span key={item.key} className="legend-item" role="listitem">
                <i style={{ background: paletteColor(tokens, item.colorIndex, chartSeries.length, item.isOther) }} />
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        ) : null}

        <footer className="damir-stage-foot">
          <span className="damir-source">Source · Open DAMIR, Assurance Maladie · Traitement Forsides</span>
          <div className="damir-actions">
            <button type="button" onClick={exportCsv} disabled={!response}>Exporter le CSV</button>
            <button type="button" onClick={() => {
              const next = new URLSearchParams();
              writeFilters(next, filters);
              onOpenExtraction(next);
            }}>Extraire la donnée</button>
          </div>
        </footer>

        <div className="damir-drawers">
          <details className="damir-details" open={showTable} onToggle={(event) => setShowTable(event.currentTarget.open)}>
            <summary>Voir les valeurs ({tableRows.length} lignes)</summary>
            <div className="damir-table-scroll" tabIndex={0} role="group" aria-label="Valeurs du graphique">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{response?.breakdown_label ?? "Modalité"}</th>
                    {tableColumns.map((column) => <th key={column} scope="col">{column}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {tableColumns.map((column) => <td key={column}>{row[column]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {response?.warnings.length ? (
            <details className="damir-details">
              <summary>Ce que ce graphique ne montre pas ({response.warnings.length})</summary>
              <ul className="damir-caveats">
                {response.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
      </article>

      {/* Le choix des modalités vit sous le graphique : on regarde d'abord, on
          ajuste ensuite. C'est l'inverse d'un formulaire. */}
      <section className="panel damir-picker">
        {response && measure ? (
          <SeriesPicker
            breakdown={response.breakdown}
            breakdownLabel={response.breakdown_label}
            scope={{ ...filters, breakdown: response.breakdown, rank_by: measureKey }}
            selection={active}
            labels={labelMap}
            values={valueMap}
            slots={slots}
            tokens={tokens}
            kind={measure.kind}
            showOther={showOther}
            otherCount={otherCount}
            otherLabel={`Reste du périmètre · ${otherCount} ${levelLabel}`}
            maxSelected={MAX_SERIES}
            count={seriesCount}
            counts={SERIES_COUNTS}
            onCountChange={(count) => { setSeriesCount(count); setSelection(eligibleKeys.slice(0, count)); }}
            onChange={setSelection}
            onToggleOther={setShowOther}
            onResetToTop={() => setSelection(eligibleKeys.slice(0, seriesCount))}
            metadata={metadata}
            base={filters}
            scopes={{}}
            onScopeChange={() => undefined}
            onAddFree={() => undefined}
            allowScopes={false}
          />
        ) : null}
      </section>
    </>
  );
}
