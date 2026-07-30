@echo off
title Explorateur Pathologies - Forsides
echo ============================================================
echo   EXPLORATEUR PATHOLOGIES - Forsides
echo ============================================================
echo   Verification des composants (rapide si deja installes,
echo   1-2 minutes la toute premiere fois)...
cd /d "%~dp0"
python -m pip install --user -q streamlit duckdb "plotly==5.24.1" pandas pyarrow kaleido==0.2.1
echo.
echo   Lancement de l'outil... le navigateur va s'ouvrir.
echo   Laissez cette fenetre ouverte pendant l'utilisation.
echo   (La fermer arrete l'outil.)
echo ============================================================
python -m streamlit run outil_patho.py
echo.
echo L'outil s'est arrete. Appuyez sur une touche pour fermer.
pause >nul
