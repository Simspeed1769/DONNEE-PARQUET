/** D'où vient la hausse : effet volume et effet coût moyen.
 *
 *  DAMIR répond très bien à « combien », et jamais à « pourquoi ». Un montant
 *  qui progresse de 4 % peut recouvrir deux histoires opposées — davantage
 *  d'actes au même prix, ou autant d'actes plus chers — et la décision qu'on
 *  prend n'est pas la même. Cette lecture sépare les deux.
 *
 *  ## L'identité, et pourquoi celle-ci
 *
 *  Un montant est un volume multiplié par un coût moyen : `M = q × c`. Entre
 *  deux années, l'écart se répartit. La décomposition naïve —
 *  `Δq·c₀` et `q₀·Δc` — laisse un **terme croisé** `Δq·Δc` qui n'appartient à
 *  personne, et qu'il faudrait soit afficher (une troisième barre que nul ne
 *  sait interpréter) soit répartir en douce.
 *
 *  On emploie donc la forme **symétrique**, qui pondère chaque effet par la
 *  moyenne de l'autre facteur :
 *
 *      effet volume = (q₁ − q₀) × (c₀ + c₁) / 2
 *      effet coût   = (c₁ − c₀) × (q₀ + q₁) / 2
 *
 *  Leur somme vaut exactement `q₁c₁ − q₀c₀`. Aucun résidu, donc une cascade qui
 *  se referme — ce qui n'est pas une élégance mais une condition : une cascade
 *  dont les marches ne rejoignent pas l'arrivée est une cascade fausse.
 *
 *  ## Ce que cette lecture ne peut pas faire, et le dit
 *
 *  - **Les quantités ne sont pas homogènes** entre prestations : une boîte, une
 *    journée d'hospitalisation et un acte ne s'additionnent pas. La
 *    décomposition n'a donc de sens qu'**à l'intérieur d'un poste**, et jamais
 *    sur un total tous postes confondus.
 *  - **L'effet de structure est hors périmètre** — explicitement. Au sein d'un
 *    poste, un déplacement vers des prestations plus chères se lit ici comme un
 *    effet coût, alors que le prix de chaque prestation n'a pas bougé. C'est la
 *    limite principale, et elle est énoncée en réserve.
 *  - **Un poste sans quantité, ou dont le montant est négatif, n'est pas
 *    décomposable.** Il n'est pas mis à zéro : il est écarté et nommé. Un
 *    coût moyen négatif n'est pas un coût.
 */

import type { ExploreMeasure } from "../explore/model";
import type { PanoramaBucket } from "./model";

/** Un poste et sa contribution à l'écart, séparée en ses deux effets. */
export type PosteEffect = {
  key: string;
  label: string;
  /** Montant de la première année et de la dernière. */
  from: number;
  to: number;
  /** `to − from`, et sa répartition. La somme des deux effets vaut le delta. */
  delta: number;
  volume: number;
  cost: number;
  /** Quantités et coûts moyens, pour le survol et le tableau. */
  quantityFrom: number;
  quantityTo: number;
  unitFrom: number;
  unitTo: number;
};

export type Decomposition = {
  years: [number, number];
  /** Postes décomposables, du plus contributeur au moins. */
  postes: PosteEffect[];
  /** Postes écartés, avec la raison. Ils comptent dans les totaux d'arrivée. */
  excluded: Array<{ label: string; reason: string; delta: number }>;
  from: number;
  to: number;
  /** Somme des effets sur les postes décomposables. */
  volume: number;
  cost: number;
  /** Écart porté par les postes non décomposables : `to − from − volume − cost`. */
  unexplained: number;
};

/** La mesure se prête-t-elle à la décomposition ?
 *
 *  Il faut un **montant additif** — un total en euros. Un taux, un indice ou
 *  une moyenne n'est pas un `q × c` : le décomposer produirait une arithmétique
 *  juste sur des grandeurs qui ne la supportent pas. La lecture n'est alors pas
 *  offerte du tout, jamais offerte grisée.
 */
export function decomposable(measure: ExploreMeasure | null): boolean {
  return Boolean(measure && measure.additive && measure.kind === "money");
}

function amountAt(bucket: PanoramaBucket, index: number, measure: ExploreMeasure): number {
  // Le numérateur de la mesure, évalué sur une année. Un montant additif n'a
  // pas de dénominateur : c'est ce que `decomposable` a déjà garanti.
  return Object.entries(measure.formula_spec.numerator).reduce(
    (total, [name, weight]) => total + (bucket.components[name]?.[index] ?? 0) * weight,
    0,
  ) * measure.formula_spec.factor;
}

function quantityAt(bucket: PanoramaBucket, index: number): number {
  return bucket.components.qte?.[index] ?? 0;
}

/** Décompose l'écart entre la première et la dernière année de la période. */
export function decompose(buckets: PanoramaBucket[], measure: ExploreMeasure,
                          years: number[]): Decomposition | null {
  if (years.length < 2) return null;
  const first = 0;
  const last = years.length - 1;

  const postes: PosteEffect[] = [];
  const excluded: Decomposition["excluded"] = [];
  let from = 0;
  let to = 0;

  buckets.forEach((bucket) => {
    const amountFrom = amountAt(bucket, first, measure);
    const amountTo = amountAt(bucket, last, measure);
    from += amountFrom;
    to += amountTo;

    const quantityFrom = quantityAt(bucket, first);
    const quantityTo = quantityAt(bucket, last);
    const delta = amountTo - amountFrom;

    // Sans quantité aux deux bornes, il n'y a pas de coût moyen à comparer.
    if (quantityFrom <= 0 || quantityTo <= 0) {
      excluded.push({ label: bucket.label, reason: "aucune quantité déclarée", delta });
      return;
    }
    // Un montant négatif — régularisations — donne un coût moyen négatif, qui
    // n'est pas un coût. On l'écarte plutôt que d'afficher un nombre qui a
    // l'air d'en être un.
    if (amountFrom < 0 || amountTo < 0) {
      excluded.push({ label: bucket.label, reason: "montant négatif (régularisations)", delta });
      return;
    }

    const unitFrom = amountFrom / quantityFrom;
    const unitTo = amountTo / quantityTo;

    postes.push({
      key: bucket.key,
      label: bucket.label,
      from: amountFrom,
      to: amountTo,
      delta,
      volume: (quantityTo - quantityFrom) * ((unitFrom + unitTo) / 2),
      cost: (unitTo - unitFrom) * ((quantityFrom + quantityTo) / 2),
      quantityFrom,
      quantityTo,
      unitFrom,
      unitTo,
    });
  });

  if (!postes.length) return null;

  postes.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
  const volume = postes.reduce((sum, poste) => sum + poste.volume, 0);
  const cost = postes.reduce((sum, poste) => sum + poste.cost, 0);

  return {
    years: [years[first], years[last]],
    postes,
    excluded,
    from,
    to,
    volume,
    cost,
    // Ce que les postes écartés portent. Nommé plutôt que dissous : une cascade
    // qui ne se referme pas doit dire pourquoi, et non ajuster ses marches.
    unexplained: to - from - volume - cost,
  };
}
