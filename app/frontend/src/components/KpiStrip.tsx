/** Les repères chiffrés, dans leur propre zone au-dessus du graphique.
 *
 *  Ils vivaient **dans** la carte du graphique, sur la même rangée que le choix
 *  de forme et le sélecteur de palette. Trois choses de natures différentes sur
 *  une ligne : un résultat qu'on lit, un réglage qu'on manipule, un réglage
 *  d'apparence. Le résultat y passait pour un accessoire des commandes.
 *
 *  Il est donc sorti de la carte et posé au-dessus, dans une bande qui ne
 *  contient que lui. La carte du graphique ne porte plus que le graphique et ce
 *  qui sert à le lire.
 *
 *  **Une bande, pas des cartes.** Les repères étaient auparavant quatre
 *  panneaux encadrés ; à quatre encadrés au-dessus d'un cinquième, l'écran
 *  n'avait plus de hiérarchie. Ici un seul fond, des repères séparés par un
 *  filet, et le nombre en grand : c'est le nombre qu'on vient chercher, pas
 *  la boîte qui le contient.
 */
export type KpiItem = {
  key: string;
  label: string;
  value: string;
  detail?: string;
  /** Une phrase entière plutôt qu'un nombre nu (le ratio femmes/hommes, par
   *  exemple) : elle prend toute la largeur de son repère, en corps réduit,
   *  parce qu'une phrase composée en corps de titre ne se lit plus. */
  sentence?: boolean;
};

type Props = {
  items: KpiItem[];
  className?: string;
};

export function KpiStrip({ items, className }: Props) {
  if (!items.length) return null;
  return (
    <section className={`kpi-band ${className ?? ""}`} aria-label="Repères chiffrés">
      {items.map((item) => (
        <article className="kpi-item" key={item.key}>
          <span className="kpi-label">{item.label}</span>
          <strong className={item.sentence ? "kpi-value kpi-sentence" : "kpi-value"}>
            {item.value}
          </strong>
          {item.detail && !item.sentence ? <small className="kpi-detail">{item.detail}</small> : null}
        </article>
      ))}
    </section>
  );
}
