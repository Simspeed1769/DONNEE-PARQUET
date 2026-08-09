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
};

export function ScopeBar({ metadata, value, onChange, children, hidden = [], loading = false }: ScopeBarProps) {
  const [options, setOptions] = useState<HierarchyOptions>(EMPTY_OPTIONS);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawer = useRef<HTMLDivElement | null>(null);

  const isHidden = useMemo(() => new Set(hidden), [hidden]);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true);
    getHierarchy(value.grand_post, value.post, value.sub_post, controller.signal)
      .then(setOptions)
      .catch((reason: Error) => { if (reason.name !== "AbortError") setOptions(EMPTY_OPTIONS); })
      .finally(() => setOptionsLoading(false));
    return () => controller.abort();
  }, [value.grand_post, value.post, value.sub_post]);

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

  const patch = (partial: Partial<AdvancedFilters>) => onChange({ ...value, ...partial });

  const extraCount = (value.insurances.length ? 1 : 0)
    + (value.envelopes.length ? 1 : 0)
    + (value.ald === null ? 0 : 1);

  const dirty = JSON.stringify(value) !== JSON.stringify(defaultFilters(metadata));

  return (
    <section className="panel scope-bar" aria-label="Portée de l’analyse">
      <div className="scope-bar-row scope-bar-service">
        <label>
          <span>Grand poste</span>
          <select
            value={value.grand_post ?? ""}
            onChange={(event) => patch({ grand_post: event.target.value || null, post: null, sub_post: null, service_codes: [] })}
          >
            <option value="">Tous les grands postes</option>
            {metadata.grand_posts.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <label>
          <span>Poste</span>
          <select
            disabled={!value.grand_post || optionsLoading}
            value={value.post ?? ""}
            onChange={(event) => patch({ post: event.target.value || null, sub_post: null, service_codes: [] })}
          >
            <option value="">Tout le grand poste</option>
            {options.posts.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>

        <label>
          <span>Sous-poste</span>
          <select
            disabled={!value.post || optionsLoading}
            value={value.sub_post ?? ""}
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
              value={value.service_codes}
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
              value={value.start_year}
              aria-label="Première année"
              onChange={(event) => patch({ start_year: Number(event.target.value) })}
            >
              {metadata.years.filter((year) => year <= value.end_year).map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <i aria-hidden="true">→</i>
            <select
              value={value.end_year}
              aria-label="Dernière année"
              onChange={(event) => patch({ end_year: Number(event.target.value) })}
            >
              {metadata.years.filter((year) => year >= value.start_year).map((year) => <option key={year} value={year}>{year}</option>)}
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
              value={value.regions}
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
              value={value.ages}
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
              value={value.sexes}
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
                  value={value.insurances}
                  onChange={(insurances) => patch({ insurances })}
                />
                <MultiSelect
                  label="Enveloppe"
                  emptyLabel="Toutes"
                  options={metadata.envelopes.map((item) => ({ value: item.code, label: item.label }))}
                  value={value.envelopes}
                  onChange={(envelopes) => patch({ envelopes })}
                />
                <label className="scope-bar-drawer-field">
                  <span>Motif d’exonération</span>
                  <select
                    value={value.ald === null ? "" : String(value.ald)}
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
            <button type="button" className="scope-bar-reset" onClick={() => onChange(defaultFilters(metadata))}>
              Réinitialiser
            </button>
          ) : null}
        </div>
      </div>

      <div className={`pathology-loading-track ${loading ? "active" : ""}`}><span /></div>
    </section>
  );
}
