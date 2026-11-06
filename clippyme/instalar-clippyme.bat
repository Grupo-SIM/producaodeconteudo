@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Instalando o ClippyMe (cortes de video)
echo ============================================
where docker >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Docker Desktop nao esta instalado.
  echo 1. Baixe em https://www.docker.com/products/docker-desktop
  echo 2. Instale, reinicie o computador se pedir e ABRA o Docker Desktop.
  echo 3. Rode este arquivo de novo.
  start "" https://www.docker.com/products/docker-desktop
  pause & exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo.
  echo O Docker Desktop esta instalado mas fechado. Abra-o, espere ficar verde e rode este arquivo de novo.
  pause & exit /b 1
)
if not exist app\docker-compose.yml (
  echo Baixando o ClippyMe do GitHub...
  powershell -NoProfile -Command "Invoke-WebRequest https://github.com/fralapo/clippyme/archive/refs/heads/main.zip -OutFile clippyme.zip; Expand-Archive clippyme.zip -DestinationPath tmp_cm -Force; Move-Item (Get-ChildItem tmp_cm | Select-Object -First 1).FullName app -Force; Remove-Item clippyme.zip, tmp_cm -Recurse -Force"
  if not exist app\docker-compose.yml (
    echo Nao consegui baixar. Veja a internet e tente de novo.
    pause & exit /b 1
  )
)
if not exist app\.env (
  > app\.env echo TRANSCRIPTION_PROVIDER=whisper
  >> app\.env echo CLIPPYME_BIND=127.0.0.1
)
echo.
echo Construindo (a primeira vez baixa alguns GB e demora varios minutos)...
cd app
docker compose up -d --build
if errorlevel 1 (
  echo Algo falhou na construcao. Mande uma foto desta tela para o suporte.
  pause & exit /b 1
)
echo.
echo Pronto! O ClippyMe esta ligado.
echo Falta so: colocar GEMINI_API_KEY=sua_chave no arquivo .env do painel (chave gratis em aistudio.google.com/apikey) e reiniciar o painel.
pause
