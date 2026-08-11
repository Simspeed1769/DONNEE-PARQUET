/** Le choix de palette, au niveau du graphique.
 *
 *  Même traitement que les autres contrôles segmentés de la bande — formes,
 *  mesure : `.pathology-toggle`. Un bouton d'un genre nouveau attirerait l'œil
 *  sur un réglage d'apparence, alors qu'il vaut moins que le choix de forme
 *  posé juste à côté.
 */

import { usePalette, type Palette } from "../charts/palette";

const CHOICES: Array<{ key: Palette; label: string; title: string }> = [
  { key: "red", label: "Rouge", title: "Graphiques dans la teinte de marque" },
  { key: "blue", label: "Bleu", title: "Graphiques en bleu, plus calme à la projection" },
];

export function PaletteChoice() {
  const [palette, choose] = usePalette();

  return (
    <div className="pathology-toggle damir-palette" role="group" aria-label="Couleur des graphiques">
      {CHOICES.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={palette === item.key}
          className={palette === item.key ? "active" : ""}
          title={item.title}
          onClick={() => choose(item.key)}
        >{item.label}</button>
      ))}
    </div>
  );
}
