@echo off
setlocal
title DAMIR Studio - Forsides
cd /d "%~dp0"

if not exist "app\backend\.venv\Scripts\python.exe" (
    echo DAMIR Studio n'est pas encore prepare.
    echo Lancez d'abord preparer.bat.
    pause
    exit /b 1
)

if not exist "app\frontend\dist\index.html" (
    echo L'interface n'est pas encore construite.
    echo Lancez d'abord preparer.bat.
    pause
    exit /b 1
)

echo DAMIR Studio est disponible sur http://127.0.0.1:8000
echo Laissez cette fenetre ouverte pendant l'utilisation.
"app\backend\.venv\Scripts\python.exe" "app\backend\run.py"
pause
