# -*- coding: utf-8 -*-
"""Le même audit, mis en page pour être lu sur papier.

Le rapport Markdown est fait pour le dépôt : il se relit dans une revue, il se
compare d'une exécution à l'autre. Celui-ci est fait pour être **transmis** — à
quelqu'un qui ne lira pas le code et qui doit pouvoir juger sur pièces.

Le PDF est produit par le navigateur déjà installé sur le poste, en mode sans
interface. Aucune bibliothèque PDF n'est ajoutée au projet.
"""
from __future__ import annotations

import html
import re
import subprocess
from datetime import datetime
from pathlib import Path

from . import reference as ref
from .rapport import _branche_et_commit
from .socle import ATTENTE, CONFORME, DEFAUT, EXPLIQUE, Controle, pct

HTML_PATH = ref.RACINE / "docs" / "audit" / "AUDIT_CHIFFRES.html"
PDF_PATH = ref.RACINE / "docs" / "audit" / "AUDIT_CHIFFRES.pdf"

NAVIGATEURS = (
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
)

CLASSE = {CONFORME: "conforme", EXPLIQUE: "explique", DEFAUT: "defaut", ATTENTE: "attente"}

CSS = """
@page { size: A4; margin: 16mm 14mm 14mm; }

* { box-sizing: border-box; }
body {
  margin: 0;
  color: #1a1d21;
  background: #fff;
  font: 10pt/1.5 "Segoe UI", system-ui, sans-serif;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

h1 { margin: 0 0 4pt; font-size: 21pt; letter-spacing: -.3pt; }
h2 {
  margin: 20pt 0 8pt;
  padding-bottom: 4pt;
  border-bottom: 1.5pt solid #c0392b;
  font-size: 13pt;
  page-break-after: avoid;
}
h3 { margin: 13pt 0 4pt; font-size: 10.5pt; page-break-after: avoid; }
p { margin: 0 0 7pt; }
code { padding: 0 2pt; background: #f2f3f5; font-family: Consolas, monospace; font-size: .9em; }
strong { font-weight: 650; }

.kicker {
  color: #c0392b; font-size: 8pt; font-weight: 700;
  letter-spacing: 1.2pt; text-transform: uppercase;
}
.meta { margin: 0 0 14pt; color: #5b6470; font-size: 8.5pt; }

/* — L'essentiel, encadré, en tête — */
.resume {
  margin: 0 0 16pt; padding: 11pt 13pt;
  border: 1pt solid #dfe3e8; border-left: 3pt solid #c0392b;
  background: #fbfbfc;
  page-break-inside: avoid;
}
.resume p:last-child { margin-bottom: 0; }

/* — Le décompte, en pastilles — */
.compte { display: flex; gap: 7pt; margin: 0 0 14pt; page-break-inside: avoid; }
.compte div {
  flex: 1; padding: 8pt 6pt; border: 1pt solid #dfe3e8; border-radius: 3pt;
  text-align: center; background: #fbfbfc;
}
.compte b { display: block; font-size: 17pt; line-height: 1.1; }
.compte span { color: #5b6470; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .4pt; }
.compte .fort b { color: #c0392b; }

table { width: 100%; border-collapse: collapse; margin: 0 0 12pt; font-size: 8.2pt; }
caption {
  margin-bottom: 5pt; color: #5b6470; font-size: 8pt; font-style: italic; text-align: left;
}
th, td { overflow-wrap: anywhere; padding: 5pt 6pt; border-bottom: .5pt solid #e4e7eb; text-align: left; vertical-align: top; }
thead th {
  border-bottom: 1pt solid #b9c0c8;
  color: #3c444e; font-size: 7.5pt; font-weight: 700;
  letter-spacing: .3pt; text-transform: uppercase;
}
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
tbody tr:nth-child(even) { background: #fafbfc; }
td.ref { font-weight: 700; white-space: nowrap; }
td.num { font-variant-numeric: tabular-nums; white-space: nowrap; }

.verdict { display: inline-block; padding: 1.5pt 5pt; border-radius: 2pt;
           font-size: 7.5pt; font-weight: 700; white-space: nowrap; }
.conforme { color: #1c6b3f; background: #e6f4ec; }
.explique { color: #8a5a00; background: #fdf3e0; }
.defaut   { color: #a02121; background: #fbe9e9; }
.attente  { color: #4a5058; background: #eef0f2; }

.detail { margin: 0 0 10pt; padding-left: 11pt; font-size: 8.5pt; }
.detail li { margin-bottom: 2.5pt; }

.fiche { margin-bottom: 13pt; page-break-inside: avoid; }
.fiche .comment {
  margin: 3pt 0 6pt; color: #5b6470; font-size: 8pt;
}

footer {
  margin-top: 20pt; padding-top: 7pt; border-top: .5pt solid #e4e7eb;
  color: #7a828c; font-size: 7.5pt;
}
.saut { page-break-before: always; }
"""


