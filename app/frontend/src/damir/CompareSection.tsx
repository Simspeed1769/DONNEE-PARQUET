/** Comparer, sans avoir à choisir d'abord son outil.
 *
 *  Cette section fusionne ce qui vivait dans deux écrans séparés — comparer
 *  des prestations entre elles, composer une comparaison libre — en une seule
 *  question posée dans l'ordre où elle se pose réellement : **selon quoi**
 *  compare-t-on (une dimension du cube, ou rien de systématique), **quelles
 *  modalités** met-on en regard, et **avec quelle forme** ça se lit.
 *
 *  Le choix technique qui rend ça possible : achever `SeriesPicker` et
 *  `seriesScope.ts` plutôt que de porter la mécanique séparée de l'ancienne
 *  comparaison libre. Leurs props de périmètre par série existaient déjà,
 *  simplement éteintes (`allowScopes={false}`) par l'ancien écran de
 *  comparaison des prestations. Elles servent enfin : n'importe quelle série
 *  — issue d'une modalité ou composée librement — peut porter son propre jeu
 *  de filtres complet, affiché en gris sous son nom.
 *
 *  « Comparer selon : Année » est le point d'entrée le plus simple : aucune
 *  modalité à choisir, une seule série de départ sur le périmètre commun,
 *  qu'on étoffe avec des séries libres si la question l'exige. C'est très
 *  exactement l'état initial de l'ancienne comparaison libre — nommé, plutôt
 *  qu'implicite.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { runExplore, type ExploreRequest } from "../api";
import { ScopeBar } from "../components/ScopeBar";
import { EChart, type EChartsOption } from "../charts/EChart";
import { buildOption, pieOption, type ChartForm, type ChartSeries } from "../charts/buildOption";
import { paletteColor, useChartTokens, type ChartTokens } from "../charts/tokens";
import { SeriesPicker } from "../explore/SeriesPicker";
import {
  applyReading, assignColorSlots, periodValueOf, rankedKeys, readingKind,
  readingUnitLabel, selectSeries, valuesOf,
  type ExploreMeasure, type ExploreResponse, type ExploreSeries, type Reading,
} from "../explore/model";
import { isFree, newFreeKey, scopeChips, type SeriesScope } from "../explore/seriesScope";
import { csvFromRows, formatValue, writeFilters } from "../utils";
import { ExportPngButton } from "../components/ExportPngButton";
import { SOURCE_LINE } from "../panorama/exportSlide";
import type { SectionProps } from "./PanoramaSection";

type BreakdownKey = "grand_post" | "post" | "sub_post" | "service" | "region" | "age" | "sex" | "year";

/** `field` est ce qu'on envoie à `/api/explore` ; `null` pour Année, qui
 *  n'est pas une dimension du serveur — elle demande simplement de ne pas en
 *  choisir une, et l'axe du temps reste l'axe du temps. */
const BREAKDOWNS: Array<{ key: BreakdownKey; label: string; field: string | null }> = [
  { key: "grand_post", label: "Grands postes", field: "grand_post" },
  { key: "post", label: "Postes", field: "post" },
  { key: "sub_post", label: "Sous-postes", field: "sub_post" },
  { key: "service", label: "Prestations", field: "service" },
  { key: "region", label: "Région", field: "region" },
  { key: "age", label: "Âge", field: "age" },
  { key: "sex", label: "Sexe", field: "sex" },
  { key: "year", label: "Année", field: null },
];

type ViewKey = "line" | "bar" | "rank" | "index" | "change" | "pie"
  | "shareArea" | "diverging" | "heatmap";

type View = {
  key: ViewKey;
  label: string;
  form: ChartForm;
  reading: Reading;
  needsAdditive?: boolean;
  /** Forme qui compose un tout à partir des séries : elle ment dès qu'elles ne
   *  portent pas sur la même population. */
  cumulative?: boolean;
  /** Nombre d'années sous lequel la forme n'a rien à montrer : une déformation
   *  dans le temps demande au moins deux points, un écart aussi. */
  needsYears?: number;
  /** Nombre de séries sous lequel la forme est moins lisible que celles qu'elle
   *  remplacerait : une carte de chaleur à deux lignes est un tableau. */
  needsSeries?: number;
  question: string;
};

