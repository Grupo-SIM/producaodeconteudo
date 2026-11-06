@echo off
cd /d "%~dp0"
if not exist app\docker-compose.yml (echo Rode primeiro o instalar-clippyme.bat & pause & exit /b 1)
docker info >nul 2>nul
if errorlevel 1 (echo Abra o Docker Desktop e tente de novo. & pause & exit /b 1)
cd app
docker compose up -d
echo ClippyMe ligado.
timeout /t 3 >nul