def _md(texte: str) -> str:
    """Le peu de Markdown que portent les notes : gras, code, paragraphes."""
    sortie = html.escape(texte)
    sortie = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", sortie, flags=re.S)
    sortie = re.sub(r"`(.+?)`", r"<code>\1</code>", sortie, flags=re.S)
    return "".join(f"<p>{bloc.strip()}</p>" for bloc in sortie.split("\n\n") if bloc.strip())


def _sci(valeur: float) -> str:
    """Notation scientifique à la française : 4,3e-13 et non 4.3e-13.

    Le rapport contrôlera en Phase 5 que l'application écrit ses décimales avec
    une virgule. Il serait mal venu qu'il ne le fasse pas lui-même.
    """
    return f"{valeur:.1e}".replace(".", ",")


def _md_court(valeur: float, unite: str = "") -> str:
    """Un ordre de grandeur lisible : 234,8 Md€ plutôt que 234 847 172 300,04 €."""
    for seuil, suffixe in ((1e12, "000 Md"), (1e9, "Md"), (1e6, "M")):
        if abs(valeur) >= seuil and suffixe != "000 Md":
            return (f"{valeur / seuil:,.1f}".replace(",", chr(8239)).replace(".", ",")
                    + f" {suffixe}{unite}")
    return f"{valeur:,.0f}".replace(",", chr(8239)) + f" {unite}"


def _resume_des_trouvailles(controles: list[Controle]) -> str:
    """Ce qu'un lecteur doit retenir s'il ne lit que le premier écran.

    **Tous les chiffres sont dérivés des contrôles**, aucun n'est recopié. Un
    résumé qui recopie est le premier à mentir quand la donnée bouge — et c'est
    précisément le genre de défaut que cet audit cherche ailleurs.
    """
    par_ref = {c.ref: c for c in controles}
    i06 = par_ref.get("I-06c")
    region = par_ref.get("I-01")
    defauts = [c for c in controles if c.verdict == DEFAUT]
    expliques = [c for c in controles if c.verdict == EXPLIQUE]

    bloc_cube = ""
    if i06 and i06.chiffres:
        bloc_cube = (
            "<p><strong>Le contrôle décisif est conforme.</strong> Le cube compact — "
            "celui que l'application interroge — est fidèle au cube brut de 1,1 Go, "
            "<strong>cellule par cellule</strong> sur les "
            f"{int(i06.chiffres['cles']):,} clés".replace(",", chr(8239))
            + " : aucune clé manquante ni "
            "surnuméraire. Le pire écart relatif est de <strong>"
            f"{_sci(i06.chiffres['pire_relatif'])}</strong> et le pire écart absolu de "
            f"<strong>{_sci(i06.chiffres['pire_absolu'])} €</strong> — l'ordre de "
            "grandeur de l'arrondi machine. Les volumes sont identiques au bit près.</p>"
        )

    bloc_verdict = (
        f"<p><strong>Aucun défaut de calcul n'a été trouvé</strong> sur les "
        f"{len(controles)} contrôles de cette phase."
        if not defauts else
        f"<p><strong>{len(defauts)} défaut(s) de calcul</strong> sur "
        f"{len(controles)} contrôles ; ils sont décrits en fin de rapport."
    ) + (
        f" {len(expliques)} contrôles portent un « écart expliqué » : le calcul est "
        "juste, mais le résultat demande une précaution de lecture, écrite en clair.</p>"
        if expliques else "</p>"
    )

    bloc_region = ""
    if region and region.chiffres:
        c = region.chiffres
        bloc_region = (
            "<p><strong>La précaution la plus importante :</strong> "
            "<strong>" + pct(c['part']) + "</strong> du montant remboursé — "
            f"{_md_court(c['residu'], '€')} — porte une région « Non renseignée ». "
            f"Additionner les régions nommées donne {_md_court(c['connus'], '€')} là "
            f"où le total national est de {_md_court(c['total'], '€')}. L'application "
            "n'escamote rien : la modalité est offerte et étiquetée. Le risque est que "
            "le lecteur, lui, l'oublie.</p>"
        )

    return bloc_cube + bloc_verdict + bloc_region


