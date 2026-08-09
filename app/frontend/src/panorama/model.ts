/** Modèle du panorama : un sujet, ou plusieurs, sous toutes leurs dimensions.
 *
 *  Comme pour l'exploration, le serveur n'envoie que des composantes brutes et
 *  la spécification des formules. Les douze indicateurs se dérivent ici, si
 *  bien que changer de mesure recalcule la carte, les âges, les sexes et
 *  l'évolution sans une seule requête.
 */

import { evaluate, type ExploreMeasure } from "../explore/model";

export type PanoramaBucket = {
  key: string;
  label: string;
  components: Record<string, number[]>;
};

export type PanoramaSubject = {
  key: string;
  label: string;
  total: PanoramaBucket;
  facets: Record<string, PanoramaBucket[]>;
};

export type PanoramaResponse = {
  subject_dimension: string;
  subject_dimension_label: string;
  facets: string[];
  facet_labels: Record<string, string>;
  years: number[];
  components: string[];
  subjects: PanoramaSubject[];
  reference: Record<string, PanoramaBucket[]>;
  reference_total: PanoramaBucket;
  measures: ExploreMeasure[];
  dimensions: Array<{ key: string; label: string }>;
  warnings: string[];
};

export const ALL_KEY = "__all__";

function cellAt(bucket: PanoramaBucket, index: number, names: string[]): Record<string, number> {
  const cell: Record<string, number> = {};
  names.forEach((name) => { cell[name] = bucket.components[name]?.[index] ?? 0; });
  return cell;
}

function sumCells(bucket: PanoramaBucket, names: string[]): Record<string, number> {
  const total: Record<string, number> = {};
  names.forEach((name) => {
    total[name] = (bucket.components[name] ?? []).reduce((sum, value) => sum + value, 0);
  });
  return total;
}

/** Valeurs annuelles d'une modalité pour un indicateur donné. */
export function yearValues(bucket: PanoramaBucket, measure: ExploreMeasure,
                           components: string[], yearCount: number): Array<number | null> {
  return Array.from({ length: yearCount }, (_, index) =>
    evaluate(cellAt(bucket, index, components), measure.formula_spec));
}

/** Valeur sur toute la période. Les composantes s'additionnent **avant** la
 *  formule : c'est ce qui rend le cumul juste y compris pour un taux, qu'on ne
 *  peut pas sommer. */
export function periodValue(bucket: PanoramaBucket, measure: ExploreMeasure,
                            components: string[]): number | null {
  return evaluate(sumCells(bucket, components), measure.formula_spec);
}

/** Une mesure est-elle un cumul, ou un rapport ?
 *
 *  La distinction commande toute la lecture cartographique : un montant se
 *  compare en indice, un taux se compare en écart de points. Le serveur la
 *  porte déjà dans `additive`, on ne la redevine pas.
 */
export function isRatio(measure: ExploreMeasure): boolean {
  return !measure.additive;
}

export type MapReading = {
  /** `index` : 100 = le territoire pèse ce qu'il pèse dans le périmètre.
   *  `value` : la mesure elle-même, lue sur son unité. */
  kind: "index" | "value";
  values: Map<string, number | null>;
  /** Valeur pivot de l'échelle divergente : 100 en indice, la valeur du
   *  périmètre entier pour un taux. */
  center: number | null;
  unitLabel: string;
};

/** Ce qu'une carte doit montrer pour un sujet donné.
 *
 *  Un montant remboursé par région confond le poids du territoire et
 *  l'intensité du recours : l'Île-de-France arrive première partout, ce qui
 *  n'apprend rien et rend deux prestations de tailles différentes
 *  incomparables. L'indice de spécialisation neutralise les deux tailles —
 *
 *      100 × (part du territoire dans le sujet) / (part du territoire dans le périmètre)
 *
 *  — et ramène toutes les cartes sur une échelle commune, quel que soit le
 *  montant en jeu. On ne le calcule que là où il veut dire quelque chose : sur
 *  un cumul, et quand il y a plusieurs sujets à comparer. Ailleurs la carte
 *  montre la mesure elle-même.
 */
