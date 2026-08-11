/** CSP : une coquille, deux sections — comme DAMIR et Pathologies.
 *
 *  « Composition » était une lecture parmi les quatre autres, alors qu'elle
 *  répondait à une question d'une autre nature : non plus « où en est ce
 *  groupe ? » mais « comment se répartit la population active ? ». C'était une
 *  comparaison déguisée en lecture ; elle devient la section Comparer, où la
 *  composition d'un territoire s'obtient comme une vue parmi d'autres.
 *
 *  Millésime, territoire, âge, sexe et mesure vivent ici : passer d'une section
 *  à l'autre est un changement de question, pas de sujet. La carte du panorama
 *  reste cliquable et change le territoire commun, que la comparaison suit.
 */

import { useEffect, useMemo, useState } from "react";
import { getCspMetadata } from "../api";
import { PageHero } from "../components/PageHero";
import { paletteParams, readPalette } from "../charts/palette";
import { CompareSection } from "../csp/CompareSection";
import { PanoramaSection } from "../csp/PanoramaSection";
import { SOURCE_LINE, type CspLevel, type CspMeasure } from "../csp/section";
import type { CspMetadata } from "../types";

type Props = {
  routeVersion: number;
  onOpenExtraction: (params: URLSearchParams) => void;
  onOpenMethodology: () => void;
};

type Section = "panorama" | "compare";

const SECTIONS: Array<{ key: Section; label: string; hint: string }> = [
  { key: "panorama", label: "Panorama", hint: "Un groupe, quatre angles" },
  { key: "compare", label: "Comparer", hint: "Plusieurs catégories en regard" },
];

export function CspPage({ routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);

  const [metadata, setMetadata] = useState<CspMetadata | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [section, setSection] = useState<Section>(() => {
    const raw = params.get("section");
    return SECTIONS.some((item) => item.key === raw) ? raw as Section : "panorama";
  });
  const [year, setYear] = useState(Number(params.get("year")) || 2023);
  const [level, setLevel] = useState<CspLevel>(
    params.get("level") === "categorie_29" ? "categorie_29" : "groupe_6",
  );
  const [cspCode, setCspCode] = useState(params.get("csp") ?? "3");
  const [region, setRegion] = useState(params.get("region") ?? "FR");
  const [age, setAge] = useState(params.get("age") ?? "all");
  const [sex, setSex] = useState(Number(params.get("sex")) || 0);
  const [measure, setMeasure] = useState<CspMeasure>(
    params.get("measure") === "effectif" ? "effectif" : "share",
  );

  useEffect(() => {
    const controller = new AbortController();
    getCspMetadata(controller.signal)
      .then((next) => {
        setMetadata(next);
        setYear((current) => (next.years.includes(current) ? current : next.default_year));
        const chosen = next.levels.find((item) => item.key === level) ?? next.levels[0];
        const fallback = chosen.options.find((item) => item.code === (level === "groupe_6" ? "3" : "38"))
          ?? chosen.options[0];
        if (!chosen.options.some((item) => item.code === cspCode)) setCspCode(fallback.code);
        if (!next.regions.some((item) => item.code === region)) setRegion("FR");
        if (!next.ages.some((item) => item.code === age)) setAge("all");
        if (!next.sexes.some((item) => item.code === sex)) setSex(0);
      })
      .catch((reason: Error) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** La coquille n'écrit que ce qui est commun aux deux sections ; chacune
   *  ajoute sa part. Le paramètre de palette est reporté ici, sinon cette
   *  réécriture l'effacerait. */
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    Object.entries({
      page: "csp", section, year: String(year), level, csp: cspCode,
      region, age, sex: String(sex), measure,
      ...paletteParams(readPalette()),
    }).forEach(([key, value]) => next.set(key, value));
    if (readPalette() !== "blue") next.delete("palette");
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [section, year, level, cspCode, region, age, sex, measure]);

  if (!metadata) {
    return (
      <div className="content-wrap csp-page">
        {error
          ? <div className="analysis-error"><strong>La base CSP n’a pas pu être chargée</strong><span>{error}</span></div>
          : <div className="page-loader"><div className="skeleton" /></div>}
      </div>
    );
  }

  const shared = {
    metadata, year, region, setRegion, age, sex, measure, setMeasure,
    onOpenExtraction, routeVersion,
  };
  const coreSize = `${(metadata.core_size_bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;

  return (
    <div className="content-wrap csp-page">
      <PageHero
        variant="csp-hero"
        eyebrowLabel="Recensement Insee"
        eyebrowDetail="Populations"
        title="CSP"
        mission="Professions et catégories socioprofessionnelles des actifs ayant un emploi."
        action={<button type="button" className="method-link" onClick={onOpenMethodology}>Données &amp; méthode →</button>}
      />

      {/* Deux profondeurs d'une même exploration, et non deux outils. */}
      <nav className="damir-sections" role="tablist" aria-label="Sections CSP">
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

      {/* Le périmètre est commun aux deux sections : il vit dans la coquille,
          et changer de section ne le remet pas en cause. */}
      <section className="panel csp-context">
        <div className="csp-population-filters">
          <label><span>Millésime</span>
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {metadata.years.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label><span>Territoire</span>
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
            <select value={sex} onChange={(event) => setSex(Number(event.target.value))}>
              {metadata.sexes.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
            </select>
          </label>
          <span className="csp-scope-chip">{year} · actifs en emploi</span>
        </div>
      </section>

      {section === "panorama" ? (
        <PanoramaSection {...shared}
          level={level} setLevel={setLevel} cspCode={cspCode} setCspCode={setCspCode} />
      ) : null}
      {section === "compare" ? (
        <CompareSection {...shared} selected={`${level}:${cspCode}`} />
      ) : null}

      <footer className="pathology-footer csp-footer">
        <span>{SOURCE_LINE}</span>
        <div><span>Parquet optimisé · {coreSize}</span></div>
      </footer>
    </div>
  );
}

export default CspPage;
