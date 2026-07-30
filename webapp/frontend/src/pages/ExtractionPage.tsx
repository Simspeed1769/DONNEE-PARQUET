import { useEffect, useMemo, useState } from "react";
import { downloadCspExtraction, downloadExtraction, downloadMortalityExtraction, downloadPathologyExtraction, getCspExtractionPreview, getCspMetadata, getExtractionPreview, getMortalityExtractionPreview, getMortalityMetadata, getPathologyExtractionPreview, getPathologyMetadata } from "../api";
import { AdvancedFilterPanel } from "../components/AdvancedFilterPanel";
import { SearchableCauseSelect } from "../components/SearchableCauseSelect";
import type { CspExtractionRequest, CspMetadata, ExtractionPreview, ExtractionRequest, Metadata, MortalityExtractionRequest, MortalityMetadata, PathologyExtractionRequest, PathologyMetadata } from "../types";
import { filtersFromSearch, writeFilters } from "../utils";

type ExtractionSource = "damir" | "pathologies" | "csp" | "mortality";
type Props = { metadata: Metadata; routeVersion: number; onSourceChange?: (source: ExtractionSource) => void };
const PREVIEW_PAGE_SIZE = 40;

function formatCell(value: string | number | null, kind: string): string {
  if (value === null || value === undefined) return "—";
  if (typeof value !== "number") return String(value);
  if (kind === "money") return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
  if (kind === "percent") return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(value)} %`;
  if (kind === "quantity") return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value);
  return String(value);
}

export function ExtractionPage({ metadata, routeVersion, onSourceChange }: Props) {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const requestedSource = initialParams.get("source");
  const [source, setSource] = useState<ExtractionSource>(requestedSource === "pathologies" || requestedSource === "csp" || requestedSource === "mortality" ? requestedSource : "damir");
  const [filters, setFilters] = useState(() => filtersFromSearch(metadata, initialParams));
  const [dimensions, setDimensions] = useState(() => initialParams.get("dimensions")?.split(",").filter(Boolean) ?? ["year", "sex", "region"]);
  const [measures, setMeasures] = useState(() => initialParams.get("measures")?.split(",").filter(Boolean) ?? ["reimbursed"]);
  const [preview, setPreview] = useState<ExtractionPreview | null>(null);
  const [previewPage, setPreviewPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pathologyMetadata, setPathologyMetadata] = useState<PathologyMetadata | null>(null);
  const [pathologyFamily, setPathologyFamily] = useState("");
  const [pathologyGroup, setPathologyGroup] = useState("__family__");
  const [pathologyTop, setPathologyTop] = useState(initialParams.get("top") ?? "");
  const [pathologyStartYear, setPathologyStartYear] = useState(Number(initialParams.get("start_year")) || 2015);
  const [pathologyEndYear, setPathologyEndYear] = useState(Number(initialParams.get("end_year")) || 2024);
  const [pathologyDimensions, setPathologyDimensions] = useState<string[]>(["year", "sex", "region"]);
  const [pathologyMeasures, setPathologyMeasures] = useState<string[]>(["patients", "prevalence"]);
  const [cspMetadata, setCspMetadata] = useState<CspMetadata | null>(null);
  const [cspLevel, setCspLevel] = useState<"groupe_6" | "categorie_29">(initialParams.get("level") === "categorie_29" ? "categorie_29" : "groupe_6");
  const [cspCode, setCspCode] = useState(initialParams.get("csp") ?? "3");
  const [cspDimensions, setCspDimensions] = useState<string[]>(["region", "age", "sex"]);
  const [cspMeasures, setCspMeasures] = useState<string[]>(["effectif", "share"]);
  const [mortalityMetadata, setMortalityMetadata] = useState<MortalityMetadata | null>(null);
  const [mortalityCause, setMortalityCause] = useState(initialParams.get("cause") ?? "__all__");
  const [mortalityPopulation, setMortalityPopulation] = useState(initialParams.get("population") ?? "__all__");
  const [mortalityStartYear, setMortalityStartYear] = useState(Number(initialParams.get("start_year")) || 2015);
  const [mortalityEndYear, setMortalityEndYear] = useState(Number(initialParams.get("end_year")) || 2024);
  const [mortalityDimensions, setMortalityDimensions] = useState<string[]>(requestedSource === "mortality" ? initialParams.get("dimensions")?.split(",").filter(Boolean) ?? ["year", "cause", "population"] : ["year", "cause", "population"]);
  const [mortalityMeasures, setMortalityMeasures] = useState<string[]>(requestedSource === "mortality" ? initialParams.get("measures")?.split(",").filter(Boolean) ?? ["deaths", "share"] : ["deaths", "share"]);

  const damirRequest = useMemo<ExtractionRequest>(() => ({
    ...filters,
    dimensions,
    measures,
    limit: 500,
  }), [filters, dimensions, measures]);

  const pathologyRequest = useMemo<PathologyExtractionRequest>(() => ({
    top: pathologyTop,
    start_year: pathologyStartYear,
    end_year: pathologyEndYear,
    dimensions: pathologyDimensions,
    measures: pathologyMeasures,
    limit: 500,
  }), [pathologyTop, pathologyStartYear, pathologyEndYear, pathologyDimensions, pathologyMeasures]);

  const cspRequest = useMemo<CspExtractionRequest>(() => ({
    year: 2023,
    level: cspLevel,
    csp_code: cspCode,
    dimensions: cspDimensions,
    measures: cspMeasures,
    limit: 500,
  }), [cspLevel, cspCode, cspDimensions, cspMeasures]);

  const mortalityRequest = useMemo<MortalityExtractionRequest>(() => ({
    start_year: mortalityStartYear,
    end_year: mortalityEndYear,
    cause: mortalityCause,
    population: mortalityPopulation,
    dimensions: mortalityDimensions,
    measures: mortalityMeasures,
    limit: 500,
  }), [mortalityStartYear, mortalityEndYear, mortalityCause, mortalityPopulation, mortalityDimensions, mortalityMeasures]);

  useEffect(() => {
    const controller = new AbortController();
    getPathologyMetadata(controller.signal)
      .then((next) => {
        setPathologyMetadata(next);
        const flattened = next.families.flatMap((family) => [
          { code: family.code, label: family.label, family: family.label, group: "__family__" },
          ...family.groups.flatMap((group) => [
            { code: group.code, label: group.label, family: family.label, group: group.code },
            ...group.pathologies.map((pathology) => ({ ...pathology, family: family.label, group: group.code })),
          ]),
        ]);
        const selected = flattened.find((item) => item.code === pathologyTop)
          ?? flattened.find((item) => item.label.toLocaleLowerCase("fr").includes("diab"))
          ?? flattened[0];
        if (selected) {
          setPathologyFamily(selected.family);
          setPathologyGroup(selected.group);
          setPathologyTop(selected.code);
        }
        if (!next.years.includes(pathologyStartYear)) setPathologyStartYear(next.years[0]);
        if (!next.years.includes(pathologyEndYear)) setPathologyEndYear(next.default_year);
      })
      .catch(() => null);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getCspMetadata(controller.signal)
      .then((next) => {
        setCspMetadata(next);
        const selectedLevel = next.levels.find((item) => item.key === cspLevel) ?? next.levels[0];
        const fallback = selectedLevel.options.find((item) => item.code === (cspLevel === "groupe_6" ? "3" : "38")) ?? selectedLevel.options[0];
        if (!selectedLevel.options.some((item) => item.code === cspCode)) setCspCode(fallback.code);
      })
      .catch(() => null);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    getMortalityMetadata(controller.signal)
      .then((next) => {
        setMortalityMetadata(next);
        if (!next.years.includes(mortalityStartYear)) setMortalityStartYear(next.years[0]);
        if (!next.years.includes(mortalityEndYear)) setMortalityEndYear(next.default_year);
        if (mortalityCause !== "__all__" && !next.causes.some((item) => item.code === mortalityCause)) setMortalityCause("__all__");
        if (mortalityPopulation !== "__all__" && !next.populations.some((item) => item.code === mortalityPopulation)) setMortalityPopulation("__all__");
      })
      .catch(() => null);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (source !== "damir") return;
    const params = new URLSearchParams();
    params.set("page", "extraction");
    params.set("source", "damir");
    writeFilters(params, filters);
    params.set("dimensions", dimensions.join(","));
    params.set("measures", measures.join(","));
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [source, filters, dimensions, measures]);

  useEffect(() => {
    if (source !== "pathologies" || !pathologyTop) return;
    const params = new URLSearchParams({
      page: "extraction", source: "pathologies", top: pathologyTop,
      start_year: String(pathologyStartYear), end_year: String(pathologyEndYear),
      dimensions: pathologyDimensions.join(","), measures: pathologyMeasures.join(","),
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [source, pathologyTop, pathologyStartYear, pathologyEndYear, pathologyDimensions, pathologyMeasures]);

  useEffect(() => {
    if (source !== "csp" || !cspCode) return;
    const params = new URLSearchParams({
      page: "extraction", source: "csp", year: "2023", level: cspLevel, csp: cspCode,
      dimensions: cspDimensions.join(","), measures: cspMeasures.join(","),
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [source, cspLevel, cspCode, cspDimensions, cspMeasures]);

  useEffect(() => {
    if (source !== "mortality") return;
    const params = new URLSearchParams({
      page: "extraction", source: "mortality", cause: mortalityCause, population: mortalityPopulation,
      start_year: String(mortalityStartYear), end_year: String(mortalityEndYear),
      dimensions: mortalityDimensions.join(","), measures: mortalityMeasures.join(","),
    });
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [source, mortalityCause, mortalityPopulation, mortalityStartYear, mortalityEndYear, mortalityDimensions, mortalityMeasures]);

  useEffect(() => {
    if (source !== "damir") return;
    if (!dimensions.length || !measures.length) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getExtractionPreview(damirRequest, controller.signal)
        .then((next) => { if (active) setPreview(next); })
        .catch((reason: Error) => {
          if (active && reason.name !== "AbortError") setError(reason.message);
        })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, damirRequest, dimensions.length, measures.length]);

  useEffect(() => {
    if (source !== "pathologies" || !pathologyTop) return;
    if (!pathologyDimensions.length || !pathologyMeasures.length || pathologyStartYear > pathologyEndYear) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getPathologyExtractionPreview(pathologyRequest, controller.signal)
        .then((next) => { if (active) setPreview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, pathologyRequest, pathologyTop, pathologyDimensions.length, pathologyMeasures.length, pathologyStartYear, pathologyEndYear]);

  useEffect(() => {
    if (source !== "csp" || !cspCode) return;
    if (!cspDimensions.length || !cspMeasures.length) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getCspExtractionPreview(cspRequest, controller.signal)
        .then((next) => { if (active) setPreview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, cspRequest, cspCode, cspDimensions.length, cspMeasures.length]);

  useEffect(() => {
    if (source !== "mortality") return;
    if (!mortalityDimensions.length || !mortalityMeasures.length || mortalityStartYear > mortalityEndYear) {
      setPreview(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      setError(null);
      getMortalityExtractionPreview(mortalityRequest, controller.signal)
        .then((next) => { if (active) setPreview(next); })
        .catch((reason: Error) => { if (active && reason.name !== "AbortError") setError(reason.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [source, mortalityRequest, mortalityDimensions.length, mortalityMeasures.length, mortalityStartYear, mortalityEndYear]);

  const toggle = (key: string, values: string[], setValues: (items: string[]) => void) => {
    setValues(values.includes(key) ? values.filter((item) => item !== key) : [...values, key]);
  };

  useEffect(() => setPreviewPage(0), [preview]);

  const chooseSource = (next: ExtractionSource) => {
    setSource(next);
    setPreview(null);
    onSourceChange?.(next);
  };

  const exportData = async (format: "csv" | "xlsx") => {
    if (source === "damir" && (!dimensions.length || !measures.length)) return;
    if (source === "pathologies" && (!pathologyDimensions.length || !pathologyMeasures.length || !pathologyTop)) return;
    if (source === "csp" && (!cspDimensions.length || !cspMeasures.length || !cspCode)) return;
    if (source === "mortality" && (!mortalityDimensions.length || !mortalityMeasures.length)) return;
    setExporting(format);
    setError(null);
    try {
      if (source === "damir") await downloadExtraction(format, damirRequest);
      else if (source === "pathologies") await downloadPathologyExtraction(format, pathologyRequest);
      else if (source === "csp") await downloadCspExtraction(format, cspRequest);
      else await downloadMortalityExtraction(format, mortalityRequest);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "L’export n’a pas pu être généré.");
    } finally {
      setExporting(null);
    }
  };

  const selectedPathologyFamily = pathologyMetadata?.families.find((item) => item.label === pathologyFamily) ?? null;
  const pathologyGroups = selectedPathologyFamily ? [
    { label: `Ensemble · ${selectedPathologyFamily.label}`, code: "__family__", top: selectedPathologyFamily.code },
    ...selectedPathologyFamily.groups.map((item) => ({ label: item.label, code: item.code, top: item.code })),
  ] : [];
  const selectedPathologyGroup = pathologyGroup === "__family__" ? null : selectedPathologyFamily?.groups.find((item) => item.code === pathologyGroup) ?? null;
  const pathologyOptions = selectedPathologyFamily ? (selectedPathologyGroup ? [
    { code: selectedPathologyGroup.code, label: `Ensemble · ${selectedPathologyGroup.label}` },
    ...selectedPathologyGroup.pathologies.filter((item) => item.code !== selectedPathologyGroup.code),
  ] : [{ code: selectedPathologyFamily.code, label: selectedPathologyFamily.label }]) : [];
  const homogeneousUnitSelected = filters.service_codes.length === 1 || dimensions.includes("service");
  const selectedCspLevel = cspMetadata?.levels.find((item) => item.key === cspLevel) ?? null;
  const cspOptions = selectedCspLevel?.options ?? [];
  const chooseCspLevel = (nextLevel: "groupe_6" | "categorie_29") => {
    setCspLevel(nextLevel);
    const next = cspMetadata?.levels.find((item) => item.key === nextLevel);
    const preferred = next?.options.find((item) => item.code === (nextLevel === "groupe_6" ? "3" : "38")) ?? next?.options[0];
    if (preferred) setCspCode(preferred.code);
  };
  const choosePathologyFamily = (nextFamily: string) => {
    setPathologyFamily(nextFamily);
    const selected = pathologyMetadata?.families.find((item) => item.label === nextFamily);
    if (selected) {
      setPathologyGroup("__family__");
      setPathologyTop(selected.code);
    }
  };
  const choosePathologyGroup = (nextGroup: string) => {
    setPathologyGroup(nextGroup);
    const selected = pathologyGroups.find((item) => item.code === nextGroup);
    if (selected) setPathologyTop(selected.top);
  };
  const previewPageCount = Math.max(1, Math.ceil((preview?.rows.length ?? 0) / PREVIEW_PAGE_SIZE));
  const visiblePreviewRows = preview?.rows.slice(
    previewPage * PREVIEW_PAGE_SIZE,
    (previewPage + 1) * PREVIEW_PAGE_SIZE,
  ) ?? [];
  const previewStart = previewPage * PREVIEW_PAGE_SIZE + 1;
  const previewEnd = Math.min((previewPage + 1) * PREVIEW_PAGE_SIZE, preview?.rows.length ?? 0);

  const previewPanel = <article className="preview-card panel">
    <div className="preview-header"><div><span className="section-kicker">Aperçu dynamique</span><h2>Base extraite</h2><p>{preview ? `${new Intl.NumberFormat("fr-FR").format(preview.total_rows)} lignes estimées dans le périmètre` : "Sélectionnez au moins une dimension et une mesure"}</p></div>{preview?.limited ? <span>Échantillon des 500 premières lignes</span> : null}</div>
    {preview && preview.total_rows > 250000 ? <div className="analysis-warnings"><span>ⓘ L’export dépasse 250 000 lignes. Réduisez le périmètre ou le nombre de dimensions avant de lancer le téléchargement.</span></div> : null}
    {error ? <div className="analysis-error"><strong>Impossible de générer l’aperçu</strong><span>{error}</span></div> : null}
    {loading ? <div className="preview-loading"><div className="skeleton" /></div> : preview?.rows.length ? (
      <>
        <div className="advanced-table-wrap" role="region" aria-label="Aperçu de la base extraite" tabIndex={0}>
          <table className="advanced-table"><caption className="sr-only">Aperçu paginé des données qui seront exportées</caption><thead><tr>{preview.columns.map((column) => <th scope="col" key={column.key}>{column.label}</th>)}</tr></thead><tbody>{visiblePreviewRows.map((row, index) => <tr key={`${previewPage}-${index}`}>{preview.columns.map((column) => <td key={column.key} title={formatCell(row[column.key], column.kind)} className={column.kind === "dimension" ? "" : "numeric"}>{formatCell(row[column.key], column.kind)}</td>)}</tr>)}</tbody></table>
        </div>
        <nav className="preview-pagination" aria-label="Pagination de l’aperçu"><span>Lignes {previewStart}–{previewEnd} sur {new Intl.NumberFormat("fr-FR").format(preview.rows.length)} affichables</span><div><button type="button" disabled={previewPage === 0} onClick={() => setPreviewPage((page) => Math.max(0, page - 1))}>← Précédent</button><strong>{previewPage + 1} / {previewPageCount}</strong><button type="button" disabled={previewPage >= previewPageCount - 1} onClick={() => setPreviewPage((page) => Math.min(previewPageCount - 1, page + 1))}>Suivant →</button></div></nav>
      </>
    ) : <div className="empty-extraction"><span>＋</span><strong>Votre base apparaîtra ici</strong><p>Ajoutez des dimensions et des mesures pour lancer l’agrégation.</p></div>}
  </article>;

  return (
    <div className="content-wrap extraction-page">
      <section className="hero analysis-hero">
        <div><div className="eyebrow"><span>Base sur mesure</span> Données agrégées</div><h1>Extraire</h1><p>Composez une base propre, estimez son volume et emportez avec Excel les définitions et le périmètre utilisés.</p><div className="extraction-source-switch"><button type="button" className={source === "damir" ? "active" : ""} onClick={() => chooseSource("damir")}>Dépenses DAMIR</button><button type="button" className={source === "pathologies" ? "active" : ""} onClick={() => chooseSource("pathologies")}>Pathologies</button><button type="button" className={source === "csp" ? "active" : ""} onClick={() => chooseSource("csp")}>CSP</button><button type="button" className={source === "mortality" ? "active" : ""} onClick={() => chooseSource("mortality")}>Mortalité</button></div></div>
        <div className="extraction-actions"><button type="button" onClick={() => exportData("csv")} disabled={Boolean(exporting) || !preview?.rows.length || preview.total_rows > 250000}>{exporting === "csv" ? "Préparation…" : "Exporter CSV"}</button><button className="primary" type="button" onClick={() => exportData("xlsx")} disabled={Boolean(exporting) || !preview?.rows.length || preview.total_rows > 250000}>{exporting === "xlsx" ? "Préparation…" : "Exporter Excel"}</button></div>
      </section>
      <div className={`extraction-loading-track ${loading ? "active" : ""}`} role="status" aria-label={loading ? "Aperçu en cours d’actualisation" : "Aperçu à jour"}><span /></div>

      {source === "damir" ? <div className="analysis-workspace extraction-workspace">
        <AdvancedFilterPanel metadata={metadata} value={filters} onChange={setFilters} />
        <section className="extraction-main">
          <article className="builder-card panel">
            <div className="builder-header"><div><span className="section-kicker">Structure de la base</span><h2>Choisir les colonnes</h2><p>Chaque croisement des dimensions forme une ligne ; chaque mesure devient une colonne.</p></div><span className="builder-count">{dimensions.length + measures.length} colonnes</span></div>
            <div className="builder-groups">
              <div><strong>Dimensions</strong><span>Comment découper la donnée</span><div className="choice-grid">{metadata.dimensions.map((item) => <button type="button" key={item.key} className={dimensions.includes(item.key) ? "selected" : ""} onClick={() => toggle(item.key, dimensions, setDimensions)}><i>{dimensions.includes(item.key) ? "✓" : "+"}</i>{item.label}</button>)}</div></div>
              <div><strong>Mesures</strong><span>Quels indicateurs calculer</span><div className="choice-grid measures-grid">{metadata.measures.map((item) => {
                const selected = measures.includes(item.key);
                const disabled = item.requires_homogeneous_unit && !homogeneousUnitSelected && !selected;
                return <button type="button" key={item.key} className={selected ? "selected" : ""} disabled={disabled} title={disabled ? "Sélectionnez une prestation ou ajoutez la dimension Prestation" : undefined} onClick={() => toggle(item.key, measures, setMeasures)}><i>{selected ? "✓" : "+"}</i>{item.label}{disabled ? " · prestation" : ""}</button>;
              })}</div></div>
            </div>
          </article>
          {previewPanel}
          <aside className="extraction-metadata-note"><strong>Excel auto-documenté</strong><span>Le fichier Excel contient désormais un onglet Métadonnées : source, période, filtres, définitions, formules et statut de consolidation.</span></aside>
        </section>
      </div> : source === "pathologies" ? <div className="pathology-extraction-workspace">
        <aside className="panel pathology-extraction-filters">
          <div><span className="section-kicker">Source</span><h2>Périmètre Pathologies</h2></div>
          <label><span>Niveau 1 · Famille</span><select value={pathologyFamily} onChange={(event) => choosePathologyFamily(event.target.value)}>{pathologyMetadata?.families.map((item) => <option key={item.label}>{item.label}</option>)}</select></label>
          <label><span>Niveau 2 · Catégorie</span><select value={pathologyGroup} onChange={(event) => choosePathologyGroup(event.target.value)}>{pathologyGroups.map((item) => <option value={item.code} key={`${item.code}-${item.label}`}>{item.label}</option>)}</select></label>
          <label><span>Niveau 3 · Détail</span><select value={pathologyTop} onChange={(event) => setPathologyTop(event.target.value)}>{pathologyOptions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
          <div className="pathology-period"><label><span>Début</span><select value={pathologyStartYear} onChange={(event) => setPathologyStartYear(Number(event.target.value))}>{pathologyMetadata?.years.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Fin</span><select value={pathologyEndYear} onChange={(event) => setPathologyEndYear(Number(event.target.value))}>{pathologyMetadata?.years.map((item) => <option key={item}>{item}</option>)}</select></label></div>
          <div className="pathology-extraction-quality"><strong>Secret statistique</strong><span>Les petits effectifs peuvent être masqués à la source.</span></div>
        </aside>
        <section className="extraction-main">
          <article className="builder-card panel">
            <div className="builder-header"><div><span className="section-kicker">Structure de la base</span><h2>Choisir les colonnes</h2><p>Les totaux nationaux sont utilisés lorsqu’une dimension n’est pas sélectionnée.</p></div><span className="builder-count">{pathologyDimensions.length + pathologyMeasures.length} colonnes</span></div>
            <div className="builder-groups">
              <div><strong>Dimensions</strong><span>Comment découper la population</span><div className="choice-grid">{pathologyMetadata?.dimensions.map((item) => <button type="button" key={item.key} className={pathologyDimensions.includes(item.key) ? "selected" : ""} onClick={() => toggle(item.key, pathologyDimensions, setPathologyDimensions)}><i>{pathologyDimensions.includes(item.key) ? "✓" : "+"}</i>{item.label}</button>)}</div></div>
              <div><strong>Mesures</strong><span>Quels indicateurs calculer</span><div className="choice-grid measures-grid">{pathologyMetadata?.measures.map((item) => <button type="button" key={item.key} className={pathologyMeasures.includes(item.key) ? "selected" : ""} onClick={() => toggle(item.key, pathologyMeasures, setPathologyMeasures)}><i>{pathologyMeasures.includes(item.key) ? "✓" : "+"}</i>{item.label}</button>)}</div></div>
            </div>
          </article>
          {previewPanel}
          <aside className="extraction-metadata-note"><strong>Source distincte</strong><span>L’export conserve la pathologie, le périmètre et la règle de masquage dans l’onglet Métadonnées.</span></aside>
        </section>
      </div> : source === "csp" ? <div className="pathology-extraction-workspace csp-extraction-workspace">
        <aside className="panel pathology-extraction-filters">
          <div><span className="section-kicker">Source</span><h2>Périmètre CSP</h2></div>
          <label><span>Niveau de lecture</span><select value={cspLevel} onChange={(event) => chooseCspLevel(event.target.value as "groupe_6" | "categorie_29")}><option value="groupe_6">6 grands groupes</option><option value="categorie_29">29 catégories détaillées</option></select></label>
          <label><span>CSP observée</span><select value={cspCode} onChange={(event) => setCspCode(event.target.value)}>{cspOptions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
          <div className="csp-extraction-year"><span>Millésime</span><strong>2023</strong></div>
          <div className="pathology-extraction-quality csp-extraction-quality"><strong>Champ Insee</strong><span>Actifs ayant un emploi · effectifs pondérés avec IPONDI.</span></div>
        </aside>
        <section className="extraction-main">
          <article className="builder-card panel">
            <div className="builder-header"><div><span className="section-kicker">Structure de la base</span><h2>Choisir les colonnes</h2><p>Chaque ligne décrit la CSP sélectionnée selon les découpages choisis.</p></div><span className="builder-count">{cspDimensions.length + cspMeasures.length} colonnes</span></div>
            <div className="builder-groups">
              <div><strong>Dimensions</strong><span>Comment découper la population</span><div className="choice-grid">{[{ key: "year", label: "Année" }, { key: "region", label: "Région" }, { key: "age", label: "Tranche d’âge" }, { key: "sex", label: "Sexe" }].map((item) => <button type="button" key={item.key} className={cspDimensions.includes(item.key) ? "selected" : ""} onClick={() => toggle(item.key, cspDimensions, setCspDimensions)}><i>{cspDimensions.includes(item.key) ? "✓" : "+"}</i>{item.label}</button>)}</div></div>
              <div><strong>Mesures</strong><span>Quels indicateurs calculer</span><div className="choice-grid measures-grid">{[{ key: "effectif", label: "Effectif pondéré" }, { key: "population", label: "Actifs en emploi" }, { key: "share", label: "Part de la CSP" }].map((item) => <button type="button" key={item.key} className={cspMeasures.includes(item.key) ? "selected" : ""} onClick={() => toggle(item.key, cspMeasures, setCspMeasures)}><i>{cspMeasures.includes(item.key) ? "✓" : "+"}</i>{item.label}</button>)}</div></div>
            </div>
          </article>
          {previewPanel}
          <aside className="extraction-metadata-note"><strong>Excel auto-documenté</strong><span>Le fichier conserve le champ de population, le niveau de CSP, la pondération et le millésime 2023 dans l’onglet Métadonnées.</span></aside>
        </section>
      </div> : <div className="pathology-extraction-workspace mortality-extraction-workspace">
        <aside className="panel pathology-extraction-filters">
          <div><span className="section-kicker">Source</span><h2>Périmètre Mortalité</h2></div>
          <label><span>Cause de décès</span><SearchableCauseSelect options={mortalityMetadata?.causes ?? []} value={mortalityCause} onChange={setMortalityCause} allOption={{ code: "__all__", label: "Toutes les causes disponibles" }} /></label>
          <label><span>Population publiée</span><select value={mortalityPopulation} onChange={(event) => setMortalityPopulation(event.target.value)}><option value="__all__">Tous les périmètres publiés</option>{mortalityMetadata?.populations.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}</select></label>
          <div className="pathology-period"><label><span>Début</span><select value={mortalityStartYear} onChange={(event) => setMortalityStartYear(Number(event.target.value))}>{mortalityMetadata?.years.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Fin</span><select value={mortalityEndYear} onChange={(event) => setMortalityEndYear(Number(event.target.value))}>{mortalityMetadata?.years.map((item) => <option key={item}>{item}</option>)}</select></label></div>
          <div className="pathology-extraction-quality mortality-extraction-quality"><strong>Effectifs bruts</strong><span>Aucun taux de mortalité n’est exporté tant que la population de référence Insee n’est pas intégrée.</span></div>
        </aside>
        <section className="extraction-main">
          <article className="builder-card panel">
            <div className="builder-header"><div><span className="section-kicker">Structure de la base</span><h2>Choisir les colonnes</h2><p>Une ligne correspond à un millésime, une cause et un périmètre de population publiés.</p></div><span className="builder-count">{mortalityDimensions.length + mortalityMeasures.length} colonnes</span></div>
            <div className="builder-groups">
              <div><strong>Dimensions</strong><span>Comment découper les décès</span><div className="choice-grid">{mortalityMetadata?.dimensions.map((item) => {
                const selected = mortalityDimensions.includes(item.key);
                const required = (item.key === "year" && mortalityStartYear !== mortalityEndYear)
                  || (item.key === "cause" && mortalityCause === "__all__")
                  || (item.key === "population" && mortalityPopulation === "__all__");
                return <button type="button" key={item.key} className={selected ? "selected" : ""} disabled={required && selected} title={required ? "Dimension nécessaire pour ce périmètre" : undefined} onClick={() => toggle(item.key, mortalityDimensions, setMortalityDimensions)}><i>{selected ? "✓" : "+"}</i>{item.label}{required ? " · requise" : ""}</button>;
              })}</div></div>
              <div><strong>Mesures</strong><span>Quels indicateurs exporter</span><div className="choice-grid measures-grid">{mortalityMetadata?.measures.map((item) => <button type="button" key={item.key} className={mortalityMeasures.includes(item.key) ? "selected" : ""} onClick={() => toggle(item.key, mortalityMeasures, setMortalityMeasures)}><i>{mortalityMeasures.includes(item.key) ? "✓" : "+"}</i>{item.label}</button>)}</div></div>
            </div>
          </article>
          {previewPanel}
          <aside className="extraction-metadata-note"><strong>Excel auto-documenté</strong><span>L’export conserve la source CépiDc, la période, le périmètre, les mesures et l’avertissement « effectifs non rapportés à une population ».</span></aside>
        </section>
      </div>}
    </div>
  );
}
