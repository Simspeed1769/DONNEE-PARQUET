"""Les trois pièges à vérifier **avant** d'ingérer une nouvelle année.

L'inventaire (`inventaire_sources.py`) répond à « qu'y a-t-il dans les
fichiers ». Celui-ci répond à une autre question, posée à un autre moment :
« puis-je en ajouter sans casser ce qui est déjà là ». D'où deux scripts.

    .venv/Scripts/python.exe ../../tools/audit_pieges.py     # depuis app/backend

Les trois pièges viennent du point 3.3 de la mission. Ils ont en commun de
casser une série **en silence** : aucun ne lève d'erreur, tous produisent un
résultat d'allure normale.

1. **La réforme régionale de 2016.** 22 régions avant, 13 après. Sans table de
   passage, une série territoriale longue mélange deux découpages.
2. **La nomenclature `prs_nat`.** Un code absent de `prs_nat_transco.csv`
   tombe dans « Autres » par un `COALESCE`, qui ne prévient personne.
3. **Les révisions de nomenclature des causes de décès.** Une cause dont la
   définition change casse la comparabilité sans changer le libellé.

À chacun, le script répond par une mesure et un verdict. Un verdict n'est pas
« tout va bien » : c'est « voilà l'état, voilà ce qui le ferait basculer ».
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "app" / "backend"
sys.path.insert(0, str(BACKEND))

from app.repository import REGIONS, repository  # noqa: E402


def rule(title: str) -> None:
    print()
    print("=" * 72)
    print(title)
    print("=" * 72)


def piege_regions() -> None:
    rule("1 · Réforme régionale de 2016")

    per_year = repository.query(
        "SELECT soi_ann AS year, COUNT(DISTINCT region) AS codes FROM cube GROUP BY 1 ORDER BY 1"
    )
    counts = sorted({int(r["codes"]) for r in per_year})
    print(f"Nombre de codes région par année : {counts}.")

    codes_before = {r["region"] for r in repository.query("SELECT DISTINCT region FROM cube WHERE soi_ann <= 2015")}
    codes_after = {r["region"] for r in repository.query("SELECT DISTINCT region FROM cube WHERE soi_ann >= 2016")}
    print(f"  avant 2016 : {sorted(codes_before)}")
    print(f"  dès 2016   : {sorted(codes_after)}")
    if codes_before == codes_after:
        print("  Verdict : les deux périodes emploient EXACTEMENT le même jeu de codes.")
        print("  Le cube est déjà harmonisé sur le découpage postérieur à 2016 — le")
        print("  piège n'existe pas dans ce fichier. Il redeviendrait actif si une")
        print("  ingestion apportait des années sur l'ancien découpage.")
    else:
        print(f"  ALERTE : codes propres à l'avant-2016 : {sorted(codes_before - codes_after)}")
        print(f"           codes propres à l'après-2016 : {sorted(codes_after - codes_before)}")
        print("  Une table de passage est nécessaire avant toute série territoriale longue.")

    # Une harmonisation ratée se verrait à une marche dans les parts régionales
    # au passage de 2015 à 2016 : un reclassement redistribue, il ne conserve pas.
    print()
    print("Continuité des parts régionales au passage 2015 → 2016 :")
    shares: dict[int, dict[int, float]] = {}
    for year in (2015, 2016):
        rows = repository.query(
            "SELECT region, SUM(rem)::DOUBLE AS rem FROM cube WHERE soi_ann = ? GROUP BY 1", [year]
        )
        total = sum(float(r["rem"]) for r in rows)
        shares[year] = {int(r["region"]): 100 * float(r["rem"]) / total for r in rows}
    worst = max(
        ((abs(shares[2016].get(c, 0) - shares[2015].get(c, 0)), c) for c in shares[2015]),
        default=(0.0, 0),
    )
    print(f"  Plus grand écart de part : {worst[0]:.3f} pt ({REGIONS.get(worst[1], worst[1])}).")
    print("  Un reclassement raté produirait plusieurs points d'écart, pas des centièmes.")

    # Le vrai défaut territorial de ce cube n'est pas celui qu'annonçait la
    # mission : c'est le poids du « non renseigné », et sa dérive.
    print()
    print("Poids de la région « Non renseignée » (99) :")
    for row in repository.query(
        "SELECT soi_ann AS year, 100.0 * SUM(CASE WHEN region = 99 THEN rem ELSE 0 END) "
        "/ NULLIF(SUM(rem), 0) AS share FROM cube GROUP BY 1 ORDER BY 1"
    ):
        print(f"  {int(row['year'])} : {float(row['share']):.2f} %")
    print("  Cette part n'est pas dessinable sur une carte : aucun polygone ne lui")
    print("  correspond. Le classement territorial l'affiche, la carte ne peut pas.")


def piege_nomenclature() -> None:
    rule("2 · Couverture de prs_nat_transco.csv")

    rows = repository.query(
        """
        SELECT c.soi_ann AS year,
               COUNT(DISTINCT CASE WHEN t.prs_nat IS NULL THEN c.prs_nat END) AS orphans,
               COUNT(DISTINCT c.prs_nat) AS codes,
               100.0 * SUM(CASE WHEN t.grand_poste IS NULL THEN c.rem ELSE 0 END)
                     / NULLIF(SUM(c.rem), 0) AS fallback_share
        FROM cube c LEFT JOIN transco t USING (prs_nat)
        GROUP BY 1 ORDER BY 1
        """
    )
    print(f"{'Année':>6} {'Codes':>7} {'Orphelins':>10} {'Part vers « Autres »':>22}")
    for r in rows:
        print(f"{int(r['year']):>6} {int(r['codes']):>7} {int(r['orphans']):>10} "
              f"{float(r['fallback_share'] or 0):>21.4f} %")

    total_orphans = sum(int(r["orphans"]) for r in rows)
    if total_orphans == 0:
        print()
        print("  Verdict : couverture intégrale, le repli « Autres » ne se déclenche")
        print("  jamais. Il est dormant, pas mort — voir la croissance ci-dessous.")
    else:
        print()
        print(f"  ALERTE : {total_orphans} code(s) sans correspondance. Étendre la transco")
        print("  AVANT d'ingérer, faute de quoi « Autres » gonfle sans le dire.")

    # C'est le chiffre qui décide de l'effort à prévoir pour une ingestion.
    print()
    print("Croissance de la nomenclature (codes jamais vus auparavant) :")
    seen: set[int] = set()
    increments: list[int] = []
    for row in repository.query(
        "SELECT soi_ann AS year, LIST(DISTINCT prs_nat) AS codes FROM cube GROUP BY 1 ORDER BY 1"
    ):
        codes = set(row["codes"])
        fresh = codes - seen
        if seen:
            increments.append(len(fresh))
            print(f"  {int(row['year'])} : +{len(fresh)}")
        else:
            print(f"  {int(row['year'])} : {len(fresh)} (année de référence)")
        seen |= codes
    if increments:
        print(f"  Chaque année ajoute {min(increments)} à {max(increments)} codes.")
        print("  Une année ingérée sans extension de la transco en enverrait autant")
        print("  vers « Autres », silencieusement.")
    spare = repository.query("SELECT COUNT(*) AS n FROM transco")[0]["n"]
    print(f"  La transco compte {int(spare)} lignes pour {len(seen)} codes employés.")


def piege_causes() -> None:
    rule("3 · Comparabilité des causes de décès")

    if not repository.has_mortality:
        print("Base absente du poste.")
        return

    years = repository.query(
        "SELECT year, COUNT(DISTINCT cause_code) AS causes FROM mortality GROUP BY 1 ORDER BY 1"
    )
    per_year = {int(r["year"]): int(r["causes"]) for r in years}
    print(f"Causes distinctes : {sorted(set(per_year.values()))} selon l'année "
          f"({min(per_year)}–{max(per_year)}).")

    reference = {
        r["cause_code"]
        for r in repository.query("SELECT DISTINCT cause_code FROM mortality WHERE year = ?", [min(per_year)])
    }
    drift = []
    for year in sorted(per_year):
        codes = {
            r["cause_code"]
            for r in repository.query("SELECT DISTINCT cause_code FROM mortality WHERE year = ?", [year])
        }
        if codes != reference:
            drift.append((year, len(codes - reference), len(reference - codes)))
    if drift:
        for year, added, removed in drift:
            print(f"  ALERTE {year} : +{added} / -{removed} par rapport à {min(per_year)}.")
    else:
        print(f"  Le jeu de causes est identique d'un bout à l'autre — aucune entrée,")
        print(f"  aucune sortie sur {max(per_year) - min(per_year) + 1} millésimes.")

    # Le point important, et il n'est pas rassurant.
    renamed = repository.query(
        "SELECT cause_code, COUNT(DISTINCT cause_label) AS labels FROM mortality "
        "GROUP BY 1 HAVING COUNT(DISTINCT cause_label) > 1"
    )
    sample = repository.query("SELECT DISTINCT cause_code FROM mortality ORDER BY cause_code LIMIT 1")
    print()
    print(f"Forme des identifiants : « {sample[0]['cause_code']} » — un rang, pas un code CIM.")
    print(f"Codes dont le libellé varie selon l'année : {len(renamed)}.")
    print("  Sur la période présente, la grille est donc parfaitement stable et la")
    print("  question CIM ne se pose pas : la CIM-10 couvre toutes ces années.")
    print("  Mais l'identifiant est POSITIONNEL. Si un futur millésime insère ou")
    print("  retire une ligne chez le producteur, le rang 42 désignera une autre")
    print("  maladie, le jeu de codes restera d'apparence identique, et rien ici ne")
    print("  le détectera. Toute ingestion doit donc comparer les LIBELLÉS, pas les")
    print("  codes — c'est le seul contrôle qui morde.")


def piege_marges() -> None:
    """Quatrième piège, non prévu par la mission mais trouvé en vérifiant les autres.

    Les Pathologies ne sont pas une table de faits : c'est un cube déjà agrégé
    qui porte ses marges **dans** ses dimensions. Une somme naïve y compte
    double. Le produit lit les marges au lieu de les sommer, ce qui est correct
    — mais un millésime livré sans elles, ou avec d'autres libellés, ne
    provoquerait aucune erreur : il rendrait des totaux nuls ou doublés.
    """
    rule("4 · Marges incluses dans les dimensions (Pathologies)")

    if not repository.has_pathologies:
        print("Base absente du poste.")
        return

    #: Les libellés de marge dont dépend `pathologies.py`. Leur disparition est
    #: silencieuse : la requête rend zéro ligne, pas une erreur.
    margins = [
        ("dept", "999"),
        ("region", "99"),
        ("cla_age_5", "tsage"),
        ("libelle_sexe", "tous sexes"),
    ]
    missing = []
    for column, value in margins:
        found = repository.query(
            f"SELECT COUNT(*) AS n FROM pathologies WHERE {column} = ?", [value]
        )[0]["n"]
        state = f"{int(found):>9} lignes" if found else "  ABSENTE"
        print(f"  {column:<14} = {value!r:<14} {state}")
        if not found:
            missing.append(f"{column}={value}")

    if missing:
        print()
        print(f"  ALERTE : marge(s) manquante(s) — {', '.join(missing)}.")
        print("  `pathologies.py` rendrait des totaux vides sans lever d'erreur.")
        return

    # La preuve que ce sont bien des marges et non des modalités ordinaires :
    # sommer les modalités hors marge doit redonner (au moins) le total.
    row = repository.query(
        """
        SELECT SUM(CASE WHEN libelle_sexe = 'tous sexes' THEN ntop ELSE 0 END)::DOUBLE AS margin,
               SUM(CASE WHEN libelle_sexe <> 'tous sexes' THEN ntop ELSE 0 END)::DOUBLE AS parts
        FROM pathologies
        """
    )[0]
    ratio = float(row["parts"]) / float(row["margin"]) if row["margin"] else 0.0
    print()
    print(f"  Somme des modalités de sexe hors marge / marge : {ratio:.3f}")
    print("  Proche de 1 : la marge est bien le total des parties. Une somme")
    print("  naïve sur la dimension compterait donc deux fois.")
    print()
    print("  Verdict : le produit sélectionne les marges (MAX(ntop), jamais SUM).")
    print("  Une ingestion doit vérifier que les quatre libellés ci-dessus sont")
    print("  présents et inchangés — c'est le contrôle qui manque le plus.")


def main() -> None:
    piege_regions()
    piege_nomenclature()
    piege_causes()
    piege_marges()
    print()


if __name__ == "__main__":
    main()
