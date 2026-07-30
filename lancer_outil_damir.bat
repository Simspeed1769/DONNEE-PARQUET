@echo off
title Explorateur DAMIR - Forsides
echo ============================================================
echo   EXPLORATEUR DAMIR - Forsides
echo ============================================================
echo   Verification des composants (1-2 min la premiere fois)...
cd /d "%~dp0"
python -m pip install --user -q streamlit duckdb "plotly==5.24.1" pandas pyarrow kaleido==0.2.1 openpyxl
echo.
echo   Lancement... le navigateur va s'ouvrir.
echo   Laissez cette fenetre ouverte pendant l'utilisation.
echo ============================================================
python -m streamlit run outil_damir.py
pause
