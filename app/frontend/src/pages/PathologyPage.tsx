import { useEffect, useMemo, useState } from "react";
import { getPathologyMetadata, getPathologyOverview } from "../api";
import { MultiSelect } from "../components/MultiSelect";
import { PageHero } from "../components/PageHero";
import type { KpiItem } from "../components/KpiStrip";
import { ChartShell } from "../components/ChartShell";
import { paletteParams, readPalette } from "../charts/palette";
import { formatKpi } from "../utils";
import { SearchableCauseSelect } from "../components/SearchableCauseSelect";
import { useChartTokens } from "../charts/tokens";
import { PATHOLOGY_READINGS, buildPathologyReadings, type PathologyReadingKey } from "../pathologies/model";
import type { PathologyMetadata, PathologyOverview } from "../types";

const SOURCE_LINE = "Source · Cartographie des pathologies, Cnam · Traitement Forsides";
/** Au-delà, la palette catégorielle ne sépare plus les teintes de façon sûre. */
const MAX_COMPARED = 6;

type Props = {
  routeVersion: number;
  onOpenExtraction: (params: URLSearchParams) => void;
  onOpenMethodology: () => void;
};

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
  const [measure, setMeasure] = useState<"patients" | "prevalence">(
    initialParams.get("measure") === "patients" ? "patients" : "prevalence",
  );
  const [reading, setReading] = useState<PathologyReadingKey>(() => {
    const raw = initialParams.get("view");
    return PATHOLOGY_READINGS.some((item) => item.key === raw) ? raw as PathologyReadingKey : "evolution";
  });
  const [forms, setForms] = useState<Partial<Record<PathologyReadingKey, string>>>(() => {
    const next: Partial<Record<PathologyReadingKey, string>> = {};
    PATHOLOGY_READINGS.forEach((item) => {
      const raw = initialParams.get(`form_${item.key}`);
      if (raw) next[item.key as PathologyReadingKey] = raw;
    });
    return next;
  });
  /** Les autres pathologies mises en regard sur la lecture « Pathologies ». */
  const [comparedCodes, setComparedCodes] = useState<string[]>(() => {
    const raw = initialParams.get("compare");
    return raw ? raw.split("~").filter(Boolean) : [];
  });
  const [compared, setCompared] = useState<Array<{ code: string; label: string; overview: PathologyOverview }>>([]);
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
        if (selected) { setFamily(selected.family); setGroupKey(selected.group); setTop(selected.code); }
        if (!year || !next.years.includes(year)) setYear(next.default_year);
        if (!next.regions.some((item) => item.code === region)) setRegion("99");
        if (!next.ages.some((item) => item.code === age)) setAge("tsage");
        if (!next.sexes.some((item) => item.code === sex)) setSex("tous sexes");
      })
      .catch((reason: Error) => {
        if (reason.name !== "AbortError") { setError(reason.message); setLoading(false); }
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

  /** Le catalogue plat, pour choisir une pathologie à comparer. */
  const catalogue = useMemo(() => (metadata?.families ?? []).flatMap((familyItem) => [
    { code: familyItem.code, label: familyItem.label },
    ...familyItem.groups.flatMap((group) => [
      { code: group.code, label: group.label },
      ...group.pathologies.map((item) => ({ code: item.code, label: item.label })),
    ]),
  ]), [metadata]);

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
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [top, year, region, age, sex]);

  /* — Les pathologies comparées : une requête chacune, en parallèle —
     Le serveur ne sait renvoyer qu'une fiche à la fois ; les mettre en regard
     est donc un assemblage côté écran, comme le fait déjà Comparer sur DAMIR. */
  useEffect(() => {
    if (!year || !comparedCodes.length) { setCompared([]); return; }
    const controller = new AbortController();
    let active = true;
    Promise.all(comparedCodes.map((code) =>
      getPathologyOverview(code, year, { region, age, sex }, controller.signal)
        .then((next) => ({
          code,
          label: catalogue.find((item) => item.code === code)?.label ?? next.context.label,
          overview: next,
        }))))
      .then((rows) => { if (active) setCompared(rows); })
      .catch((reason: Error) => { if (active && reason.name !== "AbortError") setCompared([]); });
    return () => { active = false; controller.abort(); };
  }, [comparedCodes, year, region, age, sex, catalogue]);

  // La pathologie de la fiche ouvre toujours la comparaison : sans elle, on
  // comparerait des voisines sans le sujet.
  useEffect(() => {
    if (reading !== "compare" || !top) return;
    setComparedCodes((current) => (current.includes(top) ? current : [top, ...current].slice(0, MAX_COMPARED)));
  }, [reading, top]);

  useEffect(() => {
    if (!top || !year) return;
    const params = new URLSearchParams({
      page: "pathologies", top, year: String(year), region, age, sex, measure, view: reading,
      // Cet écran réécrit son adresse de bout en bout : sans ce report, il
      // effacerait le choix de couleur et « Copier le lien » ne le restituerait
      // pas.
      ...paletteParams(readPalette()),
    });
    if (comparedCodes.length) params.set("compare", comparedCodes.join("~"));
    Object.entries(forms).forEach(([key, value]) => { if (value) params.set(`form_${key}`, value); });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [top, year, region, age, sex, measure, reading, forms, comparedCodes]);

  const chooseFamily = (nextFamily: string) => {
    setFamily(nextFamily);
    const selected = metadata?.families.find((item) => item.label === nextFamily);
    if (selected) { setGroupKey("__family__"); setTop(selected.code); }
  };
  const chooseGroup = (nextGroup: string) => {
    setGroupKey(nextGroup);
    const selected = groupOptions.find((item) => item.code === nextGroup);
    if (selected) setTop(selected.top);
  };

  const regionLabel = metadata?.regions.find((item) => item.code === region)?.label ?? region;
  const sexLabel = metadata?.sexes.find((item) => item.code === sex)?.label ?? sex;

  const readingInput = useMemo(() => ({
    overview, compared, measure, regionLabel, isFrance: region === "99", hiddenTerritories, forms,
  }), [overview, compared, measure, regionLabel, region, hiddenTerritories, forms]);
  const readings = useMemo(() => buildPathologyReadings({ ...readingInput, tokens }), [readingInput, tokens]);
  const current = readings.find((item) => item.key === reading) ?? readings[0];

  /** Le ratio femmes / hommes est une phrase, pas un nombre : sur la bande il
   *  poussait les contrôles du graphique à la ligne. Il descend donc dans le
   *  tiroir « Valeurs », où une phrase a sa place. */
  const sexRatio = (overview?.kpis ?? []).find((kpi) => kpi.key === "sex_ratio")?.detail ?? null;

  const kpiItems: KpiItem[] = (overview?.kpis ?? []).filter((kpi) => kpi.key !== "sex_ratio").map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    // Seule l'évolution est une variation : elle seule porte un signe.
    value: kpi.key === "sex_ratio" ? kpi.detail : formatKpi(kpi.value, kpi.kind, kpi.key === "evolution"),
    detail: kpi.detail,
    sentence: kpi.key === "sex_ratio",
  }));

  const territoryOptions = overview?.territories.map((item) => ({ value: item.code, label: item.label })) ?? [];
  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    page: "extraction", source: "pathologies", top,
    start_year: String(metadata?.years[0] ?? 2015), end_year: String(year),
  }));
  const scope = `${overview?.context.label ?? ""} · ${regionLabel} · ${selectedAgeLabel} · ${sexLabel} · millésime ${year}`;

  if (!metadata && loading) return <div className="content-wrap pathology-page"><div className="page-loader"><div className="skeleton" /></div></div>;

  return <div className="content-wrap pathology-page">
    <PageHero
      variant="pathology-hero"
      eyebrowLabel="Cartographie Cnam"
      eyebrowDetail="Populations"
      title="Pathologies"
      mission="Une fiche chiffrée pour situer une pathologie dans le temps, les âges et les territoires."
      action={<button type="button" className="method-link" onClick={onOpenMethodology}>Données & méthode →</button>}
    />

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

    {overview && current ? <>
      <section className="pathology-title-line"><div><span>{overview.context.family}</span><h2>{overview.context.label}</h2><small>{regionLabel} · {selectedAgeLabel} · {sexLabel}</small></div><button type="button" onClick={openExtraction}>Extraire les données →</button></section>

      <ChartShell
        kicker={`Pathologies · ${overview.context.label}`}
        title={current.title}
        readings={PATHOLOGY_READINGS}
        reading={reading}
        onReading={(key) => setReading(key as PathologyReadingKey)}
        forms={current.forms}
        form={current.form}
        onForm={(key) => setForms((value) => ({ ...value, [reading]: key }))}
        question={current.question}
        highlights={kpiItems}
        headerActions={<div className="pathology-toggle" aria-label="Mesure"><button type="button" className={measure === "prevalence" ? "active" : ""} onClick={() => setMeasure("prevalence")}>Prévalence</button><button type="button" className={measure === "patients" ? "active" : ""} onClick={() => setMeasure("patients")}>Patients</button></div>}
        beforeChart={
          current.key === "territory" ? (
            <div className="pathology-detail-toolbar">
              <span className="quality-badge">
                {overview.quality.masked_cells
                  ? `${overview.quality.masked_cells} cellules masquées par la Cnam`
                  : "Aucune cellule masquée par la Cnam"}
              </span>
              <button type="button" className="masking-help" aria-label="Pourquoi certaines données sont-elles masquées ?" data-tooltip="Masquage appliqué par la source Cnam : pour protéger la confidentialité, les effectifs strictement inférieurs à 10 patients ne sont pas publiés.">?</button>
              <MultiSelect label="Territoires retirés" emptyLabel="Aucun" options={territoryOptions} value={hiddenTerritories} onChange={setHiddenTerritories} />
            </div>
          ) : current.key === "compare" ? (
            <div className="pathology-detail-toolbar">
              <span className="quality-badge">{compared.length} pathologie{compared.length > 1 ? "s" : ""} comparée{compared.length > 1 ? "s" : ""}</span>
              <div className="pathology-compare-add">
                <SearchableCauseSelect
                  options={catalogue.filter((item) => !comparedCodes.includes(item.code))}
                  value=""
                  onChange={(code) => setComparedCodes((codes) => (codes.length >= MAX_COMPARED ? codes : [...codes, code]))}
                  groupedDetails={false}
                  searchPlaceholder="Ajouter une pathologie…"
                  searchLabel="Ajouter une pathologie à comparer"
                  selectLabel="Ajouter une pathologie"
                  itemLabel="pathologies disponibles"
                />
              </div>
              <div className="pathology-compare-chips" role="list">
                {compared.map((item) => (
                  <span key={item.code} className="pathology-compare-chip" role="listitem">
                    {item.label}
                    <button type="button" onClick={() => setComparedCodes((codes) => codes.filter((code) => code !== item.code))} aria-label={`Retirer ${item.label}`} disabled={compared.length <= 1}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          ) : null
        }
        height={current.height}
        option={current.option}
        exportOption={(t) => buildPathologyReadings({ ...readingInput, tokens: t })
          .find((item) => item.key === current.key)?.option ?? current.option!}
        empty={current.empty}
        loading={loading}
        ariaLabel={current.ariaLabel}
        tableNote={sexRatio ? `Ratio femmes / hommes : ${sexRatio}.` : undefined}
        tableColumns={current.table.columns}
        tableRows={current.table.rows}
        caveats={current.caveats}
        sourceLine={SOURCE_LINE}
        filenamePrefix="pathologies"
        scope={scope}
        onExtract={openExtraction}
        className="pathology-stage"
      />

      <footer className="pathology-footer"><span>{SOURCE_LINE}</span><button type="button" onClick={openExtraction}>Extraire</button></footer>
    </> : null}
  </div>;
}
