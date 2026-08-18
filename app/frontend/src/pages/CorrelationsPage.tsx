/** Croiser des sources — une seule porte d'entrée.
 *
 *  L'écran a longtemps offert trois modes. « Lien » demandait de choisir un
 *  indicateur de chaque côté sans dire lequel correspondait à quoi ; « Modèle »
 *  était un établi complet, fait pour qui savait déjà ce qu'il voulait y poser ;
 *  « Guidé » parcourt la question dans l'ordre où elle se pose. Trois portes
 *  pour une seule question, c'était deux de trop : celui qui ne connaît pas le
 *  catalogue commençait par choisir un mode, ce qui est déjà une question de
 *  spécialiste.
 *
 *  Ne reste donc que Guidé. L'écran avancé a été conservé un temps hors route,
 *  au cas où : personne ne l'a rebranché, et 673 lignes non exercées se sont
 *  mises à coûter — il fallait les tenir en cohérence avec l'API pour aucun
 *  utilisateur. Il est supprimé ; Git le porte si le besoin revient.
 *
 *  Les unités d'observation restent des cellules région × âge × sexe, jamais
 *  des individus : les phrases produites ici comparent des territoires à âge et
 *  sexe comparables, et ne disent jamais ce que fait une personne.
 */

import { useEffect, useState } from "react";
import { getCorrelationCatalogue, type CorrelationCatalogue } from "../api";
import { GuidedPanel } from "../correlations/GuidedPanel";

type Props = { onOpenMethodology: () => void };

export function CorrelationsPage({ onOpenMethodology }: Props) {
  const [catalogue, setCatalogue] = useState<CorrelationCatalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getCorrelationCatalogue(controller.signal)
      .then(setCatalogue)
      .catch((reason: Error) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, []);

  return (
    <div className="explore cross">
      <header className="explore-head">
        <div>
          <span className="explore-eyebrow">Croisements entre sources</span>
          {/* Aucun sous-titre : « 1 · Que voulez-vous expliquer ? », « 2 · Par
              quoi l'expliquer ? » et « 3 · Contrôles » le disaient déjà, trois
              lignes plus bas. */}
          <h1>Expliquer un indicateur</h1>
        </div>
        <div className="explore-head-side">
          <button type="button" className="ghost-button" onClick={onOpenMethodology}>Définitions &amp; méthode</button>
        </div>
      </header>

      {error ? (
        <div className="explore-error">
          <strong>Le catalogue des indicateurs n’a pas pu être chargé</strong>
          <span>{error}</span>
        </div>
      ) : null}

      <main className="explore-canvas explore-canvas-solo">
        <GuidedPanel catalogue={catalogue} />
      </main>
    </div>
  );
}
