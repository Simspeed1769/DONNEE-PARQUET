@echo off
setlocal
title DAMIR Studio - Preparation
cd /d "%~dp0"

echo [1/3] Preparation de l'environnement Python...
if not exist "backend\.venv\Scripts\python.exe" (
    python -m venv "backend\.venv"
)
"backend\.venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
if errorlevel 1 goto :error

echo [2/3] Installation de l'interface...
call npm install --prefix "frontend"
if errorlevel 1 goto :error

echo [3/3] Construction de l'interface...
call npm run build --prefix "frontend"
if errorlevel 1 goto :error

echo.
echo DAMIR Studio est pret. Lancez maintenant lancer_damir_studio.bat.
pause
exit /b 0

:error
echo.
echo La preparation a echoue. Verifiez Python, Node.js et votre connexion.
pause
exit /b 1
