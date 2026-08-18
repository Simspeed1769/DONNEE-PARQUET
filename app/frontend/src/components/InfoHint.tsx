/** L'explication qui ne s'affiche que si on la demande.
 *
 *  **La règle, applicable partout.** Une explication de plus d'une ligne ne
 *  s'affiche pas en permanence : elle vit derrière cette icône, au plus près de
 *  ce qu'elle explique. Un paragraphe posé en travers de l'écran est lu une
 *  fois, puis il occupe la place tous les jours suivants.
 *
 *  **Ce qui ne se cache jamais**, et n'a donc rien à faire ici : les réserves
 *  méthodologiques attachées à une lecture — le bloc « Ce que ce graphique ne
 *  montre pas » — et les avertissements de comparabilité.
 *
 *  ## Pourquoi un portail
 *
 *  Le panneau était posé en `position: absolute` dans le flux. Sur le Tableau,
 *  le conteneur du tableau porte `overflow: auto` : le panneau y était **rogné
 *  et emporté par le défilement**, et il s'affichait par-dessus les cellules,
 *  illisible. Un portail vers `document.body` le sort de tout conteneur qui
 *  défile ; sa position est alors mesurée sur le déclencheur, en coordonnées
 *  de fenêtre, et corrigée s'il sort de l'écran.
 *
 *  ## Accessibilité
 *
 *  Le déclencheur est un vrai `<button>` : il prend le focus au clavier et
 *  s'ouvre à `Entrée` comme à la souris. Le panneau est lié par
 *  `aria-describedby`, `Échap` le ferme et rend le focus au bouton — une
 *  explication qui piégerait le focus serait pire que le paragraphe qu'elle
 *  remplace. Le survol ouvre, le clic **épingle**.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { POPOVER, m } from "./motion";

type Props = {
  /** Le texte court. Deux phrases au plus — au-delà, ce n'est plus une
   *  précision mais une page de méthode, et sa place est dans le référentiel. */
  children: string;
  /** Ce que l'icône explique, pour les lecteurs d'écran : « l'agrégation
   *  choisie », « la ligne Autres ». Compose l'étiquette du bouton. */
  label: string;
};

/** Largeur maximale du panneau, et marge gardée avec le bord de la fenêtre. */
const PANEL_WIDTH = 320;
const EDGE = 12;

export function InfoHint({ children, label }: Props) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ top: 0, left: 0 });
  /** Vrai quand l'ouverture vient d'un clic : le survol ne la referme pas. */
  const pinned = useRef(false);
  const holder = useRef<HTMLSpanElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLSpanElement | null>(null);
  const panelId = useId();

  /** Place le panneau sous son icône, puis le ramène dans la fenêtre s'il en
   *  sort — par le côté comme par le bas, où il repasse au-dessus de l'icône. */
  const position = useCallback(() => {
    const anchor = trigger.current?.getBoundingClientRect();
    if (!anchor) return;
    const height = panel.current?.offsetHeight ?? 0;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 2 * EDGE);

    let left = anchor.left + anchor.width / 2 - width / 2;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - width - EDGE));

    let top = anchor.bottom + 8;
    if (height && top + height > window.innerHeight - EDGE) {
      const above = anchor.top - height - 8;
      if (above > EDGE) top = above;
      else top = Math.max(EDGE, window.innerHeight - height - EDGE);
    }
    setPlace({ top, left });
  }, []);

  // Mesuré avant peinture : sans cela le panneau apparaît une frame à sa
  // position par défaut, puis saute à la bonne.
  useLayoutEffect(() => { if (open) position(); }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const close = () => { pinned.current = false; setOpen(false); };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!holder.current?.contains(target) && !panel.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      // Le focus revient tout de suite : aucune animation ne le retarde.
      trigger.current?.focus();
    };
    // Le panneau est en coordonnées de fenêtre : il doit suivre le défilement
    // de la page comme celui d'un conteneur interne, d'où la capture.
    const onScroll = () => position();
    const frame = window.requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onPointerDown);
    });
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, position]);

  return (
    <span
      className="info-hint"
      ref={holder}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinned.current) setOpen(false); }}
    >
      <button
        type="button"
        ref={trigger}
        className="info-hint-trigger"
        aria-label={`En savoir plus sur ${label}`}
        aria-expanded={open}
        aria-describedby={open ? panelId : undefined}
        onClick={() => {
          const wasPinned = pinned.current;
          pinned.current = !wasPinned;
          setOpen(!wasPinned);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned.current) setOpen(false); }}
      >?</button>

      {createPortal(
        <AnimatePresence>
          {open ? (
            <m.span
              ref={panel}
              className="info-hint-panel"
              role="tooltip"
              id={panelId}
              style={{ top: place.top, left: place.left }}
              onMouseEnter={() => setOpen(true)}
              onMouseLeave={() => { if (!pinned.current) setOpen(false); }}
              {...POPOVER}
            >
              {children}
            </m.span>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </span>
  );
}
