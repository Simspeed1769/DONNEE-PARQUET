/* ────────────────────────────────────────────────────────────────────────────
   THESIS: DAMIR est **un** écran, pas deux. « Comparer » vivait à côté de
   « Panorama » en répétant l'essentiel de ses fonctions — même barre de
   portée, mêmes mesures, mêmes formes — et forçait à choisir sa page avant de
   savoir ce qu'on cherchait. Les trois sections d'ici sont trois profondeurs
   d'une même exploration : regarder une prestation, en comparer plusieurs,
   puis composer soi-même la comparaison qu'aucune dimension ne produit.
   OWN-WORLD: le monde DAMIR hérité — papier chaud, encre presque noire,
   accent rouge Forsides désormais en tête de la palette de séries.
   STORY: on arrive sur le Panorama, on y lit une prestation sous quatre
   angles ; on passe aux prestations comparées quand la question devient
   « laquelle pèse le plus » ; on va en comparaison libre quand la question
   n'entre dans aucune case.
   FIRST VIEWPORT: le titre, les trois sections, la barre de portée, le
   graphique. Rien entre les sections et le graphique.
   FORM: fiche d'analyse à sections, la forme des écrans Pathologies / CSP.
   FINISH: unreviewed and undocumented is unfinished; this build ends with the
   finish review, the verdict, and DESIGN.md.
   ──────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { FreeSection } from "../damir/FreeSection";
import { PanoramaSection } from "../damir/PanoramaSection";
import { ServicesSection } from "../damir/ServicesSection";
import type { AdvancedFilters, Metadata } from "../types";
import { filtersFromSearch, writeFilters } from "../utils";

type Props = {
  metadata: Metadata;
  routeVersion: number;
  onOpenExtraction: (params: URLSearchParams) => void;
  onOpenMethodology: () => void;
};

export type DamirSection = "panorama" | "services" | "free";

const SECTIONS: Array<{ key: DamirSection; label: string; hint: string }> = [
  { key: "panorama", label: "Panorama", hint: "Une prestation, quatre angles" },
  { key: "services", label: "Comparer les prestations", hint: "Laquelle pèse le plus" },
  { key: "free", label: "Comparaison libre", hint: "Le graphique que vous composez" },
];

function sectionFromParams(params: URLSearchParams): DamirSection {
  const raw = params.get("section");
  return SECTIONS.some((item) => item.key === raw) ? raw as DamirSection : "panorama";
}

export function DamirPage({ metadata, routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);

  const [section, setSection] = useState<DamirSection>(() => sectionFromParams(params));
  /** Le périmètre commun suit l'utilisateur d'une section à l'autre : changer
   *  de section est un changement de question, pas de sujet. */
  const [filters, setFilters] = useState<AdvancedFilters>(() => filtersFromSearch(metadata, params));
  const [measureKey, setMeasureKey] = useState(() => params.get("measure") || "reimbursed");

  const consolidated = metadata.reliability.consolidated_through;
  const provisional = consolidated !== null && filters.end_year > consolidated;

  // Chaque section écrit sa propre part de l'adresse ; celle-ci n'écrit que ce
  // qui leur est commun, pour qu'un lien partagé rouvre la bonne section sur le
  // bon périmètre.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("page", "damir");
    next.set("section", section);
    writeFilters(next, filters);
    next.set("measure", measureKey);
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [section, filters, measureKey]);

  const shared = {
    metadata, filters, setFilters, measureKey, setMeasureKey,
    onOpenExtraction, routeVersion,
  };

  return (
    <div className="content-wrap damir-page">
      <section className="hero damir-hero">
        <div>
          <div className="eyebrow"><span>Open DAMIR</span> Assurance Maladie</div>
          <h1>DAMIR</h1>
        </div>
        <div className="damir-hero-side">
          <span className={`status-chip ${provisional ? "provisional" : "reliable"}`}>
            {provisional ? `${filters.end_year} · en consolidation` : metadata.reliability.status}
          </span>
          <button type="button" className="method-link" onClick={onOpenMethodology}>Données &amp; méthode →</button>
        </div>
      </section>

      {/* Trois profondeurs d'une même exploration, et non trois outils. */}
      <nav className="damir-sections" role="tablist" aria-label="Sections DAMIR">
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

      {section === "panorama" ? <PanoramaSection {...shared} /> : null}
      {section === "services" ? <ServicesSection {...shared} /> : null}
      {section === "free" ? <FreeSection {...shared} /> : null}
    </div>
  );
}

export default DamirPage;
