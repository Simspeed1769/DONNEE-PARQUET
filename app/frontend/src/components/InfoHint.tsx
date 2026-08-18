/** L'explication qui ne s'affiche que si on la demande.
 *
 *  **La règle, applicable partout.** Une explication de plus d'une ligne ne
 *  s'affiche pas en permanence : elle vit derrière cette icône, au plus près de
 *  ce qu'elle explique. Un paragraphe posé en travers de l'écran est lu une
 *  fois, puis il occupe la place tous les jours suivants.
 *
 *  **Ce qui ne se cache jamais**, et n'a donc rien à faire ici : les réserves
 *  méthodologiques attachées à une lecture — le bloc « Ce que ce graphique ne
 *  montre pas » — et les avertissements de comparabilité. Ceux-là disent ce que
 *  le graphique ne dit pas ; les mettre derrière une icône reviendrait à parier
 *  que le lecteur ira la chercher.
 *
 *  ## Accessibilité
 *
 *  Le déclencheur est un vrai `<button>` : il prend le focus au clavier et
 *  s'ouvre à `Entrée` comme à la souris. Le panneau est lié par
 *  `aria-describedby`, `Échap` le ferme et rend le focus au bouton — une
 *  explication qui piégerait le focus serait pire que le paragraphe qu'elle
 *  remplace.
 *
 *  Le survol ouvre aussi, mais ne ferme que le survol : un panneau ouvert au
 *  clic ne se referme pas parce que la souris a glissé.
 */

import { useEffect, useId, useRef, useState } from "react";
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

export function InfoHint({ children, label }: Props) {
  const [open, setOpen] = useState(false);
  /** Vrai quand l'ouverture vient d'un clic : le survol ne la referme pas. */
  const pinned = useRef(false);
  const holder = useRef<HTMLSpanElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panelId = useId();

  // Même piège que partout ailleurs dans le dépôt : l'écoute posée dans la
  // foulée du clic d'ouverture capte ce clic-là et referme aussitôt. Elle est
  // donc installée à la frame suivante.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!holder.current?.contains(event.target as Node)) {
        pinned.current = false;
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      pinned.current = false;
      setOpen(false);
      // Le focus revient tout de suite : aucune animation ne le retarde.
      trigger.current?.focus();
    };
    const frame = window.requestAnimationFrame(() => {
      document.addEventListener("pointerdown", onPointerDown);
    });
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
        // Le clic **épingle**, il ne bascule pas. À la souris, `onMouseEnter` a
        // déjà ouvert le panneau au moment où le clic arrive : une bascule le
        // refermait donc aussitôt, et il devenait impossible de le fixer.
        onClick={() => {
          const wasPinned = pinned.current;
          pinned.current = !wasPinned;
          setOpen(!wasPinned);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => { if (!pinned.current) setOpen(false); }}
      >?</button>

      <AnimatePresence>
        {open ? (
          <m.span className="info-hint-panel" role="tooltip" id={panelId} {...POPOVER}>
            {children}
          </m.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
