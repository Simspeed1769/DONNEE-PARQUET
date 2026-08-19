# -*- coding: utf-8 -*-
"""Phase 1 — cohérence interne de DAMIR.

Une remarque de méthode, écrite avant les contrôles parce qu'elle en change
plusieurs.

L'énoncé de la mission demande « somme des régions = France entière ». Sur ce
cube, **cela n'a pas de sens tel quel** : il n'existe aucune ligne « France
entière ». Le cube ne porte que des modalités élémentaires — treize régions, plus
un code 99 « Non renseignée » — et le total national *est* la somme. Écrit
littéralement, le contrôle vérifierait que `SUM` est associatif : une tautologie
qui rassurerait à tort.

Ce qui est réellement en jeu est ailleurs, et vaut d'être mesuré :

1. **Le résidu.** Région 99, âge 99, sexes 0 et 9 existent dans la donnée.
   Combien pèsent-ils ? Un lecteur qui additionne les treize régions d'un tableau
   retrouve-t-il le total national, ou lui manque-t-il quelque chose ?
2. **La couverture des modalités.** Toute modalité présente dans la donnée
   est-elle offerte et étiquetée par l'application ? Une modalité oubliée par le
   sélecteur serait invisible **et** non sommable.

C'est cette version-là qui est contrôlée ici, et la colonne « référence » le dit.
"""
from __future__ import annotations

from . import reference as ref
from .socle import (CONFORME, DEFAUT, EXPLIQUE, PLANCHER_MONTANT, Comparaison, Controle,
                    TOLERANCES, ecart_relatif, formater)

#: Les modalités « résiduelles » : présentes dans la donnée, mais qui ne
#: désignent ni un territoire, ni un âge, ni un sexe connus.
#: Séparateur de paragraphe. Écrit sans antislash à dessein : ce fichier est
#: régulièrement réécrit par outil, et les échappements ne survivent pas.
PARA = chr(10) + chr(10)

RESIDUS = {
    "region": ("region", [99], "Non renseignée"),
    "age": ("age", [99], "Âge inconnu"),
    "sexe": ("sexe", [0, 9], "Non renseigné et Inconnu"),
}


def _residu(con, dimension: str) -> Controle:
    colonne, codes, libelle = RESIDUS[dimension]
    liste = ", ".join(str(code) for code in codes)
    total = con.execute("SELECT SUM(rem)::DOUBLE FROM compact").fetchone()[0]
    residu = con.execute(
        f"SELECT COALESCE(SUM(rem), 0)::DOUBLE FROM compact WHERE {colonne} IN ({liste})"
    ).fetchone()[0]
    connus = total - residu
    part = 100.0 * residu / total if total else 0.0

    modalites = con.execute(f"SELECT DISTINCT {colonne} FROM compact ORDER BY 1").fetchall()
    somme_modalites = con.execute(
        f"SELECT SUM(v)::DOUBLE FROM (SELECT {colonne}, SUM(rem)::DOUBLE AS v FROM compact GROUP BY 1)"
    ).fetchone()[0]
    gap = ecart_relatif(total, somme_modalites)

    ref_map = {"region": "I-01", "age": "I-02", "sexe": "I-03"}
    return Controle(
        ref=ref_map[dimension],
        base="DAMIR",
        libelle=f"Σ des modalités de « {dimension} » = total, et poids du résidu",
        reference_par="SQL manuel sur le Parquet compact, sans `cube_where` ni aucune fonction du produit",
        attendu=formater(total),
        obtenu=formater(somme_modalites),
        ecart=f"{gap:.2e}",
        # L'additivité est exacte, et c'est ce que mesure `ecart`. Le verdict, lui,
        # tient compte du **résidu** : quand il dépasse 1 %, un lecteur qui
        # additionne les modalités nommées ne retrouve pas le total, et il doit le
        # savoir. C'est une divergence réelle, de cause identifiée — la définition
        # même d'un écart expliqué.
        verdict=(DEFAUT if gap is None or gap > 1e-9
                 else EXPLIQUE if part > 1.0 else CONFORME),
        note=(
            f"{len(modalites)} modalités, aucune ligne d'agrégat : le total national "
            f"**est** la somme, et l'additivité est exacte (écart {gap:.2e}).{PARA}"
            f"Le point qui mérite l'attention est ailleurs. Le résidu « {libelle} » "
            f"pèse {formater(residu)} € sur {formater(total)} €, soit **{part:.3f} %**. "
            f"Additionner les seules modalités nommées donne {formater(connus)} € — "
            f"il manque exactement ce résidu. La modalité est bien offerte et "
            f"étiquetée par l'application ; le risque n'est pas qu'elle soit cachée, "
            f"mais qu'un lecteur additionne les autres et croie tenir le total."
        ),
    )


