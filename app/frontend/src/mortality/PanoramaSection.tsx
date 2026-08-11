/** Une cause de décès, trois angles.
 *
 *  Trois et non quatre : **il n'y a pas de lecture Territoire**, et ce n'est pas
 *  un oubli. Le CépiDc publie des effectifs nationaux ; il n'existe ni découpage
 *  régional ni population de référence permettant un taux par habitant. Une
 *  carte serait inventée. Les réserves du graphique le disent.
 */

import { useEffect, useMemo, useState } from "react";
import type { KpiItem } from "../components/KpiStrip";
import { ChartShell } from "../components/ChartShell";
import { useChartTokens } from "../charts/tokens";
import { formatKpi } from "../utils";
import { MORTALITY_READINGS, buildMortalityReadings, type MortalityReadingKey } from "./model";
import type { MortalitySectionProps } from "./section";
import type { MortalityOverview } from "../types";

type Props = MortalitySectionProps & {
  overview: MortalityOverview | null;
  loading: boolean;
};

export function PanoramaSection({
  metadata, year, population, measure, setMeasure, onOpenExtraction, routeVersion,
  overview, loading,
}: Props) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();

  const [reading, setReading] = useState<MortalityReadingKey>(() => {
    const raw = params.get("view");
    return MORTALITY_READINGS.some((item) => item.key === raw) ? raw as MortalityReadingKey : "evolution";
  });
  const [forms, setForms] = useState<Partial<Record<MortalityReadingKey, string>>>(() => {
    const next: Partial<Record<MortalityReadingKey, string>> = {};
    MORTALITY_READINGS.forEach((item) => {
      const raw = params.get(`form_${item.key}`);
      if (raw) next[item.key as MortalityReadingKey] = raw;
    });
    return next;
  });

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("view", reading);
    Object.entries(forms).forEach(([key, value]) => { if (value) next.set(`form_${key}`, value); });
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [reading, forms]);

  const populationLabel = metadata.populations.find((item) => item.code === population)?.label ?? "Ensemble";

  const readingInput = useMemo(
    () => ({ overview, measure, populationLabel, forms }),
    [overview, measure, populationLabel, forms],
  );
  const readings = useMemo(() => buildMortalityReadings({ ...readingInput, tokens }), [readingInput, tokens]);
  const current = readings.find((item) => item.key === reading) ?? readings[0];

  const visibleKpis = useMemo(() => {
    if (!overview) return [];
    const isAllCauses = overview.context.cause_label.toLocaleLowerCase("fr-FR") === "toutes causes";
    return overview.kpis
      .filter((kpi) => !(isAllCauses && (kpi.key === "share" || kpi.key === "total")))
      .map((kpi) => ({
        ...kpi,
        label: kpi.key === "deaths" ? (isAllCauses ? "Décès publiés" : "Décès pour cette cause")
          : kpi.key === "share" ? "Part parmi tous les décès"
            : kpi.key === "total" ? "Décès toutes causes" : kpi.label,
      }));
  }, [overview]);

  const kpiItems: KpiItem[] = visibleKpis.map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    detail: kpi.detail,
    // Seule l'évolution est une variation : elle seule porte un signe.
    value: formatKpi(kpi.value, kpi.kind, kpi.key === "evolution"),
  }));

  const sourceLine = `Source · ${metadata.source} · ${metadata.scope}`;
  const scope = `${overview?.context.cause_label ?? ""} · ${populationLabel} · ${overview?.context.year ?? year} · effectifs bruts, sans taux`;
  const openExtraction = () => onOpenExtraction(new URLSearchParams({
    source: "mortality", cause: overview?.context.cause ?? "", population,
    start_year: String(metadata.years[0] ?? year), end_year: String(year),
    dimensions: "year,cause,population", measures: "deaths,share",
  }));

  if (!overview || !current) return null;

  return <>
    <section className="mortality-title-line">
      <div>
        <span>LECTURE NATIONALE</span>
        <h2>{overview.context.cause_label}</h2>
        <small>{populationLabel} · {overview.context.year}</small>
      </div>
      <div className="mortality-title-actions">
        <span className="mortality-scope-chip">Effectifs bruts · sans taux</span>
        <button type="button" onClick={openExtraction}>Extraire</button>
      </div>
    </section>

    <ChartShell
      kicker={`Mortalité · ${populationLabel.toLowerCase()}`}
      title={current.title}
      readings={MORTALITY_READINGS}
      reading={reading}
      onReading={(key) => setReading(key as MortalityReadingKey)}
      forms={current.forms}
      form={current.form}
      onForm={(key) => setForms((value) => ({ ...value, [reading]: key }))}
      question={current.question}
      highlights={kpiItems}
      headerActions={
        <div className="pathology-toggle" aria-label="Mesure">
          <button type="button" className={measure === "deaths" ? "active" : ""}
            onClick={() => setMeasure("deaths")}>Nombre</button>
          <button type="button" className={measure === "share" ? "active" : ""}
            onClick={() => setMeasure("share")}>Part</button>
        </div>
      }
      height={current.height}
      option={current.option}
      exportOption={(palette) => buildMortalityReadings({ ...readingInput, tokens: palette })
        .find((item) => item.key === current.key)?.option ?? current.option!}
      empty={current.empty}
      loading={loading}
      ariaLabel={current.ariaLabel}
      tableColumns={current.table.columns}
      tableRows={current.table.rows}
      caveats={current.caveats}
      sourceLine={sourceLine}
      filenamePrefix="mortalite"
      scope={scope}
      onExtract={openExtraction}
      className="mortality-stage"
    />
  </>;
}
