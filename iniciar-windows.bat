@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao 22 ou mais nova em https://nodejs.org e rode de novo.
  pause & exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo Foi criado o arquivo .env. Troque apenas ADMIN_PASSWORD pela sua senha, salve e feche o Bloco de Notas.
  notepad .env
)
set "VELHO="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":3000 .*LISTENING"') do set "VELHO=%%p"
if defined VELHO (
  echo Havia um painel antigo aberto (processo %VELHO%^). Fechando para abrir a versao nova...
  taskkill /PID %VELHO% /F >nul 2>nul
  timeout /t 2 /nobreak >nul
)
if exist clippyme\app\docker-compose.yml (
  docker info >nul 2>nul
  if not errorlevel 1 (
    echo Ligando o ClippyMe em segundo plano...
    start "" /min cmd /c "clippyme\iniciar-clippyme.bat"
  ) else echo Docker Desktop fechado: o ClippyMe nao foi ligado.
)
echo Abrindo o Agentes SIM em http://localhost:3000  (feche esta janela para parar)
start "" http://localhost:3000
node --disable-warning=ExperimentalWarning server.js
pause
