/** Rouge ou bleu, pour les graphiques.
 *
 *  L'outil est rouge : c'est sa couleur de marque, et la rampe des cartes et
 *  des cartes de chaleur la suit désormais. Le bleu reste offert — plus calme
 *  sur un vidéoprojecteur, plus sobre à l'impression — et c'est le seul autre
 *  choix : deux options se retiennent, huit ne se retiennent pas.
 *
 *  Le réglage vit à côté de celui du thème, dans l'en-tête : c'est là qu'on
 *  cherche l'apparence, et il vaut pour tout l'outil plutôt que pour un écran.
 *  Il se retient d'une visite à l'autre, comme le thème.
 *
 *  **Ce que la bascule ne fait pas** : elle ne repeint pas les séries d'une
 *  comparaison en nuances d'une seule teinte. Là, la couleur porte l'identité
 *  d'une série, et une famille unique n'y suffit pas — mesuré à la méthode
 *  dataviz, cinq nuances de rouge tombent à ΔE 11,7 entre deux voisines pour un
 *  plancher de 15 : deux courbes qu'un œil normal ne distingue plus. Ce qui
 *  bascule, c'est l'ordre des teintes et tout ce qui code une grandeur.
 */

import { useEffect, useState } from "react";

type Palette = "red" | "blue";

const STORAGE_KEY = "damir-palette";

function readPalette(): Palette {
  return window.localStorage.getItem(STORAGE_KEY) === "blue" ? "blue" : "red";
}

const LABELS: Record<Palette, string> = {
  red: "Graphiques en rouge",
  blue: "Graphiques en bleu",
};

export function PaletteToggle() {
  const [palette, setPalette] = useState<Palette>(readPalette);

  useEffect(() => {
    // Le rouge est le défaut : il ne pose pas d'attribut, si bien qu'une
    // installation neuve part sur la palette de marque sans rien stocker.
    if (palette === "blue") {
      document.documentElement.setAttribute("data-palette", "blue");
      window.localStorage.setItem(STORAGE_KEY, "blue");
    } else {
      document.documentElement.removeAttribute("data-palette");
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [palette]);

  return (
    <button
      type="button"
      className={`palette-toggle ${palette}`}
      onClick={() => setPalette((current) => (current === "red" ? "blue" : "red"))}
      title={LABELS[palette]}
      aria-label={LABELS[palette]}
    >
      <span aria-hidden="true" />
    </button>
  );
}
