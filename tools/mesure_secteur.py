# -*- coding: utf-8 -*-
"""
Etape A de la mission « variables d'etablissement » : MESURER, avant de
reconstruire quoi que ce soit.

Ce que ce script cherche a savoir
---------------------------------
L'etude hospitalisation du depot (docs/ETUDE_HOSPITALISATION_PAR_POSTE.md)
repose sur une affirmation empruntee a la documentation du SNDS, jamais
verifiee sur les donnees : les sejours des hopitaux publics ne seraient pas
dans Open DAMIR, parce qu'ils sont finances par dotation et non factures
patient par patient ; seuls les actes et consultations externes du public y
figureraient. Ce script transforme cette deduction en chiffre.

Il lit UN fichier mensuel source (A_AAAAMM.csv.gz), en lecture seule, et
n'ecrit rien sur le disque. Un mois suffit pour lire une structure — pas
pour conclure sur un niveau annuel, et la sortie le rappelle.

Les quatre variables mesurees, absentes des cubes du depot
----------------------------------------------------------
PRS_PPU_SEC   secteur public / prive            1 public · 2 prive · 9 inconnue
ETE_TYP_SNDS  type d'etablissement executant    0 ambulatoire liberal · 1 public ·
                                                2 PSPH · 3 ex-PJP opte BG ·
                                                4 prive lucratif · 6 prive non
                                                lucratif · 99 inconnue
MDT_TYP_COD   mode de traitement                1 sejourne · 2 externe ·
                                                3 domicile · 9 sans objet
ETE_IND_TAA   indicateur TAA prive / public     0 hors TAA · 1 TAA publique ·
                                                2 TAA prive · 8 non transmis ·
                                                9 inconnue

ETE_IND_TAA est la variable de reference pour la question posee : le
descriptif officiel dit qu'elle « permet de cibler les prestations en
facturation directe a l'Assurance maladie : Actes et Consultations Externes.
Pour les cibler, il faut prendre l'indicateur TAA public. »

CPT_ENV_TYP (l'enveloppe ONDAM) ne sert PAS ici : son enveloppe 2 melange
« les versements aux etablissements de sante publics, prives et
medico-sociaux ». Elle ne separe pas public et prive — c'est un piege.

Les deux montants retenus
-------------------------
Ils sont ceux du cube, pour que les chiffres d'ici se comparent a ceux de
l'application : le rembourse est PRS_REM_MNT, la depense est FLT_PAI_MNT
(la variante prefiltree, celle que l'ingestion retient). Voir
construire_cube.py dans le dossier Annee_Damir.

Usage
-----
    app/backend/.venv/Scripts/python.exe tools/mesure_secteur.py <chemin .csv.gz>
"""
import os
import sys
import time

import duckdb

# ─────────────────────────────────────────────── ce qu'on attend du fichier
# Le script ne suppose aucun nom : il compare cette liste a ce qu'il trouve
# et s'arrete si une colonne manque, plutot que de mesurer a cote.
COLONNES_ATTENDUES = [
    "SOI_ANN", "SOI_MOI", "PRS_NAT",
    "PRS_PPU_SEC", "ETE_TYP_SNDS", "MDT_TYP_COD", "ETE_IND_TAA",
    "PRS_REM_MNT", "FLT_PAI_MNT",
]

# Les montants sont lus en DOUBLE explicitement : le sniffeur de duckdb ne voit
# qu'un echantillon, et une colonne de montants prise pour du texte fausserait
# tout en silence.
TYPES = {
    "PRS_REM_MNT": "DOUBLE",
    "PRS_REM_BSE": "DOUBLE",
    "FLT_PAI_MNT": "DOUBLE",
    "FLT_DEP_MNT": "DOUBLE",
    "PRS_DEP_MNT": "DOUBLE",
    "PRS_PAI_MNT": "DOUBLE",
}

