@echo off
setlocal
title DAMIR Studio - Preparation
cd /d "%~dp0"

echo [1/4] Preparation de l'environnement Python...
if not exist "app\backend\.venv\Scripts\python.exe" (
    python -m venv "app\backend\.venv"
)
"app\backend\.venv\Scripts\python.exe" -m pip install -r "app\backend\requirements.txt"
if errorlevel 1 goto :error

echo [2/4] Installation de l'interface...
call npm install --prefix "app\frontend"
if errorlevel 1 goto :error

echo [3/4] Construction de l'interface...
call npm run build --prefix "app\frontend"
if errorlevel 1 goto :error

echo [4/4] Construction du cube compact (quelques minutes)...
if exist "data\cube_damir.parquet" (
    "app\backend\.venv\Scripts\python.exe" "tools\build_cube_compact.py"
    if errorlevel 1 goto :error
) else (
    echo   Cube source absent : etape ignoree.
)

echo.
echo DAMIR Studio est pret. Lancez maintenant DAMIR.bat.
pause
exit /b 0

:error
echo.
echo La preparation a echoue. Verifiez Python, Node.js et votre connexion.
pause
exit /b 1
