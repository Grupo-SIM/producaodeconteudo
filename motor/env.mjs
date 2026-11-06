// Carrega o arquivo .env (sem dependências). Importado no topo de cada script: import './env.mjs';
// Procura primeiro em ./.env (pasta onde você rodou o comando), depois ao lado dos scripts.
// Variáveis que já existem no ambiente têm prioridade e nunca são sobrescritas pelo arquivo.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [...new Set([path.resolve(process.cwd(), '.env'), path.join(here, '.env')])];

export const envFile = candidates.find(f => fs.existsSync(f)) || null;

if (envFile) {
  for (const raw of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');            // comentário no fim da linha
    if (v !== '' && process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
