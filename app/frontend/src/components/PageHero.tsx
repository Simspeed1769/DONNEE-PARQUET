import type { ReactNode } from "react";

/** L'en-tête partagé des quatre bases : même charpente que le DAMIR hérité —
 *  amorce, titre, phrase de mission — pour que passer de Pathologies à CSP ou
 *  Mortalité donne l'impression d'un même produit. La classe passée en
 *  `variant` garde les réglages déjà existants par base (`.pathology-hero`,
 *  `.csp-hero`, `.mortality-hero`), aucun n'étant retouché ici. */
type Props = {
  variant: string;
  eyebrowLabel: string;
  eyebrowDetail: string;
  title: string;
  mission: string;
  /** Ce qui suit la phrase de mission, à droite : un bouton « Données &
   *  méthode », une puce de statut, ou les deux — chaque base garde la main. */
  action?: ReactNode;
};

export function PageHero({ variant, eyebrowLabel, eyebrowDetail, title, mission, action }: Props) {
  return (
    <section className={`hero ${variant}`}>
      <div>
        <div className="eyebrow"><span>{eyebrowLabel}</span> {eyebrowDetail}</div>
        <h1>{title}</h1>
        <p>{mission}</p>
      </div>
      {action}
    </section>
  );
}
