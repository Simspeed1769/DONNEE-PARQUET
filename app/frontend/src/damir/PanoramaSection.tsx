/* ────────────────────────────────────────────────────────────────────────────
   THESIS: le Panorama montre **une prestation**, sous quatre angles. Il ne
   demande plus quelle dimension observer — question à laquelle personne ne
   savait répondre, et dont la réponse ne disait pas ce qu'on mesurait. Deux
   choix suffisent : quelle prestation, quel indicateur.
   OWN-WORLD: le monde DAMIR existant, hérité sans retouche — papier chaud,
   encre presque noire, accent rouge Forsides, palette de séries validée pour
   les visions atypiques dans les deux thèmes.
   STORY: le visiteur choisit sa prestation dans la hiérarchie qu'il connaît,
   son indicateur, puis parcourt quatre lectures par onglets — le graphique est
   déjà à l'écran, il n'a rien à faire défiler.
   FIRST VIEWPORT: le titre, la barre de portée sur deux lignes, les onglets et
   le graphique. Rien d'autre : ni phrase de commentaire, ni rappel de montant,
   ni réserve dépliée.
   FORM: fiche d'analyse, la forme des écrans Pathologies / CSP / Mortalité.
   FINISH: unreviewed and undocumented is unfinished; this build ends with the
   finish review, the verdict, and DESIGN.md.
   ──────────────────────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ECharts } from "echarts/core";
import { runPanorama, type PanoramaRequest } from "../api";
import { ScopeBar } from "../components/ScopeBar";
import { EChart } from "../charts/EChart";
import { useChartTokens } from "../charts/tokens";
import { OFF_MAP_REGIONS, useFrenchMap } from "../charts/frenchMap";
import { buildSlides, type FormKey, type Slide, type SlideKey } from "../panorama/slides";
import { download, renderSlide, SOURCE_LINE } from "../panorama/exportSlide";
import { periodValue, yearValues, type PanoramaResponse } from "../panorama/model";
import type { ExploreMeasure } from "../explore/model";
import type { AdvancedFilters, Metadata } from "../types";
import { formatValue, writeFilters } from "../utils";

/** Le périmètre et la mesure appartiennent à l'écran DAMIR, pas à la section :
 *  passer d'une section à l'autre est un changement de question, pas de sujet. */
export type SectionProps = {
  metadata: Metadata;
  routeVersion: number;
  filters: AdvancedFilters;
  setFilters: Dispatch<SetStateAction<AdvancedFilters>>;
  measureKey: string;
  setMeasureKey: Dispatch<SetStateAction<string>>;
  onOpenExtraction: (params: URLSearchParams) => void;
};

/** Huit sujets au plus : c'est la borne du serveur, et celle au-delà de laquelle
 *  la palette catégorielle ne sépare plus les teintes de façon fiable. */
const MAX_SUBJECTS = 8;
const FACETS = ["region", "age", "sex"];
const SLIDE_KEYS: SlideKey[] = ["evolution", "territory", "age", "sex"];

/** Les formes retenues par lecture voyagent dans l'adresse : une analyse
 *  partagée doit revenir sous la forme sous laquelle elle a été composée. */
function formsFromParams(params: URLSearchParams): Partial<Record<SlideKey, FormKey>> {
  const forms: Partial<Record<SlideKey, FormKey>> = {};
  SLIDE_KEYS.forEach((key) => {
    const raw = params.get(`form_${key}`);
    if (raw) forms[key] = raw as FormKey;
  });
  return forms;
}

/** Le périmètre en une ligne.
 *
 *  Il a quitté l'écran — le titre et la barre de portée le disent déjà, chacun
 *  à sa place — mais il reste **dans l'image exportée**, où il est la seule
 *  chose qui empêche une courbe de circuler sans qu'on sache sur quelle
 *  population elle porte.
 */
function scopeSummary(metadata: Metadata, filters: AdvancedFilters,
                      subjectLabel: string): string {
  const named = (codes: number[], options: Array<{ code: number; label: string }>,
                 whole: string, plural: (count: number) => string): string => {
    if (!codes.length) return whole;
    if (codes.length <= 2) {
      return codes
        .map((code) => options.find((option) => option.code === code)?.label ?? String(code))
        .join(" et ");
    }
    return plural(codes.length);
  };

  return [
    filters.start_year === filters.end_year
      ? String(filters.start_year)
      : `${filters.start_year}–${filters.end_year}`,
    subjectLabel,
    named(filters.regions, metadata.regions, "France entière",
          (count) => `${count} territoires`),
    named(filters.ages, metadata.ages, "tous âges",
          (count) => `${count} tranches d’âge`),
    named(filters.sexes, metadata.sexes, "femmes et hommes",
          (count) => `${count} modalités de sexe`),
    filters.sub_post ?? filters.post ?? filters.grand_post ?? null,
    filters.ald === null ? null : filters.ald ? "ALD uniquement" : "hors ALD",
  ].filter((part): part is string => Boolean(part)).join(" · ");
}

