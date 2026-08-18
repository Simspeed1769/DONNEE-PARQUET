import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { m } from "./motion";
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
  /** Champs à ranger derrière « Plus de filtres », fermé par défaut.
   *
   *  Le popover de série affichait ses six champs d'un coup, dans une boîte si
   *  haute qu'elle recouvrait le graphique. Les trois qu'on règle vraiment —
   *  Sexe, Tranche d'âge, Territoire — restent visibles ; les trois autres
   *  attendent qu'on les demande. Rien n'est retiré : c'est un pli, pas une
   *  suppression, et le nombre de filtres actifs qui s'y trouvent est écrit sur
   *  le bouton pour qu'un réglage caché ne s'oublie pas. */
  foldedFields?: FilterField[];
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

export function AdvancedFilterPanel({
  metadata, value, onChange, hiddenFields = [], disabledFields = [], foldedFields = [],
}: Props) {
  const [options, setOptions] = useState<HierarchyOptions>(EMPTY_OPTIONS);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [extraOpen, setExtraOpen] = useState(false);

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
  const folded = useMemo(
    () => new Set(foldedFields.filter((field) => !hidden.has(field))),
    [foldedFields, hidden]);

  /** Combien de filtres repliés sont actifs. Écrit sur le bouton : un réglage
   *  qu'on a posé puis refermé ne doit pas s'oublier. */
  const foldedActive = useMemo(() => {
    let count = 0;
    folded.forEach((field) => {
      const current = value[field];
      if (Array.isArray(current) ? current.length : current !== null && current !== undefined) count += 1;
    });
    return count;
  }, [folded, value]);

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

  /** Un champ, rendu par sa clé. La section le pose s'il est visible, le pli le
   *  pose s'il est replié — un champ n'est jamais écrit deux fois, et le
   *  déplacer d'un endroit à l'autre ne demande que de nommer sa clé. */
  const fieldNode = (field: FilterField) => {
    switch (field) {
      case "grand_post":
        return <ChoiceSelect key={field} label="Grand poste" disabled={disabled.has("grand_post")} value={value.grand_post ?? ""} onChange={(next) => patch({ grand_post: next || null, post: null, sub_post: null, service_codes: [] })} options={[{ value: "", label: "Tous les grands postes" }, ...metadata.grand_posts.map((item) => ({ value: item, label: item }))]} />;
      case "post":
        return <ChoiceSelect key={field} label="Poste" disabled={disabled.has("post") || !value.grand_post || optionsLoading} value={value.post ?? ""} onChange={(next) => patch({ post: next || null, sub_post: null, service_codes: [] })} options={[{ value: "", label: "Tout le grand poste" }, ...options.posts.map((item) => ({ value: item, label: item }))]} />;
      case "sub_post":
        return <ChoiceSelect key={field} label="Sous-poste" disabled={disabled.has("sub_post") || !value.post || optionsLoading} value={value.sub_post ?? ""} onChange={(next) => patch({ sub_post: next || null, service_codes: [] })} options={[{ value: "", label: "Tout le poste" }, ...options.sub_posts.map((item) => ({ value: item, label: item }))]} />;
      case "service_codes":
        return <MultiSelect key={field} label="Prestations précises" emptyLabel={optionsLoading ? "Chargement…" : "Tout le périmètre"} options={options.services.map((service) => ({ value: service.code, label: `${service.code} · ${service.label}` }))} value={value.service_codes} onChange={(service_codes) => patch({ service_codes })} disabled={disabled.has("service_codes")} />;
      case "sexes":
        return <MultiSelect key={field} label="Sexe" options={metadata.sexes.map((item) => ({ value: item.code, label: item.label }))} value={value.sexes} onChange={(sexes) => patch({ sexes })} disabled={disabled.has("sexes")} />;
      case "ages":
        return <MultiSelect key={field} label="Tranche d’âge" options={metadata.ages.map((item) => ({ value: item.code, label: item.label }))} value={value.ages} onChange={(ages) => patch({ ages })} disabled={disabled.has("ages")} />;
      case "regions":
        return <MultiSelect key={field} label="Territoire" options={metadata.regions.map((item) => ({ value: item.code, label: item.label }))} value={value.regions} onChange={(regions) => patch({ regions })} disabled={disabled.has("regions")} />;
      case "insurances":
        return <MultiSelect key={field} label="Nature d’assurance" options={metadata.insurances.map((item) => ({ value: item.code, label: item.label }))} value={value.insurances} onChange={(insurances) => patch({ insurances })} disabled={disabled.has("insurances")} />;
      case "envelopes":
        return <MultiSelect key={field} label="Enveloppe" options={metadata.envelopes.map((item) => ({ value: item.code, label: item.label }))} value={value.envelopes} onChange={(envelopes) => patch({ envelopes })} disabled={disabled.has("envelopes")} />;
      case "ald":
        return <ChoiceSelect key={field} label="Motif d’exonération" disabled={disabled.has("ald")} value={value.ald === null ? "" : String(value.ald)} onChange={(next) => patch({ ald: next === "" ? null : Number(next) })} options={[{ value: "", label: "Tous les motifs" }, { value: "1", label: "ALD" }, { value: "0", label: "Hors ALD" }]} />;
      default:
        return null;
    }
  };

  /** L'ordre du pli suit celui de l'écran : on retrouve les champs là où on
   *  s'attend à les lire, simplement plus bas. */
  const FOLD_ORDER: FilterField[] = [
    "grand_post", "post", "sub_post", "service_codes",
    "sexes", "ages", "regions", "insurances", "envelopes", "ald",
  ];
  const extraFields = <>{FOLD_ORDER.filter((field) => folded.has(field)).map(fieldNode)}</>;

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

      {(["grand_post", "post", "sub_post", "service_codes"] as FilterField[])
        .some((field) => !hidden.has(field) && !folded.has(field)) ? <section className="filter-section">
        <div className="filter-section-title"><strong>Prestations</strong></div>
        {!hidden.has("grand_post") && !folded.has("grand_post") ? <ChoiceSelect label="Grand poste" disabled={disabled.has("grand_post")} value={value.grand_post ?? ""} onChange={(next) => patch({ grand_post: next || null, post: null, sub_post: null, service_codes: [] })} options={[{ value: "", label: "Tous les grands postes" }, ...metadata.grand_posts.map((item) => ({ value: item, label: item }))]} /> : null}
        {!hidden.has("post") && !folded.has("post") ? <ChoiceSelect label="Poste" disabled={disabled.has("post") || !value.grand_post || optionsLoading} value={value.post ?? ""} onChange={(next) => patch({ post: next || null, sub_post: null, service_codes: [] })} options={[{ value: "", label: "Tout le grand poste" }, ...options.posts.map((item) => ({ value: item, label: item }))]} /> : null}
        {!hidden.has("sub_post") && !folded.has("sub_post") ? <ChoiceSelect label="Sous-poste" disabled={disabled.has("sub_post") || !value.post || optionsLoading} value={value.sub_post ?? ""} onChange={(next) => patch({ sub_post: next || null, service_codes: [] })} options={[{ value: "", label: "Tout le poste" }, ...options.sub_posts.map((item) => ({ value: item, label: item }))]} /> : null}
        {!hidden.has("service_codes") && !folded.has("service_codes") ? <MultiSelect
          label="Prestations précises"
          emptyLabel={optionsLoading ? "Chargement…" : "Tout le périmètre"}
          options={options.services.map((service) => ({ value: service.code, label: `${service.code} · ${service.label}` }))}
          value={value.service_codes}
          onChange={(service_codes) => patch({ service_codes })}
          disabled={disabled.has("service_codes")}
        /> : null}
      </section> : null}

      {(["sexes", "ages", "regions", "insurances", "envelopes", "ald"] as FilterField[])
        .some((field) => !hidden.has(field) && !folded.has(field)) ? <section className="filter-section">
        <div className="filter-section-title"><strong>Population</strong></div>
        {!hidden.has("sexes") && !folded.has("sexes") ? <MultiSelect label="Sexe" options={metadata.sexes.map((item) => ({ value: item.code, label: item.label }))} value={value.sexes} onChange={(sexes) => patch({ sexes })} disabled={disabled.has("sexes")} /> : null}
        {!hidden.has("ages") && !folded.has("ages") ? <MultiSelect label="Tranche d’âge" options={metadata.ages.map((item) => ({ value: item.code, label: item.label }))} value={value.ages} onChange={(ages) => patch({ ages })} disabled={disabled.has("ages")} /> : null}
        {!hidden.has("regions") && !folded.has("regions") ? <MultiSelect label="Territoire" options={metadata.regions.map((item) => ({ value: item.code, label: item.label }))} value={value.regions} onChange={(regions) => patch({ regions })} disabled={disabled.has("regions")} /> : null}
        {folded.size ? null : extraFields}
      </section> : null}

      {/* Le pli. Il n'existe que si l'appelant a nommé des champs à replier —
          l'écran d'Extraire, par exemple, les veut tous à plat. La hauteur est
          animée par Motion : `auto` ne s'anime pas en CSS, et c'est le seul
          endroit du produit où ça vaut la peine. */}
      {folded.size ? (
        <section className="filter-section filter-extra">
          <button
            type="button"
            className={`filter-extra-toggle ${extraOpen ? "open" : ""}`}
            aria-expanded={extraOpen}
            onClick={() => setExtraOpen((current) => !current)}
          >
            Plus de filtres
            {foldedActive ? <em>{foldedActive}</em> : null}
          </button>
          <AnimatePresence initial={false}>
            {extraOpen ? (
              <m.div
                className="filter-extra-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                {extraFields}
              </m.div>
            ) : null}
          </AnimatePresence>
        </section>
      ) : null}
    </aside>
  );
}
