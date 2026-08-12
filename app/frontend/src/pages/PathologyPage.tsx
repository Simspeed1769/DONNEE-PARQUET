/** Pathologies : une coquille, deux sections — comme DAMIR.
 *
 *  L'écran mêlait jusqu'ici deux questions dans une seule page : explorer une
 *  pathologie, et en comparer plusieurs. La comparaison y était une « lecture »
 *  parmi les autres, avec son propre sélecteur glissé entre le titre et le
 *  graphique — un contrôle qui ne ressemblait à aucun autre de l'application.
 *
 *  Les deux questions deviennent deux sections, exactement comme sur DAMIR. Le
 *  périmètre de population et la mesure sont partagés : passer de l'une à
 *  l'autre est un changement de question, pas de sujet.
 */

import { useEffect, useMemo, useState } from "react";
import { getPathologyMetadata } from "../api";
import { PageHero } from "../components/PageHero";
import { paletteParams, readPalette } from "../charts/palette";
import { CompareSection } from "../pathologies/CompareSection";
import { PanoramaSection } from "../pathologies/PanoramaSection";
import { SOURCE_LINE, type PathologyMeasure } from "../pathologies/section";
import type { PathologyMetadata } from "../types";

type Props = {
  routeVersion: number;
  onOpenExtraction: (params: URLSearchParams) => void;
  onOpenMethodology: () => void;
};

type Section = "panorama" | "compare";

const SECTIONS: Array<{ key: Section; label: string; hint: string }> = [
  { key: "panorama", label: "Panorama", hint: "Une pathologie, quatre angles" },
  { key: "compare", label: "Comparer", hint: "Plusieurs pathologies en regard" },
];

export function PathologyPage({ routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);

  const [metadata, setMetadata] = useState<PathologyMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [section, setSection] = useState<Section>(() => {
    const raw = params.get("section");
    return SECTIONS.some((item) => item.key === raw) ? raw as Section : "panorama";
  });
  const [top, setTop] = useState(params.get("top") ?? "");
  const [year, setYear] = useState(Number(params.get("year")) || 0);
  const [region, setRegion] = useState(params.get("region") ?? "99");
  const [age, setAge] = useState(params.get("age") ?? "tsage");
  const [sex, setSex] = useState(params.get("sex") ?? "tous sexes");
  const [measure, setMeasure] = useState<PathologyMeasure>(
    params.get("measure") === "patients" ? "patients" : "prevalence",
  );

  useEffect(() => {
    const controller = new AbortController();
    getPathologyMetadata(controller.signal)
      .then((next) => {
        setMetadata(next);
        const flattened = next.families.flatMap((family) => [
          family.code,
          ...family.groups.flatMap((group) => [group.code, ...group.pathologies.map((item) => item.code)]),
        ]);
        if (!top || !flattened.includes(top)) {
          const diabetes = next.families
            .flatMap((family) => family.groups.flatMap((group) => group.pathologies))
            .find((item) => item.label.toLocaleLowerCase("fr-FR").includes("diab"));
          setTop(diabetes?.code ?? flattened[0] ?? "");
        }
        if (!year || !next.years.includes(year)) setYear(next.default_year);
        if (!next.regions.some((item) => item.code === region)) setRegion("99");
        if (!next.ages.some((item) => item.code === age)) setAge("tsage");
        if (!next.sexes.some((item) => item.code === sex)) setSex("tous sexes");
      })
      .catch((reason: Error) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** La coquille n'écrit que ce qui est commun aux deux sections ; chacune
   *  ajoute sa part. Le paramètre de palette est reporté ici, sinon cette
   *  réécriture l'effacerait. */
  useEffect(() => {
    if (!top || !year) return;
    const next = new URLSearchParams(window.location.search);
    Object.entries({
      page: "pathologies", section, top, year: String(year), region, age, sex, measure,
      ...paletteParams(readPalette()),
    }).forEach(([key, value]) => next.set(key, value));
    if (readPalette() !== "blue") next.delete("palette");
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [section, top, year, region, age, sex, measure]);

  const shared = {
    metadata: metadata!, year, region, setRegion, age, sex, measure, setMeasure,
    onOpenExtraction, routeVersion,
  };

  if (!metadata) {
    return (
      <div className="content-wrap pathology-page">
        {error
          ? <div className="analysis-error"><strong>La base Pathologies n’a pas pu être chargée</strong><span>{error}</span></div>
          : <div className="page-loader"><div className="skeleton" /></div>}
      </div>
    );
  }

  return (
    <div className="content-wrap pathology-page">
      <PageHero
        variant="pathology-hero"
        eyebrowLabel="Cartographie Cnam"
        eyebrowDetail="Populations"
        title="Pathologies"
        mission="Une fiche chiffrée pour situer une pathologie dans le temps, les âges et les territoires."
        action={<button type="button" className="method-link" onClick={onOpenMethodology}>Données &amp; méthode →</button>}
      />

      {/* Deux profondeurs d'une même exploration, et non deux outils. */}
      <nav className="damir-sections" role="tablist" aria-label="Sections Pathologies">
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

      {/* Le périmètre de population est commun aux deux sections : il vit dans
          la coquille, et changer de section ne le remet pas en cause. */}
      <section className="panel pathology-context">
        <div className="pathology-population-row">
          <label><span>Millésime</span>
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {metadata.years.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label><span>Région</span>
            <select value={region} onChange={(event) => setRegion(event.target.value)}>
              {metadata.regions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label><span>Âge</span>
            <select value={age} onChange={(event) => setAge(event.target.value)}>
              {metadata.ages.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
            </select>
          </label>
          <label><span>Sexe</span>
            <select value={sex} onChange={(event) => setSex(event.target.value)}>
              {metadata.sexes.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      {section === "panorama" ? <PanoramaSection {...shared} top={top} setTop={setTop} /> : null}
      {section === "compare" ? <CompareSection {...shared} top={top} /> : null}

      <footer className="pathology-footer"><span>{SOURCE_LINE}</span></footer>
    </div>
  );
}

export default PathologyPage;
