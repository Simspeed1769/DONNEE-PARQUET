@echo off
setlocal
title DAMIR Studio - Forsides
cd /d "%~dp0"

if not exist "backend\.venv\Scripts\python.exe" (
    echo DAMIR Studio n'est pas encore prepare.
    echo Lancez d'abord preparer.bat.
    pause
    exit /b 1
)

if not exist "frontend\dist\index.html" (
    echo L'interface n'est pas encore construite.
    echo Lancez d'abord preparer.bat.
    pause
    exit /b 1
)

echo DAMIR Studio est disponible sur http://127.0.0.1:8000
echo Laissez cette fenetre ouverte pendant l'utilisation.
"backend\.venv\Scripts\python.exe" "backend\run.py"
pause
