/** Le tiroir « Modifier les séries ».
 *
 *  Il remplace le panneau qui s'ouvrait par-dessus la page. Celui-ci recouvrait
 *  le bandeau et les filtres qu'il prolonge, masquait le graphique qu'on était
 *  en train de modifier, et posait sa propre barre de défilement à l'intérieur
 *  de celle de la page : deux ascenseurs pour un seul geste.
 *
 *  Le tiroir s'ancre à droite sur toute la hauteur et **pousse la page** au lieu
 *  de la recouvrir : le graphique reste visible à gauche et chaque modification
 *  s'y répercute en direct. Un seul défilement, celui du tiroir.
 *
 *  Ce que la coquille prend en charge, une fois pour les cinq bases : la touche
 *  `Échap`, le piège à focus, le retour du focus sur le bouton qui a ouvert, et
 *  le pied fixe qui porte l'ajout, le compteur et la fermeture.
 */

import { AnimatePresence } from "motion/react";
import { DRAWER, m } from "./motion";
import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Le périmètre commun en une ligne, rappelé sous le titre. */
  subtitle: string;
  /** Les séries et leurs réglages. */
  children: ReactNode;
  /** Ce qui reste sous la main quoi qu'on ait fait défiler, à gauche du
   *  compteur. Facultatif : le pied porte toujours le compte et la fermeture. */
  action?: ReactNode;
  count: string;
};

/** L'attribut que la page lit pour se pousser. Il vit sur la racine plutôt que
 *  dans un état React : le décalage concerne toute la coquille, qui n'a pas à
 *  connaître le tiroir. */
const ROOT_FLAG = "data-drawer";

export function SeriesDrawer({ open, onClose, title, subtitle, children, action, count }: Props) {
  const panel = useRef<HTMLDivElement | null>(null);
  /** Ce qui avait le focus avant l'ouverture : c'est là qu'il retourne. */
  const opener = useRef<HTMLElement | null>(null);
  /** `onClose` est refait à chaque rendu par l'appelant. Le garder en
   *  dépendance d'effet relançait celui-ci à chaque rendu : l'attribut de la
   *  racine était retiré puis reposé, la page se poussait et se dépoussait, et
   *  la largeur du graphique vibrait jusqu'à figer le rendu. Il passe donc par
   *  une référence, et les effets ne dépendent plus que de l'ouverture. */
  const close = useRef(onClose);
  close.current = onClose;

  // L'attribut que la page lit pour se pousser, posé une fois à l'ouverture.
  useEffect(() => {
    if (!open) return;
    document.documentElement.setAttribute(ROOT_FLAG, "open");
    return () => document.documentElement.removeAttribute(ROOT_FLAG);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement as HTMLElement | null;

    const focusable = () => [...(panel.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
    ) ?? [])].filter((item) => !item.hasAttribute("disabled") && item.offsetParent !== null);

    // Le premier élément prend le focus : on entre dans le tiroir au clavier
    // sans avoir à traverser toute la page. Une seule fois, à l'ouverture —
    // le refaire à chaque rendu volerait le curseur au champ qu'on remplit.
    const frame = window.requestAnimationFrame(() => focusable()[0]?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab") return;
      // Le focus est piégé : tant que le tiroir est ouvert, la tabulation
      // tourne à l'intérieur plutôt que d'aller manipuler une page qu'on ne
      // peut plus voir entièrement.
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.current?.contains(active))) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault(); first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  /** Le focus revient sur le bouton qui a ouvert, jamais en haut de page.
   *
   *  Ce qu'on avait retenu à l'ouverture peut avoir disparu du document entre
   *  temps, ou n'avoir jamais été un élément focusable — le corps de la page,
   *  quand l'ouverture vient d'ailleurs que d'un clic. On retombe alors sur le
   *  bouton du bandeau, qui est de toute façon la bonne destination. */
  useEffect(() => {
    if (open) return;
    const previous = opener.current;
    opener.current = null;
    const target = previous && previous.isConnected && previous !== document.body
      ? previous
      : document.querySelector<HTMLElement>(".compare-rail-toggle");
    target?.focus?.();
  }, [open]);

  // Le tiroir entre et sort par la droite. `AnimatePresence` le retient le
  // temps de sa sortie ; le `if (!open) return null` d'avant le faisait
  // disparaître d'un coup, et l'écran semblait sauter.
  return (
    <AnimatePresence>
    {open ? (
    <m.aside
      className="series-drawer"
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      {...DRAWER}
    >
      <header className="series-drawer-head">
        <div>
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </div>
        <button type="button" className="series-drawer-close" onClick={onClose}
          title="Fermer le tiroir (Échap)" aria-label="Fermer le tiroir">✕</button>
      </header>

      <div className="series-drawer-body">{children}</div>

      <footer className="series-drawer-foot">
        {action}
        <span className="series-drawer-count">{count}</span>
        <button type="button" className="drawer-add" onClick={onClose}>Fermer</button>
      </footer>
    </m.aside>
    ) : null}
    </AnimatePresence>
  );
}