export function PanoramaSection({
  metadata, routeVersion, filters, setFilters, measureKey, setMeasureKey, onOpenExtraction,
}: SectionProps) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();
  const map = useFrenchMap();

  const [view, setView] = useState<SlideKey>(() => {
    const raw = params.get("view");
    return SLIDE_KEYS.includes(raw as SlideKey) ? raw as SlideKey : "evolution";
  });
  const [forms, setForms] = useState<Partial<Record<SlideKey, FormKey>>>(() => formsFromParams(params));

  const [response, setResponse] = useState<PanoramaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const stageChart = useRef<ECharts | null>(null);

  /** Le sujet observé **est** la prestation choisie : plus de dimension à
   *  désigner séparément. Une prestation précise devient un sujet à part
   *  entière ; aucune, et le panorama porte sur tout le périmètre décrit par la
   *  hiérarchie — ce qui est exactement ce qu'on attend d'un grand poste. */
  const subjects = useMemo(
    () => filters.service_codes.slice(0, MAX_SUBJECTS).map(String),
    [filters.service_codes],
  );

  const request = useMemo<PanoramaRequest>(() => ({
    ...filters,
    subject_dimension: "service",
    subjects,
    facets: FACETS,
  }), [filters, subjects]);

  const fetchKey = useMemo(() => JSON.stringify(request), [request]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    runPanorama(request, controller.signal)
      .then((next) => { if (active) setResponse(next); })
      .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey]);

  // Seul ce qui appartient au Panorama : la section affichée et le périmètre
  // commun sont écrits par l'écran DAMIR, qui les partage entre les sections.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("view", view);
    SLIDE_KEYS.forEach((key) => {
      const form = forms[key];
      if (form) next.set(`form_${key}`, form);
      else next.delete(`form_${key}`);
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [view, forms]);

  const measure: ExploreMeasure | null = useMemo(
    () => response?.measures.find((item) => item.key === measureKey) ?? response?.measures[0] ?? null,
    [response, measureKey],
  );

  // Une mesure devenue indisponible — un volume quand on compare plusieurs
  // prestations — retombe sur le montant remboursé, toujours lisible, plutôt
  // que d'afficher un chiffre qui additionne des unités incompatibles.
  useEffect(() => {
    if (measure?.unavailable_reason) setMeasureKey("reimbursed");
  }, [measure]);

  const measureFamilies = useMemo(() => {
    const groups = new Map<string, ExploreMeasure[]>();
    response?.measures.forEach((item) => groups.set(item.family, [...(groups.get(item.family) ?? []), item]));
    return [...groups.entries()];
  }, [response]);

  const selectedRegion = filters.regions.length === 1 ? String(filters.regions[0]) : null;

  const slides = useMemo<Slide[]>(() => {
    if (!response || !measure) return [];
    return buildSlides({
      response,
      measure,
      tokens,
      consolidatedThrough: metadata.reliability.consolidated_through,
      highlightedRegion: selectedRegion,
      forms,
    });
  }, [response, measure, tokens, metadata, selectedRegion, forms]);

  const slide = slides.find((item) => item.key === view) ?? slides[0] ?? null;

  /** Trois repères, en une ligne posée à côté du choix de forme.
   *
   *  Ils ont été retirés parce qu'un bandeau de tuiles poussait le graphique
   *  hors de l'écran ; ils reviennent sans reprendre cette hauteur. Ce sont les
   *  trois chiffres qu'on cite de mémoire — où on en est, à quel rythme, ce que
   *  ça pèse sur la période — et jamais un quatrième.
   */
  const highlights = useMemo(() => {
    const lead = response?.subjects[0];
    if (!response || !measure || !lead) return [];
    const years = response.years;
    const values = yearValues(lead.total, measure, response.components, years.length);
    const last = values.at(-1) ?? null;
    const previous = values.at(-2) ?? null;
    const first = values.find((value) => value !== null) ?? null;
    const delta = last !== null && previous !== null && previous !== 0
      ? (100 * (last - previous)) / Math.abs(previous) : null;
    const span = years.length - 1;
    const cagr = first !== null && last !== null && first > 0 && last > 0 && span > 0
      ? 100 * (Math.pow(last / first, 1 / span) - 1) : null;

    return [
      { key: "last", value: formatValue(last, measure.kind), label: String(years.at(-1)) },
      {
        key: "delta",
        value: delta === null ? "—" : formatValue(delta, "percent", true),
        label: `vs ${years.at(-2) ?? "—"}`,
        tone: delta === null ? "neutral" : delta >= 0 ? "up" : "down",
      },
      {
        key: "period",
        value: formatValue(periodValue(lead.total, measure, response.components), measure.kind),
        label: measure.additive ? `cumul ${years[0]}–${years.at(-1)}` : "niveau moyen",
      },
    ];
  }, [response, measure]);

  const subjectSummary = useMemo(() => {
    if (!response) return "toutes prestations";
    if (!subjects.length) {
      return filters.sub_post ?? filters.post ?? filters.grand_post ?? "Toutes prestations";
    }
    if (response.subjects.length === 1) return response.subjects[0].label;
    return `${response.subjects.length} prestations comparées`;
  }, [response, subjects, filters]);

  const scope = useMemo(
    () => scopeSummary(metadata, filters, subjectSummary),
    [metadata, filters, subjectSummary],
  );

  /* — Navigation au clavier : quatre lectures se parcourent aux flèches — */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const index = SLIDE_KEYS.indexOf(view);
      if (event.key === "ArrowRight") {
        event.preventDefault();
        setView(SLIDE_KEYS[(index + 1) % SLIDE_KEYS.length]);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setView(SLIDE_KEYS[(index - 1 + SLIDE_KEYS.length) % SLIDE_KEYS.length]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [view]);

  /* — Sortir le graphique —
     Une seule sortie image, et c'est un fichier. Le presse-papiers était une
     seconde action pour le même geste, avec ses propres échecs silencieux
     selon le navigateur ; le PNG, lui, marche partout et se glisse dans
     n'importe quelle présentation. */

  const exportPng = useCallback(async () => {
    const instance = stageChart.current;
    if (!instance || !slide) return;
    setNotice(null);
    try {
      const blob = await renderSlide(instance, {
        title: slide.title,
        // L'image emporte le périmètre et les réserves, que l'écran range :
        // hors de l'outil, personne n'est là pour les rappeler.
        reading: null,
        caveats: slide.caveats,
        scope,
      }, tokens);
      download(blob, slide.title);
      setNotice("Image enregistrée.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "L’image n’a pas pu être produite.");
    }
  }, [slide, scope, tokens]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  /* — Filtrage croisé depuis la carte — */

  const toggleRegion = useCallback((code: string) => {
    if (OFF_MAP_REGIONS[code]) return;
    const value = Number(code);
    if (!Number.isFinite(value)) return;
    setFilters((current) => ({
      ...current,
      regions: current.regions.length === 1 && current.regions[0] === value ? [] : [value],
    }));
  }, []);

  const bindStage = useCallback((instance: ECharts | null) => {
    stageChart.current = instance;
    if (!instance) return;
    instance.off("click");
    if (view === "territory" && (response?.subjects.length ?? 0) <= 1) {
      instance.on("click", (event: { name?: string }) => {
        if (event.name) toggleRegion(event.name);
      });
    }
  }, [view, response, toggleRegion]);

  useEffect(() => { bindStage(stageChart.current); }, [bindStage]);

  const consolidated = metadata.reliability.consolidated_through;
  const provisional = consolidated !== null && filters.end_year > consolidated;
  const mapUnavailable = slide?.key === "territory" && Boolean(map.error);
  // Une série `map` instanciée avant l'enregistrement du fond fait lever
  // ECharts. Le fond arrive par le réseau : la lecture territoriale attend donc
  // son tour au lieu de faire tomber l'écran entier.
  const mapPending = slide?.key === "territory" && !map.ready && !map.error;
  const exportable = Boolean(slide) && !slide?.empty && !mapUnavailable && !mapPending;

  const openExtraction = () => {
    const next = new URLSearchParams();
    writeFilters(next, filters);
    onOpenExtraction(next);
  };

  return (
    <>
      <ScopeBar metadata={metadata} value={filters} onChange={setFilters} loading={loading}>
        <label className="scope-bar-measure">
          <span>Mesure</span>
          <select value={measureKey} onChange={(event) => setMeasureKey(event.target.value)}>
            {measureFamilies.map(([family, items]) => (
              <optgroup key={family} label={family}>
                {items.map((item) => (
                  <option key={item.key} value={item.key} disabled={Boolean(item.unavailable_reason)}>
                    {item.label}{item.unavailable_reason ? " · indisponible" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </ScopeBar>

      {error ? (
        <div className="analysis-error"><strong>Le calcul n’a pas abouti</strong><span>{error}</span></div>
      ) : null}

      <article className="panel damir-stage">
        <header className="damir-stage-head">
          <div className="damir-stage-title">
            <span className="section-kicker">{subjectSummary}</span>
            <h2>{slide ? slide.title : "Chargement…"}</h2>
          </div>
          <div className="pathology-toggle damir-views" role="tablist" aria-label="Lecture affichée">
            {SLIDE_KEYS.map((key) => {
              const item = slides.find((candidate) => candidate.key === key);
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={view === key}
                  className={view === key ? "active" : ""}
                  onClick={() => setView(key)}
                >{item?.nav ?? navLabel(key)}</button>
              );
            })}
          </div>
        </header>

        {filters.service_codes.length > MAX_SUBJECTS ? (
          <p className="damir-note">
            {filters.service_codes.length} prestations sélectionnées, {MAX_SUBJECTS} comparées à l’écran :
            au-delà, la palette ne sépare plus les couleurs de façon fiable. Le périmètre chiffré, lui,
            porte bien les {filters.service_codes.length}.
          </p>
        ) : null}

        {/* Une seule bande : les repères chiffrés à gauche, le choix de forme à
            droite. Elle ne coûte qu'une ligne, et le graphique reste où il est. */}
        <div className="damir-strip">
          <div className="damir-highlights">
            {highlights.map((item) => (
              <span key={item.key} className={`damir-highlight ${item.tone ?? ""}`}>
                <strong>{item.value}</strong>
                <small>{item.label}</small>
              </span>
            ))}
          </div>

          {slide && slide.forms.length > 1 ? (
            <div className="pathology-toggle damir-forms" role="group" aria-label="Forme du graphique">
              {slide.forms.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={slide.form === item.key}
                  className={slide.form === item.key ? "active" : ""}
                  onClick={() => setForms((current) => ({ ...current, [slide.key]: item.key }))}
                >{item.label}</button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Pas de `key` sur ce conteneur : la remonter à chaque changement de
            lecture ou de forme détruisait l'instance ECharts, et avec elle toute
            possibilité de transition. C'est la même instance qui passe d'une
            forme à l'autre, et c'est ce qui rend le geste fluide. */}
        <div className="damir-stage-chart">
          {!slide ? (
            <div className="damir-placeholder"><div className="skeleton" /></div>
          ) : mapUnavailable ? (
            <p className="damir-fallback">{map.error} Les valeurs restent lisibles dans le tableau, plus bas.</p>
          ) : mapPending ? (
            <div className="damir-placeholder"><div className="skeleton" /></div>
          ) : slide.empty ? (
            <p className="damir-fallback">{slide.empty}</p>
          ) : (
            <EChart
              option={slide.option}
              height={slide.height}
              stale={loading}
              ariaLabel={slide.ariaLabel}
              onInstance={bindStage}
            />
          )}
        </div>

        {selectedRegion && view === "territory" ? (
          <p className="damir-selection">
            Écran restreint à <strong>{metadata.regions.find((item) => String(item.code) === selectedRegion)?.label ?? selectedRegion}</strong>.
            <button type="button" className="link-button" onClick={() => toggleRegion(selectedRegion)}>Retirer</button>
          </p>
        ) : null}

        <footer className="damir-stage-foot">
          <span className="damir-source">{SOURCE_LINE}</span>
          <div className="damir-actions">
            {notice ? <span className="damir-notice" role="status">{notice}</span> : null}
            <button type="button" onClick={exportPng} disabled={!exportable}>Enregistrer en PNG</button>
            <button type="button" onClick={openExtraction}>Extraire la donnée</button>
          </div>
        </footer>

        {slide ? (
          <div className="damir-drawers">
            <details className="damir-details">
              <summary>Voir les valeurs ({slide.table.rows.length} lignes)</summary>
              <div className="damir-table-scroll" tabIndex={0} role="group" aria-label="Valeurs du graphique">
                <table>
                  <thead><tr>{slide.table.columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
                  <tbody>
                    {slide.table.rows.map((row) => (
                      <tr key={row[0]}>
                        {row.map((cell, index) => (
                          index === 0
                            ? <th key={index} scope="row">{cell}</th>
                            : <td key={index}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {slide.caveats.length || response?.warnings.length ? (
              <details className="damir-details">
                <summary>Ce que ce graphique ne montre pas ({slide.caveats.length + (response?.warnings.length ?? 0)})</summary>
                <ul className="damir-caveats">
                  {slide.caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}
                  {response?.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </article>
    </>
  );
}

/** Nom d'onglet avant que la réponse ne soit là : les onglets ne doivent pas
 *  apparaître après le graphique, sans quoi la barre saute au chargement. */
function navLabel(key: SlideKey): string {
  return key === "evolution" ? "Évolution"
    : key === "territory" ? "Territoire"
    : key === "age" ? "Âge" : "Sexe";
}