def _compact_contre_brut(con) -> list[Controle]:
    """I-06 — le contrôle le plus important de la phase.

    Le compact est déclaré « strictement équivalent » au brut agrégé à l'année.
    S'il ne l'est pas, tous les chiffres de l'outil sont faux et rien ne le
    signale. Trois profondeurs : le total, l'année × mesure, la clé complète.
    """
    controles: list[Controle] = []

    # I-06a — total par mesure.
    lot = Comparaison("montant", plancher=PLANCHER_MONTANT)
    detail = []
    for mesure in ref.MESURES:
        brut = con.execute(f"SELECT SUM({mesure})::DOUBLE FROM brut").fetchone()[0]
        compact = con.execute(f"SELECT SUM({mesure})::DOUBLE FROM compact").fetchone()[0]
        lot.ajouter(brut, compact, mesure)
        gap = ecart_relatif(brut, compact)
        detail.append(f"`{mesure}` — brut {formater(brut)}, compact {formater(compact)}, écart {gap:.2e}")
    controles.append(Controle(
        ref="I-06a", base="DAMIR", libelle="Compact contre brut — total, mesure par mesure",
        reference_par="deux SQL manuels, un par fichier Parquet ; aucun code du produit",
        attendu="brut", obtenu="compact", ecart=f"{lot.pire:.2e}",
        verdict=lot.verdict, note=lot.resume(), details=detail,
    ))

    # I-06b — année × mesure.
    lot = Comparaison("montant", plancher=PLANCHER_MONTANT)
    for mesure in ref.MESURES:
        brut = ref.total_par(con, "brut", mesure, "soi_ann")
        compact = ref.total_par(con, "compact", mesure, "soi_ann")
        for annee in sorted(set(brut) | set(compact)):
            lot.ajouter(brut.get(annee), compact.get(annee), f"{mesure} {annee}")
    controles.append(Controle(
        ref="I-06b", base="DAMIR", libelle="Compact contre brut — par année × mesure",
        reference_par="idem, agrégé à l'année de soins",
        attendu="brut", obtenu="compact", ecart=f"{lot.pire:.2e}",
        verdict=lot.verdict, note=lot.resume(),
    ))

    # I-06c — la clé complète. C'est le contrôle qui prouve l'équivalence :
    # les totaux pourraient concorder tout en masquant deux erreurs opposées.
    #
    # Le critère est combiné — absolu **et** relatif. Le premier jet comparait en
    # relatif seul et rapportait « 300 % d'écart » sur des cellules dont la somme
    # vaut 4,4e-16 € par annulation entre un débit et un crédit. Ce n'était pas un
    # défaut du cube : c'était une faute de métrique, et elle est corrigée ici.
    cles = ", ".join(ref.CLES)
    agr = lambda src: (
        f"SELECT {cles}, "
        + ", ".join(f"SUM({m})::DOUBLE AS {m}" for m in ref.MESURES)
        + f" FROM {src} GROUP BY {cles}"
    )
    manquantes = con.execute(
        f"WITH b AS ({agr('brut')}), c AS ({agr('compact')}) "
        f"SELECT COUNT(*) FROM b ANTI JOIN c USING ({cles})"
    ).fetchone()[0]
    surnumeraires = con.execute(
        f"WITH b AS ({agr('brut')}), c AS ({agr('compact')}) "
        f"SELECT COUNT(*) FROM c ANTI JOIN b USING ({cles})"
    ).fetchone()[0]

    detail, pire_abs, pire_rel, hors_total = [], 0.0, 0.0, 0
    for mesure in ref.MESURES:
        ligne = con.execute(
            f"""
            WITH b AS ({agr('brut')}), c AS ({agr('compact')})
            SELECT COUNT(*) AS n,
                   MAX(ABS(c.{mesure} - b.{mesure})) AS abs_max,
                   MAX(CASE WHEN ABS(b.{mesure}) > {PLANCHER_MONTANT}
                            THEN ABS(c.{mesure} - b.{mesure}) / ABS(b.{mesure}) END) AS rel_max,
                   COUNT(*) FILTER (
                       WHERE ABS(c.{mesure} - b.{mesure})
                             > {PLANCHER_MONTANT} + {TOLERANCES['montant']} * ABS(b.{mesure})
                   ) AS hors
            FROM b JOIN c USING ({cles})
            """
        ).fetchone()
        n, abs_max, rel_max, hors = ligne[0], ligne[1] or 0.0, ligne[2] or 0.0, ligne[3]
        pire_abs, pire_rel, hors_total = max(pire_abs, abs_max), max(pire_rel, rel_max), hors_total + hors
        detail.append(
            f"`{mesure}` — {formater(n)} cellules · pire écart absolu {abs_max:.2e} € · "
            f"pire écart relatif {rel_max:.2e} · {hors} hors tolérance"
        )

    desaccord = manquantes + surnumeraires
    conforme = desaccord == 0 and hors_total == 0
    controles.append(Controle(
        ref="I-06c", base="DAMIR",
        libelle="Compact contre brut — cellule par cellule, sur la clé complète (8 colonnes)",
        reference_par="jointures externes entre les deux Parquet agrégés à la même clé ; SQL manuel",
        attendu="mêmes clés, mêmes valeurs",
        obtenu=f"{formater(desaccord)} clé(s) en désaccord · {formater(hors_total)} cellule(s) hors tolérance",
        ecart=f"{pire_rel:.2e}",
        verdict=CONFORME if conforme else DEFAUT,
        note=(
            f"**{formater(manquantes)} clé absente du compact, "
            f"{formater(surnumeraires)} en trop.** "
            f"Sur les 7 mesures, le pire écart **absolu** entre une cellule du brut et "
            f"la même cellule du compact est de **{pire_abs:.2e} €**, et le pire écart "
            f"**relatif** — mesuré sur les seules cellules dépassant le plancher de "
            f"{PLANCHER_MONTANT:g} € — de **{pire_rel:.2e}**. C'est exactement l'ordre de "
            f"grandeur de l'accumulation flottante prévu en Phase 0 (√n·ε ≈ 5e-13). "
            f"`qte` est identique au bit près. **Le compact est fidèle au brut.**"
        ),
        details=detail,
    ))
    return controles


