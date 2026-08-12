/** Plusieurs causes de décès mises en regard.
 *
 *  Remplace l'ancienne lecture « Causes », qui classait les douze premières :
 *  c'était une comparaison présentée comme une lecture. On choisit désormais
 *  les causes, et le catalogue étant classé par nombre de décès, retenir les
 *  premières reproduit l'ancien classement.
 */

import { useEffect, useMemo, useState } from "react";
import { getMortalityOverview } from "../api";
import { ChartShell } from "../components/ChartShell";
import { EntityPicker } from "../components/EntityPicker";
import { useChartTokens } from "../charts/tokens";
import { buildMortalityCompare } from "./model";
import { MAX_COMPARED, causeCatalogue, type MortalitySectionProps } from "./section";
import type { MortalityOverview } from "../types";

type Compared = { code: string; label: string; overview: MortalityOverview };

type Props = MortalitySectionProps & {
  /** La cause du panorama : elle ouvre la comparaison. */
  cause: string;
  /** La fiche courante, qui porte le classement des causes servant de poids. */
  reference: MortalityOverview | null;
};

export function CompareSection({
  metadata, year, population, measure, setMeasure, onOpenExtraction, routeVersion,
  cause, reference,
}: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();
  const catalogue = useMemo(() => causeCatalogue(metadata, reference), [metadata, reference]);

  const [codes, setCodes] = useState<string[]>(() => {
    const raw = params.get("compare");
    const parsed = raw ? raw.split("~").filter(Boolean) : [];
    return parsed.length ? parsed.slice(0, MAX_COMPARED) : (cause ? [cause] : []);
  });
  const [view, setView] = useState(() => params.get("view_compare") ?? "line");
  const [compared, setCompared] = useState<Compared[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cause) return;
    setCodes((current) => (current.length ? current : [cause]));
  }, [cause]);

  const fetchKey = useMemo(
    () => JSON.stringify([codes, year, population]),
    [codes, year, population],
  );

  useEffect(() => {
    if (!year || !codes.length) { setCompared([]); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all(codes.map((code) =>
      getMortalityOverview({ cause: code, population, year }, controller.signal)
        .then((next) => ({
          code,
          label: catalogue.find((item) => item.code === code)?.label ?? next.context.cause_label,
          overview: next,
        }))))
      .then((rows) => { if (active) setCompared(rows); })
      .catch((reason: Error) => {
        if (active && reason.name !== "AbortError") { setError(reason.message); setCompared([]); }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    if (codes.length) next.set("compare", codes.join("~"));
    else next.delete("compare");
    next.set("view_compare", view);
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [codes, view]);

  const populationLabel = metadata.populations.find((item) => item.code === population)?.label ?? "Ensemble";
  const compareInput = useMemo(
    () => ({ compared, measure, populationLabel, view }),
    [compared, measure, populationLabel, view],
  );
  const current = useMemo(
    () => buildMortalityCompare({ ...compareInput, tokens }),
    [compareInput, tokens],
  );

  const sourceLine = `Source · ${metadata.source} · ${metadata.scope}`;
  const scope = `${populationLabel} · ${year} · effectifs bruts, sans taux`;
  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    source: "mortality", cause: codes[0] ?? cause, population,
    start_year: String(metadata.years[0] ?? year), end_year: String(year),
    dimensions: "year,cause,population", measures: "deaths,share",
  }));

  return <>
    <section className="patho-compare-rail">
      <EntityPicker
        catalogue={catalogue}
        selection={codes}
        onChange={setCodes}
        maximum={MAX_COMPARED}
        noun="cause"
        nounPlural="causes de décès"
      />
      <div className="pathology-loading-track"><span className={loading ? "active" : ""} /></div>
    </section>

    {error ? <div className="analysis-error"><strong>La comparaison n’a pas pu être calculée</strong><span>{error}</span></div> : null}

    <ChartShell
      kicker="Mortalité · comparaison"
      title={current.title}
      forms={current.forms}
      form={current.form}
      onForm={setView}
      question={current.question}
      headerActions={
        <div className="pathology-toggle" aria-label="Mesure">
          <button type="button" className={measure === "deaths" ? "active" : ""}
            onClick={() => setMeasure("deaths")}>Nombre</button>
          <button type="button" className={measure === "share" ? "active" : ""}
            onClick={() => setMeasure("share")}>Part</button>
        </div>
      }
      height={current.height}
      option={current.option}
      exportOption={(palette) => buildMortalityCompare({ ...compareInput, tokens: palette }).option
        ?? current.option!}
      empty={current.empty}
      loading={loading}
      ariaLabel={current.ariaLabel}
      tableColumns={current.table.columns}
      tableRows={current.table.rows}
      caveats={current.caveats}
      sourceLine={sourceLine}
      filenamePrefix="mortalite-comparaison"
      scope={scope}
      onExtract={openExtraction}
      className="mortality-stage"
    />
  </>;
}
