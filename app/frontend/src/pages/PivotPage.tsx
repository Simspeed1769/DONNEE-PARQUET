/** Tableau — un croisé dynamique sur le cube DAMIR.
 *
 *  Cet écran remplace « Repères », qui choisissait une source, puis un calcul
 *  parmi six, et produisait **un chiffre**. Le nom ne disait rien de ce qu'on y
 *  faisait, le serveur y parlait un autre vocabulaire que l'interface, et
 *  Panorama affichait déjà la dernière valeur, la variation et le cumul.
 *
 *  Le croisé dynamique est l'objet que tout le monde a manipulé dans un
 *  tableur : trois zones — lignes, colonnes, mesure — un menu d'agrégation, des
 *  totaux, un tri, une teinte pour repérer les extrêmes. Zéro apprentissage.
 *
 *  **Ce qui le distingue d'un croisé de tableur**, et qui justifie qu'il vive
 *  ici : la méthode reste dépliable à côté du chiffre — définition, formule,
 *  dénominateur, point de vigilance. C'est le cœur de la valeur de l'écran, et
 *  la seule chose de l'ancien Repères qui méritait d'être gardée telle quelle.
 *
 *  **Frontière avec Extraire**, énoncée dans l'écran : Extraire sort des lignes
 *  brutes pour un tableur ; le Tableau donne un agrégat lisible à l'écran.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadText, runPivot, type PivotRequest } from "../api";
import { ScopeBar } from "../components/ScopeBar";
import { ChoiceSelect } from "../components/ChoiceSelect";
import { ExportPngButton } from "../components/ExportPngButton";
import { PaletteChoice } from "../components/PaletteChoice";
import { EChart, type EChartsOption } from "../charts/EChart";
import { buildOption, type ChartSeries } from "../charts/buildOption";
import { useChartTokens, type ChartTokens } from "../charts/tokens";
import { SOURCE_LINE } from "../panorama/exportSlide";
import { DENOMINATORS } from "../methodology/denominators";
import type { ExploreMeasure } from "../explore/model";
import {
  AGGREGATIONS, TOTAL_COLUMN, aggregationNote, buildTable, isRatio,
  offeredAggregations, rampPosition,
  type Aggregation, type PivotResponse, type SortState,
} from "../pivot/model";
import type { AdvancedFilters, Metadata } from "../types";
import { csvFromRows, defaultFilters, filtersFromSearch, formatValue, writeFilters } from "../utils";

type Props = {
  metadata: Metadata;
  routeVersion: number;
  onOpenExtraction: (params: URLSearchParams) => void;
  onOpenMethodology: () => void;
};

const CHART_HEIGHT = 430;

/** Les dimensions offertes aux deux axes. `year` en fait partie : croiser des
 *  postes par année est la première chose qu'on demande à un croisé. */
function axisChoices(response: PivotResponse | null, metadata: Metadata) {
  const dimensions = response?.dimensions ?? [
    { key: "grand_post", label: "Grand poste" }, { key: "year", label: "Année de soins" },
    { key: "region", label: "Région" }, { key: "age", label: "Tranche d’âge" },
    { key: "sex", label: "Sexe" },
  ];
  void metadata;
  return dimensions.map((item) => ({ value: item.key, label: item.label }));
}

/** Le dénominateur écrit en toutes lettres, retrouvé dans la table de méthode.
 *
 *  Le serveur envoie la formule mais pas le dénominateur en français : c'est
 *  `methodology/denominators.ts` qui le porte, relevé ligne à ligne dans le
 *  code du serveur. On le cherche par libellé de mesure. */
function denominatorOf(measure: ExploreMeasure | null): string {
  if (!measure) return "—";
  for (const group of DENOMINATORS) {
    const row = group.rows.find((item) => item.measure === measure.label);
    if (row) return row.denominator ?? "Aucun : la mesure est un total, il n’y a rien à rapporter.";
  }
  return measure.formula;
}

