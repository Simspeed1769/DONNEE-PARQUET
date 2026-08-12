/** Mortalité : une coquille, deux sections — comme les trois autres bases.
 *
 *  « Causes » était une lecture parmi les quatre autres, alors qu'elle classait
 *  douze causes les unes contre les autres : une comparaison présentée comme
 *  une lecture. Elle devient la section Comparer, où l'on choisit les causes
 *  qu'on met en regard — le catalogue étant classé par nombre de décès, retenir
 *  les premières reproduit l'ancien classement.
 *
 *  **Une dérogation assumée à l'uniformité des quatre bases** : il n'y a pas de
 *  lecture Territoire. Le CépiDc publie des effectifs nationaux, sans découpage
 *  régional ni population de référence. Une carte serait inventée, et les
 *  réserves du graphique en donnent la raison.
 */

import { useEffect, useMemo, useState } from "react";
import { getMortalityMetadata, getMortalityOverview } from "../api";
import { PageHero } from "../components/PageHero";
import { SearchableCauseSelect } from "../components/SearchableCauseSelect";
import { paletteParams, readPalette } from "../charts/palette";
import { CompareSection } from "../mortality/CompareSection";
import { PanoramaSection } from "../mortality/PanoramaSection";
import type { MortalityMeasure } from "../mortality/section";
import type { MortalityMetadata, MortalityOverview } from "../types";

type Props = {
  routeVersion: number;
  onOpenExtraction: (params: URLSearchParams) => void;
  onOpenMethodology: () => void;
};

type Section = "panorama" | "compare";

const SECTIONS: Array<{ key: Section; label: string; hint: string }> = [
  { key: "panorama", label: "Panorama", hint: "Une cause, trois angles" },
  { key: "compare", label: "Comparer", hint: "Plusieurs causes en regard" },
];

export function MortalityPage({ routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);

  const [metadata, setMetadata] = useState<MortalityMetadata | null>(null);
  const [overview, setOverview] = useState<MortalityOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [section, setSection] = useState<Section>(() => {
    const raw = params.get("section");
    return SECTIONS.some((item) => item.key === raw) ? raw as Section : "panorama";
  });
  const [cause, setCause] = useState(params.get("cause") ?? "");
  const [population, setPopulation] = useState(params.get("population") ?? "ensemble");
  const [year, setYear] = useState(Number(params.get("year")) || 0);
  const [measure, setMeasure] = useState<MortalityMeasure>(
    params.get("measure") === "share" ? "share" : "deaths",
  );

  useEffect(() => {
    const controller = new AbortController();
    getMortalityMetadata(controller.signal)
      .then((next) => {
        setMetadata(next);
        const preferred = next.causes.find((item) => item.label === "Toutes causes") ?? next.causes[0];
        if (!cause || !next.causes.some((item) => item.code === cause)) setCause(preferred?.code ?? "");
        if (!year || !next.years.includes(year)) setYear(next.default_year);
        if (!next.populations.some((item) => item.code === population)) setPopulation("ensemble");
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") { setError(reason.message); setLoading(false); }
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** La fiche de la cause courante, pour le panorama. La comparaison ne s'en
   *  sert plus : son catalogue se classe désormais sur les poids que portent
   *  les métadonnées, ce qui couvre les 86 causes et non les douze que la fiche
   *  cite. */
  useEffect(() => {
    if (!cause || !year) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getMortalityOverview({ cause, population, year }, controller.signal)
        .then((next) => { if (active) setOverview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [cause, population, year]);

  useEffect(() => {
    if (!cause || !year) return;
    const next = new URLSearchParams(window.location.search);
    Object.entries({
      page: "mortality", section, cause, population, year: String(year), measure,
      ...paletteParams(readPalette()),
    }).forEach(([key, value]) => next.set(key, value));
    if (readPalette() !== "blue") next.delete("palette");
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [section, cause, population, year, measure]);

  if (!metadata) {
    return (
      <div className="content-wrap mortality-page">
        {error
          ? <div className="analysis-error"><strong>La base Mortalité n’a pas pu être chargée</strong><span>{error}</span></div>
          : <div className="page-loader"><div className="skeleton" /></div>}
      </div>
    );
  }

  const shared = {
    metadata, year, population, measure, setMeasure, onOpenExtraction, routeVersion,
  };
  const sourceLine = `Source · ${metadata.source} · ${metadata.scope}`;

  return (
    <div className="content-wrap mortality-page">
      <PageHero
        variant="mortality-hero"
        eyebrowLabel="CépiDc · Inserm"
        eyebrowDetail="Source nationale"
        title="Mortalité"
        mission="Lire les décès publiés par cause, dans le temps et selon les grands profils de population."
        action={<span className="semantic-badge">France · Métropole et DROM</span>}
      />

      <nav className="damir-sections" role="tablist" aria-label="Sections Mortalité">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={section === item.key}
            className={section === item.key ? "active" : ""}
            onClick={() => setSection(item.key)}
          >
            <strong>{item.label}</strong>
            <small>{item.hint}</small>
          </button>
        ))}
      </nav>

      {/* Le périmètre est commun aux deux sections. La cause n'y figure que
          pour le panorama : la comparaison a sa propre liste. */}
      <section className="panel mortality-context">
        <div className="mortality-filter-grid">
          {section === "panorama" ? (
            <label className="mortality-cause-filter"><span>Cause de décès</span>
              <SearchableCauseSelect options={metadata.causes} value={cause} onChange={setCause} />
            </label>
          ) : null}
          <label className="mortality-population-filter"><span>Population</span>
            <select value={population} onChange={(event) => setPopulation(event.target.value)}>
              {metadata.populations.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label className="mortality-year-filter"><span>Millésime</span>
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {metadata.years.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
        </div>
        <div className="pathology-loading-track"><span className={loading ? "active" : ""} /></div>
      </section>

      {error ? <div className="analysis-error"><strong>La fiche Mortalité n’a pas pu être calculée</strong><span>{error}</span></div> : null}

      {section === "panorama" ? (
        <PanoramaSection {...shared} overview={overview} loading={loading} />
      ) : null}
      {section === "compare" ? (
        <CompareSection {...shared} cause={cause} />
      ) : null}

      <div className="mortality-quality-note">
        <strong>À garder en tête</strong>
        <span>Source nationale sans région ni âge fin. Les cellules vides restent non disponibles ou non applicables ; elles ne sont pas interprétées comme zéro.</span>
        <button type="button" onClick={onOpenMethodology}>Méthode →</button>
      </div>
      <footer className="pathology-footer csp-footer"><span>{sourceLine}</span></footer>
    </div>
  );
}

export default MortalityPage;
