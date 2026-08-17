/** Prolongation de tendance — et jamais « prévision ».
 *
 *  Le mot est imposé, à l'écran comme à l'export, et il n'est pas une pudeur de
 *  langage. **Prolonger une tendance, c'est répondre à « et si rien ne
 *  changeait ».** Prévoir, c'est répondre à « que va-t-il se passer », ce qui
 *  demanderait de connaître les décisions tarifaires, la démographie et
 *  l'épidémiologie à venir — dont ce cube ne sait rien. Les deux calculs
 *  produiraient les mêmes chiffres et n'engageraient pas la même chose.
 *
 *  ## Le calcul
 *
 *  Régression **log-linéaire** : on ajuste `ln(y) = a + b·t` par moindres
 *  carrés, et la prolongation vaut `exp(a + b·t)`. C'est-à-dire qu'on suppose un
 *  **taux de croissance constant**, et non un montant constant ajouté chaque
 *  année. Sur des dépenses de santé, la seconde hypothèse serait la plus fausse
 *  des deux.
 *
 *  Le taux annuel implicite, `exp(b) − 1`, est **affiché** : c'est l'hypothèse
 *  elle-même, et une prolongation dont on ne montre pas l'hypothèse ne se
 *  discute pas.
 *
 *  ## La bande
 *
 *  Elle vient des **résidus** de l'ajustement, par l'intervalle de prédiction :
 *
 *      se(t) = s · √( 1 + 1/n + (t − t̄)² / Σ(tᵢ − t̄)² )
 *
 *  Le troisième terme croît avec la distance à la période ajustée : la bande
 *  s'évase donc à mesure qu'on s'éloigne, ce qui est la seule forme honnête. Une
 *  bande d'épaisseur constante suggérerait que la deuxième année prolongée vaut
 *  la première.
 *
 *  ## Les trois conditions, non négociables
 *
 *  1. **Le dernier exercice est exclu s'il n'est pas consolidé.** Sa
 *     sous-estimation tirerait la pente vers le bas et la prolongation avec
 *     elle. Exclu plutôt que redressé : le redressement du point 3.4 est déjà
 *     une estimation, et en nourrir une seconde empile deux incertitudes sans
 *     que rien ne le dise.
 *  2. **2020 et 2021 sont exclus par défaut**, et la case est décochable. Les
 *     deux exercices Covid ne sont pas des points aberrants à jeter : ils sont
 *     réels. Mais les intégrer à une tendance revient à supposer qu'une
 *     pandémie se reproduit au même rythme.
 *  3. **Les hypothèses sont affichées** — années retenues, exercice incomplet
 *     écarté, taux annuel implicite.
 */

/** Les exercices que la pandémie a déformés. Exclus par défaut, jamais d'office. */
export const COVID_YEARS = [2020, 2021];

/** Nombre d'années prolongées. Deux, et le choix n'est pas offert : au-delà,
 *  la bande devient plus large que le signal et la forme cesse d'informer. */
export const HORIZON = 2;

export type TrendPoint = {
  year: number;
  value: number;
  low: number;
  high: number;
  /** Vrai au-delà de la dernière année observée. Faux sur une année qui existe
   *  mais que l'ajustement a écartée — la tendance y passe quand même, et il
   *  faut pouvoir le dire au survol sans le confondre avec une prolongation. */
  beyond: boolean;
};

export type Trend = {
  /** Années effectivement ajustées, dans l'ordre. */
  fitted: number[];
  /** Exclues, avec la raison — c'est ce qui s'affiche en hypothèse. */
  excluded: Array<{ year: number; reason: string }>;
  /** Taux de croissance annuel implicite, en pourcentage. */
  rate: number;
  /** Les deux années prolongées, valeur centrale et bornes. */
  points: TrendPoint[];
  /** Le dernier point observé retenu, d'où part le trait. */
  anchor: { year: number; value: number };
};

/** Pourquoi la prolongation n'est pas calculable, ou `null` si elle l'est.
 *
 *  Renvoyer une raison plutôt qu'un `null` muet : une forme qui disparaît sans
 *  explication se lit comme une panne.
 */
export function trendObstacle(values: Array<number | null>, retained: number): string | null {
  if (retained < 4) {
    return `Il reste ${retained} année${retained > 1 ? "s" : ""} après exclusions : `
      + "une tendance ne s'ajuste pas sur si peu de points.";
  }
  if (values.some((value) => value !== null && value <= 0)) {
    return "La série comporte des valeurs nulles ou négatives : une tendance à taux "
      + "constant ne s'y ajuste pas.";
  }
  return null;
}

type Input = {
  years: number[];
  values: Array<number | null>;
  /** Dernière année consolidée ; au-delà, l'exercice est écarté de l'ajustement. */
  consolidatedThrough: number | null;
  /** Faux quand l'utilisateur a décoché la case. */
  excludeCovid: boolean;
};

