/** Un choix parmi plusieurs, sans liste déroulante native.
 *
 *  Le pendant à un seul choix de `MultiSelect`, dont il reprend la mécanique :
 *  un `<details>` qui ouvre son panneau **dans le flux**, des options qui sont
 *  des éléments de la page, et des couleurs qui viennent toutes des jetons.
 *
 *  **Pourquoi ne pas garder `<select>`.** Le menu d'une liste déroulante native
 *  est dessiné par le système, hors de la page : il ignore `theme.css`, reste
 *  blanc en thème sombre, et ne se met pas à la typographie du reste. Le champ
 *  lui-même était par ailleurs forcé en blanc par une règle de `styles.css`.
 *  Là où l'utilisateur règle un périmètre — le tiroir des séries, le panneau de
 *  filtres — c'est ce composant qui sert.
 */

import { useRef } from "react";

export type Choice<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  label: string;
  options: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Le texte affiché quand la valeur courante ne figure pas dans la liste —
   *  une hiérarchie encore en cours de chargement, par exemple. */
  emptyLabel?: string;
};

export function ChoiceSelect<T extends string | number>({
  label, options, value, onChange, disabled = false, emptyLabel = "—",
}: Props<T>) {
  const holder = useRef<HTMLDetailsElement | null>(null);
  const current = options.find((option) => option.value === value);

  const pick = (next: T) => {
    onChange(next);
    if (holder.current) holder.current.open = false;
  };

  return (
    <details className={`choice-select ${disabled ? "is-disabled" : ""}`} ref={holder}>
      <summary aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }}>
        <span>{label}</span>
        <strong>{current?.label ?? emptyLabel}</strong>
      </summary>
      {!disabled ? (
        <div className="choice-popover" role="listbox" aria-label={label}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "chosen" : ""}
              onClick={() => pick(option.value)}
            >
              <i aria-hidden="true">{option.value === value ? "✓" : ""}</i>
              <span>{option.label}</span>
            </button>
          ))}
          {!options.length ? <p className="choice-empty">Aucun choix disponible.</p> : null}
        </div>
      ) : null}
    </details>
  );
}
