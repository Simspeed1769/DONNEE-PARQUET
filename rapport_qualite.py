# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════
  RAPPORT QUALITÉ DAMIR · Forsides
═══════════════════════════════════════════════════════════════════
À placer DANS le dossier Outil_damir (à côté de cube_damir.parquet
et prs_nat_transco.csv), puis double-clic sur rapport_qualite.bat.

Produit  rapport_qualite.xlsx  avec 4 feuilles :
  · INCONNUS        : % du remboursé porté par chaque modalité
                      inconnue, variable par variable, année par année
  · NEGATIFS        : part des régularisations négatives par grand
                      poste et par année
  · HORS TRANSCO    : les codes prestation absents du dictionnaire
                      2023, avec leurs montants année par année
                      (→ à compléter avec les dictionnaires 2024/2025)
  · DIVERS A CLASSER: les codes classés « Divers » dans la transco,
                      triés par montant (→ reclasser les plus gros
                      dans prs_nat_transco.csv)
"""
import duckdb
import os
import pandas as pd

CUBE = "cube_damir.parquet"
TRANSCO = "prs_nat_transco.csv"
SORTIE = "rapport_qualite.xlsx"

def fmt_feuille(ws, pct=False, larg_a=40):
    for row in ws.iter_rows(min_row=2, min_col=2):
        for c in row:
            if isinstance(c.value, (int, float)):
                c.number_format = "0.00%" if pct else "#,##0"
    ws.column_dimensions["A"].width = larg_a

def main():
    for f in (CUBE, TRANSCO):
        if not os.path.exists(f):
            print(f"Fichier {f} introuvable — placer ce script dans Outil_damir.")
            return
    con = duckdb.connect()
    con.execute(f"CREATE VIEW cube AS SELECT * FROM read_parquet('{CUBE}')")
    tr = pd.read_csv(TRANSCO, sep=";", encoding="utf-8-sig", dtype=str)
    tr["prs_nat"] = pd.to_numeric(tr["PRS_NAT"], errors="coerce")
    tr = tr.dropna(subset=["prs_nat"])
    tr["prs_nat"] = tr["prs_nat"].astype("int64")
    con.register("tr", tr[["prs_nat", "libelle", "grand_poste", "poste"]])
    a_env = "env" in [r[0] for r in con.execute(
        "DESCRIBE SELECT * FROM cube").fetchall()]

    # ── 1. INCONNUS : part du remboursé par modalité inconnue × année
    tests = [("Âge inconnu (99)", "age = 99"),
             ("Sexe inconnu (9)", "sexe = 9"),
             ("Région inconnue (99)", "region = 99"),
             ("Assurance sans objet (0)", "asu_nat = 0"),
             ("Assurance inconnue (99)", "asu_nat = 99")]
    if a_env:
        tests += [("Enveloppe inconnue (9)", "env = 9"),
                  ("Enveloppe sans objet (98)", "env = 98")]
    tests.append(("≥ 1 modalité inconnue",
                  " OR ".join(t[1] for t in tests)))
    lignes = []
    for lbl, cond in tests:
        d = con.execute(f"""
            SELECT soi_ann, sum(CASE WHEN {cond} THEN rem END) * 1.0
                   / NULLIF(sum(rem), 0) AS p
            FROM cube WHERE soi_ann >= 2015 GROUP BY 1 ORDER BY 1""").df()
        lignes.append(d.set_index("soi_ann").p.rename(lbl))
    inconnus = pd.concat(lignes, axis=1).T
    inconnus.index.name = "Modalité inconnue"

    # ── 2. NEGATIFS : part des régularisations par grand poste × année
    negatifs = con.execute("""
        SELECT COALESCE(t.grand_poste, 'Hors transco') AS gp,
               c.soi_ann, -sum(c.rem_neg) * 1.0
               / NULLIF(sum(c.rem) - sum(c.rem_neg), 0) AS p
        FROM cube c LEFT JOIN tr t USING (prs_nat)
        WHERE c.soi_ann >= 2015 GROUP BY 1, 2""").df() \
        .pivot_table(index="gp", columns="soi_ann", values="p")
    negatifs.index.name = "Part des régularisations négatives"

    # ── 3. HORS TRANSCO : codes absents du dictionnaire 2023, par année
    horst = con.execute("""
        SELECT c.prs_nat AS code, c.soi_ann, sum(c.rem) AS rem
        FROM cube c WHERE c.prs_nat NOT IN (SELECT prs_nat FROM tr)
          AND c.soi_ann >= 2015 GROUP BY 1, 2""").df()
    if not horst.empty:
        horst = horst.pivot_table(index="code", columns="soi_ann",
                                  values="rem")
        horst["Total"] = horst.sum(axis=1)
        horst["Années présentes"] = horst.drop(columns="Total") \
            .notna().sum(axis=1)
        horst = horst.sort_values("Total", ascending=False)
    else:
        horst = pd.DataFrame({"info": ["aucun code hors transco"]})

    # ── 3bis. VIE DES CODES : quelles prestations arrivent, lesquelles partent
    vie = con.execute("""
        SELECT prs_nat AS code, min(soi_ann) AS premiere_annee,
               max(soi_ann) AS derniere_annee, sum(rem) AS rem_total
        FROM cube WHERE soi_ann >= 2015 AND rem <> 0
        GROUP BY 1""").df()
    an_min, an_max = int(vie.premiere_annee.min()), int(vie.derniere_annee.max())
    synthese = []
    for a in range(an_min, an_max + 1):
        actifs = ((vie.premiere_annee <= a) & (vie.derniere_annee >= a)).sum()
        nouveaux = (vie.premiere_annee == a).sum() if a > an_min else None
        disparus = (vie.derniere_annee == a - 1).sum() if a > an_min else None
        synthese.append({"annee": a, "codes_actifs": actifs,
                         "nouveaux": nouveaux, "disparus": disparus})
    vie_synth = pd.DataFrame(synthese)
    lib = tr.set_index("prs_nat").libelle
    vie["libelle"] = vie.code.map(lib).fillna("(hors nomenclature 2023)")
    mouvements = vie[(vie.premiere_annee > an_min)
                     | (vie.derniere_annee < an_max)]         .sort_values(["premiere_annee", "rem_total"],
                     ascending=[False, False])         [["code", "libelle", "premiere_annee", "derniere_annee", "rem_total"]]

    # ── 3ter. VRAISEMBLANCE : coût moyen par acte, alerte si dérive
    vrais = con.execute("""
        SELECT COALESCE(t.grand_poste, 'Hors transco') AS gp,
               c.soi_ann, sum(c.rem) / NULLIF(sum(c.qte), 0) AS cout_moyen
        FROM cube c LEFT JOIN tr t USING (prs_nat)
        WHERE c.soi_ann >= 2015 GROUP BY 1, 2""").df()         .pivot_table(index="gp", columns="soi_ann", values="cout_moyen")
    med = vrais.median(axis=1)
    alertes = []
    for gp_, ligne in vrais.iterrows():
        m = med[gp_]
        drapeaux = [str(int(a)) for a, v in ligne.items()
                    if pd.notna(v) and m and (v < 0 or v > 2 * m or v < 0.5 * m)]
        alertes.append("⚠ " + ", ".join(drapeaux) if drapeaux else "OK")
    vrais["Alerte (écart > ±50 % vs médiane du poste)"] = alertes
    vrais.index.name = "Coût moyen par acte (€)"

    # ── 4. DIVERS À CLASSER : les codes « Divers », triés par montant
    divers = con.execute("""
        SELECT c.prs_nat AS code, any_value(t.libelle) AS libelle,
               sum(c.rem) AS rem_total
        FROM cube c JOIN tr t USING (prs_nat)
        WHERE t.poste = 'Divers'
        GROUP BY 1 ORDER BY rem_total DESC""").df()

    with pd.ExcelWriter(SORTIE, engine="openpyxl") as xw:
        inconnus.to_excel(xw, sheet_name="INCONNUS")
        fmt_feuille(xw.sheets["INCONNUS"], pct=True)
        negatifs.to_excel(xw, sheet_name="NEGATIFS")
        fmt_feuille(xw.sheets["NEGATIFS"], pct=True, larg_a=44)
        horst.to_excel(xw, sheet_name="HORS TRANSCO")
        fmt_feuille(xw.sheets["HORS TRANSCO"], larg_a=12)
        divers.to_excel(xw, sheet_name="DIVERS A CLASSER", index=False)
        fmt_feuille(xw.sheets["DIVERS A CLASSER"], larg_a=10)
        xw.sheets["DIVERS A CLASSER"].column_dimensions["B"].width = 62
        vie_synth.to_excel(xw, sheet_name="VIE DES CODES", index=False)
        fmt_feuille(xw.sheets["VIE DES CODES"], larg_a=10)
        mouvements.to_excel(xw, sheet_name="ARRIVEES-DEPARTS", index=False)
        wm = xw.sheets["ARRIVEES-DEPARTS"]
        for i in range(2, len(mouvements) + 2):
            wm[f"E{i}"].number_format = "#,##0"
        wm.column_dimensions["B"].width = 58
        vrais2 = vrais.copy()
        vrais2.to_excel(xw, sheet_name="VRAISEMBLANCE")
        wv = xw.sheets["VRAISEMBLANCE"]
        for row in wv.iter_rows(min_row=2, min_col=2,
                                max_col=1 + len(vrais.columns) - 1):
            for c in row:
                if isinstance(c.value, (int, float)):
                    c.number_format = "#,##0.00"
        wv.column_dimensions["A"].width = 44

    print(f"✔ {SORTIE} généré.")
    print()
    print("Aperçu — part du remboursé sur ≥ 1 modalité inconnue :")
    print((inconnus.iloc[-1] * 100).round(2).to_string())
    if "Total" in getattr(horst, "columns", []):
        print()
        print(f"Codes hors transco : {len(horst)} · "
              f"{horst.Total.sum()/1e9:,.2f} Md€".replace(",", " "))
    print(f"Codes « Divers » à reclasser : {len(divers)}")
    print(f"Mouvements de codes (arrivées/départs depuis {an_min + 1}) : "
          f"{len(mouvements)}")
    print("Note : les « disparus » de la dernière année peuvent n'être que "
          "des codes en attente de liquidation.")

if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        print("\n✖✖✖ ERREUR — copiez le message ci-dessous : ✖✖✖")
        traceback.print_exc()
    finally:
        input("\nAppuyez sur Entrée pour fermer.")
