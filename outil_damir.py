# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════
  EXPLORATEUR DAMIR · Forsides · V3
═══════════════════════════════════════════════════════════════════
Lancement : double-clic sur  lancer_outil_damir.bat
Dossier requis :  outil_damir.py + cube_damir.parquet
                  + cube_delais.parquet + prs_nat_transco.csv
"""

import duckdb
import pandas as pd
import plotly.graph_objects as go
import plotly.io as pio
import streamlit as st
from pathlib import Path

try:  # contournement d'un blocage connu de kaleido sous Windows
    pio.kaleido.scope.chromium_args += ("--disable-gpu", "--single-process")
except Exception:
    pass

CUBE = "cube_damir.parquet"
CUBE_DELAIS = "cube_delais.parquet"
TRANSCO = "prs_nat_transco.csv"
ANNEE_MIN = 2015          # tout ce qui précède est masqué (queues de liquidation)

ROUGE, ROUGE_FONCE = "#EF4647", "#5B0C02"
GRIS, GRIS_MOYEN, GRIS_CLAIR = "#404040", "#808080", "#BFBFBF"

TOUS, TOUTE_FR = "Tous", "France entière"
TOUT_GP = "— Tous les grands postes"
TOUT_P = "— Tout le grand poste (regroupé)"
TOUT_SP = "— Tout le poste (regroupé)"

REGIONS = {1: "Guadeloupe", 2: "Martinique", 3: "Guyane", 4: "La Réunion",
           5: "DOM (ancien code)", 6: "Mayotte", 11: "Île-de-France",
           24: "Centre-Val de Loire", 27: "Bourgogne-Franche-Comté",
           28: "Normandie", 32: "Hauts-de-France", 44: "Grand Est",
           52: "Pays de la Loire", 53: "Bretagne", 75: "Nouvelle-Aquitaine",
           76: "Occitanie", 84: "Auvergne-Rhône-Alpes",
           93: "Provence-Alpes-Côte d'Azur", 94: "Corse", 99: "Inconnue"}
AGES = {0: "0-19 ans", 20: "20-29 ans", 30: "30-39 ans", 40: "40-49 ans",
        50: "50-59 ans", 60: "60-69 ans", 70: "70-79 ans",
        80: "80 ans et +", 99: "Âge inconnu"}
ASU = {0: "Sans objet", 10: "Maladie",
       11: "Maladie — cours navigation > 6 mois",
       12: "Maladie — cours navigation < 6 mois",
       22: "Soins aux invalides de guerre", 30: "Maternité", 40: "AT-MP",
       50: "Décès", 70: "Prestations supplémentaires", 80: "Invalidité",
       90: "Prévention maladie", 99: "Inconnue"}
ENV = {0: "Non pris en charge par le RG", 1: "Soins de ville",
       2: "Hospitalisation & médico-social", 3: "Prestations hors ONDAM",
       4: "Prévention", 5: "FNAS (action sanitaire et sociale)",
       7: "C2S / AME / ACS", 8: "Alsace-Moselle", 9: "Inconnue",
       98: "Sans objet"}

st.set_page_config(page_title="Explorateur DAMIR · Forsides",
                   page_icon="💶", layout="wide")

st.markdown(f"""
<style>
    .bandeau {{ background: white; border-left: 5px solid {ROUGE};
                padding: 6px 18px; margin-bottom: 10px; }}
    .bandeau h1 {{ color: {GRIS}; margin: 0; font-size: 1.15rem; }}
    section[data-testid="stSidebar"] {{
        background: #F7F7F8; border-right: 1px solid #E4E4E7; }}
    section[data-testid="stSidebar"] h3 {{
        color: {GRIS}; font-size: .82rem; font-weight: 700;
        text-transform: uppercase; letter-spacing: .04em;
        margin: 22px 0 10px 0; padding: 0; border: none; display: block; }}
    section[data-testid="stSidebar"] h3::before {{
        content: attr(data-num); display: inline-flex;
        width: 20px; height: 20px; margin-right: 8px;
        background: {ROUGE}; color: white; border-radius: 50%;
        font-size: .72rem; font-weight: 700;
        align-items: center; justify-content: center; vertical-align: middle; }}
    section[data-testid="stSidebar"] div[data-baseweb="select"] > div,
    section[data-testid="stSidebar"] div[data-baseweb="input"] > div {{
        background: white; border-radius: 8px; border-color: #D9D9DE; }}
    section[data-testid="stSidebar"] label {{ color: {GRIS_MOYEN}; font-size: .82rem; }}
    section[data-testid="stSidebar"] .stRadio {{
        background: white; border: 1px solid #E4E4E7; border-radius: 8px;
        padding: 8px 12px; margin-top: 2px; }}
    section[data-testid="stSidebar"] hr {{ margin: 4px 0 0 0; border: none;
        border-top: 1px solid #D9D9DE; }}
    .stats-bande {{ display: flex; flex-wrap: wrap; gap: 10px 34px;
        padding: 4px 6px 8px 6px; }}
    .stats-bande .item {{ min-width: 130px; }}
    .stats-bande .lbl {{ color: {GRIS_MOYEN}; font-size: .74rem;
        text-transform: uppercase; letter-spacing: .03em; }}
    .stats-bande .val {{ color: {GRIS}; font-size: 1.02rem; font-weight: 700;
        margin-top: 1px; }}
    .puces {{ display: flex; flex-wrap: wrap; gap: 8px; margin: 2px 0 14px 0; }}
    .puce {{ background: #F7F7F8; border: 1px solid #E4E4E7; border-radius: 999px;
        padding: 4px 13px; font-size: .8rem; color: {GRIS}; }}
    .puce b {{ color: {ROUGE_FONCE}; font-weight: 600; }}
    .puce.rouge {{ background: {ROUGE}; border-color: {ROUGE}; color: white; }}
    .puce.rouge b {{ color: white; }}
    div[data-testid="stPlotlyChart"] {{ background: white;
        border: 1px solid #ECECEF; border-radius: 10px; padding: 8px 6px 2px 2px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04); }}
    div[data-testid="stExpander"] {{ border: 1px solid #ECECEF;
        border-radius: 10px; }}
    section[data-testid="stSidebar"] .stRadio label {{ font-size: .86rem; }}
    .note-lecture {{
        background: #F7F7F8; border: 1px solid #E4E4E7; border-left: 5px solid {GRIS_CLAIR};
        border-radius: 6px; padding: 10px 14px; font-size: .85rem; color: {GRIS};
        margin: 2px 0 12px 0; }}
</style>
""", unsafe_allow_html=True)

# ══════════════════════════════════ MOTEUR
@st.cache_resource(show_spinner=False)
def moteur():
    con = duckdb.connect()
    con.execute(f"CREATE VIEW cube AS SELECT * FROM read_parquet('{CUBE}')")
    tr = pd.read_csv(TRANSCO, sep=";", encoding="utf-8-sig", dtype=str)
    tr["prs_nat"] = pd.to_numeric(tr["PRS_NAT"], errors="coerce")
    tr = tr.dropna(subset=["prs_nat"])
    tr["prs_nat"] = tr["prs_nat"].astype("int64")
    tr = tr[["prs_nat", "libelle", "grand_poste", "poste", "sous_poste"]]
    # codes présents dans les données mais absents de la transco (dictionnaire
    # 2023) : rattachés automatiquement pour qu'aucun euro n'échappe aux vues
    codes_cube = con.execute("SELECT DISTINCT prs_nat FROM cube").df().prs_nat
    manquants = sorted(set(int(c) for c in codes_cube.dropna())
                       - set(tr.prs_nat))
    if manquants:
        tr = pd.concat([tr, pd.DataFrame({
            "prs_nat": manquants,
            "libelle": [f"Code {c} (hors nomenclature 2023)"
                        for c in manquants],
            "grand_poste": "Autres", "poste": "Codes hors transco",
            "sous_poste": "Codes hors transco"})], ignore_index=True)
    con.register("tr", tr)
    if Path(CUBE_DELAIS).exists():
        con.execute(f"CREATE VIEW delais AS SELECT * FROM read_parquet('{CUBE_DELAIS}')")
    return con

@st.cache_data(show_spinner=False)
def q(sql, params=None):
    return moteur().execute(sql, params or []).df()

def fmt_mnt(v):
    if pd.isna(v):
        return "—"
    a = abs(v)
    if a >= 1e9:
        return f"{v/1e9:,.2f} Md€".replace(",", " ").replace(".", ",")
    if a >= 1e6:
        return f"{v/1e6:,.1f} M€".replace(",", " ").replace(".", ",")
    return f"{v:,.0f} €".replace(",", " ")

def fmt_val(v, kind):
    if kind == "mnt":
        return fmt_mnt(v)
    if kind == "pct":
        return "—" if pd.isna(v) else f"{v:.1f} %".replace(".", ",")
    if pd.isna(v):
        return "—"
    return (f"{v/1e6:,.1f} M actes" if abs(v) >= 1e6 else f"{v:,.0f} actes") \
        .replace(",", " ").replace(".", ",")

def court(t, n=44):
    t = str(t)
    return t if len(t) <= n else t[:n-1] + "…"

def style_forsides(fig, titre, haut=560):
    fig.update_layout(
        height=haut,
        title=dict(text=f"<b>{titre}</b>", font=dict(color=GRIS, size=19),
                   x=0.5, xanchor="center"),
        font=dict(family="Arial", color=GRIS, size=13),
        plot_bgcolor="white", paper_bgcolor="white",
        margin=dict(l=70, r=60, t=95, b=115),
        hoverlabel=dict(bgcolor="white", bordercolor=ROUGE, font_color=GRIS),
        showlegend=False,
    )
    fig.update_xaxes(showgrid=False, linecolor=GRIS_CLAIR)
    fig.update_yaxes(gridcolor="#EEEEEE", zeroline=False)
    fig.add_annotation(text="Source : Open DAMIR, Assurance Maladie — Traitement Forsides",
                       xref="paper", yref="paper", x=0, y=-0.22,
                       showarrow=False, font=dict(size=11, color=GRIS_MOYEN))
    return fig

# ══════════════════════════════════ EN-TÊTE
st.markdown('<div class="bandeau"><h1>Explorateur DAMIR</h1>'
            '<p style="color:#808080;font-size:.82rem;margin:2px 0 0 0;">'
            'Dépenses de santé de l\'Assurance Maladie — analyse par prestation, '
            'population et année de soins</p></div>', unsafe_allow_html=True)

for f, msg in [(CUBE, "lancer construire_cube.bat puis copier les cubes ici"),
               (TRANSCO, "copier prs_nat_transco.csv ici")]:
    if not Path(f).exists():
        st.error(f"Fichier **{f}** introuvable — {msg}."); st.stop()
A_DELAIS = Path(CUBE_DELAIS).exists()

COLS_CUBE = set(q(f"DESCRIBE SELECT * FROM read_parquet('{CUBE}')").column_name)
A_REF = {"rem_ref", "bse_ref"} <= COLS_CUBE
A_ENV = "env" in COLS_CUBE
A_ALD = "ald" in COLS_CUBE

MESURES = {
    "Montant remboursé": ("sum(rem)", "mnt"),
    "Dépense totale": ("sum(dep)", "mnt"),
    "Reste à charge après AMO (dépense − remboursé)": ("sum(dep) - sum(rem)", "mnt"),
    "Ticket modérateur (base − remboursé, part de référence)":
        (("sum(bse_ref) - sum(rem_ref)" if A_REF else "sum(bse) - sum(rem)"), "mnt"),
    "Dépassements": ("sum(depas)", "mnt"),
    "Quantité d'actes": ("sum(qte)", "qte"),
    "Taux de prise en charge (%)": ("100.0*sum(rem)/NULLIF(sum(dep),0)", "pct"),
}
if "rem_neg" in COLS_CUBE:
    MESURES["Régularisations négatives"] = ("sum(rem_neg)", "mnt")
    MESURES["Remboursé hors régularisations (brut)"] = \
        ("sum(rem) - sum(rem_neg)", "mnt")
    MESURES["Part des régularisations (%)"] = \
        ("-100.0*sum(rem_neg)/NULLIF(sum(rem) - sum(rem_neg), 0)", "pct")

# années de soins « pleines » (≥ ANNEE_MIN et ≥ 1 % de la meilleure année)
_a = q(f"""SELECT soi_ann, sum(rem) AS r FROM cube WHERE soi_ann >= {ANNEE_MIN}
           GROUP BY 1 HAVING sum(rem) > 0 ORDER BY 1""")
annees = _a[_a.r >= 0.01 * _a.r.max()].soi_ann.tolist()
gp_tri = q("""SELECT t.grand_poste AS gp, sum(c.rem) AS r
              FROM cube c JOIN tr t USING (prs_nat)
              GROUP BY 1 ORDER BY r DESC""").gp.tolist()
# codes prestation présents dans les données mais absents de la transco :
# ils échappent aux vues par poste — à réintégrer dans le CSV de transco.
orphelins = q("""SELECT count(DISTINCT prs_nat) AS n,
                        COALESCE(sum(rem), 0) AS r FROM cube
                 WHERE prs_nat IN (SELECT prs_nat FROM tr
                                   WHERE poste = 'Codes hors transco')""")

# ── Fiabilité : une année de soins N est « liquidée » si les flux disponibles
# couvrent au moins K97 mois après décembre N, où K97 = délai auquel 97 % des
# montants sont historiquement liquidés (mesuré sur les années pleines).
K97 = 4
annee_fiable_max = int(max(annees)) - 1
if A_DELAIS:
    try:
        mf = int(q("SELECT max(flx) AS m FROM delais").m.iloc[0])
        mois_dispo = (mf // 100) * 12 + (mf % 100)
        cad_ref = q("""SELECT (flx//100)*12+(flx%100)-(soi_ann*12+soi_moi) AS delai,
                              sum(rem) AS rem FROM delais WHERE soi_ann <= ?
                       GROUP BY 1 HAVING delai BETWEEN 0 AND 24 ORDER BY 1""",
                    [int(max(annees)) - 2])
        if not cad_ref.empty:
            cum_ref = 100 * cad_ref.rem.cumsum() / cad_ref.rem.sum()
            K97 = int(cad_ref.delai[cum_ref >= 97].iloc[0]) \
                  if (cum_ref >= 97).any() else 6
        fiables = [a for a in annees if mois_dispo >= int(a) * 12 + 12 + K97]
        if fiables:
            annee_fiable_max = int(max(fiables))
    except Exception:
        pass

SEXES = {1: "Hommes", 2: "Femmes", 0: "Non renseigné", 9: "Inconnu"}

MODES = ["Évolution annuelle", "Femmes vs Hommes",
         "Répartition (barres)", "Top prestations",
         "Distribution (boxplot)"] + \
        (["Cadence de liquidation"] if A_DELAIS else [])

# ─────────────────────────────────────────────── BARRE LATÉRALE
with st.sidebar:
    st.markdown('<h3 data-num="1">L\'affichage</h3>', unsafe_allow_html=True)
    vue = st.radio("Affichage", ["Graphique", "Extraction de données"],
                   horizontal=True, label_visibility="collapsed")
    extraction = vue == "Extraction de données"
    tableau = extraction          # même aiguillage interne
    if extraction:
        mode = "Extraction de données"
        fvh = cadence = repartition = top15 = barres = axe_flux = boxp = False
        DIMS_T = ["Année de soins", "Grand poste", "Poste", "Sous-poste",
                  "Prestation", "Région", "Tranche d'âge", "Sexe",
                  "Nature d'assurance"] \
                 + (["Enveloppe"] if A_ENV else []) \
                 + (["Motif d'exonération (ALD)"] if A_ALD else [])
        dims_x = st.multiselect("Variables de la base (colonnes)", DIMS_T,
            default=["Année de soins", "Sexe", "Région"],
            help="Chaque ligne de la base = un croisement de ces variables ; "
                 "les mesures choisies plus bas s'ajoutent en colonnes. "
                 "Ex. année + région + sexe → une ligne « 2020 · IDF · "
                 "Hommes » avec ses montants.")
        age_borne = False
        if "Tranche d'âge" in dims_x:
            age_borne = st.radio("Affichage des âges",
                ["Tranche (« 30-39 ans »)", "Borne inférieure (« 30 »)"],
                horizontal=True,
                help="La borne inférieure donne une colonne numérique, "
                     "pratique pour retraiter (30 = 30-39 ans, 0 = 0-19, "
                     "99 = inconnu).") == "Borne inférieure (« 30 »)"
    else:
        mode = st.radio("Type", MODES, label_visibility="collapsed")
        fvh = mode == "Femmes vs Hommes"
        cadence = mode == "Cadence de liquidation"
        repartition = mode == "Répartition (barres)"
        top15 = mode == "Top prestations"
        barres = repartition or top15
        boxp = mode == "Distribution (boxplot)"
        if boxp:
            DIMS_B = ["Grand poste", "Poste", "Région", "Tranche d'âge",
                      "Sexe", "Nature d'assurance", "Année de soins"] \
                     + (["Enveloppe"] if A_ENV else []) \
                     + (["Motif d'exonération (ALD)"] if A_ALD else [])
            dim_x = st.selectbox("Catégories comparées (axe horizontal)",
                                 DIMS_B, index=0)
            dim_pts = st.selectbox("Chaque point de la boîte est…",
                [d for d in DIMS_B + ["Prestation"] if d != dim_x],
                help="La dispersion montrée par chaque boîte : par exemple, "
                     "comparer les grands postes avec un point par région, "
                     "ou les régions avec un point par année.")
        axe_flux = False
        if mode == "Évolution annuelle" and A_DELAIS:
            axe_flux = st.radio("Axe de temps",
                ["Date de soins", "Date de remboursement"],
                help="Date de soins : quand le soin a eu lieu (axe d'analyse). "
                     "Date de remboursement : quand l'Assurance Maladie a payé — "
                     "l'axe des communiqués mensuels officiels. En date de "
                     "remboursement, seule la mesure « Montant remboursé » est "
                     "disponible, sans filtres de population.") \
                == "Date de remboursement"

    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<h3 data-num="2">La prestation</h3>', unsafe_allow_html=True)
    gp = st.selectbox("Grand poste", [TOUT_GP] + gp_tri,
        help="Grands postes triés par montant remboursé décroissant.")
    poste, sous_poste = TOUT_P, TOUT_SP
    if gp != TOUT_GP:
        postes = q("""SELECT t.poste, sum(c.rem) AS r FROM cube c
                      JOIN tr t USING (prs_nat) WHERE t.grand_poste = ?
                      GROUP BY 1 ORDER BY r DESC""", [gp]).poste.tolist()
        if len(postes) > 1:
            poste = st.selectbox("Poste", [TOUT_P] + postes)
        else:
            poste = postes[0] if postes else TOUT_P
        if poste != TOUT_P:
            sps = q("""SELECT t.sous_poste, sum(c.rem) AS r FROM cube c
                       JOIN tr t USING (prs_nat)
                       WHERE t.grand_poste = ? AND t.poste = ?
                       GROUP BY 1 ORDER BY r DESC""", [gp, poste]).sous_poste.tolist()
            if len(sps) > 1:
                sous_poste = st.selectbox("Sous-poste", [TOUT_SP] + sps)

    ft, pt = [], []
    if gp != TOUT_GP:
        ft.append("t.grand_poste = ?"); pt.append(gp)
        if poste != TOUT_P:
            ft.append("t.poste = ?"); pt.append(poste)
            if sous_poste != TOUT_SP:
                ft.append("t.sous_poste = ?"); pt.append(sous_poste)
    Ft = (" WHERE " + " AND ".join(ft)) if ft else ""
    prestas = q(f"""SELECT t.prs_nat, any_value(t.libelle) AS lib,
                           COALESCE(sum(c.rem), 0) AS r
                    FROM tr t LEFT JOIN cube c USING (prs_nat){Ft}
                    GROUP BY 1 ORDER BY r DESC""", pt)
    opts = {f"{r.prs_nat} · {court(r.lib, 34)} ({fmt_mnt(r.r)})": int(r.prs_nat)
            for r in prestas.itertuples()}
    sel = st.multiselect(f"Prestations précises — {len(opts)} dispo "
                         f"(vide = tout le périmètre)", list(opts),
        help="Toutes les prestations du périmètre choisi, triées par montant "
             "remboursé. Tapez pour chercher ; en cocher = ne garder qu'elles.")
    codes_choisis = [opts[s] for s in sel] or None

    if codes_choisis:
        libelle = court(sel[0].split("· ", 1)[-1].split(" (")[0], 40) \
                  + ("" if len(sel) == 1 else f" (+{len(sel)-1})")
    elif gp == TOUT_GP:
        libelle = "Toutes prestations"
    elif poste == TOUT_P:
        libelle = gp
    elif sous_poste == TOUT_SP:
        libelle = poste
    else:
        libelle = sous_poste

    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<h3 data-num="3">La mesure</h3>', unsafe_allow_html=True)
    if extraction:
        duo, mesure_b = False, None
        mesures_x = st.multiselect("Mesures (colonnes de valeurs)",
            list(MESURES), default=["Montant remboursé"],
            help="Chaque mesure devient une colonne de la base extraite.")
        mesure_a = mesures_x[0] if mesures_x else "Montant remboursé"
    elif cadence or axe_flux:
        duo, mesure_a, mesure_b = False, "Montant remboursé", None
        st.caption("Le montant remboursé est la seule mesure disponible "
                   "sur cet axe." if axe_flux
                   else "La cadence porte sur le montant remboursé.")
    elif fvh or barres or boxp:
        duo, mesure_b = False, None
        mesure_a = st.selectbox("Mesure", list(MESURES), index=0)
    else:
        duo = st.radio("Affichage", ["Une mesure", "Deux mesures comparées"],
            help="Deux mesures : ex. remboursé vs dépense (l'écart = reste à "
                 "charge) ou ticket modérateur vs reste à charge.") \
            == "Deux mesures comparées"
        if duo:
            mesure_a = st.selectbox("Mesure 1", list(MESURES), index=0)
            mesure_b = st.selectbox("Mesure 2", list(MESURES), index=1)
        else:
            mesure_a = st.selectbox("Mesure", list(MESURES), index=0)
            mesure_b = None
    if mesure_a.startswith("Ticket") and not A_REF:
        st.caption("⚠️ TM approximatif : reconstruire le cube (V3) pour le "
                   "calcul sur la seule part de référence.")

    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<h3 data-num="4">La période</h3>', unsafe_allow_html=True)
    if axe_flux:
        annees_flux = [int(a) for a in
                       q("""SELECT DISTINCT flx // 100 AS a FROM delais
                            WHERE flx // 100 >= 2015 ORDER BY 1""").a]
        annees_axe = annees_flux
    else:
        annees_axe = annees
    if len(annees_axe) > 1:
        an_deb, an_fin = st.select_slider(
            "Années de remboursement" if axe_flux else "Années de soins",
            options=annees_axe, value=(annees_axe[0], annees_axe[-1]))
    else:
        an_deb = an_fin = annees_axe[0]
        st.caption(f"Une seule année disponible : {annees_axe[0]}.")

    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<h3 data-num="5">La population</h3>', unsafe_allow_html=True)
    sexes_sel, ages_sel, regions_sel, asu_sel, envs_sel = [], [], [], [], []
    ald_lbl = TOUS
    if cadence or axe_flux:
        st.caption("Indisponible en date de remboursement." if axe_flux
                   else "La cadence est calculée toutes populations confondues.")
    else:
        sexes_dispo = sorted(set(q("SELECT DISTINCT sexe FROM cube").sexe)
                             - {None})
        if fvh:
            st.caption("Sexe : le graphique compare femmes et hommes.")
        else:
            sexes_sel = st.multiselect("Sexe (vide = tous)",
                [SEXES.get(s, f"Sexe {s}") for s in sexes_dispo],
                help="Cochez pour restreindre — ex. Femmes + Hommes pour "
                     "écarter les montants non individualisés.")
        ages_sel = st.multiselect("Tranches d'âge (vide = toutes)",
                                  [AGES[k] for k in sorted(AGES)])
        regions_dispo = sorted(set(q("SELECT DISTINCT region FROM cube").region)
                               - {None})
        regions_sel = st.multiselect("Régions (vide = France entière)",
            [REGIONS.get(r, f"Région {r}") for r in regions_dispo])
        asu_dispo = sorted(set(q("SELECT DISTINCT asu_nat FROM cube").asu_nat)
                           - {None})
        asu_sel = st.multiselect("Natures d'assurance (vide = toutes)",
            [ASU.get(a, f"Assurance {a}") for a in asu_dispo],
            help="Le risque au titre duquel la prestation est payée.")
        if A_ENV:
            envs_dispo = sorted(set(q("SELECT DISTINCT env FROM cube").env)
                                - {None})
            envs_sel = st.multiselect("Enveloppes (vide = toutes)",
                [ENV.get(e, f"Enveloppe {e}") for e in envs_dispo],
                help="1 = soins de ville.")
        if A_ALD:
            ald_lbl = st.selectbox("Motif d'exonération",
                                   [TOUS, "ALD (motifs 41 à 46)",
                                    "Hors ALD (autres motifs ou aucun)"],
                help="EXO_MTF : motifs 41-46 = affections de longue durée.")

    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<h3 data-num="6">Personnaliser</h3>', unsafe_allow_html=True)
    if int(orphelins.n.iloc[0]) > 0:
        st.caption(f"ℹ️ Qualité : {int(orphelins.n.iloc[0])} code(s) hors "
                   f"nomenclature 2023 ({fmt_mnt(orphelins.r.iloc[0])} de "
                   f"remboursé) — rattachés automatiquement à « Autres › Codes "
                   f"hors transco ». Pour les classer finement, les ajouter "
                   f"dans prs_nat_transco.csv (dictionnaires 2024-2025).")
    if tableau:
        titre_perso = axe_x_perso = axe_y_perso = ""
        st.caption("Le tableau s'exporte en Excel : mise en forme libre ensuite.")
    else:
        sig = f"{mode}|{gp}|{poste}|{sous_poste}|{len(sel)}"
        titre_perso = st.text_input("Titre du graphique", key=f"titre_{sig}",
                                    placeholder="Laissez vide pour le titre automatique")
        axe_x_perso = st.text_input("Nom de l'axe horizontal", key="ax",
                                    placeholder="Automatique")
        axe_y_perso = st.text_input("Nom de l'axe vertical", key="ay",
                                    placeholder="Automatique")

# ─────────────────────────────────── FILTRES SQL COMMUNS (cube principal)
filtres, params = ["c.soi_ann BETWEEN ? AND ?"], [int(an_deb), int(an_fin)]
if codes_choisis:
    filtres.append(f"c.prs_nat IN ({','.join('?' * len(codes_choisis))})")
    params += codes_choisis
elif ft:
    filtres += ft
    params += pt
def _filtre_in(colonne, valeurs):
    filtres.append(f"c.{colonne} IN ({','.join('?' * len(valeurs))})")
    params.extend(valeurs)

if sexes_sel:
    _filtre_in("sexe", [next(v for v in sexes_dispo
                             if SEXES.get(v, f"Sexe {v}") == s)
                        for s in sexes_sel])
if ages_sel:
    _filtre_in("age", [next(k for k, v in AGES.items() if v == a)
                       for a in ages_sel])
if regions_sel:
    _filtre_in("region", [next(r for r in regions_dispo
                               if REGIONS.get(r, f"Région {r}") == lbl)
                          for lbl in regions_sel])
if asu_sel:
    _filtre_in("asu_nat", [next(a for a in asu_dispo
                                if ASU.get(a, f"Assurance {a}") == lbl)
                           for lbl in asu_sel])
if envs_sel:
    _filtre_in("env", [next(e for e in envs_dispo
                            if ENV.get(e, f"Enveloppe {e}") == lbl)
                       for lbl in envs_sel])
if A_ALD and ald_lbl != TOUS:
    filtres.append("c.ald = ?"); params.append(1 if ald_lbl.startswith("ALD") else 0)
POSTES_SANS_BASE = ["Indemnités Journalières", "Invalidité, Décès & Rentes",
                    "Rémunérations forfaitaires des PS",
                    "Maternité & Adoption (forfaits)", "Non remboursable",
                    "Codes réservés"]
TM_SEL = mesure_a.startswith("Ticket") or \
         (duo and mesure_b is not None and mesure_b.startswith("Ticket"))
tm_exclu, tm_douteux = False, False
if TM_SEL:
    if gp in POSTES_SANS_BASE:
        tm_douteux = True          # TM sans signification sur ce poste
    elif not codes_choisis and gp == TOUT_GP:
        filtres.append("c.prs_nat NOT IN (SELECT prs_nat FROM tr WHERE "
                       f"grand_poste IN ({','.join('?' * len(POSTES_SANS_BASE))}))")
        params += POSTES_SANS_BASE
        tm_exclu = True
F = " AND ".join(filtres)
JOIN = "JOIN tr t USING (prs_nat)" if (ft and not codes_choisis) else ""

def _resume(sel, nom):
    if not sel:
        return None
    return " + ".join(sel) if len(sel) <= 2 else f"{len(sel)} {nom}"

contexte = " · ".join(x for x in [
    _resume(sexes_sel, "sexes"), _resume(ages_sel, "tranches d'âge"),
    _resume(regions_sel, "régions"), _resume(asu_sel, "assurances"),
    _resume(envs_sel, "enveloppes"),
    None if ald_lbl == TOUS else ald_lbl] if x)

expr_a, kind_a = MESURES[mesure_a]
hover = {"mnt": "%{customdata:,.0f} €", "pct": "%{customdata:.1f} %",
         "qte": "%{customdata:,.0f} actes"}

# ── résumé de la sélection courante (toujours visible au-dessus du visuel)
import html as _html_mod
_puces = [f'<span class="puce rouge"><b>{_html_mod.escape(libelle)}</b></span>',
          '<span class="puce">' + _html_mod.escape(
              " · ".join(m.split(" (")[0] for m in mesures_x)
              if extraction and mesures_x else
              mesure_a.split(" (")[0]
              + (f" vs {mesure_b.split(' (')[0]}" if duo and mesure_b else "")
          ) + '</span>',
          f'<span class="puce">{an_deb} → {an_fin}</span>']
for _f in [_resume(sexes_sel, "sexes"), _resume(ages_sel, "tranches d'âge"),
           _resume(regions_sel, "régions"), _resume(asu_sel, "assurances"),
           _resume(envs_sel, "enveloppes"),
           ald_lbl if ald_lbl != TOUS else None]:
    if _f:
        _puces.append(f'<span class="puce">{_html_mod.escape(str(_f))}</span>')
# poids des modalités inconnues dans la sélection (pondéré au remboursé)
_cond_inc = ["c.age = 99", "c.sexe IN (0, 9)", "c.region = 99",
             "c.asu_nat IN (0, 99)"] + (["c.env IN (9, 98)"] if A_ENV else [])
try:
    _pct_inc = q(f"""SELECT 100.0 * sum(CASE WHEN {' OR '.join(_cond_inc)}
                                        THEN rem END) / NULLIF(sum(rem), 0) AS p
                     FROM cube c {JOIN} WHERE {F}""", params).p.iloc[0]
except Exception:
    _pct_inc = None
if _pct_inc is not None and _pct_inc >= 0.05:
    _puces.append(f'<span class="puce" title="Part du montant remboursé de la '
                  f'sélection portée par au moins une modalité inconnue — âge, '
                  f'sexe, région, assurance ou enveloppe. Filtrer une variable '
                  f'(ex. Hommes) n\'empêche pas les autres (ex. la région) '
                  f'd\'être inconnues : c\'est ce que mesure ce pourcentage. '
                  f'Montants inclus dans les totaux.">'
                  f'❔ inconnus : <b>{_pct_inc:.1f} %</b></span>'
                  .replace(".", ","))
st.markdown('<div class="puces">' + "".join(_puces) + '</div>',
            unsafe_allow_html=True)

def echelle(vals, kind):
    if kind == "mnt":
        return (1e9, "Md€") if vals.abs().max() >= 2e9 else (1e6, "M€")
    if kind == "qte":
        return (1e6, "M actes") if vals.abs().max() >= 2e6 else (1, "actes")
    return (1, "%")

def bande_provisoire(fig, x0, x1):
    """Bande grise sur les années non liquidées ; texte en bas de bande."""
    fig.add_vrect(x0=x0 - 0.5, x1=x1 + 0.5,
                  fillcolor="#EDEDED", opacity=0.65, line_width=0, layer="below")
    fig.add_annotation(x=(x0 + x1) / 2, y=0.03, yref="paper",
                       text="flux en cours d'intégration", showarrow=False,
                       font=dict(size=10, color=GRIS_MOYEN))

# ═══════════════════════════════ GRAPHIQUE 1 & 2 : ÉVOLUTIONS ANNUELLES
if not (cadence or barres or tableau or boxp):
    if fvh:
        d = q(f"""SELECT c.soi_ann AS an, c.sexe, {expr_a} AS val
                  FROM cube c {JOIN} WHERE {F} AND c.sexe IN (1, 2)
                  GROUP BY 1, 2 ORDER BY 1""", params).dropna(subset=["val"])
        if d.empty:
            st.warning("Aucune donnée sur cette sélection."); st.stop()
        div_a, unite_a = echelle(d.val, kind_a)
        fig = go.Figure()
        for sx, nom, coul in [(2, "Femmes", ROUGE), (1, "Hommes", GRIS)]:
            ds = d[d.sexe == sx]
            if ds.empty:
                continue
            fig.add_trace(go.Scatter(x=ds.an, y=ds.val / div_a,
                mode="lines+markers", name=nom,
                line=dict(color=coul, width=3.5),
                marker=dict(size=8, color=coul, line=dict(color="white", width=2)),
                customdata=ds.val,
                hovertemplate="<b>%{x}</b> · " + nom + "<br>" +
                              hover[kind_a] + "<extra></extra>"))
        # ratio F/H au dernier point : la lecture qui fait le graphique
        piv = d.pivot_table(index="an", columns="sexe", values="val")
        piv_f = piv[piv.index <= annee_fiable_max]
        piv = piv_f if len(piv_f) else piv
        if {1, 2} <= set(piv.columns) and piv[1].iloc[-1]:
            rt = piv[2].iloc[-1] / piv[1].iloc[-1]
            fig.add_annotation(xref="paper", yref="paper", x=1.0, y=1.24,
                text=f"Femmes : <b>{100*(rt-1):+.1f} %</b> vs hommes "
                     f"({int(piv.index[-1])})".replace(".", ","),
                showarrow=False, font=dict(color="white", size=12),
                bgcolor=ROUGE, borderpad=6)
        fig.update_layout(showlegend=True,
                          legend=dict(orientation="h", y=-0.2, x=0.5,
                                      xanchor="center"))
        titre_auto = f"{libelle} — {mesure_a.split(' (')[0].lower()} · " \
                     f"femmes vs hommes · {an_deb}-{an_fin}" \
                     + (f" · {contexte}" if contexte else "")
        da_max = d.an.max()
    else:
        if axe_flux:
            fdx, pdx = ["d.flx // 100 BETWEEN ? AND ?"], [int(an_deb), int(an_fin)]
            if codes_choisis:
                fdx.append(f"d.prs_nat IN ({','.join('?' * len(codes_choisis))})")
                pdx += codes_choisis
            elif ft:
                fdx += ft; pdx += pt
            JX = "JOIN tr t USING (prs_nat)" if (ft and not codes_choisis) else ""
            da = q(f"""SELECT d.flx // 100 AS an, sum(d.rem) AS val
                       FROM delais d {JX} WHERE {' AND '.join(fdx)}
                       GROUP BY 1 ORDER BY 1""", pdx).dropna(subset=["val"])
        else:
            da = q(f"""SELECT c.soi_ann AS an, {expr_a} AS val FROM cube c {JOIN}
                       WHERE {F} GROUP BY 1 ORDER BY 1""", params) \
                .dropna(subset=["val"])
        if da.empty:
            st.warning("Aucune donnée sur cette sélection."); st.stop()
        fiable_axe = annee_fiable_max
        if axe_flux:
            mois_flux = q("""SELECT flx // 100 AS a, count(DISTINCT flx % 100) AS m
                             FROM delais GROUP BY 1 ORDER BY 1""")
            pleines = mois_flux[mois_flux.m >= 12].a
            fiable_axe = int(pleines.max()) if len(pleines) else int(an_deb)
        div_a, unite_a = echelle(da.val, kind_a)
        fig = go.Figure(go.Scatter(x=da.an, y=da.val / div_a,
            mode="lines+markers", name=court(mesure_a.split(" (")[0], 30),
            line=dict(color=ROUGE, width=3.5),
            marker=dict(size=9, color=ROUGE, line=dict(color="white", width=2)),
            customdata=da.val,
            hovertemplate="<b>%{x}</b><br>" + hover[kind_a] +
                          f"<br>{court(mesure_a.split(' (')[0], 30)}<extra></extra>"))
        if duo and mesure_b and mesure_b != mesure_a:
            expr_b, kind_b = MESURES[mesure_b]
            db = q(f"""SELECT c.soi_ann AS an, {expr_b} AS val FROM cube c {JOIN}
                       WHERE {F} GROUP BY 1 ORDER BY 1""", params) \
                .dropna(subset=["val"])
            if not db.empty:
                div_b, unite_b = ((div_a, unite_a) if kind_b == kind_a
                                  else echelle(db.val, kind_b))
                fig.add_trace(go.Scatter(x=db.an, y=db.val / div_b,
                    mode="lines+markers", name=court(mesure_b.split(" (")[0], 30),
                    line=dict(color=GRIS, width=3),
                    marker=dict(size=8, color=GRIS,
                                line=dict(color="white", width=2)),
                    customdata=db.val,
                    yaxis="y2" if kind_b != kind_a else "y",
                    hovertemplate="<b>%{x}</b><br>" + hover[kind_b] +
                        f"<br>{court(mesure_b.split(' (')[0], 30)}<extra></extra>"))
                if kind_b != kind_a:
                    fig.update_layout(yaxis2=dict(title=unite_b, overlaying="y",
                                                  side="right", showgrid=False,
                                                  tickfont=dict(color=GRIS_MOYEN)))
                else:
                    m = da.merge(db, on="an", suffixes=("_a", "_b"))
                    if not m.empty:
                        dern = m.iloc[-1]
                        fig.add_annotation(x=dern.an,
                            y=(dern.val_a + dern.val_b) / 2 / div_a,
                            text=f"écart : <b>{fmt_val(abs(dern.val_a - dern.val_b), kind_a)}</b>",
                            showarrow=True, arrowhead=0, ax=60, ay=0,
                            font=dict(size=12, color=GRIS),
                            bgcolor="white", bordercolor=GRIS_CLAIR, borderpad=4)
                fig.update_layout(showlegend=True,
                                  legend=dict(orientation="h", y=-0.2, x=0.5,
                                              xanchor="center"))
        else:
            etiq = lambda v: fmt_val(v, kind_a)
            fig.add_annotation(x=da.an.iloc[0], y=da.val.iloc[0] / div_a,
                               text=f"<b>{etiq(da.val.iloc[0])}</b>",
                               showarrow=False, yshift=18,
                               font=dict(color=GRIS_MOYEN, size=12))
            fig.add_annotation(x=da.an.iloc[-1], y=da.val.iloc[-1] / div_a,
                               text=f"<b>{etiq(da.val.iloc[-1])}</b>",
                               showarrow=False, yshift=18,
                               font=dict(color=ROUGE_FONCE, size=13))
            plafond = fiable_axe if axe_flux else annee_fiable_max
            da_f = da[da.an <= plafond]
            base_evo = da_f if len(da_f) > 1 else da
            if len(base_evo) > 1 and base_evo.val.iloc[0]:
                ratio = base_evo.val.iloc[-1] / base_evo.val.iloc[0]
                evo = 100 * (ratio - 1)
                bornes = f"{int(base_evo.an.iloc[0])}-{int(base_evo.an.iloc[-1])}"
                txt_evo = (f"<b>×{ratio:,.0f}</b> sur {bornes}".replace(",", " ")
                           if abs(evo) > 500 else
                           f"<b>{evo:+.1f} %</b> sur {bornes}")
                if int(base_evo.an.iloc[-1]) < int(da.an.iloc[-1]):
                    txt_evo += " (hors consolidation)"
                fig.add_annotation(xref="paper", yref="paper", x=1.0, y=1.24,
                                   text=txt_evo, showarrow=False,
                                   font=dict(color="white", size=13),
                                   bgcolor=ROUGE if evo >= 0 else "#2E7D32",
                                   borderpad=6)
        titre_auto = f"{libelle} — {mesure_a.split(' (')[0].lower()}" \
                     + (f" vs {mesure_b.split(' (')[0].lower()}"
                        if duo and mesure_b else "") \
                     + (" · en date de remboursement" if axe_flux else "") \
                     + f" · {an_deb}-{an_fin}" \
                     + (f" · {contexte}" if contexte else "")
        da_max = da.an.max()

    if fvh:
        fiable_axe = annee_fiable_max
    if int(an_fin) > fiable_axe:
        bande_provisoire(fig, fiable_axe + 1, int(da_max))
    fig = style_forsides(fig, titre_perso or court(titre_auto, 72))
    fig.update_layout(margin=dict(t=110))
    if fvh or (duo and mesure_b and mesure_b != mesure_a):
        fig.update_layout(showlegend=True, margin=dict(b=135),
                          legend=dict(orientation="h", y=-0.30, x=0.5,
                                      xanchor="center",
                                      font=dict(size=12, color=GRIS)))
    fig.update_xaxes(title="Année de remboursement" if axe_flux
                           else "Année de soins",
                     tickmode="linear", dtick=1, tickformat="d")
    fig.update_yaxes(title=unite_a)

# ═══════════════════ GRAPHIQUES 3 & 4 : RÉPARTITION / TOP (barres)
elif barres:
    expr_a, kind_a = MESURES[mesure_a]
    JOINB = "JOIN tr t USING (prs_nat)"
    if repartition:
        # dimension adaptative : on descend d'un cran sous le périmètre choisi
        if gp == TOUT_GP:
            dim, dim_lbl = "t.grand_poste", "grand poste"
        elif poste == TOUT_P:
            dim, dim_lbl = "t.poste", "poste"
        elif sous_poste == TOUT_SP:
            dim, dim_lbl = "t.sous_poste", "sous-poste"
        else:
            dim, dim_lbl = "any_value(t.libelle)", "prestation"
        if dim.startswith("any_value"):
            d = q(f"""SELECT c.prs_nat, {dim} AS lib, {expr_a} AS val
                      FROM cube c {JOINB} WHERE {F}
                      GROUP BY c.prs_nat ORDER BY val""", params)
        else:
            d = q(f"""SELECT {dim} AS lib, {expr_a} AS val
                      FROM cube c {JOINB} WHERE {F}
                      GROUP BY 1 ORDER BY val""", params)
        titre_auto = f"{mesure_a.split(' (')[0]} par {dim_lbl}" \
                     + (f" · {libelle}" if gp != TOUT_GP else "") \
                     + f" · {an_deb}-{an_fin}" \
                     + (f" · {contexte}" if contexte else "")
    else:
        d = q(f"""SELECT c.prs_nat, any_value(t.libelle) AS lib, {expr_a} AS val
                  FROM cube c {JOINB} WHERE {F}
                  GROUP BY c.prs_nat ORDER BY val DESC LIMIT 15""", params) \
            .sort_values("val")
        titre_auto = f"Top 15 prestations — {mesure_a.split(' (')[0].lower()} · " \
                     f"{libelle} · {an_deb}-{an_fin}" \
                     + (f" · {contexte}" if contexte else "")
    d = d.dropna(subset=["val"])
    if d.empty:
        st.warning("Aucune donnée sur cette sélection."); st.stop()
    div_a, unite_a = echelle(d.val, kind_a)
    couleurs = [(ROUGE_FONCE if i >= len(d) - 3 else ROUGE)
                for i in range(len(d))]
    fig = go.Figure(go.Bar(x=d.val / div_a, y=[court(l, 46) for l in d.lib],
        orientation="h", marker_color=couleurs,
        text=[fmt_val(v, kind_a) for v in d.val], textposition="outside",
        cliponaxis=False, textfont=dict(size=10, color=GRIS_MOYEN),
        customdata=d.val,
        hovertemplate="<b>%{y}</b><br>" + hover[kind_a] + "<extra></extra>"))
    fig = style_forsides(fig, titre_perso or court(titre_auto, 95),
                         haut=max(440, 60 + 34 * len(d)))
    fig.update_xaxes(title=unite_a)
    fig.update_yaxes(tickfont=dict(size=11))
    fig.update_layout(margin=dict(l=300, r=95))

# ═══════════════════ MODE TABLEAU CROISÉ (export Excel)
elif boxp:
    # ═══════════════ DISTRIBUTION (BOXPLOT) : dispersion d'une mesure
    DIM_BX = {"Grand poste": ("t.grand_poste", True),
              "Poste": ("t.poste", True),
              "Prestation": ("PRESTA", True),
              "Région": ("c.region", False),
              "Tranche d'âge": ("c.age", False),
              "Sexe": ("c.sexe", False),
              "Nature d'assurance": ("c.asu_nat", False),
              "Enveloppe": ("c.env", False),
              "Motif d'exonération (ALD)": ("c.ald", False),
              "Année de soins": ("c.soi_ann", False)}
    ex, tr_x = DIM_BX[dim_x]
    ep, tr_p = DIM_BX[dim_pts]
    JB = "JOIN tr t USING (prs_nat)" if (tr_x or tr_p
                                         or (ft and not codes_choisis)) else ""
    e_pt = "c.prs_nat" if ep == "PRESTA" else ep
    db = q(f"""SELECT {ex} AS x, {e_pt} AS pt, {expr_a} AS val
               FROM cube c {JB} WHERE {F}
               GROUP BY 1, 2""", params).dropna(subset=["val", "x"])
    if db.empty:
        st.warning("Aucune donnée sur cette sélection."); st.stop()
    MAPS_B = {"Région": lambda r: REGIONS.get(r, f"Région {r}"),
              "Tranche d'âge": lambda a: AGES.get(a, f"Âge {a}"),
              "Sexe": lambda s: SEXES.get(s, f"Sexe {s}"),
              "Nature d'assurance": lambda a: ASU.get(a, f"Assurance {a}"),
              "Enveloppe": lambda e: ENV.get(e, f"Enveloppe {e}"),
              "Motif d'exonération (ALD)":
                  lambda v: {1: "ALD", 0: "Hors ALD"}.get(v, v)}
    if dim_x in MAPS_B:
        db["x"] = db.x.map(MAPS_B[dim_x])
    # 12 catégories max, ordonnées par montant total décroissant
    ordre = db.groupby("x").val.sum().sort_values(ascending=False)
    garde = ordre.head(12).index
    db = db[db.x.isin(garde)]
    div_a, unite_a = echelle(db.val, kind_a)
    fig = go.Figure(go.Box(
        x=db.x, y=db.val / div_a,
        marker_color=ROUGE, line=dict(color=ROUGE_FONCE, width=1.6),
        fillcolor="rgba(239,70,71,0.25)", boxpoints="outliers",
        marker=dict(size=4, color=ROUGE, opacity=0.55),
        hovertemplate="<b>%{x}</b><br>" +
            ("%{y:,.1f} " + unite_a) + "<extra></extra>"))
    fig.update_xaxes(categoryorder="array", categoryarray=list(garde))
    titre_auto = f"{libelle} — dispersion du {mesure_a.split(' (')[0].lower()} " \
                 f"par {dim_x.lower()} · {an_deb}-{an_fin}" \
                 + (f" · {contexte}" if contexte else "")
    fig = style_forsides(fig, titre_perso or court(titre_auto, 80), haut=580)
    fig.update_xaxes(title=dim_x, tickangle=-25)
    fig.update_yaxes(title=unite_a, rangemode="tozero")
    st.caption(f"Chaque boîte résume la dispersion entre "
               f"{dim_pts.lower()}s : médiane (trait), 50 % centraux (boîte), "
               f"étendue (moustaches), points atypiques. "
               f"{len(garde)} catégories affichées (les plus fortes)."
               + (" ⚠ Certaines valeurs peuvent être sous-estimées par le "
                  "secret statistique." if dim_pts == "Prestation" else ""))

elif tableau:
    # ═══════════════ EXTRACTION DE DONNÉES : base à plat, une ligne
    # par croisement des variables choisies, une colonne par mesure
    DIM_SQL = {"Grand poste": ("t.grand_poste", True),
               "Poste": ("t.poste", True),
               "Sous-poste": ("t.sous_poste", True),
               "Prestation": ("PRESTA", True),
               "Région": ("c.region", False),
               "Tranche d'âge": ("c.age", False),
               "Sexe": ("c.sexe", False),
               "Nature d'assurance": ("c.asu_nat", False),
               "Enveloppe": ("c.env", False),
               "Motif d'exonération (ALD)": ("c.ald", False),
               "Année de soins": ("c.soi_ann", False)}
    if not dims_x:
        st.info("Choisissez au moins une variable dans le menu de gauche.")
        st.stop()
    if not mesures_x:
        st.info("Choisissez au moins une mesure dans le menu de gauche.")
        st.stop()
    besoin_tr = any(DIM_SQL[d][1] for d in dims_x)
    JT = "JOIN tr t USING (prs_nat)" if (besoin_tr
                                         or (ft and not codes_choisis)) else ""
    sel_exprs, grp_exprs = [], []
    for i, dl in enumerate(dims_x):
        e, _ = DIM_SQL[dl]
        if e == "PRESTA":
            sel_exprs.append(f"c.prs_nat || ' · ' || any_value(t.libelle) AS d{i}")
            grp_exprs.append("c.prs_nat")
        else:
            sel_exprs.append(f"{e} AS d{i}")
            grp_exprs.append(e)
    mes_exprs = [f"{MESURES[m][0]} AS m{j}" for j, m in enumerate(mesures_x)]
    dt = q(f"""SELECT {', '.join(sel_exprs)}, {', '.join(mes_exprs)}
               FROM cube c {JT} WHERE {F}
               GROUP BY {', '.join(grp_exprs)}""", params)
    if dt.empty:
        st.warning("Aucune donnée sur cette sélection."); st.stop()
    dt = dt.rename(columns={f"d{i}": dl for i, dl in enumerate(dims_x)})
    dt = dt.rename(columns={f"m{j}": m.split(" (")[0]
                            for j, m in enumerate(mesures_x)})
    noms_mes = [m.split(" (")[0] for m in mesures_x]
    MAPS = {"Région": lambda r: REGIONS.get(r, f"Région {r}"),
            "Tranche d'âge": ((lambda a: a) if age_borne
                              else (lambda a: AGES.get(a, f"Âge {a}"))),
            "Sexe": lambda s: SEXES.get(s, f"Sexe {s}"),
            "Nature d'assurance": lambda a: ASU.get(a, f"Assurance {a}"),
            "Enveloppe": lambda e: ENV.get(e, f"Enveloppe {e}"),
            "Motif d'exonération (ALD)":
                lambda x: {1: "ALD (motifs 41-46)", 0: "Hors ALD"}.get(x, x)}
    for dl in dims_x:
        if dl in MAPS:
            dt[dl] = dt[dl].map(MAPS[dl])
    # tri : chronologique sur l'année si présente, puis 1re mesure décroissante
    dt = dt[~(dt[noms_mes].fillna(0) == 0).all(axis=1)]   # lignes vides retirées
    cles = (["Année de soins"] if "Année de soins" in dims_x else []) \
           + [noms_mes[0]]
    dt = dt.sort_values(cles, ascending=[True] * (len(cles) - 1) + [False]) \
           .reset_index(drop=True)

    st.markdown(f"**Base extraite** — {len(dt):,} lignes · "
                f"{' · '.join(dims_x)} · mesures : {', '.join(noms_mes)} · "
                f"{libelle} · {an_deb}-{an_fin}"
                .replace(",", " ")
                + (f" · {contexte}" if contexte else ""))
    fmts = {}
    for m, lbl in zip(mesures_x, noms_mes):
        kind_m = MESURES[m][1]
        fmts[lbl] = ((lambda v: "" if pd.isna(v) else f"{v:.1f}".replace(".", ","))
                     if kind_m == "pct" else
                     (lambda v: "" if pd.isna(v) else f"{v:,.0f}".replace(",", " ")))
    aff = dt if len(dt) <= 500 else dt.head(500)
    st.dataframe(aff.style.format(fmts), use_container_width=True,
                 hide_index=True,
                 height=min(620, 42 + 35 * min(len(aff), 16)))
    if len(dt) > 500:
        st.caption(f"{len(dt):,} lignes au total — les 500 premières sont "
                   "affichées, les exports contiennent tout.".replace(",", " "))

    import io
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        dt.to_excel(xw, sheet_name="DAMIR", index=False)
        ws = xw.sheets["DAMIR"]
        for j, m in enumerate(mesures_x):
            col = len(dims_x) + 1 + j
            fmt = "#,##0.0" if MESURES[m][1] == "pct" else "#,##0"
            for i in range(2, len(dt) + 2):
                ws.cell(row=i, column=col).number_format = fmt
        for i in range(1, len(dims_x) + 1):
            ws.column_dimensions[chr(64 + i)].width = 22
    csv = dt.to_csv(index=False, sep=";", decimal=",", encoding="utf-8-sig")
    cA, cB = st.columns(2)
    cA.download_button("⬇️ Exporter en Excel", data=buf.getvalue(),
                       file_name="forsides_damir_extraction.xlsx",
                       mime="application/vnd.openxmlformats-officedocument."
                            "spreadsheetml.sheet", use_container_width=True)
    cB.download_button("⬇️ Exporter en CSV", data=csv,
                       file_name="forsides_damir_extraction.csv",
                       mime="text/csv", use_container_width=True)

# ═══════════════════════════════ GRAPHIQUE 5 : CADENCE DE LIQUIDATION
else:
    fd, pdl = ["d.soi_ann BETWEEN ? AND ?"], [int(an_deb), int(an_fin)]
    if codes_choisis:
        fd.append(f"d.prs_nat IN ({','.join('?' * len(codes_choisis))})")
        pdl += codes_choisis
    elif ft:
        fd += ft
        pdl += pt
    JD = "JOIN tr t USING (prs_nat)" if (ft and not codes_choisis) else ""
    dd = q(f"""SELECT (d.flx // 100) * 12 + (d.flx % 100)
                      - (d.soi_ann * 12 + d.soi_moi) AS delai,
                      sum(d.rem) AS rem
               FROM delais d {JD} WHERE {' AND '.join(fd)}
               GROUP BY 1 HAVING delai BETWEEN 0 AND 24 ORDER BY 1""", pdl)
    if dd.empty or dd.rem.sum() == 0:
        st.warning("Aucune donnée de délai sur cette sélection."); st.stop()
    dd["cum"] = 100 * dd.rem.cumsum() / dd.rem.sum()
    fin_utile = (int(dd.delai[dd.cum >= 99.5].iloc[0])
                 if (dd.cum >= 99.5).any() else int(dd.delai.max()))
    dd = dd[dd.delai <= max(8, fin_utile)]
    fig = go.Figure(go.Scatter(x=[f"M+{int(x)}" for x in dd.delai], y=dd.cum,
        mode="lines+markers", line=dict(color=ROUGE, width=3.5),
        marker=dict(size=8, color=ROUGE, line=dict(color="white", width=2)),
        fill="tozeroy", fillcolor="rgba(239,70,71,0.07)",
        hovertemplate="<b>%{x}</b> après le soin<br>%{y:.1f} % du montant "
                      "liquidé<extra></extra>"))
    for seuil in (50, 90):
        atteint = dd[dd.cum >= seuil]
        if not atteint.empty:
            k = int(atteint.delai.iloc[0])
            fig.add_annotation(x=f"M+{k}", y=float(atteint.cum.iloc[0]),
                text=f"<b>{seuil} %</b> liquidé à <b>M+{k}</b>",
                showarrow=True, arrowhead=0, ax=40, ay=-30,
                font=dict(size=12, color=GRIS),
                bgcolor="white", bordercolor=GRIS_CLAIR, borderpad=4)
    titre_auto = f"{libelle} — cadence de liquidation des remboursements · " \
                 f"soins {an_deb}-{an_fin}"
    fig = style_forsides(fig, titre_perso or court(titre_auto, 72))
    fig.update_xaxes(title="Délai entre le mois de soins et le mois de "
                           "remboursement", type="category")
    fig.update_yaxes(title="% du montant remboursé (cumulé)",
                     range=[0, 105], ticksuffix=" %")
    unite_a = "%"

if not tableau:
    if axe_x_perso:
        fig.update_xaxes(title_text=axe_x_perso)
    if axe_y_perso:
        fig.update_yaxes(title_text=axe_y_perso)
    st.plotly_chart(fig, use_container_width=True,
                    config={"displayModeBar": False})

if cadence and int(an_fin) >= int(max(annees)):
    st.markdown('<div class="note-lecture">📖 La dernière année de soins est '
                'encore en cours de liquidation : sa cadence apparente est '
                'tronquée. Pour une cadence de référence, restreindre la période '
                'aux années pleinement liquidées (jusqu\'à N-2).</div>',
                unsafe_allow_html=True)
if not cadence and not tableau and tm_exclu:
    st.markdown('<div class="note-lecture">📖 <b>Ticket modérateur</b> — calculé '
                'hors prestations « en espèces » (indemnités journalières, rentes, '
                'forfaits versés aux professionnels…), qui n\'ont pas de base de '
                'remboursement et rendraient le TM artificiellement négatif.</div>',
                unsafe_allow_html=True)
if not cadence and not tableau and tm_douteux:
    st.markdown('<div class="note-lecture">⚠️ Le ticket modérateur n\'a pas de '
                'sens sur ce poste (prestations en espèces, sans base de '
                'remboursement) : préférer le montant remboursé.</div>',
                unsafe_allow_html=True)
if not cadence and not tableau and int(an_fin) > annee_fiable_max:
    st.markdown(f'<div class="note-lecture">📖 <b>Zone grise</b> — années '
                f'postérieures à {annee_fiable_max} en cours de consolidation '
                f'(97 % des montants sont historiquement liquidés à M+{K97}) : '
                f'points sous-estimés, ils remonteront avec les flux suivants. '
                f'Le % d\'évolution affiché les exclut.</div>',
                unsafe_allow_html=True)

# ─────────────────────────────────── EXPORT PNG
import importlib.util
if tableau:
    st.stop()
KALEIDO_OK = importlib.util.find_spec("kaleido") is not None
cle = f"{mode}|{libelle}|{contexte}|{mesure_a}|{mesure_b}|{an_deb}-{an_fin}"
nom_fichier = f"forsides_damir_{court(libelle, 25).replace(' ', '_')}"
colA, colB = st.columns([1, 2])
if KALEIDO_OK:
    if colA.button("🖼️ Préparer l'export PNG", use_container_width=True):
        with st.spinner("Génération de l'image haute définition…"):
            try:
                st.session_state["png"] = fig.to_image(format="png", scale=3,
                                                       width=1200, height=620)
                st.session_state["png_cle"] = cle
            except Exception:
                st.session_state.pop("png", None)
                st.session_state["png_erreur"] = True
    if st.session_state.get("png") and st.session_state.get("png_cle") == cle:
        colB.download_button("⬇️ Télécharger le PNG", data=st.session_state["png"],
                             file_name=nom_fichier + ".png", mime="image/png",
                             use_container_width=True)
    elif st.session_state.pop("png_erreur", False):
        colB.download_button("⬇️ Repli : HTML interactif",
                             data=fig.to_html(include_plotlyjs="cdn"),
                             file_name=nom_fichier + ".html", mime="text/html",
                             use_container_width=True)
else:
    colA.download_button("⬇️ Télécharger (HTML interactif)",
                         data=fig.to_html(include_plotlyjs="cdn"),
                         file_name=nom_fichier + ".html", mime="text/html",
                         use_container_width=True)
