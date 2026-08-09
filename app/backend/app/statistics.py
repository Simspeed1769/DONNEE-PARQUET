"""Statistiques de corrélation, écrites à la main.

L'application n'embarque ni SciPy ni NumPy : les ajouter pour trois formules
alourdirait une installation qui doit rester un double-clic. Les fonctions ci-
dessous sont donc autonomes, et la fonction de répartition de Student est
obtenue par la fonction bêta incomplète régularisée — la même que celle des
bibliothèques scientifiques, au même niveau de précision utile ici.

Aucune de ces fonctions ne décide si une corrélation « existe ». Elles
renvoient le coefficient, son intervalle et le nombre d'observations ; c'est
l'appelant qui pose les avertissements, et l'utilisateur qui conclut.
"""

from __future__ import annotations

import math
from typing import Sequence

# Au-delà, la continued fraction de la bêta incomplète a convergé bien avant.
_MAX_ITERATIONS = 200
_EPSILON = 3e-16
_TINY = 1e-300


def _log_beta(a: float, b: float) -> float:
    return math.lgamma(a) + math.lgamma(b) - math.lgamma(a + b)


def _beta_continued_fraction(a: float, b: float, x: float) -> float:
    """Fraction continue de Lentz pour la bêta incomplète."""
    qab, qap, qam = a + b, a + 1.0, a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < _TINY:
        d = _TINY
    d = 1.0 / d
    result = d

    for m in range(1, _MAX_ITERATIONS + 1):
        m2 = 2 * m
        numerator = m * (b - m) * x / ((qam + m2) * (a + m2))
        d = 1.0 + numerator * d
        if abs(d) < _TINY:
            d = _TINY
        c = 1.0 + numerator / c
        if abs(c) < _TINY:
            c = _TINY
        d = 1.0 / d
        result *= d * c

        numerator = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
        d = 1.0 + numerator * d
        if abs(d) < _TINY:
            d = _TINY
        c = 1.0 + numerator / c
        if abs(c) < _TINY:
            c = _TINY
        d = 1.0 / d
        delta = d * c
        result *= delta
        if abs(delta - 1.0) < _EPSILON:
            break
    return result


def regularized_incomplete_beta(a: float, b: float, x: float) -> float:
    if x <= 0.0:
        return 0.0
    if x >= 1.0:
        return 1.0
    front = math.exp(a * math.log(x) + b * math.log(1.0 - x) - _log_beta(a, b))
    # La fraction converge vite d'un seul côté : on bascule par symétrie.
    if x < (a + 1.0) / (a + b + 2.0):
        return front * _beta_continued_fraction(a, b, x) / a
    return 1.0 - front * _beta_continued_fraction(b, a, 1.0 - x) / b


def student_two_sided_p(t: float, degrees: int) -> float:
    """Probabilité d'observer un |t| au moins aussi grand sous l'hypothèse nulle."""
    if degrees <= 0:
        return float("nan")
    if math.isinf(t):
        return 0.0
    x = degrees / (degrees + t * t)
    return regularized_incomplete_beta(degrees / 2.0, 0.5, x)


def pearson(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    n = len(xs)
    if n < 3:
        return None
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    covariance = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    variance_x = sum((x - mean_x) ** 2 for x in xs)
    variance_y = sum((y - mean_y) ** 2 for y in ys)
    if variance_x <= 0 or variance_y <= 0:
        return None
    return covariance / math.sqrt(variance_x * variance_y)


def _ranks(values: Sequence[float]) -> list[float]:
    """Rangs moyens : les ex æquo partagent le rang, sans quoi Spearman
    dépendrait de l'ordre d'arrivée des égalités."""
    order = sorted(range(len(values)), key=lambda index: values[index])
    ranks = [0.0] * len(values)
    position = 0
    while position < len(order):
        end = position
        while end + 1 < len(order) and values[order[end + 1]] == values[order[position]]:
            end += 1
        shared = (position + end) / 2.0 + 1.0
        for index in range(position, end + 1):
            ranks[order[index]] = shared
        position = end + 1
    return ranks


def spearman(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    if len(xs) < 3:
        return None
    return pearson(_ranks(xs), _ranks(ys))


def correlation_report(xs: Sequence[float], ys: Sequence[float]) -> dict[str, object]:
    """Coefficient, signification et intervalle — sans verdict.

    L'intervalle de confiance passe par la transformation z de Fisher, qui
    rapproche la distribution de r d'une normale ; sans elle, un intervalle
    symétrique autour de r déborderait de [-1, 1] sur les fortes corrélations.
    """
    n = len(xs)
    r = pearson(xs, ys)
    if r is None or n < 3:
        return {
            "n": n, "pearson": None, "spearman": None, "p_value": None,
            "r_squared": None, "ci_low": None, "ci_high": None,
            "slope": None, "intercept": None,
        }

    degrees = n - 2
    if abs(r) >= 1.0:
        p_value = 0.0
    else:
        t = r * math.sqrt(degrees / (1.0 - r * r))
        p_value = student_two_sided_p(t, degrees)

    ci_low = ci_high = None
    if n > 3 and abs(r) < 1.0:
        z = 0.5 * math.log((1.0 + r) / (1.0 - r))
        margin = 1.959963985 / math.sqrt(n - 3)
        ci_low = math.tanh(z - margin)
        ci_high = math.tanh(z + margin)

    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    variance_x = sum((x - mean_x) ** 2 for x in xs)
    slope = (sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / variance_x
             if variance_x > 0 else None)
    intercept = mean_y - slope * mean_x if slope is not None else None

    return {
        "n": n,
        "pearson": r,
        "spearman": spearman(xs, ys),
        "p_value": p_value,
        "r_squared": r * r,
        "ci_low": ci_low,
        "ci_high": ci_high,
        "slope": slope,
        "intercept": intercept,
    }


def minimum_detectable_r(n: int, alpha: float = 0.05) -> float | None:
    """Le |r| en deçà duquel, avec ce nombre d'observations, on ne pourra rien
    conclure. C'est le chiffre qui rend honnête une corrélation sur douze
    régions : il vaut mieux l'afficher que laisser croire à une absence d'effet.
    """
    if n < 4:
        return None
    degrees = n - 2
    low, high = 0.0, 0.999999
    for _ in range(80):
        middle = (low + high) / 2.0
        t = middle * math.sqrt(degrees / (1.0 - middle * middle))
        if student_two_sided_p(t, degrees) > alpha:
            low = middle
        else:
            high = middle
    return (low + high) / 2.0
