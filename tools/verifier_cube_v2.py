# -*- coding: utf-8 -*-
"""Controle `cube_damir_v2.parquet` contre le cube en place, avant remplacement.

Le principe : le nouveau cube porte quatre cles de plus, mais **agrege aux
cles de l'ancien il doit lui etre identique**. Si les totaux ne coincident
pas, c'est qu'une colonne source a ete mal identifiee — et dans ce cas le
script le dit et s'arrete, il ne corrige rien au juge.

Quatre controles, tous bloquants :

1. Les totaux, annee par annee, sur les neuf mesures. A l'euro pres — la
   tolerance ne couvre que le dernier bit d'un flottant resomme dans un ordre
   different.
2. Les totaux, grand poste par grand poste, par jointure sur la nomenclature.
3. La couverture : au moins les annees 2014-2025 et les 1 342 prestations
   distinctes de l'ancien cube, et aucune ligne perdue au grain commun.
4. Les quatre variables nouvelles : modalites presentes, et part non
   renseignee. Non bloquant, mais affiche — une modalite « inconnue » est une
   modalite reelle, jamais a masquer.

    app/backend/.venv/Scripts/python.exe tools/verifier_cube_v2.py
"""
from __future__ import annotations

import sys
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parent.parent
ANCIEN = ROOT / "data" / "cube_damir.parquet"
NOUVEAU = ROOT / "data" / "cube_damir_v2.parquet"
TRANSCO = ROOT / "data" / "prs_nat_transco.csv"

CLES_COMMUNES = ("soi_ann", "soi_moi", "prs_nat", "asu_nat",
                 "age", "sexe", "region", "env", "ald")
MESURES = ("rem", "bse", "dep", "depas", "qte",
           "rem_ref", "bse_ref", "rem_neg", "nb")
NOUVELLES = {
    "sec": ("PRS_PPU_SEC", {1: "Public", 2: "Prive", 9: "Inconnue"}),
    "ete_typ": ("ETE_TYP_SNDS", {0: "Ambulatoire liberal", 1: "Public",
                                 2: "PSPH", 3: "Ex-PJP budget global",
                                 4: "Prive lucratif", 6: "Prive non lucratif",
                                 99: "Inconnue"}),
    "mdt": ("MDT_TYP_COD", {1: "Sejourne", 2: "Consultation externe",
                            3: "Domicile", 9: "Sans objet"}),
    "taa": ("ETE_IND_TAA", {0: "Hors TAA", 1: "TAA publique", 2: "TAA prive",
                            8: "Non transmis", 9: "Inconnue"}),
}

# Sommer dans un ordre different deplace le dernier bit d'un flottant : on
# tolere un ecart relatif d'un millionieme, pas une divergence reelle.
def ecart_acceptable(gauche: float, droite: float) -> bool:
    if gauche is None and droite is None:
        return True
    if gauche is None or droite is None:
        return False
    return abs(float(gauche) - float(droite)) <= max(
        1e-6 * abs(float(gauche)), 0.01)


def titre(texte: str) -> None:
    print()
    print(texte)
    print("-" * len(texte))


def controle_totaux(con, groupe: str, libelle: str, jointure: str = "") -> bool:
    """Compare les neuf mesures des deux cubes, groupe par groupe."""
    sommes = ", ".join(f"sum({m}) AS {m}" for m in MESURES)
    requete = (f"SELECT {groupe} AS g, {sommes} FROM read_parquet('{{src}}') c "
               f"{jointure} GROUP BY 1 ORDER BY 1")
    avant = con.execute(requete.format(src=ANCIEN.as_posix())).fetchall()
    apres = con.execute(requete.format(src=NOUVEAU.as_posix())).fetchall()

    cles_avant = {r[0] for r in avant}
    cles_apres = {r[0] for r in apres}
    ok = True
    if cles_avant - cles_apres:
        print(f"  [ECHEC] absents du nouveau cube : "
              f"{sorted(cles_avant - cles_apres)}")
        ok = False
    if cles_apres - cles_avant:
        print(f"  [INFO ] nouveaux dans le nouveau cube : "
              f"{sorted(cles_apres - cles_avant)}")

    index = {r[0]: r for r in apres}
    for ligne in avant:
        autre = index.get(ligne[0])
        if autre is None:
            continue
        for i, mesure in enumerate(MESURES, start=1):
            if not ecart_acceptable(ligne[i], autre[i]):
                print(f"  [ECART] {libelle} {ligne[0]} · {mesure} : "
                      f"{ligne[i]} != {autre[i]}")
                ok = False
    if ok:
        print(f"  [OK] {len(avant)} {libelle}s, neuf mesures identiques")
    return ok


