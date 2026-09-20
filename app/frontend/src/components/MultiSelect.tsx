import { useId, useMemo, useState } from "react";

type Option<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  label: string;
  options: Option<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  emptyLabel?: string;
  disabled?: boolean;
  disabledLabel?: string;
  /** Un champ de recherche en tête de la liste. Utile dès que les choix se
   *  comptent en dizaines : les prestations d'un poste en ont jusqu'à 139, et
   *  tout DAMIR 1 342 — impossible d'y retrouver un code sans le taper. */
  searchable?: boolean;
  searchPlaceholder?: string;
};

/** Compare sans accent ni casse : « rééducation » trouve « REEDUC ABDO ». */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function MultiSelect<T extends string | number>({
  label, options, value, onChange, emptyLabel = "Tous", disabled = false, disabledLabel = "Indisponible",
  searchable = false, searchPlaceholder = "Code ou mot du libellé…",
}: Props<T>) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const toggle = (option: T) => {
    onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option]);
  };

  // Chaque mot tapé doit se retrouver dans le libellé (qui porte le code) :
  // « 3152 » comme « rachis opere » aboutissent, dans l'ordre du poids.
  const visible = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    return options.filter((option) => {
      const haystack = fold(option.label);
      return words.every((word) => haystack.includes(word));
    });
  }, [options, query]);

  const selectedHidden = value.filter((item) => !visible.some((option) => option.value === item)).length;

  return (
    <details className={`multi-select ${disabled ? "is-disabled" : ""}`}>
      <summary aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }}>
        <span>{label}</span>
        <strong>{disabled ? disabledLabel : value.length ? `${value.length} sélectionné${value.length > 1 ? "s" : ""}` : emptyLabel}</strong>
      </summary>
      {!disabled ? <div className="multi-popover">
        {searchable ? (
          <div className="multi-search">
            <label htmlFor={inputId} className="sr-only">Rechercher dans {label}</label>
            <input
              id={inputId}
              type="search"
              value={query}
              placeholder={searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Escape" && query) { event.preventDefault(); setQuery(""); } }}
            />
          </div>
        ) : null}
        <div className="multi-actions">
          <span>
            {query ? `${visible.length} sur ${options.length}` : `${options.length} choix disponibles`}
            {selectedHidden ? ` · ${selectedHidden} sélectionné${selectedHidden > 1 ? "s" : ""} hors liste` : ""}
          </span>
          {value.length ? <button type="button" onClick={() => onChange([])}>Tout effacer</button> : null}
        </div>
        <div className="multi-options">
          {visible.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={value.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {query && !visible.length ? (
            <p className="multi-empty">
              Aucune prestation ne correspond dans ce périmètre. Élargissez le poste ou le grand poste pour chercher plus loin.
            </p>
          ) : null}
        </div>
      </div> : null}
    </details>
  );
}
