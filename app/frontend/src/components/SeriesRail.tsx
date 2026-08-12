/** « Ce que je compare » — le rail de séries des bases à objets.
 *
 *  C'est le portage du geste de `damir/CompareSection.tsx` sur Pathologies, CSP
 *  et Mortalité : un résumé d'une ligne posé sur le fond de la page, au-dessus
 *  du panneau du graphique, et une liste qui s'ouvre en dessous où **chaque
 *  série porte son propre périmètre**. Comparer « le diabète en Île-de-France »
 *  à « le diabète en Bretagne » ne demande alors plus deux écrans ni deux liens.
 *
 *  Il réemploie les classes de DAMIR — `compare-rail*`, `series-*`,
 *  `scope-editor*` — plutôt que d'en inventer de voisines : la consigne est que
 *  les quatre bases s'utilisent à l'identique, et deux feuilles de style
 *  parallèles divergent toujours.
 *
 *  Trois règles tiennent la souplesse honnête, les mêmes que sur DAMIR :
 *
 *  1. **La période reste commune.** Deux axes du temps différents ne se
 *     comparent pas, ils se superposent par accident. Le millésime appartient
 *     donc à la coquille, jamais à une série.
 *  2. **Ce qui diffère est écrit.** Chaque série affiche sous son nom les
 *     filtres qui la distinguent du périmètre commun. Sans cela, deux courbes
 *     semblables laisseraient croire à une comparaison toutes choses égales par
 *     ailleurs — et l'appelant retire les formes cumulatives, qui mentiraient.
 *  3. **Aucune liste déroulante native pour choisir les séries.** Le catalogue
 *     s'atteint par une recherche et une liste classée par poids, comme le
 *     `SeriesPicker` de DAMIR. Le réglage du périmètre, lui, emploie les mêmes
 *     champs que DAMIR dans son tiroir : `.scope-editor-field`, adossé aux
 *     jetons.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { formatValue } from "../utils";

/** Une entrée du catalogue comparable, classée par poids par l'appelant. */
export type RailOption = {
  code: string;
  label: string;
  /** Le rattachement affiché en regard : famille, niveau de nomenclature,
   *  chapitre de causes. */
  group: string;
  /** Ce qui donne son rang à l'entrée. Affiché tel quel dans la recherche. */
  weight?: number | null;
};

/** Un filtre que la base sait appliquer à une série seule. Chaque base déclare
 *  les siens : région, âge et sexe pour Pathologies et CSP, population pour
 *  Mortalité. La période n'en fait jamais partie. */
export type ScopeField = {
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
};

/** Le périmètre d'une série, champ par champ. Absent, la série suit la
 *  coquille. */
export type SeriesScope = Record<string, string>;

export type SeriesEntry = {
  code: string;
  /** Nom écrit à la main. Vide, la série prend le libellé de son objet, suivi
   *  de ce qui la distingue. */
  name?: string;
  scope?: SeriesScope;
};

type Props = {
  catalogue: RailOption[];
  entries: SeriesEntry[];
  onChange: (entries: SeriesEntry[]) => void;
  maximum: number;
  noun: string;
  nounPlural: string;
  fields: ScopeField[];
  base: SeriesScope;
  /** Le périmètre commun en une ligne, rappelé sous l'en-tête du panneau. */
  baseLabel: string;
  /** La couleur de chaque série, pour que le rail et le graphique s'accordent. */
  colorOf: (index: number) => string;
  /** Le poids affiché en regard d'une série retenue, déjà lu dans les données. */
  valueOf?: (entry: SeriesEntry, index: number) => number | null;
  /** La nature des poids, pour les mettre en forme : `quantity`, `money`. */
  kind: string;
  /** Le repli, quand le modèle de la base le juge licite. Absent, aucune ligne
   *  n'est offerte : un « reste » qui compterait deux fois les mêmes personnes
   *  ne se propose pas, même éteint. */
  other?: {
    label: string;
    on: boolean;
    onToggle: (value: boolean) => void;
    color: string;
  } | null;
  /** Combien de séries le classement met d'emblée à l'écran. */
  count: number;
  counts: readonly number[];
  onCountChange: (count: number) => void;
};