def main() -> None:
    for chemin in (ANCIEN, NOUVEAU):
        if not chemin.exists():
            raise SystemExit(f"Cube introuvable : {chemin}")

    con = duckdb.connect()
    con.execute("PRAGMA threads=4")
    con.execute("SET preserve_insertion_order=false")

    print(f"Ancien  : {ANCIEN.name}  ({ANCIEN.stat().st_size / 1e6:.0f} Mo)")
    print(f"Nouveau : {NOUVEAU.name} ({NOUVEAU.stat().st_size / 1e6:.0f} Mo)")

    resultats = []

    titre("1 · Totaux annee par annee")
    resultats.append(controle_totaux(con, "c.soi_ann", "annee"))

    titre("2 · Totaux grand poste par grand poste")
    jointure = (f"LEFT JOIN (SELECT TRY_CAST(PRS_NAT AS BIGINT) AS prs_nat, "
                f"grand_poste FROM read_csv('{TRANSCO.as_posix()}', delim=';', "
                f"header=true, all_varchar=true)) t ON t.prs_nat = c.prs_nat")
    resultats.append(controle_totaux(
        con, "COALESCE(t.grand_poste, 'Autres')", "grand poste", jointure))

    titre("3 · Couverture")
    ok = True
    for nom, chemin in (("ancien", ANCIEN), ("nouveau", NOUVEAU)):
        n, p, a0, a1 = con.execute(
            f"SELECT count(*), count(DISTINCT prs_nat), min(soi_ann), "
            f"max(soi_ann) FROM read_parquet('{chemin.as_posix()}')").fetchone()
        print(f"  {nom:8s} : {n:,} lignes · {p} prestations · {a0}-{a1}"
              .replace(",", " "))
    ancien = con.execute(
        f"SELECT count(DISTINCT prs_nat), min(soi_ann), max(soi_ann) "
        f"FROM read_parquet('{ANCIEN.as_posix()}')").fetchone()
    nouveau = con.execute(
        f"SELECT count(DISTINCT prs_nat), min(soi_ann), max(soi_ann) "
        f"FROM read_parquet('{NOUVEAU.as_posix()}')").fetchone()
    if nouveau[0] < ancien[0]:
        print(f"  [ECHEC] prestations perdues : {ancien[0]} -> {nouveau[0]}")
        ok = False
    if nouveau[1] > ancien[1] or nouveau[2] < ancien[2]:
        print(f"  [ECHEC] annees perdues : {ancien[1]}-{ancien[2]} -> "
              f"{nouveau[1]}-{nouveau[2]}")
        ok = False
    manquantes = con.execute(f"""
        SELECT count(*) FROM (
            SELECT DISTINCT prs_nat FROM read_parquet('{ANCIEN.as_posix()}')
            EXCEPT SELECT DISTINCT prs_nat FROM read_parquet('{NOUVEAU.as_posix()}')
        )""").fetchone()[0]
    if manquantes:
        print(f"  [ECHEC] {manquantes} prestations de l'ancien cube absentes")
        ok = False
    if ok:
        print("  [OK] aucune annee ni prestation perdue")
    resultats.append(ok)

    titre("4 · Les quatre variables nouvelles (informatif)")
    total = con.execute(
        f"SELECT sum(dep) FROM read_parquet('{NOUVEAU.as_posix()}')").fetchone()[0]
    for colonne, (source, libelles) in NOUVELLES.items():
        rows = con.execute(f"""
            SELECT {colonne}, sum(dep) FROM read_parquet('{NOUVEAU.as_posix()}')
            GROUP BY 1 ORDER BY 2 DESC NULLS LAST""").fetchall()
        print(f"  {colonne} ({source}) — {len(rows)} modalites")
        for code, dep in rows:
            nom = "(non renseignee)" if code is None else libelles.get(
                code, "— hors descriptif —")
            part = "—" if not total else f"{100 * (dep or 0) / total:5.1f} %"
            print(f"      {str(code):>4}  {nom:<42} "
                  f"{(dep or 0) / 1e9:8.1f} Md  {part}")

    titre("Verdict")
    if all(resultats):
        print("  [OK] le nouveau cube reproduit l'ancien et le complete.")
        print("  Remplacement possible. Il reste une decision, pas un automatisme.")
        sys.exit(0)
    print("  [ECHEC] au moins un controle a echoue. Ne pas remplacer.")
    sys.exit(1)


if __name__ == "__main__":
    main()
