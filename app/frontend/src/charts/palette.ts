/** Rouge ou bleu, pour les graphiques.
 *
 *  Le choix appartient au graphique, pas à l'en-tête de l'application : il se
 *  règle donc à côté des choix de forme, sur la bande qui porte déjà les
 *  repères chiffrés. Il ne doit pas être confondu avec la bascule clair/sombre
 *  (`ThemeToggle`), qui reste dans l'en-tête parce qu'elle vaut pour toute la
 *  page et pas pour le seul tracé.
 *
 *  **Ce que la bascule change** : la rampe séquentielle — cartes, cartes de
 *  chaleur — et la teinte d'une série seule à son graphique. **Ce qu'elle ne
 *  change pas** : la palette catégorielle d'une comparaison à plusieurs séries,
 *  où la couleur porte l'identité de chaque série. Une famille unique n'y
 *  suffit pas : mesuré à la méthode dataviz, cinq nuances de rouge tombent à
 *  ΔE 11,7 entre deux voisines pour un plancher de 15, c'est-à-dire deux
 *  courbes qu'un œil normal ne distingue plus.
 *
 *  L'état vit **dans l'adresse**, comme le reste de l'écran, pour que « Copier
 *  le lien » le restitue ; il se double d'une mémoire locale, qui le conserve
 *  d'une visite à l'autre et le rétablit sur les écrans qui n'écrivent pas ce
 *  paramètre dans leur URL.
 */

import { useCallback, useState } from "react";

export type Palette = "red" | "blue";

/** Le nom du paramètre d'adresse, partagé avec les écrans qui réécrivent leur
 *  URL de bout en bout : sans lui, ils effaceraient le choix. */
export const PALETTE_PARAM = "palette";

const STORAGE_KEY = "damir-palette";

function isPalette(value: string | null): value is Palette {
  return value === "red" || value === "blue";
}

/** Le choix courant : l'adresse d'abord — c'est elle qu'on partage — puis la
 *  mémoire locale, puis le rouge de marque. */
export function readPalette(): Palette {
  const fromUrl = new URLSearchParams(window.location.search).get(PALETTE_PARAM);
  if (isPalette(fromUrl)) return fromUrl;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return isPalette(stored) ? stored : "red";
}

/** Ce qu'un écran doit ajouter à ses propres paramètres pour ne pas perdre le
 *  choix en réécrivant son adresse. Le rouge étant le défaut, il ne s'écrit
 *  pas : une adresse ne se charge pas de ce qui va de soi. */
export function paletteParams(palette: Palette): Record<string, string> {
  return palette === "blue" ? { [PALETTE_PARAM]: palette } : {};
}

/** Pose le choix sur la racine du document.
 *
 *  **À appeler avant le premier rendu de React.** Le contrôle de palette est un
 *  enfant de la carte-graphique, et React exécute les effets des enfants avant
 *  ceux de leurs parents : si l'attribut n'était posé que depuis un effet, il le
 *  serait *après* que `useChartTokens` a lu ses couleurs et *avant* qu'il ait
 *  installé son observateur. La mutation passait donc entre les deux et le
 *  premier tracé sortait dans la mauvaise palette, jusqu'à ce qu'on touche à
 *  autre chose. */
export function applyStoredPalette(): void {
  apply(readPalette());
}

function apply(palette: Palette): void {
  const root = document.documentElement;
  // Le rouge est le défaut : il ne pose pas d'attribut, si bien qu'une
  // installation neuve part sur la palette de marque sans rien stocker.
  if (palette === "blue") root.setAttribute("data-palette", "blue");
  else root.removeAttribute("data-palette");
}

/** Le choix de palette et de quoi le changer.
 *
 *  Changer de palette ne déclenche aucune requête et ne remonte pas l'instance
 *  ECharts : seuls les jetons de couleur changent, `useChartTokens` les relit
 *  sur mutation de l'attribut, et le graphique se met à jour par la même
 *  transition que d'habitude.
 */
export function usePalette(): [Palette, (next: Palette) => void] {
  const [palette, setPalette] = useState<Palette>(readPalette);

  const choose = useCallback((next: Palette) => {
    setPalette(next);
    apply(next);
    if (next === "blue") window.localStorage.setItem(STORAGE_KEY, next);
    else window.localStorage.removeItem(STORAGE_KEY);

    const params = new URLSearchParams(window.location.search);
    if (next === "blue") params.set(PALETTE_PARAM, next);
    else params.delete(PALETTE_PARAM);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, []);

  return [palette, choose];
}
