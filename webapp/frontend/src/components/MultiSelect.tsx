type Option<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  label: string;
  options: Option<T>[];
  value: T[];
  onChange: (value: T[]) => void;
  emptyLabel?: string;
  disabled?: boolean;
  disabledLabel?: string;
};

export function MultiSelect<T extends string | number>({ label, options, value, onChange, emptyLabel = "Tous", disabled = false, disabledLabel = "Indisponible" }: Props<T>) {
  const toggle = (option: T) => {
    onChange(value.includes(option) ? value.filter((item) => item !== option) : [...value, option]);
  };

  return (
    <details className={`multi-select ${disabled ? "is-disabled" : ""}`}>
      <summary aria-disabled={disabled} onClick={(event) => { if (disabled) event.preventDefault(); }}>
        <span>{label}</span>
        <strong>{disabled ? disabledLabel : value.length ? `${value.length} sélectionné${value.length > 1 ? "s" : ""}` : emptyLabel}</strong>
      </summary>
      {!disabled ? <div className="multi-popover">
        <div className="multi-actions">
          <span>{options.length} choix disponibles</span>
          {value.length ? <button type="button" onClick={() => onChange([])}>Tout effacer</button> : null}
        </div>
        <div className="multi-options">
          {options.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={value.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </div> : null}
    </details>
  );
}
