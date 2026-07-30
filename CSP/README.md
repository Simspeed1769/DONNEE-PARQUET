# Base CSP utilisée par DAMIR

Le dossier est séparé en trois niveaux :

- `raw/<année>/` contient les téléchargements INSEE originaux. Ils ne sont jamais lus par l’application.
- `Années/` est conservé comme dossier historique reçu ; certaines copies peuvent être incomplètes. La source de référence est `raw/<année>/` et son état est indiqué dans `csp_build_manifest.json`.
- `processed/csp_core_<année>.parquet` contient l’agrégat rapide d’une année (région, âge, sexe, niveau et code CSP, effectif pondéré, part).
- `csp_core.parquet` est le fichier consolidé chargé par DuckDB dans l’application.

Pour reconstruire après l’arrivée d’un nouveau fichier :

```powershell
python build_csp_dataset.py
```

Le script ignore automatiquement les archives incomplètes et écrit `csp_build_manifest.json` avec les années réellement disponibles. Les CSV et DBF sont lus en flux, sans extraction de plusieurs gigaoctets.

Attention à la nomenclature : les recensements 2015–2021 utilisent PCS 2003 (CS1/CS3), tandis que 2022–2023 utilisent PCS 2020 (GS/CS). L’évolution affichée par l’application est donc interprétable au niveau des 6 grands groupes ; les catégories détaillées restent consultables par millésime et portent leur nomenclature dans les métadonnées.
