@echo off
cd /d "%~dp0\app" 2>nul || (echo ClippyMe nao instalado. & pause & exit /b 1)
docker compose stop
echo ClippyMe desligado.
timeout /t 3 >nul
