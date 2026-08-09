import { useMemo, useState } from "react";

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
  const [query, setQuery] = useState("");
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
      const selected = group.options.find((option) => option.code === value);
      const matches = groupMatches
        ? group.options
        : group.options.filter((option) => normalize(option.label).includes(needle));
      const visible = selected && !matches.some((option) => option.code === selected.code)
        ? [selected, ...matches]
        : matches;
      return visible.length ? [{ ...group, options: visible }] : [];
    });
  }, [groups, query, value]);

  const resultCount = filteredGroups.reduce((sum, group) => sum + group.options.length, 0);

  return <div className="searchable-cause-select">
    <div className="cause-search-row">
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchLabel}
      />
      {query ? <button type="button" onClick={() => setQuery("")} aria-label="Effacer la recherche">×</button> : null}
    </div>
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={selectLabel}>
      {allOption ? <option value={allOption.code}>{allOption.label}</option> : null}
      {filteredGroups.map((group) => <optgroup key={group.label} label={group.label}>
        {group.options.map((option) => <option value={option.code} key={option.code}>{option.label}</option>)}
      </optgroup>)}
    </select>
    <small>{query ? `${resultCount} résultat${resultCount > 1 ? "s" : ""}` : `${options.length} ${itemLabel}`}</small>
  </div>;
}