export function PivotPage({ metadata, routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const [filters, setFilters] = useState<AdvancedFilters>(
    () => filtersFromSearch(metadata, params) ?? defaultFilters(metadata));
  const [rows, setRows] = useState(() => params.get("rows") ?? "grand_post");
  const [columns, setColumns] = useState(() => params.get("cols") ?? "year");
  const [measureKey, setMeasureKey] = useState(() => params.get("measure") ?? "reimbursed");
  const [aggregation, setAggregation] = useState<Aggregation>(
    () => (params.get("agg") as Aggregation) ?? "period");
  const [sort, setSort] = useState<SortState>({ column: null, direction: "desc" });
  const [asChart, setAsChart] = useState(() => params.get("as") === "chart");
  const [methodOpen, setMethodOpen] = useState(false);

  const [response, setResponse] = useState<PivotResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokens = useChartTokens();

  const request: PivotRequest = useMemo(() => ({ ...filters, rows, columns }), [filters, rows, columns]);
  const fetchKey = JSON.stringify(request);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setLoading(true);
    runPivot(JSON.parse(fetchKey) as PivotRequest, controller.signal)
      .then((result) => { if (live) { setResponse(result); setError(null); } })
      .catch((reason: Error) => {
        if (reason.name === "AbortError" || !live) return;
        setError(reason.message);
        setResponse(null);
      })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
  }, [fetchKey]);

  // L'état vit dans l'adresse, comme partout : « Copier le lien » rouvre le
  // même croisement, sur le même périmètre, dans la même agrégation.
  useEffect(() => {
    const next = new URLSearchParams();
    next.set("page", "pivot");
    writeFilters(next, filters);
    next.set("rows", rows);
    next.set("cols", columns);
    next.set("measure", measureKey);
    next.set("agg", aggregation);
    if (asChart) next.set("as", "chart");
    const palette = new URLSearchParams(window.location.search).get("palette");
    if (palette) next.set("palette", palette);
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [filters, rows, columns, measureKey, aggregation, asChart]);

  const offered = offeredAggregations(response);
  const note = aggregationNote(response);
  // Une adresse partagee peut demander « Variation » sur un croisement qui ne
  // l'offre pas : on retombe sur le cumul plutot que d'afficher un tableau
  // vide sans explication.
  useEffect(() => {
    if (response && !offered.some((item) => item.key === aggregation)) setAggregation("period");
  }, [response, offered, aggregation]);

  const measures = response?.measures ?? [];
  const measure = measures.find((item) => item.key === measureKey) ?? measures[0] ?? null;
  const table = useMemo(
    () => (response && measure ? buildTable(response, measure, aggregation, sort) : null),
    [response, measure, aggregation, sort]);

  const ratio = isRatio(aggregation);
  const kind = ratio ? "percent" : measure?.kind ?? "money";
  const unitLabel = ratio ? "%" : measure?.unit_label ?? "";

  const cellText = useCallback(
    (value: number | null) => (value === null ? "—" : formatValue(value, kind)),
    [kind]);

  const chartOption = useCallback((chartTokens: ChartTokens): EChartsOption => {
    if (!table) return {};
    const series: ChartSeries[] = table.rowKeys.slice(0, 8).map((row, index) => ({
      key: row.key,
      label: row.label,
      isOther: false,
      colorIndex: index,
      values: table.columnKeys.map((column) => table.values.get(row.key)?.get(column.key) ?? null),
    }));
    return buildOption({
      form: "bar",
      categories: table.columnKeys.map((column) => column.label),
      series,
      kind,
      unitLabel,
      tokens: chartTokens,
      // Au-dela de trois series la barre porte deja son etiquette d'axe :
      // l'etiquette directe ne ferait qu'encombrer.
      directLabels: false,
      xTitle: response?.columns_label ?? "",
    });
  }, [table, kind, unitLabel, response]);

  const scopeLabel = [
    `${filters.start_year}–${filters.end_year}`,
    filters.grand_post ?? "Tous les grands postes",
    filters.regions.length ? `${filters.regions.length} territoires` : "France entière",
  ].join(" · ");

  const title = response && measure
    ? `${measure.label} — ${response.rows_label} × ${response.columns_label}`
    : "Tableau croisé";

  const exportCsv = () => {
    if (!table || !response) return;
    const csvColumns = [
      { key: "row", label: response.rows_label },
      ...table.columnKeys.map((column) => ({ key: column.key, label: column.label })),
      { key: TOTAL_COLUMN, label: "Total" },
    ];
    const csvRows = table.rowKeys.map((row) => {
      const record: Record<string, unknown> = { row: row.label };
      table.columnKeys.forEach((column) => {
        record[column.key] = table.values.get(row.key)?.get(column.key) ?? "";
      });
      record[TOTAL_COLUMN] = table.rowTotals.get(row.key) ?? "";
      return record;
    });
    downloadText(`damir_tableau_${rows}_${columns}.csv`, csvFromRows(csvColumns, csvRows));
  };

  /** L'Excel auto-documenté est celui d'Extraire, sur le même périmètre et les
   *  mêmes deux dimensions : une seule fabrique de classeur dans le produit,
   *  avec sa feuille Métadonnées et son dictionnaire des mesures. */
  const openExcel = () => {
    const next = new URLSearchParams();
    writeFilters(next, filters);
    next.set("dimensions", [rows, columns].join(","));
    next.set("measures", measureKey);
    onOpenExtraction(next);
  };

  const sortOn = (column: string) => {
    setSort((current) => current.column === column
      ? { column, direction: current.direction === "desc" ? "asc" : "desc" }
      : { column, direction: "desc" });
  };

  const sortMark = (column: string) =>
    (sort.column === column ? (sort.direction === "desc" ? " ↓" : " ↑") : "");

  return (
    <div className="content-wrap pivot-page">
      <section className="hero pivot-hero">
        <div>
          <div className="eyebrow"><span>Tableau</span> Open DAMIR</div>
          <h1>Croiser deux dimensions</h1>
          <p>
            Un croisé dynamique sur le cube : deux axes, une mesure, une agrégation.
            {" "}<strong>Extraire</strong> sort des lignes brutes pour un tableur ;
            le Tableau donne un agrégat lisible ici, avec sa méthode.
          </p>
        </div>
        <div className="pivot-hero-actions">
          <button type="button" onClick={() => setMethodOpen((open) => !open)} aria-pressed={methodOpen}>
            Méthode
          </button>
          <button type="button" onClick={onOpenMethodology}>Données &amp; méthode →</button>
        </div>
      </section>

      <ScopeBar
        metadata={metadata}
        value={filters}
        onChange={setFilters}
        loading={loading}
        className="scope-bar-compare"
      >
        <div className="scope-bar-field">
          <span>Lignes</span>
          <ChoiceSelect
            label="Lignes"
            options={axisChoices(response, metadata)}
            value={rows}
            onChange={setRows}
          />
        </div>
        <div className="scope-bar-field">
          <span>Colonnes</span>
          <ChoiceSelect
            label="Colonnes"
            options={axisChoices(response, metadata)}
            value={columns}
            onChange={setColumns}
          />
        </div>
      </ScopeBar>

      {error ? (
        <div className="analysis-error">
          <strong>Ce croisement n’a pas abouti</strong><span>{error}</span>
        </div>
      ) : null}

      <article className="panel pivot-stage">
        <header className="pivot-stage-head">
          <h2>{title}</h2>
          <div className="pivot-controls">
            <div className="scope-bar-field pivot-measure">
              <span>Mesure</span>
              <ChoiceSelect
                label="Mesure"
                options={measures.map((item) => ({
                  value: item.key,
                  label: item.unavailable_reason ? `${item.label} · indisponible` : item.label,
                }))}
                value={measure?.key ?? ""}
                onChange={setMeasureKey}
              />
            </div>
            <div className="scope-bar-field pivot-aggregation">
              <span>Agrégation</span>
              <ChoiceSelect
                label="Agrégation"
                options={offered.map((item) => ({ value: item.key, label: item.label }))}
                value={aggregation}
                onChange={(next) => setAggregation(next as Aggregation)}
              />
            </div>
            <div className="pathology-toggle pivot-shape" role="group" aria-label="Forme">
              <button type="button" aria-pressed={!asChart}
                className={!asChart ? "active" : ""}
                onClick={() => setAsChart(false)}>Tableau</button>
              <button type="button" aria-pressed={asChart}
                className={asChart ? "active" : ""}
                onClick={() => setAsChart(true)}>Graphique</button>
            </div>
            <PaletteChoice />
          </div>
        </header>

        {measure?.unavailable_reason ? (
          <p className="pivot-note">{measure.unavailable_reason}</p>
        ) : null}
        <p className="damir-question">
          {AGGREGATIONS.find((item) => item.key === aggregation)?.hint}
        </p>
        {note ? <p className="pivot-note">{note}</p> : null}

        {!table ? (
          <div className="damir-placeholder"><div className="skeleton" /></div>
        ) : asChart ? (
          <div className="damir-stage-chart">
            <EChart
              option={chartOption(tokens)}
              height={CHART_HEIGHT}
              stale={loading}
              ariaLabel={`${title}, ${table.rowKeys.length} lignes`}
            />
          </div>
        ) : (
          <div className="pivot-table-wrap">
            <table className="pivot-table">
              <thead>
                <tr>
                  <th scope="col" className="pivot-corner">
                    {response?.rows_label} \ {response?.columns_label}
                  </th>
                  {table.columnKeys.map((column) => (
                    <th key={column.key} scope="col">
                      <button type="button" onClick={() => sortOn(column.key)}
                        title={`Trier sur ${column.label}`}>
                        {column.label}{sortMark(column.key)}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="pivot-total-head">
                    <button type="button" onClick={() => sortOn(TOTAL_COLUMN)} title="Trier sur le total">
                      Total{sortMark(TOTAL_COLUMN)}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {table.rowKeys.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    {table.columnKeys.map((column) => {
                      const value = table.values.get(row.key)?.get(column.key) ?? null;
                      const position = rampPosition(value, table.min, table.max);
                      return (
                        <td key={column.key}
                          className={value === null ? "pivot-void" : ""}
                          style={position === null ? undefined : {
                            // La rampe séquentielle du thème, à huit marches :
                            // la teinte code une grandeur, jamais une identité.
                            background: `var(--ramp-${Math.min(8, Math.max(1, Math.round(position * 7) + 1))})`,
                            // Au-delà du milieu de la rampe, l'encre doit
                            // s'inverser, sinon les cellules fortes deviennent
                            // illisibles.
                            color: position > 0.55 ? "var(--surface)" : "var(--ink)",
                          }}>
                          {cellText(value)}
                        </td>
                      );
                    })}
                    <td className="pivot-total">{cellText(table.rowTotals.get(row.key) ?? null)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total</th>
                  {table.columnKeys.map((column) => (
                    <td key={column.key}>{cellText(table.columnTotals.get(column.key) ?? null)}</td>
                  ))}
                  <td className="pivot-total">{cellText(table.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {response?.warnings.length ? (
          <ul className="pivot-warnings">
            {response.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        ) : null}

        <footer className="damir-stage-foot">
          <span className="damir-source">{SOURCE_LINE}</span>
          <div className="damir-actions">
            <ExportPngButton
              defaultTitle={title}
              scope={scopeLabel}
              sourceLine={SOURCE_LINE}
              filenamePrefix="damir-tableau"
              buildOption={chartOption}
              caveatCount={response?.warnings.length ?? 0}
              disabled={!table}
            />
            <button type="button" onClick={exportCsv} disabled={!table}>Exporter le CSV</button>
            <button type="button" onClick={openExcel}>Exporter en Excel</button>
          </div>
        </footer>
      </article>

      {/* La méthode dépliée : c'est elle qui distingue ce tableau d'un croisé
          de tableur, et elle est reprise telle quelle de l'ancien Repères. */}
      {methodOpen && measure ? (
        <aside className="panel pivot-method">
          <header>
            <div><span>Méthode</span><h3>{measure.label}</h3></div>
            <button type="button" onClick={() => setMethodOpen(false)} aria-label="Fermer la méthode">×</button>
          </header>
          <section><span>Définition</span><p>{measure.definition}</p></section>
          <section><span>Formule</span><strong>{measure.formula}</strong></section>
          <section><span>Dénominateur</span><p>{denominatorOf(measure)}</p></section>
          {measure.caveat ? (
            <section className="limitation"><span>Point de vigilance</span><p>{measure.caveat}</p></section>
          ) : null}
          <div className="pivot-method-rule">
            Les calculs portent sur des données agrégées. Aucune statistique de
            distribution individuelle n’est présentée.
          </div>
        </aside>
      ) : null}
    </div>
  );
}
