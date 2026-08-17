/** Plusieurs pathologies mises en regard.
 *
 *  Le pendant de `damir/CompareSection.tsx`, avec les mêmes gestes : le rail
 *  « Ce que je compare » posé **sous les filtres et au-dessus du panneau du
 *  graphique**, un périmètre réglable série par série, des noms qu'on écrit, et
 *  des vues nommées par la question à laquelle elles répondent.
 *
 *  Le serveur ne sait renvoyer qu'une fiche à la fois : la mise en regard est
 *  donc un assemblage côté écran, une requête par série, en parallèle. Comme
 *  chaque série peut porter son propre territoire, son âge ou son sexe, c'est
 *  aussi ce qui rend le périmètre par série possible sans rien changer au
 *  serveur.
 */

import { useEffect, useMemo, useState } from "react";
import { getPathologyOverview } from "../api";
import { ChartShell } from "../components/ChartShell";
import { paletteColor, useChartTokens } from "../charts/tokens";
import {
  SeriesRail, hasMixedPopulations, seriesName,
  type SeriesEntry, type SeriesScope,
} from "../components/SeriesRail";
import { openingSelection, pathologyCatalogue } from "./catalogue";
import { buildPathologyCompare } from "./model";
import {
  MAX_COMPARED, SOURCE_LINE, pathologyScopeFields, pathologyScopeOf, scopeLabel,
  type PathologySectionProps,
} from "./section";
import type { PathologyOverview } from "../types";

type Props = PathologySectionProps & {
  /** La pathologie du panorama : elle ouvre la comparaison, sans quoi on
   *  comparerait des voisines sans le sujet. */
  top: string;
};

type Compared = { label: string; overview: PathologyOverview };

const SERIES_COUNTS = [2, 5, 8] as const;

/** Les séries écrites dans l'adresse : les codes d'un côté, les noms et les
 *  périmètres indexés par position de l'autre. Un même code pouvant figurer
 *  deux fois — la même pathologie sur deux territoires — la position est la
 *  seule identité stable. */
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
  metadata, year, region, age, sex, measure, setMeasure, onOpenExtraction, routeVersion, top,
}: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();
  const catalogue = useMemo(() => pathologyCatalogue(metadata), [metadata]);
  const fields = useMemo(() => pathologyScopeFields(metadata), [metadata]);
  const base = useMemo<SeriesScope>(() => ({ region, age, sex }), [region, age, sex]);

  const opening = useMemo(() => openingSelection(catalogue), [catalogue]);
  const [entries, setEntries] = useState<SeriesEntry[]>(() => entriesFromParams(params));
  const [count, setCount] = useState(3);
  const [view, setView] = useState(() => params.get("view_compare") ?? "line");
  const [compared, setCompared] = useState<Compared[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // À l'ouverture, trois pathologies parlantes plutôt qu'une seule : une
  // comparaison à un élément n'apprend rien. Le sujet du panorama s'y ajoute
  // s'il n'y figure pas déjà — on est venu de là.
  useEffect(() => {
    if (!opening.codes.length) return;
    setEntries((current) => {
      if (current.length) return current;
      const seeded = [...opening.codes];
      if (top && !seeded.includes(top)) seeded.unshift(top);
      return seeded.slice(0, MAX_COMPARED).map((code) => ({ code }));
    });
  }, [opening, top]);

  const fetchKey = useMemo(
    () => JSON.stringify([entries.map((entry) => [entry.code, entry.scope ?? null]), year, base]),
    [entries, year, base],
  );

  useEffect(() => {
    if (!year || !entries.length) { setCompared([]); return; }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all(entries.map((entry) =>
      getPathologyOverview(
        entry.code, year, pathologyScopeOf(entry.scope, region, age, sex), controller.signal,
      ).then((next) => ({
        label: seriesName(entry, catalogue, base, fields) || next.context.label,
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
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [entries, view]);

  const scope = scopeLabel(metadata, year, region, age, sex);
  const mixed = hasMixedPopulations(entries, base, fields);
  /** Ce que la sélection d'ouverture a dû remplacer : dit en réserve, jamais
   *  passé sous silence. */
  const substitutions = useMemo(
    () => opening.substituted
      .filter(({ code }) => entries.some((entry) => entry.code === code))
      .map(({ wanted, taken }) =>
        `La sélection d’ouverture demandait « ${wanted} », que la nomenclature Cnam ne publie pas sous ce nom : « ${taken} » a été retenue à la place.`),
    [opening, entries],
  );
  const compareInput = useMemo(
    () => ({ compared, measure, scopeLabel: scope, view, mixed, extraCaveats: substitutions }),
    [compared, measure, scope, view, mixed, substitutions],
  );
  const current = useMemo(
    () => buildPathologyCompare({ ...compareInput, tokens }),
    [compareInput, tokens],
  );

  /** Le poids d'une série dans le rail : sa dernière valeur connue, celle-là
   *  même que le graphique met en rang. */
  const valueOf = (_entry: SeriesEntry, index: number) => {
    const rows = compared[index]?.overview.annual ?? [];
    const last = [...rows].reverse().find((row) =>
      (measure === "prevalence" ? row.prevalence : row.patients) !== null);
    return last ? (measure === "prevalence" ? last.prevalence : last.patients) : null;
  };

  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    page: "extraction", source: "pathologies", top: entries[0]?.code ?? top,
    start_year: String(metadata.years[0] ?? 2015), end_year: String(year),
  }));

  return <>
    {/* Ce que je compare, juste sous les filtres : on lit dans l'ordre où on
        pense — je fixe le périmètre, je vois ce que je mets en regard, puis je
        choisis la forme. */}
    <SeriesRail
      catalogue={catalogue}
      entries={entries}
      onChange={setEntries}
      maximum={MAX_COMPARED}
      noun="pathologie"
      nounPlural="pathologies"
      fields={fields}
      base={base}
      baseLabel={scope}
      colorOf={(index) => paletteColor(tokens, index, entries.length)}
      valueOf={valueOf}
      kind={measure === "prevalence" ? "percent" : "quantity"}
      count={count}
      counts={SERIES_COUNTS}
      onCountChange={(next) => {
        setCount(next);
        setEntries(catalogue.slice(0, next).map((item) => ({ code: item.code })));
      }}
    />

    {error ? <div className="analysis-error"><strong>La comparaison n’a pas pu être calculée</strong><span>{error}</span></div> : null}

    <ChartShell
      title={current.title}
      forms={current.forms}
      form={current.form}
      onForm={setView}
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
      filenamePrefix="pathologies-comparaison"
      scope={scope}
      onExtract={openExtraction}
      className="pathology-stage"
    />
  </>;
}
