import { useEffect, useMemo, useState } from "react";
import { getHierarchy } from "../api";
import type { AdvancedFilters, HierarchyOptions, Metadata } from "../types";
import { yearStatusLabel } from "../utils";
import { ChoiceSelect } from "./ChoiceSelect";
import { MultiSelect } from "./MultiSelect";

type Props = {
  metadata: Metadata;
  value: AdvancedFilters;
  onChange: (value: AdvancedFilters) => void;
  hiddenFields?: FilterField[];
  disabledFields?: FilterField[];
};

export type FilterField = keyof AdvancedFilters;

const EMPTY_OPTIONS: HierarchyOptions = { posts: [], sub_posts: [], services: [] };

export function defaultAdvancedFilters(metadata: Metadata): AdvancedFilters {
  return {
    start_year: metadata.default_start_year,
    end_year: metadata.default_end_year,
    grand_post: null,
    post: null,
    sub_post: null,
    service_codes: [],
    sexes: [],
    ages: [],
    regions: [],
    insurances: [],
    envelopes: [],
    ald: null,
  };
}

export function AdvancedFilterPanel({ metadata, value, onChange, hiddenFields = [], disabledFields = [] }: Props) {
  const [options, setOptions] = useState<HierarchyOptions>(EMPTY_OPTIONS);
  const [optionsLoading, setOptionsLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsLoading(true);
    getHierarchy(value.grand_post, value.post, value.sub_post, controller.signal)
      .then(setOptions)
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") setOptions(EMPTY_OPTIONS);
      })
      .finally(() => setOptionsLoading(false));
    return () => controller.abort();
  }, [value.grand_post, value.post, value.sub_post]);

  const hidden = useMemo(() => new Set(hiddenFields), [hiddenFields]);
  const disabled = useMemo(() => new Set(disabledFields), [disabledFields]);

  const activeCount = useMemo(() => {
    let count = 0;
    if (!hidden.has("grand_post") && !disabled.has("grand_post") && value.grand_post) count += 1;
    if (!hidden.has("post") && !disabled.has("post") && value.post) count += 1;
    if (!hidden.has("sub_post") && !disabled.has("sub_post") && value.sub_post) count += 1;
    (["service_codes", "sexes", "ages", "regions", "insurances", "envelopes"] as FilterField[]).forEach((field) => {
      const values = value[field];
      if (!hidden.has(field) && !disabled.has(field) && Array.isArray(values) && values.length) count += 1;
    });
    if (!hidden.has("ald") && !disabled.has("ald") && value.ald !== null) count += 1;
    return count;
  }, [value, hidden, disabled]);

  const patch = (partial: Partial<AdvancedFilters>) => onChange({ ...value, ...partial });

  return (
    <aside className="advanced-filter-panel" aria-label="Filtres avancés">
      <div className="advanced-filter-heading">
        <div><span>Filtres</span><strong>Périmètre d’analyse</strong></div>
        {activeCount ? <button type="button" onClick={() => onChange(defaultAdvancedFilters(metadata))}>Réinitialiser</button> : null}
      </div>

      {!hidden.has("start_year") || !hidden.has("end_year") ? <section className="filter-section">
        <div className="filter-section-title"><strong>Période</strong></div>
        <div className="period-grid">
          {!hidden.has("start_year") ? <ChoiceSelect label="De" value={value.start_year} onChange={(start_year) => patch({ start_year })} options={metadata.years.filter((year) => year <= value.end_year).map((year) => ({ value: year, label: yearStatusLabel(metadata, year) }))} /> : null}
          {!hidden.has("end_year") ? <ChoiceSelect label="À" value={value.end_year} onChange={(end_year) => patch({ end_year })} options={metadata.years.filter((year) => year >= value.start_year).map((year) => ({ value: year, label: yearStatusLabel(metadata, year) }))} /> : null}
        </div>
      </section> : null}

      {!hidden.has("grand_post") || !hidden.has("post") || !hidden.has("sub_post") || !hidden.has("service_codes") ? <section className="filter-section">
        <div className="filter-section-title"><strong>Prestations</strong></div>
        {!hidden.has("grand_post") ? <ChoiceSelect label="Grand poste" disabled={disabled.has("grand_post")} value={value.grand_post ?? ""} onChange={(next) => patch({ grand_post: next || null, post: null, sub_post: null, service_codes: [] })} options={[{ value: "", label: "Tous les grands postes" }, ...metadata.grand_posts.map((item) => ({ value: item, label: item }))]} /> : null}
        {!hidden.has("post") ? <ChoiceSelect label="Poste" disabled={disabled.has("post") || !value.grand_post || optionsLoading} value={value.post ?? ""} onChange={(next) => patch({ post: next || null, sub_post: null, service_codes: [] })} options={[{ value: "", label: "Tout le grand poste" }, ...options.posts.map((item) => ({ value: item, label: item }))]} /> : null}
        {!hidden.has("sub_post") ? <ChoiceSelect label="Sous-poste" disabled={disabled.has("sub_post") || !value.post || optionsLoading} value={value.sub_post ?? ""} onChange={(next) => patch({ sub_post: next || null, service_codes: [] })} options={[{ value: "", label: "Tout le poste" }, ...options.sub_posts.map((item) => ({ value: item, label: item }))]} /> : null}
        {!hidden.has("service_codes") ? <MultiSelect
          label="Prestations précises"
          emptyLabel={optionsLoading ? "Chargement…" : "Tout le périmètre"}
          options={options.services.map((service) => ({ value: service.code, label: `${service.code} · ${service.label}` }))}
          value={value.service_codes}
          onChange={(service_codes) => patch({ service_codes })}
          disabled={disabled.has("service_codes")}
        /> : null}
      </section> : null}

      {(["sexes", "ages", "regions", "insurances", "envelopes", "ald"] as FilterField[]).some((field) => !hidden.has(field)) ? <section className="filter-section">
        <div className="filter-section-title"><strong>Population</strong></div>
        {!hidden.has("sexes") ? <MultiSelect label="Sexe" options={metadata.sexes.map((item) => ({ value: item.code, label: item.label }))} value={value.sexes} onChange={(sexes) => patch({ sexes })} disabled={disabled.has("sexes")} /> : null}
        {!hidden.has("ages") ? <MultiSelect label="Tranche d’âge" options={metadata.ages.map((item) => ({ value: item.code, label: item.label }))} value={value.ages} onChange={(ages) => patch({ ages })} disabled={disabled.has("ages")} /> : null}
        {!hidden.has("regions") ? <MultiSelect label="Territoire" options={metadata.regions.map((item) => ({ value: item.code, label: item.label }))} value={value.regions} onChange={(regions) => patch({ regions })} disabled={disabled.has("regions")} /> : null}
        {!hidden.has("insurances") ? <MultiSelect label="Nature d’assurance" options={metadata.insurances.map((item) => ({ value: item.code, label: item.label }))} value={value.insurances} onChange={(insurances) => patch({ insurances })} disabled={disabled.has("insurances")} /> : null}
        {!hidden.has("envelopes") ? <MultiSelect label="Enveloppe" options={metadata.envelopes.map((item) => ({ value: item.code, label: item.label }))} value={value.envelopes} onChange={(envelopes) => patch({ envelopes })} disabled={disabled.has("envelopes")} /> : null}
        {!hidden.has("ald") ? <ChoiceSelect label="Motif d’exonération" disabled={disabled.has("ald")} value={value.ald === null ? "" : String(value.ald)} onChange={(next) => patch({ ald: next === "" ? null : Number(next) })} options={[{ value: "", label: "Tous les motifs" }, { value: "1", label: "ALD" }, { value: "0", label: "Hors ALD" }]} /> : null}
      </section> : null}
    </aside>
  );
}