/** Ajuste et prolonge. `null` si la série ne s'y prête pas — voir `trendObstacle`. */
export function prolong({ years, values, consolidatedThrough, excludeCovid }: Input): Trend | null {
  const excluded: Trend["excluded"] = [];
  const keptYears: number[] = [];
  const keptLogs: number[] = [];

  years.forEach((year, index) => {
    const value = values[index];
    if (value === null || value <= 0) {
      excluded.push({ year, reason: "valeur absente" });
      return;
    }
    if (consolidatedThrough !== null && year > consolidatedThrough) {
      excluded.push({ year, reason: "exercice non consolidé" });
      return;
    }
    if (excludeCovid && COVID_YEARS.includes(year)) {
      excluded.push({ year, reason: "exercice Covid" });
      return;
    }
    keptYears.push(year);
    keptLogs.push(Math.log(value));
  });

  const n = keptYears.length;
  if (n < 4) return null;

  const meanYear = keptYears.reduce((sum, year) => sum + year, 0) / n;
  const meanLog = keptLogs.reduce((sum, value) => sum + value, 0) / n;
  let sxx = 0;
  let sxy = 0;
  keptYears.forEach((year, index) => {
    sxx += (year - meanYear) ** 2;
    sxy += (year - meanYear) * (keptLogs[index] - meanLog);
  });
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = meanLog - slope * meanYear;

  // Écart-type résiduel en échelle logarithmique. `n - 2` parce que deux
  // paramètres ont été ajustés ; c'est ce qui empêche une série de quatre
  // points d'afficher une bande trop étroite.
  let residuals = 0;
  keptYears.forEach((year, index) => {
    residuals += (keptLogs[index] - (intercept + slope * year)) ** 2;
  });
  const sigma = Math.sqrt(residuals / (n - 2));

  const lastFitted = keptYears[n - 1];
  const lastObserved = years[years.length - 1];
  const points: TrendPoint[] = [];
  // De l'année qui suit le dernier point ajusté jusqu'à l'horizon. Les années
  // intermédiaires — un exercice non consolidé, un exercice Covid — sont
  // traversées plutôt que sautées : un trait interrompu ferait croire à une
  // donnée manquante là où il n'y a qu'une année écartée du calcul.
  for (let year = lastFitted + 1; year <= lastObserved + HORIZON; year += 1) {
    // 1,96 : l'intervalle à 95 %. La racine porte l'évasement avec la distance.
    const margin = 1.959964 * sigma * Math.sqrt(1 + 1 / n + (year - meanYear) ** 2 / sxx);
    points.push({
      year,
      value: Math.exp(intercept + slope * year),
      low: Math.exp(intercept + slope * year - margin),
      high: Math.exp(intercept + slope * year + margin),
      beyond: year > lastObserved,
    });
  }

  return {
    fitted: keptYears,
    excluded,
    rate: (Math.exp(slope) - 1) * 100,
    points,
    // Le trait part du dernier point **ajusté** et non du dernier affiché : le
    // faire partir d'un exercice écarté le ferait passer par un point dont on
    // vient de dire qu'on n'en voulait pas.
    anchor: { year: lastFitted, value: Math.exp(keptLogs[n - 1]) },
  };
}

/** Les hypothèses, en toutes lettres. Elles voyagent avec le graphique. */
export function assumptions(trend: Trend, measureLabel: string): string[] {
  const lines: string[] = [];
  const span = `${trend.fitted[0]}–${trend.fitted[trend.fitted.length - 1]}`;
  lines.push(
    `Prolongation de tendance, pas prévision : elle répond à « et si le rythme de `
    + `${span} se poursuivait », non à « que va-t-il se passer ». Aucune décision `
    + `tarifaire, démographique ou épidémiologique n'y entre.`,
  );
  // La virgule décimale, et pas le point : `toFixed` rend un point, que le
  // français de l'interface n'emploie pas.
  const rate = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "always",
  }).format(trend.rate);
  lines.push(
    `${measureLabel} — ajustement log-linéaire sur ${trend.fitted.length} exercices `
    + `(${span}), soit un taux annuel implicite de ${rate} %. C'est l'hypothèse : `
    + `une prolongation dont on ne montre pas le rythme ne se discute pas.`,
  );

  const byReason = new Map<string, number[]>();
  trend.excluded.forEach((item) => {
    byReason.set(item.reason, [...(byReason.get(item.reason) ?? []), item.year]);
  });
  byReason.forEach((yearList, reason) => {
    lines.push(`Écarté de l'ajustement — ${reason} : ${yearList.join(", ")}.`);
  });

  lines.push(
    "La bande est l'intervalle de prédiction à 95 % tiré des résidus. Elle s'évase "
    + "avec la distance : la seconde année prolongée est moins assurée que la première.",
  );
  return lines;
}