/** Ce qui distingue une série du périmètre commun, champ par champ. */
export function scopeChips(scope: SeriesScope | undefined, base: SeriesScope,
                           fields: ScopeField[]): string[] {
  if (!scope) return [];
  return fields
    .filter((field) => scope[field.key] !== undefined && scope[field.key] !== base[field.key])
    .map((field) => field.options.find((option) => option.value === scope[field.key])?.label
      ?? String(scope[field.key]));
}

/** Le nom affiché : celui qu'on a écrit, sinon le libellé de l'objet suivi de
 *  ce qui le distingue du périmètre commun. */
export function seriesName(entry: SeriesEntry, catalogue: RailOption[],
                           base: SeriesScope, fields: ScopeField[]): string {
  if (entry.name?.trim()) return entry.name.trim();
  const label = catalogue.find((item) => item.code === entry.code)?.label ?? entry.code;
  const chips = scopeChips(entry.scope, base, fields);
  return chips.length ? `${label} · ${chips.join(" · ")}` : label;
}

/** Vrai dès que deux séries ne décrivent pas la même population. */
export function hasMixedPopulations(entries: SeriesEntry[], base: SeriesScope,
                                    fields: ScopeField[]): boolean {
  return entries.some((entry) => scopeChips(entry.scope, base, fields).length > 0);
}

/** Le tiroir de périmètre d'une seule série.
 *
 *  Il vit **dans le flux**, sous sa ligne : posé en absolu au-dessus d'une liste
 *  qui défile déjà, il serait rogné par son parent et deux zones de défilement
 *  imbriquées se disputeraient la molette — la leçon de la v3 sur DAMIR. */