LIB_PPU_SEC = {"1": "Public", "2": "Prive", "9": "Inconnue"}
LIB_ETE_TYP = {
    "0": "Ambulatoire, secteur liberal",
    "1": "Public proprement dit",
    "2": "PSPH (prive non lucratif, service public hospitalier)",
    "3": "Ex-PJP ayant opte pour le budget global",
    "4": "Prive lucratif",
    "6": "Prive non lucratif",
    "99": "Inconnue",
}
LIB_MDT_TYP = {
    "1": "Sejourne",
    "2": "Consultation externe",
    "3": "Domicile",
    "9": "Sans objet",
}
LIB_ETE_TAA = {
    "0": "Hors TAA",
    "1": "TAA publique",
    "2": "TAA prive",
    "8": "Non transmis",
    "9": "Inconnue",
}

TRANSCO = os.path.join("data", "prs_nat_transco.csv")


# ──────────────────────────────────────────────────────────── mise en forme
def euros(x):
    """Un montant en millions d'euros."""
    if x is None:
        return "—"
    return f"{x / 1e6:,.1f}".replace(",", " ") + " M"


def pct(part, total):
    """Une part. Sans denominateur, la part n'existe pas : elle reste absente."""
    if total in (None, 0):
        return "—"
    return f"{100.0 * part / total:5.1f} %"


def entier(n):
    return f"{n:,}".replace(",", " ")


def titre(texte):
    print()
    print(texte)
    print("-" * len(texte))


def table(lignes, entetes, alignements=None):
    """Imprime un tableau texte aux colonnes alignees."""
    if not lignes:
        print("(aucune ligne)")
        return
    cols = list(zip(*([entetes] + lignes)))
    largeurs = [max(len(str(c)) for c in col) for col in cols]
    alignements = alignements or ["<"] + [">"] * (len(entetes) - 1)

    def ligne(vals):
        return "  ".join(
            f"{str(v):{a}{w}}" for v, a, w in zip(vals, alignements, largeurs)
        )

    print(ligne(entetes))
    print("  ".join("-" * w for w in largeurs))
    for l in lignes:
        print(ligne(l))


# ────────────────────────────────────────────────────────────────── mesures
def modalites(con, colonne, libelles, total_rem, total_dep):
    """Repartition d'une variable : montants et parts, modalite par modalite."""
    rows = con.execute(f"""
        SELECT {colonne} AS code, sum(rem) AS rem, sum(dep) AS dep, sum(nb) AS nb
        FROM agg GROUP BY 1 ORDER BY 3 DESC NULLS LAST
    """).fetchall()
    lignes = []
    for code, rem, dep, nb in rows:
        cle = "" if code is None else str(code).strip()
        lignes.append([
            cle or "(vide)",
            libelles.get(cle, "— modalite hors descriptif —"),
            euros(rem), pct(rem, total_rem),
            euros(dep), pct(dep, total_dep),
            entier(nb),
        ])
    table(lignes,
          ["Code", "Libelle", "Rembourse", "Part", "Depense", "Part", "Lignes"],
          ["<", "<", ">", ">", ">", ">", ">"])


