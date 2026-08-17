"""La régression de Croisements : ce qui explique quoi, et de combien.

Ce module tenait dans `correlations.py`, qui portait à la fois le **vocabulaire
commun des cinq sources** — comment on rend croisables des bases qui ne
comptent pas la même chose — et le **modèle** qui s'appuie dessus. Deux sujets
distincts dans un fichier de 1 200 lignes ; ils sont séparés depuis le point
2.4, sans rien changer au comportement.

Ce qui reste dans `correlations.py` : les douze régions communes, la projection
des âges, les dénominateurs de population, l'extraction des séries par source,
le catalogue. Ce qui vient ici : le modèle linéaire généralisé, ses facteurs
catégoriels, et les phrases en français qui rendent ses coefficients lisibles.

La doctrine ne change pas non plus. Ce n'est pas un logiciel de modélisation :
c'est une première lecture, dont le résultat est rendu en français et dont les
limites sont dites avec lui — les erreurs-types ne sont pas robustes, et
l'écran le signale plutôt que de faire semblant.
"""

from __future__ import annotations

import math
from typing import Any, Literal

from pydantic import BaseModel, Field

from .analysis import QueryRepository
from .correlations import (
    AGE_BANDS,
    COMMON_REGIONS,
    FACTORS,
    MAX_PREDICTORS,
    METRICS,
    RESPONSE_METRICS,
    UNIT_DIMENSIONS,
    UNITS,
    CorrelationRequest,
    IndicatorRef,
    Unit,
    _describe_cell,
    _SEX_LABELS,
    _series,
    available_factors,
)

#: Le nom français de chaque loi, tel qu'il s'écrit dans la phrase de résultat.
#: Propre à ce module : `correlations.py` n'ajuste rien et n'en a pas l'usage.
FAMILY_LABELS: dict[str, str] = {
    "gaussian": "Effet en euros (loi gaussienne)",
    "gamma": "Effet en pourcentage (loi gamma)",
    "poisson": "Effet en pourcentage (loi de Poisson)",
}
from .glm import Family, GlmError, default_family, fit


class RegressionRequest(BaseModel):
    unit: Unit = "region_age_sex"
    response: str = "damir.spend_per_capita"
    # Modalité de la mesure expliquée, quand elle en exige une — la prévalence
    # d'une pathologie précise, par exemple. Sans objet pour une mesure DAMIR.
    response_selection: str | None = None
    predictors: list[IndicatorRef] = []
    # Dimensions de l'observation mises dans le modèle comme variables
    # catégorielles, avec un niveau de référence.
    factors: list[str] = []
    start_year: int = 2016
    end_year: int = 2022
    sex: Literal["all", "men", "women"] = "all"
    age_band: str | None = None
    # `None` laisse le module proposer la loi qui convient à la mesure. Le choix
    # reste offert : aucune loi n'est imposée.
    family: Family | None = None


def _term_sentence(label: str, unit: str, effect: float | None, link: str,
                   significant: bool) -> str:
    """L'effet d'une variable, en une phrase.

    C'est la seule sortie que la plupart des lecteurs regarderont : elle dit le
    sens, l'ampleur et l'unité, et elle dit aussi quand il n'y a rien à dire.
    """
    if effect is None:
        return f"{label} : effet non estimable."
    if not significant:
        return (f"{label} : aucun effet distinguable du hasard sur ces données. "
                "Ce n'est pas la preuve qu'il n'y en a pas.")
    direction = "de plus" if effect >= 0 else "de moins"
    # Séparateur décimal français : la phrase se lit à côté d'un tableau qui
    # écrit déjà « 5,2 % », et deux notations pour le même nombre se remarquent.
    def french(value: float, digits: int) -> str:
        return f"{value:.{digits}f}".replace(".", ",")

    size = abs(effect)
    if link == "log":
        return (f"À chaque point de « {label} » en plus, la mesure varie de "
                f"{french(size, 1)} % {direction}, les autres variables tenues constantes.")
    return (f"À chaque unité de « {label} » en plus ({unit}), la mesure varie de "
            f"{french(size, 2)} {direction}, les autres variables tenues constantes.")


def _level_label(dimension: str, raw: str) -> str:
    if dimension == "age":
        return AGE_BANDS.get(raw, f"{raw} ans")
    if dimension == "sex":
        return _SEX_LABELS.get(int(raw), raw)
    if dimension == "region":
        return COMMON_REGIONS.get(int(raw), raw)
    return raw


def _factor_sentence(group: str, level: str, reference: str, effect: float,
                     link: str, significant: bool) -> str:
    """Un niveau de facteur se lit **contre sa référence**, jamais dans l'absolu."""
    if not significant:
        return (f"{group} · {level} : pas d'écart distinguable du hasard "
                f"par rapport à « {reference} ».")
    direction = "de plus" if effect >= 0 else "de moins"
    size = f"{abs(effect):.1f}".replace(".", ",") if link == "log" else f"{abs(effect):.2f}".replace(".", ",")
    measure = f"{size} %" if link == "log" else size
    return (f"{group} · {level} : {measure} {direction} que « {reference} », "
            "les autres variables tenues constantes.")


