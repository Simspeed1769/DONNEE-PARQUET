import { useEffect, useMemo, useState } from "react";
import { getPathologyMetadata, getPathologyOverview } from "../api";
import { MultiSelect } from "../components/MultiSelect";
import { EChart } from "../charts/EChart";
import { useChartTokens } from "../charts/tokens";
import { ageSexOption, evolutionOption, territoryRankOption } from "../pathologies/charts";
import type { PathologyMetadata, PathologyOverview } from "../types";

type Props = {
  routeVersion: number;
  onOpenExtraction: (params: URLSearchParams) => void;
  onOpenMethodology: () => void;
};

function formatKpi(value: number | null, kind: string): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (kind === "quantity") return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
  if (kind === "percent") return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1, signDisplay: "exceptZero" }).format(value)} %`;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} ×`;
}

export function PathologyPage({ routeVersion, onOpenExtraction, onOpenMethodology }: Props) {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const [metadata, setMetadata] = useState<PathologyMetadata | null>(null);
  const [family, setFamily] = useState("");
  const [groupKey, setGroupKey] = useState("__family__");
  const [top, setTop] = useState(initialParams.get("top") ?? "");
  const [year, setYear] = useState(Number(initialParams.get("year")) || 0);
  const [region, setRegion] = useState(initialParams.get("region") ?? "99");
  const [age, setAge] = useState(initialParams.get("age") ?? "tsage");
  const [sex, setSex] = useState(initialParams.get("sex") ?? "tous sexes");
  const [hiddenTerritories, setHiddenTerritories] = useState<string[]>([]);
  const [showMaskedDetails, setShowMaskedDetails] = useState(false);
  const [measure, setMeasure] = useState<"patients" | "prevalence">("prevalence");
  const [detailView, setDetailView] = useState<"profile" | "territories">("profile");
  const [overview, setOverview] = useState<PathologyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const tokens = useChartTokens();

  useEffect(() => {
    const controller = new AbortController();
    getPathologyMetadata(controller.signal)
      .then((next) => {
        setMetadata(next);
        const flattened = next.families.flatMap((familyItem) => [
          { code: familyItem.code, label: familyItem.label, family: familyItem.label, group: "__family__" },
          ...familyItem.groups.flatMap((group) => [
            { code: group.code, label: group.label, family: familyItem.label, group: group.code },
            ...group.pathologies.map((pathology) => ({ ...pathology, family: familyItem.label, group: group.code })),
          ]),
        ]);
        const selected = flattened.find((item) => item.code === top)
          ?? flattened.find((item) => item.label.toLocaleLowerCase("fr").includes("diab"))
          ?? flattened[0];
        if (selected) {
          setFamily(selected.family);
          setGroupKey(selected.group);
          setTop(selected.code);
        }
        if (!year || !next.years.includes(year)) setYear(next.default_year);
        if (!next.regions.some((item) => item.code === region)) setRegion("99");
        if (!next.ages.some((item) => item.code === age)) setAge("tsage");
        if (!next.sexes.some((item) => item.code === sex)) setSex("tous sexes");
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") {
          setError(reason.message);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, []);

  const selectedFamily = metadata?.families.find((item) => item.label === family) ?? null;
  const groupOptions = selectedFamily ? [
    { label: `Ensemble · ${selectedFamily.label}`, code: "__family__", top: selectedFamily.code },
    ...selectedFamily.groups.map((item) => ({ label: item.label, code: item.code, top: item.code })),
  ] : [];
  const selectedGroup = groupKey === "__family__" ? null : selectedFamily?.groups.find((item) => item.code === groupKey) ?? null;
  const pathologyOptions = selectedFamily ? (selectedGroup ? [
    { code: selectedGroup.code, label: `Ensemble · ${selectedGroup.label}` },
    ...selectedGroup.pathologies.filter((item) => item.code !== selectedGroup.code),
  ] : [{ code: selectedFamily.code, label: selectedFamily.label }]) : [];
  const selectedAgeLabel = metadata?.ages.find((item) => item.code === age)?.label;

  useEffect(() => {
    if (!top || !year) return;
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getPathologyOverview(top, year, { region, age, sex }, controller.signal)
        .then((next) => { if (active) setOverview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    const params = new URLSearchParams({ page: "pathologies", top, year: String(year), region, age, sex });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [top, year, region, age, sex]);

  const chooseFamily = (nextFamily: string) => {
    setFamily(nextFamily);
    const selected = metadata?.families.find((item) => item.label === nextFamily);
    if (selected) {
      setGroupKey("__family__");
      setTop(selected.code);
    }
  };

  const chooseGroup = (nextGroup: string) => {
    setGroupKey(nextGroup);
    const selected = groupOptions.find((item) => item.code === nextGroup);
    if (selected) setTop(selected.top);
  };

  const kind = measure === "patients" ? "quantity" : "percent";
  const currentRegionLabel = metadata?.regions.find((item) => item.code === region)?.label ?? "Périmètre sélectionné";
  const evolution = useMemo(() => evolutionOption({
    years: overview?.annual.map((item) => item.year) ?? [],
    values: overview?.annual.map((item) => (measure === "patients" ? item.patients : item.prevalence)) ?? [],
    regionLabel: currentRegionLabel,
    franceYears: region !== "99" && measure === "prevalence" ? overview?.france_annual.map((item) => item.year) : undefined,
    franceValues: region !== "99" && measure === "prevalence" ? overview?.france_annual.map((item) => item.prevalence) : undefined,
    filled: region === "99",
    kind,
    tokens,
  }), [overview, measure, region, currentRegionLabel, kind, tokens]);

  const ageProfile = useMemo(() => {
    const ages = [...new Set(overview?.age_sex.map((item) => item.age) ?? [])];
    const valuesFor = (sex: string) => ages.map((ageLabel) =>
      overview?.age_sex.find((item) => item.age === ageLabel && item.sex === sex)?.prevalence ?? null);
    return ageSexOption({
      ages,
      femmes: valuesFor("femmes"),
      hommes: valuesFor("hommes"),
      highlightLabel: age === "tsage" ? null : (selectedAgeLabel ?? null),
      kind: "percent",
      tokens,
    });
  }, [overview, age, selectedAgeLabel, tokens]);

  const territories = useMemo(() => {
    const france = overview?.france_reference.prevalence ?? null;
    const visible = [...(overview?.territories ?? [])]
      .filter((item): item is typeof item & { prevalence: number } => item.code !== "99" && item.prevalence !== null && Number.isFinite(item.prevalence))
      .filter((item) => !hiddenTerritories.includes(item.code));
    const rows = visible.map((item) => ({
      code: item.code, label: item.label, value: item.prevalence,
      patients: item.patients, maskedCells: item.masked_cells, totalCells: item.total_cells,
    }));
    const height = Math.max(460, Math.min(540, visible.length * 24 + 120));
    return { option: territoryRankOption({ rows, ownRegion: region, franceValue: france, showMaskedDetails, kind: "percent", tokens }), height };
  }, [overview, hiddenTerritories, region, showMaskedDetails, tokens]);

  const openExtraction = () => {
    const params = new URLSearchParams({ page: "extraction", source: "pathologies", top,
      start_year: String(metadata?.years[0] ?? 2015), end_year: String(year) });
    onOpenExtraction(params);
  };
  const territoryOptions = overview?.territories.map((item) => ({ value: item.code, label: item.label })) ?? [];
  const regionLabel = metadata?.regions.find((item) => item.code === region)?.label ?? region;
  const sexLabel = metadata?.sexes.find((item) => item.code === sex)?.label ?? sex;

  if (!metadata && loading) return <div className="content-wrap pathology-page"><div className="page-loader"><div className="skeleton" /></div></div>;

  return <div className="content-wrap pathology-page">
    <section className="hero pathology-hero"><div><div className="eyebrow"><span>Cartographie Cnam</span> Populations</div><h1>Pathologies</h1><p>Une fiche chiffrée pour situer une pathologie dans le temps, les âges et les territoires.</p></div><button type="button" className="method-link" onClick={onOpenMethodology}>Données & méthode →</button></section>

    <section className="panel pathology-context">
      <div className="pathology-hierarchy-row">
        <label><span>Niveau 1 · Famille</span><select value={family} onChange={(event) => chooseFamily(event.target.value)}>{metadata?.families.map((item) => <option key={item.label}>{item.label}</option>)}</select></label>
        <label><span>Niveau 2 · Catégorie</span><select value={groupKey} onChange={(event) => chooseGroup(event.target.value)}>{groupOptions.map((item) => <option value={item.code} key={`${item.code}-${item.label}`}>{item.label}</option>)}</select></label>
        <label><span>Niveau 3 · Détail</span><select value={top} onChange={(event) => setTop(event.target.value)}>{pathologyOptions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
        <label><span>Année</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{metadata?.years.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <div className="pathology-population-row">
        <label><span>Région de la fiche</span><select value={region} onChange={(event) => setRegion(event.target.value)}>{metadata?.regions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
        <label><span>Âge</span><select value={age} onChange={(event) => setAge(event.target.value)}>{metadata?.ages.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
        <label><span>Sexe</span><select value={sex} onChange={(event) => setSex(event.target.value)}>{metadata?.sexes.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
      </div>
      <div className={`pathology-loading-track ${loading ? "active" : ""}`}><span /></div>
    </section>

    {error ? <div className="analysis-error"><strong>La fiche n’a pas pu être calculée</strong><span>{error}</span></div> : null}

    {overview ? <>
      <section className="pathology-title-line"><div><span>{overview.context.family}</span><h2>{overview.context.label}</h2><small>{regionLabel} · {selectedAgeLabel} · {sexLabel}</small></div><button type="button" onClick={openExtraction}>Extraire les données →</button></section>
      <section className="pathology-kpis">{overview.kpis.map((kpi) => <article className="panel" key={kpi.key}><span>{kpi.label}</span><strong className={kpi.key === "sex_ratio" ? "ratio-sentence" : ""}>{kpi.key === "sex_ratio" ? kpi.detail : formatKpi(kpi.value, kpi.kind)}</strong>{kpi.key !== "sex_ratio" ? <small>{kpi.detail}</small> : null}</article>)}</section>

      <section className="pathology-grid">
        <article className="panel pathology-chart pathology-evolution"><header><div><span className="section-kicker">Évolution</span><h3>Trajectoire nationale</h3></div><div className="pathology-toggle"><button className={measure === "prevalence" ? "active" : ""} onClick={() => setMeasure("prevalence")}>Prévalence</button><button className={measure === "patients" ? "active" : ""} onClick={() => setMeasure("patients")}>Patients</button></div></header><EChart option={evolution} height={390} stale={loading} ariaLabel={`Trajectoire nationale · ${overview.context.label} · ${measure === "patients" ? "patients" : "prévalence"}`} /></article>
        <article className="panel pathology-chart pathology-detail-view">
          <header><div><span className="section-kicker">Vue complémentaire</span><h3>{detailView === "profile" ? "Prévalence par âge et sexe" : "Prévalence par territoire"}</h3></div><div className="pathology-toggle" aria-label="Vue complémentaire"><button className={detailView === "profile" ? "active" : ""} onClick={() => setDetailView("profile")}>Profil</button><button className={detailView === "territories" ? "active" : ""} onClick={() => setDetailView("territories")}>Territoires</button></div></header>
          {detailView === "profile" ? <EChart option={ageProfile} height={440} stale={loading} ariaLabel={`Prévalence par âge et sexe · ${overview.context.label}`} /> : <>
            <div className="pathology-detail-toolbar"><span className="quality-badge">Valeurs observées</span><div className="masking-control"><button type="button" className={`masked-details-toggle ${showMaskedDetails ? "active" : ""}`} aria-pressed={showMaskedDetails} onClick={() => setShowMaskedDetails((value) => !value)}>{showMaskedDetails ? "Masquage affiché" : "Afficher le masquage"}</button><button type="button" className="masking-help" aria-label="Pourquoi certaines données sont-elles masquées ?" data-tooltip="Masquage appliqué par la source Cnam : pour protéger la confidentialité, les effectifs strictement inférieurs à 10 patients ne sont pas publiés.">?</button></div><MultiSelect label="Territoires retirés" emptyLabel="Aucun" options={territoryOptions} value={hiddenTerritories} onChange={setHiddenTerritories} /></div>
            {showMaskedDetails ? <div className="territory-quality-line"><strong>{overview.quality.masked_cells ? `${overview.quality.masked_cells} cellules masquées par la source Cnam` : "Aucune cellule masquée par la source Cnam"}</strong><span>Effectifs strictement inférieurs à 10 non publiés par la Cnam.</span><span>Une prévalence absente reste absente et n’est jamais remplacée par 0.</span>{overview.quality.unavailable_territories ? <span>{overview.quality.unavailable_territories} territoire(s) sans prévalence sont exclus.</span> : null}</div> : null}
            <EChart option={territories.option} height={territories.height} stale={loading} ariaLabel={`Prévalence par territoire · ${overview.context.label}`} />
          </>}
        </article>
      </section>
      <footer className="pathology-footer"><span>Source · Cartographie des pathologies, Cnam · Traitement Forsides</span><button type="button" onClick={openExtraction}>Extraire</button></footer>
    </> : null}
  </div>;
}
