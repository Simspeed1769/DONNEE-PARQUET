/** « Ce que je compare » — le bandeau, et le tiroir qu'il ouvre.
 *
 *  Le bandeau reste ce qu'il était : une rangée de puces sur le fond de la
 *  page, au-dessus du panneau du graphique. C'est ce qu'il ouvre qui change.
 *  Le panneau se posait par-dessus la page, masquait les filtres qu'il
 *  prolonge et le graphique qu'on modifiait, et défilait dans son coin ; il
 *  devient un tiroir ancré à droite qui pousse la page — voir `SeriesDrawer`.
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
 *  3. **Aucune liste déroulante native.** Ni pour choisir les séries — une
 *     recherche et une liste classée par poids — ni pour régler leur périmètre,
 *     qui emploie `ChoiceSelect`.
 */

import { useMemo, useState } from "react";
import { formatValue } from "../utils";
import { ChoiceSelect } from "./ChoiceSelect";
import { SeriesDrawer } from "./SeriesDrawer";

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
  /** Le périmètre commun en une ligne, rappelé sous le titre du tiroir. */
  baseLabel: string;
  /** La couleur de chaque série, pour que le rail et le graphique s'accordent. */
  colorOf: (index: number) => string;
  /** Le poids affiché en regard d'une série retenue, déjà lu dans les données. */
  valueOf?: (entry: SeriesEntry, index: number) => number | null;
  /** La nature des poids, pour les mettre en forme. */
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

