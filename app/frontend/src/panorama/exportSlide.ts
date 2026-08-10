/** Sortir une image de l'outil sans qu'elle perde ce qui la rend lisible.
 *
 *  Copier le seul canevas du graphique produirait une image muette : ni titre,
 *  ni périmètre, ni source. Projetée dans une réunion, elle demanderait à celui
 *  qui la montre de refaire de mémoire le travail que l'écran avait déjà fait.
 *  On recompose donc l'image complète — périmètre, titre, réserves, source,
 *  date — autour du tracé.
 *
 *  Trois règles, valables pour **tous** les écrans :
 *
 *  1. **Un format unique, 16:9.** 1600 × 900 logiques, deux fois la densité :
 *     l'image se pose dans une diapositive sans être recadrée, et reste nette
 *     une fois projetée. La hauteur du graphique à l'écran n'entre pas en
 *     compte — c'est le cadre qui commande, pas la fenêtre.
 *  2. **Toujours un fond clair.** Le tracé est **re-rendu** avec la palette
 *     claire plutôt que capturé à l'écran : un export lancé en thème sombre
 *     produit exactement la même image qu'en thème clair. C'est pour cela que
 *     ce module reçoit une *fabrique* d'options et non une instance vivante.
 *  3. **Les réserves voyagent.** Ce que l'écran range dans un tiroir, l'image
 *     l'écrit : hors de l'outil, personne n'est là pour le rappeler.
 */

import { echarts, type EChartsOption } from "../charts/EChart";
import { readLightTokens, type ChartTokens } from "../charts/tokens";

/** 16:9, la seule forme que prend une image sortie d'ici. */
const WIDTH = 1600;
const HEIGHT = 900;
/** Deux fois la densité de l'écran : l'image reste nette une fois projetée. */
const PIXEL_RATIO = 2;

const PADDING = 56;
const TITLE_SIZE = 38;
const READING_SIZE = 21;
const FOOT_SIZE = 17;
const CAVEAT_SIZE = 16;
/** En deçà, le tracé n'est plus lisible : ce sont les réserves qui cèdent la
 *  place, jamais le graphique. */
const MIN_CHART_HEIGHT = 300;

export const SOURCE_LINE = "Source · Open DAMIR, Assurance Maladie · Traitement Forsides";

