/** Sortir une diapositive de l'outil sans qu'elle perde ce qui la rend lisible.
 *
 *  Copier le seul canevas du graphique produirait une image muette : ni titre,
 *  ni lecture, ni source. Projetée dans une réunion, elle demanderait à
 *  celui qui la montre de refaire de mémoire le travail que l'écran avait déjà
 *  fait. On recompose donc l'image complète — titre, phrase de lecture,
 *  réserves, mention de source — autour du tracé rendu à l'écran.
 *
 *  Le tracé vient de l'instance vivante plutôt que d'un rendu parallèle : ce
 *  qu'on colle est exactement ce qu'on voyait, à la même échelle, avec les
 *  mêmes couleurs de thème. Une seconde fabrique divergerait tôt ou tard.
 */

import type { ECharts } from "echarts/core";
import type { ChartTokens } from "../charts/tokens";

const PADDING = 40;
const TITLE_SIZE = 30;
const READING_SIZE = 19;
const FOOT_SIZE = 15;
const CAVEAT_SIZE = 15;
/** Deux fois la densité de l'écran : l'image reste nette une fois projetée. */
const PIXEL_RATIO = 2;

export const SOURCE_LINE = "Source · Open DAMIR, Assurance Maladie · Traitement Forsides";

export type SlideExport = {
  title: string;
  reading: string | null;
  caveats: string[];
  /** Le périmètre en une ligne : sans lui l'image ne dit pas de quoi elle parle. */
  scope: string;
  /** Mention de source : chaque base porte la sienne. `SOURCE_LINE` reste le
   *  réglage par défaut de DAMIR, seul appelant à ne pas le préciser. */
  sourceLine?: string;
};

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Le tracé n’a pas pu être rendu en image."));
    image.src = source;
  });
}

/** Compose l'image complète et la rend sous forme de blob PNG. */
export async function renderSlide(
  instance: ECharts, slide: SlideExport, tokens: ChartTokens,
): Promise<Blob> {
  const dataUrl = instance.getDataURL({
    type: "png",
    pixelRatio: PIXEL_RATIO,
    backgroundColor: tokens.surface,
  });
  const chart = await loadImage(dataUrl);

  const width = chart.width / PIXEL_RATIO;
  const inner = width - PADDING * 2;

  // Une première passe mesure le texte pour connaître la hauteur nécessaire ;
  // la seconde dessine. Réserver une hauteur fixe couperait les lectures
  // longues, qui sont précisément celles qui portent une réserve.
  const meter = document.createElement("canvas").getContext("2d");
  if (!meter) throw new Error("Le rendu d’image n’est pas disponible dans ce navigateur.");

  const bold = (size: number) => `650 ${size}px ${tokens.font}`;
  const plain = (size: number) => `400 ${size}px ${tokens.font}`;

  meter.font = bold(TITLE_SIZE);
  const titleLines = wrap(meter, slide.title, inner);
  meter.font = plain(READING_SIZE);
  const readingLines = slide.reading ? wrap(meter, slide.reading, inner) : [];
  meter.font = plain(CAVEAT_SIZE);
  const caveatLines = slide.caveats.flatMap((caveat) => wrap(meter, `— ${caveat}`, inner));

  const headHeight = PADDING
    + titleLines.length * (TITLE_SIZE * 1.25)
    + 10
    + FOOT_SIZE * 1.4
    + (readingLines.length ? 18 + readingLines.length * (READING_SIZE * 1.45) : 0)
    + 22;
  const footHeight = 22
    + (caveatLines.length ? caveatLines.length * (CAVEAT_SIZE * 1.5) + 16 : 0)
    + FOOT_SIZE * 1.5
    + PADDING;

  const height = headHeight + chart.height / PIXEL_RATIO + footHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width * PIXEL_RATIO;
  canvas.height = height * PIXEL_RATIO;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Le rendu d’image n’est pas disponible dans ce navigateur.");
  context.scale(PIXEL_RATIO, PIXEL_RATIO);

  context.fillStyle = tokens.surface;
  context.fillRect(0, 0, width, height);

  let cursor = PADDING;

  // Le périmètre d'abord, en petit : c'est la question à laquelle le titre répond.
  context.fillStyle = tokens.inkMuted;
  context.font = plain(FOOT_SIZE);
  context.textBaseline = "top";
  context.fillText(slide.scope, PADDING, cursor);
  cursor += FOOT_SIZE * 1.4 + 10;

  context.fillStyle = tokens.ink;
  context.font = bold(TITLE_SIZE);
  titleLines.forEach((line) => {
    context.fillText(line, PADDING, cursor);
    cursor += TITLE_SIZE * 1.25;
  });

  if (readingLines.length) {
    cursor += 18;
    context.fillStyle = tokens.inkSecondary;
    context.font = plain(READING_SIZE);
    readingLines.forEach((line) => {
      context.fillText(line, PADDING, cursor);
      cursor += READING_SIZE * 1.45;
    });
  }

  context.drawImage(chart, PADDING, headHeight, inner, chart.height / PIXEL_RATIO);
  cursor = headHeight + chart.height / PIXEL_RATIO + 22;

  if (caveatLines.length) {
    context.strokeStyle = tokens.line;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(PADDING, cursor - 10);
    context.lineTo(width - PADDING, cursor - 10);
    context.stroke();
    context.fillStyle = tokens.inkMuted;
    context.font = plain(CAVEAT_SIZE);
    caveatLines.forEach((line) => {
      context.fillText(line, PADDING, cursor);
      cursor += CAVEAT_SIZE * 1.5;
    });
    cursor += 16;
  }

  context.fillStyle = tokens.inkMuted;
  context.font = plain(FOOT_SIZE);
  context.fillText(slide.sourceLine ?? SOURCE_LINE, PADDING, cursor);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("L’image n’a pas pu être encodée."));
    }, "image/png");
  });
}

function fileName(title: string, prefix: string): string {
  const slug = title
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 72);
  return `${prefix}-${slug || "graphique"}.png`;
}

/** L'unique sortie image.
 *
 *  La copie dans le presse-papiers a été retirée : elle offrait un second
 *  bouton pour le même geste, échouait silencieusement selon le navigateur —
 *  Firefox et tout contexte non sécurisé n'ont pas de presse-papiers d'images —
 *  et obligeait l'interface à annoncer laquelle des deux issues avait eu lieu.
 *  Un fichier PNG se glisse dans n'importe quelle présentation, partout.
 */
export function download(blob: Blob, title: string, prefix = "damir"): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName(title, prefix);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
