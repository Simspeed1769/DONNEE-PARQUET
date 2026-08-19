from __future__ import annotations

import io
import os
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

import duckdb
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from openpyxl import load_workbook

from .cache import DiskCache, fingerprint
from .exports import ExportSpec, csv_response, metadata_header, xlsx_response
from .analysis import (
    DIMENSIONS,
    METRICS,
    ExtractionRequest,
    analysis_metadata,
    extraction_columns,
    extraction_preview,
    extraction_rows,
    hierarchy_options,
)
from .csp import (
    CSP_DIMENSIONS,
    CSP_MEASURES,
    CspEvolutionRequest,
    CspExtractionRequest,
    CspOverviewRequest,
    csp_extraction_columns,
    csp_extraction_preview,
    csp_extraction_rows,
    csp_evolution,
    csp_metadata,
    csp_overview,
)
from .pathologies import (
    PATHOLOGY_DIMENSIONS,
    PATHOLOGY_MEASURES,
    PathologyExtractionRequest,
    PathologyOverviewRequest,
    pathology_extraction_columns,
    pathology_extraction_preview,
    pathology_extraction_rows,
    pathology_metadata,
    pathology_overview,
)
from .mortality import (
    MORTALITY_DIMENSIONS,
    MORTALITY_GROUPS,
    MORTALITY_MEASURES,
    MortalityExtractionRequest,
    MortalityOverviewRequest,
    mortality_extraction_columns,
    mortality_extraction_preview,
    mortality_extraction_rows,
    mortality_metadata,
    mortality_overview,
)
from .population import (
    POPULATION_DIMENSIONS,
    POPULATION_MEASURES,
    PopulationExtractionRequest,
    PopulationOverviewRequest,
    population_extraction_columns,
    population_extraction_preview,
    population_extraction_rows,
    population_metadata,
    population_overview,
)
from .correlations import catalogue
from .regression import RegressionRequest, regression
from .explore import ExploreRequest, OptionsRequest, aggregate_options, explore, filter_options
from .panorama import PanoramaRequest, panorama, reference_block
from .pivot import PivotRequest, pivot
from .studio import methodology, studio_metadata


