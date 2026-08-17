/** Le choix de vue, et son repli **quand l'appelant en demande un**.
 *
 *  Dix boutons de vue en permanence, c'était trop : la bande de commandes
 *  passait sur deux lignes et poussait le graphique sous la ligne de flottaison
 *  d'un portable. D'où « Autres vues » — mais le composant décidait seul, sur
 *  une liste écrite ici, quelles vues méritaient un bouton visible. Un écran qui
 *  n'offre que trois formes héritait donc d'un bouton de repli qui ne repliait
 *  rien, tout en ajoutant un contrôle : l'inverse de ce qu'on lui demandait.
 *
 *  **Le repli est devenu une propriété du modèle.** L'appelant nomme les vues à
 *  replier ; s'il n'en nomme aucune, tout est en accès direct et aucun bouton
 *  n'apparaît. Le Panorama des cinq bases ne replie rien ; seul le Comparer de
 *  DAMIR, qui offre dix formes, garde son repli.
 *
 *  **Le repli reste cosmétique, jamais une autorisation.** C'est toujours le
 *  modèle qui décide des formes licites : une vue qui mentirait — un camembert
 *  sur une mesure non additive, une carte de chaleur à deux séries — n'arrive
 *  pas jusqu'ici. Ce composant ne reçoit que des vues déjà permises.
 *
 *  Quand la vue active est repliée, son nom s'écrit sur le bouton de repli :
 *  sans cela, l'écran afficherait un camembert sans que rien ne dise pourquoi.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "motion/react";
import { POPOVER, m } from "./motion";

export type ViewOption = { key: string; label: string };

/** Les vues que le **Comparer de DAMIR** garde en accès direct ; il replie le
 *  reste. Elle vit ici parce que c'est le seul écran qui replie, et qu'une
 *  constante partagée par un unique appelant n'a pas à voyager.
 *
 *  Le critère : répondent-elles à une question qu'on se pose *avant* d'avoir
 *  une hypothèse ? Combien, combien par période, laquelle pèse le plus,
 *  laquelle progresse le plus vite, de combien ça bouge. Les formes de
 *  composition (empilé, camembert, aires) et de croisement (écarts, carte de
 *  chaleur) répondent à une question qu'on ne pose qu'ensuite.
 */
export const PRIMARY_VIEWS = ["line", "bar", "rank", "index", "change"] as const;

type Props = {
  options: ViewOption[];
  value: string;
  onChange: (key: string) => void;
  /** Nom du groupe pour les lecteurs d'écran : « Vue », « Forme du graphique ». */
  label: string;
  /** Les vues à replier derrière « Autres vues ».
   *
   *  Omise ou vide : rien n'est replié et le bouton n'existe pas. C'est le cas
   *  de tous les Panoramas — leurs trois ou quatre formes tiennent sur une
   *  rangée, et un bouton de repli n'y aurait rien à replier. */
  folded?: readonly string[];
};

export function ViewSwitch({ options, value, onChange, label, folded: foldedKeys }: Props) {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement | null>(null);

  const shouldFold = (key: string) => Boolean(foldedKeys?.includes(key));
  const primary = options.filter((item) => !shouldFold(item.key));
  const folded = options.filter((item) => shouldFold(item.key));
  const foldedActive = folded.find((item) => item.key === value) ?? null;

  // Même piège que partout ailleurs dans le dépôt : l'écoute posée dans la
  // foulée du clic d'ouverture capte ce clic-là et referme aussitôt. Elle est
  // donc installée à la frame suivante.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
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

  const button = (item: ViewOption) => (
    <button
      key={item.key}
      type="button"
      aria-pressed={value === item.key}
      className={value === item.key ? "active" : ""}
      onClick={() => { onChange(item.key); setOpen(false); }}
    >{item.label}</button>
  );

  // Une seule vue permise : le choix n'en est pas un, on n'affiche rien.
  if (options.length < 2) return null;

  return (
    <div className="view-switch" ref={holder}>
      <div className="pathology-toggle damir-forms" role="group" aria-label={label}>
        {primary.map(button)}
      </div>

      {folded.length ? (
        <div className="view-more">
          <button
            type="button"
            className={`view-more-toggle ${foldedActive ? "active" : ""} ${open ? "open" : ""}`}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {foldedActive ? foldedActive.label : "Autres vues"}
            <em>{folded.length}</em>
          </button>
          {/* `AnimatePresence` retient le panneau le temps de sa sortie ;
              sans lui, un panneau qu'on referme disparaît d'un coup et le
              geste n'a pas de fin visible. */}
          <AnimatePresence>
            {open ? (
              <m.div
                className="view-more-popover"
                role="group"
                aria-label={`${label} — autres vues`}
                {...POPOVER}
              >
                {folded.map(button)}
              </m.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}
