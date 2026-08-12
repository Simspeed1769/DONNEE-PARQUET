/** Plusieurs catégories socioprofessionnelles mises en regard.
 *
 *  Remplace l'ancienne lecture « Composition », qui répondait à une question
 *  d'une autre nature que les trois autres : c'était une comparaison déguisée
 *  en lecture. La composition d'un territoire s'obtient ici comme une **vue** —
 *  les parts empilées sur les effectifs — au lieu d'un écran à part.
 *
 *  Les gestes sont ceux de DAMIR : le rail « Ce que je compare » sous les
 *  filtres, un périmètre réglable série par série, des noms qu'on écrit, et le
 *  repli « Reste du périmètre » que la population du périmètre rend calculable
 *  exactement — l'endpoint d'évolution renvoie le dénominateur avec l'effectif.
 *
 *  Les deux niveaux de nomenclature cohabitent dans le sélecteur : on compare
 *  un grand groupe à une catégorie fine si la question l'exige, chaque entrée
 *  portant son niveau. Le repli, lui, ne s'offre qu'à un seul niveau à la fois :
 *  additionner un groupe et l'une de ses catégories compterait deux fois les
 *  mêmes personnes.
 */

import { useEffect, useMemo, useState } from "react";
import { getCspEvolution } from "../api";
import { ChartShell } from "../components/ChartShell";
import { paletteColor, useChartTokens } from "../charts/tokens";
import {
  SeriesRail, hasMixedPopulations, seriesName,
  type SeriesEntry, type SeriesScope,
} from "../components/SeriesRail";
import { buildCspCompare } from "./model";
import {
  MAX_COMPARED, SOURCE_LINE, cspCatalogue, cspOpeningSelection, cspScopeFields, cspScopeOf,
  scopeLabel, type CspSectionProps,
} from "./section";

type Row = { year: number; population: number | null; effectif: number | null; share: number | null };
type Compared = { label: string; isOther?: boolean; annual: Row[] };

type Props = CspSectionProps & {
  /** La CSP du panorama : elle ouvre la comparaison, sans quoi on comparerait
   *  des voisines sans le sujet. */
  selected: string;
};

const SERIES_COUNTS = [2, 5, 8] as const;

function entriesFromParams(params: URLSearchParams): SeriesEntry[] {
  const codes = (params.get("compare") ?? "").split("~").filter(Boolean);
  const read = <T,>(key: string): T[] => {
    try {
      const parsed = JSON.parse(params.get(key) ?? "[]");
      return Array.isArray(parsed) ? parsed as T[] : [];
    } catch { return []; }
  };
  const names = read<string | null>("series_names");
  const scopes = read<SeriesScope | null>("series_scopes");
  return codes.slice(0, MAX_COMPARED).map((code, index) => ({
    code,
    name: names[index] ?? undefined,
    scope: scopes[index] ?? undefined,
  }));
}