def croisement_secteur(con, where, libelle_groupe, colonne_groupe):
    """Un croisement « groupe x secteur public/prive/inconnu », en euros et en %."""
    rows = con.execute(f"""
        SELECT {colonne_groupe} AS g,
               sum(CASE WHEN sec = '1' THEN dep END) AS pub,
               sum(CASE WHEN sec = '2' THEN dep END) AS pri,
               sum(CASE WHEN sec IS NULL OR sec NOT IN ('1','2') THEN dep END) AS inc,
               sum(dep) AS tot
        FROM agg WHERE {where}
        GROUP BY 1 ORDER BY 5 DESC NULLS LAST
    """).fetchall()
    lignes = []
    for g, pub, pri, inc, tot in rows:
        lignes.append([
            g or "(hors nomenclature)",
            euros(tot), euros(pub), pct(pub or 0, tot),
            euros(pri), pct(pri or 0, tot),
            euros(inc), pct(inc or 0, tot),
        ])
    table(lignes,
          [libelle_groupe, "Depense", "Public", "%", "Prive", "%", "Inconnu", "%"],
          ["<", ">", ">", ">", ">", ">", ">", ">"])


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    fichier = sys.argv[1]
    if not os.path.exists(fichier):
        print(f"Fichier introuvable : {fichier}")
        sys.exit(2)
    if not os.path.exists(TRANSCO):
        print(f"Nomenclature introuvable : {TRANSCO}")
        print("Lancer le script depuis la racine du depot.")
        sys.exit(2)

    debut = time.time()
    con = duckdb.connect()
    con.execute("PRAGMA threads=4")
    con.execute("SET preserve_insertion_order=false")

    chemin = fichier.replace("\\", "/")
    types_sql = ", ".join(f"'{k}': '{v}'" for k, v in TYPES.items())
    lecture = (f"read_csv('{chemin}', delim=';', header=true, "
               f"types={{{types_sql}}}, ignore_errors=false)")

    # 1 ─ les colonnes reellement presentes, avant tout traitement
    titre("1 · Colonnes du fichier source")
    print(f"Fichier : {fichier}")
    print(f"Taille  : {entier(round(os.path.getsize(fichier) / 1e6))} Mo compresses")
    trouvees = [r[0] for r in con.execute(
        f"DESCRIBE SELECT * FROM {lecture} LIMIT 0").fetchall()]
    print(f"{len(trouvees)} colonnes trouvees :")
    print("  " + ", ".join(trouvees))
    manquantes = [c for c in COLONNES_ATTENDUES if c not in trouvees]
    if manquantes:
        print()
        print("ARRET — colonnes attendues absentes : " + ", ".join(manquantes))
        print("Les noms du fichier ne correspondent pas a ceux du descriptif.")
        sys.exit(1)
    print("Les neuf colonnes necessaires sont presentes, aux noms attendus.")

    # 2 ─ une seule passe sur le fichier : tout le reste derive de cet agregat
    print()
    print("Lecture du fichier (une seule passe)...")
    con.execute(f"""
        CREATE TEMP TABLE brut AS
        SELECT CAST(PRS_NAT AS VARCHAR)      AS prs_nat,
               CAST(PRS_PPU_SEC AS VARCHAR)  AS sec,
               CAST(ETE_TYP_SNDS AS VARCHAR) AS ete_typ,
               CAST(MDT_TYP_COD AS VARCHAR)  AS mdt,
               CAST(ETE_IND_TAA AS VARCHAR)  AS taa,
               CAST(SOI_ANN AS VARCHAR)      AS soi_ann,
               CAST(SOI_MOI AS VARCHAR)      AS soi_moi,
               sum(PRS_REM_MNT)              AS rem,
               sum(FLT_PAI_MNT)              AS dep,
               count(*)                      AS nb
        FROM {lecture}
        GROUP BY ALL
    """)
    con.execute(f"""
        CREATE TEMP TABLE transco AS
        SELECT CAST(PRS_NAT AS VARCHAR) AS prs_nat, grand_poste, poste
        FROM read_csv('{TRANSCO.replace(chr(92), '/')}', delim=';', header=true,
                      all_varchar=true)
    """)
    con.execute("""
        CREATE TEMP TABLE agg AS
        SELECT b.*, t.grand_poste, t.poste
        FROM brut b LEFT JOIN transco t USING (prs_nat)
    """)

    total_rem, total_dep, total_nb = con.execute(
        "SELECT sum(rem), sum(dep), sum(nb) FROM agg").fetchone()
    mois = con.execute("""
        SELECT soi_ann, soi_moi, sum(dep) FROM agg
        GROUP BY 1, 2 ORDER BY 3 DESC NULLS LAST LIMIT 3
    """).fetchall()

    print(f"{entier(total_nb)} lignes lues en {time.time() - debut:.0f} s")
    print("Mois de soins les plus presents dans le flux :")
    for a, m, d in mois:
        print(f"  {a}-{m} : {euros(d)} ({pct(d, total_dep)})")
    print(f"Total du mois — rembourse {euros(total_rem)} · depense {euros(total_dep)}")

    # 3 ─ les quatre variables, modalite par modalite
    titre("2 · PRS_PPU_SEC — secteur public / prive")
    modalites(con, "sec", LIB_PPU_SEC, total_rem, total_dep)
    titre("2b · ETE_TYP_SNDS — type d'etablissement executant")
    modalites(con, "ete_typ", LIB_ETE_TYP, total_rem, total_dep)
    titre("2c · MDT_TYP_COD — mode de traitement")
    modalites(con, "mdt", LIB_MDT_TYP, total_rem, total_dep)
    titre("2d · ETE_IND_TAA — indicateur TAA (la variable de reference)")
    modalites(con, "taa", LIB_ETE_TAA, total_rem, total_dep)

    # 4 ─ grand poste x secteur
    titre("3 · Grand poste x secteur (depense)")
    croisement_secteur(con, "TRUE", "Grand poste", "grand_poste")

    # 5 ─ le tableau que le client attend : l'hospitalisation, poste par poste
    titre("4 · Hospitalisation, poste par poste x secteur (depense)")
    croisement_secteur(con, "grand_poste = 'Hospitalisation'", "Poste", "poste")

    # 6 ─ le test decisif : du public, qu'est-ce qui est sejour et qu'est-ce
    #     qui est consultation externe ?
    titre("5 · Secteur x mode de traitement (depense) — le test decisif")
    rows = con.execute("""
        SELECT sec, mdt, sum(dep) AS dep, sum(rem) AS rem
        FROM agg GROUP BY 1, 2 ORDER BY 1, 3 DESC NULLS LAST
    """).fetchall()
    lignes = []
    for sec, mdt, dep, rem in rows:
        s = (sec or "").strip()
        m = (mdt or "").strip()
        lignes.append([
            f"{s} · {LIB_PPU_SEC.get(s, '?')}",
            f"{m} · {LIB_MDT_TYP.get(m, '?')}",
            euros(dep), pct(dep or 0, total_dep), euros(rem),
        ])
    table(lignes,
          ["Secteur", "Mode de traitement", "Depense", "Part du mois", "Rembourse"],
          ["<", "<", ">", ">", ">"])

    titre("6 · Le meme croisement, restreint a l'Hospitalisation")
    rows = con.execute("""
        SELECT sec, mdt, sum(dep) AS dep
        FROM agg WHERE grand_poste = 'Hospitalisation'
        GROUP BY 1, 2 ORDER BY 1, 3 DESC NULLS LAST
    """).fetchall()
    tot_hosp = sum(r[2] or 0 for r in rows)
    lignes = []
    for sec, mdt, dep in rows:
        s = (sec or "").strip()
        m = (mdt or "").strip()
        lignes.append([
            f"{s} · {LIB_PPU_SEC.get(s, '?')}",
            f"{m} · {LIB_MDT_TYP.get(m, '?')}",
            euros(dep), pct(dep or 0, tot_hosp),
        ])
    table(lignes,
          ["Secteur", "Mode de traitement", "Depense", "Part de l'hospitalisation"],
          ["<", "<", ">", ">"])

    # 7 ─ recoupement : TAA publique x mode de traitement. Si l'affirmation de
    #     l'etude est exacte, la TAA publique doit etre presque entierement en
    #     consultation externe.
    titre("7 · TAA publique x mode de traitement — recoupement")
    rows = con.execute("""
        SELECT mdt, sum(dep) AS dep
        FROM agg WHERE taa = '1' GROUP BY 1 ORDER BY 2 DESC NULLS LAST
    """).fetchall()
    tot_taa = sum(r[1] or 0 for r in rows)
    lignes = [[f"{(m or '').strip()} · {LIB_MDT_TYP.get((m or '').strip(), '?')}",
               euros(d), pct(d or 0, tot_taa)] for m, d in rows]
    table(lignes, ["Mode de traitement", "Depense", "Part de la TAA publique"],
          ["<", ">", ">"])

    print()
    print("=" * 78)
    print(f"Mesure faite sur UN SEUL MOIS : {os.path.basename(fichier)}.")
    print("Une structure se lit sur un mois ; un niveau annuel ne s'en deduit pas.")
    print("Aucun fichier n'a ete ecrit.")
    print(f"Duree totale : {time.time() - debut:.0f} s")


if __name__ == "__main__":
    main()
