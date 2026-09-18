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
import { runReliability } from "../api";
import { CompareSection } from "../damir/CompareSection";
import { PanoramaSection } from "../damir/PanoramaSection";
import { TimeBasisSection, type TimeBasis } from "../damir/TimeBasisSection";
import "../damir/timeBasis.css";
import { hasLegacyCompareParams, redirectLegacyCompareParams } from "../damir/legacyCompare";
import type { AdvancedFilters, Metadata, Reliability } from "../types";
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
  const [timeBasis, setTimeBasis] = useState<TimeBasis>(() => {
    const raw = params.get("time_basis");
    return metadata.has_delays && raw === "payment" ? raw : "care";
  });

  /** La cadence de liquidation du périmètre choisi. Les honoraires
   *  hospitaliers se règlent plus vite que les séjours : le taux « liquidé
   *  à N % » et le redressement de la dernière année doivent suivre le poste,
   *  pas rester ceux de tout DAMIR. Seul le périmètre de prestations compte,
   *  le cube des délais ne connaît pas la population. */
  const scopeKey = JSON.stringify([filters.grand_post, filters.post, filters.sub_post, filters.service_codes]);
  const [scoped, setScoped] = useState<Reliability | null>(null);
  useEffect(() => {
    if (!metadata.has_delays) return;
    const controller = new AbortController();
    let active = true;
    runReliability(filters, controller.signal)
      .then((next) => { if (active) setScoped(next.available ? next : null); })
      .catch(() => { if (active) setScoped(null); });
    return () => { active = false; controller.abort(); };
  }, [scopeKey, metadata.has_delays]);
  /** Les sections lisent la cadence dans les métadonnées : on leur donne
   *  celles du périmètre, sans rien changer à leur code. */
  const scopedMetadata = useMemo<Metadata>(
    () => scoped ? { ...metadata, reliability: scoped } : metadata, [metadata, scoped]);

  const consolidated = scopedMetadata.reliability.consolidated_through;
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
    next.set("time_basis", timeBasis);
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [section, filters, measureKey, timeBasis]);

  const shared = {
    metadata: scopedMetadata, filters, setFilters, measureKey, setMeasureKey,
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
            {section === "panorama" && timeBasis !== "care" ? "Règlements AMO observés"
              : provisional ? yearStatusLabel(scopedMetadata, filters.end_year) : scopedMetadata.reliability.status}
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

      {/* **Pas d'animation ici, et c'est un choix mesuré.**
       *
       *  La bascule Panorama ↔ Comparer avait reçu un fondu court. Il partait
       *  d'`opacity: 0` : la section entière ne devenait donc visible qu'une
       *  fois l'animation jouée. Constaté à l'écran — sur un onglet dont
       *  l'horloge d'animation est ralentie, la page est restée **blanche
       *  plus de huit secondes**, contenu monté mais invisible.
       *
       *  Un popover qui rate son fondu reste un popover. Une section qui rate
       *  le sien devient une page vide. Le rapport entre le risque et les
       *  140 ms gagnées ne tient pas : la bascule est instantanée. */}
      {section === "panorama" && metadata.has_delays ? (
        <div className="time-basis-controls">
          <span>Lecture des années</span>
          <div className="pathology-toggle" role="group" aria-label="Datation des remboursements">
            {([{ key: "care", label: "Année de soins (survenance)" },
              { key: "payment", label: "Année de règlement AMO" }] as const).map((item) => (
              <button key={item.key} type="button" className={timeBasis === item.key ? "active" : ""}
                aria-pressed={timeBasis === item.key} onClick={() => setTimeBasis(item.key)}>{item.label}</button>
            ))}
          </div>
        </div>
      ) : null}
      {section === "panorama" && scoped ? <LiquidationPanel reliability={scoped} filters={filters} /> : null}
      {section === "panorama" && timeBasis === "care" ? <PanoramaSection {...shared} /> : null}
      {section === "panorama" && timeBasis === "payment" ? <TimeBasisSection {...shared} /> : null}
      {section === "compare" ? <CompareSection {...shared} /> : null}
    </div>
  );
}

/** La cadence du périmètre, repliée : un tableau par année de soins, et les
 *  seuils de la courbe. Replié parce qu'on vient au Panorama pour lire une
 *  prestation, pas sa liquidation — mais quand on projette une année
 *  incomplète, c'est ici qu'on trouve par quoi diviser. */
function LiquidationPanel({ reliability, filters }: { reliability: Reliability; filters: AdvancedFilters }) {
  const subject = filters.sub_post ?? filters.post ?? filters.grand_post ?? "Toutes prestations";
  const rows = reliability.completeness.filter((row) => row.year >= 2016);
  const latest = reliability.latest_flow;
  const cutoff = latest ? `${String(latest % 100).padStart(2, "0")}/${Math.floor(latest / 100)}` : "";
  const thresholds = Object.entries(reliability.thresholds)
    .filter(([, delay]) => delay !== null)
    .map(([level, delay]) => `${level} % à M+${delay}`).join(" · ");
  const pct = (value: number | null | undefined, digits = 1) =>
    value == null ? "—" : `${(value * 100).toFixed(digits).replace(".", ",")} %`;
  return (
    <details className="damir-details liquidation-panel">
      <summary>Liquidation du périmètre — {subject}</summary>
      <p className="liquidation-note">
        Cadence de règlement de l’Assurance Maladie sur ce périmètre, flux arrêtés à {cutoff}.
        {thresholds ? ` Courbe : ${thresholds}.` : ""} La part réglée dans l’année est la lecture la plus
        simple : c’est par elle que se redresse une année encore ouverte.
      </p>
      <div className="damir-table-scroll">
        <table>
          <thead><tr><th>Année de soins</th><th>Part liquidée à ce jour</th><th>Part réglée dans l’année</th></tr></thead>
          <tbody>
            {rows.map((row) => <tr key={row.year}>
              <th scope="row">{row.year}</th>
              <td>{pct(row.ratio)}</td>
              <td>{pct(row.in_year)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default DamirPage;
