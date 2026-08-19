/** Le référentiel : ce que contiennent les données, et ce qu'elles ne disent pas.
 *
 *  L'écran précédent enfermait l'essentiel dans un tiroir modal. Le dictionnaire
 *  des mesures DAMIR — la seule page que quelqu'un vient vraiment consulter —
 *  était à trois gestes : ouvrir une fiche source, dérouler une famille, lire.
 *  Une modale ne s'adresse pas par une URL, ne s'imprime pas, ne se met pas en
 *  favori, et se referme dès qu'on regarde ailleurs. Ce n'est pas la forme d'un
 *  référentiel : c'est la forme d'une interruption.
 *
 *  Tout est donc à plat, sous les mêmes onglets que les cinq bases, et chaque
 *  onglet s'écrit dans l'URL — on peut envoyer un lien vers « les mesures
 *  DAMIR » plutôt que d'expliquer où cliquer.
 */

import { useEffect, useMemo, useState } from "react";
import { getMethodology } from "../api";
import { PageHero } from "../components/PageHero";
import { InfoHint } from "../components/InfoHint";
import { DENOMINATORS } from "../methodology/denominators";
import type { MethodSource, Methodology } from "../types";

type Props = { routeVersion?: number };

type Section = "sources" | "mesures" | "dimensions" | "denominateurs" | "garde-fous";

const SECTIONS: Array<{ key: Section; label: string; hint: string }> = [
  { key: "sources", label: "Les sources", hint: "Cinq bases, ce qu'elles couvrent" },
  { key: "mesures", label: "Mesures DAMIR", hint: "Les douze indicateurs" },
  { key: "dimensions", label: "Dimensions DAMIR", hint: "Les onze découpages" },
  { key: "denominateurs", label: "Dénominateurs", hint: "Ce que compte chaque mesure" },
  { key: "garde-fous", label: "Garde-fous", hint: "Ce que l'outil refuse de faire" },
];

/** Le repli quand le serveur ne nomme pas l'unité. Il la nomme mieux que cette
 *  table — « €/unité » là où le seul `kind` dirait « € » — donc elle ne sert
 *  qu'à ne rien afficher de faux si le champ venait à manquer. */
const UNITE: Record<string, string> = { money: "€", percent: "%", quantity: "unités" };

function tonSource(key: string): string {
  return key === "mortality" ? "raw"
    : key === "pathologies" ? "masked"
    : key === "csp" ? "weighted"
    : key === "population" ? "weighted"
    : "liquidation";
}

