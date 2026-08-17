"""Inventaire de la couverture réelle des cinq bases.

Ce script **relit les fichiers** plutôt que de recopier une mémoire. C'est tout
son intérêt : la couverture d'une source est la première chose qui dérive quand
on remplace un fichier, et la dernière qu'on pense à vérifier.

Il ne dépend que de ce que le poste a déjà — DuckDB et le dépôt lui-même. Il
n'écrit rien : il imprime un tableau Markdown que l'on colle dans
`docs/SOURCES.md`, en regard de ce que publie le producteur.

    .venv/Scripts/python.exe ../tools/inventaire_sources.py     # depuis app/backend

Ce qu'il cherche, source par source :

- la **première et la dernière année** effectivement présentes ;
- les **trous** — une année manquante au milieu d'une série est un piège
  autrement plus sournois qu'une série qui s'arrête, parce que rien à l'écran
  ne la signale ;
- le **volume**, qui permet de repérer une année tronquée : un exercice qui
  pèse le dixième de son voisin n'est pas une baisse, c'est un fichier
  incomplet.

Et, pour DAMIR seul, deux mesures qu'aucun décompte de lignes ne donne :

- le **poids de chaque année** rapporté à la plus lourde, qui est le critère par
  lequel le serveur décide des années offertes au choix ;
- la **complétude de la dernière année de soins**, estimée à partir du profil de
  liquidation observé sur les années mûres. Une année de soins n'est pas close
  quand son dernier flux mensuel arrive : les soins de décembre se remboursent
  l'année suivante. C'est la différence entre « le fichier s'arrête là » et
  « la donnée s'arrête là », et seule la seconde se voit à l'écran.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "app" / "backend"
sys.path.insert(0, str(BACKEND))

from app.repository import repository  # noqa: E402  (le chemin doit précéder l'import)

#: (nom, drapeau de disponibilité, vue, expression de l'année)
#:
#: Le cube des délais est compté par **année de flux** et non de soins : c'est la
#: borne de la fenêtre d'observation, donc celle qui limite ce qu'on peut mesurer.
#: Ses années de soins remontent un cran plus loin, un flux remboursant aussi des
#: soins des exercices précédents.
SOURCES: list[tuple[str, str | None, str, str]] = [
    ("Open DAMIR", None, "cube", "soi_ann"),
    ("Cube des délais (années de flux)", "has_delays", "delays", "flx // 100"),
    ("Cartographie des pathologies", "has_pathologies", "pathologies", "year(annee)"),
    ("CSP · recensement", "has_csp", "csp", "annee"),
    ("Population · Insee", "has_population", "population", "annee"),
    ("Mortalité · CépiDc", "has_mortality", "mortality", "year"),
]


def coverage(view: str, year_expression: str) -> tuple[list[int], dict[int, int]]:
    rows = repository.query(
        f"SELECT {year_expression} AS year, COUNT(*)::BIGINT AS n "
        f"FROM {view} GROUP BY 1 ORDER BY 1"
    )
    years = [int(row["year"]) for row in rows if row["year"] is not None]
    return years, {int(row["year"]): int(row["n"]) for row in rows if row["year"] is not None}


def gaps(years: list[int]) -> list[int]:
    """Les années absentes entre la première et la dernière."""
    if len(years) < 2:
        return []
    return [year for year in range(years[0], years[-1] + 1) if year not in set(years)]


def thin_years(counts: dict[int, int]) -> list[int]:
    """Les années dont le volume tombe sous le tiers de la médiane.

    Le seuil est grossier à dessein : il ne s'agit pas de juger une baisse mais
    de repérer un fichier tronqué, qui se voit d'un ordre de grandeur.
    """
    if len(counts) < 3:
        return []
    ordered = sorted(counts.values())
    median = ordered[len(ordered) // 2]
    return [year for year, n in sorted(counts.items()) if n < median / 3]


#: Le seuil du serveur (`repository.metadata`) : une année pesant moins que cette
#: fraction de la plus lourde n'est pas offerte au choix.
OFFER_THRESHOLD = 0.01

#: Les années sur lesquelles se mesure le profil de liquidation. Elles doivent
#: être **mûres** — entièrement liquidées dans la fenêtre observée — sans quoi le
#: profil se mesure sur sa propre troncature. On s'arrête donc trois ans avant la
#: fin des flux.
PROFILE_YEARS = (2016, 2022)


def damir_weights() -> list[tuple[int, float, float]]:
    """(année, remboursé, part de l'année la plus lourde)."""
    rows = repository.query(
        "SELECT soi_ann AS year, SUM(rem)::DOUBLE AS rem FROM cube GROUP BY 1 ORDER BY 1"
    )
    maximum = max(float(row["rem"] or 0) for row in rows)
    return [(int(r["year"]), float(r["rem"] or 0), float(r["rem"] or 0) / maximum) for r in rows]


def liquidation_profile() -> dict[int, float]:
    """Part cumulée du remboursement d'un mois de soins atteinte après N mois."""
    rows = repository.query(
        "SELECT (flx//100)*12 + (flx%100) - (soi_ann*12 + soi_moi) AS lag, "
        "SUM(rem)::DOUBLE AS rem FROM delays "
        "WHERE soi_ann BETWEEN ? AND ? GROUP BY 1 ORDER BY 1",
        list(PROFILE_YEARS),
    )
    observed = [(int(r["lag"]), float(r["rem"])) for r in rows if r["lag"] is not None and r["lag"] >= 0]
    total = sum(rem for _, rem in observed)
    profile, cumulative = {}, 0.0
    for lag, rem in observed:
        cumulative += rem
        profile[lag] = cumulative / total
    return profile


def last_year_completeness(profile: dict[int, float]) -> tuple[int, float, float, float]:
    """(année, observé, estimé à maturité, complétude) pour la dernière année de soins.

    Le raisonnement, mois par mois : la fenêtre de flux s'arrête en décembre de
    l'année ; les soins du mois *m* n'ont donc été observés que pendant `12 - m`
    mois. Le profil dit quelle part cela représente, et la division redresse.
    """
    year = max(int(r["y"]) for r in repository.query("SELECT DISTINCT soi_ann AS y FROM delays"))
    months = repository.query(
        "SELECT soi_moi AS month, SUM(rem)::DOUBLE AS rem FROM delays WHERE soi_ann = ? GROUP BY 1",
        [year],
    )
    longest = max(profile)
    seen = sum(float(r["rem"]) for r in months)
    mature = 0.0
    for row in months:
        share = profile[min(12 - int(row["month"]), longest)]
        mature += float(row["rem"]) / share if share > 0 else 0.0
    return year, seen, mature, seen / mature if mature else 0.0


def damir_detail() -> None:
    print()
    print("### Open DAMIR — poids de chaque année")
    print()
    print("| Année | Remboursé | Part de la plus lourde | Offerte au choix |")
    print("|---:|---:|---:|---|")
    for year, rem, share in damir_weights():
        # La règle du serveur est double : un plancher en dur à 2015, puis le seuil.
        offered = "oui" if year >= 2015 and share >= OFFER_THRESHOLD else "non"
        print(f"| {year} | {rem / 1e9:,.1f} Md €".replace(",", " ")
              + f" | {share * 100:.1f} % | {offered} |")

    profile = liquidation_profile()
    print()
    print(f"### Profil de liquidation (soins {PROFILE_YEARS[0]}–{PROFILE_YEARS[1]})")
    print()
    print("| Après | Part remboursée |")
    print("|---:|---:|")
    for lag in (0, 1, 2, 3, 6, 12, 23):
        if lag in profile:
            print(f"| +{lag} mois | {profile[lag] * 100:.2f} % |")

    year, seen, mature, ratio = last_year_completeness(profile)
    print()
    print(
        f"**Complétude de l'année de soins {year} : {ratio * 100:.1f} %** — "
        f"{seen / 1e9:.1f} Md € observés pour {mature / 1e9:.1f} Md € estimés à maturité."
    )


def main() -> None:
    print("| Source | Première | Dernière | Années | Trous | Années creuses |")
    print("|---|---:|---:|---:|---|---|")
    details: list[str] = []

    for name, flag, view, expression in SOURCES:
        if flag is not None and not getattr(repository, flag):
            print(f"| {name} | — | — | — | *base absente du poste* | — |")
            continue
        years, counts = coverage(view, expression)
        if not years:
            print(f"| {name} | — | — | 0 | *aucune ligne* | — |")
            continue
        holes = gaps(years)
        thin = thin_years(counts)
        print(
            f"| {name} | {years[0]} | {years[-1]} | {len(years)} | "
            f"{', '.join(map(str, holes)) if holes else 'aucun'} | "
            f"{', '.join(map(str, thin)) if thin else 'aucune'} |"
        )
        details.append(
            f"- **{name}** — "
            + " · ".join(f"{year} : {n:,}".replace(",", " ") for year, n in sorted(counts.items()))
        )

    print()
    print("Volumes par année (lignes) :")
    print()
    for line in details:
        print(line)

    damir_detail()


if __name__ == "__main__":
    main()
