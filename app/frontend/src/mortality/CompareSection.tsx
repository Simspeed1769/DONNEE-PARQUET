/** Plusieurs causes de décès mises en regard.
 *
 *  Remplace l'ancienne lecture « Causes », qui classait les douze premières :
 *  c'était une comparaison présentée comme une lecture. On choisit désormais
 *  les causes, et le catalogue étant classé par nombre de décès, retenir les
 *  premières reproduit l'ancien classement.
 *
 *  Les gestes sont ceux de DAMIR : le rail « Ce que je compare » sous les
 *  filtres, un périmètre réglable série par série — ici la population publiée,
 *  seule dimension que le CépiDc offre — et le repli « Reste du périmètre »,
 *  qui n'existe qu'entre chapitres : additionner un chapitre et l'un de ses
 *  détails compterait deux fois les mêmes décès.
 */

import { useEffect, useMemo, useState } from "react";
import { getMortalityOverview } from "../api";
import { ChartShell } from "../components/ChartShell";
import { paletteColor, useChartTokens } from "../charts/tokens";
import {
  SeriesRail, hasMixedPopulations, seriesName,
  type SeriesEntry, type SeriesScope,
} from "../components/SeriesRail";
import { buildMortalityCompare } from "./model";
import {
  MAX_COMPARED, allCausesCode, causeCatalogue, isChapter, mortalityOpeningSelection,
  mortalityScopeFields, mortalityScopeOf, type MortalitySectionProps,
} from "./section";
import type { MortalityOverview } from "../types";

type Compared = { label: string; isOther?: boolean; overview: MortalityOverview };

type Props = MortalitySectionProps & {
  /** La cause du panorama : elle ouvre la comparaison. */
  cause: string;
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
  metadata, year, population, measure, setMeasure, onOpenExtraction, routeVersion, cause,
}: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();
  const catalogue = useMemo(() => causeCatalogue(metadata), [metadata]);
  const fields = useMemo(() => mortalityScopeFields(metadata), [metadata]);
  const base = useMemo<SeriesScope>(() => ({ population }), [population]);

  const [entries, setEntries] = useState<SeriesEntry[]>(() => entriesFromParams(params));
  const [count, setCount] = useState(3);
  const [view, setView] = useState(() => params.get("view_compare") ?? "line");
  const [showOther, setShowOther] = useState(params.get("other") === "1");
  const [compared, setCompared] = useState<Compared[]>([]);
  const [rest, setRest] = useState<MortalityOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // À l'ouverture, les trois causes les plus fréquentes de la dernière année,
  // plus celle du panorama si elle n'y figure pas : on est venu de là.
  useEffect(() => {
    if (!catalogue.length) return;
    setEntries((current) => {
      if (current.length) return current;
      const seeded = mortalityOpeningSelection(metadata, catalogue);
      if (cause && catalogue.some((item) => item.code === cause) && !seeded.includes(cause)) {
        seeded.unshift(cause);
      }
      return seeded.slice(0, MAX_COMPARED).map((code) => ({ code }));
    });
  }, [catalogue, metadata, cause]);

  const fetchKey = useMemo(
    () => JSON.stringify([entries.map((entry) => [entry.code, entry.scope ?? null]), year, population]),
    [entries, year, population],
  );

  useEffect(() => {
    if (!year || !entries.length) { setCompared([]); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all(entries.map((entry) =>
      getMortalityOverview(
        { cause: entry.code, population: mortalityScopeOf(entry.scope, population), year },
        controller.signal,
      ).then((next): Compared => ({
        label: seriesName(entry, catalogue, base, fields) || next.context.cause_label,
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

  const populationLabel = metadata.populations.find((item) => item.code === population)?.label ?? "Ensemble";
  const mixed = hasMixedPopulations(entries, base, fields);

  /** Le repli n'est licite qu'entre chapitres, sur le périmètre commun et sur
   *  les décès : deux chapitres sont disjoints, un chapitre et l'un de ses
   *  détails ne le sont pas, et une part est déjà rapportée au total. */
  const otherAvailable = !mixed && measure === "deaths" && entries.length > 0
    && entries.every((entry) => isChapter(metadata, entry.code));

  /** Le total publié : « Toutes causes » sur la même année et la même
   *  population. Il n'est demandé que si le repli est affiché — une requête de
   *  plus n'a pas à partir pour une ligne qu'on ne montre pas. */
  useEffect(() => {
    const total = allCausesCode(metadata);
    if (!showOther || !otherAvailable || !total || !year) { setRest(null); return; }
    const controller = new AbortController();
    let active = true;
    getMortalityOverview({ cause: total, population, year }, controller.signal)
      .then((next) => { if (active) setRest(next); })
      .catch((reason: Error) => { if (active && reason.name !== "AbortError") setRest(null); });
    return () => { active = false; controller.abort(); };
  }, [showOther, otherAvailable, metadata, population, year]);

  /** Le reste du périmètre : tous les décès, moins ceux des chapitres retenus. */
  const otherRow = useMemo((): Compared | null => {
    if (!rest || !showOther || !otherAvailable || !compared.length) return null;
    return {
      label: "Reste du périmètre",
      isOther: true,
      overview: {
        ...rest,
        annual: rest.annual.map((row) => {
          const rows = compared.map((item) => item.overview.annual.find((entry) => entry.year === row.year));
          // Une donnée absente reste absente : le reste ne se devine pas.
          if (row.deaths === null || rows.some((entry) => !entry || entry.deaths === null)) {
            return { year: row.year, deaths: null, share: null };
          }
          const taken = rows.reduce((sum, entry) => sum + (entry!.deaths ?? 0), 0);
          const remainder = Math.max(0, row.deaths - taken);
          return {
            year: row.year,
            deaths: remainder,
            share: row.deaths ? (100 * remainder) / row.deaths : null,
          };
        }),
      },
    };
  }, [rest, showOther, otherAvailable, compared]);

  const drawn = useMemo(
    () => (otherRow ? [...compared, otherRow] : compared),
    [compared, otherRow],
  );

  const compareInput = useMemo(
    () => ({ compared: drawn, measure, populationLabel, view, mixed }),
    [drawn, measure, populationLabel, view, mixed],
  );
  const current = useMemo(
    () => buildMortalityCompare({ ...compareInput, tokens }),
    [compareInput, tokens],
  );

  const valueOf = (_entry: SeriesEntry, index: number) => {
    const rows = compared[index]?.overview.annual ?? [];
    const last = [...rows].reverse().find((row) =>
      (measure === "share" ? row.share : row.deaths) !== null);
    return last ? (measure === "share" ? last.share : last.deaths) : null;
  };

  const sourceLine = `Source · ${metadata.source} · ${metadata.scope}`;
  const scope = `${populationLabel} · ${year} · effectifs bruts, sans taux`;
  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    source: "mortality", cause: entries[0]?.code ?? cause, population,
    start_year: String(metadata.years[0] ?? year), end_year: String(year),
    dimensions: "year,cause,population", measures: "deaths,share",
  }));

  return <>
    <SeriesRail
      catalogue={catalogue}
      entries={entries}
      onChange={setEntries}
      maximum={MAX_COMPARED}
      noun="cause"
      nounPlural="causes de décès"
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
        setEntries(mortalityOpeningSelection(metadata, catalogue, next).map((code) => ({ code })));
      }}
    />

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
      legend={current.legend}
      afterChart={mixed ? (
        <p className="damir-note">
          Une ou plusieurs séries portent leur propre population : elles ne décrivent pas
          la même population et ne s’additionnent pas.
        </p>
      ) : null}
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
