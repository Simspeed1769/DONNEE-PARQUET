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
  label, scope, locked, metadata, onChange, free,
}: {
  label: string;
  scope: SeriesScope;
  /** Le champ que la dimension comparée réserve, s'il y en a un. */
  locked: FilterField | null;
  metadata: Metadata;
  onChange: (scope: SeriesScope) => void;
  free: boolean;
}) {
  // La période est commune par construction ; la dimension comparée est
  // réservée. Tout le reste appartient à la série.
  const hidden: FilterField[] = ["start_year", "end_year", ...(locked ? [locked] : [])];

  return (
    <div className="drawer-scope" role="group" aria-label={`Périmètre · ${label}`}>
      <p>
        {free
          ? "Cette série n’est rattachée à aucune modalité : elle est ce que vous en faites."
          : `S’applique à « ${label} » seule.`}
      </p>

      <AdvancedFilterPanel
        metadata={metadata}
        value={scope}
        onChange={onChange}
        hiddenFields={hidden}
      />

      <p>La période reste commune : deux axes du temps différents ne se comparent pas.</p>
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
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<ExploreOption[]>([]);
  const [total, setTotal] = useState(0);
  const [matches, setMatches] = useState(0);
  const [dragged, setDragged] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const scopeKey = useMemo(() => JSON.stringify(scope), [scope]);

  // La recherche est temporisée : on interroge le serveur quand la frappe se
  // pose, pas à chaque touche. Elle vit désormais dans le tiroir, toujours
  // visible : le catalogue n'a plus à s'ouvrir par-dessus la liste des séries.
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      runExploreOptions({ ...scope, query, limit: 80 }, controller.signal)
        .then((response) => {
          setOptions(response.options);
          setTotal(response.total_count);
          setMatches(response.match_count);
        })
        .catch((reason: Error) => { if (reason.name !== "AbortError") setOptions([]); });
    }, query ? SEARCH_DEBOUNCE_MS : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, scopeKey]);

  const selected = useMemo(() => new Set(selection), [selection]);
  const full = selection.length >= maxSelected;

  const add = (key: string) => {
    if (selected.has(key) || full) return;
    onChange([...selection, key]);
  };
  const remove = (key: string) => onChange(selection.filter((item) => item !== key));
  const moveTo = (key: string, to: number) => {
    const index = selection.indexOf(key);
    if (index < 0 || to < 0 || to >= selection.length || to === index) return;
    const next = [...selection];
    const [item] = next.splice(index, 1);
    next.splice(to, 0, item);
    onChange(next);
    setEditing(null);
  };

  return (
    <>
      <ul className="drawer-series">
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
            <li
              key={key}
              className={[editing === key ? "editing" : "", dragged === key ? "dragging" : "",
                over === key && dragged !== null && dragged !== key ? "drop-target" : ""]
                .filter(Boolean).join(" ")}
              onDragOver={(event) => { event.preventDefault(); setOver(key); }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragged !== null) moveTo(dragged, index);
                setDragged(null); setOver(null);
              }}
            >
              <div className="drawer-series-row">
                <i className="drawer-swatch" style={{ background: seriesColor(tokens, slots.get(key) ?? index) }} />
                {composed && onNameChange ? (
                  <input
                    type="text"
                    className="drawer-name"
                    value={names[key] ?? ""}
                    placeholder={name}
                    aria-label={`Nom de la série · ${name}`}
                    onChange={(event) => onNameChange(key, event.target.value)}
                  />
                ) : (
                  <span className="drawer-name" title={name}>{name}</span>
                )}
                <span className="drawer-value">{formatValue(values.get(key) ?? null, kind)}</span>
                <span className="drawer-tools">
                  {allowScopes ? (
                    <button
                      type="button"
                      className={chips.length ? "on" : ""}
                      aria-expanded={editing === key}
                      title={`Régler le périmètre de « ${name} »`}
                      onClick={() => {
                        // Ouvrir un périmètre part du commun **et de la
                        // modalité de la série** : on règle un écart, on ne
                        // repart pas d'une feuille blanche — et surtout on ne
                        // perd pas en route ce que la série était.
                        if (!seriesScope) onScopeChange(key, scopeForSeries(breakdown, key, free, base));
                        setEditing((current) => (current === key ? null : key));
                      }}
                    >Filtrer</button>
                  ) : null}
                  <button
                    type="button"
                    className="drawer-handle"
                    draggable
                    onDragStart={() => setDragged(key)}
                    onDragEnd={() => { setDragged(null); setOver(null); }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp") { event.preventDefault(); moveTo(key, index - 1); }
                      if (event.key === "ArrowDown") { event.preventDefault(); moveTo(key, index + 1); }
                    }}
                    title="Déplacer cette série · flèches haut et bas au clavier"
                    aria-label={`Déplacer ${name}`}
                  >⠿</button>
                  <button
                    type="button"
                    className="drawer-remove"
                    onClick={() => remove(key)}
                    title="Retirer cette série"
                    aria-label={`Retirer ${name}`}
                  >✕</button>
                </span>
              </div>

              {/* Les filtres propres à la série, écrits en gris sous son nom.
                  Le graphique les porte déjà dans sa légende ; le tiroir doit
                  les porter aussi, sans quoi on compare sans savoir quoi. */}
              {chips.length ? (
                <span className="drawer-chips">
                  {chips.map((chip) => <em key={chip.field}>{chip.text}</em>)}
                  {!free ? (
                    <button type="button" onClick={() => onScopeChange(key, null)}
                      title="Revenir au périmètre commun">Réinitialiser</button>
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
                />
              ) : null}
            </li>
          );
        })}

        {pickable && otherCount > 0 ? (
          <li>
            <div className="drawer-series-row">
              <i className="drawer-swatch" style={{ background: tokens.seriesOther }} />
              <span className="drawer-name" style={{ color: "var(--ink-muted)", fontStyle: "italic" }}>
                {otherLabel ?? `Autres (${otherCount})`}
              </span>
              <span className="drawer-tools">
                <button type="button" onClick={() => onToggleOther(!showOther)} aria-pressed={showOther}
                  title={showOther ? "Masquer le reste du périmètre" : "Afficher le reste du périmètre"}
                >{showOther ? "Masquer" : "Afficher"}</button>
              </span>
            </div>
          </li>
        ) : null}
      </ul>

      {!selection.length ? (
        <p className="drawer-note">
          Aucune série affichée. Ajoutez une modalité ci-dessous, ou{" "}
          <button type="button" className="link-button" onClick={onResetToTop}>reprenez les plus importantes</button>.
        </p>
      ) : null}

      {allowScopes ? (
        <>
          <p className="drawer-section-title">Composer</p>
          {/* La série qui n'est rattachée à rien : c'est elle qui permet de
              comparer la pharmacie en Île-de-France à l'hospitalisation en
              Bretagne, deux choses qu'aucune dimension ne met côte à côte. */}
          <button type="button" className="drawer-add" onClick={onAddFree} disabled={full}
            title={full ? `${maxSelected} séries au maximum` : "Composer une série avec ses propres filtres"}
          >+ Série libre</button>
        </>
      ) : null}

      {pickable ? (
        <>
          <p className="drawer-section-title">Ajouter une modalité · {breakdownLabel}</p>
          <div className="drawer-search">
            <input
              type="search"
              value={query}
              placeholder={`Rechercher parmi ${total || "les"} ${breakdown === "service" ? "prestations" : "modalités"}…`}
              aria-label="Rechercher une modalité"
              onChange={(event) => setQuery(event.target.value)}
            />
            <small>
              {query ? `${matches} sur ${total}` : `${total} au total`}
              {" · classées par poids"}
            </small>
          </div>
          <ul className="drawer-results">
            {options.map((option) => {
              const already = selected.has(option.key);
              return (
                <li key={option.key}>
                  <button type="button" onClick={() => (already ? remove(option.key) : add(option.key))}
                    disabled={!already && full}>
                    <span className="mark">{already ? "✓" : "+"}</span>
                    <span className="name" title={option.label}>{option.label}</span>
                    <span className="weight">{formatValue(option.value, kind)}</span>
                  </button>
                </li>
              );
            })}
            {!options.length ? <li className="drawer-note">Aucun résultat pour « {query} ».</li> : null}
          </ul>
        </>
      ) : null}

      {/* Le nombre de séries de tête : le raccourci qui remet la comparaison
          sur les modalités qui pèsent. */}
      {pickable ? (
        <>
          <p className="drawer-section-title">Reprendre les plus importantes</p>
          <div className="series-drawer-actions">
            {counts.map((value) => (
              <button key={value} type="button"
                className={`drawer-add ${count === value && selection.length === value ? "on" : ""}`}
                onClick={() => onCountChange(value)}
              >Top {value}</button>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}
