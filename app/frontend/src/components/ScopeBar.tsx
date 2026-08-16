/** La barre de portée : tout le paramétrage d'un écran DAMIR, sur deux lignes.
 *
 *  Elle remplace la barre précédente, qui empilait ses champs et repoussait les
 *  graphiques hors de l'écran dès qu'on ouvrait un filtre. Deux règles la
 *  tiennent :
 *
 *  1. **Rien ne pousse.** Chaque liste — sélection multiple ou tiroir « Plus de
 *     filtres » — s'ouvre *au-dessus* du contenu, jamais entre la barre et le
 *     graphique. La hauteur de la barre ne dépend donc pas de ce qui est ouvert.
 *  2. **Deux lignes, deux questions.** Ce qu'on regarde (la prestation, la
 *     mesure), puis sur qui et quand. Les filtres rares — assurance, enveloppe,
 *     motif d'exonération — vivent dans le tiroir plutôt que dans la barre.
 *
 *  La forme est celle des écrans Pathologies / CSP / Mortalité : un panneau,
 *  des champs étiquetés, une piste de chargement en pied.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { getHierarchy } from "../api";
import type { AdvancedFilters, HierarchyOptions, Metadata } from "../types";
import { defaultFilters } from "../utils";
import { MultiSelect } from "./MultiSelect";

const EMPTY_OPTIONS: HierarchyOptions = { posts: [], sub_posts: [], services: [] };

export type ScopeBarProps = {
  metadata: Metadata;
  value: AdvancedFilters;
  onChange: (value: AdvancedFilters) => void;
  /** Contrôles propres à l'écran, posés en tête de la seconde ligne :
   *  l'indicateur mesuré, l'axe de comparaison… */
  children?: ReactNode;
  /** Champs que l'écran pilote lui-même et qu'il ne faut pas dupliquer ici. */
  hidden?: Array<keyof AdvancedFilters>;
  loading?: boolean;
  /** Variante de grille, quand l'écran pose plus d'un contrôle en tête de la
   *  seconde ligne. Comparer y met l'axe **et** la mesure : sans ça, ses deux
   *  champs se partagent la colonne prévue pour un. */
  className?: string;
};

/** Le temps qu'on laisse à la main de se poser avant d'interroger le cube. */
const FILTER_DEBOUNCE_MS = 250;

