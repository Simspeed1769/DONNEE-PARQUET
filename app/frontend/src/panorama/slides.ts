/** Les quatre lectures du panorama, et les formes que chacune accepte.
 *
 *  Une lecture n'est pas seulement un graphique : c'est un graphique **plus ce
 *  qui ne tient pas dedans**. Ce module produit les deux, parce que les séparer
 *  est précisément ce qui fait échouer un graphique une fois sorti de l'outil —
 *  projeté, il ne reste que la forme.
 *
 *  Chaque lecture porte donc trois choses :
 *
 *  - un **titre** écrit en toutes lettres, qui nomme la mesure et la période ;
 *  - les **réserves**, c'est-à-dire ce que la forme ne peut pas porter et qui
 *    serait autrement perdu en silence — l'âge inconnu, la région non
 *    renseignée, une année encore en consolidation ;
 *  - un **tableau**, qui donne les mêmes chiffres au clavier et au lecteur
 *    d'écran, et à l'actuaire qui veut vérifier.
 *
 *  Et chaque lecture déclare **les formes qu'elle peut honnêtement prendre**,
 *  ici et pas ailleurs : c'est le modèle qui sait qu'une pile exige une mesure
 *  additive, qu'un camembert exige un tout, qu'une carte ne porte qu'un sujet.
 *  L'interface se contente d'afficher la liste qu'il lui donne — elle n'a
 *  aucune règle statistique à connaître.
 *
 *  Ce que ces lectures ne portent plus : la phrase de commentaire calculée qui
 *  doublait le graphique en mots. Le graphique parle, le texte se tait ; les
 *  réserves, elles, restent.
 */

import type { EChartsOption } from "../charts/EChart";
import type { ChartTokens } from "../charts/tokens";
import { ABSENT_FROM_CUBE, OFF_MAP_REGIONS } from "../charts/frenchMap";
import { pieOption } from "../charts/buildOption";
import { formatValue } from "../utils";
import type { ExploreMeasure } from "../explore/model";
import {
  seriesOption,
  type ChartRow, type SeriesForm, type TerritoryForm,
} from "./charts";
import {
  ageOption, sexCompareOption, territoryOption, territoryRankOption,
  type AgeForm,
} from "./territoryCharts";
import {
  facetOrder, mapReading, periodValue, profileOf, shareOf, yearValues,
  type PanoramaResponse,
} from "./model";

export type SlideKey = "evolution" | "territory" | "age" | "sex";

/** Toutes les formes que le panorama sait dessiner, tous écrans confondus.
 *  Chaque lecture n'en expose qu'un sous-ensemble, et seulement celles que sa
 *  donnée autorise. */
export type FormKey = SeriesForm | TerritoryForm | AgeForm | "pie";

export type FormOption = { key: FormKey; label: string };

export type SlideTable = { columns: string[]; rows: string[][] };

export type Slide = {
  key: SlideKey;
  /** Nom court de l'onglet. */
  nav: string;
  /** Titre de projection : il doit suffire, seul, à situer le graphique. */
  title: string;
  /** Ce que le graphique ne porte pas, énoncé plutôt que fondu. */
  caveats: string[];
  /** Les formes offertes pour cette lecture, dans cet état de la donnée. */
  forms: FormOption[];
  /** Celle qui est dessinée — la demandée si elle est offerte, sinon la première. */
  form: FormKey;
  option: EChartsOption;
  table: SlideTable;
  ariaLabel: string;
  height: number;
  /** Renseigné lorsqu'il n'y a rien à montrer, avec la raison. */
  empty: string | null;
};

/** Tranche d'âge hors échelle : elle n'a pas de position sur un axe ordinal. */
const AGE_UNKNOWN = "99";
/** Modalités de sexe qui portent la question ; le reste est énoncé en réserve. */
const FEMALE = "2";
const MALE = "1";

/** Emplacements de couleur **attachés à la modalité**, jamais à son rang.
 *  Le bleu et l'orange plutôt que le rose et le bleu : la paire est séparable
 *  pour les deutéranopies, et ne rejoue pas le cliché. */