export function SeriesRail({
  catalogue, entries, onChange, maximum, noun, nounPlural, fields, base, baseLabel,
  colorOf, valueOf, kind, other, count, counts, onCountChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [dragged, setDragged] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

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

  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= entries.length || from === to) return;
    const next = [...entries];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
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
   *  Sans elle, un code ne pouvant figurer qu'une fois, on ne comparerait jamais
   *  une pathologie à elle-même sur deux territoires. */
  const duplicate = (index: number) => {
    if (full) return;
    const source = entries[index];
    const next = [...entries];
    next.splice(index + 1, 0, { code: source.code, scope: { ...(source.scope ?? base) } });
    onChange(next);
    setEditing(index + 1);
  };

  return (
    <div className="compare-rail">
      <div className="compare-rail-summary">
        <span className="compare-rail-label">Ce que je compare</span>
        <div className="compare-rail-chips" role="list">
          {entries.map((entry, index) => {
            const name = seriesName(entry, catalogue, base, fields);
            return (
              <span key={`${index}-${entry.code}`} className="compare-rail-chip" role="listitem">
                <i style={{ background: colorOf(index) }} />
                {name}
                {/* Retirer une série est le geste le plus fréquent : il se fait
                    ici, sans passer par le tiroir. */}
                <button
                  type="button"
                  onClick={() => remove(index)}
                  disabled={entries.length <= 1}
                  title={entries.length <= 1
                    ? "Une comparaison garde au moins une série"
                    : `Retirer ${name}`}
                  aria-label={`Retirer ${name}`}
                >✕</button>
              </span>
            );
          })}
          {other?.on ? (
            <span className="compare-rail-chip" role="listitem">
              <i style={{ background: other.color }} />
              {other.label}
              <button
                type="button"
                onClick={() => other.onToggle(false)}
                title="Masquer le reste du périmètre"
                aria-label="Masquer le reste du périmètre"
              >✕</button>
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

      <SeriesDrawer
        open={open}
        onClose={() => setOpen(false)}
        title="Ce que je compare"
        subtitle={`Périmètre commun · ${baseLabel}`}
        count={`${entries.length} série${entries.length > 1 ? "s" : ""} sur ${maximum}`}
      >
        <ul className="drawer-series">
          {entries.map((entry, index) => {
            const chips = scopeChips(entry.scope, base, fields);
            const label = labelOf.get(entry.code) ?? entry.code;
            const scope = entry.scope ?? base;
            return (
              <li
                key={`${index}-${entry.code}`}
                className={[editing === index ? "editing" : "", dragged === index ? "dragging" : "",
                  over === index && dragged !== null && dragged !== index ? "drop-target" : ""]
                  .filter(Boolean).join(" ")}
                onDragOver={(event) => { event.preventDefault(); setOver(index); }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragged !== null) moveTo(dragged, index);
                  setDragged(null); setOver(null);
                }}
              >
                <div className="drawer-series-row">
                  <i className="drawer-swatch" style={{ background: colorOf(index) }} />
                  <input
                    type="text"
                    className="drawer-name"
                    value={entry.name ?? ""}
                    placeholder={seriesName({ ...entry, name: undefined }, catalogue, base, fields)}
                    aria-label={`Nom de la série · ${label}`}
                    onChange={(event) => patch(index, { name: event.target.value })}
                  />
                  <span className="drawer-value">{formatValue(valueOf?.(entry, index) ?? null, kind)}</span>
                  <span className="drawer-tools">
                    <button
                      type="button"
                      className={chips.length ? "on" : ""}
                      aria-expanded={editing === index}
                      title={`Régler le périmètre de « ${label} »`}
                      onClick={() => {
                        if (!entry.scope) patch(index, { scope: { ...base } });
                        setEditing((current) => (current === index ? null : index));
                      }}
                    >Filtrer</button>
                    <button
                      type="button"
                      className="drawer-handle"
                      draggable
                      onDragStart={() => setDragged(index)}
                      onDragEnd={() => { setDragged(null); setOver(null); }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowUp") { event.preventDefault(); moveTo(index, index - 1); }
                        if (event.key === "ArrowDown") { event.preventDefault(); moveTo(index, index + 1); }
                      }}
                      title="Déplacer cette série · flèches haut et bas au clavier"
                      aria-label={`Déplacer ${label}`}
                    >⠿</button>
                    <button
                      type="button"
                      onClick={() => duplicate(index)}
                      disabled={full}
                      title={`Comparer cette ${noun} à elle-même sur un autre périmètre`}
                      aria-label={`Dupliquer ${label}`}
                    >⧉</button>
                    <button
                      type="button"
                      className="drawer-remove"
                      onClick={() => remove(index)}
                      disabled={entries.length <= 1}
                      title="Retirer cette série"
                      aria-label={`Retirer ${label}`}
                    >✕</button>
                  </span>
                </div>

                {chips.length ? (
                  <span className="drawer-chips">
                    {chips.map((chip) => <em key={chip}>{chip}</em>)}
                    <button type="button" onClick={() => patch(index, { scope: undefined })}
                      title="Revenir au périmètre commun">Réinitialiser</button>
                  </span>
                ) : null}

                {editing === index ? (
                  <div className="drawer-scope">
                    <div className="drawer-fields">
                      {fields.map((field) => (
                        <ChoiceSelect
                          key={field.key}
                          label={field.label}
                          options={field.options}
                          value={scope[field.key] ?? ""}
                          onChange={(next) => patch(index, { scope: { ...scope, [field.key]: next } })}
                        />
                      ))}
                    </div>
                    <p>La période reste commune : deux axes du temps différents ne se comparent pas.</p>
                  </div>
                ) : null}
              </li>
            );
          })}

          {other ? (
            <li>
              <div className="drawer-series-row">
                <i className="drawer-swatch" style={{ background: other.color }} />
                <span className="drawer-name" style={{ color: "var(--ink-muted)", fontStyle: "italic" }}>
                  {other.label}
                </span>
                <span className="drawer-tools">
                  <button type="button" onClick={() => other.onToggle(!other.on)} aria-pressed={other.on}
                    title={other.on ? "Masquer le reste du périmètre" : "Afficher le reste du périmètre"}
                  >{other.on ? "Masquer" : "Afficher"}</button>
                </span>
              </div>
            </li>
          ) : null}
        </ul>

        <p className="drawer-section-title">Ajouter une {noun}</p>
        <div className="drawer-search">
          <input
            type="search"
            value={query}
            placeholder={`Rechercher parmi ${catalogue.length} ${nounPlural}…`}
            aria-label={`Rechercher une ${noun}`}
            onChange={(event) => setQuery(event.target.value)}
          />
          <small>
            {query ? `${matches.length} sur ${catalogue.length}` : `${catalogue.length} au total`}
            {" · classées par poids"}
          </small>
        </div>
        <ul className="drawer-results">
          {matches.slice(0, 120).map((item) => {
            const already = chosen.has(item.code);
            return (
              <li key={item.code}>
                <button type="button" onClick={() => toggle(item.code)} disabled={!already && full}>
                  <span className="mark">{already ? "✓" : "+"}</span>
                  <span className="name" title={item.label}>{item.label}</span>
                  <span className="group" title={item.group}>{item.group}</span>
                  <span className="weight">{formatValue(item.weight ?? null, kind)}</span>
                </button>
              </li>
            );
          })}
          {!matches.length ? <li className="drawer-note">Aucune {noun} ne correspond.</li> : null}
        </ul>
        <p className="drawer-section-title">Reprendre les plus importantes</p>
        <div className="series-drawer-actions">
          {counts.map((value) => (
            <button key={value} type="button"
              className={`drawer-add ${count === value && entries.length === value ? "on" : ""}`}
              onClick={() => onCountChange(value)}
              title={`Reprendre les ${value} ${nounPlural} les plus lourdes`}
            >Top {value}</button>
          ))}
        </div>

        {full ? (
          <p className="drawer-note">
            {maximum} séries au maximum : au-delà, deux teintes de la palette ne se
            distinguent plus de façon sûre.
          </p>
        ) : null}
      </SeriesDrawer>
    </div>
  );
}
