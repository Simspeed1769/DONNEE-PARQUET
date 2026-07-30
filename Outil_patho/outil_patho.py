# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════
  EXPLORATEUR PATHOLOGIES — Cartographie Cnam · Forsides · V2
═══════════════════════════════════════════════════════════════════
Lancement : double-clic sur  lancer_outil_patho.bat
Dossier requis :  outil_patho.py + effectifs.parquet + regions.geojson
"""

import json
import duckdb
import pandas as pd
import plotly.graph_objects as go
import plotly.io as pio
import streamlit as st
import streamlit.components.v1 as components
from pathlib import Path

try:  # contournement d'un blocage connu de l'export d'images sous Windows
    pio.kaleido.scope.chromium_args += ("--disable-gpu", "--single-process")
except Exception:
    pass

# ─────────────────────────────────────────────────────── CONFIGURATION
PARQUET = "effectifs.parquet"

def trouver_geojson():
    """Retrouve le fond de carte même si le téléchargement a modifié son nom
    (regions.geojson, regions.geojson.json, regions.json, regions.geojson.txt…)."""
    for motif in ("regions*.geojson*", "regions*.json*", "regions*"):
        for f in sorted(Path(".").glob(motif)):
            if f.is_file() and "json" in f.suffix.lower() + f.name.lower():
                return f
    return None
TOUT_N2, TOUT_N3 = "— Toutes les pathologies de la famille (regroupé)", "— Tout le niveau 2 (regroupé)"
TOUS_AGES, TOUTE_FR = "Tous âges", "France entière"
METRO = ["11", "24", "27", "28", "32", "44", "52", "53", "75", "76", "84", "93", "94"]

REGIONS = {"01": "Guadeloupe", "02": "Martinique", "03": "Guyane", "04": "La Réunion",
           "06": "Mayotte", "11": "Île-de-France", "24": "Centre-Val de Loire",
           "27": "Bourgogne-Franche-Comté", "28": "Normandie", "32": "Hauts-de-France",
           "44": "Grand Est", "52": "Pays de la Loire", "53": "Bretagne",
           "75": "Nouvelle-Aquitaine", "76": "Occitanie", "84": "Auvergne-Rhône-Alpes",
           "93": "Provence-Alpes-Côte d'Azur", "94": "Corse"}

ROUGE, ROUGE_FONCE = "#EF4647", "#5B0C02"
GRIS, GRIS_MOYEN, GRIS_CLAIR = "#404040", "#808080", "#BFBFBF"

st.set_page_config(page_title="Explorateur Pathologies · Forsides",
                   page_icon="🩺", layout="wide")

st.markdown(f"""
<style>
    .bandeau {{ background: white; border-left: 5px solid {ROUGE};
                padding: 10px 22px; margin-bottom: 6px; }}
    .bandeau h1 {{ color: {GRIS}; margin: 0; font-size: 1.5rem; }}
    .bandeau p  {{ color: {GRIS_MOYEN}; margin: 2px 0 0 0; font-size: .85rem; }}
    div[data-testid="stMetric"] {{ background: white; border: 1px solid {GRIS_CLAIR};
                                   border-radius: 6px; padding: 12px 16px; }}
    div[data-testid="stMetricValue"] {{ color: {GRIS}; font-weight: 700; font-size: 1.55rem; }}
    div[data-testid="stMetricLabel"] {{ color: {GRIS_MOYEN}; }}

    /* ---- Barre latérale : fond doux + en-tête ---- */
    section[data-testid="stSidebar"] {{
        background: #F7F7F8; border-right: 1px solid #E4E4E7; }}
    section[data-testid="stSidebar"] > div {{ padding-top: 8px; }}

    /* titres de section : pastille numérotée rouge + libellé */
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

    /* champs : fond blanc, coins arrondis, focus rouge */
    section[data-testid="stSidebar"] div[data-baseweb="select"] > div,
    section[data-testid="stSidebar"] div[data-baseweb="input"] > div {{
        background: white; border-radius: 8px; border-color: #D9D9DE; }}
    section[data-testid="stSidebar"] label {{ color: {GRIS_MOYEN}; font-size: .82rem; }}
    section[data-testid="stSidebar"] .stRadio, section[data-testid="stSidebar"] .stCheckbox {{
        background: white; border: 1px solid #E4E4E7; border-radius: 8px;
        padding: 8px 12px; margin-top: 2px; }}
    section[data-testid="stSidebar"] .stCaption {{ color: #9A9AA2; font-style: italic; }}
    section[data-testid="stSidebar"] hr {{ margin: 4px 0 0 0; border: none;
        border-top: 1px solid #D9D9DE; }}

    .qualite-ok, .qualite-alerte {{
        border-radius: 6px; padding: 9px 14px; font-size: .88rem; color: {GRIS};
        border: 1px solid {GRIS_CLAIR}; background: #FAFAFA; display: inline-block; }}
    .note-lecture {{
        background: #F7F7F8; border: 1px solid #E4E4E7; border-left: 5px solid {GRIS_CLAIR};
        border-radius: 6px; padding: 10px 14px; font-size: .85rem; color: {GRIS};
        margin: 2px 0 12px 0; }}
    .note-lecture b {{ color: {GRIS}; }}
    .separe-kpi {{ border: none; border-top: 1px solid #E4E4E7; margin: 10px 0 16px 0; }}
    .qualite-alerte {{ border-left: 5px solid #E5A33B; background: #FFF9EE;
                       border-color: #EFD9A7; }}
    .qualite-ok {{ border-left: 5px solid #9CC79C; }}
    .aide {{ display: inline-flex; width: 15px; height: 15px; border-radius: 50%;
             background: #E3E3E3; color: #666; font-size: 10.5px; font-weight: 600;
             justify-content: center; align-items: center; cursor: help;
             vertical-align: middle; margin-left: 4px; }}
</style>
""", unsafe_allow_html=True)

# ══════════════════════════════════ MOTEUR DUCKDB (rien n'est chargé)
@st.cache_resource(show_spinner=False)
def moteur():
    con = duckdb.connect()
    t = con.execute(f"SELECT typeof(annee) FROM read_parquet('{PARQUET}') LIMIT 1"
                    ).fetchone()[0].upper()
    an = ("year(annee)" if "DATE" in t or "TIMESTAMP" in t
          else "CAST(substr(CAST(annee AS VARCHAR),1,4) AS INT)" if "VARCHAR" in t
          else "CAST(annee AS INT)")
    con.execute(f"""
        CREATE VIEW nat AS
        SELECT {an} AS an, patho_niv1, patho_niv2, patho_niv3, cla_age_5, libelle_sexe,
               lpad(CAST(region AS VARCHAR), 2, '0') AS region, ntop, npop
        FROM read_parquet('{PARQUET}')
        WHERE CAST(dept AS VARCHAR) = '999'
    """)
    return con

@st.cache_data(show_spinner=False)
def q(sql, params=None):
    return moteur().execute(sql, params or []).df()

@st.cache_resource(show_spinner=False)
def fond_de_carte(chemin):
    return json.load(open(chemin, encoding="utf-8"))

# ─────────────────────────────────────────── STYLE PLOTLY FORSIDES
def style_forsides(fig, titre, sous_titre="", haut=560):
    fig.update_layout(
        height=haut,
        title=dict(text=f"<b>{titre}</b>", font=dict(color=GRIS, size=20),
                   x=0.5, xanchor="center"),
        font=dict(family="Arial", color=GRIS, size=13),
        plot_bgcolor="white", paper_bgcolor="white",
        margin=dict(l=60, r=40, t=85, b=115),
        hoverlabel=dict(bgcolor="white", bordercolor=ROUGE, font_color=GRIS),
        showlegend=False,
    )
    fig.update_xaxes(showgrid=False, linecolor=GRIS_CLAIR)
    fig.update_yaxes(gridcolor="#EEEEEE", zeroline=False)
    fig.add_annotation(text="Source : Cartographie des pathologies, Cnam — Traitement Forsides",
                       xref="paper", yref="paper", x=0, y=-0.24,
                       showarrow=False, font=dict(size=11, color=GRIS_MOYEN))
    return fig

def fmt(v): return "—" if pd.isna(v) else f"{v:,.0f}".replace(",", " ")

def court(t, n=36):
    return t if len(str(t)) <= n else str(t)[:n-1] + "…"

# ── Tranches d'âge : libellés lisibles + regroupement large
TRANCHES_LARGES = [(0, 19, "0-19 ans"), (20, 39, "20-39 ans"), (40, 59, "40-59 ans"),
                   (60, 74, "60-74 ans"), (75, 999, "75 ans et +")]
TRANCHE_ORDRE = {lbl: lo for lo, _, lbl in TRANCHES_LARGES}   # borne basse canonique

def tranche_large(age_min):
    return next(lbl for lo, hi, lbl in TRANCHES_LARGES if lo <= age_min <= hi)

def lib_tranche(c):
    """'00-04' → '0-4 ans' · '95et+' → '95 ans et +' (libellés lisibles)."""
    c = str(c)
    if c.endswith("et+"):
        return f"{int(c[:-3])} ans et +"
    if "-" in c:
        a, b = c.split("-")
        return f"{int(a)}-{int(b)} ans"
    return c

REGEX_AGE = r"^\d{1,2}-\d{1,2}$|^\d{1,2}et\+$"

AGE_MIN_SQL = """COALESCE(TRY_CAST(split_part(cla_age_5,'-',1) AS INT),
                          TRY_CAST(replace(cla_age_5,'et+','') AS INT), 999)"""

def suffixe_titre(sexe, region_lbl, region, age, age_tous):
    """Ajoute au titre uniquement les filtres réellement restreints
    (rien pour « tous sexes », « France entière », « tous âges »)."""
    bouts = []
    if sexe in ("femmes", "hommes"):
        bouts.append(sexe.capitalize())
    if region != "99":
        bouts.append(region_lbl)
    if age != age_tous:
        bouts.append(f"{age} ans")
    return (" · " + " · ".join(bouts)) if bouts else ""

# ══════════════════════════════════════════════════════════ EN-TÊTE
st.markdown("""
<div class="bandeau">
  <h1>Explorateur des pathologies en France</h1>
  <p>Effectifs de patients et prévalences (Cartographie des pathologies, Cnam) —
     interrogation en direct du fichier Parquet, rien n'est chargé en mémoire.</p>
</div>
""", unsafe_allow_html=True)

if not Path(PARQUET).exists():
    st.error(f"Le fichier **{PARQUET}** est introuvable dans le dossier de l'outil."); st.stop()

annees = q("SELECT DISTINCT an FROM nat ORDER BY an").an.tolist()
sexes = q("SELECT DISTINCT libelle_sexe FROM nat").libelle_sexe.tolist()
ordre_sexe = [s for s in ["tous sexes", "femmes", "hommes"] if s in sexes] or sexes
ages_dispo = q("""SELECT DISTINCT cla_age_5,
                         COALESCE(TRY_CAST(split_part(cla_age_5,'-',1) AS INT), 999) AS o
                  FROM nat WHERE cla_age_5 <> 'tsage' ORDER BY o""").cla_age_5.tolist()
regions_dispo = sorted(set(q("SELECT DISTINCT region FROM nat").region) - {"99"})

MODES = ["Évolution dans le temps", "Prévalence par âge", "Heatmap âge × année",
         "Carte de France", "Classement des régions", "Pyramide Femmes / Hommes",
         "Comparaison de pathologies"]

# ─────────────────────────────────────────────── BARRE LATÉRALE
with st.sidebar:
    st.markdown('<h3 data-num="1">Le graphique</h3>', unsafe_allow_html=True)
    mode = st.radio("Type", MODES, label_visibility="collapsed")
    comparaison = mode == "Comparaison de pathologies"
    heatmap = mode == "Heatmap âge × année"

    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<h3 data-num="2">La pathologie</h3>', unsafe_allow_html=True)
    if comparaison:
        # 1) On choisit une grande famille ; 2) ses pathologies sont pré-cochées
        #    automatiquement (les plus fréquentes), rien à connaître à l'avance.
        familles = [f for f in q("SELECT DISTINCT patho_niv1 FROM nat ORDER BY 1")
                    .patho_niv1.tolist() if f]
        f_def = next((i for i, f in enumerate(familles)
                      if "neuro" in f.lower()), 0)
        famille_c = st.selectbox("Grande famille", familles, index=f_def,
            help="Choisissez une famille : ses pathologies se comparent directement.")
        # pathologies de la famille, classées par effectif décroissant (dernière année)
        toutes_p2 = q("""SELECT patho_niv2 FROM nat
                         WHERE patho_niv1 = ? AND patho_niv2 IS NOT NULL
                           AND region = '99' AND cla_age_5 = 'tsage'
                           AND libelle_sexe = 'tous sexes' AND an = ?
                         GROUP BY patho_niv2
                         ORDER BY sum(COALESCE(ntop,0)) DESC""",
                      [famille_c, annees[-1]]).patho_niv2.tolist()
        if not toutes_p2:  # repli si la famille n'a pas de niveau 2 exploitable
            toutes_p2 = [p for p in q("SELECT DISTINCT patho_niv2 FROM nat WHERE patho_niv1 = ? ORDER BY 1",
                                      [famille_c]).patho_niv2.tolist() if p]
        defaut = toutes_p2[:min(4, len(toutes_p2))]   # les 4 plus grosses, pré-cochées
        pathos = st.multiselect("Pathologies comparées (jusqu'à 4)", toutes_p2,
                                default=defaut, max_selections=4,
            help="Pré-remplies avec les plus fréquentes de la famille — "
                 "retirez ou ajoutez à votre guise.")
        niv1 = niv2 = niv3 = None
        libelle = "Comparaison"
    else:
        niv1 = st.selectbox("Niveau 1 — grande famille",
                            q("SELECT DISTINCT patho_niv1 FROM nat ORDER BY 1").patho_niv1)
        opts2 = q("""SELECT DISTINCT patho_niv2 FROM nat
                     WHERE patho_niv1 = ? AND patho_niv2 IS NOT NULL ORDER BY 1""",
                  [niv1]).patho_niv2.tolist()
        niv2 = st.selectbox("Niveau 2 — pathologie", [TOUT_N2] + opts2)
        niv3 = TOUT_N3
        if niv2 != TOUT_N2:
            opts3 = q("""SELECT DISTINCT patho_niv3 FROM nat
                         WHERE patho_niv1 = ? AND patho_niv2 = ?
                           AND patho_niv3 IS NOT NULL ORDER BY 1""",
                      [niv1, niv2]).patho_niv3.tolist()
            if len(opts3) > 1:
                niv3 = st.selectbox("Niveau 3 — détail", [TOUT_N3] + opts3)

    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<h3 data-num="3">La période &amp; les options</h3>', unsafe_allow_html=True)
    evolution = mode == "Évolution dans le temps"
    if comparaison:
        mesure_c = st.radio("Mesure", ["Effectifs (nombre de patients)",
                                       "Prévalence (part de la population)"],
            help="Effectifs : nombre de patients. Prévalence : leur part dans la population.")
        annee_focus = annees[-1]
    elif heatmap:
        annee_focus = annees[-1]
        mesure = st.radio("Mesure", ["Prévalence (part de la population)",
                                     "Effectifs (nombre de patients)"],
            help="Prévalence : couleur = part de la tranche d'âge touchée (recommandé). "
                 "Effectifs : couleur = nombre brut de patients.")
        en_prevalence = mesure.startswith("Prévalence")
        st.caption("Période : la heatmap couvre toutes les années disponibles.")
    elif not evolution:
        annee_focus = st.select_slider("Année", annees, value=annees[-1])
    else:
        annee_focus = annees[-1]
        mesure = st.radio("Mesure", ["Effectifs (nombre de patients)",
                                     "Prévalence (part de la population)"],
            help="Effectifs : combien de patients. Prévalence : leur part dans la "
                 "population — corrige la croissance démographique, donc dit si le "
                 "risque lui-même augmente.")
        en_prevalence = mesure.startswith("Prévalence")
        echelle_zero = st.checkbox("Échelle à partir de zéro", value=False,
                                   help="Décochée : l'axe zoome sur les variations. "
                                        "Cochée : l'axe part de 0.")
    if mode in ("Carte de France", "Classement des régions"):
        standardiser = st.checkbox("Corriger de la structure d'âge", value=False,
            help="Recalcule la prévalence de chaque région comme si elle avait la pyramide "
                 "des âges de la France : les écarts restants ne sont plus dus au "
                 "vieillissement différent des régions. Les cases masquées "
                 "(< 10 patients) comptent pour zéro.")

    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<h3 data-num="4">La population</h3>', unsafe_allow_html=True)
    if mode != "Pyramide Femmes / Hommes":
        sexe = st.radio("Sexe", ordre_sexe, horizontal=True)
    else:
        sexe = "tous sexes"
        st.caption("Sexe : le graphique compare femmes et hommes.")
    ventile_age = mode in ("Prévalence par âge", "Pyramide Femmes / Hommes",
                           "Heatmap âge × année")
    if evolution:
        age = st.selectbox("Classe d'âge", [TOUS_AGES] + ages_dispo)
        granularite_large, bornes_age = False, (0, 95)
    elif ventile_age:
        age = TOUS_AGES
        granularite_large = st.radio("Granularité d'âge",
            ["Fine (tranches de 5 ans)",
             "Large (0-19 / 20-39 / 40-59 / 60-74 / 75+)"],
            help="Large : regroupe les tranches de 5 ans en 5 grandes tranches — "
                 "lisse le bruit des petites cases masquées, plus lisible pour "
                 "un post.").startswith("Large")
        bornes_age = st.slider("Bornes d'âge (de … à …)", 0, 95, (0, 95), step=5,
            format="%d ans",
            help="Exclut les âges hors bornes avant tout calcul — utile pour "
                 "retirer les âges sans signal (ex. démences avant 40 ans). "
                 "La borne 95 correspond à la tranche « 95 ans et + ».")
    else:
        age = TOUS_AGES
        granularite_large, bornes_age = False, (0, 95)
        if comparaison:
            st.caption("Comparaison au niveau national, tous âges.")
    if evolution or comparaison or ventile_age:
        region_lbl = st.selectbox("Région", [TOUTE_FR] + [REGIONS.get(r, f"Région {r}")
                                                          for r in regions_dispo])
        region = "99" if region_lbl == TOUTE_FR else \
            next(r for r in regions_dispo if REGIONS.get(r, f"Région {r}") == region_lbl)
    else:
        region, region_lbl = "99", TOUTE_FR
        st.caption("Région : le graphique couvre toutes les régions.")

    st.markdown("<hr>", unsafe_allow_html=True)
    st.markdown('<h3 data-num="5">Personnaliser</h3>', unsafe_allow_html=True)
    # le titre est propre à chaque couple (graphique, pathologie) : changer l'un
    # ou l'autre redonne le titre automatique
    if comparaison:
        sig = f"{mode}|{famille_c}|{'|'.join(sorted(pathos))}"
    else:
        sig = f"{mode}|{niv1}|{niv2}|{niv3}"
    titre_perso = st.text_input("Titre du graphique", key=f"titre_{sig}",
                                placeholder="Laissez vide pour le titre automatique")
    axe_x_perso = st.text_input("Nom de l'axe horizontal", key=f"axe_x_{mode}",
                                placeholder="Laissez vide pour le nom automatique")
    axe_y_perso = st.text_input("Nom de l'axe vertical", key=f"axe_y_{mode}",
                                placeholder="Laissez vide pour le nom automatique")
    st.caption("Le titre suit le graphique **et** la pathologie ; les noms d'axes "
               "suivent le type de graphique.")

# ═══════════════════════ MODE COMPARAISON DE PATHOLOGIES ═══════════════════════
def bouton_copier(texte, libelle_bouton="📋 Copier les chiffres clés"):
    """Bouton qui copie un mini-texte dans le presse-papiers (prêt à coller dans un post).
    Le texte est injecté en JSON dans un <script> : robuste aux apostrophes
    (« pour d'autres causes »…), guillemets et retours à la ligne."""
    import html as _html
    txt_js = json.dumps(texte).replace("</", "<\\/")     # sûr dans un <script>
    lbl_js = json.dumps(libelle_bouton)
    txt_aff = _html.escape(texte).replace("\n", "<br>")
    components.html(f"""
      <div style="font-family:Arial;">
        <button id="cbk" style="background:{ROUGE};color:white;border:none;
            border-radius:8px;padding:9px 16px;font-size:.9rem;font-weight:600;
            cursor:pointer;">{libelle_bouton}</button>
        <div style="margin-top:8px;padding:10px 12px;background:#FAFAFA;
            border:1px solid {GRIS_CLAIR};border-radius:6px;color:{GRIS};
            font-size:.85rem;line-height:1.5;">{txt_aff}</div>
        <script>
          var BTN = document.getElementById("cbk");
          BTN.onclick = function() {{
            navigator.clipboard.writeText({txt_js}).then(function() {{
              BTN.innerText = "✔️ Copié !";
              setTimeout(function() {{ BTN.innerText = {lbl_js}; }}, 1800);
            }});
          }};
        </script>
      </div>
    """, height=160)

def appliquer_axes_perso(figure):
    """Applique les noms d'axes saisis dans « Personnaliser » (vides = automatique)."""
    if axe_x_perso:
        figure.update_xaxes(title_text=axe_x_perso)
    if axe_y_perso:
        figure.update_yaxes(title_text=axe_y_perso)
    return figure



if comparaison:
    en_prev_c = mesure_c == "Prévalence (part de la population)"
    if len(pathos) < 2:
        st.info("Cochez au moins deux pathologies à comparer dans le menu de gauche.")
        st.stop()
    palette = [ROUGE, GRIS, ROUGE_FONCE, "#E5A33B"]
    fig = go.Figure()
    lignes_kpi, textes_kpi = [], []
    for i, p in enumerate(pathos):
        metrique = ("100.0*sum(ntop)/max(npop)" if en_prev_c else "sum(ntop)")
        # si un sous-total officiel (niv3 NULL) existe, l'utiliser : pas de cumul
        a_ss3 = q("""SELECT count(*) AS c FROM nat
                     WHERE patho_niv2 = ? AND patho_niv3 IS NULL""",
                  [p]).c.iloc[0] > 0
        clause3 = " AND patho_niv3 IS NULL" if a_ss3 else ""
        d = q(f"""SELECT an, {metrique} AS val FROM nat
                  WHERE patho_niv2 = ?{clause3} AND libelle_sexe = ? AND region = ?
                    AND cla_age_5 = 'tsage' GROUP BY an ORDER BY an""",
              [p, sexe, region]).dropna(subset=["val"])
        if d.empty:
            continue
        c = palette[i % len(palette)]
        evo_p = 100*(d.val.iloc[-1]/d.val.iloc[0]-1) if len(d) > 1 and d.val.iloc[0] else 0
        fig.add_trace(go.Scatter(x=d.an, y=d.val, mode="lines+markers", name=court(p),
            line=dict(color=c, width=3), marker=dict(size=7, color=c),
            hovertemplate="<b>%{x}</b><br>" +
                ("%{y:.2f} %" if en_prev_c else "%{y:,.0f}") +
                f"<br>{court(p,28)}<extra></extra>"))
        lignes_kpi.append((court(p, 30), evo_p, c))
        v_fin = d.val.iloc[-1]
        val_txt = (f"prévalence {v_fin:.2f} %".replace(".", ",")
                   if en_prev_c else f"{fmt(v_fin)} patients")
        textes_kpi.append(f"{p} : {val_txt} en {int(d.an.iloc[-1])}, "
                          f"{evo_p:+.0f} % depuis {int(d.an.iloc[0])}")
    titre_c = ("Prévalence" if en_prev_c else "Patients suivis") + " — comparaison" \
              + ("" if sexe == "tous sexes" else f" · {sexe.capitalize()}") \
              + ("" if region == "99" else f" · {region_lbl}")
    fig = style_forsides(fig, titre_perso or titre_c)
    fig.update_layout(showlegend=True,
                      legend=dict(orientation="h", y=-0.22, x=0.5, xanchor="center"))
    fig.update_xaxes(tickmode="linear", dtick=1, tickformat="d")
    fig.update_yaxes(title="Prévalence (%)" if en_prev_c else "Patients suivis",
                     tickformat=".2f" if en_prev_c else ",")
    cols = st.columns(len(lignes_kpi))
    for col, (nom, e, c) in zip(cols, lignes_kpi):
        col.markdown(f"<div style='border-left:4px solid {c}; padding:6px 10px; "
                     f"background:#FAFAFA; border-radius:4px;'>"
                     f"<div style='font-size:.78rem; color:{GRIS_MOYEN}'>{nom}</div>"
                     f"<div style='font-size:1.2rem; font-weight:700; color:{GRIS}'>{e:+.1f} %</div>"
                     f"</div>", unsafe_allow_html=True)
    st.write("")
    fig = appliquer_axes_perso(fig)
    st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
    texte_presse = " · ".join(textes_kpi) + " — source Cnam."

    st.write("")
    with st.expander("📋 Chiffres clés prêts à coller"):
        bouton_copier(texte_presse)
    colA, colB = st.columns([1, 2])
    if colA.button("🖼️ Préparer l'export PNG", use_container_width=True):
        with st.spinner("Génération…"):
            try:
                st.session_state["png_c"] = fig.to_image(format="png", scale=3,
                                                         width=1200, height=640)
            except Exception:
                st.error("Export impossible — relancez le .bat (kaleido).")
    if st.session_state.get("png_c"):
        colB.download_button("⬇️ Télécharger le PNG", data=st.session_state["png_c"],
                             file_name="forsides_comparaison.png", mime="image/png",
                             use_container_width=True)
    st.caption("Champ : national par région sélectionnée · tous âges · Source : "
               "Cartographie des pathologies, Cnam — Traitement Forsides.")
    st.stop()

# ─────────────────── FILTRE PATHOLOGIE + LIBELLÉS
# La Cnam publie aussi des lignes « sous-total » (niv2 ou niv3 à NULL) dans
# lesquelles chaque patient n'est compté qu'UNE fois. Quand elles existent,
# les vues regroupées les utilisent : chiffres officiels dédupliqués, sans
# cumul de prises en charge. Sinon, repli sur la somme du détail (cumul).
libelle = niv1
if niv2 == TOUT_N2:
    a_sstotal = q("""SELECT count(*) AS c FROM nat
                     WHERE patho_niv1 = ? AND patho_niv2 IS NULL""",
                  [niv1]).c.iloc[0] > 0
    if a_sstotal:
        fp, pp, groupe_actif = "patho_niv1 = ? AND patho_niv2 IS NULL", [niv1], False
    else:
        fp, pp, groupe_actif = "patho_niv1 = ?", [niv1], True
elif niv3 == TOUT_N3:
    libelle = niv2
    n3 = q("""SELECT count(DISTINCT patho_niv3) AS c,
                     count(*) FILTER (WHERE patho_niv3 IS NULL) AS n
              FROM nat WHERE patho_niv1 = ? AND patho_niv2 = ?""", [niv1, niv2])
    if n3.n.iloc[0] > 0:      # sous-total officiel du niveau 2 disponible
        fp, pp = "patho_niv1 = ? AND patho_niv2 = ? AND patho_niv3 IS NULL", [niv1, niv2]
        groupe_actif = False
    else:
        fp, pp = "patho_niv1 = ? AND patho_niv2 = ?", [niv1, niv2]
        groupe_actif = n3.c.iloc[0] > 1
else:
    libelle = niv3
    fp, pp = "patho_niv1 = ? AND patho_niv2 = ? AND patho_niv3 = ?", [niv1, niv2, niv3]
    groupe_actif = False

age_sql = "'tsage'" if age == TOUS_AGES else "?"
p_age = [] if age == TOUS_AGES else [age]
contexte = sexe + ("" if region == "99" else f" · {region_lbl}") \
                + ("" if age == TOUS_AGES else f" · {age} ans")

# ─────────────────────────────────────────────── CHIFFRES CLÉS (France ou périmètre)
kpi = q(f"""SELECT sum(ntop) AS n FROM nat WHERE {fp} AND libelle_sexe = ?
            AND region = ? AND cla_age_5 = {age_sql} AND an = ?""",
        pp + [sexe, region] + p_age + [annee_focus]).iloc[0]
kpi0 = q(f"""SELECT sum(ntop) AS n FROM nat WHERE {fp} AND libelle_sexe = ?
             AND region = ? AND cla_age_5 = {age_sql} AND an = ?""",
         pp + [sexe, region] + p_age + [annees[0]]).iloc[0]
pop = q(f"""SELECT max(npop) AS p FROM nat WHERE libelle_sexe = ? AND region = ?
            AND cla_age_5 = {age_sql} AND an = ?""",
        [sexe, region] + p_age + [annee_focus]).iloc[0].p

c1, c2, c3 = st.columns(3)
c1.metric(f"Suivis en {annee_focus}", fmt(kpi.n),
          help=f"Somme des effectifs ntop pour « {libelle} » ({contexte}).")
# le KPI d'évolution suit la mesure choisie (effectifs par défaut, prévalence si bascule)
_en_prev_kpi = evolution and 'en_prevalence' in dir() and en_prevalence
if _en_prev_kpi:
    _v1 = (100*kpi.n/pop) if pop else None
    _p0 = q(f"""SELECT max(npop) AS p FROM nat WHERE libelle_sexe = ? AND region = ?
                AND cla_age_5 = {age_sql} AND an = ?""",
            [sexe, region] + p_age + [annees[0]]).iloc[0].p
    _v0 = (100*kpi0.n/_p0) if _p0 else None
    _evo_kpi = f"{100*(_v1/_v0-1):+.1f} %" if (_v0 and _v1) else "—"
    _aide_kpi = "Variation de la prévalence entre la première année et l'année affichée."
else:
    _evo_kpi = f"{100*(kpi.n/kpi0.n-1):+.1f} %" if kpi0.n else "—"
    _aide_kpi = "Variation des effectifs entre la première année et l'année affichée."
c2.metric(f"Évolution depuis {annees[0]}", _evo_kpi, help=_aide_kpi)
c3.metric("Prévalence", f"{100*kpi.n/pop:.2f} %" if pop else "—",
          help="Effectifs rapportés à la population de référence (npop) du même périmètre.")
if groupe_actif:
    st.markdown('<div class="note-lecture">⚠️ <b>Vue regroupée</b> : les effectifs sont '
                'des prises en charge cumulées — un même patient peut apparaître dans '
                'plusieurs pathologies du groupe.</div>', unsafe_allow_html=True)
st.markdown('<hr class="separe-kpi">', unsafe_allow_html=True)

# ══════════════ FIABILITÉ : part de cases masquées par région
def masquage_par_region():
    return q(f"""SELECT region,
                        100.0*sum(CASE WHEN ntop IS NULL THEN 1 ELSE 0 END)/count(*) AS pct
                 FROM nat WHERE {fp} AND libelle_sexe = ? AND cla_age_5 <> 'tsage'
                   AND an = ? AND region <> '99'
                 GROUP BY region""", pp + [sexe, annee_focus])

SEUIL_FIABLE = 30   # au-delà, la valeur régionale est jugée peu fiable

# ══════════════ PRÉVALENCE PAR RÉGION (brute ou standardisée) — carte & classement
def prevalences_regionales(std):
    if std:
        return q(f"""
            WITH fr AS (SELECT cla_age_5, max(npop) AS pop FROM nat
                        WHERE region = '99' AND libelle_sexe = ? AND cla_age_5 <> 'tsage'
                          AND an = ? GROUP BY cla_age_5),
                 r AS (SELECT region, cla_age_5, sum(COALESCE(ntop, 0)) AS ntop,
                              max(npop) AS npop
                       FROM nat WHERE {fp} AND libelle_sexe = ? AND cla_age_5 <> 'tsage'
                         AND an = ? AND region <> '99' GROUP BY region, cla_age_5)
            SELECT r.region, 100.0*sum(r.ntop / NULLIF(r.npop,0) * fr.pop) / sum(fr.pop) AS prev
            FROM r JOIN fr USING (cla_age_5)
            WHERE r.npop > 0
            GROUP BY r.region""", [sexe, annee_focus] + pp + [sexe, annee_focus])
    return q(f"""SELECT region, 100.0*sum(COALESCE(ntop,0))/max(npop) AS prev FROM nat
                 WHERE {fp} AND libelle_sexe = ? AND cla_age_5 = 'tsage'
                   AND an = ? AND region <> '99'
                 GROUP BY region""", pp + [sexe, annee_focus])

# ─────────────────────────────────────────────── LES GRAPHIQUES
fig_ratio = None      # rempli uniquement par la pyramide (ratio F/H par âge)
if evolution:
    if en_prevalence:
        d = q(f"""SELECT an, 100.0*sum(ntop)/max(npop) AS val FROM nat
                  WHERE {fp} AND libelle_sexe = ? AND region = ? AND cla_age_5 = {age_sql}
                  GROUP BY an ORDER BY an""", pp + [sexe, region] + p_age).dropna(subset=["val"])
    else:
        d = q(f"""SELECT an, sum(ntop) AS val FROM nat WHERE {fp} AND libelle_sexe = ?
                  AND region = ? AND cla_age_5 = {age_sql}
                  GROUP BY an ORDER BY an""", pp + [sexe, region] + p_age).dropna(subset=["val"])
    if d.empty:
        st.warning("Aucune donnée : effectifs entièrement masqués à cette maille."); st.stop()
    evo = 100 * (d.val.iloc[-1] / d.val.iloc[0] - 1) if len(d) > 1 and d.val.iloc[0] else 0
    etiq = (lambda v: f"{v:.2f} %") if en_prevalence else fmt
    fig = go.Figure(go.Scatter(x=d.an, y=d.val, mode="lines+markers",
        line=dict(color=ROUGE, width=3.5),
        marker=dict(size=9, color=ROUGE, line=dict(color="white", width=2)),
        hovertemplate="<b>%{x}</b><br>" +
                      ("%{y:.2f} %" if en_prevalence else "%{y:,.0f} patients") + "<extra></extra>"))
    fig.add_annotation(x=d.an.iloc[0], y=d.val.iloc[0], text=f"<b>{etiq(d.val.iloc[0])}</b>",
                       showarrow=False, yshift=18, font=dict(color=GRIS_MOYEN, size=12))
    fig.add_annotation(x=d.an.iloc[-1], y=d.val.iloc[-1], text=f"<b>{etiq(d.val.iloc[-1])}</b>",
                       showarrow=False, yshift=18, font=dict(color=ROUGE_FONCE, size=13))
    fig.add_annotation(xref="paper", yref="paper", x=1.0, y=1.28,
                       text=f"<b>{evo:+.1f} %</b> sur la période", showarrow=False,
                       font=dict(color="white", size=13),
                       bgcolor=ROUGE if evo >= 0 else "#2E7D32", borderpad=6)
    titre_auto = f"{libelle} — " + ("prévalence" if en_prevalence else "patients suivis") \
                 + suffixe_titre(sexe, region_lbl, region, age, TOUS_AGES)
    fig = style_forsides(fig, titre_perso or titre_auto)
    fig.update_layout(margin=dict(t=110))
    fig.update_xaxes(tickmode="linear", dtick=1, tickformat="d")
    fig.update_yaxes(title="Prévalence (%)" if en_prevalence else "Patients suivis",
                     tickformat=".2f" if en_prevalence else ",",
                     rangemode="tozero" if echelle_zero else "normal")

elif mode == "Prévalence par âge":
    d = q(f"""SELECT cla_age_5, {AGE_MIN_SQL} AS age_min,
                     sum(ntop) AS ntop, sum(npop) AS npop
              FROM nat WHERE {fp} AND libelle_sexe = ? AND region = ?
                AND cla_age_5 <> 'tsage' AND an = ? AND npop > 0 AND ntop IS NOT NULL
              GROUP BY cla_age_5 ORDER BY age_min""",
          pp + [sexe, region, annee_focus])
    d = d[d.cla_age_5.str.match(REGEX_AGE, na=False)]
    d = d[(d.age_min >= bornes_age[0]) & (d.age_min <= bornes_age[1])]
    if granularite_large:
        d["lib"] = d.age_min.map(tranche_large)
        d = (d.groupby("lib", as_index=False)
               .agg(ntop=("ntop", "sum"), npop=("npop", "sum")))
        d["age_min"] = d.lib.map(TRANCHE_ORDRE)      # borne canonique : pas de doublons
        d = d.sort_values("age_min")
    else:
        d["lib"] = d.cla_age_5.map(lib_tranche)
    d["prev"] = 100 * d.ntop / d.npop
    d = d.dropna(subset=["prev"])
    if d.empty:
        st.warning("Aucune donnée : effectifs entièrement masqués à cette maille "
                   "(ou bornes d'âge trop restrictives)."); st.stop()
    couleurs = [ROUGE_FONCE if v == d.prev.max() else ROUGE for v in d.prev]
    fig = go.Figure(go.Bar(x=d.lib, y=d.prev, marker_color=couleurs,
        text=[f"{v:.2f} %" if d.prev.max() < 5 else f"{v:.1f} %" for v in d.prev],
        textposition="outside", textfont=dict(size=10, color=GRIS_MOYEN), cliponaxis=False,
        hovertemplate="<b>%{x}</b><br>%{y:.2f} %<extra></extra>"))
    titre_auto = f"{libelle} — prévalence par âge en {annee_focus}" \
                 + suffixe_titre(sexe, region_lbl, region, TOUS_AGES, TOUS_AGES)
    fig = style_forsides(fig, titre_perso or titre_auto)
    fig.update_xaxes(type="category", categoryorder="array",
                     categoryarray=d.lib.tolist(), title="Tranche d'âge", tickangle=-40)
    fig.update_yaxes(title="Prévalence (%)", rangemode="tozero")

elif heatmap:
    d = q(f"""SELECT an, cla_age_5, {AGE_MIN_SQL} AS age_min,
                     sum(ntop) AS ntop, sum(npop) AS npop
              FROM nat WHERE {fp} AND libelle_sexe = ? AND region = ?
                AND cla_age_5 <> 'tsage' AND npop > 0
              GROUP BY an, cla_age_5""", pp + [sexe, region])
    d = d[d.cla_age_5.str.match(REGEX_AGE, na=False)]
    d = d[(d.age_min >= bornes_age[0]) & (d.age_min <= bornes_age[1])]
    if granularite_large:
        d["lib"] = d.age_min.map(tranche_large)
        d = (d.groupby(["lib", "an"], as_index=False)
               .agg(ntop=("ntop", "sum"), npop=("npop", "sum")))
        d["age_min"] = d.lib.map(TRANCHE_ORDRE)      # borne canonique : pas de doublons
    else:
        d["lib"] = d.cla_age_5.map(lib_tranche)
    d["val"] = (100 * d.ntop / d.npop) if en_prevalence else d.ntop
    d = d.dropna(subset=["val"])
    if d.empty:
        st.warning("Aucune donnée : effectifs entièrement masqués à cette maille "
                   "(ou bornes d'âge trop restrictives)."); st.stop()
    piv = d.pivot_table(index=["age_min", "lib"], columns="an",
                        values="val").sort_index()
    ages_lbl = [ix[1] for ix in piv.index]
    fig = go.Figure(go.Heatmap(
        z=piv.values, x=[str(a) for a in piv.columns], y=ages_lbl,
        colorscale=[[0, "#FDECEC"], [0.5, ROUGE], [1, ROUGE_FONCE]],
        colorbar=dict(title=("Prévalence (%)" if en_prevalence else "Patients"),
                      outlinewidth=0, ticksuffix=(" %" if en_prevalence else "")),
        hoverongaps=False,
        hovertemplate="<b>%{y} · %{x}</b><br>" +
            ("%{z:.2f} %" if en_prevalence else "%{z:,.0f} patients") + "<extra></extra>"))
    titre_auto = f"{libelle} — {'prévalence' if en_prevalence else 'effectifs'} " \
                 f"par âge et par année" \
                 + suffixe_titre(sexe, region_lbl, region, TOUS_AGES, TOUS_AGES)
    fig = style_forsides(fig, titre_perso or titre_auto, haut=640)
    fig.update_xaxes(title="Année", type="category")
    fig.update_yaxes(title="Tranche d'âge", type="category", autorange="reversed",
                     gridcolor="white")
    st.markdown('<div class="note-lecture">📖 <b>Comment lire ce graphique</b> — chaque '
                'case = une tranche d\'âge (ligne) une année (colonne). Plus la couleur '
                'foncée glisse vers le <b>bas</b> (âges élevés) et vers la <b>droite</b> '
                '(années récentes), plus la pathologie « vieillit ». '
                '<i>Cette note ne figure pas dans l\'export PNG.</i></div>',
                unsafe_allow_html=True)

elif mode == "Carte de France":
    geo = trouver_geojson()
    if geo is None:
        st.error("Le fond de carte **regions.geojson** est introuvable dans le dossier de "
                 "l'outil. Vérifiez que le fichier téléchargé est bien à côté de "
                 "outil_patho.py (son nom doit commencer par « regions »).")
        st.stop()
    d = prevalences_regionales(standardiser)
    d = d[d.region.isin(METRO)].dropna(subset=["prev"])
    msq = masquage_par_region().set_index("region").pct.to_dict()
    d["nom"] = d.region.map(REGIONS)
    d["msq"] = d.region.map(lambda r: msq.get(r, 0))
    fig = go.Figure(go.Choropleth(
        geojson=fond_de_carte(str(geo)), locations=d.region, z=d.prev,
        featureidkey="properties.code",
        colorscale=[[0, "#FDECEC"], [0.5, ROUGE], [1, ROUGE_FONCE]],
        marker_line_color="white", marker_line_width=1.2,
        colorbar=dict(title="Prévalence (%)", ticksuffix=" %", outlinewidth=0),
        customdata=d[["nom", "msq"]],
        hovertemplate="<b>%{customdata[0]}</b><br>%{z:.2f} %<br>"
                      "<span style='color:gray'>%{customdata[1]:.0f} %% de cases masquées</span>"
                      "<extra></extra>"))
    fig.update_geos(fitbounds="locations", visible=False, projection_type="mercator")
    std_txt = " (standardisée par âge)" if standardiser else ""
    titre_auto = f"{libelle} — prévalence par région en {annee_focus}{std_txt}" \
                 + suffixe_titre(sexe, "", "99", TOUS_AGES, TOUS_AGES)
    fig = style_forsides(fig, titre_perso or titre_auto, haut=620)
    fig.update_layout(margin=dict(l=10, r=10, t=110, b=80))
    st.caption("Métropole uniquement (les DOM restent accessibles via le classement).")

elif mode == "Classement des régions":
    d = prevalences_regionales(standardiser).dropna(subset=["prev"])
    msq = masquage_par_region().set_index("region").pct.to_dict()
    d["msq"] = d.region.map(lambda r: msq.get(r, 0))
    d["fiable"] = d.msq < SEUIL_FIABLE
    d["nom"] = d.region.map(lambda r: REGIONS.get(r, f"Région {r}"))
    d = d.sort_values("prev")
    fr = 100 * kpi.n / pop if (pop and region == "99") else None
    couleurs = [(ROUGE_FONCE if i >= len(d) - 3 else ROUGE) if f else "#D8B4B4"
                for i, f in zip(range(len(d)), d.fiable)]
    fig = go.Figure(go.Bar(x=d.prev, y=d.nom, orientation="h", marker_color=couleurs,
        text=d.prev.round(2), textposition="outside", cliponaxis=False,
        textfont=dict(size=10, color=GRIS_MOYEN),
        customdata=d.msq,
        hovertemplate="<b>%{y}</b><br>%{x:.2f} %<br>"
                      "<span style='color:gray'>%{customdata:.0f} %% de cases masquées</span>"
                      "<extra></extra>"))
    if fr:
        fig.add_vline(x=fr, line_dash="dot", line_color=GRIS, line_width=1.5)
        fig.add_annotation(x=fr, y=1.03, yref="paper",
                           text=f"<b>France : {fr:.2f} %</b>", showarrow=False,
                           font=dict(size=12, color=GRIS),
                           bgcolor="white", bordercolor=GRIS_CLAIR, borderpad=4)
    std_txt = " (standardisée par âge)" if standardiser else ""
    titre_auto = f"{libelle} — classement des régions en {annee_focus}{std_txt}" \
                 + suffixe_titre(sexe, "", "99", TOUS_AGES, TOUS_AGES)
    fig = style_forsides(fig, titre_perso or titre_auto, haut=640)
    fig.update_xaxes(title="Prévalence (%)")
    fig.update_yaxes(tickfont=dict(size=11))
    st.session_state["_fiabilite"] = d[["nom", "prev", "msq", "fiable"]].copy()

else:  # 👥 Pyramide Femmes / Hommes
    d = q(f"""SELECT cla_age_5, {AGE_MIN_SQL} AS age_min,
                     libelle_sexe, sum(ntop) AS ntop
              FROM nat WHERE {fp} AND region = ? AND an = ?
                AND libelle_sexe IN ('femmes','hommes') AND cla_age_5 <> 'tsage'
                AND ntop IS NOT NULL
              GROUP BY cla_age_5, libelle_sexe ORDER BY age_min""",
          pp + [region, annee_focus])
    d = d[d.cla_age_5.str.match(REGEX_AGE, na=False)]
    d = d[(d.age_min >= bornes_age[0]) & (d.age_min <= bornes_age[1])]
    if granularite_large:
        d["lib"] = d.age_min.map(tranche_large)
        d = (d.groupby(["lib", "libelle_sexe"], as_index=False)
               .agg(ntop=("ntop", "sum")))
        d["age_min"] = d.lib.map(TRANCHE_ORDRE)      # borne canonique : pas de doublons
    else:
        d["lib"] = d.cla_age_5.map(lib_tranche)
    p = d.pivot_table(index=["age_min", "lib"], columns="libelle_sexe",
                      values="ntop").reset_index().fillna(0).sort_values("age_min")
    if p.empty:
        st.warning("Aucune donnée : effectifs entièrement masqués à cette maille "
                   "(ou bornes d'âge trop restrictives)."); st.stop()
    fig = go.Figure()
    h = p.get("hommes", pd.Series(0, index=p.index))
    f = p.get("femmes", pd.Series(0, index=p.index))
    fig.add_bar(y=p.lib, x=-h, orientation="h",
                marker_color=GRIS, name="Hommes",
                text=[fmt(v) if v else "" for v in h], textposition="outside",
                textfont=dict(size=9, color=GRIS_MOYEN), cliponaxis=False,
                hovertemplate="<b>%{y}</b> · Hommes<br>%{customdata:,.0f}<extra></extra>",
                customdata=h)
    fig.add_bar(y=p.lib, x=f, orientation="h",
                marker_color=ROUGE, name="Femmes",
                text=[fmt(v) if v else "" for v in f], textposition="outside",
                textfont=dict(size=9, color=GRIS_MOYEN), cliponaxis=False,
                hovertemplate="<b>%{y}</b> · Femmes<br>%{x:,.0f}<extra></extra>")
    fig.update_layout(barmode="overlay", bargap=0.15)
    titre_auto = f"{libelle} — pyramide femmes / hommes en {annee_focus}" \
                 + suffixe_titre("tous sexes", region_lbl, region, TOUS_AGES, TOUS_AGES)
    fig = style_forsides(fig, titre_perso or titre_auto, haut=620)
    fig.update_layout(showlegend=True,
                      legend=dict(orientation="h", y=1.06, x=0.75))
    # ── Ratio F/H global : l'annotation qui fait le post
    tf, th = f.sum(), h.sum()
    if th > 0 and tf > 0:
        rg = tf / th
        txt_ratio = (f"⚖️ <b>{rg:.1f} femme{'s' if rg >= 1.05 else ''} pour 1 homme</b>"
                     if rg >= 1 else
                     f"⚖️ <b>{1/rg:.1f} homme{'s' if 1/rg >= 1.05 else ''} pour 1 femme</b>")
        fig.add_annotation(xref="paper", yref="paper", x=0.0, y=1.13,
                           text=txt_ratio, showarrow=False,
                           font=dict(size=13, color=GRIS),
                           bgcolor="#FAFAFA", bordercolor=GRIS_CLAIR, borderpad=6)
    m = max(f.max(), h.max())
    fig.update_xaxes(title="Patients suivis", range=[-m * 1.22, m * 1.22],
                     tickvals=[-m, -m/2, 0, m/2, m],
                     ticktext=[fmt(m), fmt(m/2), "0", fmt(m/2), fmt(m)])
    fig.update_yaxes(type="category", title="Tranche d'âge")
    fig.update_layout(margin=dict(r=70, l=95, t=115))
    # ── Petite courbe du ratio F/H par âge (affichée sous la pyramide)
    ok = (h > 0) & (f > 0)
    if ok.sum() >= 2:
        fig_ratio = go.Figure(go.Scatter(
            x=p.lib[ok], y=(f[ok] / h[ok]), mode="lines+markers",
            line=dict(color=ROUGE, width=3),
            marker=dict(size=7, color=ROUGE, line=dict(color="white", width=2)),
            hovertemplate="<b>%{x}</b><br>%{y:.2f} femme(s) pour 1 homme<extra></extra>"))
        fig_ratio.add_hline(y=1, line_dash="dot", line_color=GRIS_MOYEN, line_width=1.5,
                            annotation_text="parité", annotation_position="right",
                            annotation_font=dict(size=11, color=GRIS_MOYEN))
        fig_ratio = style_forsides(fig_ratio, "Ratio femmes / hommes par âge", haut=430)
        fig_ratio.update_layout(margin=dict(l=60, r=60, t=70, b=135))
        fig_ratio.update_xaxes(type="category", tickangle=-40, title="Tranche d'âge")
        fig_ratio.update_yaxes(title="Femmes pour 1 homme")

fig = appliquer_axes_perso(fig)
st.plotly_chart(fig, use_container_width=True, config={"displayModeBar": False})
if fig_ratio is not None:
    st.plotly_chart(fig_ratio, use_container_width=True,
                    config={"displayModeBar": False})

# ───────────────────── FIABILITÉ PAR RÉGION (carte & classement uniquement)
if mode in ("Carte de France", "Classement des régions"):
    tab = masquage_par_region()
    tab["nom"] = tab.region.map(lambda r: REGIONS.get(r, f"Région {r}"))
    with st.expander("🔍 Fiabilité par région (part de cases masquées)"):
        aff = tab.sort_values("pct")[["nom", "pct"]].copy()
        aff = aff.rename(columns={"nom": "Région", "pct": "% de cases masquées"})
        aff["% de cases masquées"] = aff["% de cases masquées"].round(0).astype(int)
        def colorer(v):
            fond = "#E8F5E9" if v < SEUIL_FIABLE else "#FDECEC"
            return f"background-color: {fond}"
        sty = aff.style.map(colorer, subset=["% de cases masquées"]) \
                       .format({"% de cases masquées": "{} %"})
        st.dataframe(sty, use_container_width=True, hide_index=True,
                     height=(len(aff) + 1) * 35 + 3)
        st.caption(f"Vert : moins de {SEUIL_FIABLE} % de cases masquées (fiable). "
                   f"Rouge : au-delà, valeur sous-estimée.")

# ───────────────────── QUALITÉ DES DONNÉES (suit exactement la sélection affichée)
if mode in ("Carte de France", "Classement des régions"):
    f_couv, p_couv = f"{fp} AND libelle_sexe = ? AND cla_age_5 <> 'tsage' AND region <> '99' AND an = ?", \
                     pp + [sexe, annee_focus]
elif mode == "Pyramide Femmes / Hommes":
    f_couv, p_couv = f"{fp} AND libelle_sexe IN ('femmes','hommes') AND cla_age_5 <> 'tsage' AND region = ? AND an = ?", \
                     pp + [region, annee_focus]
elif evolution and age != TOUS_AGES:
    f_couv, p_couv = f"{fp} AND libelle_sexe = ? AND cla_age_5 = ? AND region = ?", \
                     pp + [sexe, age, region]
else:
    multi_ans = evolution or heatmap        # ces modes couvrent toutes les années
    f_couv, p_couv = f"{fp} AND libelle_sexe = ? AND cla_age_5 <> 'tsage' AND region = ?" \
                     + ("" if multi_ans else " AND an = ?"), \
                     pp + [sexe, region] + ([] if multi_ans else [annee_focus])
couv = q(f"""SELECT count(*) AS total,
                    sum(CASE WHEN ntop IS NULL THEN 1 ELSE 0 END) AS masques
             FROM nat WHERE {f_couv}""", p_couv).iloc[0]
part = 100 * couv.masques / couv.total if couv.total else 0
info = ("Les effectifs inférieurs à 10 patients sont masqués à la source (secret statistique) : "
        "ils comptent pour zéro dans les sommes, qui sont donc sous-estimées. "
        "Pour fiabiliser : élargir la maille (France entière, tous âges) ou regrouper les pathologies.")
if part > 15:
    st.markdown(f"""<div class="qualite-alerte">🔎 <b>{part:.0f} % des croisements sont masqués</b>
        sur cette sélection — résultats sous-estimés.
        <span class="aide" title="{info}">?</span></div>""",
        unsafe_allow_html=True)
else:
    st.markdown(f"""<div class="qualite-ok">✔️ Couverture des données :
        <b>{100-part:.0f} %</b> des croisements renseignés.
        <span class="aide" title="{info}">?</span></div>""",
        unsafe_allow_html=True)

# ───────────────────── CHIFFRES CLÉS PRÊTS À COLLER (accélère la rédaction des posts)
st.write("")
_evo_num = 100 * (kpi.n / kpi0.n - 1) if kpi0.n else None
_prev_num = 100 * kpi.n / pop if pop else None
texte_cle = f"{libelle} : {fmt(kpi.n)} patients en {annee_focus}"
if _evo_num is not None:
    texte_cle += f", {_evo_num:+.0f} % depuis {annees[0]}"
if _prev_num:
    texte_cle += f", prévalence {_prev_num:.2f} %".replace(".", ",")
texte_cle += " — source Cnam."
with st.expander("📋 Chiffres clés prêts à coller"):
    bouton_copier(texte_cle)

# ───────────────────────── EXPORTS (générés à la demande, jamais au chargement)
st.write("")
import importlib.util
KALEIDO_OK = importlib.util.find_spec("kaleido") is not None
cle = f"{mode}|{libelle}|{contexte}|{annee_focus}"
nom_fichier = f"forsides_{libelle[:30].replace(' ', '_')}"
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
        colB.download_button("⬇️ Repli : télécharger en HTML interactif",
                             data=fig.to_html(include_plotlyjs="cdn"),
                             file_name=nom_fichier + ".html", mime="text/html",
                             use_container_width=True)
        st.caption("Le composant d'image (kaleido) a échoué — le fichier HTML s'ouvre dans "
                   "le navigateur et se capture d'écran très bien.")
else:
    colA.download_button("⬇️ Télécharger (HTML interactif)",
                         data=fig.to_html(include_plotlyjs="cdn"),
                         file_name=nom_fichier + ".html", mime="text/html",
                         use_container_width=True)
    colB.caption("Pour l'export PNG direct : fermez l'outil et relancez "
                 "**lancer_outil_patho.bat** — il installe le composant manquant (kaleido). "
                 "En attendant, le HTML interactif s'ouvre dans le navigateur.")