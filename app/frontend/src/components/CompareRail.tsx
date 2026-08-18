/** « Ce que je compare » — le bandeau, ses puces, et le réglage d'une série.
 *
 *  Le bandeau est à sa place : hors du panneau blanc, entre les filtres et le
 *  graphique. Ce qu'il fallait corriger tenait en deux points.
 *
 *  **Il pesait autant que la barre de filtres** qu'il ne fait que prolonger :
 *  un fond gris, un intitulé en capitales, cinq croix pleinement contrastées,
 *  et des puces qui passaient à la ligne dès que les libellés s'allongeaient.
 *  Il vit désormais sur le fond de la page, sur **une seule ligne** : les
 *  libellés sont tronqués, et ce qui ne tient pas se replie dans une puce
 *  « +N autres » qui ouvre le tiroir.
 *
 *  **Il ne faisait rien.** Filtrer une série demandait d'ouvrir « Modifier les
 *  séries », d'y trouver sa ligne, puis d'y déplier son périmètre. Un clic sur
 *  la puce ouvre maintenant son réglage sur place. Le tiroir reste l'outil de
 *  masse — ajouter, réordonner, comparer les périmètres côte à côte — et les
 *  deux chemins écrivent dans le même état.
 *
 *  Ce que ce composant ne fait pas : la logique de filtrage. Le contenu du
 *  popover est fourni par la base appelante, qui sait ce qu'elle sait filtrer.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import { CHIP, POPOVER, m } from "./motion";
import { formatValue } from "../utils";

export type RailChip = {
  key: string;
  label: string;
  /** La couleur du tracé, lue au moment du rendu : elle suit donc la palette. */
  color: string;
  /** Le poids de la série sur la période. Absent, la ligne n'en affiche pas. */
  value?: number | null;
  /** Faux sur la dernière série — une comparaison vide n'a rien à montrer — et
   *  sur les lignes qui ne se suppriment pas mais s'éteignent. */
  removable: boolean;
  /** Le repli « Reste du périmètre » : il se masque, il ne se supprime pas, et
   *  il n'a pas de périmètre propre à régler. */
  isOther?: boolean;
};

type Props = {
  chips: RailChip[];
  /** La nature des valeurs, pour les mettre en forme. */
  kind: string;
  onRemove: (key: string) => void;
  /** Ouvre le tiroir. La clé, quand elle est fournie, désigne la série sur
   *  laquelle l'ouvrir. */
  onOpenDrawer: (key?: string) => void;
  /** Le nom écrit à la main, et de quoi l'écrire. Absent, le nom n'est pas
   *  éditable depuis la puce. */
  nameOf?: (key: string) => string;
  onNameChange?: (key: string, name: string) => void;
  /** Le périmètre de cette série, rendu par la base : `AdvancedFilterPanel`
   *  pour DAMIR, les champs de la base pour les autres. Aucune logique de
   *  filtrage ne vit ici. */
  renderScope?: (key: string) => ReactNode;
};

/** Au-delà, un libellé mange la rangée. Le texte complet reste à l'infobulle et
 *  dans `title` : rien n'est perdu, seule la place l'est. */
const MAX_LABEL = 28;

/** Sous cette largeur de fenêtre, un popover flottant n'a plus la place de se
 *  poser : il devient une feuille ancrée en bas d'écran. */
const SHEET_WIDTH = 720;

/** La largeur qu'on réserve à « +N autres » tant qu'elle n'est pas rendue. */
const MORE_WIDTH = 84;

