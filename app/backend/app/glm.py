"""Modèle linéaire généralisé, écrit à la main.

L'application n'embarque ni NumPy ni SciPy — l'installation doit rester un
double-clic — et ce module s'en passe. Les matrices en jeu sont minuscules :
quelques dizaines d'observations, une poignée de colonnes. Une élimination de
Gauss avec pivot partiel suffit, et les moindres carrés repondérés itératifs
convergent en une dizaine de tours.

Ce qui est modélisé
-------------------
Une **mesure de remboursement** expliquée par une ou plusieurs variables, sur
les mêmes unités d'observation que les croisements : la région, l'année, ou le
couple des deux.

Trois familles suffisent à couvrir ce que porte ce jeu de données, et le choix
n'est **pas** imposé à l'utilisateur : il est proposé par défaut selon la
mesure, et reste modifiable.

- **gaussienne, lien identité** — la régression linéaire ordinaire. Un
  coefficient s'y lit dans l'unité de la réponse : « +1 point de prévalence
  vaut +12 € par habitant ».
- **gamma, lien logarithmique** — la forme habituelle des montants : la réponse
  est strictement positive, sa dispersion croît avec son niveau, et un
  coefficient s'y lit en **pourcentage** : « +1 point de prévalence vaut
  +3,2 % de remboursement ». C'est souvent le bon modèle pour un coût, mais ce
  n'est pas une règle : une réponse qui approche zéro, ou qui peut être nulle,
  le disqualifie.
- **poissonnienne, lien logarithmique** — pour un effectif.

Ce que le module ne fait pas
----------------------------
Il ne sélectionne pas de variables, ne teste pas d'interaction, ne diagnostique
pas les résidus. Ce n'est pas un logiciel de modélisation : c'est une première
lecture, dont le résultat est rendu en français et dont les limites sont dites
avec lui.
"""

from __future__ import annotations

import math
from typing import Callable, Literal, Sequence

from .statistics import student_two_sided_p

Family = Literal["gaussian", "gamma", "poisson"]
Link = Literal["identity", "log"]

# Au-delà, l'IRLS ne converge plus : c'est que le modèle est mal posé.
_MAX_ITERATIONS = 60
_TOLERANCE = 1e-10
# Plancher de la moyenne prédite sous lien log : évite un log(0) sur une
# itération qui passe trop bas avant de remonter.
_MU_FLOOR = 1e-9


class GlmError(ValueError):
    """Le modèle ne peut pas être ajusté, et on dit pourquoi."""


def _solve(matrix: list[list[float]], vector: list[float]) -> list[float]:
    """Résout `matrix · x = vector` par élimination de Gauss avec pivot partiel.

    Le pivot partiel n'est pas un raffinement : sans lui, deux variables
    fortement corrélées — deux indicateurs socio-professionnels, par exemple —
    produisent un pivot minuscule et une solution numériquement absurde.
    """
    size = len(vector)
    augmented = [[*row, value] for row, value in zip(matrix, vector)]

    for column in range(size):
        pivot_row = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot_row][column]) < 1e-12:
            raise GlmError(
                "Deux variables explicatives portent la même information "
                "(ou l'une d'elles est constante) : le modèle ne peut pas leur "
                "attribuer d'effet séparé. Retirez-en une."
            )
        augmented[column], augmented[pivot_row] = augmented[pivot_row], augmented[column]

        pivot = augmented[column][column]
        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column] / pivot
            if factor == 0.0:
                continue
            for position in range(column, size + 1):
                augmented[row][position] -= factor * augmented[column][position]

    return [augmented[index][size] / augmented[index][index] for index in range(size)]


def _invert(matrix: list[list[float]]) -> list[list[float]]:
    """Inverse d'une matrice carrée, colonne par colonne.

    Elle sert à la matrice de covariance des coefficients, dont la diagonale
    donne les écarts-types : sans eux, un coefficient s'afficherait comme une
    certitude.
    """
    size = len(matrix)
    columns = []
    for index in range(size):
        basis = [1.0 if position == index else 0.0 for position in range(size)]
        columns.append(_solve([row[:] for row in matrix], basis))
    return [[columns[column][row] for column in range(size)] for row in range(size)]


def _link_functions(link: Link) -> tuple[Callable[[float], float], Callable[[float], float]]:
    """(fonction de lien inverse, dérivée d/dη de la moyenne)."""
    if link == "log":
        return (lambda eta: max(math.exp(min(eta, 700.0)), _MU_FLOOR),
                lambda mu: mu)
    return (lambda eta: eta, lambda _mu: 1.0)


def _variance(family: Family, mu: float) -> float:
    if family == "gamma":
        return max(mu * mu, _MU_FLOOR)
    if family == "poisson":
        return max(mu, _MU_FLOOR)
    return 1.0


def default_family(response_is_positive: bool, response_is_count: bool) -> tuple[Family, Link]:
    """La famille proposée d'emblée — jamais imposée.

    Un montant strictement positif appelle une gamma à lien log, parce que sa
    dispersion croît avec son niveau et que l'effet d'une variable s'y lit en
    pourcentage. Mais la réponse peut être un taux, une part, une valeur qui
    passe par zéro : la gaussienne reste alors la lecture juste, et
    l'utilisateur garde la main.
    """
    if response_is_count:
        return "poisson", "log"
    if response_is_positive:
        return "gamma", "log"
    return "gaussian", "identity"


