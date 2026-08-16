/** Le choix de vue : cinq d'accès direct, le reste replié.
 *
 *  Dix boutons de vue en permanence, c'était trop : la bande de commandes
 *  passait sur deux lignes et poussait le graphique sous la ligne de flottaison
 *  d'un portable. Les cinq vues qui répondent aux questions courantes —
 *  Courbes, Barres, Classement, Base 100, Variation — restent à un clic ; les
 *  formes de composition et de comparaison croisée s'ouvrent sous « Autres
 *  vues ».
 *
 *  **Le repli est cosmétique, jamais une autorisation.** C'est toujours le
 *  modèle qui décide des formes licites : une vue qui mentirait — un camembert
 *  sur une mesure non additive, une carte de chaleur à deux séries — n'arrive
 *  pas jusqu'ici. Ce composant ne reçoit que des vues déjà permises, et se
 *  contente de choisir lesquelles méritent un bouton visible.
 *
 *  Quand la vue active est repliée, son nom s'écrit sur le bouton de repli :
 *  sans cela, l'écran afficherait un camembert sans que rien ne dise pourquoi.
 */

import { useEffect, useRef, useState } from "react";

export type ViewOption = { key: string; label: string };

/** Les vues d'accès direct, dans cet ordre. Tout le reste se replie.
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
};

export function ViewSwitch({ options, value, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement | null>(null);

  const primary = options.filter((item) => PRIMARY_VIEWS.includes(item.key as never));
  const folded = options.filter((item) => !PRIMARY_VIEWS.includes(item.key as never));
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
          {open ? (
            <div className="view-more-popover" role="group" aria-label={`${label} — autres vues`}>
              {folded.map(button)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
