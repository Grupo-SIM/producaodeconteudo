@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo === Instalando o motor de video do Agentes SIM (so precisa fazer uma vez) ===
where node >nul 2>nul || (echo Node.js nao encontrado. Instale em https://nodejs.org & pause & exit /b 1)
where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo Instalando o ffmpeg com o winget...
  winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
  echo.
  echo Feche esta janela e rode este arquivo de novo para o Windows reconhecer o ffmpeg.
  pause & exit /b 0
)
if not exist package-lock.json if not exist node_modules call npm init -y >nul 2>nul
call npm i playwright --no-audit --no-fund
call npx playwright install chromium
echo.
echo Pronto. Abra o iniciar-windows.bat e confira em Configuracoes ^> Motor de video.
pause
