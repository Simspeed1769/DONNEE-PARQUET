# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════
  CALAGE DAMIR : nos totaux vs la statistique officielle · Forsides
═══════════════════════════════════════════════════════════════════
À placer DANS le dossier Outil_damir (à côté de cube_damir.parquet
et prs_nat_transco.csv), puis double-clic sur calage_damir.bat.

Produit  calage_damir.xlsx  avec :
  · Feuille CALAGE    : nos totaux annuels (remboursé, dépense,
    soins de ville) + colonnes vides pour saisir la référence
    officielle Cnam + écart calculé automatiquement
  · Feuille GRANDS POSTES : remboursé par grand poste × année
  · Feuille CONTROLES : vérifications internes (remboursé ≤ dépense,
    part des montants négatifs, continuité annuelle)
  · Feuille LISEZ-MOI : où trouver les références officielles

Références à télécharger sur ameli.fr (Études et données) :
  · « Dépenses en date de remboursement — série labellisée 2015-2026 » :
    champ COMPLET (ville + établissements), régime général
  · « Dépenses en date de soins — série labellisée 2015-2026 » :
    soins de ville uniquement, régime général
⚠ Ces séries couvrent le RÉGIME GÉNÉRAL ; Open DAMIR est TOUS RÉGIMES :
  nos totaux doivent leur être supérieurs d'environ 8 à 12 %
  (MSA + régimes spéciaux). Un écart dans cette fourchette = calage OK.
"""
import duckdb
import os
import pandas as pd

CUBE = "cube_damir.parquet"
TRANSCO = "prs_nat_transco.csv"
SORTIE = "calage_damir.xlsx"

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
    con.register("tr", tr[["prs_nat", "grand_poste"]])

    # ── nos totaux annuels
    cal = con.execute("""
        SELECT soi_ann AS annee,
               sum(rem)                                    AS remb_total,
               sum(dep)                                    AS depense_totale,
               sum(CASE WHEN env = 1 THEN rem END)         AS remb_soins_ville,
               sum(CASE WHEN env <> 1 THEN rem END)        AS remb_hors_ville
        FROM cube WHERE soi_ann >= 2015
        GROUP BY 1 ORDER BY 1""").df()

    gp = con.execute("""
        SELECT COALESCE(t.grand_poste, 'Hors transco') AS grand_poste,
               c.soi_ann AS annee, sum(c.rem) AS remb
        FROM cube c LEFT JOIN tr t USING (prs_nat)
        WHERE c.soi_ann >= 2015 GROUP BY 1, 2""").df() \
        .pivot_table(index="grand_poste", columns="annee", values="remb")
    gp = gp.loc[gp.sum(axis=1).sort_values(ascending=False).index]
    gp["Total"] = gp.sum(axis=1)

    ctrl = con.execute("""
        SELECT soi_ann AS annee,
               sum(rem) / NULLIF(sum(dep), 0)              AS ratio_remb_dep,
               -sum(rem_neg) / NULLIF(sum(rem), 0)         AS part_regularisations,
               sum(rem) / NULLIF(lag(sum(rem)) OVER (ORDER BY soi_ann), 0) - 1
                                                           AS croissance_annuelle
        FROM cube WHERE soi_ann >= 2015
        GROUP BY 1 ORDER BY 1""").df()

    with pd.ExcelWriter(SORTIE, engine="openpyxl") as xw:
        cal2 = cal.copy()
        cal2["ref_officielle_remb (à saisir)"] = None
        cal2["ecart_%"] = None
        cal2.to_excel(xw, sheet_name="CALAGE", index=False)
        ws = xw.sheets["CALAGE"]
        for i in range(2, len(cal2) + 2):        # formule d'écart
            ws.cell(row=i, column=7,
                    value=f"=IF(F{i}=0,\"\",(B{i}-F{i})/F{i})")
            ws.cell(row=i, column=7).number_format = "0.0%"
        for col in "BCDEF":
            for i in range(2, len(cal2) + 2):
                ws[f"{col}{i}"].number_format = "#,##0"
        gp.to_excel(xw, sheet_name="GRANDS POSTES")
        wg = xw.sheets["GRANDS POSTES"]
        for row in wg.iter_rows(min_row=2, min_col=2):
            for c in row:
                c.number_format = "#,##0"
        wg.column_dimensions["A"].width = 44
        ctrl.to_excel(xw, sheet_name="CONTROLES", index=False)
        wc = xw.sheets["CONTROLES"]
        for col in "BCD":
            for i in range(2, len(ctrl) + 2):
                wc[f"{col}{i}"].number_format = "0.0%"
        lisez = pd.DataFrame({"Mode d'emploi du calage": [
            "1. Télécharger sur ameli.fr (Études et données) la série labellisée",
            "   « Dépenses en date de remboursement 2015-2026 » (champ complet)",
            "   et/ou « Dépenses en date de soins » (soins de ville).",
            "2. Saisir les totaux annuels officiels dans la colonne F de CALAGE.",
            "3. Lire l'écart : Open DAMIR = TOUS RÉGIMES, la série officielle =",
            "   RÉGIME GÉNÉRAL → un écart de +8 % à +12 % est NORMAL et attendu.",
            "   Un écart hors de cette fourchette signale un vrai problème",
            "   (double compte, mois manquants, périmètre).",
            "4. CONTROLES : ratio remboursé/dépense attendu stable (~70-80 %),",
            "   part des régularisations négatives faible (< 2-3 %),",
            "   croissance annuelle sans rupture inexpliquée hors 2020.",
        ]})
        lisez.to_excel(xw, sheet_name="LISEZ-MOI", index=False)
        xw.sheets["LISEZ-MOI"].column_dimensions["A"].width = 78

    print(f"✔ {SORTIE} généré :")
    print(cal.to_string(index=False,
          formatters={c: (lambda v: f"{v:,.0f}".replace(",", " "))
                      for c in cal.columns if c != "annee"}))

if __name__ == "__main__":
    try:
        main()
    except Exception:
        import traceback
        print("\n✖✖✖ ERREUR — copiez le message ci-dessous : ✖✖✖")
        traceback.print_exc()
    finally:
        input("\nAppuyez sur Entrée pour fermer.")
