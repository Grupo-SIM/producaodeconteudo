#!/usr/bin/env bash
cd "$(dirname "$0")"
[ -f .env ] || { cp .env.example .env; echo "Preencha o .env e rode de novo."; exit 1; }
exec node server.js
