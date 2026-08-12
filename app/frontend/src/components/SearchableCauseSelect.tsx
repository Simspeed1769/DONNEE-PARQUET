/** Choisir une cause de décès parmi quatre-vingt-six.
 *
 *  C'était un champ de recherche **au-dessus** d'une liste déroulante native :
 *  deux contrôles pour un seul choix, deux lignes là où les filtres voisins en
 *  prennent une, et un menu dessiné par le système qui ignore les jetons de
 *  thème. C'est désormais un seul contrôle, qui porte sa recherche à
 *  l'intérieur et ouvre sa liste dans la page.
 *
 *  Le groupement reste celui de la nomenclature : les détails « dont … » se
 *  rangent sous le chapitre qui les précède, ce qui rend la liste lisible sans
 *  connaître le CépiDc.
 */

import { useEffect, useMemo, useRef, useState } from "react";

type CauseOption = { code: string; label: string };

type Props = {
  options: CauseOption[];
  value: string;
  onChange: (value: string) => void;
  allOption?: CauseOption;
  searchPlaceholder?: string;
  searchLabel?: string;
  selectLabel?: string;
  itemLabel?: string;
  groupedDetails?: boolean;
};

function normalize(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
}

export function SearchableCauseSelect({
  options,
  value,
  onChange,
  allOption,
  searchPlaceholder = "Rechercher une cause…",
  searchLabel = "Rechercher une cause de décès",
  selectLabel = "Cause de décès",
  itemLabel = "causes classées par famille",
  groupedDetails = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const holder = useRef<HTMLDivElement | null>(null);
  const field = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const frame = window.requestAnimationFrame(() => document.addEventListener("pointerdown", onPointerDown));
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const groups = useMemo(() => {
    if (!groupedDetails) return [{ label: "Résultats", options }];
    const next: Array<{ label: string; options: CauseOption[] }> = [];
    options.forEach((option) => {
      if (!normalize(option.label).startsWith("dont ")) {
        next.push({ label: option.label, options: [option] });
      } else if (next.length) {
        next[next.length - 1].options.push(option);
      } else {
        next.push({ label: "Autres causes", options: [option] });
      }
    });
    return next;
  }, [options, groupedDetails]);

  const filteredGroups = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return groups;
    return groups.flatMap((group) => {
      const groupMatches = normalize(group.label).includes(needle);
      const matches = groupMatches
        ? group.options
        : group.options.filter((option) => normalize(option.label).includes(needle));
      return matches.length ? [{ ...group, options: matches }] : [];
    });
  }, [groups, query]);

  const resultCount = filteredGroups.reduce((sum, group) => sum + group.options.length, 0);
  const current = value === allOption?.code
    ? allOption
    : options.find((option) => option.code === value);

  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="cause-select" ref={holder}>
      <button
        type="button"
        className={`cause-select-field ${open ? "open" : ""}`}
        aria-expanded={open}
        aria-label={selectLabel}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{current?.label ?? "—"}</span>
        <i aria-hidden="true">⌄</i>
      </button>

      {open ? (
        <div className="cause-select-panel" role="listbox" aria-label={selectLabel}>
          <input
            ref={field}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchLabel}
          />
          {/* Le décompte appartient au sélecteur : c'est là qu'il renseigne sur
              ce qu'on est en train de parcourir. */}
          <small>{query ? `${resultCount} résultat${resultCount > 1 ? "s" : ""}` : `${options.length} ${itemLabel}`}</small>

          <div className="cause-select-list">
            {allOption && !query ? (
              <button type="button" role="option" aria-selected={value === allOption.code}
                className={`cause-option ${value === allOption.code ? "chosen" : ""}`}
                onClick={() => pick(allOption.code)}
              >{allOption.label}</button>
            ) : null}
            {filteredGroups.map((group) => (
              <div key={group.label} className="cause-group">
                <p>{group.label}</p>
                {group.options.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    role="option"
                    aria-selected={option.code === value}
                    className={`cause-option ${option.code === value ? "chosen" : ""}`}
                    onClick={() => pick(option.code)}
                  >{option.label}</button>
                ))}
              </div>
            ))}
            {!filteredGroups.length ? <p className="cause-empty">Aucune cause ne correspond.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