export type SlideExport = {
  title: string;
  /** Le périmètre en une ligne : sans lui l'image ne dit pas de quoi elle parle. */
  scope: string;
  caveats: string[];
  /** Une phrase de lecture, quand l'écran en produit une (la conclusion d'un
   *  croisement, par exemple). Les écrans dont le graphique parle seul n'en
   *  passent pas. */
  reading?: string | null;
  /** Mention de source : chaque base porte la sienne. */
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

/** Rend le tracé hors écran, à la taille du cadre et dans la palette claire.
 *
 *  Une instance séparée plutôt que celle de l'écran : c'est ce qui permet de
 *  changer à la fois la palette et les proportions sans toucher à ce que
 *  l'utilisateur a sous les yeux.
 */
async function renderChart(
  buildOption: (tokens: ChartTokens) => EChartsOption,
  tokens: ChartTokens, width: number, height: number,
): Promise<HTMLImageElement> {
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${width}px;height:${height}px;`;
  document.body.appendChild(holder);
  const instance = echarts.init(holder, undefined, { renderer: "canvas" });
  try {
    // Sans `animation: false`, la capture attrape le tracé au milieu de son
    // entrée : des barres à mi-hauteur, une courbe encore en train de se poser.
    instance.setOption({ ...buildOption(tokens), animation: false }, { notMerge: true });
    return await loadImage(instance.getDataURL({
      type: "png", pixelRatio: PIXEL_RATIO, backgroundColor: tokens.surface,
    }));
  } finally {
    instance.dispose();
    holder.remove();
  }
}

/** Compose l'image complète et la rend sous forme de blob PNG. */
export async function renderSlide(
  buildOption: (tokens: ChartTokens) => EChartsOption,
  slide: SlideExport,
): Promise<Blob> {
  // Le thème de l'écran n'est jamais lu ici : l'image est la même en clair
  // qu'en sombre, et c'est une garantie, pas une préférence.
  const tokens = readLightTokens();
  const inner = WIDTH - PADDING * 2;

  const meter = document.createElement("canvas").getContext("2d");
  if (!meter) throw new Error("Le rendu d’image n’est pas disponible dans ce navigateur.");

  const bold = (size: number) => `650 ${size}px ${tokens.font}`;
  const plain = (size: number) => `400 ${size}px ${tokens.font}`;

  meter.font = bold(TITLE_SIZE);
  const titleLines = wrap(meter, slide.title, inner);
  meter.font = plain(READING_SIZE);
  const readingLines = slide.reading ? wrap(meter, slide.reading, inner) : [];
  meter.font = plain(CAVEAT_SIZE);
  const allCaveatLines = slide.caveats.flatMap((caveat) => wrap(meter, `— ${caveat}`, inner));

  const headHeight = PADDING
    + FOOT_SIZE * 1.4 + 12
    + titleLines.length * (TITLE_SIZE * 1.25)
    + (readingLines.length ? 18 + readingLines.length * (READING_SIZE * 1.45) : 0)
    + 26;

  const footFor = (lineCount: number) =>
    26 + (lineCount ? lineCount * (CAVEAT_SIZE * 1.5) + 18 : 0) + FOOT_SIZE * 1.5 + PADDING;

  // Les réserves cèdent la place au tracé, jamais l'inverse — mais ce qui est
  // retiré est annoncé plutôt que tu.
  let caveatLines = allCaveatLines;
  let truncated = 0;
  while (caveatLines.length
         && HEIGHT - headHeight - footFor(caveatLines.length + 1) < MIN_CHART_HEIGHT) {
    caveatLines = caveatLines.slice(0, -1);
    truncated += 1;
  }
  if (truncated > 0) {
    meter.font = plain(CAVEAT_SIZE);
    caveatLines = [...caveatLines,
      ...wrap(meter, `— ${truncated} autre${truncated > 1 ? "s" : ""} réserve${truncated > 1 ? "s" : ""}, à lire dans l’outil.`, inner)];
  }

  const footHeight = footFor(caveatLines.length);
  const chartHeight = Math.max(MIN_CHART_HEIGHT, HEIGHT - headHeight - footHeight);
  const chart = await renderChart(buildOption, tokens, inner, chartHeight);

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH * PIXEL_RATIO;
  canvas.height = HEIGHT * PIXEL_RATIO;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Le rendu d’image n’est pas disponible dans ce navigateur.");
  context.scale(PIXEL_RATIO, PIXEL_RATIO);

  context.fillStyle = tokens.surface;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  let cursor = PADDING;

  // Le périmètre d'abord, en petit : c'est la question à laquelle le titre répond.
  context.fillStyle = tokens.inkMuted;
  context.font = plain(FOOT_SIZE);
  context.textBaseline = "top";
  context.fillText(slide.scope, PADDING, cursor);
  cursor += FOOT_SIZE * 1.4 + 12;

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

  context.drawImage(chart, PADDING, headHeight, inner, chartHeight);
  cursor = headHeight + chartHeight + 26;

  if (caveatLines.length) {
    context.strokeStyle = tokens.line;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(PADDING, cursor - 12);
    context.lineTo(WIDTH - PADDING, cursor - 12);
    context.stroke();
    context.fillStyle = tokens.inkMuted;
    context.font = plain(CAVEAT_SIZE);
    caveatLines.forEach((line) => {
      context.fillText(line, PADDING, cursor);
      cursor += CAVEAT_SIZE * 1.5;
    });
    cursor += 18;
  }

  // La source et la date d'export, sur la même ligne : d'où vient l'image, et
  // de quand elle date — une donnée consolidée depuis n'aurait pas les mêmes
  // chiffres.
  context.fillStyle = tokens.inkMuted;
  context.font = plain(FOOT_SIZE);
  const stamp = `Exporté le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())}`;
  context.fillText(slide.sourceLine ?? SOURCE_LINE, PADDING, cursor);
  const stampWidth = context.measureText(stamp).width;
  context.fillText(stamp, WIDTH - PADDING - stampWidth, cursor);

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
