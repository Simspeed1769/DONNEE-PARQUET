/** La carte-graphique partagée des quatre bases.
 *
 *  Chaque base a jusqu'ici répété la même charpente autour de son graphique
 *  (l'en-tête, le corps, un pied de source) sans les deux capacités que
 *  DAMIR avait déjà : un tableau replié des valeurs, et un export PNG qui
 *  emporte le titre, le périmètre et les réserves avec le tracé. Elles
 *  arrivent ici pour les trois bases qui ne les avaient pas.
 *
 *  Ce que la carte NE fait PAS : décider quelles formes sont licites. C'est
 *  au modèle de chaque base — pas à ce composant — de ne jamais lui passer
 *  une lecture qu'elle ne peut pas porter.
 */

import type { ReactNode } from "react";
import type { ECharts } from "echarts/core";
import { downloadText } from "../api";
import type { FormOption } from "../charts/reading";
import { EChart, type EChartsOption } from "../charts/EChart";
import type { ChartTokens } from "../charts/tokens";
import { csvFromRows } from "../utils";
import { ExportPngButton } from "./ExportPngButton";
import type { KpiItem } from "./KpiStrip";

type Props = {
  kicker: string;
  title: string;
  /** Boutons de bascule propres à la carte (mesure, vue complémentaire…) :
   *  chaque base garde la main sur les siens plutôt que de les faire rentrer
   *  dans une liste générique de « formes ». */
  headerActions?: ReactNode;
  /** Les lectures de la base, façon DAMIR : une barre d'onglets dans l'en-tête.
   *  Absentes, la carte n'en affiche pas — c'est le cas d'un écran à graphique
   *  unique. */
  readings?: FormOption[];
  reading?: string;
  onReading?: (key: string) => void;
  /** Les formes licites de la lecture courante, décidées par le modèle. */
  forms?: FormOption[];
  form?: string;
  onForm?: (key: string) => void;
  /** La question à laquelle la forme répond. */
  question?: string;
  /** Les repères chiffrés de la base, **au format DAMIR** : une ligne, valeur
   *  en gras et libellé discret, sur la même bande que le choix de forme. Les
   *  cartes encadrées qu'employaient Pathologies et CSP prenaient une bande
   *  entière et repoussaient le graphique hors de l'écran. */
  highlights?: KpiItem[];
  /** Contenu propre à la base, entre l'en-tête et le graphique — un panneau
   *  de réglage (le masquage Cnam, par exemple) qui n'a pas sa place dans
   *  l'en-tête mais appartient à la même carte que le graphique. */
  beforeChart?: ReactNode;
  /** Contenu propre à la base, entre le graphique et le pied — la carte CSP
   *  y pose ses encarts DROM, hors champ de la projection cartographique. */
  afterChart?: ReactNode;
  height: number;
  /** `null` tant que la réponse n'est pas là ; une chaîne quand la lecture est
   *  impossible pour ce périmètre (fond de carte indisponible, par exemple). */
  option: EChartsOption | null;
  /** La même lecture, reconstruite pour une palette donnée : l'export la
   *  redemande en clair, sans quoi une image sortie en thème sombre serait
   *  sombre. Absente, la carte n'offre pas d'export. */
  exportOption?: (tokens: ChartTokens) => EChartsOption;
  empty?: string | null;
  loading?: boolean;
  ariaLabel: string;
  onInstance?: (instance: ECharts | null) => void;
  tableColumns: string[];
  tableRows: string[][];
  /** Réserves propres à cette lecture : masquage Cnam, millésime CSP, portée
   *  nationale de la mortalité… Le modèle de la base les fournit. */
  caveats: string[];
  sourceLine: string;
  /** Nom de fichier PNG, sans l'extension ni le titre : `pathologies`,
   *  `csp`, `mortalite`. */
  filenamePrefix: string;
  /** Le périmètre en une ligne, emporté dans l'image exportée : hors de
   *  l'outil, personne n'est là pour le rappeler. */
  scope: string;
  onExtract?: () => void;
  className?: string;
};