function shorten(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1).trimEnd()}…` : label;
}

export function CompareRail({
  chips, kind, onRemove, onOpenDrawer, nameOf, onNameChange, renderScope,
}: Props) {
  const row = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(chips.length);
  const [open, setOpen] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; align: "left" | "right" }>({ left: 0, align: "left" });
  const [sheet, setSheet] = useState(false);
  const popover = useRef<HTMLDivElement | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  /* — Combien de puces tiennent sur la ligne —
   *
   * La mesure se fait sur une **rangée fantôme**, hors écran, qui porte
   * toujours toutes les puces à leur largeur réelle. Mesurer la rangée visible
   * ne marchait pas : une puce repliée est retirée du flux, sa largeur tombe à
   * zéro, la mesure suivante conclut que tout tient, la rangée se remplit, la
   * mesure d'après conclut l'inverse — et le rendu oscillait jusqu'à figer
   * l'onglet. La rangée fantôme, elle, ne change jamais.
   */
  const ghost = useRef<HTMLDivElement | null>(null);
  /** Ce qui décide d'une remesure : les libellés, pas l'identité du tableau,
   *  que l'appelant refait à chaque rendu. */
  const shape = chips.map((chip) => `${chip.key}:${chip.label}`).join("|");

  /** La largeur sur laquelle la dernière mesure a été faite.
   *
   *  L'observateur se déclenche aussi quand la **hauteur** du conteneur bouge —
   *  ce qui arrive précisément quand on replie une puce. Remesurer à ce
   *  moment-là relançait le cycle : replier, remesurer, replier. On ne réagit
   *  donc qu'à la largeur, la seule dimension qui décide de ce qui tient. */
  const measuredAt = useRef(-1);

  useLayoutEffect(() => {
    const container = row.current;
    const mirror = ghost.current;
    if (!container || !mirror) return;
    let frame = 0;
    measuredAt.current = -1;
    const measure = () => {
      const items = [...mirror.querySelectorAll<HTMLElement>("[data-ghost]")];
      if (!items.length) { setVisible(0); return; }
      const gap = 6;
      const add = mirror.querySelector<HTMLElement>("[data-ghost-add]");
      const more = mirror.querySelector<HTMLElement>("[data-ghost-more]");
      // La puce « + Ajouter » reste toujours au bout : sa place est réservée.
      measuredAt.current = container.clientWidth;
      const room = container.clientWidth - ((add?.offsetWidth ?? 0) + gap);

      const widths = items.map((item) => item.offsetWidth);
      const fitting = (limit: number) => {
        let used = 0;
        let count = 0;
        for (const width of widths) {
          const next = used + width + (count ? gap : 0);
          if (next > limit) break;
          used = next;
          count += 1;
        }
        return count;
      };

      let next = fitting(room);
      // S'il reste des puces, il faut aussi loger « +N autres ».
      if (next < items.length) next = fitting(room - ((more?.offsetWidth ?? MORE_WIDTH) + gap));
      setVisible((current) => (current === next ? current : next));
    };
    const observer = new ResizeObserver(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    });
    measure();
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, [shape]);

  /* — Le popover — */

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (popover.current?.contains(target)) return;
      if (buttons.current.get(open)?.contains(target)) return;
      setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(null);
      buttons.current.get(open)?.focus();
    };
    // À la frame suivante : posé tout de suite, l'écouteur recevrait le clic
    // qui vient d'ouvrir le popover et le refermerait aussitôt. Le piège a déjà
    // été rencontré dans ce projet.
    const frame = window.requestAnimationFrame(() => document.addEventListener("pointerdown", onPointerDown));
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Une série qui disparaît emporte son popover.
  useEffect(() => {
    if (open && !chips.some((chip) => chip.key === open)) setOpen(null);
  }, [chips, open]);

  const toggle = (chip: RailChip) => {
    if (chip.isOther || !renderScope) return;
    if (open === chip.key) { setOpen(null); return; }
    const button = buttons.current.get(chip.key);
    const container = row.current?.parentElement;
    if (button && container) {
      const narrow = window.innerWidth < SHEET_WIDTH;
      setSheet(narrow);
      if (!narrow) {
        const buttonBox = button.getBoundingClientRect();
        const railBox = container.getBoundingClientRect();
        // Trop près du bord droit, le popover sortirait de la fenêtre : il
        // s'aligne alors sur la droite de la puce.
        const overflows = buttonBox.left + 380 > window.innerWidth - 16;
        setAnchor(overflows
          ? { left: railBox.right - buttonBox.right, align: "right" }
          : { left: buttonBox.left - railBox.left, align: "left" });
      }
    }
    setOpen(chip.key);
  };

  const shown = chips.slice(0, visible);
  const hidden = chips.length - shown.length;
  const current = chips.find((chip) => chip.key === open) ?? null;

  return (
    <div className="compare-rail">
      <div className="compare-rail-summary">
        <span className="compare-rail-label">Ce que je compare</span>

        <div className="compare-rail-chips" role="list" ref={row}>
          {/* Ajouter et retirer une série sont les deux gestes de cet écran :
              ce sont eux qui méritent d'être vus. `layout` fait glisser les
              puces voisines vers leur nouvelle place au lieu de les téléporter
              — c'est très exactement ce que le CSS ne sait pas faire.
              La mesure de largeur, elle, se fait sur la rangée fantôme
              (`data-ghost`), que rien n'anime : les deux ne se gênent pas. */}
          <AnimatePresence initial={false}>
          {chips.map((chip, index) => {
            const short = shorten(chip.label);
            return (
              <m.span
                key={chip.key}
                layout
                {...CHIP}
                data-chip=""
                className={`compare-rail-chip ${index >= visible ? "hidden" : ""} ${open === chip.key ? "open" : ""}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="compare-rail-chip-body"
                  ref={(node) => { if (node) buttons.current.set(chip.key, node); else buttons.current.delete(chip.key); }}
                  title={chip.isOther || !renderScope ? chip.label : `${chip.label} — régler cette série`}
                  aria-expanded={renderScope && !chip.isOther ? open === chip.key : undefined}
                  onClick={() => toggle(chip)}
                >
                  <i style={{ background: chip.color }} />
                  {short}
                </button>
                <button
                  type="button"
                  className="compare-rail-chip-remove"
                  onClick={() => onRemove(chip.key)}
                  disabled={!chip.removable}
                  title={chip.removable
                    ? (chip.isOther ? "Masquer le reste du périmètre" : `Retirer ${chip.label}`)
                    : "Une comparaison garde au moins une série"}
                  aria-label={chip.isOther ? "Masquer le reste du périmètre" : `Retirer ${chip.label}`}
                >✕</button>
              </m.span>
            );
          })}
          </AnimatePresence>

          {hidden > 0 ? (
            <button type="button" className="compare-rail-more" onClick={() => onOpenDrawer()}
              title="Voir toutes les séries dans le tiroir"
            >+{hidden} autre{hidden > 1 ? "s" : ""}</button>
          ) : null}

          {!chips.length ? <span className="compare-rail-chip empty">Aucune série</span> : null}

          <button type="button" className="compare-rail-add" onClick={() => onOpenDrawer()}
            title="Ajouter une série">+ Ajouter</button>
        </div>

        {/* La rangée fantôme : même contenu, même style, hors écran. Elle sert
            uniquement à mesurer, et ne change jamais de contenu selon ce qui
            est replié — c'est ce qui rend la mesure stable. */}
        <div className="compare-rail-ghost" ref={ghost} aria-hidden="true">
          {chips.map((chip) => (
            <span key={chip.key} data-ghost="" className="compare-rail-chip">
              <span className="compare-rail-chip-body"><i />{shorten(chip.label)}</span>
              <span className="compare-rail-chip-remove">✕</span>
            </span>
          ))}
          <span data-ghost-more="" className="compare-rail-more">+{chips.length} autres</span>
          <span data-ghost-add="" className="compare-rail-add">+ Ajouter</span>
        </div>

        <button
          type="button"
          className="compare-rail-toggle"
          onClick={() => onOpenDrawer()}
        >Modifier les séries</button>
      </div>

      {/* Le popover de réglage : même fondu-glissé que les autres panneaux
          flottants du produit, pour qu'ils se comportent tous pareil. */}
      <AnimatePresence>
      {current && renderScope ? (
        <m.div
          key={current.key}
          {...POPOVER}
          className={`chip-popover ${sheet ? "sheet" : ""}`}
          ref={popover}
          role="dialog"
          aria-label={`Réglage · ${current.label}`}
          style={sheet ? undefined : (anchor.align === "left" ? { left: anchor.left } : { right: anchor.left })}
        >
          <header>
            <i style={{ background: current.color }} />
            {nameOf && onNameChange ? (
              <input
                type="text"
                className="chip-popover-name"
                value={nameOf(current.key)}
                placeholder={current.label}
                aria-label={`Nom de la série · ${current.label}`}
                onChange={(event) => onNameChange(current.key, event.target.value)}
              />
            ) : <strong>{current.label}</strong>}
            {current.value !== undefined
              ? <span className="chip-popover-value">{formatValue(current.value ?? null, kind)}</span>
              : null}
          </header>

          <div className="chip-popover-body">{renderScope(current.key)}</div>

          <footer>
            <button type="button" className="chip-popover-all"
              onClick={() => { setOpen(null); onOpenDrawer(current.key); }}
            >Toutes les séries →</button>
            <button
              type="button"
              className="chip-popover-remove"
              disabled={!current.removable}
              onClick={() => { setOpen(null); onRemove(current.key); }}
            >Retirer cette série</button>
          </footer>
        </m.div>
      ) : null}
      </AnimatePresence>
    </div>
  );
}
