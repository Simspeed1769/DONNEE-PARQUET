@echo off
title Rapport qualite DAMIR - Forsides
cd /d "%~dp0"
python -m pip install --user -q duckdb pandas openpyxl
python rapport_qualite.py
pause
