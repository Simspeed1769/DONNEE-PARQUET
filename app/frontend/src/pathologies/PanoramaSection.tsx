/** Une pathologie, quatre angles.
 *
 *  C'est le pendant exact du Panorama de DAMIR : un sujet choisi dans la
 *  hiérarchie Famille → Catégorie → Détail, quatre lectures — Évolution,
 *  Territoire, Âge, Sexe — et les formes que le modèle juge licites.
 *
 *  Les réserves propres à la source restent : le masquage Cnam sous dix
 *  patients est affiché et chiffré, jamais comblé ; la courbe France sert de
 *  repère dès qu'une région est choisie ; une prévalence absente reste absente.
 */

import { useEffect, useMemo, useState } from "react";
import { getPathologyOverview } from "../api";
import { MultiSelect } from "../components/MultiSelect";
import type { KpiItem } from "../components/KpiStrip";
import { ChartShell } from "../components/ChartShell";
import { useChartTokens } from "../charts/tokens";
import { formatKpi } from "../utils";
import { PATHOLOGY_READINGS, buildPathologyReadings, type PathologyReadingKey } from "./model";
import { SOURCE_LINE, scopeLabel, type PathologySectionProps } from "./section";
import type { PathologyOverview } from "../types";

type Props = PathologySectionProps & {
  /** La pathologie affichée : la coquille la porte, pour qu'un passage à
   *  Comparer et retour retrouve le même sujet. */
  top: string;
  setTop: (code: string) => void;
};