/** Les six vues de l'ancienne comparaison des prestations, reprises telles
 *  quelles : l'empilement de l'ancienne comparaison libre n'y figurait pas,
 *  il ne revient pas ici non plus. */
const VIEWS: View[] = [
  { key: "line", label: "Courbes", form: "line", reading: "value", question: "Combien, et comment cela évolue-t-il ?" },
  { key: "bar", label: "Barres", form: "bar", reading: "value", question: "Combien, année par année ?" },
  { key: "rank", label: "Classement", form: "rank", reading: "value", question: "Laquelle pèse le plus ?" },
  { key: "index", label: "Base 100", form: "line", reading: "index", question: "Laquelle progresse le plus vite, quelle que soit sa taille ?" },
  { key: "change", label: "Variation", form: "bar", reading: "change", question: "De combien chacune varie-t-elle d'une année sur l'autre ?" },
  { key: "pie", label: "Camembert", form: "pie", reading: "value", needsAdditive: true, cumulative: true, question: "Comment le total se partage-t-il ?" },
  // « Aires 100 % » promettrait un empilement qui remplit la hauteur ; les
  // séries retenues ne pèsent qu'une partie du total, et le reste n'est pas
  // dessiné quand « Autres » est masqué. Le nom dit donc la forme, et l'axe dit
  // la part.
  { key: "shareArea", label: "Aires empilées", form: "shareArea", reading: "share", needsAdditive: true, cumulative: true, needsYears: 2, question: "Comment le partage du total se déforme-t-il d’une année à l’autre ?" },
  { key: "diverging", label: "Écarts", form: "diverging", reading: "value", needsYears: 2, question: "Qui progresse, qui recule sur la période ?" },
  { key: "heatmap", label: "Carte de chaleur", form: "heatmap", reading: "value", needsYears: 2, needsSeries: 4, question: "Où et quand est-ce le plus fort ?" },
];

const MAX_SERIES = 8;
const SERIES_COUNTS = [2, 5, 8] as const;
const CHART_HEIGHT = 452;

function breakdownFromParams(params: URLSearchParams): BreakdownKey {
  const raw = params.get("compare_by");
  return BREAKDOWNS.some((item) => item.key === raw) ? raw as BreakdownKey : "grand_post";
}