const SEX_COLOR: Record<string, number> = { [FEMALE]: 0, [MALE]: 1 };

function pct(value: number | null, digits = 1): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: digits }).format(value)} %`;
}

function lower(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** Ramène une suite à 100 sur sa première valeur connue.
 *
 *  C'est ce qui permet de comparer les trajectoires de sujets d'ampleurs très
 *  différentes sur **un seul axe** — la réponse juste au double axe, qui
 *  inventerait une correspondance entre deux échelles. */
function indexed(values: Array<number | null>): Array<number | null> {
  const base = values.find((value) => value !== null && value !== 0) ?? null;
  if (base === null) return values.map(() => null);
  return values.map((value) => (value === null ? null : (100 * value) / base));
}

export type SlideInput = {
  response: PanoramaResponse;
  measure: ExploreMeasure;
  tokens: ChartTokens;
  /** Dernière année consolidée, pour marquer ce qui bouge encore. */
  consolidatedThrough: number | null;
  /** Part liquidée des exercices non consolidés, en pourcentage entier.
   *
   *  Elle est passée ici plutôt que lue depuis les métadonnées, parce que les
   *  réserves doivent pouvoir se reconstituer hors de l'écran — l'export PNG
   *  les réassemble sans accès au contexte de l'application. */
  completenessByYear: Record<number, number>;
  /** Territoire sur lequel l'écran est restreint, s'il y en a un. */
  highlightedRegion: string | null;
  /** Forme demandée par lecture. Une forme que la donnée n'autorise pas est
   *  ignorée au profit de la première offerte. */
  forms: Partial<Record<SlideKey, FormKey>>;
};

export function buildSlides(input: SlideInput): Slide[] {
  return [
    evolutionSlide(input),
    territorySlide(input),
    ageSlide(input),
    sexSlide(input),
  ];
}

/** La forme retenue : celle demandée si elle figure dans les offres. */
function resolveForm(offered: FormOption[], asked: FormKey | undefined): FormKey {
  return offered.some((item) => item.key === asked) && asked ? asked : offered[0].key;
}

function subjectRows(response: PanoramaResponse, measure: ExploreMeasure): ChartRow[] {
  return response.subjects.map((subject, index) => ({
    key: subject.key,
    label: subject.label,
    colorIndex: index,
    values: yearValues(subject.total, measure, response.components, response.years.length),
  }));
}

/* — 1. Évolution — */

/** La réserve de consolidation, chiffrée quand on sait la chiffrer.
 *
 *  Elle est écrite ici une seule fois : deux lectures qui énonceraient la même
 *  réserve dans deux mots différents laisseraient croire à deux faits.
 */
function consolidationCaveat(years: number[], consolidatedThrough: number | null,
                             completenessByYear: Record<number, number>): string | null {
  if (consolidatedThrough === null) return null;
  const provisional = years.filter((year) => year > consolidatedThrough);
  if (!provisional.length) return null;

  const rates = provisional
    .map((year) => (completenessByYear[year] === undefined ? null : `${year} liquidé à ${completenessByYear[year]} %`))
    .filter((item): item is string => item !== null);

  if (!rates.length) {
    return `Les années postérieures à ${consolidatedThrough} sont encore en consolidation : `
      + "les liquidations tardives n'y sont pas toutes remontées, le dernier point est donc un plancher.";
  }
  return `Exercice${rates.length > 1 ? "s" : ""} encore en consolidation — ${rates.join(", ")} `
    + "à la date des derniers flux observés. Les liquidations tardives n'y sont pas remontées : "
    + "le dernier point est un plancher, et la variation qu'il dessine est sous-estimée.";
}

function evolutionSlide({ response, measure, tokens, consolidatedThrough,
                          completenessByYear, forms }: SlideInput): Slide {
  const { years } = response;
  const rows = subjectRows(response, measure);
  const several = rows.length > 1;

  const offered: FormOption[] = [
    { key: "line", label: "Courbe" },
    { key: "bar", label: "Barres" },
    // Empiler suppose que les parts s'additionnent en un tout : faux sur un
    // taux, et sans objet sur un sujet unique.
    ...(several && measure.additive ? [{ key: "area" as const, label: "Aires empilées" }] : []),
    // Un indice n'a de sens que s'il y a des trajectoires à comparer.
    ...(several ? [{ key: "index" as const, label: "Base 100" }] : []),
  ];
  const form = resolveForm(offered, forms.evolution);

  const asIndex = form === "index";
  const drawn = asIndex ? rows.map((row) => ({ ...row, values: indexed(row.values) })) : rows;
  const kind = asIndex ? "base100" : measure.kind;

  const caveats: string[] = [];
  const consolidation = consolidationCaveat(years, consolidatedThrough, completenessByYear);
  if (consolidation) caveats.push(consolidation);
  if (asIndex) {
    caveats.push(
      `Chaque sujet vaut 100 en ${years[0]} : le graphique compare des rythmes, pas des montants. `
      + "Un sujet dix fois plus petit peut y monter dix fois plus vite sans peser davantage.",
    );
  }
  if (form === "area") {
    caveats.push(
      "Les aires sont empilées : seule la bande du bas se lit sur l'axe, les autres se lisent "
      + "par leur épaisseur. Le sommet donne le total des sujets affichés, pas celui du périmètre.",
    );
  }
  if (measure.caveat) caveats.push(measure.caveat);

  return {
    key: "evolution",
    nav: "Évolution",
    title: asIndex
      ? `${measure.label} en base 100, ${years[0]}–${years.at(-1)}`
      : `${measure.label}, ${years[0]}–${years.at(-1)}`,
    caveats,
    forms: offered,
    form,
    option: seriesOption({ years, rows: drawn, kind, tokens, consolidatedThrough, form: form as SeriesForm }),
    table: {
      columns: ["Année", ...drawn.map((row) => row.label)],
      rows: years.map((year, index) => [
        String(year),
        ...drawn.map((row) => formatValue(row.values[index], kind)),
      ]),
    },
    ariaLabel: `${measure.label} par année, ${years[0]} à ${years.at(-1)}`,
    height: 430,
    empty: rows.length ? null : "Aucun sujet à tracer sur ce périmètre.",
  };
}

/* — 2. Territoire — */

function territorySlide({ response, measure, tokens, highlightedRegion,
                          consolidatedThrough, completenessByYear, forms }: SlideInput): Slide {
  const comparing = response.subjects.length > 1;
  const lead = response.subjects[0];
  const order = facetOrder(response.reference.region ?? [], "region", measure, response.components);
  const labels = new Map(order.map((bucket) => [bucket.key, bucket.label]));

  const readingModel = lead
    ? mapReading(lead, "region", response.reference.region ?? [], response.reference_total,
                 measure, response.components, comparing)
    : null;

  // Ce que la carte ne peut pas porter est dit, chiffré, à côté d'elle.
  const caveats: string[] = [];
  // Une lecture agrégée sur la période hérite de l'incomplétude du dernier
  // exercice : le cumul est sous-estimé partout, pas seulement au bout d'une
  // courbe. La réserve vaut donc ici comme dans l'Évolution.
  const territoryConsolidation = consolidationCaveat(
    response.years, consolidatedThrough, completenessByYear);
  if (territoryConsolidation) caveats.push(territoryConsolidation);
  if (lead) {
    const whole = periodValue(lead.total, measure, response.components);
    (lead.facets.region ?? [])
      .filter((bucket) => OFF_MAP_REGIONS[bucket.key])
      .forEach((bucket) => {
        const value = periodValue(bucket, measure, response.components);
        if (value === null || value === 0) return;
        const share = whole && measure.additive ? (100 * value) / whole : null;
        caveats.push(
          `${OFF_MAP_REGIONS[bucket.key]} : `
          + (share !== null ? `${pct(share)} du total` : formatValue(value, measure.kind))
          + ", sans territoire à cartographier — non compris dans la carte.",
        );
      });
  }
  caveats.push(
    `${Object.values(ABSENT_FROM_CUBE).join(", ")} : dessinée mais non renseignée dans le cube DAMIR, `
    + "elle reste sans couleur plutôt que de passer pour une valeur nulle.",
  );
  if (comparing) {
    caveats.push(
      "Carte en indice de spécialisation : 100 signifie que le territoire recourt au sujet "
      + "exactement à hauteur de son poids dans le périmètre. C'est ce qui rend comparables "
      + "des prestations de tailles très différentes.",
    );
  }

  const onMap = readingModel
    ? [...readingModel.values.entries()]
      .filter((entry): entry is [string, number] => entry[1] !== null && !OFF_MAP_REGIONS[entry[0]])
      .sort((left, right) => right[1] - left[1])
    : [];

  const empty = !readingModel || !onMap.length
    ? "Aucun territoire cartographiable sur ce périmètre."
    : null;

  // La carte ne porte **que** ce qu'elle peut porter. Laisser « non renseignée »
  // dans le jeu de valeurs écraserait l'échelle de couleur des territoires
  // réels : elle est déjà énoncée, chiffrée, dans les réserves.
  const mapped = readingModel
    ? {
      ...readingModel,
      values: new Map([...readingModel.values.entries()]
        .filter(([key]) => !OFF_MAP_REGIONS[key])),
    }
    : null;

  const offered: FormOption[] = [
    { key: "map", label: "Carte" },
    { key: "rank", label: "Classement" },
  ];
  const form = resolveForm(offered, forms.territory);

  const shared = mapped
    ? { reading: mapped, labels, tokens, kind: measure.kind, highlighted: highlightedRegion }
    : null;

  return {
    key: "territory",
    nav: "Territoire",
    title: comparing
      ? `Spécialisation territoriale, ${response.years[0]}–${response.years.at(-1)}`
      : `${measure.label} par région, ${response.years[0]}–${response.years.at(-1)}`,
    caveats,
    forms: offered,
    form,
    option: !shared ? {}
      : form === "rank" ? territoryRankOption(shared) : territoryOption(shared),
    table: {
      columns: ["Territoire", comparing ? "Indice (100 = poids du territoire)" : measure.label],
      rows: onMap.map(([key, value]) => [
        labels.get(key) ?? key,
        comparing
          ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value ?? 0)
          : formatValue(value, measure.kind),
      ]),
    },
    ariaLabel: `${measure.label} par région`,
    // Une hauteur par **lecture**, jamais par forme : la faire varier d'une
    // forme à l'autre redimensionnait le conteneur au milieu de la transition,
    // ce qui produisait à la fois un saut de mise en page et un morphing
    // interrompu. La carte veut un carré (520) ; le classement s'en accommode
    // et respire.
    height: 520,
    empty,
  };
}

/* — 3. Âge — */

function ageSlide({ response, measure, tokens, consolidatedThrough,
                    completenessByYear, forms }: SlideInput): Slide {
  const all = facetOrder(response.reference.age ?? [], "age", measure, response.components);
  // « Âge inconnu » quitte l'axe : sur une échelle ordinale, une modalité qui
  // n'a pas de position invente une pente entre 80 ans et rien.
  const order = all.filter((bucket) => bucket.key !== AGE_UNKNOWN);
  const share = measure.additive;

  const rows: ChartRow[] = response.subjects.map((subject, index) => ({
    key: subject.key,
    label: subject.label,
    colorIndex: index,
    values: share
      ? profileOf(subject, "age", measure, response.components, order.map((bucket) => bucket.key))
      : order.map((reference) => {
        const bucket = (subject.facets.age ?? []).find((item) => item.key === reference.key);
        return bucket ? periodValue(bucket, measure, response.components) : null;
      }),
  }));

  const caveats: string[] = [];
  const ageConsolidation = consolidationCaveat(
    response.years, consolidatedThrough, completenessByYear);
  if (ageConsolidation) caveats.push(ageConsolidation);
  const unknown = all.find((bucket) => bucket.key === AGE_UNKNOWN);
  const leadSubject = response.subjects[0];
  if (unknown && leadSubject) {
    const bucket = (leadSubject.facets.age ?? []).find((item) => item.key === AGE_UNKNOWN);
    const value = bucket ? shareOf(bucket, leadSubject, measure, response.components) : null;
    if (value !== null && value > 0) {
      caveats.push(
        `Âge inconnu : ${pct(value)} du ${lower(measure.label)}, retiré du profil. `
        + "Une modalité sans position sur l'échelle des âges ne peut pas y figurer sans en fausser la pente.",
      );
    }
  }
  if (!share) {
    caveats.push(
      `${measure.label} est un rapport, pas un cumul : les tranches ne s'additionnent pas à 100 %. `
      + "Chaque colonne se lit pour elle-même.",
    );
  }

  // Neuf tranches d'âge dépassent ce qu'un camembert sait porter : la forme
  // n'est pas offerte ici, c'est la barre qui compare des parts ordonnées.
  const offered: FormOption[] = [
    { key: "bar", label: "Barres" },
    { key: "hbar", label: "Barres horizontales" },
    { key: "line", label: "Courbe" },
  ];
  const form = resolveForm(offered, forms.age);
  const kind = share ? "percent" : measure.kind;

  return {
    key: "age",
    nav: "Âge",
    title: share
      ? `Répartition du ${lower(measure.label)} par tranche d'âge`
      : `${measure.label} par tranche d'âge`,
    caveats,
    forms: offered,
    form,
    option: ageOption({ order, rows, tokens, kind, form: form as AgeForm }),
    table: {
      columns: ["Tranche d'âge", ...rows.map((row) => row.label)],
      rows: order.map((bucket, index) => [
        bucket.label,
        ...rows.map((row) => formatValue(row.values[index], kind)),
      ]),
    },
    ariaLabel: `Profil par tranche d'âge, ${measure.label}`,
    // Constante d'une forme à l'autre, pour la même raison qu'en territoire.
    height: 430,
    empty: order.length ? null : "Aucune tranche d'âge renseignée sur ce périmètre.",
  };
}