export function MethodologyPage({ routeVersion = 0 }: Props) {
  const [methodology, setMethodology] = useState<Methodology | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => new URLSearchParams(window.location.search), [routeVersion]);
  const [section, setSection] = useState<Section>(() => {
    const raw = params.get("section");
    return SECTIONS.some((item) => item.key === raw) ? raw as Section : "sources";
  });
  /** La source dépliée dans le tableau. Une seule à la fois : deux fiches
   *  ouvertes côte à côte redonneraient le mur de texte qu'on vient de défaire. */
  const [ouverte, setOuverte] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getMethodology(controller.signal)
      .then(setMethodology)
      .catch((reason: Error) => { if (reason.name !== "AbortError") setError(reason.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  /** L'onglet vit dans l'URL : un lien vers « Mesures DAMIR » se partage. */
  useEffect(() => {
    const next = new URLSearchParams(window.location.search);
    next.set("page", "methodology");
    next.set("section", section);
    window.history.replaceState(null, "", `${window.location.pathname}?${next.toString()}`);
  }, [section]);

  const sources = useMemo(() => {
    if (!methodology) return [];
    return [
      methodology.source, methodology.pathology_source, methodology.csp_source,
      methodology.mortality_source, methodology.population_source,
    ].filter((source): source is MethodSource => Boolean(source));
  }, [methodology]);

  const familles = useMemo(() => {
    const result = new Map<string, Methodology["measures"]>();
    methodology?.measures.forEach((measure) => {
      result.set(measure.family, [...(result.get(measure.family) ?? []), measure]);
    });
    return [...result.entries()];
  }, [methodology]);

  if (loading) {
    return <div className="content-wrap methodology-page"><div className="page-loader"><div className="skeleton" /></div></div>;
  }
  if (error || !methodology) {
    return (
      <div className="content-wrap methodology-page">
        <div className="error-banner">
          <strong>Impossible de charger le référentiel</strong><span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="content-wrap methodology-page">
      <PageHero
        variant="methodology-hero"
        eyebrowLabel="Référentiel"
        eyebrowDetail={`${sources.length} sources · ${methodology.measures.length} mesures DAMIR`}
        title="Données & méthode"
        mission="Ce que contiennent les données, et ce qu'elles ne peuvent pas dire."
      />

      <nav className="damir-sections" role="tablist" aria-label="Sections du référentiel">
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={section === item.key}
            className={section === item.key ? "active" : ""}
            onClick={() => { setSection(item.key); setOuverte(null); }}
          >
            <strong>{item.label}</strong>
            <small>{item.hint}</small>
          </button>
        ))}
      </nav>

      {/* — Les cinq sources — */}
      {section === "sources" ? (
        <section className="panel ref-panel">
          <p className="ref-intro">
            Cliquez une ligne pour lire ce que la source ne peut pas dire.
            C’est presque toujours l’information la plus utile.
          </p>
          <div className="ref-scroll">
            <table className="ref-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Producteur</th>
                  <th scope="col">Période</th>
                  <th scope="col" className="num">Mesures</th>
                  <th scope="col">Découpages</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => {
                  const ouvert = ouverte === source.key;
                  return [
                    <tr
                      key={source.key}
                      className={`ref-row ${ouvert ? "ouverte" : ""}`}
                      onClick={() => setOuverte(ouvert ? null : source.key)}
                    >
                      <th scope="row">
                        <span className={`ref-puce ${tonSource(source.key)}`} aria-hidden="true" />
                        {source.name}
                      </th>
                      <td>{source.producer}</td>
                      <td className="num">{source.period ?? "—"}</td>
                      <td className="num">{source.measures_count ?? "—"}</td>
                      <td>{(source.dimensions ?? []).join(" · ")}</td>
                      <td className="ref-chevron">
                        <button type="button" aria-expanded={ouvert}
                          aria-label={`${ouvert ? "Replier" : "Déplier"} ${source.name}`}>
                          {ouvert ? "−" : "+"}
                        </button>
                      </td>
                    </tr>,
                    ouvert ? (
                      <tr key={`${source.key}-detail`} className="ref-detail-row">
                        <td colSpan={6}>
                          <div className="ref-detail">
                            <p>{source.description}</p>
                            <h4>Ce que cette source ne dit pas</h4>
                            <ul>
                              {source.limitations.map((limite) => <li key={limite}>{limite}</li>)}
                            </ul>
                            <p className="ref-grain"><strong>Grain :</strong> {source.granularity}</p>
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* — Les douze mesures DAMIR — */}
      {section === "mesures" ? (
        <section className="panel ref-panel">
          <p className="ref-intro">
            Les douze indicateurs, groupés par famille. La colonne
            <strong> Additive</strong> décide de ce qu’on a le droit d’empiler :
            une mesure non additive ne se somme pas d’une région à l’autre.
            <InfoHint label="l’additivité">
              Un montant s’additionne ; un taux ou une moyenne, non — les recomposer
              demande de repartir des composantes, ce que fait l’outil.
            </InfoHint>
          </p>
          {familles.map(([famille, mesures]) => (
            <div className="ref-famille" key={famille}>
              <h3>{famille} <span>{mesures.length}</span></h3>
              <div className="ref-scroll">
                <table className="ref-table">
                  <thead>
                    <tr>
                      <th scope="col">Mesure</th>
                      <th scope="col" className="num">Unité</th>
                      <th scope="col">Ce qu’elle compte</th>
                      <th scope="col">Comment elle se calcule</th>
                      <th scope="col" className="num">Additive</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mesures.map((mesure) => (
                      <tr key={mesure.key}>
                        <th scope="row">{mesure.label}</th>
                        <td className="num"><span className="ref-unite">{mesure.unit_label ?? UNITE[mesure.kind] ?? mesure.kind}</span></td>
                        <td>
                          {mesure.definition}
                          {mesure.caveat ? <span className="ref-reserve">{mesure.caveat}</span> : null}
                        </td>
                        <td><code>{mesure.formula}</code></td>
                        {/* Un champ absent ne devient pas « non » : il resterait
                            muet là où il affirmerait le contraire du vrai. */}
                        <td className="num">
                          {mesure.additive === undefined ? <span className="ref-aucun">—</span> : (
                            <span className={`ref-oui-non ${mesure.additive ? "oui" : "non"}`}>
                              {mesure.additive ? "oui" : "non"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* — Les onze dimensions DAMIR — */}
      {section === "dimensions" ? (
        <section className="panel ref-panel">
          <p className="ref-intro">
            Les onze façons de découper la donnée. « Modalités » est le nombre de
            valeurs réellement présentes ; un tiret signale un niveau qui dépend
            du niveau choisi au-dessus.
          </p>
          <div className="ref-scroll">
            <table className="ref-table">
              <thead>
                <tr>
                  <th scope="col">Dimension</th>
                  <th scope="col">Ce qu’elle découpe</th>
                  <th scope="col" className="num">Modalités</th>
                  <th scope="col">D’où elle vient</th>
                </tr>
              </thead>
              <tbody>
                {methodology.dimensions.map((dimension) => (
                  <tr key={dimension.key}>
                    <th scope="row">{dimension.label}</th>
                    <td>
                      {dimension.description ?? "—"}
                      {dimension.caution ? <span className="ref-reserve">{dimension.caution}</span> : null}
                    </td>
                    <td className="num">{dimension.modalities ?? "—"}</td>
                    <td className="ref-origine">{dimension.origin ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* — Numérateur et dénominateur, source par source — */}
      {section === "denominateurs" ? (
        <section className="panel ref-panel">
          <p className="ref-intro">
            Un pourcentage dont on ne nomme pas le dénominateur ne veut rien dire,
            et deux mesures qui portent le même mot peuvent se rapporter à deux
            ensembles différents. C’est le seul endroit où la réponse est écrite
            en entier.
          </p>
          {DENOMINATORS.map((groupe) => (
            <div className="ref-famille" key={groupe.source}>
              <h3>{groupe.source}</h3>
              <p className="ref-sous-intro">{groupe.intro}</p>
              <div className="ref-scroll">
                <table className="ref-table">
                  <thead>
                    <tr>
                      <th scope="col">Mesure</th>
                      <th scope="col">Numérateur</th>
                      <th scope="col">Dénominateur</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupe.rows.map((ligne) => (
                      <tr key={ligne.measure}>
                        <th scope="row">{ligne.measure}</th>
                        <td>{ligne.numerator}</td>
                        <td>
                          {ligne.denominator
                            ? ligne.denominator
                            : <span className="ref-aucun">Aucun — c’est un total</span>}
                          {ligne.note ? <span className="ref-reserve">{ligne.note}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {/* — Les garde-fous — */}
      {section === "garde-fous" ? (
        <section className="panel ref-panel">
          <p className="ref-intro">
            Ces règles sont appliquées par le code, pas laissées à la vigilance du
            lecteur. Une forme qui mentirait n’est pas proposée — elle n’est pas
            grisée, elle n’existe pas.
          </p>
          <div className="ref-scroll">
            <table className="ref-table">
              <thead>
                <tr>
                  <th scope="col" className="num">État</th>
                  <th scope="col">Ce que l’outil s’interdit</th>
                </tr>
              </thead>
              <tbody>
                {methodology.compatibility_rules.map((regle) => (
                  <tr key={regle.key}>
                    <td className="num"><span className="ref-oui-non oui">actif</span></td>
                    <th scope="row" className="ref-regle">{regle.label}</th>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default MethodologyPage;
