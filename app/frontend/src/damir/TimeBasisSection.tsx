import { useEffect, useState } from "react";
import { downloadText, runTimeBasis, type TimeBasisResponse } from "../api";
import { ScopeBar } from "../components/ScopeBar";
import { EChart } from "../charts/EChart";
import { useChartTokens, type ChartTokens } from "../charts/tokens";
import { ExportPngButton } from "../components/ExportPngButton";
import { seriesOption, type ChartRow } from "../panorama/charts";
import { formatValue } from "../utils";
import { essentialChart } from "./essentialChart";
import type { SectionProps } from "./PanoramaSection";

export type TimeBasis = "care" | "payment" | "both";

export function TimeBasisSection({ metadata, filters, setFilters, mode }: SectionProps & { mode: "payment" | "both" }) {
  const tokens = useChartTokens();
  const [data, setData] = useState<TimeBasisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<"line" | "bar">("line");
  const incompatible = Boolean(filters.regions.length || filters.ages.length || filters.sexes.length
    || filters.insurances.length || filters.envelopes.length || filters.ald !== null);
  const key = JSON.stringify(filters);
  useEffect(() => {
    setData(null);
    setError(null);
    if (incompatible) { setLoading(false); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    runTimeBasis(filters, controller.signal)
      .then((next) => { if (active) setData(next); })
      .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [key, incompatible]);

  const subject = filters.sub_post ?? filters.post ?? filters.grand_post ?? "Toutes prestations";
  const scope = [subject, filters.service_codes.length ? `Prestations : ${filters.service_codes.join(", ")}` : null,
    "France entière, tous bénéficiaires", `${filters.start_year}–${filters.end_year}`].filter(Boolean).join(" · ");
  const latest = data?.latest_flow;
  const cutoff = latest ? `${String(latest % 100).padStart(2, "0")}/${Math.floor(latest / 100)}` : "date inconnue";
  const completeness = metadata.reliability.completeness?.find((item) => item.year === filters.end_year)?.ratio ?? null;
  const title = mode === "both" ? "Remboursements AMO : soins et règlements" : "Remboursements AMO par année de règlement";
  const columns = mode === "both" ? ["Année", "Année de soins (€)", "Année de règlement AMO (€)"]
    : ["Année", "Année de règlement AMO (€)"];
  const rows: ChartRow[] = data ? [
    ...(mode === "both" ? [{ key: "care", label: "Année de soins (survenance)", colorIndex: 0, values: data.rows.map((r) => r.care) }] : []),
    { key: "payment", label: "Année de règlement AMO", colorIndex: 1, values: data.rows.map((r) => r.payment) },
  ] : [];
  const noValues = data && !rows.some((row) => row.values.some((value) => value !== null));
  const build = (palette: ChartTokens) => essentialChart(seriesOption({
    years: data?.rows.map((r) => r.year) ?? [], rows, kind: "money", tokens: palette,
    consolidatedThrough: null, form,
  }), palette);
  const provisionalNote = filters.end_year > (metadata.reliability.consolidated_through ?? filters.end_year) && completeness !== null
    ? ` À l’échelle de l’ensemble DAMIR, environ ${Math.round(completeness * 100)} % des montants AMO ${filters.end_year} sont observés ; année provisoire.` : "";
  const shortNote = mode === "both"
    ? `Flux arrêtés à ${cutoff}. Soins récents incomplets ; règlement = paiements de l’année.${provisionalNote}`
    : `Flux arrêtés à ${cutoff}. Paiements AMO de l’année, y compris pour des soins antérieurs.${provisionalNote}`;
  const warnings = [
    ...(data?.warnings ?? []),
    ...(data?.rows.filter((r) => r.payment_months < 12)
      .map((r) => `${r.year} : ${r.payment_months}/12 mois de flux disponibles. Le total en règlement est partiel ou absent.`) ?? []),
  ];
  const exportCsv = () => {
    if (!data) return;
    const lines: (string | number | null)[][] = [
      [title], [scope], [shortNote], ...warnings.map((w) => [w]),
      [...columns, "Mois de flux disponibles"],
      ...data.rows.map((r) => mode === "both" ? [r.year, r.care, r.payment, r.payment_months]
        : [r.year, r.payment, r.payment_months]),
    ];
    downloadText(`damir_${mode}_${filters.start_year}_${filters.end_year}.csv`, "\uFEFF" + lines
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";"))
      .join("\r\n"));
  };
  return <>
    <ScopeBar metadata={metadata} value={filters} onChange={setFilters} loading={loading}>
      <div className="time-basis-measure"><span>Mesure</span><strong>Montant remboursé AMO</strong></div>
    </ScopeBar>
    {incompatible ? <div className="panel time-basis-notice" role="status">
      <p>La date de remboursement est disponible uniquement pour la France entière, tous bénéficiaires et régimes confondus. Les filtres de prestation restent utilisables.</p>
      <button type="button" onClick={() => setFilters((current) => ({ ...current, regions: [], ages: [],
        sexes: [], insurances: [], envelopes: [], ald: null }))}>Passer au périmètre compatible</button>
    </div> : error ? <p className="analysis-error" role="alert">{error}</p> :
    <article className="panel damir-stage time-basis-chart">
      <header className="damir-stage-head"><div><h2>{title}</h2><p className="time-basis-scope">{scope}</p></div>
        <div className="pathology-toggle" role="group" aria-label="Forme du graphique">
          {(["line", "bar"] as const).map((f) => <button type="button" key={f} className={form === f ? "active" : ""}
            aria-pressed={form === f} onClick={() => setForm(f)}>{f === "line" ? "Courbes" : "Barres"}</button>)}
        </div>
      </header>
      <div className="damir-stage-chart">
        {loading ? <p role="status" className="damir-fallback">Calcul des deux datations…</p>
          : noValues ? <p className="damir-fallback">Aucune donnée pour ce périmètre.</p>
          : data ? <EChart option={build(tokens)} height={420} ariaLabel={title} /> : null}
      </div>
      {data ? <>
        <div className="chart-legend time-basis-legend" role="list" aria-label="Légende du graphique">
          {rows.map((row) => <span key={row.key} className="legend-item" role="listitem">
            <i className={`time-basis-swatch ${row.key}`} />{row.label}
          </span>)}
        </div>
        <p className="time-basis-note">{shortNote}</p>
        <footer className="damir-stage-foot"><span className="damir-source">Source : Open DAMIR · AMO</span>
          <div className="damir-actions">
            <ExportPngButton defaultTitle={title} scope={scope} sourceLine={`Open DAMIR · ${shortNote} Aucun effet ROC identifiable.`}
              filenamePrefix="damir_dates" buildOption={build} caveatCount={warnings.length} disabled={Boolean(noValues)} />
            <button type="button" onClick={exportCsv}>Exporter le CSV</button>
          </div>
        </footer>
        <div className="damir-drawers">
          <details className="damir-details"><summary>Voir les valeurs ({data.rows.length} années)</summary>
            <div className="damir-table-scroll"><table><thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{data.rows.map((r) => <tr key={r.year}><th scope="row">{r.year}</th>
                {mode === "both" ? <td>{formatValue(r.care, "money")}</td> : null}
                <td>{formatValue(r.payment, "money")}</td></tr>)}</tbody></table></div>
          </details>
          <div className="time-basis-limits"><strong>Ce que cette comparaison permet de lire</strong>
            <p>Deux calendriers AMO, sans mesure de la comptabilité ni du ROC de la complémentaire. La dépense présentée, la part AMO et le reste après AMO sont disponibles seulement en année de soins.</p>
            {warnings.filter((w) => w.includes("/12")).map((w) => <p key={w}>{w}</p>)}
          </div>
        </div>
      </> : null}
    </article>}
  </>;
}
