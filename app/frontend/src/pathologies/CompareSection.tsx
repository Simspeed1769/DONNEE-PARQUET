/** Plusieurs pathologies mises en regard.
 *
 *  Le pendant de `damir/CompareSection.tsx`, avec les mêmes gestes : un résumé
 *  de ce qu'on compare **sous les filtres et au-dessus du graphique**, un
 *  sélecteur unique qui s'ouvre en dessous, et des vues nommées par la question
 *  à laquelle elles répondent.
 *
 *  Le serveur ne sait renvoyer qu'une fiche à la fois : la mise en regard est
 *  donc un assemblage côté écran, une requête par pathologie, en parallèle.
 */

import { useEffect, useMemo, useState } from "react";
import { getPathologyOverview } from "../api";
import { ChartShell } from "../components/ChartShell";
import { useChartTokens } from "../charts/tokens";
import { PathologyPicker, pathologyCatalogue } from "./PathologyPicker";
import { buildPathologyCompare } from "./model";
import { MAX_COMPARED, SOURCE_LINE, scopeLabel, type PathologySectionProps } from "./section";
import type { PathologyOverview } from "../types";

type Props = PathologySectionProps & {
  /** La pathologie du panorama : elle ouvre la comparaison, sans quoi on
   *  comparerait des voisines sans le sujet. */
  top: string;
};

type Compared = { code: string; label: string; overview: PathologyOverview };

export function CompareSection({
  metadata, year, region, age, sex, measure, setMeasure, onOpenExtraction, routeVersion, top,
}: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();
  const catalogue = useMemo(() => pathologyCatalogue(metadata), [metadata]);

  const [codes, setCodes] = useState<string[]>(() => {
    const raw = params.get("compare");
    const parsed = raw ? raw.split("~").filter(Boolean) : [];
    return parsed.length ? parsed.slice(0, MAX_COMPARED) : (top ? [top] : []);
  });
  const [view, setView] = useState(() => params.get("view_compare") ?? "line");
  const [compared, setCompared] = useState<Compared[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le sujet du panorama entre dans la comparaison la première fois qu'on y
  // arrive, et jamais de force ensuite : on peut vouloir comparer sans lui.
  useEffect(() => {
    if (!top) return;
    setCodes((current) => (current.length ? current : [top]));
  }, [top]);

  const fetchKey = useMemo(
    () => JSON.stringify([codes, year, region, age, sex]),
    [codes, year, region, age, sex],
  );

  useEffect(() => {
    if (!year || !codes.length) { setCompared([]); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all(codes.map((code) =>
      getPathologyOverview(code, year, { region, age, sex }, controller.signal)
        .then((next) => ({
          code,
          label: catalogue.find((item) => item.code === code)?.label ?? next.context.label,
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

  const scope = scopeLabel(metadata, year, region, age, sex);
  const compareInput = useMemo(
    () => ({ compared, measure, scopeLabel: scope, view }),
    [compared, measure, scope, view],
  );
  const current = useMemo(
    () => buildPathologyCompare({ ...compareInput, tokens }),
    [compareInput, tokens],
  );

  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    page: "extraction", source: "pathologies", top: codes[0] ?? top,
    start_year: String(metadata.years[0] ?? 2015), end_year: String(year),
  }));

  return <>
    {/* Ce que je compare, juste sous les filtres : on lit dans l'ordre où on
        pense — je fixe le périmètre, je vois ce que je mets en regard, puis je
        choisis la forme. */}
    <section className="panel pathology-context patho-compare-rail">
      <PathologyPicker
        catalogue={catalogue}
        selection={codes}
        onChange={setCodes}
        maximum={MAX_COMPARED}
      />
      <div className={`pathology-loading-track ${loading ? "active" : ""}`}><span /></div>
    </section>

    {error ? <div className="analysis-error"><strong>La comparaison n’a pas pu être calculée</strong><span>{error}</span></div> : null}

    <ChartShell
      kicker="Pathologies · comparaison"
      title={current.title}
      forms={current.forms}
      form={current.form}
      onForm={setView}
      question={current.question}
      headerActions={
        <div className="pathology-toggle" aria-label="Mesure">
          <button type="button" className={measure === "prevalence" ? "active" : ""}
            onClick={() => setMeasure("prevalence")}>Prévalence</button>
          <button type="button" className={measure === "patients" ? "active" : ""}
            onClick={() => setMeasure("patients")}>Patients</button>
        </div>
      }
      height={current.height}
      option={current.option}
      exportOption={(palette) => buildPathologyCompare({ ...compareInput, tokens: palette }).option
        ?? current.option!}
      empty={current.empty}
      loading={loading}
      ariaLabel={current.ariaLabel}
      tableColumns={current.table.columns}
      tableRows={current.table.rows}
      caveats={current.caveats}
      sourceLine={SOURCE_LINE}
      filenamePrefix="pathologies-comparaison"
      scope={scope}
      onExtract={openExtraction}
      className="pathology-stage"
    />
  </>;
}