function namesFromParams(params: URLSearchParams): Record<string, string> {
  const raw = params.get("series_names");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function scopesFromParams(params: URLSearchParams): Record<string, SeriesScope> {
  const raw = params.get("series_scopes");
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, SeriesScope>;
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export function CompareSection({
  metadata, routeVersion, filters, setFilters, measureKey, setMeasureKey, onOpenExtraction,
}: SectionProps) {
  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const tokens = useChartTokens();

  const [breakdown, setBreakdown] = useState<BreakdownKey>(() => breakdownFromParams(params));
  const [viewKey, setViewKey] = useState<ViewKey>(() => {
    const raw = params.get("view_compare");
    return VIEWS.some((item) => item.key === raw) ? raw as ViewKey : "line";
  });
  const [selection, setSelection] = useState<string[] | null>(() => {
    const raw = params.get("series");
    return raw ? raw.split("~").filter(Boolean) : null;
  });
  const [scopes, setScopes] = useState<Record<string, SeriesScope>>(() => scopesFromParams(params));
  /** Nom donné à la main. Vide, la série prend le nom que lui vaut ce qui la
   *  distingue des autres. */
  const [names, setNames] = useState<Record<string, string>>(() => namesFromParams(params));
  const [pickerOpen, setPickerOpen] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const [seriesCount, setSeriesCount] = useState(5);
  const [showOther, setShowOther] = useState(params.get("other") === "1");

  const [sharedResponse, setSharedResponse] = useState<ExploreResponse | null>(null);
  /** La requête qui a produit la réponse en main. Tant qu'elle ne correspond
   *  pas à la requête courante, la réponse décrit l'ancien périmètre : re-classer
   *  les séries dessus les remettrait telles quelles. */
  const [responseKey, setResponseKey] = useState<string | null>(null);
  const [overrideResults, setOverrideResults] = useState<Record<string, ExploreResponse>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const slotMemory = useRef<Map<string, number>>(new Map());

  const activeBreakdown = BREAKDOWNS.find((item) => item.key === breakdown) ?? BREAKDOWNS[0];
  const pickable = breakdown !== "year";

  /* — Requête partagée : la répartition selon la dimension choisie, ou le
       total simple quand la dimension est « Année ». — */

  const sharedRequest = useMemo<ExploreRequest>(() => ({
    ...filters,
    breakdown: activeBreakdown.field ?? "none",
    time_axis: "care",
    rank_by: measureKey,
    pinned: pickable ? (selection ?? []) : [],
  }), [filters, activeBreakdown, measureKey, pickable, selection]);

  const sharedFetchKey = useMemo(() => JSON.stringify({ ...sharedRequest, rank_by: undefined }), [sharedRequest]);

  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setLoading(true);
    setError(null);
    runExplore(sharedRequest, controller.signal)
      .then((next) => { if (live) { setSharedResponse(next); setResponseKey(sharedFetchKey); } })
      .catch((reason: Error) => { if (live && reason.name !== "AbortError") setError(reason.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedFetchKey]);

  // Changer de dimension change les modalités : la sélection repart des plus
  // lourdes, sans quoi elle désignerait des clés qui n'existent plus. Pas au
  // premier rendu, où elle vient de l'adresse.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    setSelection(null);
    setScopes({});
  }, [breakdown]);

  /* — Le périmètre commun commande aussi *ce* qu'on compare — */

  /** Les séries que l'utilisateur a composées lui-même : elles traversent un
   *  changement de filtre, là où les modalités se re-classent. */
  const composed = useRef<string[]>([]);
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const knownFilters = useRef(filterKey);

  // Restreindre le périmètre commun — un grand poste, une région, une tranche
  // d'âge — change quelles modalités pèsent le plus, et parfois lesquelles
  // existent encore. La liste comparée doit donc se refaire sur le nouveau
  // périmètre : la laisser figée affichait des séries vides sans rien dire.
  useEffect(() => {
    if (knownFilters.current === filterKey) return;
    knownFilters.current = filterKey;
    if (!pickable) return;
    composed.current = (selection ?? []).filter((key) => isFree(key) || scopes[key]);
    setSelection(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, pickable]);

  const measure: ExploreMeasure | null = useMemo(
    () => sharedResponse?.measures.find((item) => item.key === measureKey) ?? sharedResponse?.measures[0] ?? null,
    [sharedResponse, measureKey],
  );
  const additive = measure?.additive ?? true;
  const responseIsCurrent = sharedResponse?.breakdown === (activeBreakdown.field ?? "none")
    && responseKey === sharedFetchKey;

  const eligibleKeys = useMemo(
    () => (sharedResponse && measure && pickable ? rankedKeys(sharedResponse, measure) : []),
    [sharedResponse, measure, pickable],
  );

  useEffect(() => {
    if (!responseIsCurrent) return;
    if (pickable) {
      if (!sharedResponse || !measure || selection !== null) return;
      // Les modalités de tête sur le périmètre courant, suivies des séries que
      // l'utilisateur avait composées : re-classer ne doit pas défaire ce
      // qu'il a construit à la main.
      const kept = composed.current.filter((key) => !eligibleKeys.includes(key));
      composed.current = [];
      setSelection([...eligibleKeys.slice(0, seriesCount), ...kept]);
      return;
    }
    // « Année » n'a pas de modalité à classer : on part d'une série unique
    // sur le périmètre commun, exactement l'état initial de l'ancienne
    // comparaison libre.
    if (selection === null || selection.length === 0) {
      const key = newFreeKey();
      setSelection([key]);
      setScopes((current) => ({ ...current, [key]: { ...filters } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedResponse, measure, selection, responseIsCurrent, seriesCount, eligibleKeys, pickable]);

  const active = selection ?? [];

  /* — Requêtes individuelles : une série libre, ou une modalité à qui on a
       donné un périmètre propre, ne peut plus se lire dans la réponse
       partagée — elle demande la sienne, comme le faisait chaque série de
       l'ancienne comparaison libre. — */

  const overrideKeys = useMemo(
    () => active.filter((key) => !pickable || isFree(key) || scopes[key]),
    [active, pickable, scopes],
  );
  const overrideFetchKey = useMemo(
    () => JSON.stringify(overrideKeys.map((key) => [key, scopes[key] ?? null])),
    [overrideKeys, scopes],
  );

  useEffect(() => {
    if (!overrideKeys.length) { setOverrideResults({}); return; }
    const controller = new AbortController();
    let live = true;
    Promise.all(overrideKeys.map((key) => {
      const scope = scopes[key] ?? { ...filters };
      return runExplore({
        ...scope,
        start_year: filters.start_year,
        end_year: filters.end_year,
        breakdown: "none",
        time_axis: "care",
        rank_by: measureKey,
        pinned: [],
      }, controller.signal).then((result) => [key, result] as const);
    }))
      .then((entries) => { if (live) setOverrideResults(Object.fromEntries(entries)); })
      .catch((reason: Error) => { if (live && reason.name !== "AbortError") setOverrideResults({}); })
      .finally(() => undefined);
    return () => { live = false; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overrideFetchKey, filters.start_year, filters.end_year, measureKey]);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("compare_by", breakdown);
    next.set("view_compare", viewKey);
    if (active.length) next.set("series", active.join("~"));
    else next.delete("series");
    if (Object.keys(scopes).length) next.set("series_scopes", JSON.stringify(scopes));
    else next.delete("series_scopes");
    const written = Object.fromEntries(Object.entries(names).filter(([, value]) => value.trim()));
    if (Object.keys(written).length) next.set("series_names", JSON.stringify(written));
    else next.delete("series_names");
    next.set("other", showOther ? "1" : "0");
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [breakdown, viewKey, active, scopes, names, showOther]);

  /** Une forme cumulative — un camembert, une pile — suppose que les parts
   *  s'additionnent en un tout. Dès que deux séries ne décrivent pas la même
   *  population, ce tout n'existe pas : la forme est **retirée**, jamais
   *  proposée grisée. */
  /** Deux séries qui ne portent pas sur la même population. */
  const mixedPopulations = active.some((key) => isFree(key) || scopes[key]);

  const slots = useMemo(() => assignColorSlots(active, slotMemory.current, MAX_SERIES), [active]);

  /** Le nom d'une série composée.
   *
   *  Celui que l'utilisateur a écrit s'il y en a un. Sinon, **ce qui la
   *  distingue des autres** — et non la liste complète de ses filtres : entre
   *  « hommes de 60-69 ans » et « femmes de 20-29 ans », seuls le sexe et
   *  l'âge varient, les nommer suffit et tout le reste serait du bruit répété
   *  sur chaque légende.
   */
  const varyingFields = useMemo(() => {
    const keys = active.filter((key) => isFree(key) || scopes[key]);
    if (keys.length < 2) return null;
    const seen = new Map<string, Set<string>>();
    keys.forEach((key) => {
      const chips = scopeChips(scopes[key], filters, metadata);
      const byField = new Map(chips.map((chip) => [chip.field, chip.text]));
      // Un champ compte comme variable dès que deux séries n'y disent pas la
      // même chose — une série qui ne le restreint pas dit « tout », ce qui
      // est déjà une différence.
      new Set([...byField.keys(), ...[...seen.keys()]]).forEach((field) => {
        const bucket = seen.get(field) ?? new Set<string>();
        bucket.add(byField.get(field) ?? "—");
        seen.set(field, bucket);
      });
    });
    const varying = new Set<string>();
    seen.forEach((values, field) => { if (values.size > 1) varying.add(field); });
    return varying;
  }, [active, scopes, filters, metadata]);

  const nameOf = (key: string): string => {
    const written = names[key]?.trim();
    if (written) return written;
    const scope = scopes[key];
    const chips = scope ? scopeChips(scope, filters, metadata) : [];
    const kept = varyingFields ? chips.filter((chip) => varyingFields.has(chip.field)) : chips;
    if (kept.length) return kept.map((chip) => chip.text).join(" · ");
    return chips.length ? chips.map((chip) => chip.text).join(" · ") : "Périmètre commun";
  };

  const labelMap = useMemo(
    () => new Map((sharedResponse?.series ?? []).map((item) => [item.key, item.label])),
    [sharedResponse],
  );
  const valueMap = useMemo(() => {
    const map = new Map<string, number | null>();
    if (sharedResponse && measure) {
      sharedResponse.series.forEach((item) => map.set(item.key, periodValueOf(item, measure, sharedResponse.components)));
    }
    active.forEach((key) => {
      const override = overrideResults[key];
      if (override && measure) map.set(key, periodValueOf(override.total, measure, override.components));
    });
    return map;
  }, [sharedResponse, measure, active, overrideResults]);

  const sample = sharedResponse ?? Object.values(overrideResults)[0] ?? null;
  const years = sample?.years ?? [];
  const periodLabel = years.length ? (years.length === 1 ? String(years[0]) : `${years[0]}–${years.at(-1)}`) : "Période";

  /** Ce que le modèle autorise, et donc ce que la barre des formes affiche.
   *
   *  Une forme dont les conditions ne sont pas réunies est **absente**, jamais
   *  grisée : un bouton désactivé laisse croire qu'il manque un réglage, alors
   *  que ce sont les données qui ne s'y prêtent pas. Une aire à 100 % ou un
   *  écart demandent deux années ; une carte de chaleur, quatre séries — en
   *  dessous, elle est moins lisible que les barres qu'elle remplacerait. */
  const offers = useCallback((item: View) => (
    (!item.needsAdditive || additive)
    && !(item.cumulative && mixedPopulations)
    && years.length >= (item.needsYears ?? 0)
    && active.length >= (item.needsSeries ?? 0)
  ), [additive, mixedPopulations, years.length, active.length]);

  const availableViews = useMemo(() => VIEWS.filter(offers), [offers]);

  // Une vue devenue impossible retombe sur les courbes, toujours valides.
  const view = useMemo(() => {
    const chosen = VIEWS.find((item) => item.key === viewKey) ?? VIEWS[0];
    return offers(chosen) ? chosen : VIEWS[0];
  }, [viewKey, offers]);

  const asPie = view.form === "pie";

  const seriesData = useMemo((): ExploreSeries[] => {
    const byKey = new Map((sharedResponse?.series ?? []).map((item) => [item.key, item]));
    return active.map((key) => {
      const override = overrideResults[key];
      if (override) return { key, label: nameOf(key), is_other: false, components: override.total.components };
      const modality = byKey.get(key);
      return modality ?? { key, label: key, is_other: false, components: {} };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, overrideResults, sharedResponse]);

  const totalValues = useMemo(
    () => (sharedResponse && measure ? valuesOf(sharedResponse.total, measure, sharedResponse.components, sharedResponse.years.length) : []),
    [sharedResponse, measure],
  );

  // Le reste du périmètre : les modalités non choisies, fondues en une seule
  // série. Seules les modalités non retouchées y entrent — une série libre ou
  // à qui on a donné son propre périmètre n'est déjà plus « une modalité du
  // classement », elle ne peut donc pas doubler dans le repli.
  const modalityKeys = useMemo(
    () => active.filter((key) => !isFree(key) && !scopes[key]),
    [active, scopes],
  );
  const otherSeries = useMemo(() => {
    if (!pickable || !showOther || !sharedResponse) return null;
    const withOther = selectSeries(sharedResponse, modalityKeys, true);
    return withOther.find((item) => item.is_other) ?? null;
  }, [pickable, showOther, sharedResponse, modalityKeys]);

  const chartSeries = useMemo<ChartSeries[]>(() => {
    if (!measure) return [];
    const chosen = seriesData.map((item, index) => {
      const key = active[index];
      const components = overrideResults[key]?.components ?? sharedResponse?.components ?? [];
      const yearCount = overrideResults[key]?.years.length ?? sharedResponse?.years.length ?? years.length;
      const label = isFree(key) || scopes[key] ? nameOf(key) : (labelMap.get(key) ?? item.label);
      return {
        key,
        label,
        isOther: false,
        colorIndex: slots.get(key) ?? 0,
        values: asPie
          ? [periodValueOf(item, measure, components)]
          : applyReading(valuesOf(item, measure, components, yearCount), view.reading, totalValues),
      };
    });
    if (!otherSeries || !sharedResponse) return chosen;
    return [...chosen, {
      key: otherSeries.key,
      label: otherSeries.label,
      isOther: true,
      colorIndex: slots.get(otherSeries.key) ?? 0,
      values: asPie
        ? [periodValueOf(otherSeries, measure, sharedResponse.components)]
        : applyReading(valuesOf(otherSeries, measure, sharedResponse.components, sharedResponse.years.length), view.reading, totalValues),
    }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesData, active, measure, overrideResults, sharedResponse, slots, asPie, view, totalValues, scopes, labelMap, otherSeries]);

  const kind = asPie ? (measure?.kind ?? "money") : (measure ? readingKind(view.reading, measure) : "money");
  const unitLabel = asPie ? (measure?.unit_label ?? "") : (measure ? readingUnitLabel(view.reading, measure) : "");
  const categories = useMemo<Array<string | number>>(() => (asPie ? [periodLabel] : years), [asPie, periodLabel, years]);

  /* Une seule description du graphique, deux rendus : celui de l'écran avec le
     thème courant, celui de l'image avec la palette claire. */
  const buildChart = useCallback((palette: ChartTokens): EChartsOption => {
    if (asPie) {
      return pieOption({
        slices: chartSeries.map((item) => ({ key: item.key, label: item.label, colorIndex: item.colorIndex, value: item.values[0] ?? null })),
        tokens: palette, kind, centerLabel: `cumul ${periodLabel}`,
      });
    }
    return buildOption({
      form: view.form, categories, series: chartSeries, kind, unitLabel, tokens: palette,
      directLabels: view.form === "line" && chartSeries.length > 1 && chartSeries.length <= 6,
      // Le classement, la cascade et les écarts tournent l'axe des modalités :
      // il n'y porte plus des années mais les séries que l'on compare. La carte
      // de chaleur, elle, garde les années en abscisse.
      xTitle: view.form === "rank" || view.form === "waterfall" || view.form === "diverging"
        ? "Séries comparées"
        : "Année",
    });
  }, [asPie, view, categories, chartSeries, kind, unitLabel, periodLabel]);

  const option = useMemo(() => buildChart(tokens), [buildChart, tokens]);

  const modalitySelectionCount = active.filter((key) => !isFree(key) && !scopes[key]).length;
  const otherCount = pickable ? Math.max(0, (sharedResponse?.bucket_count ?? 0) - modalitySelectionCount) : 0;
  const breakdownLabelLower = activeBreakdown.label.toLowerCase();

  const measureFamilies = useMemo(() => {
    const groups = new Map<string, ExploreMeasure[]>();
    sharedResponse?.measures.forEach((item) => groups.set(item.family, [...(groups.get(item.family) ?? []), item]));
    return [...groups.entries()];
  }, [sharedResponse]);

  const tableColumns = useMemo(() => (asPie ? [periodLabel] : years.map(String)), [asPie, periodLabel, years]);
  const tableRows = useMemo(
    () => chartSeries.map((item) => {
      const row: Record<string, string> = { label: item.label };
      tableColumns.forEach((column, index) => { row[column] = formatValue(item.values[index], kind); });
      return row;
    }),
    [chartSeries, tableColumns, kind],
  );

  /** Le périmètre en une ligne : sans lui l'image ne dit pas sur quelle
   *  population portent les séries. */
  const compareScope = [
    filters.start_year === filters.end_year
      ? String(filters.start_year)
      : `${filters.start_year}–${filters.end_year}`,
    `comparé selon ${breakdownLabelLower}`,
    `${chartSeries.length} série${chartSeries.length > 1 ? "s" : ""}`,
    filters.sub_post ?? filters.post ?? filters.grand_post ?? null,
  ].filter((part): part is string => Boolean(part)).join(" · ");

  const exportCsv = () => {
    const columns = [{ key: "label", label: activeBreakdown.label }, ...tableColumns.map((column) => ({ key: column, label: column }))];
    const blob = new Blob([csvFromRows(columns, tableRows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `damir_comparer_${measureKey}_${breakdown}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onScopeChange = (key: string, scope: SeriesScope | null) => {
    setScopes((current) => {
      if (scope === null) { const { [key]: _removed, ...rest } = current; return rest; }
      return { ...current, [key]: scope };
    });
  };

  const onAddFree = () => {
    if (active.length >= MAX_SERIES) return;
    // La nouvelle série part du périmètre de la dernière : on compose à
    // partir de ce qu'on a, on ne recommence pas à zéro.
    const lastKey = active[active.length - 1];
    const previousScope = lastKey ? (scopes[lastKey] ?? { ...filters }) : { ...filters };
    const key = newFreeKey();
    setSelection([...active, key]);
    setScopes((current) => ({ ...current, [key]: { ...previousScope } }));
  };


  return (
    <>
      <ScopeBar
        metadata={metadata}
        value={filters}
        onChange={setFilters}
        loading={loading}
        hidden={activeBreakdown.field === "service" ? ["service_codes"] : []}
      >
        <label className="scope-bar-measure">
          <span>Mesure</span>
          <select value={measureKey} onChange={(event) => setMeasureKey(event.target.value)}>
            {measureFamilies.map(([family, items]) => (
              <optgroup key={family} label={family}>
                {items.map((item) => (
                  <option key={item.key} value={item.key} disabled={Boolean(item.unavailable_reason)}>
                    {item.label}{item.unavailable_reason ? " · indisponible" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      </ScopeBar>

      {error ? <div className="analysis-error"><strong>Le calcul n’a pas abouti</strong><span>{error}</span></div> : null}

      <article className="panel damir-stage">
        {/* Ce que je compare, **juste sous les filtres** : l'enchaînement se
            lit alors dans l'ordre où il se pense — je restreins le périmètre,
            je vois aussitôt quelles séries en découlent, puis je choisis la
            forme et je lis le graphique. Le rail reste compact, un résumé sur
            une ligne ; son édition s'ouvre en dessous et pousse le reste. */}
        <div className="compare-rail" ref={railRef}>
          <div className="compare-rail-summary">
            <span className="compare-rail-label">Ce que je compare</span>
            <div className="compare-rail-chips" role="list">
              {chartSeries.map((item) => (
                <span key={item.key} className="compare-rail-chip" role="listitem">
                  <i style={{ background: paletteColor(tokens, item.colorIndex, chartSeries.length, item.isOther) }} />
                  {item.label}
                </span>
              ))}
              {!chartSeries.length ? <span className="compare-rail-chip empty">Aucune série</span> : null}
            </div>
            <button
              type="button"
              className={`compare-rail-toggle ${pickerOpen ? "open" : ""}`}
              aria-expanded={pickerOpen}
              onClick={() => setPickerOpen((open) => !open)}
            >{pickerOpen ? "Fermer" : "Modifier les séries"}</button>
          </div>

          {pickerOpen && measure ? (
            <div className="compare-rail-panel" role="dialog" aria-label="Séries comparées">
              <SeriesPicker
            breakdown={activeBreakdown.field ?? "none"}
            breakdownLabel={pickable ? activeBreakdown.label : "Aucune décomposition automatique : composez avec des séries libres"}
            scope={{ ...filters, breakdown: activeBreakdown.field ?? "none", rank_by: measureKey }}
            selection={active}
            labels={labelMap}
            values={valueMap}
            slots={slots}
            tokens={tokens}
            kind={measure.kind}
            showOther={showOther}
            otherCount={otherCount}
            otherLabel={`Reste du périmètre · ${otherCount} ${breakdownLabelLower}`}
            maxSelected={MAX_SERIES}
            count={seriesCount}
            counts={SERIES_COUNTS}
            onCountChange={(count) => { setSeriesCount(count); if (pickable) setSelection(eligibleKeys.slice(0, count)); }}
            onChange={setSelection}
            onToggleOther={setShowOther}
            onResetToTop={() => (pickable ? setSelection(eligibleKeys.slice(0, seriesCount)) : onAddFree())}
            metadata={metadata}
            base={filters}
            scopes={scopes}
            onScopeChange={onScopeChange}
            onAddFree={onAddFree}
            pickable={pickable}
            allowScopes
            names={names}
            onNameChange={(key, name) => setNames((current) => ({ ...current, [key]: name }))}
            displayName={nameOf}
          />
            </div>
          ) : null}
        </div>

        <header className="damir-stage-head">
          <div className="damir-stage-title">
            <span className="section-kicker">Comparer selon · {breakdownLabelLower}</span>
            <h2>{measure?.label ?? "Chargement…"} — {chartSeries.length} série{chartSeries.length > 1 ? "s" : ""}</h2>
          </div>
          <div className="pathology-toggle damir-views" role="tablist" aria-label="Comparer selon">
            {BREAKDOWNS.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={breakdown === item.key}
                className={breakdown === item.key ? "active" : ""}
                onClick={() => setBreakdown(item.key)}
              >{item.label}</button>
            ))}
          </div>
        </header>

        <div className="damir-strip">
          <p className="damir-question">{view.question}</p>
          <div className="pathology-toggle damir-forms" role="group" aria-label="Vue">
            {availableViews.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={view.key === item.key}
                className={view.key === item.key ? "active" : ""}
                onClick={() => setViewKey(item.key)}
              >{item.label}</button>
            ))}
          </div>
        </div>

        <div className="damir-stage-chart">
          {measure && chartSeries.length ? (
            <EChart option={option} height={CHART_HEIGHT} stale={loading} ariaLabel={`${measure.label}, ${chartSeries.length} séries comparées`} />
          ) : <div className="damir-placeholder"><div className="skeleton" /></div>}
        </div>

        {chartSeries.length > 1 ? (
          <div className="chart-legend" role="list" aria-label="Séries affichées">
            {chartSeries.map((item) => (
              <span key={item.key} className="legend-item" role="listitem">
                <i style={{ background: paletteColor(tokens, item.colorIndex, chartSeries.length) }} />
                <span>{item.label}</span>
              </span>
            ))}
          </div>
        ) : null}

        {mixedPopulations ? (
          <p className="damir-note">
            Une ou plusieurs séries portent leur propre périmètre : les courbes ne décrivent pas
            forcément la même population et ne s’additionnent pas.
          </p>
        ) : null}

        <footer className="damir-stage-foot">
          <span className="damir-source">{SOURCE_LINE}</span>
          <div className="damir-actions">
            <ExportPngButton
              defaultTitle={`${measure?.label ?? "Comparaison"} — ${activeBreakdown.label.toLowerCase()}`}
              scope={compareScope}
              sourceLine={SOURCE_LINE}
              filenamePrefix="damir-comparer"
              buildOption={buildChart}
              disabled={!chartSeries.length}
            />
            <button type="button" onClick={exportCsv} disabled={!chartSeries.length}>Exporter le CSV</button>
            <button type="button" onClick={() => {
              const next = new URLSearchParams();
              writeFilters(next, filters);
              onOpenExtraction(next);
            }}>Extraire la donnée</button>
          </div>
        </footer>

        <div className="damir-drawers">
          <details className="damir-details">
            <summary>Voir les valeurs ({tableRows.length} lignes)</summary>
            <div className="damir-table-scroll" tabIndex={0} role="group" aria-label="Valeurs du graphique">
              <table>
                <thead>
                  <tr><th scope="col">{activeBreakdown.label}</th>{tableColumns.map((column) => <th key={column} scope="col">{column}</th>)}</tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {tableColumns.map((column) => <td key={column}>{row[column]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {sharedResponse?.warnings.length ? (
            <details className="damir-details">
              <summary>Ce que ce graphique ne montre pas ({sharedResponse.warnings.length})</summary>
              <ul className="damir-caveats">{sharedResponse.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
            </details>
          ) : null}
        </div>
      </article>

    </>
  );
}
