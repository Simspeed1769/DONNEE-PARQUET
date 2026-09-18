import { useEffect, useMemo, useState } from "react";
import { downloadText, runTimeBasis, type TimeBasisResponse } from "../api";
import { ScopeBar } from "../components/ScopeBar";
import { EChart } from "../charts/EChart";
import { useChartTokens, type ChartTokens } from "../charts/tokens";
import { ExportPngButton } from "../components/ExportPngButton";
import { seriesOption, type ChartRow } from "../panorama/charts";
import { formatValue } from "../utils";
import { essentialChart } from "./essentialChart";
import type { SectionProps } from "./PanoramaSection";

/** Deux datations, et plus de troisième voie : la comparaison des deux
 *  courbes AMO a disparu avec le cube des règlements. Elle n'avait de raison
 *  d'être que tant que l'axe règlement ne portait que le remboursement — une
 *  courbe seule ne se lisait pas sans son jumeau. Maintenant que la dépense,
 *  la part AMO et le reste existent des deux côtés, chaque axe se suffit. */
export type TimeBasis = "care" | "payment";

type MeasureKey = "reimbursed" | "expense" | "coverage" | "out_of_pocket";

/** Le temps de la première réponse : un seul bouton, jamais zéro. */
const FALLBACK_MEASURES: TimeBasisResponse["measures"] = [{
  key: "reimbursed", label: "Montant remboursé", kind: "money",
  definition: "", formula: "", caveat: null,
}];

export function TimeBasisSection({ metadata, filters, setFilters }: SectionProps) {
  const tokens = useChartTokens();
  const [data, setData] = useState<TimeBasisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<"line" | "bar">("bar");
  const [measure, setMeasure] = useState<MeasureKey>("reimbursed");
  /** Sans cube des règlements, l'axe retombe sur le cube des délais : la
   *  prestation et la période seules y filtrent. */
  const restricted = !metadata.has_settlement;
  const incompatible = restricted && Boolean(filters.regions.length || filters.ages.length
    || filters.sexes.length || filters.insurances.length || filters.envelopes.length || filters.ald !== null);
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

  const available = data?.available_measures ?? ["reimbursed"];
  /** Une mesure retirée par le serveur ne doit pas laisser un graphique vide :
   *  on retombe sur le remboursement, qui existe sur les deux cubes. */
  const active: MeasureKey = available.includes(measure) ? measure : "reimbursed";
  const card = data?.measures.find((item) => item.key === active);
  const kind = card?.kind === "percent" ? "percent" : "money";

  const subject = filters.sub_post ?? filters.post ?? filters.grand_post ?? "Toutes prestations";
  const scope = [subject, filters.service_codes.length ? `Prestations : ${filters.service_codes.join(", ")}` : null,
    restricted ? "France entière, tous bénéficiaires" : null,
    `${filters.start_year}–${filters.end_year}`].filter(Boolean).join(" · ");
  const latest = data?.latest_flow;
  const cutoff = latest ? `${String(latest % 100).padStart(2, "0")}/${Math.floor(latest / 100)}` : "date inconnue";
  const title = `${card?.label ?? "Montant remboursé"} par année de règlement AMO`;

  const rows: ChartRow[] = useMemo(() => data ? [{
    key: active, label: card?.label ?? "Montant remboursé", colorIndex: 1,
    values: data.rows.map((row) => row[active]),
  }] : [], [data, active, card]);
  const noValues = data && !rows.some((row) => row.values.some((value) => value !== null));
  const build = (palette: ChartTokens) => essentialChart(seriesOption({
    years: data?.rows.map((r) => r.year) ?? [], rows, kind, tokens: palette,
    consolidatedThrough: null, form,
  }), palette);

  const shortNote = `Flux arrêtés à ${cutoff}. Paiements AMO de l’année, y compris pour des soins antérieurs.`;
  const warnings = [
    ...(data?.warnings ?? []),
    ...(data?.rows.filter((r) => r.payment_months < 12)
      .map((r) => `${r.year} : ${r.payment_months}/12 mois de flux disponibles. Le total de l’année est partiel ou absent.`) ?? []),
  ];
  const columns = ["Année", ...(data?.measures ?? []).map((item) => `${item.label} (${item.kind === "percent" ? "%" : "€"})`)];
  const exportCsv = () => {
    if (!data) return;
    const lines: (string | number | null)[][] = [
      [title], [scope], [shortNote], ...warnings.map((w) => [w]),
      [...columns, "Mois de flux disponibles"],
      ...data.rows.map((r) => [r.year, ...data.measures.map((item) => r[item.key as MeasureKey]), r.payment_months]),
    ];
    downloadText(`damir_reglement_${filters.start_year}_${filters.end_year}.csv`, "﻿" + lines
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(";"))
      .join("\r\n"));
  };

  return <>
    <ScopeBar metadata={metadata} value={filters} onChange={setFilters} loading={loading} />
    {/* Quatre mesures, quatre boutons, sur leur propre ligne : dans la colonne
        étroite de la barre de périmètre, les libellés se cassaient en quatre
        lignes et la cible devenait trop petite pour être visée. */}
    <div className="time-basis-controls time-basis-measures">
      <span>Mesure</span>
      <div className="pathology-toggle" role="group" aria-label="Mesure affichée">
        {(data?.measures ?? FALLBACK_MEASURES).map((item) => (
          <button type="button" key={item.key} className={active === item.key ? "active" : ""}
            aria-pressed={active === item.key} title={item.definition ?? undefined}
            onClick={() => setMeasure(item.key as MeasureKey)}>{item.label}</button>
        ))}
      </div>
    </div>
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
        {loading ? <p role="status" className="damir-fallback">Lecture des règlements…</p>
          : noValues ? <p className="damir-fallback">Aucune donnée pour ce périmètre.</p>
          : data ? <EChart option={build(tokens)} height={420} ariaLabel={title} /> : null}
      </div>
      {data ? <>
        <p className="time-basis-note">{shortNote}</p>
        <footer className="damir-stage-foot"><span className="damir-source">Source : Open DAMIR · AMO</span>
          <div className="damir-actions">
            <ExportPngButton defaultTitle={title} scope={scope} sourceLine={`Open DAMIR · ${shortNote}`}
              filenamePrefix="damir_reglement" buildOption={build} caveatCount={warnings.length} disabled={Boolean(noValues)} />
            <button type="button" onClick={exportCsv}>Exporter le CSV</button>
          </div>
        </footer>
        <div className="damir-drawers">
          <details className="damir-details"><summary>Voir les valeurs ({data.rows.length} années)</summary>
            <div className="damir-table-scroll"><table><thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>{data.rows.map((r) => <tr key={r.year}><th scope="row">{r.year}</th>
                {data.measures.map((item) => <td key={item.key}>
                  {formatValue(r[item.key as MeasureKey], item.kind === "percent" ? "percent" : "money")}
                </td>)}</tr>)}</tbody></table></div>
          </details>
          <div className="time-basis-limits"><strong>Ce que cette lecture permet de lire</strong>
            <p>{restricted
              ? "Le cube des règlements n’est pas installé : seul le montant remboursé existe sur cet axe, et les filtres de population ne s’y appliquent pas."
              : "L’exercice de paiement de l’Assurance Maladie, dépense et part AMO comprises. Ce n’est pas l’année comptable d’une complémentaire, et l’écart avec l’année de soins ne mesure pas le ROC."}</p>
            {warnings.filter((w) => w.includes("/12")).map((w) => <p key={w}>{w}</p>)}
          </div>
        </div>
      </> : null}
    </article>}
  </>;
}