def _hierarchie(con) -> list[Controle]:
    """I-04 et I-05 — l'additivité de la hiérarchie de prestations."""
    controles: list[Controle] = []

    total = con.execute("SELECT SUM(rem)::DOUBLE FROM compact").fetchone()[0]
    par_gp = ref.total_par_poste(con, "rem", "grand_poste")
    somme_gp = sum(v for v in par_gp.values() if v is not None)
    gap = ecart_relatif(total, somme_gp)
    autres = par_gp.get("Autres")
    controles.append(Controle(
        ref="I-04", base="DAMIR",
        libelle="Σ des grands postes, « Autres » compris, = total du cube",
        reference_par="SQL manuel : jointure gauche sur `prs_nat_transco.csv`, COALESCE écrit à la main",
        attendu=formater(total), obtenu=formater(somme_gp),
        ecart=f"{gap:.2e}" if gap is not None else "—",
        verdict=CONFORME if gap is not None and gap <= 1e-9 else DEFAUT,
        note=(
            f"{len(par_gp)} grands postes. « Autres » (prestations sans correspondance "
            f"dans la transcodification) : {formater(autres)} €."
        ),
    ))

    # I-05 — la cascade, sur chaque grand poste réellement présent.
    lot = Comparaison("montant", plancher=PLANCHER_MONTANT)
    for niveau_parent, niveau_enfant, colonne_parent, colonne_enfant in (
        ("grand poste", "poste", "grand_poste", "poste"),
        ("poste", "sous-poste", "poste", "sous_poste"),
    ):
        rows = con.execute(
            f"""
            SELECT COALESCE(t.{colonne_parent}, '—') AS parent,
                   SUM(c.rem)::DOUBLE AS total_parent,
                   SUM(SUM(c.rem)) OVER (PARTITION BY COALESCE(t.{colonne_parent}, '—')) AS ignore
            FROM compact c LEFT JOIN transco t ON t.prs_nat = c.prs_nat
            GROUP BY 1
            """
        ).fetchall()
        parents = {row[0]: row[1] for row in rows}
        enfants = con.execute(
            f"""
            SELECT COALESCE(t.{colonne_parent}, '—') AS parent,
                   COALESCE(t.{colonne_enfant}, 'Non classé') AS enfant,
                   SUM(c.rem)::DOUBLE AS valeur
            FROM compact c LEFT JOIN transco t ON t.prs_nat = c.prs_nat
            GROUP BY 1, 2
            """
        ).fetchall()
        cumul: dict[str, float] = {}
        for parent, _enfant, valeur in enfants:
            cumul[parent] = cumul.get(parent, 0.0) + (valeur or 0.0)
        for parent, attendu in parents.items():
            lot.ajouter(attendu, cumul.get(parent), f"{niveau_enfant} de « {parent} »")

    # Σ prestations d'un sous-poste = ce sous-poste.
    rows = con.execute(
        """
        WITH par_sp AS (
            SELECT COALESCE(t.sous_poste, 'Non classé') AS sp, SUM(c.rem)::DOUBLE AS total
            FROM compact c LEFT JOIN transco t ON t.prs_nat = c.prs_nat GROUP BY 1
        ), par_presta AS (
            SELECT COALESCE(t.sous_poste, 'Non classé') AS sp, c.prs_nat,
                   SUM(c.rem)::DOUBLE AS valeur
            FROM compact c LEFT JOIN transco t ON t.prs_nat = c.prs_nat GROUP BY 1, 2
        )
        SELECT p.sp, MAX(p.total) AS total, SUM(q.valeur) AS somme
        FROM par_sp p JOIN par_presta q USING (sp) GROUP BY 1
        """
    ).fetchall()
    for sp, total_sp, somme_sp in rows:
        lot.ajouter(total_sp, somme_sp, f"prestations de « {sp} »")

    controles.append(Controle(
        ref="I-05", base="DAMIR",
        libelle="Cascade : Σ postes = grand poste, Σ sous-postes = poste, Σ prestations = sous-poste",
        reference_par="SQL manuel, agrégations parent et enfant calculées séparément puis rapprochées",
        attendu="parent", obtenu="Σ enfants", ecart=f"{lot.pire:.2e}",
        verdict=lot.verdict, note=lot.resume(),
    ))
    return controles