export function PanoramaSection({
  metadata, year, region, age, sex, measure, setMeasure, onOpenExtraction, routeVersion,
  top, setTop,
}: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();

  const [family, setFamily] = useState("");
  const [groupKey, setGroupKey] = useState("__family__");
  const [hiddenTerritories, setHiddenTerritories] = useState<string[]>([]);
  const [overview, setOverview] = useState<PathologyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reading, setReading] = useState<PathologyReadingKey>(() => {
    const raw = params.get("view");
    return PATHOLOGY_READINGS.some((item) => item.key === raw) ? raw as PathologyReadingKey : "evolution";
  });
  const [forms, setForms] = useState<Partial<Record<PathologyReadingKey, string>>>(() => {
    const next: Partial<Record<PathologyReadingKey, string>> = {};
    PATHOLOGY_READINGS.forEach((item) => {
      const raw = params.get(`form_${item.key}`);
      if (raw) next[item.key as PathologyReadingKey] = raw;
    });
    return next;
  });

  /* — La hiérarchie se recale sur la pathologie affichée — */

  const flattened = useMemo(() => metadata.families.flatMap((familyItem) => [
    { code: familyItem.code, label: familyItem.label, family: familyItem.label, group: "__family__" },
    ...familyItem.groups.flatMap((group) => [
      { code: group.code, label: group.label, family: familyItem.label, group: group.code },
      ...group.pathologies.map((item) => ({
        code: item.code, label: item.label, family: familyItem.label, group: group.code,
      })),
    ]),
  ]), [metadata]);

  // La pathologie peut venir d'ailleurs — de l'adresse, ou d'un clic depuis
  // Comparer : les trois listes se replacent dessus plutôt que de la contredire.
  useEffect(() => {
    const found = flattened.find((item) => item.code === top);
    if (found) { setFamily(found.family); setGroupKey(found.group); }
  }, [top, flattened]);

  const selectedFamily = metadata.families.find((item) => item.label === family) ?? null;
  const groupOptions = selectedFamily ? [
    { label: `Ensemble · ${selectedFamily.label}`, code: "__family__", top: selectedFamily.code },
    ...selectedFamily.groups.map((item) => ({ label: item.label, code: item.code, top: item.code })),
  ] : [];
  const selectedGroup = groupKey === "__family__"
    ? null
    : selectedFamily?.groups.find((item) => item.code === groupKey) ?? null;
  const pathologyOptions = selectedFamily ? (selectedGroup ? [
    { code: selectedGroup.code, label: `Ensemble · ${selectedGroup.label}` },
    ...selectedGroup.pathologies.filter((item) => item.code !== selectedGroup.code),
  ] : [{ code: selectedFamily.code, label: selectedFamily.label }]) : [];

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

  // La lecture et la forme vivent dans l'adresse, comme partout ailleurs.
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("view", reading);
    Object.entries(forms).forEach(([key, value]) => { if (value) next.set(`form_${key}`, value); });
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [reading, forms]);

  const regionLabel = metadata.regions.find((item) => item.code === region)?.label ?? region;
  const scope = `${overview?.context.label ?? ""} · ${scopeLabel(metadata, year, region, age, sex)}`;

  const readingInput = useMemo(() => ({
    overview, measure, regionLabel, isFrance: region === "99", hiddenTerritories, forms,
  }), [overview, measure, regionLabel, region, hiddenTerritories, forms]);
  const readings = useMemo(() => buildPathologyReadings({ ...readingInput, tokens }), [readingInput, tokens]);
  const current = readings.find((item) => item.key === reading) ?? readings[0];

  /** Une phrase, pas un nombre : sur la bande elle poussait les contrôles du
   *  graphique à la ligne. */
  const sexRatio = (overview?.kpis ?? []).find((kpi) => kpi.key === "sex_ratio")?.detail ?? null;
  const kpiItems: KpiItem[] = (overview?.kpis ?? [])
    .filter((kpi) => kpi.key !== "sex_ratio")
    .map((kpi) => ({
      key: kpi.key,
      label: kpi.label,
      // Seule l'évolution est une variation : elle seule porte un signe.
      value: formatKpi(kpi.value, kpi.kind, kpi.key === "evolution"),
      detail: kpi.detail,
    }));

  const territoryOptions = overview?.territories.map((item) => ({ value: item.code, label: item.label })) ?? [];
  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    page: "extraction", source: "pathologies", top,
    start_year: String(metadata.years[0] ?? 2015), end_year: String(year),
  }));

  return <>
    <section className="panel pathology-context">
      <div className="pathology-hierarchy-row">
        <label><span>Niveau 1 · Famille</span>
          <select value={family} onChange={(event) => {
            const next = metadata.families.find((item) => item.label === event.target.value);
            if (next) { setFamily(next.label); setGroupKey("__family__"); setTop(next.code); }
          }}>
            {metadata.families.map((item) => <option key={item.label}>{item.label}</option>)}
          </select>
        </label>
        <label><span>Niveau 2 · Catégorie</span>
          <select value={groupKey} onChange={(event) => {
            const next = groupOptions.find((item) => item.code === event.target.value);
            if (next) { setGroupKey(next.code); setTop(next.top); }
          }}>
            {groupOptions.map((item) => <option value={item.code} key={`${item.code}-${item.label}`}>{item.label}</option>)}
          </select>
        </label>
        <label><span>Niveau 3 · Détail</span>
          <select value={top} onChange={(event) => setTop(event.target.value)}>
            {pathologyOptions.map((item) => <option value={item.code} key={item.code}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <div className={`pathology-loading-track ${loading ? "active" : ""}`}><span /></div>
    </section>

    {error ? <div className="analysis-error"><strong>La fiche n’a pas pu être calculée</strong><span>{error}</span></div> : null}

    {overview && current ? <>
      <section className="pathology-title-line">
        <div>
          <span>{overview.context.family}</span>
          <h2>{overview.context.label}</h2>
          <small>{scopeLabel(metadata, year, region, age, sex)}</small>
        </div>
        <button type="button" onClick={openExtraction}>Extraire les données →</button>
      </section>

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
        headerActions={
          <div className="pathology-toggle" aria-label="Mesure">
            <button type="button" className={measure === "prevalence" ? "active" : ""}
              onClick={() => setMeasure("prevalence")}>Prévalence</button>
            <button type="button" className={measure === "patients" ? "active" : ""}
              onClick={() => setMeasure("patients")}>Patients</button>
          </div>
        }
        beforeChart={current.key === "territory" ? (
          <div className="pathology-detail-toolbar">
            <span className="quality-badge">
              {overview.quality.masked_cells
                ? `${overview.quality.masked_cells} cellules masquées par la Cnam`
                : "Aucune cellule masquée par la Cnam"}
            </span>
            <button type="button" className="masking-help"
              aria-label="Pourquoi certaines données sont-elles masquées ?"
              data-tooltip="Masquage appliqué par la source Cnam : pour protéger la confidentialité, les effectifs strictement inférieurs à 10 patients ne sont pas publiés.">?</button>
            <MultiSelect label="Territoires retirés" emptyLabel="Aucun"
              options={territoryOptions} value={hiddenTerritories} onChange={setHiddenTerritories} />
          </div>
        ) : null}
        height={current.height}
        option={current.option}
        exportOption={(palette) => buildPathologyReadings({ ...readingInput, tokens: palette })
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
    </> : null}
  </>;
}