export function ScopeBar({ metadata, value, onChange, children, hidden = [], loading = false, className = "" }: ScopeBarProps) {
  /* — Le brouillon —
     Cocher trois territoires d'affilée lançait trois agrégations, dont deux
     que personne n'attendait. La barre tient donc un brouillon : il suit la
     main immédiatement — les cases se cochent sans délai — et ne remonte à
     l'écran que lorsque la main s'arrête. La requête part une fois. */
  const [draft, setDraft] = useState<AdvancedFilters>(value);
  const emitted = useRef(value);
  const timer = useRef<number | null>(null);

  // Un changement venu d'ailleurs — un clic sur la carte, une réinitialisation
  // — l'emporte sur le brouillon en cours, et annule ce qui n'est pas parti :
  // sinon un filtre en attente écraserait la sélection qu'on vient de faire.
  useEffect(() => {
    if (value === emitted.current) return;
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    emitted.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const commit = (next: AdvancedFilters) => {
    setDraft(next);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      emitted.current = next;
      onChange(next);
    }, FILTER_DEBOUNCE_MS);
  };

  /** La réinitialisation ne se tempère pas : c'est un geste franc, et attendre
   *  un quart de seconde après lui n'a aucun sens. */
  const commitNow = (next: AdvancedFilters) => {
    if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; }
    setDraft(next);
    emitted.current = next;
    onChange(next);
  };

  const [options, setOptions] = useState<HierarchyOptions>(EMPTY_OPTIONS);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLDivElement | null>(null);

  const isHidden = useMemo(() => new Set(hidden), [hidden]);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true);
    getHierarchy(draft.grand_post, draft.post, draft.sub_post, controller.signal)
      .then(setOptions)
      .catch((reason: Error) => { if (reason.name !== "AbortError") setOptions(EMPTY_OPTIONS); })
      .finally(() => setOptionsLoading(false));
    return () => controller.abort();
  }, [draft.grand_post, draft.post, draft.sub_post]);

  // Un tiroir qui reste ouvert derrière un clic ailleurs est un tiroir qu'on
  // oublie : il se referme sur le premier geste extérieur, comme les listes.
  //
  // L'écoute est posée à la frame suivante, et non dans la foulée du clic qui
  // ouvre. Selon l'ordre dans lequel le navigateur délivre `pointerdown` et
  // `click`, le geste d'ouverture pouvait être capté par l'écoute qu'il venait
  // lui-même d'installer : le tiroir s'ouvrait et se refermait dans le même
  // clic, et il en fallait un second pour le voir.
  useEffect(() => {
    if (!drawerOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!drawer.current?.contains(event.target as Node)) setDrawerOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); };
    const frame = window.requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onPointerDown);
    });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  const patch = (partial: Partial<AdvancedFilters>) => commit({ ...draft, ...partial });

  const extraCount = (draft.insurances.length ? 1 : 0)
    + (draft.envelopes.length ? 1 : 0)
    + (draft.ald === null ? 0 : 1);

  const dirty = JSON.stringify(draft) !== JSON.stringify(defaultFilters(metadata));

  return (
    <section className={`panel scope-bar ${className}`} aria-label="Portée de l’analyse">
      <div className="scope-bar-row scope-bar-service">
        <label>
          <span>Grand poste</span>
          <select
            value={draft.grand_post ?? ""}
            onChange={(event) => patch({ grand_post: event.target.value || null, post: null, sub_post: null, service_codes: [] })}
          >
            <option value="">Tous les grands postes</option>
            {metadata.grand_posts.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <label>
          <span>Poste</span>
          <select
            disabled={!draft.grand_post || optionsLoading}
            value={draft.post ?? ""}
            onChange={(event) => patch({ post: event.target.value || null, sub_post: null, service_codes: [] })}
          >
            <option value="">Tout le grand poste</option>
            {options.posts.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <label>
          <span>Sous-poste</span>
          <select
            disabled={!draft.post || optionsLoading}
            value={draft.sub_post ?? ""}
            onChange={(event) => patch({ sub_post: event.target.value || null, service_codes: [] })}
          >
            <option value="">Tout le poste</option>
            {options.sub_posts.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        {!isHidden.has("service_codes") ? (
          <div className="scope-bar-field">
            <span>Prestation</span>
            <MultiSelect
              label="Prestation"
              emptyLabel={optionsLoading ? "Chargement…" : "Tout le périmètre"}
              options={options.services.map((service) => ({ value: service.code, label: `${service.code} · ${service.label}` }))}
              value={draft.service_codes}
              onChange={(service_codes) => patch({ service_codes })}
            />
          </div>
        ) : null}
      </div>

      <div className="scope-bar-row scope-bar-scope">
        {children}

        <div className="scope-bar-field scope-bar-period">
          <span>Période</span>
          <div className="scope-bar-period-pair">
            <select
              value={draft.start_year}
              aria-label="Première année"
              onChange={(event) => patch({ start_year: Number(event.target.value) })}
            >
              {metadata.years.filter((year) => year <= draft.end_year).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <i aria-hidden="true">→</i>
            <select
              value={draft.end_year}
              aria-label="Dernière année"
              onChange={(event) => patch({ end_year: Number(event.target.value) })}
            >
              {metadata.years.filter((year) => year >= draft.start_year).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
        </div>

        {!isHidden.has("regions") ? (
          <div className="scope-bar-field">
            <span>Territoire</span>
            <MultiSelect
              label="Territoire"
              emptyLabel="France entière"
              options={metadata.regions.map((item) => ({ value: item.code, label: item.label }))}
              value={draft.regions}
              onChange={(regions) => patch({ regions })}
            />
          </div>
        ) : null}

        {!isHidden.has("ages") ? (
          <div className="scope-bar-field">
            <span>Âge</span>
            <MultiSelect
              label="Âge"
              emptyLabel="Tous âges"
              options={metadata.ages.map((item) => ({ value: item.code, label: item.label }))}
              value={draft.ages}
              onChange={(ages) => patch({ ages })}
            />
          </div>
        ) : null}

        {!isHidden.has("sexes") ? (
          <div className="scope-bar-field">
            <span>Sexe</span>
            <MultiSelect
              label="Sexe"
              emptyLabel="Femmes et hommes"
              options={metadata.sexes.map((item) => ({ value: item.code, label: item.label }))}
              value={draft.sexes}
              onChange={(sexes) => patch({ sexes })}
            />
          </div>
        ) : null}

        <div className="scope-bar-trailing">
          <div className="scope-bar-drawer" ref={drawer}>
            <button
              type="button"
              className={`scope-bar-more ${drawerOpen ? "open" : ""}`}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((open) => !open)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
              Plus de filtres
              {extraCount ? <em>{extraCount}</em> : null}
            </button>

            {drawerOpen ? (
              <div className="scope-bar-drawer-panel" role="group" aria-label="Filtres complémentaires">
                <MultiSelect
                  label="Nature d’assurance"
                  emptyLabel="Toutes"
                  options={metadata.insurances.map((item) => ({ value: item.code, label: item.label }))}
                  value={draft.insurances}
                  onChange={(insurances) => patch({ insurances })}
                />
                <MultiSelect
                  label="Enveloppe"
                  emptyLabel="Toutes"
                  options={metadata.envelopes.map((item) => ({ value: item.code, label: item.label }))}
                  value={draft.envelopes}
                  onChange={(envelopes) => patch({ envelopes })}
                />
                <label className="scope-bar-drawer-field">
                  <span>Motif d’exonération</span>
                  <select
                    value={draft.ald === null ? "" : String(draft.ald)}
                    onChange={(event) => patch({ ald: event.target.value === "" ? null : Number(event.target.value) })}
                  >
                    <option value="">Tous les motifs</option>
                    <option value="1">ALD</option>
                    <option value="0">Hors ALD</option>
                  </select>
                </label>
              </div>
            ) : null}
          </div>

          {dirty ? (
            <button type="button" className="scope-bar-reset" onClick={() => commitNow(defaultFilters(metadata))}>
              Réinitialiser
            </button>
          ) : null}
        </div>
      </div>

      <div className={`pathology-loading-track ${loading ? "active" : ""}`}><span /></div>
    </section>
  );
}
