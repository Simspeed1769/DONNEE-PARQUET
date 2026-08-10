import { useEffect, useMemo, useRef, useState } from "react";
import { runExploreOptions, type ExploreOption, type ExploreOptionsRequest } from "../api";
import { AdvancedFilterPanel, type FilterField } from "../components/AdvancedFilterPanel";
import { seriesColor, type ChartTokens } from "../charts/tokens";
import type { AdvancedFilters, Metadata } from "../types";
import { formatValue } from "../utils";
import { isFree, lockedField, scopeChips, scopeForSeries, type SeriesScope } from "./seriesScope";

type Props = {
  /** Ce sur quoi porte la recherche : la dimension découpée. */
  breakdown: string;
  breakdownLabel: string;
  /** Requête de périmètre, sans la sélection : la recherche doit pouvoir
   *  proposer des modalités que la sélection courante exclut. */
  scope: Omit<ExploreOptionsRequest, "query" | "limit">;
  selection: string[];
  labels: Map<string, string>;
  values: Map<string, number | null>;
  slots: Map<string, number>;
  tokens: ChartTokens;
  kind: string;
  showOther: boolean;
  otherCount: number;
  maxSelected: number;
  /** Combien de modalités le classement met d'emblée à l'écran. */
  count: number;
  counts: readonly number[];
  onCountChange: (count: number) => void;
  onChange: (selection: string[]) => void;
  onToggleOther: (value: boolean) => void;
  onResetToTop: () => void;
  /** Périmètre propre à chaque série, lorsqu'il diffère du périmètre commun. */
  metadata: Metadata;
  base: AdvancedFilters;
  scopes: Record<string, SeriesScope>;
  onScopeChange: (key: string, scope: SeriesScope | null) => void;
  /** Compose une série qui ne descend d'aucune modalité. */
  onAddFree: () => void;
  /** Faux lorsque la dimension n'a que ses deux modalités et qu'il n'y a rien à
   *  choisir — le sexe. Les séries restent listées, parce que c'est là qu'on
   *  leur donne un périmètre propre, mais on n'offre pas d'en ajouter. */
  pickable?: boolean;
  /** Ce que contient le repli, nommé. « Autres » seul peut peser très lourd —
   *  la région non renseignée vaut un sixième des remboursements — sans dire de
   *  quoi il est fait. */
  otherLabel?: string;
  /** Faux là où toutes les séries partagent le périmètre commun : c'est ce qui
   *  rend la comparaison sûre, et proposer un périmètre par série y sèmerait le
   *  doute sur ce qui varie. */
  allowScopes?: boolean;
  /** Nom écrit à la main, par série. Absent, la série porte le nom que lui
   *  vaut ce qui la distingue — c'est l'appelant qui le calcule. */
  names?: Record<string, string>;
  onNameChange?: (key: string, name: string) => void;
  /** Le nom affiché d'une série composée, calculé par l'appelant. */
  displayName?: (key: string) => string;
};

const SEARCH_DEBOUNCE_MS = 180;

/** Le réglage de périmètre d'une seule série.
 *
 *  Il s'ouvre depuis la ligne de la série, se pose au-dessus du rail, et ne
 *  montre que les dimensions qui ne sont pas déjà l'axe de comparaison. C'est
 *  ce qui rend l'écran modulable sans le transformer en formulaire : rien
 *  n'apparaît tant qu'on ne l'a pas demandé, pour cette série-là.
 */
function ScopeEditor({
  label, scope, locked, metadata, onChange, onClose, free,
}: {
  label: string;
  scope: SeriesScope;
  /** Le champ que la dimension comparée réserve, s'il y en a un. */
  locked: FilterField | null;
  metadata: Metadata;
  onChange: (scope: SeriesScope) => void;
  onClose: () => void;
  free: boolean;
}) {
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const frame = window.requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onPointerDown);
    });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // La période est commune par construction ; la dimension comparée est
  // réservée. Tout le reste appartient à la série.
  const hidden: FilterField[] = ["start_year", "end_year", ...(locked ? [locked] : [])];

  return (
    <div className="scope-editor" ref={panel} role="dialog" aria-label={`Périmètre · ${label}`}>
      <header>
        <strong>{free ? "Périmètre de cette série" : `Périmètre de « ${label} »`}</strong>
        <small>
          {free
            ? "Cette série n’est rattachée à aucune modalité : elle est ce que vous en faites."
            : "S’applique à cette série seule."}
        </small>
      </header>

      <AdvancedFilterPanel
        metadata={metadata}
        value={scope}
        onChange={onChange}
        hiddenFields={hidden}
      />

      <footer>
        <p>La période reste commune : deux axes du temps différents ne se comparent pas.</p>
      </footer>
    </div>
  );
}