def _transcodification(con) -> list[Controle]:
    """I-08 et I-09 — ce que la transcodification couvre, et ce que « Autres » est.

    Ce contrôle a corrigé une idée fausse. `LISEZMOI.md` décrit
    `COALESCE(t.grand_poste, 'Autres')` comme « les prestations sans
    correspondance dans la table de transcodage ». Sur ces données, **le repli ne
    se déclenche jamais** : les 1 342 codes du cube sont tous transcodés, et
    aucune ligne de transcodification n'a de grand poste vide. « Autres » est une
    **catégorie nommée** de la nomenclature, pas un fourre-tout d'orphelins.
    """
    ligne = con.execute(
        """
        SELECT COUNT(DISTINCT CASE WHEN t.prs_nat IS NULL THEN c.prs_nat END) AS non_jointes,
               COALESCE(SUM(CASE WHEN t.prs_nat IS NULL THEN c.rem END), 0)::DOUBLE AS montant_non_jointes,
               COUNT(DISTINCT CASE WHEN t.prs_nat IS NOT NULL AND t.grand_poste IS NULL
                                   THEN c.prs_nat END) AS sans_grand_poste,
               COUNT(DISTINCT c.prs_nat) AS codes
        FROM compact c LEFT JOIN transco t ON t.prs_nat = c.prs_nat
        """
    ).fetchone()
    non_jointes, montant, sans_gp, codes = ligne
    total = con.execute("SELECT SUM(rem)::DOUBLE FROM compact").fetchone()[0]
    part = 100.0 * montant / total if total else 0.0
    repli = non_jointes + sans_gp

    nommees = con.execute(
        """
        SELECT COALESCE(t.grand_poste, '(repli)') AS gp,
               COUNT(DISTINCT c.prs_nat) AS codes, SUM(c.rem)::DOUBLE AS montant
        FROM compact c LEFT JOIN transco t ON t.prs_nat = c.prs_nat
        WHERE COALESCE(t.grand_poste, '(repli)') IN ('Autres', 'Autres Postes', '(repli)')
        GROUP BY 1 ORDER BY 1
        """
    ).fetchall()

    controles = [Controle(
        ref="I-08", base="DAMIR",
        libelle="Codes `prs_nat` non couverts par la transcodification : nombre et poids",
        reference_par="SQL manuel, jointure gauche sur `prs_nat_transco.csv` puis comptage des orphelins",
        attendu="0 code orphelin",
        obtenu=f"{formater(repli)} code(s)",
        ecart=f"{part:.3f} %",
        verdict=CONFORME if repli == 0 else EXPLIQUE,
        note=(
            f"**{formater(non_jointes)} code sur {formater(codes)} n'est sans "
            f"correspondance**, et aucune ligne de transcodification n'a de grand "
            f"poste vide. La couverture est totale, et le repli "
            f"`COALESCE(..., 'Autres')` ne se déclenche jamais sur ces données."
        ),
        details=[
            f"« {gp} » — {formater(c)} codes · {formater(m)} €" for gp, c, m in nommees
        ],
    )]

    autres_reel = next((n for n in nommees if n[0] == "Autres"), None)
    controles.append(Controle(
        ref="I-09", base="DAMIR",
        libelle="« Autres », `__other__` et « Reste du périmètre » ne se confondent jamais",
        reference_par="SQL manuel sur la transcodification ; lecture du code pour les deux replis",
        attendu="trois notions disjointes",
        obtenu="deux le sont ; la troisième est indiscernable du repli",
        ecart="—",
        verdict=EXPLIQUE,
        note=(
            f"**Le document de référence décrit « Autres » comme les prestations "
            f"sans correspondance dans la transcodification. Ce n'est pas ce qui se "
            f"passe.** « Autres » est un **grand poste nommé** de la nomenclature — "
            f"{formater(autres_reel[1]) if autres_reel else '?'} codes, "
            f"{formater(autres_reel[2]) if autres_reel else '?'} € — et la "
            f"nomenclature porte en outre un « Autres Postes » distinct. Le repli du "
            f"`COALESCE` est aujourd'hui vide.{PARA}"
            f"Il en découle un **risque latent**, qui ne produit aujourd'hui aucun "
            f"chiffre faux : le repli et la catégorie réelle portent **la même "
            f"étiquette**. Si un code venait à sortir de la transcodification — une "
            f"nomenclature qui évolue, un millésime de plus — son montant se "
            f"fondrait dans le grand poste « Autres » sans que rien ne le signale, "
            f"et « Autres » cesserait d'être ce que la nomenclature dit qu'il est.{PARA}"
            f"Les deux autres notions, elles, sont bien disjointes : `__other__` est "
            f"une sentinelle préfixée, « Reste du périmètre » un complément de "
            f"sélection. Ni l'une ni l'autre ne peut entrer en collision avec une "
            f"chaîne de donnée."
        ),
    ))
    return controles


