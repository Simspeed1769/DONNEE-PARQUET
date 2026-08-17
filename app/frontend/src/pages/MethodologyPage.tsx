import { AnimatePresence } from "motion/react";
import { DRAWER, m } from "../components/motion";
import { useEffect, useMemo, useState } from "react";
import { getMethodology } from "../api";
import { DENOMINATORS } from "../methodology/denominators";
import type { MethodSource, Methodology } from "../types";

type SourceKey = "damir" | "pathologies" | "csp" | "mortality";

function sourceTone(source: MethodSource): string {
  if (source.key === "mortality") return "raw";
  if (source.key === "pathologies") return "masked";
  if (source.key === "csp") return "weighted";
  return "liquidation";
}

function shortCaution(source: MethodSource): string {
  if (source.key === "pathologies") return "Effectifs < 10 non publiés : une valeur absente ne devient jamais zéro.";
  if (source.key === "mortality") return "Effectifs bruts : les évolutions reflètent aussi la démographie.";
  if (source.key === "csp") return "Champ limité aux actifs ayant un emploi, avec pondération Insee.";
  return "Les années récentes peuvent être encore en cours de liquidation.";
}

export function MethodologyPage() {
  const [methodology, setMethodology] = useState<Methodology | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<SourceKey | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getMethodology(controller.signal)
      .then(setMethodology)
      .catch((reason: Error) => { if (reason.name !== "AbortError") setError(reason.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selectedKey) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedKey(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selectedKey]);

  const sources = useMemo(() => {
    if (!methodology) return [];
    return [
      methodology.source,
      methodology.pathology_source,
      methodology.csp_source,
      methodology.mortality_source,
      methodology.population_source,
    ].filter((source): source is MethodSource => Boolean(source));
  }, [methodology]);
  const selected = sources.find((source) => source.key === selectedKey) ?? null;
  const measureFamilies = useMemo(() => {
    const result = new Map<string, Methodology["measures"]>();
    methodology?.measures.forEach((measure) => {
      result.set(measure.family, [...(result.get(measure.family) ?? []), measure]);
    });
    return [...result.entries()];
  }, [methodology]);

  if (loading) return <div className="content-wrap methodology-page"><div className="page-loader"><div className="skeleton" /></div></div>;
  if (error || !methodology) return <div className="content-wrap methodology-page"><div className="error-banner"><strong>Impossible de charger les informations méthodologiques</strong><span>{error}</span></div></div>;

  return (
    <div className="content-wrap methodology-page compact-methodology">
      <section className="hero methodology-hero">
        <div>
          {/* Le compte vient du catalogue rendu juste en dessous. Écrit en dur,
              il annonçait « 4 sources » devant cinq fiches. */}
          <div className="eyebrow"><span>Référentiel</span> {sources.length} sources actives</div>
          <h1>Données & méthode</h1>
          <p>Le périmètre, la période et les limites essentielles. Le détail reste accessible à la demande.</p>
        </div>
        <span className="semantic-badge">{methodology.compatibility_rules.length} garde-fous actifs</span>
      </section>

      <section className="method-catalog-grid" aria-label="Catalogue des sources">
        {sources.map((source) => (
          <article className={`panel method-catalog-card ${sourceTone(source)}`} key={source.key}>
            <header>
              <div>
                <span>{source.producer}</span>
                <h2>{source.name}</h2>
              </div>
              <em>{source.period ?? "Période disponible"}</em>
            </header>
            <div className="method-source-dimensions">
              {(source.dimensions ?? []).map((dimension) => <span key={dimension}>{dimension}</span>)}
            </div>
            <div className="method-source-facts">
              <div><strong>{source.measures_count ?? "—"}</strong><small>mesures</small></div>
              <div><strong>{source.status ?? "Disponible"}</strong><small>statut</small></div>
            </div>
            <p className="method-short-caution">{shortCaution(source)}</p>
            <footer>
              <div>{(source.badges ?? []).slice(0, 2).map((badge) => <span key={badge}>{badge}</span>)}</div>
              <button type="button" onClick={() => setSelectedKey(source.key as SourceKey)}>Voir le détail →</button>
            </footer>
          </article>
        ))}
      </section>

      {/* Un pourcentage sans dénominateur nommé ne veut rien dire, et deux
          mesures qui portent le même mot peuvent se rapporter à deux ensembles
          différents. C'est le seul endroit où la réponse est écrite en entier. */}
      <section className="method-denominators" aria-labelledby="method-denominators-title">
        <header>
          <h2 id="method-denominators-title">Ce que compte chaque mesure</h2>
          <p>
            Pour chaque mesure, ce qui est compté au numérateur et ce à quoi
            c’est rapporté. Un total n’a pas de dénominateur : la table le dit
            plutôt que de laisser une case vide, qui se lirait comme un oubli.
          </p>
        </header>

        {DENOMINATORS.map((group) => (
          <article className="method-denominator-group" key={group.source}>
            <h3>{group.source}</h3>
            <p>{group.intro}</p>
            <div className="method-denominator-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Mesure</th>
                    <th scope="col">Numérateur</th>
                    <th scope="col">Dénominateur</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <tr key={row.measure}>
                      <th scope="row">{row.measure}</th>
                      <td>{row.numerator}</td>
                      <td>
                        {row.denominator
                          ? row.denominator
                          : <span className="method-denominator-none">Aucun — c’est un total</span>}
                        {row.note ? <span className="method-denominator-note">{row.note}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>

      <section className="method-bottom-strip">
        <div><span className="live-dot" /><strong>Référentiel commun actif</strong><small>Les précautions utiles sont également affichées près des graphiques.</small></div>
        <button type="button" onClick={() => setSelectedKey("damir")}>Mesures DAMIR</button>
      </section>

      {/* Le voile en fondu, le tiroir en glissé : deux mouvements distincts
          pour deux rôles distincts. Le voile ne bouge pas — il couvre. */}
      <AnimatePresence>
      {selected ? <m.div
        className="method-drawer-backdrop"
        role="presentation"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedKey(null);
        }}>
        <m.aside
          className="method-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="method-drawer-title"
          {...DRAWER}
            >
          <header className="method-drawer-header">
            <div><span>{selected.producer} · {selected.period}</span><h2 id="method-drawer-title">{selected.name}</h2></div>
            <button type="button" onClick={() => setSelectedKey(null)} aria-label="Fermer">×</button>
          </header>

          <div className="method-drawer-body">
            <section className="method-drawer-summary">
              <p>{selected.description}</p>
              <div>{(selected.dimensions ?? []).map((dimension) => <span key={dimension}>{dimension}</span>)}</div>
            </section>

            <section>
              <span className="section-kicker">À retenir</span>
              <h3>Limites de lecture</h3>
              <div className="method-limit-list">
                {selected.limitations.map((limitation) => <p key={limitation}><span>!</span>{limitation}</p>)}
              </div>
            </section>

            {selected.key === "damir" ? <>
              <section>
                <span className="section-kicker">Dictionnaire</span>
                <h3>{methodology.measures.length} mesures DAMIR</h3>
                <div className="compact-measure-list">
                  {measureFamilies.map(([family, measures]) => <details key={family}>
                    <summary><strong>{family}</strong><span>{measures.length} mesures</span></summary>
                    <div>{measures.map((measure) => <article key={measure.key}><header><strong>{measure.label}</strong><em>{measure.kind === "money" ? "€" : measure.kind === "percent" ? "%" : "unités"}</em></header><p>{measure.definition}</p><small>{measure.formula}</small>{measure.caveat ? <small className="measure-caveat">{measure.caveat}</small> : null}</article>)}</div>
                  </details>)}
                </div>
              </section>
              <section>
                <span className="section-kicker">Règles actives</span>
                <h3>Compatibilités verrouillées</h3>
                <div className="method-rule-list">{methodology.compatibility_rules.map((rule) => <div key={rule.key}><span>✓</span><strong>{rule.label}</strong></div>)}</div>
              </section>
            </> : null}

            <details className="method-technical-details">
              <summary>Détail technique de la granularité</summary>
              <p>{selected.granularity}</p>
            </details>
          </div>
        </m.aside>
      </m.div> : null}
      </AnimatePresence>
    </div>
  );
}
