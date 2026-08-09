/** Fond de carte des régions françaises, enregistré une seule fois.
 *
 *  ECharts garde les cartes dans un registre global : les enregistrer par
 *  composant ferait relire le même GeoJSON à chaque petite carte d'une grille
 *  comparative. La promesse est donc mémorisée, et les vingt cartes d'un écran
 *  partagent un unique téléchargement.
 */

import { useEffect, useState } from "react";
import { echarts } from "./EChart";

export const FRENCH_MAP = "regions-fr";

/** Codes du cube DAMIR qui n'ont pas de territoire à colorier.
 *
 *  Les afficher sur la carte serait faux, les taire le serait tout autant :
 *  « non renseignée » pèse à elle seule un sixième des remboursements. Ils
 *  sortent donc de la carte pour être énoncés à côté, en clair.
 */
export const OFF_MAP_REGIONS: Record<string, string> = {
  "99": "Région non renseignée",
  "5": "DOM (code agrégé)",
};

/** Régions dessinées par le fond de carte mais absentes du cube DAMIR. */
export const ABSENT_FROM_CUBE: Record<string, string> = {
  "94": "Corse",
};

/** Le fond de carte porte `code` et `nom` ; ECharts apparie sur `name`.
 *
 *  Sans cette normalisation, aucune région ne s'apparie : la carte se dessine
 *  entièrement dans la couleur « pas de donnée » et chaque infobulle annonce
 *  une absence, alors que les valeurs sont bien là. On projette donc le code
 *  INSEE — la clé que porte le cube — dans la propriété qu'ECharts lit, plutôt
 *  que de laisser deux nomenclatures se manquer en silence.
 */
function normalize(geojson: any): any {
  for (const feature of geojson?.features ?? []) {
    const properties = feature.properties ?? (feature.properties = {});
    if (properties.name === undefined) properties.name = String(properties.code ?? "");
  }
  return geojson;
}

let pending: Promise<void> | null = null;

function load(): Promise<void> {
  if (pending) return pending;
  pending = fetch("/api/csp/regions.geojson")
    .then((response) => {
      if (!response.ok) throw new Error("Fond de carte indisponible.");
      return response.json();
    })
    .then((geojson) => { echarts.registerMap(FRENCH_MAP, normalize(geojson)); })
    .catch((reason: Error) => {
      // Une carte absente ne doit pas emporter l'écran : l'appelant bascule
      // sur un classement en barres, qui dit la même chose sans géographie.
      pending = null;
      throw reason;
    });
  return pending;
}

type MapState = { ready: boolean; error: string | null };

export function useFrenchMap(): MapState {
  const [state, setState] = useState<MapState>({ ready: false, error: null });

  useEffect(() => {
    let active = true;
    load()
      .then(() => { if (active) setState({ ready: true, error: null }); })
      .catch((reason: Error) => { if (active) setState({ ready: false, error: reason.message }); });
    return () => { active = false; };
  }, []);

  return state;
}
