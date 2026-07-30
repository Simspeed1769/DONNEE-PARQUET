@echo off
title Calage DAMIR - Forsides
cd /d "%~dp0"
python -m pip install --user -q duckdb pandas openpyxl
python calage_damir.py
pause
