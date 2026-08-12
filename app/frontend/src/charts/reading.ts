/** Une lecture : un graphique, **plus ce qui ne tient pas dedans**.
 *
 *  DAMIR travaillait déjà ainsi (`panorama/slides.ts`) : un écran ne montre pas
 *  quatre graphiques côte à côte, il montre **un** graphique dont on change la
 *  lecture et la forme. Les trois autres bases empilaient encore des cartes
 *  distinctes ; ce module leur donne le même vocabulaire.
 *
 *  Une lecture porte donc, comme une diapositive du panorama :
 *  - un **titre** qui suffit seul à situer le graphique une fois projeté ;
 *  - les **réserves**, ce que la forme ne peut pas porter et qui serait sinon
 *    perdu en silence ;
 *  - un **tableau**, les mêmes chiffres au clavier et au lecteur d'écran ;
 *  - **les formes qu'elle peut honnêtement prendre**, décidées par le modèle de
 *    la base — jamais par l'interface, qui n'a aucune règle statistique à
 *    connaître.
 */

import type { EChartsOption } from "./EChart";

export type FormOption = { key: string; label: string };

export type ReadingTable = { columns: string[]; rows: string[][] };

export type Reading = {
  key: string;
  /** Nom court de l'onglet de lecture. */
  nav: string;
  /** Titre de projection. */
  title: string;
  /** La question à laquelle la forme répond, écrite au-dessus du graphique. */
  question: string;
  caveats: string[];
  forms: FormOption[];
  /** La forme dessinée : celle demandée si elle est offerte, sinon la première. */
  form: string;
  option: EChartsOption | null;
  table: ReadingTable;
  ariaLabel: string;
  height: number;
  /** Renseigné lorsqu'il n'y a rien à montrer, avec la raison. */
  empty: string | null;
  /** La clé de lecture des couleurs, **dans le HTML de la page** : elle y est
   *  sélectionnable et lisible par un lecteur d'écran, là où une légende de
   *  canevas ne l'est pas. Absente sur une lecture à série unique, où la
   *  couleur ne distingue rien. */
  legend?: Array<{ key: string; label: string; color: string }>;
  /** Titre de l'axe des abscisses : ce que comptent les catégories. */
  xTitle: string;
};

/** La forme retenue : celle demandée si elle figure dans les offres.
 *
 *  Une forme que la donnée n'autorise pas n'est jamais dessinée de travers :
 *  elle retombe sur la première offerte, qui est toujours licite. */
export function resolveForm(offered: FormOption[], asked: string | undefined): string {
  return asked && offered.some((item) => item.key === asked) ? asked : (offered[0]?.key ?? "");
}
