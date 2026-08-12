/** Le choix de palette : une pastille, un clic.
 *
 *  C'était un couple de boutons « Rouge | Bleu », aussi visible que le choix de
 *  forme posé juste à côté. Un réglage d'apparence ne mérite pas ce poids : il
 *  se ramène à une pastille ronde de la couleur active, qui bascule au clic et
 *  ne dit son rôle qu'à l'infobulle.
 *
 *  La pastille porte la teinte que la palette donne à une série seule —
 *  `--accent-chart` — et non une couleur écrite ici : elle change donc en même
 *  temps que les graphiques, par la même transition.
 */

import { usePalette } from "../charts/palette";

const LABEL = {
  red: "Palette rouge · cliquer pour passer au bleu",
  blue: "Palette bleue · cliquer pour passer au rouge",
} as const;

export function PaletteChoice() {
  const [palette, choose] = usePalette();
  const next = palette === "red" ? "blue" : "red";

  return (
    <button
      type="button"
      className="palette-dot"
      title={LABEL[palette]}
      aria-label={LABEL[palette]}
      onClick={() => choose(next)}
    ><i /></button>
  );
}
