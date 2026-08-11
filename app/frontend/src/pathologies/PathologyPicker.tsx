/** Choisir les pathologies qu'on met en regard.
 *
 *  L'écran précédent en demandait deux à la fois — un champ de recherche *et*
 *  une liste déroulante native — pour la même tâche, la liste native ignorant
 *  au passage les jetons de thème. **Un seul sélecteur**, sur le modèle de
 *  `SeriesPicker` de DAMIR : un résumé sur une ligne, une liste qui s'ouvre en
 *  dessous, une recherche, et un classement par poids.
 *
 *  Le classement par nombre de patients n'est pas un détail : proposer 118
 *  pathologies dans l'ordre de la nomenclature demande de connaître la
 *  nomenclature. Classées par poids, les plus courantes se présentent d'elles-
 *  mêmes, et la recherche sert à trouver les autres.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { PathologyMetadata } from "../types";

export type PathologyOption = {
  code: string;
  label: string;
  family: string;
  patients: number;
};

/** Le catalogue à plat, classé du plus lourd au plus léger.
 *
 *  Les trois niveaux y figurent : on compare une famille entière aussi bien
 *  qu'une pathologie précise, et le niveau d'un « top » ne se devine pas de son
 *  code. Un même code n'apparaît qu'une fois — la nomenclature répète le code
 *  d'une famille sur son groupe unique. */
export function pathologyCatalogue(metadata: PathologyMetadata | null): PathologyOption[] {
  const seen = new Set<string>();
  const rows: PathologyOption[] = [];
  const push = (code: string, label: string, family: string, patients?: number | null) => {
    if (seen.has(code)) return;
    seen.add(code);
    rows.push({ code, label, family, patients: patients ?? 0 });
  };
  (metadata?.families ?? []).forEach((family) => {
    push(family.code, family.label, family.label, family.patients);
    family.groups.forEach((group) => {
      push(group.code, group.label, family.label, group.patients);
      group.pathologies.forEach((item) => push(item.code, item.label, family.label, item.patients));
    });
  });
  return rows.sort((left, right) => right.patients - left.patients);
}

type Props = {
  catalogue: PathologyOption[];
  selection: string[];
  onChange: (codes: string[]) => void;
  /** Au-delà, la palette catégorielle ne sépare plus les teintes de façon sûre. */
  maximum: number;
};

export function PathologyPicker({ catalogue, selection, onChange, maximum }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const panel = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
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

  const labelOf = useMemo(
    () => new Map(catalogue.map((item) => [item.code, item.label])),
    [catalogue],
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("fr-FR");
    if (!needle) return catalogue;
    return catalogue.filter((item) =>
      item.label.toLocaleLowerCase("fr-FR").includes(needle)
      || item.family.toLocaleLowerCase("fr-FR").includes(needle));
  }, [catalogue, query]);

  const toggle = (code: string) => {
    if (selection.includes(code)) {
      // La dernière ne se retire pas : une comparaison vide n'a rien à montrer,
      // et l'écran doit rester dans un état qu'on peut lire.
      if (selection.length <= 1) return;
      onChange(selection.filter((item) => item !== code));
      return;
    }
    if (selection.length >= maximum) return;
    onChange([...selection, code]);
  };

  const full = selection.length >= maximum;

  return (
    <div className="patho-picker">
      <div className="patho-picker-summary">
        <span className="patho-picker-label">Ce que je compare</span>
        {/* Les puces s'alignent dans leur rangée, sous le résumé — elles ne
            flottent plus par-dessus le champ. */}
        <div className="patho-picker-chips" role="list">
          {selection.map((code) => (
            <span key={code} className="patho-picker-chip" role="listitem">
              {labelOf.get(code) ?? code}
              <button
                type="button"
                onClick={() => toggle(code)}
                disabled={selection.length <= 1}
                aria-label={`Retirer ${labelOf.get(code) ?? code}`}
              >✕</button>
            </span>
          ))}
          {!selection.length ? <span className="patho-picker-chip empty">Aucune pathologie</span> : null}
        </div>
        <button
          type="button"
          className={`patho-picker-toggle ${open ? "open" : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >Modifier</button>
      </div>

      {open ? (
        <div className="patho-picker-panel" ref={panel} role="dialog" aria-label="Choisir les pathologies">
          <div className="patho-picker-search">
            <input
              ref={input}
              type="search"
              value={query}
              placeholder="Rechercher une pathologie…"
              aria-label="Rechercher une pathologie"
              onChange={(event) => setQuery(event.target.value)}
            />
            {/* Le décompte appartient au sélecteur, pas à la page : c'est là
                qu'il renseigne sur ce qu'on est en train de parcourir. */}
            <small>
              {matches.length} sur {catalogue.length} · {selection.length}/{maximum} retenue{selection.length > 1 ? "s" : ""}
            </small>
          </div>

          <ul className="patho-picker-list">
            {matches.slice(0, 120).map((item) => {
              const chosen = selection.includes(item.code);
              return (
                <li key={item.code}>
                  <label className={chosen ? "chosen" : ""}>
                    <input
                      type="checkbox"
                      checked={chosen}
                      disabled={!chosen && full}
                      onChange={() => toggle(item.code)}
                    />
                    <span className="patho-picker-name">{item.label}</span>
                    <span className="patho-picker-family">{item.family}</span>
                  </label>
                </li>
              );
            })}
            {!matches.length ? <li className="patho-picker-empty">Aucune pathologie ne correspond.</li> : null}
          </ul>

          {full ? (
            <p className="patho-picker-note">
              Huit séries au maximum : au-delà, deux teintes de la palette ne se
              distinguent plus de façon sûre.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
