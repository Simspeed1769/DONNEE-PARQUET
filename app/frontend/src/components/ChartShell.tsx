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
import { PaletteChoice } from "./PaletteChoice";
import { ViewSwitch } from "./ViewSwitch";
/** Un repère chiffré. Le type vivait dans `KpiStrip`, supprimé avec la bande
 *  séparée : les repères sont revenus **dans** le panneau, sur la rangée qu'ils
 *  partagent avec le choix de forme — la structure de DAMIR, devenue la seule. */
export type KpiItem = {
  key: string;
  label: string;
  value: string;
  detail?: string;
  /** Une phrase entière plutôt qu'un nombre nu. */
  sentence?: boolean;
};

type Props = {
  /** L'amorce au-dessus du titre. **Facultative, et à laisser vide dès qu'elle
   *  répéterait le nom de la base** : l'en-tête de page et la barre latérale le
   *  portent déjà. Elle ne sert que lorsqu'elle nomme le *sujet* — la
   *  pathologie observée, le groupe CSP, le territoire. */
  kicker?: string;
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
  /** Le périmètre, en gris, sur une ligne sous le titre. Il remplace
   *  l'en-tête de page hors panneau que portaient les quatre bases : deux
   *  niveaux de titre pour la même chose, et des repères qui semblaient posés
   *  sur un fond gris, détachés de ce qu'ils décrivent. */
  scopeLine?: string;
  /** Les repères chiffrés, sur la seconde rangée, à gauche des formes.
   *
   *  Ils avaient été sortis dans une bande au-dessus du panneau. La rangée des
   *  formes laissait alors un grand vide à gauche — précisément la place des
   *  repères. Ils y sont revenus. */
  highlights?: KpiItem[];
  /* Pas de `question` : le titre, deux lignes plus haut, dit déjà ce qu'on
     regarde. */
  /** Contenu propre à la base, entre l'en-tête et le graphique — un panneau
   *  de réglage (le masquage Cnam, par exemple) qui n'a pas sa place dans
   *  l'en-tête mais appartient à la même carte que le graphique. */
  beforeChart?: ReactNode;
  /** Contenu propre à la base, entre le graphique et le pied — la carte CSP
   *  y pose ses encarts DROM, hors champ de la projection cartographique. */
  afterChart?: ReactNode;
  /** La clé de lecture des couleurs, sous le graphique. C'est elle qui porte
   *  l'identité des séries : les étiquettes de bout de courbe s'effacent quand
   *  elles se recouvriraient, la légende, elle, les nomme toutes. */
  legend?: Array<{ key: string; label: string; color: string }>;
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
  /** Un repère qui ne tient pas sur la bande — le ratio femmes / hommes, une
   *  phrase entière — descend ici plutôt que de faire déborder la ligne. */
  tableNote?: string;
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
  kicker, title, scopeLine, highlights, headerActions, readings, reading, onReading, forms, form, onForm,
  beforeChart, afterChart, legend, height, option, exportOption, empty,
  loading = false, ariaLabel, onInstance,
  tableColumns, tableRows, tableNote, caveats, sourceLine, filenamePrefix, scope, onExtract, className,
}: Props) {
  const exportCsv = () => {
    const columns = tableColumns.map((column, index) => ({ key: String(index), label: column }));
    const rows = tableRows.map((row) => Object.fromEntries(row.map((cell, index) => [String(index), cell])));
    downloadText(`${filenamePrefix}_${tableColumns[0]?.toLowerCase() ?? "valeurs"}.csv`, csvFromRows(columns, rows));
  };

  return (
    <article className={`panel pathology-chart ${className ?? ""}`}>
      <header>
        <div>
          {/* Une seule amorce par écran. Le nom de la base est déjà porté par
              l'en-tête de page et la barre latérale : le répéter ici ajoutait
              une ligne qui n'apprend rien au-dessus du graphique. */}
          {kicker ? <span className="section-kicker">{kicker}</span> : null}
          <h3>{title}</h3>
          {/* Le périmètre, en gris, sur une ligne. Il vivait dans un en-tête de
              page hors panneau, avec un second titre au-dessus du premier. */}
          {scopeLine ? <small className="chart-shell-scope">{scopeLine}</small> : null}
        </div>
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

      {/* La seconde rangée, et la dernière : les repères à gauche, les formes
          et la palette à droite. C'est la bande de DAMIR, devenue la structure
          unique — elle attache les repères au graphique qu'ils résument, et
          comble le vide que les formes laissaient à leur gauche. */}
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
          <div className="damir-strip-controls">
            {forms ? (
              <ViewSwitch
                options={forms}
                value={form ?? ""}
                onChange={(key) => onForm?.(key)}
                label="Forme du graphique"
              />
            ) : null}
            <PaletteChoice />
          </div>
      </div>

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

      {legend && legend.length > 1 && option ? (
        <div className="chart-legend" role="list" aria-label="Séries affichées">
          {legend.map((item) => (
            <span key={item.key} className="legend-item" role="listitem">
              <i style={{ background: item.color }} />
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      ) : null}

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
              caveatCount={caveats.length}
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
          {tableNote ? <p className="damir-table-note">{tableNote}</p> : null}
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