from .repository import (
    CACHE_DIR,
    CSP_GEOJSON_PATH,
    DATA_DIR,
    DELAYS_PATH,
    FRONTEND_ASSETS,
    FRONTEND_DIST,
    REGIONS,
    TRANSCO_PATH,
    repository,
)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Cycle de vie du serveur : préchauffer avant de servir.

    Remplace `@app.on_event("startup")`, déprécié par FastAPI. `warm_caches` est
    définie plus bas dans le module, à côté du service de l'interface ; Python
    résout le nom à l'appel, donc l'ordre de lecture du fichier est préservé.
    """
    warm_caches()
    yield


app = FastAPI(
    title="DAMIR Studio API",
    description="API locale de consultation du cube Open DAMIR.",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def frontend_cache_control(request: Request, call_next):
    response = await call_next(request)
    content_type = response.headers.get("content-type", "")
    if request.url.path == "/" or content_type.startswith("text/html"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
        response.headers["Pragma"] = "no-cache"
    elif request.url.path.startswith("/assets/") and "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


DISK_CACHE = DiskCache(CACHE_DIR)

#: Version de la **forme** des métadonnées, à incrémenter dès qu'un champ y est
#: ajouté, retiré ou change de sens.
#:
#: Sans elle, l'empreinte du cache ne porte que sur les fichiers de données : un
#: poste dont le cube n'a pas bougé continuerait de servir l'ancienne charge
#: utile, et le champ nouveau n'arriverait jamais à l'écran. La panne est
#: silencieuse et trompeuse — le serveur est à jour, le front est à jour, et
#: c'est un fichier JSON qui décide. Constaté en ajoutant `completeness` au
#: point 3.4 : l'entrée en cache locale ne le contenait pas, et rien ne l'aurait
#: signalé.
METADATA_SCHEMA = 2


def _build_metadata() -> dict[str, Any]:
    base = repository.metadata()
    studio = studio_metadata(repository)
    base["default_start_year"] = 2015 if 2015 in base["years"] else min(base["years"])
    base["default_end_year"] = 2024 if 2024 in base["years"] else max(base["years"])
    return {**base, **analysis_metadata(repository, REGIONS), **studio}


@app.get("/api/meta")
@lru_cache(maxsize=1)
def metadata() -> dict[str, Any]:
    # Ces métadonnées coûtent plusieurs balayages du cube et ne changent qu'avec
    # les fichiers de données : le cache disque évite de les repayer à chaque
    # lancement, et l'empreinte les invalide dès qu'un cube bouge.
    token = f"v{METADATA_SCHEMA}-{fingerprint([repository.cube_path, DELAYS_PATH, TRANSCO_PATH])}"
    return DISK_CACHE.get_or_build("metadata", token, _build_metadata)


@app.get("/api/options")
def options(
    grand_post: str | None = None,
    post: str | None = None,
    sub_post: str | None = None,
) -> dict[str, Any]:
    return hierarchy_options(repository, grand_post, post, sub_post)


@lru_cache(maxsize=32)
def _pivot_cached(payload_json: str) -> dict[str, Any]:
    return pivot(repository, PivotRequest.model_validate_json(payload_json), REGIONS)


@app.post("/api/pivot")
def pivot_view(payload: PivotRequest) -> dict[str, Any]:
    """Le tableau croisé : deux dimensions, composantes brutes, formules.

    Comme `/api/explore`, cette route ne renvoie aucun indicateur calculé :
    changer de mesure ou d'agrégation se fait côté client, sans requête.
    """
    try:
        return _pivot_cached(payload.model_dump_json())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@lru_cache(maxsize=64)
def _explore_cached(payload_json: str) -> dict[str, Any]:
    return explore(repository, ExploreRequest.model_validate_json(payload_json), REGIONS)


@app.post("/api/explore")
def explore_view(payload: ExploreRequest) -> dict[str, Any]:
    # Revenir sur un découpage déjà consulté est fréquent — on compare, on
    # revient en arrière. Le cube ne bouge pas pendant une session : la réponse
    # peut donc être resservie telle quelle, sans nouveau balayage.
    try:
        return _explore_cached(payload.model_dump_json())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@lru_cache(maxsize=16)
def _panorama_reference_cached(perimeter_json: str) -> dict[str, Any]:
    """Le référentiel du panorama, mis en cache sur le seul périmètre.

    C'est le balayage complet du cube ; il ne dépend pas des prestations
    observées. Le séparer fait tomber « ajouter une prestation » — le geste
    central de l'écran — d'une lecture intégrale à une requête filtrée.
    """
    return reference_block(repository, PanoramaRequest.model_validate_json(perimeter_json), REGIONS)


@lru_cache(maxsize=64)
def _panorama_cached(payload_json: str) -> dict[str, Any]:
    payload = PanoramaRequest.model_validate_json(payload_json)
    perimeter = payload.model_copy(update={"subjects": []})
    reference = _panorama_reference_cached(perimeter.model_dump_json())
    return panorama(repository, payload, REGIONS, reference)


@app.post("/api/panorama")
def panorama_view(payload: PanoramaRequest) -> dict[str, Any]:
    """Un sujet — ou plusieurs — vu sous toutes ses dimensions à la fois.

    Ajouter puis retirer une prestation est le geste central de l'écran : le
    cache rend le retour en arrière immédiat, et le cube ne bouge pas pendant
    une session.
    """
    try:
        return _panorama_cached(payload.model_dump_json())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@lru_cache(maxsize=32)
def _options_aggregate_cached(payload_json: str) -> list[dict[str, Any]]:
    return aggregate_options(repository, OptionsRequest.model_validate_json(payload_json), REGIONS)


@app.post("/api/explore/options")
def explore_options_view(payload: OptionsRequest) -> dict[str, Any]:
    """Modalités disponibles pour le sélecteur de séries, classées par poids.

    Le classement ne dépend que du périmètre : il est mis en cache sans le texte
    cherché, de sorte que la recherche au clavier ne relance pas un balayage du
    cube à chaque touche.
    """
    try:
        # `query` et `limit` sont neutralisés pour que la clé de cache ne porte
        # que le périmètre ; `aggregate_options` ne les lit pas.
        scope = payload.model_copy(update={"query": "", "limit": 1})
        options = _options_aggregate_cached(scope.model_dump_json())
        return {
            "breakdown": payload.breakdown or "none",
            **filter_options(options, payload.query, payload.limit),
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@lru_cache(maxsize=1)
def _correlation_catalogue() -> dict[str, Any]:
    return catalogue(repository)


@app.get("/api/correlations/meta")
def correlation_meta_view() -> dict[str, Any]:
    return _correlation_catalogue()


# `POST /api/correlations` est parti avec l'écran avancé (point 1.6), et
# `correlate()` avec lui au point 2.2 : Croisements passe par la régression,
# qui répond à la même question en tenant l'âge et le sexe constants.


@lru_cache(maxsize=64)
def _regression_cached(payload_json: str) -> dict[str, Any]:
    return regression(repository, RegressionRequest.model_validate_json(payload_json))


@app.post("/api/correlations/regression")
def regression_view(payload: RegressionRequest) -> dict[str, Any]:
    try:
        return _regression_cached(payload.model_dump_json())
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/methodology")
def methodology_view() -> dict[str, Any]:
    return methodology(repository)


@app.get("/api/pathologies/meta")
def pathologies_metadata_view() -> dict[str, Any]:
    try:
        return pathology_metadata(repository)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/pathologies/overview")
def pathologies_overview_view(payload: PathologyOverviewRequest) -> dict[str, Any]:
    try:
        return pathology_overview(repository, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/csp/meta")
def csp_metadata_view() -> dict[str, Any]:
    try:
        return csp_metadata(repository)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/csp/overview")
def csp_overview_view(payload: CspOverviewRequest) -> dict[str, Any]:
    try:
        return csp_overview(repository, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/csp/evolution")
def csp_evolution_view(payload: CspEvolutionRequest) -> dict[str, Any]:
    try:
        return csp_evolution(repository, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/population/meta")
def population_metadata_view() -> dict[str, Any]:
    try:
        return population_metadata(repository)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/population/overview")
def population_overview_view(payload: PopulationOverviewRequest) -> dict[str, Any]:
    try:
        return population_overview(repository, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/population/extraction/preview")
def population_extraction_preview_view(payload: PopulationExtractionRequest) -> dict[str, Any]:
    try:
        return population_extraction_preview(repository, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _population_spec(payload: PopulationExtractionRequest) -> ExportSpec:
    try:
        rows = population_extraction_rows(repository, payload)
        columns = population_extraction_columns(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    metadata = population_metadata(repository)
    return ExportSpec(
        filename="population_extraction",
        columns=columns,
        rows=rows,
        widths={"year": 12, "region": 32, "age": 18, "sex": 14, "population": 18, "share": 20},
        metadata=[
            *metadata_header(metadata["source"]),
            ["Champ", metadata["scope"]],
            ["Période", f"{payload.start_year}–{payload.end_year}"],
            ["Dimensions", ", ".join(POPULATION_DIMENSIONS[key][0] for key in payload.dimensions)],
            ["Mesures", ", ".join(POPULATION_MEASURES[key][0] for key in payload.measures)],
            ["Précaution", "Population au 1er janvier : ce n’est pas une population moyenne annuelle."],
            ["Valeurs absentes", "Une cellule non publiée reste vide et n’est jamais remplacée par zéro."],
        ],
    )


@app.post("/api/population/extraction.csv")
def population_extraction_csv(payload: PopulationExtractionRequest) -> StreamingResponse:
    return csv_response(_population_spec(payload))


@app.post("/api/population/extraction.xlsx")
def population_extraction_xlsx(payload: PopulationExtractionRequest) -> StreamingResponse:
    return xlsx_response(_population_spec(payload))


@app.get("/api/mortality/meta")
def mortality_metadata_view() -> dict[str, Any]:
    try:
        return mortality_metadata(repository)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/mortality/overview")
def mortality_overview_view(payload: MortalityOverviewRequest) -> dict[str, Any]:
    try:
        return mortality_overview(repository, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/mortality/extraction/preview")
def mortality_extraction_preview_view(payload: MortalityExtractionRequest) -> dict[str, Any]:
    try:
        return mortality_extraction_preview(repository, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _mortality_spec(payload: MortalityExtractionRequest) -> ExportSpec:
    try:
        rows = mortality_extraction_rows(repository, payload)
        columns = mortality_extraction_columns(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    metadata = mortality_metadata(repository)
    cause = next((item for item in metadata["causes"] if item["code"] == payload.cause), None)
    return ExportSpec(
        filename="mortalite_extraction",
        columns=columns,
        rows=rows,
        widths={"year": 12, "cause": 48, "population": 24, "deaths": 18, "share": 20},
        metadata=[
            *metadata_header(metadata["source"]),
            ["Champ", metadata["scope"]],
            ["Période", f"{payload.start_year}–{payload.end_year}"],
            ["Cause", cause["label"] if cause else "Toutes les causes disponibles"],
            ["Population", MORTALITY_GROUPS.get(payload.population, "Tous les périmètres publiés")],
            ["Dimensions", ", ".join(MORTALITY_DIMENSIONS[key][0] for key in payload.dimensions)],
            ["Mesures", ", ".join(MORTALITY_MEASURES[key][0] for key in payload.measures)],
            ["Précaution", "Effectifs bruts non rapportés à une population exposée ; aucune comparaison de risque ne doit être déduite."],
            ["Valeurs absentes", "Une cellule non disponible ou non applicable reste vide et n’est jamais remplacée par zéro."],
        ],
    )


@app.post("/api/mortality/extraction.csv")
def mortality_extraction_csv(payload: MortalityExtractionRequest) -> StreamingResponse:
    return csv_response(_mortality_spec(payload))


@app.post("/api/mortality/extraction.xlsx")
def mortality_extraction_xlsx(payload: MortalityExtractionRequest) -> StreamingResponse:
    return xlsx_response(_mortality_spec(payload))


def _csp_spec(payload: CspExtractionRequest) -> ExportSpec:
    try:
        rows = csp_extraction_rows(repository, payload)
        columns = csp_extraction_columns(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    metadata = csp_metadata(repository)
    level = next(item for item in metadata["levels"] if item["key"] == payload.level)
    csp = next((item for item in level["options"] if item["code"] == payload.csp_code), None)
    return ExportSpec(
        filename=f"csp_extraction_{payload.year}",
        columns=columns,
        rows=rows,
        widths={"year": 12, "region": 32, "age": 18, "sex": 14, "csp": 44, "effectif": 18, "share": 20},
        metadata=[
            *metadata_header(metadata.get("source", "Recensement de la population · Insee")),
            ["Millésime", payload.year],
            ["Champ", "Actifs ayant un emploi (TACT = 11)"],
            ["Niveau CSP", level["label"]],
            ["CSP", csp["label"] if csp else payload.csp_code],
            ["Dimensions", ", ".join(CSP_DIMENSIONS[key][0] for key in payload.dimensions)],
            ["Mesures", ", ".join(CSP_MEASURES[key][0] for key in payload.measures)],
            ["Pondération", "Effectifs calculés avec le poids individuel IPONDI"],
        ],
    )


# Les trois routes qui suivent avaient disparu au commit 3604991, quand les cinq
# blocs CSV + Excel ont fusionné dans `ExportSpec`. Le message annonçait « rien
# n'est perdu » : les exports, en effet, ont survécu — mais les aperçus de DAMIR,
# Pathologies et CSP répondaient 405 depuis, soit trois des cinq sources, dont la
# principale. Les fonctions sous-jacentes, elles, n'avaient jamais cessé d'être
# importées : seules les déclarations manquaient.
@app.post("/api/csp/extraction/preview")
def csp_extraction_preview_view(payload: CspExtractionRequest) -> dict[str, Any]:
    try:
        return csp_extraction_preview(repository, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/csp/extraction.csv")
def csp_extraction_csv(payload: CspExtractionRequest) -> StreamingResponse:
    return csv_response(_csp_spec(payload))


@app.post("/api/csp/extraction.xlsx")
def csp_extraction_xlsx(payload: CspExtractionRequest) -> StreamingResponse:
    return xlsx_response(_csp_spec(payload))


def _pathologies_spec(payload: PathologyExtractionRequest) -> ExportSpec:
    try:
        rows = pathology_extraction_rows(repository, payload)
        columns = pathology_extraction_columns(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return ExportSpec(
        filename="pathologies_extraction",
        columns=columns,
        rows=rows,
        widths={"year": 12, "region": 32, "age": 18, "sex": 14, "patients": 18, "prevalence": 20},
        # Une décimale, comme DAMIR : une prévalence se lit à 0,1 point près.
        percent_format="0.0",
        metadata=[
            *metadata_header("Cartographie des pathologies · Cnam"),
            ["Code pathologie", payload.top],
            ["Période", f"{payload.start_year}–{payload.end_year}"],
            ["Dimensions", ", ".join(PATHOLOGY_DIMENSIONS[key][0] for key in payload.dimensions)],
            ["Mesures", ", ".join(PATHOLOGY_MEASURES[key][0] for key in payload.measures)],
            ["Secret statistique", "Les effectifs inférieurs à 10 patients peuvent être masqués à la source."],
        ],
    )


@app.post("/api/pathologies/extraction/preview")
def pathologies_extraction_preview_view(payload: PathologyExtractionRequest) -> dict[str, Any]:
    try:
        return pathology_extraction_preview(repository, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/pathologies/extraction.csv")
def pathologies_extraction_csv(payload: PathologyExtractionRequest) -> StreamingResponse:
    return csv_response(_pathologies_spec(payload))


@app.post("/api/pathologies/extraction.xlsx")
def pathologies_extraction_xlsx(payload: PathologyExtractionRequest) -> StreamingResponse:
    return xlsx_response(_pathologies_spec(payload))


def _damir_spec(payload: ExtractionRequest) -> ExportSpec:
    """L'export DAMIR : le seul qui embarque un dictionnaire des mesures.

    C'est ce que `extra_blocks` sert : sous les métadonnées, un tableau
    Mesure / Définition / Formule / Précaution, puis l'état de consolidation.
    Un fichier de remboursements qui circule sans dire jusqu'où l'exercice est
    liquidé se lit comme une baisse là où il n'y a qu'un décalage.
    """
    try:
        rows = extraction_rows(repository, payload, REGIONS)
        columns = extraction_columns(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    method = methodology(repository)
    definitions = {item["key"]: item for item in method["measures"]}
    dictionary = [["Mesure", "Définition", "Formule", "Précaution"]]
    for key in payload.measures:
        item = definitions.get(key)
        if item:
            dictionary.append([item["label"], item["definition"], item["formula"], item["caveat"] or ""])

    return ExportSpec(
        filename="damir_extraction_avancee",
        columns=columns,
        rows=rows,
        widths={"year": 12, "region": 32, "age": 18, "sex": 14, "grand_post": 40,
                "post": 40, "sub_post": 40, "service": 44},
        # Une décimale : un taux de prise en charge se lit à 0,1 point près.
        percent_format="0.0",
        metadata=[
            *metadata_header("Open DAMIR · Assurance Maladie"),
            ["Période", f"{payload.start_year}–{payload.end_year}"],
            ["Grand poste", payload.grand_post or "Tous"],
            ["Poste", payload.post or "Tous"],
            ["Sous-poste", payload.sub_post or "Tous"],
            ["Prestations", ", ".join(map(str, payload.service_codes)) or "Toutes"],
            ["Sexes", ", ".join(map(str, payload.sexes)) or "Tous"],
            ["Âges", ", ".join(map(str, payload.ages)) or "Tous"],
            ["Régions", ", ".join(map(str, payload.regions)) or "Toutes"],
            ["Assurances", ", ".join(map(str, payload.insurances)) or "Toutes"],
            ["Enveloppes", ", ".join(map(str, payload.envelopes)) or "Toutes"],
            ["ALD", "Toutes" if payload.ald is None else "ALD" if payload.ald == 1 else "Hors ALD"],
            ["Dimensions", ", ".join(DIMENSIONS[key][0] for key in payload.dimensions)],
            ["Mesures", ", ".join(METRICS[key].label for key in payload.measures)],
        ],
        extra_blocks=[
            dictionary,
            [["Consolidation", method["reliability"].get("status", "Indisponible")]],
        ],
    )


@app.post("/api/extraction/preview")
def extraction_preview_view(payload: ExtractionRequest) -> dict[str, Any]:
    try:
        return extraction_preview(repository, payload, REGIONS)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/api/extraction.csv")
def extraction_csv(payload: ExtractionRequest) -> StreamingResponse:
    return csv_response(_damir_spec(payload))


@app.post("/api/extraction.xlsx")
def extraction_xlsx(payload: ExtractionRequest) -> StreamingResponse:
    return xlsx_response(_damir_spec(payload))


def _recoverable_logical_name(asset_name: str, suffix: str) -> str | None:
    """Retrouve le nom logique d'un asset périmé, d'après ce qui est sur le disque.

    Vite nomme ses fichiers `<nom logique>-<empreinte>.<ext>`. Quand un onglet
    resté ouvert redemande un fichier d'une construction précédente, il faut
    reconnaître ce nom logique pour lui servir la version courante.

    Cette liste était tenue à la main, et elle avait dérivé : elle citait encore
    `ExplorePage` et `vendor-plotly`, disparus, et ignorait `PopulationPage`,
    `CorrelationsPage` et `DamirPage` — c'est-à-dire que la reprise ne couvrait
    aucun des écrans récents. On la dérive donc des fichiers présents : ajouter
    un écran ne demande plus de penser à l'inscrire ici.

    Le découpage se fait sur les tirets, et on retient la correspondance la plus
    longue : `vendor-react-ABC.js` doit se rattacher à `vendor-react`, pas à
    `vendor` — sans quoi une demande pour l'un pourrait servir l'autre.
    """
    prefixes: set[str] = set()
    for path in FRONTEND_ASSETS.glob(f"*{suffix}"):
        parts = path.name[: -len(suffix)].split("-") if suffix else path.name.split("-")
        # Le dernier segment est l'empreinte : il ne peut pas être un nom logique.
        for cut in range(1, len(parts)):
            prefixes.add("-".join(parts[:cut]))
    matches = [name for name in prefixes if asset_name.startswith(f"{name}-")]
    return max(matches, key=len) if matches else None


@app.get("/assets/{asset_name}")
def frontend_asset(asset_name: str) -> FileResponse:
    """Serve hashed assets and recover transparently from a stale HTML bundle."""
    if Path(asset_name).name != asset_name:
        raise HTTPException(status_code=404, detail="Fichier d’interface introuvable.")
    requested = FRONTEND_ASSETS / asset_name
    if requested.is_file():
        return FileResponse(
            requested,
            headers={"Cache-Control": "public, max-age=31536000, immutable"},
        )

    suffix = Path(asset_name).suffix
    logical_name = _recoverable_logical_name(asset_name, suffix)
    if logical_name:
        candidates = sorted(
            FRONTEND_ASSETS.glob(f"{logical_name}-*{suffix}"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        if candidates:
            return FileResponse(
                candidates[0],
                headers={
                    "Cache-Control": "no-store, no-cache, must-revalidate",
                    "X-DAMIR-Asset-Recovered": "1",
                },
            )
    raise HTTPException(status_code=404, detail="Fichier d’interface introuvable.")


def warm_caches() -> None:
    """Prépare les métadonnées et la première vue pendant que le navigateur démarre.

    Le navigateur met environ une seconde à s'ouvrir et à charger l'interface.
    Ce temps était jusqu'ici perdu : le serveur ne commençait à calculer qu'à la
    première requête. Le préchauffage occupe cette fenêtre, si bien que les
    réponses sont généralement déjà prêtes quand l'interface les demande.

    Le fil est démarré en arrière-plan : si le préchauffage échoue ou traîne,
    le serveur répond quand même, simplement sans l'avance prise.
    """

    def prepare() -> None:
        try:
            years = metadata()["years"]
            span = (min(years), max(years)) if years else (2015, 2024)
            explore_view(ExploreRequest(
                start_year=span[0], end_year=span[1], breakdown="grand_post",
            ))
            # Le classement des 1 342 prestations coûte un balayage complet ;
            # le payer ici rend instantanée la première ouverture du sélecteur.
            _options_aggregate_cached(OptionsRequest(
                start_year=span[0], end_year=span[1], breakdown="service", limit=1,
            ).model_dump_json())
        except Exception as exc:  # noqa: BLE001 - un préchauffage ne doit jamais tuer le serveur
            print(f"[DAMIR] préchauffage interrompu : {exc}")

    threading.Thread(target=prepare, name="damir-warmup", daemon=True).start()


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