export function mapReading(
  subject: PanoramaSubject,
  facet: string,
  reference: PanoramaBucket[],
  referenceTotal: PanoramaBucket,
  measure: ExploreMeasure,
  components: string[],
  asIndex: boolean,
): MapReading {
  const buckets = subject.facets[facet] ?? [];

  if (!asIndex || isRatio(measure)) {
    const values = new Map<string, number | null>();
    buckets.forEach((bucket) =>
      values.set(bucket.key, periodValue(bucket, measure, components)));
    return {
      kind: "value",
      values,
      center: isRatio(measure) ? periodValue(subject.total, measure, components) : null,
      unitLabel: measure.unit_label,
    };
  }

  const subjectTotal = periodValue(subject.total, measure, components) ?? 0;
  const perimeterTotal = periodValue(referenceTotal, measure, components) ?? 0;
  const referenceByKey = new Map(reference.map((bucket) => [bucket.key, bucket]));

  const values = new Map<string, number | null>();
  buckets.forEach((bucket) => {
    const here = periodValue(bucket, measure, components);
    const referenceHere = referenceByKey.get(bucket.key);
    const there = referenceHere ? periodValue(referenceHere, measure, components) : null;
    // Un territoire absent du périmètre, ou un périmètre vide, ne donne pas un
    // indice de zéro : il ne donne pas d'indice du tout.
    if (here === null || there === null || !there || !subjectTotal || !perimeterTotal) {
      values.set(bucket.key, null);
      return;
    }
    values.set(bucket.key, 100 * (here / subjectTotal) / (there / perimeterTotal));
  });

  return { kind: "index", values, center: 100, unitLabel: "indice, 100 = poids du territoire" };
}

/** Part d'une modalité dans le total du sujet, en pourcentage.
 *
 *  Sert au dot plot des sexes, où la question n'est pas « combien » mais
 *  « quelle proportion » : c'est ce qui rend huit prestations de tailles très
 *  différentes lisibles sur un même axe.
 */
export function shareOf(bucket: PanoramaBucket, subject: PanoramaSubject,
                        measure: ExploreMeasure, components: string[]): number | null {
  const part = periodValue(bucket, measure, components);
  const whole = periodValue(subject.total, measure, components);
  if (part === null || whole === null || !whole) return null;
  return (100 * part) / whole;
}

/** Profil d'une facette, ramené à 100 % pour que des sujets de tailles
 *  différentes se superposent. */
export function profileOf(subject: PanoramaSubject, facet: string,
                          measure: ExploreMeasure, components: string[],
                          order: string[]): Array<number | null> {
  const byKey = new Map((subject.facets[facet] ?? []).map((bucket) => [bucket.key, bucket]));
  return order.map((key) => {
    const bucket = byKey.get(key);
    return bucket ? shareOf(bucket, subject, measure, components) : null;
  });
}

/** Ordre stable des modalités d'une facette, décidé sur le référentiel.
 *
 *  Les prendre dans l'ordre du premier sujet ferait danser l'axe d'un sujet à
 *  l'autre : la comparaison exige que la position d'une tranche d'âge ou d'un
 *  territoire ne dépende pas de qui est regardé.
 */
export function facetOrder(reference: PanoramaBucket[], facet: string,
                           measure: ExploreMeasure, components: string[]): PanoramaBucket[] {
  const ordered = [...reference];
  // L'âge est une échelle : son ordre est celui des tranches, pas celui des
  // montants. Les autres facettes se classent par poids décroissant.
  if (facet === "age") {
    ordered.sort((left, right) => Number(left.key) - Number(right.key));
  } else {
    ordered.sort((left, right) =>
      Math.abs(periodValue(right, measure, components) ?? 0)
      - Math.abs(periodValue(left, measure, components) ?? 0));
  }
  return ordered;
}
