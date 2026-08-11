/** Choisir les entités qu'on met en regard.
 *
 *  Pathologies, CSP et Mortalité posent la même question — « lesquelles
 *  mettre en regard ? » — et la posaient chacune à leur façon. Un seul
 *  sélecteur, sur le modèle de `SeriesPicker` de DAMIR : un résumé sur une
 *  ligne, une liste qui s'ouvre **dans le flux**, une recherche, et un maximum
 *  assumé.
 *
 *  L'ordre du catalogue appartient à l'appelant. Sur 118 pathologies, le
 *  classement par poids n'est pas un détail : les proposer dans l'ordre de la
 *  nomenclature demande de connaître la nomenclature. Sur 35 catégories
 *  socioprofessionnelles, la nomenclature *est* l'ordre utile.
 */

import { useEffect, useMemo, useRef, useState } from "react";
export type EntityOption = {
  code: string;
  label: string;
  /** Le rattachement affiché en regard : famille de pathologies, niveau de
   *  nomenclature, chapitre de causes. */
  group: string;
};

type Props = {
  catalogue: EntityOption[];
  selection: string[];
  onChange: (codes: string[]) => void;
  /** Au-delà, la palette catégorielle ne sépare plus les teintes de façon sûre. */
  maximum: number;
  /** Le mot de l'appelant : « pathologie », « catégorie », « cause ». */
  noun: string;
  nounPlural: string;
};

export function EntityPicker({ catalogue, selection, onChange, maximum, noun, nounPlural }: Props) {
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
      || item.group.toLocaleLowerCase("fr-FR").includes(needle));
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
          {!selection.length ? <span className="patho-picker-chip empty">Aucune sélection</span> : null}
        </div>
        <button
          type="button"
          className={`patho-picker-toggle ${open ? "open" : ""}`}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >Modifier</button>
      </div>

      {open ? (
        <div className="patho-picker-panel" ref={panel} role="dialog" aria-label={`Choisir les ${nounPlural}`}>
          <div className="patho-picker-search">
            <input
              ref={input}
              type="search"
              value={query}
              placeholder={`Rechercher une ${noun}…`}
              aria-label={`Rechercher une ${noun}`}
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
                    <span className="patho-picker-family">{item.group}</span>
                  </label>
                </li>
              );
            })}
            {!matches.length ? <li className="patho-picker-empty">Aucune {noun} ne correspond.</li> : null}
          </ul>

          {full ? (
            <p className="patho-picker-note">
              {maximum} séries au maximum : au-delà, deux teintes de la palette
              ne se distinguent plus de façon sûre.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
