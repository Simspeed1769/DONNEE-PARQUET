/* ────────────────────────────────────────────────────────────────────────────
   THESIS: DAMIR est **un** écran, pas deux. « Comparer les prestations » et
   « Comparaison libre » vivaient côte à côte en répétant l'essentiel de leurs
   fonctions — même barre de portée, mêmes mesures, mêmes formes — et
   forçaient à choisir son outil avant de savoir ce qu'on cherchait. Les deux
   sections d'ici sont deux profondeurs d'une même exploration : regarder une
   prestation, puis comparer ce qu'on veut, selon ce qu'on veut.
   OWN-WORLD: le monde DAMIR hérité — papier chaud, encre presque noire,
   accent rouge Forsides désormais en tête de la palette de séries.
   STORY: on arrive sur le Panorama, on y lit une prestation sous quatre
   angles ; on passe à Comparer quand la question devient une mise en regard —
   choisir selon quoi comparer, ou composer sans dimension avec des séries
   libres quand la question n'entre dans aucune case.
   FIRST VIEWPORT: le titre, les deux sections, la barre de portée, le
   graphique. Rien entre les sections et le graphique.
   FORM: fiche d'analyse à sections, la forme des écrans Pathologies / CSP.
   FINISH: unreviewed and undocumented is unfinished; this build ends with the
   finish review, the verdict, and DESIGN.md.
   ──────────────────────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useState } from "react";
import { CompareSection } from "../damir/CompareSection";
import { PanoramaSection } from "../damir/PanoramaSection";
import { hasLegacyCompareParams, redirectLegacyCompareParams } from "../damir/legacyCompare";
import type { AdvancedFilters, Metadata } from "../types";
import { filtersFromSearch, writeFilters, yearStatusLabel } from "../utils";

/** Réécrit l'adresse une fois, avant que quoi que ce soit — ici ou dans les
 *  sections filles, qui relisent chacune `window.location` de leur côté —
 *  n'ait lu les anciens paramètres. Un lien vers l'ancienne comparaison des
 *  prestations ou l'ancienne comparaison libre doit rouvrir Comparer dans le
 *  même état, pas une page vide le temps qu'un effet se déclenche. */
function normalizedParams(): URLSearchParams {
  const current = new URLSearchParams(window.location.search);
  if (!hasLegacyCompareParams(current)) return current;
  const next = redirectLegacyCompareParams(current);
  window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  return next;
}

type Props = {
  metadata: Metadata;
  routeVersion: number;
  onOpenExtraction: (params: URLSearchParams) => void;
  onOpenMethodology: () => void;
};

export type DamirSection = "panorama" | "compare";

const SECTIONS: Array<{ key: DamirSection; label: string; hint: string }> = [
  { key: "panorama", label: "Panorama", hint: "Une prestation, quatre angles" },
  { key: "compare", label: "Comparer", hint: "Ce que vous voulez mettre en regard" },
];

function sectionFromParams(params: URLSearchParams): DamirSection {
  const raw = params.get("section");
  if (raw === "services" || raw === "free") return "compare";
  return SECTIONS.some((item) => item.key === raw) ? raw as DamirSection : "panorama";
}

export function DamirPage({ metadata, routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const params = useMemo(() => normalizedParams(), [routeVersion]);

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
          {/* Le taux plutôt que le mot : « en consolidation » signale un
              manque, « liquidé à 91 % » le mesure — et c'est la différence
              entre savoir qu'il faut se méfier et savoir de combien. */}
          <span className={`status-chip ${provisional ? "provisional" : "reliable"}`}>
            {provisional ? yearStatusLabel(metadata, filters.end_year) : metadata.reliability.status}
          </span>
          <button type="button" className="method-link" onClick={onOpenMethodology}>Données &amp; méthode →</button>
        </div>
      </section>

      {/* Deux profondeurs d'une même exploration, et non deux outils. */}
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
      {section === "compare" ? <CompareSection {...shared} /> : null}
    </div>
  );
}

export default DamirPage;
