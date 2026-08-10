/** La ligne de repères chiffrés, généralisée depuis les trois bases qui la
 *  répétaient à l'identique (`.pathology-kpis`). Chaque base garde son nombre
 *  de repères — rien n'est retiré ici, seule la répétition l'est. */
export type KpiItem = {
  key: string;
  label: string;
  value: string;
  detail?: string;
  /** Une phrase entière plutôt qu'un nombre nu (le ratio femmes/hommes, par
   *  exemple) : elle prend toute la carte, sans détail en dessous. */
  sentence?: boolean;
};

type Props = {
  items: KpiItem[];
  className?: string;
};

export function KpiStrip({ items, className }: Props) {
  return (
    <section className={`pathology-kpis ${className ?? ""}`}>
      {items.map((item) => (
        <article className="panel" key={item.key}>
          <span>{item.label}</span>
          <strong className={item.sentence ? "ratio-sentence" : ""}>{item.value}</strong>
          {item.detail && !item.sentence ? <small>{item.detail}</small> : null}
        </article>
      ))}
    </section>
  );
}
