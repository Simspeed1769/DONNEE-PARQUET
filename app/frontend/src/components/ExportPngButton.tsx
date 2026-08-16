/** « Enregistrer en PNG », partout pareil.
 *
 *  Le titre de l'image est calculé par l'écran, mais il n'est pas toujours
 *  celui qu'on veut voir en tête d'une diapositive : « Montant remboursé,
 *  2015–2024 » décrit la lecture, pas le propos qu'on en tire. Le champ est
 *  donc pré-rempli et modifiable, et c'est le seul réglage — deux clics au
 *  plus entre le graphique et le fichier.
 *
 *  Le rendu lui-même appartient à `exportSlide.ts`, qui compose toujours en
 *  16:9 et sur fond clair : ce composant ne décide de rien d'autre que du
 *  moment et du titre.
 */

import { useEffect, useRef, useState } from "react";
import type { EChartsOption } from "../charts/EChart";
import type { ChartTokens } from "../charts/tokens";
import { download, renderSlide } from "../panorama/exportSlide";

type Props = {
  /** Titre calculé de la lecture : ce que le champ propose d'emblée. */
  defaultTitle: string;
  scope: string;
  sourceLine: string;
  filenamePrefix: string;
  /** Fabrique d'options plutôt qu'option toute faite : l'image est re-rendue
   *  avec la palette claire, quel que soit le thème à l'écran. */
  buildOption: (tokens: ChartTokens) => EChartsOption;
  /** Combien de réserves accompagnent la lecture. L'image en porte le nombre et
   *  le renvoi, jamais le texte : voir l'en-tête de `exportSlide.ts`. */
  caveatCount?: number;
  disabled?: boolean;
};

export function ExportPngButton({
  defaultTitle, scope, sourceLine, filenamePrefix, buildOption, caveatCount, disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(defaultTitle);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  // Le titre proposé suit la lecture tant qu'on ne l'a pas ouvert : changer de
  // vue ne doit pas laisser un titre périmé dans le champ.
  useEffect(() => { if (!open) setTitle(defaultTitle); }, [defaultTitle, open]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    input.current?.select();
    const onPointerDown = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const save = async () => {
    const chosen = title.trim() || defaultTitle;
    setBusy(true);
    setNotice(null);
    try {
      const blob = await renderSlide(buildOption, { title: chosen, scope, sourceLine, caveatCount });
      download(blob, chosen, filenamePrefix);
      setOpen(false);
      setNotice("Image enregistrée.");
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "L’image n’a pas pu être produite.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="export-png">
      {notice ? <span className="damir-notice" role="status">{notice}</span> : null}
      <button type="button" onClick={() => setOpen((value) => !value)} disabled={disabled} aria-expanded={open}>
        Enregistrer en PNG
      </button>

      {open ? (
        <div className="export-png-panel" ref={panel} role="dialog" aria-label="Enregistrer l’image">
          <label>
            <span>Titre de l’image</span>
            <input
              ref={input}
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void save(); } }}
            />
          </label>
          <p>
            Image 16:9, fond clair : le périmètre, le titre, le graphique, la source et la date.
            {caveatCount
              ? " L’image indique qu’il y a des réserves et où les lire ; leur texte reste dans l’outil."
              : ""}
          </p>
          <div className="export-png-actions">
            <button type="button" className="link-button" onClick={() => setOpen(false)}>Annuler</button>
            <button type="button" onClick={() => void save()} disabled={busy}>
              {busy ? "Génération…" : "Enregistrer"}
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}