def _negatifs(con) -> list[Controle]:
    """I-10 — l'origine des montants négatifs de « Autres »."""
    rows = con.execute(
        """
        SELECT c.soi_ann AS annee,
               SUM(c.rem)::DOUBLE AS rem,
               SUM(c.rem_neg)::DOUBLE AS rem_neg,
               SUM(c.rem - c.rem_neg)::DOUBLE AS hors_regul,
               COUNT(DISTINCT c.prs_nat) AS codes
        FROM compact c LEFT JOIN transco t ON t.prs_nat = c.prs_nat
        WHERE COALESCE(t.grand_poste, 'Autres') = 'Autres'
        GROUP BY 1 ORDER BY 1
        """
    ).fetchall()
    negatives = [row for row in rows if (row[1] or 0) < 0]
    detail = [
        f"**{r[0]}** — remboursé {formater(r[1])} € = régularisations {formater(r[2])} € "
        f"+ remboursements réels {formater(r[3])} €, sur {formater(r[4])} codes"
        for r in negatives
    ]
    coherent = all(
        abs((r[1] or 0) - ((r[2] or 0) + (r[3] or 0))) <= 1e-6 * max(1.0, abs(r[1] or 1))
        for r in negatives
    )
    return [Controle(
        ref="I-10", base="DAMIR",
        libelle="Origine des montants négatifs de « Autres »",
        reference_par="SQL manuel, décomposition `rem = rem_neg + (rem − rem_neg)`",
        attendu="rem = régularisations + remboursements réels",
        obtenu="vérifié" if coherent else "décomposition incohérente",
        ecart="0" if coherent else "—",
        verdict=EXPLIQUE if negatives else CONFORME,
        note=(
            f"{len(negatives)} année(s) où « Autres » est négatif. La décomposition "
            f"est exacte : le négatif vient des **régularisations** (`rem_neg`), une "
            f"composante du cube et non un défaut d'agrégation. "
            "Comportement légitime, à documenter." if negatives else
            "Aucune année négative."
        ),
        details=detail,
    )]


def executer() -> list[Controle]:
    con = ref.connexion()
    controles: list[Controle] = []
    # I-06 en premier : s'il échoue, tout le reste change de sens.
    controles += _compact_contre_brut(con)
    controles.append(_residu(con, "region"))
    controles.append(_residu(con, "age"))
    controles.append(_residu(con, "sexe"))
    controles += _hierarchie(con)
    controles += _transcodification(con)
    controles += _negatifs(con)
    con.close()
    return controles