export function CompareSection({
  metadata, year, region, age, sex, measure, setMeasure, onOpenExtraction, routeVersion, selected,
}: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();
  const catalogue = useMemo(() => cspCatalogue(metadata), [metadata]);
  const fields = useMemo(() => cspScopeFields(metadata), [metadata]);
  const base = useMemo<SeriesScope>(() => ({ region, age, sex: String(sex) }), [region, age, sex]);

  const [entries, setEntries] = useState<SeriesEntry[]>(() => entriesFromParams(params));
  const [count, setCount] = useState(3);
  const [view, setView] = useState(() => params.get("view_compare") ?? "line");
  const [showOther, setShowOther] = useState(params.get("other") === "1");
  const [compared, setCompared] = useState<Compared[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // À l'ouverture, les trois groupes les plus nombreux du dernier millésime,
  // plus celui du panorama s'il n'y figure pas : on est venu de là.
  useEffect(() => {
    if (!catalogue.length) return;
    setEntries((current) => {
      if (current.length) return current;
      const seeded = cspOpeningSelection(catalogue);
      if (selected && catalogue.some((item) => item.code === selected) && !seeded.includes(selected)) {
        seeded.unshift(selected);
      }
      return seeded.slice(0, MAX_COMPARED).map((code) => ({ code }));
    });
  }, [catalogue, selected]);

  const fetchKey = useMemo(
    () => JSON.stringify([entries.map((entry) => [entry.code, entry.scope ?? null]), base]),
    [entries, base],
  );

  useEffect(() => {
    if (!entries.length) { setCompared([]); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all(entries.map((entry) => {
      const option = catalogue.find((item) => item.code === entry.code);
      if (!option) return Promise.resolve(null);
      return getCspEvolution(
        { level: option.level, csp_code: option.raw, ...cspScopeOf(entry.scope, region, age, sex) },
        controller.signal,
      ).then((next): Compared => ({
        label: seriesName(entry, catalogue, base, fields),
        annual: next.rows.map((row) => ({
          year: row.year, population: row.population ?? null,
          effectif: row.effectif, share: row.share,
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
    if (entries.length) {
      next.set("compare", entries.map((entry) => entry.code).join("~"));
      const names = entries.map((entry) => entry.name?.trim() || null);
      const scopes = entries.map((entry) => entry.scope ?? null);
      if (names.some(Boolean)) next.set("series_names", JSON.stringify(names));
      else next.delete("series_names");
      if (scopes.some(Boolean)) next.set("series_scopes", JSON.stringify(scopes));
      else next.delete("series_scopes");
    } else {
      ["compare", "series_names", "series_scopes"].forEach((key) => next.delete(key));
    }
    next.set("view_compare", view);
    next.set("other", showOther ? "1" : "0");
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [entries, view, showOther]);

  const scope = scopeLabel(metadata, year, region, age, sex);
  const mixed = hasMixedPopulations(entries, base, fields);

  /** Le repli est licite quand les séries sont toutes du même niveau, toutes
   *  sur le périmètre commun, et que la mesure compose un tout. Sinon il
   *  n'existe pas : un « reste » de parts régionales, ou un reste mêlant un
   *  groupe et l'une de ses catégories, compterait deux fois les mêmes
   *  personnes. */
  const levels = useMemo(
    () => new Set(entries.map((entry) => catalogue.find((item) => item.code === entry.code)?.level)),
    [entries, catalogue],
  );
  const otherAvailable = !mixed && measure === "effectif" && levels.size === 1 && entries.length > 0;

  /** Le reste du périmètre, année par année : la population active moins ce que
   *  les séries retenues en prennent. */
  const otherRow = useMemo((): Compared | null => {
    if (!otherAvailable || !compared.length) return null;
    const years = compared[0].annual.map((row) => row.year);
    return {
      label: "Reste du périmètre",
      isOther: true,
      annual: years.map((year) => {
        const rows = compared.map((item) => item.annual.find((row) => row.year === year));
        const population = rows[0]?.population ?? null;
        if (population === null || rows.some((row) => !row || row.effectif === null)) {
          // Une donnée absente reste absente : le reste ne se devine pas.
          return { year, population, effectif: null, share: null };
        }
        const taken = rows.reduce((sum, row) => sum + (row!.effectif ?? 0), 0);
        const rest = Math.max(0, population - taken);
        return { year, population, effectif: rest, share: population ? (100 * rest) / population : null };
      }),
    };
  }, [otherAvailable, compared]);

  const drawn = useMemo(
    () => (showOther && otherRow ? [...compared, otherRow] : compared),
    [compared, otherRow, showOther],
  );

  const compareInput = useMemo(
    () => ({ compared: drawn, measure, scopeLabel: scope, view, mixed }),
    [drawn, measure, scope, view, mixed],
  );
  const current = useMemo(() => buildCspCompare({ ...compareInput, tokens }), [compareInput, tokens]);

  const valueOf = (_entry: SeriesEntry, index: number) => {
    const rows = compared[index]?.annual ?? [];
    const last = [...rows].reverse().find((row) =>
      (measure === "share" ? row.share : row.effectif) !== null);
    return last ? (measure === "share" ? last.share : last.effectif) : null;
  };

  const first = catalogue.find((item) => item.code === (entries[0]?.code ?? selected));
  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    page: "extraction", source: "csp", year: String(year),
    level: first?.level ?? "groupe_6", csp: first?.raw ?? "3",
  }));

  return <>
    <SeriesRail
      catalogue={catalogue}
      entries={entries}
      onChange={setEntries}
      maximum={MAX_COMPARED}
      noun="catégorie"
      nounPlural="catégories socioprofessionnelles"
      fields={fields}
      base={base}
      baseLabel={scope}
      colorOf={(index) => paletteColor(tokens, index, entries.length)}
      valueOf={valueOf}
      kind={measure === "share" ? "percent" : "quantity"}
      other={otherAvailable ? {
        label: "Reste du périmètre",
        on: showOther,
        onToggle: setShowOther,
        color: tokens.seriesOther,
      } : null}
      count={count}
      counts={SERIES_COUNTS}
      onCountChange={(next) => {
        setCount(next);
        setEntries(cspOpeningSelection(catalogue, next).map((code) => ({ code })));
      }}
    />

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
      legend={current.legend}
      afterChart={mixed ? (
        <p className="damir-note">
          Une ou plusieurs séries portent leur propre périmètre : elles ne décrivent pas
          la même population et ne s’additionnent pas.
        </p>
      ) : null}
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