/* — 4. Sexe — */

function sexSlide({ response, measure, tokens, consolidatedThrough,
                    completenessByYear, forms }: SlideInput): Slide {
  const comparing = response.subjects.length > 1;
  const { years } = response;
  const lead = response.subjects[0];
  const share = measure.additive;

  // Seules les deux modalités qui portent la question. « Non renseigné » n'est
  // pas une troisième catégorie de la comparaison : c'est une lacune de
  // saisie, énoncée en réserve et chiffrée, jamais posée à côté des femmes et
  // des hommes comme si elle leur était comparable.
  const known = facetOrder(response.reference.sex ?? [], "sex", measure, response.components)
    .filter((bucket) => bucket.key === FEMALE || bucket.key === MALE)
    .sort((left, right) => (SEX_COLOR[left.key] ?? 9) - (SEX_COLOR[right.key] ?? 9));
  const femaleLabel = known.find((bucket) => bucket.key === FEMALE)?.label ?? "Femmes";

  const caveats = [
    consolidationCaveat(years, consolidatedThrough, completenessByYear),
    residualCaveat(response, measure),
  ].filter((item): item is string => item !== null);
  const period = `${years[0]}–${years.at(-1)}`;

  /* — Comparaison de sujets : un classement sur la part des femmes — */
  if (comparing && share) {
    const rows: ChartRow[] = response.subjects.map((subject, index) => {
      const bucket = (subject.facets.sex ?? []).find((item) => item.key === FEMALE);
      return {
        key: subject.key,
        label: subject.label,
        colorIndex: index,
        values: [bucket ? shareOf(bucket, subject, measure, response.components) : null],
      };
    });
    const ranked = [...rows].sort((left, right) => (right.values[0] ?? 0) - (left.values[0] ?? 0));
    const offered: FormOption[] = [{ key: "rank", label: "Classement" }];

    return {
      key: "sex",
      nav: "Sexe",
      title: `Part des ${lower(femaleLabel)} dans le ${lower(measure.label)}, ${period}`,
      caveats,
      forms: offered,
      form: "rank",
      option: sexCompareOption({
        rows, tokens, modalityLabel: lower(femaleLabel), axisTitle: "Sujets comparés",
      }),
      table: {
        columns: ["Sujet", `Part de ${lower(femaleLabel)}`],
        rows: ranked.map((row) => [row.label, formatValue(row.values[0], "percent")]),
      },
      ariaLabel: `Part des femmes par sujet, ${measure.label}`,
      height: Math.max(300, 100 + rows.length * 42),
      empty: rows.length ? null : "Aucun sujet à comparer.",
    };
  }

  /* — Un sujet : femmes et hommes, sous la forme choisie — */

  const rows: ChartRow[] = known.map((reference) => {
    const bucket = (lead?.facets.sex ?? []).find((item) => item.key === reference.key);
    return {
      key: reference.key,
      label: reference.label,
      colorIndex: SEX_COLOR[reference.key] ?? 0,
      values: bucket
        ? yearValues(bucket, measure, response.components, years.length)
        : years.map(() => null),
    };
  });

  const offered: FormOption[] = [
    { key: "line", label: "Courbe" },
    { key: "bar", label: "Barres" },
    // Le camembert décompose un tout : deux parts d'un taux n'en font pas un.
    ...(share ? [{ key: "pie" as const, label: "Camembert" }] : []),
  ];
  const form = resolveForm(offered, forms.sex);
  const empty = rows.length ? null : "Le sexe n'est pas renseigné sur ce périmètre.";

  if (form === "pie") {
    const slices = known.map((reference) => {
      const bucket = (lead?.facets.sex ?? []).find((item) => item.key === reference.key);
      return {
        key: reference.key,
        label: reference.label,
        colorIndex: SEX_COLOR[reference.key] ?? 0,
        value: bucket ? periodValue(bucket, measure, response.components) : null,
      };
    });
    const total = slices.reduce((sum, slice) => sum + (slice.value ?? 0), 0);

    return {
      key: "sex",
      nav: "Sexe",
      title: `Partage du ${lower(measure.label)} entre femmes et hommes, ${period}`,
      caveats,
      forms: offered,
      form,
      option: pieOption({ slices, tokens, kind: measure.kind, centerLabel: `cumul ${period}` }),
      table: {
        columns: ["Sexe", measure.label, "Part"],
        rows: slices.map((slice) => [
          slice.label,
          formatValue(slice.value, measure.kind),
          formatValue(total ? (100 * (slice.value ?? 0)) / total : null, "percent"),
        ]),
      },
      ariaLabel: `Partage entre femmes et hommes, ${measure.label}, ${period}`,
      height: 430,
      empty,
    };
  }

  return {
    key: "sex",
    nav: "Sexe",
    title: `${measure.label} selon le sexe, ${period}`,
    caveats,
    forms: offered,
    form,
    option: seriesOption({
      years, rows, kind: measure.kind, tokens, consolidatedThrough, form: form as SeriesForm,
    }),
    table: {
      columns: ["Année", ...rows.map((row) => row.label)],
      rows: years.map((year, index) => [
        String(year),
        ...rows.map((row) => formatValue(row.values[index], measure.kind)),
      ]),
    },
    ariaLabel: `${measure.label} par sexe et par année`,
    height: 430,
    empty,
  };
}

/** Ce que « femmes » et « hommes » laissent de côté, chiffré. */
function residualCaveat(response: PanoramaResponse, measure: ExploreMeasure): string | null {
  const lead = response.subjects[0];
  if (!lead) return null;
  const others = (lead.facets.sex ?? []).filter((bucket) => bucket.key !== FEMALE && bucket.key !== MALE);
  if (!others.length) return null;
  let total = 0;
  others.forEach((bucket) => {
    const value = shareOf(bucket, lead, measure, response.components);
    if (value !== null) total += value;
  });
  if (total < 0.01) return null;
  return `Sexe non renseigné ou inconnu : ${pct(total, 2)} du ${lower(measure.label)}. `
    + "Ces lignes existent dans le cube et sont exclues de la comparaison plutôt que réparties.";
}
