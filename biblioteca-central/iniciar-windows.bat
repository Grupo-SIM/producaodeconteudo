@echo off
cd /d "%~dp0"
if not exist .env (copy .env.example .env >nul & echo Preencha o arquivo .env e abra de novo. & notepad .env & exit /b)
node server.js
pause