export function SeriesPicker({
  breakdown, breakdownLabel, scope, selection, labels, values, slots, tokens, kind,
  showOther, otherCount, maxSelected, count, counts, onCountChange,
  onChange, onToggleOther, onResetToTop,
  metadata, base, scopes, onScopeChange, onAddFree, pickable = true,
  otherLabel, allowScopes = true, names = {}, onNameChange, displayName,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ExploreOption[]>([]);
  const [total, setTotal] = useState(0);
  const [matches, setMatches] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scopeKey = useMemo(() => JSON.stringify(scope), [scope]);

  // La recherche est temporisée : on interroge le serveur quand la frappe se
  // pose, pas à chaque touche.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      runExploreOptions({ ...scope, query, limit: 80 }, controller.signal)
        .then((response) => {
          setOptions(response.options);
          setTotal(response.total_count);
          setMatches(response.match_count);
        })
        .catch((reason: Error) => { if (reason.name !== "AbortError") setOptions([]); })
        .finally(() => setLoading(false));
    }, query ? SEARCH_DEBOUNCE_MS : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query, scopeKey]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const selected = useMemo(() => new Set(selection), [selection]);
  const full = selection.length >= maxSelected;

  const add = (key: string) => {
    if (selected.has(key) || full) return;
    onChange([...selection, key]);
  };
  const remove = (key: string) => onChange(selection.filter((item) => item !== key));
  const move = (key: string, direction: -1 | 1) => {
    const index = selection.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= selection.length) return;
    const next = [...selection];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="series-picker">
      <div className="series-picker-head">
        <div>
          <strong>Ce que je compare</strong>
          <small>{breakdownLabel}</small>
        </div>
        <div className="series-add-group">
          {pickable ? (
            <button
              type="button"
              className="series-add"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              disabled={full}
              title={full ? `Huit séries au maximum : retirez-en une pour en ajouter` : "Ajouter une modalité"}
            >+ Modalité</button>
          ) : null}
          {/* La série qui n'est rattachée à rien : c'est elle qui permet de
              comparer la pharmacie en Île-de-France à l'hospitalisation en
              Bretagne, deux choses qu'aucune dimension ne met côte à côte. */}
          {allowScopes ? <button
            type="button"
            className="series-add series-add-free"
            onClick={onAddFree}
            disabled={full}
            title={full ? "Huit séries au maximum" : "Composer une série avec ses propres filtres"}
          >+ Série libre</button> : null}
        </div>
      </div>

      {pickable ? <div className="series-count">
        <span id="series-count-label">Combien</span>
        <div className="segmented" role="group" aria-labelledby="series-count-label">
          {counts.map((value) => (
            <button
              key={value}
              type="button"
              className={count === value && selection.length === value ? "active" : ""}
              aria-pressed={count === value && selection.length === value}
              onClick={() => onCountChange(value)}
            >{value}</button>
          ))}
        </div>
        <span className="series-count-state">
          {selection.length} affichée{selection.length > 1 ? "s" : ""}
          {selection.length >= maxSelected ? " · maximum" : ""}
        </span>
      </div> : null}

      {selection.length ? (
        <ul className="series-list">
          {selection.map((key, index) => {
            const free = isFree(key);
            const seriesScope = scopes[key];
            const chips = scopeChips(seriesScope, base, metadata);
            const composed = free || Boolean(seriesScope);
            const name = composed
              ? (displayName?.(key)
                 ?? (chips.length ? chips.map((chip) => chip.text).join(" · ") : "Périmètre commun"))
              : (labels.get(key) ?? key);
            return (
              <li key={key} className={chips.length || free ? "has-scope" : ""}>
                <span className="series-swatch" style={{ background: seriesColor(tokens, slots.get(key) ?? index) }} />
                {composed && onNameChange ? (
                  <span className="series-name">
                    {free ? <em className="series-free-tag">Libre</em> : null}
                    <input
                      type="text"
                      className="series-name-input"
                      value={names[key] ?? ""}
                      placeholder={name}
                      aria-label={`Nom de la série · ${name}`}
                      onChange={(event) => onNameChange(key, event.target.value)}
                    />
                  </span>
                ) : (
                  <span className="series-name" title={name}>
                    {free ? <em className="series-free-tag">Libre</em> : null}
                    {name}
                  </span>
                )}
                <span className="series-value">{formatValue(values.get(key) ?? null, kind)}</span>
                <span className="series-tools">
                  {allowScopes ? <button
                    type="button"
                    className={`series-scope-toggle ${chips.length ? "on" : ""}`}
                    aria-expanded={editing === key}
                    onClick={() => {
                      // Ouvrir un périmètre part du commun **et de la modalité
                      // de la série** : on règle un écart, on ne repart pas
                      // d'une feuille blanche — et surtout on ne perd pas en
                      // route ce que la série était.
                      if (!seriesScope) onScopeChange(key, scopeForSeries(breakdown, key, free, base));
                      setEditing((current) => (current === key ? null : key));
                    }}
                    title="Régler le périmètre de cette série"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                  </button> : null}
                  <button type="button" onClick={() => move(key, -1)} disabled={index === 0} aria-label="Monter">↑</button>
                  <button type="button" onClick={() => move(key, 1)} disabled={index === selection.length - 1} aria-label="Descendre">↓</button>
                  <button type="button" onClick={() => remove(key)} aria-label={`Retirer ${name}`}>✕</button>
                </span>

                {/* Les filtres propres à la série, écrits en gris sous son nom.
                    Le graphique les porte déjà dans sa légende ; le rail doit
                    les porter aussi, sans quoi on compare sans savoir quoi. */}
                {chips.length ? (
                  <span className="series-scope-note">
                    {chips.map((chip) => <em key={chip.field}>{chip.text}</em>)}
                    {!free ? (
                      <button type="button" onClick={() => onScopeChange(key, null)} aria-label="Revenir au périmètre commun">✕</button>
                    ) : null}
                  </span>
                ) : null}

                {editing === key ? (
                  <ScopeEditor
                    label={labels.get(key) ?? key}
                    free={free}
                    scope={seriesScope ?? scopeForSeries(breakdown, key, free, base)}
                    locked={lockedField(breakdown, free)}
                    metadata={metadata}
                    onChange={(next) => onScopeChange(key, next)}
                    onClose={() => setEditing(null)}
                  />
                ) : null}
              </li>
            );
          })}
          {pickable && otherCount > 0 ? (
            <li className={`series-other ${showOther ? "" : "off"}`}>
              <span className="series-swatch" style={{ background: tokens.seriesOther }} />
              <span className="series-name">{otherLabel ?? `Autres (${otherCount})`}</span>
              <span className="series-value" />
              <span className="series-tools">
                <button
                  type="button"
                  onClick={() => onToggleOther(!showOther)}
                  aria-pressed={showOther}
                  title={showOther ? "Masquer le reste" : "Afficher le reste"}
                >{showOther ? "✕" : "+"}</button>
              </span>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="series-empty">
          Aucune série affichée. Ajoutez une modalité, ou <button type="button" className="link-button" onClick={onResetToTop}>reprenez les plus importantes</button>.
        </p>
      )}

      {open ? (
        <div className="series-popover" ref={panelRef} role="dialog" aria-label={`Ajouter · ${breakdownLabel}`}>
          <input
            ref={inputRef}
            type="search"
            value={query}
            placeholder={`Rechercher parmi ${total || "les"} ${breakdown === "service" ? "prestations" : "modalités"}…`}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="series-results">
            {loading && !options.length ? <p className="series-hint">Recherche…</p> : null}
            {!loading && !options.length ? <p className="series-hint">Aucun résultat pour « {query} ».</p> : null}
            {options.map((option) => {
              const already = selected.has(option.key);
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`series-result ${already ? "chosen" : ""}`}
                  onClick={() => (already ? remove(option.key) : add(option.key))}
                  disabled={!already && full}
                >
                  <span className="series-result-mark">{already ? "✓" : "+"}</span>
                  <span className="series-result-label">{option.label}</span>
                  <span className="series-result-value">{formatValue(option.value, kind)}</span>
                </button>
              );
            })}
          </div>
          <footer className="series-popover-foot">
            <span>
              {query ? `${matches} sur ${total}` : `${total} au total`}
              {" · classées par poids"}
            </span>
            <button type="button" className="link-button" onClick={onResetToTop}>Reprendre les plus importantes</button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
