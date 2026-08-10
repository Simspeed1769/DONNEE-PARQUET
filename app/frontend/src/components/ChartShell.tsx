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

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { ECharts } from "echarts/core";
import { EChart, type EChartsOption } from "../charts/EChart";
import { useChartTokens } from "../charts/tokens";
import { download, renderSlide } from "../panorama/exportSlide";

type Props = {
  kicker: string;
  title: string;
  /** Boutons de bascule propres à la carte (mesure, vue complémentaire…) :
   *  chaque base garde la main sur les siens plutôt que de les faire rentrer
   *  dans une liste générique de « formes ». */
  headerActions?: ReactNode;
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
  kicker, title, headerActions, beforeChart, afterChart, height, option, empty, loading = false, ariaLabel, onInstance,
  tableColumns, tableRows, caveats, sourceLine, filenamePrefix, scope, onExtract, className,
}: Props) {
  const tokens = useChartTokens();
  const [instance, setInstance] = useState<ECharts | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const bindInstance = useCallback((next: ECharts | null) => {
    setInstance(next);
    onInstance?.(next);
  }, [onInstance]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const exportPng = async () => {
    if (!instance || !option) return;
    setNotice(null);
    try {
      const blob = await renderSlide(instance, { title, reading: null, caveats, scope, sourceLine }, tokens);
      download(blob, title, filenamePrefix);
      setNotice("Image enregistrée.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "L’image n’a pas pu être produite.");
    }
  };

  return (
    <article className={`panel pathology-chart ${className ?? ""}`}>
      <header>
        <div><span className="section-kicker">{kicker}</span><h3>{title}</h3></div>
        {headerActions}
      </header>

      {beforeChart}

      <div className="damir-stage-chart">
        {option ? (
          <EChart option={option} height={height} stale={loading} ariaLabel={ariaLabel} onInstance={bindInstance} />
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
          {notice ? <span className="damir-notice" role="status">{notice}</span> : null}
          <button type="button" onClick={exportPng} disabled={!option}>Enregistrer en PNG</button>
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