def fit(design: list[list[float]], response: Sequence[float],
        family: Family, link: Link) -> dict[str, object]:
    """Ajuste le modèle par moindres carrés repondérés itératifs.

    `design` porte déjà sa colonne de constante. Le résultat contient les
    coefficients, leurs écarts-types, la statistique de Wald et sa p-value, plus
    de quoi juger l'ajustement.
    """
    n = len(response)
    p = len(design[0]) if design else 0
    if n == 0 or p == 0:
        raise GlmError("Aucune observation exploitable.")
    if n <= p:
        raise GlmError(
            f"{n} observations pour {p} paramètres : il n'y a pas de quoi estimer "
            "un effet. Élargissez la période, changez d'unité d'observation, ou "
            "retirez une variable."
        )
    if family in ("gamma", "poisson") and any(value <= 0 for value in response):
        raise GlmError(
            "Cette loi exige une réponse strictement positive, et la mesure "
            "choisie s'annule ou devient négative sur au moins une observation. "
            "Choisissez la loi gaussienne."
        )

    inverse_link, mu_prime = _link_functions(link)

    # Départ : la moyenne observée, transportée sur l'échelle du prédicteur.
    mean = sum(response) / n
    eta = [math.log(max(mean, _MU_FLOOR)) if link == "log" else mean for _ in range(n)]
    beta = [0.0] * p
    converged = False

    for _ in range(_MAX_ITERATIONS):
        weights: list[float] = []
        targets: list[float] = []
        for index in range(n):
            mu = inverse_link(eta[index])
            derivative = mu_prime(mu)
            if abs(derivative) < _MU_FLOOR:
                derivative = _MU_FLOOR
            variance = _variance(family, mu)
            weights.append((derivative * derivative) / variance)
            # Réponse de travail : η + (y − µ) / (dµ/dη).
            targets.append(eta[index] + (response[index] - mu) / derivative)

        # Équations normales pondérées : (XᵀWX) β = XᵀWz.
        normal = [[0.0] * p for _ in range(p)]
        right = [0.0] * p
        for index in range(n):
            weight = weights[index]
            row = design[index]
            for a in range(p):
                right[a] += weight * row[a] * targets[index]
                for b in range(a, p):
                    normal[a][b] += weight * row[a] * row[b]
        for a in range(p):
            for b in range(a):
                normal[a][b] = normal[b][a]

        updated = _solve([row[:] for row in normal], right[:])
        shift = max(abs(updated[index] - beta[index]) for index in range(p))
        beta = updated
        eta = [sum(design[index][column] * beta[column] for column in range(p))
               for index in range(n)]
        if shift < _TOLERANCE:
            converged = True
            break

    if not converged:
        raise GlmError(
            "Le modèle n'a pas convergé. C'est presque toujours le signe d'une "
            "variable sans rapport avec la réponse, ou d'une loi qui ne convient "
            "pas à la mesure choisie."
        )

    mu_hat = [inverse_link(value) for value in eta]

    # Dispersion : estimée par le χ² de Pearson pour gaussienne et gamma, fixée
    # à 1 pour la poissonnienne, où la variance est celle de la moyenne.
    residual_degrees = n - p
    pearson = sum(
        (response[index] - mu_hat[index]) ** 2 / _variance(family, mu_hat[index])
        for index in range(n)
    )
    dispersion = 1.0 if family == "poisson" else pearson / residual_degrees

    # Covariance des coefficients : dispersion × (XᵀWX)⁻¹, reconstruite au point
    # d'arrivée plutôt que réutilisée depuis la dernière itération.
    final_normal = [[0.0] * p for _ in range(p)]
    for index in range(n):
        mu = mu_hat[index]
        derivative = mu_prime(mu)
        weight = (derivative * derivative) / _variance(family, mu)
        row = design[index]
        for a in range(p):
            for b in range(p):
                final_normal[a][b] += weight * row[a] * row[b]
    covariance = _invert(final_normal)

    standard_errors = [
        math.sqrt(max(dispersion * covariance[index][index], 0.0)) for index in range(p)
    ]

    statistics = []
    for index in range(p):
        error = standard_errors[index]
        if error <= 0:
            statistics.append((None, None))
            continue
        t = beta[index] / error
        statistics.append((t, student_two_sided_p(t, residual_degrees)))

    # Pseudo-R² de McFadden sur la déviance : la part de l'écart au modèle vide
    # que les variables expliquent. Sur un GLM, c'est la lecture honnête — le R²
    # ordinaire n'y a plus le sens qu'il a en régression linéaire.
    deviance = _deviance(family, response, mu_hat)
    null_mu = [sum(response) / n] * n
    null_deviance = _deviance(family, response, null_mu)
    explained = 1.0 - deviance / null_deviance if null_deviance > 0 else None

    return {
        "coefficients": beta,
        "standard_errors": standard_errors,
        "statistics": [item[0] for item in statistics],
        "p_values": [item[1] for item in statistics],
        "n": n,
        "parameters": p,
        "residual_degrees": residual_degrees,
        "dispersion": dispersion,
        "deviance": deviance,
        "null_deviance": null_deviance,
        "explained": explained,
        "fitted": mu_hat,
    }


def _deviance(family: Family, observed: Sequence[float], fitted: Sequence[float]) -> float:
    total = 0.0
    for y, mu in zip(observed, fitted):
        if family == "gaussian":
            total += (y - mu) ** 2
        elif family == "poisson":
            term = y * math.log(y / mu) if y > 0 else 0.0
            total += 2.0 * (term - (y - mu))
        else:  # gamma
            total += 2.0 * (-math.log(y / mu) + (y - mu) / mu)
    return total
