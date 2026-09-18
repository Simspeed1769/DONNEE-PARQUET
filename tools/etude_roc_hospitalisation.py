"""Étude hospitalisation 2022-2025 : survenance, année de règlement AMO, maturité.

Depuis la racine : app/backend/.venv/Scripts/python.exe tools/etude_roc_hospitalisation.py
Lecture seule. Imprime une note Markdown ; `--json` imprime les valeurs brutes (euros).

Chaque bloc est aligné sur un écran ou une méthode de l'outil :
- A. survenance (année de soins) : `extraction_preview`, le moteur de l'écran Extraire ;
- B. année de règlement AMO : `time_basis`, la lecture « Comparer les deux » du Panorama,
     complétée par la décomposition des règlements de l'année selon l'année des soins, par
     la dépense et le reste après AMO en année de règlement **déduits** (AMO de règlement ÷
     part AMO de survenance) et, si les tranches annuelles de flux `cube_parts3/` sont
     présentes, par leurs valeurs réelles, qui contrôlent la déduction ;
- C. 2025 à maturité : part de l'année de soins déjà réglée au 31/12 de la même année,
     mesurée sur les années closes et appliquée à 2025. La méthode mois par mois de
     `studio._completeness` (la puce « en consolidation ») est donnée en borne haute :
     le backtest du bloc E montre qu'elle surestime à horizon douze mois ;
- D. cadence de règlement AMO à fenêtre fixe, lue dans le cube des délais ;
- E. backtest des deux estimateurs de maturité sur les années de soins closes.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app" / "backend"))
from app.analysis import ExtractionRequest, FilterPayload, cube_where, delay_where, extraction_preview
from app.repository import REGIONS, repository
from app.studio import reliability_metadata
from app.time_basis import time_basis

GRAND_POSTE = "Hospitalisation"
YEARS = (2022, 2023, 2024, 2025)
SCOPES = ("Hospitalisation Sejour", "Hospitalisation Honoraires", None)
MEASURES = ["reimbursed", "expense", "coverage", "out_of_pocket"]
MAX_DELAY = 24          # même horizon que la courbe de liquidation de l'outil
CADENCE_MONTHS = 6      # soins de janvier à juin, paiements suivis six mois : observable chaque année
BACKTEST_YEARS = range(2019, 2025)
PARTS_DIR = Path(__file__).resolve().parents[1] / "cube_parts3"   # tranches annuelles de flux, avec la dépense


def scope_name(post):
    return post or "Hospitalisation (ensemble du grand poste)"


def payload(post, start=YEARS[0], end=YEARS[-1]):
    return FilterPayload(start_year=start, end_year=end, grand_post=GRAND_POSTE, post=post)


def month_index(flx):
    return (flx // 100) * 12 + flx % 100


# --- A. Survenance : le moteur de l'écran Extraire ------------------------------

def care_rows(post, dimensions):
    request = ExtractionRequest(start_year=YEARS[0], end_year=YEARS[-1], grand_post=GRAND_POSTE,
                                post=post, dimensions=dimensions, measures=MEASURES, limit=1000)
    return extraction_preview(repository, request, REGIONS)["rows"]


# --- B. Année de règlement AMO : la lecture « Comparer les deux » -----------------

def payment_rows(post):
    return time_basis(repository, payload(post))["rows"]


def payment_measures(post):
    """Dépense, AMO, part et reste par année de règlement, lus dans les tranches annuelles de flux.

    Les tranches `cube_parts3/main_YYYY.parquet` (fournies le 18/09/2026) portent
    tout le contenu des fichiers de flux de l'année YYYY, dépense comprise —
    ce que le cube des délais de l'outil n'a pas. Vérifié : leur `rem` par
    année égale celui du cube des délais, et leur somme redonne le cube brut.
    """
    if not PARTS_DIR.exists():
        return {}
    where, params = cube_where(payload(post, 2000, 2100))
    result = {}
    for year in YEARS:
        part = PARTS_DIR / f"main_{year}.parquet"
        if not part.exists():
            continue
        row = repository.query(
            f"""SELECT SUM(c.dep)::DOUBLE AS expense, SUM(c.rem)::DOUBLE AS reimbursed
                FROM read_parquet('{part.as_posix()}') c LEFT JOIN transco t USING (prs_nat)
                WHERE {where}""", params)[0]
        expense, reimbursed = row["expense"], row["reimbursed"]
        result[year] = {"expense": expense, "reimbursed": reimbursed,
                        "out_of_pocket": expense - reimbursed if expense is not None else None,
                        "coverage": 100 * reimbursed / expense if expense else None}
    return result


def payment_cohorts(post):
    """Règlements de chaque année civile, selon que les soins datent de l'année, de la précédente ou d'avant."""
    where, params = delay_where(payload(post, 2000, 2100), payment_axis=True)
    rows = repository.query(
        f"""SELECT d.flx // 100 AS year,
                   SUM(CASE WHEN d.soi_ann = d.flx // 100 THEN d.rem END)::DOUBLE AS same_year,
                   SUM(CASE WHEN d.soi_ann = d.flx // 100 - 1 THEN d.rem END)::DOUBLE AS previous_year,
                   SUM(CASE WHEN d.soi_ann < d.flx // 100 - 1 THEN d.rem END)::DOUBLE AS older,
                   SUM(CASE WHEN d.flx % 100 <= 6 THEN d.rem END)::DOUBLE AS first_half,
                   SUM(CASE WHEN d.flx % 100 > 6 THEN d.rem END)::DOUBLE AS second_half
            FROM delays d LEFT JOIN transco t USING (prs_nat)
            WHERE {where} GROUP BY 1 ORDER BY 1""", params)
    return {int(r["year"]): r for r in rows}


# --- C. Maturité : part de l'année de soins réglée au 31/12 de la même année -------

def delay_cells(post):
    where, params = delay_where(payload(post, 2000, 2100))
    return repository.query(
        f"""SELECT d.soi_ann AS year, d.soi_moi AS month, d.flx AS flx, SUM(d.rem)::DOUBLE AS value
            FROM delays d LEFT JOIN transco t USING (prs_nat)
            WHERE {where} AND d.rem IS NOT NULL GROUP BY 1, 2, 3""", params)


def observed_through(cells, year, available_month):
    return sum(max(float(c["value"] or 0), 0.0) for c in cells
               if int(c["year"]) == year and month_index(int(c["flx"])) <= available_month)


def in_year_shares(cells, latest_flow):
    """Part réglée au 31/12 de l'année de soins, pour chaque année de soins close."""
    shares = {}
    for year in range(2016, latest_flow // 100):
        total = observed_through(cells, year, month_index(latest_flow))
        if total > 0:
            shares[year] = observed_through(cells, year, year * 12 + 12) / total
    return shares


def profile_estimate(cells, year, available_month):
    """La méthode de studio._completeness : profil mois par mois sur soi_ann <= année - 2."""
    profile_raw = {}
    for c in cells:
        if int(c["year"]) <= year - 2:
            flow = month_index(int(c["flx"]))
            delay = flow - (int(c["year"]) * 12 + int(c["month"]))
            if 0 <= delay <= MAX_DELAY and flow <= available_month:
                profile_raw[delay] = profile_raw.get(delay, 0.0) + max(float(c["value"] or 0), 0.0)
    total = sum(profile_raw.values())
    cumulative, profile = 0.0, {}
    for delay in range(MAX_DELAY + 1):
        cumulative += profile_raw.get(delay, 0.0)
        profile[delay] = cumulative / total if total else 0.0
    estimate = 0.0
    for month in range(1, 13):
        observed = sum(max(float(c["value"] or 0), 0.0) for c in cells
                       if int(c["year"]) == year and int(c["month"]) == month
                       and month_index(int(c["flx"])) <= available_month)
        share = profile[min(available_month - (year * 12 + month), MAX_DELAY)]
        estimate += observed / share if share > 0 else float("nan")
    return estimate


def backtest(cells, latest_flow):
    """Pour chaque année close : vérité (réglé à ce jour), estimation profil, estimation part N-1."""
    result = {}
    now = month_index(latest_flow)
    for year in BACKTEST_YEARS:
        truth = observed_through(cells, year, now)
        available = year * 12 + 12
        previous_share = observed_through(cells, year - 1, (year - 1) * 12 + 12) / observed_through(cells, year - 1, now)
        result[year] = {
            "truth": truth,
            "profile": profile_estimate(cells, year, available),
            "in_year": observed_through(cells, year, available) / previous_share,
        }
    return result


# --- D. Cadence de règlement AMO, à fenêtre fixe ------------------------------------

def cadence(cells):
    """Soins de janvier à juin, paiements suivis M+0 à M+6 : part réglée à M+0 et M+1.

    La fenêtre est la même chaque année, y compris la dernière : juin + 6 mois
    tient dans l'année de flux observée. Une accélération de la cadence AMO se
    lirait ici sans être confondue avec la troncature de l'année récente.
    """
    by_year = {}
    for c in cells:
        year, month = int(c["year"]), int(c["month"])
        if year < 2015 or month > CADENCE_MONTHS:
            continue
        delay = month_index(int(c["flx"])) - (year * 12 + month)
        if 0 <= delay <= CADENCE_MONTHS:
            by_year.setdefault(year, {})
            by_year[year][delay] = by_year[year].get(delay, 0.0) + max(float(c["value"] or 0), 0.0)
    result = {}
    for year, delays in sorted(by_year.items()):
        total = sum(delays.values())
        if total > 0:
            result[year] = {"m0": delays.get(0, 0.0) / total,
                            "m1": (delays.get(0, 0.0) + delays.get(1, 0.0)) / total}
    return result


# --- Assemblage ---------------------------------------------------------------------

def study():
    reliability = reliability_metadata(repository)
    latest_flow = int(reliability["latest_flow"])
    scopes = {}
    for post in SCOPES:
        cells = delay_cells(post)
        care = {int(r["year"]): r for r in care_rows(post, ["year"])}
        shares = in_year_shares(cells, latest_flow)
        last_year = latest_flow // 100
        observed_last = care[last_year]["reimbursed"]
        mature = {
            "share_previous": shares[last_year - 1],
            "share_mean": sum(shares[y] for y in range(2016, last_year - 1) if y != 2020) / len(
                [y for y in range(2016, last_year - 1) if y != 2020]),
        }
        mature["estimate_previous"] = observed_last / mature["share_previous"]
        mature["estimate_mean"] = observed_last / mature["share_mean"]
        mature["estimate_profile"] = profile_estimate(cells, last_year, month_index(latest_flow))
        scopes[scope_name(post)] = {
            "care": care,
            "payment": {int(r["year"]): r for r in payment_rows(post)},
            "payment_measures": payment_measures(post),
            "cohorts": payment_cohorts(post),
            "in_year_shares": shares,
            "mature": mature,
            "cadence": cadence(cells),
            "backtest": backtest(cells, latest_flow),
        }
    by_post = {}
    for r in care_rows(None, ["year", "post"]):
        by_post.setdefault(r["post"], {})[int(r["year"])] = r
    return {"cube": str(repository.cube_path), "latest_flow": latest_flow,
            "consolidated_through": reliability["consolidated_through"],
            "tool_completeness": {int(c["year"]): c["ratio"] for c in reliability["completeness"]},
            "scopes": scopes, "by_post": by_post}


# --- Rendu ---------------------------------------------------------------------------

def fr(value, decimals=2, unit=""):
    if value is None or value != value:
        return "—"
    text = f"{value:,.{decimals}f}".replace(",", " ").replace(".", ",")
    return f"{text}{unit}"


def meur(value):
    return fr(value / 1e6, 2) if value is not None else "—"


def pct_change(before, after):
    return None if not before or after is None else 100 * (after / before - 1)


def render(data):
    out = []
    p = out.append
    lf = data["latest_flow"]
    last = lf // 100
    p(f"Dernier flux observé : {lf % 100:02d}/{lf // 100}. "
      f"Complétude tous postes affichée par l'outil : {fr(100 * data['tool_completeness'][last])} % pour {last}.")
    p("")
    for name, s in data["scopes"].items():
        care, pay, coh, shares, mat, cad, bt = (s["care"], s["payment"], s["cohorts"], s["in_year_shares"],
                                               s["mature"], s["cadence"], s["backtest"])
        pm = s["payment_measures"]
        p(f"## {name}")
        p("")
        p("### A. Année de soins (survenance) — écran Extraire")
        p("")
        p("| Mesure | 2022 | 2023 | 2024 | 2025 (obs.) | 23→24 | 24→25 (obs.) |")
        p("|---|---:|---:|---:|---:|---:|---:|")
        for key, label in (("expense", "Dépense présentée (M€)"), ("reimbursed", "Remboursement AMO (M€)"),
                           ("out_of_pocket", "Reste après AMO (M€)")):
            v = {y: care[y][key] for y in YEARS}
            p(f"| {label} | {meur(v[2022])} | {meur(v[2023])} | {meur(v[2024])} | {meur(v[2025])} | "
              f"{fr(pct_change(v[2023], v[2024]), 2, ' %')} | {fr(pct_change(v[2024], v[2025]), 2, ' %')} |")
        v = {y: care[y]["coverage"] for y in YEARS}
        p(f"| Part AMO (%) | {fr(v[2022])} | {fr(v[2023])} | {fr(v[2024])} | {fr(v[2025])} | "
          f"{fr(v[2024] - v[2023], 2, ' pt')} | {fr(v[2025] - v[2024], 2, ' pt')} |")
        p("")
        p("### B. Année de règlement AMO (année civile) — Panorama, « Comparer les deux »")
        p("")
        p("| Remboursement AMO (M€) | 2022 | 2023 | 2024 | 2025 | 23→24 | 24→25 |")
        p("|---|---:|---:|---:|---:|---:|---:|")
        c = {y: pay[y]["care"] for y in YEARS}
        r = {y: pay[y]["payment"] for y in YEARS}
        p(f"| Par année de soins | {meur(c[2022])} | {meur(c[2023])} | {meur(c[2024])} | {meur(c[2025])} | "
          f"{fr(pct_change(c[2023], c[2024]), 2, ' %')} | {fr(pct_change(c[2024], c[2025]), 2, ' %')} |")
        p(f"| Par année de règlement | {meur(r[2022])} | {meur(r[2023])} | {meur(r[2024])} | {meur(r[2025])} | "
          f"{fr(pct_change(r[2023], r[2024]), 2, ' %')} | {fr(pct_change(r[2024], r[2025]), 2, ' %')} |")
        p("")
        p("Dépense et reste après AMO en année de règlement, **déduits** : AMO de l'année de règlement ÷ part AMO "
          "de l'année de soins (Extraire). L'hypothèse est que le partage AMO / reste est le même sur les deux datations.")
        p("")
        p("| Déduit, par année de règlement | 2022 | 2023 | 2024 | 2025 | 23→24 | 24→25 |")
        p("|---|---:|---:|---:|---:|---:|---:|")
        ded = {y: r[y] / (care[y]["coverage"] / 100) for y in YEARS}
        rest = {y: ded[y] - r[y] for y in YEARS}
        p(f"| Dépense déduite (M€) | {meur(ded[2022])} | {meur(ded[2023])} | {meur(ded[2024])} | {meur(ded[2025])} | "
          f"{fr(pct_change(ded[2023], ded[2024]), 2, ' %')} | {fr(pct_change(ded[2024], ded[2025]), 2, ' %')} |")
        p(f"| Reste après AMO déduit (M€) | {meur(rest[2022])} | {meur(rest[2023])} | {meur(rest[2024])} | {meur(rest[2025])} | "
          f"{fr(pct_change(rest[2023], rest[2024]), 2, ' %')} | {fr(pct_change(rest[2024], rest[2025]), 2, ' %')} |")
        if pm:
            p(f"| Contrôle : écart de la dépense déduite à la dépense réelle des tranches de flux | "
              + " | ".join(fr(pct_change(pm[y]["expense"], ded[y]), 2, " %") for y in YEARS) + " | | |")
        p("")
        if pm:
            p("Les quatre mesures par année de règlement (tranches annuelles de flux `cube_parts3/`, hors outil) :")
            p("")
            p("| Mesure | 2022 | 2023 | 2024 | 2025 | 23→24 | 24→25 |")
            p("|---|---:|---:|---:|---:|---:|---:|")
            for key, label in (("expense", "Dépense présentée (M€)"), ("reimbursed", "Remboursement AMO (M€)"),
                               ("out_of_pocket", "Reste après AMO (M€)")):
                v = {y: pm[y][key] for y in YEARS}
                p(f"| {label} | {meur(v[2022])} | {meur(v[2023])} | {meur(v[2024])} | {meur(v[2025])} | "
                  f"{fr(pct_change(v[2023], v[2024]), 2, ' %')} | {fr(pct_change(v[2024], v[2025]), 2, ' %')} |")
            v = {y: pm[y]["coverage"] for y in YEARS}
            p(f"| Part AMO (%) | {fr(v[2022])} | {fr(v[2023])} | {fr(v[2024])} | {fr(v[2025])} | "
              f"{fr(v[2024] - v[2023], 2, ' pt')} | {fr(v[2025] - v[2024], 2, ' pt')} |")
            p("")
        p("Décomposition des règlements de l'année civile selon l'année des soins (M€) :")
        p("")
        p("| Année de règlement | Soins de l'année | Soins de l'année précédente | Soins plus anciens | 1er semestre | 2d semestre |")
        p("|---|---:|---:|---:|---:|---:|")
        for y in YEARS:
            k = coh[y]
            p(f"| {y} | {meur(k['same_year'])} | {meur(k['previous_year'])} | {meur(k['older'])} | "
              f"{meur(k['first_half'])} | {meur(k['second_half'])} |")
        p(f"| 2025 / 2024 | {fr(pct_change(coh[2024]['same_year'], coh[2025]['same_year']), 2, ' %')} | "
          f"{fr(pct_change(coh[2024]['previous_year'], coh[2025]['previous_year']), 2, ' %')} | | "
          f"{fr(pct_change(coh[2024]['first_half'], coh[2025]['first_half']), 2, ' %')} | "
          f"{fr(pct_change(coh[2024]['second_half'], coh[2025]['second_half']), 2, ' %')} |")
        p("")
        p("### C. 2025 à maturité — part de l'année de soins réglée au 31/12 de la même année")
        p("")
        years = sorted(shares)
        p("| Année de soins | " + " | ".join(str(y) for y in years) + " |")
        p("|---|" + "---:|" * len(years))
        p("| Part réglée au 31/12 (%) | " + " | ".join(fr(100 * shares[y], 1) for y in years) + " |")
        p("")
        rem24, dep24 = care[2024]["reimbursed"], care[2024]["expense"]
        rem25 = care[2025]["reimbursed"]
        p("| Estimation 2025 à maturité | Part retenue | AMO 2025 (M€) | AMO 24→25 | Dépense 2025 (M€) | Reste après AMO 2025 (M€) | Reste 24→25 |")
        p("|---|---:|---:|---:|---:|---:|---:|")
        for label, share, estimate in (
            ("Part de 2024 (retenue)", mat["share_previous"], mat["estimate_previous"]),
            ("Part moyenne 2016–2023 hors 2020", mat["share_mean"], mat["estimate_mean"]),
        ):
            ratio = rem25 / estimate
            dep25 = care[2025]["expense"] / ratio
            p(f"| {label} | {fr(100 * share, 1)} % | {meur(estimate)} | {fr(pct_change(rem24, estimate), 2, ' %')} | "
              f"{meur(dep25)} | {meur(dep25 - estimate)} | {fr(pct_change(dep24 - rem24, dep25 - estimate), 2, ' %')} |")
        prof = mat["estimate_profile"]
        p(f"| Méthode mois par mois de l'outil (borne haute, voir E) | {fr(100 * rem25 / prof, 1)} % | {meur(prof)} | "
          f"{fr(pct_change(rem24, prof), 2, ' %')} | | | |")
        p("")
        p("La dépense présentée 2025 est redressée avec la même part que l'AMO (hypothèse : "
          "dépense et remboursement d'un même acte sont enregistrés ensemble), la part AMO est donc inchangée.")
        p("")
        p("### D. Cadence de règlement AMO (soins janvier–juin, paiements suivis 6 mois)")
        p("")
        years = sorted(cad)
        p("| Année de soins | " + " | ".join(str(y) for y in years) + " |")
        p("|---|" + "---:|" * len(years))
        p("| Réglé dans le mois (%) | " + " | ".join(fr(100 * cad[y]['m0'], 1) for y in years) + " |")
        p("| Réglé à M+1 au plus (%) | " + " | ".join(fr(100 * cad[y]['m1'], 1) for y in years) + " |")
        p("")
        p("### E. Backtest des deux estimateurs de maturité, à fin décembre de l'année de soins")
        p("")
        p("| Année de soins | Réglé à ce jour (M€) | Méthode mois par mois | écart | Part de l'année N−1 | écart |")
        p("|---|---:|---:|---:|---:|---:|")
        for y, b in bt.items():
            p(f"| {y} | {meur(b['truth'])} | {meur(b['profile'])} | {fr(pct_change(b['truth'], b['profile']), 2, ' %')} | "
              f"{meur(b['in_year'])} | {fr(pct_change(b['truth'], b['in_year']), 2, ' %')} |")
        p("")
    p("## Tous les postes du grand poste (survenance, écran Extraire, dimensions Année + Poste)")
    p("")
    p("| Poste | Dép. 2023 | Dép. 2024 | Dép. 2025 | AMO 2023 | AMO 2024 | AMO 2025 | Part 2023 | Part 2024 | Part 2025 |")
    p("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|")
    ordered = sorted(data["by_post"].items(), key=lambda kv: -(kv[1].get(2024, {}).get("expense") or 0))
    for post, rows in ordered:
        def g(y, k):
            return rows.get(y, {}).get(k)
        p(f"| {post} | {meur(g(2023, 'expense'))} | {meur(g(2024, 'expense'))} | {meur(g(2025, 'expense'))} | "
          f"{meur(g(2023, 'reimbursed'))} | {meur(g(2024, 'reimbursed'))} | {meur(g(2025, 'reimbursed'))} | "
          f"{fr(g(2023, 'coverage'))} | {fr(g(2024, 'coverage'))} | {fr(g(2025, 'coverage'))} |")
    return "\n".join(out)


if __name__ == "__main__":
    data = study()
    if "--json" in sys.argv:
        print(json.dumps(data, ensure_ascii=True, indent=2, default=str))
    else:
        print(render(data))