function ScopeEditor({ label, scope, fields, onChange }: {
  label: string;
  scope: SeriesScope;
  fields: ScopeField[];
  onChange: (scope: SeriesScope) => void;
}) {
  return (
    <div className="scope-editor" role="group" aria-label={`Périmètre · ${label}`}>
      <header>
        <strong>Périmètre de « {label} »</strong>
        <small>S’applique à cette série seule.</small>
      </header>

      <div className="scope-editor-fields">
        {fields.map((field) => (
          <label className="scope-editor-field" key={field.key}>
            <span>{field.label}</span>
            <select
              value={scope[field.key] ?? ""}
              onChange={(event) => onChange({ ...scope, [field.key]: event.target.value })}
            >
              {field.options.map((option) => (
                <option value={option.value} key={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <footer>
        <p>La période reste commune : deux axes du temps différents ne se comparent pas.</p>
      </footer>
    </div>
  );
}

export function SeriesRail({
  catalogue, entries, onChange, maximum, noun, nounPlural, fields, base, baseLabel,
  colorOf, valueOf, kind, other, count, counts, onCountChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const popover = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!search) return;
    input.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!popover.current?.contains(event.target as Node)) setSearch(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSearch(false); };
    const frame = window.requestAnimationFrame(() => document.addEventListener("pointerdown", onPointerDown));
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [search]);

  const labelOf = useMemo(
    () => new Map(catalogue.map((item) => [item.code, item.label])),
    [catalogue],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr-FR");
    if (!needle) return catalogue;
    return catalogue.filter((item) =>
      item.label.toLocaleLowerCase("fr-FR").includes(needle)
      || item.group.toLocaleLowerCase("fr-FR").includes(needle));
  }, [catalogue, query]);

  const chosen = useMemo(() => new Set(entries.map((entry) => entry.code)), [entries]);
  const full = entries.length >= maximum;

  const patch = (index: number, change: Partial<SeriesEntry>) => {
    onChange(entries.map((entry, position) => (position === index ? { ...entry, ...change } : entry)));
  };

  const remove = (index: number) => {
    if (entries.length <= 1) return;
    onChange(entries.filter((_, position) => position !== index));
    setEditing(null);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= entries.length) return;
    const next = [...entries];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setEditing(null);
  };

  const add = (code: string) => {
    if (full) return;
    // Une nouvelle série part du périmètre de la précédente : on ajoute le plus
    // souvent une voisine à comparer sur le même terrain.
    const previous = entries[entries.length - 1]?.scope;
    onChange([...entries, { code, scope: previous ? { ...previous } : undefined }]);
  };

  const toggle = (code: string) => {
    if (chosen.has(code)) {
      if (entries.length <= 1) return;
      onChange(entries.filter((entry) => entry.code !== code));
      setEditing(null);
      return;
    }
    add(code);
  };

  /** Le même objet, une seconde fois, pour le régler sur un autre périmètre.
   *  C'est l'équivalent de la « série libre » de DAMIR : sans elle, un code ne
   *  pouvant figurer qu'une fois, on ne comparerait jamais une pathologie à
   *  elle-même sur deux territoires. */
  const duplicate = (index: number) => {
    if (full) return;
    const source = entries[index];
    const next = [...entries];
    next.splice(index + 1, 0, {
      code: source.code,
      scope: { ...(source.scope ?? base) },
    });
    onChange(next);
    setEditing(index + 1);
  };

  return (
    <div className="compare-rail">
      <div className="compare-rail-summary">
        <span className="compare-rail-label">Ce que je compare</span>
        <div className="compare-rail-chips" role="list">
          {entries.map((entry, index) => (
            <span key={`${index}-${entry.code}`} className="compare-rail-chip" role="listitem">
              <i style={{ background: colorOf(index) }} />
              {seriesName(entry, catalogue, base, fields)}
            </span>
          ))}
          {other?.on ? (
            <span className="compare-rail-chip" role="listitem">
              <i style={{ background: other.color }} />
              {other.label}
            </span>
          ) : null}
          {!entries.length ? <span className="compare-rail-chip empty">Aucune série</span> : null}
        </div>
        <button
          type="button"
          className={`compare-rail-toggle ${open ? "open" : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >{open ? "Fermer" : "Modifier les séries"}</button>
      </div>

      {open ? (
        <div className="compare-rail-panel" role="dialog" aria-label={`Séries comparées · ${nounPlural}`}>
          <div className="series-picker">
            <div className="series-picker-head">
              <div>
                <strong>Ce que je compare</strong>
                <small>Périmètre commun · {baseLabel}</small>
              </div>
              <div className="series-add-group">
                <button
                  type="button"
                  className="series-add"
                  onClick={() => setSearch((value) => !value)}
                  aria-expanded={search}
                  disabled={full}
                  title={full
                    ? `${maximum} séries au maximum : retirez-en une pour en ajouter`
                    : `Ajouter une ${noun}`}
                >+ {noun.charAt(0).toLocaleUpperCase("fr-FR")}{noun.slice(1)}</button>
              </div>
            </div>

            <div className="series-count">
              <span id="series-count-label">Combien</span>
              <div className="segmented" role="group" aria-labelledby="series-count-label">
                {counts.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={count === value && entries.length === value ? "active" : ""}
                    aria-pressed={count === value && entries.length === value}
                    onClick={() => onCountChange(value)}
                  >{value}</button>
                ))}
              </div>
              <span className="series-count-state">
                {entries.length} affichée{entries.length > 1 ? "s" : ""}
                {full ? " · maximum" : ""}
              </span>
            </div>

            {entries.length ? (
              <ul className="series-list">
                {entries.map((entry, index) => {
                  const chips = scopeChips(entry.scope, base, fields);
                  const label = labelOf.get(entry.code) ?? entry.code;
                  return (
                    <li key={`${index}-${entry.code}`} className={chips.length ? "has-scope" : ""}>
                      <span className="series-swatch" style={{ background: colorOf(index) }} />
                      <span className="series-name">
                        <input
                          type="text"
                          className="series-name-input"
                          value={entry.name ?? ""}
                          placeholder={seriesName({ ...entry, name: undefined }, catalogue, base, fields)}
                          aria-label={`Nom de la série · ${label}`}
                          onChange={(event) => patch(index, { name: event.target.value })}
                        />
                      </span>
                      <span className="series-value">{formatValue(valueOf?.(entry, index) ?? null, kind)}</span>
                      <span className="series-tools">
                        <button
                          type="button"
                          className={`series-scope-toggle ${chips.length ? "on" : ""}`}
                          aria-expanded={editing === index}
                          title="Régler le périmètre de cette série"
                          onClick={() => {
                            // Ouvrir le périmètre part du commun : on règle un
                            // écart, on ne repart pas d'une feuille blanche.
                            if (!entry.scope) patch(index, { scope: { ...base } });
                            setEditing((current) => (current === index ? null : index));
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
                        </button>
                        <button type="button" onClick={() => duplicate(index)} disabled={full}
                          title={`Comparer cette ${noun} à elle-même sur un autre périmètre`}
                          aria-label={`Dupliquer ${label}`}>⧉</button>
                        <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Monter">↑</button>
                        <button type="button" onClick={() => move(index, 1)} disabled={index === entries.length - 1} aria-label="Descendre">↓</button>
                        <button type="button" onClick={() => remove(index)} disabled={entries.length <= 1} aria-label={`Retirer ${label}`}>✕</button>
                      </span>

                      {/* Les filtres propres à la série, écrits en gris sous son
                          nom : le graphique les porte dans sa légende, le rail
                          doit les porter aussi, sans quoi on compare sans
                          savoir quoi. */}
                      {chips.length ? (
                        <span className="series-scope-note">
                          {chips.map((chip) => <em key={chip}>{chip}</em>)}
                          <button type="button" onClick={() => patch(index, { scope: undefined })}
                            aria-label="Revenir au périmètre commun">✕</button>
                        </span>
                      ) : null}

                      {editing === index ? (
                        <ScopeEditor
                          label={label}
                          scope={entry.scope ?? { ...base }}
                          fields={fields}
                          onChange={(next) => patch(index, { scope: next })}
                        />
                      ) : null}
                    </li>
                  );
                })}

                {other ? (
                  <li className={`series-other ${other.on ? "" : "off"}`}>
                    <span className="series-swatch" style={{ background: other.color }} />
                    <span className="series-name">{other.label}</span>
                    <span className="series-value" />
                    <span className="series-tools">
                      <button
                        type="button"
                        onClick={() => other.onToggle(!other.on)}
                        aria-pressed={other.on}
                        title={other.on ? "Masquer le reste" : "Afficher le reste"}
                      >{other.on ? "✕" : "+"}</button>
                    </span>
                  </li>
                ) : null}
              </ul>
            ) : (
              <p className="series-empty">
                Aucune série affichée. Ajoutez une {noun}, ou <button type="button" className="link-button" onClick={() => onCountChange(count)}>reprenez les plus importantes</button>.
              </p>
            )}

            {search ? (
              <div className="series-popover" ref={popover} role="dialog" aria-label={`Ajouter · ${nounPlural}`}>
                <input
                  ref={input}
                  type="search"
                  value={query}
                  placeholder={`Rechercher parmi ${catalogue.length} ${nounPlural}…`}
                  aria-label={`Rechercher une ${noun}`}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="series-results">
                  {!matches.length ? <p className="series-hint">Aucun résultat pour « {query} ».</p> : null}
                  {matches.slice(0, 120).map((item) => {
                    const already = chosen.has(item.code);
                    return (
                      <button
                        key={item.code}
                        type="button"
                        className={`series-result ${already ? "chosen" : ""}`}
                        onClick={() => toggle(item.code)}
                        disabled={!already && full}
                        title={item.group}
                      >
                        <span className="series-result-mark">{already ? "✓" : "+"}</span>
                        <span className="series-result-label">{item.label}</span>
                        <span className="series-result-value">{formatValue(item.weight ?? null, kind)}</span>
                      </button>
                    );
                  })}
                </div>
                <footer className="series-popover-foot">
                  <span>
                    {query ? `${matches.length} sur ${catalogue.length}` : `${catalogue.length} au total`}
                    {" · classées par poids"}
                  </span>
                  <button type="button" className="link-button" onClick={() => { onCountChange(count); setSearch(false); }}>
                    Reprendre les plus importantes
                  </button>
                </footer>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