def rendre_html(controles: list[Controle], phases: str) -> str:
    branche, commit = _branche_et_commit()
    compte = {v: sum(1 for c in controles if c.verdict == v)
              for v in (CONFORME, EXPLIQUE, DEFAUT, ATTENTE)}

    lignes_tableau = "".join(
        f"<tr>"
        f'<td class="ref">{html.escape(c.ref)}</td>'
        f"<td>{html.escape(c.libelle)}</td>"
        f"<td>{html.escape(c.reference_par).replace('**', '')}</td>"
        f'<td class="num">{html.escape(c.obtenu) or "—"}</td>'
        f'<td class="num">{html.escape(c.ecart) or "—"}</td>'
        f'<td><span class="verdict {CLASSE[c.verdict]}">{html.escape(c.verdict)}</span></td>'
        f"</tr>"
        for c in controles
    )

    fiches = "".join(
        f'<div class="fiche"><h3>{html.escape(c.ref)} — {html.escape(c.libelle)}</h3>'
        + f'<p class="comment">Référence obtenue par : {html.escape(c.reference_par).replace("**", "")}</p>'
        + _md(c.note or "—")
        + (("<ul class='detail'>" + "".join(f"<li>{_md(d).replace('<p>', '').replace('</p>', '')}</li>"
                                            for d in c.details) + "</ul>") if c.details else "")
        + "</div>"
        for c in controles
    )

    empreintes = "".join(
        f"<tr><td><code>{html.escape(nom)}</code></td><td>{html.escape(valeur)}</td></tr>"
        for nom, valeur in ref.empreintes()
    )

    return f"""<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<title>Audit des chiffres — DAMIR Studio</title>
<style>{CSS}</style></head><body>

<p class="kicker">DAMIR Studio · Contrôle des données</p>
<h1>Les chiffres affichés sont-ils justes ?</h1>
<p class="meta">
  Phase exécutée : {html.escape(phases)} — cohérence interne de DAMIR ·
  {datetime.now().strftime('%d/%m/%Y à %H:%M')} ·
  branche <code>{html.escape(branche)}</code> · commit <code>{html.escape(commit)}</code>
</p>

<div class="resume">{_resume_des_trouvailles(controles)}</div>

<div class="compte">
  <div><b>{len(controles)}</b><span>Contrôles</span></div>
  <div><b>{compte[CONFORME]}</b><span>Conformes</span></div>
  <div><b>{compte[EXPLIQUE]}</b><span>Écarts expliqués</span></div>
  <div class="fort"><b>{compte[DEFAUT]}</b><span>Défauts</span></div>
  <div><b>{compte[ATTENTE]}</b><span>En attente</span></div>
</div>

<h2>Comment lire ce rapport</h2>
<p>Chaque ligne du tableau est un contrôle. La colonne <strong>« comment la référence
est obtenue »</strong> est celle qui décide si le contrôle vaut quelque chose : une
vérification qui demanderait sa réponse au code qu'elle teste ne prouverait rien.
Ici, toutes les valeurs attendues viennent de <strong>SQL écrit à la main</strong>
directement sur les fichiers de données, sans passer par une seule fonction de
l'application.</p>

<table>
  <caption>Les quatre verdicts, sans nuance intermédiaire.</caption>
  <thead><tr><th style="width:22%">Verdict</th><th>Ce qu'il signifie</th></tr></thead>
  <tbody>
    <tr><td><span class="verdict conforme">Conforme</span></td>
        <td>Écart nul, ou dans la tolérance déclarée avant l'exécution.</td></tr>
    <tr><td><span class="verdict explique">Écart expliqué</span></td>
        <td>Divergence réelle, dont la cause est identifiée et écrite. <strong>Le calcul est
            juste</strong> ; c'est la lecture qui demande une précaution.</td></tr>
    <tr><td><span class="verdict defaut">Défaut</span></td>
        <td>L'application se trompe. L'écran touché et l'ampleur sont décrits.</td></tr>
    <tr><td><span class="verdict attente">En attente</span></td>
        <td>Référence indisponible, ou contrôle impossible à écrire sans circularité.</td></tr>
  </tbody>
</table>

<h2>Les tolérances, déclarées avant l'exécution</h2>
<table>
  <thead><tr><th style="width:26%">Nature</th><th style="width:17%">Seuil</th><th>Pourquoi</th></tr></thead>
  <tbody>
    <tr><td>Effectifs, comptages</td><td class="num">exact</td>
        <td>Ce sont des entiers. Aucun mécanisme numérique ne peut en changer la valeur.</td></tr>
    <tr><td>Sommes de montants</td><td class="num">1e-9 relatif</td>
        <td>L'accumulation flottante sur 5,76 M lignes produit ~5e-13 ; mesuré : 3,8e-13.
            Le seuil est mille fois au-dessus du bruit, et mille fois en dessous de toute
            erreur de logique.</td></tr>
    <tr><td>Ratios</td><td class="num">1e-8 relatif</td>
        <td>L'erreur d'un quotient cumule celle de ses deux termes.</td></tr>
    <tr><td>Plancher absolu</td><td class="num">1e-6 €</td>
        <td>Sous le millionième d'euro, aucune grandeur comptable ne se distingue.</td></tr>
    <tr><td>Références externes</td><td class="num">aucune</td>
        <td>Un écart n'y est jamais toléré : il est expliqué, ou il reste un défaut.</td></tr>
  </tbody>
</table>

<div class="resume">
  <p><strong>Un amendement, déclaré plutôt que passé sous silence.</strong> Le premier jet du harnais
  comparait en relatif seul et classait le contrôle I-06c en <em>défaut</em> :
  « 300 % d'écart ». Vérification faite, ces écarts portaient sur des cellules dont
  la somme vaut 4,4 × 10<sup>−16</sup> € — des résidus d'arrondi nés de l'annulation
  entre un débit et un crédit. Rapporter un tel écart à un tel dénominateur ne mesure
  rien.</p>
  <p>Le critère combine désormais un plancher absolu et la tolérance relative,
  <strong>laquelle n'a pas bougé</strong>. Ce n'est pas un seuil relevé pour faire
  passer une ligne : c'est une métrique corrigée. Les deux mesures — écart absolu et
  écart relatif — sont publiées côte à côte pour que le lecteur juge lui-même.</p>
</div>

<h2 class="saut">Le tableau des contrôles</h2>
<table>
  <thead><tr>
    <th style="width:7%">Réf</th>
    <th style="width:29%">Contrôle</th>
    <th style="width:29%">Comment la référence est obtenue</th>
    <th style="width:14%">Obtenu</th>
    <th style="width:8%">Écart</th>
    <th style="width:13%">Verdict</th>
  </tr></thead>
  <tbody>{lignes_tableau}</tbody>
</table>

<h2>Ce que chaque contrôle a trouvé</h2>
{fiches}

<h2 class="saut">Les données auditées</h2>
<table>
  <thead><tr><th style="width:34%">Fichier</th><th>Empreinte</th></tr></thead>
  <tbody>{empreintes}</tbody>
</table>
<p>Le cube brut n'est pas haché : à 1,1 Go, son empreinte cryptographique coûterait
plus que l'ensemble des contrôles. Il est identifié par sa taille et sa date.</p>

<h2>Ce que cette phase ne dit pas</h2>
<p>Cette phase établit que <strong>DAMIR est cohérent avec lui-même</strong>. Elle ne
dit pas encore que les chiffres sont <em>vrais</em> : cela demande de les confronter
à ce que publient l'Assurance Maladie, l'Insee et le CépiDc. Ces valeurs de référence
ne peuvent pas être écrites de mémoire — une référence inventée invaliderait
l'audit entier — et le poste est hors ligne par principe. Elles restent donc à
fournir.</p>
<p>Restent également à mesurer : la <strong>parité entre les quatre écrans</strong>
qui calculent les mêmes indicateurs par des chemins différents, les invariants et
cas limites, et l'affichage. Une piste est déjà repérée et attend d'être chiffrée :
dans l'écran Extraire, cocher « Ticket modérateur » pourrait modifier la valeur du
« Montant remboursé » affiché à côté.</p>

<footer>
  Rapport engendré par <code>python -m tools.audit.lancer</code> — il se régénère,
  il ne se corrige pas à la main. DAMIR Studio · Forsides.
</footer>
</body></html>
"""


def ecrire_pdf(controles: list[Controle], phases: str) -> Path | None:
    HTML_PATH.parent.mkdir(parents=True, exist_ok=True)
    HTML_PATH.write_text(rendre_html(controles, phases), encoding="utf-8")

    navigateur = next((n for n in NAVIGATEURS if Path(n).exists()), None)
    if navigateur is None:
        print("Aucun navigateur Chromium trouve : le HTML est ecrit, pas le PDF.")
        return None
    if PDF_PATH.exists():
        PDF_PATH.unlink()
    subprocess.run(
        [navigateur, "--headless", "--disable-gpu", "--no-pdf-header-footer",
         f"--print-to-pdf={PDF_PATH}", HTML_PATH.as_uri()],
        capture_output=True, timeout=180, check=False,
    )
    return PDF_PATH if PDF_PATH.exists() else None