def regression(repo: QueryRepository, request: RegressionRequest) -> dict[str, Any]:
    if request.start_year > request.end_year:
        raise ValueError("La période sélectionnée est invalide.")
    if request.response not in RESPONSE_METRICS:
        raise ValueError(f"Mesure expliquée inconnue : {request.response}")
    if not request.predictors:
        raise ValueError("Choisissez au moins une variable explicative.")
    if len(request.predictors) > MAX_PREDICTORS:
        raise ValueError(
            f"{MAX_PREDICTORS} variables au plus : au-delà, sur si peu "
            "d'observations, les effets ne se séparent plus."
        )

    allowed = UNITS[request.unit]["sources"]
    response_definition = METRICS[request.response]

    def scope_for(reference: IndicatorRef) -> CorrelationRequest:
        return CorrelationRequest(
            unit=request.unit, x=reference, y=reference,
            start_year=request.start_year, end_year=request.end_year,
            sex=request.sex, age_band=request.age_band, detrend=False,
        )

    response_reference = IndicatorRef(
        source=response_definition["source"], metric=request.response,
        selection=request.response_selection,
    )
    response_series = _series(repo, response_reference, scope_for(response_reference))

    predictor_series: list[dict[str, float]] = []
    definitions: list[dict[str, Any]] = []
    for reference in request.predictors:
        definition = METRICS.get(reference.metric)
        if definition is None:
            raise ValueError(f"Variable inconnue : {reference.metric}")
        if definition["source"] not in allowed:
            raise ValueError(
                f"« {definition['label']} » n'existe pas sur "
                f"« {UNITS[request.unit]['label']} »."
            )
        predictor_series.append(_series(repo, reference, scope_for(reference)))
        definitions.append(definition)

    # Seules les unités où **tout** est renseigné entrent dans le modèle : une
    # observation partielle fausserait les coefficients des autres variables.
    keys = sorted(set(response_series).intersection(*(set(item) for item in predictor_series)))
    if not keys:
        raise ValueError(
            "Aucune unité d'observation ne porte à la fois la mesure et toutes "
            "les variables choisies."
        )

    # ── Facteurs : les dimensions de l'observation, encodées en indicatrices ──
    #
    # Le premier niveau rencontré sert de référence et n'a pas de colonne : sans
    # cela, la somme des indicatrices reproduirait la constante et la matrice
    # serait singulière. Chaque coefficient se lit donc « par rapport à » ce
    # niveau, et c'est ainsi qu'il est libellé.
    chosen_factors = [key for key in request.factors if key in FACTORS]
    allowed_factors = available_factors(request.unit)
    for key in chosen_factors:
        if key not in allowed_factors:
            raise ValueError(
                f"« {FACTORS[key]['label']} » ne varie pas sur "
                f"« {UNITS[request.unit]['label']} » : il ne peut pas être une variable."
            )

    dimensions = UNIT_DIMENSIONS[request.unit]
    factor_columns: list[dict[str, Any]] = []
    for key in chosen_factors:
        position = dimensions.index(FACTORS[key]["dimension"])
        levels = sorted({cell.split(":")[position] for cell in keys},
                        key=lambda raw: int(raw))
        if len(levels) < 2:
            raise ValueError(
                f"« {FACTORS[key]['label']} » ne prend qu'une modalité sur ce "
                "périmètre : il n'y a rien à comparer."
            )
        reference = levels[0]
        for level in levels[1:]:
            factor_columns.append({
                "factor": key, "position": position, "level": level,
                "reference": reference,
            })

    observed = [response_series[key] for key in keys]
    design = [
        [
            1.0,
            *(series[cell] for series in predictor_series),
            *(1.0 if cell.split(":")[column["position"]] == column["level"] else 0.0
              for column in factor_columns),
        ]
        for cell in keys
    ]

    positive = all(value > 0 for value in observed)
    counts = response_definition["unit"] in ("patients", "décès")
    family, link = default_family(positive, counts)
    if request.family is not None:
        family = request.family
        link = "identity" if family == "gaussian" else "log"

    try:
        result = fit(design, observed, family, link)
    except GlmError as error:
        raise ValueError(str(error)) from error

    coefficients: list[float] = result["coefficients"]  # type: ignore[assignment]
    errors: list[float] = result["standard_errors"]  # type: ignore[assignment]
    p_values: list[float | None] = result["p_values"]  # type: ignore[assignment]

    terms: list[dict[str, Any]] = []
    for index, (reference, definition) in enumerate(zip(request.predictors, definitions), start=1):
        estimate = coefficients[index]
        p_value = p_values[index]
        significant = p_value is not None and p_value < 0.05
        # Sur un lien logarithmique, exp(β) − 1 est la variation relative de la
        # réponse pour une unité de plus : c'est ce qui se dit, pas β.
        as_effect = (lambda value: (math.exp(value) - 1.0) * 100.0) if link == "log" else (lambda value: value)
        effect = as_effect(estimate)
        # L'intervalle est calculé sur l'échelle du coefficient **puis**
        # transporté : transformer les bornes après coup garde un intervalle
        # asymétrique juste, là où ±1,96 σ appliqué à l'effet le fausserait.
        margin = 1.959963985 * errors[index]
        ci_low, ci_high = sorted((as_effect(estimate - margin), as_effect(estimate + margin)))
        label = definition["label"] + (f" · {reference.selection}" if reference.selection else "")
        terms.append({
            "key": f"{reference.metric}::{reference.selection or ''}",
            "metric": reference.metric,
            "selection": reference.selection,
            "label": label,
            "unit": definition["unit"],
            "estimate": estimate,
            "std_error": errors[index],
            "statistic": result["statistics"][index],  # type: ignore[index]
            "p_value": p_value,
            "effect": effect,
            "ci_low": ci_low,
            "ci_high": ci_high,
            "effect_kind": "percent" if link == "log" else "absolute",
            "significant": significant,
            "sentence": _term_sentence(label, definition["unit"], effect, link, significant),
        })

    # Les niveaux d'un facteur, chacun lu par rapport à sa référence.
    offset = 1 + len(request.predictors)
    for position, column in enumerate(factor_columns):
        index = offset + position
        estimate = coefficients[index]
        p_value = p_values[index]
        significant = p_value is not None and p_value < 0.05
        as_effect = (lambda value: (math.exp(value) - 1.0) * 100.0) if link == "log" else (lambda value: value)
        effect = as_effect(estimate)
        margin = 1.959963985 * errors[index]
        ci_low, ci_high = sorted((as_effect(estimate - margin), as_effect(estimate + margin)))
        factor = FACTORS[column["factor"]]
        level_label = _level_label(factor["dimension"], column["level"])
        reference_label = _level_label(factor["dimension"], column["reference"])
        terms.append({
            "key": f"{column['factor']}::{column['level']}",
            "metric": column["factor"],
            "selection": column["level"],
            "label": f"{level_label}",
            "group": factor["label"],
            "reference_level": reference_label,
            "unit": "",
            "estimate": estimate,
            "std_error": errors[index],
            "statistic": result["statistics"][index],  # type: ignore[index]
            "p_value": p_value,
            "effect": effect,
            "ci_low": ci_low,
            "ci_high": ci_high,
            "effect_kind": "percent" if link == "log" else "absolute",
            "significant": significant,
            "sentence": _factor_sentence(factor["label"], level_label, reference_label,
                                         effect, link, significant),
        })

    fitted: list[float] = result["fitted"]  # type: ignore[assignment]
    points = []
    for position, key in enumerate(keys):
        described = _describe_cell(key, request.unit)
        points.append({
            "key": key, "label": described["label"],
            "region": described["region"], "age": described["age"], "sex": described["sex"],
            "observed": observed[position], "fitted": fitted[position],
            # Valeur brute de chaque variable explicative pour cette cellule,
            # déjà calculée ci-dessus pour l'ajustement : le nuage du mode
            # guidé la lit directement au lieu de refaire la requête.
            "predictors": {
                f"{reference.metric}::{reference.selection or ''}": series[key]
                for reference, series in zip(request.predictors, predictor_series)
            },
        })

    warnings: list[dict[str, str]] = [{
        "level": "info",
        "text": "Un coefficient dit une association à variables tenues constantes, "
                "pas une cause. Une variable absente du modèle peut porter l'essentiel "
                "de ce qu'on lui attribue ici.",
    }]
    if result["n"] < 30:  # type: ignore[operator]
        warnings.append({
            "level": "warning",
            "text": f"{result['n']} observations : les écarts-types sont larges et un "
                    "effet réel peut très bien rester indétectable.",
        })
    if request.unit == "region_year":
        warnings.append({
            "level": "warning",
            "text": "Les années d'une même région ne sont pas indépendantes : "
                    "les p-values sont optimistes.",
        })

    return {
        "unit": request.unit,
        "unit_label": UNITS[request.unit]["label"],
        "response": {**response_definition, "key": request.response},
        "family": family,
        "link": link,
        "family_label": FAMILY_LABELS[family],
        "families": [
            {"key": key, "label": label,
             "available": key == "gaussian" or positive}
            for key, label in FAMILY_LABELS.items()
        ],
        "factors": [
            {"key": key, "label": FACTORS[key]["label"], "hint": FACTORS[key]["hint"],
             "active": key in chosen_factors}
            for key in allowed_factors
        ],
        "intercept": {
            "estimate": coefficients[0],
            "std_error": errors[0],
            "p_value": p_values[0],
        },
        "terms": terms,
        "fit": {
            "n": result["n"],
            "parameters": result["parameters"],
            "explained": result["explained"],
            "dispersion": result["dispersion"],
            "deviance": result["deviance"],
        },
        "points": points,
        "warnings": warnings,
    }
