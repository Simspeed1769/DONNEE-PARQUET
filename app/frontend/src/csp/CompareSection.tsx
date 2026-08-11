/** Plusieurs catégories socioprofessionnelles mises en regard.
 *
 *  Remplace l'ancienne lecture « Composition », qui répondait à une question
 *  d'une autre nature que les trois autres : c'était une comparaison déguisée
 *  en lecture. La composition d'un territoire s'obtient ici comme une **vue** —
 *  les parts empilées sur les effectifs — au lieu d'un écran à part.
 *
 *  Les deux niveaux de nomenclature cohabitent dans le sélecteur : on compare
 *  un grand groupe à une catégorie fine si la question l'exige, chaque entrée
 *  portant son niveau.
 */

import { useEffect, useMemo, useState } from "react";
import { getCspEvolution } from "../api";
import { ChartShell } from "../components/ChartShell";
import { EntityPicker } from "../components/EntityPicker";
import { useChartTokens } from "../charts/tokens";
import { buildCspCompare } from "./model";
import { MAX_COMPARED, SOURCE_LINE, cspCatalogue, scopeLabel, type CspSectionProps } from "./section";

type Compared = {
  code: string;
  label: string;
  annual: Array<{ year: number; effectif: number | null; share: number | null }>;
};

type Props = CspSectionProps & {
  /** La CSP du panorama : elle ouvre la comparaison, sans quoi on comparerait
   *  des voisines sans le sujet. */
  selected: string;
};

export function CompareSection({
  metadata, year, region, age, sex, measure, setMeasure, onOpenExtraction, routeVersion, selected,
}: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();
  const catalogue = useMemo(() => cspCatalogue(metadata), [metadata]);

  const [codes, setCodes] = useState<string[]>(() => {
    const raw = params.get("compare");
    const parsed = raw ? raw.split("~").filter(Boolean) : [];
    return parsed.length ? parsed.slice(0, MAX_COMPARED) : (selected ? [selected] : []);
  });
  const [view, setView] = useState(() => params.get("view_compare") ?? "line");
  const [compared, setCompared] = useState<Compared[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) return;
    setCodes((current) => (current.length ? current : [selected]));
  }, [selected]);

  const fetchKey = useMemo(
    () => JSON.stringify([codes, region, age, sex]),
    [codes, region, age, sex],
  );

  useEffect(() => {
    if (!codes.length) { setCompared([]); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all(codes.map((key) => {
      const entry = catalogue.find((item) => item.code === key);
      if (!entry) return Promise.resolve(null);
      return getCspEvolution(
        { level: entry.level, csp_code: entry.raw, region, age, sex },
        controller.signal,
      ).then((next) => ({
        code: key,
        label: entry.label,
        annual: next.rows.map((row) => ({
          year: row.year, effectif: row.effectif, share: row.share,
        })),
      }));
    }))
      .then((rows) => {
        if (active) setCompared(rows.filter((row): row is Compared => row !== null));
      })
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
  const current = useMemo(() => buildCspCompare({ ...compareInput, tokens }), [compareInput, tokens]);

  const first = catalogue.find((item) => item.code === (codes[0] ?? selected));
  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    page: "extraction", source: "csp", year: String(year),
    level: first?.level ?? "groupe_6", csp: first?.raw ?? "3",
  }));

  return <>
    <section className="panel pathology-context patho-compare-rail">
      <EntityPicker
        catalogue={catalogue}
        selection={codes}
        onChange={setCodes}
        maximum={MAX_COMPARED}
        noun="catégorie"
        nounPlural="catégories socioprofessionnelles"
      />
      <div className={`pathology-loading-track ${loading ? "active" : ""}`}><span /></div>
    </section>

    {error ? <div className="analysis-error"><strong>La comparaison n’a pas pu être calculée</strong><span>{error}</span></div> : null}

    <ChartShell
      kicker="CSP · comparaison"
      title={current.title}
      forms={current.forms}
      form={current.form}
      onForm={setView}
      question={current.question}
      headerActions={
        <div className="pathology-toggle" aria-label="Mesure">
          <button type="button" className={measure === "share" ? "active" : ""}
            onClick={() => setMeasure("share")}>Part</button>
          <button type="button" className={measure === "effectif" ? "active" : ""}
            onClick={() => setMeasure("effectif")}>Effectif</button>
        </div>
      }
      height={current.height}
      option={current.option}
      exportOption={(palette) => buildCspCompare({ ...compareInput, tokens: palette }).option
        ?? current.option!}
      empty={current.empty}
      loading={loading}
      ariaLabel={current.ariaLabel}
      tableColumns={current.table.columns}
      tableRows={current.table.rows}
      caveats={current.caveats}
      sourceLine={SOURCE_LINE}
      filenamePrefix="csp-comparaison"
      scope={scope}
      onExtract={openExtraction}
      className="csp-stage"
    />
  </>;
}