export function ChartShell({
  kicker, title, headerActions, readings, reading, onReading, forms, form, onForm, question, highlights,
  beforeChart, afterChart, height, option, exportOption, empty,
  loading = false, ariaLabel, onInstance,
  tableColumns, tableRows, caveats, sourceLine, filenamePrefix, scope, onExtract, className,
}: Props) {
  const exportCsv = () => {
    const columns = tableColumns.map((column, index) => ({ key: String(index), label: column }));
    const rows = tableRows.map((row) => Object.fromEntries(row.map((cell, index) => [String(index), cell])));
    downloadText(`${filenamePrefix}_${tableColumns[0]?.toLowerCase() ?? "valeurs"}.csv`, csvFromRows(columns, rows));
  };

  return (
    <article className={`panel pathology-chart ${className ?? ""}`}>
      <header>
        <div><span className="section-kicker">{kicker}</span><h3>{title}</h3></div>
        {readings && readings.length > 1 ? (
          <div className="pathology-toggle damir-views" role="tablist" aria-label="Lecture affichée">
            {readings.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={reading === item.key}
                className={reading === item.key ? "active" : ""}
                onClick={() => onReading?.(item.key)}
              >{item.label}</button>
            ))}
          </div>
        ) : null}
        {headerActions}
      </header>

      {/* Les repères à gauche, le choix de forme à droite : une seule bande,
          et le graphique reste où il est. C'est la disposition de DAMIR. */}
      {(highlights && highlights.length) || (forms && forms.length > 1) ? (
        <div className="damir-strip">
          {highlights && highlights.length ? (
            <div className="damir-highlights">
              {highlights.map((item) => (
                <span key={item.key} className="damir-highlight">
                  <strong>{item.value}</strong>
                  <small>{item.label}</small>
                </span>
              ))}
            </div>
          ) : <span />}
          {forms && forms.length > 1 ? (
            <div className="pathology-toggle damir-forms" role="group" aria-label="Forme du graphique">
              {forms.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={form === item.key}
                  className={form === item.key ? "active" : ""}
                  onClick={() => onForm?.(item.key)}
                >{item.label}</button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* La question sous la bande plutôt que dedans : à trois éléments, la
          ligne débordait sur les écrans étroits. */}
      {question ? <p className="damir-question chart-shell-question">{question}</p> : null}

      {beforeChart}

      <div className="damir-stage-chart">
        {option ? (
          <EChart option={option} height={height} stale={loading} ariaLabel={ariaLabel} onInstance={onInstance} />
        ) : empty ? (
          <p className="damir-fallback">{empty}</p>
        ) : (
          <div className="damir-placeholder"><div className="skeleton" /></div>
        )}
      </div>

      {afterChart}

      <footer className="damir-stage-foot">
        <span className="damir-source">{sourceLine}</span>
        <div className="damir-actions">
          {exportOption ? (
            <ExportPngButton
              defaultTitle={title}
              scope={scope}
              sourceLine={sourceLine}
              filenamePrefix={filenamePrefix}
              buildOption={exportOption}
              disabled={!option}
            />
          ) : null}
          <button type="button" onClick={exportCsv} disabled={!tableRows.length}>Exporter le CSV</button>
          {onExtract ? <button type="button" onClick={onExtract}>Extraire</button> : null}
        </div>
      </footer>

      <div className="damir-drawers">
        <details className="damir-details">
          <summary>Voir les valeurs ({tableRows.length} lignes)</summary>
          <div className="damir-table-scroll" tabIndex={0} role="group" aria-label={`Valeurs · ${title}`}>
            <table>
              <thead><tr>{tableColumns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) => (
                      index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {caveats.length ? (
          <details className="damir-details">
            <summary>Ce que ce graphique ne montre pas ({caveats.length})</summary>
            <ul className="damir-caveats">{caveats.map((caveat) => <li key={caveat}>{caveat}</li>)}</ul>
          </details>
        ) : null}
      </div>
    </article>
  );
}
