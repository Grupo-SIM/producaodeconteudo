// Agentes SIM — Criação autônoma de conteúdo
// Zero dependências: Node >= 22.13 (node:sqlite, fetch nativo).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import dns from 'node:dns';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { ESTILOS_MOTION, ESTILO_HARDCOPY } from './motor/estilos-motion.mjs';
import { avaliaFoto, acabamentoCapa, amplia2x, arquivoTemp } from './motor/qualidade-foto.mjs';
import { ICONES as ICONES_DESENHOS, FONTES as FONTES_ARTE, camadas as camadasArte } from './public/arte-slide.js';
import * as CM from './motor/clippyme.mjs';
import { comporSlide, contexto as ctxModelo, MODELOS as MODELOS_ARTE, MODELO_IDS, corEmIngles } from './public/arte-modelos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ───────────────────────── Configuração (.env) ─────────────────────────
// Lê um arquivo de ambiente aceitando o que o Bloco de Notas faz: BOM, UTF-16 e o nome escondido “.env.txt”
function lerArquivoEnv(file) {
  const b = fs.readFileSync(file);
  if (b[0] === 0xFF && b[1] === 0xFE) return b.toString('utf16le').replace(/^\uFEFF/, '');
  if (b[0] === 0xFE && b[1] === 0xFF) return Buffer.from(b.subarray(2)).swap16().toString('utf16le');
  return b.toString('utf8').replace(/^\uFEFF/, '');
}
const ENV_FILES = ['.env', '.env.txt', '.env.txt.txt'].map(n => path.join(__dirname, n));
const envAtivo = () => ENV_FILES.find(f => fs.existsSync(f)) || null;
function parseEnv(txt, over) {
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/); if (!m || /^\s*#/.test(line)) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2').trim(); if (v && (over || !(m[1] in process.env))) process.env[m[1]] = v;
  }
}
function loadEnv() { const f = envAtivo(); if (f) parseEnv(lerArquivoEnv(f), false); }
loadEnv();
// Relê o .env a cada render: o que está no arquivo vale mais que variáveis antigas do ambiente, sem precisar reiniciar o painel
function reloadEnv() { const f = envAtivo(); if (f) parseEnv(lerArquivoEnv(f), true); }

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));   // sempre absoluto: o render roda em outra pasta (cwd) e um caminho relativo quebrava
const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const API_BASE = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const als = new AsyncLocalStorage();
class DryRun extends Error { constructor(p) { super('dry'); this.prompt = p; } }
const BUILD = '2026-11-07.226'; // tem de ser igual ao UI_BUILD do public/index.html
// Um erro solto numa tarefa de fundo não pode derrubar o painel (era isso que dava "Failed to fetch" no navegador): registra e segue
process.on('uncaughtException', e => { try { console.error('[erro não tratado]', e && e.stack || e); } catch { } });
process.on('unhandledRejection', e => { try { console.error('[promessa rejeitada]', e && e.stack || e); } catch { } });
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-5-5';

if (ADMIN_PASSWORD.length < 8) {
  console.error('✖ Defina ADMIN_PASSWORD (mínimo 8 caracteres) no arquivo .env');
  process.exit(1);
}
fs.mkdirSync(DATA_DIR, { recursive: true });

// ───────────── Levar tudo para outro painel: pacote .tar.gz (banco + arquivos), exportado num painel e importado no outro ─────────────
const BK_PASTAS = ['assets', 'layouts', 'poses'], BK_PENDENTE = path.join(DATA_DIR, '_importar.tar.gz');
const tarOctal = (n, len) => Buffer.from(n.toString(8).padStart(len - 1, '0') + '\0', 'latin1');
function tarCabecalho(nome, tam, mtime) {
  const h = Buffer.alloc(512); let pre = '', nm = nome;
  if (Buffer.byteLength(nm) > 100) { const i = nm.lastIndexOf('/', 155); if (i > 0) { pre = nm.slice(0, i); nm = nm.slice(i + 1); } }
  h.write(nm, 0, 100, 'utf8'); tarOctal(0o644, 8).copy(h, 100); tarOctal(0, 8).copy(h, 108); tarOctal(0, 8).copy(h, 116); tarOctal(tam, 12).copy(h, 124); tarOctal(Math.floor(mtime / 1000), 12).copy(h, 136);
  h.fill(0x20, 148, 156); h.write('0', 156); h.write('ustar\0', 257, 'latin1'); h.write('00', 263, 'latin1'); if (pre) h.write(pre, 345, 155, 'utf8');
  let soma = 0; for (const b of h) soma += b; h.write(soma.toString(8).padStart(6, '0') + '\0 ', 148, 'latin1'); return h;
}
function tarLer(buf) {   // devolve [{ nome, dados }] (só arquivos comuns)
  const out = []; let o = 0;
  while (o + 512 <= buf.length) {
    const h = buf.subarray(o, o + 512); if (h.every(b => b === 0)) break;
    const str = (a, b) => h.toString('utf8', a, b).replace(/\0.*$/s, ''), tam = parseInt(str(124, 136).trim() || '0', 8), tipo = String.fromCharCode(h[156] || 48), pre = str(345, 500), nome = (pre ? pre + '/' : '') + str(0, 100);
    if (!Number.isFinite(tam) || tam < 0 || o + 512 + tam > buf.length) throw new Error('pacote corrompido');
    if (tipo === '0' || tipo === '\0') out.push({ nome, dados: buf.subarray(o + 512, o + 512 + tam) });
    o += 512 + Math.ceil(tam / 512) * 512;
  }
  return out;
}
const bkNomeOk = n => n === 'studio.db' || n === 'secret.key' || n === 'manifesto.json' || new RegExp('^(' + BK_PASTAS.join('|') + ')/[A-Za-z0-9._ -]{1,120}$').test(n);
function bkValida(buf) {
  const arqs = tarLer(zlib.gunzipSync(buf)).filter(a => bkNomeOk(a.nome));
  if (!arqs.some(a => a.nome === 'studio.db' && a.dados.subarray(0, 15).toString('latin1') === 'SQLite format 3')) throw new Error('Este arquivo não é um pacote deste painel (falta o banco de dados).');
  return arqs;
}
(function aplicaImportacao() {   // roda ANTES de abrir o banco: o pacote enviado substitui os dados, e os dados antigos ficam guardados numa pasta _antes_importar_*
  if (!fs.existsSync(BK_PENDENTE)) return;
  const antes = path.join(DATA_DIR, '_antes_importar_' + new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)), movidos = [];
  try {
    const arqs = bkValida(fs.readFileSync(BK_PENDENTE)); fs.mkdirSync(antes, { recursive: true });
    for (const n of ['studio.db', 'studio.db-wal', 'studio.db-shm', 'secret.key', ...BK_PASTAS]) { const f = path.join(DATA_DIR, n); if (fs.existsSync(f)) { fs.renameSync(f, path.join(antes, n)); movidos.push(n); } }
    for (const a of arqs) { if (a.nome === 'manifesto.json') continue; const f = path.join(DATA_DIR, a.nome); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, a.dados); }
    fs.unlinkSync(BK_PENDENTE); console.log(`✔ Pacote importado (${arqs.length} arquivos). Os dados de antes ficaram em ${antes}`);
  } catch (e) {
    console.error('✖ Importação do pacote falhou, voltando os dados de antes:', e.message);
    for (const n of [...movidos, 'studio.db', 'secret.key', ...BK_PASTAS]) { try { const o = path.join(antes, n), d = path.join(DATA_DIR, n); if (movidos.includes(n)) { fs.rmSync(d, { recursive: true, force: true }); fs.renameSync(o, d); } } catch { /* segue */ } }
    try { fs.unlinkSync(BK_PENDENTE); } catch { /* já removido */ }
  }
})();

let SECRET;
const secretFile = path.join(DATA_DIR, 'secret.key');
if (fs.existsSync(secretFile)) SECRET = fs.readFileSync(secretFile, 'utf8').trim();
else {
  SECRET = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, SECRET, { mode: 0o600 });
}

// ───────────────────────── Banco de dados ─────────────────────────
const db = new DatabaseSync(path.join(DATA_DIR, 'studio.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
db.exec(`
CREATE TABLE IF NOT EXISTS agents(
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT, color TEXT,
  prompt TEXT NOT NULL, model TEXT DEFAULT '', enabled INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS manuais(
  code TEXT PRIMARY KEY, titulo TEXT NOT NULL, conteudo TEXT NOT NULL, original TEXT NOT NULL,
  editado INTEGER DEFAULT 0, auto INTEGER DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, category TEXT NOT NULL,
  content TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contents(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, format TEXT NOT NULL, kind TEXT NOT NULL,
  platform TEXT DEFAULT '', brief TEXT DEFAULT '', status TEXT NOT NULL,
  score REAL, revisions INTEGER DEFAULT 0, script TEXT DEFAULT '', art TEXT DEFAULT '', video TEXT DEFAULT '',
  caption TEXT DEFAULT '', review TEXT DEFAULT '', pack TEXT DEFAULT '', error TEXT DEFAULT '',
  scheduled_at TEXT, posted_at TEXT, post_url TEXT DEFAULT '', created_by TEXT DEFAULT 'manual',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, content_id INTEGER REFERENCES contents(id) ON DELETE CASCADE,
  agent TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
  input TEXT DEFAULT '{}', output TEXT DEFAULT '', error TEXT DEFAULT '', attempts INTEGER DEFAULT 0,
  origin TEXT DEFAULT 'auto', cday TEXT, day TEXT, run_after TEXT,
  created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT, tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, id);
CREATE INDEX IF NOT EXISTS jobs_content ON jobs(content_id);
CREATE TABLE IF NOT EXISTS activity(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, agent TEXT, message TEXT NOT NULL, content_id INTEGER
);
CREATE TABLE IF NOT EXISTS metrics(
  id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT NOT NULL, platform TEXT DEFAULT '', post_title TEXT DEFAULT '',
  content_id INTEGER REFERENCES contents(id) ON DELETE SET NULL,
  views INTEGER DEFAULT 0, likes INTEGER DEFAULT 0, comments INTEGER DEFAULT 0, shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0, followers INTEGER DEFAULT 0, notes TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'custom', perms TEXT NOT NULL DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, last_login TEXT DEFAULT '');
`);
for (const col of ['learn', 'avoid', 'nick']) {
  if (!db.prepare('PRAGMA table_info(agents)').all().some(c => c.name === col)) db.exec(`ALTER TABLE agents ADD COLUMN ${col} TEXT DEFAULT ''`);
}

// Voz da marca (só no Tom de voz): provedor, nome e ID da voz para a narração dos vídeos
for (const col of ['voice_provider', 'voice_name', 'voice_id']) if (!db.prepare('PRAGMA table_info(knowledge)').all().some(c => c.name === col)) db.exec(`ALTER TABLE knowledge ADD COLUMN ${col} TEXT DEFAULT ''`);
// Marcas: itens de conhecimento passam a poder pertencer a uma marca
db.exec('CREATE TABLE IF NOT EXISTS brands(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE, created_at TEXT NOT NULL)');
if (!db.prepare('PRAGMA table_info(knowledge)').all().some(c => c.name === 'brand')) {
  db.exec("ALTER TABLE knowledge ADD COLUMN brand TEXT DEFAULT ''");
  for (const k of db.prepare("SELECT id,title FROM knowledge WHERE category='marca'").all()) {
    const m = String(k.title).match(/^(?:Identidade visual|Marca)\s*[—–-]\s*(.+)$/i);
    if (m) db.prepare('UPDATE knowledge SET brand=? WHERE id=?').run(m[1].trim().slice(0, 80), k.id);
  }
}
db.exec(`CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT DEFAULT '', name TEXT NOT NULL, type TEXT DEFAULT 'outro', url TEXT DEFAULT '', price TEXT DEFAULT '',
  deliverable TEXT DEFAULT '', promise TEXT DEFAULT '', audience TEXT DEFAULT '', pains TEXT DEFAULT '', objections TEXT DEFAULT '',
  bonus TEXT DEFAULT '', guarantee TEXT DEFAULT '', page_text TEXT DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
)`);
if (!db.prepare('PRAGMA table_info(products)').all().some(c => c.name === 'image')) db.exec('ALTER TABLE products ADD COLUMN image INTEGER DEFAULT 0');
// Catálogo único de produtos: um produto pode servir a várias marcas (ligação N:N). Sem ligação = produto geral.
const pbExistia = !!db.prepare("SELECT 1 x FROM sqlite_master WHERE type='table' AND name='product_brands'").get();
db.exec(`CREATE TABLE IF NOT EXISTS product_brands(product_id INTEGER NOT NULL, brand TEXT NOT NULL, PRIMARY KEY(product_id, brand))`);
if (!pbExistia) db.exec("INSERT OR IGNORE INTO product_brands(product_id,brand) SELECT id, brand FROM products WHERE brand<>''");
for (const [col, def] of [['owner_asks', "TEXT DEFAULT '[]'"], ['copy_review', "TEXT DEFAULT ''"], ['materia', "TEXT DEFAULT ''"], ['seo_review', "TEXT DEFAULT ''"], ['goal', "TEXT DEFAULT ''"], ['art_spec_base', "TEXT DEFAULT ''"], ['spec_base', "TEXT DEFAULT ''"], ['spec_edit_at', "TEXT DEFAULT ''"], ['product_id', 'INTEGER'], ['brand', "TEXT DEFAULT ''"], ['spec', "TEXT DEFAULT ''"], ['prod_revisions', 'INTEGER DEFAULT 0'], ['art_spec', "TEXT DEFAULT ''"], ['art_status', "TEXT DEFAULT ''"], ['art_note', "TEXT DEFAULT ''"], ['render_status', "TEXT DEFAULT ''"], ['teste', 'INTEGER DEFAULT 0'], ['manager', "TEXT DEFAULT ''"]]) {
  if (!db.prepare('PRAGMA table_info(contents)').all().some(c => c.name === col)) db.exec(`ALTER TABLE contents ADD COLUMN ${col} ${def}`);
}
// Migração dos formatos antigos (2026-10-14.17): formato = onde posta; texto/carta de vendas viraram TIPO de conteúdo
db.exec(`UPDATE contents SET format='video_vertical' WHERE format='reel';
UPDATE contents SET format='video_horizontal' WHERE format='video_longo';
UPDATE contents SET format='feed' WHERE format='post';
UPDATE contents SET kind='carta_vendas', format='feed' WHERE format='carta_vendas';
UPDATE contents SET kind='texto', format='feed' WHERE format='texto';`);
db.exec(`CREATE TABLE IF NOT EXISTS assets(
  id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT DEFAULT '', name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'outro',
  tags TEXT DEFAULT '', filename TEXT NOT NULL, ext TEXT NOT NULL, size INTEGER DEFAULT 0, created_at TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS poses(
  id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT DEFAULT '', mascot TEXT NOT NULL, key TEXT NOT NULL, label TEXT DEFAULT '', desc TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'gerando', error TEXT DEFAULT '', asset_id INTEGER, cost REAL DEFAULT 0, created_at TEXT NOT NULL
)`);
db.exec(`CREATE TABLE IF NOT EXISTS gen_costs(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, kind TEXT NOT NULL, model TEXT DEFAULT '', usd REAL NOT NULL, ref TEXT DEFAULT '')`);
for (const [col, def] of [['dur', 'REAL DEFAULT 0'], ['w', 'INTEGER DEFAULT 0'], ['h', 'INTEGER DEFAULT 0'], ['note', "TEXT DEFAULT ''"], ['colecao', "TEXT DEFAULT ''"], ['ficha', "TEXT DEFAULT ''"], ['ficha_status', "TEXT DEFAULT ''"], ['pasta', "TEXT DEFAULT ''"]]) {
  if (!db.prepare('PRAGMA table_info(assets)').all().some(c => c.name === col)) db.exec(`ALTER TABLE assets ADD COLUMN ${col} ${def}`);
}
if (!db.prepare("SELECT 1 x FROM settings WHERE key='lib_sec_v1'").get()) { db.exec("UPDATE assets SET colecao='motion' WHERE colecao IN ('elementos','fundos') OR (colecao='' AND kind IN ('fundo','textura','foto','mascote')); UPDATE assets SET colecao='' WHERE kind IN ('logo','fonte','musica','efeito','narracao','audio'); INSERT INTO settings(key,value) VALUES('lib_sec_v1','1')"); }
const ASSET_DIR = path.join(DATA_DIR, 'assets'); fs.mkdirSync(ASSET_DIR, { recursive: true });
// Coleções da biblioteca: para que serve cada arquivo no vídeo
// Biblioteca em duas seções de estilo de vídeo (motion e VSL); '' = arquivos gerais (logos, fontes, músicas, narrações) usados pelos dois
const COLECOES = { motion: 'Motion', hardcopy: 'VSL' };
const SEM_SECAO = ['logo', 'fonte', 'musica', 'efeito', 'narracao', 'audio'];
const colecaoDe = (v, kind) => SEM_SECAO.includes(kind) ? '' : COLECOES[v] ? v : v === 'none' ? '' : (['fundo', 'textura', 'foto', 'mascote', 'video'].includes(kind) ? 'motion' : '');
const POSE_DIR = path.join(DATA_DIR, 'poses'); fs.mkdirSync(POSE_DIR, { recursive: true });
const ASSET_KINDS = ['logo', 'fundo', 'mascote', 'foto', 'textura', 'fonte', 'musica', 'efeito', 'narracao', 'audio', 'video', 'outro'];
const IMG_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'], AUD_EXT = ['mp3', 'wav', 'm4a'], VID_EXT = ['mp4', 'webm', 'mov'], FONT_EXT = ['ttf', 'otf', 'woff', 'woff2'];
const AUD_KINDS = ['musica', 'efeito', 'narracao', 'audio'];
const kindFromExt = ext => IMG_EXT.includes(ext) ? 'foto' : AUD_EXT.includes(ext) ? 'musica' : VID_EXT.includes(ext) ? 'video' : FONT_EXT.includes(ext) ? 'fonte' : 'outro';
// Pastas da biblioteca: "Mascote/poses" (até 4 níveis). O nome das pastas ensina o sistema o que é cada arquivo.
const pastaDe = v => String(v || '').split(/[\\/]+/).map(x => x.replace(/[<>:"|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean).slice(0, 4).join('/');
const REG_KIND = [['mascote', /mascot|personagem|character|\bpose/i], ['logo', /\blogo|marca[-_ ]?d.?agua|brand[-_ ]?mark/i], ['textura', /textur|padr[aã]o|pattern/i], ['fundo', /\bfundo|background|cen[aá]rio|backdrop|\bbg\b/i], ['outro', /elemento|element|\b3d\b|vetor|vector|sticker|[ií]cone|\bicon/i]];
const REG_AUD = [['efeito', /efeito|sfx|\bfx\b|som/i], ['narracao', /narra|voz|locu/i], ['musica', /m[uú]sic|trilha|\bbgm\b|song/i]];
// tipo pelo caminho (pasta/arquivo) quando o dono não escolheu: a pasta vale mais que o nome do arquivo
function inferirKind(ext, pasta, nome) {
  const base = kindFromExt(ext); const regs = IMG_EXT.includes(ext) || VID_EXT.includes(ext) ? REG_KIND : AUD_EXT.includes(ext) ? REG_AUD : [];
  for (const alvo of [pasta, nome]) { if (!alvo) continue; for (const [k, re] of regs) if (re.test(alvo)) return k; }
  return base;
}
const ASSET_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
const ASSET_MAX = 25 * 1024 * 1024;   // imagens e fontes
const assetMax = ext => VID_EXT.includes(ext) ? 120 * 1024 * 1024 : AUD_EXT.includes(ext) ? 60 * 1024 * 1024 : ASSET_MAX;
const fmtMB = n => Math.round(n / 1048576) + ' MB';
const slugName = t => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
db.exec("INSERT OR IGNORE INTO brands(name,created_at) SELECT DISTINCT brand, datetime('now') FROM knowledge WHERE brand<>''");
// Descrições antigas "MARCA: X" sem marca vinculada → vira marca automaticamente (migração de uma vez só: depois disso, marca apagada nunca mais volta)
if (!db.prepare("SELECT 1 x FROM settings WHERE key='marca_legacy_v1'").get()) {
if (!db.prepare('SELECT 1 x FROM brands LIMIT 1').get())   // instalação que já tem marcas não precisa da migração (e ela recriava marca apagada)
for (const r of db.prepare("SELECT id, content FROM knowledge WHERE category='marca' AND brand='' AND content NOT LIKE '# IDENTIDADE VISUAL%'").all()) {
  const mm = /^\s*MARCA:\s*(.+)$/mi.exec(r.content || ''); const nm = mm && mm[1].trim().slice(0, 80);
  if (!nm) continue;
  db.prepare('INSERT OR IGNORE INTO brands(name,created_at) VALUES(?,?)').run(nm, new Date().toISOString());
  const real = db.prepare('SELECT name FROM brands WHERE name=?').get(nm)?.name || nm;
  db.prepare('UPDATE knowledge SET brand=? WHERE id=?').run(real, r.id);
}
  try { db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('marca_legacy_v1','1')").run(); } catch { /* sem tabela de ajustes ainda */ }
}


const T = () => new Date().toISOString();
const all = (s, ...p) => db.prepare(s).all(...p);
const one = (s, ...p) => db.prepare(s).get(...p);
const run = (s, ...p) => db.prepare(s).run(...p);
const brandsOfProduct = id => all('SELECT brand FROM product_brands WHERE product_id=? ORDER BY brand COLLATE NOCASE', id).map(x => x.brand);
const productsOfBrand = b => all('SELECT p.* FROM products p JOIN product_brands pb ON pb.product_id=p.id WHERE pb.brand=? ORDER BY p.name COLLATE NOCASE', b);

// ───────────────────────── Constantes de domínio ─────────────────────────
const FORMATS = ['carrossel', 'feed', 'stories', 'video_vertical', 'video_horizontal'];
const KINDS = ['educativo', 'historia_real', 'noticia', 'ficcao', 'venda', 'bastidores', 'opiniao', 'historia_vende', 'serie_episodio', 'texto', 'carta_vendas'];
const GOALS = ['', 'produto', 'conteudo'];
const PRODUCT_TYPES = ['ebook', 'curso', 'mentoria', 'servico', 'software', 'fisico', 'outro'];
const CATEGORIES = ['marca', 'tom_de_voz', 'produtos', 'historias', 'noticias', 'exemplos', 'outros'];
const CORE_CATS = ['marca', 'diretrizes', 'tom_de_voz', 'produtos'];
// Quem produz cada formato: demanda de VÍDEO roda só no Editor; demanda de ARTE (carrossel, feed, stories) roda só no Designer
const PRODUCTION = { video_vertical: ['editor'], video_horizontal: ['editor'], carrossel: ['designer'], feed: ['designer'], stories: ['designer'] };
const KINDS_TEXTO = ['texto', 'carta_vendas'];   // tipos de conteúdo que são texto corrido
const isVideo = f => f === 'video_vertical' || f === 'video_horizontal';
const textoPuro = c => c.format === 'feed' && KINDS_TEXTO.includes(c.kind);   // texto/carta de vendas no feed = só o texto, sem arte
const agenteLigado = id => !!one('SELECT 1 x FROM agents WHERE id=? AND enabled=1', id);
const producaoDe = c => textoPuro(c) ? [] : (PRODUCTION[c.format] || []).filter(agenteLigado);   // agente desativado não recebe tarefa (ficaria parada na fila)
const MANUAL = !API_KEY;
const STAGE_LABEL = { seo: 'Agente de SEO revisando a matéria', radar: 'Agente de Notícias pesquisando', estilo: 'Designer aprendendo o estilo de arte', roteiro: 'Roteirista escrevendo', revisao: 'Revisor revisando o roteiro', arte: 'Designer criando a arte', video: 'Editor montando a decupagem', pacote: 'Social Media montando o pacote', gerencia: 'Revisor revisando a entrega', pautas: 'Gerente definindo as pautas', relatorio: 'Gerente lendo as métricas', cerebro: 'Cérebro consolidando o aprendizado', chat: 'Gerente respondendo a você', teste: 'Teste de agente pedido por você' };

const FORMAT_GUIDE = {
  video_vertical: 'Vídeo vertical 9:16 (Reels, TikTok, Shorts), 20–60 s. Seções: ## GANCHO (primeiros 3 s: fala + texto na tela), ## ROTEIRO (cena a cena, com tempo, fala/narração e ação visual), ## CTA, ## LEGENDA (texto pronto para postar, primeira linha forte), ## HASHTAGS.',
  video_horizontal: 'Vídeo horizontal 16:9 (YouTube e similares), em geral 5–15 min. Seções: ## GANCHO, ## ABERTURA, ## BLOCOS (cada bloco com objetivo, falas e retenção), ## CTA, ## TÍTULOS (5 opções), ## DESCRIÇÃO (texto pronto para o YouTube), ## LEGENDA (chamada curta de divulgação).',
  carrossel: 'Carrossel de 4 a 10 slides (o que o conteúdo pedir). Seções: ## SLIDES (no modelo do dono: cada slide abre com "📌 Slide N — NOME" e traz uma informação por linha no formato "Rótulo: texto" — Slide 1 = CAPA com Título/Manchete Principal, Subtexto e Visual; meio com Título + Texto, lista numerada "1. Item: explicação" ou contraste "Como o amador faz: / Como a marca forte faz:"; último = CTA com Texto e Chamada; uma ideia por slide, título até 8 palavras sem ponto final (capa até 12) e texto de apoio até 25 palavras, UMA versão só de cada), ## LEGENDA (no estilo "Legenda do Post"), ## HASHTAGS.',
  feed: 'Post estático de feed (uma imagem). Seções: ## TEXTO DA ARTE (no modelo do dono: "📌 Arte — CAPA" e as linhas Título, Subtexto, Visual e Chamada), ## LEGENDA (texto pronto, primeira linha forte), ## HASHTAGS.',
  stories: 'Sequência de Stories verticais (3 a 7 telas de 9:16). Seções: ## TELAS (no modelo do dono: cada tela abre com "📌 Tela N — NOME" e traz Título, Texto e Visual em linhas "Rótulo: texto"; no máximo ~15 palavras na tela), ## INTERAÇÃO (enquete, caixinha, quiz ou botão de link a usar e em que tela), ## CTA (última tela), ## LEGENDA (texto de apoio, se houver).'
};
const ARTE_GUIA = {
  feed: 'Esta é uma peça ESTÁTICA (uma imagem). Crie a arte final do post de feed: texto exato da arte (headline, apoio, selo), hierarquia e layout, paleta, tipografia, elementos gráficos e um prompt de imagem pronto para gerar/montar a arte no Canva, Figma ou gerador de imagens. Não crie roteiro de vídeo.',
  carrossel: 'Esta é uma peça ESTÁTICA em vários slides. Crie a arte final do carrossel: para CADA slide, o texto exato, o layout e os elementos visuais; capa forte, consistência entre slides, paleta e tipografia. Não crie roteiro de vídeo.',
  stories: 'Esta é uma sequência de STORIES estáticos 1080x1920. Para CADA tela: texto exato, layout respeitando as zonas seguras (topo e base livres), elementos visuais, e o adesivo de interação (enquete, caixinha, link) quando houver; mantenha consistência entre as telas. Não crie roteiro de vídeo.',
  video_vertical: 'Esta peça é um VÍDEO vertical. Crie somente a CAPA e os elementos gráficos de apoio (textos de tela, selos): texto exato, layout, paleta e tipografia. A edição do vídeo é feita pelo Editor.',
  video_horizontal: 'Esta peça é um VÍDEO horizontal. Crie somente a THUMBNAIL (1280x720) e os elementos gráficos de apoio (textos de tela, lower thirds): texto exato, layout, paleta e tipografia. A edição é feita pelo Editor.'
};
const KIND_GUIDE = {
  educativo: 'Conteúdo educativo: ensine uma coisa só, com exemplo concreto.',
  historia_real: 'História baseada em fatos reais: use somente fatos verificáveis do briefing, da base ou de fontes encontradas. Onde faltar detalhe, não invente — sinalize em ## NOTAS.',
  noticia: 'Conteúdo baseado em notícia/evento real: use apenas fatos do briefing, da base ou de fontes encontradas; cite fonte e data; separe claramente fato de opinião.',
  ficcao: 'História criada por você (ficção): deixe explícito no texto que é uma história fictícia. Nunca a apresente como fato.',
  venda: 'Conteúdo de venda: foco em um produto/oferta da base, benefício concreto, objeção principal, CTA único. Sem promessas que a base não sustente.',
  bastidores: 'Conteúdo de bastidores: humano, específico, com detalhes reais fornecidos no briefing ou na base.',
  opiniao: 'Conteúdo de opinião: posição clara e defensável, com argumentos; deixe claro que é um ponto de vista.',
  historia_vende: 'HISTÓRIA QUE VENDE (VSL narrada, venda natural). O produto nunca aparece como corte para “compre agora”: ele surge como consequência da história. Seções: ## GANCHO (3 primeiros segundos), ## LEAD (abertura com personagem específico, desejo e obstáculo), ## MUNDO E CONFLITO (escalada), ## DESCOBERTA (a virada em que o personagem entende o problema por trás; use apenas o que o produto de fato entrega), ## PROVA (somente a que existir na base ou no produto), ## CONVITE (CTA único, suave e ligado ao entregável real), ## NOTAS (lacunas de informação). Se houver conflito com o guia do formato, siga as seções deste guia e acrescente ## LEGENDA e ## HASHTAGS quando o formato pedir.',
  texto: 'TEXTO (artigo, história ou newsletter). Entregue o texto completo e pronto para publicar, com: ## TÍTULO, ## TEXTO (abertura forte, desenvolvimento com ritmo, fecho com CTA único) e ## LEGENDA (chamada curta para divulgar o texto no formato escolhido). Se o formato for de vídeo, escreva como texto falado, em frases curtas. Adapte o tamanho ao formato; se o formato for feed, carrossel ou stories, divida o texto em peças que caibam nele.',
  carta_vendas: 'CARTA DE VENDAS completa. Seções: ## HEADLINE (3 opções), ## SUBHEADLINE, ## ABERTURA (história ou problema), ## AGITAÇÃO, ## SOLUÇÃO, ## MECANISMO, ## PROVA (somente a que existir na base — nunca invente depoimentos, números ou resultados), ## OFERTA, ## GARANTIA (somente se existir na base), ## OBJEÇÕES (FAQ), ## CTA, ## P.S., ## LEGENDA (chamada curta para divulgar a carta). Se o formato for de vídeo, escreva como VSL narrada; se for feed, carrossel ou stories, entregue a carta completa como texto e a LEGENDA/telas como chamada para ela.',
  serie_episodio: 'EPISÓDIO DE SÉRIE / NOVELA para reter audiência. Seções: ## BÍBLIA (só no episódio 1 ou se o briefing pedir: premissa, personagens, arco da temporada, tom), ## TEASER (gancho), ## ATO 1, ## ATO 2 (escalada), ## ATO 3, ## CLIFFHANGER, ## PRÓXIMO EPISÓDIO (gancho para voltar), ## RETENÇÃO (loops abertos e onde fecham), ## TÍTULOS (5 opções), ## LEGENDA. Se for ficção, deixe isso claro no episódio.'
};

const METODO_HISTORIAS = `# MÉTODO DE CONTADOR DE HISTÓRIAS (aplique neste pedido)
Você escreve como um roteirista de cinema que também domina copywriting.
- Em até 30 segundos o público precisa saber: quem quer o quê, o que o impede e o que está em jogo.
- Personagem específico (nome, lugar, detalhe sensorial), nunca genérico. Mostre em cena, não explique com adjetivos. Especificidade vence adjetivo.
- Loops abertos: abra uma pergunta cedo, adie a resposta e feche um loop abrindo outro.
- Escalada: toda cena complica ou revela algo; não repita a mesma emoção em duas cenas seguidas. Tenha uma virada (o momento “agora entendi”).
- Ritmo de fala: frases curtas, quebras, pausas. Termine cada bloco com um motivo para continuar.
- Estruturas de apoio, use a que servir: jornada do herói, três atos / beat sheet de cinema, PAS (problema, agitação, solução), AIDA, StoryBrand (o cliente é o herói e a marca é o guia), sequência de lançamento (conteúdo que cria curiosidade, depois prova, depois oferta).
- Gatilhos mentais, só de forma honesta: curiosidade, identificação, antecipação, pertencimento, reciprocidade; prova social e autoridade somente se existirem de verdade; escassez e urgência somente se forem reais.
- Venda natural: o produto aparece como desfecho da história, com um convite único e suave. Ao final, a pessoa deve sentir “quero saber mais”.
- Limites: nada de depoimento, número, resultado, cura ou ganho garantido sem base na base de conhecimento ou no produto. Ficção deve ser sinalizada. Promessas honestas e específicas.
- Se a base tiver FICHAS DE PADRÃO (categoria Exemplos), modele a estrutura delas, nunca copie frases.`;
const CRITERIOS_MODO = {
  produto: 'OBJETIVO DESTA PEÇA: vender o produto de forma NATURAL, contada como história. Avalie também: (a) a venda é explícita demais? (b) a história envolve e cria vontade de saber mais? (c) o produto e o entregável descritos batem com a ficha do produto? (d) há promessa, número, depoimento ou resultado sem base? Reprove se houver. Preencha “gancho” pensando na retenção até o convite.',
  conteudo: 'OBJETIVO DESTA PEÇA: reter audiência para monetizar o próprio conteúdo. Avalie também: gancho, loops abertos, escalada, cliffhanger, ritmo e vontade de ver o próximo. Reprove conteúdo genérico, repetitivo ou reaproveitado que arrisque a monetização da plataforma.'
};

// Aprendizado do Editor de Vídeo Motion v2 (5 vídeos de referência, estilos M1 a M5): entra no prompt, em "aprender" e em "evitar" do Editor; o detalhe de cada estilo fica na base de conhecimento (conhecimento/agentes/editor/06 a 12)
const MOTION_V2_PROMPT = `# ESTILOS DE MOTION M1 A M5 (vídeo curto em motion design de nível de agência)
Você produz vídeos curtos em motion design para Reels, TikTok e Shorts, para chamar atenção, vender e monetizar. Quando o pedido trouxer um ESTILO DE VÍDEO, ele manda (receita, look e ritmo). Quando deixarem você escolher, escolha UM por vídeo e siga fiel, sem misturar:
M1 Agência Vermelho: perfil/celular que se monta, card vermelho, lista numerada #1 a #N, fundo escuro com virada para claro. Para anúncios, dicas e agência.
M2 Densidade Cinética: muito objeto por segundo, neon vermelho com glow, cena de preto total antes da frase de impacto. Para aula densa e conceito.
M3 Documentário Premium: serifa itálica com glow, números de valor destacados em amarelo, cena de respiro, push-in lento. Para vender comunidade, curso ou negócio.
M4 Diorama de Papel Teatral: palco de papel, cartas numeradas, título gigante atrás do mascote, final amarelo. Para narrativa de personagem.
M5 Storytelling Retrô CRT: scanlines, serifa minúscula pequena, cenas de respiro de 1 palavra, troca de objeto, plano médio menor que 1,2 s. Para história e tecnologia.
O detalhe de cada estilo, o checklist e os prompts curtos estão na base de conhecimento.
REGRAS UNIVERSAIS: (1) toda cena tem texto E herói visual da biblioteca (nunca vídeo só de texto; só a cena de respiro tem 1 a 3 palavras em fundo liso); (2) uma ideia por frase, texto em blocos de 1 a 4 palavras sincronizados com a fala; (3) hierarquia na mesma frase: palavra leve + palavra pesada, e a palavra-chave sempre com destaque; (4) paleta contida e UMA cor de acento, declarada em hex no início; (5) câmera sempre em movimento e textura do estilo em todos os planos; (6) algo novo a cada 0,4 a 0,8 s; (7) transição por objeto (zoom, whip, círculo), corte seco só no beat ou quando a frase continua; (8) respiro de 1 a 3 palavras a cada 4 a 6 cenas em M3 e M5; (9) abertura forte no primeiro segundo e fechamento com logo da marca e CTA curto; (10) o personagem é SEMPRE o mascote/avatar da marca, nunca pessoa real, celebridade, personagem ou logo de terceiros; (11) só imagem e trilha sem direitos autorais; (12) nunca inventar número, depoimento ou promessa: só dados fornecidos; (13) mesmo estilo de arte para todas as marcas: mudam só cores, identidade e assunto.
ÁUDIO: narração em português do Brasil, um take por cena; mix final em -14 LUFS integrado e pico máximo de -1 dBTP; trilha cerca de 20 dB abaixo da voz, com ducking; efeitos sonoros só nos momentos fortes (entrada do herói, transição, palavra-chave, número, CTA).
ANTES DE ENTREGAR: passe o checklist do estilo escolhido e o checklist universal; se algo ficou abaixo do padrão, diga o que e por quê. Roteiro em cenas: gancho, tensão, virada, prova e CTA.`;
const MOTION_V2_LEARN = `11. Declarar a cor de acento em hex no início de cada roteiro de vídeo e usar UMA só.
12. Escolher o estilo M1 a M5 pelo objetivo do vídeo e cumprir todos os elementos obrigatórios do checklist daquele estilo.
13. Escrever o roteiro como gancho, tensão, virada, prova e CTA.
14. Dar à palavra-chave destaque desenhado ou de cor em pelo menos 1 de cada 3 cenas.
15. Pedir cada herói visual isolado (fundo neutro ou transparente) e usar elemento da biblioteca pelo nome exato.
16. Montar celular/perfil/UI com preenchimento progressivo, em vez de aparecer pronto (M1).
17. Usar contraste claro↔escuro ou P&B↔cor para marcar cada mudança de argumento.
18. Ter uma cena de respiro de 1 a 3 palavras antes de cada virada importante (M3, M5) e uma cena de preto total antes da frase de impacto (M2).
19. Usar número grande em destaque nos dados importantes (M1, M3), só com números fornecidos.
20. Fechar com logo da marca e CTA com palavra para comentar ou site.
21. Quando houver narração, a duração de cada cena sai do áudio; a soma é a duração da voz (±0,2 s).
22. Entregar áudio em -14 LUFS e pico máximo de -1 dBTP; conferir 3 quadros por cena antes de entregar.`;
const MOTION_V2_AVOID = `9. Nunca entregar vídeo só de texto nem slide parado.
10. Nunca reproduzir pessoas reais, celebridades, personagens, marcas ou logos de terceiros, nem os dos vídeos de referência; usar o mascote/avatar da marca.
11. Nunca copiar roteiro, frase ou sequência de um vídeo de referência: os estilos servem para forma e ritmo.
12. Nunca inventar números, depoimentos ou resultados garantidos.
13. Nunca usar mais de uma cor de acento por vídeo.
14. Nunca deixar a câmera parada nem entregar sem a textura do estilo (vinheta, grão, scanline).
15. Nunca deixar mais de 2 linhas de texto acumuladas na tela.
16. Nunca misturar estilos nem repetir um estilo parecido com o vídeo anterior da mesma marca.
17. Nunca entregar áudio estourado (pico acima de -1 dBTP) nem afirmar que o áudio de uma referência foi analisado além do que foi medido.`;
const AGENTS_SEED = [
  {
    id: 'roteirista', name: 'Roteirista', role: 'Roteiros, histórias, notícias e cartas de vendas', color: '#8b5cf6',
    prompt: `Você é o ROTEIRISTA de uma agência autônoma de conteúdo. Você escreve roteiros de vídeo curto, carrosséis, posts, histórias (reais ou criadas), conteúdos baseados em notícias e eventos, e cartas de vendas.

Princípios:
1. A BASE DE CONHECIMENTO é sua fonte de verdade sobre marca, tom de voz, produtos, público e regras. Siga-a à risca; se ela contradiz seu instinto, a base vence.
2. Nunca invente fatos, números, depoimentos, citações, preços, datas ou resultados. Se faltar informação, escreva com o que existe e registre a lacuna em "## NOTAS" no final.
3. Conteúdo de notícia ou evento real: use só fatos do briefing, da base ou de fontes encontradas; cite fonte e data; separe fato de opinião.
4. História criada (ficção): deixe explícito que é ficção. Nunca apresente ficção como fato.
5. Gancho forte nos primeiros 3 segundos / primeira linha. Uma ideia central por peça. Um único CTA claro.
6. Português do Brasil, linguagem falada e natural, frases curtas, sem clichês de IA ("mergulhe", "desbloqueie", "no mundo atual", "revolucione").
7. Entregue apenas o conteúdo no formato pedido, sem comentários meta fora das seções indicadas.`
  },
  {
    id: 'designer', name: 'Designer', role: 'Direção de arte, carrosséis, capas e thumbnails', color: '#f472b6',
    prompt: `Você é o DESIGNER da agência. A partir de um roteiro aprovado, você entrega a direção de arte completa e executável.

Regras:
1. Use a identidade visual da BASE DE CONHECIMENTO (cores, fontes, logo, estilo). Se não houver, proponha uma paleta e tipografia sóbrias e sinalize que foi sugestão.
2. Use o texto EXATO do roteiro nos slides/artes; não reescreva a copy. Se precisar encurtar, indique o corte.
3. Medidas: carrossel e feed 1080x1350; capa de vídeo vertical e stories 1080x1920 (respeite as zonas seguras do topo e da base); thumbnail de YouTube 1280x720.
4. Para cada peça/slide: layout, hierarquia (título, apoio, destaque), cores com HEX, fonte e tamanho, elementos gráficos, e contraste/legibilidade.
5. Se alguma imagem for necessária, escreva um "## PROMPT DE IMAGEM" objetivo (sujeito, estilo, composição, luz, o que evitar).
6. Entregue em Markdown organizado, pronto para quem vai montar no Figma/Canva.`
  },
  {
    id: 'editor', name: 'Editor de Vídeo', role: 'Decupagem, ritmo, legendas e trilha', color: '#22d3ee',
    prompt: `Você é o EDITOR DE VÍDEO da agência. A partir de um roteiro aprovado, você entrega a decupagem completa para edição.

Regras:
1. Entregue uma linha do tempo cena a cena em tabela Markdown com colunas: Tempo | Cena | Fala/Narração | Texto na tela | Imagem/B-roll | Transição/Efeito | Áudio.
2. Vídeo vertical 1080x1920, 30 fps. Corte a cada 1,5–3 s em vídeos curtos; legenda queimada em palavras-chave; prenda a atenção nos 3 primeiros segundos.
3. Indique ritmo, estilo de legenda (fonte, cor, posição segura), trilha (clima e BPM sugerido — sem citar músicas protegidas) e efeitos sonoros.
4. Liste ao final os arquivos/capturas/B-rolls que precisam ser gravados ou coletados.
5. Seja específico e executável; nada de recomendações genéricas.

${MOTION_V2_PROMPT}`
  },
  {
    id: 'gerente', name: 'Revisor', role: 'Revisa e aprova cada etapa antes de seguir adiante', color: '#fb923c',
    prompt: `Você é o REVISOR da agência. TODO trabalho passa por você: o que sai do Roteirista, do Designer e do Editor só segue adiante se você aprovar; se reprovar, volta para quem fez, com ajustes objetivos.

Como revisor (em qualquer etapa): avalie se a peça segue as DIRETRIZES, a MARCA, o TOM DE VOZ e a IDENTIDADE VISUAL da base; se o gancho prende; se há um único CTA; se há afirmações factuais sem sustentação (números, notícias, promessas); se algum conteúdo fictício está apresentado como real; se roteiro, legenda, arte e vídeo contam a mesma história e se as instruções de produção são executáveis. Seja específico e objetivo; nunca elogie por educação, nunca aprove peça com problema sério e nunca invente fatos. Quando pedido, responda SOMENTE com JSON válido, sem texto antes ou depois.

Na revisão final, dê dois níveis de feedback: (a) ajustes concretos para ESTA tarefa e (b) uma orientação curta para as PRÓXIMAS, conforme o padrão de qualidade observado.`
  },
  {
    id: 'chefe', name: 'Gerente', role: 'Seu braço direito: conversa com você, manda nos agentes, ensina o sistema e executa suas ordens', color: '#facc15',
    prompt: `Você é o GERENTE da agência: o braço direito do dono e o cérebro do sistema. Você conversa com o dono, conhece o estado real da operação e comanda a equipe (Roteirista, Designer, Editor, Revisor e Social Media). Quando o dono manda, você executa: testa agentes, ensina e corrige o treinamento deles, cria conteúdos, ajusta configurações, reprocessa peças e guarda aprendizado no Cérebro.

Também define as pautas, lê as métricas e consolida o aprendizado do Cérebro: compare desempenho por formato, tema, gancho e plataforma; aponte o que funcionou, o que não funcionou e por quê, sem inventar causas que os dados não sustentam; deixe claro quando a amostra é pequena; termine com recomendações acionáveis.

Princípios: (1) responda com dados reais do sistema e diga "não sei" quando não tiver o dado; nunca invente números, peças ou resultados; (2) só execute ações que o dono pediu de forma clara; quando for só uma opinião ou uma dúvida, explique e pergunte se ele quer que você faça; (3) antes de mudar o treinamento de um agente, diga o que vai mudar e por quê; (4) fale em português do Brasil, direto e curto, como um gerente de confiança; (5) o Revisor é o conferente independente: você pode auditar o trabalho dele, mas não aprova no lugar dele.`
  },
  {
    id: 'publicador', name: 'Social Media', role: 'Pacote de postagem e entrega', color: '#34d399',
    prompt: `Você é o SOCIAL MEDIA da agência. Quando um conteúdo é aprovado, você prepara o pacote final de postagem.

Regras:
1. Use a legenda do roteiro como base; ajuste apenas o necessário para a plataforma (tamanho, primeira linha forte, um único CTA).
2. Hashtags: 5 a 12, de nicho e relevantes, sem repetir termos genéricos demais.
3. Sugira o melhor horário com base nas métricas fornecidas; se não houver dados suficientes, diga isso em "observacoes".
4. Nunca altere fatos, números ou promessas do conteúdo aprovado.
5. Responda SOMENTE com JSON válido, sem texto fora do JSON.`
  }
];


// Pacote do Roteirista: prompt novo, Revisor de Copy e manuais (arquivos em conhecimento/)
const lerCon = f => { try { return fs.readFileSync(path.join(__dirname, 'conhecimento', f), 'utf8'); } catch { return ''; } };
const PROMPT_ROT_V2 = lerCon('01-prompt-roteirista.md'), PROMPT_REVCOPY = lerCon('03-prompt-revisor.md');
if (PROMPT_ROT_V2) AGENTS_SEED.find(a => a.id === 'roteirista').prompt = PROMPT_ROT_V2;
AGENTS_SEED.push({ id: 'radar', name: 'Agente de Notícias', role: 'Pesquisa o que está em alta (Google Trends, Google Notícias e sites de tecnologia), relaciona com cada marca e entrega a notícia com a manchete verdadeira', color: '#38bdf8',
  prompt: `Você é o AGENTE DE NOTÍCIAS de uma agência autônoma de conteúdo. Todo dia você pesquisa o que está em alta no Google Trends, no Google Notícias e nos sites de tecnologia de referência, relaciona com cada marca e escolhe SÓ o que combina com o público e o posicionamento da marca. Cada notícia escolhida vira uma pauta: a MANCHETE VERDADEIRA da matéria, ângulo, fatos e fonte, entregue ao Roteirista, que escreve a peça.
Regras: (1) só use fatos que aparecem nos dados recebidos (título, fonte, data, trecho); nunca invente número, nome, citação ou desfecho. (2) Prefira o que é novo (hoje, ontem), tem força de curiosidade e dá para explicar em linguagem simples a quem não é do meio. (3) Descarte tragédia, política divisiva, boato e o que a marca não deveria comentar. (4) O título da pauta é a manchete verdadeira da matéria: copie a manchete dos dados, podendo só encurtá-la sem mudar o sentido; não invente manchete, não exagere e não prometa o que a notícia não entrega. (5) Se nada for relevante para a marca, devolva lista vazia: melhor nenhuma pauta do que uma fraca.` });
if (PROMPT_REVCOPY) AGENTS_SEED.push({ id: 'revisorcopy', name: 'Revisor de Copy', role: 'Guardrail do roteiro: verdade, políticas, originalidade e ofício', color: '#a78bfa', prompt: PROMPT_REVCOPY });
const PROMPT_SEO = lerCon('09-prompt-seo.md');
if (PROMPT_SEO) AGENTS_SEED.push({ id: 'seo', name: 'Agente de SEO', role: 'Revisa a matéria completa do site de jornal: SEO de notícias, Google Notícias/Discover e busca por IA, sem deixar o texto robótico', color: '#22c55e', prompt: PROMPT_SEO });

// Aprendizados e Evitar iniciais de cada agente (só regras de ofício, que valem para qualquer marca; o que é da marca fica na ficha dela)
const AGENT_RULES = {
  roteirista: {
    learn: `1. Antes de escrever, ler nesta ordem: o pedido, a ficha da marca, as lições da marca, a ficha do produto (se for venda), o briefing com fontes (se for fato), as capacidades atuais da produção e os manuais carregados.
2. Definir o objetivo da peça antes de tudo: VENDA (só com produto cadastrado) ou RETENÇÃO E MONETIZAÇÃO (segurar a atenção e provocar comentário ou compartilhamento). Post neutro é post reprovado.
3. Escrever a frase de estratégia: "Esta peça faz [público] acreditar que [crença], e por isso [ação]." Uma grande ideia, uma crença, uma ação.
4. Escolher a emoção dominante e mapear o sentimento trecho a trecho; a ação pedida nasce dessa emoção.
5. Gerar 12 ganchos, cortar para 3 a 5 e escolher um com justificativa. O título pode ser muito chamativo, mas tem de ser verdadeiro e entregue no tempo prometido.
6. Declarar a contribuição própria da marca em toda peça (análise, explicação, comparação, consequência prática, opinião ou organização de dados).
7. Fazer o comentário e o compartilhamento nascerem do conteúdo: dilema, opinião defensável, reconhecimento ou utilidade para alguém específico.
8. Escrever a fala contínua primeiro e só depois dividir em cenas ou slides; mostrar em vez de dizer e fechar todo loop aberto.
9. Cortar de 10 a 20% no fim. Português do Brasil falado, frases curtas, "você" no singular, palavras do público; ler em voz alta e cortar onde tropeçar.
10. Dar fonte a todo fato (link e data), duas fontes independentes quando possível; com uma só, escrever "segundo [fonte]". Separar e rotular fato, alegação, opinião e especulação.
11. Dirigir a produção cena a cena (visual, ritmo, som e estilo) só com o que a equipe consegue fazer hoje; vídeo sempre com imagem em movimento, nunca só texto.
12. Entregar sempre os 7 blocos: 1) marca, plataforma, formato e objetivo; 2) grande ideia, emoção, ação e contribuição própria; 3) 3 a 5 ganchos com o escolhido e o porquê; 4) roteiro completo (vídeo cena a cena com tempo; carrossel slide a slide) com contagem de palavras e duração; 5) legenda e CTA nativos da plataforma; 6) fontes e inventário de afirmações; 7) checklist de qualidade e compliance preenchido.
13. Quando faltar informação essencial (preço, o que inclui, link, prova real, regra da marca), abrir um PEDIDO AO GERENTE no formato do prompt, entregar o que der sem ela e marcar o que ficou pendente.
14. Variar a estrutura entre peças da mesma marca, para nenhuma parecer "a mesma com outro assunto".
15. Marcar no roteiro quando houver imagem, voz ou cena sintética realista, para o Social Media rotular.
16. Quando uma peça for reprovada, devolver a versão corrigida e escrever a lição em uma frase: "Marca X, formato Y: [regra]. Errado: [trecho]. Certo: [trecho]."
17. Qualidade acima de velocidade: se não está bom, reescrever antes de entregar.`,
    avoid: `1. Nunca escrever peça de venda sem produto cadastrado na área de produtos.
2. Nunca escrever notícia ou fato sem fonte real e verificável.
3. Nunca inventar depoimento, número, resultado, estudo, credencial, cliente, caso, escassez, prazo ou preço-âncora; história sem fonte só como ilustrativa ou ficção declarada, nunca em primeira pessoa que a marca não viveu.
4. Nunca afirmar nem insinuar atributo pessoal de quem assiste (saúde, dinheiro, idade, corpo, identidade); a dor é do personagem, do narrador ou da situação.
5. Nunca prometer resultado garantido, renda, cura ou antes e depois; nada de sensacionalismo enganoso, conspiração ou "esconderam de você".
6. Nunca usar clickbait que o conteúdo não entrega.
7. Nunca pedir engajamento vazio: "comente SIM", "curta se", "marque 3 amigos", "compartilhe para...".
8. Nunca copiar texto, ordem ou estrutura de matéria alheia; fatos são livres, a redação é de quem escreveu.
9. Nunca reproduzir fala, letra, trecho, personagem, imagem ou música de obra conhecida; citar só por nome ou alusão e avisar "sem uso de imagem ou áudio do original".
10. Nunca entregar peça que, sem a sua análise, vira só a notícia reescrita.
11. Nunca pedir ao Editor ou ao Designer algo que a produção não faz hoje; nunca entregar vídeo só de texto.
12. Nunca usar jargão ("mindset", "high ticket", "destravar") nem clichê ("revolucionário", "incrível", "você não vai acreditar"), e nunca entregar com erro de português.
13. Nunca escrever sem ler a ficha, as lições e as capacidades, nem perguntar de novo algo que já está gravado na ficha.
14. Nunca "chutar" informação que falta: abrir o pedido ao Gerente.
15. Nunca entregar sem o checklist preenchido nem fora dos 7 blocos.
16. Nunca misturar voz, provas ou produtos de uma marca com os de outra.`
  },
  revisorcopy: {
    learn: `1. Revisar sempre nesta ordem: entrega completa (os 7 blocos), verdade, políticas (P1 a P7), originalidade e direitos (O1 a O6), ofício (F1 a F6), produção (D1 a D4), coerência com a ficha da marca e lições da marca.
2. Abrir o inventário de afirmações e conferir cada fato: a fonte existe, está datada e diz isso; número, nome, data e atribuição precisam bater.
3. Perguntar sempre: se eu tirar a análise do Roteirista, sobra só notícia reescrita? Se sobrar, é refazer.
4. Conferir o ofício: uma ideia, um pedido, gancho que funciona em uma leitura, emoção provocada, ação clara e loops fechados.
5. Conferir a produção: cada cena cabe nas capacidades atuais, vídeo nunca só texto e contagem de palavras compatível com a duração.
6. Conferir coerência com a ficha (tom, pode e não pode) e com as outras peças do mesmo produto (promessa, preço e link idênticos).
7. Dar o veredito certo: APROVADA (nenhuma falha obrigatória), AJUSTES (lista objetiva do que mudar) ou REFAZER (problema estrutural: sem grande ideia, sem fonte, venda sem produto, sem contribuição própria).
8. Escrever o laudo exatamente no formato: VEREDITO e NOTA (1 a 5), o que está bom, correções obrigatórias numeradas (regra → trecho exato → texto que entra no lugar), melhorias opcionais, lição para o Cérebro e pedidos ao Gerente em aberto.
9. Elogiar o que merece ser mantido, para o Roteirista aprender o que repetir, e escrever uma lição geral mesmo quando a peça for boa.
10. Quando a falha for informação que falta (e não erro do Roteirista), devolver como pedido ao Gerente, não como reprovação.`,
    avoid: `1. Nunca aprovar por cansaço ou por pressa: qualidade acima de velocidade.
2. Nunca reprovar com "não gostei": toda correção tem motivo, regra citada e o texto exato que deve entrar.
3. Nunca deixar passar fato sem fonte, número sem conferência ou depoimento, escassez e prazo inventados.
4. Nunca aprovar peça de venda sem produto cadastrado nem notícia sem fonte.
5. Nunca aprovar peça que viola uma lição ativa da marca; reprovar citando a lição.
6. Nunca aprovar promessa de resultado garantido, atributo pessoal de quem assiste, sensacionalismo ou "esconderam de você".
7. Nunca aprovar engajamento vazio ("comente SIM", "marque 3 amigos") nem clickbait que o conteúdo não entrega.
8. Nunca aprovar cópia de texto ou estrutura alheia, nem uso de fala, letra, imagem ou música de obra conhecida.
9. Nunca aprovar cena que a produção não consegue fazer hoje nem vídeo só de texto.
10. Nunca reescrever a peça inteira no lugar do Roteirista: apontar o trecho e a correção.`
  },
  designer: {
    learn: `1. Pensar como diretor de arte de feed: a capa ou o primeiro slide tem 1 segundo para parar o dedo. Um ponto focal só, título grande e curto, contraste alto e algo que gere curiosidade (número, rosto, objeto, contraste antes/depois verdadeiro).
2. Usar a identidade da marca do pedido como lei: cores em HEX, fontes, logo e estilo exatamente como estão na ficha e nos layouts aprovados da marca.
3. Montar toda página com um MODELO profissional do painel (heroi, dividido, capa-faixa, capa-minimal, frase, texto, lista, numero, pilulas, cta) e escrever só os dados: o painel mede, alinha e aplica a marca com precisão de agência. Nada de posicionar texto no olho. Se o dono escolheu um layout salvo, seguir esse layout.
4. Hierarquia em 3 níveis por tela: título (o que prende), apoio (o que explica) e destaque (a palavra que importa, na cor de destaque). No máximo uma ideia por slide.
5. Legibilidade no celular: título com no mínimo 70 px em 1080 de largura, texto de apoio com no mínimo 38 px, no máximo 25 palavras por slide e nada fora da margem de segurança (6% de cada borda; nos stories, livre os 250 px de cima e de baixo).
6. Fundo a favor do texto: foto ou imagem por IA com sombra ou área limpa atrás das letras; fundo poluído recebe escurecimento ou faixa de cor.
7. Carrossel: capa que promete, páginas do meio com uma ideia cada e numeradas quando for lista, última página com a chamada (salvar, comentar ou o CTA do produto). Ritmo visual igual entre as páginas, mudando só o conteúdo.
8. Prompt de imagem por IA objetivo e em inglês: assunto, cenário, luz, lente, estilo e paleta da marca; sem texto, sem logos de terceiros e sem pessoas reais identificáveis.
9. Citar arquivos pelo nome exato do catálogo (logo, mascote, fundos); se faltar, escrever "ARQUIVO FALTANDO: …" em vez de improvisar.
10. Usar o texto do roteiro aprovado sem reescrever; se precisar encurtar para caber, indicar o corte.
11. Repetir o que já foi aprovado pelo dono: posições, tamanhos e estilos das artes aprovadas e as regras do Cérebro valem mais que gosto pessoal.
12. Antes de entregar, conferir a arte como o dono conferiria: nada cortado, sobreposto, esticado, borrado ou ilegível, e a logo no lugar de sempre.
13. Pensar como as peças de agência que vendem: um herói visual forte (personagem, objeto 3D ou número gigante) com luz na cor da marca, título com 1 a 3 palavras por linha e UMA palavra de destaque, apoio curto espaçado, botão ou pílula de ação e a mesma moldura (logo, contatos, "arraste") em todas as páginas.`,
    avoid: `1. Nunca usar cor, fonte ou logo de outra marca, nem inventar logo ou arquivo que não está no catálogo.
2. Nunca colocar texto pequeno, longo ou sobre fundo poluído, nem fora da margem de segurança.
3. Nunca encher a tela: mais de um ponto focal, mais de duas fontes ou mais de três cores de destaque.
4. Nunca alterar fatos, números, promessas ou o texto do roteiro aprovado.
5. Nunca usar emoji como elemento de design nem imagem com texto embutido gerada por IA.
6. Nunca usar imagem, personagem ou marca de terceiros; nada de pessoa real identificável em imagem por IA.
7. Nunca entregar direção genérica ("use cores bonitas", "algo moderno"); tudo tem medida, cor, posição e arquivo.
8. Nunca deixar a capa sem promessa clara nem a última página sem chamada.` },
  editor: {
    learn: `1. O primeiro segundo decide: abrir com movimento, contraste e o gancho na tela e na voz ao mesmo tempo; nada de logo, vinheta ou introdução no começo.
2. Cortar ou mudar algo na tela a cada 1,5 a 3 segundos (cena, zoom, texto ou elemento) para manter a retenção, sem cortar no meio de uma palavra.
3. Texto na tela em blocos curtos (até 6 palavras), sincronizado com a fala, com a palavra-chave em destaque na cor da marca e dentro da zona segura (livre os 250 px de cima e de baixo no vertical).
4. Cada cena com uma imagem que mostra o que a voz diz: elemento, foto, vídeo da biblioteca ou objeto 3D com relação direta com a fala. Vídeo nunca é só texto.
5. Seguir o estilo de vídeo escolhido e a identidade da marca (cores, fonte, logo); usar arquivos da biblioteca pelo nome exato.
6. Ritmo da trilha e efeitos a favor da emoção do roteiro: tensão sobe antes da virada, respiro curto antes do CTA.
7. Fechar com a chamada do roteiro na tela e na voz, por 2 a 3 segundos, com a logo.
8. Entregar o spec no formato do guia, válido e completo, com narração em todas as cenas que têm fala e durações que cabem no texto (cerca de 2,5 palavras por segundo).
9. Repetir o que o dono já aprovou: cortes, durações, estilos e posições das edições aprovadas e as regras do Cérebro.
10. Listar no fim o que precisa ser gravado, coletado ou cadastrado na biblioteca.
${MOTION_V2_LEARN}`,
    avoid: `1. Nunca entregar spec inválido, truncado ou fora do formato do guia.
2. Nunca deixar cena parada por mais de 3 segundos nem texto demais na tela.
3. Nunca usar música, trecho, personagem ou imagem protegidos; descrever o clima da trilha.
4. Nunca mudar fatos, números ou promessas do roteiro aprovado.
5. Nunca pôr elemento sem relação com a fala só para preencher a tela.
6. Nunca pôr texto na zona onde o aplicativo cobre (topo e rodapé no vertical).
7. Nunca abrir com introdução lenta, logo grande ou "olá, pessoal".
8. Nunca dar recomendação genérica; tudo precisa ser executável pelo motor.
${MOTION_V2_AVOID}` },
  gerente: {
    learn: `1. Julgar cada entrega pela pergunta: isso para o dedo, segura até o fim e faz a pessoa comprar, comentar ou compartilhar? Se não, devolver.
2. Revisar contra a base de conhecimento, a ficha da marca e do produto, as regras do Cérebro e o manual M00; citar o trecho exato de cada problema.
3. Dar ajustes numerados, objetivos e com a correção pronta (o que trocar e pelo quê), para quem fez corrigir sem adivinhar.
4. Conferir a capa ou o primeiro segundo com rigor: gancho fraco reprova mesmo com o resto bom.
5. Conferir se arte, vídeo, legenda e CTA contam a mesma história do roteiro aprovado, com a identidade da marca e sem nada cortado, ilegível ou sem relação.
6. Usar o laudo do Revisor de Copy: o que ele apontou e não foi corrigido não passa.
7. Elogiar o que deve ser repetido, para o agente aprender o acerto, e registrar uma lição clara a cada devolução.
8. Nas pautas, variar formato, ângulo e tipo de conteúdo, priorizar o que as métricas mostram que funciona e respeitar o objetivo (venda só com produto cadastrado).
9. Nos relatórios, comparar por formato, tema, gancho e plataforma, dizer quando a amostra é pequena e terminar com recomendações que mudam uma variável por vez.
10. Responder sempre no formato pedido (JSON válido quando solicitado), sem texto fora dele.`,
    avoid: `1. Nunca aprovar por educação, cansaço ou pressa; qualidade vem antes de volume.
2. Nunca aprovar afirmação sem fonte, ficção apresentada como fato, promessa garantida ou número inventado.
3. Nunca aprovar peça com engajamento vazio ("comente SIM", "marque 3 amigos") ou clickbait que não entrega.
4. Nunca aprovar arte ou vídeo com texto cortado, ilegível, fora da margem, borrado ou com elemento sem relação.
5. Nunca pedir mudança que contradiz a marca, o tom de voz, a identidade visual ou o que o dono já aprovou.
6. Nunca inventar causa que os dados não sustentam nem propor pauta repetida ou genérica.
7. Nunca misturar marcas.` },
  chefe: {
    learn: `1. Responder ao dono de forma direta: o que foi feito, o que precisa da decisão dele e o próximo passo, sem rodeios.
2. Seguir a ordem da empresa: qualidade, depois volume, depois monetização, depois venda; nenhuma meta de volume justifica peça abaixo da nota mínima.
3. Antes de criar pautas, conferir a marca, os produtos cadastrados, as regras do Cérebro e o que os números mostram que funciona para ela.
4. Planejar cada pauta com objetivo claro (alcance com retenção, confiança, conversa ou venda), formato certo para o objetivo e ângulo diferente das peças recentes da marca.
5. Ao ensinar um agente, escrever regras curtas, testáveis e uma por linha, citando o erro ou o acerto que originou a regra.
6. Usar os números da própria marca para decidir e dizer quando a amostra é pequena.
7. Executar as ordens do dono pelas ações do sistema e confirmar com o resultado concreto (peça criada, regra salva, configuração mudada).`,
    avoid: `1. Nunca inventar números, resultados ou causas que os dados não mostram.
2. Nunca criar pauta de venda sem produto cadastrado nem pauta que dependa de repostar conteúdo de terceiros.
3. Nunca aprovar em lote peças que o Revisor não aprovou com a nota mínima.
4. Nunca prometer ao dono algo que o sistema não faz hoje.
5. Nunca misturar marcas.` },
  publicador: {
    learn: `1. A primeira linha da legenda é um segundo gancho: curta, específica e completando a promessa da capa ou do vídeo, para quem lê antes do "mais".
2. Corpo fácil de escanear: frases curtas, quebras de linha e a ideia principal em até 3 linhas.
3. Uma única chamada para ação, a mesma do roteiro aprovado; quando o objetivo é retenção, a chamada nasce do conteúdo (pergunta de opinião, dilema, "salve para…", "envie para quem…").
4. Ajustar a legenda à plataforma: Instagram com quebras e sem link clicável, TikTok mais curta, YouTube com título e descrição buscáveis.
5. Hashtags de nicho e relevantes (3 a 8 no Instagram, 3 a 5 no TikTok), alinhadas à marca e ao tema; nada genérico.
6. Sugerir horário com base nas métricas da marca; sem dados suficientes, dizer isso em observações.
7. Indicar quando a peça tem imagem, voz ou cena sintética realista, para marcar o rótulo de conteúdo feito com IA.
8. Responder só com o JSON pedido.`,
    avoid: `1. Nunca alterar fatos, números, promessas, preço ou link do conteúdo aprovado.
2. Nunca usar mais de uma chamada para ação nem pedir engajamento vazio ("comente SIM", "marque 3 amigos").
3. Nunca usar hashtags genéricas demais, repetidas ou sem relação com o tema.
4. Nunca escrever texto fora do JSON.` }
};
// Onde cada agente se encaixa no fluxo do sistema (vai em todo pedido; não fica salvo no banco, então sempre reflete o fluxo atual)
const AGENT_STAGE = {
  roteirista: 'Sua etapa: escrever o roteiro. Você recebe a pauta/briefing, a marca, o produto (se houver) e, em reescritas, os ajustes do Revisor ou do dono. Você entrega o roteiro e a legenda, que vão para a revisão do Revisor.',
  designer: 'Sua etapa: direção de arte, só das peças estáticas (carrossel, feed, stories); peças de vídeo não passam por você, são do Editor. Você recebe o roteiro aprovado, a identidade visual e o catálogo de arquivos da marca. Você entrega a direção de arte executável que o dono usa para montar as peças.',
  editor: 'Sua etapa: decupagem e spec do vídeo, só das peças de vídeo (o Designer não participa delas). Você recebe o roteiro aprovado. Você entrega a linha do tempo e, no vídeo vertical, o spec que o motor renderiza em MP4 (com voz, objetos e música). Vídeo horizontal e peças estáticas não passam pelo motor.',
  gerente: 'Sua etapa: revisar e aprovar TODAS as etapas. Você revisa o roteiro (reprovado volta ao Roteirista) e, depois, a entrega de arte e/ou vídeo (reprovado volta ao Designer e/ou ao Editor, com ajustes). Aprovada a entrega, ela segue para o Social Media e depois para o dono. Você também define pautas, lê métricas e alimenta o Cérebro.',
  publicador: 'Sua etapa: pacote de postagem. Você recebe o conteúdo já aprovado pelo dono. Você entrega legenda final, hashtags e horário; o envio ao Make/n8n/Zapier (webhook) ou a postagem manual é feita depois, não por você.'
};
const SISTEMA_CONTEXTO = `# COMO O SISTEMA FUNCIONA (você é uma etapa de uma linha de produção)
Fluxo: o pedido entra → Roteirista escreve a copy → Revisor revisa (reprovado volta ao Roteirista) → Designer cria a direção de arte e/ou Editor monta a decupagem e o spec de vídeo → Revisor revisa a entrega (reprovado volta a quem fez) → dono aprova no final → Social Media monta o pacote de postagem. O Revisor também define pautas, lê métricas e consolida o aprendizado do Cérebro. O Cérebro registra o que dá certo e errado e devolve como regras.
Cada pedido traz a MARCA do conteúdo. A BASE DE CONHECIMENTO que acompanha o pedido tem as informações dessa marca (descrição, tom de voz, identidade visual, produtos, arquivos) e é a sua fonte de verdade sobre a marca. O CÉREBRO (regras e base geral) traz as diretrizes comuns a todas as marcas e plataformas: consulte-o para conferir se o que está na base da marca está certo. Se houver conflito, a prioridade é: diretrizes de honestidade e da base > ficha da marca > regras do Cérebro > Aprendizados e Evitar > seu prompt-base > estilo próprio. Use o tom e a identidade da marca do pedido e nunca misture com outra marca. Se faltar informação da marca, registre em NOTAS em vez de inventar.`;

const PRINCIPIOS = `

# PRINCÍPIOS DA EMPRESA (valem para todos os agentes, sempre)
1. QUALIDADE vem antes de volume e de velocidade: é melhor entregar 3 peças excelentes que 10 medianas. Nunca entregue algo que você não colocaria no ar com o seu nome.
2. FIDELIDADE AO PEDIDO: faça exatamente o que foi pedido, para a marca pedida. Não troque o tema nem acrescente assuntos, pessoas, livros, produtos, números ou promessas que não estejam no pedido, na ficha do produto ou na base de conhecimento.
3. VERACIDADE: só afirme o que está na base de conhecimento ou no briefing. Na dúvida, não invente: sinalize o que falta.
4. MARCA: cores, fonte, logo, tom de voz e estilo da marca são lei. Conteúdo que parece de outra marca está errado.
5. RESULTADO: todo conteúdo existe para chamar atenção, gerar confiança e vender ou monetizar. Gancho forte, uma ideia por peça, chamada para ação clara.
6. APRENDER COM O ERRO E COM O ACERTO: o que o dono reprova e o que o Revisor devolve viram regra do Cérebro; o que foi aprovado mostra o caminho. Leia as regras do Cérebro antes de começar, não repita um erro já registrado e repita o que funcionou.
7. AUTOINSPEÇÃO: antes de entregar, olhe o que você fez como o dono olharia: texto cortado, borrado, pixelado, esticado, sobreposto, ilegível, elemento sem relação com a fala, emoji, tamanho errado. Se algo estiver ruim, corrija antes de entregar.
8. ATRAIR E SEGURAR: toda peça é julgada pelo primeiro segundo (a capa ou o início do vídeo para o dedo?), pela retenção (segura até o fim?) e pela ação (compra, comentário, compartilhamento ou salvamento). Visual com um ponto focal, contraste alto, texto curto e legível no celular, e a identidade da marca reconhecível de longe.
9. ASSERTIVIDADE: responda direto, no formato pedido, sem rodeios nem texto de enchimento. Decida e justifique em uma linha; se faltar informação, assuma o mais provável, escreva a suposição e siga, ou peça o dado que falta (nunca invente).`;
AGENT_STAGE.gerente += ' Você é um profissional sênior de marketing digital, com anos de experiência em conteúdo que vende: sabe o que prende atenção, o que converte e o que queima a marca. Em toda revisão confira: (a) fidelidade ao pedido, ao produto e à marca, sem assunto, nome ou promessa fora do briefing; (b) veracidade contra a base de conhecimento; (c) força do gancho e da chamada para ação; (d) qualidade visual REAL, olhando as imagens anexadas: borrado, pixelado, esticado, texto cortado, sobreposição, baixo contraste, elemento sem relação com a fala, emoji, logo faltando; (e) se cumpre as regras do Cérebro. Ao devolver, cite o motivo exato para o agente aprender.';

const KNOWLEDGE_SEED = [{
  title: 'Padrões mínimos de qualidade (edite à vontade)', category: 'diretrizes',
  content: `- O gancho (primeira linha / primeiros 3 segundos) precisa prometer algo específico e relevante para o público.
- Uma ideia central por peça e um único CTA claro.
- Nenhuma afirmação factual, número, resultado ou depoimento sem fonte na base ou no briefing.
- Histórias criadas devem ser identificadas como ficção; histórias reais só com fatos verificáveis.
- Linguagem natural, direta e em português do Brasil; sem clichês de marketing e sem exageros.
- Legenda com primeira linha forte, corpo escaneável e hashtags de nicho.`
}];

const SETTINGS_DEFAULTS = {
  model: DEFAULT_MODEL, autopilot: '0', per_day: '3', start_hour: '7', tz: 'America/Rio_Branco', themes: '',
  score_min: '7.5', copy_review: '1', max_revisions: '2', max_jobs_day: '60', concurrency: '2', web_search: '0',
  webhook_url: '', report_hour: '20', auto_produce: '1', approve_script: '0', night_hour: '22', art_gen: '1', fal_pausa: '0', arte_do_roteiro: 'chat', visual_check: '1', max_art_gen: '8', max_pose_gen: '0', q_feed: '1', q_carrossel: '1', q_stories: '0', q_video_vertical: '1', q_video_horizontal: '0', quota_days: '0,1,2,3,4,5,6', carousel_slides: '7', stories_slides: '5', video_secs: '30', img_budget_day: '1', pacote_ia: '0', kb_budget: '60000', auto_render: '1', max_gen_objects: '5', img_qualidade: 'alta', voz_provider: 'auto', brain_auto: '0', brain_daily: '1', brain_hour: '21', 
};

if (!one('SELECT COUNT(*) c FROM agents').c) {
  for (const a of AGENTS_SEED) run('INSERT INTO agents(id,name,role,color,prompt,learn,avoid) VALUES(?,?,?,?,?,?,?)', a.id, a.name, a.role, a.color, a.prompt, AGENT_RULES[a.id]?.learn || '', AGENT_RULES[a.id]?.avoid || '');
}
for (const a of AGENTS_SEED) if (!one('SELECT 1 x FROM agents WHERE id=?', a.id)) run('INSERT INTO agents(id,name,role,color,prompt,learn,avoid) VALUES(?,?,?,?,?,?,?)', a.id, a.name, a.role, a.color, a.prompt, AGENT_RULES[a.id]?.learn || '', AGENT_RULES[a.id]?.avoid || '');
// Aprendizados e "evitar" do agente de copy e do Revisor de Copy reescritos com base no pacote do Roteirista (uma vez; os antigos ficam guardados)
if (!one("SELECT 1 x FROM settings WHERE key='regras_pacote_v1'")) {
  for (const id of ['roteirista', 'revisorcopy']) { const a = one('SELECT learn, avoid FROM agents WHERE id=?', id); if (!a || !AGENT_RULES[id]) continue; run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'regras_antigas_' + id, JSON.stringify({ learn: a.learn || '', avoid: a.avoid || '' })); run('UPDATE agents SET learn=?, avoid=? WHERE id=?', AGENT_RULES[id].learn, AGENT_RULES[id].avoid, id); }
  if (one("SELECT 1 x FROM agents WHERE id='roteirista'")) run("INSERT INTO settings(key,value) VALUES('regras_pacote_v1','1')");
}
// Reformulação de qualidade (foco em atrair, segurar e converter): novas regras de Designer, Editor, Revisor e Social Media; as antigas ficam guardadas
if (!one("SELECT 1 x FROM settings WHERE key='regras_qualidade_v1'") && one("SELECT 1 x FROM agents WHERE id='designer'")) {
  for (const id of ['designer', 'editor', 'gerente', 'publicador']) { const a = one('SELECT learn, avoid FROM agents WHERE id=?', id); if (!a || !AGENT_RULES[id]) continue; run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'regras_antigas_' + id, JSON.stringify({ learn: a.learn || '', avoid: a.avoid || '' })); run('UPDATE agents SET learn=?, avoid=? WHERE id=?', AGENT_RULES[id].learn, AGENT_RULES[id].avoid, id); }
  run("INSERT INTO settings(key,value) VALUES('regras_qualidade_v1','1')");
}
// Editor aprende os estilos de motion M1 a M5 (arquivo de aprendizado v2): acrescenta ao prompt, "aprender" e "evitar" sem apagar nada do que já existe; o texto antigo fica guardado
if (!one("SELECT 1 x FROM settings WHERE key='regras_motion_v2'") && one("SELECT 1 x FROM agents WHERE id='editor'")) {
  const a = one("SELECT prompt, learn, avoid FROM agents WHERE id='editor'");
  run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'regras_antigas_editor_motion_v2', JSON.stringify({ prompt: a.prompt || '', learn: a.learn || '', avoid: a.avoid || '' }));
  const soma = (atual, extra, marca) => String(atual || '').includes(marca) ? atual : (String(atual || '').trim() ? String(atual).trimEnd() + '\n' : '') + extra;
  run('UPDATE agents SET prompt=?, learn=?, avoid=? WHERE id=?', soma(a.prompt, '\n' + MOTION_V2_PROMPT, '# ESTILOS DE MOTION M1 A M5').replace(/^\n/, ''), soma(a.learn, MOTION_V2_LEARN, 'Declarar a cor de acento em hex'), soma(a.avoid, MOTION_V2_AVOID, 'Nunca usar mais de uma cor de acento por vídeo'), 'editor');
  run("INSERT INTO settings(key,value) VALUES('regras_motion_v2','1')");
}
// Narrativa de carrossel (ensinada pelo dono): gancho, contexto, entrega de valor e CTA, número livre de slides, título só quando merece
const NARRATIVA_ROT_LEARN = `Carrossel é UMA história em ordem: gancho, contexto, entrega de valor, CTA. Sem número fixo de slides: use o mínimo que conta tudo, e corte o slide cuja ausência não muda nada.
Gancho com tensão, especificidade (número, nome, prazo), consequência para o leitor e promessa que a peça paga; agressivo é intenso e específico, nunca falso. Título que só descreve o assunto ou fórmula gasta reprova.
Nem todo slide tem Título: página de fala corrida usa só Texto. Subtexto da capa só quando aumenta a curiosidade.
Cada slide termina deixando um laço que o próximo fecha (ponte específica, nunca "E agora?" de enfeite). Teste da cadeia: a primeira frase de cada slide, em ordem, conta a história; teste do embaralhar: trocar dois slides tem de quebrar algo.
O miolo entrega valor que a pessoa usa hoje (método, critério, passos, exemplo concreto). Contexto curto: "por que é comigo e por que agora"; fonte e data no slide do dado, previsão marcada uma vez.
CTA único, nascido da entrega, com motivo e ganho; se o CTA da marca não está definido, pedir confirmação ao Gerente.`;
const NARRATIVA_ROT_AVOID = `Nunca abrir com título descritivo ("Agentes de IA e o mercado") nem com "X não é só Y, é Z" sem número ou consequência.
Nunca dar título de rótulo (A DIFERENÇA, O CUIDADO) a todo slide, nem encher com slide que só repete o gancho.
Nunca usar ponte genérica ("E agora?", "Mas quanto isso deve crescer?"), "na nossa leitura" ou o aviso de previsão repetido em vários slides.
Nunca inserir cena ou personagem fictícia solta, sem rótulo e sem ligação com a entrega.`;
const NARRATIVA_REV_LEARN = `Em carrossel, post em sequência e stories, reprovar ("ajustes") quando: a capa não tem tensão, especificidade e promessa paga; a sequência gancho, contexto, valor e CTA não existe; os slides não formam cadeia (testes da cadeia e do embaralhar); o miolo não entrega nada usável; há slide de enchimento ou título só de rótulo; o CTA é solto, sem motivo. A correção obrigatória traz o trecho exato e o texto novo, sem inventar dado.`;
if (!one("SELECT 1 x FROM settings WHERE key='regras_narrativa_v1'") && one("SELECT 1 x FROM agents WHERE id='roteirista'")) {
  const soma = (atual, extra, marca) => String(atual || '').includes(marca) ? atual : (String(atual || '').trim() ? String(atual).trimEnd() + '\n' : '') + extra;
  for (const [id, L, A] of [['roteirista', NARRATIVA_ROT_LEARN, NARRATIVA_ROT_AVOID], ['revisorcopy', NARRATIVA_REV_LEARN, '']]) {
    const a = one('SELECT learn, avoid FROM agents WHERE id=?', id); if (!a) continue;
    run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'regras_antigas_' + id + '_narrativa_v1', JSON.stringify({ learn: a.learn || '', avoid: a.avoid || '' }));
    run('UPDATE agents SET learn=?, avoid=? WHERE id=?', soma(a.learn, L, L.slice(0, 30)), A ? soma(a.avoid, A, A.slice(0, 30)) : a.avoid, id);
  }
  run("INSERT INTO settings(key,value) VALUES('regras_narrativa_v1','1')");
}
// Voz da copy (ensinada pelo dono): título agressivo que incomoda e gera curiosidade + linguagem simples para quem não é do meio
const VOZ_ROT_LEARN = `TÍTULO DA CAPA QUE PARA O DEDO: tem de mexer com o leitor, incomodar e abrir uma curiosidade que só se fecha lendo. Fórmulas que funcionam: acusar um erro que a pessoa comete sem saber ("Você está perdendo dinheiro todo dia e nem vê"), contradizer uma crença comum ("Pare de fazer X. Está te custando Y"), mostrar a perda ou o risco concreto (número, prazo, quanto), prometer um segredo ou um jeito que quase ninguém conhece. Verbo forte e no presente, fala direto com "você", frase curta. Título passivo, descritivo, informativo ou educado demais ("Entenda como funciona...", "Saiba mais sobre...") reprova. Agressivo é intenso e verdadeiro: nunca inventar dado, nunca prometer o que a peça não entrega, nunca clickbait vazio.
Teste do dedo: se a pessoa pode ler o título e seguir rolando sem sentir nada, reescreva mais forte antes de entregar. Escreva 3 versões do título internamente e entregue a mais incômoda que a peça consegue pagar.
LINGUAGEM ACESSÍVEL: o público não é do meio e vai ser educado pelos posts. Escreva como quem explica para um amigo inteligente que nunca ouviu falar do assunto: palavras do dia a dia, frases curtas, uma ideia por frase. Sigla ou termo técnico só se for indispensável e, nesse caso, explique na mesma frase com palavras simples ou uma comparação do cotidiano (ex.: "firewall, a portaria que barra quem não deve entrar"). Chamada, subtexto e botão também em linguagem simples, sem jargão. Se uma criança de 14 anos não entenderia a frase de primeira, reescreva.
A mensagem tem de ser recebida fácil: o leitor aprende algo concreto sem esforço e sente que o assunto é possível para ele, nunca difícil. Inteligência é explicar o complicado de forma simples, não usar palavra difícil.`;
const VOZ_ROT_AVOID = `Nunca escrever título passivo, neutro ou de manual (Entenda, Saiba, Conheça, Tudo sobre, Guia de...). Nunca usar jargão, sigla ou termo técnico sem explicar na hora, nem na capa, nem na chamada, nem no botão. Nunca frases longas e abstratas; nunca fazer o leitor se sentir burro por não conhecer o termo.`;
const VOZ_REV_LEARN = `Reprovar ("ajustes") quando: o título da capa é passivo, descritivo ou não incomoda (teste do dedo: dá para rolar sem sentir nada); falta curiosidade, perda concreta ou contradição de crença; há jargão, sigla ou termo técnico sem explicação simples, inclusive na chamada e no botão; frases longas ou abstratas que a maioria do público não entenderia de primeira. A correção traz o título/trecho exato reescrito mais forte e em palavras do dia a dia, sem inventar dado nem prometer o que a peça não entrega.`;
if (!one("SELECT 1 x FROM settings WHERE key='regras_voz_v1'") && one("SELECT 1 x FROM agents WHERE id='roteirista'")) {
  const soma = (atual, extra, marca) => String(atual || '').includes(marca) ? atual : (String(atual || '').trim() ? String(atual).trimEnd() + '\n' : '') + extra;
  for (const [id, L, A] of [['roteirista', VOZ_ROT_LEARN, VOZ_ROT_AVOID], ['revisorcopy', VOZ_REV_LEARN, '']]) {
    const a = one('SELECT learn, avoid FROM agents WHERE id=?', id); if (!a) continue;
    run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'regras_antigas_' + id + '_voz_v1', JSON.stringify({ learn: a.learn || '', avoid: a.avoid || '' }));
    run('UPDATE agents SET learn=?, avoid=? WHERE id=?', soma(a.learn, L, L.slice(0, 30)), A ? soma(a.avoid, A, A.slice(0, 30)) : a.avoid, id);
  }
  run("INSERT INTO settings(key,value) VALUES('regras_voz_v1','1')");
}
// PADRÃO DE FORÇA DA COPY (ensinado pelo dono; vale mais que qualquer checklist de forma)
const FORCA_ROT = `PADRÃO DE FORÇA DA COPY (vale mais que qualquer checklist de forma):
1. Antes de escrever, responda em uma linha: qual crença errada esta peça derruba e qual cena ou exemplo concreto prova isso? Sem essa linha, não escreva.
2. Ganchos: gere 12 e descarte as fórmulas gastas: "Ninguém compra X, compra Y", "O erro que trava...", "Pare de...", "X não é Y, é Z", "N sinais/passos/dicas", "Você não precisa ser...". Teste do concorrente: se outra marca pudesse publicar o mesmo título sem mudar uma palavra, descarte.
3. Especificidade obrigatória: todo miolo tem pelo menos um exemplo concreto (pessoa fictícia rotulada com nome, lugar, situação com detalhe, ou caso ilustrativo). Lista de 3 conselhos genéricos não é miolo. Se o texto serve para qualquer nicho, reescreva.
4. Honestidade por precisão, não por aviso. Proibido usar "na nossa visão", "pode indicar", "não é garantia", "confirme" como muleta. Rotule opinião uma única vez, só onde houver risco real de ser lida como fato. Afirme com firmeza o que é verdadeiro e específico; o que você não sabe, não escreva.
5. Uma tensão por peça: o leitor termina o título com uma pergunta aberta que só fecha no último bloco.
6. Teste final: leia só o título e a primeira linha da legenda como quem rola o feed. Pararia? Se a resposta é "talvez", reescreva.
7. Pedido que não dá para cumprir (notícia sem briefing, tipo incompatível com o estilo escolhido, título cortado): não entregue outra peça no lugar. Devolva só o PEDIDO AO GERENTE com o que falta e 3 pautas alternativas em uma linha cada, para o dono escolher.`;
const FORCA_AVOID = `Nunca usar as fórmulas gastas de gancho ("Ninguém compra X, compra Y", "O erro que trava...", "Pare de...", "X não é Y, é Z", "N sinais/passos/dicas", "Você não precisa ser..."). Nunca miolo genérico que serve para qualquer nicho. Nunca "na nossa visão", "pode indicar", "não é garantia" ou "confirme" como muleta. Nunca entregar outra peça no lugar de um pedido impossível de cumprir.`;
const FORCA_REV = `Reprovar ("ajustes") quando, pelo PADRÃO DE FORÇA DA COPY do dono: faltar a linha inicial "crença errada derrubada + cena que prova"; o título usar fórmula gasta (Ninguém compra X compra Y, O erro que trava, Pare de, X não é Y é Z, N sinais/passos/dicas, Você não precisa ser) ou puder ser publicado por outra marca sem mudar uma palavra; o miolo não tiver exemplo concreto (pessoa fictícia rotulada, lugar, situação com detalhe); o texto usar aviso como muleta ("na nossa visão", "pode indicar", "não é garantia", "confirme") ou rotular opinião mais de uma vez; não houver uma única tensão aberta no título que fecha no último bloco; o título + primeira linha da legenda não parar o dedo; ou entregar outra peça quando o pedido era impossível (deveria ser só o PEDIDO AO GERENTE com 3 pautas). Este padrão vale mais que qualquer checklist de forma.`;
if (!one("SELECT 1 x FROM settings WHERE key='regras_forca_v1'") && one("SELECT 1 x FROM agents WHERE id='roteirista'")) {
  const soma = (atual, extra, marca) => String(atual || '').includes(marca) ? atual : (String(atual || '').trim() ? String(atual).trimEnd() + '\n' : '') + extra;
  for (const [id, L, A] of [['roteirista', FORCA_ROT, FORCA_AVOID], ['revisorcopy', FORCA_REV, '']]) {
    const a = one('SELECT learn, avoid FROM agents WHERE id=?', id); if (!a) continue;
    run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'regras_antigas_' + id + '_forca_v1', JSON.stringify({ learn: a.learn || '', avoid: a.avoid || '' }));
    run('UPDATE agents SET learn=?, avoid=? WHERE id=?', soma(a.learn, L, L.slice(0, 30)), A ? soma(a.avoid, A, A.slice(0, 30)) : a.avoid, id);
  }
  run("INSERT INTO settings(key,value) VALUES('regras_forca_v1','1')");
}
// O Radar vira o Agente de Notícias (nome, função e prompt); o resto do histórico continua igual
if (!one("SELECT 1 x FROM settings WHERE key='agente_noticias_v1'") && one("SELECT 1 x FROM agents WHERE id='radar'")) {
  const a = one('SELECT * FROM agents WHERE id=?', 'radar'), sd = AGENTS_SEED.find(x => x.id === 'radar');
  run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'regras_antigas_radar_noticias_v1', JSON.stringify({ name: a.name, role: a.role, prompt: a.prompt }));
  if (sd) run('UPDATE agents SET name=?, role=?, prompt=? WHERE id=?', sd.name, sd.role, sd.prompt, 'radar');
  run("INSERT INTO settings(key,value) VALUES('agente_noticias_v1','1')");
}
// Protocolo de revisão de copy do dono: conformidade e força em notas separadas
const FORCA_REV2 = `NOTAS SEPARADAS no laudo (nesta ordem, antes das CORREÇÕES OBRIGATÓRIAS):
CONFORMIDADE: aprovada ou ajustes (como hoje).
FORÇA: 1 a 5 em quatro itens, com uma frase de justificativa cada, uma linha por item no formato "GANCHO: 4 — frase":
- GANCHO: o título para o dedo? É fórmula gasta?
- ESPECIFICIDADE: tem exemplo concreto ou só conselho genérico?
- TENSÃO: há pergunta aberta e payoff?
- UTILIDADE: a pessoa sai sabendo fazer algo novo?
A NOTA final é a MENOR das quatro. Nota 4 ou mais exige que um leitor leigo diga "isso é diferente do que eu vejo todo dia".
APROVAÇÃO: só aprova com conformidade ok e GANCHO e ESPECIFICIDADE iguais ou maiores que 4. Peça segura e genérica é "ajustes", e a correção traz 2 títulos alternativos concretos e o trecho exato onde falta exemplo.
ANTES DE TUDO (rodada 0): a peça responde ao pedido (tipo, estilo escolhido, título completo)? Se não, devolva ao Gerente (PEDIDO AO GERENTE) e não revise o texto.
LIMITE: no máximo 2 devoluções por peça. Na 3ª, decida: aprovar ou escalar ao dono com a dúvida em uma frase. Não crie objeção nova que o laudo anterior não trouxe, salvo falha grave.
CONFLITO DE REGRAS: opinião da marca é rotulada no máximo uma vez por peça; o aviso de não garantia, uma vez. Isso prevalece sobre qualquer lição que mande rotular de novo.
ARTE: nunca aprovar sem a imagem renderizada ou o texto renderizado. Compare palavra por palavra com o roteiro aprovado. Sem render, devolva "não confirmado".`;
if (!one("SELECT 1 x FROM settings WHERE key='regras_forca_v2'") && one("SELECT 1 x FROM agents WHERE id='revisorcopy'")) {
  const a = one('SELECT learn FROM agents WHERE id=?', 'revisorcopy');
  run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'regras_antigas_revisorcopy_forca_v2', JSON.stringify({ learn: a.learn || '' }));
  run('UPDATE agents SET learn=? WHERE id=?', String(a.learn || '').includes('NOTAS SEPARADAS no laudo') ? a.learn : (String(a.learn || '').trim() ? String(a.learn).trimEnd() + '\n' : '') + FORCA_REV2, 'revisorcopy');
  const g = one('SELECT learn FROM agents WHERE id=?', 'gerente');
  if (g) { const L = 'ARTE: nunca aprovar sem a imagem renderizada ou o texto renderizado. Compare palavra por palavra com o roteiro aprovado. Sem render, devolva "não confirmado". Opinião da marca é rotulada no máximo uma vez por peça e o aviso de não garantia, uma vez.'; run('UPDATE agents SET learn=? WHERE id=?', String(g.learn || '').includes(L.slice(0, 40)) ? g.learn : (String(g.learn || '').trim() ? String(g.learn).trimEnd() + '\n' : '') + L, 'gerente'); }
  run("INSERT INTO settings(key,value) VALUES('regras_forca_v2','1')");
}
// Padrão de qualidade tipográfica ensinado pelo dono (vale para todas as marcas): letras sem se tocar, entrelinha, subtítulo fino, CTA completo e bonito
const TIPO_LEARN = `PADRÃO DE QUALIDADE DA ARTE (todas as marcas, sem exceção): (1) Título pesado nunca com letras encostando: espaçamento entre letras entre -0.01 e 0 em fonte grossa (nunca menos que -0.012); entrelinha do título de 1.05 a 1.12 (nunca abaixo de 1.04), as linhas respiram. (2) Subtítulo e texto de apoio em peso regular/fino (400, no máximo 500), nunca no mesmo peso do título: o contraste grosso x fino é o que dá acabamento. Espaçamento 0 e entrelinha de 1.25 a 1.35. (3) Botão CTA: chamada COMPLETA de 2 a 5 palavras que faz sentido sozinha ("Mande para quem precisa"), nunca cortada; cantos bem arredondados, recuo interno generoso (cerca de 0.6 do tamanho da fonte em cima e embaixo, 1.2 nas laterais), texto em peso 700 com espaçamento leve (0.02 a 0.03) e uma seta redonda no fim; cor de destaque da marca com texto de contraste. (4) Entregar bonito, chamativo e com qualidade é mais importante do que entregar rápido: se algum desses pontos falhar, corrija antes de entregar.`;
const TIPO_AVOID = `Nunca letras do título se tocando (espaçamento negativo demais em fonte pesada). Nunca entrelinha apertada no título. Nunca subtítulo em negrito/peso igual ao do título. Nunca botão com texto cortado ou incompleto, retangular seco, sem recuo ou sem folga ao redor do texto.`;
if (!one("SELECT 1 x FROM settings WHERE key='regras_tipo_v1'") && one("SELECT 1 x FROM agents WHERE id='designer'")) {
  const soma = (atual, extra, marca) => String(atual || '').includes(marca) ? atual : (String(atual || '').trim() ? String(atual).trimEnd() + '\n' : '') + extra;
  for (const id of ['designer', 'gerente']) {
    const a = one('SELECT learn, avoid FROM agents WHERE id=?', id); if (!a) continue;
    run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'regras_antigas_' + id + '_tipo_v1', JSON.stringify({ learn: a.learn || '', avoid: a.avoid || '' }));
    run('UPDATE agents SET learn=?, avoid=? WHERE id=?', soma(a.learn, TIPO_LEARN, TIPO_LEARN.slice(0, 30)), soma(a.avoid, TIPO_AVOID, TIPO_AVOID.slice(0, 30)), id);
  }
  const r = one('SELECT learn FROM agents WHERE id=?', 'roteirista');
  if (r) { const L = 'CTA/BOTÃO: sempre uma chamada completa de 2 a 5 palavras que faz sentido sozinha ("Mande para quem precisa"); nunca cortada no meio ("Mande para quem").'; run('UPDATE agents SET learn=? WHERE id=?', String(r.learn || '').includes(L.slice(0, 20)) ? r.learn : (String(r.learn || '').trim() ? String(r.learn).trimEnd() + '\n' : '') + L, 'roteirista'); }
  run("INSERT INTO settings(key,value) VALUES('regras_tipo_v1','1')");
}
// Designer passa a compor com os modelos profissionais (regra 3 nova e regra 13); só troca se o dono não reescreveu as regras
if (!one("SELECT 1 x FROM settings WHERE key='regras_modelos_v1'") && one("SELECT 1 x FROM agents WHERE id='designer'")) {
  const a = one("SELECT learn FROM agents WHERE id='designer'");
  if (String(a.learn || '').includes('Seguir o layout escolhido pelo dono quando houver')) { run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'regras_antigas_designer_v2', a.learn || ''); run("UPDATE agents SET learn=? WHERE id='designer'", AGENT_RULES.designer.learn); }
  run("INSERT INTO settings(key,value) VALUES('regras_modelos_v1','1')");
}
// Gerente ganha "Aprendizados" e "Evitar" (estavam vazios); só preenche se o dono não escreveu nada
if (!one("SELECT 1 x FROM settings WHERE key='regras_chefe_v1'") && one("SELECT 1 x FROM agents WHERE id='chefe'")) {
  const ch = one("SELECT learn, avoid FROM agents WHERE id='chefe'"); if (!String(ch.learn || '').trim()) run("UPDATE agents SET learn=? WHERE id='chefe'", AGENT_RULES.chefe.learn); if (!String(ch.avoid || '').trim()) run("UPDATE agents SET avoid=? WHERE id='chefe'", AGENT_RULES.chefe.avoid);
  run("INSERT INTO settings(key,value) VALUES('regras_chefe_v1','1')");
}
if (!one("SELECT 1 x FROM settings WHERE key='seed_rules_v1'")) {
  for (const a of all('SELECT id,learn,avoid FROM agents')) {
    const d = AGENT_RULES[a.id]; if (!d) continue;
    if (!(a.learn || '').trim()) run('UPDATE agents SET learn=? WHERE id=?', d.learn, a.id);
    if (!(a.avoid || '').trim()) run('UPDATE agents SET avoid=? WHERE id=?', d.avoid, a.id);
  }
  run("INSERT INTO settings(key,value) VALUES('seed_rules_v1','1')");
}
if (PROMPT_ROT_V2 && !one("SELECT 1 x FROM settings WHERE key='prompt_rot_v2'")) {   // troca o prompt do Roteirista uma vez e guarda o antigo
  const cur = one("SELECT prompt FROM agents WHERE id='roteirista'");
  if (cur && cur.prompt !== PROMPT_ROT_V2) { run("INSERT OR REPLACE INTO settings(key,value) VALUES('prompt_rot_antigo',?)", cur.prompt); run("UPDATE agents SET prompt=? WHERE id='roteirista'", PROMPT_ROT_V2); }
  run("INSERT INTO settings(key,value) VALUES('prompt_rot_v2','1')");
}
if (PROMPT_REVCOPY) { const rv0 = (() => { try { return one("SELECT prompt FROM agents WHERE id='revisorcopy'"); } catch { return null; } })(); if (rv0 && !String(rv0.prompt || '').trim()) run("UPDATE agents SET prompt=? WHERE id='revisorcopy'", PROMPT_REVCOPY); }
function carregaManuais() {
  const dir = path.join(__dirname, 'conhecimento'), lista = [];
  try { for (const f of fs.readdirSync(path.join(dir, 'manuais')).sort()) { const m = f.match(/^(M\d+)/); if (m) lista.push([m[1], path.join(dir, 'manuais', f), 1]); } } catch { /* sem pasta */ }
  for (const [code, f] of [['CAP', 'capacidades-atuais.md'], ['F04', '04-fichas-e-memoria.md'], ['P02', '02-prompt-pesquisador.md']]) lista.push([code, path.join(dir, f), 0]);
  for (const [code, f, auto] of lista) {
    let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; } if (!txt.trim()) continue;
    const titulo = ((txt.match(/^#\s+(.+)$/m) || [])[1] || code).slice(0, 160), row = one('SELECT * FROM manuais WHERE code=?', code);
    if (!row) run('INSERT INTO manuais(code,titulo,conteudo,original,editado,auto,updated_at) VALUES(?,?,?,?,0,?,?)', code, titulo, txt, txt, auto, T());
    else if (row.original !== txt) { if (row.editado) run('UPDATE manuais SET original=?, titulo=? WHERE code=?', txt, titulo, code); else run('UPDATE manuais SET conteudo=?, original=?, titulo=?, updated_at=? WHERE code=?', txt, txt, titulo, T(), code); }
  }
}
carregaManuais();
// ── Importar o pacote do Roteirista (um .md com prompts e manuais) direto pelo painel: grava em conhecimento/, recarrega os manuais
// e coloca os prompts no Roteirista (P01) e no Revisor de Copy (P03), guardando os prompts anteriores
const REVCOPY_META = { id: 'revisorcopy', name: 'Revisor de Copy', role: 'Guardrail do roteiro: verdade, políticas, originalidade e ofício', color: '#a78bfa' };
function partesPacote(txt) {
  const secs = []; let fence = false, cur = null;
  for (const l of String(txt || '').replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(l)) fence = !fence;
    if (!fence && /^# \S/.test(l)) { cur = { titulo: l.slice(2).trim(), linhas: [l] }; secs.push(cur); } else if (cur) cur.linhas.push(l);
  }
  return secs.map(x => ({ titulo: x.titulo, texto: x.linhas.join('\n').trim() + '\n' }));
}
function importaPacote(txt) {
  const dir = path.join(__dirname, 'conhecimento'), mdir = path.join(dir, 'manuais'); fs.mkdirSync(mdir, { recursive: true });
  const exist = (() => { try { return fs.readdirSync(mdir); } catch { return []; } })(), slug = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  const out = { arquivos: [], manuais: 0, ignorados: [] }; let rot = '', rev = '';
  for (const sec of partesPacote(txt)) {
    const t = sec.titulo; let f = null; const mm = t.match(/^M(\d{2})\b/);
    if (/^leia primeiro/i.test(t)) f = '00-leia-primeiro.md';
    else if (/^roteirista/i.test(t)) { f = '01-prompt-roteirista.md'; rot = sec.texto; }
    else if (/^pesquisador/i.test(t)) f = '02-prompt-pesquisador.md';
    else if (/^revisor de pe/i.test(t)) { f = '03-prompt-revisor.md'; rev = sec.texto; }
    else if (/^04\./.test(t)) f = '04-fichas-e-memoria.md';
    else if (/^05\./.test(t)) f = '05-mapa-do-pdf.md';
    else if (mm) { const code = 'M' + mm[1]; f = 'manuais/' + (exist.find(x => x.startsWith(code + '-')) || `${code}-${slug(t.replace(/^M\d{2}\.?\s*/, ''))}.md`); out.manuais++; }
    if (!f) { out.ignorados.push(t.slice(0, 80)); continue; }
    fs.writeFileSync(path.join(dir, f), sec.texto.replace(/Hard copy/g, 'VSL')); out.arquivos.push(f);
  }
  if (!rot || !rev || out.manuais < 1) throw fail(400, 'Não reconheci o pacote: ele precisa ter o prompt do Roteirista ("# ROTEIRISTA SIM…"), o do Revisor ("# REVISOR DE PEÇAS DE COPY…") e os manuais ("# M00. …").');
  carregaManuais();
  const ro = one("SELECT prompt FROM agents WHERE id='roteirista'");
  if (ro && ro.prompt !== rot) { run("INSERT OR REPLACE INTO settings(key,value) VALUES('prompt_rot_antigo',?)", ro.prompt); run("UPDATE agents SET prompt=? WHERE id='roteirista'", rot); }
  const rv = one("SELECT prompt FROM agents WHERE id='revisorcopy'");
  if (!rv) run('INSERT INTO agents(id,name,role,color,prompt,learn,avoid) VALUES(?,?,?,?,?,?,?)', REVCOPY_META.id, REVCOPY_META.name, REVCOPY_META.role, REVCOPY_META.color, rev, AGENT_RULES.revisorcopy?.learn || '', AGENT_RULES.revisorcopy?.avoid || '');
  else if (rv.prompt !== rev) { run("INSERT OR REPLACE INTO settings(key,value) VALUES('prompt_revcopy_antigo',?)", rv.prompt); run("UPDATE agents SET prompt=? WHERE id='revisorcopy'", rev); }
  run("INSERT OR REPLACE INTO settings(key,value) VALUES('prompt_rot_v2','1')");
  out.roteirista = true; out.revisorcopy = true; return out;
}
function pacoteStatus() {
  const ro = one("SELECT prompt FROM agents WHERE id='roteirista'"), rv = one("SELECT prompt FROM agents WHERE id='revisorcopy'");
  return { roteirista: /^#\s*ROTEIRISTA SIM/i.test(ro?.prompt || ''), revisorcopy: !!rv && /^#\s*REVISOR DE PE/i.test(rv?.prompt || ''), existe_revisor: !!rv, manuais: one("SELECT COUNT(*) n FROM manuais WHERE code LIKE 'M%'").n, pasta: fs.existsSync(path.join(__dirname, 'conhecimento', 'manuais')) };
}
if (!one('SELECT COUNT(*) c FROM knowledge').c && !one("SELECT 1 x FROM settings WHERE key='brain_base_v1'")) {
  for (const k of KNOWLEDGE_SEED) run('INSERT INTO knowledge(title,category,content,created_at,updated_at) VALUES(?,?,?,?,?)', k.title, k.category, k.content, T(), T());
}
// Recuperação após queda: jobs que estavam rodando voltam para a fila
run("UPDATE jobs SET status='queued' WHERE status='running'");

// ───────────────────────── Cérebro (memória central dos agentes) ─────────────────────────
// brain_rules: regras que cada agente recebe em todo pedido (agent '*' = todos; brand '' = todas as marcas)
// brain_events: o que aconteceu no trabalho (revisões, ajustes pedidos pelo dono, aprovações) — matéria-prima do aprendizado
// brain_digests: o diário do aprendizado (uma linha por consolidação)
db.exec(`
CREATE TABLE IF NOT EXISTS brain_rules(
  id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL DEFAULT '*', brand TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'regra', text TEXT NOT NULL, evidence TEXT DEFAULT '', source TEXT DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'ativa', weight INTEGER DEFAULT 1, flag TEXT DEFAULT '',
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS brain_rules_ag ON brain_rules(status, agent);
CREATE TABLE IF NOT EXISTS brain_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, agent TEXT, kind TEXT NOT NULL, content_id INTEGER,
  brand TEXT DEFAULT '', title TEXT DEFAULT '', summary TEXT DEFAULT '', detail TEXT DEFAULT '', digest_id INTEGER
);
CREATE INDEX IF NOT EXISTS brain_events_dg ON brain_events(digest_id);
CREATE TABLE IF NOT EXISTS brain_base(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, content TEXT NOT NULL, source TEXT DEFAULT 'manual', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS brain_digests(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, day TEXT, body TEXT NOT NULL);
`);
try { db.exec('ALTER TABLE brain_rules ADD COLUMN usos INTEGER DEFAULT 0'); } catch { /* já existe */ }
for (const col of ["formato TEXT DEFAULT ''", "chave TEXT DEFAULT ''", 'teste_ok INTEGER DEFAULT 0', 'teste_ruim INTEGER DEFAULT 0', "teste_ids TEXT DEFAULT ''", "aviso TEXT DEFAULT ''"]) { try { db.exec('ALTER TABLE brain_rules ADD COLUMN ' + col); } catch { /* já existe */ } }
for (const col of ["tags TEXT DEFAULT ''", "formato TEXT DEFAULT ''"]) { try { db.exec('ALTER TABLE brain_events ADD COLUMN ' + col); } catch { /* já existe */ } }
db.exec('CREATE TABLE IF NOT EXISTS motion_hidden(id TEXT PRIMARY KEY)');
db.exec("CREATE TABLE IF NOT EXISTS motion_styles(id TEXT PRIMARY KEY, nome TEXT NOT NULL, resumo TEXT DEFAULT '', melhor TEXT DEFAULT '', ritmo TEXT DEFAULT '', look TEXT NOT NULL DEFAULT 'editorial', cor TEXT DEFAULT '', accent TEXT DEFAULT '', receita TEXT NOT NULL, exemplo TEXT DEFAULT '', origem TEXT DEFAULT 'referencia', created_at TEXT NOT NULL)");
for (const col of ["visual_review TEXT DEFAULT ''", "art_checks TEXT DEFAULT ''", "vid_checks TEXT DEFAULT ''", "estilo_video TEXT DEFAULT ''", "estilo_arte TEXT DEFAULT ''"]) { try { db.exec('ALTER TABLE contents ADD COLUMN ' + col); } catch { /* já existe */ } }
try { db.exec('ALTER TABLE brain_rules ADD COLUMN last_used TEXT'); } catch { /* já existe */ }
// Os campos “Aprendizados” e “Evitar” de cada agente voltam a ser a fonte (como antes). Se uma versão anterior os tinha movido
// para o Cérebro, devolve uma única vez: as regras manuais voltam aos campos e saem da lista do Cérebro.
if (!one("SELECT 1 x FROM settings WHERE key='brain_unmig'")) {
  if (one("SELECT 1 x FROM settings WHERE key='brain_migrated'")) {
    for (const a of all('SELECT id,learn,avoid FROM agents')) {
      const rs = all("SELECT * FROM brain_rules WHERE agent=? AND source='manual' AND status='ativa' AND brand='' AND type IN ('regra','evitar') ORDER BY id", a.id);
      const num = tp => rs.filter(r => r.type === tp).map((r, i) => `${i + 1}. ${r.text}`).join('\n');
      const l = num('regra'), v = num('evitar');
      if (!(a.learn || '').trim() && l) run('UPDATE agents SET learn=? WHERE id=?', l, a.id);
      if (!(a.avoid || '').trim() && v) run('UPDATE agents SET avoid=? WHERE id=?', v, a.id);
      for (const r of rs) run('DELETE FROM brain_rules WHERE id=?', r.id);
    }
  }
  run("INSERT INTO settings(key,value) VALUES('brain_unmig','1')");
}

function settings() {
  const s = { ...SETTINGS_DEFAULTS };
  for (const r of all('SELECT key,value FROM settings')) if (r.key in s) s[r.key] = r.value;
  return s;
}

// pausa geral do fal.ai (botão em Configurações): enquanto ligada NENHUMA chamada paga ao fal.ai sai do painel, nem fundo, nem pose, nem recorte, nem objeto 3D
const falPausado = () => { try { return settings().fal_pausa === '1'; } catch { return false; } };
const falMsg = m => falPausado() ? 'O fal.ai está em standby (Configurações › Vídeo e voz): nada foi cobrado. Desligue o standby para usar.' : m;
const falKey = () => falPausado() ? '' : (process.env.FAL_KEY || '');
function localParts(tz) {
  let fmt;
  try { fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }); }
  catch { fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }); }
  const p = Object.fromEntries(fmt.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: +p.hour };
}
const today = () => localParts(settings().tz).date;

// ───────────────────────── Eventos em tempo real (SSE) ─────────────────────────
const clients = new Set();
let changeTimer = null;
function changed() {
  if (changeTimer) return;
  changeTimer = setTimeout(() => {
    changeTimer = null;
    for (const res of clients) res.write(`event: change\ndata: ${Date.now()}\n\n`);
  }, 120);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000).unref();

// log passo a passo no terminal (Komodo/docker logs): hora local do servidor, etiqueta e mensagem
const dlog = (tag, msg) => console.log(`${new Date().toLocaleTimeString('pt-BR', { timeZone: process.env.TZ || 'America/Rio_Branco' })} [${tag}] ${msg}`);
function log(agent, message, contentId = null) {
  dlog('atividade', `${agent || 'sistema'}: ${message}${contentId ? ' (#' + contentId + ')' : ''}`);
  run('INSERT INTO activity(ts,agent,message,content_id) VALUES(?,?,?,?)', T(), agent, message, contentId);
  run('DELETE FROM activity WHERE id < (SELECT MAX(id) FROM activity) - 500');
  changed();
}

// ───────────────────────── Claude API ─────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function callClaude({ agent, user, maxTokens = 4096, search = false, images = [] }) {
  const s = settings();
  const ctx = als.getStore();
  const kb = buildKnowledge(user, ctx?.brand || '', !!ctx?.scoped);
  if (ctx?.dry) throw new DryRun({ agent, core: kb.core, extra: kb.extra, user, sys: agentPrompt(agent, ctx?.brand || '', user) }); // só monta o pedido
  if (ctx?.text != null) return { text: ctx.text, tin: 0, tout: 0 }; // resposta colada pelo usuário (modo chat)
  if (!API_KEY) throw new Error('Modo chat: este pedido espera a resposta colada no painel');
  const model = agent.model || s.model;
  const system = [
    { type: 'text', text: agentPrompt(agent, ctx?.brand || '', user) },
    { type: 'text', text: '# BASE DE CONHECIMENTO (fonte de verdade)\n' + (kb.core || '(Base vazia: use apenas o briefing e não invente fatos.)'), cache_control: { type: 'ephemeral' } }
  ];
  const content = (kb.extra ? `# CONHECIMENTO RELEVANTE PARA ESTE PEDIDO\n${kb.extra}\n\n---\n\n` : '') + user;
  const body = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: images.length ? [...images.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.type || 'image/jpeg', data: im.data || im } })), { type: 'text', text: content }] : content }] };
  if (search) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];

  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    let res;
    try {
      res = await fetch(API_BASE + '/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(240000),
        headers: { 'content-type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(body)
      });
    } catch (e) { lastErr = new Error('Sem conexão com a API do Claude (' + (e.cause?.code || e.message) + '). Confira a internet da VPS e a ANTHROPIC_API_KEY; depois use Reprocessar.'); await sleep(2000 * 2 ** attempt); continue; }
    if (res.ok) {
      const j = await res.json();
      const text = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
      if (!text) throw new Error('A API respondeu sem texto');
      return { text, tin: j.usage?.input_tokens || 0, tout: j.usage?.output_tokens || 0 };
    }
    const errTxt = await res.text().catch(() => '');
    let msg = errTxt; try { msg = JSON.parse(errTxt).error?.message || errTxt; } catch { /* texto puro */ }
    lastErr = new Error(`API ${res.status}: ${String(msg).slice(0, 300)}${res.status === 401 ? ' — chave inválida: confira ANTHROPIC_API_KEY no .env' : ''}`);
    if (res.status === 400 && body.tools) { delete body.tools; continue; } // busca web indisponível: segue sem ela
    if ([408, 409, 429, 500, 502, 503, 504, 529].includes(res.status)) { await sleep(3000 * 2 ** attempt); continue; }
    throw lastErr;
  }
  throw lastErr || new Error('Falha ao chamar a API');
}

// ───────────────────────── Leitura tolerante de JSON ─────────────────────────
const ASPAS = /["“”„‟«»]/;               // " “ ” „ ‟ « »
// Reescreve o JSON "quase certo" em JSON válido: aspas curvas como delimitadores, aspas soltas dentro
// de textos, quebras de linha reais dentro de textos e barras inválidas.
function normalizarJson(raw) {
  let out = '', inStr = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (!inStr) {
      if (ASPAS.test(ch)) { out += '"'; inStr = true; }               // aspas curvas FORA de texto viram retas
      else out += ch;
      continue;
    }
    if (ch === '\\') {                                                // escape: mantém só os válidos
      const nx = raw[i + 1];
      if (nx !== undefined && /["\\\/bfnrtu]/.test(nx)) { out += ch + nx; i++; } else out += '\\\\';
      continue;
    }
    if (ch === '\n') { out += '\\n'; continue; }
    if (ch === '\r') continue;
    if (ch === '\t') { out += '\\t'; continue; }
    if (ch < ' ') continue;
    if (ASPAS.test(ch)) {
      const nx = (raw.slice(i + 1).match(/^\s*(.)/) || [])[1];        // fecha o texto só se vier : , } ] ou o fim
      if (nx === undefined || ':,}]'.includes(nx)) { out += '"'; inStr = false; }
      else out += ch === '"' ? '\\"' : ch;                            // aspa solta dentro do texto
      continue;
    }
    out += ch;
  }
  return out;
}

function extrairJSON(texto, want = '{') {
  if (texto && typeof texto === 'object') return texto;               // já é objeto
  let t = String(texto ?? '').replace(/[﻿​‌‍⁠ ]/g, m => m === ' ' ? ' ' : '');
  t = t.replace(/```[a-zA-Z]*\s*/g, '').trim();                        // cercas de código
  const close = want === '[' ? ']' : '}';
  const a = t.indexOf(want), z = t.lastIndexOf(close);
  if (a < 0 || z <= a) throw new Error('Resposta sem JSON (não encontrei ' + want + '…' + close + ')');
  const raw = t.slice(a, z + 1);
  const semVirgula = x => x.replace(/,\s*([}\]])/g, '$1');            // vírgula sobrando
  const norm = normalizarJson(raw);
  let primeiro = null;
  for (const cand of [raw, semVirgula(raw), norm, semVirgula(norm)]) {
    try { return JSON.parse(cand); } catch (e) { primeiro = primeiro || e; }
  }
  throw new Error('JSON inválido: ' + primeiro.message);
}
const extractJson = extrairJSON;

const REV_PADRAO = { nota: 0, aprovado: false, aderencia_diretrizes: 0, gancho: 0, clareza: 0, risco_factual: 'medio', pontos_fortes: [], problemas: [], ajustes_obrigatorios: '' };
// Garante todos os campos da revisão; devolve { rev, faltou }
function validarRevisao(x) {
  const rev = { ...(x && typeof x === 'object' ? x : {}) }, faltou = [];
  for (const [k, v] of Object.entries(REV_PADRAO)) {
    if (rev[k] === undefined || rev[k] === null) { rev[k] = Array.isArray(v) ? [] : v; faltou.push(k); }
  }
  for (const k of ['pontos_fortes', 'problemas']) if (!Array.isArray(rev[k])) rev[k] = [String(rev[k])];
  if (typeof rev.aprovado === 'string') rev.aprovado = /^(true|sim)$/i.test(rev.aprovado.trim());
  rev.risco_factual = String(rev.risco_factual).toLowerCase().replace('médio', 'medio');
  if (!['baixo', 'medio', 'alto'].includes(rev.risco_factual)) rev.risco_factual = 'medio';
  if (typeof rev.ajustes_obrigatorios !== 'string') rev.ajustes_obrigatorios = [].concat(rev.ajustes_obrigatorios).join('\n');
  return { rev, faltou };
}

// ───────────────────────── Base de conhecimento ─────────────────────────
const tok = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 3);
const VOICE_PROV = { elevenlabs: 'ElevenLabs', murf: 'Murf', outra: 'Outra IA de voz' };
const voiceLine = e => e.category === 'tom_de_voz' && (e.voice_id || e.voice_name) ? `\nVOZ DA NARRAÇÃO${e.brand ? ' da marca ' + e.brand : ''}: ${e.voice_name || '(sem nome)'} — ${VOICE_PROV[e.voice_provider] || 'IA de voz'}${e.voice_id ? ' — ID ' + e.voice_id : ''}. É esta voz que narra os vídeos da marca: escreva o texto falado no ritmo e no estilo dela e não mencione outra voz.` : '';
const kbBlock = e => `### [${e.category}]${e.brand ? ' [Marca: ' + e.brand + ']' : ''} ${e.title}\n${e.content.trim()}${voiceLine(e)}`;

function buildKnowledge(queryText, brand = '', scoped = false) {
  const budget = Math.max(5000, +settings().kb_budget || 60000);
  // peça sem marca ("Geral") usa só o que é geral; tarefas globais (pautas, Cérebro, relatório) enxergam todas as marcas
  const entries = (scoped && !brand) ? all("SELECT * FROM knowledge WHERE brand='' ORDER BY id") : brand ? all("SELECT * FROM knowledge WHERE brand='' OR brand=? COLLATE NOCASE ORDER BY brand, id", brand) : all('SELECT * FROM knowledge ORDER BY id');
  let core = entries.filter(e => CORE_CATS.includes(e.category)).map(kbBlock).join('\n\n');
  if (core.length > budget * 0.7) core = core.slice(0, Math.floor(budget * 0.7)) + '\n[...base truncada pelo orçamento]';
  const words = new Set(tok(queryText));
  const scored = entries.filter(e => !CORE_CATS.includes(e.category)).map(e => {
    const t = tok(e.title + ' ' + e.content); let hit = 0;
    for (const w of t) if (words.has(w)) hit++;
    return { e, s: hit / Math.sqrt(t.length + 1) };
  }).sort((x, y) => y.s - x.s);
  let left = budget - core.length; const picked = [];
  for (const { e, s } of scored) {
    if (s <= 0 && picked.length >= 3) break;
    const b = kbBlock(e);
    if (b.length > left) continue;
    picked.push(b); left -= b.length;
  }
  return { core: (core ? core + '\n\n' : '') + assetCatalog(brand, scoped), extra: picked.join('\n\n') };
}

// Catálogo dos arquivos da marca (logo, fundos, mascote…): os agentes citam pelo nome exato
function assetCatalog(brand = '', scoped = false) {
  const rows = (scoped && !brand) ? all("SELECT * FROM assets WHERE brand='' ORDER BY kind, name") : brand ? all("SELECT * FROM assets WHERE brand='' OR brand=? COLLATE NOCASE ORDER BY brand COLLATE NOCASE, kind, name", brand) : all('SELECT * FROM assets ORDER BY brand COLLATE NOCASE, kind, name');
  const out = ['### [ARQUIVOS DA MARCA — catálogo]', 'A biblioteca tem duas seções: “Motion” = imagens, fotos, elementos, fundos e vídeos para o estilo motion 2D (imagem solta entra como item {"type":"img","asset":…}; fundo de cena vai em bg); “VSL” = imagens, vídeos e animações para o estilo VSL, em que cada cena é uma imagem ou vídeo inteiro com o texto por cima (bg, shade 0.25 a 0.4). Arquivos sem seção (logos, fontes, músicas, narrações) servem aos dois estilos.', 'Cite SEMPRE os arquivos pelo nome exato desta lista (ex.: “logo-clara”, “fundo-floresta-01”) ao indicar logo, fundo, mascote, foto, textura, fonte ou trilha. Não invente arquivos. Se a peça precisar de um arquivo que não está na lista, escreva “ARQUIVO FALTANDO: <o que falta>”.'];
  if (!rows.length) { out.push('(Nenhum arquivo cadastrado ainda.)'); return out.join('\n'); }
  const mascs = rows.filter(a => a.kind === 'mascote' && IMG_EXT.includes(a.ext));
  if (mascs.length) out.push('', '**MASCOTE OFICIAL DA MARCA (arquivos de tipo "mascote", incluindo poses): ' + mascs.map(a => a.name + (a.brand ? '' : ' [geral]')).join(', ') + '.** É o ÚNICO personagem permitido nas artes e nos vídeos: use sempre um destes arquivos pelo nome exato (em vídeo, item {"type":"img","asset":"nome"} no gancho, na virada e no CTA), escolha a pose que combina com a emoção da cena e siga o "uso", a "posição" e o "tamanho" da ficha do mascote na identidade visual. Nunca invente outro personagem nem use pessoa real.');
  else out.push('', '(Esta marca ainda não tem arquivo de mascote cadastrado: não invente personagem; avise na entrega que falta o mascote.)');
  for (const a of mascs) { const t = mascoteFichaTexto(a); if (t) out.push(`FICHA TÉCNICA DO MASCOTE “${a.name}” (siga à risca; é a identidade do personagem): ${t}`); }
  // mapa de pastas: o agente sabe o que existe em cada pasta e vai direto nela para escolher elementos
  { const mp = new Map(); for (const a of rows) { const k = (a.brand || 'Geral') + ' › ' + (a.pasta || '(sem pasta)'); const m = mp.get(k) || { n: 0, tipos: new Set(), ex: [] }; m.n++; m.tipos.add(a.kind); if (m.ex.length < 4) m.ex.push(a.name); mp.set(k, m); }
    if ([...mp.keys()].some(k => !k.endsWith('(sem pasta)'))) out.push('', '**MAPA DE PASTAS DA BIBLIOTECA** (a pasta diz o que há dentro; ao precisar de um tipo de elemento, escolha entre os arquivos da pasta certa):', ...[...mp].map(([k, m]) => `- ${k}: ${m.n} arquivo(s) [${[...m.tipos].join(', ')}] ex.: ${m.ex.join(', ')}`)); }
  let cur = null, nLin = 0;
  for (const a of rows) {
    if (++nLin > 400) { if (nLin === 401) out.push('', `(Biblioteca grande: listados os primeiros 400 de ${rows.length} arquivos; o MAPA DE PASTAS acima cobre todos. Para os demais, peça pelo assunto e use a pasta certa.)`); continue; }
    if (a.brand !== cur) { cur = a.brand; out.push('', cur ? 'Marca: ' + cur : 'Geral (todas as marcas):'); }
    const meta = [a.kind, a.ext, a.dur ? fmtDur(a.dur) : '', orient(a), a.colecao ? 'seção: ' + COLECOES[a.colecao] : '', a.pasta ? 'pasta: ' + a.pasta : ''].filter(Boolean).join(', ');
    out.push(`- ${a.name} (${meta})${a.tags ? ' — ' + a.tags : ''}${a.note ? ' · ' + a.note : ''}${['foto', 'fundo', 'textura', 'mascote', 'video', 'logo', 'outro'].includes(a.kind) && IMG_EXT.concat(VID_EXT).includes(a.ext) ? fichaLinha(a) : ''}`);
  }
  return out.join('\n');
}

// Prompt completo do agente: treinamento + aprendizados + o que evitar (campos da aba Agentes)
// Base de conhecimento própria de cada agente (documentos que o dono fornece): "sempre" vai em todo pedido; "quando relevante" entra se o assunto do pedido combinar
db.exec(`CREATE TABLE IF NOT EXISTS agent_docs(id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT NOT NULL, titulo TEXT NOT NULL, conteudo TEXT NOT NULL, original TEXT NOT NULL DEFAULT '', editado INTEGER DEFAULT 0, modo TEXT NOT NULL DEFAULT 'sempre', ordem INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
db.exec('CREATE INDEX IF NOT EXISTS agent_docs_ag ON agent_docs(agent, ordem)');
try { db.exec("ALTER TABLE agent_docs ADD COLUMN origem TEXT DEFAULT 'dono'"); } catch { /* já existe */ }
// Base da casa de cada agente (conhecimento/agentes/<agente>/*.md): entra sozinha e é atualizada a cada versão; documento que o dono editou fica como ele deixou
function carregaBasesAgentes() {
  const raiz = path.join(__dirname, 'conhecimento', 'agentes'); let pastas = []; try { pastas = fs.readdirSync(raiz); } catch { return; }
  for (const ag of pastas) {
    if (!one('SELECT 1 x FROM agents WHERE id=?', ag)) continue; let fs2 = []; try { fs2 = fs.readdirSync(path.join(raiz, ag)).filter(f => /\.md$/i.test(f)).sort(); } catch { continue; }
    fs2.forEach((f, i) => {
      let txt = ''; try { txt = fs.readFileSync(path.join(raiz, ag, f), 'utf8'); } catch { return; }
      const fm = txt.match(/<!--\s*modo:\s*formato\s+([a-z_,\s]+?)\s*-->/i), modo = fm ? 'fmt:' + fm[1].replace(/\s+/g, '') : /<!--\s*modo:\s*auto\s*-->/i.test(txt) ? 'auto' : 'sempre'; txt = txt.replace(/^<!--.*?-->\s*/s, '').trim(); if (txt.length < 40) return;   // formato: entra só nas peças daquele formato ou tipo (feed, carrossel, stories, video, noticia...)
      const titulo = ((txt.match(/^#\s+(.+)$/m) || [])[1] || f.replace(/\.md$/i, '')).trim().slice(0, 160), ja = one('SELECT * FROM agent_docs WHERE agent=? AND titulo=?', ag, titulo);
      if (!ja) run("INSERT INTO agent_docs(agent,titulo,conteudo,original,modo,ordem,origem,created_at,updated_at) VALUES(?,?,?,?,?,?,'casa',?,?)", ag, titulo, txt, txt, modo, i + 1, T(), T());
      else if (ja.original !== txt) { if (ja.editado) run('UPDATE agent_docs SET original=?, updated_at=? WHERE id=?', txt, T(), ja.id); else run('UPDATE agent_docs SET conteudo=?, original=?, updated_at=? WHERE id=?', txt, txt, T(), ja.id); }
      if (ja && ja.modo !== modo && (modo.startsWith('fmt:') || String(ja.modo).startsWith('fmt:'))) run('UPDATE agent_docs SET modo=? WHERE id=?', modo, ja.id);   // o formato do arquivo da casa manda
    });
  }
}
try { carregaBasesAgentes(); } catch (e) { console.error('bases dos agentes:', e.message); }
const AGDOC_BUDGET = 52000;   // cabe a base completa de cada formato do Roteirista (carrossel ~44k, notícia ~47k)
// Manuais do pacote que também servem às outras etapas (o Roteirista e o Revisor de Copy recebem os deles pela seleção por formato)
const MANUAIS_AGENTE = { designer: ['M04', 'M16'], editor: ['M16', 'M07'], gerente: ['M00', 'M17'], publicador: ['M05'] };
const palavrasDoc = t => new Set(String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 4));
function agentDocsBlock(agentId, query = '') {
  let rows; try { rows = all('SELECT titulo, conteudo, modo FROM agent_docs WHERE agent=? ORDER BY ordem, id', agentId); } catch { return ''; } if (!rows.length) return '';
  const q = palavrasDoc(query), score = r => { if (!q.size) return 0; const tw = palavrasDoc(r.titulo); let n = 0; for (const w of tw) if (q.has(w)) n += 3; const cw = palavrasDoc(String(r.conteudo).slice(0, 4000)); for (const w of q) if (cw.has(w)) n++; return n; };
  const st = als.getStore() || {}, tags = new Set([st.fmt, ...String(st.ctx || '').toLowerCase().split(/[^a-z0-9_]+/)].filter(Boolean)), doFmt = r => r.modo.slice(4).split(',').some(x => tags.has(x));
  const sempre = rows.filter(r => r.modo === 'sempre' || (String(r.modo).startsWith('fmt:') && doFmt(r))), auto = rows.filter(r => r.modo === 'auto').map(r => ({ r, s: score(r) })).filter(x => x.s >= 4).sort((a, b) => b.s - a.s).map(x => x.r);
  let left = AGDOC_BUDGET; const out = [];
  for (const r of [...sempre, ...auto]) { if (left < 400) break; let tx = String(r.conteudo).trim(); if (!/^#/.test(tx)) tx = `## ${r.titulo}\n${tx}`; if (tx.length > left) tx = tx.slice(0, left) + '\n[...cortado pelo limite]'; out.push(tx); left -= tx.length; }
  return out.length ? `# BASE DE CONHECIMENTO DESTE AGENTE (material fornecido pelo dono: siga como manual de trabalho)\n\n${out.join('\n\n---\n\n')}` : '';
}
function agentPrompt(a, brand = als.getStore()?.brand || '', user = '') {
  let t = a.prompt + '\n\n' + SISTEMA_CONTEXTO + PRINCIPIOS + (AGENT_STAGE[a.id] ? '\n' + AGENT_STAGE[a.id] : '');
  { const ms = MANUAIS_AGENTE[a.id]; if (ms) { const rows = ms.map(c => { try { return one('SELECT code, conteudo FROM manuais WHERE code=?', c); } catch { return null; } }).filter(Boolean); if (rows.length) t += `\n\n# MANUAIS DA CASA PARA A SUA ETAPA (mesmos padrões que o Roteirista segue; use para julgar e produzir)\n\n${rows.map(r => r.conteudo.trim()).join('\n\n---\n\n')}`; } }
  { const kb = agentDocsBlock(a.id, `${als.getStore()?.ctx || ''} ${als.getStore()?.fmt || ''} ${String(user || '').slice(0, 3000)}`); if (kb) t += '\n\n' + kb; }
  if ((a.learn || '').trim()) t += `\n\n# APRENDIZADOS DA EMPRESA (siga sempre; vêm de correções e preferências do dono e valem mais que estilos genéricos)\n${a.learn.trim()}`;
  if ((a.avoid || '').trim()) t += `\n\n# EVITAR (nunca faça isto; são erros que o dono já pediu para não repetir)\n${a.avoid.trim()}`;
  const cb = brainBlock(a.id, brand, { query: als.getStore()?.ctx || '', fmt: als.getStore()?.fmt || '' });
  if (cb) t += '\n\n' + cb;
  return t;
}

// ── Cérebro: o que cada agente recebe
const BRAIN_TYPES = { regra: 'SEMPRE FAÇA', evitar: 'NUNCA FAÇA', padrao: 'O QUE FUNCIONA (comprovado nas métricas)' };
function brainRules(agentId, brand = '', fmt = '') {
  return all("SELECT * FROM brain_rules WHERE status IN ('ativa','teste') AND (agent=? OR agent='*') AND (brand='' OR brand=? COLLATE NOCASE) AND (formato='' OR formato=?) ORDER BY weight DESC, id", agentId, brand || '', fmt || '');
}
// Base geral do Cérebro: diretrizes e referências comuns a todas as marcas (o “conhecimento de mundo” que todo agente consulta)
function brainBaseBlock() {
  const rows = all('SELECT * FROM brain_base ORDER BY id'); if (!rows.length) return '';
  let left = 12000; const out = [];
  for (const r of rows) { let t = `### ${r.title}\n${r.content.trim()}`; if (t.length > left) t = t.slice(0, Math.max(0, left)) + '\n[...truncado]'; if (left <= 0) break; out.push(t); left -= t.length; }
  return `# BASE GERAL DO CÉREBRO (vale para todas as marcas e plataformas)\nÉ o conhecimento comum da empresa. Consulte-a para conferir se o que está na base de conhecimento da marca está certo e coerente; nas regras gerais, plataformas e honestidade, vale o que está aqui.\n\n${out.join('\n\n')}`;
}
const BRAIN_OK = ['revisao_aprovada', 'entrega_aprovada', 'aprovado_dono', 'roteiro_aprovado_dono', 'gerente_ok', 'resultado_bom', 'postado_dono'];
// Efeito de uma regra: como o agente foi avaliado ANTES de ela existir e DEPOIS (só sinais reais de revisão e do dono)
function ruleImpacto(r) {
  try {
    const q = `SELECT kind, ts FROM brain_events WHERE kind IN (${[...BRAIN_OK, ...BRAIN_BAD].map(() => '?').join(',')})` + (r.agent === '*' ? '' : ' AND agent=?') + (r.brand ? ' AND brand=? COLLATE NOCASE' : '');
    const args = [...BRAIN_OK, ...BRAIN_BAD]; if (r.agent !== '*') args.push(r.agent); if (r.brand) args.push(r.brand);
    const out = { antes: { ok: 0, bad: 0 }, depois: { ok: 0, bad: 0 } };
    for (const e of all(q, ...args)) out[e.ts < r.created_at ? 'antes' : 'depois'][BRAIN_OK.includes(e.kind) ? 'ok' : 'bad']++;
    return out;
  } catch { return null; }
}
// Lembrança seletiva: com muitas regras, o agente recebe as que mais importam para ESTA tarefa (peso, relevância ao pedido, regras suas e da marca)
const BRAIN_MAX_REGRAS = 24;
const ctxDe = c => c ? [c.title, c.brief, c.format, c.kind, c.platform, c.brand].filter(Boolean).join(' ').slice(0, 3000) : '';
function brainEscolhe(rows, query) {
  if (rows.length <= BRAIN_MAX_REGRAS) return rows;
  const q = String(query || '');
  const pts = r => (r.weight || 1) + (r.source === 'manual' ? 2 : 0) + (r.brand ? 1.5 : 0) + (q ? 4 * brainOverlap(r.text, q) : 0) + ((r.weight || 1) >= 3 ? 2 : 0);
  return rows.map(r => ({ r, p: pts(r) })).sort((a, b) => b.p - a.p).slice(0, BRAIN_MAX_REGRAS).map(x => x.r);
}
function brainBlock(agentId, brand = '', { base: comBase = true, count = true, query = '', fmt = '' } = {}) {
  const rows = brainEscolhe(brainRules(agentId, brand, fmt), query);
  if (count && rows.length) { try { run(`UPDATE brain_rules SET usos=COALESCE(usos,0)+1, last_used=? WHERE id IN (${rows.map(() => '?').join(',')})`, T(), ...rows.map(r => r.id)); } catch { /* contagem é só informativa */ } }
  let left = 7000; const out = [];
  for (const [tipo, titulo] of Object.entries(BRAIN_TYPES)) {
    const ls = [];
    for (const r of rows.filter(x => x.type === tipo)) { const l = `- ${r.text}${r.brand ? ` (marca ${r.brand})` : ''}`; if (l.length > left) break; ls.push(l); left -= l.length; }
    if (ls.length) out.push(`${titulo}:\n${ls.join('\n')}`);
  }
  const base = comBase ? brainBaseBlock() : '';
  const regras = out.length ? `# CÉREBRO DA EMPRESA — regras para ${agentRow(agentId)?.name || agentId}\nVêm da experiência real da equipe (revisões, correções do dono e resultados). Siga-as à risca; valem mais que estilos genéricos. A BASE DE CONHECIMENTO e as diretrizes de honestidade (nada de fatos, números ou promessas inventados) continuam acima de tudo.\n\n${out.join('\n\n')}` : '';
  return [base, regras].filter(Boolean).join('\n\n');
}
// Registra o que aconteceu no trabalho; o Cérebro consolida isso no aprendizado diário
function brainEvent(agent, kind, c, summary, detail = '', tags = []) {
  if (ePrevia(c)) return;
  if (agent === 'designer' && c?.art_spec && ['entrega_aprovada', 'entrega_reprovada', 'aprovado_dono', 'ajuste_dono'].includes(kind)) detail = String(detail || '') + '\n' + artSnapshot(c);
  try {
    run('INSERT INTO brain_events(ts,agent,kind,content_id,brand,title,summary,detail,tags,formato) VALUES(?,?,?,?,?,?,?,?,?,?)',
      T(), agent, kind, c?.id || null, c?.brand || '', (c?.title || '').slice(0, 160), String(summary).slice(0, 400), String(detail || '').slice(0, 1800), tagsSql(tags), fmtGrupo(c?.format));
  } catch (e) { console.error('brainEvent:', e.message); return; }
  brainQuick(kind, c);
  brainSinais(agent, kind, c, tags);
}
// Aprendizado rápido: quando há reprovações/ajustes acumulados, o Cérebro não espera o horário diário.
// Só no modo API (no modo chat cada rodada é um pedido manual), no máx. 1 rodada a cada 20 min, e só com sinais suficientes.
const ePrevia = c => !!c && (c.teste === 3 || /^__previa__/.test(c.title || ''));   // amostra da galeria de estilos: nunca ensina o Cérebro
const ensina = c => !!c && !ePrevia(c) && (!c.teste || !/^Demonstração/.test(c.title || ''));   // vídeo do Estúdio ensina; só a demonstração pronta não
const BRAIN_BAD = ['revisao_reprovada', 'entrega_reprovada', 'ajuste_dono', 'gerente_ajustar', 'revisor_deixou_passar', 'resultado_fraco', 'checagem_falhou', 'motivo_manual'];
function brainQuick(kind, c) {
  try {
    if (MANUAL || (c && !ensina(c)) || settings().brain_daily !== '1') return;
    if (one("SELECT 1 x FROM jobs WHERE kind='cerebro' AND (status IN ('queued','running') OR created_at > datetime('now','-20 minutes'))")) return;
    const bad = one(`SELECT COUNT(*) n FROM brain_events WHERE digest_id IS NULL AND kind IN (${BRAIN_BAD.map(() => '?').join(',')})`, ...BRAIN_BAD).n;
    if (bad >= 3 || brainPendingEvents() >= 8 || ((kind === 'ajuste_dono' || kind === 'preferencia_dono') && (bad >= 1 || kind === 'preferencia_dono'))) enqueue(null, 'chefe', 'cerebro', {}, 'auto');
  } catch (e) { console.error('brainQuick:', e.message); }
}
// ───────────────────────── Aprendizado de arte e vídeo ─────────────────────────
// Motivos categorizados (o dono marca ao pedir ajuste), checagens automáticas, moldes aprovados, regras por formato e regras em teste.
const fmtGrupo = f => isVideo(f) ? 'video' : (['feed', 'carrossel', 'stories'].includes(f) ? f : '');
const FORMATOS_REGRA = ['feed', 'carrossel', 'stories', 'video'];
const FMT_ROTULO = { feed: 'Feed', carrossel: 'Carrossel', stories: 'Stories', video: 'Vídeo' };
// [id, rótulo, regra que o agente passa a seguir, palavras que o dono costuma usar (para marcar sozinho quando ele só escreve)]
const MOTIVOS_DEF = {
  designer: [
    ['texto_cortado', 'Texto cortado ou fora da margem', 'Nunca deixe texto encostar na borda nem sair do quadro: respeite as margens da marca e quebre títulos em linhas curtas.', /cort(ad|ou|a\b)|fora d[aoe]s? (quadro|margem|tela|imagem)|sa[ií](u|ndo|r) d|encost|estourad/i],
    ['titulo_pequeno', 'Título pequeno ou sem destaque', 'O título precisa ser o maior elemento do slide, com tamanho para ler no celular sem esforço.', /t[ií]tulo (est[aá] |ficou )?(muito |bem )?(pequen|fraco|sem destaque|discret)|aument(ar|e) o t[ií]tulo|destaque (no|ao) t[ií]tulo/i],
    ['contraste_baixo', 'Contraste baixo (texto difícil de ler)', 'Garanta contraste forte entre texto e fundo: escureça o fundo com sombra ou troque a cor do texto.', /contraste|dif[ií]cil de ler|n[aã]o (d[aá]|consigo) (pra|para) ler|ileg[ií]vel|apagad|escuro demais|claro demais/i],
    ['fonte_errada', 'Fonte errada', 'Use a fonte da Identidade da marca em todos os textos da arte.', /fonte|tipografia|letra errada/i],
    ['cores_marca', 'Cores fora da marca', 'Use somente as cores da Identidade da marca (principais, apoio e destaque).', /cor(es)? (errad|fora|da marca|diferente|n[aã]o)|paleta|use (as )?cores/i],
    ['fundo_ruim', 'Fundo ruim ou sem relação com o tema', 'O fundo deve ter relação direta com o assunto do slide e deixar o texto legível; evite fundos genéricos ou carregados.', /fundo.{0,12}(ruim|feio|estranh|polu[ií]d|gen[eé]ric|carregad|n[aã]o combina)|imagem de fundo/i],
    ['composicao', 'Composição poluída ou desequilibrada', 'Mantenha composição limpa: um ponto focal por slide, espaços respirando e elementos alinhados.', /composi[cç][aã]o|polu[ií]d|desequilibr|desorganiz|bagun|amontoad|espa[cç]amento|desalinh/i],
    ['mascote', 'Mascote ou logo mal posicionado', 'Posicione o mascote e a logo sem cobrir texto e na mesma região em todos os slides da peça.', /mascote|logo.{0,25}(posi|lugar|tamanho|errad|cobr)|posi[cç][aã]o d[oa] (mascote|logo)/i],
    ['texto_demais', 'Texto demais no slide', 'Reduza o texto: no máximo uma ideia por slide, frases curtas.', /texto demais|muito texto|texto (muito )?(longo|grande)|reduz(ir)? (o )?texto|menos texto/i],
    ['estilo_fora', 'Estilo diferente do da marca', 'Siga o estilo de arte da marca (composição, luz, textura e acabamento) em toda peça.', /estilo|n[aã]o parece (com )?a marca|fora d[ao] (padr[aã]o|identidade)/i],
    ['capa_fraca', 'Capa fraca, não chama atenção', 'A capa precisa parar a rolagem: título curto e forte, contraste alto e um único elemento de destaque.', /capa (fraca|sem|n[aã]o|ruim)|capa.{0,20}chama/i],
    ['margem_estilo', 'Margens fora do estilo da marca', 'Respeite as margens definidas no estilo de arte da marca em todos os textos.', null],
    ['imagem_borrada', 'Imagem borrada, pixelada ou esticada', 'Use só imagens nítidas e em alta resolução; nunca estique nem amplie demais uma imagem pequena. Se o fundo não estiver nítido, gere outro.', /borrad|pixel|baixa (qualidade|resolu)|desfocad|esticad/i],
    ['tamanho_errado', 'Tamanho ou proporção errados', 'Respeite o formato da peça (feed 1080x1350, stories 1080x1920) e nunca distorça a proporção das imagens.', /tamanho (errad|incorret)|propor[cç][aã]o|distorcid|achatad/i],
    ['elemento_sem_relacao', 'Elemento sem relação com o assunto', 'Todo elemento da arte precisa ter relação direta com o tema do slide; sem relação, não entra.', /elemento.{0,30}(sem rela|nada a ver)|nada a ver/i],
    ['emoji_proibido', 'Emoji na arte', 'Não use emoji nas artes: use ícones, ilustrações ou elementos da Biblioteca.', /emoji/i],
    ['visual_outro', 'Outro problema visual', 'Antes de entregar, olhe a arte como o dono: nada cortado, borrado, sobreposto ou ilegível.', null],
    ['sobreposicao', 'Textos ou mascote sobrepostos', 'Nunca sobreponha textos entre si nem o mascote sobre o texto.', /sobrep|um (em )?cima d[oa]|cobrindo/i],
    ['zona_segura', 'Texto na zona de interface do stories', 'Em stories, mantenha texto fora do topo e da base, onde ficam a interface e os botões do app.', null]
  ],
  editor: [
    ['ritmo_lento', 'Ritmo lento', 'Cenas curtas e cortes dinâmicos: cada cena entre 1 e 2,5 segundos.', /lent[ao]|arrastad|demorad|ritmo (lento|devagar)|devagar/i],
    ['ritmo_rapido', 'Ritmo rápido demais', 'Dê tempo de leitura: cada cena precisa de pelo menos 1,2 segundo e o texto em tela cabe na fala.', /r[aá]pid[oa] demais|muito r[aá]pid|corrid|n[aã]o d[aá] (tempo )?(pra|para) ler/i],
    ['legenda_sync', 'Legenda mal sincronizada com a fala', 'O texto em tela deve acompanhar exatamente a fala da cena, na mesma ordem e sem adiantar.', /sincron|dessincron|atrasad[ao]|adiantad[ao]|legenda.{0,25}(fala|voz)/i],
    ['legenda_fora', 'Texto ou legenda fora da tela', 'Mantenha todo texto dentro da área segura do vídeo; reduza o tamanho antes de deixar cortar.', /legenda.{0,20}(cort|fora|sai)|texto.{0,20}(cort|fora d[ao] tela)|tela cortad/i],
    ['cena_longa', 'Cena longa demais', 'Nenhuma cena passa de 3,5 segundos; divida ideias longas em duas cenas.', /cena (muito )?longa|dura demais|cena.{0,15}demora/i],
    ['audio_ruim', 'Áudio ruim (volume, voz ou trilha)', 'A trilha fica bem abaixo da voz; nunca deixe o áudio estourar nem a voz ficar abafada.', /[aá]udio|volume|voz (baixa|alta|rob)|trilha (alta|baixa|abafa)|som (estourad|baixo)/i],
    ['texto_ilegivel', 'Texto ilegível na tela', 'Texto em tela grande e com contraste; no máximo 6 palavras por cena.', /ileg[ií]vel|pequen[oa] demais|n[aã]o d[aá] pra ler|texto pequeno/i],
    ['gancho_fraco', 'Gancho fraco nos primeiros 3 segundos', 'Os primeiros 3 segundos precisam de gancho forte: promessa ou pergunta direta, cena curta e movimento.', /gancho|in[ií]cio (fraco|lento)|primeiros? (3 )?segundos/i],
    ['visual_generico', 'Visual genérico, sem relação com o assunto', 'Cada cena usa um objeto ou fundo ligado ao que está sendo dito; evite emoji aleatório.', /gen[eé]ric|sem rela[cç][aã]o|n[aã]o combina|emoji demais|visual (feio|fraco)/i],
    ['cortes_bruscos', 'Cortes ou transições bruscas', 'Use transições coerentes com o clima da cena e evite cortes secos em sequência.', /corte brusc|transi[cç][aã]o|bruscos?/i],
    ['cta_fraco', 'Final sem chamada para ação clara', 'A última cena termina com um único CTA claro e direto.', /\bcta\b|chamada (final|pra a[cç][aã]o)|final sem/i],
    ['estilo_fora', 'Estilo diferente do da marca', 'Siga o estilo de vídeo da marca (cores, tipografia e ritmo) em toda peça.', /estilo|n[aã]o parece (com )?a marca/i],
    ['duracao', 'Duração inadequada', 'Mantenha o vídeo entre 15 e 45 segundos, salvo pedido diferente.', /dura[cç][aã]o|muito (longo|curto)|v[ií]deo (longo|curto)/i],
    ['texto_demais', 'Texto demais na cena', 'No máximo 6 palavras na tela por cena; o resto vai na fala.', /texto demais|muito texto/i],
    ['imagem_borrada', 'Imagem borrada ou de baixa qualidade', 'Use só imagens nítidas e em alta resolução; nunca estique uma imagem pequena nem use arquivo marcado como baixa resolução.', /borrad|pixel|baixa (qualidade|resolu)|desfocad|esticad/i],
    ['elemento_sem_relacao', 'Elemento sem relação com a fala', 'Para cada cena, escolha o elemento da Biblioteca cujo assunto combina com o que está sendo dito; se nada combinar, use um objeto gráfico em vez de forçar um arquivo.', /elemento.{0,30}(sem rela|n[aã]o (tem|combina)|nada a ver)|n[aã]o combina com (a )?fala|nada a ver/i],
    ['visual_poluido', 'Cena poluída ou com elementos demais', 'Uma ideia e um elemento principal por cena; deixe espaço livre para o texto.', /polu[ií]d|elementos demais|muita coisa|carregad/i],
    ['sobreposicao', 'Elementos sobrepostos ou fora de lugar', 'Nunca sobreponha texto, logo e elementos; mantenha cada coisa no seu lugar, com respiro.', /sobrep|um (em )?cima d[oa]|fora de lugar|desalinh/i],
    ['contraste_baixo', 'Contraste baixo (texto difícil de ler)', 'Garanta contraste forte entre texto e fundo; escureça o fundo com sombra ou troque a cor do texto.', /contraste|dif[ií]cil de ler|apagad/i],
    ['emoji_proibido', 'Emoji no vídeo', 'Nunca use emoji nos vídeos: use elementos da Biblioteca, objetos 3D gerados ou os objetos gráficos do motor.', /emoji/i],
    ['logo_ausente', 'Logo ausente ou mal posicionada', 'Inclua a logo da marca (da Biblioteca) e mantenha-a sempre na mesma região, sem cobrir texto.', /logo/i],
    ['visual_outro', 'Outro problema visual', 'Antes de entregar, olhe o vídeo como o dono: nada cortado, borrado, sobreposto, ilegível ou sem relação com a fala.', null],
    ['arquivo_faltando', 'Arquivo da biblioteca que não existe', 'Use somente nomes de arquivos que existem no catálogo da marca; nunca invente.', null],
    ['audio_estourado', 'Áudio estourado', 'Mantenha a mixagem sem estourar: trilha baixa e voz limpa.', null],
    ['audio_baixo', 'Áudio muito baixo', 'Garanta volume de voz audível: a narração é o elemento principal do áudio.', null]
  ]
};
const MOTIVOS = Object.fromEntries(Object.entries(MOTIVOS_DEF).map(([ag, ls]) => [ag, ls.map(([id, label, regra, kw]) => ({ id, label, regra, kw }))]));
const MOTIVOS_PUB = Object.fromEntries(Object.entries(MOTIVOS).map(([ag, ls]) => [ag, ls.map(m => ({ id: m.id, label: m.label, manual: !!m.kw }))]));
const motivoInfo = (agent, id) => (MOTIVOS[agent] || []).find(m => m.id === id);
const motivosValidos = (agent, l) => [...new Set((Array.isArray(l) ? l : []).map(String))].filter(id => motivoInfo(agent, id)).slice(0, 6);
const inferMotivos = (agent, texto) => (MOTIVOS[agent] || []).filter(m => m.kw && m.kw.test(String(texto || ''))).map(m => m.id).slice(0, 4);
const motivoRotulo = (agent, id) => motivoInfo(agent, id)?.label || id;
const tagsSql = tags => tags.length ? ',' + tags.join(',') + ',' : '';
const tagsDe = e => String(e.tags || '').split(',').filter(Boolean);
// Erros de diagramação valem para TODAS as marcas: aprendeu numa, o Cérebro cria a mesma regra geral (em teste) para não repetir nas outras. Fonte, cor e estilo são da marca e ficam só nela
const MOTIVOS_GERAIS = new Set(['texto_cortado', 'titulo_pequeno', 'contraste_baixo', 'composicao', 'mascote', 'texto_demais', 'capa_fraca', 'imagem_borrada', 'tamanho_errado', 'elemento_sem_relacao', 'emoji_proibido', 'sobreposicao', 'zona_segura', 'fundo_ruim', 'visual_outro']);
function brainRegraGeral(agent, tag, fmt, deMarca, porque) {
  try {
    const info = motivoInfo(agent, tag); if (!info || !MOTIVOS_GERAIS.has(tag) || !deMarca) return false;
    const chave = agent + ':' + tag; if (one("SELECT 1 x FROM brain_rules WHERE chave=? AND brand='' AND formato=?", chave, fmt || '')) return false;
    run("INSERT INTO brain_rules(agent,brand,type,text,evidence,source,status,weight,formato,chave,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", agent, '', 'evitar', info.regra, `Aprendido na marca ${deMarca}${porque ? ': ' + porque : ''}. Vale para todas as marcas para o erro não se repetir.`.slice(0, 300), 'motivo', 'teste', 2, fmt || '', chave, T(), T());
    brainLog(agent, `Regra geral criada a partir da marca ${deMarca}: ${info.label}`); return true;
  } catch (e) { console.error('regra geral:', e.message); return false; }
}
function brainReplicaRegrasGerais() {
  let n = 0;
  for (const r of all("SELECT * FROM brain_rules WHERE source='motivo' AND brand<>'' AND status IN ('teste','ativa') AND chave LIKE '%:%'")) { const [agent, tag] = r.chave.split(':'); if (brainRegraGeral(agent, tag, r.formato || '', r.brand, r.evidence ? String(r.evidence).slice(0, 90) : '')) n++; }
  if (n) { log('chefe', `Cérebro: ${n} regra(s) aprendida(s) numa marca viraram regra geral para as outras marcas não repetirem o erro`); changed(); }
  return n;
}
const PTS = { ajuste_dono: 2, motivo_manual: 2, checagem_falhou: 2, entrega_reprovada: 2, checagem_corrigida: 1 };

// Cada sinal de arte/vídeo alimenta: o teste das regras novas, os moldes aprovados e a criação automática de regras por motivo repetido
function brainSinais(agent, kind, c, tags) {
  try {
    if (!ensina(c) || !['designer', 'editor'].includes(agent)) return;
    const fmt = fmtGrupo(c.format);
    const bom = ['entrega_aprovada', 'aprovado_dono'].includes(kind), ruim = ['ajuste_dono', 'entrega_reprovada', 'checagem_falhou', 'motivo_manual'].includes(kind);
    if (bom || ruim) brainCanario(agent, c, fmt, bom ? 'ok' : 'ruim', tags);
    if (kind === 'aprovado_dono') brainMoldeSalva(agent, c);
    if (tags.length && PTS[kind]) for (const t of tags) brainMotivoAprende(agent, c, fmt, t);
  } catch (e) { console.error('brainSinais:', e.message); }
}
const ruleTags = (r, agent) => r.chave ? [r.chave.split(':')[1]] : inferMotivos(r.agent === '*' ? agent : r.agent, r.text);
// Regra em teste: vale já, mas só fica definitiva depois de 2 peças em que ela se aplicou sem o mesmo problema voltar
const TESTE_PECAS = 2;
function brainCanario(agent, c, fmt, res, tags) {
  const rows = all("SELECT * FROM brain_rules WHERE status='teste' AND (agent=? OR agent='*') AND (brand='' OR brand=? COLLATE NOCASE) AND (formato='' OR formato=?)", agent, c.brand || '', fmt);
  for (const r of rows) {
    const map = {}; for (const p of String(r.teste_ids || '').split(',').filter(Boolean)) { const [i, v] = p.split(':'); map[i] = v; }
    const v = res === 'ok' ? 'ok' : (ruleTags(r, agent).some(t => tags.includes(t)) ? 'ruim' : 'neutro'), cur = map[c.id];
    if (cur === 'ruim' || (cur === 'ok' && v !== 'ruim') || v === 'neutro') continue;
    map[c.id] = v;
    const ok = Object.values(map).filter(x => x === 'ok').length, ruimN = Object.values(map).filter(x => x === 'ruim').length;
    let status = 'teste', aviso = r.aviso || '';
    if (ok + ruimN >= TESTE_PECAS) {
      if (ruimN > ok) { status = 'proposta'; aviso = `Reprovada no teste: o mesmo problema voltou em ${ruimN} de ${ok + ruimN} peça(s). Reescreva a regra ou arquive.`; }
      else { status = 'ativa'; aviso = ''; }
    }
    run('UPDATE brain_rules SET teste_ids=?, teste_ok=?, teste_ruim=?, status=?, aviso=?, updated_at=? WHERE id=?', Object.entries(map).map(([i, x]) => i + ':' + x).join(','), ok, ruimN, status, aviso, T(), r.id);
    if (status !== 'teste') brainLog(agent, status === 'ativa' ? `Regra passou no teste e virou definitiva: ${r.text.slice(0, 100)}` : `Regra reprovada no teste, voltou para sua análise: ${r.text.slice(0, 100)}`);
  }
}
const brainLog = (agent, msg) => { try { log(agent, msg, null); } catch { /* só informativo */ } };
// O mesmo motivo se repetindo (você marcando ou a checagem automática falhando) vira regra sozinha, em teste, só para aquela marca e formato
function brainMotivoAprende(agent, c, fmt, tag) {
  const info = motivoInfo(agent, tag); if (!info) return;
  const chave = agent + ':' + tag, marca = c.brand || '';
  if (one('SELECT 1 x FROM brain_rules WHERE chave=? AND brand=? COLLATE NOCASE AND formato=?', chave, marca, fmt)) return;   // já existe (ativa, em teste ou arquivada de propósito)
  const evs = all("SELECT kind FROM brain_events WHERE tags LIKE ? AND agent=? AND brand=? COLLATE NOCASE AND formato=? AND ts > datetime('now','-90 days')", `%,${tag},%`, agent, marca, fmt);
  const pts = evs.reduce((a, e) => a + (PTS[e.kind] || 0), 0);
  const dono = evs.some(e => ['ajuste_dono', 'motivo_manual'].includes(e.kind));
  if (pts < (dono ? 2 : 3)) return;   // uma reprovação sua com motivo já basta; só a checagem automática precisa se repetir
  const onde = [marca && 'marca ' + marca, fmt && (FMT_ROTULO[fmt] || fmt).toLowerCase()].filter(Boolean).join(', ');
  run("INSERT INTO brain_rules(agent,brand,type,text,evidence,source,status,weight,formato,chave,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", agent, marca, 'evitar', info.regra, `Motivo “${info.label}” apareceu ${evs.length} vez(es)${onde ? ' (' + onde + ')' : ''}, marcado por você ou pela checagem automática.`, 'motivo', 'teste', 2, fmt, chave, T(), T());
  brainLog(agent, `Nova regra em teste (motivo repetido): ${info.label}`);
  brainRegraGeral(agent, tag, fmt, marca, `apareceu ${evs.length} vez(es)`);
}


// O que o dono escreveu ao reprovar vira regra na hora (em teste: vale já), sem esperar a consolidação do Cérebro e sem chamar IA
function brainAprendeDoDono(agent, c, texto) {
  try {
    const limpo = String(texto || '').split('\n').filter(l => !/^Motivos marcados pelo dono/.test(l) && !/^- .+: .+/.test(l)).join(' ').replace(/\s+/g, ' ').replace(/[<>]/g, '').trim().slice(0, 280);
    if (limpo.length < 8) return;
    const fmt = fmtGrupo(c.format), marca = c.brand || '', est = agent === 'editor' && c.estilo_video && c.estilo_video !== 'auto' ? (estiloVideo(c.estilo_video)?.nome || '') : '';
    const regras = all("SELECT * FROM brain_rules WHERE agent=? AND brand=? COLLATE NOCASE AND formato=? AND status IN ('ativa','teste','proposta')", agent, marca, fmt);
    const pal = t => new Set(String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3));
    const cobre = (x, y) => { const A = pal(x), B = pal(y); if (!A.size || !B.size) return 0; let i = 0; for (const w of A) if (B.has(w)) i++; return i / Math.min(A.size, B.size); };
    const igual = regras.find(r => brainSim(r.text, limpo) >= 0.5 || cobre(r.text, limpo) >= 0.6);
    if (igual) { run('UPDATE brain_rules SET weight=weight+1, updated_at=? WHERE id=?', T(), igual.id); return; }
    const regra = `${est ? 'No estilo ' + est + ': ' : ''}o dono reprovou e não quer repetir: “${limpo}”`;
    run("INSERT INTO brain_rules(agent,brand,type,text,evidence,source,status,weight,formato,chave,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", agent, marca, 'evitar', regra, `Você reprovou “${String(c.title || '').slice(0, 60)}” com esse motivo.`, 'dono', 'teste', 3, fmt, 'dono:' + crypto.createHash('sha1').update(limpo.toLowerCase()).digest('hex').slice(0, 8), T(), T());
    brainLog(agent, `Aprendeu com a sua reprovação: ${limpo.slice(0, 90)}`);
    for (const t of inferMotivos(agent, limpo)) brainRegraGeral(agent, t, fmt, marca, 'você reprovou: ' + limpo.slice(0, 70));
  } catch (e) { console.error('brainAprendeDoDono:', e.message); }
}

// ── Moldes: o que deu certo de primeira vira referência para o Designer e o Editor da marca
db.exec('CREATE TABLE IF NOT EXISTS brain_molds(id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT, brand TEXT DEFAULT \'\', formato TEXT DEFAULT \'\', content_id INTEGER, titulo TEXT, nota REAL, snap TEXT, ts TEXT, fixo INTEGER DEFAULT 0)');
try { db.exec('ALTER TABLE brain_molds ADD COLUMN ref TEXT'); } catch { /* já existe */ }
const limpaMarc = s => String(s ?? '').replace(/[*|]/g, ' ').replace(/\s+/g, ' ').trim();
function moldeTexto(agent, c) {
  const clipT = (s, n) => { s = limpaMarc(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  try {
    if (agent === 'designer') {
      const sp = JSON.parse(c.art_spec || '{}'), sl = sp.slides || []; if (!sl.length) return '';
      const L = [`“${clipT(c.title, 60)}” (${c.format}/${c.kind || '-'}${c.score != null ? ', nota ' + Number(c.score).toFixed(1) : ''}): ${sl.length} slide(s); acento ${sp.accent || '-'}, tinta ${sp.ink || '-'}, papel ${sp.paper || '-'}.`];
      sl.slice(0, 3).forEach((s, i) => L.push(`  Slide ${i + 1}: fundo ${s.bg?.gen ? 'IA “' + clipT(s.bg.gen, 70) + '”' : s.bg?.asset ? 'arquivo ' + s.bg.asset : 'cor lisa'}${s.shade ? ', sombra ' + s.shade : ''}; ` + (s.texts || []).slice(0, 4).map(t => `${t.role} ${t.align || 'center'} x${t.x ?? '-'} y${t.y ?? '-'}${t.size ? ' tam ' + t.size : ''} “${clipT(t.value, 40)}”`).join('; ') + ((s.items || []).length ? `; itens: ${s.items.slice(0, 2).map(x => x.asset + (x.pose ? ' (' + clipT(x.pose, 30) + ')' : '')).join(', ')}` : '')));
      return L.join('\n').slice(0, 1100);
    }
    const sp = JSON.parse(c.spec || '{}'), sc = sp.scenes || []; if (!sc.length) return '';
    const tot = sc.reduce((a, s) => a + (+s.dur || 0), 0), pal = s => limpaMarc((Array.isArray(s.text) ? s.text.map(t => t.value).join(' ') : s.text?.value) || '').split(/\s+/).filter(Boolean).length;
    const ins = [...new Set(sc.map(s => typeof s.in === 'string' ? s.in : s.in?.type).filter(Boolean))].join(', '), dec = [...new Set(sc.flatMap(s => s.decor || []).map(x => String(x).split(':')[0]))].join(', ');
    return [`“${clipT(c.title, 60)}” (${c.format}/${c.kind || '-'}${c.score != null ? ', nota ' + Number(c.score).toFixed(1) : ''}): ${sc.length} cenas, ${tot.toFixed(0)} s, média ${(tot / sc.length).toFixed(1)} s por cena, ${(sc.reduce((a, s) => a + pal(s), 0) / sc.length).toFixed(1)} palavras na tela por cena.`,
      `  Temas: ${sc.map(s => s.theme === 'dark' ? 'E' : 'C').join('')} (C claro, E escuro); transições: ${ins || 'corte'}; decoração: ${dec || '-'}; trilha ${sp.music_asset || '-'}; narração ${sp.voice_asset || 'sintética'}.`,
      `  Abertura: “${clipT(Array.isArray(sc[0].text) ? sc[0].text[0]?.value : sc[0].text?.value, 50)}” · Fechamento: “${clipT(Array.isArray(sc.at(-1).text) ? sc.at(-1).text[0]?.value : sc.at(-1).text?.value, 50)}”`].join('\n').slice(0, 900);
  } catch { return ''; }
}
function brainMoldeSalva(agent, c, { forcar = false } = {}) {
  if (!forcar && one("SELECT 1 x FROM brain_events WHERE content_id=? AND agent=? AND kind IN ('ajuste_dono','entrega_reprovada','checagem_falhou','motivo_manual')", c.id, agent)) return false;   // só o que o dono aprovou de primeira
  if (one('SELECT 1 x FROM brain_molds WHERE content_id=? AND agent=?', c.id, agent)) return false;
  const snap = moldeTexto(agent, c); if (!snap) return false;
  const fmt = fmtGrupo(c.format), marca = c.brand || '';
  run('INSERT INTO brain_molds(agent,brand,formato,content_id,titulo,nota,snap,ts) VALUES(?,?,?,?,?,?,?,?)', agent, marca, fmt, c.id, String(c.title || '').slice(0, 160), c.score ?? null, snap, T());
  for (const x of all('SELECT id FROM brain_molds WHERE agent=? AND brand=? COLLATE NOCASE AND formato=? AND fixo=0 ORDER BY COALESCE(nota,0) DESC, id DESC LIMIT -1 OFFSET 10', agent, marca, fmt)) run('DELETE FROM brain_molds WHERE id=?', x.id);
  return true;
}
function brainLayoutSalvo(c, tipo, nome, marca, ref = null) {   // o que o dono salva como layout/estilo vira referência fixa do Designer e entra no Cérebro
  try {
    brainEvent('designer', tipo === 'estilo' ? 'estilo_salvo' : 'layout_salvo', { ...c, brand: marca ?? c.brand }, `Você salvou ${tipo === 'estilo' ? 'o estilo' : 'o layout'} “${nome}”${marca ? ' da marca ' + marca : ''}: o Designer passa a seguir esse padrão`, '');
    brainMoldeSalva('designer', { ...c, brand: marca ?? c.brand }, { forcar: true });
    run("UPDATE brain_molds SET fixo=1, ref=? WHERE content_id=? AND agent='designer'", ref, c.id);
    brainSincronizaSalvos();
  } catch (e) { console.error('cérebro (layout salvo):', e.message); }
}

// O Cérebro tem de enxergar TUDO o que o dono guardou: cada layout salvo e cada estilo próprio viram um molde fixo do Designer (e um registro na atividade), mesmo os salvos antes desta versão
function brainSincronizaSalvos() {
  const ids = new Set(); let novos = 0;
  const molde = (cid, titulo, marca, fmtRaw, spec, ref = null) => {
    const fmt = fmtGrupo(fmtRaw), key = -cid; ids.add(key);
    const snap = moldeTexto('designer', { title: titulo, format: fmtRaw, kind: 'salvo', art_spec: JSON.stringify(spec) }); if (!snap) return false;
    const ex = one("SELECT id FROM brain_molds WHERE agent='designer' AND content_id=?", key);
    if (ex) { run('UPDATE brain_molds SET brand=?, formato=?, titulo=?, snap=?, fixo=1 WHERE id=?', marca, fmt, titulo.slice(0, 160), snap, ex.id); return false; }
    const par = one("SELECT id FROM brain_molds WHERE agent='designer' AND brand=? COLLATE NOCASE AND formato=? AND lower(titulo)=lower(?) AND content_id>0", marca, fmt, titulo.slice(0, 160));
    if (par) { run('UPDATE brain_molds SET fixo=1, ref=COALESCE(ref,?) WHERE id=?', ref, par.id); return false; }   // já existe o molde da própria peça: só fica fixo
    run("INSERT INTO brain_molds(agent,brand,formato,content_id,titulo,nota,snap,ts,fixo) VALUES('designer',?,?,?,?,NULL,?,?,1)", marca, fmt, key, titulo.slice(0, 160), snap, T()); return true;
  };
  const evento = (kind, resumo, marca, fmtRaw, ts) => {
    if (one('SELECT 1 x FROM brain_events WHERE kind=? AND summary=?', kind, resumo.slice(0, 400))) return;
    run("INSERT INTO brain_events(ts,agent,kind,content_id,brand,title,summary,detail,tags,formato) VALUES(?,?,?,?,?,?,?,?,?,?)", ts || T(), 'designer', kind, null, marca, '', resumo.slice(0, 400), '', tagsSql([]), fmtGrupo(fmtRaw)); novos++;
  };
  for (const l of all('SELECT * FROM art_layouts')) {
    const sp = jparse(l.spec, null); if (!sp?.slides?.length) continue;
    if (molde(l.id, l.name, l.brand || '', l.format, sp, 'layout:' + l.id)) evento('layout_salvo', `Você salvou o layout “${l.name}”${l.brand ? ' da marca ' + l.brand : ''}: o Designer passa a seguir esse padrão`, l.brand || '', l.format, l.created_at);
  }
  for (const r of all("SELECT * FROM art_templates WHERE central=''")) {
    const mapa = visMapa(r), ent = mapa[String(r.brand || '').toLowerCase()] || Object.values(mapa)[0], sn = ent?.snaps?.carrossel || ent?.snaps?.feed; if (!sn?.slides?.length) continue;
    const marca = r.brand || ent.brand || '';
    if (molde(100000 + r.id, r.nome, marca, ent?.snaps?.carrossel ? 'carrossel' : 'feed', sn, 'estilo:' + r.id)) evento('estilo_salvo', `Você salvou o estilo “${r.nome}”${marca ? ' da marca ' + marca : ''}: o Designer passa a seguir esse padrão`, marca, ent?.snaps?.carrossel ? 'carrossel' : 'feed', r.visual_at || r.created_at);
  }
  for (const m of all("SELECT id, content_id FROM brain_molds WHERE agent='designer' AND content_id<0")) if (!ids.has(m.content_id)) run('DELETE FROM brain_molds WHERE id=?', m.id);   // layout/estilo apagado: o molde some junto
  for (const m of all("SELECT id, ref FROM brain_molds WHERE ref IS NOT NULL AND content_id>0")) {   // molde de peça que só era fixo por causa de um layout/estilo que não existe mais: deixa de valer como padrão
    const [tp, rid] = String(m.ref).split(':'), vive = tp === 'layout' ? one('SELECT 1 x FROM art_layouts WHERE id=?', +rid) : one('SELECT 1 x FROM art_templates WHERE id=?', +rid);
    if (!vive) run('UPDATE brain_molds SET fixo=0, ref=NULL WHERE id=?', m.id);
  }
  if (novos) changed();
  return novos;
}

// O layout que o dono salvou a partir de uma NOTÍCIA da marca é o padrão de notícia dessa marca: a versão mais recente vence a antiga (era o que fazia a notícia sair no layout velho)
function radarAdotaLayout(brand, lid, nome) {
  try {
    if (!brand) return false;
    const raw = jparse(one("SELECT value FROM settings WHERE key='radar_cfg'")?.value, {}) || {}; raw.marcas = raw.marcas && typeof raw.marcas === 'object' ? raw.marcas : {};
    const k = Object.keys(raw.marcas).find(x => mesmaMarca(x, brand)) || brand, chave = 'layout-' + lid, ant = raw.marcas[k]?.estilo || '';
    if (ant === chave) return false;
    raw.marcas[k] = { ...(raw.marcas[k] || { ativo: true, termos: '', max: 2, formato: 'carrossel' }), estilo: chave };
    run("INSERT INTO settings(key,value) VALUES('radar_cfg',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(raw));
    log('designer', `As notícias da marca ${brand} agora usam o layout salvo mais recente, “${nome}”${ant ? ' (no lugar de ' + ant + ')' : ''}`);
    try { run("INSERT INTO brain_events(ts,agent,kind,content_id,brand,title,summary,detail,tags,formato) VALUES(?,?,?,?,?,?,?,?,?,?)", T(), 'designer', 'layout_salvo', null, brand, '', `Notícias da marca ${brand}: o layout “${nome}” que você corrigiu passou a ser o padrão (a versão antiga deixa de ser usada)`.slice(0, 400), '', tagsSql([]), 'carrossel'); } catch { /* ok */ }
    return true;
  } catch (e) { console.error('layout de notícia mais recente:', e.message); return false; }
}

// A troca automática da versão .214 foi desfeita a pedido do dono: se ela aconteceu, a marca volta ao estilo que tinha antes. Nada é apagado.
function radarDesfazTrocaAutomatica() {
  try {
    if (one("SELECT value FROM settings WHERE key='radar_desfaz_215'")) return;
    const raw = jparse(one("SELECT value FROM settings WHERE key='radar_cfg'")?.value, {}) || {}; let mud = false;
    for (const a of all("SELECT message FROM activity WHERE message LIKE 'As notícias da marca % agora usam o layout salvo mais recente%(no lugar de %' ORDER BY id")) {
      const m = /^As notícias da marca (.+) agora usam o layout salvo mais recente, “(.*)” \(no lugar de ([\w-]+)\)$/.exec(a.message); if (!m) continue;
      const k = Object.keys(raw.marcas || {}).find(x => mesmaMarca(x, m[1])), cur = raw.marcas?.[k]?.estilo || '';
      if (k && /^layout-\d+$/.test(cur) && one('SELECT name FROM art_layouts WHERE id=?', +cur.slice(7))?.name === m[2]) {
        const volta = /^dono-(\d+)$/.test(m[3]) ? !!one('SELECT 1 x FROM art_templates WHERE id=?', +m[3].slice(5)) : /^layout-(\d+)$/.test(m[3]) ? !!one('SELECT 1 x FROM art_layouts WHERE id=?', +m[3].slice(7)) : !!templateDe(m[3]);
        if (volta) { raw.marcas[k].estilo = m[3]; mud = true; log('designer', `As notícias da marca ${k} voltaram ao estilo que tinham antes (${m[3]}), como você pediu. O layout “${m[2]}” continua salvo, nada foi apagado`); }
      }
    }
    if (mud) run("INSERT INTO settings(key,value) VALUES('radar_cfg',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(raw));
    run("INSERT INTO settings(key,value) VALUES('radar_desfaz_215','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value"); run("INSERT INTO settings(key,value) VALUES('radar_recente_214','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    if (mud) changed();
  } catch (e) { console.error('desfazer troca de estilo:', e.message); }
}
// (desativado) Uma vez: layout que o dono salvou de uma notícia da marca depois do estilo que as notícias ainda usam → passa a valer o layout
function radarLayoutRecenteUmaVez() {
  try {
    if (one("SELECT value FROM settings WHERE key='radar_recente_214'")) return;
    const raw = jparse(one("SELECT value FROM settings WHERE key='radar_cfg'")?.value, {}) || {};
    for (const [b, m] of Object.entries(raw.marcas || {})) {
      const l = radarLayoutsDaMarca(b).filter(x => one("SELECT 1 x FROM contents WHERE kind='noticia' AND brand=? COLLATE NOCASE AND substr(title,1,60)=substr(?,1,60)", b, x.name)).sort((x, y) => String(y.updated_at).localeCompare(String(x.updated_at)))[0];
      if (!l || m?.estilo === 'layout-' + l.id) continue;
      const atual = /^dono-(\d+)$/.test(m?.estilo || '') ? one('SELECT visual_at FROM art_templates WHERE id=?', +m.estilo.slice(5))?.visual_at : /^layout-(\d+)$/.test(m?.estilo || '') ? one('SELECT updated_at FROM art_layouts WHERE id=?', +m.estilo.slice(7))?.updated_at : '';
      if (!m?.estilo || (atual && String(l.updated_at) > String(atual)) || !atual) radarAdotaLayout(b, l.id, l.name);
    }
    run("INSERT INTO settings(key,value) VALUES('radar_recente_214','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  } catch (e) { console.error('layout recente:', e.message); }
}
// Amostras da galeria de estilos (__previa__) ensinavam o Cérebro com erros que não eram de peça nenhuma: tira o que elas gravaram e confere de novo as regras que nasceram desse ruído
function brainLimpaPrevias() {
  try {
    if (one("SELECT value FROM settings WHERE key='brain_limpa_previas_212'")) return;
    const ruido = "(title LIKE '\\_\\_previa\\_\\_%' ESCAPE '\\' OR content_id IN (SELECT id FROM contents WHERE teste=3))";
    const n = one(`SELECT COUNT(*) n FROM brain_events WHERE ${ruido}`).n;
    if (n) {
      brainGuardaDesfazer('Antes de tirar do Cérebro o que as amostras da galeria de estilos gravaram');
      run(`DELETE FROM brain_events WHERE ${ruido}`);
      run('DELETE FROM brain_molds WHERE content_id IN (SELECT id FROM contents WHERE teste=3)');
      let regras = 0;
      for (const r of all("SELECT * FROM brain_rules WHERE source='motivo' AND status IN ('teste','ativa','proposta') AND chave LIKE '%:%'")) {
        const [agent, tag] = r.chave.split(':'), info = motivoInfo(agent, tag); if (!info || r.text !== info.regra) continue;   // regra que o dono mexeu na mão fica
        const evs = all("SELECT kind FROM brain_events WHERE tags LIKE ? AND agent=? AND brand=? COLLATE NOCASE AND formato=?", `%,${tag},%`, agent, r.brand || '', r.formato || '');
        const pts = evs.reduce((a, e) => a + (PTS[e.kind] || 0), 0), dono = evs.some(e => ['ajuste_dono', 'motivo_manual'].includes(e.kind));
        if (pts >= (dono ? 2 : 3) || r.usos > 0 || r.teste_ok > 0) { run('UPDATE brain_rules SET evidence=? WHERE id=?', `Motivo “${info.label}” apareceu ${evs.length} vez(es) nas peças reais, marcado por você ou pela checagem automática.`, r.id); continue; }
        run('DELETE FROM brain_rules WHERE id=?', r.id); regras++;
      }
      log('chefe', `Faxina automática do Cérebro: ${n} registro(s) de amostras de estilo (não eram peças reais) saíram da memória${regras ? ' e ' + regras + ' regra(s) que nasceram só desse ruído foram removidas' : ''}. Dá para desfazer na aba Memória.`); changed();
    }
    run("INSERT INTO settings(key,value) VALUES('brain_limpa_previas_212','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  } catch (e) { console.error('limpeza de amostras do Cérebro:', e.message); }
}
function moldesBloco(agent, c) {
  const fmt = fmtGrupo(c.format), rows = all("SELECT * FROM brain_molds WHERE agent=? AND (brand=? COLLATE NOCASE OR brand='') AND (formato=? OR formato='') ORDER BY fixo DESC, COALESCE(nota,0) DESC, id DESC LIMIT 5", agent, c.brand || '', fmt);
  let txt = rows.length ? `\n\n# MOLDES APROVADOS DESTA MARCA\nSão peças suas que o dono aprovou de primeira. Use como referência de nível, estrutura e padrão; não copie o conteúdo.\n${rows.map((m, i) => `${i + 1}. ${m.snap}`).join('\n')}` : '';
  // Marca com pouco padrão próprio: aproveita a diagramação que o dono já acertou em OUTRA marca (só a organização; cores, fonte e mascote seguem a identidade desta marca)
  if (agent === 'designer' && c.brand && rows.filter(m => m.fixo).length < 2) {
    const fora = all("SELECT * FROM brain_molds WHERE agent='designer' AND fixo=1 AND brand<>'' AND brand<>? COLLATE NOCASE AND formato=? ORDER BY id DESC LIMIT 2", c.brand, fmt);
    if (fora.length) txt += `\n\n# DIAGRAMAÇÃO JÁ ACERTADA EM OUTRAS MARCAS (referência)\nO dono salvou estes padrões em outras marcas. Copie só a organização (posições, hierarquia, tamanhos, espaçamento); use as cores, a fonte, a logo e o mascote da identidade desta marca.\n${fora.map((m, i) => `${i + 1}. (${m.brand}) ${m.snap}`).join('\n')}`;
  }
  return txt;
}

// ── Aviso: regra que briga com a identidade da marca
const COR_FAIXAS = { vermelho: [[345, 360], [0, 14]], laranja: [[15, 40]], amarelo: [[41, 68]], verde: [[69, 170]], azul: [[185, 255]], roxo: [[256, 299]], rosa: [[300, 344]] };
function corNome(hex) {
  const n = parseInt(String(hex).slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < .12 || l > .94 || l < .06) return l > .85 ? 'branco' : l < .2 ? 'preto' : 'cinza';
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  return Object.entries(COR_FAIXAS).find(([, fs]) => fs.some(([a, z]) => h >= a && h <= z))?.[0] || 'cinza';
}
const FONTES_CONHECIDAS = ['poppins', 'inter', 'montserrat', 'roboto', 'arial', 'helvetica', 'times', 'georgia', 'lato', 'open sans', 'playfair', 'oswald', 'bebas', 'impact', 'raleway', 'nunito', 'anton', 'comic sans'];
function brainConflito(r, cache = new Map()) {
  try {
    if (!['ativa', 'teste', 'proposta'].includes(r.status)) return '';
    const T0 = String(r.text || ''), low = T0.toLowerCase();
    if (!/fundo|fonte|tipografia|letra|\b(vermelh|laranj|amarel|verd|azul|roxo|rosa|preto|branco)/i.test(T0)) return '';
    const neg = (i) => /(n[aã]o|nunca|jamais|evite|sem|proibid)\b[^.;]{0,28}$/i.test(low.slice(Math.max(0, i - 32), i));
    const marcas = r.brand ? [r.brand] : all('SELECT name FROM brands').map(b => b.name), msgs = [];
    for (const b of marcas) {
      const iv = cache.get(b) || (cache.set(b, identidadeDe(b)), cache.get(b)); if (!iv.paper && !iv.cores?.length && !iv.ftit) continue;
      const pal = [...(iv.cores || []), ...(iv.apoio || []), iv.accent].filter(Boolean), nomes = new Set(pal.map(corNome)), princ = new Set((iv.cores || []).map(corNome));
      const m1 = /fundo\s+(claro|branco|escuro|preto)/.exec(low);
      if (m1 && iv.paper) {
        const quer = (/claro|branco/.test(m1[1]) ? 'claro' : 'escuro'), pede = neg(m1.index) ? (quer === 'claro' ? 'escuro' : 'claro') : quer, marcaEscura = lumHex(iv.paper) < .4;
        if ((pede === 'claro' && marcaEscura) || (pede === 'escuro' && !marcaEscura)) msgs.push(`${b} usa fundo ${marcaEscura ? 'escuro' : 'claro'}, mas a regra pede fundo ${pede}`);
      }
      for (const f of FONTES_CONHECIDAS) {
        const i = low.indexOf(f); if (i < 0 || neg(i)) continue;
        const fm = (iv.ftit || '') + ' ' + (iv.ftxt || '') + ' ' + (iv.fontAsset || ''); if (!fm.trim()) continue;
        if (!fm.toLowerCase().includes(f)) { msgs.push(`${b} usa ${(iv.ftit || iv.fontAsset || 'outra fonte').split(/[,(]/)[0].trim()}, mas a regra pede ${f}`); break; }
      }
      if (pal.length) for (const [nm] of Object.entries(COR_FAIXAS)) {
        const re = new RegExp('\\b' + nm.slice(0, -1) + '[oa]s?\\b|\\b' + nm + '\\b', 'i'), m = re.exec(T0); if (!m) continue;
        if (neg(m.index)) { if (princ.has(nm)) msgs.push(`${b} tem ${nm} como cor principal, mas a regra proíbe ${nm}`); }
        else if (!nomes.has(nm) && /use|usar|prefira|sempre|destaque|cor/i.test(low)) msgs.push(`a paleta de ${b} não tem ${nm}`);
      }
    }
    return [...new Set(msgs)].slice(0, 2).join('; ');
  } catch { return ''; }
}

const brainSim = (a, b) => { const x = new Set(tok(a)), y = new Set(tok(b)); if (!x.size || !y.size) return 0; let i = 0; for (const w of x) if (y.has(w)) i++; return i / (x.size + y.size - i); };
// Resultado real do post vira sinal para quem produziu: acima ou abaixo da média de engajamento da plataforma
function metricaSinal(m) {
  try {
    const c = m.content_id ? getContent(m.content_id) : null; if (!c || c.teste || !(m.views > 0)) return;
    const eng = x => (x.likes + x.comments + x.shares + x.saves) / x.views;
    const base = all("SELECT views,likes,comments,shares,saves FROM metrics WHERE id<>? AND views>0 AND (platform=? OR ?='') ORDER BY id DESC LIMIT 30", m.id, m.platform || '', m.platform || '');
    if (base.length < 3) return;
    const media = base.reduce((a, x) => a + eng(x), 0) / base.length; if (!media) return;
    const ratio = eng(m) / media; if (ratio < 1.3 && ratio > 0.7) return;
    const bom = ratio >= 1.3, pc = x => (Math.round(x * 1000) / 10).toString().replace('.', ',');
    const resumo = `Post ${bom ? 'acima' : 'abaixo'} da média: engajamento ${pc(eng(m))}% contra ${pc(media)}% de média (${m.platform || 'plataforma'}, ${num0(m.views)} views, ${c.format}/${c.kind})`;
    const detalhe = `${bom ? 'O que pode ter funcionado' : 'O que pode ter falhado'}: veja formato ${c.format}/${c.kind}, o gancho do roteiro, a arte, o vídeo, a legenda e o horário. Peça: “${clip(c.title, 100)}”${m.notes ? ' · nota do dono: ' + clip(m.notes, 200) : ''}`;
    for (const ag of ['roteirista', c.art && 'designer', c.video && 'editor', 'publicador'].filter(Boolean)) brainEvent(ag, bom ? 'resultado_bom' : 'resultado_fraco', c, resumo, detalhe);
  } catch (e) { console.error('metricaSinal:', e.message); }
}

// Relevância de uma regra para o pedido: fração das palavras da regra que aparecem no pedido
const brainOverlap = (rule, text) => { const x = new Set(tok(rule)), y = new Set(tok(text)); if (!x.size) return 0; let i = 0; for (const w of x) if (y.has(w)) i++; return i / x.size; };
const dias = n => `datetime('now','-${+n} days')`;
// Faxina da memória: o que está repetido, em conflito, parado ou sem efeito
function brainFaxinaScan() {
  const rs = all("SELECT * FROM brain_rules WHERE status IN ('ativa','proposta') ORDER BY weight DESC, id"), usado = new Set(), duplicadas = [], conflitos = [];
  const ref = r => ({ id: r.id, text: r.text, agent: r.agent, brand: r.brand, type: r.type, weight: r.weight });
  for (let i = 0; i < rs.length; i++) {
    const a = rs[i]; if (usado.has(a.id)) continue; const g = [];
    for (let j = i + 1; j < rs.length; j++) { const b = rs[j]; if (usado.has(b.id) || a.type !== b.type || a.agent !== b.agent || (a.brand || '') !== (b.brand || '')) continue; if (brainSim(a.text, b.text) >= 0.6) { g.push(b); usado.add(b.id); } }
    if (g.length) { duplicadas.push({ manter: ref(a), apagar: g.map(ref) }); usado.add(a.id); }
  }
  const ativas = rs.filter(r => r.status === 'ativa');
  for (let i = 0; i < ativas.length; i++) for (let j = i + 1; j < ativas.length; j++) {
    const a = ativas[i], b = ativas[j]; if (a.type === b.type || ![a.type, b.type].every(t => t === 'regra' || t === 'evitar')) continue;
    if (!(a.agent === b.agent || a.agent === '*' || b.agent === '*')) continue; if ((a.brand || '') !== (b.brand || '') && a.brand && b.brand) continue;
    if (brainSim(a.text, b.text) >= 0.5) conflitos.push({ a: ref(a), b: ref(b) });
  }
  const paradas = all(`SELECT * FROM brain_rules WHERE status='ativa' AND source<>'manual' AND weight<=1 AND created_at < ${dias(45)} AND (last_used IS NULL OR last_used < ${dias(45)}) ORDER BY id`).map(ref);
  const inefetivas = all("SELECT * FROM brain_rules WHERE status='ativa' AND flag<>'' ORDER BY id").map(ref);
  return { duplicadas, conflitos: conflitos.slice(0, 20), paradas, inefetivas,
    arquivadas: one(`SELECT COUNT(*) n FROM brain_rules WHERE status='arquivada' AND updated_at < ${dias(60)}`).n,
    eventos: one('SELECT COUNT(*) n FROM brain_events WHERE digest_id IS NOT NULL').n };
}
// Cópia da memória (para baixar, desfazer e restaurar)
const BRAIN_TABELAS = ['brain_base', 'brain_rules', 'brain_events', 'brain_digests', 'brain_molds'];
function brainSnap() { const o = { versao: 1, ts: T() }; for (const t of BRAIN_TABELAS) o[t] = all(`SELECT * FROM ${t}`); return o; }
function brainRestaura(snap, { limpar = false } = {}) {
  let n = 0; if (!snap || typeof snap !== 'object') throw new Error('Arquivo de cópia inválido');
  for (const t of BRAIN_TABELAS) {
    const rows = Array.isArray(snap[t]) ? snap[t] : []; if (limpar) run(`DELETE FROM ${t}`);
    const cols = all(`PRAGMA table_info(${t})`).map(c => c.name);
    for (const r of rows) { const ks = Object.keys(r).filter(k => cols.includes(k)); if (!ks.length) continue; run(`INSERT OR REPLACE INTO ${t}(${ks.join(',')}) VALUES(${ks.map(() => '?').join(',')})`, ...ks.map(k => r[k])); n++; }
  }
  return n;
}
db.exec('CREATE TABLE IF NOT EXISTS brain_undo(id INTEGER PRIMARY KEY CHECK(id=1), ts TEXT, resumo TEXT, data TEXT)');
function brainGuardaDesfazer(resumo) { try { const sn = JSON.stringify(brainSnap()); if (sn.length < 8e6) run('INSERT INTO brain_undo(id,ts,resumo,data) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET ts=excluded.ts, resumo=excluded.resumo, data=excluded.data', T(), String(resumo || '').slice(0, 200), sn); } catch (e) { console.error('brain_undo:', e.message); } }
const num0 = n => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
function brainPendingEvents() { return one('SELECT COUNT(*) n FROM brain_events WHERE digest_id IS NULL').n; }
function brainNewMetrics() { return all('SELECT * FROM metrics WHERE id > ? ORDER BY id DESC LIMIT 40', +(one("SELECT value FROM settings WHERE key='brain_met_last'")?.value || 0)); }

// Conhecimento inicial (uma única vez): regras de monetização por plataforma
if (!one("SELECT value FROM settings WHERE key='seed_monet_v1'")) {
  db.prepare('INSERT INTO knowledge(title,category,content,brand,created_at,updated_at) VALUES(?,?,?,?,?,?)').run('Monetização por plataforma — conferido em 14/10/2026', 'diretrizes', `YOUTUBE (fonte oficial: support.google.com/youtube/answer/72851, lida em 14/10/2026)
Duas vias de elegibilidade ao Programa de Parcerias: (1) 1.000 inscritos + 4.000 horas de exibição válidas em vídeos longos nos últimos 12 meses; (2) 1.000 inscritos + 10 milhões de visualizações válidas de Shorts nos últimos 90 dias. Horas dos Shorts no feed não contam para as 4.000 horas.
Também é preciso: seguir as políticas de monetização do canal, estar em país/região com suporte, não ter avisos ativos das Diretrizes da Comunidade, ter verificação em duas etapas, recursos avançados e uma conta do AdSense vinculada.
Atenção: o YouTube avalia o canal pelas políticas de monetização (originalidade). Conteúdo repetitivo, produzido em massa ou reaproveitado pode ser recusado ou desmonetizado. Vídeos feitos com IA precisam ter roteiro, narrativa e edição com valor próprio. Confira o texto atual da política no YouTube Studio.

TIKTOK, FACEBOOK/META E KWAI
Os requisitos mudam com frequência e variam por país. NÃO consegui ler as páginas oficiais, então confira no painel oficial de cada plataforma antes de planejar. Não trate números de blogs como regra.

PRINCÍPIOS QUE VALEM PARA TODAS
- Retenção é a moeda: gancho forte, loops abertos, escalada, cliffhanger e motivo para voltar (séries).
- Originalidade: roteiro e edição próprios; evitar reaproveitar vídeos de terceiros, marca d'água de outra plataforma e conteúdo em massa quase idêntico.
- Consistência de formato e de série; público que volta vale mais que alcance isolado.
- Direitos autorais: música, imagens e trechos precisam ter licença.
- Seguir as diretrizes da comunidade (sem promessas enganosas, saúde ou ganhos garantidos), pois isso derruba monetização e conta.
- Elegibilidade depende do país e do tipo de conta; confirme sempre no painel da plataforma.`, '', T(), T());
  db.prepare("INSERT INTO settings(key,value) VALUES('seed_monet_v1','1')").run();
}

// Diretrizes gerais (sem marca) saem da Base de conhecimento e vão para a base geral do Cérebro (uma única vez)
if (!one("SELECT 1 x FROM settings WHERE key='brain_base_v1'")) {
  for (const k of all("SELECT * FROM knowledge WHERE category='diretrizes' AND brand='' ORDER BY id")) {
    run('INSERT INTO brain_base(title,content,source,created_at,updated_at) VALUES(?,?,?,?,?)', k.title, k.content, 'migrado', k.created_at || T(), k.updated_at || T());
    run('DELETE FROM knowledge WHERE id=?', k.id);
  }
  run("INSERT INTO settings(key,value) VALUES('brain_base_v1','1')");
}

// Diretrizes por marca que sobraram: a aba Diretrizes deixou de existir; viram material da própria marca (categoria Outros)
if (!one("SELECT 1 x FROM settings WHERE key='brain_base_v2'")) {
  for (const k of all("SELECT * FROM knowledge WHERE category='diretrizes'")) {
    if (!k.brand) { run('INSERT INTO brain_base(title,content,source,created_at,updated_at) VALUES(?,?,?,?,?)', k.title, k.content, 'migrado', T(), T()); run('DELETE FROM knowledge WHERE id=?', k.id); }
    else run("UPDATE knowledge SET category='outros', title=? WHERE id=?", ('Diretrizes — ' + k.title).slice(0, 200), k.id);
  }
  run("INSERT INTO settings(key,value) VALUES('brain_base_v2','1')");
}

// Fluxo v2: o Analista foi fundido no Revisor (todo trabalho passa pelo Revisor); o Publicador passou a se chamar Social Media
if (!one("SELECT 1 x FROM settings WHERE key='flow_v2'")) {
  const an = one("SELECT * FROM agents WHERE id='analista'"), ge = one("SELECT * FROM agents WHERE id='gerente'");
  const seedG = AGENTS_SEED.find(a => a.id === 'gerente');
  if (ge) {
    run('UPDATE agents SET prompt=?, role=?, enabled=1, model=COALESCE(NULLIF(model,\'\'), ?) WHERE id=?', seedG.prompt, seedG.role, an?.model || '', 'gerente');
    if (an) run('UPDATE agents SET learn=?, avoid=? WHERE id=?', AGENT_RULES.gerente.learn, AGENT_RULES.gerente.avoid, 'gerente');
  }
  for (const [t, col] of [['jobs', 'agent'], ['brain_rules', 'agent'], ['brain_events', 'agent'], ['activity', 'agent']]) { try { run(`UPDATE ${t} SET ${col}='gerente' WHERE ${col}='analista'`); } catch {} }
  run("DELETE FROM agents WHERE id='analista'");
  run("UPDATE agents SET name='Social Media', role=? WHERE id='publicador' AND name='Publicador'", AGENTS_SEED.find(a => a.id === 'publicador').role);
  run("INSERT INTO settings(key,value) VALUES('approve_script','0') ON CONFLICT(key) DO UPDATE SET value='0'");
  run("DELETE FROM settings WHERE key='gerente_on'");
  run("INSERT INTO settings(key,value) VALUES('flow_v2','1')");
}

// Revisor/Gerente v1: o antigo Gerente passou a se chamar Revisor; o novo Gerente (id 'chefe') é o agente-chefe com chat
if (!one("SELECT 1 x FROM settings WHERE key='rev_v1'")) {
  const rr = s => String(s || '').replace(/Gerente/g, 'Revisor').replace(/GERENTE/g, 'REVISOR');
  const seedR = AGENTS_SEED.find(a => a.id === 'gerente');
  for (const a of all('SELECT id,prompt,learn,avoid FROM agents')) run('UPDATE agents SET prompt=?, learn=?, avoid=? WHERE id=?', a.id === 'chefe' ? a.prompt : rr(a.prompt), rr(a.learn), rr(a.avoid), a.id);
  run("UPDATE agents SET name='Revisor', role=? WHERE id='gerente'", seedR.role);
  try { for (const r of all('SELECT id,text FROM brain_rules')) if (/Gerente/.test(r.text)) run('UPDATE brain_rules SET text=? WHERE id=?', rr(r.text), r.id); } catch { /* tabela ainda não existe */ }
  // pautas, métricas e consolidação do Cérebro passam a ser trabalho do novo Gerente
  run("UPDATE jobs SET agent='chefe' WHERE kind IN ('pautas','cerebro','relatorio') AND status='queued'");
  run("INSERT INTO settings(key,value) VALUES('rev_v1','1')");
}

// ───────────────────────── Fila e pipeline ─────────────────────────
function enqueue(contentId, agent, kind, input = {}, origin = 'auto', runAfter = null) {
  const r = run('INSERT INTO jobs(content_id,agent,kind,status,input,origin,cday,created_at,run_after) VALUES(?,?,?,?,?,?,?,?,?)',
    contentId, agent, kind, 'queued', JSON.stringify(input), origin, today(), T(), runAfter);
  dlog('fila', `novo pedido #${r.lastInsertRowid}: ${agent}/${kind}${contentId ? ' do conteúdo #' + contentId : ''}${input?.feedback ? ' (devolvido: ' + String(input.feedback).replace(/\s+/g, ' ').slice(0, 160) + ')' : ''}${origin && origin !== 'auto' ? ' origem=' + origin : ''}`);
  changed(); setImmediate(pump);
  return +r.lastInsertRowid;
}
const getContent = id => one('SELECT * FROM contents WHERE id=?', id);
const setContent = (id, fields) => {
  const keys = Object.keys(fields);
  if ('status' in fields) dlog('conteudo', `#${id} status -> ${fields.status}${fields.error ? ' | ' + String(fields.error).slice(0, 200) : ''}`);
  run(`UPDATE contents SET ${keys.map(k => k + '=?').join(',')}, updated_at=? WHERE id=?`, ...keys.map(k => fields[k] ?? null), T(), id);
  changed();
};
const agentRow = id => one('SELECT * FROM agents WHERE id=?', id);
const GOAL_LABEL = { produto: 'VENDER UM PRODUTO (venda natural, contada como história)', conteudo: 'MONETIZAR O PRÓPRIO CONTEÚDO (retenção e audiência)' };
const TYPE_LABEL = { ebook: 'E-book', curso: 'Curso', mentoria: 'Mentoria', servico: 'Serviço', software: 'Software / app', fisico: 'Produto físico', outro: 'Outro' };
function productBlock(p, full) {
  const L = [['Nome', p.name], ['Tipo', TYPE_LABEL[p.type] || p.type], ['Marca', p.brand || (p.brands || []).join(', ')], ['Link da página de vendas', p.url], ['Preço', p.price], ['O QUE O CLIENTE RECEBE (entregável)', p.deliverable], ['Promessa', p.promise], ['Público', p.audience], ['Dores', p.pains], ['Objeções comuns', p.objections], ['Bônus', p.bonus], ['Garantia', p.guarantee]];
  let t = L.filter(([, v]) => (v || '').trim()).map(([k, v]) => `${k}: ${v.trim()}`).join('\n');
  if (full && (p.page_text || '').trim()) t += `\n\nTEXTO DA PÁGINA DE VENDAS (use para entender o produto; não copie frases):\n${p.page_text.trim().slice(0, 6000)}`;
  return t;
}
function brief(c, full = false) {
  let t = `Título/tema: ${c.title}\nFormato: ${c.format}\nTipo de conteúdo: ${c.kind}\nPlataforma: ${c.platform || 'não definida'}`;
  if (c.brand) t += `\nMarca: ${c.brand} (use SOMENTE o conhecimento desta marca e o geral; ignore o das outras marcas)`;
  if (c.goal) t += `\nOBJETIVO: ${GOAL_LABEL[c.goal]}`;
  t += `\nBriefing: ${c.brief || '(sem briefing adicional)'}`;
  const p = c.product_id ? one('SELECT * FROM products WHERE id=?', c.product_id) : null;
  if (p) t += `\n\n# PRODUTO A VENDER\n${productBlock({ ...p, brand: c.brand || brandsOfProduct(p.id).join(', ') }, full)}`;
  return t;
}

// Lê uma seção do roteiro ("## LEGENDA", "LEGENDA", "**LEGENDA**", "Legenda:") até o próximo título em maiúsculas
const HEAD = /^\s*(?:#{1,4}\s*)?(?:\*\*)?([A-ZÀ-Ú][A-ZÀ-Ú0-9 \/&+-]{2,40})(?:\*\*)?\s*:?\s*$/;
function secao(script, nome) {
  const linhas = String(script || '').split(/\r?\n/), norm = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  let i = linhas.findIndex(l => { const m = l.match(HEAD) || l.match(/^\s*(?:#{1,4}\s*)?(?:\*\*)?([A-Za-zÀ-ú ]{3,40})(?:\*\*)?\s*:\s*$/); return m && norm(m[1]).trim().startsWith(norm(nome)); });
  if (i < 0) return '';
  const out = [];
  for (i++; i < linhas.length && !HEAD.test(linhas[i]); i++) out.push(linhas[i]);
  return out.join('\n').trim();
}
const parseCaption = script => {   // aceita "## LEGENDA" e o modelo do dono ("Legenda do Post" numa linha, com ou sem dois-pontos)
  let t = secao(script, 'LEGENDA');
  if (!t) { const m = String(script || '').match(/(?:^|\n)\s*(?:\*\*)?legenda(?: do post)?(?:\*\*)?\s*:?\s*\n([\s\S]+?)(?=\n\s*(?:#{1,4}\s|_{4,}|-{4,}|📌)|$)/i); t = m ? m[1].trim() : ''; }
  return t.replace(/^\s*(?:\*\*)?legenda do post(?:\*\*)?\s*:?\s*\n/i, '').trim();
};

async function enviarWebhook(c, pack) {
  const url = settings().webhook_url;
  if (!(url && /^https?:\/\//i.test(url))) return;
  try {
    const w = await fetch(url, {
      method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event: 'content.approved', content: { id: c.id, title: c.title, format: c.format, platform: c.platform, kind: c.kind, script: c.script, art: c.art, video: c.video, pack } })
    });
    log('publicador', `Webhook enviado (${w.status}) para "${c.title}"`, c.id);
  } catch (e) { log('publicador', `Webhook falhou: ${e.message}`, c.id); }
}

// Pacote de postagem montado direto do roteiro aprovado (sem nova rodada de IA)
function montarPacote(c) {
  const legenda = c.caption || parseCaption(c.script);
  const txtTags = secao(c.script, 'HASHTAGS') || legenda;
  const hashtags = [...new Set((txtTags.match(/#[\p{L}\p{N}_]+/gu) || []))].slice(0, 30);
  const video = isVideo(c.format);
  const checklist = textoPuro(c)
    ? ['Ler o texto final em voz alta', 'Conferir links e dados citados', 'Publicar e acompanhar as respostas']
    : [video ? 'Editar o vídeo conforme a decupagem e conferir legenda na tela' : 'Montar a arte conforme a direção de arte (Canva/Figma)',
       'Conferir ortografia da arte e da legenda', 'Conferir o link da bio / CTA', 'Postar e responder os primeiros comentários'];
  return { legenda_final: legenda, hashtags, primeiro_comentario: '', horario_sugerido: '', checklist, observacoes: secao(c.script, 'NOTAS') };
}

// ───────────────────────── Motor de vídeo (motion 2D) ─────────────────────────
// Editor → spec.json → [objetos fal.ai] → [voz ElevenLabs/Murf] → trilha → render (Playwright + ffmpeg) → MP4
const MOTOR_DIR = path.join(__dirname, 'motor');
// Metadados e miniatura de um arquivo da biblioteca (melhor esforço: sem ffprobe o arquivo entra do mesmo jeito)
function probeAsset(id, ext) {
  const file = path.join(ASSET_DIR, id + '.' + ext); let dur = 0, w = 0, h = 0;
  if (![...AUD_EXT, ...VID_EXT].includes(ext)) return { dur, w, h };
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeout: 20000, maxBuffer: 4e6 }).toString());
    dur = Math.round((+j.format?.duration || 0) * 10) / 10;
    const v = (j.streams || []).find(x => x.codec_type === 'video'); if (v) { w = +v.width || 0; h = +v.height || 0; }
  } catch { /* ffprobe ausente ou arquivo ilegível */ }
  if (VID_EXT.includes(ext)) { try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.min(1, dur / 2 || 0)), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', path.join(ASSET_DIR, id + '.thumb.jpg')], { timeout: 30000 }); } catch { /* sem miniatura */ } }
  return { dur, w, h };
}
const assetPath = a => path.join(ASSET_DIR, a.id + '.' + a.ext);
const fmtDur = d => d ? (d >= 60 ? Math.floor(d / 60) + ' min ' + Math.round(d % 60) + ' s' : (Math.round(d * 10) / 10) + ' s') : '';
const orient = a => !a.w || !a.h ? '' : a.h > a.w * 1.2 ? 'vertical' : a.w > a.h * 1.2 ? 'horizontal' : 'quadrado';

// ───────────────────────── Ficha de cada arquivo da Biblioteca (o que o Editor "sabe" sobre ele) ─────────────────────────
const TIPOS_VISUAIS = { elemento: 'Elemento solto (fundo transparente)', fundo: 'Fundo ou cenário', foto: 'Foto', ilustracao: 'Ilustração', video_fundo: 'Vídeo de fundo', animacao: 'Animação', textura: 'Textura ou padrão', logo: 'Logo', mascote: 'Mascote ou personagem', icone: 'Ícone', audio: 'Áudio', fonte: 'Fonte', outro: 'Outro' };
const fichaDe = a => { try { return a.ficha ? JSON.parse(a.ficha) : null; } catch { return null; } };
// Parte técnica, sem IA: tamanho, transparência, claro/escuro e cores dominantes (lê 16x16 pixels pelo ffmpeg)
function tecnicoAsset(a) {
  const file = path.join(ASSET_DIR, a.id + '.' + a.ext), t = { w: a.w || 0, h: a.h || 0, orient: orient(a) };
  const ehImg = IMG_EXT.includes(a.ext) && a.ext !== 'svg', ehVid = VID_EXT.includes(a.ext);
  if (a.ext === 'svg') { t.alpha = true; return t; }
  if (!ehImg && !ehVid) return t;
  try {
    if (ehImg && (!t.w || !t.h)) {
      const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,pix_fmt', '-of', 'json', file], { timeout: 15000 }).toString()), v = (j.streams || [])[0] || {};
      t.w = +v.width || 0; t.h = +v.height || 0; if (t.w && t.h) { run('UPDATE assets SET w=?, h=? WHERE id=?', t.w, t.h, a.id); t.orient = orient({ w: t.w, h: t.h }); }
    }
    const src = ehVid ? ['-ss', String(Math.min(1, (a.dur || 2) / 2)), '-i', file] : ['-i', file];
    const buf = execFileSync('ffmpeg', ['-loglevel', 'error', ...src, '-frames:v', '1', '-vf', 'scale=16:16:flags=area,format=rgba', '-f', 'rawvideo', '-'], { timeout: 20000, maxBuffer: 1e6 });
    let n = 0, clear = 0, lum = 0; const bk = new Map();
    for (let i = 0; i + 3 < buf.length; i += 4) {
      const [r, g, b, al] = [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
      if (al < 40) { clear++; continue; }
      n++; lum += (.299 * r + .587 * g + .114 * b) / 255;
      const k = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5), o = bk.get(k) || { c: 0, r: 0, g: 0, b: 0 }; o.c++; o.r += r; o.g += g; o.b += b; bk.set(k, o);
    }
    const tot = buf.length / 4;
    t.transparencia_pct = Math.round(clear / tot * 100); t.alpha = ehImg && clear / tot > .08;
    if (n) { const l = lum / n; t.tom = l > .62 ? 'claro' : l < .32 ? 'escuro' : 'médio'; }
    t.cores = [...bk.values()].sort((x, y) => y.c - x.c).slice(0, 3).map(o => '#' + [o.r, o.g, o.b].map(v => Math.round(v / o.c).toString(16).padStart(2, '0')).join(''));
  } catch { /* sem ffmpeg: fica só com o que já se sabe */ }
  if (t.w && t.h && Math.max(t.w, t.h) < 700 && (ehImg || ehVid)) t.baixa_res = true;
  return t;
}
const FICHA_CAMPOS = `{"tipo_visual":"elemento|fundo|foto|ilustracao|video_fundo|animacao|textura|logo|mascote|icone","assunto":"o que é, em poucas palavras (ex.: foguete 3D laranja)","descricao":"1 a 2 frases: o que aparece, estilo visual, ponto de interesse e onde fica o espaço livre","uso":"para que tipo de cena serve (ex.: gancho sobre crescimento, prova de resultado, chamada final de venda)","evitar":"quando NÃO usar (ex.: fundo muito poluído para texto longo)","momentos":["gancho","dor","solucao","prova","oferta","cta"],"estilo":"estilos de motion que combinam (ex.: neon, impacto, minimal)","legivel_com_texto":true,"tem_pessoas":false,"tem_texto_na_imagem":false,"qualidade":"alta|media|baixa"}`;
// ───────── Ficha técnica do MASCOTE: características detalhadas que o Designer e o gerador de poses obedecem ─────────
const MASC_CAMPOS = [['nome', 'Nome do personagem', 60], ['resumo', 'Quem é (1 frase)', 200], ['corpo', 'Corpo, altura e proporções', 300], ['rosto', 'Rosto, expressão padrão, olhos, sobrancelhas, sorriso', 300], ['pele_cabelo', 'Tom de pele, cabelo, barba', 200], ['roupa', 'Roupa e calçado (peça por peça)', 400], ['acessorios', 'Acessórios fixos (boné, corrente, relógio, maleta…)', 300], ['cores', 'Cores da marca no personagem (com hex)', 200], ['estilo', 'Estilo de arte (3D, cartoon, render, iluminação, acabamento)', 240], ['personalidade', 'Personalidade e atitude', 240], ['poses_ok', 'Poses e expressões permitidas', 300], ['nunca', 'NUNCA fazer (o que descaracteriza)', 400], ['uso', 'Quando usar o mascote (capa, CTA, exemplo…) e onde posicionar', 300], ['obs', 'Observações extras', 400]];
function mascoteFichaDe(a) { const m = fichaDe(a)?.mascote; return m && typeof m === 'object' ? m : null; }
function salvaMascoteFicha(a, b) {
  const f = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n);
  const m = {}; for (const [k, , n] of MASC_CAMPOS) m[k] = f(b?.[k], n);
  const prev = fichaDe(a) || {};
  run('UPDATE assets SET ficha=? WHERE id=?', JSON.stringify({ ...prev, mascote: m }), a.id);
  return m;
}
// versão compacta para os prompts: só o que foi preenchido
function mascoteFichaTexto(a, curto = false) {
  const m = mascoteFichaDe(a); if (!m) return '';
  const ordem = curto ? ['resumo', 'corpo', 'rosto', 'pele_cabelo', 'roupa', 'acessorios', 'cores', 'estilo', 'nunca'] : MASC_CAMPOS.map(c => c[0]);
  const rot = Object.fromEntries(MASC_CAMPOS.map(c => [c[0], c[1].replace(/ \(.*\)$/, '')]));
  return ordem.filter(k => m[k]).map(k => `${rot[k]}: ${m[k]}`).join('. ');
}
function pedidoFicha(a, tec) {
  return `Você é o analista visual da biblioteca de um estúdio de vídeo motion. Descreva este arquivo para que o Editor saiba EXATAMENTE quando e como usá-lo.\n\nArquivo: ${a.name} (${a.kind}, ${a.ext}${tec?.w ? ', ' + tec.w + 'x' + tec.h : ''}${tec?.alpha ? ', com transparência' : ''})${a.tags ? '\nEtiquetas do dono: ' + a.tags : ''}${a.note ? '\nObservação do dono: ' + a.note : ''}\n\nDevolva SOMENTE um bloco \`\`\`json com esta estrutura (sem comentários):\n${FICHA_CAMPOS}`;
}
function salvaFicha(a, ia, origem) {
  const f = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n);
  const lista = v => (Array.isArray(v) ? v : String(v || '').split(',')).map(x => f(x, 30)).filter(Boolean).slice(0, 8);
  const tipo = Object.keys(TIPOS_VISUAIS).includes(ia.tipo_visual) ? ia.tipo_visual : 'outro';
  const prev = fichaDe(a) || {}, tec = prev.tecnico || tecnicoAsset(a);
  const nova = { tecnico: tec, ia: { tipo_visual: tipo, assunto: f(ia.assunto, 120), descricao: f(ia.descricao, 400), uso: f(ia.uso, 300), evitar: f(ia.evitar, 240), momentos: lista(ia.momentos), estilo: f(ia.estilo, 120), legivel_com_texto: ia.legivel_com_texto !== false, tem_pessoas: !!ia.tem_pessoas, tem_texto_na_imagem: !!ia.tem_texto_na_imagem, qualidade: ['alta', 'media', 'baixa'].includes(ia.qualidade) ? ia.qualidade : 'media' }, origem };
  if (prev.mascote) nova.mascote = prev.mascote;
  run('UPDATE assets SET ficha=?, ficha_status=? WHERE id=?', JSON.stringify(nova), origem === 'manual' ? 'manual' : 'ok', a.id);
  return nova;
}
async function prepararFicha(id, { ia = true } = {}) {
  const a = one('SELECT * FROM assets WHERE id=?', id); if (!a) return;
  const tec = tecnicoAsset(a), prev = fichaDe(a);
  const ehMidia = IMG_EXT.includes(a.ext) || VID_EXT.includes(a.ext);
  if (!prev || prev.origem === 'tecnico') run('UPDATE assets SET ficha=?, ficha_status=? WHERE id=?', JSON.stringify({ tecnico: tec, origem: 'tecnico', ...(prev?.mascote ? { mascote: prev.mascote } : {}) }), ehMidia ? 'tecnico' : 'ok', id);
  else run('UPDATE assets SET ficha=? WHERE id=?', JSON.stringify({ ...prev, tecnico: tec }), id);
  if (!ia || MANUAL || !ehMidia || prev?.origem === 'manual') return;
  try {
    const imgs = []; const file = assetPath(a);
    if (['png', 'jpg', 'jpeg', 'webp'].includes(a.ext)) { const v = visionImg(file); if (v) imgs.push(v); }
    if (!imgs.length) {
      const tmp = path.join(ASSET_DIR, `.an-${a.id}-%d.jpg`), n = VID_EXT.includes(a.ext) ? 3 : 1;
      for (let i = 0; i < n; i++) {
        const out = path.join(ASSET_DIR, `.an-${a.id}-${i}.jpg`), at = VID_EXT.includes(a.ext) ? String(Math.max(0, (a.dur || 3) * (i + 1) / (n + 1))) : '0';
        try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', at, '-i', file, '-frames:v', '1', '-vf', 'scale=768:-2', out], { timeout: 30000 }); const v = visionImg(out); if (v) imgs.push(v); } catch { /* quadro indisponível */ } finally { try { fs.unlinkSync(out); } catch { /* ok */ } }
      }
    }
    if (!imgs.length) throw new Error('não consegui ler a imagem');
    const r = await callClaude({ agent: agentRow('editor'), user: pedidoFicha(a, tec), maxTokens: 1200, images: imgs });
    const j = extractJson(r.text, '{'); if (!j || typeof j !== 'object') throw new Error('resposta sem JSON');
    salvaFicha(one('SELECT * FROM assets WHERE id=?', id), j, 'ia'); changed();
  } catch (e) { run("UPDATE assets SET ficha_status='erro' WHERE id=? AND ficha_status<>'manual'", id); console.error('ficha', a.name, e.message); }
}
let fichaFila = Promise.resolve();
const agendaFicha = (id, opt) => { fichaFila = fichaFila.then(() => prepararFicha(id, opt)).catch(() => {}); return fichaFila; };
// Linha do catálogo que o agente lê: tudo o que ele precisa saber sobre o arquivo
function fichaLinha(a) {
  const f = fichaDe(a), t = f?.tecnico || {}, i = f?.ia;
  const tech = [t.alpha ? 'fundo transparente' : '', t.tom ? 'tom ' + t.tom : '', t.cores?.length ? 'cores ' + t.cores.join(' ') : '', t.baixa_res ? 'BAIXA RESOLUÇÃO' : ''].filter(Boolean).join(', ');
  if (!i) return `${tech ? ' [' + tech + ']' : ''} (sem descrição ainda: use pelo nome e pelas etiquetas)`;
  return ` [${TIPOS_VISUAIS[i.tipo_visual] || i.tipo_visual}${tech ? ', ' + tech : ''}] ${i.assunto}. ${i.descricao}${i.uso ? ' USO: ' + i.uso + '.' : ''}${i.momentos?.length ? ' Momentos: ' + i.momentos.join('/') + '.' : ''}${i.estilo ? ' Combina com: ' + i.estilo + '.' : ''}${i.evitar ? ' EVITE: ' + i.evitar + '.' : ''}${i.legivel_com_texto === false ? ' Não coloque texto por cima.' : ''}`;
}
const RENDER_DIR = path.join(DATA_DIR, 'renders'); fs.mkdirSync(RENDER_DIR, { recursive: true });


// Pedido para analisar um vídeo de referência (no chat com o Claude ou direto pela API) e devolver um estilo pronto para o catálogo
function pedidoEstiloReferencia(obs) {
  const looks = ESTILOS_MOTION.map(e => `- "${e.look}": ${e.resumo}`).join('\n');
  return `Você é diretor de motion design. Vou te mostrar um vídeo de referência (ou quadros dele). Estude o estilo e devolva a RECEITA para o nosso motor de vídeo reproduzir esse estilo com qualquer tema.${obs ? '\nObservação do dono: ' + obs : ''}

O motor só entende este vocabulário, então traduza o que você vê para ele:
- "base_look" (escolha o mais próximo do visual da referência):
${looks}
- Cenas "light" e "dark" (alternância de fundo), cores "accent", "accent2", "light" e "dark" em hexadecimal.
- Transições ("in"): cut, fade, dim, zoom, whip, circle.
- Decoração ("decor"): grid, dots, scan, stripes, blobs, bars, barcode, badge, curve:s|left|right|arc, none.
- Texto: "mode" stack (blocos), ticker (palavras deslizando) ou word (uma palavra por vez); tamanho em px (40 a 240); palavra-chave marcada com *asteriscos*.
- Objetos (NUNCA emoji): img (arquivo da biblioteca), orb (esfera 3D), ring (anel), chart (gráfico), card (lista com ícone numérico), profile, gradientWord, counter (número que sobe), figure, circle; entrada pop, fade, slideL, slideR, slideB, slideT, drop, zoom; movimento parado float, spin, sway, drift, none.
- Câmera por cena: "cam":{"from":1,"to":1.1,"rotTo":-3}.

Devolva SOMENTE um bloco \`\`\`json válido (sem comentários) com estas chaves:
{"nome":"nome curto do estilo (2 a 3 palavras)","resumo":"uma frase sobre o visual","melhor":"para que tipo de vídeo serve","ritmo":"ex.: Cenas de 1,2 a 2,0 s","base_look":"um dos looks acima","accent":"#hex da cor de destaque","light":"#hex do fundo claro","dark":"#hex do fundo escuro","cor":["#hexFundo","#hexSegundoFundo","#hexDestaque"],
"receita":"texto com as regras para o Editor reproduzir o estilo, em tópicos começando com '- ': ritmo e duração das cenas, transições, decoração, tipografia e tamanho do texto, como destacar palavras-chave, tipos de objeto e como entram, câmera, cores, estrutura típica do vídeo e o que EVITAR",
"exemplo":{"fps":30,"look":"o base_look","accent":"#hex","scenes":[4 a 6 cenas de exemplo no formato do motor, sobre qualquer tema]}}`;
}
function salvaEstiloReferencia(texto, nomeForcado) {
  let j = null;
  const blocos = [...String(texto || '').matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)].map(m => m[1]);
  for (const cand of [...blocos.reverse(), String(texto || '')]) { try { const x = extractJson(cand, '{'); if (x && typeof x === 'object' && (x.receita || x.nome)) { j = x; break; } } catch { /* tenta o próximo */ } }
  if (!j || typeof j !== 'object') throw fail(400, 'Não encontrei o bloco JSON do estilo na resposta. Cole a resposta inteira do Claude.');
  const nome = String(nomeForcado || j.nome || '').replace(/[<>]/g, '').trim().slice(0, 40);
  const receita = String(j.receita || '').replace(/[<>]/g, '').trim().slice(0, 4000);
  if (nome.length < 2) throw fail(400, 'A resposta não trouxe o nome do estilo');
  if (receita.length < 40) throw fail(400, 'A resposta não trouxe a receita do estilo (campo "receita")');
  const hex = v => /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : '';
  const look = LOOKS_VALIDOS.includes(j.base_look || j.look) ? (j.base_look || j.look) : 'editorial';
  let id = slugEstilo(nome) || 'estilo', existe = estiloVideo(id); if (existe && !existe.custom) id += '-meu';
  const cor = (Array.isArray(j.cor) ? j.cor : []).map(hex).filter(Boolean).slice(0, 3);
  const accent = hex(j.accent) || cor[2] || '';
  let exemplo = '';
  if (j.exemplo && Array.isArray(j.exemplo.scenes) && j.exemplo.scenes.length >= 2) { try { const ex = sanitizeSpec({ ...j.exemplo, look, accent: hex(j.exemplo.accent) || accent || undefined, light: hex(j.light) || undefined, dark: hex(j.dark) || undefined }); exemplo = JSON.stringify(ex); } catch { /* sem exemplo */ } }
  const f = (v, n) => String(v || '').replace(/[<>]/g, '').trim().slice(0, n);
  run('INSERT OR REPLACE INTO motion_styles(id,nome,resumo,melhor,ritmo,look,cor,accent,receita,exemplo,origem,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', id, nome, f(j.resumo, 300), f(j.melhor, 200), f(j.ritmo, 80), look, JSON.stringify(cor.length ? cor : ['#111111', '#2a2a2a', accent || '#ffffff']), accent, receita, exemplo, 'referencia', T());
  changed(); return estiloVideo(id);
}
// ───────────────────────── Estilos de vídeo (motion e VSL) ─────────────────────────
const slugEstilo = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const pubEstilo = (e, tipo, custom) => ({ poster: !custom && fs.existsSync(path.join(__dirname, 'public', 'estilos', e.id + '.jpg')), id: e.id, nome: e.nome, resumo: e.resumo, melhor: e.melhor, ritmo: e.ritmo, look: e.look, cor: e.cor, tipo, custom: !!custom, accent: e.accent || e.cor?.[2] || '', temExemplo: !!e.exemplo });
function estilosVideo() {
  const custom = all('SELECT * FROM motion_styles ORDER BY created_at DESC').map(r => ({ ...r, cor: (() => { try { return JSON.parse(r.cor); } catch { return []; } })(), exemplo: (() => { try { return r.exemplo ? JSON.parse(r.exemplo) : null; } catch { return null; } })() }));
  const ocultos = new Set(all('SELECT id FROM motion_hidden').map(r => r.id));
  return [...ESTILOS_MOTION.filter(e => !ocultos.has(e.id)).map(e => ({ ...e, tipo: 'motion', custom: false })), ...custom.map(e => ({ ...e, tipo: 'motion', custom: true })), { ...ESTILO_HARDCOPY, tipo: 'hardcopy', custom: false }];
}
const estiloVideo = id => estilosVideo().find(e => e.id === id) || null;
const exemploCompacto = e => e.exemplo ? JSON.stringify(e.exemplo) : '';
// O que o Editor recebe no pedido: a receita completa do estilo escolhido (ou a escolha guiada quando o dono deixa o Editor decidir)
function estiloVideoBloco(c) {
  const id = String(c?.estilo_video || ''); if (!id) return '';
  if (id === 'auto') {
    const ls = estilosVideo().filter(e => e.tipo === 'motion').map(e => `- ${e.id} (${e.nome}): ${e.resumo} Melhor para: ${e.melhor}. ${e.ritmo}.`).join('\n');
    return `# ESTILO DE VÍDEO: ESCOLHA DO EDITOR\nO dono pediu que você escolha o estilo de motion que melhor combina com o tema, o tom do roteiro e a marca. Escolha UM dos estilos abaixo, escreva "look" (o look do estilo) e "estilo" (o id) no topo do spec e, na decupagem, justifique em UMA frase. Siga a receita do estilo escolhido do começo ao fim, sem misturar estilos. Se o roteiro tiver tom emocional ou de história, prefira cinema; se for promoção, impacto; tecnologia, neon; calma e premium, minimal; senão editorial. Prefira sempre estilos com imagens, elementos e objetos em cena: nunca entregue um vídeo só de texto.\n${ls}\nLooks aceitos: ${LOOKS_VALIDOS.join(', ')}.`;
  }
  const e = estiloVideo(id); if (!e) return '';
  if (e.tipo === 'hardcopy') return `# ESTILO DE VÍDEO ESCOLHIDO PELO DONO: VSL (obrigatório)\n${e.receita}\nEscreva "estilo":"hardcopy" e "look":"editorial" no topo do spec.`;
  const ex = exemploCompacto(e);
  return `# ESTILO DE VÍDEO ESCOLHIDO PELO DONO: ${e.nome.toUpperCase()} (obrigatório)\nO estilo escolhido manda sobre o ritmo, o número de cenas, as transições e a decoração do guia geral. Escreva "look":"${e.look}" e "estilo":"${e.id}" no topo do spec.\n${e.receita}${ex ? `\n\nModelo deste estilo (exemplo de spec; adapte ao roteiro, nunca copie o texto):\n\`\`\`json\n${ex}\n\`\`\`` : ''}`;
}
// Garante que o spec entregue siga o estilo pedido, mesmo que o modelo esqueça um campo
function aplicaEstilo(sp, c) {
  const id = String(c?.estilo_video || ''); if (!id || !sp) return [];
  const avisos = [];
  if (id === 'auto') {
    if (!LOOKS_VALIDOS.includes(sp.look)) { sp.look = 'editorial'; avisos.push('O Editor não indicou o look; usei Editorial.'); }
    sp.estilo = sp.estilo || sp.look; return avisos;
  }
  const e = estiloVideo(id); if (!e) return avisos;
  if (sp.look !== e.look) { if (sp.look) avisos.push(`O look do spec (${sp.look}) foi trocado para ${e.look}, do estilo ${e.nome}.`); sp.look = e.look; }
  sp.estilo = e.id;
  if (e.custom && e.accent && !sp.accent) sp.accent = e.accent;
  return avisos;
}
const assetColecao = (nome, marca) => { const n = slugName(nome); return n ? (one("SELECT colecao FROM assets WHERE name=? AND brand=? COLLATE NOCASE", n, marca || '') || one("SELECT colecao FROM assets WHERE name=? AND brand=''", n))?.colecao || '' : ''; };
const MOTION_GUIA = `# SPEC DO VÍDEO (obrigatório neste reel)
Depois da decupagem, entregue UM bloco \`\`\`json com o spec que o motor de vídeo da agência renderiza sozinho (HTML → MP4, 1080x1920, 30 fps). O bloco deve ser JSON válido, sem comentários.

Regras do roteiro em cenas:
- Sem um ESTILO DE VÍDEO definido no pedido: 10 a 14 cenas, 15 a 25 s no total. Com um estilo definido, o ritmo, o número de cenas, as transições e a decoração da receita dele mandam sobre este guia. Cada cena carrega meia frase: no máximo 6 palavras na tela e 1 ou 2 palavras-chave marcadas com *asteriscos*. "|" quebra a linha.
- Estrutura: gancho que valida o público → contraste/dor em cena escura → causa → prova ou lista → virada → CTA final em modo "ticker" numa cena escura. Alterne "light" e "dark" (escuro = tensão, claro = contexto e virada), salvo se a receita do estilo disser outra coisa.
- "narration" = o que é FALADO naquela cena, em frase natural com as mesmas ideias das palavras da tela, na mesma ordem. A voz define a duração real; "dur" (segundos) é só uma estimativa.
- Use as cores da identidade visual da marca: "accent" (cor de destaque, hex), "light" (fundo claro, hex) e "brand" (nome da marca em MAIÚSCULAS para o selo).
- Objetos, nesta ordem de preferência: (1) um elemento 3D ou imagem da seção Motion da biblioteca que combine com a cena, como {"type":"img","asset":"nome-exato"}; (2) um objeto 3D gerado: "gen" com descrição curta EM INGLÊS no formato "glossy 3D render of <objeto>, soft studio lighting, vibrant colors, isolated on plain background" (no máximo 8 "gen" no vídeo) e "value" com um emoji só de reserva; (3) um objeto gráfico do motor: orb (esfera), ring (anel) ou chart (gráfico), nas cores do estilo. NUNCA use emoji. Um objeto forte por cena vale mais que vários pequenos.
- Logo, mascote ou foto da marca: {"type":"img","asset":"nome-exato-do-arquivo","x":0.5,"y":0.5,"size":300} usando SOMENTE nomes do catálogo de arquivos; nunca invente nome nem escreva "src". Se faltar o arquivo, escreva ARQUIVO FALTANDO na decupagem.
- BIBLIOTECA DE MÍDIA: antes de criar a decupagem, leia a ficha de CADA arquivo do catálogo (o que é, tom, cores, uso, momentos e o que evitar). Para cada cena, escolha o elemento cujo assunto combina com a fala daquela cena e com o momento do vídeo (gancho, dor, solução, prova, oferta, CTA). Não repita o mesmo elemento mais de 2 vezes, respeite o "EVITE" e o "Não coloque texto por cima" da ficha, e prefira cores que combinem com o accent da marca. Na tabela da decupagem, inclua as colunas "Elemento" (nome exato do arquivo) e "Por que esse" (uma frase). Use o que existe nele, sempre pelo nome exato:
  · Estilo VSL: se o pedido pedir VSL, monte as cenas SOMENTE com os arquivos da seção “VSL” (vídeos, imagens e animações; um por cena em bg, shade 0.25 a 0.4, texto curto por cima) e não misture arquivos da seção Motion.
  · Estilo motion: use os arquivos da seção “Motion”: imagens e elementos entram como item img; fundos e vídeos de fundo entram em bg. Não use arquivos da seção VSL.
  · Vídeo ou foto de fundo de uma cena: "bg":{"asset":"nome","shade":0.45} dentro da cena (shade 0 a 0.8 escurece o fundo para o texto ficar legível; para vídeo, "start":segundos opcional). Prefira fundos que combinem com o assunto da cena e use no máximo 1 vídeo de fundo a cada 2 cenas.
  · Trilha: "music_asset":"nome" (arquivo de tipo musica). Escolha pelo clima nas etiquetas e na descrição.
  · Narração já gravada: "voice_asset":"nome" (arquivo de tipo narracao) no topo do spec; nesse caso a duração das cenas deve acompanhar a duração do áudio.
  Se nada do catálogo servir, siga sem fundo. Nunca cite música protegida nem use logos de terceiros.

Formato:
{"fps":30,"look":"editorial|neon|minimal|impacto|gradiente|cinema","estilo":"id do estilo escolhido","accent":"#E5141B","accent2":"#7C3AED (opcional)","light":"#F5F2EB","dark":"#0A0A0A (opcional)","brand":"MARCA • 2026",
 "scenes":[{"dur":1.6,"theme":"light|dark",
   "in":"cut|fade|dim|zoom|whip|circle",
   "decor":["grid","dots","scan","stripes","blobs","bars","barcode","badge","curve:s|left|right|arc","scatter:🤡","none"],
   "narration":"frase falada nesta cena",
   "text":{"value":"Você tem as | *ideias* e | *conteúdo*","y":0.42,"size":66,"align":"center|left|right","x":0.42,"mode":"stack|ticker|word"},
   "items":[{"type":"img|orb|ring|chart|card|profile|gradientWord|counter|figure|circle","asset":"nome-exato (se img)","gen":"opcional, em inglês","color":"#hex opcional (orb, ring, chart)","x":0.5,"y":0.5,"size":420,"rot":0,"at":0,"enter":"pop|fade|slideL|slideR|slideB|slideT|drop|zoom","idle":"float|spin|sway|drift|none"}]}]}
- "look" define o visual inteiro (paleta, tipografia, brilho e câmera) e vem da receita do estilo; "mode":"word" mostra uma palavra por vez. x e y são frações da tela (0 a 1) e size é em px. A primeira cena não tem "in". "text" também aceita uma lista de blocos.
- NUNCA use emoji em objetos nem em ícones. orb = esfera 3D brilhante, ring = anel 3D, chart = gráfico de barras em alta, todos coloridos pelo accent (ou "color"). Em card, "icon" é um número curto ("1", "2") ou vazio (vira um visto).
- card: "title" e "items":[{"icon":"1","text":"sem alcance"}]. gradientWord: "text". counter: "from","to","decimals" (casas),"prefix","suffix","dur" (s da contagem); use para número de resultado, ex. {"from":1.2,"to":3.4,"decimals":1,"prefix":"R$ ","suffix":" mi"}. profile: "handle","name","posts","followers","following","bio":[].
- Se um bloco de texto passa de 4 palavras por linha, reduza "size". Nada de texto sobreposto ao objeto.`;

const LOOKS_VALIDOS = ['editorial', 'neon', 'minimal', 'impacto', 'gradiente', 'cinema', 'cinetico'];
function sanitizeSpec(raw) {
  const clean = (v, depth = 0) => {
    if (depth > 8) return undefined;
    if (typeof v === 'string') return v.replace(/[<>]/g, '').slice(0, 400);
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'boolean' || v === null) return v;
    if (Array.isArray(v)) return v.slice(0, 40).map(x => clean(x, depth + 1)).filter(x => x !== undefined);
    if (typeof v === 'object') {
      const o = {};
      for (const [k, x] of Object.entries(v)) {
        if (!/^[\w-]{1,30}$/.test(k) || k === 'src') continue;       // "src" nunca vem do modelo: os arquivos são resolvidos pelo servidor
        const y = clean(x, depth + 1); if (y !== undefined) o[k] = y;
      }
      return o;
    }
    return undefined;
  };
  const sp = clean(raw);
  if (!sp || !Array.isArray(sp.scenes) || sp.scenes.length < 2) throw new Error('O spec precisa ter pelo menos 2 cenas');
  sp.scenes = sp.scenes.slice(0, 30).map(s => {
    s.dur = Math.max(0.5, Math.min(15, Number(s.dur) || 1.8));
    s.theme = s.theme === 'dark' ? 'dark' : 'light';
    if (Array.isArray(s.items)) s.items = s.items.slice(0, 30);
    return s;
  });
  sp.fps = 30;
  for (const k of ['accent', 'light', 'accent2', 'dark', 'dark2']) if (sp[k] && !/^#[0-9a-fA-F]{3,8}$/.test(sp[k])) delete sp[k];
  if (sp.look && !LOOKS_VALIDOS.includes(sp.look)) delete sp.look;
  if (sp.estilo && !/^[\w-]{1,40}$/.test(String(sp.estilo))) delete sp.estilo;
  for (const sc of sp.scenes) for (const T of (Array.isArray(sc.text) ? sc.text : (sc.text ? [sc.text] : []))) if (T && T.mode && !['stack', 'ticker', 'word'].includes(T.mode)) delete T.mode;
  if (sp.font && !/^[\w \-]{1,40}$/.test(sp.font)) delete sp.font;
  return sp;
}
function extractSpec(text) {
  let found = null, raw = '';
  for (const m of String(text || '').matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)) {
    try { const j = JSON.parse(m[1]); if (j && Array.isArray(j.scenes)) { found = j; raw = m[0]; } } catch {}
  }
  if (!found) {   // JSON "quase certo" (vírgula sobrando, aspas): usa o leitor tolerante da casa a partir do último bloco json
    const i = String(text || '').lastIndexOf('```json');
    if (i >= 0) { const seg = text.slice(i); try { const j = extractJson(seg.replace(/^```json/, ''), '{'); if (j && Array.isArray(j.scenes)) { found = j; raw = seg; } } catch {} }
  }
  return found ? { spec: sanitizeSpec(found), raw } : null;
}

let motorCache = null;
function motorStatus() {
  if (motorCache && Date.now() - motorCache.t < 20000) return motorCache.v;
  const has = cmd => { try { execFileSync(cmd, ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } };
  let playwright = false; try { createRequire(path.join(MOTOR_DIR, 'render.mjs')).resolve('playwright'); playwright = true; } catch {}
  const e = process.env, ff = has('ffmpeg') && has('ffprobe');
  const eleven = { key: !!e.ELEVENLABS_API_KEY, voice: !!e.ELEVENLABS_VOICE_ID }, murf = { key: !!e.MURF_API_KEY, voice: !!e.MURF_VOICE_ID }, fal = !!falKey(), falPausa = falPausado();
  const pref = settings().voz_provider;
  const okEleven = eleven.key && eleven.voice, okMurf = murf.key && murf.voice;
  const provider = pref === 'nenhuma' ? null : pref === 'murf' ? (okMurf ? 'murf' : null) : pref === 'elevenlabs' ? (okEleven ? 'elevenlabs' : null) : okEleven ? 'elevenlabs' : okMurf ? 'murf' : null;
  const v = { ffmpeg: ff, playwright, eleven, murf, fal, fal_pausa: falPausa, provider, can_render: ff && playwright, bancos: bancosAtivos().map(b => b.nome) };
  motorCache = { t: Date.now(), v }; return v;
}

// Vídeo da biblioteca → sequência de quadros JPG (cache): o motor desenha quadro a quadro, então precisa de imagens
const CLIP_FPS = 24;
function clipFrames(a, start, secs) {
  const key = `${a.id}_${Math.round(start * 10)}_${Math.ceil(secs)}`, dir = path.join(RENDER_DIR, '_clips', key);
  if (!fs.existsSync(path.join(dir, 'f0001.jpg'))) {
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(Math.max(0, start)), '-t', String(Math.ceil(secs)), '-i', assetPath(a), '-vf', `fps=${CLIP_FPS},scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`, '-q:v', '5', path.join(dir, 'f%04d.jpg')], { timeout: 180000 });
  }
  return fs.readdirSync(dir).filter(f => /^f\d+\.jpg$/.test(f)).sort().map(f => pathToFileURL(path.join(dir, f)).href);
}

// Prepara o spec do banco: resolve arquivos da marca, aplica limites de custo e remove o que não pode ser gerado
function prepareSpec(c, { withGen, withVoice }) {
  const sp = JSON.parse(c.spec), warn = [];
  const findAsset = name => {
    const n = slugName(name); if (!n) return null;
    return one("SELECT * FROM assets WHERE name=? AND brand=? COLLATE NOCASE", n, c.brand || '') || one("SELECT * FROM assets WHERE name=? AND brand=''", n);
  };
  const aPath = a => path.join(ASSET_DIR, a.id + '.' + a.ext);
  let gen = 0; const maxGen = Math.max(0, Math.min(12, +settings().max_gen_objects || 0));
  for (const s of sp.scenes) {
    if (s.bg && s.bg.asset) {   // fundo vindo da biblioteca: foto ou vídeo
      const a = findAsset(s.bg.asset), shade = Math.max(0, Math.min(0.85, +s.bg.shade || 0)), start = Math.max(0, +s.bg.start || 0);
      if (a && IMG_EXT.includes(a.ext) && fs.existsSync(assetPath(a))) s.bg = { src: pathToFileURL(assetPath(a)).href, shade };
      else if (a && VID_EXT.includes(a.ext) && fs.existsSync(assetPath(a))) {
        try { s.bg = { frames: clipFrames(a, start, (+s.dur || 3) + 1), fps: CLIP_FPS, shade, loop: true }; }
        catch { warn.push(`Não consegui ler o vídeo “${s.bg.asset}” (ffmpeg): cena sem vídeo de fundo`); delete s.bg; }
      } else { warn.push(`Fundo “${s.bg.asset}” não está na biblioteca — cena sem fundo`); delete s.bg; }
    } else if (s.bg) delete s.bg;
    s.items = (s.items || []).filter(it => {
      if (it.asset) {
        const a = findAsset(it.asset);
        if (!a || !IMG_EXT.includes(a.ext) || !fs.existsSync(aPath(a))) { warn.push(`Arquivo “${it.asset}” não está cadastrado na marca — item removido`); return false; }
        it.type = 'img'; it.src = pathToFileURL(aPath(a)).href; delete it.asset; delete it.gen;
        return true;
      }
      if (it.type === 'img' && it.gen) {   // objeto 3D pedido pelo Editor ("img" + "gen"): gera no modo final; nas prévias vira um orbe no mesmo lugar
        if (withGen && gen < maxGen) { gen++; return true; }
        it.type = 'orb'; delete it.gen; return true;
      }
      if (it.type === 'img') { warn.push(`Cena ${sp.scenes.indexOf(s) + 1}: imagem sem arquivo escolhido — item removido (escolha a imagem na ilha de edição)`); return false; }
      if (it.type === 'emoji' || !it.type) { if (it.gen && withGen && gen < maxGen) { gen++; return true; } it.type = 'orb'; delete it.gen; delete it.value; return true; }
      if (it.gen) { if (withGen && gen < maxGen) gen++; else delete it.gen; }
      return true;
    });
  }
  // Spec sem nenhuma narração (ex.: o vídeo de exemplo): a voz lê o próprio texto da tela
  if (withVoice && !sp.scenes.some(s => (s.narration || '').trim())) {
    const falado = t => (Array.isArray(t) ? t : t ? [t] : []).map(x => String(x && x.value != null ? x.value : x).split('|').join(' ')).join(' ').replace(/\s+/g, ' ').trim();
    let n = 0; for (const s of sp.scenes) { const f = falado(s.text); if (f) { s.narration = f; n++; } }
    if (n) warn.push('O spec não tinha narração: a voz vai ler o texto que aparece na tela. Para uma fala mais natural, escreva o campo "narration" em cada cena.');
  }
  let music = null, voiceFile = null;
  if (sp.music_asset) {
    const a = findAsset(sp.music_asset);
    if (a && AUD_EXT.includes(a.ext) && fs.existsSync(aPath(a))) music = aPath(a); else warn.push(`Trilha “${sp.music_asset}” não está na biblioteca — usando a trilha base`);
    delete sp.music_asset;
  }
  if (sp.voice_asset) {
    const a = findAsset(sp.voice_asset);
    if (a && AUD_EXT.includes(a.ext) && fs.existsSync(aPath(a))) {
      voiceFile = aPath(a);
      const total = sp.scenes.reduce((x, s) => x + (+s.dur || 0), 0);
      if (a.dur && Math.abs(a.dur - total) > 1.5) warn.push(`A narração “${sp.voice_asset}” tem ${fmtDur(a.dur)} e as cenas somam ${fmtDur(Math.round(total * 10) / 10)}: ajuste a duração das cenas (edite o spec) para a fala acompanhar a imagem.`);
    } else warn.push(`Narração “${sp.voice_asset}” não está na biblioteca — vídeo sem essa voz`);
    delete sp.voice_asset;
  }
  return { spec: sp, music, voiceFile, warn, gen };
}

const renderState = new Map();     // id -> { status, mode, step, pct, log[], warn[], started }
const renderQueue = []; let renderBusy = false;
// Troca o vídeo pronto pelo anterior. No Windows o arquivo antigo pode estar aberto por um instante (player, antivírus,
// indexador): tenta de novo por alguns segundos, depois apaga o antigo e copia, sem deixar a renderização morrer no rename.
async function moveOver(tmp, out) {
  const wait = ms => new Promise(r => setTimeout(r, ms)); let last;
  for (let i = 0; i < 12; i++) {
    try { fs.renameSync(tmp, out); return; } catch (e) { last = e; if (!['EPERM', 'EBUSY', 'EACCES', 'EEXIST'].includes(e.code)) throw e; }
    if (i === 3) { try { fs.rmSync(out, { force: true }); } catch { /* ainda preso */ } }
    await wait(250 + i * 150);
  }
  try { fs.copyFileSync(tmp, out); fs.rmSync(tmp, { force: true }); return; } catch (e) { last = e; }
  throw last;
}
const renderFile = id => path.join(RENDER_DIR, id + '.mp4');
const cleanRender = id => { try { fs.rmSync(renderFile(id), { force: true }); fs.rmSync(path.join(RENDER_DIR, String(id)), { recursive: true, force: true }); } catch {} renderState.delete(id); };
const prevFile = id => path.join(RENDER_DIR, String(id), 'previa', 'sheet.png');
function renderInfo(id) {
  const st = renderState.get(id) || null;
  const f = renderFile(id);
  return { state: st && { ...st, log: st.log.slice(-12) }, has_video: fs.existsSync(f), video_at: fs.existsSync(f) ? fs.statSync(f).mtime.toISOString() : null, has_previa: fs.existsSync(prevFile(id)), motor: motorStatus() };
}
function startRender(id, mode) {
  const c = getContent(id); if (!c || !c.spec) throw fail(400, 'Este projeto ainda não tem spec de vídeo');
  const mo = motorStatus();
  if (!mo.can_render) throw fail(400, 'O motor de vídeo não está instalado neste computador: faltam ' + [!mo.ffmpeg && 'ffmpeg', !mo.playwright && 'playwright (npm i playwright)'].filter(Boolean).join(' e ') + '. Veja o README, seção “Motor de vídeo”.');
  const cur = renderState.get(id);
  if (cur && ['running', 'queued'].includes(cur.status)) throw fail(409, 'Este vídeo já está na fila ou renderizando');
  renderState.set(id, { status: 'queued', mode, step: 'Na fila', pct: 0, log: [], warn: [], started: Date.now() });
  if (mode === 'previa') renderQueue.unshift({ id, mode }); else renderQueue.push({ id, mode });   // a prévia leva segundos: passa na frente dos vídeos completos (a inspeção visual e a tela dependem dela)
  changed(); setImmediate(renderPump);
}
async function renderPump() {
  if (renderBusy) return; const job = renderQueue.shift(); if (!job) return;
  renderBusy = true;
  try { await runRender(job.id, job.mode); } catch (e) { const st = renderState.get(job.id); if (st) { st.status = 'error'; st.step = e.message; } log('editor', `Falha ao renderizar o vídeo do projeto #${job.id}: ${e.message}`, job.id); }
  renderBusy = false; changed(); setImmediate(renderPump);
}
// Procura no log do render a linha que explica a falha e traduz os erros mais comuns
function causaRender(log) {
  const L = (log || []).filter(x => !/^\s+at |^\s*$|Etapa falhou|^\s*[\]}{]/.test(x));
  const hit = [...L].reverse().find(x => /HTTP \d{3}|Error:|Falta|Defina|não encontrad|ENOENT|ffmpeg|ffprobe/i.test(x)) || L[L.length - 1] || 'veja o final do log';
  const m = hit.match(/HTTP (\d{3})/); const code = m ? +m[1] : 0, low = hit.toLowerCase();
  if (/api_key_id_used_as_api_key|api key id used/.test(low)) return 'você colocou o ID da chave no .env, e não a chave secreta. A ELEVENLABS_API_KEY tem de começar com sk_ (crie uma chave nova em elevenlabs.io → Developers → API Keys e copie na hora, pois ela só aparece uma vez)';
  if (code === 401 || /invalid_api_key|unauthorized/.test(low)) return 'chave de API recusada (confira a chave no .env) · ' + hit.slice(0, 160);
  if (code === 402 || /paid_plan|payment_required/.test(low)) return 'esta voz exige plano pago da ElevenLabs (use uma voz sua/padrão ou troque o ID) · ' + hit.slice(0, 160);
  if (code === 404 || /voice_not_found/.test(low)) return 'ID da voz não existe nesta conta (confira ELEVENLABS_VOICE_ID) · ' + hit.slice(0, 160);
  if (code === 429 || /quota|credits/.test(low)) return 'sem créditos ou limite atingido no serviço de voz/objetos · ' + hit.slice(0, 160);
  return hit.slice(0, 220);
}
function runRender(id, mode) {
  return new Promise((resolve, reject) => {
    const c = getContent(id), st = renderState.get(id); if (!c || !st) return resolve();
    reloadEnv();
    const mo = { ...motorStatus() };
    // Voz da marca (Conhecimento › Tom de voz) vale mais que a voz global do .env
    const bv = c.brand ? one("SELECT voice_provider,voice_name,voice_id FROM knowledge WHERE category='tom_de_voz' AND brand=? COLLATE NOCASE AND voice_id<>'' ORDER BY updated_at DESC LIMIT 1", c.brand) : null;
    const envKey = { elevenlabs: 'ELEVENLABS_API_KEY', murf: 'MURF_API_KEY' };
    const childEnv = { ...process.env }; if (falPausado()) childEnv.FAL_KEY = '';   // fal.ai em standby: o motor não gera objetos 3D
    if (bv && envKey[bv.voice_provider] && process.env[envKey[bv.voice_provider]] && settings().voz_provider !== 'nenhuma') { mo.provider = bv.voice_provider; childEnv[bv.voice_provider === 'murf' ? 'MURF_VOICE_ID' : 'ELEVENLABS_VOICE_ID'] = bv.voice_id; }
    let full = mode === 'video' || mode === 'semvoz', mudo = mode === 'mudo', avisoChave = '';   // 'semvoz' = qualidade final (objetos 3D, trilha, efeitos), sem narração
    let useVoice = mode === 'video' && !!mo.provider, useGen = full && mo.fal;
    // Chave da ElevenLabs inválida: em vez de falhar, entrega o vídeo sem áudio e avisa
    if (useVoice && mo.provider === 'elevenlabs' && !String(process.env.ELEVENLABS_API_KEY || '').startsWith('sk_')) {
      full = false; mudo = true; useVoice = false; useGen = false;
      avisoChave = 'A ELEVENLABS_API_KEY no .env não é uma chave secreta (tem de começar com sk_; você provavelmente colou o ID da chave). Gerei o vídeo SEM ÁUDIO para você não ficar parado. Para ter a voz: crie uma chave nova em elevenlabs.io → Developers → API Keys, cole em ' + (envAtivo() || path.join(__dirname, '.env')) + ' e renderize de novo.';
    }
    const pre0 = (() => { try { return JSON.parse(c.spec); } catch { return {}; } })();
    const wantOwn = mode === 'video' && !!pre0.voice_asset;   // narração gravada da biblioteca vale mais que a voz sintética; "sem voz" e os modos grátis ignoram
    if (wantOwn) useVoice = false;
    const { spec, music, voiceFile, warn } = prepareSpec(c, { withGen: useGen, withVoice: useVoice });
    const ownVoice = wantOwn ? voiceFile : null;
    if (avisoChave) warn.unshift(avisoChave);
    if (mode === 'video' && !mo.provider && !avisoChave && !ownVoice) warn.unshift('Nenhuma voz configurada (ElevenLabs ou Murf no .env, ou voz da marca em Conhecimento › Tom de voz): o vídeo saiu sem narração.');
    st.warn = warn; st.status = 'running'; st.step = 'Preparando'; changed();
    const work = path.join(RENDER_DIR, String(id)); fs.mkdirSync(work, { recursive: true });
    for (const d of ['voz', 'previa']) fs.rmSync(path.join(work, d), { recursive: true, force: true });
    const cache = path.join(RENDER_DIR, '_objetos'); fs.mkdirSync(cache, { recursive: true });
    const link = path.join(work, 'objetos');
    // Sem junction/symlink (quebra no Windows/OneDrive): pasta real, abastecida a partir do cache compartilhado e devolvida ao fim
    try { const ls = fs.lstatSync(link); if (ls.isSymbolicLink()) { try { fs.unlinkSync(link); } catch { fs.rmdirSync(link); } } else fs.rmSync(link, { recursive: true, force: true }); } catch { /* não existe */ }
    fs.mkdirSync(link, { recursive: true });
    const copiar = (de, para) => { try { for (const f of fs.readdirSync(de)) { const d = path.join(para, f); if (!fs.existsSync(d)) { try { fs.copyFileSync(path.join(de, f), d); } catch { /* ignora */ } } } } catch { /* sem cache ainda */ } };
    copiar(cache, link);
    fs.writeFileSync(path.join(work, 'spec.json'), JSON.stringify(spec, null, 1));
    const out = renderFile(id), tmp = path.join(RENDER_DIR, id + '.tmp.mp4');
    const args = mode === 'previa' ? [path.join(MOTOR_DIR, 'stills.mjs'), 'spec.json', 'previa']
      : [path.join(MOTOR_DIR, 'pipeline.mjs'), 'spec.json', tmp, ...(useGen && spec.scenes.some(s => (s.items || []).some(i => i.gen)) ? [] : ['--skip-objetos']), ...(useVoice ? ['--voz', mo.provider] : ['--skip-voz']), ...(ownVoice ? ['--voice-file', ownVoice] : []), ...(mudo ? ['--sem-audio'] : music ? ['--music', music] : []), ...(full || mudo ? [] : ['--preview'])];
    const child = spawn(process.execPath, args, { cwd: work, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    const t = setTimeout(() => child.kill('SIGKILL'), 30 * 60 * 1000);
    const feed = chunk => {
      for (const line of chunk.toString().split(/[\r\n]+/)) {
        if (!line.trim()) continue;
        const sm = line.match(/=== (\d)\/4 (.+) ===/); if (sm) { st.step = `${sm[1]}/4 · ${sm[2]}`; st.pct = (+sm[1] - 1) * 8; }
        const fm = line.match(/frame (\d+)\/(\d+)/); if (fm) { st.pct = 30 + Math.round(+fm[1] / +fm[2] * 68); st.step = '4/4 · renderizando o vídeo'; }
        st.log.push(line.slice(0, 300)); if (st.log.length > 150) st.log.shift();
      }
      changed();
    };
    child.stdout.on('data', feed); child.stderr.on('data', feed);
    child.on('error', e => { clearTimeout(t); reject(e); });
    child.on('close', async code => {
      clearTimeout(t);
      copiar(link, cache);   // objetos gerados ficam no cache e não são pagos de novo
      if (code !== 0) { st.status = 'error'; st.step = 'Falhou — ' + causaRender(st.log); run("UPDATE contents SET render_status='erro' WHERE id=?", id); log('editor', `Falha ao renderizar "${c.title}"`, id); return resolve(); }
      if (mode !== 'previa') { st.step = 'Salvando o vídeo…'; try { await moveOver(tmp, out); } catch (e) { st.status = 'error'; st.step = 'Falhou — o Windows não deixou substituir o vídeo anterior (' + e.code + '). Feche o vídeo que estiver tocando e gere de novo.'; run("UPDATE contents SET render_status='erro' WHERE id=?", id); return resolve(); } }
      st.status = 'done'; st.pct = 100; st.step = mode === 'previa' ? 'Prévia pronta' : 'Vídeo pronto';
      if (mode !== 'previa' && !mudo) videoAudioCheck(id, out);
      if (mode !== 'previa') { run("UPDATE contents SET render_status=? WHERE id=?", full ? 'ok' : mudo ? 'mudo' : 'rapido', id); log('editor', `Vídeo ${mode === 'semvoz' ? 'sem voz ' : full ? '' : mudo ? 'sem áudio ' : 'rápido '}renderizado: "${c.title}"`, id); }
      resolve();
    });
  });
}

// Revisor aprovou a entrega: o Social Media monta o pacote e a peça vai para a aprovação final do dono
function paraAprovacao(c0, txtLog) {
  const c = getContent(c0.id || c0);
  let extra = {};
  try { const pack = montarPacote(c); extra = { pack: JSON.stringify(pack), caption: pack.legenda_final || c.caption }; log('publicador', `Pacote de postagem montado: "${c.title}"`, c.id); } catch {}
  setContent(c.id, { status: 'awaiting_approval', error: '', ...extra });
  log('gerente', txtLog, c.id);
}

// ───────────────────────── Arte estática: spec do Designer → fundo por IA (opcional) → PNG para baixar ─────────────────────────
const ARTE_DIR = id => path.join(RENDER_DIR, String(id), 'arte');
const arteState = new Map();   // id -> { status:'running'|'done'|'error', started }
const ART_SIZE = { feed: [1080, 1350], carrossel: [1080, 1350], stories: [1080, 1920], video_vertical: [1080, 1920], video_horizontal: [1280, 720] };
const ART_MAX = { feed: 1, carrossel: 10, stories: 7, video_vertical: 1, video_horizontal: 1 };
const ICONES_OK = ['seta', 'seta-diag', 'seta-baixo', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'youtube', 'site', 'telefone', 'local', 'email', 'check', 'estrela', 'play', 'carrinho', 'porcento', 'coracao', 'comentario', 'enviar', 'salvar', 'raio', 'trofeu', 'relogio', 'dinheiro', 'grafico', 'presente', 'cadeado', 'usuario', 'cursor', 'chat', 'alvo', 'foguete', 'ovni'];
const ICONES_TODOS = Object.keys(ICONES_DESENHOS);   // catálogo completo do Estúdio (o Designer só recebe a lista curta acima)
const ARTE_SPEC_GUIA = `# ESPECIFICAÇÃO VISUAL (obrigatória)
Depois da direção de arte em texto, entregue UM bloco \`\`\`json. O painel desenha cada página em PNG com padrão de agência a partir de um MODELO profissional: você escolhe o modelo de cada página e escreve os textos; o painel cuida das medidas (título que preenche a largura, alinhamento, espaçamento, hierarquia), aplica as cores, as fontes, a logo e a moldura da marca e gera a foto ou o objeto 3D por IA. NÃO posicione texto à mão: use os modelos.
Formato:
{"accent":"#cor de destaque da marca","paper":"#fundo escuro da marca","ink":"#texto claro",
 "moldura":{"logo":"topo-centro|topo-esq|rodape-esq|rodape-centro|nenhum","arraste":"texto (rodapé discreto em todas menos a última, só se a marca pedir)","ig":true},
 "contatos":{"whatsapp":"só se estiver na base","instagram":"@perfil da base","site":""},
 "slides":[{"modelo":"heroi","dados":{"kicker":"","titulo":"Como ter|*sucesso?*","apoio":"Leia a legenda","cta":"Vamos nessa?","foto":"prompt EM INGLÊS do personagem/cena","icone":"ovni"}}]}
MODELOS (campo "modelo" e o que vai em "dados"):
${MODELOS_ARTE.map(m => `- ${m.id} — ${m.nome} (${m.uso}): ${m.desc} Campos: ${m.campos.join(', ')}.`).join('\n')}
REGRAS DOS DADOS:
- "titulo": 2 a 7 palavras, a frase que para o dedo. Use "|" para escolher a quebra de linha (cada linha com 1 a 3 palavras: "Como ter|*sucesso?*") e *asteriscos* em UMA palavra ou expressão de destaque (vai na cor da marca). No "dividido" o "|" separa a palavra da esquerda e a da direita do objeto ("Tempo|é ouro"). Na "capa-faixa" as linhas antes da última vão em faixas e a ÚLTIMA linha fica gigante na cor de destaque ("3 segredos|que ninguém te|*CONTA!*").
- Caixa dos textos (maiúsculas e minúsculas): por padrão os títulos saem como você escreveu. Para mudar numa página, ponha em "dados" "caixa_titulo", "caixa_rotulo" ou "caixa_botao" com "alta" (MAIÚSCULAS), "baixa" (minúsculas), "frase" (só a primeira letra maiúscula), "titulo" (Cada Palavra Maiúscula) ou "normal" (como escrito). Se o dono pedir "sem caixa alta" ou "título menos gritado", use "caixa_titulo":"normal" ou "frase" em TODAS as páginas. Nos textos soltos de "texts" o campo é "caixa" (mesmos valores).
- "kicker": 1 a 3 palavras acima do título (categoria ou "Mito 1"). "apoio": 2 a 6 palavras, sai espaçado em caixa alta (no "dividido" use "|" para 2 faixas). "cta": 2 a 5 palavras no botão, SEMPRE uma chamada completa que faz sentido sozinha ("Mande para quem precisa", "Salve para não esquecer"); nunca uma frase cortada no meio ("Mande para quem") nem só uma preposição. O painel já põe a seta no botão. "texto": 1 ou 2 frases curtas de apoio (máx. 22 palavras). "itens": lista de {"t":"título curto","d":"explicação de até 12 palavras"} (lista) ou de frases curtas (pilulas). "contraste": true na lista com 2 lados (errado × certo): sem números, letras maiores e o último item na cor de destaque. "numero": "01", "3"... "fundo": "claro" ou "escuro" (alterne nas páginas internas quando a marca usa slides claros). "fantasma": 1 palavra gigante decorativa ao fundo (só se a marca usa). "icone": um de ${ICONES_OK.join(', ')}.
- "foto" (heroi e capa-faixa): descreva EM INGLÊS só o sujeito e o clima (ex.: "a confident young entrepreneur in a black suit holding money, smirking"); o painel acrescenta a composição (sujeito à direita, espaço escuro para o texto), a luz na cor da marca e o tratamento de cinema. Sem texto, sem logos, sem pessoas famosas reais, sem personagens de filmes/jogos.
- FOTO DE BANCO: em "foto", "objeto" ou "particulas" você pode escrever "banco: termo em inglês" (ex.: "banco: businessman counting money") para usar uma foto real de banco com uso comercial liberado em vez de gerar por IA. Use quando o assunto pede foto real (lugar, produto comum, cena do dia a dia); para personagem forte de capa, prefira gerar por IA.
- "particulas" (heroi, revista): UM objeto pequeno do tema, em inglês, que o painel espalha desfocado em volta do personagem, uns atrás e outros na frente ("flying banknote", "gold coin", "chess pawn", "lightning bolt icon 3D"). Dá a profundidade das capas de agência. "ambiente": o cenário desfocado atrás do personagem, em inglês e curto ("dark luxury office at night", "neon city street"); sem ele o painel usa um estúdio escuro com fumaça.
- CAPA: prefira "revista" (título gigante com o personagem na frente) ou "heroi" (personagem à direita, texto à esquerda) com "foto" + "particulas": é o que mais para o dedo. Personagem forte e expressivo (olhar para a câmera, gesto, objeto na mão).
- "objeto" (dividido, capa-minimal, frase, lista): descreva EM INGLÊS UM objeto forte e simbólico (ex.: "antique hourglass with glowing sand", "black chess king piece", "matte black 3D cube with a percent sign"). No "dividido" prefira objeto ALTO e ESTREITO (ampulheta, garrafa, troféu, peça de xadrez, celular em pé). Também aceita o nome exato de um arquivo do catálogo da marca (foto recortada, mascote, produto).
- PÁGINAS INTERNAS: texto limpo e forte, misturando mídia para não cansar. Em cerca de metade das internas, use "objeto" (o mascote da marca pelo nome exato do arquivo, ou um objeto 3D do tema em inglês, que sai recortado pelo canto) ou "foto" (cena em inglês, que vira um cartão de foto embaixo do texto) nos modelos texto e numero. Nunca as duas na mesma página.
- MOLDURA: não escreva logo, contador nem "arraste" nos textos. O painel coloca o cabeçalho (logo + contador de páginas "01 / 07") e o rodapé ("Arraste") sempre no mesmo lugar, seguindo a regra da marca.
- MASCOTE É SAGRADO: se a marca tem mascote cadastrado, o personagem da capa e das páginas É o arquivo dele. Escreva o nome EXATO do arquivo em "foto" ou "objeto" e NUNCA descreva o mascote, um personagem ou um avatar para a IA gerar (sai um personagem parecido, mas outro). Não peça pose nova. Mascote ou produto da marca: se o catálogo tem mascote/produto recortado, use o nome EXATO do arquivo em "objeto" (no heroi, na capa e em mais 1 página quando a marca pede). Nunca invente nome de arquivo.
- QUALIDADE DE DESIGNER (valem para todas as marcas):
  1. IMAGEM TEM QUE EXPLICAR A PÁGINA: a foto/objeto precisa ser a metáfora visual LITERAL do que a página diz (página sobre "plateia sem oferta" = teatro vazio ou plateia de costas; "dinheiro" = moedas/notas). Se você não consegue descrever uma imagem concreta e relacionada, NÃO ponha imagem: página só de texto bem diagramada vale mais que foto sem relação.
  2. NUNCA peça texto dentro da imagem: sem palavras, letras, números, letreiros, placas, neon escrito, logos, telas com texto e SEM códigos de cor (#0DE450...). O gerador desenha isso errado. Diga a cor por nome ("neon green", "deep black").
  3. Ritmo: em carrossel, no máximo 1 imagem a cada 2 páginas; nunca imagem em página de lista; a capa sempre tem um ponto focal (personagem, objeto ou foto forte).
  4. Cabe no espaço: "titulo" até 8 palavras; "texto" até 30 palavras (se passar disso, divida em duas páginas). Página com imagem em cartão deve ter texto curto (até 22 palavras).
  5. Lista de passos/perguntas (1., 2., 3.) usa o modelo "lista" com "itens" ({"t":"Para quem?","d":"Uma pessoa específica"}), nunca um parágrafo corrido.
  6. Nada de copy toda em MAIÚSCULAS: escreva em frase normal; a destaque vai com *asteriscos*.
  7. NADA de texto neon, letreiro luminoso ou brilho em volta das letras: é cafona e ninguém usa mais. Texto e botões saem limpos, sem glow. Só use "brilho":true em "dados" se o dono pedir esse efeito de propósito.
- Carrossel: capa (revista, heroi, capa-faixa, capa-minimal ou dividido), páginas internas com 1 ideia cada (texto, numero, lista, frase, pilulas) e a última com "cta". Mantenha o MESMO modelo de capa e a MESMA família nas internas; varie o fundo claro/escuro só se a marca usa. Post único: heroi ou dividido. Stories: os mesmos modelos (o painel respeita as zonas seguras).
- Quantidade de páginas: a MESMA do roteiro aprovado. Os textos das páginas devem ser exatamente os da direção de arte. Máximo de 25 palavras por página.
- Se nenhum modelo servir para uma página, use "modelo":"livre" com o formato antigo (bg, texts com role/x/y/align, items, shapes) — só em último caso.`;
// ───────── Modelos profissionais (public/arte-modelos.js): o Designer escolhe o modelo e escreve os textos; o painel desenha ─────────
function imgRatio(file) {   // altura/largura de PNG ou JPEG sem abrir a imagem inteira
  try {
    const b = fs.readFileSync(file);
    if (b.readUInt32BE(0) === 0x89504e47) return b.readUInt32BE(20) / b.readUInt32BE(16);
    if (b[0] === 0xff && b[1] === 0xd8) { let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1], L = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return b.readUInt16BE(i + 5) / b.readUInt16BE(i + 7); i += 2 + L; } }
  } catch { /* sem leitura */ }
  return null;
}
// Contexto da marca para os modelos: cores, fontes, logo (clara e escura), contatos e moldura (onde vai a logo, "arraste" no rodapé)

// Ícone quadrado da marca para o avatar do cartão: se a logo é larga (ícone + nome), recorta o ícone da esquerda. Gera uma vez e guarda na Biblioteca ("avatar-<marca>").
function pngLer(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, il = 0; const dat = [];
  while (p < buf.length) { const n = buf.readUInt32BE(p), t = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + n); if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); bd = d[8]; ct = d[9]; il = d[12]; } else if (t === 'IDAT') dat.push(d); else if (t === 'IEND') break; p += 12 + n; }
  if (bd !== 8 || il || ![2, 6].includes(ct)) return null;
  const bpp = ct === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(dat)), out = Buffer.alloc(w * h * 4), stride = w * bpp; let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0; let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = v & 255; }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 4] = line[x * bpp]; out[(y * w + x) * 4 + 1] = line[x * bpp + 1]; out[(y * w + x) * 4 + 2] = line[x * bpp + 2]; out[(y * w + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255; }
    prev = line;
  }
  return { w, h, rgba: out };
}
function pngGravar(w, h, rgba) {
  const crcT = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'ascii'); d.copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function avatarMarca(brand) {
  try {
    if (!brand) return '';
    const logos = all("SELECT * FROM assets WHERE kind='logo' AND brand=? COLLATE NOCASE ORDER BY id", brand);
    const quadrada = logos.find(a => a.w && a.h && a.w / a.h > .7 && a.w / a.h < 1.4 && !/avatar-/.test(a.name)); if (quadrada) return quadrada.name;
    const nome = 'avatar-' + brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40), ja = logos.find(a => a.name === nome); if (ja && fs.existsSync(path.join(ASSET_DIR, ja.id + '.' + ja.ext))) return nome;
    const fonte = logos.filter(a => a.ext === 'png' && a.w / a.h > 1.6 && fs.existsSync(path.join(ASSET_DIR, a.id + '.png'))).sort((a, b) => (/pret|escur|black|dark/i.test(a.name) ? 1 : 0) - (/pret|escur|black|dark/i.test(b.name) ? 1 : 0))[0]; if (!fonte) return '';
    const im = pngLer(fs.readFileSync(path.join(ASSET_DIR, fonte.id + '.png'))); if (!im) return '';
    const col = x => { for (let y = 0; y < im.h; y++) if (im.rgba[(y * im.w + x) * 4 + 3] > 20) return true; return false; };
    let x1 = 0; while (x1 < im.w && !col(x1)) x1++; const x0 = x1; while (x1 < im.w && col(x1)) x1++;   // primeiro bloco opaco da esquerda = o ícone
    let y0 = im.h, y1 = 0; for (let y = 0; y < im.h; y++) for (let x = x0; x < x1; x += 2) if (im.rgba[(y * im.w + x) * 4 + 3] > 20) { if (y < y0) y0 = y; if (y > y1) y1 = y; break; }
    const cw = x1 - x0, ch = y1 - y0 + 1, lado = Math.max(cw, ch); if (cw < 40 || ch < 40 || cw / ch > 1.5 || ch / cw > 1.5) return '';
    const out = Buffer.alloc(lado * lado * 4), ox = Math.floor((lado - cw) / 2), oy = Math.floor((lado - ch) / 2);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) im.rgba.copy(out, ((y + oy) * lado + x + ox) * 4, ((y0 + y) * im.w + x0 + x) * 4, ((y0 + y) * im.w + x0 + x) * 4 + 4);
    const png = pngGravar(lado, lado, out), r = run('INSERT INTO assets(brand,name,kind,tags,note,colecao,filename,ext,size,created_at,w,h) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)', brand, nome, 'logo', 'avatar, ícone da marca', 'Ícone recortado da logo para o avatar do cartão de notícia', colecaoDe('', 'logo'), nome + '.png', 'png', png.length, T(), lado, lado);
    fs.writeFileSync(path.join(ASSET_DIR, +r.lastInsertRowid + '.png'), png); log('designer', `Avatar quadrado da marca ${brand} criado a partir da logo (${nome})`); return nome;
  } catch (e) { console.error('avatar da marca:', e.message); return ''; }
}
function ctxMarca(brand, format, sp = {}) {
  const idv = identidadeDe(brand), [W, H] = ART_SIZE[format] || [1080, 1350];
  const ident = brand ? (one("SELECT content FROM knowledge WHERE brand=? COLLATE NOCASE AND category='marca' AND content LIKE '# IDENTIDADE VISUAL%' LIMIT 1", brand)?.content || '') : '';
  const docs = brand ? all("SELECT content FROM knowledge WHERE brand=? COLLATE NOCASE AND category='marca'", brand).map(r => r.content).join('\n') : '';
  const logos = brand ? all("SELECT * FROM assets WHERE kind='logo' AND brand=? COLLATE NOCASE AND ext IN ('png','jpg','jpeg','webp','svg') ORDER BY id", brand) : [];
  const clara = logos.find(a => /branc|clar|white|light|neg/i.test(a.name)) || logos.find(a => !/pret|escur|black|dark/i.test(a.name)) || logos[0];
  const escura = logos.find(a => a !== clara && /pret|escur|black|dark/i.test(a.name) && fs.existsSync(path.join(ASSET_DIR, a.id + '.' + a.ext)));   // logo escura sem arquivo no disco não pode sumir da página clara: cai na logo clara com cápsula
  const ratio = clara ? imgRatio(path.join(ASSET_DIR, clara.id + '.' + clara.ext)) : null;
  const ct = {}; { const w = docs.match(/(?:whats\s*app|whatsapp|telefone|fone)\s*[:\-–]\s*([+()\d][\d ()+.-]{7,18}\d)/i); if (w) ct.whatsapp = w[1].trim(); const ig = docs.match(/(?:instagram|perfil|@)\s*[:\-–]?\s*(@[a-z0-9_.]{3,30})/i); if (ig) ct.instagram = ig[1]; const st = docs.match(/\bsite\s*[:\-–]\s*((?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z.]{2,8}(?:\/[\w-]*)?)/i); if (st) ct.site = st[1].replace(/^https?:\/\//, ''); }
  if (sp.contatos && typeof sp.contatos === 'object') for (const k of ['whatsapp', 'instagram', 'site', 'local']) if (sp.contatos[k]) ct[k] = String(sp.contatos[k]).replace(/[<>]/g, '').slice(0, 40);
  const molde = {};
  if (/logo[^.\n|]{0,50}(centraliz|centro)[^.\n|]{0,20}topo|topo[^.\n|]{0,30}logo[^.\n|]{0,30}centr/i.test(ident)) molde.logo = 'topo-centro';
  else if (/logo[^.\n|]{0,40}topo/i.test(ident)) molde.logo = 'topo-esq';
  if (/arraste para o lado/i.test(ident)) molde.arraste = 'texto';
  const mo = sp.moldura && typeof sp.moldura === 'object' ? sp.moldura : {};
  if (['topo-centro', 'topo-esq', 'rodape-esq', 'rodape-centro', 'nenhum'].includes(mo.logo)) molde.logo = mo.logo;
  if (mo.arraste === 'texto' || mo.arraste === false || mo.arraste === 'nao') molde.arraste = mo.arraste === 'texto' ? 'texto' : undefined;
  if (mo.ig === false || mo.ig === true) molde.ig = mo.ig;
  const comp = styleParams(brand).composicao || {}, apoioClaro = [...(idv.apoio || []), ...(idv.cores || [])].find(x => lumHex(x) > .55 && lumHex(x) < .97);
  const fk = t => (/impact\s*extravagant/i.test(t) && 'impactx') || (/\bimpact\b/i.test(t) && 'impact') || (/anton/i.test(t) && 'anton') || (/bebas/i.test(t) && 'bebas') || (/oswald/i.test(t) && 'oswald') || (/archivo/i.test(t) && 'archivo') || (/montserrat/i.test(t) && 'montserrat') || (/poppins/i.test(t) && 'poppins') || (/\binter\b/i.test(t) && 'inter') || (/sora/i.test(t) && 'sora') || (/orbitron/i.test(t) && 'tech') || (/dm\s*sans/i.test(t) && 'dmsans') || (/space\s*grotesk/i.test(t) && 'grotesk') || (/outfit/i.test(t) && 'outfit') || (/jakarta/i.test(t) && 'jakarta') || (/rubik/i.test(t) && 'rubik') || (/raleway/i.test(t) && 'raleway') || (/nunito/i.test(t) && 'nunito') || (/\broboto\b/i.test(t) && 'roboto') || (/spartan/i.test(t) && 'spartan') || (/manrope/i.test(t) && 'manrope') || (/barlow/i.test(t) && 'barlow') || (/big\s*shoulders/i.test(t) && 'bigshoulders') || (/staatliches/i.test(t) && 'staatliches') || (/bungee/i.test(t) && 'bungee') || (/passion\s*one/i.test(t) && 'passion') || (/playfair/i.test(t) && 'playfair') || (/\blora\b/i.test(t) && 'lora') || (/merriweather/i.test(t) && 'merriweather') || (/dm\s*serif/i.test(t) && 'dmserif') || (/abril/i.test(t) && 'abril') || (/cormorant/i.test(t) && 'cormorant') || (/pacifico/i.test(t) && 'pacifico') || (/dancing/i.test(t) && 'dancing') || (/caveat/i.test(t) && 'caveat') || (/permanent\s*marker/i.test(t) && 'marker') || (/lobster/i.test(t) && 'lobster') || (/bangers/i.test(t) && 'bangers') || (/\bsyne\b/i.test(t) && 'syne') || (/unbounded/i.test(t) && 'unbounded') || (/righteous/i.test(t) && 'righteous') || (/jetbrains/i.test(t) && 'jetbrains') || (/space\s*mono/i.test(t) && 'spacemono') || undefined;
  const fonteMarcaK = idv.fontAsset ? (fk(idv.ftit || '') || 'poppins') : undefined;
  const texturas = brand ? all("SELECT name FROM assets WHERE kind='textura' AND brand=? COLLATE NOCASE AND ext IN ('png','jpg','jpeg','webp') ORDER BY id", brand).map(a => a.name) : [];
  const texEstilo = /tecnol|tech|digital|futur|ciber|cyber|hacker|neon|\bia\b|intelig/i.test(ident) ? 'tech' : '';
  const bancoTex = all("SELECT a.name, a.tags FROM assets a WHERE a.kind='textura' AND a.brand='' AND a.ext IN ('jpg','jpeg','png','webp') ORDER BY a.id").map(t => ({ name: t.name, escuro: /escuro/.test(t.tags) }));
  return { bancoTex, W, H, accent: hexOk(sp.accent) || idv.accent || brandColors()[brand] || '#f59e0b', paper: hexOk(sp.paper) || idv.paper, ink: hexOk(sp.ink) || idv.ink, claro: apoioClaro, ftit: idv.ftit, ftxt: idv.ftxt, fonteMarca: !!idv.fontAsset, fonteMarcaK, fTit: fonteMarcaK, logo: clara?.name, avatar: avatarMarca(brand), logoEscura: escura?.name, logoRatio: ratio || .22, contatos: ct, molde, marca: brand, texturas, texEstilo, caixa: (() => { const t = styleParams(brand).tipografia || {}; return { titulo: t.caixa_titulo, botao: t.caixa_botao, rotulo: t.caixa_rotulo }; })(), margem: { estreitas: .06, medias: .08, amplas: .1 }[comp.margens] || .08 };
}
const hexOk = v => /^#[0-9a-fA-F]{6}$/.test(String(v || '')) ? String(v) : undefined;
// Expande as páginas com "modelo" na especificação comum (textos, imagens, formas, efeitos). Página sem modelo fica como veio.
// ───────── MASCOTE E TEXTO NUNCA SE COBREM ─────────
// Depois que o layout do estilo é aplicado, o mascote/imagem principal (hero) é conferido contra o texto da página e a logo: se cobrir, ele
// é reposicionado (e diminuído se preciso) na maior área livre, o mais perto possível de onde estava. Só mexe quando há sobreposição.
const ROLE_PX = { title: .088, body: .042, number: .30, badge: .026, cta: .038, label: .030, footer: .021 }, ROLE_LH = { title: 1.04, body: 1.28, number: .9, badge: 1.1, cta: 1.1, label: 1.2, footer: 1.3 };
function caixaTexto(t, W, H) {
  const role = t.role || 'body', sz = t.size || Math.round(W * (ROLE_PX[role] || .042)), lh = t.lh || ROLE_LH[role] || 1.2, wmax = (t.w || (role === 'title' ? .86 : .82)) * W, cw = sz * (role === 'title' || role === 'number' ? .58 : .52);
  let lines = 0, maxw = 0; for (const ln of String(t.value || '').replace(/\*/g, '').split('|')) { const wpx = ln.length * cw, n = t.nowrap ? 1 : Math.max(1, Math.ceil(wpx / wmax)); lines += n; maxw = Math.max(maxw, Math.min(wpx, wmax)); }
  const w = Math.max(sz, maxw), h = lines * sz * lh, x = (t.x ?? .5) * W, l = t.align === 'center' || (!t.align && role !== 'body' && role !== 'title' && role !== 'label') ? x - w / 2 : t.align === 'right' ? x - w : x;
  return { l, r: l + w, t: (t.y ?? .5) * H - h / 2, b: (t.y ?? .5) * H + h / 2 };
}
const cruza = (a, b, pad = 0) => a.l < b.r + pad && a.r > b.l - pad && a.t < b.b + pad && a.b > b.t - pad;
function protegeMascote(sl, W, H, brand) {
  if (!sl || !Array.isArray(sl.items) || !Array.isArray(sl.texts)) return sl;
  const heroes = sl.items.filter(it => it.hero && !it.pessoa && !it.hide && !it.cruza && (it.asset || it.gen)); if (!heroes.length) return sl;
  const ratioDe = it => { try { const a = it.asset && one("SELECT id,ext FROM assets WHERE name=? AND (brand=? COLLATE NOCASE OR brand='') ORDER BY brand DESC", slugName(it.asset), brand || ''); return (a && imgRatio(path.join(ASSET_DIR, a.id + '.' + a.ext))) || 1.1; } catch { return 1.1; } };
  const textos = sl.texts.filter(t => t.value && !t.hide && t.role !== 'footer' && !t.decor).map(t => caixaTexto(t, W, H));
  const fixos = [...textos, ...(sl.items || []).filter(it => it.moldura && !it.hide).map(it => { const w = it.size || W * .2, h = w * .35; return { l: (it.x ?? .5) * W - w / 2, r: (it.x ?? .5) * W + w / 2, t: (it.y ?? .1) * H - h / 2, b: (it.y ?? .1) * H + h / 2 }; })];
  for (const it of heroes) {
    const rt = ratioDe(it), w0 = it.size || W * .5, cx0 = (it.x ?? .5) * W, cy0 = (it.y ?? .5) * H, caixa = (cx, cy, w) => ({ l: cx - w / 2, r: cx + w / 2, t: cy - w * rt / 2, b: cy + w * rt / 2 });
    if (!fixos.some(f => cruza(caixa(cx0, cy0, w0), f, 4))) continue;   // já está livre: não mexe
    let melhor = null;
    for (const k of [1, .88, .76, .64, .52, .42]) {
      const w = Math.round(w0 * k), h = w * rt; if (w > W * .98 || h > H * .9) continue; let best = null;
      for (let cx = w / 2; cx <= W - w / 2 + 1; cx += W * .04) for (let cy = h / 2; cy <= H * .94 - h / 2 + 1; cy += H * .03) {
        const c = caixa(cx, cy, w); if (fixos.some(f => cruza(c, f, 10))) continue; const d = Math.hypot(cx - cx0, cy - cy0); if (!best || d < best.d) best = { cx, cy, w, d }; }
      if (best) { melhor = best; break; } }
    if (melhor) { it.x = +(melhor.cx / W).toFixed(4); it.y = +(melhor.cy / H).toFixed(4); it.size = melhor.w; }
  }
  return sl;
}
// Página "livre" do Designer (título + texto + botão + mascote em coordenadas soltas) vira o modelo profissional "heroi": o painel posiciona tudo pela grade
// (mascote grande à direita saindo pela borda de baixo, texto empilhado e centrado, botão no fim). Posição solta feita à mão dava peça torta, com buracos e linha solta.
function livreParaHeroi(s, brand = '', format = '') {
  if (!s || typeof s !== 'object' || MODELO_IDS.includes(s.modelo) || !Array.isArray(s.texts) || !s.texts.length) return s;
  try { if (brand && one('SELECT 1 x FROM art_layouts WHERE brand=? COLLATE NOCASE AND format=?', brand, format)) return s; } catch { /* sem layouts */ }   // a marca já tem layout ensinado pelo dono neste formato: o Designer segue as posições dele, o painel não recompõe
  const T = s.texts, tit = T.filter(t => t.role === 'title'), body = T.filter(t => t.role === 'body' || t.role === 'label'), cta = T.filter(t => t.role === 'cta'), outros = T.length - tit.length - body.length - cta.length;
  const imgs = (s.items || []).filter(x => !x.moldura);
  if (tit.length !== 1 || outros || cta.length > 1 || imgs.length > 1) return s;
  let foto; if (imgs[0]) { const row = imgs[0].asset ? one('SELECT kind FROM assets WHERE name=? COLLATE NOCASE', imgs[0].asset) : null; if (!row || !['mascote', 'pessoa'].includes(row.kind)) return s; foto = imgs[0].asset; }
  const flat = v => String(v || '').replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
  const dados = { titulo: String(tit[0].value || '').trim(), texto: body.map(t => flat(t.value)).join(' ').slice(0, 260), cta: cta[0] ? (flat(cta[0].value).split(' ').length > 5 ? botaoDaChamada(flat(cta[0].value)) : flat(cta[0].value)) : '', foto };   // botão curto e inteiro: chamada longa vira a forma curta
  for (const k of Object.keys(dados)) if (!dados[k]) delete dados[k];
  return { modelo: 'heroi', dados, bgLivre: s.bg, shade: s.shade, pager: s.pager, texts: [], items: (s.items || []).filter(x => x.moldura), shapes: [] };
}
// Estilo com páginas de "coluna de texto" (padrão do dono): título e texto das páginas internas viram parágrafos curtos em coluna, sem título grande
function paraColunas(slides, tpl, format, brand) {
  if (!Array.isArray(slides) || !tpl?.seq?.some(x => x.modelo === 'coluna')) return slides;
  const est = estruturaTemplate(tpl, format, slides.length, {}, brand);
  return slides.map((s, i) => { const e = est[i]; if (!e || e.modelo !== 'coluna' || !s || !['texto', 'frase', 'numero', 'lista', 'pilulas'].includes(s.modelo)) return s;
    const d0 = s.dados || {}, paragrafos = [d0.titulo, d0.texto].filter(Boolean).map(x => String(x).replace(/\|/g, ' ')), itens = Array.isArray(d0.itens) ? d0.itens.map(x => typeof x === 'string' ? { t: x } : x) : undefined;
    return { ...s, modelo: 'coluna', dados: { paragrafos, ...(itens?.length ? { itens } : {}), ...(d0.objeto ? { objeto: d0.objeto } : e.dados.objeto ? { objeto: e.dados.objeto } : {}), fundo: d0.fundo || e.dados.fundo } }; });
}
// Notícia nunca leva mascote nem imagem de marca como fundo: só a foto da matéria (ou fundo liso com a cor da marca)
const FOTO_MODELOS = ['noticia', 'manchete-foto', 'post-card', 'citacao'];
function semMascoteNoticia(sl, brand, nf) {
  if (!sl || typeof sl !== 'object') return sl;
  const tipo = n => { const a = assetDaMarca(brand, String(n || '').split(' (')[0]); return a ? a.kind : ''; }, o = { ...sl };
  if (o.bg?.asset && o.bg.asset !== nf && tipo(o.bg.asset) !== 'textura') o.bg = { ...o.bg, asset: undefined, gen: undefined, banco: undefined };
  if (o.bg && (o.bg.gen || o.bg.banco) && !(nf && o.bg.asset === nf)) o.bg = { ...o.bg, gen: undefined, banco: undefined };   // notícia não gera imagem por IA: nada de crédito gasto

  if (Array.isArray(o.items)) o.items = o.items.filter(x => !x?.gen && (!x?.asset || x.moldura || ['logo', 'textura'].includes(tipo(x.asset))));
  if (o.dados && typeof o.dados === 'object') { const d = { ...o.dados }; delete d.objeto; delete d.mascote; if (o.modelo === 'citacao') d.impact = true; if (d.foto && d.foto !== nf && tipo(d.foto) !== 'foto') delete d.foto; o.dados = d; }
  return o;
}
function compoeModelos(found, format, brand, c = null) {
  if (c?.kind === 'noticia' && Array.isArray(found?.slides) && found.slides.length) {   // notícia SEMPRE no modelo do template de notícia da marca: a página "livre" que o Designer inventa (data, fonte, botão, cartão de foto) é descartada
    const tn0 = radarEstiloDaMarca(brand || c.brand || ''), tn = tn0?.layoutId ? null : tn0, tv = tn || templateDe(found.template || found.estilo || (/^t:/.test(String(c.estilo_arte || '')) ? String(c.estilo_arte).slice(2) : '')), m0 = tv?.seq?.[0]?.modelo;
    if (tn) { found.template = tn.id; found.estilo = tn.id; }   // o template escolhido pelo Designer ou pelo pedido é ignorado
    if (['noticia', 'manchete-foto', 'citacao'].includes(m0)) {
      const sl = found.slides[0] || {}, limpa = v => String(v || '').replace(/\[i:[a-z-]+\]/g, '').replace(/[*|]+/g, ' ').replace(/\s+/g, ' ').trim();
      let tit = limpa(sl.dados?.titulo || sl.dados?.frase || '');
      if (!tit) { const ts = (sl.texts || []).filter(t => ['title', 'body'].includes(t.role || 'body') && String(t.value || '').trim() && !/^(fonte|cr[ée]dito)\b/i.test(limpa(t.value)) && !/^[\p{L} ]{2,30},\s*\d{1,2}\/\d{1,2}\/\d{2,4}$/u.test(limpa(t.value))).sort((x, y) => (y.size || 0) - (x.size || 0) || limpa(y.value).length - limpa(x.value).length); tit = limpa(ts[0]?.value); }
      const semPerfil = m0 === 'manchete-foto' ? { topo: 'nenhum' } : {};   // notícia nunca leva o avatar/perfil no topo (nem com foto, nem sem)
      if (tit) found.slides = [{ modelo: m0, dados: { titulo: tit, ...semPerfil } }]; else if (!MODELO_IDS.includes(sl.modelo)) found.slides = [{ modelo: m0, dados: { ...semPerfil } }];
      else found.slides = [{ ...sl, modelo: m0, dados: { ...(sl.dados || {}), ...semPerfil } }];
    }
  }
  let nfoto = (c?.id && one('SELECT foto_asset FROM radar_items WHERE content_id=?', c.id)?.foto_asset) || ''; if (nfoto && !one('SELECT 1 x FROM assets WHERE name=? AND brand=? COLLATE NOCASE', nfoto, brand || '')) nfoto = '';
  if (Array.isArray(found?.slides)) found.slides = found.slides.map(sl => livreParaHeroi(sl, brand, format));
  if (Array.isArray(found?.slides) && found.template && templateDe(found.template)) {   // o Designer escolheu um template: a estrutura (modelo, mascote, fundo) vem dele
    const est = estruturaTemplate(templateDe(found.template), format, found.slides.length, {}, brand);
    found.slides = found.slides.map((s, i) => { const e = est[i]; if (!e || !s || typeof s !== 'object') return s; if (!MODELO_IDS.includes(s.modelo) && ((Array.isArray(s.texts) && s.texts.length) || (Array.isArray(s.items) && s.items.some(x => !x?.moldura)))) return s;   // página livre do Designer (textos e imagens próprios): o template não pode apagar e trocar por um modelo vazio
      const d = { ...(e.dados.objeto && !s.dados?.foto && !s.dados?.objeto ? { objeto: e.dados.objeto } : {}), ...(e.dados.fundo ? { fundo: e.dados.fundo } : {}), ...(s.dados || {}) }; return { ...s, modelo: MODELO_IDS.includes(s.modelo) ? s.modelo : e.modelo, dados: d }; });
    if (!found.previa) { try { run('UPDATE art_templates SET usos=usos+1 WHERE id=?', tplRow(found.template)?.id || 0); } catch { /* template da casa */ } }
  }
  { const vidC = found.estilo || found.template || estiloPadrao(brand, format);   // a capa segue o modelo da capa do estilo/layout da marca (o dono montou o layout: a capa não pode virar outro modelo)
    if (vidC && Array.isArray(found.slides) && (found.slides.length > 1 || ['citacao', 'manchete-foto'].includes(templateDe(vidC)?.seq?.[0]?.modelo))) {
      let capaM = ''; try { const row = tplRow(vidC), mp = row ? visMapa(row) : {}, ent = mp[String(brand || '').toLowerCase()] || Object.values(mp)[0]; capaM = (ent?.pages || []).find(pg => pg && pg.papel === 'capa')?.modelo || ''; } catch { /* sem visual salvo */ }
      capaM = capaM || templateDe(vidC)?.seq?.[0]?.modelo || '';
      const CAPAS = ['capa-mascote', 'heroi', 'revista', 'dividido', 'capa-faixa', 'capa-minimal', 'texto', 'frase', 'numero', 'noticia', 'citacao', 'manchete-foto'], cur = found.slides[0]?.modelo;
      if (capaM && CAPAS.includes(capaM) && CAPAS.includes(cur) && cur !== capaM) found.slides[0] = { ...found.slides[0], modelo: capaM };
      found.slides = paraColunas(found.slides, templateDe(vidC), format, brand);
      if (found.slides[0]?.modelo === 'manchete-foto') {   // manchete sobre foto: peça de uma página só
        const d0 = found.slides[0].dados || {}, d = { titulo: d0.titulo, foto: d0.foto, legenda: d0.legenda, nome: d0.nome, ...(templateDe(vidC)?.seq?.[0]?.opcoes || {}) };
        for (const k of Object.keys(d)) if (!d[k]) delete d[k];
        found.slides = [{ ...found.slides[0], dados: d }];
      }
      if (found.slides[0]?.modelo === 'citacao') {   // frase de personalidade: peça de uma página só, com o nome em "chamada" e a frase no título
        const d0 = found.slides[0].dados || {}, d = { nome: c?.kind === 'noticia' ? undefined : d0.nome || d0.kicker || d0.apoio, frase: d0.frase || d0.titulo, foto: d0.foto, handle: d0.handle };
        for (const k of Object.keys(d)) if (!d[k]) delete d[k];
        found.slides = [{ ...found.slides[0], dados: d }];
      }
      // estilo de 2 páginas (capa de jornal + cartão): a peça fica com exatamente a capa e a contra-capa, com os textos levados para os campos de cada modelo
      const tv = templateDe(vidC);
      if (fixo2Jornal(tv)) {
        const sl = found.slides, p0 = sl[0], p1 = sl[sl.length - 1], foto = p0?.dados?.foto || p1?.dados?.foto;
        const d0 = p0?.dados || {}, d1 = p1?.dados || {}, kk = String(d0.kicker || '').trim();
        // roteiro com páginas no meio (o que aconteceu, o que muda): o cartão leva esse texto da notícia, e não a página final de "siga a página"
        const corpoRaw = sl.length > 2 ? sl.slice(1, -1).map(x => [x.dados?.titulo, x.dados?.texto || x.dados?.apoio].filter(Boolean).join('. ')).filter(Boolean).map(t => /[.!?…]\**\s*$/.test(t) ? t : t.replace(/\s*(\**)\s*$/, '.$1')).join(' ').replace(/\s+/g, ' ').trim() : '';
        const corpoNoticia = corpoRaw.length <= 340 ? corpoRaw : (corpoRaw.slice(0, 340).match(/^[\s\S]*[.!?](?=\s|$)/)?.[0] || corpoRaw.slice(0, 340).replace(/\s+\S*$/, '') + '…');
        found.slides = [{ ...p0, modelo: 'noticia', dados: { titulo: d0.titulo, selo: d0.selo || (kk && kk.length <= 28 ? kk : undefined), legenda: d0.legenda, foto } },
          { ...p1, modelo: 'post-card', dados: { x: c?.kind === 'noticia' ? true : undefined, titulo: corpoNoticia || (p1.modelo === 'post-card' ? d1.titulo : [d1.titulo, d1.texto || d1.apoio].filter(Boolean).join('. ').replace(/\*\.\s/g, '* ')), nome: d1.nome, foto } }];
        for (const x of found.slides) for (const k of Object.keys(x.dados)) if (x.dados[k] == null || x.dados[k] === '') delete x.dados[k];
      }
    } }
  if (!Array.isArray(found?.slides) || !found.slides.some(s => MODELO_IDS.includes(s?.modelo))) return found;
  { const nf = nfoto;   // pauta do Radar: a foto da própria notícia entra na capa e no cartão, sem mascote
    if (nf && Array.isArray(found?.slides) && one('SELECT 1 x FROM assets WHERE name=? AND brand=? COLLATE NOCASE', nf, brand || '')) found.slides = found.slides.map((sl, i) => {
      if (!sl || typeof sl !== 'object') return sl;
      if (MODELO_IDS.includes(sl.modelo) && FOTO_MODELOS.includes(sl.modelo)) { const d = { ...(sl.dados || {}), foto: nf }; delete d.objeto; if (sl.modelo === 'manchete-foto') { delete d.foto; if (!d.topo) d.topo = 'nenhum'; } return { ...sl, dados: d }; }   // manchete-foto: a foto entra depois, como fundo (com foto no modelo o perfil muda a ordem dos textos e desalinha o visual ensinado pelo dono)
      if (i === 0 && sl.modelo === 'heroi') { const d = { ...(sl.dados || {}) }; return { ...sl, modelo: 'noticia', dados: { titulo: d.titulo, legenda: d.legenda, foto: nf } }; }
      return sl; }); }
  if (c?.kind === 'noticia') found.slides = found.slides.map(sl => MODELO_IDS.includes(sl?.modelo) ? semMascoteNoticia(sl, brand, nfoto) : sl);
  const base = ctxMarca(brand, format, found), n = Math.min(found.slides.length, ART_MAX[format] || 10);
  found.slides = found.slides.map((s, i) => { if (!MODELO_IDS.includes(s?.modelo)) return s; try { const r = comporSlide({ modelo: s.modelo, dados: s.dados && typeof s.dados === 'object' ? s.dados : {} }, { ...base, i, total: n }); if (r && s.bgLivre?.asset) r.bg = { ...s.bgLivre }; return r || s; } catch (e) { console.error('modelo', s.modelo, e.message); return s; } });
  const fotoNoticiaIdx = nfoto ? found.slides.map((sl, i) => FOTO_MODELOS.includes(sl?.modelo) ? i : -1).filter(i => i >= 0) : [];
  { const vid = found.estilo || found.template || estiloPadrao(brand, format); if (vid) { try { found.slides = estiloVisual(vid, found.slides, format, brand); } catch (e) { console.error('visual do estilo:', e.message); } } }
  for (const i of fotoNoticiaIdx) { const sl = found.slides[i]; if (sl && !(sl.bg?.asset === nfoto)) found.slides[i] = { ...sl, bg: { ...(sl.bg || {}), asset: nfoto, gen: undefined, banco: undefined, pos: sl.bg?.pos || 'topo' } }; }   // o visual ensinado pelo dono não pode apagar a foto da matéria
  if (c?.kind === 'noticia' && Array.isArray(found.slides)) found.slides = found.slides.map(sl => semMascoteNoticia(sl, brand, nfoto));
  if (!found.previa && ART_SIZE[format]) found.slides = found.slides.map(sl => { try { return protegeMascote(sl, ART_SIZE[format][0], ART_SIZE[format][1], brand); } catch (e) { console.error('mascote:', e.message); return sl; } });
  if (!found.accent) found.accent = base.accent; if (!found.paper && base.paper) found.paper = base.paper; if (!found.ink && base.ink) found.ink = base.ink;
  return found;
}
// ESTILO aprovado: a sequência de modelos de cada formato. Capa que chama atenção, internas alternando texto, número, lista e
// mídia (mascote/objeto ou foto em cartão), fechamento com botão. Os textos vêm do dono (ou ficam como exemplo para editar).
const nomeBonito = n => String(n || '').trim().split(/\s+/).map((w, i) => i && /^(de|da|do|das|dos|e|em)$/i.test(w) ? w.toLowerCase() : (w === w.toUpperCase() && w.length > 3 && !/\d/.test(w) ? w[0] + w.slice(1).toLowerCase() : w)).join(' ');
// ───────── TEMPLATES de arte: a estrutura (sequência de modelos) que se repete com conteúdos diferentes e em qualquer marca ─────────
// Cada página do template diz o modelo e o que entra nela (mascote, foto em cartão, fundo claro). A marca entra com cores, fonte, logo e
// mascote; o conteúdo entra com os textos. O Designer lê o catálogo e escolhe o template que combina com a copy.
const TEMPLATES_CASA = [
  { id: 'cinema', nome: 'Cinema (fundo escuro, texto fino, destaque na cor da marca)', nivel: 'robusto', formatos: ['carrossel'], uso: 'Carrossel emocional ou de conselho: capa com pessoa ou personagem e palavra gigante vazada, páginas de texto fino com fio vertical, páginas de pergunta entre aspas e cartão final. Vale para qualquer marca: usa a cor, a logo e a fonte dela.',
    seq: [{ modelo: 'cinema-capa', papel: 'capa' }, { modelo: 'cinema-texto' }, { modelo: 'cinema-pergunta' }, { modelo: 'cinema-texto' }, { modelo: 'cinema-card', papel: 'fim' }] },
  { id: 'agencia', nome: 'Agência (objeto 3D, título grosso na cor da marca)', nivel: 'robusto', formatos: ['carrossel'], uso: 'Carrossel de venda e provocação de agência de marketing: capa com frase fina e título grosso, páginas com objeto 3D de vidro e uma linha de resultado, chamada final com avatares. Usa a cor, a logo e as redes de cada marca. Réplica fiel do template do dono: só muda texto e imagem. Em "objeto" use SEMPRE a imagem do tema do roteiro (dinheiro: mascote da marca segurando dinheiro, "banco: stack of dollar bills in glass"; anúncio: megafone; crescimento: foguete).',
    seq: [{ modelo: 'agencia-capa', papel: 'capa' }, { modelo: 'agencia-texto' }, { modelo: 'agencia-objeto' }, { modelo: 'agencia-cards' }, { modelo: 'agencia-lista' }, { modelo: 'agencia-cta', papel: 'fim' }] },
  { id: 'mitos', nome: 'Carrossel base', nivel: 'robusto', formatos: ['carrossel'], uso: 'Template base de TODO carrossel (educativo, opinião, lista, tutorial, oferta): capa forte, páginas alternando texto, número, lista e foto, e fechamento com chamada. O Designer adapta cada página ao conteúdo (lista numerada vira lista, passo a passo vira número).',
    seq: [{ modelo: 'revista', papel: 'capa' }, { modelo: 'texto', mascote: true }, { modelo: 'numero', foto: true, fundo: 'claro' }, { modelo: 'texto' }, { modelo: 'numero', mascote: true }, { modelo: 'lista', papel: 'resumo' }, { modelo: 'cta', papel: 'fim', mascote: true }] },
  { id: 'lista-numerada', oculto: true, nome: 'Lista numerada (ferramentas, dicas, números)', nivel: 'simples', formatos: ['carrossel'], uso: 'Listas e números: "7 ferramentas que eu uso", "quantos vídeos eu edito por dia", "5 dicas". Uma dica por página com número gigante; mascote aparece em algumas.',
    seq: [{ modelo: 'heroi', papel: 'capa' }, { modelo: 'numero', repetir: true }, { modelo: 'numero', mascote: true, repetir: true }, { modelo: 'numero', fundo: 'claro', repetir: true }, { modelo: 'cta', papel: 'fim', mascote: true }] },
  { id: 'passo-a-passo', oculto: true, nome: 'Passo a passo / tutorial', nivel: 'robusto', formatos: ['carrossel'], uso: 'Ensinar a fazer algo em etapas: tutorial, método, processo. Capa com faixas e palavra gigante, passos numerados com foto, resumo em lista.',
    seq: [{ modelo: 'capa-faixa', papel: 'capa' }, { modelo: 'numero', foto: true, repetir: true }, { modelo: 'numero', mascote: true, repetir: true }, { modelo: 'lista', papel: 'resumo' }, { modelo: 'cta', papel: 'fim' }] },
  { id: 'oferta', oculto: true, nome: 'Oferta / promoção', nivel: 'robusto', formatos: ['carrossel', 'feed', 'stories'], uso: 'Vender um produto ou serviço, promoção, lançamento, Black Friday. Capa escura minimalista, benefícios em pílulas e chamada final forte.',
    seq: [{ modelo: 'capa-minimal', papel: 'capa' }, { modelo: 'frase', repetir: true }, { modelo: 'pilulas', papel: 'beneficios' }, { modelo: 'cta', papel: 'fim', mascote: true }] },
  { id: 'opiniao', oculto: true, nome: 'Opinião / frase forte', nivel: 'simples', formatos: ['carrossel', 'stories'], uso: 'Opinião, provocação, reflexão, bastidores: uma ideia forte por página, só tipografia e um personagem na capa.',
    seq: [{ modelo: 'revista', papel: 'capa' }, { modelo: 'frase', repetir: true }, { modelo: 'texto', mascote: true }, { modelo: 'cta', papel: 'fim' }] },
  { id: 'post-heroi', nome: 'Post único com personagem', nivel: 'robusto', formatos: ['feed'], uso: 'Post único que precisa parar o dedo: pergunta ou promessa forte, personagem ou mascote em destaque, botão.',
    seq: [{ modelo: 'heroi', papel: 'capa', mascote: true }] },
  { id: 'post-objeto', oculto: true, nome: 'Post único com objeto-símbolo', nivel: 'robusto', formatos: ['feed'], uso: 'Post de 2 a 4 palavras com um objeto que simboliza a ideia (tempo é ouro, dinheiro, estratégia). Título partido pelo objeto.',
    seq: [{ modelo: 'dividido', papel: 'capa' }] },
  { id: 'frase-personalidade', marcas: ['CENTRAL DO MARKETING'], nome: 'Frase de personalidade (retrato + citação)', nivel: 'robusto', formatos: ['feed', 'carrossel'], uso: 'Frase marcante de uma pessoa (histórica ou atual) em post único: retrato em página inteira que escurece até o preto, fio com a logo da marca e o @ no meio, nome de quem disse e a frase em caixa alta centralizada. Foto = o retrato da pessoa; texto = a citação fiel.',
    seq: [{ modelo: 'citacao', papel: 'capa' }] },
  { id: 'manchete-perfil', marcas: ['Seguidores em Alta'], nome: 'Manchete sobre foto com perfil', nivel: 'robusto', formatos: ['feed', 'carrossel'], uso: 'Notícia ou fato do momento em post único: foto em página inteira, perfil da marca no topo, manchete em caixa alta centralizada, “Leia a legenda” e barra na cor da marca. Foto = a imagem real do assunto.',
    seq: [{ modelo: 'manchete-foto', papel: 'capa' }] },
  { id: 'manchete-bet', marcas: ['Vivendo de Bet'], nome: 'Manchete sobre foto com logo', nivel: 'robusto', formatos: ['feed', 'carrossel'], uso: 'Notícia ou fato do esporte/aposta em post único: foto em página inteira, logo da marca no canto, manchete em caixa alta centralizada, “Leia a legenda” e fio colorido no rodapé. Foto = a imagem real do assunto.',
    seq: [{ modelo: 'manchete-foto', papel: 'capa', opcoes: { topo: 'logo', rodape: 'fio' } }] },
  { id: 'manchete-raiz', marcas: ['Marketing Raiz'], nome: 'Manchete sobre foto com fio e logo', nivel: 'robusto', formatos: ['feed', 'carrossel'], uso: 'Notícia ou fato do momento em post único: foto (ou colagem de fotos) no alto que escurece até o preto, fio branco, manchete em itálico com sombra na cor da marca, logo e “Leia a legenda” embaixo. Foto = a imagem real do assunto.',
    seq: [{ modelo: 'manchete-foto', papel: 'capa', opcoes: { topo: 'nenhum', linha: true, rodape: 'logo', italico: true, sombra: true } }] },
  { id: 'noticia-jornal', nome: 'Notícia de jornal (2 páginas)', nivel: 'robusto', formatos: ['carrossel'], paginas: 2, uso: 'Notícia no estilo de jornal em 2 páginas: capa com a foto da notícia, degradê, selo “Notícia urgente!” e manchete em caixa alta; contra-capa com um cartão branco (avatar, nome verificado e o texto da notícia). Estrutura fixa, sem miolo.',
    seq: [{ modelo: 'noticia', papel: 'capa' }, { modelo: 'post-card', papel: 'fim' }] },
  { id: 'noticia', nome: 'Notícia / novidade do mercado', nivel: 'robusto', formatos: ['carrossel', 'feed', 'stories'], uso: 'Notícia, novidade, lançamento, mudança de regra ou acontecimento que o público precisa saber agora: manchete forte na capa, o que aconteceu, o que muda para quem segue, e a chamada para acompanhar.',
    seq: [{ modelo: 'capa-faixa', papel: 'capa' }, { modelo: 'texto', foto: true }, { modelo: 'texto', repetir: true }, { modelo: 'frase' }, { modelo: 'cta', papel: 'fim' }] },
  { id: 'stories-sequencia', nome: 'Sequência de stories', nivel: 'simples', formatos: ['stories'], uso: 'Stories em sequência: gancho, desenvolvimento curto e chamada para responder ou clicar.',
    seq: [{ modelo: 'heroi', papel: 'capa', mascote: true }, { modelo: 'frase', repetir: true }, { modelo: 'texto', mascote: true }, { modelo: 'cta', papel: 'fim' }] }
];
const TEMA_CASA = { mitos: 'educativo', 'lista-numerada': 'lista', 'passo-a-passo': 'tutorial', oferta: 'oferta', opiniao: 'opiniao', 'post-heroi': 'geral', 'post-objeto': 'geral', noticia: 'noticia', 'noticia-jornal': 'noticia', 'frase-personalidade': 'geral', 'manchete-perfil': 'geral', 'manchete-bet': 'geral', 'manchete-raiz': 'geral', 'stories-sequencia': 'geral' };
for (const t of TEMPLATES_CASA) t.tema = TEMA_CASA[t.id] || 'geral';
const TEMAS = { educativo: 'Educativo', lista: 'Lista', tutorial: 'Tutorial', oferta: 'Oferta', noticia: 'Notícia', opiniao: 'Opinião', geral: 'Geral' };
db.exec(`CREATE TABLE IF NOT EXISTS art_templates(id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, uso TEXT DEFAULT '', nivel TEXT DEFAULT 'simples', formatos TEXT DEFAULT '["carrossel"]', seq TEXT NOT NULL, exemplo TEXT DEFAULT '', brand TEXT DEFAULT '', usos INTEGER DEFAULT 0, created_at TEXT NOT NULL)`);
for (const col of ["visual TEXT DEFAULT ''", "visual_brand TEXT DEFAULT ''", "base TEXT DEFAULT ''", "visual_at TEXT DEFAULT ''", "tema TEXT DEFAULT ''", "deriva TEXT DEFAULT ''"]) { try { db.exec('ALTER TABLE art_templates ADD COLUMN ' + col); } catch { /* já existe */ } }
try { db.exec("ALTER TABLE contents ADD COLUMN estilo_ref TEXT DEFAULT ''"); } catch { /* já existe */ }
// estilo do dono: o "id" é o do estilo da casa quando ele é a versão do dono de um estilo da casa (base) ou veio da Biblioteca Central
// visual do estilo guardado POR MARCA: { "<marca em minúsculas>": { brand, at, pages:[...] } } (a versão antiga era uma lista só, de uma marca)
const visMapa = r => { const v = jparse(r?.visual, null); if (!v) return {}; if (Array.isArray(v)) return { [String(r.visual_brand || '').toLowerCase()]: { brand: r.visual_brand || '', at: r.visual_at || '', pages: v } }; return typeof v === 'object' ? v : {}; };
const tplCasaDe = r => r.base && TEMPLATES_CASA.some(t => t.id === r.base) ? r.base : r.central && TEMPLATES_CASA.some(t => 'template/' + t.id === r.central) ? r.central.slice(9) : '';
const tplDono = r => ({ id: tplCasaDe(r) || 'dono-' + r.id, row: r.id, base: r.base || '', nome: r.nome, uso: r.uso, nivel: r.nivel, tema: r.tema || TEMA_CASA[tplCasaDe(r)] || 'geral', formatos: jparse(r.formatos, ['carrossel']), seq: jparse(r.seq, []), brand: r.brand || '', deriva: r.deriva || '', usos: r.usos, dono: !r.central, central: !!r.central, exemplo: jparse(r.exemplo, null), visual: !!visMapa(r) && Object.keys(visMapa(r)).length > 0, visual_marcas: Object.values(visMapa(r)).map(v => v.brand || ''), visual_at: r.visual_at || '' });
// Só 2 templates base por marca (Carrossel e Notícia) + os de post único e stories; os demais da casa ficam escondidos (o dono cria os seus quando quiser)
db.exec('CREATE TABLE IF NOT EXISTS art_hidden(id TEXT PRIMARY KEY)');   // (versão antiga: apagava o estilo da casa para TODAS as marcas — não é mais usada)
db.exec('CREATE TABLE IF NOT EXISTS art_hidden_b(id TEXT NOT NULL, brand TEXT NOT NULL, PRIMARY KEY(id, brand))');   // estilos da casa que o dono apagou NUMA marca (voltam pelo aviso na galeria); as outras marcas não mudam
{ const velhos = all('SELECT id FROM art_hidden'); if (velhos.length) { run('DELETE FROM art_hidden'); console.log('ℹ Estilos originais que estavam apagados para todas as marcas voltaram à galeria (agora cada marca apaga os seus):', velhos.map(r => r.id).join(', ')); } }
const tplApagados = brand => { const b = String(brand || '').trim().toLowerCase(); return new Set(b ? all('SELECT id FROM art_hidden_b WHERE brand=?', b).map(r => r.id) : []); };
const templatesVisiveis = brand => { const ap = tplApagados(brand); return templatesTodos().filter(t => !t.oculto && !ap.has(t.id)); };
// Cada estilo do dono pertence a UMA marca: a marca só enxerga os próprios (mais os da casa e da Central, que são de todas). Sem marca = visão geral
const mesmaMarca = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const templatesDaMarca = brand => {
  const T = templatesVisiveis(brand);
  if (!String(brand || '').trim()) {   // visão geral: estilo da casa que você apagou em todas as marcas não aparece mais
    const marcas = all('SELECT lower(name) n FROM brands').map(r => r.n); if (!marcas.length) return T;
    const hid = {}; for (const r of all('SELECT id, brand FROM art_hidden_b')) (hid[r.id] ||= new Set()).add(r.brand);
    return T.filter(t => !(t.casa && hid[t.id] && marcas.every(m => hid[t.id].has(m))));
  }
  const doMarca = t => !t.marcas || t.marcas.some(m => mesmaMarca(m, brand));   // estilo da casa feito para marcas específicas
  const deriv = new Set(T.filter(t => t.brand && mesmaMarca(t.brand, brand) && t.deriva).map(t => t.deriva));   // a marca já tem a própria versão deste estilo da casa
  const proprios = new Set(T.filter(t => !t.casa && t.brand && mesmaMarca(t.brand, brand)).map(t => t.id));   // ajuste da própria marca de um estilo da casa (mesmo id): vale ele, não o original
  return T.filter(t => doMarca(t) && (t.casa ? !deriv.has(t.id) && !proprios.has(t.id) : (!t.brand || mesmaMarca(t.brand, brand))));
};
const templatesTodos = () => {
  const rows = all('SELECT * FROM art_templates ORDER BY id DESC'), proprio = new Set(rows.filter(r => r.base).map(r => r.base));
  const vis = rows.filter(r => !(r.central && !r.base && proprio.has(tplCasaDe(r))));   // a versão do dono vence a da Central
  const sub = new Set(vis.filter(r => !String(r.brand || '').trim()).map(tplCasaDe).filter(Boolean));   // só o ajuste SEM marca substitui o estilo da casa para todos; o ajuste de uma marca vale só para ela (as outras continuam com o original)
  return [...TEMPLATES_CASA.filter(t => !sub.has(t.id)).map(t => ({ ...t, casa: true })), ...vis.map(tplDono)];
};
const tplRow = id => { id = String(id || ''); if (/^dono-\d+$/.test(id)) return one('SELECT * FROM art_templates WHERE id=?', +id.slice(5)); return one("SELECT * FROM art_templates WHERE base=? ORDER BY id DESC", id) || one("SELECT * FROM art_templates WHERE central=? ORDER BY id DESC", 'template/' + id); };
const templateDe = id => templatesTodos().find(t => t.id === String(id || ''));
const templatePadrao = format => templateDe(format === 'feed' ? 'post-heroi' : format === 'stories' ? 'stories-sequencia' : 'mitos');
// mascotes da marca (o original e as poses aprovadas): giram entre as páginas; com um só e o fal.ai ligado, o painel gera poses novas
const POSES_ARTE = ['pointing confidently at the viewer with a big smile', 'sitting relaxed with a laptop on the lap, smiling', 'running forward in a dynamic energetic pose', 'giving a thumbs up with a proud smile', 'thinking with one hand on the chin, looking up', 'celebrating with both arms raised'];
function mascotesDe(brand) {
  if (!brand) return [];
  const L = all("SELECT name, tags FROM assets WHERE kind='mascote' AND brand=? COLLATE NOCASE AND ext IN ('png','webp','jpg','jpeg') ORDER BY id", brand);
  return L.map(a => a.name);
}
// ───────── Leitura do roteiro no MODELO DO DONO ("📌 Slide N — NOME" + "Rótulo: texto") → páginas no estilo aprovado, sem IA ─────────
const CAB_PAG = /^\s*(?:📌|📍|#{1,4})?\s*(?:\*\*)?\s*(slide|tela|arte|p[áa]gina|card)\s*(\d{1,2})?\s*(?:\*\*)?\s*(?:[—–:-]\s*(?:\*\*)?\s*(.{0,90}?)|(\(.{0,60}\)))?\s*(?:\*\*)?\s*$/i;   // "Slide 1 — CAPA", "## Slide 1", "**Slide 2**", "Slide 1 (capa)"
const cabPag = raw => { const m = String(raw).match(CAB_PAG); if (!m) return null; if (m[3] == null && !m[2]) return null; m[3] = String(m[3] ?? m[4] ?? '').replace(/^\(|\)$/g, ''); return m; };
function lerRoteiroModelo(script) {
  const linhas = String(script || '').replace(/\r/g, '').split('\n'), pags = [];
  let cur = null, ultimo = null;
  const fecha = () => { if (cur) pags.push(cur); cur = null; ultimo = null; };
  for (let raw of linhas) {
    let l = raw.replace(/\*\*/g, '').replace(/^\s*[-•>]\s+(?!\d)/, '').trim();
    const cab = cabPag(raw);
    if (cab && (cab[2] || /arte/i.test(cab[1]))) {
      const n = cab[2] ? +cab[2] : 1;
      if (pags.length + (cur ? 1 : 0) > 0 && n === 1) { fecha(); break; }   // começou o roteiro de outra marca: fica só o primeiro
      fecha(); cur = { n, nome: cab[3].replace(/[*_]/g, '').trim(), campos: [], itens: [], notas: [] }; continue;
    }
    if (!cur) continue;
    { const mm = l.match(/\[\s*mascote(?:\s+novo)?\s*:\s*([^\]]{2,200})\]/i); if (mm) { cur.mascote = mm[1].trim(); l = l.replace(mm[0], '').replace(/\s{2,}/g, ' ').trim(); if (!l || /^[A-Za-zÀ-ú ]{2,30}:\s*$/.test(l)) continue; } }   // pose pedida pelo roteirista: [mascote: correndo]
    if (/^_{3,}|^-{3,}$|^={3,}$/.test(l) || /^#{1,4}\s/.test(raw.trim()) || /^legenda( do post)?\s*:?\s*$/i.test(l) || /^legenda do post\s*:/i.test(l)) { fecha(); if (pags.length) break; continue; }
    if (!l) continue;
    let m;
    if ((m = l.match(/^(\d{1,2})[.)]\s+(.+)$/))) { const [a, ...r] = m[2].split(/:\s+/); cur.itens.push(r.length ? { t: a.trim(), d: r.join(': ').trim() } : { t: m[2].trim(), d: '' }); ultimo = null; continue; }
    if (/^\(.*\)$/.test(l)) { cur.notas.push(l.slice(1, -1).trim()); continue; }
    if ((m = l.match(/^([A-Za-zÀ-ú0-9 ."'’()\/-]{2,45}?)\s*:\s*(.*)$/)) && !/^https?$/i.test(m[1]) && m[1].split(/\s+/).length <= 7) { ultimo = { r: m[1].trim(), v: m[2].trim() }; cur.campos.push(ultimo); continue; }
    if (ultimo) ultimo.v = (ultimo.v ? ultimo.v + ' ' : '') + l; else cur.campos.push(ultimo = { r: '', v: l });
  }
  fecha();
  return pags.filter(p => p.campos.some(c => c.v) || p.itens.length);
}
// uma palavra de destaque por título (regra do estilo aprovado): número/percentual, senão a última palavra forte
function destaqueAuto(t) {
  t = String(t || '').trim().replace(/\s*\.$/, ''); if (!t || /\*[^*]+\*/.test(t)) return t;
  const w = t.split(/\s+/), num = w.findIndex(x => /\d/.test(x) && x.replace(/[^\d%]/g, '').length);
  if (num >= 0) {
    const x = w[num].match(/^([^\w%]*)([\w%.,]+?)([^\w%]*)$/u), y = /^\d+$/.test(x?.[2] || '') && !x[3] && w[num + 1] ? w[num + 1].match(/^([\p{L}]{3,})([^\p{L}]*)$/u) : null;
    if (x && y) { w[num] = `${x[1]}*${x[2]}`; w[num + 1] = `${y[1]}*${y[2]}`; return w.join(' '); }   // "5 minutos": o número e a unidade juntos
    if (x) { w[num] = `${x[1]}*${x[2]}*${x[3]}`; return w.join(' '); }
  }
  for (let i = w.length - 1; i >= Math.max(0, w.length - 4); i--) { const x = w[i].match(/^([("“']*)([\p{L}\p{N}-]{3,})([^\p{L}\p{N}]*)$/u); if (x && (x[2].length >= 4 || /^\p{Lu}/u.test(x[2])) && !FRACAS_PT.has(x[2].toLowerCase())) { w[i] = `${x[1]}*${x[2]}*${x[3]}`; return w.join(' '); } }
  return t;
}
const FRACAS_PT = new Set(['para', 'como', 'mais', 'menos', 'muito', 'pelos', 'pelas', 'sobre', 'entre', 'você', 'isso', 'esse', 'essa', 'este', 'esta', 'seus', 'suas', 'sem', 'cada', 'todo', 'toda', 'quando', 'onde', 'porque']);
const botaoDaChamada = ch => {
  ch = String(ch || ''); let m;
  if ((m = ch.match(/coment[ea]\w*\s+["“”'‘’]?([\p{L}\p{N}]{2,20})["“”'‘’]?/iu))) return `Comente ${m[1].toUpperCase()}`;
  if ((m = ch.match(/^\s*([\p{L}]{3,14})\b[^"“”']*["“”']([\p{L}\p{N}]{2,20})["“”']/u))) return `${m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()} ${m[2].toUpperCase()}`;   // Responda "QUERO", Digite "EU QUERO"
  if (/link na bio/i.test(ch)) return /site/i.test(ch) ? 'Acesse o site' : 'Link na bio';
  if (/direct|dm\b/i.test(ch)) return 'Chame no Direct';
  if (/whats/i.test(ch)) return 'Fale no WhatsApp';
  if (/salv[ae]/i.test(ch)) return 'Salve este post';
  const fr = ch.replace(/[.!?].*$/s, '').trim(), pal = fr.split(/\s+/).filter(Boolean);
  if (pal.length <= 5) return fr;
  const vb = fr.match(/^(mande|envie|compartilhe|encaminhe|marque|indique)\b/i);   // "Mande para quem diz que...": botão completo, nunca cortado no meio
  if (vb) return vb[1][0].toUpperCase() + vb[1].slice(1).toLowerCase() + ' para quem precisa';
  const PEND = /^(para|pra|de|da|do|das|dos|a|o|as|os|e|em|no|na|que|quem|com|por|um|uma|se)$/i;
  let k = Math.min(4, pal.length); while (k > 1 && PEND.test(pal[k - 1])) k--;
  return pal.slice(0, k).join(' ');
};
const corta = (t, n) => { t = String(t || '').replace(/\s*-+>\s*/g, ' → ').replace(/\s+/g, ' ').trim(); if (t.length <= n) return t; const c = t.slice(0, n), p = Math.max(c.lastIndexOf('. '), c.lastIndexOf('? '), c.lastIndexOf('! ')); return p > n * .5 ? c.slice(0, p + 1) : c.replace(/\s+\S*$/, '') + '…'; };
// Pose nova do mascote por IA REDESENHA o personagem (muda rosto, roupa, traço). Só roda se o dono liga em Configurações (máx. de poses novas > 0); por padrão o mascote é sempre o arquivo cadastrado.
const PROMPT_MASCOTE = /\b(mascot|mascote|mascotte|character|personagem|avatar|cartoon|desenho animado|brand character)\b/i;
const poseIaLigada = () => settings().art_gen === '1' && !!falKey() && (+settings().max_pose_gen || 0) > 0;
// o "Visual" do roteiro mistura cenário com instruções de diagramação (título, caixa alta, faixa, recorte…): só o que descreve cenário vai para o gerador de imagem
const ambienteLimpo = v => { const f = String(v || '').split(/(?<=[.;!?])\s+/).filter(x => x && !/(t[íi]tulo|caixa alta|linhas?\b|faixa|fonte|tipografia|\btexto|bot[ãa]o|\bcta\b|recortad|lado (esquerdo|direito)|\blogo|slide|p[áa]gina|negrito|\bpose\b|sentad|em p[ée]|mascote|personagem|\bcor (do|da|de)\b)/i.test(x)).join(' ').replace(/[,;\s]+$/, '').trim(); return f.split(/\s+/).length >= 3 ? f : ''; };
function paginasDoRoteiro(script, format, brand = '') {
  const L = lerRoteiroModelo(script); if (!L.length || (format !== 'feed' && L.length < 2)) return null;
  const pegar = (p, re) => (p.campos.find(c => re.test(c.r)) || {}).v || '';
  const PAD = /^(t[íi]tulo|manchete|headline|subt[íi]tulo|subtexto|texto|visual|imagem|chamada|cta|bot[ãa]o|texto do card|apoio|legenda|nota)/i;
  const masc = mascotesDe(brand), podePose = poseIaLigada(); let mk = 0;
  const mascote = pose => !masc.length ? undefined : masc.length > 1 ? masc[mk++ % masc.length] : podePose ? `${masc[0]} (pose: ${pose || POSES_ARTE[mk++ % POSES_ARTE.length]})` : masc[0];
  // pose pedida (roteiro ou Visual): primeiro uma pose já aprovada que combine; senão gera a pose a partir do mascote original
  const infoM = brand ? all("SELECT name, tags FROM assets WHERE kind='mascote' AND brand=? COLLATE NOCASE AND ext IN ('png','webp','jpg','jpeg') ORDER BY id", brand) : [];
  const origM = (infoM.find(a => !/^\s*pose:/i.test(a.tags || '')) || infoM[0])?.name;
  const semAc = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const poseDe = desc => {
    if (!origM) return undefined; desc = String(desc || '').replace(/[()]/g, ', ').replace(/\s+/g, ' ').trim().slice(0, 220); if (!desc) return mascote();
    { const nome = infoM.find(a => semAc(a.name) === semAc(desc.replace(/[,\s]+$/, ''))); if (nome) return nome.name; }   // o roteiro só citou o arquivo do mascote: usa ele como está (sem pose nova)
    const pw = new Set(semAc(desc).split(/[^a-z0-9]+/).filter(w => w.length > 3)); let best = null, bs = 0;
    for (const a of infoM) { if (a.name === origM) continue; const lab = semAc((a.tags || '').match(/pose:\s*([^;]+)/i)?.[1] || a.name).split(/[^a-z0-9]+/).filter(w => w.length > 3); const sc = lab.filter(w => pw.has(w)).length; if (sc > bs) { bs = sc; best = a.name; } }
    if (best && (bs >= 2 || bs >= pw.size || !podePose)) return best;   // pose aprovada que já cobre o pedido: sem custo e com o rosto conferido
    return podePose ? `${origM} (pose: ${desc})` : (best || origM);
  };
  const usar = format === 'feed' ? L.slice(0, 1) : L.slice(0, ART_MAX[format] || 10), out = [];
  let comMidia = 0, claro = false;
  usar.forEach((p, i) => {
    const ultimo = i === usar.length - 1 && usar.length > 1, nome = p.nome.replace(/^\d+[.)]\s*/, '').replace(/\s*\(.*\)\s*$/, '').trim();
    const titulo = pegar(p, /^(t[íi]tulo|manchete|headline)/i), texto = pegar(p, /^(texto( do card)?|apoio|subt[íi]tulo)$/i), visual = pegar(p, /^(visual|imagem)/i) || p.notas.find(n => /visual|imagem|foto/i.test(n)) || '';
    const livres = p.campos.filter(c => c.v && !PAD.test(c.r));
    if (i === 0) {   // capa
      let tit = titulo || p.campos.find(c => c.v)?.v || nome, kicker = '';
      const dois = tit.match(/^([^:]{3,40}):\s+(.{8,})$/); if (dois) { kicker = dois[1]; tit = dois[2]; }
      const sub = pegar(p, /^subt/i).replace(/^\((.*)\)\.?$/, '$1'), nw = tit.split(/\s+/).length;
      const d = { kicker: kicker || undefined, titulo: destaqueAuto(corta(tit, 140)), apoio: sub && sub.split(/\s+/).length <= 7 ? sub : undefined, texto: sub && sub.split(/\s+/).length > 7 ? corta(sub, 120) : undefined };
      if (format === 'feed') d.cta = botaoDaChamada(pegar(p, /^(chamada|cta|bot)/i)) || 'Saiba mais';
      const vis = corta(visual.replace(/[()]/g, ', ').replace(/\s*,\s*,/g, ','), 220);
      if ((vis || p.mascote) && masc.length) { d.foto = poseDe(p.mascote || vis); const amb = ambienteLimpo(vis); if (amb) d.ambiente = amb; }   // a marca tem mascote: ele é o protagonista da capa, na pose e no cenário do tema
      else if (vis) d.foto = vis;
      else { const o = mascote('dynamic heroic pose pointing at the viewer, big confident smile'); if (o) d.objeto = o; }
      out.push({ modelo: nw <= 5 && !d.texto ? 'revista' : 'heroi', dados: d }); return;
    }
    if (ultimo || /\b(cta|chamada|fechamento)\b/i.test(p.nome)) {
      const ch = pegar(p, /^(chamada|cta|bot)/i) || p.campos.map(c => c.v).find(v => /coment|link|clique|acesse|chame|salve/i.test(v)) || '';
      let frase = texto || titulo || p.campos.map(c => c.v).filter(v => v && v !== ch).join(' ');
      if (frase.length > 110) { const q = frase.split(/(?<=[.?!])\s+/).filter(Boolean); frase = q.find(s => /\?$/.test(s)) || q[q.length - 1]; }
      out.push({ modelo: 'cta', dados: { titulo: destaqueAuto(corta(frase || 'Gostou? Salve e compartilhe', 120)), cta: botaoDaChamada(ch) || 'Saiba mais', objeto: p.mascote ? poseDe(p.mascote) : mascote('waving goodbye with a friendly smile') } }); return;
    }
    const d = {};
    if (p.itens.length >= 2) Object.assign(d, { titulo: destaqueAuto(corta((titulo || nome).replace(/:\s*$/, ''), 90)), itens: p.itens.slice(0, 4).map(x => ({ t: corta(x.t, 60), d: corta(x.d, 130) })), fundo: (claro = !claro) ? 'claro' : 'escuro' }), out.push({ modelo: 'lista', dados: d });
    else if (livres.length >= 2) out.push({ modelo: 'lista', dados: { titulo: corta(nome || titulo, 70).replace(/\*/g, ''), itens: livres.slice(0, 4).map(c => ({ t: corta(c.r, 60), d: corta(c.v.replace(/^["“](.*)["”]$/, '$1'), 150) })), contraste: true, fundo: (claro = !claro) ? 'claro' : 'escuro' } });
    else {
      let tit = titulo || (livres[0] ? livres[0].v : ''), tx = texto || (titulo && livres[0] ? livres[0].v : '');
      if (!tit && tx) {   // página de fala corrida (só "Texto:"): a primeira frase vira o destaque e o resto o apoio; frase curta vira página de frase
        const q = tx.split(/(?<=[.?!])\s+/).filter(Boolean);
        if (tx.split(/\s+/).length <= 16 || q.length < 2) { tit = tx; tx = ''; } else { tit = q[0]; tx = q.slice(1).join(' '); }
      }
      if (!tit) tit = nome;
      if (!tx && tit.split(/\s+/).length <= 16) out.push({ modelo: 'frase', dados: { titulo: destaqueAuto(corta(tit, 120)) } });
      else {
        claro = !claro; Object.assign(d, { kicker: corta(nome, 40) || undefined, titulo: destaqueAuto(corta(tit, 110)), texto: corta(tx, 230) || undefined, fundo: claro ? undefined : 'claro' });
        if (p.mascote && masc.length) d.objeto = poseDe(p.mascote);
        else if (visual && comMidia < 2) { d.foto = corta(visual, 300); comMidia++; } else if (i % 2 === 1 && masc.length) d.objeto = mascote();
        out.push({ modelo: 'texto', dados: d });
      }
    }
  });
  for (const pg of out) for (const k of Object.keys(pg.dados)) if (pg.dados[k] === undefined || pg.dados[k] === '') delete pg.dados[k];
  return out;
}
// monta a arte de uma peça a partir do roteiro no modelo do dono, sem IA (modo chat, plano B do Designer e botão do painel)
// Roteiro de notícia fora do formato "Arte — CAPA": acha a manchete assim mesmo (rótulo Manchete/Título/Headline, bloco TEXTO DA ARTE, primeira linha curta) ou usa a da fonte; a arte de notícia nunca deixa de sair por formato do texto
function roteiroNoticiaFallback(c) {
  const limpa = v => String(v || '').replace(/[*_`#>]/g, '').replace(/^[\s"“'‘-]+|[\s"”'’]+$/g, '').replace(/\s+/g, ' ').trim();
  const L = String(c.script || '').replace(/\r/g, '').split('\n').map(x => x.trim());
  let tit = '', leg = '';
  for (let i = 0; i < L.length && !tit; i++) { const m = L[i].match(/^[#>*\s•📌📍-]*(?:manchete(?: da arte)?|t[íi]tulo|headline|texto da arte)\b[^:\n]{0,30}:\s*\**\s*(.*)$/i); if (m) { tit = limpa(m[1]); if (!tit) tit = limpa(L.slice(i + 1).find(x => x && !/^#{1,4}\s/.test(x)) || ''); } }
  if (!tit) { const i = L.findIndex(x => /^[#>*\s]*(manchete( da arte)?|t[íi]tulo|headline|texto da arte)\s*\**:?\s*$/i.test(x)); if (i >= 0) tit = limpa(L.slice(i + 1).find(x => x && !/^#{1,4}\s/.test(x)) || ''); }
  if (!tit) { const i = L.findIndex(x => /^#{1,4}\s*.*(texto da arte|manchete|arte)\b/i.test(x)); if (i >= 0) tit = limpa(L.slice(i + 1).find(x => x && !/^#{1,4}\s/.test(x)) || ''); }
  if (!tit) tit = limpa(L.find(x => x && !/^(#{1,4}\s|\(|legenda|hashtags?|fonte|cr[ée]dito|_{3,}|-{3,}|={3,})/i.test(x) && !/^(manchete|t[íi]tulo|headline|roteiro|texto da arte)\b/i.test(x) && x.split(/\s+/).length >= 3 && x.split(/\s+/).length <= 26) || '');
  let origem = 'roteiro';
  if (!tit || tit.split(/\s+/).length < 2) { const it = one('SELECT titulo FROM radar_items WHERE content_id=?', c.id); tit = limpa(limpaTituloFonte(xmlDec(it?.titulo || c.title || ''))); origem = 'fonte'; }
  if (!tit) return null;
  const lm = String(c.script || '').match(/(?:^|\n)\s*[#>*]*\s*(?:chamada|legenda da arte)\s*[^:\n]*:\s*(.+)/i); leg = lm ? limpa(lm[1]).slice(0, 40) : '';
  return { script: `📌 Arte — CAPA\nTítulo: ${tit.slice(0, 160)}\nLegenda: ${leg || 'Leia a legenda'}`, origem };
}
async function arteDoRoteiro(id, origem = 'painel') {
  let c = getContent(id); if (!c || !['feed', 'carrossel', 'stories'].includes(c.format)) return false;
  let format = c.format, pags = paginasDoRoteiro(c.script, format, c.brand);
  if (!pags && format === 'feed') { const p2 = paginasDoRoteiro(c.script, 'carrossel', c.brand); if (p2 && p2.length > 1) { format = 'carrossel'; pags = p2; } }
  if (!pags && format !== 'feed' && lerRoteiroModelo(c.script).length === 1) { const t1 = templateDe(c.estilo_arte && /^t:/.test(c.estilo_arte) ? c.estilo_arte.slice(2) : ''), p1 = paginasDoRoteiro(c.script, 'feed', c.brand); if (p1 && p1.length === 1 && (!t1 || t1.seq.length === 1)) { format = 'feed'; pags = p1; } }   // template de notícia de uma página só: o roteiro de 1 slide é válido (antes dava "o Designer não entregou a especificação visual")
  let avisoRoteiro = '';
  if (!pags && c.kind === 'noticia') { const fb = roteiroNoticiaFallback(c); if (fb) { const p1 = paginasDoRoteiro(fb.script, 'feed', c.brand); if (p1 && p1.length === 1) { format = 'feed'; pags = p1; avisoRoteiro = fb.origem === 'roteiro' ? 'O roteiro veio fora do formato "Arte — CAPA"; o painel achou a manchete nele e montou a arte.' : 'O roteiro não trazia manchete legível; a arte saiu com a manchete da fonte. Reescreva a manchete no Roteiro e clique em Recompor.'; log('designer', avisoRoteiro + ` ("${c.title}")`, id); } } }
  if (!pags) return false;
  if (format === 'feed' && lerRoteiroModelo(c.script).length > 1) { const p2 = paginasDoRoteiro(c.script, 'carrossel', c.brand); if (p2) { format = 'carrossel'; pags = p2; } }
  let notaFoto = '';
  if (c.kind === 'noticia' && pags[0]) {   // foto da própria matéria na capa: busca de novo se ainda não veio e usa mesmo que o Roteirista não tenha citado
    try { let it = one('SELECT * FROM radar_items WHERE content_id=?', id);
      if (it && !it.foto_asset) { await radarFoto(it, null); it = one('SELECT * FROM radar_items WHERE content_id=?', id); }
      if (it && !it.foto_asset) notaFoto = String(it.foto_info || 'Sem foto: a busca não retornou imagem. Envie a foto na aba Arte.').slice(0, 320);
      if (it?.foto_asset && assetDaMarca(c.brand, it.foto_asset) && ['noticia', 'manchete-foto', 'citacao', 'heroi', 'revista'].includes(pags[0].modelo) && !(pags[0].dados.foto && assetDaMarca(c.brand, String(pags[0].dados.foto).split(' (')[0]))) pags[0].dados = { ...pags[0].dados, foto: it.foto_asset };
    } catch { /* sem foto: segue com o fundo da marca */ }
  }
  if (c.kind === 'noticia') { const tl = radarEstiloDaMarca(c.brand || ''); if (tl?.layoutId && await arteDeLayoutNoticia(id, c, tl, pags, [avisoRoteiro, notaFoto])) return true; }
  if (c.kind === 'noticia') { const tn = radarEstiloDaMarca(c.brand || ''); if (tn && !tn.layoutId && c.estilo_arte !== 't:' + tn.id) { setContent(id, { estilo_arte: 't:' + tn.id }); c = getContent(id); } }
  const estilo = escolheEstilo(c, format); let spec = sanitizeArteSpec(compoeModelos({ slides: pags, estilo: estilo || undefined }, format, c.brand, c), format); if (!spec) return false;
  if (c.kind === 'noticia' && spec.slides.length === 1) {   // notícia tem sempre 2 páginas: capa + contracapa (foto + cartão de post do X)
    await radarGarantiFoto2(c);
    const f1 = spec.slides[0].bg?.asset || spec.slides[0].dados?.foto || '', cc = contracapaNoticia(c, f1);
    if (cc) { const sp2 = sanitizeArteSpec({ ...spec, slides: [spec.slides[0], cc] }, 'carrossel'); if (sp2) { spec = sp2; format = 'carrossel'; } }
  }
  const confere = c.kind === 'noticia' ? confereNoticia(c, spec.slides[1], spec.slides[0].bg?.asset || spec.slides[0].dados?.foto || '') : '';
  const resumo = `Direção de arte montada pelo painel a partir do roteiro, no estilo aprovado da marca (${origem}).\n` + pags.map((p, i) => `Página ${i + 1} · ${p.modelo}: ${String(p.dados.titulo || '').replace(/\*/g, '')}`).join('\n');
  setContent(id, { ...(format !== c.format ? { format } : {}), art: resumo + (estilo ? `\nEstilo usado: ${templateDe(estilo)?.nome || estilo}` : ''), art_spec: JSON.stringify(spec), art_spec_base: JSON.stringify(spec), art_status: '', art_note: [avisoRoteiro, notaFoto, confere].filter(Boolean).join(' | '), ...(!c.caption && parseCaption(c.script) ? { caption: parseCaption(c.script) } : {}) });
  log('designer', `Arte montada a partir do roteiro (${pags.length} página${pags.length > 1 ? 's' : ''}): "${c.title}"`, id);
  await renderArte(id);
  if (notaFoto || avisoRoteiro) { const cn = getContent(id); setContent(id, { art_note: ([avisoRoteiro, notaFoto].filter(Boolean).join(' | ') + (cn?.art_note ? ' | ' + cn.art_note : '')).slice(0, 600) }); }
  return true;
}
// Refaz o desenho de uma peça JÁ montada (sem editar à mão) com o layout atual dos modelos: textos, fotos e páginas são os mesmos, só o diagrama (tamanhos, hierarquia, "Leia a legenda") é o novo
async function recomporLayoutPeca(id) {
  const c = getContent(id); if (!c || !['feed', 'carrossel', 'stories'].includes(c.format) || !c.art_spec) return false;
  if (c.art_spec !== c.art_spec_base) return false;   // o dono mexeu na arte: não se toca
  const sp = jparse(c.art_spec, null); if (!sp?.slides?.length || !sp.slides.every(x => MODELO_IDS.includes(x.modelo) && x.dados && typeof x.dados === 'object')) return false;
  if (/^l:/.test(String(c.estilo_arte || '')) || /layout salvo/.test(String(c.art || ''))) {   // arte feita pelo layout de notícia do Escritório: refaz só o tamanho/posição da manchete e o "Leia a legenda"
    const s0 = sp.slides[0], tx = (s0.texts || []).filter(t => String(t.value || '').trim() && !/^leia a legenda$/i.test(String(t.value).trim())), main = tx.sort((a, b) => (b.size || 0) - (a.size || 0))[0]; if (!main) return false;
    const H = c.format === 'stories' ? 1920 : 1350, antes = JSON.stringify(s0); layoutNoticiaTexto(s0, main, sp.accent, String(main.value).replace(/[*|]+/g, ' ').replace(/\s+/g, ' ').trim(), H);
    if (JSON.stringify(s0) === antes) return false;
    const j = JSON.stringify(sp); setContent(id, { art_spec: j, art_spec_base: j }); await renderArte(id); return true;
  }
  const estilo = escolheEstilo(c, c.format) || undefined;
  const novo = sanitizeArteSpec(compoeModelos({ slides: sp.slides.map(x => ({ modelo: x.modelo, dados: x.dados })), estilo }, c.format, c.brand, c), c.format); if (!novo?.slides?.length || novo.slides.length !== sp.slides.length || novo.slides.some((x, i) => x.modelo !== sp.slides[i].modelo)) return false;   // nunca troca o modelo de nenhuma página
  const j = JSON.stringify(novo); if (j === c.art_spec) return false;
  setContent(id, { art_spec: j, art_spec_base: j }); await renderArte(id); return true;
}
const ehFim = m => m === 'cta' || m === 'post-card';
const NOTICIA_CAPAS = ['noticia', 'manchete-foto', 'citacao'];
const fixo2Jornal = t => !!t && Array.isArray(t.seq) && t.seq.length === 2 && t.seq[0].modelo === 'noticia' && t.seq[1].modelo === 'post-card';   // o estilo clássico: a peça é montada já com as 2 páginas
const fixo2 = t => !!t && Array.isArray(t.seq) && t.seq.length >= 1 && NOTICIA_CAPAS.includes(t.seq[0].modelo) && (t.seq.length === 1 || (t.seq.length === 2 && t.seq[1].modelo === 'post-card'));   // TODO estilo de notícia tem 2 páginas: capa + contracapa do mesmo estilo (com "Leia a legenda" na capa)
function estruturaTemplate(tpl, format, pags, b = {}, brand = '') {
  const t = (v, n = 300) => String(v ?? '').replace(/[<>]/g, '').trim().slice(0, n);
  const capa = b.capa && typeof b.capa === 'object' ? b.capa : {}, masc = mascotesDe(brand), podePose = poseIaLigada();
  let mk = 0; const proxMascote = (pose) => { if (!masc.length) return undefined; if (masc.length > 1) return masc[mk++ % masc.length]; return podePose ? `${masc[0]} (pose: ${pose || POSES_ARTE[mk++ % POSES_ARTE.length]})` : masc[0]; };
  // textos das páginas internas: uma por linha, "Título: texto"; "[foto: cena]" no fim pede foto em cartão; "item - explicação; item - explicação" vira lista
  const linhas = (Array.isArray(b.paginasTxt) ? b.paginasTxt : String(b.paginasTxt || '').split('\n')).map(x => t(x, 500)).filter(Boolean);
  const seq = fixo2(tpl) && tpl.seq.length === 1 && format !== 'feed' ? [...tpl.seq, { modelo: 'post-card', papel: 'fim' }] : (tpl?.seq?.length ? tpl.seq : templatePadrao(format).seq), capaS = seq[0], fimS = seq.length > 1 && ehFim(seq[seq.length - 1].modelo) ? seq[seq.length - 1] : null;
  const meio = seq.slice(1, fimS ? -1 : undefined), resumo = meio.filter(x => x.papel === 'resumo' || x.papel === 'beneficios'), corpo = meio.filter(x => !resumo.includes(x));
  const capaD = { kicker: t(capa.kicker, 60) || undefined, titulo: t(capa.titulo, 120) || 'Seu título *aqui*', foto: t(capa.foto, 300) || undefined, particulas: t(capa.particulas, 120) || undefined, apoio: t(capa.apoio, 60) || undefined, cta: format === 'feed' ? (t(b.cta, 40) || 'Saiba mais') : undefined, ambiente: t(capa.ambiente, 160) || undefined };
  if (!capaD.foto && capaS.mascote !== false && masc.length && ['heroi', 'revista', 'capa-faixa', 'capa-mascote'].includes(capaS.modelo)) capaD.objeto = proxMascote('dynamic heroic pose pointing at the viewer, big confident smile');
  if (capaS.modelo === 'noticia') { capaD.selo = t(capa.selo, 40) || (capa.kicker ? undefined : 'Notícia urgente!'); capaD.legenda = t(capa.legenda, 40) || undefined; delete capaD.ambiente; delete capaD.particulas; delete capaD.apoio; delete capaD.objeto; if (capa.kicker && !capaD.selo && t(capa.kicker, 40).length <= 28) capaD.selo = t(capa.kicker, 40); delete capaD.kicker; }
  if (capaS.modelo === 'manchete-foto') { for (const k of Object.keys(capaD)) delete capaD[k]; Object.assign(capaD, { titulo: t(capa.titulo, 140) || 'A manchete que *para* o dedo em até quatro linhas', foto: t(capa.foto, 300) || undefined, ...(capaS.opcoes || {}) }); }
  if (capaS.modelo === 'citacao') { for (const k of Object.keys(capaD)) delete capaD[k]; Object.assign(capaD, { nome: t(capa.nome || capa.kicker, 50) || 'Nome de quem disse', frase: t(capa.frase || capa.titulo, 220) || '“A frase marcante, fiel ao que a pessoa disse.”', foto: t(capa.foto, 300) || undefined }); }
  const paginas = [{ modelo: capaS.modelo, dados: capaD }];
  if (format === 'feed' || pags === 1 || seq.length === 1) return paginas;
  const nMeio = Math.max(0, pags - 1 - (fimS ? 1 : 0)), slots = [];
  const rep = corpo.filter(x => x.repetir), base = corpo.length ? corpo : [{ modelo: 'texto' }];
  for (let i = 0; slots.length < nMeio - resumo.length && i < 40; i++) slots.push(i < base.length ? base[i] : (rep.length ? rep : base)[(i - base.length) % (rep.length || base.length)]);
  slots.splice(nMeio - Math.min(resumo.length, nMeio)); slots.push(...resumo.slice(0, Math.max(0, nMeio - slots.length)));
  let numero = 0;
  slots.forEach((sl, i) => {
    let ln = linhas[i] || ''; const fotoLn = (ln.match(/\[foto:\s*([^\]]{3,200})\]/i) || [])[1]; ln = ln.replace(/\[foto:[^\]]*\]/i, '').trim();
    const [tit, ...resto] = ln.split(':'), txt = resto.join(':').trim(), titulo = tit ? tit.replace(/^\s*\d+[.)]\s*/, '').trim() : `Título da página ${i + 2}`;
    const texto = txt || (ln ? '' : 'Escreva aqui uma ou duas frases curtas que explicam este ponto.');
    let modelo = sl.modelo; if (/\s;\s|;\s*\S/.test(txt) && modelo !== 'pilulas') modelo = 'lista';
    const d = { fundo: sl.fundo };
    if (modelo === 'lista' || modelo === 'pilulas') {
      const partes = (txt || 'Primeiro ponto - explicação curta; Segundo ponto - explicação curta; Terceiro ponto - explicação curta').split(/\s*;\s*/).filter(Boolean).slice(0, 4);
      if (modelo === 'pilulas') Object.assign(d, { itens: partes.map(x => x.split(/\s+[-–]\s+/)[0].trim().slice(0, 70)) });
      else Object.assign(d, { titulo, itens: partes.map(x => { const [a, ...r] = x.split(/\s+[-–]\s+/); return { t: a.trim().slice(0, 60), d: r.join(' - ').trim().slice(0, 120) }; }) });
    } else if (modelo === 'frase') Object.assign(d, { titulo: txt ? `${titulo}. ${txt}` : titulo });
    else if (modelo === 'numero') Object.assign(d, { numero: String(++numero).padStart(2, '0'), titulo, texto });
    else Object.assign(d, { kicker: modelo === 'texto' ? `Ponto ${i + 1}` : undefined, titulo, texto });
    if (fotoLn && ['texto', 'numero'].includes(modelo)) d.foto = fotoLn;
    else if (sl.foto && ['texto', 'numero'].includes(modelo) && t(b.foto_interna, 200)) d.foto = t(b.foto_interna, 200);
    else if (sl.mascote && ['texto', 'numero', 'lista'].includes(modelo)) d.objeto = proxMascote();
    for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k];
    paginas.push({ modelo, dados: d });
  });
  if (fimS && fimS.modelo === 'post-card') paginas.push({ modelo: 'post-card', dados: { titulo: t(b.card_texto, 340) || t(b.cta_titulo, 300) || 'Escreva aqui o texto da notícia, com a palavra mais *importante* em negrito.', nome: nomeBonito(brand) || undefined, foto: t(capa.foto, 300) || undefined } });
  else if (fimS) paginas.push({ modelo: 'cta', dados: { titulo: t(b.cta_titulo, 160) || (brand ? `Gostou? Siga a *${nomeBonito(brand)}* para mais` : 'Gostou? *Salve* e compartilhe'), cta: t(b.cta, 40) || 'Seguir agora', objeto: fimS.mascote ? proxMascote('waving goodbye with a friendly smile') : undefined } });
  return paginas;
}
// ───────── ESTILOS (templates) editados no Estúdio: sequência de páginas + prévia com a marca, sem gastar com IA ─────────
function seqOk(seq) {
  if (!Array.isArray(seq)) throw fail(400, 'Faltam as páginas do estilo');
  const L = seq.slice(0, 10).map((x, i, A) => { if (!x || !MODELO_IDS.includes(x.modelo)) return null; const o = { modelo: x.modelo };
    if (i === 0) o.papel = 'capa'; else if (i === A.length - 1 && ehFim(x.modelo)) o.papel = 'fim'; else if (['resumo', 'beneficios'].includes(x.papel)) o.papel = x.papel;
    if (x.mascote) o.mascote = true; if (x.foto && i > 0 && ['texto', 'numero'].includes(x.modelo)) o.foto = true; if (x.fundo === 'claro' && i > 0) o.fundo = 'claro'; if (x.repetir && i > 0 && o.papel !== 'fim') o.repetir = true; return o; }).filter(Boolean);
  if (!L.length) throw fail(400, 'O estilo precisa de pelo menos uma página');
  return L;
}
function previaPaginas(tpl, format, brand, nFixo) {
  const n = format === 'feed' ? 1 : fixo2(tpl) ? 2 : nFixo > 0 ? Math.min(12, nFixo) : Math.max(tpl.seq.length, format === 'carrossel' ? 6 : 3);
  const pags = estruturaTemplate(tpl, format, n, { capa: { kicker: 'Chamada de exemplo', selo: 'Notícia urgente!', nome: 'Nome da pessoa', frase: '“A frase marcante aparece aqui, fiel ao que a pessoa disse.”', titulo: 'O título da sua *capa*' }, card_texto: 'Escreva aqui o texto da notícia em poucas frases, com a palavra mais *importante* em negrito.', cta_titulo: 'Gostou? *Salve* e compartilhe', cta: format === 'feed' ? 'Saiba mais' : 'Seguir agora' }, brand);
  let k = 0;
  for (const pg of pags.slice(1)) { const d = pg.dados; k++;
    if (pg.modelo === 'texto') Object.assign(d, { kicker: 'Ponto ' + k, titulo: 'Uma ideia *forte* por página', texto: 'Uma ou duas frases curtas que explicam o ponto. Aqui entra o texto do roteiro.' });
    else if (pg.modelo === 'numero') Object.assign(d, { titulo: 'Uma dica *direta* e curta', texto: 'Uma frase de apoio explicando a dica.' });
    else if (pg.modelo === 'frase') d.titulo = 'Uma frase de efeito que *fica* na cabeça';
    else if (pg.modelo === 'lista') Object.assign(d, { titulo: 'O *resumo* em três pontos', itens: [{ t: 'Primeiro ponto', d: 'Explicação curta do primeiro ponto.' }, { t: 'Segundo ponto', d: 'Explicação curta do segundo ponto.' }, { t: 'Terceiro ponto', d: 'Explicação curta do terceiro ponto.' }] });
    else if (pg.modelo === 'agencia-texto') Object.assign(d, { apoio: 'Pouca gente aplica isso...', titulo: 'Mas é exatamente o que faz *marcas comuns virarem líderes.*', objeto: 'translucent glass rocket with purple flame' });
    else if (pg.modelo === 'agencia-cards') Object.assign(d, { titulo: 'Não é sobre *postar mais.*', apoio: 'É sobre comunicar melhor.', texto: 'Quem domina mensagem, domina percepção.', objeto: 'translucent glass astronaut floating, purple glow' });
    else if (pg.modelo === 'agencia-lista') Object.assign(d, { titulo: 'Estratégia real envolve:', itens: ['Clareza de posicionamento', 'Comunicação intencional', 'Conteúdo que conduz decisão', 'Presença que constrói confiança'], apoio: 'Quer sair do *“mais do mesmo”* e construir autoridade de verdade?', cta: 'Fale com nossa agência.' });
    else if (pg.modelo === 'agencia-objeto') Object.assign(d, { titulo: 'Rodar tráfego *sem estratégia*', texto: '*Resultado:* clique caro, lead ruim, zero vendas', objeto: 'shattered glass shopping cart, translucent crystal' });
    else if (pg.modelo === 'agencia-cta') Object.assign(d, { titulo: 'Quer *anunciar* do jeito certo e *escalar vendas*?', apoio: 'Converse com nossa agência.', objeto: 'glass megaphone with dollar sign and flying banknotes' });
    else if (pg.modelo === 'cinema-texto') Object.assign(d, { titulo: 'Você tenta agradar, se molda, adivinha *o que ele quer*...', texto: 'Mas tudo que ele sente é distância.|Porque conexão não nasce de esforço.' });
    else if (pg.modelo === 'cinema-pergunta') Object.assign(d, { apoio: 'Você não conquista perguntando:', titulo: 'Você gosta de mim?', texto: 'Mas se você perguntar...', nota: 'O que você acha que nós temos em comum?' });
    else if (pg.modelo === 'cinema-card') Object.assign(d, { titulo: 'Quando ele fala o que mais gosta em você, *ele reforça o motivo de estar ali*.', texto: 'Não é manipulação.|É consciência emocional.' });
    else if (pg.modelo === 'pilulas') d.itens = ['Primeiro benefício curto', 'Segundo benefício curto', 'Terceiro benefício curto'];
  }
  if (fixo2(tpl) && pags[0]) {   // estilo de notícia: a capa mostra "Leia a legenda" (frase de personalidade: modo impacto, sem nome) e a contracapa é o cartão do X
    if (pags[0].modelo === 'citacao') { pags[0].dados.impact = true; delete pags[0].dados.nome; }
    if (pags[0].modelo === 'manchete-foto') pags[0].dados.topo = 'nenhum';
    const cc = pags[pags.length - 1]; if (pags.length > 1 && cc.modelo === 'post-card') cc.dados.x = true;
  }
  if (pags[0]?.modelo === 'agencia-capa') Object.assign(pags[0].dados, { apoio: 'Você não está investindo em anúncios.', titulo: 'Você está jogando dinheiro fora.', objeto: 'glass trash can full of dollar bills, translucent crystal' });
  if (pags[0]?.modelo === 'cinema-capa') Object.assign(pags[0].dados, { kicker: 'SEGREDO', titulo: 'O que ninguém te conta sobre *conquistar de verdade*', texto: 'Deslize e entenda o motivo' });
  return pags;
}
// ───────── VISUAL DO ESTILO: o que o dono mexeu no editor, guardado como diferença sobre o modelo ─────────
// Para cada página, o painel recompõe o modelo com os textos de exemplo e guarda só o que o dono mudou: deslocamento e escala
// de cada texto/imagem, cores, fontes, efeitos, elementos que ele acrescentou ou tirou. Ao aplicar num conteúdo novo, o modelo é
// composto com os textos novos e recebe as mesmas mudanças: o texto cabe, a hierarquia segue e o visual fica igual ao aprovado.
const VIS_FONTE = ['src', 'asset', 'gen', 'pose', 'banco'], VIS_POS = ['x', 'y', 'size', 'value', 'rich'];
const visGrupo = (arr, chave) => { const cont = {}; return (arr || []).map(o => { const k = chave(o); cont[k] = (cont[k] || 0) + 1; return k + '#' + (cont[k] - 1); }); };
const itemTipo = it => it.moldura ? 'mold' : it.particula ? 'part' : it.copia ? 'copia' : it.hero ? 'hero' : it.pessoa ? 'hero' : 'outro';
const difProps = (a, b, fora) => { const o = {}; for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) { if (fora.includes(k)) continue; if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) o[k] = a?.[k] === undefined ? null : a[k]; } return o; };
// texto-exemplo que NÃO pode ser reaplicado em arte nova: cópia do texto de apoio/título de exemplo vira "texto fantasma" por cima do texto novo
const PLACEHOLDER_TXT = /^(uma ou duas frases|texto de apoio|novo t[ií]tulo|seu t[ií]tulo|uma ideia \*?forte|aqui entra o texto|selo$|categoria$|saiba mais$|ponto \d+$|texto de exemplo|lorem ipsum)/i;
const normTxt = v => String(v || '').replace(/[|*\s]+/g, ' ').trim().toLowerCase();
const textoFantasma = (t, conhecidos) => { if (!t || !['title', 'body', 'number', 'label', 'badge', 'cta'].includes(t.role || 'body')) return false; const n = normTxt(t.value); if (!n) return true; if (PLACEHOLDER_TXT.test(n)) return true; return !!(conhecidos && conhecidos.has(n) && ['title', 'body', 'number', 'label'].includes(t.role || 'body')); };
const sysArraste = t => t && t.role === 'footer' && /^Arraste/i.test(String(t.value || ''));   // o "Arraste para o lado" é da moldura da marca, não um elemento que o dono acrescentou
function visualDaArte(spec, format, brand) {   // spec do editor → lista de páginas com as diferenças
  const base = ctxMarca(brand, format, spec), n = spec.slides.length;
  return spec.slides.map((sl, i) => {
    if (!sl.modelo || !MODELO_IDS.includes(sl.modelo)) return null;
    let am; try { am = comporSlide({ modelo: sl.modelo, dados: sl.dados || {} }, { ...base, i, total: n }); } catch { return null; } if (!am) return null;
    const conhec = new Set([...(am.texts || []).map(t => normTxt(t.value)), ...Object.values(sl.dados || {}).flatMap(v => typeof v === 'string' ? [normTxt(v)] : Array.isArray(v) ? v.filter(x => typeof x === 'string').map(normTxt) : [])].filter(Boolean));
    const pg = { modelo: sl.modelo, papel: i === 0 ? 'capa' : i === n - 1 && ehFim(sl.modelo) ? 'fim' : 'meio', t: {}, it: {}, sh: {}, addT: [], addI: [], addS: [] };
    for (const [lista, chave, dst, add, fora] of [['texts', t => t.role || 'body', 't', 'addT', VIS_POS], ['items', itemTipo, 'it', 'addI', [...VIS_POS, ...VIS_FONTE]], ['shapes', x => x.kind || x.type || 'forma', 'sh', 'addS', ['x', 'y', 'w', 'h', 'size']]]) {
      const A = (am[lista] || []).filter(o => !o.moldura), S = (sl[lista] || []).filter(o => !o.moldura), kA = visGrupo(A, chave), kS = visGrupo(S, chave), mapS = new Map(kS.map((k, j) => [k, S[j]]));
      kA.forEach((k, j) => { const o = A[j], e = mapS.get(k); if (!e) { pg[dst][k] = { fora: true }; return; } mapS.delete(k);
        const d = { dx: +((e.x ?? 0) - (o.x ?? 0)).toFixed(4), dy: +((e.y ?? 0) - (o.y ?? 0)).toFixed(4) };
        for (const q of ['size', 'w', 'h']) if (o[q] && e[q] && Math.abs(e[q] / o[q] - 1) > .01) d['r' + q] = +(e[q] / o[q]).toFixed(4);
        const pr = difProps(e, o, fora); if (Object.keys(pr).length) d.p = pr;
        if (d.dx || d.dy || d.rsize || d.rw || d.rh || d.p) pg[dst][k] = d; });
      for (const e of mapS.values()) if (lista === 'texts' && !sysArraste(e) && textoFantasma(e, conhec)) { const { value, ...fmt } = e; (pg.slotT ||= []).push(fmt); } else if (lista === 'texts' && sysArraste(e)) { const rf = (am.texts || []).find(t => t.role === 'footer'), df = difProps(e, rf || {}, ['value', 'x', 'y', 'front', 'icon', 'icon_end']); if (Object.keys(df).length) pg.foot = df; } else if (!(lista === 'texts' && sysArraste(e))) pg[add].push(lista === 'items' && VIS_FONTE.some(f => e[f]) && !e.asset ? null : e);   // elemento que o dono acrescentou (imagem por IA de exemplo não vale)
      pg[add] = pg[add].filter(Boolean);
    }
    const bgS = sl.bg || {}, bgA = am.bg || {}; pg.bg = difProps(bgS, bgA, VIS_FONTE.filter(f => f !== 'asset'));   // imagem de fundo da biblioteca que o dono escolheu faz parte do estilo (a gerada por IA/banco depende do conteúdo e não entra)
    pg.fx = difProps(sl.fx || {}, am.fx || {}, []);
    { const ml = (sl.items || []).find(x => x.moldura && x.asset), padrao = (am.items || []).find(x => x.moldura && x.asset);   // a logo que o dono deixou nesta página (clara no fundo escuro, escura no claro) faz parte do layout
      if (ml && (!padrao || padrao.asset !== ml.asset || Math.abs((ml.x ?? 0) - (padrao.x ?? 0)) > .003 || Math.abs((ml.y ?? 0) - (padrao.y ?? 0)) > .003 || Math.abs((ml.size ?? 0) - (padrao.size ?? 0)) > 2)) {
        const tom = ml.asset === base.logo ? 'clara' : ml.asset === base.logoEscura ? 'escura' : /pret|escur|black|dark/i.test(ml.asset) ? 'escura' : /branc|clar|white|light|neg/i.test(ml.asset) ? 'clara' : '';
        pg.mold = { asset: ml.asset, tom, x: ml.x, y: ml.y, size: ml.size }; } }
    pg.top = difProps(sl, am, ['texts', 'items', 'shapes', 'bg', 'fx', 'modelo', 'dados', 'pager']);
    return pg;
  });
}
// cores: a marca do estilo → a marca da peça (as cores exatas da paleta e os tons derivados do destaque)
const hexRgbV = h => { h = String(h).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
const rgbHex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('');
const hsl = ([r, g, b]) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l]; const s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); let h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h * 60, s, l]; };
const hslRgb = ([h, s, l]) => { if (!s) return [l, l, l]; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q, f = t => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < .5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h / 360 + 1 / 3), f(h / 360), f(h / 360 - 1 / 3)]; };
function recolorFn(de, para) {
  if (!de || !para) return x => x; const exato = new Map(); for (const k of ['accent', 'paper', 'ink', 'claro', 'inkEscura']) if (de[k] && para[k]) exato.set(String(de[k]).toLowerCase(), para[k]);
  const hA = hsl(hexRgbV(de.accent)), hB = hsl(hexRgbV(para.accent));
  const troca = c => { const lc = c.toLowerCase(); if (exato.has(lc)) return exato.get(lc); const x = hsl(hexRgbV(c)); if (x[1] < .22 || hA[1] < .22) return c; let dh = Math.abs(x[0] - hA[0]); dh = Math.min(dh, 360 - dh); if (dh > 28) return c; return rgbHex(hslRgb([hB[0], Math.min(1, hB[1] * (x[1] / Math.max(.01, hA[1]))), Math.max(0, Math.min(1, x[2] + (hB[2] - hA[2]) * .8))])); };
  const anda = v => typeof v === 'string' ? v.replace(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, m => m.length === 9 ? troca(m.slice(0, 7)) + m.slice(7) : troca(m)) : Array.isArray(v) ? v.map(anda) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, w]) => [k, anda(w)])) : v;
  return anda;
}
const paletaDe = (brand, format) => { try { const c = ctxModelo({ ...ctxMarca(brand, format, {}), ...(ART_SIZE[format] ? { W: ART_SIZE[format][0], H: ART_SIZE[format][1] } : {}) }); return { accent: c.accent, paper: c.paper, ink: c.ink, claro: c.claro, inkEscura: c.inkEscura }; } catch { return null; } };
function aplicaVisual(slide, pg, cor, logos, mesma) {   // slide composto com o conteúdo novo + diferenças do estilo
  if (!slide || !pg) return slide; const out = JSON.parse(JSON.stringify(slide));
  { const claroBg = pg.mold?.tom === 'escura' || (pg.foot?.color && lumHex(pg.foot.color) < .35);   // layout com logo/rodapé escuros = página de fundo claro: o texto do conteúdo escurece para ler (o que o dono ajustou explicitamente vale por cima)
    const escuro = logos?.tinta || '#0a0a0a';
    for (const t of out.texts || []) { if (t.role === 'footer' && sysArraste(t)) { if (pg.foot) for (const [k, v] of Object.entries(cor(pg.foot))) { if (v === null) delete t[k]; else t[k] = v; } continue; }
      if (t.moldura) continue;
      if (claroBg && ['title', 'body', 'label', 'number'].includes(t.role || 'body') && t.color && lumHex(t.color) > .6 && !pg.t?.[(t.role || 'body') + '#0']?.p?.color) t.color = escuro; } }
  for (const [lista, chave, dst, add] of [['texts', t => t.role || 'body', 't', 'addT'], ['items', itemTipo, 'it', 'addI'], ['shapes', x => x.kind || x.type || 'forma', 'sh', 'addS']]) {
    const A = (out[lista] || []), nm = A.filter(o => !o.moldura), ks = visGrupo(nm, chave), novo = [];
    nm.forEach((o, j) => { let d = pg[dst]?.[ks[j]]; if (d?.fora) { if (lista === 'texts' && ['title', 'body', 'number'].includes(o.role || 'body') && String(o.value || '').trim()) d = null; else return; }   // o layout pode tirar enfeites, nunca o título/texto do conteúdo
       const ox = o.x, oy = o.y, osz = o.size, ow = o.w, oh = o.h;
       if (d) { if (d.dx) o.x = +((o.x ?? 0) + d.dx).toFixed(4); if (d.dy) o.y = +((o.y ?? 0) + d.dy).toFixed(4); for (const q of ['size', 'w', 'h']) if (d['r' + q] && o[q] && !(q === 'size' && o.font === 'impact')) o[q] = Math.round(o[q] * d['r' + q] * 100) / 100; if (d.p) for (const [k, v] of Object.entries(cor(d.p))) { if (v === null) delete o[k]; else o[k] = v; }
         if (lista === 'texts' && String(o.value || '').trim() && (o.x < -.02 || o.x > 1.02 || o.y < -.02 || o.y > 1.02) && ox >= -.02 && ox <= 1.02 && oy >= -.02 && oy <= 1.02) { o.x = ox; o.y = oy; o.size = osz; o.w = ow; o.h = oh; if (o.size == null) delete o.size; if (o.w == null) delete o.w; if (o.h == null) delete o.h; } } novo.push(o); });   // um ajuste de estilo velho nunca pode jogar o texto do conteúdo para fora da arte
    if (lista === 'texts') {   // texto-exemplo que o dono pôs no layout = o LUGAR e o jeito do texto de verdade desse papel (o conteúdo novo ocupa o lugar dele; nunca fica o exemplo)
      const slots = [...(pg.slotT || []), ...(pg.addT || []).filter(e => textoFantasma(e)).map(({ value, ...f }) => f)], usados = new Set();
      for (const f of slots) { const alvo = novo.find(o => !usados.has(o) && (o.role || 'body') === (f.role || 'body') && !o.decor); if (!alvo) continue; usados.add(alvo); for (const [k, v] of Object.entries(cor(f))) { if (k === 'role' || k === 'value') continue; if (v === null) delete alvo[k]; else alvo[k] = v; } }
    }
    out[lista] = [...novo, ...cor((pg[add] || []).filter(e => !(lista === 'texts' && (sysArraste(e) || textoFantasma(e))))), ...A.filter(o => o.moldura)];
    if (lista === 'texts') { const vistos = new Set(); out.texts = out.texts.filter(t => { const k = String(t.value || '').trim() ? [t.role, String(t.value).trim(), Math.round((t.x ?? 0) * 100), Math.round((t.y ?? 0) * 100)].join('|') : ''; if (!k) return true; if (vistos.has(k)) return false; vistos.add(k); return true; }); }   // texto idêntico na mesma posição (ex.: "Leia a legenda" do modelo + a do ajuste salvo) não pode dobrar
  }
  if (pg.mold?.asset) {   // logo da página como o dono deixou no layout (mesma marca: o arquivo e a posição dele; outra marca: o mesmo tom, clara ou escura, da logo da marca da peça)
    const alvo = mesma ? pg.mold.asset : (pg.mold.tom === 'escura' ? logos?.escura : pg.mold.tom === 'clara' ? logos?.clara : '') || '';
    for (const it of out.items || []) if (it.moldura && it.asset && alvo) { it.asset = alvo; if (mesma) { if (pg.mold.x != null) it.x = pg.mold.x; if (pg.mold.y != null) it.y = pg.mold.y; if (pg.mold.size) it.size = pg.mold.size; } }
  }
  if (pg.bg && Object.keys(pg.bg).length) { out.bg = { ...(out.bg || {}) }; for (const [k, v] of Object.entries(cor(pg.bg))) { if (v === null) delete out.bg[k]; else out.bg[k] = v; } if (out.bg.asset) { delete out.bg.gen; delete out.bg.banco; } }
  if (pg.fx && Object.keys(pg.fx).length) { out.fx = { ...(out.fx || {}) }; for (const [k, v] of Object.entries(cor(pg.fx))) { if (v === null) delete out.fx[k]; else out.fx[k] = v; } }
  for (const [k, v] of Object.entries(cor(pg.top || {}))) { if (v === null) delete out[k]; else out[k] = v; }
  return out;
}
// escolhe a página do estilo para cada página do conteúdo: mesma função (capa/fim), mesmo modelo, e as repetidas em rodízio
function visualPara(paginas, vis) {
  const V = (vis || []).filter(Boolean), uso = {};
  return paginas.map((sl, i) => {
    if (!sl?.modelo) return null; const papel = i === 0 ? 'capa' : i === paginas.length - 1 && ehFim(sl.modelo) ? 'fim' : 'meio';
    const cands = V.filter(v => v.modelo === sl.modelo && v.papel === papel), alt = cands.length ? cands : V.filter(v => v.modelo === sl.modelo);
    if (!alt.length) return null; const k = sl.modelo + papel; uso[k] = (uso[k] || 0) + 1; return alt[(uso[k] - 1) % alt.length];
  });
}
function estiloVisual(id, slides, format, brand) {   // aplica o visual do estilo nas páginas já compostas: o da marca; sem ele, o de outra marca com as cores trocadas
  const row = tplRow(id); if (!row) return slides; const mapa = visMapa(row), chaves = Object.keys(mapa); if (!chaves.length) return slides;
  const k0 = String(brand || '').toLowerCase(), prop = mapa[k0], outro = prop ? null : chaves.map(k => mapa[k]).sort((x, y) => String(y.at).localeCompare(String(x.at)))[0], ent = prop || outro;
  if (!ent || !Array.isArray(ent.pages)) return slides;
  const de = outro ? paletaDe(outro.brand, format) : null, para = de ? paletaDe(brand, format) : null, cor = recolorFn(de, para);
  const alvo = visualPara(slides, ent.pages);
  const lg = (() => { try { const c = ctxMarca(brand, format, {}); return { clara: c.logo, escura: c.logoEscura || c.logo, tinta: c.paper && lumHex(c.paper) < .35 ? c.paper : '#0a0a0a' }; } catch { return null; } })();
  const snapSl = ent.snaps?.[format]?.slides || [];
  const comMold = pg => { if (!pg || pg.mold) return pg; const idx = ent.pages.indexOf(pg), ml = (snapSl[idx]?.items || []).find(x => x.moldura && x.asset); if (!ml) return pg;
    const tom = ml.asset === lg?.clara ? 'clara' : ml.asset === lg?.escura ? 'escura' : /pret|escur|black|dark/i.test(ml.asset) ? 'escura' : /branc|clar|white|light|neg/i.test(ml.asset) ? 'clara' : '';
    const ft = (snapSl[idx]?.texts || []).find(sysArraste), foot = ft ? Object.fromEntries(['color', 'size', 'weight', 'font', 'shadow'].filter(k => ft[k] !== undefined).map(k => [k, ft[k]])) : undefined;
    return { ...pg, mold: { asset: ml.asset, tom, x: ml.x, y: ml.y, size: ml.size }, ...(foot && Object.keys(foot).length && !pg.foot ? { foot } : {}) }; };
  return slides.map((sl, i) => alvo[i] ? aplicaVisual(sl, comMold(alvo[i]), cor, lg, !!prop) : sl);
}
// tema do conteúdo (para escolher o estilo certo da marca sozinho): notícia, oferta, tutorial, lista, educativo, opinião
function temaDoConteudo(c) {
  if (c.tema && TEMAS[c.tema]) return c.tema;
  const t = `${c.title || ''}\n${c.brief || ''}\n${String(c.script || '').slice(0, 1800)}`;
  if (/\b(not[ií]cia|urgente|acab(ou|a) de|anunciou|lan[cç]ou|nova lei|breaking|ao vivo|atualiza[cç][aã]o|foi (anunciad|lan[cç]ad|aprovad))/i.test(t)) return 'noticia';
  if (/(promo[cç][aã]o|oferta|desconto|% off|black friday|cupom|garanta|vagas limitadas|s[oó] hoje)/i.test(t)) return 'oferta';
  if (/(passo a passo|tutorial|como fazer|aprenda a|etapas?\b)/i.test(t)) return 'tutorial';
  if (/\b\d{1,2}\s+(dicas|ferramentas|erros|maneiras|formas|motivos|passos|coisas|h[aá]bitos|ideias|atalhos|gatilhos)/i.test(t)) return 'lista';
  if (/(mito|verdade|ningu[eé]m te conta|crenç|nunca te contaram)/i.test(t)) return 'educativo';
  if (/(opini[aã]o|reflex[aã]o|provoca[cç][aã]o|verdade inc[oô]moda)/i.test(t)) return 'opiniao';
  return '';
}
// escolhe o estilo da marca para uma peça: o do tema da peça (de preferência o que o dono ajustou para a marca), senão o padrão da marca
// ───────── ESTRUTURA DO ESTILO: o que cada página do layout comporta (a copy é escrita para caber; o painel mostra o mesmo ao dono) ─────────
const CAMPO_ROTULO = { label: 'chamada', title: 'título', body: 'texto de apoio', number: 'número', cta: 'botão', badge: 'selo' };
function estiloEstrutura(id, format, brand, nPags) {
  const tpl = templateDe(id); if (!tpl) return null;
  const fmt = ['feed', 'carrossel', 'stories'].includes(format) ? format : (tpl.formatos?.[0] || 'carrossel'), [W] = ART_SIZE[fmt] || [1080];
  let pags; try { pags = previaPaginas(tpl, fmt, brand, nPags); } catch { return null; } if (!pags?.length) return null;
  const base = ctxMarca(brand || '', fmt, {}), n = pags.length;
  let sl = pags.map((pg, i) => { try { return comporSlide({ modelo: pg.modelo, dados: JSON.parse(JSON.stringify(pg.dados || {})) }, { ...base, i, total: n }) || {}; } catch { return {}; } });
  try { sl = estiloVisual(id, sl, fmt, brand); } catch { /* sem visual salvo */ }
  return pags.map((pg, i) => {
    const s = sl[i] || {}, M = MODELOS_ARTE.find(m => m.id === pg.modelo), tx = (s.texts || []).filter(t => t.value && !t.moldura && t.role !== 'footer');
    const cap = (role, linhas, fator, enc = 1) => { const t = tx.find(x => (x.role || 'body') === role), sz0 = t?.size || W * (ROLE_PX[role] || .042); if (!t && role !== 'body') return 0; const sz = sz0 * enc, w = (t?.w || (role === 'title' ? .86 : .82)) * W; return Math.max(8, Math.floor(w / (sz * fator))) * linhas; };
    const logoEscura = (s.items || []).some(it => it.moldura && /pret|escur|black|dark/i.test(String(it.asset || '')));
    const claro = logoEscura || (s.bg?.color && !s.bg?.asset && lumHex(s.bg.color) > .55);
    const campos = []; for (const r of ['label', 'title', 'number', 'body', 'cta']) if (tx.some(t => (t.role || 'body') === r)) campos.push(CAMPO_ROTULO[r]);
    if (!campos.includes('texto de apoio') && (M?.campos || []).some(k => k === 'texto' || k === 'apoio') && pg.modelo !== 'lista') campos.push('texto de apoio');   // o layout tem lugar para o apoio mesmo que o exemplo não traga
    const nItens = pg.modelo === 'lista' ? 4 : pg.modelo === 'pilulas' ? 4 : 0;
    const jornal = pg.modelo === 'manchete-foto' ? { campos: ['título'], apoio_max: 0, manchete: true } : pg.modelo === 'citacao' ? { campos: ['chamada', 'título'], apoio_max: 0, citacao: true } : pg.modelo === 'noticia' ? { campos: ['título', 'selo'], apoio_max: 0, chamada_max: 28 } : pg.modelo === 'post-card' ? { campos: ['texto da notícia'], apoio_max: 0, texto_ideal: 260, texto_max: 340 } : null;
    return { n: i + 1, papel: i === 0 ? 'capa' : i === n - 1 && ehFim(pg.modelo) ? 'fim' : 'meio', modelo: pg.modelo, modelo_nome: M?.nome || pg.modelo, campos: jornal ? jornal.campos : campos, jornal: jornal || undefined,
      titulo_ideal: cap('title', pg.modelo === 'capa-faixa' ? 4 : 3, .56), titulo_max: cap('title', pg.modelo === 'capa-faixa' ? 4 : 3, .56, .62), apoio_ideal: cap('body', 3, .5), apoio_max: cap('body', 4, .5, .8), chamada_max: cap('label', 1, .85), itens: nItens, mascote: !!(s.items || []).some(it => it.hero) || !!pg.dados?.objeto, fundo: claro ? 'claro' : 'escuro' };
  });
}
function estiloEstruturaBloco(c, para = 'roteirista') {
  try {
    const fmt = c?.format; if (!['carrossel', 'feed', 'stories'].includes(fmt)) return '';
    const id = escolheEstilo(c, fmt); if (!id) return ''; const tpl = templateDe(id), nsl0 = fmt === 'feed' ? 1 : fixo2(tpl) ? 2 : +settings()[fmt === 'stories' ? 'stories_slides' : 'carousel_slides'] || 0, est = tpl && estiloEstrutura(id, fmt, c.brand || '', nsl0); if (!est?.length) return '';
    const nsl = nsl0;
    const L = est.map(p => `- Página ${p.n} (${p.papel === 'capa' ? 'capa' : p.papel === 'fim' ? 'fechamento' : 'miolo'} · ${p.modelo_nome}, fundo ${p.fundo}${p.mascote ? ', com mascote' : ''}): ${p.jornal?.manchete ? `manchete direta e forte, ideal até ~${p.titulo_ideal} caracteres (máximo ~${p.titulo_max}), numa página só; foto = a imagem real do assunto` : p.jornal?.citacao ? 'chamada = nome de quem disse a frase (até ~30 letras); título = a frase inteira, fiel e real, entre aspas, ideal até ~120 caracteres (máximo ~170), numa página só; foto = o retrato da pessoa' : p.jornal?.texto_ideal ? `texto da notícia em UM parágrafo corrido, ideal até ~${p.jornal.texto_ideal} caracteres (máximo ~${p.jornal.texto_max}), com a palavra-chave em *negrito*` : p.jornal ? `selo curto até ~${p.jornal.chamada_max} letras (ex.: “Notícia urgente!”); ` : ''}${p.jornal?.texto_ideal || p.jornal?.citacao || p.jornal?.manchete ? '' : [p.campos.includes('chamada') && p.chamada_max ? `chamada até ~${p.chamada_max} letras` : '', p.campos.includes('título') ? `título ideal até ~${p.titulo_ideal} caracteres (máximo ~${p.titulo_max}; acima disso a letra encolhe e perde impacto)` : '', p.campos.includes('número') ? 'número curto' : '', p.itens ? `até ${p.itens} itens curtos (título + 1 frase)` : '', p.campos.includes('texto de apoio') && p.apoio_max ? `apoio (opcional) ideal até ~${p.apoio_ideal} caracteres, máximo ~${p.apoio_max}` : '', p.campos.includes('botão') ? 'botão de 2 a 4 palavras' : ''].filter(Boolean).join('; ') || 'só o título'}`);
    const quem = para === 'roteirista' ? 'Escreva a copy JÁ PENSANDO NESSA DIAGRAMAÇÃO: cada página só pode ter o que cabe.' : para === 'revisor' ? 'Confira se a copy cabe nessa diagramação (texto maior que o espaço é correção obrigatória: o painel só consegue encolher a letra, e letra pequena perde impacto).' : 'Confira se a copy cabe nessa diagramação; texto que não cabe é ajuste obrigatório.';
    return `\n\n# DIAGRAMAÇÃO DO ESTILO ESCOLHIDO: “${tpl.nome}”${c.brand ? ' (' + c.brand + ')' : ''}\nO Designer/dono já escolheu o estilo. ${quem}${fixo2(tpl) ? ' ESTE ESTILO TEM EXATAMENTE 2 PÁGINAS (capa e contra-capa, sem miolo): ignore a quantidade padrão de slides. Capa: manchete curta e forte (selo opcional como chamada, ex.: “Notícia urgente!”). Contra-capa: UM parágrafo curto da notícia (2 a 4 frases), com a palavra-chave em *negrito*. Foto: a imagem real da notícia.' : nsl && fmt !== 'feed' ? ` A peça terá ${nsl} páginas, na ordem abaixo.` : ''}\n${L.join('\n')}\nOs textos de exemplo do template são só marcadores de lugar: serão trocados pelos seus. Um título forte por página, sem blocos longos.`;
  } catch (e) { console.error('diagramação do estilo:', e.message); return ''; }
}
function escolheEstilo(c, format) {
  if (c?.kind === 'noticia') { const tn = radarEstiloDaMarca(c.brand || ''); if (tn && !tn.layoutId) return tn.id; if (tn?.layoutId) return ''; }   // REGRA: notícia só usa o template de notícia cadastrado da marca (Escritório), nunca outro
  { const ea = String(c?.estilo_arte || ''); if (/^t:/.test(ea) && templateDe(ea.slice(2))?.formatos.includes(format)) return ea.slice(2); }   // o dono escolheu o estilo ao criar o pedido
  const brand = c.brand || '', lc = brand.toLowerCase(), tema = temaDoConteudo(c), todos = templatesDaMarca(brand).filter(t => t.formatos.includes(format));
  const daMarca = t => mesmaMarca(t.brand, brand) && !!brand || (t.visual_marcas || []).some(m => String(m).toLowerCase() === lc);
  const doTema = tema ? todos.filter(t => t.tema === tema) : [];
  const pick = doTema.find(daMarca) || doTema[0];
  if (pick) return pick.id;
  return estiloPadrao(brand, format) || (todos.find(daMarca)?.id || '');
}
// estilo padrão de cada marca (o dono escolhe na galeria): vale para as artes montadas pelo roteiro e quando o Designer não escolhe outro
const estilosPadrao = () => jparse(one("SELECT value FROM settings WHERE key='estilo_padrao'")?.value, {}) || {};
function estiloPadrao(brand, format) { const id = estilosPadrao()[String(brand || '').toLowerCase()] || estilosPadrao()['']; const t = id && templateDe(id); return t && (!format || t.formatos.includes(format)) ? id : ''; }
let previaFila = Promise.resolve(); const previaPend = new Set();
function previaEstilo({ id, seq, format, brand, fresh }) {
  const tpl = seq ? { seq: seqOk(seq) } : templateDe(id); if (!tpl) throw fail(404, 'Estilo não encontrado');
  const fmt = ['feed', 'carrossel', 'stories'].includes(format) ? format : (tpl.formatos?.[0] || 'carrossel');
  const ex = !seq && Array.isArray(tpl.exemplo) && tpl.exemplo.length && (tpl.formatos || []).includes(fmt) && (fmt !== 'feed' || tpl.exemplo.length === 1) ? tpl.exemplo : null;
  const pags = ex ? JSON.parse(JSON.stringify(ex)) : previaPaginas(tpl, fmt, brand);
  if (ex) for (const pg of pags) for (const k of ['foto', 'particulas', 'ambiente']) if (pg.dados && typeof pg.dados[k] === 'string' && !/^[a-z0-9-]{2,60}$/.test(pg.dados[k])) delete pg.dados[k];   // na prévia, sem imagem por IA
  const chave = crypto.createHash('sha1').update(JSON.stringify({ pags, fmt, brand, v: BUILD, vt: seq ? '' : (tplRow(id)?.visual_at || ''), m: mascotesDe(brand), tp: styleParams(brand).tipografia || null, f: fresh ? crypto.randomBytes(6).toString('hex') : '' })).digest('hex').slice(0, 20), titulo = '__previa__' + chave;
  const ja = one('SELECT id FROM contents WHERE teste=3 AND title=?', titulo);
  if (ja && (arteFiles(ja.id).length || previaPend.has(ja.id) || arteState.get(ja.id)?.status === 'running')) return { id: ja.id, pronta: !!arteFiles(ja.id).length };
  if (ja) { run('DELETE FROM contents WHERE id=?', ja.id); cleanRender(ja.id); }
  // a arte exatamente como o dono salvou neste estilo para esta marca (vitrine e "Editar" mostram o MESMO que o editor mostrou): sem recomposição
  const guardada = !seq && !ex && visMapa(tplRow(id))[String(brand || '').toLowerCase()]?.snaps?.[fmt];
  const spec = guardada ? sanitizeArteSpec(JSON.parse(JSON.stringify(guardada)), fmt) : sanitizeArteSpec(compoeModelos({ slides: pags, template: seq ? undefined : id, previa: true }, fmt, brand), fmt); if (!spec) throw fail(400, 'Não consegui montar a prévia');
  const r = run("INSERT INTO contents(title,format,kind,platform,brief,script,brand,status,teste,created_by,art_spec,art_spec_base,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,3,'previa',?,?,?,?)", titulo, fmt, 'educativo', 'teste', '', '', brand || '', 'awaiting_approval', JSON.stringify(spec), JSON.stringify(spec), T(), T());
  const nid = +r.lastInsertRowid; previaPend.add(nid);
  if (fresh) renderArte(nid).catch(e => console.error('edição de estilo:', e.message)).finally(() => previaPend.delete(nid));   // quem vai editar não espera a fila das prévias da galeria
  else previaFila = previaFila.then(() => renderArte(nid)).catch(e => console.error('prévia de estilo:', e.message)).finally(() => previaPend.delete(nid));
  for (const v of all("SELECT id FROM contents WHERE teste=3 ORDER BY id DESC LIMIT -1 OFFSET 150")) { run('DELETE FROM contents WHERE id=?', v.id); cleanRender(v.id); }
  return { id: nid, pronta: false };
}
// catálogo de templates para o Designer escolher pela copy (e os mascotes da marca)
function templatesBloco(c, escolhidoId = '') {
  const fmt = ['feed', 'carrossel', 'stories'].includes(c.format) ? c.format : null; if (!fmt) return '';
  const lcb = String(c.brand || '').toLowerCase(), daMarca = t => (!!c.brand && mesmaMarca(t.brand, c.brand)) || (t.visual_marcas || []).some(m => String(m).toLowerCase() === lcb), L = templatesDaMarca(c.brand).filter(t => t.formatos.includes(fmt)).sort((a, b) => daMarca(b) - daMarca(a)), masc = mascotesDe(c.brand), padrao = estiloPadrao(c.brand, fmt), temaC = temaDoConteudo(c);
  if (!L.length) return '';
  const nomeM = { heroi: 'capa herói', revista: 'capa revista', 'capa-faixa': 'capa com faixas', 'capa-minimal': 'capa minimalista', dividido: 'título partido', texto: 'texto', numero: 'número', lista: 'lista', frase: 'frase', pilulas: 'pílulas', cta: 'chamada final', noticia: 'capa de jornal', 'post-card': 'cartão de notícia' };
  return `\n\n# TEMPLATES DE ARTE (escolha UM pela copy)
Leia o roteiro e escolha o template cujo tema e "quando usar" mais combinam com o conteúdo. Cada marca tem seus estilos (notícia, carrossel educativo, oferta, tutorial…): os marcados com "visual da marca" já foram ajustados pelo dono para esta marca, então prefira-os quando o tema bater. Coloque "template":"id" no JSON e escreva as páginas NA ORDEM da estrutura (o modelo de cada página pode ficar de fora: o painel completa pelo template, inclusive o mascote e o fundo claro). Simples = conteúdo direto e rápido de ler; robusto = capa de impacto e mais mídia.
${escolhidoId && templateDe(escolhidoId) ? `O DONO ESCOLHEU o template "${escolhidoId}" (${templateDe(escolhidoId).nome}) para esta peça: use exatamente "template":"${escolhidoId}".\n` : ''}${temaC ? `O painel leu o roteiro como tema "${TEMAS[temaC]}": ${L.filter(t => t.tema === temaC).map(t => t.id).join(', ') || 'nenhum estilo deste tema neste formato'}.\n` : ''}${padrao ? `Estilo padrão desta marca: ${padrao}.\n` : ''}${L.map(t => `- ${t.id} — ${t.nome}${daMarca(t) ? ' [visual da marca]' : ''} · tema ${TEMAS[t.tema] || 'Geral'} (${t.nivel}). Quando usar: ${t.uso || 'livre'}. Estrutura: ${t.seq.map(x => (nomeM[x.modelo] || x.modelo) + (x.mascote ? ' + mascote' : '') + (x.foto ? ' + foto' : '') + (x.fundo === 'claro' ? ' (claro)' : '') + (x.repetir ? ' (repete)' : '')).join(' → ')}`).join('\n')}
${masc.length ? `Mascote(s) da marca no catálogo: ${masc.join(', ')}. Use pelo nome exato em "objeto"; para uma pose nova escreva "nome (pose: descrição em inglês)".` : 'A marca não tem mascote cadastrado: nas páginas com mascote use um objeto 3D do tema em "objeto" (em inglês) ou deixe sem.'}`;
}
const estruturaEstilo = (format, pags, b = {}, brand = '') => estruturaTemplate(b.template ? templateDe(b.template) : templatePadrao(format), format, pags, b, brand);
// Template feito pelo dono a partir de uma arte: guarda a sequência de modelos e o que cada página usa (mascote, foto, fundo)
function templateDaArte(sp) {
  return (sp.slides || []).filter(s => s.modelo).map((s, i, L) => { const d = s.dados || {}, o = { modelo: s.modelo };
    if (i === 0) o.papel = 'capa'; else if (i === L.length - 1 && ehFim(s.modelo)) o.papel = 'fim'; else if (['lista', 'pilulas'].includes(s.modelo) && i === L.length - 2) o.papel = 'resumo'; else o.repetir = true;
    if (d.objeto) o.mascote = true; if (d.foto && i > 0) o.foto = true; if (d.fundo === 'claro') o.fundo = 'claro'; return o; });
}
// Sem imagem por IA (sem chave, desligada ou falhou): refaz a página do modelo sem a foto/objeto pedidos, para não sobrar buraco
function modeloSemImagem(s, format, brand, i, n, tudo = false) {
  const d = { ...(s.dados || {}) }; let mud = false;
  for (const k of ['foto', 'objeto', 'particulas']) {
    const v = d[k]; if (!v || (typeof v === 'object' && v.asset) || (typeof v === 'string' && /^[a-z0-9-]{2,60}$/.test(v) && v.includes('-'))) continue;
    const ps = typeof v === 'string' && v.match(/^\s*([a-z0-9-]{2,80})\s*\(pose:/); if (ps) { d[k] = ps[1]; mud = true; continue; }   // sem gerar pose: usa o mascote como está
    const banco = typeof v === 'string' ? /^\s*banco\s*:/i.test(v) : !!v.banco, cartao = k === 'foto' && ['texto', 'numero'].includes(s.modelo);
    if (banco && !tudo && (cartao || falKey())) continue;   // foto de banco: só precisa do fal.ai para recortar
    delete d[k]; mud = true;
  }
  if (!mud) return null;
  const modelo = s.modelo === 'capa-faixa' && !d.foto && !d.objeto ? 'capa-minimal' : s.modelo;   // a capa com faixas depende da foto: sem ela o título vai inteiro para a capa minimalista
  const sl = comporSlide({ modelo, dados: d }, { ...ctxMarca(brand, format, {}), i, total: n });
  return sl ? sanitizeArteSpec({ slides: [sl] }, 'carrossel').slides[0] : null;
}
// Confere o formato pelo roteiro aprovado antes da arte: roteiro com vários slides numa peça "feed" vira carrossel (e o contrário)
function formatoPeloRoteiro(c) {
  if (!['feed', 'carrossel'].includes(c.format) || c.teste) return null;
  const sc = String(c.script || ''), nums = new Set([...sc.matchAll(/\b(?:slide|página|pagina|tela)\s*(\d{1,2})\b/gi)].map(m => +m[1]));
  const multi = nums.size >= 2 || /carrossel\s+(?:de|com)\s+\d{1,2}\s+(?:slides|páginas)/i.test(sc);
  if (c.format === 'feed' && multi) return 'carrossel';
  if (c.format === 'carrossel' && !multi && /\b(post único|imagem única|uma imagem só)\b/i.test(sc)) return 'feed';
  return null;
}
function extractArteSpec(text, format, c = null) {
  let found = null, raw = '';
  for (const m of String(text || '').matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)) {
    try { const j = JSON.parse(m[1]); if (j && Array.isArray(j.slides)) { found = j; raw = m[0]; } } catch {}
  }
  if (!found) { const i = String(text || '').lastIndexOf('```json'); if (i >= 0) { const seg = text.slice(i); try { const j = extractJson(seg.replace(/^```json/, ''), '{'); if (j && Array.isArray(j.slides)) { found = j; raw = seg; } } catch {} } }
  if (!found) return null;
  if (format === 'feed' && Array.isArray(found.slides) && found.slides.length > 1) format = 'carrossel';   // o Designer entregou várias páginas: é carrossel, nada é cortado
  if (c && !found.template && !found.estilo) { try { const e = escolheEstilo(c, format); if (e) found.estilo = e; } catch (e) { console.error('estilo da arte:', e.message); } }   // o Designer não escolheu: vale o estilo salvo que combina com o tema (ou o padrão da marca)
  compoeModelos(found, format, c?.brand || '', c);
  const spec = sanitizeArteSpec(found, format, true);
  // arte sem conteúdo (nenhum texto, nenhuma imagem além da logo) nunca é "ok": volta como inválida para o painel montar pelo roteiro
  const vazia = sl => !(sl.texts || []).length && !(sl.shapes || []).length && !(sl.items || []).some(x => !x.moldura);
  if (spec && Array.isArray(spec.slides) && spec.slides.length && spec.slides.every(vazia)) { console.error('arte sem conteúdo: o JSON do Designer perdeu os textos'); return null; }
  return spec ? { spec, raw, format } : null;
}
// Campos do estilo pro (fontes de título, faixas, contorno, brilho, ícones, efeitos de luz, tratamento de cor): só valores conhecidos
const FONTES_OK = ['anton', 'bebas', 'impact', 'impactx', 'oswald', 'archivo', 'montserrat', 'poppins', 'inter', 'sora', 'tech', 'dmsans', 'grotesk', 'outfit', 'jakarta', 'rubik', 'raleway', 'nunito', 'roboto', 'spartan', 'manrope', 'barlow', 'bigshoulders', 'staatliches', 'bungee', 'passion', 'playfair', 'lora', 'merriweather', 'dmserif', 'abril', 'cormorant', 'pacifico', 'dancing', 'caveat', 'marker', 'lobster', 'bangers', 'syne', 'unbounded', 'righteous', 'jetbrains', 'spacemono'];
function gradeOk(g, hex, num) { if (!g) return undefined; if (g === 'mono' || g?.mono) return 'mono'; const c = hex(g?.color); return c ? { color: c, amount: num(g.amount, 0, 1, .8) } : undefined; }
const fadeOk = (v, num) => { const L = (Array.isArray(v) ? v : v ? [v] : []).slice(0, 3).filter(x => x && typeof x === 'object').map(x => ({ dir: ['left', 'right', 'bottom', 'top'].includes(x.dir) ? x.dir : 'bottom', a: num(x.a, 0, 1, .85), ext: num(x.ext, .1, 1, .55) })); return L.length ? L : undefined; };
const zOk = v => v == null || v === '' || !Number.isFinite(+v) ? undefined : Math.max(1, Math.min(20000, Math.round(+v)));
function gradOk(g, hex, num) {
  if (!g || typeof g !== 'object') return undefined;
  const cores = (Array.isArray(g.cores) ? g.cores : []).map(hex).filter(Boolean).slice(0, 4); if (cores.length < 2) return undefined;
  return { tipo: g.tipo === 'radial' ? 'radial' : 'linear', cores, ang: g.ang == null ? undefined : num(g.ang, 0, 360, 160), x: g.x == null ? undefined : num(g.x, -50, 150, 50), y: g.y == null ? undefined : num(g.y, -50, 150, 30), r: g.r == null ? undefined : num(g.r, 20, 300, 120) };
}
function fxOk(f, hex, num) {
  if (!f || typeof f !== 'object') return undefined;
  const o = { grain: f.grain ? num(f.grain, 0, 1, 0) : undefined, vignette: f.vignette ? num(f.vignette, 0, 1, 0) : undefined, tint: hex(f.tint?.color) ? { color: hex(f.tint.color), amount: num(f.tint.amount, 0, 1, .4) } : undefined,
    fade: fadeOk(f.fade, num), fadeFront: fadeOk(f.fadeFront, num),
    textura: Array.isArray(f.textura) && f.textura.length ? f.textura.slice(0, 3).map(x => x && typeof x === 'object' ? limpaUndef({ tipo: ['papel', 'concreto', 'grao', 'grade', 'pontos', 'riscos', 'fumaca'].includes(x.tipo) ? x.tipo : undefined, asset: x.asset ? String(x.asset).replace(/[<>"']/g, '').slice(0, 80) : undefined, op: num(x.op, 0, 1, .5), cor: hex(x.cor), blend: ['overlay', 'multiply', 'screen', 'soft-light', 'normal'].includes(x.blend) ? x.blend : undefined }) : null).filter(x => x && (x.tipo || x.asset)) : undefined,
    glows: Array.isArray(f.glows) ? f.glows.slice(0, 6).map(g => ({ x: num(g.x, -1, 2, .5), y: num(g.y, -1, 2, .5), r: num(g.r, .05, 2, .4), color: hex(g.color), opacity: num(g.opacity, 0, 1, .55) })) : undefined };
  if (o.glows && !o.glows.length) o.glows = undefined;
  return Object.values(o).some(v => v !== undefined) ? o : undefined;
}
function textoPro(t, hex, num, pick) {
  const o = { grp: grpId(t.grp), curva: t.curva ? num(t.curva, -100, 100, 0) : undefined, deco: pick(t.deco, ['sublinhado', 'riscado'], undefined), font: pick(t.font, FONTES_OK, undefined), upper: t.upper ? true : undefined, caixa: pick(t.caixa, ['alta', 'baixa', 'frase', 'titulo', 'normal'], undefined), italic: t.italic ? true : undefined, outline: t.outline ? true : undefined, ls: t.ls == null || t.ls === '' ? undefined : num(t.ls, -.1, 1, 0), lh: t.lh ? num(t.lh, .7, 2.2, 1) : undefined,
    stroke: hex(t.stroke), stroke_w: t.stroke_w ? num(t.stroke_w, 1, 40, 2) : undefined, glow: hex(t.glow), shadow: t.shadow === false ? false : undefined, band: hex(t.band), band2: hex(t.band2), band_color: hex(t.band_color),
    icon: pick(t.icon, ICONES_TODOS, undefined), icon_bg: hex(t.icon_bg), icon_color: hex(t.icon_color), shape: pick(t.shape, ['pill', 'box', 'reto', 'outline'], undefined), bg2: hex(t.bg2),
    arrow: t.arrow === true ? true : pick(t.arrow, ICONES_TODOS, undefined), arrow_bg: hex(t.arrow_bg), arrow_color: hex(t.arrow_color) };
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
function formaPro(sh, hex, num, pick) {
  const o = { grp: grpId(sh.grp), color2: hex(sh.color2), grad: sh.grad == null || sh.grad === '' ? undefined : num(sh.grad, -360, 360, 135), stroke: hex(sh.stroke), stroke_w: sh.stroke_w ? num(sh.stroke_w, .001, .05, .006) : undefined, glass: sh.glass ? true : undefined, dash: pick(sh.dash, ['tracejada', 'pontilhada'], undefined), blur: sh.blur ? num(sh.blur, 0, 200, 0) : undefined, glow: hex(sh.glow), front: sh.front ? true : undefined, cruza: sh.cruza ? true : undefined,
    icon: pick(sh.icon, ICONES_TODOS, undefined), icon_color: hex(sh.icon_color), points: sh.points ? Math.round(num(sh.points, 4, 32, 12)) : undefined, inner: sh.inner ? num(sh.inner, .3, .95, .78) : undefined };
  for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k];
  return o;
}
const grpId = v => typeof v === 'string' && /^[a-z0-9]{1,12}$/i.test(v) ? v : undefined;
function filtroOk(f, num) {
  if (!f || typeof f !== 'object') return undefined;
  const o = { br: f.br == null ? undefined : num(f.br, 0, 2.5, 1), co: f.co == null ? undefined : num(f.co, 0, 2.5, 1), sa: f.sa == null ? undefined : num(f.sa, 0, 3, 1), hue: f.hue ? num(f.hue, -180, 180, 0) : undefined, gray: f.gray ? num(f.gray, 0, 1, 0) : undefined, sepia: f.sepia ? num(f.sepia, 0, 1, 0) : undefined };
  for (const k of Object.keys(o)) if (o[k] === undefined || (['br', 'co', 'sa'].includes(k) && o[k] === 1) || (!['br', 'co', 'sa'].includes(k) && !o[k])) delete o[k];
  return Object.keys(o).length ? o : undefined;
}
const flags = (o, ks) => Object.fromEntries(ks.filter(k => o?.[k] === true).map(k => [k, true]));
const limpaUndef = o => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };
// dados do modelo (o que o Designer escreveu para a página): só textos curtos, lista de itens e a foto/objeto pedidos
function dadosOk(d) {
  if (!d || typeof d !== 'object') return {};
  const t = (v, n = 400) => v == null || v === '' ? undefined : String(v).replace(/[<>]/g, '').slice(0, n), out = {};
  for (const k of ['kicker', 'titulo', 'apoio', 'cta', 'texto', 'numero', 'fantasma', 'icone', 'fundo', 'tratamento', 'particulas', 'ambiente']) { const v = t(d[k]); if (v) out[k] = v; }
  if (d.contraste) out.contraste = true;
  for (const k of ['caixa_titulo', 'caixa_rotulo', 'caixa_botao']) if (['alta', 'baixa', 'frase', 'titulo', 'normal'].includes(d[k])) out[k] = d[k];
  if (d.recorte === false) out.recorte = false;
  for (const k of ['foto', 'objeto']) { const v = d[k]; if (typeof v === 'string' && v.trim()) out[k] = t(v, 500); else if (v && typeof v === 'object' && (v.asset || v.gen)) out[k] = v.asset ? { asset: t(v.asset, 80) } : { gen: t(v.gen, 500) }; }
  if (Array.isArray(d.itens)) out.itens = d.itens.slice(0, 6).map(x => typeof x === 'string' ? t(x, 200) : x && typeof x === 'object' ? limpaUndef({ t: t(x.t || x.titulo, 120), d: t(x.d || x.texto, 220) }) : null).filter(x => x && (typeof x === 'string' || x.t));
  else if (typeof d.itens === 'string') out.itens = t(d.itens, 800);
  if (d.brilho === false) out.brilho = false;
  return out;
}
// Limpa e limita a especificação (vinda do Designer ou do editor visual): só campos conhecidos, números dentro de faixa, sem HTML
function sanitizeArteSpec(found, format, doAgente = false) {
  const hex = v => /^#[0-9a-fA-F]{3,8}$/.test(String(v || '')) ? String(v) : undefined;
  const num = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : d; };
  const txt = (v, n) => String(v ?? '').replace(/[<>]/g, '').slice(0, n);
  const pick = (v, list, d) => list.includes(v) ? v : d;
  const slides = (Array.isArray(found?.slides) ? found.slides : []).slice(0, ART_MAX[format] || 10).map(s => ({
    bg: { gen: txt(s.bg?.gen, 600) || undefined, banco: txt(s.bg?.banco, 120) || undefined, asset: txt(s.bg?.asset, 80) || undefined, color: hex(s.bg?.color), color2: hex(s.bg?.color2), grad: gradOk(s.bg?.grad, hex, num), grade: gradeOk(s.bg?.grade, hex, num), fil: filtroOk(s.bg?.fil, num), blur: s.bg?.blur ? num(s.bg.blur, 0, 40, 0) : undefined, pos: pick(s.bg?.pos, ['esquerda', 'direita', 'topo', 'base', 'centro'], undefined), zoom: s.bg?.zoom ? num(s.bg.zoom, 1, 2.5, 1) : undefined },
    modelo: MODELO_IDS.includes(s.modelo) ? s.modelo : undefined, dados: MODELO_IDS.includes(s.modelo) ? dadosOk(s.dados) : undefined,
    shade: s.shade == null ? undefined : num(s.shade, 0, .92, .5), shade_dir: pick(s.shade_dir, ['bottom', 'top', 'full', 'left', 'right'], 'bottom'), fx: fxOk(s.fx, hex, num), pager: s.pager !== false,
    texts: (Array.isArray(s.texts) ? s.texts : []).slice(0, 30).map(t => ({ z: zOk(t.z), value: txt(t.value, 600), role: pick(t.role, ['badge', 'title', 'body', 'number', 'cta', 'label', 'footer'], 'title'), x: num(t.x, -4, 5, .5), y: num(t.y, -4, 5, .5), align: pick(t.align, ['left', 'center', 'right'], 'center'), size: t.size == null ? undefined : num(t.size, 8, 3000, undefined), color: hex(t.color), bg: hex(t.bg), weight: t.weight == null ? undefined : num(t.weight, 100, 900, undefined), w: t.w == null ? undefined : num(t.w, .05, 4, undefined), rot: t.rot ? num(t.rot, -360, 360, 0) : undefined, opacity: t.opacity == null || t.opacity >= 1 ? undefined : num(t.opacity, 0, 1, 1), ...textoPro(t, hex, num, pick), ...flags(t, ['nowrap', 'reflow', 'icon_end', 'decor', 'front', 'mexido', 'hide', 'lock']), hl: hex(t.hl), sh_color: hex(t.sh_color), hw: t.hw ? num(t.hw, 300, 900, undefined) : undefined })).map(limpaUndef).filter(t => t.value),
    items: (Array.isArray(s.items) ? s.items : []).slice(0, 30).map(it => ({ z: zOk(it.z), asset: txt(it.asset, 80), pose: txt(it.pose, 240) || undefined, x: num(it.x, -4, 5, .5), y: num(it.y, -4, 5, .5), size: num(it.size, 8, 30000, 200), rot: num(it.rot, -360, 360, 0), round: !!it.round, flip: it.flip ? true : undefined, opacity: it.opacity == null || it.opacity >= 1 ? undefined : num(it.opacity, 0, 1, 1), gen: txt(it.gen, 500) || undefined, banco: txt(it.banco, 120) || undefined, front: it.front ? true : undefined, cruza: it.cruza ? true : undefined, shadow: it.shadow ? num(it.shadow, 0, 3, 1) : undefined, blur: it.blur ? num(it.blur, 0, 60, 0) : undefined, glow: hex(it.glow), grade: gradeOk(it.grade, hex, num), grp: grpId(it.grp), fil: filtroOk(it.fil, num), ...flags(it, ['hero', 'copia', 'moldura', 'pessoa', 'particula', 'card', 'fotoCard', 'hide', 'lock']), forma: pick(it.forma, ['arredondado', 'losango', 'hexagono', 'estrela', 'arco', 'triangulo'], undefined), h: it.h ? num(it.h, .02, 2, .3) : undefined, radius: it.radius ? num(it.radius, 0, .5, 0) : undefined })).map(limpaUndef).filter(it => it.asset || ((it.gen || it.banco) && it.hero)),
    shapes: (Array.isArray(s.shapes) ? s.shapes : []).slice(0, 30).map(sh => ({ z: zOk(sh.z), kind: pick(sh.kind, ['rect', 'circle', 'line', 'pill', 'ring', 'star', 'icon', 'triangle', 'diamond', 'hexagon', 'arrow', 'pentagon', 'octagon', 'chevron', 'cross', 'parallelogram', 'trapezoid', 'bubble', 'ribbon', 'etiqueta'], 'rect'), x: num(sh.x, -4, 5, .5), y: num(sh.y, -4, 5, .5), w: num(sh.w, .005, 30, .3), h: num(sh.h, .0005, 30, .2), rot: num(sh.rot, -360, 360, 0), color: hex(sh.color), opacity: num(sh.opacity, 0, 1, 1), radius: num(sh.radius, 0, .5, 0), ...formaPro(sh, hex, num, pick), ...flags(sh, ['tile', 'moldura', 'behind', 'decor', 'hide', 'lock']) })).map(limpaUndef)
  }));
  if (!slides.length) return null;
  if (doAgente) for (const sl of slides) for (const t of sl.modelo ? [] : sl.texts) {   // o agente às vezes manda o centro do bloco com alinhamento à esquerda/direita: converte para a margem
    const w = t.w ?? ({ title: .86, body: .82, badge: .7, number: .86, cta: .7 }[t.role] || .82);
    if (t.align === 'left' && t.x > .3 && !['cta', 'badge'].includes(t.role)) t.x = Math.max(.06, Math.round((t.x - w / 2) * 1000) / 1000);
    else if (t.align === 'right' && t.x < .7 && !['cta', 'badge'].includes(t.role)) t.x = Math.min(.94, Math.round((t.x + w / 2) * 1000) / 1000);
  }
  if (doAgente) for (const sl of slides.filter(x => !x.modelo)) for (const al of ['left', 'right']) {   // blocos do mesmo lado ficam na mesma margem (sem "degrau" de poucos pixels)
    const L = sl.texts.filter(t => t.align === al && !['cta', 'badge'].includes(t.role)); if (L.length < 2) continue;
    const ref = al === 'left' ? Math.min(...L.map(t => t.x)) : Math.max(...L.map(t => t.x)); for (const t of L) if (Math.abs(t.x - ref) < .05) t.x = ref;
  }
  const mold = found.moldura && typeof found.moldura === 'object' ? limpaUndef({ logo: pick(found.moldura.logo, ['topo-centro', 'topo-esq', 'rodape-esq', 'rodape-centro', 'nenhum'], undefined), arraste: found.moldura.arraste === 'texto' ? 'texto' : undefined, ig: typeof found.moldura.ig === 'boolean' ? found.moldura.ig : undefined }) : undefined;
  const cont = found.contatos && typeof found.contatos === 'object' ? limpaUndef(Object.fromEntries(['whatsapp', 'instagram', 'site', 'local'].map(k => [k, found.contatos[k] ? txt(found.contatos[k], 40) : undefined]))) : undefined;
  return { moldura: mold && Object.keys(mold).length ? mold : undefined, contatos: cont && Object.keys(cont).length ? cont : undefined, accent: hex(found.accent), ink: hex(found.ink), paper: hex(found.paper), font_asset: txt(found.font_asset, 80) || undefined, editada: found.editada ? true : undefined, pano: found.pano && (found.pano.gen || found.pano.asset) && slides.length > 1 ? { gen: txt(found.pano.gen, 600) || undefined, asset: txt(found.pano.asset, 80) || undefined, grade: gradeOk(found.pano.grade, hex, num) } : undefined, slides };
}
// ───────────────────────── Estilo de arte da marca (aba Identidade, em Conhecimento) ─────────────────────────
// Cores, fontes, logo e fundos ficam na Identidade e nos Arquivos da marca (uma fonte só da verdade: identidadeDe()). Este perfil guarda o
// que a Identidade não cobre: composição, estilo visual, construção do prompt de fundo por IA (estilo, luz, lente, textura, negativo, seed),
// mascote e o que evitar. Um perfil por marca ('' = geral, vale para todas). O Designer recebe o perfil em todo pedido de arte e o motor
// aplica os parâmetros de imagem sozinho. O aprendizado chega como PROPOSTA (artes aprovadas, referências ou o Cérebro) e só vale com o seu OK.
db.exec(`CREATE TABLE IF NOT EXISTS art_styles(brand TEXT PRIMARY KEY, params TEXT NOT NULL DEFAULT '{}', proposta TEXT DEFAULT '', hist TEXT DEFAULT '[]', updated_at TEXT NOT NULL)`);
const STYLE_SCHEMA = `{
 "composicao": {"alinhamento":"esquerda|centro|direita","margens":"estreitas|medias|amplas","densidade_texto":"baixa|media|alta","hierarquia":"como organizar badge, título, corpo e CTA"},
 "estilo_visual": "estilo geral (ex.: flat editorial, 3D suave, fotográfico, neon)",
 "fundo_ia": {"prompt_base":"trecho fixo no começo de todo prompt de fundo","estilo":"estilo da imagem","iluminacao":"luz","lente":"câmera, lente, ângulo","textura":"textura e material","paleta_prompt":"cores em palavras","negativo":"o que nunca aparece","seed":123},
 "mascote": {"uso":"quando e como usar","posicao":"onde fica","tamanho":"proporção"},
 "evitar": ["erros de estilo a nunca repetir"]
}`;
const PROMPT_IMAGEM_GUIA = `# CONSTRUÇÃO DO PROMPT DE IMAGEM (campo "gen" dos fundos por IA)
Monte cada prompt nesta ordem, em inglês, com 25 a 60 palavras: 1) sujeito ou cena central, 2) ambiente, 3) composição (enquadramento e uma área calma onde o texto vai entrar), 4) iluminação (direção, dureza, cor), 5) câmera e lente (ângulo, profundidade de campo), 6) paleta em palavras (no máximo 3 cores), 7) textura ou material, 8) estilo (flat, 3D, fotográfico...). Objetos concretos, sem texto, letras, números nem logos na imagem. Em um carrossel mantenha o MESMO estilo, paleta e luz em todos os slides, mudando só a cena. Se o estilo da marca define parâmetros de fundo, o painel os acrescenta ao prompt sozinho: não os repita.`;
const sx = (v, n = 200) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : undefined;
const hx = v => /^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim().toLowerCase() : undefined;
const enm = (v, l) => l.includes(v) ? v : undefined;
function cleanStyle(p) {
  p = p && typeof p === 'object' ? p : {}; const o = {};
  const put = (g, k, v) => { if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) (o[g] ||= {})[k] = v; };
  const co = p.composicao || {}; put('composicao', 'alinhamento', enm(co.alinhamento, ['esquerda', 'centro', 'direita'])); put('composicao', 'margens', enm(co.margens, ['estreitas', 'medias', 'amplas'])); put('composicao', 'densidade_texto', enm(co.densidade_texto, ['baixa', 'media', 'alta'])); put('composicao', 'hierarquia', sx(co.hierarquia, 300));
  if (sx(p.estilo_visual, 400)) o.estilo_visual = sx(p.estilo_visual, 400);
  const tp = p.tipografia || {}; put('tipografia', 'caixa_titulo', enm(tp.caixa_titulo, ['alta', 'normal', 'baixa', 'frase', 'titulo'])); put('tipografia', 'caixa_botao', enm(tp.caixa_botao, ['alta', 'normal', 'baixa', 'frase', 'titulo'])); put('tipografia', 'caixa_rotulo', enm(tp.caixa_rotulo, ['alta', 'normal', 'baixa', 'frase', 'titulo']));
  const f = p.fundo_ia || {}; for (const k of ['prompt_base', 'estilo', 'iluminacao', 'lente', 'textura', 'paleta_prompt', 'negativo']) put('fundo_ia', k, sx(f[k], 200)); if (f.seed !== undefined && f.seed !== '' && Number.isFinite(+f.seed)) put('fundo_ia', 'seed', Math.max(0, Math.min(2147483647, Math.floor(+f.seed))));
  const m = p.mascote || {}; put('mascote', 'uso', sx(m.uso, 300)); put('mascote', 'posicao', sx(m.posicao, 120)); put('mascote', 'tamanho', sx(m.tamanho, 120));
  if (Array.isArray(p.evitar)) { const ev = p.evitar.map(x => sx(x, 200)).filter(Boolean).slice(0, 12); if (ev.length) o.evitar = ev; }
  if (Array.isArray(p.referencias)) { const rf = p.referencias.map(x => +x).filter(x => Number.isInteger(x) && x > 0).slice(0, 8); if (rf.length) o.referencias = rf; }
  return o;
}
function mergeStyle(a, b) {
  const o = JSON.parse(JSON.stringify(a || {}));
  for (const [g, v] of Object.entries(b || {})) o[g] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(o[g] || {}), ...v } : v;
  return o;
}
function styleDiff(a, b) {
  const out = [], flat = (x, pre = '') => Object.entries(x || {}).flatMap(([k, v]) => v && typeof v === 'object' && !Array.isArray(v) ? flat(v, pre + k + '.') : [[pre + k, Array.isArray(v) ? v.join(', ') : String(v)]]);
  const A = Object.fromEntries(flat(a)), B = Object.fromEntries(flat(b));
  for (const k of Object.keys(B)) if (A[k] !== B[k]) out.push({ campo: k, de: A[k] ?? '', para: B[k] });
  return out;
}
// Identidade da marca lida da Base de conhecimento (cores, fundo padrão, fontes) + arquivo de fonte cadastrado: é o que o motor de arte usa
const lumHex = h => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
function identidadeDe(brand) {
  const out = {}; if (!brand) return out;
  const row = one("SELECT content FROM knowledge WHERE brand=? COLLATE NOCASE AND category='marca' AND content LIKE '# IDENTIDADE VISUAL%' LIMIT 1", brand);
  const f = { cores: [], apoio: [] }; let g = '';
  for (const ln of String(row?.content || '').split('\n')) {
    if (ln.startsWith('## ')) { g = ln.slice(3).trim(); continue; }
    const m = ln.match(/^([^:#]{1,40}):\s*(.*)$/); if (!m) continue; const k = m[1].trim(), v = m[2], hexes = (v.match(/#[0-9a-fA-F]{6}\b/g) || []).map(x => x.toLowerCase());
    if (g === 'CORES') { if (k === 'Principais') f.cores = hexes; else if (k === 'Apoio/neutras') f.apoio = hexes; else if (k === 'Destaque') f.destaque = hexes[0]; else if (k === 'Fundo padrão') f.fundo = v; }
    else if (g === 'TIPOGRAFIA') { if (k === 'Título') f.ftit = v; else if (k === 'Texto') f.ftxt = v; }
  }
  const pool = [...f.cores, ...f.apoio].filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => lumHex(a) - lumHex(b));
  out.accent = f.destaque || f.cores[0];
  const dark = pool[0], light = pool[pool.length - 1], modo = /escur|dark|preto/i.test(f.fundo || '') ? 'escuro' : /clar|branc|light/i.test(f.fundo || '') ? 'claro' : '';
  const dk = [...f.cores].sort((a, b) => lumHex(a) - lumHex(b))[0];   // fundo escuro: prefere a cor da marca (ex.: azul noite) a um cinza neutro
  if (modo === 'escuro') { out.paper = dk && lumHex(dk) < .22 ? dk : dark && lumHex(dark) < .22 ? dark : '#0b0b0f'; out.ink = light && lumHex(light) > .6 ? light : '#ffffff'; }
  else if (modo === 'claro') { out.paper = light && lumHex(light) > .7 ? light : '#f8fafc'; out.ink = dark && lumHex(dark) < .25 ? dark : '#0b1220'; }
  const fonts = all("SELECT id,name FROM assets WHERE kind='fonte' AND brand=? COLLATE NOCASE AND ext IN ('ttf','otf','woff','woff2') ORDER BY id", brand);
  if (fonts.length) { const words = slugName(f.ftit || '').split('-').filter(w => w.length > 2); out.fontAsset = (fonts.find(a => words.some(w => a.name.includes(w))) || fonts[0]).name; }
  if (out.fontAsset) out.fontAssetId = fonts.find(a => a.name === out.fontAsset)?.id;
  out.ftit = f.ftit; out.ftxt = f.ftxt; out.cores = f.cores; out.apoio = f.apoio; out.fundo = f.fundo; return out;
}
const styleRow = brand => one('SELECT * FROM art_styles WHERE brand=? COLLATE NOCASE', brand || '');
const styleOwn = brand => { try { return JSON.parse(styleRow(brand)?.params || '{}'); } catch { return {}; } };
const styleParams = brand => mergeStyle(styleOwn(''), brand ? styleOwn(brand) : {});   // o perfil da marca por cima do geral
function styleSave(brand, params, patch = {}) {
  const row = styleRow(brand), hist = (() => { try { return JSON.parse(row?.hist || '[]'); } catch { return []; } })();
  if (patch.hist) hist.unshift({ ts: T(), ...patch.hist }); hist.length = Math.min(hist.length, 20);
  const prop = 'proposta' in patch ? patch.proposta : (row?.proposta || '');
  run('INSERT INTO art_styles(brand,params,proposta,hist,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(brand) DO UPDATE SET params=excluded.params, proposta=excluded.proposta, hist=excluded.hist, updated_at=excluded.updated_at', brand || '', JSON.stringify(params), prop, JSON.stringify(hist), T());
  changed();
}
// Sugestão de mudança (vem das artes aprovadas, de referências ou do Cérebro): só vale quando você aplica
function styleProposal(brand, parcial, evidencia, origem, resumo) {
  const cur = styleOwn(brand), novo = mergeStyle(cur, cleanStyle(parcial)), diff = styleDiff(cur, novo); if (!diff.length) return 0;
  styleSave(brand, cur, { proposta: JSON.stringify({ params: novo, diff, evidencia: sx(evidencia, 600) || '', origem, resumo: sx(resumo, 300) || '', ts: T() }) });
  return diff.length;
}
function estiloTexto(brand) {
  const st = styleParams(brand), L = [], j = (o, ks) => ks.map(k => o?.[k] ? `${k.replace('_', ' ')}: ${Array.isArray(o[k]) ? o[k].join(', ') : o[k]}` : '').filter(Boolean).join(' · ');
  const iv = identidadeDe(brand);
  if (iv.accent || iv.ink || iv.paper || iv.fontAsset) L.push('Cores e fonte que o painel aplica na arte (vêm da Identidade da marca) · ' + [iv.accent && 'acento ' + iv.accent, iv.ink && 'texto ' + iv.ink, iv.paper && 'fundo ' + iv.paper, iv.fontAsset && 'fonte ' + iv.fontAsset].filter(Boolean).join(' · '));
  if (st.composicao) L.push('Composição · ' + j(st.composicao, ['alinhamento', 'margens', 'densidade_texto', 'hierarquia']));
  if (st.estilo_visual) L.push('Estilo visual · ' + st.estilo_visual);
  if (st.fundo_ia) L.push('Fundos por IA (o painel acrescenta estes parâmetros ao seu prompt) · ' + j(st.fundo_ia, ['prompt_base', 'estilo', 'iluminacao', 'lente', 'textura', 'paleta_prompt', 'negativo']));
  if (st.mascote) L.push('Mascote · ' + j(st.mascote, ['uso', 'posicao', 'tamanho']));
  if (st.evitar?.length) L.push('Evitar no estilo · ' + st.evitar.join('; '));
  return L.length ? `# ESTILO DE ARTE DA MARCA${brand ? ' ' + brand : ''} (definido pelo dono e aprendido com as artes aprovadas: siga à risca)\n${L.map(x => '- ' + x).join('\n')}\n\n` : '';
}
// Parâmetros de imagem aplicados ao prompt de fundo (o Designer escreve a cena; o estilo da marca completa)
function composeFundo(prompt, brand) {
  const f = styleParams(brand).fundo_ia || {};
  return { prompt: [f.prompt_base, prompt, f.estilo, f.iluminacao, f.lente, f.textura, f.paleta_prompt].filter(Boolean).join(', ') + (f.negativo ? `, without ${f.negativo}` : ''), seed: f.seed };
}
// O que a arte tinha quando foi aprovada ou devolvida: matéria-prima do aprendizado de estilo
function artSnapshot(c) {
  try {
    const sp = JSON.parse(c.art_spec || '{}'), sl = sp.slides || []; if (!sl.length) return '';
    return `Parâmetros da arte: acento ${sp.accent || '-'}, tinta ${sp.ink || '-'}, papel ${sp.paper || '-'}; ${sl.length} slide(s); fundos por IA: ${sl.filter(x => x.bg?.gen).map(x => clip(x.bg.gen, 90)).slice(0, 2).join(' | ') || 'nenhum'}; itens/mascote: ${sl.reduce((a, x) => a + (x.items || []).length, 0)}; textos por slide: ${Math.round(sl.reduce((a, x) => a + (x.texts || []).length, 0) / sl.length * 10) / 10}`;
  } catch { return ''; }
}
function visionImg(file) {
  try {
    const st = fs.statSync(file); if (st.size > 4.5e6) return null;
    const ext = path.extname(file).slice(1).toLowerCase(), type = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext]; if (!type) return null;
    return { data: fs.readFileSync(file).toString('base64'), type };
  } catch { return null; }
}

// Qualidade das imagens por IA (Configurações): rápida = flux schnell (barata, simples); alta = flux pro 1.1 (fotografia de agência);
// máxima = flux pro 1.1 ultra (até 4 MP, nível campanha). FAL_IMG_MODEL no .env ainda vence quando a opção está em "do .env".
const IMG_QUALIDADE = { rapida: ['fal-ai/flux/schnell', 0.003], alta: ['fal-ai/flux-pro/v1.1', 0.04], maxima: ['fal-ai/flux-pro/v1.1-ultra', 0.06] };
function falModeloImg() { const q = settings().img_qualidade || 'alta'; return q === 'env' ? (process.env.FAL_IMG_MODEL || 'fal-ai/flux/schnell') : (IMG_QUALIDADE[q] || IMG_QUALIDADE.alta)[0]; }
function precoImg(model) { if (process.env.FAL_PRECO_FUNDO) return +process.env.FAL_PRECO_FUNDO; const e = Object.values(IMG_QUALIDADE).find(x => x[0] === model); return e ? e[1] : /schnell/.test(model) ? 0.003 : 0.03; }
function aspectoFal(w, h) { const r = w / h, L = [['21:9', 21 / 9], ['16:9', 16 / 9], ['4:3', 4 / 3], ['1:1', 1], ['3:4', 3 / 4], ['9:16', 9 / 16], ['9:21', 9 / 21]]; return L.sort((a, b) => Math.abs(Math.log(a[1] / r)) - Math.abs(Math.log(b[1] / r)))[0][0]; }
// Objeto ou personagem por IA com fundo recortado (PNG transparente): o "herói" das artes de agência (estátua, ampulheta, peça de xadrez, notebook...)
async function falObjeto(desc, brand, fresh, ref = '', pessoa = false) {
  desc = await emIngles(desc, pessoa ? 'pessoa' : 'objeto');
  const f0 = styleParams(brand).fundo_ia || {}, model = falModeloImg();
  const prompt = pessoa ? `${desc}, waist-up portrait, one person only, centered, head fully visible with space above it, body cut at the bottom edge of the frame, isolated on a plain flat light grey studio background, dramatic cinematic lighting, ultra detailed, sharp focus, photorealistic, no text, no letters, no logo, no watermark`
    : `${desc}, single subject, centered, full object visible with margin around it, isolated on a plain flat light grey studio background, ${f0.iluminacao || 'dramatic cinematic rim light'}, ultra detailed, sharp focus, professional product photography, no text, no letters, no logo, no watermark`;
  const cdir = path.join(RENDER_DIR, '_objetos'); fs.mkdirSync(cdir, { recursive: true });
  const cf = path.join(cdir, crypto.createHash('sha1').update(prompt + model).digest('hex').slice(0, 14) + '.png');
  if (!fresh && fs.existsSync(cf)) return cf;
  const j = await falPost(model, { prompt, ...(/ultra/.test(model) ? { aspect_ratio: '1:1' } : { image_size: { width: 1024, height: 1024 } }), ...(/schnell/.test(model) ? { num_inference_steps: 4 } : {}), num_images: 1, ...(/pro/.test(model) ? { safety_tolerance: '5', output_format: 'png' } : {}) });
  const u = j.images?.[0]?.url; if (!u) throw new Error('O modelo de imagem respondeu sem imagem');
  addCost('objeto', model, precoImg(model), ref);
  let png;
  try { const c = await falPost(process.env.FAL_BG_MODEL || 'fal-ai/birefnet/v2', { image_url: u }, 120000); const cu = c.image?.url || c.images?.[0]?.url; if (!cu) throw new Error('sem recorte'); png = await falBaixar(cu); addCost('recorte', 'birefnet', FAL_PRECO.recorte, ref); }
  catch (e) { throw new Error('não consegui recortar o fundo da imagem (' + String(e.message || e).slice(0, 80) + '); sem recorte ela ficaria com cara de colagem'); }
  fs.writeFileSync(cf, png); return cf;
}
// Fundo por IA (fal.ai): guarda em cache por prompt para não pagar duas vezes pela mesma imagem
async function falFundo(prompt, w, h, fresh, ref = '', opt = {}) {
  const key = falKey(); if (!key) throw new Error(falPausado() ? 'fal.ai em standby (Configurações › Vídeo e voz): nada foi cobrado' : 'FAL_KEY não configurada');
  prompt = await emIngles(prompt, opt.uso || (/no people/i.test(prompt) ? 'cena' : 'livre'));
  { const lim = +settings().img_budget_day || 0; if (lim > 0 && gastoImagensHoje() >= lim) throw new Error(`Limite diário de gasto com imagens por IA atingido (US$ ${lim.toFixed(2)}). Aumente em Configurações › Automação.`); }
  const model = falModeloImg();
  const k = Math.sqrt((opt.mp || 1) * 1e6 / (w * h)), gw = Math.max(512, Math.round(w * k / 16) * 16), gh = Math.max(512, Math.round(h * k / 16) * 16);
  const cacheDir = path.join(RENDER_DIR, '_fundos'); fs.mkdirSync(cacheDir, { recursive: true });
  const id = crypto.createHash('sha1').update(prompt + model + gw + 'x' + gh + (opt.seed ?? '')).digest('hex').slice(0, 14);
  const hit = fs.readdirSync(cacheDir).find(f => f.startsWith(id + '.'));
  if (hit && !fresh) return path.join(cacheDir, hit);
  const r = await fetch(`${(process.env.FAL_BASE || 'https://fal.run').replace(/\/$/, '')}/${model}`, {
    method: 'POST', signal: AbortSignal.timeout(150000), headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: `${prompt}, no text, no letters, no numbers, no watermark, no logo`, ...(/ultra/.test(model) ? { aspect_ratio: aspectoFal(w, h) } : { image_size: { width: gw, height: gh } }), ...(/schnell/.test(model) ? { num_inference_steps: 4 } : /flux\/dev/.test(model) ? { num_inference_steps: 28 } : {}), num_images: 1, ...(/pro/.test(model) ? { safety_tolerance: '5', output_format: 'jpeg' } : {}), ...(opt.seed != null ? { seed: +opt.seed } : {}) })
  });
  const t = await r.text(); if (!r.ok) throw new Error(`fal HTTP ${r.status}: ${t.slice(0, 200)}`);
  const url = JSON.parse(t).images?.[0]?.url; if (!url) throw new Error('fal respondeu sem imagem');
  const im = await fetch(url, { signal: AbortSignal.timeout(90000) }); if (!im.ok) throw new Error('Não consegui baixar a imagem gerada');
  const ext = /png/.test(im.headers.get('content-type') || '') ? 'png' : 'jpg', f = path.join(cacheDir, id + '.' + ext);
  if (hit) fs.rmSync(path.join(cacheDir, hit), { force: true });
  fs.writeFileSync(f, Buffer.from(await im.arrayBuffer())); addCost('fundo', model, precoImg(model), ref); return f;
}
function arteFiles(id) {
  try { return fs.readdirSync(ARTE_DIR(id)).filter(f => /^slide-\d+\.png$/.test(f)).sort(); } catch { return []; }
}
function arteInfo(id) {
  const c = getContent(id), st = arteState.get(id);
  const files = arteFiles(id).map((f, i) => ({ n: i + 1, name: f, size: fs.statSync(path.join(ARTE_DIR(id), f)).size, v: Math.round(fs.statSync(path.join(ARTE_DIR(id), f)).mtimeMs) }));
  return { status: st?.status === 'running' || previaPend.has(id) ? 'running' : (c?.art_status || ''), note: c?.art_note || '', files, can_render: !!c?.art_spec, fal: !!falKey() && settings().art_gen === '1', size: ART_SIZE[c?.format] || null, cost_usd: one('SELECT COALESCE(SUM(usd),0) v FROM gen_costs WHERE ref=?', 'c' + id).v };
}
// Composição da marca aplicada de verdade no desenho: margens seguras, alinhamento do texto principal e aviso de densidade
function composicaoAplica(slide, comp, i, warn) {
  if (!comp || !Object.keys(comp).length) return;
  const m = { estreitas: .06, medias: .10, amplas: .14 }[comp.margens], al = { esquerda: 'left', centro: 'center', direita: 'right' }[comp.alinhamento], lim = { baixa: 20, media: 32, alta: 50 }[comp.densidade_texto];
  for (const t of slide.texts || []) {
    const principal = ['title', 'body', 'badge', 'cta'].includes(t.role);
    if (al && principal) { t.align = al; t.x = al === 'left' ? (m ?? .08) : al === 'right' ? 1 - (m ?? .08) : .5; }
    if (m != null) {
      const a = t.align || 'center';
      if (a === 'left') { t.x = Math.max(t.x ?? .5, m); if (t.role !== 'cta' && t.role !== 'badge') t.w = Math.min(t.w ?? .86, 1 - t.x - m); }
      else if (a === 'right') { t.x = Math.min(t.x ?? .5, 1 - m); if (t.role !== 'cta' && t.role !== 'badge') t.w = Math.min(t.w ?? .86, t.x - m); }
      else if (t.role !== 'cta' && t.role !== 'badge') t.w = Math.min(t.w ?? .86, 1 - 2 * m);
    }
  }
  if (lim) { const n = (slide.texts || []).reduce((a, t) => a + String(t.value || '').split(/\s+/).filter(Boolean).length, 0); if (n > lim) warn.push(`Slide ${i + 1}: ${n} palavras, acima do limite da marca (${lim}, densidade ${comp.densidade_texto}). Peça ajuste ao Designer.`); }
}
// ───────────────────────── Checagem automática (arte e vídeo) ─────────────────────────
// ── Inspeção visual: o Revisor olha as imagens REAIS (quadros do vídeo, slides da arte) e aponta o que está errado
const VIS_VIDEO = ['legenda_fora', 'texto_ilegivel', 'imagem_borrada', 'elemento_sem_relacao', 'visual_poluido', 'sobreposicao', 'contraste_baixo', 'emoji_proibido', 'logo_ausente', 'estilo_fora', 'visual_generico', 'visual_outro'];
const VIS_ARTE = ['texto_cortado', 'imagem_borrada', 'tamanho_errado', 'elemento_sem_relacao', 'fundo_ruim', 'composicao', 'sobreposicao', 'contraste_baixo', 'mascote', 'cores_marca', 'fonte_errada', 'texto_demais', 'estilo_fora', 'capa_fraca', 'emoji_proibido', 'visual_outro'];
const visualLigado = () => settings().visual_check !== '0';
function checklistVisual(alvo) {
  const tipos = alvo === 'arte' ? VIS_ARTE : VIS_VIDEO;
  return `Você é um profissional sênior de marketing digital e direção de arte. Olhe cada imagem como o dono olharia ao postar. Procure, nesta ordem:
1. Texto cortado, encostando na borda ou fora da área segura; texto pequeno ou difícil de ler; contraste baixo.
2. Imagem borrada, pixelada, esticada, achatada ou de baixa qualidade; recorte feio; fundo sujo.
3. Elementos sobrepostos, desalinhados, cena poluída ou sem hierarquia (o que deve ser lido primeiro?).
4. Elemento SEM RELAÇÃO com o que está sendo dito (${alvo === 'arte' ? 'o assunto do slide' : 'a fala e o texto da cena'}) ou que contradiz o tema/produto.
5. Emoji (proibido), logo ausente ou mal posicionada, cores ou fontes fora da marca.
6. Qualidade geral: isso venderia? chama atenção? parece profissional ou amador?
Seja rigoroso: se você não colocaria no ar com o seu nome, aponte. Se estiver bom, diga que está bom e não invente defeitos.
Tipos permitidos em "tipo": ${tipos.join(', ')}.`;
}
const FORMATO_VISUAL = `{"nota":0-10,"aprovado":true|false,"resumo":"2 frases sobre a qualidade visual","problemas":[{"${'cena'}":numero da ${'cena/slide'} (0 se for a peça toda),"tipo":"um dos tipos permitidos","gravidade":"alta|media|baixa","o_que":"o que está errado, objetivo","correcao":"o que o agente deve fazer para corrigir"}]}`;
// Quadros reais do vídeo (um por cena), reduzidos para a visão; reaproveita o gerador de prévia do motor
async function quadrosVideo(id, max = 8) {
  const dir = path.join(RENDER_DIR, String(id), 'previa'), busy = () => { const st = renderState.get(id); return st && ['running', 'queued'].includes(st.status); };
  const espera = async () => { const t0 = Date.now(); while (busy() && Date.now() - t0 < 240000) await new Promise(r => setTimeout(r, 700)); };
  await espera();
  fs.rmSync(dir, { recursive: true, force: true }); startRender(id, 'previa'); await espera();
  const st = renderState.get(id), fr = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^f\d+\.png$/.test(f)).sort() : [];
  if (!fr.length) throw new Error('Não consegui gerar os quadros do vídeo' + (st?.status === 'error' ? ': ' + st.step : '') + '.');
  const idx = fr.map((_, i) => i), pick = idx.length <= max ? idx : [...new Set(Array.from({ length: max }, (_, k) => Math.round(k * (idx.length - 1) / (max - 1))))];
  const out = [];
  for (const i of pick) {
    const dst = path.join(dir, 'v' + String(i).padStart(2, '0') + '.jpg');
    try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, fr[i]), '-vf', 'scale=540:-2', '-q:v', '4', dst], { timeout: 30000 }); out.push({ cena: i + 1, file: dst }); } catch { /* quadro ignorado */ }
  }
  if (!out.length) throw new Error('ffmpeg não conseguiu reduzir os quadros do vídeo.');
  return out;
}
function folhaInspecao(quadros, dir) {   // uma imagem só com todos os quadros, para levar ao chat (modo sem API)
  const seq = path.join(dir, 'seq'); fs.rmSync(seq, { recursive: true, force: true }); fs.mkdirSync(seq, { recursive: true });
  quadros.forEach((q, i) => fs.copyFileSync(q.file, path.join(seq, 's' + String(i + 1).padStart(2, '0') + '.jpg')));   // numeração contínua: funciona no ffmpeg do Windows (sem glob)
  const f = path.join(dir, 'inspecao.jpg'), cols = Math.min(4, quadros.length), rows = Math.ceil(quadros.length / cols);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '1', '-i', path.join(seq, 's%02d.jpg'), '-vf', `tile=${cols}x${rows}:padding=8:color=0x222222`, '-frames:v', '1', '-q:v', '3', f], { timeout: 60000 });
  fs.rmSync(seq, { recursive: true, force: true });
  return f;
}
function cenasResumo(c) {
  let sp = {}; try { sp = JSON.parse(c.spec || '{}'); } catch { /* sem spec */ }
  return (sp.scenes || []).map((s, i) => {
    const tx = (Array.isArray(s.text) ? s.text : s.text ? [s.text] : []).map(T => limpaMarc(T?.value || '').replace(/\|/g, ' ')).filter(Boolean).join(' / ');
    const it = (s.items || []).map(x => x.type + (x.asset ? ':' + x.asset : x.value && x.type !== 'emoji' ? ':' + String(x.value).slice(0, 24) : '')).join(', ');
    return `Cena ${i + 1}: fala “${clip(s.narration || '', 140)}” | texto em tela “${clip(tx, 90)}” | elementos: ${it || 'nenhum'}`;
  }).join('\n');
}
function promptInspecao(c, alvo, n) {
  const marca = c.brand ? `Marca: ${c.brand}.\n` : '';
  const ident = c.brand ? (one("SELECT content FROM knowledge WHERE brand=? COLLATE NOCASE AND category='marca' AND content LIKE '# IDENTIDADE VISUAL%' LIMIT 1", c.brand)?.content || '') : '';
  return `# TAREFA\nInspecione ${alvo === 'arte' ? 'os slides da arte' : 'os quadros do vídeo'} abaixo (${n} imagem(ns), na ordem, ${alvo === 'arte' ? 'um por slide' : 'um quadro por cena, tirado perto do fim de cada cena'}) e diga o que está errado.\n\n# PEÇA\n${marca}Título: ${c.title}\nFormato: ${c.format} / ${c.kind}\n${c.brief ? 'Pedido: ' + clip(c.brief, 500) + '\n' : ''}${alvo === 'video' ? '\n# CENAS (o que deveria aparecer)\n' + cenasResumo(c) + '\n' : ''}${ident ? '\n# IDENTIDADE VISUAL DA MARCA\n' + clip(ident, 1200) + '\n' : ''}\n# O QUE PROCURAR\n${checklistVisual(alvo)}\n\n# SAÍDA\nSomente JSON válido, sem texto fora dele e sem aspas duplas retas dentro dos textos:\n${FORMATO_VISUAL.replace('cena/slide', alvo === 'arte' ? 'slide' : 'cena')}`;
}
// transforma a resposta em checagens da peça (aparecem na peça, vão para o Cérebro e podem voltar ao agente como correção)
function inspecaoSalva(c, alvo, out) {
  const lista = alvo === 'arte' ? VIS_ARTE : VIS_VIDEO, ag = alvo === 'arte' ? 'designer' : 'editor', col = alvo === 'arte' ? 'art_checks' : 'vid_checks';
  const probs = (Array.isArray(out?.problemas) ? out.problemas : []).slice(0, 14).map(p => {
    const gr = String(p?.gravidade || '').toLowerCase(), tipo = lista.includes(p?.tipo) ? p.tipo : 'visual_outro';
    return { [alvo === 'arte' ? 'slide' : 'cena']: Math.max(0, +p?.cena || +p?.slide || 0) || undefined, tipo, sev: gr.startsWith('alta') ? 'erro' : 'aviso', corrigido: false, visual: true, msg: clip(String(p?.o_que || ''), 220) + (p?.correcao ? ' → ' + clip(String(p.correcao), 220) : '') };
  }).filter(x => x.msg.length > 3);
  const antigos = checksLer(getContent(c.id)?.[col]).filter(x => !x.visual);
  checksSalva(ag, c.id, [...antigos, ...probs], col);
  const res = { nota: Math.max(0, Math.min(10, +out?.nota || 0)), aprovado: !probs.some(x => x.sev === 'erro') && out?.aprovado !== false, resumo: clip(String(out?.resumo || ''), 500), problemas: probs, ts: T() };
  setContent(c.id, { visual_review: JSON.stringify({ ...checksLerObj(getContent(c.id)?.visual_review), [alvo]: res }) });
  log('gerente', `Inspeção visual ${alvo === 'arte' ? 'da arte' : 'do vídeo'} de "${c.title}": ${probs.length ? probs.length + ' problema(s)' : 'sem problemas'} (nota ${res.nota.toFixed(1)})`, c.id);
  return res;
}
const checksLerObj = v => { try { const o = JSON.parse(v || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; } };
function leInspecao(texto) { const o = extrairJSON(texto, '{'); if (!o || typeof o !== 'object') throw new Error('sem JSON'); return o; }
// problemas graves viram um pedido de correção para o agente que fez a peça
function corrigeVisual(c, alvo, res) {
  const erros = res.problemas.filter(x => x.sev === 'erro'); if (!erros.length) return false;
  const nome = alvo === 'arte' ? 'slide' : 'cena', num = x => x.cena || x.slide || '?';
  enqueue(c.id, alvo === 'arte' ? 'designer' : 'editor', alvo === 'arte' ? 'arte' : 'video', { feedback: `O Revisor olhou ${alvo === 'arte' ? 'os slides' : 'os quadros'} reais e encontrou problemas. Entregue de novo corrigindo todos:\n` + erros.map(x => `- ${nome[0].toUpperCase() + nome.slice(1)} ${num(x)}: ${x.msg}`).join('\n'), from: 'sistema', autocheck: true });
  return true;
}
async function inspecionaVideo(id, { corrigir = false } = {}) {
  const c = getContent(id); if (!c?.spec) throw fail(400, 'Este vídeo ainda não tem cenas para inspecionar');
  const quadros = await quadrosVideo(id), imgs = quadros.map(q => visionImg(q.file)).filter(Boolean);
  const r = await callClaude({ agent: agentRow('gerente'), user: promptInspecao(c, 'video', imgs.length), maxTokens: 2200, images: imgs });
  let out; try { out = leInspecao(r.text); } catch { throw new Error('O Revisor não devolveu um JSON válido na inspeção visual.'); }
  const res = inspecaoSalva(c, 'video', out);
  if (corrigir) corrigeVisual(c, 'video', res);
  return { res, imgs, tokens: r };
}
async function inspecionaArte(id, { corrigir = false } = {}) {
  const c = getContent(id); const imgs = arteFiles(id).slice(0, 8).map(f => visionImg(path.join(ARTE_DIR(id), f.replace('.png', '.review.jpg')))).filter(Boolean);
  if (!imgs.length) throw fail(400, 'A arte ainda não foi renderizada');
  const r = await callClaude({ agent: agentRow('gerente'), user: promptInspecao(c, 'arte', imgs.length), maxTokens: 2200, images: imgs });
  let out; try { out = leInspecao(r.text); } catch { throw new Error('O Revisor não devolveu um JSON válido na inspeção visual.'); }
  const res = inspecaoSalva(c, 'arte', out); if (corrigir) corrigeVisual(c, 'arte', res);
  return res;
}

function checksSalva(agent, id, checks, coluna) {
  const c = getContent(id); if (!c) return;
  setContent(id, { [coluna]: JSON.stringify(checks) });
  if (!ensina(c)) return;
  try { run("DELETE FROM brain_events WHERE content_id=? AND agent=? AND kind IN ('checagem_falhou','checagem_corrigida') AND digest_id IS NULL", id, agent); } catch { /* sem eventos antigos */ }
  const grupos = new Map();
  for (const k of checks) { const key = k.tipo + '|' + (k.corrigido ? 'c' : 'f'); if (!grupos.has(key)) grupos.set(key, []); grupos.get(key).push(k); }
  for (const [key, ls] of grupos) {
    const [tipo, st] = key.split('|'), corr = st === 'c';
    if (!corr && !ls.some(x => x.sev === 'erro')) continue;   // aviso não corrigido só aparece na peça
    brainEvent(agent, corr ? 'checagem_corrigida' : 'checagem_falhou', c, `Checagem automática: ${motivoRotulo(agent, tipo)} ${corr ? '(corrigido pelo painel)' : '(não foi possível corrigir)'}`, ls.map(x => (x.slide ? `Slide ${x.slide}: ` : x.cena ? `Cena ${x.cena}: ` : '') + x.msg).join('\n').slice(0, 600), [tipo]);
  }
}
const checksLer = v => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
const checksTexto = ck => ck.length ? ck.map(x => `- ${x.slide ? 'Slide ' + x.slide : x.cena ? 'Cena ' + x.cena : 'Peça'}: ${x.msg}${x.corrigido ? ' (corrigido automaticamente)' : x.sev === 'erro' ? ' (NÃO corrigido)' : ' (aviso)'}`).join('\n') : '';
const assetExiste = (nome, marca) => { const n = slugName(nome); return !!n && !!one("SELECT 1 x FROM assets WHERE name=? AND (brand=? COLLATE NOCASE OR brand='')", n, marca || ''); };
// Vídeo: mede o spec antes de renderizar e corrige o que dá (tamanho de texto, duração mínima, tempo da fala)
function checaSpecVideo(spec, c) {
  const ck = [], sc = Array.isArray(spec.scenes) ? spec.scenes : [], comVoz = !!spec.voice_asset;
  const LIM = { cinema: { cena: 5.8, med: 4.4 }, minimal: { cena: 4.8, med: 3.6 }, gradiente: { cena: 4, med: 3.2 } }[spec.look] || { cena: 3.6, med: 3 }, estId = String(c?.estilo_video || spec.estilo || ''), hard = estId === 'hardcopy';
  const nPal = v => limpaMarc(v).split(/\s+/).filter(Boolean).length, blocos = s => Array.isArray(s.text) ? s.text : (s.text ? [s.text] : []);
  let total = 0, semNarr = 0;
  sc.forEach((s, i) => {
    const n = i + 1; let pal = 0;
    for (const T of blocos(s)) {
      if (!T || typeof T !== 'object') continue;
      const linhas = String(T.value || '').split('|').map(limpaMarc), maxC = Math.max(0, ...linhas.map(l => l.length)), sz = +T.size || 70, al = T.align || 'center', x = T.x ?? (al === 'left' ? .1 : al === 'right' ? .9 : .5);
      const avail = al === 'left' ? 1080 - x * 1080 - 40 : al === 'right' ? x * 1080 - 40 : 1000, larg = maxC * sz * .52;
      pal += nPal(T.value);
      if (T.mode !== 'ticker' && T.mode !== 'word' && spec.look !== 'cinetico' && maxC > 0 && larg > avail) { const novo = Math.max(34, Math.floor(sz * avail / larg * .96)); T.size = novo; ck.push({ cena: n, tipo: 'legenda_fora', sev: 'erro', corrigido: true, msg: `texto largo demais para a tela (tamanho ${sz} → ${novo})` }); }
      if (T.y != null && (T.y < .06 || T.y > .94)) { T.y = Math.max(.08, Math.min(.92, T.y)); ck.push({ cena: n, tipo: 'legenda_fora', sev: 'erro', corrigido: true, msg: 'texto fora da área segura vertical (reposicionado)' }); }
      if ((+T.size || 70) < 38 && T.mode !== 'ticker') ck.push({ cena: n, tipo: 'texto_ilegivel', sev: 'aviso', corrigido: false, msg: `texto com tamanho ${T.size} (mínimo recomendado 38)` });
    }
    if (pal > 8) ck.push({ cena: n, tipo: 'texto_demais', sev: 'aviso', corrigido: false, msg: `${pal} palavras na tela (máximo 6 por cena)` });
    const narr = nPal(s.narration || ''); let d = +s.dur || 1.8;
    if (!narr) semNarr++;
    if (!comVoz && narr) { const precisa = Math.round((narr / 2.6 + .2) * 10) / 10; if (d < precisa - .3) { s.dur = Math.min(15, precisa); ck.push({ cena: n, tipo: 'legenda_sync', sev: 'aviso', corrigido: true, msg: `a fala (${narr} palavras) não cabia em ${d.toFixed(1)} s; a cena passou a ${s.dur.toFixed(1)} s` }); d = s.dur; } }
    if (d < .9) { s.dur = 1; ck.push({ cena: n, tipo: 'ritmo_rapido', sev: 'aviso', corrigido: true, msg: `cena de ${d.toFixed(1)} s é curta demais para ler (agora 1,0 s)` }); d = 1; }
    if (d > LIM.cena) ck.push({ cena: n, tipo: i === 0 ? 'gancho_fraco' : 'cena_longa', sev: 'aviso', corrigido: false, msg: `cena de ${d.toFixed(1)} s${i === 0 ? ' na abertura (o gancho deve vir em até 3 s)' : ' (máximo 3,5 s)'}` });
    total += d;
    if (estId && estId !== 'auto') {
      const nomes = [s.bg?.asset, ...(s.items || []).filter(it => it?.type === 'img').map(it => it.asset)].filter(Boolean);
      const cols = nomes.map(nm => assetColecao(nm, c.brand));
      if (hard && !s.bg?.asset && i < sc.length) ck.push({ cena: n, tipo: 'estilo_fora', sev: 'aviso', corrigido: false, msg: 'cena sem vídeo ou imagem de fundo da seção VSL' });
      if (hard && cols.includes('motion')) ck.push({ cena: n, tipo: 'estilo_fora', sev: 'erro', corrigido: false, msg: 'usa arquivo da seção Motion em um vídeo VSL' });
      if (!hard && cols.includes('hardcopy')) ck.push({ cena: n, tipo: 'estilo_fora', sev: 'erro', corrigido: false, msg: 'usa arquivo da seção VSL em um vídeo Motion' });
    }
    for (const nome of [s.bg?.asset, ...(s.items || []).filter(it => it?.type === 'img').map(it => it.asset)].filter(Boolean)) if (!assetExiste(nome, c.brand)) ck.push({ cena: n, tipo: 'arquivo_faltando', sev: 'erro', corrigido: false, msg: `o arquivo “${nome}” não existe na biblioteca da marca` });
  });
  for (const nome of [spec.music_asset, spec.voice_asset].filter(Boolean)) if (!assetExiste(nome, c.brand)) ck.push({ tipo: 'arquivo_faltando', sev: 'erro', corrigido: false, msg: `o arquivo “${nome}” não existe na biblioteca da marca` });
  { const semVisual = sc.filter(s => !(s.items || []).length && !s.bg).length;   // vídeo só de texto não presta: precisa de imagem, elemento ou objeto em cena
    if (sc.length >= 2 && semVisual > sc.length / 2) ck.push({ tipo: 'visual_generico', sev: 'erro', corrigido: false, msg: `${semVisual} de ${sc.length} cenas têm só texto; coloque em cada cena uma imagem da Biblioteca, um objeto 3D ou um objeto gráfico (orb, ring, chart, card)` }); }
  if (spec.look === 'cinetico') { const pt = sc.reduce((a, s) => a + blocos(s).reduce((b, T) => b + nPal(T?.value), 0), 0); if (pt > 34) ck.push({ tipo: 'texto_demais', sev: 'aviso', corrigido: false, msg: `${pt} palavras no vídeo todo (no estilo Tipografia cinética, até 30)` }); }
  { // uso da Biblioteca: variedade, qualidade e se o Editor realmente a consultou
    const usados = new Map(); let baixa = 0;
    sc.forEach(s => { for (const it of (s.items || [])) if (it?.type === 'img' && it.asset) { usados.set(it.asset, (usados.get(it.asset) || 0) + 1); const ar = one("SELECT ficha FROM assets WHERE name=? AND (brand=? COLLATE NOCASE OR brand='') ORDER BY brand DESC", slugName(it.asset), c?.brand || ''); const tc = fichaDe({ ficha: ar?.ficha })?.tecnico; if (tc?.baixa_res && (+it.size || 0) > 500) baixa++; } });
    for (const [nm, q] of usados) if (q > 2 && !/logo|marca|mascote/i.test(nm)) ck.push({ tipo: 'elemento_repetido', sev: 'aviso', corrigido: false, msg: `o arquivo “${nm}” aparece em ${q} cenas; varie os elementos da Biblioteca` });
    if (baixa) ck.push({ tipo: 'imagem_baixa_res', sev: 'aviso', corrigido: false, msg: `${baixa} imagem(ns) de baixa resolução usadas em tamanho grande (podem ficar borradas)` });
    const disp = hard ? 0 : (one("SELECT COUNT(*) n FROM assets WHERE colecao='motion' AND ext IN ('png','jpg','jpeg','webp','gif') AND (brand=? COLLATE NOCASE OR brand='')", c?.brand || '')?.n || 0);
    if (disp >= 3 && !usados.size && !sc.some(s => s.bg?.asset)) ck.push({ tipo: 'biblioteca_ignorada', sev: 'aviso', corrigido: false, msg: `a Biblioteca tem ${disp} elementos de Motion e o vídeo não usou nenhum` });
  }
  if (sc.length) {
    const med = total / sc.length;
    if (med > LIM.med) ck.push({ tipo: 'ritmo_lento', sev: 'aviso', corrigido: false, msg: `média de ${med.toFixed(1)} s por cena (ideal até 2,5 s)` });
    if (total < 12 || total > 62) ck.push({ tipo: 'duracao', sev: 'aviso', corrigido: false, msg: `duração estimada de ${total.toFixed(0)} s (ideal entre 15 e 45 s)` });
    if (semNarr && !comVoz) ck.push({ tipo: 'legenda_sync', sev: 'aviso', corrigido: false, msg: `${semNarr} cena(s) sem narração (a voz não cobre o vídeo todo)` });
    const ult = sc.at(-1), tx = blocos(ult).map(T => T?.value || '').join(' ') + ' ' + (ult.narration || '');
    if (!/direct|link|bio|coment|clique|chama|siga|salv|compre|whats|garanta|acesse|fale|mande|envie|agende|baixe|cadastr|\bcta\b/i.test(tx) && !blocos(ult).some(T => T?.mode === 'ticker')) ck.push({ cena: sc.length, tipo: 'cta_fraco', sev: 'aviso', corrigido: false, msg: 'a última cena não tem uma chamada para ação clara' });
  }
  return ck;
}
// Áudio do vídeo pronto: mede o volume com o ffmpeg
function videoAudioCheck(id, file) {
  if (!motorStatus().ffmpeg) return;
  execFile('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { timeout: 60000, maxBuffer: 2e6 }, (e, so, se) => {
    try {
      const t = String(se || ''), mx = /max_volume:\s*(-?[\d.]+) dB/.exec(t), mn = /mean_volume:\s*(-?[\d.]+) dB/.exec(t); if (!mx || !mn) return;
      const c = getContent(id); if (!c) return; const ck = checksLer(c.vid_checks).filter(x => !['audio_estourado', 'audio_baixo'].includes(x.tipo));
      if (+mx[1] >= -0.3) ck.push({ tipo: 'audio_estourado', sev: 'erro', corrigido: false, msg: `o áudio chega a ${mx[1]} dB (corte/estouro)` });
      if (+mn[1] < -28) ck.push({ tipo: 'audio_baixo', sev: 'aviso', corrigido: false, msg: `volume médio de ${mn[1]} dB (muito baixo)` });
      checksSalva('editor', id, ck, 'vid_checks'); changed();
    } catch (er) { console.error('videoAudioCheck:', er.message); }
  });
}
// Fontes embutidas: se algum arquivo de public/fonts sumiu (instalação incompleta, antivírus, cópia parcial), o motor cairia em Arial e o texto
// estouraria as margens. Aqui o painel confere e baixa o que faltar (mesmos arquivos do Fontsource, licença OFL), antes de renderizar.
const FONTES_DIR = path.join(__dirname, 'public', 'fonts');
const fontesFaltando = () => { const L = []; for (const f of Object.values(FONTES_ARTE)) if (!/^impact/.test(f.file)) for (const w of f.weights) { const fn = `${f.file}-latin-${w}-normal.woff2`; if (!fs.existsSync(path.join(FONTES_DIR, fn))) L.push({ id: f.file, w, fn }); } return L; };
let fontesReparo = null;
async function garanteFontes() {
  const falta = fontesFaltando(); if (!falta.length) return { faltavam: 0, baixadas: 0, falhas: [] };
  if (fontesReparo) return fontesReparo;
  fontesReparo = (async () => {
    fs.mkdirSync(FONTES_DIR, { recursive: true }); let ok = 0; const falhas = [];
    for (let i = 0; i < falta.length; i += 6) await Promise.all(falta.slice(i, i + 6).map(async x => {
      try {
        const r = await fetch(`https://cdn.jsdelivr.net/fontsource/fonts/${x.id}@latest/latin-${x.w}-normal.woff2`, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error('HTTP ' + r.status);
        const b = Buffer.from(await r.arrayBuffer()); if (b.length < 1000 || b.subarray(0, 4).toString() !== 'wOF2') throw new Error('arquivo inválido');
        const tmp = path.join(FONTES_DIR, x.fn + '.tmp'); fs.writeFileSync(tmp, b); fs.renameSync(tmp, path.join(FONTES_DIR, x.fn)); ok++;
      } catch (e) { falhas.push(x.fn + ' (' + e.message + ')'); }
    }));
    if (ok) console.log(`Fontes: ${ok} arquivo(s) que faltavam em public/fonts foram baixados.`);
    if (falhas.length) console.error(`Fontes: ${falhas.length} arquivo(s) continuam faltando em public/fonts: ${falhas.slice(0, 4).join('; ')}`);
    return { faltavam: falta.length, baixadas: ok, falhas };
  })();
  try { return await fontesReparo; } finally { fontesReparo = null; }
}
async function renderArte(id, { regen = false } = {}) {
  const cur = arteState.get(id); if (cur?.status === 'running') return;
  const c = getContent(id); if (!c) return;
  arteState.set(id, { status: 'running', started: Date.now() }); changed();
  const warn = []; let status = 'ok';
  try {
    if (!c.art_spec) { status = 'sem_spec'; throw new Error('O Designer não entregou a especificação visual. Peça uma nova direção de arte (Reprocessar ou “Pedir ajustes”).'); }
    const mo = motorStatus(); reloadEnv();
    { const fr = await garanteFontes().catch(() => null); if (fr?.falhas?.length) warn.push(`Faltam ${fr.falhas.length} arquivo(s) de fonte em public/fonts e não consegui baixar (sem internet?). O texto pode sair em Arial e fora do lugar: reinstale a pasta public/fonts.`); }
    if (!mo.playwright) { status = 'sem_motor'; throw new Error('O motor de imagem não está instalado (falta o playwright: npm i playwright && npx playwright install chromium). Veja o README.'); }
    const sp = JSON.parse(c.art_spec), [w, h] = ART_SIZE[c.format] || [1080, 1350];
    const findAsset = name => { const n = slugName(name); if (!n) return null; return one('SELECT * FROM assets WHERE name=? AND brand=? COLLATE NOCASE', n, c.brand || '') || one("SELECT * FROM assets WHERE name=? AND brand=''", n); };
    const aPath = a => path.join(ASSET_DIR, a.id + '.' + a.ext), IMG = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
    const previa = c.teste === 3;   // prévia de estilo no Estúdio: nunca gasta com IA
    const useGen = !previa && settings().art_gen === '1' && !!falKey(); const maxGen = Math.max(0, Math.min(12, +settings().max_art_gen || 0));
    let gen = 0, semFal = false, poseGen = 0, falOff = '';   // falOff: depois da 1ª falha do fal.ai nesta peça, não insiste (evita esperar timeouts em cada slide)
    const maxPose = Math.max(0, Math.min(8, +settings().max_pose_gen || 0));
    const comp = styleParams(c.brand).composicao || {};   // composição da marca (alinhamento, margens, densidade): o motor garante, não só pede
    const idv = identidadeDe(c.brand);   // cores e fonte da Identidade da marca completam o que o Designer não definiu
    if (!sp.font_asset && idv.fontAsset) sp.font_asset = idv.fontAsset;
    const resCopies = [], objFeitos = new Map(), credBanco = new Set();   // imagens resolvidas (fundo por IA, poses) copiadas para a pasta da arte: o editor visual as usa
    const out = { w, h, editada: !!sp.editada, margem: sp.editada ? 0 : ({ estreitas: .06, medias: .10, amplas: .14 }[comp.margens] || 0), fmt: c.format, accent: sp.accent || idv.accent || brandColors()[c.brand] || '#f59e0b', ink: sp.ink || idv.ink, paper: sp.paper || idv.paper, font: {}, slides: [] };
    if (sp.font_asset) { const a = findAsset(sp.font_asset); if (a && ['ttf', 'otf', 'woff', 'woff2'].includes(a.ext) && fs.existsSync(aPath(a))) { out.font = { family: 'BrandFont', src: pathToFileURL(aPath(a)).href }; } else warn.push(`Fonte “${sp.font_asset}” não está cadastrada na marca: usei a fonte padrão.`); }
    if (sp.pano && sp.slides.length > 1) {   // carrossel panorâmico: um fundo só, largo, que continua de um slide para o outro
      const n = sp.slides.length;
      if (sp.pano.asset) { const a = findAsset(sp.pano.asset); if (a && IMG.includes(a.ext) && fs.existsSync(aPath(a))) out.pano = { src: pathToFileURL(aPath(a)).href, grade: sp.pano.grade }; else warn.push(`Fundo panorâmico “${sp.pano.asset}” não está cadastrado na marca.`); }
      else if (sp.pano.gen && useGen) {
        try { const cf = composeFundo(sp.pano.gen + ', ultra wide panoramic composition, seamless continuous scene from left to right', c.brand); const f = await falFundo(cf.prompt, w * n, h, regen, 'c' + id, { seed: cf.seed, mp: 2 }); out.pano = { src: pathToFileURL(f).href, grade: sp.pano.grade }; gen++; resCopies.push(['pano', f]); }
        catch (e) { falOff = e.message; warn.push(`Não consegui gerar o fundo panorâmico (${e.message.slice(0, 140)}).`); }
      } else if (sp.pano.gen) semFal = true;
    }
    for (const [i, s0] of sp.slides.entries()) {
     let s = s0;
     if (s.modelo && (!useGen || falOff)) s = modeloSemImagem(s, c.format, c.brand, i, sp.slides.length) || s;   // sem imagem por IA: o modelo se refaz sem a foto/objeto
     for (let tent = 0; tent < 2; tent++) {
      const slide = { ...s, bg: { color: s.bg.color, color2: s.bg.color2, grad: s.bg.grad, grade: s.bg.grade, fil: s.bg.fil, blur: s.bg.blur, pos: s.bg.pos, zoom: s.bg.zoom }, items: [] };
      if (s.bg.banco && !s.bg.gen) {
        try { const f = await fotoBanco(s.bg.banco, false, credBanco); slide.bg.src = pathToFileURL(f).href; resCopies.push([`bg-${i + 1}`, f]); }
        catch (e) { warn.push(`Slide ${i + 1}: não achei foto no banco para “${s.bg.banco}” (${e.message.slice(0, 100)}).`); }
      }
      if (s.bg.gen) {
        if (useGen && falOff) { /* já falhou nesta peça: fundo liso, sem repetir o aviso */ }
        else if (useGen && gen < maxGen) {
          try { const cf = composeFundo(s.bg.gen, c.brand); slide.bg.src = pathToFileURL(await falFundo(cf.prompt, w, h, regen, 'c' + id, { seed: cf.seed })).href; gen++; resCopies.push([`bg-${i + 1}`, fileURLToPath(slide.bg.src)]); }
          catch (e) { falOff = e.message; warn.push(`Não consegui gerar fundos por IA (${e.message.slice(0, 140)}). As artes saíram com fundo liso; use “Refazer fundos” quando o serviço voltar.`); }
        } else if (!useGen) semFal = true; else warn.push(`Slide ${i + 1}: limite de ${maxGen} imagens por IA nesta peça atingido (Configurações › Vídeo e voz).`);
      }
      if (!slide.bg.src && s.bg.asset) { const a = findAsset(s.bg.asset); if (a && IMG.includes(a.ext) && fs.existsSync(aPath(a))) slide.bg.src = pathToFileURL(aPath(a)).href; else warn.push(`Slide ${i + 1}: arquivo “${s.bg.asset}” não está cadastrado na marca.`); }
      for (const [ik, it] of s.items.entries()) {
        if (it.banco && !it.asset) {   // foto de banco (internet): recortada para personagem/objeto/partícula, inteira no cartão
          const corte = !it.fotoCard && !it.card, kB = 'b|' + corte + '|' + it.banco, ja = objFeitos.get(kB);
          if (ja) { slide.items.push({ ...it, src: pathToFileURL(ja).href }); resCopies.push([`it-${i + 1}-${ik}`, ja]); continue; }
          try { const f = await fotoBanco(it.banco, corte, credBanco); objFeitos.set(kB, f); slide.items.push({ ...it, src: pathToFileURL(f).href }); resCopies.push([`it-${i + 1}-${ik}`, f]); }
          catch (e) { warn.push(`Slide ${i + 1}: não consegui usar a foto do banco “${it.banco.slice(0, 40)}” (${e.message.slice(0, 100)}).`); }
          continue;
        }
        if (it.gen && !it.asset && PROMPT_MASCOTE.test(it.gen)) {   // a IA nunca desenha "o mascote": se a marca tem um cadastrado, entra o arquivo dele (o avatar de verdade)
          const m0 = mascotesDe(c.brand)[0], am = m0 && findAsset(m0);
          if (am && IMG.includes(am.ext) && fs.existsSync(aPath(am))) { slide.items.push({ ...it, gen: undefined, pessoa: undefined, asset: m0, src: pathToFileURL(aPath(am)).href }); warn.push(`Slide ${i + 1}: o pedido descrevia um personagem/mascote; usei o mascote cadastrado (${m0}) em vez de gerar outro por IA.`); continue; }
        }
        if (it.gen && !it.asset) {   // objeto ou personagem gerado por IA e recortado (fundo transparente): vai na frente/atrás do texto
          if (!useGen || falOff) { if (!useGen) semFal = true; continue; }
          if (it.fotoCard) {   // foto em cartão (página interna): foto inteira, sem recorte
            if (gen >= maxGen) { warn.push(`Slide ${i + 1}: limite de ${maxGen} imagens por IA nesta peça atingido; a foto do cartão ficou de fora.`); continue; }
            try { const cw = it.size || w, ch = Math.round((it.h || .3) * h), cf = composeFundo(it.gen, c.brand); const f = await falFundo(cf.prompt, cw, ch, regen, 'c' + id, { seed: cf.seed }); slide.items.push({ ...it, src: pathToFileURL(f).href }); resCopies.push([`it-${i + 1}-${ik}`, f]); gen++; }
            catch (e) { falOff = e.message; warn.push(`Não consegui gerar a foto do cartão (${e.message.slice(0, 140)}).`); }
            continue;
          }
          const kObj = (it.pessoa ? 'p|' : 'o|') + it.gen, ja = objFeitos.get(kObj);   // a mesma imagem repetida (cópias desfocadas, partículas) é gerada uma vez só
          if (ja) { slide.items.push({ ...it, src: pathToFileURL(ja).href }); resCopies.push([`it-${i + 1}-${ik}`, ja]); continue; }
          if (gen >= maxGen) { warn.push(`Slide ${i + 1}: limite de ${maxGen} imagens por IA nesta peça atingido; objeto “${it.gen.slice(0, 40)}” ficou de fora.`); continue; }
          try { const f = await falObjeto(it.gen, c.brand, regen, 'c' + id, it.pessoa); objFeitos.set(kObj, f); slide.items.push({ ...it, src: pathToFileURL(f).href }); resCopies.push([`it-${i + 1}-${ik}`, f]); gen++; }
          catch (e) { falOff = e.message; warn.push(`Não consegui gerar o objeto por IA (${e.message.slice(0, 140)}). Use “Refazer fundos” quando o serviço voltar.`); }
          continue;
        }
        const a = findAsset(it.asset);
        if (a && it.pose && !previa && poseIaLigada() && !falOff) {   // pose nova do mascote, fiel ao arquivo cadastrado
          if (poseGen >= maxPose) { warn.push(`Slide ${i + 1}: limite de ${maxPose} poses novas por peça atingido (Configurações › Vídeo e voz); usei o mascote original.`); }
          else {
            try {
              const cdir = path.join(RENDER_DIR, '_poses'); fs.mkdirSync(cdir, { recursive: true });
              const cf = path.join(cdir, crypto.createHash('sha1').update(a.id + '|' + it.pose + '|' + (process.env.FAL_POSE_MODEL || '')).digest('hex').slice(0, 14) + '.png');
              if (regen || !fs.existsSync(cf)) fs.writeFileSync(cf, await falPose(a, it.pose, 'c' + id));
              slide.items.push({ ...it, src: pathToFileURL(cf).href }); resCopies.push([`it-${i + 1}-${ik}`, cf]); poseGen++; continue;
            } catch (e) { falOff = falOff || e.message; warn.push(`Slide ${i + 1}: não consegui gerar a pose nova (${e.message.slice(0, 120)}); usei o mascote original.`); }
          }
        }
        if (a && IMG.includes(a.ext) && fs.existsSync(aPath(a))) slide.items.push({ ...it, src: pathToFileURL(aPath(a)).href }); else warn.push(`Slide ${i + 1}: arquivo “${it.asset}” não está cadastrado na marca: item removido.`); }
      const pediu = !!(s.bg.gen || s.bg.banco) || s.items.some(it => (it.gen || it.banco) && it.hero), veio = !!slide.bg.src || slide.items.some(it => it.hero && it.src);
      if (tent === 0 && s.modelo && pediu && !veio) { const ms = modeloSemImagem(s, c.format, c.brand, i, sp.slides.length, true); if (ms) { s = ms; continue; } }
      if (slide.fx?.textura) slide.fx = { ...slide.fx, textura: slide.fx.textura.map(x => { if (!x.asset) return x; const a = findAsset(x.asset); return a && IMG.includes(a.ext) && fs.existsSync(aPath(a)) ? { ...x, src: pathToFileURL(aPath(a)).href } : null; }).filter(Boolean) };
      if (!sp.editada && !s.modelo) composicaoAplica(slide, comp, i, warn);   // arte editada à mão ou composta por modelo: a composição da marca não mexe
      out.slides.push(slide); break;
     }
    }
    if (semFal) warn.push(!falKey() ? (falPausado() ? 'fal.ai em standby: os fundos de IA foram trocados por fundo liso/cor da marca (nada cobrado).' : 'Sem FAL_KEY no .env: os fundos de IA foram trocados por fundo liso/cor da marca.') : 'Fundos de IA desligados em Configurações › Vídeo e voz.');
    const dir = ARTE_DIR(id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    { const rd = path.join(dir, 'res'); fs.mkdirSync(rd, { recursive: true }); for (const [n, src] of resCopies) { try { fs.copyFileSync(src, path.join(rd, n + path.extname(src))); } catch { /* sem cópia */ } } }
    const specFile = path.join(RENDER_DIR, String(id), 'arte.spec.json'); fs.writeFileSync(specFile, JSON.stringify(out));
    await new Promise((resolve, reject) => execFile(process.execPath, [path.join(MOTOR_DIR, 'arte.mjs'), specFile, dir], { cwd: MOTOR_DIR, timeout: 240000, maxBuffer: 4e6 }, (e, so, se) => e ? reject(new Error(String(se || e.message).split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 300))) : resolve()));
    if (!arteFiles(id).length) throw new Error('O motor não gerou nenhuma imagem.');
    try { const ff = JSON.parse(fs.readFileSync(path.join(dir, 'fontes_falhas.json'), 'utf8')); if (ff.length) warn.push('Fonte(s) que não carregaram no render: ' + ff.join(', ') + '. O motor ajustou o texto, mas confira a pasta public/fonts.'); } catch { /* tudo certo */ }
    try { checksSalva('designer', id, checksLer(fs.readFileSync(path.join(dir, 'checks.json'), 'utf8')), 'art_checks'); } catch (e) { console.error('checagem da arte:', e.message); }
    if (credBanco.size) warn.push('Fotos de banco: ' + [...credBanco].join(' · '));
    setContent(id, { art_status: 'ok', art_note: warn.join('\n') });
    log('designer', `Arte renderizada em PNG (${arteFiles(id).length} ${arteFiles(id).length === 1 ? 'imagem' : 'imagens'}): "${c.title}"`, id);
  } catch (e) {
    status = status === 'ok' ? 'erro' : status;
    try { setContent(id, { art_status: status, art_note: [...warn, e.message].join('\n') }); log('designer', `Arte sem imagem em "${c.title}": ${e.message}`, id); } catch { /* peça removida durante a renderização */ }
  }
  arteState.set(id, { status: 'done' }); changed();
}
// ───────────────────────── Estúdio de arte: artes avulsas, editor visual, layouts por marca e aprendizado das edições ─────────────────────────
// Uma arte avulsa é uma peça com teste=2 (não entra no pipeline nem nas métricas). O editor trabalha na MESMA especificação (art_spec) que o Designer
// entrega, e o desenho vem do mesmo módulo (public/arte-slide.js), então o que se vê no editor é o que sai no PNG. Ao aprovar uma edição, o painel
// compara a versão do agente (art_spec_base) com a final, guarda cada ajuste, ensina o Cérebro e (se você quiser) salva o layout da marca.
db.exec(`CREATE TABLE IF NOT EXISTS art_layouts(id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT DEFAULT '', name TEXT NOT NULL, format TEXT NOT NULL, spec TEXT NOT NULL, origem TEXT DEFAULT 'dono', uses INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT)`);
for (const col of ["uso TEXT DEFAULT ''", "tema TEXT DEFAULT ''"]) { try { db.exec('ALTER TABLE art_layouts ADD COLUMN ' + col); } catch { /* já existe */ } }   // quando usar + tema: o Designer escolhe o layout pela copy
db.exec(`CREATE TABLE IF NOT EXISTS art_edits(id INTEGER PRIMARY KEY AUTOINCREMENT, content_id INTEGER, brand TEXT DEFAULT '', formato TEXT DEFAULT '', alvo TEXT, prop TEXT, dir TEXT, de TEXT, para TEXT, txt TEXT, ts TEXT)`);
const LAYOUT_DIR = path.join(DATA_DIR, 'layouts'); fs.mkdirSync(LAYOUT_DIR, { recursive: true });
const ART_FORMATS = ['feed', 'carrossel', 'stories'];
const ROLE_PT = { title: 'título', body: 'texto de apoio', number: 'número grande', badge: 'selo', cta: 'botão (CTA)' };
const jparse = (s, d = null) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };
// Lixeira de artes: layout ou estilo apagado (e a versão anterior de um layout atualizado) fica 7 dias para recuperar e depois some de vez. Enquanto está na lixeira NADA usa: nem Designer, nem Cérebro, nem notícias.
db.exec("CREATE TABLE IF NOT EXISTS lixeira_arte(id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, orig_id INTEGER, brand TEXT DEFAULT '', nome TEXT DEFAULT '', dados TEXT NOT NULL, thumb TEXT DEFAULT '', motivo TEXT DEFAULT '', apagado_em TEXT NOT NULL)");
const LIXEIRA_DIAS = 7;
function lixeiraGuarda(tipo, row, motivo = '') {
  try {
    let thumb = ''; if (tipo.startsWith('layout')) { try { const b = fs.readFileSync(path.join(LAYOUT_DIR, row.id + '.jpg')); if (b.length < 400000) thumb = b.toString('base64'); } catch { /* sem miniatura */ } }
    run('INSERT INTO lixeira_arte(tipo,orig_id,brand,nome,dados,thumb,motivo,apagado_em) VALUES(?,?,?,?,?,?,?,?)', tipo, row.id, row.brand || '', row.nome || row.name || '', JSON.stringify(row), thumb, motivo, T());
    if (tipo === 'layout_versao') for (const x of all("SELECT id FROM lixeira_arte WHERE tipo='layout_versao' AND orig_id=? ORDER BY id DESC LIMIT -1 OFFSET 5", row.id)) run('DELETE FROM lixeira_arte WHERE id=?', x.id);
  } catch (e) { console.error('lixeira:', e.message); }
}
function lixeiraLimpa() { try { const n = run('DELETE FROM lixeira_arte WHERE apagado_em < ?', new Date(Date.now() - LIXEIRA_DIAS * 864e5).toISOString()).changes; if (n) log('designer', `Lixeira de artes: ${n} item(ns) com mais de ${LIXEIRA_DIAS} dias foram apagados de vez`); return n; } catch (e) { console.error('lixeira (limpeza):', e.message); return 0; } }
const lixeiraPub = r => ({ id: r.id, tipo: r.tipo, nome: r.nome, brand: r.brand, motivo: r.motivo, apagado_em: r.apagado_em, dias: Math.max(0, Math.ceil(LIXEIRA_DIAS - (Date.now() - new Date(r.apagado_em)) / 864e5)), thumb: r.thumb ? `/api/lixeira/${r.id}/thumb` : '' });
// Depois que um layout/estilo some: o que apontava para ele (notícias da marca, estilo padrão, molde fixo do Cérebro) passa para o mais recente que sobrou, em vez de continuar usando o apagado
function limpaReferenciasArte(tipo, id, brand) {
  try {
    const chave = tipo === 'layout' ? 'layout-' + id : 'dono-' + id, raw = jparse(one("SELECT value FROM settings WHERE key='radar_cfg'")?.value, {}) || {}; let mud = false;
    for (const [b, m] of Object.entries(raw.marcas && typeof raw.marcas === 'object' ? raw.marcas : {})) if (m?.estilo === chave) {
      const novo = radarLayoutsDaMarca(b)[0];
      m.estilo = novo ? 'layout-' + novo.id : ''; mud = true;
      log('designer', `A marca ${b} usava ${tipo === 'layout' ? 'o layout' : 'o estilo'} que foi apagado nas notícias: ${novo ? 'passou para o layout mais recente, “' + novo.name + '”' : 'ficou sem estilo; escolha outro no Agente de Notícias'}`);
    }
    if (mud) run("INSERT INTO settings(key,value) VALUES('radar_cfg',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(raw));
    const pd = estilosPadrao(); let m2 = false; for (const k of Object.keys(pd)) if (pd[k] === chave) { delete pd[k]; m2 = true; }
    if (m2) run("INSERT INTO settings(key,value) VALUES('estilo_padrao',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(pd));
    brainSincronizaSalvos();
  } catch (e) { console.error('referências da arte apagada:', e.message); }
}
const sameDims = (a, b) => { const x = ART_SIZE[a], y = ART_SIZE[b]; return !!x && !!y && x[0] === y[0] && x[1] === y[1]; };

// O que mudou entre a versão do agente e a versão editada, em frases e em dados (os dados alimentam o aprendizado)
function arteDiff(a, b) {
  const out = [], r2 = v => Math.round(v * 100) / 100, dirN = (x, y) => (y > x ? '+' : '-');
  const add = (slide, alvo, prop, de, para, txt, learn = true, dir = '') => out.push({ slide, alvo, prop, de: de ?? '', para: para ?? '', txt, learn, dir });
  for (const [k, nome] of [['accent', 'de destaque'], ['ink', 'do texto'], ['paper', 'do fundo']]) if ((a?.[k] || '') !== (b?.[k] || '')) add(0, 'arte', k, a?.[k], b?.[k], `Mudou a cor ${nome}: ${a?.[k] || 'padrão da marca'} → ${b?.[k] || 'padrão da marca'}`, true, 'cor');
  const A = a?.slides || [], B = b?.slides || [];
  if (A.length !== B.length) add(0, 'arte', 'slides', A.length, B.length, `Mudou a quantidade de slides (${A.length} → ${B.length})`, false);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const s = A[i], n = B[i], sl = i + 1, P = `Slide ${sl}`;
    const bgk = x => x.bg?.asset ? 'imagem' : x.bg?.gen ? 'ia' : x.bg?.grad ? 'degrade' : 'cor';
    if (bgk(s) !== bgk(n)) add(sl, 'fundo', 'tipo', bgk(s), bgk(n), `${P}: trocou o fundo (${{ imagem: 'imagem da biblioteca', ia: 'imagem por IA', cor: 'cor lisa', degrade: 'degradê' }[bgk(s)]} → ${{ imagem: 'imagem da biblioteca', ia: 'imagem por IA', cor: 'cor lisa', degrade: 'degradê' }[bgk(n)]})`, true, bgk(n));
    else if (bgk(n) === 'imagem' && s.bg.asset !== n.bg.asset) add(sl, 'fundo', 'imagem', s.bg.asset, n.bg.asset, `${P}: trocou a imagem de fundo (${s.bg.asset} → ${n.bg.asset})`, false);
    else if (bgk(n) === 'ia' && s.bg.gen !== n.bg.gen) add(sl, 'fundo', 'prompt', '', '', `${P}: reescreveu o prompt do fundo por IA`, false);
    else if (bgk(n) === 'cor' && (s.bg?.color || '') !== (n.bg?.color || '')) add(sl, 'fundo', 'cor', s.bg?.color, n.bg?.color, `${P}: mudou a cor do fundo`, false);
    if (Math.abs((s.shade ?? .5) - (n.shade ?? .5)) >= .05) add(sl, 'fundo', 'sombra', s.shade ?? '', n.shade ?? '', `${P}: ${(n.shade ?? .5) > (s.shade ?? .5) ? 'escureceu' : 'clareou'} a sombra sobre o fundo (${r2(s.shade ?? .5)} → ${r2(n.shade ?? .5)})`, true, dirN(s.shade ?? .5, n.shade ?? .5));
    if (bgk(s) === 'degrade' && bgk(n) === 'degrade' && JSON.stringify(s.bg.grad) !== JSON.stringify(n.bg.grad)) { const cj = g => (g.cores || []).join(' + '); add(sl, 'fundo', 'degrade', cj(s.bg.grad), cj(n.bg.grad), `${P}: mudou o degradê do fundo (${cj(s.bg.grad)} → ${cj(n.bg.grad)}, ${n.bg.grad.tipo === 'radial' ? 'circular' : 'reto ' + (n.bg.grad.ang ?? 160) + '°'})`, true, 'cor'); }
    {   // efeitos do slide (brilhos, tinta, vinheta, granulado, degradê de leitura)
      const fa = s.fx || {}, fb = n.fx || {}, EF = { vignette: 'a vinheta', grain: 'o granulado', tint: 'a tinta de cor', glows: 'os brilhos de cor', fade: 'o degradê de leitura atrás do texto', fadeFront: 'o degradê de leitura na frente' };
      for (const [k, nome] of Object.entries(EF)) {
        const va = fa[k], vb = fb[k], ja = Array.isArray(va) ? va.length > 0 : !!va, jb = Array.isArray(vb) ? vb.length > 0 : !!vb;
        if (ja !== jb) add(sl, 'efeito', k, ja ? 'sim' : 'não', jb ? 'sim' : 'não', `${P}: ${jb ? 'acrescentou' : 'tirou'} ${nome}`, true, jb ? '+' : '-');
        else if (ja && JSON.stringify(va) !== JSON.stringify(vb)) add(sl, 'efeito', k + '_ajuste', '', '', `${P}: ajustou ${nome}`, false);
      }
      try { const ord = x => camadasArte(x).filter(l => !l.sys).map(l => l.id).join(','); if (ord(s) !== ord(n) && (s.texts || []).length === (n.texts || []).length && (s.items || []).length === (n.items || []).length && (s.shapes || []).length === (n.shapes || []).length) add(sl, 'camadas', 'ordem', '', '', `${P}: mudou a ordem das camadas (o que fica na frente e o que fica atrás)`, false); } catch { /* sem ordem */ }
    }
    // textos: pareia por função (título com título, na mesma ordem)
    const grp = l => { const m = {}; for (const t of l || []) (m[t.role || 'title'] ||= []).push(t); return m; };
    const ga = grp(s.texts), gb = grp(n.texts);
    for (const role of new Set([...Object.keys(ga), ...Object.keys(gb)])) {
      const la = ga[role] || [], lb = gb[role] || [], nome = ROLE_PT[role] || role;
      for (let k = 0; k < Math.max(la.length, lb.length); k++) {
        const x = la[k], y = lb[k];
        if (x && !y) { add(sl, role, 'removido', '', '', `${P}: tirou o ${nome}`, true, '-'); continue; }
        if (!x && y) { add(sl, role, 'adicionado', '', '', `${P}: acrescentou um ${nome}`, true, '+'); continue; }
        if (x.value !== y.value) add(sl, role, 'texto', '', '', `${P}: reescreveu o ${nome}`, false);
        if (Math.abs((x.x ?? .5) - (y.x ?? .5)) >= .02) add(sl, role, 'x', r2(x.x ?? .5), r2(y.x ?? .5), `${P} · ${nome}: moveu para ${(y.x ?? .5) > (x.x ?? .5) ? 'a direita' : 'a esquerda'} (x ${r2(x.x ?? .5)} → ${r2(y.x ?? .5)})`, true, dirN(x.x ?? .5, y.x ?? .5));
        if (Math.abs((x.y ?? .5) - (y.y ?? .5)) >= .02) add(sl, role, 'y', r2(x.y ?? .5), r2(y.y ?? .5), `${P} · ${nome}: ${(y.y ?? .5) > (x.y ?? .5) ? 'desceu' : 'subiu'} (y ${r2(x.y ?? .5)} → ${r2(y.y ?? .5)})`, true, dirN(x.y ?? .5, y.y ?? .5));
        if (x.size && y.size ? Math.abs(y.size / x.size - 1) >= .08 : (!!x.size !== !!y.size)) add(sl, role, 'size', x.size ?? 'auto', y.size ?? 'auto', `${P} · ${nome}: ${(y.size || 0) > (x.size || 0) ? 'aumentou' : 'diminuiu'} o tamanho (${x.size ?? 'padrão'} → ${y.size ?? 'padrão'})`, true, (y.size || 0) > (x.size || 0) ? '+' : '-');
        if ((x.color || '') !== (y.color || '')) add(sl, role, 'color', x.color, y.color, `${P} · ${nome}: mudou a cor (${x.color || 'padrão'} → ${y.color || 'padrão'})`, true, 'cor');
        if ((x.bg || '') !== (y.bg || '')) add(sl, role, 'bg', x.bg, y.bg, `${P} · ${nome}: mudou a cor do botão/selo`, true, 'cor');
        if ((x.align || 'center') !== (y.align || 'center')) add(sl, role, 'align', x.align || 'center', y.align || 'center', `${P} · ${nome}: alinhou ${{ left: 'à esquerda', center: 'ao centro', right: 'à direita' }[y.align || 'center']}`, true, y.align || 'center');
        if ((x.weight || 0) !== (y.weight || 0)) add(sl, role, 'weight', x.weight ?? '', y.weight ?? '', `${P} · ${nome}: mudou o peso da letra`, true, (y.weight || 0) > (x.weight || 0) ? '+' : '-');
        if (x.w && y.w ? Math.abs(x.w - y.w) >= .05 : !!x.w !== !!y.w) add(sl, role, 'w', x.w ?? '', y.w ?? '', `${P} · ${nome}: mudou a largura da caixa`, false);
      }
    }
    // imagens (logo, mascote, fotos) pareadas por posição na lista
    const IA = s.items || [], IB = n.items || [];
    for (let k = 0; k < Math.max(IA.length, IB.length); k++) {
      const x = IA[k], y = IB[k];
      if (x && !y) { add(sl, 'imagem', 'removida', x.asset, '', `${P}: tirou a imagem “${x.asset}”`, true, '-'); continue; }
      if (!x && y) { add(sl, 'imagem', 'adicionada', '', y.asset, `${P}: acrescentou a imagem “${y.asset}”`, true, '+'); continue; }
      if (x.asset !== y.asset) add(sl, 'imagem', 'troca', x.asset, y.asset, `${P}: trocou a imagem “${x.asset}” por “${y.asset}”`, false);
      if (Math.abs(x.x - y.x) >= .02 || Math.abs(x.y - y.y) >= .02) add(sl, 'imagem:' + y.asset, 'pos', `${r2(x.x)},${r2(x.y)}`, `${r2(y.x)},${r2(y.y)}`, `${P} · “${y.asset}”: mudou de lugar (${r2(x.x)},${r2(x.y)} → ${r2(y.x)},${r2(y.y)})`, true, `${Math.sign(y.x - x.x)}${Math.sign(y.y - x.y)}`);
      if (Math.abs(y.size / x.size - 1) >= .1) add(sl, 'imagem:' + y.asset, 'size', x.size, y.size, `${P} · “${y.asset}”: ${y.size > x.size ? 'aumentou' : 'diminuiu'} (${x.size} → ${y.size} px)`, true, y.size > x.size ? '+' : '-');
    }
    const SA = s.shapes || [], SB = n.shapes || [];
    if (SA.length !== SB.length) add(sl, 'forma', SB.length > SA.length ? 'adicionada' : 'removida', SA.length, SB.length, `${P}: ${SB.length > SA.length ? 'acrescentou' : 'tirou'} ${Math.abs(SB.length - SA.length)} forma(s) decorativa(s)`, true, SB.length > SA.length ? '+' : '-');
    else if (JSON.stringify(SA) !== JSON.stringify(SB)) add(sl, 'forma', 'ajuste', '', '', `${P}: ajustou formas decorativas`, false);
    if (s.pager !== n.pager) add(sl, 'arte', 'pager', '', '', `${P}: ${n.pager === false ? 'tirou' : 'colocou'} os pontinhos de página`, false);
  }
  return out;
}
// Pedido de ajuste do dono + aprovação do resultado = memória automática no Cérebro (vale para texto, arte e vídeo)
function registraPedido(c, agent, txt) {
  try {
    const L = jparse(c.owner_asks, []) || []; const antes = agent === 'editor' ? (c.spec || '') : agent === 'designer' ? (c.art_spec || '') : (c.script || '').slice(0, 6000);
    L.push({ agent, txt: String(txt || '').slice(0, 800), ts: T(), antes }); setContent(c.id, { owner_asks: JSON.stringify(L.slice(-6)) });
  } catch (e) { console.error('registraPedido:', e.message); }
}
function aprendePedidos(id) {
  const c = getContent(id); if (!c || !ensina(c)) return []; const L = jparse(c.owner_asks, []) || []; if (!L.length) return [];
  const out = [], fmt = fmtGrupo(c.format), marca = c.brand || '';
  for (const p of L) {
    const limpo = String(p.txt || '').split('\n').filter(l => !/^Motivos marcados pelo dono/.test(l)).join(' ').replace(/^- /, '').replace(/\s+/g, ' ').replace(/[<>]/g, '').trim().slice(0, 300); if (limpo.length < 4) continue;
    let mud = []; try { if (p.agent === 'editor' && p.antes && c.spec) mud = videoDiff(JSON.parse(p.antes), JSON.parse(c.spec)).map(d => d.txt); else if (p.agent === 'designer' && p.antes && c.art_spec) mud = arteDiff(JSON.parse(p.antes), JSON.parse(c.art_spec)).map(d => d.txt); } catch { /* sem comparação */ }
    const chave = 'pedido:' + limpo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90);
    const regra = `O dono pediu “${limpo}” e aprovou o resultado. Nas próximas peças parecidas, já entregue assim, sem esperar o pedido.`;
    const ev = `Aprovado em “${String(c.title || '').slice(0, 60)}”${mud.length ? '. O que mudou para atender: ' + mud.slice(0, 6).join('; ') : ''}`.slice(0, 600);
    const ja = one('SELECT id FROM brain_rules WHERE chave=? AND agent=? AND brand=? COLLATE NOCASE AND formato=?', chave, p.agent, marca, fmt);
    if (ja) run("UPDATE brain_rules SET weight=weight+1, status='ativa', evidence=?, updated_at=? WHERE id=?", ev, T(), ja.id);
    else run("INSERT INTO brain_rules(agent,brand,type,text,evidence,source,status,weight,formato,chave,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", p.agent, marca, 'regra', regra.slice(0, 400), ev, 'dono', 'ativa', 4, fmt, chave, T(), T());
    brainEvent(p.agent, 'preferencia_dono', c, `Você aprovou o ajuste que pediu: “${limpo.slice(0, 140)}”`, mud.length ? 'O que mudou para atender: ' + mud.slice(0, 10).join('; ') : 'Ajuste aprovado pelo dono.');
    brainLog(p.agent, `Memorizou o ajuste que você pediu e aprovou: ${limpo.slice(0, 90)}`); out.push(regra);
  }
  setContent(id, { owner_asks: '[]' }); return out;
}
// Cada ajuste aprovado fica guardado; o mesmo ajuste repetido em 2 peças da marca vira regra em teste para o agente
function aprendeDiffs(c, agent, diff) {
  const fmt = fmtGrupo(c.format), marca = c.brand || '', regras = [];
  for (const d of diff) if (d.learn) run('INSERT INTO art_edits(content_id,brand,formato,alvo,prop,dir,de,para,txt,ts) VALUES(?,?,?,?,?,?,?,?,?,?)', c.id, marca, fmt, d.alvo, d.prop, d.dir, String(d.de), String(d.para), d.txt, T());
  for (const d of diff.filter(x => x.learn)) {
    const chave = `edicao:${d.alvo}:${d.prop}:${d.dir}`;
    if (one('SELECT 1 x FROM brain_rules WHERE chave=? AND brand=? COLLATE NOCASE AND formato=?', chave, marca, fmt)) continue;
    const rep = all("SELECT content_id, para FROM art_edits WHERE brand=? COLLATE NOCASE AND formato=? AND alvo=? AND prop=? AND dir=? AND ts > datetime('now','-120 days')", marca, fmt, d.alvo, d.prop, d.dir);
    const ids = new Set(rep.map(r => r.content_id)); if (ids.size < 2) continue;
    const nums = rep.map(r => Number(r.para)).filter(Number.isFinite), med = nums.length ? Math.round(nums.reduce((a, v) => a + v, 0) / nums.length * 100) / 100 : null;
    const corpo = d.txt.replace(/^(Slide|Cena) \d+( · [^:]+)?: ?/, '');
    const regra = `Em ${agent === 'editor' ? 'vídeos' : 'artes'} de ${marca || 'todas as marcas'} (${FMT_ROTULO[fmt] || fmt || 'geral'}) o dono sempre faz o mesmo ajuste: ${corpo}${med != null && ['x', 'y', 'size', 'dur'].includes(d.prop) ? `. Valor que ele aprova em média: ${med}` : ''}. Já entregue assim, sem esperar o ajuste.`.replace(/\s+/g, ' ');
    run("INSERT INTO brain_rules(agent,brand,type,text,evidence,source,status,weight,formato,chave,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", agent, marca, 'regra', regra.slice(0, 400), `Você fez o mesmo ajuste em ${ids.size} peças e aprovou (editor visual).`, 'dono', 'teste', 3, fmt, chave, T(), T());
    brainLog(agent, `Aprendeu com as suas edições: ${regra.slice(0, 90)}`); regras.push(regra);
  }
  return regras;
}
// Aprovar uma edição ensina: guarda cada ajuste, vira molde aprovado e o ajuste repetido vira regra
function arteAprende(c, ign = []) {
  const base = jparse(c.art_spec_base), cur = jparse(c.art_spec); if (!cur) return { ajustes: 0, regras: [] };
  const diff = (base ? arteDiff(base, cur) : []).map((d, i) => ign.includes(i) ? { ...d, learn: false } : d);
  if (!ensina(c)) return { ajustes: diff.length, regras: [] };
  try { brainMoldeSalva('designer', c, { forcar: true }); } catch (e) { console.error('molde da arte:', e.message); }
  let regras = [];
  if (diff.length) { brainEvent('designer', 'arte_editada', c, `Você editou e aprovou a arte (${diff.length} ajuste${diff.length > 1 ? 's' : ''}, ${c.format})`, diff.map(d => d.txt).join('\n')); regras = aprendeDiffs(c, 'designer', diff); }
  else brainEvent('designer', 'aprovado_dono', c, `Você aprovou a arte sem precisar editar (${c.format})`, '');
  setContent(c.id, { art_spec_base: c.art_spec });
  return { ajustes: diff.length, regras, resumo: diff.slice(0, 40).map(d => d.txt) };
}

// ── Layouts salvos por marca
const layoutPub = l => { const sp = jparse(l.spec, {}); return { id: l.id, brand: l.brand, name: l.name, format: l.format, origem: l.origem, uses: l.uses, uso: l.uso || '', tema: l.tema || '', slides: (sp.slides || []).length, created_at: l.created_at, updated_at: l.updated_at || l.created_at, noticia: !!l.brand && jparse(one("SELECT value FROM settings WHERE key='radar_cfg'")?.value, {})?.marcas?.[l.brand]?.estilo === 'layout-' + l.id, thumb: fs.existsSync(path.join(LAYOUT_DIR, l.id + '.jpg')) ? `/api/art-layouts/${l.id}/thumb` : '' }; };
// Limpa cópias repetidas de layouts (mesma marca, nome e formato) que versões antigas criavam a cada aprovação
try { for (const d of all('SELECT brand, name, format, MAX(id) keep FROM art_layouts GROUP BY lower(brand), lower(name), format HAVING COUNT(*) > 1')) { for (const x of all('SELECT id FROM art_layouts WHERE brand=? COLLATE NOCASE AND name=? COLLATE NOCASE AND format=? AND id<>?', d.brand, d.name, d.format, d.keep)) { run('DELETE FROM art_layouts WHERE id=?', x.id); try { fs.rmSync(path.join(LAYOUT_DIR, x.id + '.jpg'), { force: true }); } catch { /* sem miniatura */ } } } } catch (e) { console.error('limpeza de layouts:', e.message); }
function layoutSalva(c, name, brand, origem = 'dono', meta = {}) {
  const uso = meta.uso != null ? String(meta.uso).replace(/\s+/g, ' ').trim().slice(0, 300) : null, tema = meta.tema != null ? (TEMAS[meta.tema] ? meta.tema : '') : null;
  const sp = jparse(c.art_spec); if (!sp?.slides?.length) throw fail(400, 'Esta arte ainda não tem especificação para salvar como layout');
  name = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80) || `Layout de ${c.title}`.slice(0, 80);
  delete sp.editada;
  const br = brand ?? c.brand ?? '';
  // Uma arte montada num layout salvo (notícias) e salva de novo ATUALIZA esse mesmo layout: o id não muda, então a marca continua apontando para a versão corrigida em vez de ficar com uma cópia velha
  const ref = /^l:(\d+)$/.exec(c.estilo_arte || ''), deOrigem = ref ? one('SELECT * FROM art_layouts WHERE id=?', +ref[1]) : null;
  const porNome = one('SELECT * FROM art_layouts WHERE brand=? COLLATE NOCASE AND name=? COLLATE NOCASE AND format=? ORDER BY id DESC LIMIT 1', br, name, c.format);
  const alvo = porNome || (meta.modo !== 'novo' && deOrigem && mesmaMarca(deOrigem.brand, br) && sameDims(deOrigem.format, c.format) ? deOrigem : null);
  let id, atualizado = false;
  if (alvo) {
    lixeiraGuarda('layout_versao', alvo, 'Versão anterior (antes de você salvar de novo)');
    run('UPDATE art_layouts SET spec=?, name=?, format=?, origem=?, updated_at=? WHERE id=?', JSON.stringify(sp), name, c.format, origem, T(), alvo.id); id = alvo.id; atualizado = true;
    if (uso != null && uso !== '') run('UPDATE art_layouts SET uso=? WHERE id=?', uso, id); if (tema != null && tema !== '') run('UPDATE art_layouts SET tema=? WHERE id=?', tema, id);
  } else id = +run('INSERT INTO art_layouts(brand,name,format,spec,origem,created_at,updated_at,uso,tema) VALUES(?,?,?,?,?,?,?,?,?)', br, name, c.format, JSON.stringify(sp), origem, T(), T(), uso || '', tema || '').lastInsertRowid;
  const f = arteFiles(c.id)[0];
  if (f) { try { fs.copyFileSync(path.join(ARTE_DIR(c.id), f.replace('.png', '.review.jpg')), path.join(LAYOUT_DIR, id + '.jpg')); } catch { /* sem miniatura */ } }
  log(null, `${atualizado ? 'Layout atualizado' : 'Layout salvo'} na marca ${brand ?? c.brand ?? '(geral)'}: ${name}`, c.id);
  brainLayoutSalvo(c, 'layout', name, br, 'layout:' + id);   // salvo pelo botão do editor (origem 'edicao') ou pela vitrine ('dono'): o Cérebro precisa saber dos dois
  try {
    brainSincronizaSalvos();
    const faltam = all('SELECT name FROM brands').map(b => b.name).filter(b => !mesmaMarca(b, br) && !one('SELECT 1 x FROM art_layouts WHERE brand=? COLLATE NOCASE AND format=?', b, c.format));
    if (br && faltam.length) run("INSERT INTO brain_events(ts,agent,kind,content_id,brand,title,summary,detail,tags,formato) VALUES(?,?,?,?,?,?,?,?,?,?)", T(), 'designer', 'layout_replicavel', null, br, '', `O layout “${name}” (${br}) pode servir de base para: ${faltam.join(', ')}, que ainda não têm layout de ${c.format}. Em Estúdio de arte, use “Usar em outra marca”.`.slice(0, 400), '', tagsSql([]), fmtGrupo(c.format));
    if (c.kind === 'noticia' && br && meta.adotar === true) radarAdotaLayout(br, id, name);   // só se pedirem de propósito: não troca mais o estilo das notícias sozinho
    meta.out = { id, atualizado, nome: name, faltam: br ? faltam : [] };
  } catch { /* o Cérebro sincroniza no próximo início */ }
  return id;
}
// O que o Designer recebe: o layout escolhido (obrigatório) ou os layouts salvos da marca (padrão a seguir)
function layoutTexto(l, obrig) {
  const sp = jparse(l.spec, {}), enxuto = { accent: sp.accent, ink: sp.ink, paper: sp.paper, font_asset: sp.font_asset, slides: (sp.slides || []).map(s => ({ ...s, texts: (s.texts || []).map(t => ({ ...t, value: String(t.value || '').slice(0, 60) })) })) };
  return `Layout “${l.name}” (${l.format}${obrig ? ', ESCOLHIDO PELO DONO' : ''}):\n\`\`\`json\n${JSON.stringify(enxuto).slice(0, 3800)}\n\`\`\``;
}
function layoutsBloco(c, escolhidoId) {
  const esc = escolhidoId ? one('SELECT * FROM art_layouts WHERE id=?', +escolhidoId) : null;
  const todos = all("SELECT * FROM art_layouts WHERE (brand=? COLLATE NOCASE OR brand='') ORDER BY (brand<>'') DESC, uses DESC, id DESC LIMIT 60", c.brand || '').filter(l => sameDims(l.format, c.format));
  if (!todos.length && !esc) return '';
  // o Designer vê TODOS os layouts da marca (nome, tema, quando usar) e recebe por inteiro os que mais combinam com a peça
  const tema = temaDoConteudo(c), pal = new Set(tok(`${c.title || ''} ${c.brief || ''} ${String(c.script || '').slice(0, 600)}`));
  const nota = l => (tema && l.tema === tema ? 4 : 0) + tok(`${l.name} ${l.uso || ''}`).filter(w => pal.has(w)).length + (l.brand ? 1 : 0);
  const rank = [...todos].sort((a, b) => nota(b) - nota(a) || b.uses - a.uses || b.id - a.id), rows = [];
  if (esc) rows.push(esc);
  for (const l of rank) { if (rows.length >= (esc ? 2 : 3)) break; if (!rows.some(r => r.id === l.id)) rows.push(l); }
  if (esc) run('UPDATE art_layouts SET uses=uses+1 WHERE id=?', esc.id);
  const cat = todos.map(l => `- “${l.name}” (${(jparse(l.spec, {}).slides || []).length} página(s))${l.tema ? ' · tema ' + (TEMAS[l.tema] || l.tema) : ''}${l.uso ? ' · quando usar: ' + l.uso : ''}${rows.some(r => r.id === l.id) ? ' [completo abaixo]' : ''}`).join('\n');
  return `\n\n# LAYOUTS SALVOS DA MARCA${c.brand ? ' ' + c.brand : ''}\n${esc ? 'O dono escolheu o layout marcado como ESCOLHIDO: reproduza EXATAMENTE a mesma estrutura (posições x/y, tamanhos, funções dos textos, cores, formas, sombra, itens e fundo) e troque só os textos e, se o tema pedir, o prompt "gen" do fundo mantendo o mesmo estilo.' : 'São artes que o dono montou e aprovou no editor: o padrão visual desta marca. Escolha pelo "quando usar" e pelo tema o layout que melhor combina com a peça e siga a estrutura dele (posições, tamanhos, cores, formas, sombra, itens e estilo de fundo), trocando só os textos e o tema do fundo. Se nenhum combinar, crie no mesmo espírito.'}\nCatálogo da marca:\n${cat}\n\n${rows.map(l => layoutTexto(l, esc && l.id === esc.id)).join('\n\n')}`;
}

// ───────────────────────── Ilha de edição de vídeo: o que mudou entre o spec do Editor e o spec editado ─────────────────────────
const sceneSig = s => String((Array.isArray(s.text) ? s.text : s.text ? [s.text] : []).map(t => t?.value ?? '').join(' ')).replace(/[*|]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const IN_PT = { fade: 'fade', cut: 'corte seco', zoom: 'zoom', whip: 'giro rápido', circle: 'círculo', dim: 'escurecer', none: 'nenhuma' };
function videoDiff(a, b) {
  const out = [], r2 = v => Math.round(v * 100) / 100, add = (cena, alvo, prop, de, para, txt, learn = true, dir = '') => out.push({ slide: cena, alvo: 'video:' + alvo, prop, de: de ?? '', para: para ?? '', txt, learn, dir });
  for (const k of ['accent', 'look', 'font']) if ((a?.[k] || '') !== (b?.[k] || '')) add(0, 'global', k, a?.[k], b?.[k], `Mudou ${{ accent: 'a cor de destaque', look: 'o visual do vídeo', font: 'a fonte' }[k]}: ${a?.[k] || 'padrão'} → ${b?.[k] || 'padrão'}`, k !== 'font', String(b?.[k] || ''));
  if ((a?.music_asset || '') !== (b?.music_asset || '')) add(0, 'global', 'musica', a?.music_asset, b?.music_asset, `Trocou a trilha (${a?.music_asset || 'padrão'} → ${b?.music_asset || 'padrão'})`, false);
  if ((a?.voice_asset || '') !== (b?.voice_asset || '')) add(0, 'global', 'voz', a?.voice_asset, b?.voice_asset, 'Trocou a narração', false);
  const A = a?.scenes || [], B = b?.scenes || [];
  if (A.length !== B.length) add(0, 'global', 'cenas', A.length, B.length, `Mudou a quantidade de cenas (${A.length} → ${B.length})`, true, B.length > A.length ? '+' : '-');
  const used = new Set(), pair = B.map((s, j) => { const sg = sceneSig(s); let i = sg ? A.findIndex((x, k) => !used.has(k) && sceneSig(x) === sg) : -1; if (i < 0 && j < A.length && !used.has(j)) i = j; if (i >= 0) used.add(i); return i; });
  if (pair.some((i, j) => i >= 0 && i !== j) && A.length === B.length) add(0, 'global', 'ordem', '', '', 'Reordenou as cenas', false);
  B.forEach((n, j) => {
    const i = pair[j]; if (i < 0) { add(j + 1, 'cena', 'adicionada', '', '', `Cena ${j + 1}: acrescentou uma cena`, false); return; }
    const s = A[i], P = `Cena ${j + 1}`;
    if (Math.abs((s.dur || 0) - (n.dur || 0)) >= .15) add(j + 1, 'cena', 'dur', r2(s.dur || 0), r2(n.dur || 0), `${P}: ${(n.dur || 0) > (s.dur || 0) ? 'alongou' : 'encurtou'} a duração (${r2(s.dur || 0)} s → ${r2(n.dur || 0)} s)`, true, (n.dur || 0) > (s.dur || 0) ? '+' : '-');
    if ((s.theme || 'light') !== (n.theme || 'light')) add(j + 1, 'cena', 'tema', s.theme, n.theme, `${P}: mudou o fundo da cena (${s.theme === 'dark' ? 'escuro' : 'claro'} → ${n.theme === 'dark' ? 'escuro' : 'claro'})`, true, n.theme);
    const ti = x => (typeof x.in === 'string' ? x.in : x.in?.type) || 'fade', di = ti(s), dn = ti(n);
    if (di !== dn) add(j + 1, 'cena', 'transicao', di, dn, `${P}: trocou a transição de entrada (${IN_PT[di] || di} → ${IN_PT[dn] || dn})`, true, dn);
    const ds = new Set(s.decor || []), dn2 = new Set(n.decor || []);
    for (const x of dn2) if (!ds.has(x)) add(j + 1, 'cena', 'decor+', '', x, `${P}: acrescentou a decoração “${x}”`, true, x);
    for (const x of ds) if (!dn2.has(x)) add(j + 1, 'cena', 'decor-', x, '', `${P}: tirou a decoração “${x}”`, true, x);
    const bk = x => x.bg?.asset ? 'arquivo' : 'sem'; if (bk(s) !== bk(n)) add(j + 1, 'cena', 'fundo', bk(s), bk(n), `${P}: ${bk(n) === 'arquivo' ? 'colocou' : 'tirou'} fundo da biblioteca`, true, bk(n)); else if (s.bg?.asset !== n.bg?.asset) add(j + 1, 'cena', 'fundo_troca', s.bg?.asset, n.bg?.asset, `${P}: trocou o fundo (${s.bg?.asset} → ${n.bg?.asset})`, false);
    if ((s.narration || '') !== (n.narration || '')) add(j + 1, 'cena', 'fala', '', '', `${P}: reescreveu a narração`, false);
    const Ta = Array.isArray(s.text) ? s.text : s.text ? [s.text] : [], Tb = Array.isArray(n.text) ? n.text : n.text ? [n.text] : [];
    for (let k = 0; k < Math.max(Ta.length, Tb.length); k++) {
      const x = Ta[k], y = Tb[k];
      if (x && !y) { add(j + 1, 'texto', 'removido', '', '', `${P}: tirou um bloco de texto`, true, '-'); continue; }
      if (!x && y) { add(j + 1, 'texto', 'adicionado', '', '', `${P}: acrescentou um bloco de texto`, true, '+'); continue; }
      if (x.value !== y.value) add(j + 1, 'texto', 'valor', '', '', `${P}: reescreveu o texto`, false);
      if (Math.abs((x.y ?? .42) - (y.y ?? .42)) >= .02) add(j + 1, 'texto', 'y', r2(x.y ?? .42), r2(y.y ?? .42), `${P} · texto: ${(y.y ?? .42) > (x.y ?? .42) ? 'desceu' : 'subiu'} (y ${r2(x.y ?? .42)} → ${r2(y.y ?? .42)})`, true, (y.y ?? .42) > (x.y ?? .42) ? '+' : '-');
      if ((x.size || 70) !== (y.size || 70) && Math.abs((y.size || 70) / (x.size || 70) - 1) >= .08) add(j + 1, 'texto', 'size', x.size || 70, y.size || 70, `${P} · texto: ${(y.size || 70) > (x.size || 70) ? 'aumentou' : 'diminuiu'} a letra (${x.size || 70} → ${y.size || 70})`, true, (y.size || 70) > (x.size || 70) ? '+' : '-');
      if ((x.align || 'center') !== (y.align || 'center')) add(j + 1, 'texto', 'align', x.align || 'center', y.align || 'center', `${P} · texto: mudou o alinhamento`, true, y.align || 'center');
      if ((x.mode || '') !== (y.mode || '')) add(j + 1, 'texto', 'modo', x.mode, y.mode, `${P} · texto: mudou o modo de entrada (${x.mode || 'padrão'} → ${y.mode || 'padrão'})`, true, y.mode || 'padrao');
    }
    const Ia = s.items || [], Ib = n.items || [];
    for (let k = 0; k < Math.max(Ia.length, Ib.length); k++) {
      const x = Ia[k], y = Ib[k], nm = it => it.type === 'img' || it.asset ? 'imagem' : (it.type || 'emoji');
      if (x && !y) { add(j + 1, 'item', 'removido:' + nm(x), '', '', `${P}: tirou um elemento (${nm(x)})`, true, '-'); continue; }
      if (!x && y) { add(j + 1, 'item', 'adicionado:' + nm(y), '', '', `${P}: acrescentou um elemento (${nm(y)})`, true, '+'); continue; }
      if (nm(x) !== nm(y) || (x.asset || x.value || '') !== (y.asset || y.value || '')) add(j + 1, 'item', 'troca', nm(x), nm(y), `${P}: trocou um elemento (${nm(x)} → ${nm(y)})`, false);
      if (Math.abs((x.x ?? .5) - (y.x ?? .5)) >= .03 || Math.abs((x.y ?? .5) - (y.y ?? .5)) >= .03) add(j + 1, 'item', 'pos', '', '', `${P} · ${nm(y)}: mudou de lugar`, false);
      if (x.size && y.size && Math.abs(y.size / x.size - 1) >= .12) add(j + 1, 'item', 'size:' + nm(y), x.size, y.size, `${P} · ${nm(y)}: ${y.size > x.size ? 'aumentou' : 'diminuiu'} (${x.size} → ${y.size} px)`, true, y.size > x.size ? '+' : '-');
      if ((x.enter || 'pop') !== (y.enter || 'pop')) add(j + 1, 'item', 'entrada', x.enter, y.enter, `${P} · ${nm(y)}: mudou a entrada (${x.enter || 'pop'} → ${y.enter || 'pop'})`, true, y.enter || 'pop');
      if ((x.idle || 'float') !== (y.idle || 'float')) add(j + 1, 'item', 'movimento', x.idle, y.idle, `${P} · ${nm(y)}: mudou o movimento (${x.idle || 'float'} → ${y.idle || 'float'})`, true, y.idle || 'float');
    }
  });
  return out;
}
function videoAprende(c, ign = []) {
  const base = jparse(c.spec_base), cur = jparse(c.spec); if (!cur) return { ajustes: 0, regras: [] };
  const diff = (base ? videoDiff(base, cur) : []).map((d, i) => ign.includes(i) ? { ...d, learn: false } : d);
  if (!ensina(c)) return { ajustes: diff.length, regras: [] };
  try { brainMoldeSalva('editor', c, { forcar: true }); } catch (e) { console.error('molde do vídeo:', e.message); }
  let regras = [];
  if (diff.length) { brainEvent('editor', 'video_editado', c, `Você editou e aprovou o vídeo (${diff.length} ajuste${diff.length > 1 ? 's' : ''})`, diff.map(d => d.txt).join('\n')); regras = aprendeDiffs(c, 'editor', diff); }
  else brainEvent('editor', 'aprovado_dono', c, 'Você aprovou o vídeo sem precisar editar', '');
  setContent(c.id, { spec_base: c.spec });
  return { ajustes: diff.length, regras, resumo: diff.slice(0, 40).map(d => d.txt) };
}

function zipStore(entries) {
  const parts = [], central = []; let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8'), crc = zlib.crc32(e.data) >>> 0;
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(e.data.length, 18); lh.writeUInt32LE(e.data.length, 22); lh.writeUInt16LE(name.length, 26);
    parts.push(lh, name, e.data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(e.data.length, 20); ch.writeUInt32LE(e.data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, name); off += 30 + name.length + e.data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, end]);
}

// ───────────────────────── Meta diária de produção (modo autônomo) ─────────────────────────
const QUOTA_FMTS = ['feed', 'carrossel', 'stories', 'video_vertical', 'video_horizontal'];
function localDay(iso, tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso)); } catch { return String(iso).slice(0, 10); }
}
// O que o dono pediu para hoje, o que já foi criado pelo modo autônomo e o que ainda falta. Pedidos manuais e ajustes não entram na meta.
function quotaHoje() {
  const s = settings(), { date } = localParts(s.tz);
  const dow = new Date(date + 'T12:00:00Z').getUTCDay();
  const dias = String(s.quota_days || '').split(',').filter(x => x !== '').map(Number);
  const since = new Date(Date.now() - 40 * 3600e3).toISOString();
  const rows = all("SELECT format,status,created_at FROM contents WHERE teste=0 AND created_by='autopilot' AND created_at>=?", since).filter(r => localDay(r.created_at, s.tz) === date);
  const itens = QUOTA_FMTS.map(f => {
    const meta = +s['q_' + f] || 0, mine = rows.filter(r => r.format === f);
    return { format: f, meta, criadas: mine.length, entregues: mine.filter(r => ['awaiting_approval', 'approved', 'posted'].includes(r.status)).length };
  }).filter(i => i.meta > 0 || i.criadas > 0);
  const ativo = dias.includes(dow);
  const falta = {}; let faltaTotal = 0;
  for (const i of itens) { const n = Math.max(0, i.meta - i.criadas); if (n) { falta[i.format] = n; faltaTotal += n; } }
  return { ativo, dow, date, itens, falta, faltaTotal, completa: ativo && itens.some(i => i.meta > 0) && faltaTotal === 0 };
}
function gastoImagensHoje() {
  const tz = settings().tz, d = localParts(tz).date;
  return all('SELECT ts,usd FROM gen_costs WHERE ts>=?', new Date(Date.now() - 40 * 3600e3).toISOString()).filter(r => localDay(r.ts, tz) === d).reduce((a, r) => a + r.usd, 0);
}

// ───────────────────────── Custos de imagem por IA e poses do mascote ─────────────────────────
// Estimativas em US$ por chamada (ordem de grandeza dos preços públicos do fal.ai; podem variar). Ajustáveis por variável de ambiente.
const FAL_PRECO = { fundo: +process.env.FAL_PRECO_FUNDO || (/schnell/.test(process.env.FAL_IMG_MODEL || 'schnell') ? 0.003 : 0.025), pose: +process.env.FAL_PRECO_POSE || 0.04, recorte: +process.env.FAL_PRECO_RECORTE || 0.003 };
function addCost(kind, model, usd, ref = '') { try { run('INSERT INTO gen_costs(ts,kind,model,usd,ref) VALUES(?,?,?,?,?)', T(), kind, model, usd, String(ref)); } catch { /* custo é só informativo */ } }
function custosResumo() {
  const mes = T().slice(0, 7);
  const tot = one('SELECT COALESCE(SUM(usd),0) v, COUNT(*) n FROM gen_costs WHERE ts LIKE ?', mes + '%');
  const geral = one('SELECT COALESCE(SUM(usd),0) v FROM gen_costs');
  const porTipo = all('SELECT kind, COALESCE(SUM(usd),0) usd, COUNT(*) n FROM gen_costs WHERE ts LIKE ? GROUP BY kind', mes + '%');
  return { mes_usd: tot.v, mes_n: tot.n, total_usd: geral.v, por_tipo: porTipo, precos: FAL_PRECO, modelos: { fundo: falModeloImg(), pose: process.env.FAL_POSE_MODEL || 'fal-ai/flux-pro/kontext', recorte: 'fal-ai/birefnet/v2' } };
}
const POSE_PRESETS = [
  ['acenando', 'Acenando', 'waving hello with one hand raised, friendly smile'],
  ['apontando', 'Apontando', 'pointing to the side with one index finger, confident smile'],
  ['pensando', 'Pensando', 'thinking pose with one hand on the chin, looking up'],
  ['comemorando', 'Comemorando', 'celebrating with both arms raised, very happy, jumping'],
  ['surpreso', 'Surpreso', 'surprised expression, wide eyes, mouth open, hands up'],
  ['joinha', 'Joinha', 'giving a thumbs up with a proud smile'],
  ['explicando', 'Explicando', 'explaining something, one hand open in front, other hand gesturing'],
  ['segurando-celular', 'Segurando celular', 'holding a smartphone with both hands and looking at the screen, smiling'],
  ['correndo', 'Correndo', 'running forward in a dynamic pose, energetic'],
  ['sentado', 'Sentado', 'sitting relaxed, looking at the viewer'],
  ['bracos-cruzados', 'Braços cruzados', 'standing with arms crossed, confident, slightly smirking'],
  ['triste', 'Triste', 'sad disappointed expression, shoulders down']
];
const IMG_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
// Tradução para o gerador de imagem (funciona sem a API da Anthropic: usa um modelo de texto do próprio fal.ai). O "Visual" do roteiro vem em
// português; o gerador e a troca de pose entendem muito melhor em inglês. Guardado em cache: a mesma frase não é traduzida duas vezes.
db.exec('CREATE TABLE IF NOT EXISTS traducoes(chave TEXT PRIMARY KEY, texto TEXT NOT NULL, created_at TEXT NOT NULL)');
const PT_RE = /[ãõçáéíóúâêôà]|\b(com|uma|umas|para|fundo|imagem|mascote|segurando|olhando|sentado|correndo|cena|elementos|tons|escuro|escuros|bandeira|foguete|dinheiro|celular)\b/i;
const USO_TRAD = {
  pose: 'The text is a Portuguese art direction for a social media cover. Describe ONLY what the brand mascot (the main character) is doing: pose, action, facial expression, outfit changes and props it holds. Write one English sentence, at most 30 words. Do not describe the background. Do not mention any brand.',
  cena: 'Rewrite this image prompt fully in English. Keep every English part as it is. Describe ONLY the background environment and atmosphere; remove any person, mascot or character. Answer with the prompt only.',
  pessoa: 'Translate this image prompt to natural English for a photo generator. Keep every English part as it is. Answer with the prompt only.',
  objeto: 'Translate this image prompt to natural English for a 3D object generator. Keep every English part as it is. Answer with the prompt only.',
  livre: 'Translate this image prompt to natural English for an image generator. Keep every English part as it is. Answer with the prompt only.'
};
// Prompt de imagem sem texto escrito: gerador de imagem DESENHA qualquer código de cor, palavra entre aspas ou "placa escrito X" que apareça
// no prompt (foi assim que "#0DE450" e "PLATEIA" apareceram dentro das fotos). Códigos de cor viram o nome da cor; pedidos de letreiro/placa/texto saem.
export function limpaPromptImg(txt) {
  let t = String(txt || '');
  t = t.replace(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi, (m, h) => corEmIngles('#' + h));
  t = t.replace(/["“”«»][^"“”«»]{1,80}["“”«»]/g, ' ');
  t = t.replace(/\b(?:escrit[oa]s?|escrevendo|dizendo|que diz|que escreve|that says|saying|reading|spelling|written)\s+(?:[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9!?]{2,}\s*)+/g, ' ');
  t = t.replace(/\b(?:escrit[oa]s?|escrevendo|dizendo|que diz|que escreve|that says|saying|spelling|written|lettering|typography|texto|palavras?|letras|legenda|(?:neon |led )?(?:sign(?:age)?|letreiro|placa de (?:neon|led)|cartaz|outdoor|billboard|banner)s?|with (?:the )?(?:text|words?|letters?|numbers?|logo|caption)|com (?:o |a |as |os )?(?:texto|palavras?|letras?|frase|n[úu]meros?|logo(?:tipo)?))\b/gi, ' ');
  t = t.replace(/\b(?:com|with|de|e|and|em|in)\s*(?=,|$)/gi, ' ');
  return t.replace(/\s+,/g, ',').replace(/,\s*,+/g, ',').replace(/\s{2,}/g, ' ').replace(/^[\s,]+|[\s,]+$/g, '').trim() || String(txt || '').replace(/#[0-9a-f]{3,8}\b/gi, '').trim();
}
async function emIngles(texto, uso = 'livre') {
  const t = limpaPromptImg(texto); if (!t || !falKey() || !PT_RE.test(t)) return t;
  const chave = crypto.createHash('sha1').update(uso + '|' + t).digest('hex');
  const ja = one('SELECT texto FROM traducoes WHERE chave=?', chave); if (ja) return ja.texto;
  for (const model of [process.env.FAL_LLM_MODEL, 'google/gemini-2.5-flash', 'google/gemini-flash-1.5', 'openai/gpt-4o-mini'].filter(Boolean)) {
    try {
      const r = await fetch(`${(process.env.FAL_BASE || 'https://fal.run').replace(/\/$/, '')}/fal-ai/any-llm`, { method: 'POST', signal: AbortSignal.timeout(30000), headers: { Authorization: `Key ${falKey()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, system_prompt: 'You turn Portuguese art directions into short, concrete English prompts for image generators. Output only the English text, no quotes, no explanations.', prompt: `${USO_TRAD[uso] || USO_TRAD.livre}\n\nTEXT:\n${t.slice(0, 1500)}` }) });
      if (!r.ok) continue;
      const j = await r.json().catch(() => ({})), out = String(j.output || '').replace(/^\s*["“']|["”']\s*$/g, '').replace(/\s+/g, ' ').trim();
      if (out && !j.error && out.length > 3 && !PT_RE.test(out.replace(/\b(com|para)\b/gi, ''))) { run('INSERT OR REPLACE INTO traducoes(chave,texto,created_at) VALUES(?,?,?)', chave, out.slice(0, 1200), T()); return out.slice(0, 1200); }
    } catch { /* tenta o próximo modelo */ }
  }
  return t;   // sem tradução: segue em português (o gerador entende parte)
}
async function falPost(model, body, timeout = 170000) {
  const key = falKey(); if (!key) throw new Error(falPausado() ? 'fal.ai em standby (Configurações › Vídeo e voz): nada foi cobrado' : 'FAL_KEY não configurada no .env');
  const lim = +settings().img_budget_day || 0; if (lim > 0 && gastoImagensHoje() >= lim) throw new Error(`Limite diário de gasto com imagens por IA atingido (US$ ${lim.toFixed(2)}). Aumente em Configurações › Automação se quiser continuar hoje.`);
  const r = await fetch(`${(process.env.FAL_BASE || 'https://fal.run').replace(/\/$/, '')}/${model}`, { method: 'POST', signal: AbortSignal.timeout(timeout), headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const t = await r.text(); if (!r.ok) throw new Error(`fal HTTP ${r.status}: ${t.slice(0, 220)}`);
  return JSON.parse(t);
}
async function falBaixar(u) { const im = await fetch(u, { signal: AbortSignal.timeout(90000) }); if (!im.ok) throw new Error('Não consegui baixar a imagem gerada'); return Buffer.from(await im.arrayBuffer()); }
// Mesmo personagem em outra pose: edição guiada pela imagem do mascote (Kontext) + recorte de fundo (BiRefNet). Devolve PNG transparente.
async function falPose(mascotAsset, desc, ref = '') {
  desc = await emIngles(desc, 'pose');
  const file = path.join(ASSET_DIR, mascotAsset.id + '.' + mascotAsset.ext), mime = IMG_MIME[mascotAsset.ext];
  if (!mime || !fs.existsSync(file)) throw new Error(`O arquivo “${mascotAsset.name}” precisa ser PNG, JPG ou WebP para servir de referência`);
  const modelo = process.env.FAL_POSE_MODEL || 'fal-ai/flux-pro/kontext';
  const prompt = `Keep this exact same character: identical face, skin tone, hair, body proportions, brand colors, art style and line quality. Do not redesign the character. Keep the usual outfit unless the description below asks for a different outfit or props. ${(() => { const t = mascoteFichaTexto(mascotAsset, true); return t ? 'CHARACTER SHEET (must be respected exactly, in Portuguese): ' + t.slice(0, 900) + '. ' : ''; })()}Change the pose, expression, outfit and props to: ${String(desc).replace(/[<>]/g, '').slice(0, 300)}. The character must stay instantly recognizable. Full body visible, centered, plain solid white background, no text, no extra characters, no shadows.`;
  const j = await falPost(modelo, { prompt, image_url: `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`, aspect_ratio: '1:1', output_format: 'png', num_images: 1, safety_tolerance: '5' });
  const u = j.images?.[0]?.url; if (!u) throw new Error('O modelo de imagem respondeu sem imagem');
  addCost('pose', modelo, FAL_PRECO.pose, ref);
  let png;
  try { const c = await falPost(process.env.FAL_BG_MODEL || 'fal-ai/birefnet/v2', { image_url: u }, 120000); const cu = c.image?.url || c.images?.[0]?.url; if (!cu) throw new Error('sem recorte'); png = await falBaixar(cu); addCost('recorte', 'birefnet', FAL_PRECO.recorte, ref); }
  catch { png = await falBaixar(u); }   // sem recorte: segue com o fundo branco original
  return png;
}
const poseQueue = []; let poseBusy = 0;
function poseDrain() {
  while (poseBusy < 2 && poseQueue.length) {
    const id = poseQueue.shift(); poseBusy++;
    (async () => {
      const p = one('SELECT * FROM poses WHERE id=?', id); if (!p) return;
      try {
        const m = one("SELECT * FROM assets WHERE name=? AND brand=? COLLATE NOCASE", p.mascot, p.brand) || one("SELECT * FROM assets WHERE name=? AND brand=''", p.mascot);
        if (!m) throw new Error(`Mascote “${p.mascot}” não encontrado nos arquivos`);
        const png = await falPose(m, p.desc, 'pose' + id);
        fs.writeFileSync(path.join(POSE_DIR, id + '.png'), png);
        run("UPDATE poses SET status='pendente', error='', cost=cost+? WHERE id=?", FAL_PRECO.pose + FAL_PRECO.recorte, id);
      } catch (e) { run("UPDATE poses SET status='erro', error=? WHERE id=?", String(e.message).slice(0, 300), id); }
      changed();
    })().finally(() => { poseBusy--; poseDrain(); });
  }
}
function poseEnqueue(id) { poseQueue.push(id); poseDrain(); }

// ───────────────────────── Gerente (agente-chefe): conversa com o dono e executa o que ele manda ─────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS chat_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, role TEXT NOT NULL, agent TEXT DEFAULT '', text TEXT NOT NULL, actions TEXT DEFAULT '', job_id INTEGER);
CREATE TABLE IF NOT EXISTS agent_versions(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, agent TEXT NOT NULL, field TEXT NOT NULL, antes TEXT DEFAULT '', depois TEXT DEFAULT '', nota TEXT DEFAULT '', undone INTEGER DEFAULT 0);
`);
const AGENT_ALIAS = { 'revisor de copy': 'revisorcopy', 'revisor copy': 'revisorcopy', revisorcopy: 'revisorcopy', roteirista: 'roteirista', designer: 'designer', editor: 'editor', revisor: 'gerente', gerente: 'chefe', chefe: 'chefe', 'social media': 'publicador', social: 'publicador', publicador: 'publicador' };
const agId = v => { const k = String(v || '').toLowerCase().trim(); const id = AGENT_ALIAS[k] || k; return one('SELECT id FROM agents WHERE id=?', id) ? id : (one('SELECT id FROM agents WHERE nick<>\'\' AND lower(nick)=?', k)?.id || null); };
const addChat = (role, text, extra = {}) => { const r = run('INSERT INTO chat_msgs(ts,role,agent,text,actions,job_id) VALUES(?,?,?,?,?,?)', T(), role, extra.agent || '', String(text || '').slice(0, 30000), extra.actions ? JSON.stringify(extra.actions) : '', extra.job || null); run('DELETE FROM chat_msgs WHERE id < (SELECT MAX(id) FROM chat_msgs) - 400'); changed(); return +r.lastInsertRowid; };
const clip = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
// build .138: cada estilo passa a ter UMA marca dona. Estilos já salvos viram da marca em que foram ajustados; ajustes de várias marcas viram uma cópia por marca; o original da casa volta nas outras
try {
  if (!one("SELECT 1 FROM settings WHERE key='mig_tpl_brand'")) {
    for (const r of all('SELECT * FROM art_templates ORDER BY id').filter(x => !x.central)) {   // a coluna central só nasce mais adiante: filtra aqui, sem depender dela
      const mp = visMapa(r), ks = Object.keys(mp).filter(k => mp[k]?.brand); if (r.brand && !r.base) continue;
      const dono = (ks.find(k => mp[k].brand.toLowerCase() === String(r.visual_brand || '').toLowerCase()) ?? ks[0]); if (dono === undefined) { if (!r.base && !r.brand && r.visual_brand) run('UPDATE art_templates SET brand=? WHERE id=?', r.visual_brand, r.id); continue; }
      const casa = r.base || '';
      for (const k of ks) if (k !== dono) {   // uma cópia para cada outra marca que tinha ajuste
        run('INSERT INTO art_templates(nome,uso,nivel,formatos,seq,exemplo,brand,created_at,visual,visual_brand,visual_at,tema,deriva) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', r.nome, r.uso, r.nivel, r.formatos, r.seq, '', mp[k].brand, r.created_at, JSON.stringify({ [k]: mp[k] }), mp[k].brand, mp[k].at || '', r.tema || '', casa || 'dono-' + r.id);
      }
      run('UPDATE art_templates SET brand=?, base=?, deriva=?, visual=?, visual_brand=? WHERE id=?', mp[dono].brand, '', casa || r.deriva || '', JSON.stringify({ [dono]: mp[dono] }), mp[dono].brand, r.id);
    }
    run("INSERT OR IGNORE INTO settings(key,value) VALUES('mig_tpl_brand','1')");
  }
} catch (e) { console.error('migração de estilos por marca:', e.message); }
try { if (!one("SELECT 1 FROM settings WHERE key='mig_pose_off'")) { run("UPDATE settings SET value='0' WHERE key='max_pose_gen'"); run("INSERT OR IGNORE INTO settings(key,value) VALUES('mig_pose_off','1')"); } } catch { /* sem a tabela ainda */ }   // build .134: o mascote deixa de ser redesenhado por IA (volta a ligar em Configurações)
const SETTING_KEYS = ['arte_do_roteiro', 'copy_review', 'autopilot', 'per_day', 'start_hour', 'report_hour', 'score_min', 'max_revisions', 'max_jobs_day', 'concurrency', 'approve_script', 'auto_produce', 'art_gen', 'fal_pausa', 'max_art_gen', 'max_pose_gen', 'img_budget_day', 'q_feed', 'q_carrossel', 'q_stories', 'q_video_vertical', 'q_video_horizontal', 'quota_days', 'carousel_slides', 'stories_slides', 'video_secs', 'themes', 'web_search', 'pacote_ia'];

// Foto do sistema que o Gerente lê em toda conversa (dados reais: ele não pode inventar além disto)
function gerenteSnapshot(msg) {
  const s = settings(), q = quotaHoje(), L = [];
  L.push(`Hoje: ${q.date} · modo autônomo ${s.autopilot === '1' ? 'LIGADO' : 'desligado'} · meta do dia ${q.ativo ? (q.itens.filter(i => i.meta > 0).map(i => `${i.format} ${i.criadas}/${i.meta}`).join(', ') || 'sem meta') : 'dia sem produção automática'} · tarefas hoje ${one('SELECT COUNT(*) n FROM jobs WHERE day=? AND kind NOT IN (\'chat\',\'teste\')', today()).n}/${s.max_jobs_day}`);
  L.push('Peças por situação: ' + (all('SELECT status, COUNT(*) n FROM contents WHERE teste=0 GROUP BY status').map(r => `${r.status} ${r.n}`).join(', ') || 'nenhuma ainda'));
  const fila = all("SELECT kind, status, COUNT(*) n FROM jobs WHERE status IN ('queued','running') GROUP BY kind, status");
  L.push('Fila de tarefas: ' + (fila.map(r => `${r.kind} (${r.status}) ${r.n}`).join(', ') || 'vazia'));
  const cs = custosResumo(); L.push(`Custo de imagens por IA no mês: US$ ${(+cs.mes_usd).toFixed(2)} (${cs.mes_n} chamadas)`);
  L.push('\nCONFIGURAÇÕES QUE VOCÊ PODE MUDAR (chave = valor atual): ' + SETTING_KEYS.map(k => `${k}=${clip(s[k], 60)}`).join(' · '));
  const brands = all('SELECT name FROM brands ORDER BY name').map(b => b.name), prods = all('SELECT id,name FROM products ORDER BY name').slice(0, 30);
  L.push(`Marcas: ${brands.join(', ') || 'nenhuma'} · Produtos: ${prods.map(p => p.name).join(', ') || 'nenhum'}`);
  L.push('\nEQUIPE:');
  const lower = String(msg || '').toLowerCase();
  for (const a of all('SELECT * FROM agents ORDER BY id')) {
    const citado = lower.includes(a.id) || lower.includes(a.name.toLowerCase());
    L.push(`- ${a.name} (id ${a.id}, ${a.enabled ? 'ligado' : 'DESLIGADO'}): ${a.role}`);
    if ((a.learn || '').trim()) L.push(`  aprender: ${clip(a.learn, citado ? 2500 : 400)}`);
    if ((a.avoid || '').trim()) L.push(`  evitar: ${clip(a.avoid, citado ? 2500 : 400)}`);
    if (citado && a.id !== 'chefe') L.push(`  PROMPT COMPLETO DE ${a.name.toUpperCase()}:\n${a.prompt}`);
  }
  const regras = all("SELECT id,agent,brand,type,text,status,created_at,source,usos FROM brain_rules WHERE status='ativa' ORDER BY weight DESC, id DESC LIMIT 25");
  L.push('\nCÉREBRO (regras ativas): ' + (regras.map(r => { const im = ruleImpacto(r), ef = im && im.depois.ok + im.depois.bad >= 3 ? ` {antes ${im.antes.ok}✓/${im.antes.bad}✗ → depois ${im.depois.ok}✓/${im.depois.bad}✗}` : ''; return `[#${r.id} ${r.agent}${r.brand ? '/' + r.brand : ''}/${r.type}] ${clip(r.text, 170)}${ef}`; }).join(' | ') || 'nenhuma'));
  { const ev = all("SELECT agent,kind,summary,detail FROM brain_events WHERE ts > datetime('now','-30 days')");
    const linhas = all('SELECT id,name FROM agents').map(a => { const m = ev.filter(e => e.agent === a.id), ok = m.filter(e => BRAIN_OK.includes(e.kind)).length, bad = m.filter(e => BRAIN_BAD.includes(e.kind)); if (!ok && !bad.length) return ''; const mot = bad.slice(0, 2).map(e => clip((e.detail.match(/(?:Motivo[^:]*|Problemas): ([^\n]*)/) || [])[1] || e.summary, 90)).join(' / '); return `${a.name}: ${ok} aprovado(s), ${bad.length} reprovado(s)${mot ? ' — motivos: ' + mot : ''}`; }).filter(Boolean);
    L.push('\nAPRENDIZADO (30 dias): ' + (linhas.join(' | ') || 'ainda sem sinais')); }
  { const sd = saude(); L.push('\nSAÚDE DO SISTEMA: ' + (sd.filter(x => x.nivel !== 'info').map(x => `[${x.nivel}] ${x.titulo} — ${clip(x.detalhe, 120)}`).join(' | ') || 'sem problemas detectados') + (sd.some(x => x.nivel === 'info') ? ' · avisos: ' + sd.filter(x => x.nivel === 'info').map(x => x.titulo).join('; ') : '')); }
  { const es = all('SELECT brand, proposta FROM art_styles'); L.push('\nESTILOS DE ARTE: ' + (es.length ? es.map(x => (x.brand || 'geral') + (x.proposta ? ' (tem sugestão esperando OK)' : ' (definido)')).join(', ') : 'nenhum definido ainda')); }
  L.push('\nÚLTIMAS PEÇAS:');
  for (const c of all('SELECT id,title,format,kind,status,score,brand,created_by,error FROM contents WHERE teste=0 ORDER BY id DESC LIMIT 15')) L.push(`- #${c.id} "${clip(c.title, 70)}" · ${c.format}/${c.kind} · ${c.status}${c.score != null ? ' · nota ' + Number(c.score).toFixed(1) : ''}${c.brand ? ' · ' + c.brand : ''}${c.error ? ' · ERRO: ' + clip(c.error, 100) : ''}`);
  L.push('\nATIVIDADE RECENTE: ' + all('SELECT ts,agent,message FROM activity ORDER BY id DESC LIMIT 12').map(a => clip(a.message, 110)).join(' | '));
  const vs = all('SELECT id,ts,agent,field,nota,undone FROM agent_versions ORDER BY id DESC LIMIT 8');
  if (vs.length) L.push('MUDANÇAS RECENTES NO TREINAMENTO (use "desfazer" com a versão): ' + vs.map(v => `v${v.id} ${v.agent}/${v.field}${v.undone ? ' (desfeita)' : ''}: ${clip(v.nota, 80)}`).join(' | '));
  return L.join('\n');
}

// Ordens escritas à mão no chat do Gerente, entendidas sem IA (modo sem API): devolve a lista de ações ou null (aí vira pedido para o Claude)
// Perguntas de acompanhamento respondidas pelo próprio painel (sem API e sem gastar nada): produção, pendências, Cérebro, saúde, erros por agente
function gerenteLocal(texto) {
  const t = String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  let m;
  const nome = id => one('SELECT name FROM agents WHERE id=?', id)?.name || id, ST = { awaiting_script: 'com roteiro esperando você', producing: 'em produção', awaiting_approval: 'pronta(s) para você aprovar', blocked: 'travada(s), esperando decisão', approved: 'aprovada(s)', posted: 'postada(s)' };
  if (/^(ajuda|help|comandos|o que (voce|vc) (sabe|consegue|pode) fazer|como (te|voce) uso)\b/.test(t)) return `O que eu faço na hora, com ou sem API:
- Status: "status", "o que está pendente", "tem algum erro?", "o que o Cérebro aprendeu", "qual agente erra mais", "peça #12"
- Produção: "crie um carrossel sobre X para a marca Y" (vai para o Roteirista), "gere 3 pautas para a marca Y sobre X"
- Arte no estilo, sem IA: "monte um carrossel de 7 páginas da marca Y no estilo sobre: Título da capa" (abre em Estúdio de arte)
- Aprovar e ajustar: "aprove a peça #12", "aprove tudo", "ajuste a arte #12: deixe o título maior", "refaça a arte #12", "reprocesse a #12"
- Treinar os agentes: "ensine o designer: sempre use a logo no topo", "ensine o editor: nunca use transição giratória", "adicione ao conhecimento do designer: Título | texto do documento"
- Cérebro: "memorize que nunca usamos emoji", "mude a regra #5 para ...", "arquive a regra #5", "aprenda agora", "desfaça a última mudança"
- Marcas e ajustes: "crie a marca Nome", "ligue o modo autônomo", "desligue o modo autônomo", "gere o relatório", "o que o designer sabe"`;
  if ((m = t.match(/^(o que|quanto) (o |a )?(roteirista|designer|editor|revisor|social media|publicador|gerente|revisor de copy)\b.*(sabe|conhece|aprendeu)|^(mostre|liste|veja) (o )?(conhecimento|a base|as regras) d[oa] (roteirista|designer|editor|revisor|social media|publicador|gerente)/))) {
    const ag = agId(m[3] || m[8]); if (ag) { const docs = all('SELECT titulo,modo FROM agent_docs WHERE agent=? ORDER BY ordem', ag), rs = all("SELECT text FROM brain_rules WHERE agent IN (?, '*') AND status IN ('ativa','teste') ORDER BY weight DESC, updated_at DESC LIMIT 6", ag), a = agentRow(ag);
      return `${a.name} tem ${docs.length} documento(s) na base${docs.length ? ':\n' + docs.map(d => `- ${d.titulo}${d.modo === 'auto' ? ' (quando o assunto pede)' : ''}`).join('\n') : '.'}\n${(a.learn || '').split('\n').filter(Boolean).length} regra(s) de "aprender" e ${(a.avoid || '').split('\n').filter(Boolean).length} de "evitar" no treinamento.${rs.length ? '\nDo Cérebro, as que mais pesam:\n' + rs.map(r => '- ' + clip(r.text, 140)).join('\n') : ''}`; }
  }
  if (/^(quais|liste|mostre) (as )?marcas|^marcas$/.test(t)) { const bs = all('SELECT name FROM brands ORDER BY name'); return bs.length ? `Marcas cadastradas (${bs.length}): ${bs.map(b => b.name).join(', ')}.` : 'Nenhuma marca cadastrada ainda. Diga "crie a marca Nome".'; }
  if ((m = t.match(/^(como esta|status|e a|veja|mostre)? ?(a )?(peca|arte|conteudo) #?(\d{1,6})\??$/))) {
    const c = getContent(+m[4]); if (!c) return `Não encontrei a peça #${m[4]}.`; const a = c.art_spec ? arteInfo(c.id) : null;
    return `#${c.id} “${c.title}” (${FMT_ROTULO[c.format] || c.format}${c.brand ? ', ' + c.brand : ''}): ${ST[c.status] || c.status}.${a ? ` Arte: ${a.files.length} imagem(ns)${a.status === 'running' ? ', gerando agora' : ''}.` : ''}${c.error ? ' Erro: ' + clip(c.error, 160) : ''}`;
  }
  if (/saude|tem (algum )?(erro|problema)|esta (tudo )?(ok|funcionando)/.test(t)) {
    const sd = saude().filter(x => x.nivel !== 'info'); return sd.length ? `Pontos de atenção:\n${sd.map(x => `- ${x.titulo}: ${clip(x.detalhe, 160)}`).join('\n')}` : 'Tudo certo: nenhuma falha nem tarefa travada.';
  }
  if (/(como (esta|anda|vai)|status|resumo|panorama).*(producao|hoje|dia|equipe|sistema)|^(status|resumo)\b|o que (esta|tem) pendente|pendencias|o que precisa de mim|o que falta/.test(t)) {
    const cs = all("SELECT id,title,status,format FROM contents WHERE teste=0 AND status NOT IN ('approved','posted') ORDER BY id DESC LIMIT 40"), q = quotaHoje(), sset = settings();
    const fila = all("SELECT agent,kind,status FROM jobs WHERE status IN ('queued','running','waiting')"), por = k => cs.filter(c => c.status === k);
    const L = [`Produção agora: ${cs.length ? cs.length + ' peça(s) em andamento' : 'nenhuma peça em andamento'}.`];
    for (const k of ['awaiting_approval', 'awaiting_script', 'blocked', 'producing']) { const x = por(k); if (x.length) L.push(`- ${x.length} ${ST[k]}: ${x.slice(0, 4).map(c => `#${c.id} ${clip(c.title, 50)}`).join('; ')}${x.length > 4 ? '…' : ''}`); }
    if (fila.length) L.push(`- ${fila.length} tarefa(s) na fila${MANUAL ? ' (no modo chat, cada uma vira um pedido para você colar no Claude: veja o Dashboard)' : ''}.`);
    L.push(`Modo autônomo: ${sset.autopilot === '1' ? 'ligado' : 'desligado'}.` + (q.itens.length ? ` Meta de hoje: ${q.itens.map(i => `${i.criadas}/${i.meta} ${i.format}`).join(', ')}.` : ''));
    const prox = por('awaiting_approval')[0] || por('awaiting_script')[0] || por('blocked')[0]; if (prox) L.push(`Próximo passo: abrir #${prox.id} "${clip(prox.title, 60)}" (${ST[prox.status]}).`);
    return L.join('\n');
  }
  if (/(o que|quais).*(cerebro|aprendeu|regras)|regras (ativas|do cerebro)/.test(t)) {
    const rs = all("SELECT agent,text,weight FROM brain_rules WHERE status IN ('ativa','teste') ORDER BY updated_at DESC LIMIT 8"), n = one("SELECT COUNT(*) n FROM brain_rules WHERE status IN ('ativa','teste')").n;
    return rs.length ? `O Cérebro tem ${n} regra(s) valendo. As mais recentes:\n${rs.map(r => `- ${r.agent === '*' ? 'Todos' : nome(r.agent)}: ${clip(r.text, 140)}`).join('\n')}` : 'O Cérebro ainda não tem regras. Elas nascem quando você aprova, reprova com motivo ou pede ajustes.';
  }
  if (/(qual|que) agente.*(erra|errou|mais ajuste|pior)|quem (mais )?erra/.test(t)) {
    const r = all("SELECT agent, COUNT(*) n FROM brain_events WHERE kind IN ('revisao_reprovada','entrega_reprovada','ajuste_dono','checagem_falhou') AND ts > datetime('now','-30 days') GROUP BY agent ORDER BY n DESC");
    return r.length ? `Devoluções nos últimos 30 dias:\n${r.map(x => `- ${nome(x.agent)}: ${x.n}`).join('\n')}\nO Cérebro usa esses motivos para criar regras para cada um.` : 'Nenhuma devolução registrada nos últimos 30 dias.';
  }

  return null;
}
function gerenteInterpreta(texto) {
  const orig = String(texto || '').trim(), t = orig.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
  const num = x => { const m = x.match(/#?\b(\d{1,6})\b/); return m ? +m[1] : null; };
  const resto = re => { re = new RegExp(re.source, 'i'); const m = orig.normalize('NFD').replace(/[̀-ͯ]/g, '').match(re); return m ? orig.slice(m.index + m[0].length).replace(/^[\s:,\-–—]+/, '').trim() : ''; };
  const marcas = all('SELECT name FROM brands').map(b => b.name), marcaEm = x => marcas.find(m => x.includes(m.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase())) || '';
  const AG = '(roteirista|designer|editor|social media|publicador|revisor de copy|revisor copy|revisor|gerente|cerebro)';
  let m;
  if (/^(aprov\w+|libere\w*) (tudo|todas?|todos|tudo que (esta|estiver) pendente)\b/.test(t)) {
    const ac = all("SELECT id,status FROM contents WHERE teste=0 AND status IN ('awaiting_script','awaiting_approval') ORDER BY id").map(c => ({ acao: c.status === 'awaiting_script' ? 'aprovar_roteiro' : 'aprovar_final', id: c.id }));
    if (!ac.length) throw new Error('não há nada esperando a sua aprovação'); return ac;
  }
  if ((m = t.match(/^(aprov\w+|libere\w*) (o |a )?(roteiro|entrega|arte|video|peca|conteudo|final)?\s*(#|n[o°º]? ?)?(\d{1,6})\b/))) { const c = getContent(+m[5]); if (!c) throw new Error(`a peça #${m[5]} não existe`); return [{ acao: m[3] === 'roteiro' || c.status === 'awaiting_script' ? 'aprovar_roteiro' : 'aprovar_final', id: c.id }]; }
  if ((m = t.match(/^(reprocess\w+|refaca a revisao d\w+|revise de novo) (a |o )?(peca |conteudo )?#?(\d{1,6})\b/))) return [{ acao: 'reprocessar', id: +m[4] }];
  if (/^(ligue|ative|liga|ativar|ligar)\b.*\b(modo autonomo|piloto automatico|autonomo)\b/.test(t)) return [{ acao: 'configurar', chave: 'autopilot', valor: '1' }];
  if (/^(desligue|desative|desliga|desativar|desligar|pare)\b.*\b(modo autonomo|piloto automatico|autonomo)\b/.test(t)) return [{ acao: 'configurar', chave: 'autopilot', valor: '0' }];
  if (/^(aprenda agora|rode o cerebro|rodar o cerebro|cerebro,? aprenda|aprender agora)\b/.test(t)) return [{ acao: 'rodar_cerebro' }];
  if (/^(gere|faca|crie|me de|gerar|fazer) (o )?relatorio\b/.test(t)) return [{ acao: 'gerar_relatorio' }];
  if ((m = t.match(/^(gere|gerar|crie|criar|faca|fazer|me de|proponha|sugira) (\d{1,2}|uma|duas|tres|quatro|cinco) pautas?\b(.*)$/))) { const n = { uma: 1, duas: 2, tres: 3, quatro: 4, cinco: 5 }[m[2]] || +m[2]; const tema = (m[3].match(/\b(?:sobre|tema|foco)\s+(.+)$/) || [])[1] || ''; return [{ acao: 'gerar_pautas', quantidade: n, marca: marcaEm(m[3]), tema: tema ? orig.slice(orig.toLowerCase().lastIndexOf(tema.slice(0, 6))).slice(0, 400) : '' }]; }
  if ((m = t.match(/^(aprender|aprenda|estude) (o )?estilo( de arte)?( d\w+)?\b(.*)$/))) return [{ acao: 'aprender_estilo', marca: marcaEm(m[5]) }];
  if ((m = t.match(/^(arquive|arquivar|apague a regra|remova a regra) (a )?(regra )?#?(\d{1,6})\b/))) return [{ acao: 'arquivar_regra', id: +m[4] }];
  if ((m = t.match(new RegExp('^(teste|testar|rode um teste (no|na|do|da)|peca (ao|a|para o|para a)) (o |a )?' + AG + '\\b (com|:|para|fazendo|sobre)?\\s*')))) { const ped = resto(new RegExp('^(teste|testar|rode um teste (no|na|do|da)|peca (ao|a|para o|para a)) (o |a )?' + AG + '\\b\\s*(com|:|para|fazendo|sobre)?\\s*')); if (ped.length >= 8) return [{ acao: 'testar_agente', agente: m[5], pedido: ped, marca: marcaEm(t) }]; }
  if ((m = t.match(new RegExp('^(ensine|ensinar|treine|treinar|ordem para|regra para) (o |a |ao |as? )?' + AG + '\\b')))) { const r = resto(new RegExp('^(ensine|ensinar|treine|treinar|ordem para|regra para) (o |a |ao |as? )?' + AG + '\\b\\s*(que|:|a|para)?\\s*')); if (r.length >= 6) return [{ acao: 'ensinar_agente', agente: m[3], tipo: /^(nunca|jamais|evite|nao )/.test(r.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()) ? 'evitar' : 'aprender', regra: r }]; }
  if ((m = t.match(/^(guarde|memorize|lembre|anote|salve)( isso)?( no cerebro| na memoria)?\b/))) { const r = resto(/^(guarde|memorize|lembre|anote|salve)( isso)?( no cerebro| na memoria)?( que)?\s*/); if (r.length >= 6) return [{ acao: 'memorizar', agente: 'todos', tipo: /^(nunca|jamais|evite|nao )/.test(r.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()) ? 'evitar' : 'regra', texto: r, marca: marcaEm(t) }]; }
  if ((m = t.match(/^(ajuste|ajustar|peca ajuste|pedir ajuste|corrija|corrigir|refaca|refazer) (a |o )?(peca |conteudo |arte |roteiro )?(#|n[o°º]? ?)?(\d{1,6})\b/))) { const ajustes = resto(/^(ajuste|ajustar|peca ajuste|pedir ajuste|corrija|corrigir|refaca|refazer) (a |o )?(peca |conteudo |arte |roteiro )?(#|n[o°º]? ?)?(\d{1,6})\b[\s:,\-–—]*(na|no|da|do)?\s*(peca|arte|roteiro)?[\s:,\-–—]*/); if (ajustes.length >= 6) return [{ acao: 'ajustar_peca', id: +m[5], alvo: /\broteiro|texto|legenda\b/.test(t) && !/\barte|visual|imagem|design\b/.test(t) ? 'roteirista' : 'designer', ajustes }]; }
  // conhecimento do agente: "adicione ao conhecimento do designer: Título | texto" (vira documento na base dele)
  if ((m = t.match(new RegExp('^(adicione|adiciona|coloque|coloca|acrescente|inclua|salve|guarde|crie um documento|crie documento) (isso |um documento |documento )?(no|ao|na|para o|para a|pro|pra) (conhecimento|base|treinamento)? ?(d[oa] |do agente |ao )?' + AG + '\\b')))) {
    const r = resto(new RegExp('^(adicione|adiciona|coloque|coloca|acrescente|inclua|salve|guarde|crie um documento|crie documento) (isso |um documento |documento )?(no|ao|na|para o|para a|pro|pra) (conhecimento|base|treinamento)? ?(d[oa] |do agente |ao )?' + AG + '\\b\\s*(:|que|-)?\\s*'));
    if (r.length >= 10) { const [tit, ...corpo] = r.split(/\s*\|\s*|\n/); return [{ acao: 'conhecimento_agente', agente: m[6], titulo: corpo.length ? tit.slice(0, 120) : r.split(/[.!?\n]/)[0].slice(0, 80), texto: corpo.length ? corpo.join('\n') : r }]; }
  }
  if ((m = t.match(/^(crie|cadastre|criar|cadastrar|adicione) (a |uma )?(nova )?marca\s+(.{2,60})$/))) return [{ acao: 'criar_marca', nome: orig.slice(orig.length - m[4].length).replace(/^["“]|["”]$/g, '').trim() }];
  if (/^(desfaca|desfazer|volte|reverta) (a )?(ultima|ultimo) (mudanca|alteracao|treinamento|ensino)/.test(t)) { const v = one('SELECT id FROM agent_versions WHERE undone=0 ORDER BY id DESC LIMIT 1'); if (!v) throw new Error('não há mudança para desfazer'); return [{ acao: 'desfazer', versao: v.id }]; }
  if ((m = t.match(/^(mude|troque|reescreva|altere) a regra #?(\d{1,6}) (para|por)\s+/))) return [{ acao: 'editar_regra', id: +m[2], texto: resto(/^(mude|troque|reescreva|altere) a regra #?(\d{1,6}) (para|por)\s+/) }];
  if ((m = t.match(/^(gere|gerar|renderize|renderizar|refaca|refazer) (as imagens|a imagem|a arte|o png)( da| de)? (peca |arte )?#?(\d{1,6})\b/))) return [{ acao: 'renderizar_arte', id: +m[5], regen: /refa/.test(m[1]) }];
  // roteiro colado no chat no modelo do dono ("📌 Slide 1 — CAPA"…): vira arte no estilo aprovado na hora
  { const pgs = lerRoteiroModelo(orig); if (pgs.length && (pgs.length > 1 || /^(monte|montar|faca|fazer|crie|criar|gere|gerar)\b/.test(t))) return [{ acao: 'montar_arte', formato: /\b(stories|story)\b|tela 1\b/.test(t) ? 'stories' : pgs.length > 1 ? 'carrossel' : 'feed', marca: marcaEm(t), roteiro: orig }]; }
  // arte avulsa no ESTILO aprovado (sem API): "monte um carrossel de 7 páginas da Central sobre: O digital | não é *mágico*"
  if ((m = t.match(/^(monte|montar|faca|fazer|crie|criar|gere|gerar) (um |uma )?(arte|post|carrossel|carrosel|stories|story)\b.*\b(no estilo|com o estilo|avuls[ao]|no estudio)\b/)) || (m = t.match(/^(monte|montar) (um |uma )?(arte|post|carrossel|carrosel|stories|story)\b/))) {
    const f = /carros/.test(m[3]) ? 'carrossel' : /stor/.test(m[3]) ? 'stories' : 'feed', pg = (t.match(/\b(\d{1,2}) (paginas|slides|telas)\b/) || [])[1];
    const tit = (orig.match(/(?:sobre|tema|titulo|título)\s*:?\s*["“]?([^"”\n]{3,120})["”]?\s*$/i) || [])[1] || '';
    const temaF = /\bnot[ií]cia/.test(t) ? 'noticia' : /\b(oferta|promo[cç][aã]o|desconto)/.test(t) ? 'oferta' : /\b(tutorial|passo a passo)/.test(t) ? 'tutorial' : /\blista\b/.test(t) ? 'lista' : /\bopini[aã]o/.test(t) ? 'opiniao' : /\b(educativo|mitos?)\b/.test(t) ? 'educativo' : undefined;
    return [{ acao: 'montar_arte', formato: f, paginas: pg ? +pg : undefined, marca: marcaEm(t), titulo: tit.trim(), tema: temaF }];
  }
  if ((m = t.match(/^(crie|criar|faca|fazer|novo|nova|monte|produza|produzir|gere|gerar) (um |uma |o )?(carrossel|carrosel|post|feed|stories|story|reels?|video vertical|video horizontal|video|reel)\b/))) {
    const f = /carros/.test(m[3]) ? 'carrossel' : /stor/.test(m[3]) ? 'stories' : /horizontal/.test(m[3]) ? 'video_horizontal' : /reel|video/.test(m[3]) ? 'video_vertical' : 'feed';
    const r = resto(/^(crie|criar|faca|fazer|novo|nova|monte|produza|produzir|gere|gerar) (um |uma |o )?(carrossel|carrosel|post|feed|stories|story|reels?|video vertical|video horizontal|video|reel)\b\s*/).replace(/^(sobre|de|do|da|com o tema|tema|:)\s+/i, ''); if (r.length < 4) return null;
    const marca = marcaEm(t); let titulo = r.replace(/\s+(para|pra|da marca|na marca|marca)\s+[^,.]*$/i, (x) => marca && x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(marca.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()) ? '' : x).trim() || r;
    return [{ acao: 'criar_conteudo', formato: f, tipo: 'educativo', titulo: titulo.slice(0, 160), briefing: orig, marca, plataforma: 'Instagram' }];
  }
  return null;
}
const GERENTE_ACOES = `# AÇÕES QUE VOCÊ PODE EXECUTAR
O pedido do dono é a ordem: se ele mandou fazer algo, FAÇA, terminando a resposta com UM bloco \`\`\`acoes contendo um array JSON (no máximo 8 ações, só as que ele pediu agora). Se ele só opinou ou perguntou, responda e pergunte se quer que você faça; não inclua o bloco.
Ações (todos os campos entre aspas; "id" de peça é número):
- {"acao":"testar_agente","agente":"roteirista|designer|editor|revisor|revisor de copy|social media","pedido":"o que pedir ao agente, completo","marca":""}  → o agente responde aqui no chat (é só teste: não vira peça).
- {"acao":"ensinar_agente","agente":"…","tipo":"aprender|evitar","regra":"instrução direta, até 300 caracteres"}  → acrescenta ao treinamento do agente (fica numa versão que dá para desfazer).
- {"acao":"ajustar_prompt","agente":"…","prompt":"texto COMPLETO do novo prompt"}  → só quando o dono pedir para reescrever o treinamento; preserve o que funciona.
- {"acao":"desfazer","versao":N}
- {"acao":"criar_conteudo","titulo":"","formato":"carrossel|feed|stories|video_vertical|video_horizontal","tipo":"educativo|historia_real|noticia|ficcao|venda|bastidores|opiniao|historia_vende|serie_episodio|texto|carta_vendas","marca":"","plataforma":"","briefing":"","produto":"nome de um produto cadastrado (opcional)"}
- {"acao":"gerar_pautas","quantidade":3,"marca":"","tema":""}
- {"acao":"ajustar_peca","id":N,"alvo":"roteirista|designer|editor","ajustes":"o que mudar"}
- {"acao":"aprovar_roteiro","id":N} · {"acao":"aprovar_final","id":N} · {"acao":"reprocessar","id":N}
- {"acao":"configurar","chave":"uma das chaves da lista de configurações","valor":"novo valor"}  (autopilot: 1 liga, 0 desliga)
- {"acao":"memorizar","agente":"todos|roteirista|designer|editor|revisor|revisor de copy|social media","marca":"","tipo":"regra|evitar|padrao","texto":"regra geral, até 220 caracteres"}
- {"acao":"editar_regra","id":N,"texto":"nova redação da regra do Cérebro, até 220 caracteres"} · {"acao":"arquivar_regra","id":N}  (use os ids [#N] das regras do Cérebro acima; arquive regras que não funcionaram)
- {"acao":"aprender_estilo","marca":""}  (o Designer estuda as artes aprovadas da marca e propõe o estilo de arte; vira sugestão na aba Identidade da marca, em Conhecimento)
- {"acao":"rodar_cerebro"} · {"acao":"gerar_relatorio"} · {"acao":"ver_peca","id":N}
- {"acao":"conhecimento_agente","agente":"…","titulo":"título do documento","texto":"conteúdo completo","modo":"sempre|auto"}  → cria (ou completa) um documento na base de conhecimento do agente; use para ensinar conteúdo longo (manual, guia, estilo).
- {"acao":"montar_arte","formato":"feed|carrossel|stories","paginas":7,"marca":"","titulo":"título da capa com *destaque*","chamada":"","tema":"educativo|lista|tutorial|oferta|noticia|opiniao (opcional: usa o estilo desse tema que a marca ajustou)","foto":"personagem em inglês","particulas":"","paginas_txt":"Título: texto (uma página por linha)","roteiro":"se o dono colou um roteiro no modelo (📌 Slide 1 — CAPA, Título:, Texto:…), cole-o aqui inteiro"}  → arte avulsa no estilo aprovado, pronta para baixar no Estúdio de arte.
- {"acao":"renderizar_arte","id":N,"regen":false} · {"acao":"criar_marca","nome":""}
Se o dono perguntar como o sistema está, resuma a SAÚDE DO SISTEMA, a produção e o aprendizado em poucas linhas e diga o que ele deve fazer primeiro.
Aprendizado: quando o dono corrigir algo ou declarar uma preferência geral (“sempre…”, “nunca…”, “não gosto de…”, “prefiro…”), isso é uma ordem para a equipe aprender: guarde com "memorizar" (ou "ensinar_agente" se for só de um agente) na mesma resposta. Se o dono perguntar como a equipe está aprendendo, use a seção APRENDIZADO e o efeito {antes → depois} das regras: diga quem acerta, quem erra e por quê, e quais regras estão funcionando ou não.
Regras: nunca invente ids; use só os da lista de peças, versões e configurações acima. Não peça confirmação do que o dono já mandou; mas se faltar um dado essencial (qual agente, qual peça), pergunte antes de agir.`;
function gerenteHistorico(beforeId) {
  return all('SELECT role,agent,text FROM chat_msgs WHERE id<? ORDER BY id DESC LIMIT 10', beforeId).reverse()
    .map(m => `${m.role === 'user' ? 'DONO' : m.role === 'agente' ? 'RESPOSTA DO AGENTE ' + m.agent.toUpperCase() + ' (teste)' : 'VOCÊ (Gerente)'}: ${clip(m.text, 1500)}`).join('\n');
}
function addVersao(agent, field, antes, depois, nota) {
  const r = run('INSERT INTO agent_versions(ts,agent,field,antes,depois,nota) VALUES(?,?,?,?,?,?)', T(), agent, field, antes, depois, nota);
  run('DELETE FROM agent_versions WHERE id < (SELECT MAX(id) FROM agent_versions) - 200'); return +r.lastInsertRowid;
}
function gerenteAcao(a) {
  const k = String(a?.acao || '');
  const need = (v, nome) => { const t = String(v ?? '').trim(); if (!t) throw new Error(`falta ${nome}`); return t; };
  const peca = () => { const c = getContent(+a.id); if (!c || c.teste) throw new Error(`a peça #${a.id} não existe`); return c; };
  if (k === 'testar_agente') {
    const id = agId(a.agente); if (!id) throw new Error(`agente “${a.agente}” não existe`);
    const pedido = need(a.pedido, 'o pedido do teste').slice(0, 6000);
    const jid = enqueue(null, id, 'teste', { pedido, brand: String(a.marca || '') }, 'chat');
    return { texto: `Teste enviado ao ${agentRow(id).name}. A resposta aparece aqui no chat.`, job: jid };
  }
  if (k === 'ensinar_agente') {
    const id = agId(a.agente); if (!id) throw new Error(`agente “${a.agente}” não existe`);
    const field = a.tipo === 'evitar' ? 'avoid' : 'learn', regra = need(a.regra, 'a regra').slice(0, 400);
    const ag = agentRow(id), antes = ag[field] || '', depois = (antes ? antes.replace(/\s+$/, '') + '\n' : '') + '- ' + regra;
    if (depois.length > 8000) throw new Error('o treinamento deste agente já está grande; peça para eu condensar antes');
    run(`UPDATE agents SET ${field}=? WHERE id=?`, depois, id);
    const v = addVersao(id, field, antes, depois, `${field === 'avoid' ? 'Evitar' : 'Aprender'}: ${regra}`);
    log('chefe', `Ensinou ao ${ag.name} (${field === 'avoid' ? 'evitar' : 'aprender'}): ${clip(regra, 120)}`);
    return { texto: `${ag.name} agora ${field === 'avoid' ? 'evita' : 'aprende'}: ${regra}`, versao: v };
  }
  if (k === 'ajustar_prompt') {
    const id = agId(a.agente); if (!id) throw new Error(`agente “${a.agente}” não existe`);
    const novo = need(a.prompt, 'o novo prompt'); if (novo.length < 80) throw new Error('o novo prompt ficou curto demais'); if (novo.length > 30000) throw new Error('o novo prompt passa de 30 mil caracteres');
    const ag = agentRow(id); run('UPDATE agents SET prompt=? WHERE id=?', novo, id);
    const v = addVersao(id, 'prompt', ag.prompt, novo, 'Prompt reescrito pelo Gerente');
    log('chefe', `Reescreveu o treinamento do ${ag.name}`);
    return { texto: `Treinamento do ${ag.name} reescrito (${novo.length} caracteres).`, versao: v };
  }
  if (k === 'desfazer') {
    const v = one('SELECT * FROM agent_versions WHERE id=?', +a.versao); if (!v) throw new Error(`a versão ${a.versao} não existe`);
    if (v.undone) throw new Error('essa versão já foi desfeita');
    run(`UPDATE agents SET ${v.field}=? WHERE id=?`, v.antes, v.agent); run('UPDATE agent_versions SET undone=1 WHERE id=?', v.id); changed();
    log('chefe', `Desfez uma mudança no treinamento do ${agentRow(v.agent)?.name || v.agent}`);
    return { texto: `Mudança desfeita: ${clip(v.nota, 100)}` };
  }
  if (k === 'conhecimento_agente') {   // documento novo na base do agente (aba Agentes): vale em todo pedido dele
    const id = agId(a.agente); if (!id) throw new Error(`agente “${a.agente}” não existe`);
    const texto = need(a.texto, 'o texto').slice(0, 40000), titulo = String(a.titulo || texto.split('\n')[0]).replace(/[#*]/g, '').trim().slice(0, 160) || 'Documento do Gerente';
    const ja = one('SELECT * FROM agent_docs WHERE agent=? AND titulo=?', id, titulo);
    if (ja) { run('UPDATE agent_docs SET conteudo=?, editado=1, updated_at=? WHERE id=?', ja.conteudo + '\n\n' + texto, T(), ja.id); }
    else run("INSERT INTO agent_docs(agent,titulo,conteudo,original,modo,ordem,origem,editado,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?)", id, titulo, texto, '', a.modo === 'auto' ? 'auto' : 'sempre', (one('SELECT MAX(ordem) m FROM agent_docs WHERE agent=?', id)?.m || 0) + 1, 'gerente', T(), T());
    changed(); log('chefe', `${ja ? 'Completou' : 'Criou'} o documento “${clip(titulo, 60)}” na base do ${agentRow(id).name}`);
    return { texto: `${ja ? 'Acrescentei ao' : 'Criei o'} documento “${titulo}” na base do ${agentRow(id).name}. Ele passa a valer em todo pedido.` };
  }
  if (k === 'criar_marca') {
    const n = need(a.nome, 'o nome da marca').slice(0, 80); if (one('SELECT id FROM brands WHERE name=? COLLATE NOCASE', n)) throw new Error(`a marca “${n}” já existe`);
    run('INSERT INTO brands(name,created_at) VALUES(?,?)', n, T()); changed(); log('chefe', `Criou a marca ${n}`);
    return { texto: `Marca “${n}” criada. Próximo passo: em Conhecimento, preencha a ficha e a Identidade visual (cores, fontes, logo) para os agentes usarem.` };
  }
  if (k === 'renderizar_arte') { const c = getContent(+a.id); if (!c) throw new Error(`a peça #${a.id} não existe`); if (!c.art_spec) throw new Error('essa peça ainda não tem a especificação da arte'); renderArte(c.id, { regen: !!a.regen }); return { texto: `Gerando as imagens de “${clip(c.title, 60)}”. Em instantes aparecem para baixar na peça.`, conteudo: c.id }; }
  if (k === 'montar_arte') {   // arte avulsa no estilo aprovado, sem IA: o dono troca os textos no editor
    const format = ['feed', 'carrossel', 'stories'].includes(a.formato) ? a.formato : 'carrossel', marcas = all('SELECT name FROM brands').map(b => b.name), brand = marcas.find(m => m.toLowerCase() === String(a.marca || '').toLowerCase()) || '';
    const pags = format === 'feed' ? 1 : Math.max(2, Math.min(ART_MAX[format] || 10, +a.paginas || (format === 'carrossel' ? 7 : 3))), titulo = String(a.titulo || '').slice(0, 120);
    const title = (titulo.replace(/[*|]/g, ' ').replace(/\s+/g, ' ').trim() || 'Arte no estilo') + (brand ? ' · ' + brand : '');
    const r = run("INSERT INTO contents(title,format,kind,platform,brief,script,brand,status,teste,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,2,'gerente',?,?)", title.slice(0, 70), format, 'educativo', 'teste', 'Arte montada pelo Gerente no estilo aprovado.', '', brand, 'awaiting_approval', T(), T());
    const lidas = paginasDoRoteiro(a.roteiro || a.paginas_txt || '', format, brand);
    const id = +r.lastInsertRowid, eTema = lidas ? '' : (temaDoConteudo({ tema: a.tema, title: titulo, brief: a.chamada || '', script: a.paginas_txt || '' }) ? escolheEstilo({ tema: a.tema, title: titulo, brief: a.chamada || '', script: a.paginas_txt || '', brand }, format) : ''), spec = sanitizeArteSpec(compoeModelos({ slides: lidas || estruturaEstilo(format, pags, { capa: { titulo, kicker: a.chamada, foto: a.foto, particulas: a.particulas }, paginasTxt: a.paginas_txt || '', template: eTema || undefined }, brand), estilo: lidas ? escolheEstilo({ title: titulo, script: a.roteiro || a.paginas_txt || '', brand }, format) || undefined : (eTema || undefined) }, format, brand), format);
    if (lidas) { const tt = String(lidas[0].dados.titulo || '').replace(/[*|]/g, '').replace(/\s+/g, ' ').trim(); setContent(id, { caption: parseCaption(a.roteiro || a.paginas_txt || ''), ...(titulo ? {} : { title: ((tt || 'Arte do roteiro') + (brand ? ' · ' + brand : '')).slice(0, 70) }), script: String(a.roteiro || a.paginas_txt || '').slice(0, 20000) }); }
    setContent(id, { art_spec: JSON.stringify(spec), art_spec_base: JSON.stringify(spec), art: '', art_status: '' }); renderArte(id); changed();
    log('chefe', `Montou a arte avulsa “${clip(title, 60)}” no estilo da marca`, id);
    const nP = spec.slides.length, tFim = getContent(id)?.title || title;
    return { texto: `Montei “${tFim}” (${format}${nP > 1 ? ', ' + nP + ' páginas' : ''}) no estilo aprovado${lidas ? ', com os textos do roteiro e a legenda' : ''}. Abra em Estúdio de arte › Minhas artes para trocar os textos e baixar.`, arte: id };
  }
  if (k === 'criar_conteudo') {
    const formato = FORMATS.includes(a.formato) ? a.formato : null; if (!formato) throw new Error('formato inválido');
    const tipo = KINDS.includes(a.tipo) ? a.tipo : 'educativo', titulo = need(a.titulo, 'o título').slice(0, 200);
    const marcas = all('SELECT name FROM brands').map(b => b.name), marca = marcas.find(m => m.toLowerCase() === String(a.marca || '').toLowerCase()) || '';
    const prod = a.produto ? one('SELECT id FROM products WHERE name=? COLLATE NOCASE', String(a.produto)) : null;
    const id = createContent({ title: titulo, format: formato, kind: tipo, platform: String(a.plataforma || '').slice(0, 40), brief: String(a.briefing || '').slice(0, 4000), brand: marca, product_id: prod?.id || null, goal: prod ? 'produto' : '' }, 'manual');
    return { texto: `Conteúdo #${id} criado e enviado ao Roteirista: “${titulo}” (${formato}).`, conteudo: id };
  }
  if (k === 'gerar_pautas') {
    const marcas = all('SELECT name FROM brands').map(b => b.name), marca = marcas.find(m => m.toLowerCase() === String(a.marca || '').toLowerCase()) || '';
    const jid = enqueue(null, 'chefe', 'pautas', { n: Math.max(1, Math.min(10, +a.quantidade || 3)), auto: true, brand: marca, tema: String(a.tema || '').slice(0, 1500), formats: [], kinds: [] }, 'manual');
    return { texto: `Pedi ${Math.max(1, Math.min(10, +a.quantidade || 3))} pauta(s)${marca ? ' para ' + marca : ''}. Elas entram na produção quando ficarem prontas.`, job: jid };
  }
  if (k === 'ajustar_peca') {
    const c = peca(), alvo = ['designer', 'editor'].includes(a.alvo) ? (isVideo(c.format) ? 'editor' : 'designer') : 'roteirista';
    contentAct(c.id, 'changes', { feedback: need(a.ajustes, 'os ajustes'), target: alvo });
    return { texto: `Ajustes enviados ao ${agentRow(alvo).name} em “${clip(c.title, 60)}”.`, conteudo: c.id };
  }
  if (k === 'aprovar_roteiro') { const c = peca(); contentAct(c.id, 'approve_script', {}); return { texto: `Roteiro de “${clip(c.title, 60)}” aprovado: segue para a produção.`, conteudo: c.id }; }
  if (k === 'aprovar_final') { const c = peca(); contentAct(c.id, 'approve', {}); return { texto: `“${clip(c.title, 60)}” aprovado: pacote de postagem em preparo.`, conteudo: c.id }; }
  if (k === 'reprocessar') { const c = peca(); contentAct(c.id, 'reprocess', {}); return { texto: `“${clip(c.title, 60)}” voltou para a revisão.`, conteudo: c.id }; }
  if (k === 'configurar') {
    const chave = String(a.chave || ''); if (!SETTING_KEYS.includes(chave)) throw new Error(`a configuração “${chave}” não pode ser mudada por aqui`);
    let valor = a.valor;   // chaves liga/desliga: o texto “0”, “não”, “desligado” precisa virar falso (o validador só olha se o valor é “verdadeiro”)
    if (['autopilot', 'web_search', 'auto_produce', 'approve_script', 'pacote_ia', 'auto_render', 'brain_auto', 'brain_daily', 'art_gen', 'fal_pausa', 'visual_check'].includes(chave) && typeof valor === 'string') valor = !/^\s*(0|false|nao|não|off|desligad[oa]|desligar)\s*$/i.test(valor);
    const antes = settings()[chave]; applySettings({ [chave]: valor }); const depois = settings()[chave];
    log('chefe', `Configuração ${chave}: ${clip(antes, 40)} → ${clip(depois, 40)}`);
    return { texto: `${chave}: ${clip(antes, 60) || '(vazio)'} → ${clip(depois, 60) || '(vazio)'}` };
  }
  if (k === 'memorizar') {
    const ag = /^(todos|todas|\*)$/i.test(String(a.agente || 'todos').trim()) ? '*' : agId(a.agente); if (!ag) throw new Error(`agente “${a.agente}” não existe`);
    const tipo = ['regra', 'evitar', 'padrao'].includes(a.tipo) ? a.tipo : 'regra', texto = need(a.texto, 'o texto').slice(0, 300);
    const marcas = all('SELECT name FROM brands').map(b => b.name), marca = marcas.find(m => m.toLowerCase() === String(a.marca || '').toLowerCase()) || '';
    run("INSERT INTO brain_rules(agent,brand,type,text,evidence,source,status,weight,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", ag, marca, tipo, texto, 'Pedido do dono no chat com o Gerente', 'gerente', 'ativa', 3, T(), T());
    changed(); log('chefe', `Guardou no Cérebro: ${clip(texto, 120)}`);
    return { texto: `Guardado no Cérebro (${ag === '*' ? 'todos os agentes' : agentRow(ag).name}${marca ? ', marca ' + marca : ''}): ${texto}` };
  }
  if (k === 'editar_regra' || k === 'arquivar_regra') {
    const r = one("SELECT * FROM brain_rules WHERE id=? AND status<>'arquivada'", +a.id); if (!r) throw new Error(`a regra #${a.id} não existe ou já está arquivada`);
    if (k === 'arquivar_regra') { run("UPDATE brain_rules SET status='arquivada', updated_at=? WHERE id=?", T(), r.id); changed(); log('chefe', `Arquivou a regra #${r.id} do Cérebro`); return { texto: `Regra #${r.id} arquivada: ${clip(r.text, 100)}` }; }
    const texto = need(a.texto, 'o novo texto').slice(0, 300); run("UPDATE brain_rules SET text=?, flag='', updated_at=? WHERE id=?", texto, T(), r.id); changed(); log('chefe', `Reescreveu a regra #${r.id} do Cérebro`);
    return { texto: `Regra #${r.id} reescrita: ${texto}` };
  }
  if (k === 'aprender_estilo') {
    const marcas = all('SELECT name FROM brands').map(b => b.name), marca = marcas.find(m => m.toLowerCase() === String(a.marca || '').toLowerCase()) || '';
    if (!agenteLigado('designer')) throw new Error('o Designer está desativado'); const jid = enqueue(null, 'designer', 'estilo', { brand: marca, origem: 'aprovadas', assets: [] }, 'chat');
    return { texto: `O Designer vai estudar as artes aprovadas${marca ? ' de ' + marca : ''} e propor o estilo. A sugestão aparece na Identidade da marca (Conhecimento), para você aprovar.`, job: jid };
  }
  if (k === 'rodar_cerebro') { if (!brainPendingEvents() && !brainNewMetrics().length) return { texto: 'Ainda não há atividade nova para o Cérebro aprender.' }; enqueue(null, 'chefe', 'cerebro', {}, 'manual'); return { texto: 'Cérebro vai consolidar o aprendizado agora.' }; }
  if (k === 'gerar_relatorio') { enqueue(null, 'chefe', 'relatorio', {}, 'manual'); return { texto: 'Relatório de desempenho pedido.' }; }
  if (k === 'ver_peca') {
    const c = peca();
    return { texto: `#${c.id} “${c.title}” · ${c.format}/${c.kind} · ${c.status}${c.score != null ? ' · nota ' + Number(c.score).toFixed(1) : ''}\n${clip(c.script || '(sem roteiro ainda)', 900)}${c.error ? '\nERRO: ' + c.error : ''}`, conteudo: c.id };
  }
  throw new Error(`ação desconhecida “${k}”`);
}
function gerenteResposta(texto) {
  const m = String(texto).match(/```acoes\s*([\s\S]*?)```/i);
  const fala = String(texto).replace(/```acoes[\s\S]*?```/i, '').trim();
  let acoes = [];
  if (m) { try { const j = JSON.parse(m[1].trim()); acoes = Array.isArray(j) ? j.slice(0, 8) : []; } catch { acoes = null; } }
  return { fala, acoes };
}

// ── Manuais do Roteirista: o painel carrega só o que o pedido usa
const VENDA_KINDS = ['venda', 'historia_vende', 'carta_vendas'];
function manuaisCodes(c, { devolvida = false, revisao = false } = {}) {
  const set = new Set(revisao ? ['M00', 'M04', 'M06', 'M15', 'M16'] : ['M00', 'M15', 'M16', 'M04']), add = (...a) => a.forEach(x => set.add(x)), f = c.format, fato = ['noticia', 'historia_real'].includes(c.kind), venda = c.goal === 'produto' || VENDA_KINDS.includes(c.kind);
  if (revisao) { if (fato) add('M12'); if (venda) add('M08'); return [...set]; }
  if (f === 'video_vertical') add('M01', 'M03', 'M05', 'M06'); else if (f === 'video_horizontal') add('M03', 'M05', 'M07'); else add('M01', 'M03', 'M05');
  if (fato) add('M12', 'M13');
  add('M14');
  if (c.goal === 'conteudo' || c.kind === 'serie_episodio') add('M07', 'M11');
  if (venda) add('M02', 'M08', 'M09', 'M10');
  if (devolvida) add('M17');
  return [...set];
}
function manuaisBloco(codes) {
  const rows = codes.map(k => one('SELECT code,conteudo FROM manuais WHERE code=?', k)).filter(Boolean), cap = one("SELECT conteudo FROM manuais WHERE code='CAP'");
  if (!rows.length && !cap) return '';
  return `# MANUAIS DESTE PEDIDO\nO painel carregou só os manuais que este pedido usa. Siga-os; as regras M00 valem sempre.\n\n${rows.map(r => `<manual codigo="${r.code}">\n${r.conteudo}\n</manual>`).join('\n\n')}${cap ? `\n\n# CAPACIDADES ATUAIS DA PRODUÇÃO\n${cap.conteudo}` : ''}`;
}
const copyRevOn = () => agenteLigado('revisorcopy') && settings().copy_review !== '0';
function lerLaudoCopy(txt) {
  const t = String(txt || ''), v = (t.match(/VEREDITO\s*:?\**\s*[:*]*\s*(aprovada|ajustes|refazer)/i) || [])[1]?.toLowerCase() || '';
  const n = Number((t.match(/NOTA\s*:?\**\s*[:*]*\s*([1-5](?:[.,]\d)?)/i) || [])[1]?.replace(',', '.'));
  const sec = (a, b) => { const m = t.match(new RegExp(a + '[^\\n]*\\n([\\s\\S]*?)(?=\\n\\s*\\**(?:' + b + ')|$)', 'i')); return m ? m[1].trim() : ''; };
  const corr = sec('CORREÇÕES OBRIGATÓRIAS', 'MELHORIAS OPCIONAIS|LIÇÃO PARA O CÉREBRO|PEDIDOS AO GERENTE'), licao = sec('LIÇÃO PARA O CÉREBRO DA MARCA', 'PEDIDOS AO GERENTE');
  const fz = k => { const m = t.match(new RegExp(k + '\\s*\\**\\s*[:=]\\s*\\**\\s*([1-5])(?![0-9])', 'i')); return m ? +m[1] : null; };
  const forca = { gancho: fz('GANCHO'), especificidade: fz('ESPECIFICIDADE'), tensao: fz('TENS[ÃA]O'), utilidade: fz('UTILIDADE') };
  const todas = Object.values(forca).every(x => x != null);
  return { veredito: v, nota: todas ? Math.min(...Object.values(forca)) : (Number.isFinite(n) ? n : null), correcoes: corr, licao, forca: todas ? forca : null };   // nota final = a MENOR das quatro notas de força
}

// ───────── RADAR de notícias: Google Trends + Google News por marca → pautas de notícia para o Roteirista ─────────
db.exec("CREATE TABLE IF NOT EXISTS radar_items(id INTEGER PRIMARY KEY AUTOINCREMENT, brand TEXT DEFAULT '', titulo TEXT, fonte TEXT DEFAULT '', url TEXT DEFAULT '', snippet TEXT DEFAULT '', origem TEXT DEFAULT '', termo TEXT DEFAULT '', trafego TEXT DEFAULT '', publicado TEXT DEFAULT '', status TEXT DEFAULT 'novo', content_id INTEGER, motivo TEXT DEFAULT '', created_at TEXT)");
db.exec('CREATE INDEX IF NOT EXISTS radar_brand ON radar_items(brand, status)');
const RADAR_FMTS = ['carrossel', 'feed', 'stories'];
// Os 5 nichos do roteiro do dono: assuntos de busca, fontes de referência, subnichos e o cuidado de cada área
const RADAR_NICHOS = {
  tecnologia: { nome: 'Tecnologia', termos: 'inteligência artificial novo modelo, cibersegurança vazamento ataque hacker, big techs lançamento, robô humanoide, computação quântica chip, golpe digital prisão hackers',
    subs: [['IA', /\b(ia|inteligencia artificial|openai|chatgpt|gemini|claude|llm|modelo de linguagem|copilot|anthropic|nvidia)\b/], ['cibersegurança', /\b(hacker\w*|ciberataque|ciberseguranca|vazamento|ransomware|vulnerabilidade|malware|golpe digital|phishing|invasao)\b/], ['robôs e drones', /\b(robo\w*|humanoide|drone\w*|autonomo|automacao)\b/], ['big techs', /\b(apple|google|microsoft|meta|amazon|samsung|tesla|x corp|big tech\w*)\b/], ['infraestrutura e chips', /\b(nuvem|chip\w*|semicondutor\w*|data center|fora do ar|apagao|processador)\b/], ['ciência e espaço', /\b(quantic\w*|espaco|nasa|spacex|biotecnologia|energia)\b/]],
    atencao: 'Cobertura de hackers e ataques: informe o fato e o risco para o público, sem ensinar a executar o ataque.' },
  marketing: { nome: 'Marketing digital', termos: 'Google Ads mudança, Meta Ads novidade, atualização Google SEO busca com IA, IA no marketing digital, e-commerce Brasil dados, regras de publicidade influenciadores',
    subs: [['tráfego pago', /\b(google ads|meta ads|tiktok ads|anuncio\w*|trafego pago|campanha paga)\b/], ['SEO e busca', /\b(seo|busca|google search|core update|ai overview|algoritmo do google)\b/], ['IA no marketing', /\b(ia|inteligencia artificial|chatgpt|automacao)\b/], ['campanhas e marcas', /\b(campanha|marca|publicidade|propaganda|crise)\b/], ['e-commerce e dados', /\b(e commerce|ecommerce|varejo|vendas|email marketing|influenciador\w*)\b/]],
    atencao: 'Mudança em anúncios é deste nicho; mudança no alcance orgânico ou em recursos para criadores é do nicho de redes sociais.' },
  redes: { nome: 'Redes sociais', termos: 'algoritmo Instagram mudança, TikTok novidade criadores, YouTube monetização, WhatsApp novo recurso, Threads X Kwai atualização, regras redes sociais moderação',
    subs: [['Instagram', /\b(instagram|reels)\b/], ['TikTok', /\btiktok\b/], ['YouTube', /\b(youtube|shorts)\b/], ['WhatsApp', /\bwhatsapp\b/], ['X e Threads', /\b(threads|x twitter|twitter|musk)\b/], ['Facebook', /\b(facebook|meta)\b/], ['LinkedIn', /\blinkedin\b/], ['Kwai e Pinterest', /\b(kwai|pinterest)\b/]],
    atencao: 'Diferencie mudança confirmada pela plataforma, teste limitado e teoria de criador. Nunca apresente teoria como fato.' },
  esportes: { nome: 'Esportes', termos: 'futebol brasileiro rodada decisão, Libertadores Champions League, seleção brasileira convocação, Fórmula 1 NBA MMA vôlei tênis, SAF patrocínio direitos de transmissão, recorde atleta',
    subs: [['futebol', /\b(futebol|brasileirao|libertadores|copa|champions|flamengo|palmeiras|corinthians|selecao|gol|tecnico)\b/], ['F1 e automobilismo', /\b(f1|formula 1|verstappen|hamilton|gp)\b/], ['basquete e NBA', /\b(nba|basquete)\b/], ['MMA e lutas', /\b(mma|ufc|boxe)\b/], ['vôlei e tênis', /\b(volei|tenis)\b/], ['negócios do esporte', /\b(saf|patrocinio|direitos de transmissao|contrato)\b/]],
    atencao: 'Boato de transferência só entra se estiver identificado como rumor e vier de jornalista especializado confiável.' },
  financas: { nome: 'Empreendedorismo e finanças', termos: 'Selic inflação dólar, MEI imposto Receita Federal, Pix novas regras bancos, startup investimento rodada, bolsa resultado empresas criptomoedas, empreendedorismo franquia falência',
    subs: [['economia', /\b(selic|inflacao|ipca|pib|dolar|juros|desemprego|banco central)\b/], ['mercado', /\b(bolsa|ibovespa|acoes|bitcoin|cripto\w*|dividendos|balanco|resultado)\b/], ['startups', /\b(startup\w*|rodada|investimento|unicornio|venture)\b/], ['finanças pessoais', /\b(mei|imposto|receita federal|pix|credito|cartao|fgts|inss)\b/], ['negócios', /\b(franquia\w*|empreendedor\w*|falencia|empresa\w*)\b/]],
    atencao: 'Informe fatos e dados. Nunca recomende compra ou venda de ativo nem prometa retorno.' }
};
// fontes de referência do dono, por nicho. "of" marca fonte oficial (vale como confirmação sozinha). Os endereços RSS dependem de cada site continuar publicando o feed.
const RADAR_FONTES = [
  { id: 'tecnoblog', nome: 'Tecnoblog', url: 'https://tecnoblog.net/feed/', nichos: ['tecnologia'] }, { id: 'canaltech', nome: 'Canaltech', url: 'https://canaltech.com.br/rss/', nichos: ['tecnologia'] },
  { id: 'olhardigital', nome: 'Olhar Digital', url: 'https://olhardigital.com.br/feed/', nichos: ['tecnologia'] }, { id: 'showmetech', nome: 'Showmetech', url: 'https://www.showmetech.com.br/feed/', nichos: ['tecnologia'] },
  { id: 'techcrunch', nome: 'TechCrunch', url: 'https://techcrunch.com/feed/', nichos: ['tecnologia', 'redes'] }, { id: 'verge', nome: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', nichos: ['tecnologia', 'redes'] },
  { id: 'arstechnica', nome: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', nichos: ['tecnologia'] }, { id: 'wired', nome: 'Wired', url: 'https://www.wired.com/feed/rss', nichos: ['tecnologia'] },
  { id: 'mittr', nome: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', nichos: ['tecnologia'] }, { id: 'ieee', nome: 'IEEE Spectrum', url: 'https://spectrum.ieee.org/feeds/feed.rss', nichos: ['tecnologia'] },
  { id: 'robotreport', nome: 'The Robot Report', url: 'https://www.therobotreport.com/feed/', nichos: ['tecnologia'] }, { id: 'bleeping', nome: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/', nichos: ['tecnologia'] },
  { id: 'hackernews', nome: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews', nichos: ['tecnologia'] }, { id: 'krebs', nome: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/', nichos: ['tecnologia'] },
  { id: 'sel', nome: 'Search Engine Land', url: 'https://searchengineland.com/feed', nichos: ['marketing'] }, { id: 'sej', nome: 'Search Engine Journal', url: 'https://www.searchenginejournal.com/feed/', nichos: ['marketing'] },
  { id: 'adweek', nome: 'Adweek', url: 'https://www.adweek.com/feed/', nichos: ['marketing'] }, { id: 'mktdive', nome: 'Marketing Dive', url: 'https://www.marketingdive.com/feeds/news/', nichos: ['marketing'] },
  { id: 'meio', nome: 'Meio & Mensagem', url: 'https://www.meioemensagem.com.br/feed', nichos: ['marketing'] }, { id: 'propmark', nome: 'Propmark', url: 'https://propmark.com.br/feed/', nichos: ['marketing'] },
  { id: 'smtoday', nome: 'Social Media Today', url: 'https://www.socialmediatoday.com/feeds/news/', nichos: ['redes', 'marketing'] }, { id: 'metanews', nome: 'Meta Newsroom', url: 'https://about.fb.com/news/feed/', nichos: ['redes'], of: true },
  { id: 'ytblog', nome: 'YouTube Blog', url: 'https://blog.youtube/rss/', nichos: ['redes'], of: true },
  { id: 'ge', nome: 'ge', url: 'https://ge.globo.com/rss/ge/', nichos: ['esportes'] }, { id: 'espn', nome: 'ESPN', url: 'https://www.espn.com.br/espn/rss/news', nichos: ['esportes'] },
  { id: 'uolesporte', nome: 'UOL Esporte', url: 'https://rss.uol.com.br/feed/esporte.xml', nichos: ['esportes'] }, { id: 'cnnesportes', nome: 'CNN Esportes', url: 'https://www.cnnbrasil.com.br/esporte/feed/', nichos: ['esportes'] },
  { id: 'bbcsport', nome: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/rss.xml', nichos: ['esportes'] },
  { id: 'infomoney', nome: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/', nichos: ['financas'] }, { id: 'exame', nome: 'Exame', url: 'https://exame.com/feed/', nichos: ['financas', 'marketing'] },
  { id: 'neofeed', nome: 'NeoFeed', url: 'https://neofeed.com.br/feed/', nichos: ['financas'] }, { id: 'bloomberglinea', nome: 'Bloomberg Línea', url: 'https://www.bloomberglinea.com.br/arc/outboundfeeds/rss/?outputType=xml', nichos: ['financas'] },
  { id: 'crunchbase', nome: 'Crunchbase News', url: 'https://news.crunchbase.com/feed/', nichos: ['financas'] }];
const RADAR_NICHO_IDS = Object.keys(RADAR_NICHOS);
function radarCfg() {
  const c = jparse(one("SELECT value FROM settings WHERE key='radar_cfg'")?.value, {}) || {}, marcas = {};
  for (const [b, m] of Object.entries(c.marcas && typeof c.marcas === 'object' ? c.marcas : {})) marcas[b] = { ativo: !!m?.ativo, termos: String(m?.termos || '').slice(0, 400), max: Math.max(1, Math.min(6, +m?.max || 2)), formato: RADAR_FMTS.includes(m?.formato) ? m.formato : 'carrossel', estilo: String(m?.estilo || '').slice(0, 80), cta: String(m?.cta || '').replace(/\s+/g, ' ').trim().slice(0, 140), nicho: RADAR_NICHO_IDS.includes(m?.nicho) ? m.nicho : '', jornal: String(m?.jornal || '').replace(/\s+/g, ' ').trim().slice(0, 200), secoes: String(m?.secoes || '').replace(/\s+/g, ' ').trim().slice(0, 400) };
  for (const b of all('SELECT name FROM brands').map(x => x.name)) if (!marcas[b]) marcas[b] = { ativo: true, termos: '', max: 2, formato: 'carrossel', estilo: '', cta: '', nicho: '', jornal: '', secoes: '' };   // marca sem ajuste próprio: ligada, usa a base de conhecimento dela
  const fontes = RADAR_FONTES.map(f => ({ ...f, ativo: c.fontes && f.id in c.fontes ? !!c.fontes[f.id] : true })), extras = String(c.extras || '').split(/[\n,;]+/).map(x => x.trim()).filter(x => /^https:\/\//.test(x)).slice(0, 8);
  return { fontes, extras: extras.join('\n'), auto: c.auto == null ? true : !!c.auto, hora: Math.max(0, Math.min(23, +c.hora >= 0 && c.hora !== '' && c.hora != null ? +c.hora : 7)), geo: /^[A-Z]{2}$/.test(String(c.geo || '').toUpperCase()) ? String(c.geo).toUpperCase() : 'BR', marcas };
}
const radarSalvaCfg = c => run("INSERT INTO settings(key,value) VALUES('radar_cfg',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(c));
// Agente de Notícias automático: liga a busca diária e todas as marcas (uma vez; depois o dono manda na tela)
if (!one("SELECT 1 x FROM settings WHERE key='radar_auto_v1'")) {
  const c = jparse(one("SELECT value FROM settings WHERE key='radar_cfg'")?.value, {}) || {}; c.auto = true; c.marcas = c.marcas && typeof c.marcas === 'object' ? c.marcas : {};
  for (const b of all('SELECT name FROM brands').map(x => x.name)) c.marcas[b] = { ...(c.marcas[b] || { termos: '', max: 2, formato: 'carrossel' }), ativo: true };
  radarSalvaCfg(c); run("INSERT INTO settings(key,value) VALUES('radar_auto_v1','1')");
}
// Nichos do dono por marca (uma vez): 007 Spyhacker = tecnologia; Marketing Raiz e Central do Marketing = marketing; Seguidores em Alta = redes sociais; Vivendo de Bet = esportes; Corte dos Ricos = finanças. Só preenche o que está vazio.
if (!one("SELECT 1 x FROM settings WHERE key='radar_nichos_v1'")) {
  const c = jparse(one("SELECT value FROM settings WHERE key='radar_cfg'")?.value, {}) || {}; c.marcas = c.marcas && typeof c.marcas === 'object' ? c.marcas : {};
  const MAPA = [[/spy\s*hack|007/i, 'tecnologia'], [/marketing\s*raiz|central\s*do\s*marketing/i, 'marketing'], [/seguidores\s*em\s*alta/i, 'redes'], [/vivendo\s*de\s*bet/i, 'esportes'], [/corte\s*dos\s*ricos/i, 'financas']];
  for (const b of all('SELECT name FROM brands').map(x => x.name)) { const n = MAPA.find(([re]) => re.test(b))?.[1]; if (!n) continue; const m = c.marcas[b] || { ativo: true, formato: 'carrossel' }; c.marcas[b] = { ...m, ativo: m.ativo !== false, nicho: m.nicho || n, termos: m.termos || RADAR_NICHOS[n].termos, max: (m.max && m.max !== 2) ? m.max : 3, formato: m.formato || 'carrossel' }; }
  radarSalvaCfg(c); run("INSERT INTO settings(key,value) VALUES('radar_nichos_v1','1')");
}
// Banco de texturas geral (todas as marcas): imagens de apoio para mesclar nas artes (grão, papel, tecido, mármore, gradiente líquido). Entram uma vez; o dono pode apagar ou trocar na Biblioteca.
const BANCO_TEXTURAS = [
  ['papel-amassado-escuro-grao', 'escuro, papel, amassado, grão, preto', 'Papel preto amassado com dobras e grão forte', 'Fundo escuro com dobras de papel e muito grão, em tons de cinza e preto.', 'Mesclar com screen ou soft-light em artes escuras (5 a 40%) para dar profundidade e cara de impresso; bom em capas de impacto, tecnologia e provocação.', 'baixa', 'escuro'],
  ['tecido-amassado-cinza', 'claro, tecido, amassado, cinza, trama', 'Tecido ou papel amassado cinza com trama fina', 'Superfície cinza clara com dobras suaves e trama de tecido não tecido.', 'Mesclar com soft-light ou multiply para dar volume a fundos lisos; também serve de base para dobras de vidro tingidas na cor da marca.', 'baixa', 'claro'],
  ['marmore-prata-claro', 'claro, mármore, prata, manchas, brilho', 'Mármore ou prata em manchas claras', 'Fundo branco com manchas prateadas e brilho metálico discreto.', 'Fundo premium claro, ou overlay suave sobre cor da marca para efeito metálico; evitar texto pequeno por cima das manchas escuras.', 'baixa', 'claro'],
  ['gradiente-liquido-roxo-grao', 'colorido, gradiente, líquido, roxo, grão', 'Gradiente líquido roxo e verde-oliva com grão', 'Formas fluidas desfocadas em roxo sobre fundo claro esverdeado, com grão fino.', 'Fundo de capa moderna e criativa; combina com marcas roxas. Pode virar fundo inteiro ou ser tingido com a cor da marca (soft-light).', 'baixa', 'colorido'],
  ['padrao-ondas-bege', 'claro, padrão, ondas, bege, orgânico', 'Padrão de ondas orgânicas bege e branco', 'Linhas ondulantes largas em branco sobre bege, estilo retrô orgânico, vetorial.', 'Fundo claro decorativo em baixa opacidade (multiply 10 a 25%) para artes leves, lifestyle e carrosséis claros.', 'media', 'claro'],
  ['papel-amassado-bege', 'claro, papel, amassado, bege, relevo', 'Papel bege amassado com relevo marcado', 'Papel creme amassado com dobras profundas e sombras suaves, alta resolução.', 'Melhor textura para multiply (20 a 45%) em artes claras e editoriais; também em soft-light sobre fundos escuros quentes.', 'alta', 'claro'],
  ['papel-amassado-branco', 'claro, papel, amassado, branco', 'Papel branco amassado', 'Papel branco com muitas dobras pequenas e luz uniforme.', 'Multiply (15 a 40%) em fundos claros para realismo de impresso; em fundos escuros use soft-light baixo.', 'baixa', 'claro'],
  ['papel-grao-branco', 'claro, papel, grão, poeira, branco', 'Papel branco com grão e pontinhos', 'Papel liso com poeira, pontos e leves manchas cinza.', 'Multiply bem baixo (10 a 25%) para tirar o aspecto digital de fundos lisos claros.', 'baixa', 'claro'],
  ['cartaz-colado-branco', 'claro, cartaz, colado, vincos, branco', 'Cartaz colado com vincos brilhantes', 'Papel branco liso com vincos longos e brilho, como cartaz de rua recém colado.', 'Overlay ou multiply (20 a 45%) para efeito de cartaz urbano em artes de impacto e manchetes.', 'baixa', 'claro']
];
if (!one("SELECT 1 x FROM settings WHERE key='texturas_banco_v1'")) {
  try {
    for (const [nome, tags, assunto, desc, uso, qual, tom] of BANCO_TEXTURAS) {
      const arq = path.join(__dirname, 'banco', 'texturas', nome + '.jpg'); if (!fs.existsSync(arq) || one("SELECT 1 x FROM assets WHERE name=? AND brand=''", nome)) continue;
      const buf = fs.readFileSync(arq), r = run('INSERT INTO assets(brand,name,kind,tags,colecao,filename,ext,size,pasta,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', '', nome, 'textura', tags, 'motion', nome + '.jpg', 'jpg', buf.length, 'Texturas', T());
      fs.writeFileSync(path.join(ASSET_DIR, r.lastInsertRowid + '.jpg'), buf);
      const pr = probeAsset(+r.lastInsertRowid, 'jpg'); run('UPDATE assets SET dur=?, w=?, h=? WHERE id=?', pr.dur, pr.w, pr.h, +r.lastInsertRowid);
      salvaFicha(one('SELECT * FROM assets WHERE id=?', +r.lastInsertRowid), { tipo_visual: 'textura', assunto, descricao: desc, uso, estilo: tom, qualidade: qual, evitar: qual === 'baixa' ? 'usar em tamanho grande sem desfoque: a imagem é pequena (use como textura mesclada, não como foto)' : '' }, 'manual');
    }
    run("INSERT INTO settings(key,value) VALUES('texturas_banco_v1','1')");
  } catch (e) { console.error('banco de texturas:', e.message); }
}
// Capa da Central: o "Templete 01 Central" tinha a capa com ajustes soltos (título centralizado, apoio fixo) que bagunçavam conforme o texto. Passa a usar o modelo "capa-mascote", réplica da arte aprovada (título à esquerda, apoio, mascote grande à direita)
if (!db.prepare("SELECT 1 x FROM settings WHERE key='capa_mascote_v4'").get()) {
  try {
    for (const r of db.prepare("SELECT id, seq, visual FROM art_templates WHERE nome LIKE 'Templete 01 Central%'").all()) {
      const seq = JSON.parse(r.seq || '[]'); if (seq[0]) seq[0] = { ...seq[0], modelo: 'capa-mascote', papel: 'capa' }; for (let q = 1; q < seq.length - 1; q++) seq[q] = { ...seq[q], modelo: 'coluna', fundo: q === 3 ? 'escuro' : 'claro', ...(q === 2 ? { mascote: true } : {}) };   // um slide do meio com o mascote, como no padrão do dono
      const vis = JSON.parse(r.visual || 'null'); let novo = r.visual;
      if (vis && !Array.isArray(vis)) for (const k of Object.keys(vis)) { const pg = vis[k].pages || []; const bg = pg[0]?.bg && pg[0].bg.asset ? { asset: pg[0].bg.asset } : {}; pg.splice(1); if (pg[0]) pg[0] = { modelo: 'capa-mascote', papel: 'capa', t: {}, it: {}, sh: {}, addT: [], addI: [], addS: [], bg, fx: {}, top: {} }; if (vis[k].snaps) delete vis[k].snaps; }
      if (vis) novo = JSON.stringify(vis);
      db.prepare('UPDATE art_templates SET seq=?, visual=? WHERE id=?').run(JSON.stringify(seq), novo, r.id);
    }
  } catch (e) { console.error('capa_mascote_v4:', e.message); }
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('capa_mascote_v4','1')").run();
}
const ENT_NOMES = { nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', eacute: 'é', aacute: 'á', atilde: 'ã', ccedil: 'ç', iacute: 'í', oacute: 'ó', uacute: 'ú', ecirc: 'ê', ocirc: 'ô', agrave: 'à', otilde: 'õ', copy: '©', reg: '®' };
const entNum = t => t.replace(/&#(x[0-9a-f]+|\d+);/gi, (m, n) => { try { const c = /^x/i.test(n) ? parseInt(n.slice(1), 16) : +n; return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : m; } catch { return m; } }).replace(/&([a-z]+);/gi, (m, n) => ENT_NOMES[n.toLowerCase()] ?? m);
const xmlDec = x => entNum(entNum(String(x || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')));
const limpaTituloFonte = t => String(t || '').replace(/\s+via\s+@\w+(?:\s*,?\s*(?:and\s+|e\s+)?@\w+)*\s*$/i, '').replace(/\s+/g, ' ').trim();   // "… via @sejournal, @MattGSouthern" é crédito do feed, não faz parte da manchete

const xmlTag = (x, t) => { const m = String(x).match(new RegExp(`<${t}(?:\\s[^>]*)?>([\\s\\S]*?)</${t}>`, 'i')); return m ? xmlDec(m[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''; };
const xmlItens = x => String(x).split(/<item[\s>]/i).slice(1).map(b => b.split(/<\/item>/i)[0]);
// Google Trends (assuntos em alta, com as matérias que explicam cada um)
function radarParseTrends(xml) {
  return xmlItens(xml).map(b => ({ termo: xmlTag(b, 'title'), trafego: xmlTag(b, 'ht:approx_traffic'), publicado: xmlTag(b, 'pubDate'),
    noticias: [...b.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/gi)].map(m => ({ titulo: xmlTag(m[1], 'ht:news_item_title'), url: xmlTag(m[1], 'ht:news_item_url'), fonte: xmlTag(m[1], 'ht:news_item_source'), snippet: xmlTag(m[1], 'ht:news_item_snippet') })).filter(n => n.titulo) })).filter(t => t.termo);
}
// Sites de tecnologia (RSS ou Atom): manchete, link direto da matéria e a imagem de capa quando o feed traz
function radarParseFeed(xml, nomeFonte = '') {
  return String(xml).split(/<(?:item|entry)[\s>]/i).slice(1).map(b => {
    const bl = b.split(/<\/(?:item|entry)>/i)[0], titulo = limpaTituloFonte(xmlTag(bl, 'title')), link = xmlTag(bl, 'link') || (bl.match(/<link[^>]+rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || bl.match(/<link[^>]+href=["']([^"']+)["']/i) || [])[1] || '';
    const img = (bl.match(/<media:content[^>]+url=["']([^"']+)["']/i) || bl.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i) || bl.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i) || xmlDec(bl).match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1] || '';
    return { titulo, fonte: nomeFonte, url: xmlDec(link).trim(), publicado: xmlTag(bl, 'pubDate') || xmlTag(bl, 'published') || xmlTag(bl, 'updated'), snippet: xmlTag(bl, 'description').slice(0, 300) || xmlTag(bl, 'summary').slice(0, 300), img: xmlDec(img).trim() };
  }).filter(n => n.titulo && n.url);
}
const radarFeedCache = new Map();
async function radarFeed(url, nome) {
  const k = radarFeedCache.get(url); if (k && Date.now() - k.ts < 10 * 60e3) return k.itens;
  const itens = radarParseFeed(await radarFetch(url), nome); radarFeedCache.set(url, { ts: Date.now(), itens }); return itens;
}
// Google Notícias (busca por assunto)
function radarParseNews(xml) {
  return xmlItens(xml).map(b => { const fonte = xmlTag(b, 'source'); let titulo = xmlTag(b, 'title'); if (fonte && titulo.endsWith(' - ' + fonte)) titulo = titulo.slice(0, -(fonte.length + 3)); return { titulo, fonte, url: xmlTag(b, 'link'), publicado: xmlTag(b, 'pubDate') }; }).filter(n => n.titulo);
}
async function radarFetch(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; AgentesSIM-Radar/1.0)', accept: 'application/rss+xml, application/xml, text/xml, */*' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${new URL(url).hostname}`);
  return r.text();
}
let radarTrendsCache = { geo: '', ts: 0, itens: [] };
async function radarTrends(geo) {
  if (radarTrendsCache.geo === geo && Date.now() - radarTrendsCache.ts < 10 * 60e3) return radarTrendsCache.itens;
  const itens = radarParseTrends(await radarFetch(`https://trends.google.com/trending/rss?geo=${geo}`));
  radarTrendsCache = { geo, ts: Date.now(), itens }; return itens;
}
const radarNorm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const radarData = v => { const d = new Date(v); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
// junta o que está em alta com as notícias dos termos da marca, tira o que o Radar já viu e guarda como "novo"
async function radarColeta(brand, cfgM, geo) {
  const vistos = new Set(all('SELECT titulo, url FROM radar_items WHERE brand=? COLLATE NOCASE ORDER BY id DESC LIMIT 600', brand).flatMap(x => [radarNorm(x.titulo), x.url]).filter(Boolean));
  const feitas = new Set(all('SELECT title FROM contents WHERE teste=0 ORDER BY id DESC LIMIT 80').map(x => radarNorm(x.title)));
  const cand = [], erros = [], add = c => { const k = radarNorm(c.titulo); if (!k || vistos.has(k) || (c.url && vistos.has(c.url)) || feitas.has(k)) return; vistos.add(k); cand.push(c); };
  try { for (const t of (await radarTrends(geo)).slice(0, 25)) for (const n of t.noticias.slice(0, 2)) add({ origem: 'trends', termo: t.termo, trafego: t.trafego, titulo: n.titulo, fonte: n.fonte, url: n.url, snippet: n.snippet, publicado: radarData(t.publicado) }); }
  catch (e) { erros.push('Google Trends: ' + e.message); }
  const cfgR = radarCfg(), nichoM = cfgM?.nicho || '', fontes = cfgR.fontes.filter(f => f.ativo && (!nichoM || (f.nichos || []).includes(nichoM))).map(f => ({ nome: f.nome, url: f.url, of: !!f.of })).concat(cfgR.extras.split('\n').filter(Boolean).map(u => ({ nome: new URL(u).hostname.replace(/^www\./, ''), url: u })));
  const limite = Date.now() - 7 * 864e5;   // janela do roteiro: 24 horas, até 7 dias se o assunto ainda estiver em alta (a nota de atualidade pesa isso)
  const rs = await Promise.allSettled(fontes.map(f => radarFeed(f.url, f.nome)));
  rs.forEach((r, i) => { if (r.status === 'rejected') { erros.push(`${fontes[i].nome}: ${r.reason?.message || 'falhou'}`); return; }
    for (const n of r.value.filter(x => { const d = new Date(x.publicado).getTime(); return !d || d >= limite; }).slice(0, 8)) add({ origem: 'site', of: fontes[i].of, termo: fontes[i].nome, trafego: '', titulo: n.titulo, fonte: n.fonte, url: n.url, snippet: n.snippet, publicado: radarData(n.publicado), img: n.img }); });
  const termos = String(cfgM?.termos || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean).slice(0, 6);
  for (const termo of termos) {
    try { const xml = await radarFetch(`https://news.google.com/rss/search?q=${encodeURIComponent(termo + ' when:2d')}&hl=pt-BR&gl=${geo}&ceid=${geo}:pt-419`); for (const n of radarParseNews(xml).slice(0, 6)) add({ origem: 'noticias', termo, trafego: '', titulo: n.titulo, fonte: n.fonte, url: n.url, snippet: '', publicado: radarData(n.publicado) }); }
    catch (e) { erros.push(`Notícias "${termo}": ${e.message}`); }
  }
  // itens 'novo' da última busca ainda sem pauta (modo chat roda o pedido duas vezes: ao montar e ao colar a resposta; e uma falha antes de escolher não perde a busca)
  const pend = all("SELECT * FROM radar_items WHERE brand=? COLLATE NOCASE AND status='novo' AND created_at > ? ORDER BY id", brand, new Date(Date.now() - 6 * 3600e3).toISOString()).map(x => ({ ...x }));
  const out = pend.concat([...cand.filter(c => c.origem === 'trends').slice(0, 14), ...cand.filter(c => c.origem === 'site').slice(0, 24), ...cand.filter(c => c.origem === 'noticias').slice(0, 18)].map(c => ({ ...c, id: +run("INSERT INTO radar_items(brand,titulo,fonte,url,snippet,origem,termo,trafego,publicado,status,created_at,img_url) VALUES(?,?,?,?,?,?,?,?,?,'novo',?,?)", brand, c.titulo.slice(0, 300), c.fonte.slice(0, 120), c.url.slice(0, 600), (c.snippet || '').slice(0, 400), c.origem, c.termo.slice(0, 120), c.trafego, c.publicado, T(), String(c.img || '').slice(0, 600)).lastInsertRowid })));
  return { itens: out, erros };
}
const RADAR_REGRAS = ['Nunca invente fato, número, citação, data ou link; todo número precisa de fonte e data.', 'Separe o que é fato confirmado do que é opinião ou rumor; se as fontes divergirem, diga a divergência.', 'Abra a matéria inteira e localize a origem (comunicado oficial, documento, estudo ou declaração direta); confirme em 2 fontes independentes ou em 1 fonte oficial.'];
function radarBrief(it, extra = {}) {
  const nich = RADAR_NICHOS[extra.nicho];
  return [`NOTÍCIA PESQUISADA PELO AGENTE DE NOTÍCIAS (${it.origem === 'site' ? 'site: ' + it.termo : it.origem === 'trends' ? 'Google Trends: "' + it.termo + '"' + (it.trafego ? ', ' + it.trafego + ' buscas' : '') : 'Google Notícias: "' + it.termo + '"'})`,
    `MANCHETE DA FONTE (só referência do fato, NÃO copie nem encurte): ${limpaTituloFonte(xmlDec(it.titulo))}${it.fonte ? ' — ' + it.fonte : ''}${it.publicado ? ' (' + it.publicado + ')' : ''}`, it.url ? `Link: ${it.url}` : '', it.snippet ? `Trecho: ${it.snippet}` : '',
    nich ? `NICHO: ${nich.nome}${extra.subnicho ? ' · subnicho: ' + extra.subnicho : ''}` : '', extra.status ? `STATUS: ${extra.status}` : '', it.publicado ? `DATA DO FATO: ${it.publicado.split('-').reverse().join('/')}` : '', extra.trends ? `GOOGLE TRENDS: ${extra.trends}` : '', extra.nota ? `NOTA DE RELEVÂNCIA: ${extra.nota}` : '',
    extra.angulo ? `ÂNGULO: ${extra.angulo}` : '', extra.fatos?.length ? `FATOS (só estes saíram dos dados do Radar; use-os):\n${extra.fatos.map(f => '- ' + f).join('\n')}` : '', extra.porque ? `Por que importa para a marca: ${extra.porque}` : '', extra.estilo ? `TEMPLATE DE NOTÍCIA DA MARCA (a arte sai nele, não no carrossel institucional): ${extra.estilo}` : '',
    nich ? `ATENÇÃO DO NICHO: ${nich.atencao}` : '', 'REGRAS DE PRECISÃO: ' + RADAR_REGRAS.join(' '),
    'NOTÍCIA NÃO LEVA MASCOTE: nenhuma página usa mascote, personagem ou imagem gerada; a imagem é sempre a foto real da matéria.', 'ESCREVA A MANCHETE DA ARTE no ESTILO DO DONO (manual "Manchetes de notícia" da sua base): sua, nova, 100% fiel aos fatos acima. Estrutura: [SUJEITO RECONHECÍVEL] + [VERBO NO PRESENTE] + [O FATO] + [UM DETALHE QUE DÁ PESO]. O detalhe é um destes, tirado dos fatos: número exato, valor em R$ ou US$, prazo ("tem até sexta-feira", "nesta terça-feira"), recorde ou "primeira vez", contraste ("mesmo após...") ou quem mais participa ("incluindo..."). De 14 a 24 palavras (até 140 caracteres), uma só ideia, entendida sozinha sem a legenda. A manchete JÁ CONTA O FATO: a curiosidade vem do detalhe, não de esconder a informação. Segundo detalhe entra com ponto-e-vírgula, dois-pontos ou "incluindo/mesmo após/em caso de". Apelido ou citação curta vai entre aspas. Exemplos do estilo (só a construção, não copie o assunto): "Justiça derruba proibição para três bets no Brasil e prevê multa de R$ 200 mil por dia ao governo em caso de descumprimento"; "Cearense de apenas 16 anos conquista maior nota da história da Olimpíada Internacional de Economia"; "Lula tem até sexta-feira para sancionar lei que cria exame obrigatório para médicos, chamado de \"OAB da Medicina\""; "Finalmente: agora é possível registrar pets com o sobrenome da família em cartórios brasileiros". Escreva 3 versões na cabeça e entregue só a que tem o detalhe mais forte. NÃO MUDE A NOTÍCIA: números, nomes, datas e o que aconteceu ficam exatamente como nos fatos; só a forma de contar muda. Proibido: copiar a manchete da fonte, começar com "Saiba/Confira/Veja/Descubra/Entenda", pergunta, ponto de exclamação, adjetivo vazio ("incrível", "chocante"), caça-clique que o fato não sustenta, acusação sem decisão oficial. Defina também o ÂNGULO e o GANCHO da primeira frase da legenda. Linguagem simples, para quem não é do meio; cite fonte e data na legenda.'].filter(Boolean).join('\n').slice(0, 4500);
}
// Cada marca tem o PRÓPRIO template de notícia (escolhido na tela do Agente de Notícias). Nunca cai no template institucional do carrossel nem no de outra marca.
function radarEstiloDaMarca(brand) {
  const id = radarCfg().marcas[brand]?.estilo || '';
  if (/^layout-\d+$/.test(id)) { const l = radarLayoutsDaMarca(brand).find(x => 'layout-' + x.id === id); return l ? { id, nome: l.name, formatos: [l.format], seq: [{ modelo: 'citacao' }], tema: '', casa: false, layoutId: l.id } : null; }
  const t = id && templateDe(id);
  return t && templatesDaMarca(brand).some(x => x.id === id) ? t : null;
}
// Layouts que o dono montou e salvou na marca (uma página só) também valem como template de notícia: a arte sai idêntica, só trocam a manchete e a foto
function radarLayoutsDaMarca(brand) {
  try { return all('SELECT * FROM art_layouts WHERE brand=? COLLATE NOCASE ORDER BY id DESC', brand || '').filter(l => RADAR_FMTS.includes(l.format) && (jparse(l.spec, {}).slides || []).length >= 1); } catch { return []; }
}
// Contracapa da notícia: foto (a 2ª melhor) com o cartão de post do X. O texto sai da legenda que o copy escreveu (2 primeiras frases) + chamada para comentar e seguir
// Garante uma 2ª foto (diferente da capa) para a contracapa: busca de novo na internet se a primeira busca não trouxe
// Impressão visual (dHash 9x8) da foto: pega a MESMA imagem vinda de outra URL/resolução, que a comparação por endereço e tamanho não pega
function hashFoto(buf) {
  try { const g = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-vf', 'scale=9:8:flags=area,format=gray', '-f', 'rawvideo', '-'], { input: buf, timeout: 20000, maxBuffer: 1e5 }); if (g.length < 72) return null;
    let h = 0n; for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) h = (h << 1n) | (g[y * 9 + x] > g[y * 9 + x + 1] ? 1n : 0n); return h; } catch { return null; }
}
function fotosParecidas(a, b) {   // a, b: buffers; true quando são visualmente a mesma foto (também recortada/redimensionada)
  if (!a || !b) return false; const ha = hashFoto(a), hb = hashFoto(b); if (ha === null || hb === null) return false;
  let x = ha ^ hb, d = 0; while (x) { d += Number(x & 1n); x >>= 1n; } return d <= 14;
}
function bufDoAsset(a) { try { return a ? fs.readFileSync(path.join(ASSET_DIR, a.id + '.' + a.ext)) : null; } catch { return null; } }
async function radarGarantiFoto2(c) {   // REGRA: puxa 5-6 imagens do assunto, escolhe as 2 melhores (capa + contracapa); a contracapa SEMPRE leva uma foto relacionada à notícia
  try {
    const it = one('SELECT * FROM radar_items WHERE content_id=?', c.id); if (!it || !it.foto_asset || als.getStore()?.dry) return;
    const a1 = assetDaMarca(c.brand, it.foto_asset), b1 = bufDoAsset(a1), a2 = it.foto2_asset ? assetDaMarca(c.brand, it.foto2_asset) : null;
    if (a2 && it.foto2_asset !== it.foto_asset && !(b1 && bufDoAsset(a2) && fotosParecidas(b1, bufDoAsset(a2)))) return;
    if (a2) run("UPDATE radar_items SET foto2_asset='' WHERE id=?", it.id);   // 2ª foto igual à capa: descarta e procura outra
    const ents = radarEntidades(it.titulo), usada = u => (a1?.note || '').includes(u);
    let lista = []; try { lista = (await radarImagensWeb(it)).lista || []; } catch { /* segue para a matéria */ }
    if (lista.length < 6) { try { const real = await radarLinkReal(it.url || ''); if (real) { const pg = await webGetSeguro(real, { max: 3e6 }); lista = lista.concat(radarImagensDaPagina(pg.buf.toString('utf8'), pg.url).filter(u => /^https:\/\//.test(u)).map(u => ({ u }))); } } catch { /* sem a matéria */ } }
    const vistos = new Set(), filtra = l => l.filter(x => x.u && !usada(x.u) && !vistos.has(x.u) && vistos.add(x.u));
    const outraQue = r0 => { if (!r0?.buf) return null; for (const x of [r0, ...(r0.outras || [])]) if (x.buf && x.buf.length !== a1?.size && !(b1 && fotosParecidas(b1, x.buf))) return x; return null; };
    lista = filtra(lista); let r = lista.length ? outraQue(await radarEscolheImagem(lista, '', ents, 6, [1000, 560])) : null;
    if (!r?.buf) {   // 2ª tentativa com outra busca (assunto + "notícia", ou as primeiras palavras da manchete)
      const q2 = (ents.length ? ents.slice(0, 2).join(' ') + ' notícia' : String(it.titulo || '').split(/\s+/).slice(0, 5).join(' ')); let l2 = []; try { l2 = filtra((await radarImagensWeb({ ...it, titulo: q2 })).lista || []); } catch { /* sem 2ª busca */ }
      r = l2.length ? outraQue(await radarEscolheImagem(l2, '', ents, 6, [1000, 560])) : null;
    }
    if (!r?.buf) return;
    const p = salvaFotoRadar(it, r, 'busca na internet', '', '-2'); run('UPDATE radar_items SET foto2_asset=? WHERE id=?', p.name, it.id);
  } catch { /* sem 2ª foto: a contracapa usa o fundo da marca */ }
}
function textoContracapa(c) {   // REGRA: texto CURTO (resumo de até ~95 caracteres + chamada curta), como o post pequeno do X
  const it = one('SELECT * FROM radar_items WHERE content_id=?', c.id) || {};
  let cap = String(parseCaption(c.script) || c.caption || '').replace(/#\S+/g, ' ').replace(/^\s*(fonte|cr[eé]dito|foto)\s*:.*$/gim, ' ').replace(/https?:\/\/\S+/g, ' ').replace(/[*_]+/g, '').replace(/\s+/g, ' ').trim();
  if (cap.length < 40) cap = limpaTituloFonte(xmlDec(String(it.snippet || ''))).replace(/\s+/g, ' ').trim();
  if (cap.length < 40) cap = String(c.title || '').trim();
  const fr = cap.match(/[^.!?…]+[.!?…]+(\s|$)/g) || [cap]; let t = fr[0].trim();
  if (t.length > 100 && fr.length > 1 && fr[1].trim().length < t.length) t = fr[1].trim();
  if (t.length > 100) t = t.slice(0, 98).replace(/\s+\S*$/, '');
  t = t.replace(/[\s,;:–—-]+$/, ''); if (!/[.!?…]$/.test(t)) t += '.';
  const cta = radarCfg().marcas[c.brand]?.cta || 'Comente o que achou e *siga a página*.';   // chamada por marca (seguir ou vender), editável na tela do Agente de Notícias
  return (t + ' ' + cta).slice(0, 220);
}
// CONFERÊNCIA AUTOMÁTICA (o sistema não entrega arte com falha sem avisar): capa e contracapa com foto, fotos diferentes, texto curto
function confereNoticia(cap, cc, foto1) {
  const p = [], f2 = cc?.bg?.asset || cc?.dados?.foto || '';
  if (!cc) p.push('sem contracapa'); else {
    if (!f2) p.push('contracapa sem foto da notícia (só fundo da marca): troque a imagem na aba Arte');
    else if (foto1 && f2 === foto1) p.push('contracapa repete a foto da capa');
  }
  if (!foto1) p.push('capa sem foto');
  const out = p.length ? 'ATENÇÃO — ' + p.join('; ') : '';
  if (out) log('designer', out, cap?.id);
  return out;
}
function contracapaNoticia(c, foto1) {
  try {
    const it = one('SELECT * FROM radar_items WHERE content_id=?', c.id) || {}, f2 = it.foto2_asset && assetDaMarca(c.brand, it.foto2_asset) ? it.foto2_asset : '', foto = f2 && f2 !== foto1 && !(foto1 && fotosParecidas(bufDoAsset(assetDaMarca(c.brand, foto1)), bufDoAsset(assetDaMarca(c.brand, f2)))) ? f2 : '';   // REGRA: a contracapa NUNCA repete a foto da capa; sem 2ª foto, fica o fundo escuro da marca
    const r = compoeModelos({ slides: [{ modelo: 'post-card', dados: { titulo: textoContracapa(c), x: true, ...(foto ? { foto } : {}) } }] }, 'carrossel', c.brand, null);
    return r?.slides?.[0] || null;
  } catch (e) { console.error('contracapa:', e.message); return null; }
}

// ───────── O sistema aprende a regra: os templates/layouts de notícia ESCOLHIDOS no Agente de Notícias ganham, gravados no banco, a "LEIA A LEGENDA" e a contracapa (cartão do X). Roda ao iniciar; é idempotente.
const AMOSTRA_CARD = 'Resumo curto da notícia em uma frase. Comente o que achou e *siga a página*.', AMOSTRA_MANCHETE = 'Manchete da notícia que prende a atenção em poucas palavras';
function contracapaAmostra(brand) {
  const r = compoeModelos({ slides: [{ modelo: 'post-card', dados: { titulo: AMOSTRA_CARD, x: true } }] }, 'carrossel', brand, null);
  return r?.slides?.[0] || null;
}
function migraLayoutNoticia(lid) {
  const l = one('SELECT * FROM art_layouts WHERE id=?', lid); if (!l) return false;
  const sp = jparse(l.spec, {}), s0 = sp.slides?.[0]; if (!s0) return false;
  const leia = (s0.texts || []).some(t => /^leia a legenda$/i.test(String(t.value || '').trim()) && t.weight === 300), tem2 = sp.slides.length > 1; if (leia && tem2) return false;
  const main = (s0.texts || []).filter(t => String(t.value || '').trim() && !/^leia a legenda$/i.test(String(t.value).trim())).sort((a, b) => (b.size || 0) - (a.size || 0))[0]; if (!main) return false;
  if (!leia) layoutNoticiaTexto(s0, main, sp.accent, String(main.value || '').replace(/[*|]+/g, ' ').replace(/\s+/g, ' ').trim() || AMOSTRA_MANCHETE, 1350);
  if (!tem2) { const cc = contracapaAmostra(l.brand || ''); if (cc) sp.slides.push(cc); }
  const novo = sanitizeArteSpec(sp, 'carrossel'); if (!novo) return false;
  run('UPDATE art_layouts SET spec=?, format=?, updated_at=? WHERE id=?', JSON.stringify(novo), 'carrossel', T(), l.id);
  log('designer', `Layout de notícia “${l.name}” atualizado: LEIA A LEGENDA embaixo da manchete e contracapa com o cartão do X (2 páginas)`); return true;
}
const estilosProtegidos = () => new Set(jparse(one("SELECT value FROM settings WHERE key='estilos_sem_migracao'")?.value, []));   // estilos que o dono pediu para ficarem exatamente como estão (a migração automática não mexe)
function migraTemplateNoticia(id, brand) {
  const row = tplRow(id), tpl = templateDe(id); if (!row || !tpl || estilosProtegidos().has(row.id)) return false;
  const mapa = visMapa(row), k0 = String(brand).toLowerCase(), ent = mapa[k0] || Object.values(mapa)[0];
  { const sn = ent?.snaps?.carrossel, leiaOk = sl => (sl?.texts || []).some(t => /^leia a legenda$/i.test(String(t.value || '').trim()) && t.weight === 300), inicialSolta = sl => (sl?.texts || []).some(t => ['title', 'badge'].includes(t.role) && String(t.value || '').trim().length === 1 && /[A-Za-z0-9]/.test(String(t.value)) && (t.y || 0) > .4);   // letra do avatar solta na capa (erro de versões anteriores): refaz
    if (sn?.slides?.length >= 2 && leiaOk(sn.slides[0]) && !inicialSolta(sn.slides[0])) return false; }   // já tem capa com "Leia a legenda" + contracapa
  const m0 = tpl.seq?.[0]?.modelo; if (!['noticia', 'manchete-foto', 'citacao'].includes(m0)) return false;
  const cover = compoeModelos({ slides: [{ modelo: m0, dados: { titulo: AMOSTRA_MANCHETE } }], estilo: id }, 'carrossel', brand, { kind: 'noticia', brand });
  const cc = contracapaAmostra(brand); if (!cover?.slides?.length || !cc) return false;
  const sp = sanitizeArteSpec({ ...cover, slides: [cover.slides[0], cc] }, 'carrossel'); if (!sp) return false;
  const seq = templateDaArte(sp), vis = visualDaArte(sp, 'carrossel', brand), agora = T(), fmts = [...new Set([...(tpl.formatos || []), 'carrossel'])];
  const feedOk = (mapa[k0]?.snaps?.feed?.slides?.[0]?.texts || []).some(t => /^leia a legenda$/i.test(String(t.value || '').trim()) && t.weight === 300);
  mapa[k0] = { brand, at: agora, pages: vis, snaps: { ...(mapa[k0]?.snaps || {}), carrossel: sp, ...(feedOk ? {} : { feed: { ...sp, slides: [sp.slides[0]] } }) }, autoFeed: !feedOk };
  run('UPDATE art_templates SET seq=?, formatos=?, visual=?, visual_brand=?, visual_at=? WHERE id=?', JSON.stringify(seq), JSON.stringify(fmts), JSON.stringify(mapa), brand, agora, row.id);
  log('designer', `Template de notícia “${tpl.nome}” (${brand}) atualizado: LEIA A LEGENDA embaixo da manchete e contracapa com o cartão do X (2 páginas)`); return true;
}
function migraTodosEstilosNoticia() {   // TODO estilo de notícia (de qualquer marca, escolhido ou não no Agente de Notícias): capa com "Leia a legenda" + contracapa do mesmo estilo
  let n = 0;
  try {
    for (const r of all('SELECT * FROM art_templates ORDER BY id').filter(x => !x.central)) {
      const tpl = tplDono(r); if (!fixo2(tpl) || estilosProtegidos().has(r.id)) continue;
      for (const m of Object.values(visMapa(r))) if (m?.brand) { try { if (migraTemplateNoticia('dono-' + r.id, m.brand)) n++; } catch (e) { console.error('estilo de notícia (' + r.nome + '):', e.message); } }
    }
    if (n) changed();
  } catch (e) { console.error('estilos de notícia:', e.message); }
  return n;
}
// "Leia a legenda" sempre pequeno e fino (Inter 300, caixa normal) em qualquer capa de notícia já guardada, inclusive as editadas à mão
function afinaLegendaSpec(sp) {
  let n = 0; const fix = t => { if (!t || !/^leia a legenda$/i.test(String(t.value || '').trim())) return; if (t.weight === 300 && (t.size || 0) <= 32 && t.caixa === 'normal') return; t.weight = 300; t.size = Math.min(t.size || 30, 30); t.caixa = 'normal'; t.upper = false; t.italic = false; t.opacity = 0.85; t.color = '#ffffff'; t.ls = 0.02; n++; };
  for (const sl of sp?.slides || []) for (const t of sl.texts || []) fix(t);
  return n;
}
function afinaLegendasNoticia() {
  let n = 0;
  try {
    for (const r of all('SELECT id, visual FROM art_templates')) { const mapa = jparse(r.visual, null); if (!mapa || typeof mapa !== 'object') continue; let c = 0; for (const m of Object.values(mapa)) for (const sn of Object.values(m?.snaps || {})) c += afinaLegendaSpec(sn); if (c) { run('UPDATE art_templates SET visual=? WHERE id=?', JSON.stringify(mapa), r.id); n += c; } }
    for (const l of all('SELECT id, spec FROM art_layouts')) { const sp = jparse(l.spec, null); if (sp && afinaLegendaSpec(sp)) { run('UPDATE art_layouts SET spec=? WHERE id=?', JSON.stringify(sp), l.id); n++; } }
    if (n) { log('designer', `"Leia a legenda" ficou menor e fina em ${n} capa(s) de notícia guardada(s)`); changed(); }
  } catch (e) { console.error('legenda fina:', e.message); }
}
const textoFora = t => !!t && String(t.value || '').trim() && !t.moldura && (t.x < -.03 || t.x > 1.03 || t.y < -.03 || t.y > 1.03);
function saneiaEstilosNoticia() {   // ajustes de estilo guardados que jogam a manchete para fora da arte (bug de versões anteriores): apaga o ajuste ruim e refaz a amostra
  let n = 0;
  try {
    for (const r of all('SELECT id, visual FROM art_templates')) {
      const mapa = jparse(r.visual, null); if (!mapa || typeof mapa !== 'object' || Array.isArray(mapa)) continue; let mud = false;
      for (const ent of Object.values(mapa)) {
        for (const pg of ent?.pages || []) for (const [k, d] of Object.entries(pg?.t || {})) if (/^(title|body|number)#/.test(k) && d && (Math.abs(d.dx || 0) > .3 || Math.abs(d.dy || 0) > .3)) { delete pg.t[k]; mud = true; n++; }
        for (const sn of Object.values(ent?.snaps || {})) if ((sn?.slides || []).some(sl => (sl.texts || []).some(textoFora))) { delete ent.snaps.carrossel; delete ent.snaps.feed; mud = true; break; }
      }
      if (mud) run('UPDATE art_templates SET visual=? WHERE id=?', JSON.stringify(mapa), r.id);
    }
    if (n) { log('designer', `Estilo(s) de notícia consertado(s): ${n} ajuste(s) que jogavam a manchete para fora da arte foram removidos`); changed(); }
  } catch (e) { console.error('sanear estilos:', e.message); }
}
async function reparaPecasForaDaTela() {   // peças já montadas cuja manchete ficou fora da arte (não aparece nem no editor): recoloca no lugar certo
  let n = 0;
  for (const r of all("SELECT id, art_spec, art_spec_base, format FROM contents WHERE art_spec!='' ORDER BY id DESC LIMIT 400")) {
    try {
      const sp = jparse(r.art_spec, null); if (!sp?.slides?.length) continue; let mud = false; const H = r.format === 'stories' ? 1920 : 1350;
      for (const [i, sl] of sp.slides.entries()) {
        const fora = (sl.texts || []).filter(textoFora); if (!fora.length) continue;
        const main = fora.sort((a, b) => (b.size || 0) - (a.size || 0))[0];
        if (i === 0 && ['noticia', 'manchete-foto', 'citacao'].includes(sl.modelo) && ['title', 'body'].includes(main.role || 'body') && (main.size || 0) >= 60) {
          const tit = String(main.value).replace(/[|]+/g, ' ').replace(/\s+/g, ' ').trim(); main.value = tit; main.x = .5; main.align = 'center'; main.reflow = true; delete main.nowrap; main.upper = true; main.front = true; main.size = 150;
          layoutNoticiaTexto(sl, main, sp.accent, tit.replace(/[*]+/g, ''), H);
        } else for (const t of fora) { t.x = Math.max(.08, Math.min(.92, t.x)); t.y = Math.max(.06, Math.min(.94, t.y)); }
        mud = true;
      }
      if (!mud) continue; const j = JSON.stringify(sp), igual = r.art_spec === r.art_spec_base;
      setContent(r.id, { art_spec: j, ...(igual ? { art_spec_base: j } : {}) }); await renderArte(r.id); n++;
    } catch (e) { console.error('reparo da arte ' + r.id + ':', e.message); }
  }
  if (n) { log('designer', `Manchete recolocada na arte de ${n} peça(s) em que ela tinha saído da tela`); changed(); }
  return n;
}
// Estilos salvos pelo dono que versões anteriores apagaram junto ao esconder um estilo da casa: voltam uma única vez, com o id e a marca de antes
function restauraEstilosApagados() {
  return;   // desligado: o que você apaga (e esvazia da lixeira) não volta mais por nenhum caminho automático
  try {
    if (one("SELECT value FROM settings WHERE key='restauro_estilos_217'")) return;
    const f = path.join(__dirname, 'motor', 'estilos-restaurar.json'); if (!fs.existsSync(f)) return;
    const back = [], prot = [...estilosProtegidos()];
    for (const r of JSON.parse(fs.readFileSync(f, 'utf8'))) {
      if (one('SELECT id FROM art_templates WHERE id=?', r.id) || one('SELECT id FROM art_templates WHERE lower(nome)=lower(?) AND lower(brand)=lower(?)', r.nome, r.brand)) continue;
      if (!one('SELECT name FROM brands WHERE name=? COLLATE NOCASE', r.brand)) continue;
      run('INSERT INTO art_templates(id,nome,uso,nivel,formatos,seq,exemplo,brand,usos,created_at,central,visual,visual_brand,base,visual_at,tema,deriva) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', r.id, r.nome, r.uso, r.nivel, r.formatos, r.seq, r.exemplo || '', r.brand, r.usos || 0, r.created_at, '', r.visual, r.visual_brand, r.base || '', r.visual_at, r.tema, r.deriva);
      back.push(`“${r.nome}” (${r.brand})`);
      prot.push(r.id);
    }
    run("INSERT INTO settings(key,value) VALUES('restauro_estilos_217','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
    if (back.length) run("INSERT INTO settings(key,value) VALUES('estilos_sem_migracao',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(prot));
    if (back.length) { log('designer', `Estilo(s) salvo(s) que tinham sido apagados junto com um estilo da casa voltaram: ${back.join(', ')}`); changed(); }
  } catch (e) { console.error('restauro de estilos:', e.message); }
}
function consertaManchetesUmaLinha() {   // artes de notícia já feitas: (1) manchete presa numa linha só (nowrap herdado do layout) volta a quebrar em várias linhas; (2) contracapa com a MESMA foto da capa troca para o fundo da marca
  let n = 0;
  try {
    for (const r of all("SELECT id, format, art_spec FROM contents WHERE kind='noticia' AND art_spec<>'' AND IFNULL(teste,0)=0 ORDER BY id DESC LIMIT 60")) {
      const sp = jparse(r.art_spec, null), sl = sp?.slides?.[0]; if (!sl) continue; let mud = false;
      const main = (sl.texts || []).filter(t => !/^leia a legenda$/i.test(String(t.value || '').trim())).sort((a, b) => (b.size || 0) - (a.size || 0))[0];
      const lg = (sl.texts || []).find(t => /^leia a legenda$/i.test(String(t.value || '').trim()));
      if (['noticia', 'manchete-foto', 'citacao', undefined].includes(sl.modelo) && main && (main.nowrap === true || (lg && (lg.size || 0) < 28)) && String(main.value || '').length >= 30 && (sl.shapes || []).some(x => x.kind === 'line')) {
        layoutNoticiaTexto(sl, main, sp.accent, String(main.value).replace(/[*|]+/g, ' ').replace(/\s+/g, ' ').trim(), r.format === 'stories' ? 1920 : 1350); mud = true; }
      const c = getContent(r.id), f1 = sl.bg?.asset || '', f2 = sp.slides[1]?.bg?.asset || sp.slides[1]?.dados?.foto || '';
      if (c && f1 && f2 && (f1 === f2 || fotosParecidas(bufDoAsset(assetDaMarca(c.brand, f1)), bufDoAsset(assetDaMarca(c.brand, f2))))) { const cc = contracapaNoticia(c, f1); if (cc) { sp.slides[1] = cc; mud = true; } }
      if (!mud) continue;
      const j = JSON.stringify(sp); setContent(r.id, { art_spec: j, art_spec_base: j }); n++; renderArte(r.id).catch(() => {});
    }
    if (n) { log('designer', `Artes de notícia corrigidas (manchete em linha única / foto repetida na contracapa): ${n}`); changed(); }
  } catch (e) { console.error('conserto de notícias:', e.message); }
}
function migraNoticiaTemplates() {
  try {
    saneiaEstilosNoticia(); migraTodosEstilosNoticia(); afinaLegendasNoticia();
    consertaManchetesUmaLinha();
    for (const [brand, m] of Object.entries(radarCfg().marcas)) {
      const id = m.estilo || '', mt = id.match(/^layout-(\d+)$/);
      try { if (mt) migraLayoutNoticia(+mt[1]); else if (/^dono-\d+$/.test(id)) migraTemplateNoticia(id, brand); } catch (e) { console.error('migração de notícia (' + brand + '):', e.message); }
    }
    changed();
  } catch (e) { console.error('migração de notícia:', e.message); }
}
// Manchete encolhe para caber entre a linha e a legenda; "LEIA A LEGENDA" fica fixa embaixo, com os espaços da regra (linha 3,2% · manchete→legenda 5% · legenda→borda 4,5%)
function layoutNoticiaTexto(s, main, accent, tit, H) {
  const W = 1080, lgSz = Math.round(W * 0.028);
  { const lin = (s.shapes || []).filter(x => x.kind === 'line').sort((a, b) => b.y - a.y)[0], liny = lin ? lin.y : 0.55, lh = main.lh || 1, bw = Math.max(main.w || 0.8, 0.9) * W, bot = H * 0.955, lgTop = bot - lgSz * 1.2, fim = lgTop - H * 0.03;
    const outros = (s.texts || []).filter(t => t !== main && !/^leia a legenda$/i.test(String(t.value || '').trim()) && (t.y || 0) < liny).map(t => t.y || 0), limite = outros.length ? Math.max(...outros) + 0.05 : 0.3, subir = Math.max(0, Math.min(H * 0.14, (liny - limite) * H));   // até onde a linha pode subir sem bater no selo/perfil
    const cwk = /impact|bebas|anton|oswald|league/i.test(String(main.font || '')) ? 0.47 : 0.53, top0 = liny * H + H * 0.032, linhas = (sz) => { let n = 1, cur = 0; for (const w of tit.toUpperCase().split(' ')) { const wl = w.length * sz * cwk, esp = sz * 0.24; if (cur && cur + esp + wl > bw) { n++; cur = wl; } else cur += (cur ? esp : 0) + wl; } return n; };
    const g1 = H * 0.02, g2 = H * 0.024, alt = (sz) => linhas(sz) * sz * lh, lgTopMin = bot - lgSz * 1.2, disp = lgTopMin - g2 - (liny * H + g1);   // grupo compacto: logo+linha, manchete e legenda juntos (sem vazios), colado embaixo
    let sz = Math.max(main.size || 0, Math.round(W * 0.15));
    while (sz > 40 && (linhas(sz) > 5 || alt(sz) > disp + subir)) sz -= 2;
    const hT = alt(sz), linyNova = (lgTopMin - g2 - hT - g1) / H, mov = liny - linyNova;   // mov > 0 sobe, < 0 desce
    if (Math.abs(mov) > 0.0005) { for (const x of s.shapes || []) if (x.kind === 'line') x.y = Math.round((x.y - mov) * 1000) / 1000; for (const it of s.items || []) if (Math.abs((it.y || 0) - liny) < 0.07) it.y = Math.round((it.y - mov) * 1000) / 1000; }
    main.size = sz; main.w = bw / W; main.reflow = true; main.nowrap = false; main.align = 'center'; main.x = 0.5; main.y = Math.round((lgTopMin - g2 - hT / 2) / H * 1000) / 1000;
    s.texts = (s.texts || []).filter(t => !/^leia a legenda$/i.test(String(t.value || '').trim()));
    s.texts.push({ ...main, value: 'Leia a legenda', role: 'label', x: 0.5, y: Math.round((lgTop + lgSz * 0.6) / H * 1000) / 1000, size: lgSz, w: 0.8, color: '#ffffff', opacity: 0.85, font: 'inter', weight: 300, upper: false, caixa: 'normal', italic: false, ls: 0.02, lh: 1, nowrap: true, reflow: false, hl: undefined }); }
}
// Monta a arte da notícia a partir do layout salvo: mesma posição, fonte, linha, logo e fade; troca só a manchete e a foto da matéria
async function arteDeLayoutNoticia(id, c, tn, pags, avisos = []) {
  const l = one('SELECT * FROM art_layouts WHERE id=?', tn.layoutId); if (!l) return false;
  const sp = jparse(l.spec, {}), s = JSON.parse(JSON.stringify((sp.slides || [])[0] || null)); if (!s) return false;
  const limpa = v => String(v || '').replace(/\[i:[a-z-]+\]/g, '').replace(/[*|]+/g, ' ').replace(/\s+/g, ' ').trim();
  const tit = limpa(pags[0]?.dados?.titulo || pags[0]?.dados?.frase || c.title); if (!tit) return false;
  const it = one('SELECT foto_asset FROM radar_items WHERE content_id=?', id), foto = it?.foto_asset && assetDaMarca(c.brand, it.foto_asset) ? it.foto_asset : null;
  if (foto) { s.bg = { ...(s.bg || {}), asset: foto }; if (s.dados && typeof s.dados === 'object') s.dados.foto = foto; }
  const W = 1080, H = c.format === 'stories' ? 1920 : 1350, tx = (s.texts || []).filter(t => String(t.value || '').trim());
  const main = tx.sort((a, b) => (b.size || 0) - (a.size || 0))[0]; if (!main) return false;
  main.value = tit;
  layoutNoticiaTexto(s, main, sp.accent, tit, H);
  await radarGarantiFoto2(c);
  const cc = contracapaNoticia(c, foto), fmt = cc ? 'carrossel' : c.format;
  const spec = sanitizeArteSpec({ ...sp, slides: cc ? [s, cc] : [s] }, fmt); if (!spec) return false;
  const nota = [...avisos, foto ? '' : 'Sem foto da matéria: envie a foto na aba Arte.', confereNoticia(c, spec.slides[1] || cc, foto)].filter(Boolean).join(' | ');
  setContent(id, { ...(fmt !== c.format ? { format: fmt } : {}), estilo_arte: 'l:' + l.id, art: `Arte montada no layout salvo “${l.name}” (Agente de Notícias).\nManchete: ${tit}`, art_spec: JSON.stringify(spec), art_spec_base: JSON.stringify(spec), art_status: '', art_note: nota, ...(!c.caption && parseCaption(c.script) ? { caption: parseCaption(c.script) } : {}) });
  try { run('UPDATE art_layouts SET uses=uses+1 WHERE id=?', l.id); } catch { /* contador */ }
  log('designer', `Arte de notícia montada no layout salvo “${l.name}”: "${c.title}"`, id);
  await renderArte(id); return true;
}
// Pauta só com foto: a busca da imagem é grátis e vem ANTES de qualquer gasto com IA. Sem foto boa (matéria + internet) a notícia não vira pauta e outra ocupa o lugar.
async function radarTemFoto(it) {
  let r = one('SELECT foto_asset, foto_info FROM radar_items WHERE id=?', it.id);
  if (!r?.foto_asset && !als.getStore()?.dry) { await radarFoto(it, null); r = one('SELECT foto_asset, foto_info FROM radar_items WHERE id=?', it.id); }
  return { ok: !!(r?.foto_asset && assetDaMarca(it.brand, r.foto_asset)), motivo: String(r?.foto_info || '') };
}
function radarPauta(it, o = {}) {
  const cfgM = radarCfg().marcas[it.brand] || {}, tpl = radarEstiloDaMarca(it.brand);
  if (!tpl) throw fail(400, `A marca ${it.brand || '(sem marca)'} ainda não tem template de notícia. Escolha na mesa do Agente de Notícias.`);
  const quer = tpl.seq.length === 1 && tpl.formatos.includes('feed') ? 'feed' : RADAR_FMTS.includes(o.formato) ? o.formato : (cfgM.formato || 'carrossel'), formato = tpl.formatos.includes(quer) ? quer : (tpl.formatos.find(f => RADAR_FMTS.includes(f)) || quer);
  const id = createContent({ title: limpaTituloFonte(xmlDec(String(o.titulo || it.titulo))).slice(0, 200), format: formato, kind: 'noticia', goal: '', brand: it.brand || '', platform: 'Instagram', estilo_arte: tpl.layoutId ? 'l:' + tpl.layoutId : 't:' + tpl.id, brief: radarBrief(it, { ...o, estilo: tpl.nome, nicho: cfgM.nicho || '' }) }, 'radar');
  run("UPDATE radar_items SET status='pauta', content_id=?, motivo=?, nota=? WHERE id=?", id, String(o.porque || '').slice(0, 300), String(o.nota || '').slice(0, 200), it.id);
  { const fr = one('SELECT foto_asset FROM radar_items WHERE id=?', it.id), a = fr?.foto_asset ? assetDaMarca(it.brand, fr.foto_asset) : null;
    if (a) run('UPDATE contents SET brief = brief || ? WHERE id=?', `\nFOTO DA NOTÍCIA (já está na Biblioteca como "${a.name}"): use esta foto na capa. NUNCA use mascote nem imagem gerada em notícia. ${a.note || ''}. Cite o crédito da foto na legenda.`, id);
    else if (!als.getStore()?.dry) radarFoto(it, id).catch(() => {}); }
  return id;
}
// ───────── Foto da própria notícia (para o layout de notícia: nada de mascote) ─────────
try { db.exec("ALTER TABLE radar_items ADD COLUMN nota TEXT DEFAULT ''"); } catch { /* já existe */ }
try { db.exec("ALTER TABLE radar_items ADD COLUMN foto_asset TEXT DEFAULT ''"); } catch { /* já existe */ }
try { db.exec("ALTER TABLE radar_items ADD COLUMN foto2_asset TEXT DEFAULT ''"); } catch { /* já existe */ }
try { db.exec("ALTER TABLE radar_items ADD COLUMN img_url TEXT DEFAULT ''"); } catch { /* já existe */ }
try { db.exec("ALTER TABLE radar_items ADD COLUMN foto_info TEXT DEFAULT ''"); } catch { /* já existe */ }
async function webGetSeguro(u, { max = 3e6, accept = 'text/html,*/*', timeout = 20000, headers = {} } = {}) {
  let url; try { url = new URL(u); } catch { throw new Error('link inválido'); }
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== 'https:') throw new Error('só https');
    const addr = (await dns.promises.lookup(url.hostname)).address; if (ipPrivado(addr)) throw new Error('endereço não permitido');
    const r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', accept, 'accept-language': 'pt-BR,pt;q=0.9', ...headers } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), url); continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > max) throw new Error('arquivo grande demais');
    return { buf, ct: r.headers.get('content-type') || '', url: url.toString() };
  }
  throw new Error('redirecionamentos demais');
}
// Links do Google Notícias vêm codificados: pede ao próprio Google o endereço real da matéria
async function radarLinkReal(u) {
  let url; try { url = new URL(u); } catch { return ''; }
  if (!/(^|\.)news\.google\.com$/.test(url.hostname)) return u;
  const id = url.pathname.split('/').pop();
  try {
    const pg = (await webGetSeguro(`https://news.google.com/rss/articles/${id}?hl=pt-BR&gl=BR&ceid=BR:pt-419`)).buf.toString('utf8');
    const sg = pg.match(/data-n-a-sg="([^"]+)"/)?.[1], ts = pg.match(/data-n-a-ts="([^"]+)"/)?.[1]; if (!sg || !ts) return '';
    const inner = JSON.stringify(['garturlreq', [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0], id, +ts, sg]);
    const r = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', { method: 'POST', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8', 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' }, body: 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', inner, null, 'generic']]])) });
    const txt = await r.text(), j = JSON.parse(txt.split('\n\n')[1]), real = JSON.parse(j[0][2])[1];
    return /^https:\/\//.test(real) && !/(^|\.)google\./.test(new URL(real).hostname) ? real : '';
  } catch { return ''; }
}
// tamanho real da imagem lendo só o cabeçalho (jpg, png, webp)
function dimImagem(b) {
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') { const t = b.toString('ascii', 12, 16);
      if (t === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (t === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (t === 'VP8L') { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; } }
    if (b[0] === 0xff && b[1] === 0xd8) { let i = 2; while (i < b.length - 9) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + b.readUInt16BE(i + 2); } }
  } catch { /* cabeçalho truncado */ }
  return null;
}
function radarImagensDaPagina(html, base) {
  const out = [], add = v => { try { const u = new URL(xmlDec(v).trim(), base); if (u.protocol === 'https:' && !/(^|\.)(google|gstatic|googleusercontent)\./.test(u.hostname) && !/logo|favicon|sprite|avatar|placeholder/i.test(u.pathname)) out.push(u.toString()); } catch { /* url ruim */ } };
  for (const m of html.matchAll(/<meta\s+[^>]*?(?:property|name)=["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*?>/gi)) { const c = m[0].match(/content=["']([^"']+)["']/i); if (c) add(c[1]); }
  for (const m of html.matchAll(/<meta\s+[^>]*?content=["']([^"']+)["'][^>]*?(?:property|name)=["'](?:og:image|twitter:image)["']/gi)) add(m[1]);
  const lk = html.match(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i); if (lk) add(lk[1]);
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) { try { const v = JSON.parse(m[1]); const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); for (const [k, x] of Object.entries(o)) { if (k === 'image') (Array.isArray(x) ? x : [x]).forEach(y => add(typeof y === 'string' ? y : y?.url || '')); else walk(x); } }; walk(v); } catch { /* json-ld inválido */ } }
  return [...new Set(out)].slice(0, 6);
}
// Acha a foto da matéria, confere a qualidade (lado maior >= 1000 px e menor >= 560 px) e guarda na Biblioteca da marca com o crédito
const assetDaMarca = (brand, name) => { const n = String(name || '').trim(); return n ? (one('SELECT * FROM assets WHERE name=? AND brand=? COLLATE NOCASE', n, brand || '') || one("SELECT * FROM assets WHERE name=? AND brand=''", n)) : null; };
const radarFotoEmCurso = new Map();
async function radarFoto(it, contentId) {
  if (radarFotoEmCurso.has(it.id)) return radarFotoEmCurso.get(it.id);
  const pr = radarFotoBusca(it, contentId).finally(() => radarFotoEmCurso.delete(it.id)); radarFotoEmCurso.set(it.id, pr); return pr;
}
// Busca na internet (quando a matéria não tem foto boa): usa o assunto da notícia, sem o nome do jornal, e junta Bing Imagens e DuckDuckGo.
const FOTO_BLOQUEADOS = /(^|\.)(shutterstock|alamy|gettyimages|istockphoto|depositphotos|123rf|dreamstime|adobestock|stock\.adobe|pinterest|pinimg|freepik|vecteezy|canva|facebook|fbcdn|instagram|tiktok|twimg|ytimg|gstatic|googleusercontent|bing|mm\.bing)\./i;
const FOTO_RUIM = /logo|favicon|sprite|avatar|placeholder|icon|thumb|banner|\/ads?\/|emoji|badge|loading|blank|pixel/i;
function radarQuery(titulo) {
  const t = String(titulo || '').replace(/\s+[-–—|]\s+[^-–—|]{2,40}$/, '').replace(/[“”"'‘’()\[\]:;!?…]/g, ' ');
  const ws = t.split(/\s+/).filter(w => w.length > 2 && !RADAR_STOP.has(radarNorm(w)));
  return ws.slice(0, 9).join(' ').trim();
}
// Marcas/produtos que aparecem nas manchetes: com duas ou mais, a busca vira "A vs B" e a foto precisa citar os dois
const RADAR_ENTS = [['chatgpt', 'ChatGPT'], ['openai', 'OpenAI'], ['google', 'Google'], ['gemini', 'Gemini'], ['claude', 'Claude'], ['anthropic', 'Anthropic'], ['perplexity', 'Perplexity'], ['copilot', 'Copilot'], ['microsoft', 'Microsoft'], ['bing', 'Bing'], ['meta', 'Meta'], ['facebook', 'Facebook'], ['instagram', 'Instagram'], ['whatsapp', 'WhatsApp'], ['tiktok', 'TikTok'], ['youtube', 'YouTube'], ['linkedin', 'LinkedIn'], ['pinterest', 'Pinterest'], ['twitter', 'Twitter'], ['threads', 'Threads'], ['apple', 'Apple'], ['amazon', 'Amazon'], ['netflix', 'Netflix'], ['spotify', 'Spotify'], ['nvidia', 'Nvidia'], ['tesla', 'Tesla'], ['samsung', 'Samsung'], ['shopify', 'Shopify'], ['adobe', 'Adobe'], ['canva', 'Canva'], ['grok', 'Grok'], ['deepseek', 'DeepSeek'], ['mercado livre', 'Mercado Livre'], ['shopee', 'Shopee'], ['hotmart', 'Hotmart'], ['telegram', 'Telegram']];
function radarEntidades(titulo) {
  const t = ' ' + radarNorm(String(titulo || '').replace(/[’']s\b/g, '')) + ' ', achou = [];
  for (const [k, nome] of RADAR_ENTS) { const i = t.indexOf(' ' + k + ' '); if (i >= 0) achou.push([i, nome]); }
  return achou.sort((a, b) => a[0] - b[0]).map(x => x[1]);
}
function radarImgsBing(html) {
  const out = []; for (const m of html.matchAll(/\bm="(\{[^"]+\})"/g)) { try { const j = JSON.parse(xmlDec(m[1])); if (j.murl) out.push({ u: j.murl, pagina: j.purl || '', titulo: j.t || '' }); } catch { /* item ruim */ } }
  return out;
}
function radarImgsDdg(txt) { try { return (JSON.parse(txt).results || []).filter(x => x?.image).map(x => ({ u: x.image, pagina: x.url || '', titulo: x.title || '', w: x.width, h: x.height })); } catch { return []; } }
async function radarImagensWeb(it) {
  const ents = radarEntidades(it.titulo), versus = ents.length >= 2, q = versus ? ents.slice(0, 2).join(' vs ') : radarQuery(it.titulo); if (q.length < 8) return { lista: [], erro: 'assunto curto demais para buscar' };
  const lista = []; let erro = '';
  try { const r = await webGetSeguro(`https://www.bing.com/images/search?q=${encodeURIComponent(q)}&form=HDRSC2&first=1&setlang=pt-BR&qft=${encodeURIComponent('+filterui:imagesize-large+filterui:photo-photo')}`, { max: 4e6, headers: { referer: 'https://www.bing.com/' } }); lista.push(...radarImgsBing(r.buf.toString('utf8'))); } catch (e) { erro = 'Bing: ' + e.message; }
  try {
    const h = await webGetSeguro(`https://duckduckgo.com/?q=${encodeURIComponent(q)}&iax=images&ia=images`, { max: 2e6 }), vqd = h.buf.toString('utf8').match(/vqd=["']?([\d-]+)/)?.[1];
    if (vqd) { const r = await webGetSeguro(`https://duckduckgo.com/i.js?l=br-pt&o=json&q=${encodeURIComponent(q)}&vqd=${vqd}&f=,,,,,&p=1`, { max: 3e6, accept: 'application/json,*/*', headers: { referer: 'https://duckduckgo.com/' } }); lista.push(...radarImgsDdg(r.buf.toString('utf8'))); }
  } catch (e) { erro += (erro ? '; ' : '') + 'DuckDuckGo: ' + e.message; }
  const vistos = new Set(), ok = [];
  for (const x of lista) { let h; try { h = new URL(x.u); } catch { continue; } if (h.protocol !== 'https:' || FOTO_BLOQUEADOS.test(h.hostname + '.') || FOTO_RUIM.test(h.pathname) || vistos.has(x.u)) continue; if (x.w && x.h && (Math.max(x.w, x.h) < 1200 || Math.min(x.w, x.h) < 630)) continue; vistos.add(x.u); ok.push(x); }
  const toks = [...new Set(radarToks(it.titulo))].slice(0, 8), rel = x => { const tx = radarNorm((x.titulo || '') + ' ' + (x.pagina || '') + ' ' + (x.u || '')); return toks.filter(w => tx.includes(w)).length; };
  for (const x of ok) x.rel = rel(x);   // quantas palavras do assunto aparecem no título/página/endereço da imagem
  const cita = x => { const tx = radarNorm((x.titulo || '') + ' ' + (x.pagina || '')); return ents.filter(e => tx.includes(radarNorm(e))).length; };
  ok.sort((a, b) => cita(b) - cita(a) || (b.rel || 0) - (a.rel || 0) || (b.w && b.h ? b.w * b.h : 0) - (a.w && a.h ? a.w * a.h : 0));
  return { lista: ok.slice(0, 14), erro, q, versus, ents };
}
// Confere a qualidade (lado maior >= 800 px e menor >= 450 px) e devolve a primeira imagem boa
// Acabamento da foto finalista: ampliação (se o Real-ESRGAN estiver instalado e a foto for pequena), corte vertical no ponto mais detalhado, nitidez e contraste leves. Falhou: fica a original.
async function acabaFotoCapa(f) {
  const ent = arquivoTemp(f.ext === 'jpeg' ? 'jpg' : f.ext), sai = arquivoTemp('jpg'), amp = arquivoTemp('png'); let ok = false;
  try {
    fs.writeFileSync(ent, f.buf); let fonte = ent;
    if (f.qualidade && f.qualidade.escala < 1 && await amplia2x(ent, amp, __dirname)) fonte = amp;
    await acabamentoCapa(fonte, sai); const nb = fs.readFileSync(sai);
    if (nb.length > 20000) { f.buf = nb; f.ext = 'jpg'; f.d = dimImagem(nb) || f.d; ok = true; }
  } catch { /* sem ffmpeg ou falha: mantém a original */ } finally { for (const t of [ent, sai, amp]) try { fs.unlinkSync(t); } catch { /* já removido */ } }
  return ok;
}
const FOTO_GENERICA = /(handshake|aperto de m[aã]o|business ?(man|woman|people|team)|people (working|using)|team ?work|stock ?photo|clip ?art|vector|illustration|ilustra[cç][aã]o|infogr[aá]fico|wallpaper|template|mockup|banner|thumbnail|laptop on|pessoas? (no|com) notebook)/i;   // foto de banco genérica: nunca representa a notícia
async function radarEscolheImagem(cands, referer, ents = [], max = 6, min = [800, 450], tit = '') {   // o "olho do Designer": baixa até 6, pontua (nitidez, resolução, assunto citado, formato) e devolve a melhor com a lista das demais já ordenada em `outras`
  let errImg = '', n = 0, descartadas = 0; const bons = [];
  for (const x of cands) {
    if (n >= max) break;
    try { const { buf, ext } = await baixaImagemSegura(x.u, 15e6, x.pagina || referer), d = dimImagem(buf); if (!d) continue; const lado = Math.max(d.w, d.h), menor = Math.min(d.w, d.h); if (lado < min[0] || menor < min[1]) continue;
      const ehWeb = x.rel !== undefined, tx0 = radarNorm((x.titulo || '') + ' ' + (x.pagina || '') + ' ' + (x.u || '')), gen = FOTO_GENERICA.test(tx0), semTema = ehWeb && !ents.some(e => tx0.includes(radarNorm(e))) && (x.rel || 0) === 0;
      if (semTema) { descartadas++; continue; }   // imagem da busca sem nenhuma palavra do assunto: pode ser bonita, mas não é desta notícia
      n++;
      const bpp = buf.length / (d.w * d.h); if (['jpg', 'jpeg'].includes(ext) && bpp < 0.035 || ext === 'webp' && bpp < 0.025) { descartadas++; continue; }   // praticamente liso (fundo chapado): não chama atenção
      const tx = radarNorm((x.titulo || '') + ' ' + (x.pagina || '')), cita = ents.filter(e => tx.includes(radarNorm(e))).length, mp = Math.min(d.w * d.h / 1e6, 2.5), ar = d.w / d.h;
      const nota = mp * 1.2 + Math.min(bpp, 0.6) * 8 + cita * 3 + Math.min(x.rel || 0, 4) * 2.5 + (gen ? -5 : 0) + (ar >= 0.7 && ar <= 1.8 ? 1 : 0) + (ext === 'png' ? -1 : 0) - (bpp < 0.09 ? 2 : 0);   // pouco detalhe perde pontos, mas ainda pode servir se for a única
      let ql = null; { const tf = arquivoTemp(ext === 'jpeg' ? 'jpg' : ext); try { fs.writeFileSync(tf, buf); ql = await avaliaFoto(tf); } catch { /* filtro indisponível: não derruba a foto */ } finally { try { fs.unlinkSync(tf); } catch { /* já removido */ } } }   // qualidade (motor/qualidade-foto.mjs): tamanho útil depois do corte vertical e nitidez
      const notaQ = (ql?.escala ? Math.min(ql.escala, 1.5) * 2 : 0) + (ql?.nitidez ? Math.min(ql.nitidez / 40, 2) : 0) - (ql && !ql.ok && /borrada/.test(ql.motivo || '') ? 5 : 0);   // cobre a capa sem esticar = melhor; borrada = bem pior
      const notaI = (ql?.contraste ? (ql.contraste >= 150 ? 1.5 : ql.contraste < 90 ? -1.5 : 0) : 0) + (ql?.centro ? (ql.centro >= 1.15 ? 1.5 : ql.centro < 0.7 ? -1 : 0) : 0);   // contraste forte e assunto no centro chamam atenção
      const porque = [`${d.w}x${d.h}`, ql?.nitidez ? `nitidez ${ql.nitidez}` : '', cita ? `cita ${cita} nome(s) da manchete` : '', x.rel ? `${x.rel} palavra(s) do assunto` : '', ql?.contraste >= 150 ? 'contraste forte' : '', ql?.centro >= 1.15 ? 'assunto em destaque' : '', gen ? 'parece foto genérica' : ''].filter(Boolean).join(', ');
      bons.push({ ...x, buf, ext, d, nota: nota + notaQ + notaI, qualidade: ql, porque }); } catch (e) { errImg = e.message; }
  }
  bons.sort((a, b) => b.nota - a.nota);
  for (const b of bons.slice(0, 2)) b.acabada = await acabaFotoCapa(b);   // só as 2 finalistas (capa e contracapa) recebem acabamento
  if (!bons.length) return { erro: errImg || (descartadas ? `${descartadas} imagem(ns) sem detalhe/sem graça, descartada(s)` : '') };
  return { ...bons[0], outras: bons.slice(1) };
}
// Grava a foto escolhida na Biblioteca da marca (com o crédito) e devolve o nome do arquivo
function salvaFotoRadar(it, melhor, origem, real, suf = '') {
  const b = String(it.brand || '').trim(), base = 'noticia-' + it.id + suf; let name = base, n = 2; while (one('SELECT id FROM assets WHERE brand=? AND name=?', b, name)) name = base + '-' + n++;
  const fonteFoto = origem === 'matéria' ? (real || it.url) : (melhor.pagina || melhor.u), host = (() => { try { return new URL(fonteFoto).hostname.replace(/^www\./, ''); } catch { return 'internet'; } })();
  const credito = origem === 'matéria' ? `Foto: ${it.fonte || host} (${fonteFoto})` : `Foto: ${host} (busca na internet; confira os direitos de uso) ${fonteFoto}`, k = 'foto';
  const r = run('INSERT INTO assets(brand,name,kind,tags,note,colecao,filename,ext,size,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', b, name, k, 'foto da notícia, radar', credito.slice(0, 600), colecaoDe('', k), name + '.' + melhor.ext, melhor.ext, melhor.buf.length, T());
  fs.writeFileSync(path.join(ASSET_DIR, +r.lastInsertRowid + '.' + melhor.ext), melhor.buf);
  return { name, credito };
}
async function radarFotoBusca(it, contentId) {
  const info = m => { try { run('UPDATE radar_items SET foto_info=? WHERE id=?', String(m).slice(0, 300), it.id); } catch { /* sem registro */ } return null; };
  try {
    const real = await radarLinkReal(it.url || ''); let motivo = '', melhor = null, origem = 'matéria';
    const ents = radarEntidades(it.titulo), versus = ents.length >= 2;
    if (versus) { const w0 = await radarImagensWeb(it); if (w0.lista.length) { const r0 = await radarEscolheImagem(w0.lista, '', ents, 6, [1200, 630]); if (r0.buf) { melhor = r0; origem = 'busca na internet'; } } }   // assunto "A contra B": procura na internet uma imagem com os dois
    if (melhor) { /* já achou */ }
    else if (!real && !it.img_url) motivo = 'não achei o endereço real da matéria';
    else {
      let errPg = ''; const pg = real ? await webGetSeguro(real, { max: 3e6 }).catch(e => { errPg = e.message; return { buf: Buffer.from(''), url: real }; }) : { buf: Buffer.from(''), url: it.url }, cands = [...new Set([it.img_url, ...radarImagensDaPagina(pg.buf.toString('utf8'), pg.url)].filter(u => /^https:\/\//.test(u || '')))];
      if (!cands.length) motivo = errPg ? `não consegui abrir a matéria (${errPg})` : 'a matéria não traz imagem de capa';
      else { const r = await radarEscolheImagem(cands.map(u => ({ u })), real || it.url, ents); if (r.buf) melhor = r; else motivo = r.erro ? `achei a imagem da matéria, mas não consegui baixar (${r.erro})` : 'as imagens da matéria são pequenas demais (mínimo 800 x 450 px)'; }
    }
    if (!melhor) {   // foto da matéria não serviu: busca na internet por imagens do assunto
      const w = await radarImagensWeb(it);
      if (w.lista.length) { let r = await radarEscolheImagem(w.lista, '', ents, 6, [1200, 630]); if (!r.buf) r = await radarEscolheImagem(w.lista, '', ents, 6, [1000, 560]); if (r.buf) { melhor = r; origem = 'busca na internet'; } else motivo += `; busca na internet: ${w.lista.length} imagem(ns) achada(s), nenhuma boa o bastante${r.erro ? ' (' + r.erro + ')' : ''}`; }
      else motivo += `; busca na internet não achou imagem${w.erro ? ' (' + w.erro + ')' : ''}`;
    }
    if (!melhor) return info(`Sem foto: ${motivo}. Envie a foto na aba Arte.`);
    // segunda foto (contracapa): a próxima melhor do mesmo grupo; se não houver, busca na internet outra diferente da primeira
    let seg = (melhor.outras || []).find(o => o.u !== melhor.u && !(o.d.w === melhor.d.w && o.d.h === melhor.d.h && o.buf.length === melhor.buf.length) && !fotosParecidas(melhor.buf, o.buf)) || null, origem2 = origem;
    if (!seg) { try { const w2 = await radarImagensWeb(it); const r2 = w2.lista.length ? await radarEscolheImagem(w2.lista.filter(x => x.u !== melhor.u), '', ents, 4, [1200, 630]) : null, r2ok = r2?.buf ? [r2, ...(r2.outras || [])].find(x => x.buf && !fotosParecidas(melhor.buf, x.buf)) : null; if (r2ok) { seg = r2ok; origem2 = 'busca na internet'; } } catch { /* sem segunda foto: a contracapa usa a primeira */ } }
    const p1 = salvaFotoRadar(it, melhor, origem, real, ''), name = p1.name, credito = p1.credito, p2 = seg ? salvaFotoRadar(it, seg, origem2, real, '-2') : null;
    run('UPDATE radar_items SET foto_asset=?, foto2_asset=?, foto_info=? WHERE id=?', name, p2?.name || '', `${melhor.d.w}x${melhor.d.h} · ${origem === 'matéria' ? '' : 'busca na internet · '}${credito}${p2 ? ' | contracapa: ' + seg.d.w + 'x' + seg.d.h : ''}${melhor.porque ? ' | por que esta: ' + melhor.porque : ''}`.slice(0, 480), it.id);
    if (contentId) run('UPDATE contents SET brief = brief || ? WHERE id=?', `\nFOTO DA NOTÍCIA (já está na Biblioteca como "${name}", ${melhor.d.w}x${melhor.d.h}, ${origem}): use esta foto na capa. NUNCA use mascote nem imagem gerada em notícia. ${credito}. Cite o crédito da foto na legenda.`, contentId);
    return name;
  } catch (e) { return info('Falha ao buscar a foto: ' + e.message); }
}
// Escolha das notícias SEM IA: pontua cada manchete pelo que a marca é (assuntos que você escreveu + palavras da base de conhecimento dela), pela data, pela força nas buscas e por aparecer em mais de uma fonte
const RADAR_STOP = new Set('para como mais mais sobre entre apos antes pelo pela pelos pelas esta este isso esse essa seus suas quando onde porque muito muitos ainda depois sendo ser tem tambem pode podem fazer feito cada todo todos toda todas outro outra outros outras nosso nossa deles delas aqui anos dias ano dia vez vezes novo nova novos novas sobre contra desde atraves segundo conforme'.split(' '));
const RADAR_EVITA = /\b(morre|morreu|morte|mortes|assassin\w*|acidente|tragedia|chacina|estupr\w*|presos?|presa|preso|elei[cç][aã]o|eleicoes|bolsonaro|lula|stf|deputad\w*|senador\w*|vereador\w*|partido|guerra|terroris\w*|suicid\w*|sequestr\w*|latrocinio|feminicidio)\b/;
const radarToks = t => radarNorm(t).split(' ').filter(w => w.length >= 4 && !RADAR_STOP.has(w));
function radarPalavras(brand, cfgM) {
  const frases = String(cfgM?.termos || '').split(/[,;\n]+/).map(x => radarNorm(x)).filter(x => x.length >= 3);
  const freq = new Map();
  for (const k of all("SELECT title, content FROM knowledge WHERE brand=? COLLATE NOCASE AND category IN ('marca','publico','nicho','produto','diretrizes') LIMIT 40", brand)) for (const w of radarToks(k.title + ' ' + String(k.content).slice(0, 4000))) freq.set(w, (freq.get(w) || 0) + 1);
  const kn = [...freq.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([w]) => w);
  return { frases, tokensTermo: [...new Set(frases.flatMap(f => f.split(' ').filter(w => w.length >= 4 && !RADAR_STOP.has(w))))], kn: new Set(kn), nome: radarNorm(brand) };
}
// Descartes do roteiro do dono: promocional, lista genérica, caça-clique, boato
const RADAR_DESCARTE = /\b(\d+ (dicas|formas|maneiras|motivos|passos|ferramentas|truques)|publieditorial|conteudo patrocinado|patrocinado|cupom|oferta\w*|promocao|desconto\w*|black friday|voce nao vai acreditar|chocante|bomba|viraliza\w*|horoscopo)\b/;
const RADAR_RUMOR = /\b(rumor\w*|boato\w*|segundo fontes|teria|estaria|pode (ser|ficar|ter)|especula\w*|nos bastidores|diz (a )?imprensa)\b/;
const RADAR_NOVO = /\b(lanca\w*|anuncia\w*|revela\w*|descobre\w*|novo|nova|novos|novas|muda\w*|cai|sobe|recorde|vaza\w*|ataque|aprova\w*|proibe|bate|supera|zera|fecha|compra|demite|adquire|libera|estreia|vence|perde|campeao)\b/;
const RADAR_OFICIAL = /\b(banco central|ibge|receita federal|cvm|sebrae|newsroom|blog oficial|google search central|youtube blog|meta newsroom|site oficial|comunicado oficial)\b/;
// Nota do roteiro: 5 critérios de 0 a 2 (atualidade, impacto, interesse, potencial de conteúdo, confiabilidade); entra com 6 ou mais e nunca com 0 em confiabilidade.
function radarEscolhe(itens, brand, cfgM) {
  const P = radarPalavras(brand, cfgM), agora = Date.now(), nicho = RADAR_NICHOS[cfgM?.nicho] || null, tk = itens.map(x => new Set(radarToks(x.titulo + ' ' + (x.snippet || ''))));
  const jac = (a, b) => { let n = 0; for (const w of a) if (b.has(w)) n++; return n / Math.max(1, Math.min(a.size, b.size)); };
  const conhecidas = new Set(RADAR_FONTES.filter(f => !cfgM?.nicho || (f.nichos || []).includes(cfgM.nicho)).map(f => radarNorm(f.nome))), oficiais = new Set(RADAR_FONTES.filter(f => f.of).map(f => radarNorm(f.nome)));
  const pts = itens.map((x, i) => {
    const norm = radarNorm(x.titulo), txt = ' ' + radarNorm(x.titulo + ' ' + (x.snippet || '')) + ' ', acerto = [];
    for (const f of P.frases) if (txt.includes(' ' + f + ' ')) acerto.push(f);
    for (const w of P.tokensTermo) if (tk[i].has(w) && !acerto.some(a => a.includes(w))) acerto.push(w);
    let kh = 0; for (const w of tk[i]) if (P.kn.has(w)) { kh++; if (acerto.length < 5) acerto.push(w); }
    const sub = nicho ? (nicho.subs.find(([, re]) => re.test(txt))?.[0] || '') : '';
    if (sub) acerto.push(sub);   // assunto do nicho da marca conta como encaixe
    const idade = (agora - new Date(x.publicado || 0).getTime()) / 864e5, tr = parseInt(String(x.trafego || '').replace(/\D/g, ''), 10) * (/mil/i.test(x.trafego || '') ? 1000 : 1) || 0;
    const outras = new Set(itens.filter((y, j) => j !== i && radarNorm(y.fonte || y.termo) !== radarNorm(x.fonte || x.termo) && jac(tk[i], tk[j]) >= .5).map(y => radarNorm(y.fonte || y.termo)));
    const independentes = outras.size + 1, emAlta = x.origem === 'trends' || tr > 0 || outras.size >= 1, fonteN = radarNorm(x.origem === 'site' ? x.termo : x.fonte);
    const oficial = oficiais.has(fonteN) || RADAR_OFICIAL.test(radarNorm((x.fonte || '') + ' ' + (x.snippet || '')));
    const cAtual = idade <= 1.2 ? 2 : idade <= 7 && emAlta ? 1 : idade <= 2.2 ? 1 : 0;
    const cImpacto = acerto.length >= 2 || (acerto.length >= 1 && sub) ? 2 : acerto.length >= 1 || kh >= 2 ? 1 : 0;
    const cInteresse = (tr >= 100 || (x.origem === 'trends' && outras.size >= 1)) ? 2 : emAlta ? 1 : 0;
    const cPot = (x.titulo.length >= 35 && x.titulo.length <= 120 ? 1 : 0) + (RADAR_NOVO.test(norm) || /\d/.test(x.titulo) ? 1 : 0);
    const cConf = !x.url || !x.publicado ? 0 : (oficial || independentes >= 2) ? 2 : (conhecidas.has(fonteN) || conhecidas.has(radarNorm(x.fonte))) ? 1 : x.origem === 'noticias' || x.origem === 'trends' ? 1 : 0;
    const total = cAtual + cImpacto + cInteresse + cPot + cConf, rumor = RADAR_RUMOR.test(norm);
    const descarta = RADAR_DESCARTE.test(norm) || rumor || (RADAR_EVITA.test(norm) && !(nicho && cfgM.nicho === 'tecnologia' && /\b(hacker\w*|ataque|ciber\w*|vazamento|golpe|invasao|ransomware)\b/.test(norm))) || x.titulo.length < 25;
    const nota = `${total}/10 (atualidade ${cAtual}, impacto ${cImpacto}, interesse ${cInteresse}, potencial ${cPot}, confiabilidade ${cConf})`;
    return { i, total, nota, sub, acerto, ok: !descarta && total >= 6 && cConf > 0 && (nicho ? !!sub || P.frases.some(f => txt.includes(' ' + f + ' ')) : (acerto.length > 0 || kh >= 2)), status: oficial || independentes >= 2 ? 'Confirmado' : 'Fonte única (confirme)', independentes, oficial, trends: x.origem === 'trends' ? `${x.termo}${x.trafego ? ' (' + x.trafego + ' buscas)' : ''}` : (tr ? `${tr}+ buscas` : 'sem sinal') };
  }).filter(x => x.ok).sort((a, b) => b.total - a.total);
  const out = [];
  for (const c of pts) { if (out.length >= (cfgM.max || 2) + 8) break;   // candidatas de reserva: as que ficarem sem foto cedem a vaga à próxima
     if (out.some(o => jac(tk[o.i], tk[c.i]) >= .6)) continue; out.push(c); }
  return out.map(c => { const x = itens[c.i], limpo = x.titulo.replace(/\s+[-–|]\s+[^-–|]{2,40}$/, '').trim() || x.titulo;
    return { i: c.i, titulo: limpo, formato: cfgM.formato, nota: c.nota, subnicho: c.sub, status: c.status, trends: c.trends,
      angulo: `Conte o que aconteceu${x.origem === 'trends' ? ', por que está em alta' : ''} e o que muda para quem acompanha ${brand}, em linguagem simples, sem sair dos fatos da matéria.`,
      fatos: [limpo, x.snippet ? x.snippet.slice(0, 240) : '', `Fonte: ${x.fonte || x.termo || 'não informada'}${x.publicado ? ', ' + x.publicado : ''}`].filter(Boolean), porque: 'Combina com: ' + (c.acerto.slice(0, 4).join(', ') || 'o assunto da marca') + (x.trafego ? ` · ${x.trafego} buscas` : '') }; });
}
function radarEnfileira(brand, origem = 'auto') { return enqueue(null, 'radar', 'radar', { brand }, origem); }

// O que a arte RENDERIZADA realmente contém (textos e imagens por página): o Revisor não aprova página vazia só porque a direção em texto estava boa
function resumoArteReal(c) {
  if (isVideo(c.format) || !c.art_spec) return '';
  let sp; try { sp = JSON.parse(c.art_spec); } catch { return ''; }
  if (!Array.isArray(sp.slides) || !sp.slides.length) return '';
  const L = sp.slides.map((sl, i) => {
    const tx = (sl.texts || []).map(t => `${t.role || 'texto'}: "${String(t.value || '').replace(/\|/g, ' ').slice(0, 70)}"`), im = (sl.items || []).filter(x => !x.moldura).map(x => x.asset || (x.gen ? 'imagem gerada' : 'imagem'));
    const vazia = !tx.length && !im.length && !(sl.shapes || []).length;
    return `- Página ${i + 1}: ${vazia ? 'VAZIA (sem texto e sem imagem: devolva ao Designer, é erro grave)' : [tx.length ? tx.join(' | ') : 'sem texto', im.length ? 'imagens: ' + im.join(', ') : 'sem imagem de destaque'].join(' · ')}`;
  });
  return `# O QUE A ARTE RENDERIZADA REALMENTE CONTÉM (conferido pelo painel)\n${L.join('\n')}\nSe a direção em texto promete título, texto, chamada ou mascote que não aparece aqui, a arte está errada: devolva (ajustar) citando o que falta.\n\n`;
}
// Conferência local do roteiro ANTES do Revisor: erros mecânicos (limites de palavras, duas versões, pedido duplo, isca) voltam direto ao Roteirista com a correção exata e não gastam rodada do Revisor
const nPal = t => String(t || '').replace(/\*/g, '').trim().split(/\s+/).filter(Boolean).length;
// no modo chat cada volta ao Roteirista custa uma ida e volta de copiar/colar: só 1 devolução automática por peça (com API continua o valor das configurações)
const maxRev = st => MANUAL ? Math.min(+st.max_revisions || 0, 1) : +st.max_revisions;
function copyLint(c, script) {
  const erros = [];
  if (!script) return erros;
  if (['feed', 'carrossel', 'stories'].includes(c.format) && !lerRoteiroModelo(script).length) {   // sem página lida não há arte: volta ao Roteirista agora, antes de gastar Revisor, gerente e Designer
    if (c.kind === 'noticia') { const fb = roteiroNoticiaFallback({ ...c, script }); if (!fb || fb.origem === 'fonte') erros.push('Não achei a manchete da arte no roteiro. Entregue o bloco "📌 Arte — CAPA" com a linha "Título: <manchete sua, em português>" e a "Legenda: Leia a legenda".'); }
    else erros.push('O roteiro não segue o formato do pedido: cada página começa com "📌 Slide N — NOME" (ou "📌 Arte — CAPA" no post único) e traz as linhas Título:, Subtexto:, Visual:. Reescreva nesse formato.');
  }
  if (c.kind !== 'noticia' && (c.format === 'carrossel' || c.format === 'stories')) {
    const pg = lerRoteiroModelo(script);
    pg.forEach((p, i) => {
      const rot = i === 0 ? 'Capa' : `Slide ${p.n || i + 1}`, max = i === 0 && c.format === 'carrossel' ? 12 : 8;
      const tits = p.campos.filter(x => /^(t[íi]tulo|manchete|headline)/i.test(x.r) && x.v), aps = p.campos.filter(x => /^(texto( do card)?|apoio|subt[íi]tulo|subtexto)$/i.test(x.r) && x.v);
      if (tits.length > 1) erros.push(`${rot}: há ${tits.length} versões do título. Entregue UMA só, a final.`);
      if (aps.length > 1) erros.push(`${rot}: há ${aps.length} versões do texto de apoio. Entregue UMA só, a final.`);
      const t = tits[0]?.v || '', a = aps[0]?.v || '';
      if (t && nPal(t) > max) erros.push(`${rot}: título com ${nPal(t)} palavras (máximo ${max}). Corte para a ideia central: "${t.slice(0, 70)}"`);
      if (t && /[.]\s*$/.test(t.trim()) && !/\.\.\.$/.test(t.trim())) erros.push(`${rot}: título termina com ponto final. Tire o ponto.`);
      if (t && /^(cena|exemplo|imagine|ilustra)/i.test(t.trim().replace(/^\*+/, '')) || /ilustrativ/i.test(t)) erros.push(`${rot}: o título não pode ser rótulo ("Cena ilustrativa", "Exemplo", "Imagine"). Escreva a ideia como afirmação. Se o exemplo é inventado, avise em poucas palavras no fim do apoio: "(exemplo ilustrativo)".`);
      if (/na nossa leitura|personagem fict[íi]cia|\bcena ilustrativa\b/i.test(`${t} ${a}`)) erros.push(`${rot}: tire "na nossa leitura", "personagem fictícia" e "cena ilustrativa" do slide. Fale direto; a declaração de exemplo ilustrativo vai em 2 ou 3 palavras no fim do apoio.`);
      if (a && (/\s\/\s/.test(a) || /(s[óo] mostra|d[áa] motivo)\s*:/i.test(a))) erros.push(`${rot}: o apoio tem separador "/" ou rótulos tipo "Só mostra:/Dá motivo:". Escreva frases corridas e naturais, como alguém falando.`);
      if (a && nPal(a) > 25) erros.push(`${rot}: texto de apoio com ${nPal(a)} palavras (máximo 25). Enxugue sem perder o fato.`);
    });
  }
  if (c.kind === 'noticia') {
    const pg0 = lerRoteiroModelo(script)[0], t0 = (pg0?.campos.find(x => /^(t[íi]tulo|manchete|headline)/i.test(x.r)) || {}).v || '', fonte = (String(c.brief || '').match(/MANCHETE DA FONTE[^:\n]*:\s*([^\n]+?)(?:\s+—\s+[^\n—]+)?(?:\s+\(\d{4}-\d{2}-\d{2}\))?\n/) || [])[1] || '';
    const tok = x => new Set(String(x).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 3));
    if (t0 && fonte) { const a = tok(t0), b = tok(fonte); let n = 0; for (const w of a) if (b.has(w)) n++; if (a.size && n / Math.min(a.size, b.size) >= .7) erros.push(`Manchete parecida demais com a da fonte ("${fonte.slice(0, 80)}"). Escreva a sua: contraste, consequência para o leitor, número ou o detalhe mais inesperado, sempre fiel aos fatos.`); }
    { const nums = (String(t0).match(/\d[\d.,]*/g) || []).map(x => x.replace(/[.,]+$/, '')), fatos = new Set((String(c.brief || '').match(/\d[\d.,]*/g) || []).map(x => x.replace(/[.,]+$/, ''))); const novos = nums.filter(n => n.length > 0 && !fatos.has(n)); if (novos.length) erros.push(`A manchete traz número que não está nos fatos do pedido (${novos.join(', ')}). Não mude a notícia: use só números, nomes e datas que estão no briefing.`); }
    if (t0 && /[.]\s*$/.test(t0.trim()) && !/\.\.\.$/.test(t0.trim())) erros.push('Manchete termina com ponto final. Tire o ponto (manchete não leva ponto).');
    if (t0 && (nPal(t0) > 24 || String(t0).length > 150)) erros.push(`Manchete com ${nPal(t0)} palavras e ${String(t0).length} caracteres (máximo 24 palavras e 150 caracteres). Corte para a ideia central e deixe só o detalhe mais forte.`);
    if (t0 && nPal(t0) < 10 && nPal(t0) >= 4) erros.push(`Manchete curta (${nPal(t0)} palavras): falta o detalhe que dá peso. No estilo do dono ela traz sujeito + verbo + fato + número, valor, prazo, recorde ou contraste, em 14 a 24 palavras.`);
    if (t0 && /[?!]\s*$/.test(t0.trim())) erros.push('Manchete termina com pergunta ou exclamação. Manchete de notícia afirma o fato, sem ? nem !.');
    if (t0 && (/^\W*(saiba|confira|veja|entenda|descubra|novo|nova|novos|novas|muitos|muitas|alguns|algumas|diversos|v[áa]rios)\b/i.test(t0) || /\b(essenciais?|importantes?|diversos|v[áa]rios|ainda n[ãa]o)\b/i.test(t0) || nPal(t0) < 4)) erros.push('Manchete fraca (começa com "muitos/novo/saiba/confira", usa "essenciais/importantes/ainda não" ou é curta demais). Escreva com sujeito concreto e verbo forte, falando com o leitor ("seu site", "você") ou mostrando a consequência. Ex.: em vez de "Muitos sistemas de site ainda não trazem os controles de SEO essenciais", "Seu site pode estar sem o básico para aparecer no Google".');
    if (t0 && /\b(incr[íi]vel|chocante|inacredit[áa]vel|voc[êe] n[ãa]o vai acreditar)\b/i.test(t0)) erros.push('Manchete com adjetivo vazio (incrível, chocante...). Troque pelo fato específico que causa o impacto.');
  }
  { const txt = String(script).replace(/#\S+/g, ' '), m = txt.match(/\b(garantid[oa]s?|resultado garantido|sem esfor[cç]o|dinheiro f[áa]cil|enrique[çc]a|f[óo]rmula m[áa]gica|milagre|lucro certo)\b/i);   // limite de honestidade do manual de copy: promessa absoluta não passa
    if (m && c.kind !== 'noticia') erros.push(`Promessa absoluta ("${m[0]}"). Troque por uma promessa específica e verificável (número real, prazo possível, condição), sem garantir resultado.`); }
  const cap = String(parseCaption(script) || '').replace(/#\S+/g, ' ');
  { const l1 = cap.trim().split(/\n/)[0] || ''; if (l1.length > 220) erros.push(`A primeira linha da legenda tem ${l1.length} caracteres: o Instagram corta em ~125 antes do "mais". Abra com o gancho em até 125 caracteres e leve o resto para as linhas seguintes.`); }
  if (cap.trim()) {
    const pedidos = new Set();
    if (/\b(sig[ao]|seguir|segue)\b/i.test(cap)) pedidos.add('seguir');
    if (/\bcoment[ae]\w*/i.test(cap)) pedidos.add('comentar');
    if (/\b(salv[ae]\w*|guard[ae]\w*)\b/i.test(cap)) pedidos.add('salvar');
    if (/\b(compartilh\w+|mand[ae]\w* (pra|para)|envi[ae]\w* (pra|para)|encaminh\w+|indiqu\w+)\b/i.test(cap)) pedidos.add('compartilhar');
    if (/link (na|da) bio|\bwhats|\bdirect\b|\bDM\b/i.test(cap)) pedidos.add('link/direct');
    if (pedidos.size > 1) erros.push(`Legenda pede mais de uma ação (${[...pedidos].join(', ')}). Regra F1: UM único pedido, o mesmo da CTA do último slide. Deixe só um.`);
    if (/\b(curt[ae]\w* (se|esse|este|o post)|d[eê] um like|marque \d+|marque (um|dois|tr[eê]s) amig|se (voc[eê] )?concorda|coment[ae]\w* (sim|n[ãa]o|1|2) (se|pra|para))/i.test(cap)) erros.push('Legenda com isca de engajamento (regra P4: curtir/marcar amigos/"comente sim se"). Troque por um pedido nativo claro e útil.');
  }
  return erros;
}
// Notícia: o Roteirista entrega o post e, no fim, a matéria completa do site de jornal (seção "## MATÉRIA"); ela fica numa coluna própria
const MATERIA_RE = /^[ \t]*#{0,3}[ \t]*(?:\*\*)?MAT[ÉE]RIA(?:[ \t]+COMPLETA)?(?:\*\*)?[ \t]*:?[ \t]*$/im;
const separaMateria = t => { const m = String(t || '').match(MATERIA_RE); return m ? [t.slice(0, m.index).trim(), t.slice(m.index + m[0].length).trim()] : [String(t || ''), '']; };
const jornalDaMarca = brand => { const m = radarCfg().marcas[brand] || {}; return (m.jornal || '') + (m.secoes ? '\nSeções (editorias) do jornal: ' + m.secoes + '\nEscolha UMA dessas seções para a matéria, a que corresponde ao assunto, e escreva-a na linha "Seção:". Se nenhuma servir, não invente: abra PEDIDO AO GERENTE.' : ''); };
const MAX_SEO = MANUAL ? 1 : 2;   // no modo chat, 1 devolução da matéria por SEO (cada volta é um ciclo de copiar/colar)
function depoisDaCopy(c, materia = c.materia) {   // notícia com matéria passa pelo Agente de SEO antes do Revisor
  if (c.kind === 'noticia' && materia && agenteLigado('seo') && (jparse(c.seo_review, {})?.rodadas || 0) < MAX_SEO + 1 && !(jparse(c.seo_review, {})?.fim)) enqueue(c.id, 'seo', 'seo');
  else enqueue(c.id, 'gerente', 'revisao');
}
const HANDLERS = {
  async radar(job) {
    const input = JSON.parse(job.input || '{}'), brand = String(input.brand || ''), cfg = radarCfg(), cfgM = cfg.marcas[brand] || { termos: '', max: 2, formato: 'carrossel' };
    if (!brand) throw new Error('O Agente de Notícias precisa de uma marca');
    if (!radarEstiloDaMarca(brand)) { log('radar', `${brand} está sem template de notícia: nada foi criado. Escolha o template na mesa do Agente de Notícias.`); return { text: 'Sem template de notícia', tin: 0, tout: 0 }; }
    const { itens, erros } = await radarColeta(brand, cfgM, cfg.geo);
    if (!itens.length && als.getStore()?.dry) throw fail(409, 'O Agente de Notícias não achou nada novo para ' + brand + (erros.length ? ' (' + erros.join('; ') + ')' : '') + '. O pedido saiu da fila.');
    if (!itens.length) { log('radar', `Nada novo para ${brand}${erros.length ? ' (' + erros.join('; ') + ')' : ''}`); if (erros.length && erros.length >= 2) throw new Error(erros.join('; ')); return { text: 'Sem novidades', tin: 0, tout: 0 }; }
    const arr = radarEscolhe(itens, brand, cfgM);   // escolha feita pelo painel, sem IA
    const r = { text: `${arr.length} pauta(s) de ${itens.length} manchetes`, tin: 0, tout: 0 };
    let feitas = 0, semFoto = 0; const pegos = new Set();
    for (const p of arr.slice(0, cfgM.max + 8)) {
      const it = itens[+p.i]; if (!it || pegos.has(it.id) || feitas >= cfgM.max) continue; pegos.add(it.id);
      const ft = await radarTemFoto({ ...it, brand });
      if (!ft.ok && !als.getStore()?.dry) { semFoto++; run("UPDATE radar_items SET status='descartado', motivo=? WHERE id=?", ('Sem foto, não virou pauta: ' + ft.motivo).slice(0, 300), it.id); log('radar', `"${String(it.titulo).slice(0, 70)}" ficou de fora: sem foto boa da matéria nem na internet. Nenhum gasto com IA.`); continue; }
      radarPauta({ ...it, brand }, { titulo: String(p.titulo || '').trim() || it.titulo, formato: p.formato, angulo: String(p.angulo || '').slice(0, 400), fatos: (Array.isArray(p.fatos) ? p.fatos : []).map(f => String(f).slice(0, 240)).slice(0, 5), porque: String(p.porque || '').slice(0, 300), nota: p.nota, subnicho: p.subnicho, status: p.status, trends: p.trends });
      feitas++;
    }
    for (const x of itens) if (!pegos.has(x.id)) run("UPDATE radar_items SET status='descartado' WHERE id=? AND status='novo'", x.id);
    log('radar', `${feitas} notícia(s) de ${brand} enviada(s) ao Roteirista (de ${itens.length} manchetes lidas${semFoto ? '; ' + semFoto + ' sem foto, descartada(s)' : ''})`);
    return r;
  },
  async roteiro(job, c) {
    const s = settings();
    const input = JSON.parse(job.input || '{}');
    let user = `# PEDIDO\n${brief(c, true)}${c.goal ? '\n\n' + METODO_HISTORIAS : ''}\n\n# GUIA DO FORMATO\n${FORMAT_GUIDE[c.format]}\n\n# GUIA DO TIPO DE CONTEÚDO\n${KIND_GUIDE[c.kind]}`;
    { const nsl = c.format === 'carrossel' ? +s.carousel_slides : c.format === 'stories' ? +s.stories_slides : 0;
      if (nsl) user += `\n\n# ESPECIFICAÇÃO DO DONO\nQuantidade de slides: EXATAMENTE ${nsl} (contando a capa e o slide final de CTA).`;
      if (String(c.format).startsWith('video') && +s.video_secs) user += `\n\n# ESPECIFICAÇÃO DO DONO\nDuração alvo do vídeo: cerca de ${s.video_secs} segundos.`; }
    const mas = all("SELECT name,tags FROM assets WHERE kind='mascote' AND (brand='' OR brand=? COLLATE NOCASE)", c.brand || '');
    if (mas.length && !['texto', 'carta_vendas'].includes(c.kind)) user += `\n\n# MASCOTE DA MARCA\nA marca tem mascote cadastrado: ${mas.map(m => m.name + (m.tags ? ' (' + m.tags + ')' : '')).join('; ')}. Em cada cena ou slide em que o mascote aparecer, escreva entre colchetes a POSE desejada, usando o nome exato de uma pose cadastrada quando existir (ex.: [mascote: nome-da-pose]); se precisar de uma pose que não existe, descreva-a em poucas palavras (ex.: [mascote novo: apontando para a direita, sorrindo]). O Designer e o Editor vão aplicar exatamente o que você indicar.`;
    user += estiloEstruturaBloco(c, 'roteirista');
    if (input.feedback && c.script) user += `\n\n# VERSÃO ANTERIOR\n${c.script}${c.materia ? '\n\n## MATÉRIA\n' + c.materia : ''}\n\n# AJUSTES OBRIGATÓRIOS (aplique todos e entregue a peça completa de novo)\n${input.feedback}`;
    if (c.kind === 'noticia') user += `\n\n# CONFERÊNCIA OBRIGATÓRIA ANTES DE ENTREGAR (o painel confere e devolve se falhar)\n1. Manchete da arte no estilo do dono: SUA, de 14 a 24 palavras (até 140 caracteres), sujeito reconhecível + verbo no presente + o fato + um detalhe que dá peso (número exato, valor, prazo, recorde ou "primeira vez", contraste, quem participa), mais forte que a da fonte, sem mudar o fato (números, nomes e datas só os do pedido), sem pergunta, sem "saiba/confira/veja". Entenda-se sozinha, sem ler a legenda.\n2. Sem adjetivo vazio (incrível, chocante), sem caça-clique que o fato não sustente, sem boato apresentado como certeza.\n3. Legenda: primeira linha com o gancho do fato, 2 ou 3 frases simples, a fonte e o crédito da foto, UM único pedido no fim, sem isca de engajamento.\n4. Entregue os 7 blocos completos.`;
    else user += `\n\n# CONFERÊNCIA OBRIGATÓRIA ANTES DE ENTREGAR (o painel confere e devolve se falhar)\n1. Gancho/capa: até 12 palavras, promessa específica com número, nome ou consequência, nas palavras do público; nada genérico.\n2. Cada slide: título até 8 palavras, sem ponto final; apoio até 25 palavras; UMA versão só de cada, sem rascunho nem alternativa no texto.\n3. UMA grande ideia, UMA crença, UM pedido: o mesmo pedido na CTA do último slide e na legenda; sem segundo pedido (nada de "segue" junto com "comenta" ou "salva").\n4. Sem isca de engajamento (curtir, marcar amigos, "comente sim se").\n5. Só afirme o que está nos fatos do pedido; sem número ou fonte inventados.\n6. Texto dos slides = frase de gente, direta e específica. NUNCA escreva rótulos de bastidor no slide ("Cena ilustrativa:", "Exemplo:", "personagem fictícia", "Na nossa leitura", "Só mostra: ... / Dá motivo: ..."). Se o exemplo é inventado, declare em 2 ou 3 palavras no fim do apoio ("exemplo ilustrativo") ou na legenda, nunca no título.\n7. Cada slide faz UMA coisa: o título afirma a ideia, o apoio prova com um detalhe concreto (número, nome, lugar, antes e depois). Sem ponte genérica ("E agora?"), sem repetir o título no apoio.\n8. Entregue os 7 blocos completos.`;
    if (c.kind === 'noticia') { const jn = jornalDaMarca(c.brand || ''); user += `\n\n# MATÉRIA COMPLETA PARA O SITE DE JORNAL${jn ? '\nJornal: ' + jn : ''}\nDepois de TODOS os blocos do post (no fim da resposta), escreva a linha "## MATÉRIA" e, abaixo dela, a matéria completa seguindo a sua base "Matéria completa para o site de jornal da marca" (palavra-chave, título SEO, meta descrição, slug, manchete, linha fina, lide, subtítulos ## em frase normal, fontes). Os subtítulos da matéria NÃO podem ser em CAIXA ALTA. A legenda do post termina com "Leia a matéria completa clicando no link da bio."`; }
    user += `\n\n# COMPATIBILIDADE COM O PAINEL\nEntregue os 7 blocos do seu formato de entrega. Dentro do bloco 4 (roteiro) use os títulos ## do GUIA DO FORMATO acima, porque o painel e os agentes seguintes leem essas seções, e escreva a legenda final também numa seção ## LEGENDA.`;
    user += '\n\n' + manuaisBloco(manuaisCodes(c, { devolvida: !!input.feedback }));
    const search = s.web_search === '1' && ['noticia', 'historia_real'].includes(c.kind);
    const r = await callClaude({ agent: agentRow('roteirista'), user, maxTokens: c.kind === 'carta_vendas' || c.format === 'video_horizontal' ? 8000 : 4096, search });
    const [post, materia] = c.kind === 'noticia' ? separaMateria(r.text) : [r.text, ''];
    setContent(c.id, { script: post, caption: parseCaption(post), status: 'producing', error: '', art: input.feedback ? '' : c.art, video: input.feedback ? '' : c.video, ...(c.kind === 'noticia' ? { materia: materia || c.materia || '' } : {}) });
    log('roteirista', `Roteiro ${input.feedback ? 'reescrito' : 'escrito'}: "${c.title}"`, c.id);
    { const le = copyLint(c, post), volta = +input.lint || 0;
      if (le.length && MANUAL) log('roteirista', `Conferência do painel: ${le.length} ponto(s) fora dos limites (${le.join(' | ').slice(0, 300)}). No modo chat segue para a revisão sem pedir de novo.`, c.id);
      if (le.length && volta < 2 && !MANUAL) { log('roteirista', `Conferência do painel achou ${le.length} erro(s) mecânico(s): volta ao Roteirista sem gastar o Revisor`, c.id); enqueue(c.id, 'roteirista', 'roteiro', { feedback: 'CONFERÊNCIA DO PAINEL (limites objetivos, corrija todos e mude só isso):\n- ' + le.join('\n- '), lint: volta + 1 }); return r; } }
    const deSeo = /^LAUDO DO AGENTE DE SEO/.test(String(input.feedback || ''));   // ajuste só da matéria a pedido do SEO: não repete a revisão de copy do post, volta direto ao SEO
    if (copyRevOn() && !deSeo) enqueue(c.id, 'revisorcopy', 'revcopy'); else depoisDaCopy(c, materia || c.materia);
    return r;
  },

  async seo(job, c) {
    const ant = jparse(c.seo_review, {}) || {}, rodadas = (ant.rodadas || 0) + 1, jn = jornalDaMarca(c.brand || '');
    const user = `# TAREFA\nRevise a MATÉRIA COMPLETA abaixo seguindo o seu prompt e a sua base. Os fatos permitidos são só os do pedido; se faltar fato, peça ao Roteirista, não invente.${jn ? '\nJornal onde a matéria será publicada: ' + jn : ''}\n\n# PEDIDO (fatos e fonte)\n${brief(c, true)}\n\n# MATÉRIA\n${c.materia}`;
    const r = await callClaude({ agent: agentRow('seo'), user, maxTokens: 4000 });
    const v = (String(r.text).match(/VEREDITO\s*:?\s*\**\s*(APROVADA|AJUSTAR|REPROVADA)/i) || [])[1]?.toLowerCase() || 'ajustar', nota = +(String(r.text).match(/NOTA[^\n]*?(\d)(?:[.,]\d)?\s*\/\s*5/i) || [])[1] || null;
    const ok = v === 'aprovada', fim = ok || rodadas > MAX_SEO;
    setContent(c.id, { seo_review: JSON.stringify({ veredito: v, nota, laudo: r.text, rodadas, fim, ts: T() }) });
    brainEvent('roteirista', ok ? 'revisao_aprovada' : 'revisao_reprovada', c, `Agente de SEO: ${v} (matéria do site${nota ? ', nota ' + nota + '/5' : ''})`, String(r.text).slice(0, 1200));
    if (fim) { log('seo', ok ? `Aprovou a matéria de "${c.title}"` : `A matéria de "${c.title}" ainda tem pendências de SEO após ${rodadas - 1} ajuste(s): segue com o laudo para você decidir`, c.id); enqueue(c.id, 'gerente', 'revisao'); }
    else { log('seo', `Devolveu a matéria de "${c.title}" (${v}) — rodada ${rodadas}/${MAX_SEO}`, c.id); enqueue(c.id, 'roteirista', 'roteiro', { feedback: `LAUDO DO AGENTE DE SEO (${v}) SOBRE A MATÉRIA DO SITE. Aplique só as correções obrigatórias na matéria e mantenha o post das redes como está. Entregue tudo de novo (post + "## MATÉRIA"):\n${r.text.slice(0, 4000)}` }); }
    return r;
  },

  async revcopy(job, c) {
    const s = settings(), fato = ['noticia', 'historia_real'].includes(c.kind);
    const regrasRot = brainBlock('roteirista', c.brand || '', { base: false, count: false, fmt: fmtGrupo(c.format) });
    const ult = c.brand ? all("SELECT title, script FROM contents WHERE brand=? COLLATE NOCASE AND id<>? AND teste=0 AND script<>'' ORDER BY id DESC LIMIT 5", c.brand, c.id) : [];
    const user = `# TAREFA\nRevise a peça de copy abaixo seguindo o seu prompt: entrega completa, verdade, políticas, originalidade, ofício, produção, coerência com a marca e lições. CALIBRAGEM: reprove (ou peça refazer) só por problema que muda o resultado da peça: gancho fraco, erro ou risco factual, regra do Cérebro ou da marca descumprida, política violada, produção inexecutável. Diferença de até 15% entre a contagem de palavras e a duração alvo, arredondamento de tempo, nota de rodapé e detalhe de formatação NÃO são motivo de reprovação: registre como melhoria opcional. Não invente pendência nova que o laudo anterior não trouxe.\n Entregue o laudo EXATAMENTE no formato do seu prompt (VEREDITO, NOTA de 1 a 5, CORREÇÕES OBRIGATÓRIAS com regra, trecho e correção exata, MELHORIAS OPCIONAIS, LIÇÃO PARA O CÉREBRO DA MARCA, PEDIDOS AO GERENTE EM ABERTO). Texto corrido, sem JSON.\n\n# PEÇA\n${brief(c, true)}${CRITERIOS_MODO[c.goal] ? '\n\n# CRITÉRIOS DO OBJETIVO\n' + CRITERIOS_MODO[c.goal] : ''}${fato ? '\n\n# FACTUALIDADE\nEsta peça traz fatos reais: confira o inventário de afirmações e as fontes.' : ''}${regrasRot ? '\n\n# LIÇÕES E REGRAS DO CÉREBRO (cada uma vale como regra)\n' + regrasRot : ''}${ult.length ? '\n\n# ÚLTIMAS PEÇAS DA MARCA (para checar repetição de estrutura)\n' + ult.map(u => `## ${u.title}\n${String(u.script).slice(0, 700)}`).join('\n\n') : ''}\n\n${manuaisBloco(manuaisCodes(c, { revisao: true }))}${estiloEstruturaBloco(c, 'revisor')}`;
    const r = await callClaude({ agent: agentRow('revisorcopy'), user, maxTokens: 4000 });
    const L = lerLaudoCopy(r.text);
    if (!L.veredito) { if (MANUAL) throw new Error('Não consegui achar “VEREDITO: aprovada, ajustes ou refazer” no laudo colado. Peça ao Claude para repetir o laudo no formato do prompt e cole de novo.'); L.veredito = 'ajustes'; L.correcoes = L.correcoes || 'O laudo veio fora do formato; refaça a revisão da peça.'; }
    // aprovação exige GANCHO e ESPECIFICIDADE >= 4 (padrão de força do dono): peça segura e genérica volta como "ajustes"
    if (L.veredito === 'aprovada' && L.forca && (L.forca.gancho < 4 || L.forca.especificidade < 4)) {
      L.veredito = 'ajustes';
      L.correcoes = `FORÇA INSUFICIENTE (GANCHO ${L.forca.gancho}, ESPECIFICIDADE ${L.forca.especificidade}; para aprovar os dois precisam ser 4 ou mais). Entregue 2 títulos alternativos concretos que passem no teste do concorrente e inclua um exemplo concreto (pessoa fictícia rotulada, lugar, situação com detalhe) no trecho do miolo onde hoje só há conselho genérico.\n` + (L.correcoes || '');
    }
    const ok = L.veredito === 'aprovada', ev = { veredito: L.veredito, nota: L.nota, forca: L.forca, laudo: r.text, ts: T() };
    setContent(c.id, { copy_review: JSON.stringify(ev) });
    const fmtc = `${c.format}/${c.kind}${c.goal ? '/' + c.goal : ''}`, det = `${L.correcoes ? 'Correções: ' + L.correcoes.slice(0, 900) + '\n' : ''}${L.licao ? 'Lição: ' + L.licao.slice(0, 400) : ''}`;
    if (ok) brainEvent('roteirista', 'revisao_aprovada', c, `Revisor de Copy aprovou (nota ${L.nota ?? '-'}/5, ${fmtc})`, det);
    else brainEvent('roteirista', 'revisao_reprovada', c, `Revisor de Copy: ${L.veredito} (nota ${L.nota ?? '-'}/5, ${fmtc})`, det);
    if (ok || c.revisions >= maxRev(s)) {
      if (!ok) log('revisorcopy', `Ainda há pendências na copy de "${c.title}" após ${c.revisions} rodada(s): o Revisor decide com o laudo na mão`, c.id);
      else log('revisorcopy', `Aprovou a copy de "${c.title}" (nota ${L.nota ?? '-'}/5)`, c.id);
      depoisDaCopy(c);
    } else {
      setContent(c.id, { revisions: c.revisions + 1, status: 'producing' });
      log('revisorcopy', `Devolveu a copy de "${c.title}" (${L.veredito}, nota ${L.nota ?? '-'}/5) — rodada ${c.revisions + 1}/${maxRev(s)}`, c.id);
      enqueue(c.id, 'roteirista', 'roteiro', { feedback: `LAUDO DO REVISOR DE COPY (${L.veredito}). Aplique as correções obrigatórias (só elas: não reescreva o que já está bom) e entregue a peça completa de novo, limpa: sem notas dirigidas ao Revisor dentro do texto:\n${L.correcoes || r.text.slice(0, 3000)}` });
    }
    return r;
  },

  async revisao(job, c) {
    const s = settings();
    const regrasRot = brainBlock('roteirista', c.brand || '', { base: false, count: false, fmt: fmtGrupo(c.format) });
    const laudoCopy = (() => { try { const x = JSON.parse(c.copy_review || '{}'); return x.laudo ? `\n\n# LAUDO DO REVISOR DE COPY (revisão de copy já feita antes de você; se ele ainda apontou pendências, confira se foram resolvidas)\n${String(x.laudo).slice(0, 3500)}` : ''; } catch { return ''; } })();
    const user = `# TAREFA\nRevise a peça abaixo contra as diretrizes, a marca e o tom de voz da base de conhecimento.\nCALIBRAGEM: reprove (ou peça refazer) só por problema que muda o resultado da peça: gancho fraco, erro ou risco factual, regra do Cérebro ou da marca descumprida, política violada, produção inexecutável. Diferença de até 15% entre a contagem de palavras e a duração alvo, arredondamento de tempo, nota de rodapé e detalhe de formatação NÃO são motivo de reprovação: registre como melhoria opcional. Não invente pendência nova que o laudo anterior não trouxe.\n\n# PEÇA\n${brief(c, true)}${laudoCopy}${CRITERIOS_MODO[c.goal] ? '\n\n# CRITÉRIOS DO OBJETIVO\n' + CRITERIOS_MODO[c.goal] : ''}${regrasRot ? '\n\n# REGRAS DO CÉREBRO QUE O ROTEIRO DEVE CUMPRIR\nConfira o roteiro contra cada item abaixo. Descumprir um “NUNCA FAÇA” ou “SEMPRE FAÇA” é problema a corrigir e deve entrar em ajustes_obrigatorios.\n' + regrasRot.replace(/^# [^\n]*\n[^\n]*\n\n/, '') : ''}\n\n# CONTEÚDO\n${c.script}\n\n# SAÍDA\nResponda SOMENTE com um JSON válido (sem texto antes ou depois). Dentro dos textos NÃO use aspas duplas retas (use aspas simples ou “ ”) e não quebre linha dentro de um texto (use \\n). Formato:\n{"nota": número de 0 a 10, "aprovado": true|false, "aderencia_diretrizes": 0-10, "gancho": 0-10, "clareza": 0-10, "risco_factual": "baixo"|"medio"|"alto", "pontos_fortes": ["..."], "problemas": ["..."], "ajustes_obrigatorios": "instruções objetivas e numeradas para o roteirista (vazio se aprovado)"}\nReprove (aprovado=false) se houver afirmação factual sem sustentação, ficção apresentada como fato, descumprimento de diretriz ou gancho fraco.${estiloEstruturaBloco(c, 'gerente')}`;
    let r = await callClaude({ agent: agentRow('gerente'), user, maxTokens: 1500 });
    const falhou = (txt, e) => log('gerente', `Falha ao ler a revisão (${String(txt).length} caracteres). Início do texto recebido: ${JSON.stringify(String(txt).slice(0, 300))} — ${e.message}`, c.id);
    let rev;
    try { rev = extrairJSON(r.text, '{'); }
    catch (e1) {
      falhou(r.text, e1);
      if (MANUAL) throw new Error('Não consegui ler a revisão colada. Peça ao Claude: “Refaça somente o JSON válido, sem texto antes ou depois, sem cercas de código e sem aspas duplas retas dentro dos textos” e cole de novo.');
      // modo automático: UMA nova chamada ao Revisor pedindo só o JSON
      const r2 = await callClaude({ agent: agentRow('gerente'), user: `${user}\n\n# SUA RESPOSTA ANTERIOR (inválida)\n${r.text.slice(0, 6000)}\n\n# CORREÇÃO\nRefaça somente o JSON válido, sem texto antes ou depois, sem cercas de código e sem aspas duplas retas dentro dos textos.`, maxTokens: 1500 });
      r = { ...r2, tin: (r.tin || 0) + (r2.tin || 0), tout: (r.tout || 0) + (r2.tout || 0) };
      try { rev = extrairJSON(r2.text, '{'); }
      catch (e2) { falhou(r2.text, e2); throw new Error('O Revisor não devolveu um JSON válido nem na segunda tentativa.'); }
    }
    const v = validarRevisao(rev); rev = v.rev;
    if (v.faltou.length) log('gerente', `Revisão sem os campos [${v.faltou.join(', ')}] — preenchi com valores padrão`, c.id);
    const nota = Math.max(0, Math.min(10, Number(rev.nota) || 0));
    const approved = rev.aprovado === true && nota >= +s.score_min && rev.risco_factual !== 'alto';
    // acabaram as rodadas e a nota está perto do mínimo, sem risco factual alto: a equipe segue (com as ressalvas anotadas) em vez de travar por detalhe
    const comRessalva = !approved && c.revisions >= maxRev(s) && nota >= Math.max(5, +s.score_min - 1.5) && rev.risco_factual !== 'alto';
    const base = { review: JSON.stringify({ ...rev, nota, aprovado: approved }), score: nota };
    const fmtc = `${c.format}/${c.kind}${c.goal ? '/' + c.goal : ''}`;
    if (approved) brainEvent('roteirista', 'revisao_aprovada', c, `Aprovado com nota ${nota.toFixed(1)} (${fmtc})`, `Pontos fortes: ${(rev.pontos_fortes || []).join(' | ')}${rev.gancho != null ? `\nGancho ${rev.gancho}/10, clareza ${rev.clareza}/10, aderência ${rev.aderencia_diretrizes}/10` : ''}`);
    else brainEvent('roteirista', 'revisao_reprovada', c, `Reprovado com nota ${nota.toFixed(1)} (${fmtc}), risco factual ${rev.risco_factual}`, `Problemas: ${(rev.problemas || []).join(' | ')}\nAjustes pedidos: ${rev.ajustes_obrigatorios || ''}`);
    if (approved || comRessalva) {
      if (comRessalva) log('gerente', `Liberou com ressalvas "${c.title}" (nota ${nota.toFixed(1)}, acabaram as rodadas de revisão): ${(rev.problemas || []).slice(0, 3).join(' | ').slice(0, 400)}`, c.id);
      const needed = s.auto_produce === '1' ? producaoDe(c) : [];
      if (needed.length && s.approve_script === '1') {   // opcional: o dono quer aprovar o roteiro antes de produzir
        setContent(c.id, { ...base, status: 'awaiting_script' });
        log('gerente', `Aprovou o roteiro de "${c.title}" (nota ${nota.toFixed(1)}) — aguardando você aprovar para produzir ${needed.includes('editor') ? 'o vídeo' : 'a arte'}`, c.id);
      } else if (needed.length) {
        setContent(c.id, { ...base, status: 'producing', prod_revisions: 0 });
        for (const ag of needed) enqueue(c.id, ag, ag === 'designer' ? 'arte' : 'video');
        log('gerente', `Aprovou "${c.title}" (nota ${nota.toFixed(1)}) — liberado para produção`, c.id);
      } else {
        setContent(c.id, { ...base });
        paraAprovacao(c, `Aprovou "${c.title}" (nota ${nota.toFixed(1)}) — aguardando sua aprovação final`);
      }
    } else if (c.revisions < maxRev(s)) {
      setContent(c.id, { ...base, revisions: c.revisions + 1, status: 'producing' });
      log('gerente', `Reprovou "${c.title}" (nota ${nota.toFixed(1)}) — pediu ajustes (${c.revisions + 1}/${maxRev(s)})`, c.id);
      enqueue(c.id, 'roteirista', 'roteiro', { feedback: String(rev.ajustes_obrigatorios || (rev.problemas || []).join('\n') || 'Melhore o gancho e a aderência às diretrizes.') });
    } else {
      setContent(c.id, { ...base, status: 'blocked', error: `Reprovado após ${s.max_revisions} revisões automáticas. Veja a aba Revisão e decida.` });
      log('gerente', `"${c.title}" travou após ${s.max_revisions} revisões — precisa de você`, c.id);
    }
    return r;
  },

  async arte(job, c) {
    const input = JSON.parse(job.input || '{}');
    { const fmt = formatoPeloRoteiro(c); if (fmt && fmt !== c.format) { setContent(c.id, { format: fmt }); log('designer', fmt === 'carrossel' ? `O roteiro de "${c.title}" tem várias páginas: a peça passou de post único para carrossel` : `O roteiro de "${c.title}" tem uma página só: a peça passou de carrossel para post único`, c.id); c = getContent(c.id); } }
    let user = `# TAREFA\n${ARTE_GUIA[c.format] || 'Crie a direção de arte completa para a peça abaixo.'}\n\n# PEÇA\n${brief(c)}\n\n# ROTEIRO APROVADO\n${c.script}\n\n${ARTE_SPEC_GUIA}\n\n${estiloTexto(c.brand)}${PROMPT_IMAGEM_GUIA}`;
    if (input.feedback && (c.art || c.art_spec)) user += `\n\n# VERSÃO ANTERIOR\n${c.art}${c.art_spec ? '\n\n# ESPECIFICAÇÃO VISUAL ANTERIOR (JSON)\n```json\n' + c.art_spec + '\n```\nMantenha tudo o que não foi pedido para mudar (textos, cores, prompts de fundo "gen" idênticos) e altere somente o que os ajustes pedem.' : ''}\n\n# AJUSTES PEDIDOS ${input.from === 'dono' ? 'PELO DONO (prioridade máxima; o roteiro e os textos continuam os mesmos, ajuste a diagramação e os elementos visuais)' : input.from === 'sistema' ? 'PELO SISTEMA' : 'PELO REVISOR'} (aplique todos e entregue a direção de arte completa de novo, com a especificação visual em JSON)\n${input.feedback}`;
    const lidas = !input.feedback && paginasDoRoteiro(c.script, c.format, c.brand);
    if (lidas) user += `\n\n# PÁGINAS JÁ LIDAS DO ROTEIRO PELO PAINEL\nO roteiro está no modelo do dono e o painel já separou as páginas e escolheu um modelo para cada uma. Use isto como base: mantenha os textos (pode encurtar e quebrar com "|" para a diagramação), troque o modelo só se outro servir melhor, e reescreva "foto"/"objeto"/"particulas" em inglês a partir do "Visual" do roteiro. Uma palavra de destaque por página.\n\`\`\`json\n${JSON.stringify(lidas)}\n\`\`\``;
    const ea = String(c.estilo_arte || ''), layEsc = input.layout_id || (/^l:\d+$/.test(ea) ? +ea.slice(2) : undefined);
    user += templatesBloco(c, /^t:/.test(ea) ? ea.slice(2) : '') + moldesBloco('designer', c) + layoutsBloco(c, layEsc);
    if (lidas && !MANUAL && !als.getStore()?.dry && settings().arte_do_roteiro === 'sempre' && !/^l:/.test(String(c.estilo_arte || '')) && await arteDoRoteiro(c.id, 'modo rápido')) return { text: getContent(c.id).art, tin: 0, tout: 0 };
    if (c.kind === 'noticia' && !als.getStore()?.dry && await arteDoRoteiro(c.id, 'notícia: arte montada pelo painel')) return { text: getContent(c.id).art, tin: 0, tout: 0 };   // notícia: a arte sai do roteiro, no template da marca, sem depender de o Designer entregar JSON
    const r = await callClaude({ agent: agentRow('designer'), user, maxTokens: 7000 });
    const sp = extractArteSpec(r.text, c.format, c);
    if (sp && sp.format !== c.format && ['feed', 'carrossel'].includes(c.format)) { setContent(c.id, { format: sp.format }); log('designer', `A peça "${c.title}" tem ${sp.spec.slides.length} páginas: virou carrossel`, c.id); }
    setContent(c.id, { art: sp ? r.text.replace(sp.raw, '').trim() : r.text, art_spec: sp ? JSON.stringify(sp.spec) : '', art_spec_base: sp ? JSON.stringify(sp.spec) : '', art_status: '', art_note: '' });
    log('designer', `Direção de arte pronta: "${c.title}"`, c.id);
    if (sp) {
      await renderArte(c.id);   // gera as imagens aqui, antes de a peça ir para o Revisor
      if (!MANUAL && !als.getStore()?.dry && visualLigado() && getContent(c.id)?.art_status === 'ok') { try { await inspecionaArte(c.id); } catch (e) { console.error('inspeção visual da arte:', e.message); } }
      const falhas = checksLer(getContent(c.id)?.art_checks).filter(x => !x.corrigido && x.sev === 'erro');
      if (falhas.length && !MANUAL && !input.autocheck && !als.getStore()?.dry) enqueue(c.id, 'designer', 'arte', { feedback: 'A checagem automática mediu a arte e encontrou problemas que o painel não conseguiu corrigir sozinho. Refaça a arte resolvendo todos:\n' + checksTexto(falhas), from: 'sistema', autocheck: true });
    }
    else if (!als.getStore()?.dry && (settings().arte_do_roteiro !== 'nunca' || c.kind === 'noticia') && await arteDoRoteiro(c.id, 'o Designer não entregou o bloco JSON')) { brainEvent('designer', 'spec_arte_invalido', c, 'Direção de arte entregue sem especificação visual válida: o painel montou a arte pelo roteiro', 'O bloco JSON dos slides veio ausente ou inválido; o painel usou o roteiro no modelo do dono.'); }
    else {
      setContent(c.id, { art_status: 'sem_spec', art_note: 'O Designer não entregou a especificação visual (bloco JSON). A direção de arte em texto está salva.' });
      if (!MANUAL && !input.retry && !als.getStore()?.dry) enqueue(c.id, 'designer', 'arte', { feedback: 'Sua resposta anterior veio SEM o bloco ```json com a especificação visual (slides). Entregue de novo a direção de arte completa, terminando com esse bloco JSON no formato exigido.', from: 'sistema', retry: true }); brainEvent('designer', 'spec_arte_invalido', c, 'Direção de arte entregue sem especificação visual válida', 'O bloco JSON dos slides veio ausente ou inválido; a imagem não pôde ser renderizada.'); }
    return r;
  },

  async video(job, c) {
    const motion = c.format === 'video_vertical';
    const input = JSON.parse(job.input || '{}');
    let user = `# TAREFA\nCrie a decupagem completa de edição para a peça abaixo.${motion ? ' Depois da decupagem, entregue o SPEC do vídeo conforme o guia.' : ''}\n\n# PEÇA\n${brief(c)}\n\n# ROTEIRO APROVADO\n${c.script}${motion ? '\n\n' + MOTION_GUIA : ''}`;
    if (input.feedback && c.video) user += `\n\n# VERSÃO ANTERIOR\n${c.video}\n\n# AJUSTES PEDIDOS ${input.from === 'dono' ? 'PELO DONO (prioridade máxima; o roteiro continua o mesmo)' : 'PELO REVISOR'} (aplique todos e entregue a decupagem${motion ? ' e o spec' : ''} completos de novo)\n${input.feedback}`;
    if (input.feedback && c.spec) user += `\n\n# SPEC ATUAL DO VÍDEO (JSON, já com as edições do dono: parta dele e mude só o que os ajustes pedem)\n\`\`\`json\n${String(c.spec).slice(0, 14000)}\n\`\`\``;
    user += moldesBloco('editor', c);
    if (motion) { const eb = estiloVideoBloco(c); if (eb) user += '\n\n' + eb; }
    const r = await callClaude({ agent: agentRow('editor'), user, maxTokens: motion ? 9000 : 5000 });
    let spec = '', raw = '';
    if (motion) { try { const sp = extractSpec(r.text); if (sp) { spec = JSON.stringify(sp.spec); raw = sp.raw; } } catch {} }
    let vck = [];
    if (motion && spec) { try { const sp2 = JSON.parse(spec); const av = aplicaEstilo(sp2, c); vck = checaSpecVideo(sp2, c); for (const m of av) vck.push({ tipo: 'estilo_fora', sev: 'aviso', corrigido: true, msg: m }); spec = JSON.stringify(sp2); } catch (e) { console.error('checagem do vídeo:', e.message); } }
    const text = motion && spec && raw ? r.text.replace(raw, '').trim() : r.text;   // o spec fica na própria coluna; a decupagem continua legível
    if (motion && !spec) brainEvent('editor', 'spec_invalido', c, 'Decupagem entregue sem spec de vídeo válido', 'O JSON do spec veio ausente ou inválido; o vídeo não pôde ser renderizado.');
    setContent(c.id, { video: text, ...(motion ? { spec, spec_base: spec, render_status: '' } : {}) });
    if (motion && spec) {
      checksSalva('editor', c.id, vck, 'vid_checks');
      const falhas = vck.filter(x => !x.corrigido && x.sev === 'erro');
      if (falhas.length && !MANUAL && !input.autocheck && !als.getStore()?.dry) enqueue(c.id, 'editor', 'video', { feedback: 'A checagem automática encontrou problemas no spec que o painel não conseguiu corrigir sozinho. Entregue a decupagem e o spec de novo resolvendo todos:\n' + checksTexto(falhas), from: 'sistema', autocheck: true });
    }
    log('editor', `Decupagem de vídeo pronta: "${c.title}"${motion ? (spec ? ' (spec do vídeo gerado)' : ' — sem spec válido; peça nova decupagem') : ''}`, c.id);
    if (spec && settings().auto_render === '1' && motorStatus().can_render) { try { startRender(c.id, 'video'); } catch {} }
    return r;
  },

  async gerencia(job, c) {
    const s = settings(), cut = (t, n) => String(t || '').slice(0, n);
    // Notícia montada pelo painel no template/layout da marca: a arte é determinística (o Designer não tem o que "corrigir"), então o Revisor da entrega só gastaria IA e devolveria em loop. A copy já passou pelo Revisor de copy; vai direto para a aprovação do dono.
    if (gerenciaDireta(c)) {
      paraAprovacao(c, `Notícia montada no template da marca: foi direto para a sua aprovação (sem gastar o Revisor da entrega) — "${c.title}"`);
      return { text: '', tin: 0, tout: 0 };
    }
    // o Revisor olha os quadros REAIS do vídeo antes de opinar (borrado, cortado, sem relação com a fala…)
    let quadrosRev = [];
    if (!MANUAL && !als.getStore()?.dry && visualLigado() && c.video && c.spec && isVideo(c.format) && motorStatus().can_render) {
      try { const iv = await inspecionaVideo(c.id); quadrosRev = iv.imgs; c = getContent(c.id); } catch (e) { console.error('inspeção visual do vídeo:', e.message); }
    }
    const rv = (() => { try { return JSON.parse(c.review || '{}'); } catch { return {}; } })();
    const regrasEnt = [c.art && 'designer', c.video && 'editor'].filter(Boolean).map(id => { const b = brainBlock(id, c.brand || '', { base: false, count: false, fmt: fmtGrupo(c.format) }); return b ? `## ${agentRow(id).name}\n${b}` : ''; }).filter(Boolean).join('\n\n');
    const tipoEnt = `# TIPO DE ENTREGA\nEsta peça é ${isVideo(c.format) ? 'de VÍDEO: só o Editor produz. Avalie apenas o vídeo e não cobre arte separada.' : 'ESTÁTICA: só o Designer produz. Avalie apenas a arte e não cobre vídeo.'}\n\n`;
    const estiloEnt = c.art && estiloTexto(c.brand) ? estiloTexto(c.brand) + 'Confira se a arte cumpre este estilo (composição, cores, fundos e o que evitar). Descumprir é motivo para devolver ao Designer, citando o item.\n\n' : '';
    const user = tipoEnt + estiloEnt + resumoArteReal(c) + (regrasEnt ? `# REGRAS DO CÉREBRO QUE ESTA ENTREGA DEVE CUMPRIR\nSe a arte ou o vídeo descumprir alguma, devolva (ajustar), cite a regra em "problemas" e peça a correção ao agente certo.\n${regrasEnt}\n\n` : '') + `# TAREFA\nFaça a REVISÃO DA ENTREGA desta peça: o roteiro já foi aprovado por você e agora a arte e/ou o vídeo ficaram prontos. Confira se a entrega está de acordo com o roteiro, a marca, a identidade visual e se é executável. Aprovada, ela segue para o Social Media e depois para o dono. Nota mínima do sistema: ${s.score_min}.\n\n# PEÇA\n${brief(c, true)}\n\n# ROTEIRO APROVADO\n${cut(c.script, 7000)}${c.art ? '\n\n# DIREÇÃO DE ARTE\n' + cut(c.art, 5000) : ''}${c.video ? '\n\n# DECUPAGEM DO VÍDEO\n' + cut(c.video, 5000) : ''}${(() => { const t = [checksTexto(checksLer(c.art_checks)) && 'ARTE:\n' + checksTexto(checksLer(c.art_checks)), checksTexto(checksLer(c.vid_checks)) && 'VÍDEO:\n' + checksTexto(checksLer(c.vid_checks))].filter(Boolean).join('\n'); return t ? '\n\n# CHECAGEM AUTOMÁTICA (medida pelo painel; o que está “NÃO corrigido” deve ser devolvido ao agente)\n' + t : ''; })()}\n\n# REVISÃO DO ROTEIRO (feita por você) (nota ${c.score != null ? Number(c.score).toFixed(1) : '-'})\n${cut(JSON.stringify(rv), 1800)}\n\n# SAÍDA\nResponda SOMENTE com JSON válido (sem texto antes ou depois, sem cercas de código). Dentro dos textos NÃO use aspas duplas retas e não quebre linha. Formato:\n{"veredito":"aprovar|ajustar","nota":0,"resumo":"2 a 3 frases com o seu parecer","pontos_fortes":["..."],"problemas":["..."],"ajustes_para_esta_tarefa":"o que corrigir agora (vazio se nada)","devolver":[{"agente":"designer|editor|roteirista","ajustes":"ajustes numerados e objetivos para quem fez (só se veredito=ajustar)"}],"feedback_proxima_tarefa":"orientação prática para as próximas tarefas, de acordo com o padrão de qualidade observado"}`;
    const ctx0 = als.getStore(); let imgs = [...quadrosRev];
    if (!MANUAL && !ctx0?.dry && c.art_status === 'ok') imgs = arteFiles(c.id).slice(0, 6).map(f => { try { return fs.readFileSync(path.join(ARTE_DIR(c.id), f.replace('.png', '.review.jpg'))).toString('base64'); } catch { return null; } }).filter(Boolean);
    const userG = imgs.length ? user + (quadrosRev.length ? `\n\n# IMAGENS ANEXADAS\nAs ${imgs.length} imagens anexadas são os QUADROS REAIS do vídeo renderizado (um por cena, na ordem). A inspeção visual acima já apontou problemas; confirme olhando você mesmo.\n${checklistVisual('video')}` : `\n\n# IMAGENS ANEXADAS\nAs ${imgs.length} imagens anexadas são os slides REAIS já renderizados da arte (na ordem). Avalie legibilidade, hierarquia, fidelidade ao roteiro e à identidade da marca olhando as imagens.\n${checklistVisual('arte')}`) + '\n\nConfira também a FIDELIDADE: a entrega fala só do que foi pedido (tema, produto, marca) e não afirma nada que não esteja no briefing ou na base de conhecimento (nada de nome, livro, número ou promessa inventados).' : (c.art_status && c.art_status !== 'ok' && c.art ? user + `\n\n# ATENÇÃO\nA imagem final NÃO foi renderizada (${c.art_status}). Mencione isso no parecer.` : user);
    let r = await callClaude({ agent: agentRow('gerente'), user: userG, maxTokens: 1800, images: imgs });
    let out;
    try { out = extrairJSON(r.text, '{'); }
    catch (e1) {
      if (MANUAL) throw new Error('Não consegui ler a revisão do Revisor. Peça ao Claude: “Refaça somente o JSON válido, sem texto antes ou depois, sem cercas de código e sem aspas duplas retas dentro dos textos” e cole de novo.');
      const r2 = await callClaude({ agent: agentRow('gerente'), user: `${user}\n\n# SUA RESPOSTA ANTERIOR (inválida)\n${cut(r.text, 5000)}\n\n# CORREÇÃO\nRefaça somente o JSON válido.`, maxTokens: 1800 });
      r = { ...r2, tin: (r.tin || 0) + (r2.tin || 0), tout: (r.tout || 0) + (r2.tout || 0) };
      try { out = extrairJSON(r2.text, '{'); } catch { throw new Error('O Revisor não devolveu um JSON válido nem na segunda tentativa.'); }
    }
    const list = x => (Array.isArray(x) ? x : x ? [x] : []).map(t => cut(t, 400)).filter(Boolean).slice(0, 8);
    const nota = Math.max(0, Math.min(10, Number(out.nota) || 0));
    const mg = { veredito: out.veredito === 'ajustar' || nota < +s.score_min ? 'ajustar' : 'aprovar', nota, resumo: cut(out.resumo, 900), pontos_fortes: list(out.pontos_fortes), problemas: list(out.problemas), ajustes_para_esta_tarefa: cut(out.ajustes_para_esta_tarefa, 1500), feedback_proxima_tarefa: cut(out.feedback_proxima_tarefa, 900), ts: T() };
    const devolver = (Array.isArray(out.devolver) ? out.devolver : []).map(d => ({ agente: String(d?.agente || '').toLowerCase().trim(), ajustes: cut(d?.ajustes, 1800) }))
      .filter(d => ['designer', 'editor', 'roteirista'].includes(d.agente) && d.ajustes && (d.agente === 'roteirista' || (d.agente === 'designer' ? !!c.art : !!c.video)));
    if (mg.veredito === 'ajustar' && !devolver.length) {
      const fb = mg.ajustes_para_esta_tarefa || mg.problemas.join('\n') || 'Melhore a entrega conforme as diretrizes da marca.';
      if (c.art) devolver.push({ agente: 'designer', ajustes: fb });
      if (c.video) devolver.push({ agente: 'editor', ajustes: fb });
    }
    mg.devolvido_para = devolver.map(d => d.agente);
    if (mg.veredito === 'aprovar') {
      setContent(c.id, { manager: JSON.stringify(mg) });
      paraAprovacao(c, `Revisor aprovou a entrega de "${c.title}" (nota ${nota.toFixed(1)}) — aguardando sua aprovação final`);
    } else if ((c.prod_revisions || 0) < +s.max_revisions && devolver.length) {
      setContent(c.id, { manager: JSON.stringify(mg), status: 'producing', error: '', prod_revisions: (c.prod_revisions || 0) + 1 });
      const nomes = { designer: 'Designer', editor: 'Editor', roteirista: 'Roteirista' };
      log('gerente', `Reprovou a entrega de "${c.title}" (nota ${nota.toFixed(1)}) — devolveu ao ${devolver.map(d => nomes[d.agente]).join(' e ao ')} (${(c.prod_revisions || 0) + 1}/${s.max_revisions})`, c.id);
      for (const d of devolver) {
        if (d.agente === 'roteirista') enqueue(c.id, 'roteirista', 'roteiro', { feedback: d.ajustes });
        else enqueue(c.id, d.agente, d.agente === 'designer' ? 'arte' : 'video', { feedback: d.ajustes });
      }
    } else {
      setContent(c.id, { manager: JSON.stringify(mg), status: 'blocked', error: `A entrega não passou na revisão do Revisor após ${s.max_revisions} devoluções. Veja a aba Revisão e decida.` });
      log('gerente', `"${c.title}" travou na revisão da entrega — precisa de você`, c.id);
    }
    // cada agente que produziu a entrega aprende com o veredito: o que deu certo ou o motivo da devolução
    if (mg.veredito === 'aprovar') {
      for (const ag of [c.art && 'designer', c.video && 'editor'].filter(Boolean)) brainEvent(ag, 'entrega_aprovada', c, `Revisor aprovou a ${ag === 'designer' ? 'arte' : 'vídeo'} com nota ${nota.toFixed(1)} (${c.format}/${c.kind})`, `Pontos fortes: ${mg.pontos_fortes.join(' | ')}\n${mg.resumo}`);
    } else {
      for (const d of devolver) if (d.agente !== 'roteirista') brainEvent(d.agente, 'entrega_reprovada', c, `Revisor devolveu ${d.agente === 'designer' ? 'a arte' : 'o vídeo'} com nota ${nota.toFixed(1)} (${c.format}/${c.kind})`, `Motivo (por que foi reprovado): ${mg.problemas.join(' | ') || mg.resumo}\nAjustes pedidos: ${d.ajustes}`);
    }
    brainEvent('gerente', mg.veredito === 'aprovar' ? 'gerente_ok' : 'gerente_ajustar', c, `Revisor: ${mg.veredito} com nota ${nota.toFixed(1)} (${c.format}/${c.kind})`, `${mg.resumo}\nProblemas: ${mg.problemas.join(' | ')}\nPróximas tarefas: ${mg.feedback_proxima_tarefa}`);
    return r;
  },

  // Gerente: conversa com o dono e executa as ordens dele
  async chat(job) {
    const input = JSON.parse(job.input || '{}'), msg = one('SELECT * FROM chat_msgs WHERE id=?', input.msg);
    if (!msg) return { text: '' };
    const user = `# ESTADO ATUAL DO SISTEMA (dados reais; não invente nada além disto)\n${gerenteSnapshot(msg.text)}\n\n# CONVERSA ATÉ AGORA\n${gerenteHistorico(msg.id) || '(início da conversa)'}\n\n# MENSAGEM DO DONO\n${msg.text}\n\n${GERENTE_ACOES}\n\nResponda agora ao dono, em português do Brasil, de forma direta e curta.`;
    const r = await callClaude({ agent: agentRow('chefe'), user, maxTokens: 4000 });
    const { fala, acoes } = gerenteResposta(r.text);
    const res = [];
    if (acoes === null) res.push({ ok: false, texto: 'Não consegui ler as ações que eu mesmo montei (JSON inválido). Peça de novo, por favor.' });
    else for (const a of acoes) { try { res.push({ ok: true, acao: a.acao, ...gerenteAcao(a) }); } catch (e) { res.push({ ok: false, acao: a?.acao, texto: `Não consegui executar “${a?.acao}”: ${e.message}` }); } }
    addChat('gerente', fala || (res.length ? 'Pronto, executei o que você pediu.' : '…'), { actions: res.length ? res : null, job: job.id });
    return r;
  },
  // Teste de agente pedido no chat: roda o treinamento do agente num pedido solto (não cria peça nem entra na meta)
  async teste(job) {
    const input = JSON.parse(job.input || '{}'), ag = agentRow(job.agent);
    const r = await callClaude({ agent: ag, user: `# TESTE PEDIDO PELO DONO (não é produção real: responda exatamente como responderia a um pedido de verdade, no formato do seu papel)\n${input.pedido}`, maxTokens: 4000 });
    addChat('agente', String(r.text).trim(), { agent: ag.id, job: job.id });
    return r;
  },
  async pacote(job, c) {
    const m = all('SELECT date,platform,post_title,views,likes,comments,shares,saves FROM metrics ORDER BY date DESC, id DESC LIMIT 30');
    const user = `# TAREFA\nMonte o pacote de postagem final.\n\n# PEÇA\n${brief(c)}\n\n# LEGENDA ATUAL\n${c.caption || '(sem legenda no roteiro — crie a partir do conteúdo)'}\n\n# CONTEÚDO\n${c.script.slice(0, 6000)}\n\n# MÉTRICAS RECENTES (para sugerir horário)\n${m.length ? m.map(x => Object.values(x).join(' | ')).join('\n') : '(sem métricas ainda)'}\n\n# SAÍDA\nSOMENTE JSON: {"legenda_final":"...","hashtags":["#..."],"primeiro_comentario":"...","horario_sugerido":"...","checklist":["..."],"observacoes":"..."}`;
    const r = await callClaude({ agent: agentRow('publicador'), user, maxTokens: 2000 });
    let pack;
    try { pack = extractJson(r.text, '{'); } catch { throw new Error('O Social Media não devolveu um JSON válido'); }
    setContent(c.id, { pack: JSON.stringify(pack), caption: pack.legenda_final || c.caption });
    log('publicador', `Pacote de postagem pronto: "${c.title}"`, c.id);
    await enviarWebhook(c, pack);
    return r;
  },

  async pautas(job) {
    const s = settings();
    const input = JSON.parse(job.input || '{}');
    const quota = input.quota && typeof input.quota === 'object' ? Object.fromEntries(Object.entries(input.quota).filter(([f, v]) => QUOTA_FMTS.includes(f) && +v > 0).map(([f, v]) => [f, Math.min(20, +v)])) : null;
    const nq = quota ? Object.values(quota).reduce((a, v) => a + v, 0) : 0;
    const n = quota && nq ? Math.min(20, nq) : Math.max(1, Math.min(10, +input.n || +s.per_day));
    const goalFixed = ['produto', 'conteudo', 'marca'].includes(input.goal) ? (input.goal === 'marca' ? '' : input.goal) : null;   // null = o Gerente escolhe
    const brands = all('SELECT name FROM brands ORDER BY name COLLATE NOCASE').map(b => b.name);
    const brandFixed = input.brand && brands.includes(input.brand) ? input.brand : '';
    const prods = all('SELECT id,name,type,promise,audience FROM products ORDER BY name COLLATE NOCASE').map(p => ({ ...p, brands: brandsOfProduct(p.id) })).filter(p => !brandFixed || p.brands.includes(brandFixed) || !p.brands.length);
    const prodFixed = +input.product_id ? prods.find(p => p.id === +input.product_id) || one('SELECT id,name,type,promise,audience FROM products WHERE id=?', +input.product_id) : null;
    const fmts = quota && nq ? Object.keys(quota) : (Array.isArray(input.formats) ? input.formats : []).filter(f => FORMATS.includes(f));
    const kinds = (Array.isArray(input.kinds) ? input.kinds : []).filter(k => KINDS.includes(k));
    const allowF = fmts.length ? fmts : FORMATS, allowK = kinds.length ? kinds : KINDS;
    const titles = all('SELECT title FROM contents WHERE teste=0 ORDER BY id DESC LIMIT 40').map(x => x.title);
    const rep = one('SELECT body FROM reports ORDER BY id DESC LIMIT 1');
    const metr = all('SELECT m.platform,m.post_title,m.views,m.likes,m.comments,m.shares,m.saves,c.format,c.kind FROM metrics m LEFT JOIN contents c ON c.id=m.content_id ORDER BY m.date DESC, m.id DESC LIMIT 20');
    const L = [];
    L.push(`# TAREFA\nVocê é o especialista em análise de conteúdo. Analise a base de conhecimento, os produtos, o histórico e o desempenho, decida O QUE vale produzir agora e qual ÂNGULO usar em cada peça, e entregue ${n} pauta(s) NOVA(S) e variada(s). Cada pauta será passada ao Roteirista, que escreve a peça e a envia sozinho para a produção; por isso o briefing precisa conter tudo que ele precisa (ângulo, público, objetivo, fatos permitidos).`);
    L.push(`# DEFINIÇÕES\n- FORMATO = onde a peça será postada: ${allowF.join(', ')}.\n- TIPO DE CONTEÚDO = a natureza do texto/história: ${allowK.join(', ')}.\n- OBJETIVO: "produto" (vender um produto contando uma história), "conteudo" (monetizar o próprio conteúdo: retenção e audiência) ou "marca" (conteúdo da marca: autoridade e relacionamento).`);
    const R = [];
    R.push(goalFixed === null ? 'Objetivo: você escolhe por pauta (misture conforme o que a base e o desempenho indicarem).' : `Objetivo de TODAS as pautas: ${goalFixed === '' ? 'marca' : goalFixed}.`);
    R.push(brandFixed ? `Marca de TODAS as pautas: ${brandFixed}.` : (brands.length ? `Marcas disponíveis: ${brands.join(', ')}. Escolha a marca de cada pauta.` : 'Não há marcas cadastradas: deixe "marca" vazio.'));
    if (prodFixed) R.push(`Produto de TODAS as pautas: #${prodFixed.id} ${prodFixed.name}.`);
    else if (goalFixed === null || goalFixed === 'produto') R.push(prods.length ? `Produtos disponíveis (para pautas com objetivo "produto", informe produto_id):\n${prods.map(p => `  #${p.id} ${p.name} (${p.brands.length ? p.brands.join(', ') : 'geral'}; ${p.type})${p.promise ? ' — ' + p.promise.slice(0, 120) : ''}`).join('\n')}` : 'Não há produtos cadastrados: não use o objetivo "produto".');
    if (input.platform) R.push(`Plataforma: ${input.platform}.`);
    if (fmts.length) R.push(`Use SOMENTE estes formatos: ${fmts.join(', ')}.`);
    if (kinds.length) R.push(`Use SOMENTE estes tipos de conteúdo: ${kinds.join(', ')}.`);
    if (quota && nq) {
      const sem = all("SELECT brand, COUNT(*) n FROM contents WHERE teste=0 AND created_at>=? GROUP BY brand", new Date(Date.now() - 7 * 864e5).toISOString());
      R.push(`META DE HOJE (entregue EXATAMENTE esta quantidade, nem mais nem menos): ${Object.entries(quota).map(([f, v]) => `${f}: ${v}`).join(', ')}.`);
      if (brands.length > 1 && !brandFixed) R.push(`Distribua as pautas entre as marcas de forma equilibrada, priorizando as que menos produziram nos últimos 7 dias. Peças dos últimos 7 dias por marca: ${brands.map(b => `${b}: ${sem.find(x => x.brand === b)?.n || 0}`).join(', ')}.`);
    }
    L.push('# RESTRIÇÕES DO PEDIDO\n' + R.join('\n'));
    if (input.tema) L.push(`# FOCO PEDIDO PELO DONO (opcional)\n${String(input.tema).slice(0, 1500)}`);
    L.push(`# TEMAS/DIRETRIZES DE PAUTA DO DONO\n${s.themes || '(livre, dentro do que a base permite)'}`);
    L.push(`# PAUTAS JÁ PRODUZIDAS (não repita)\n${titles.join('\n') || '(nenhuma)'}`);
    L.push(`# ÚLTIMA ANÁLISE DE DESEMPENHO\n${rep ? rep.body.slice(0, 4000) : '(ainda sem análise)'}`);
    if (metr.length) L.push(`# MÉTRICAS RECENTES (plataforma | título | formato/tipo | views | curtidas | comentários | compartilhamentos | salvamentos)\n${metr.map(m => [m.platform, m.post_title, `${m.format || '-'}/${m.kind || '-'}`, m.views, m.likes, m.comments, m.shares, m.saves].join(' | ')).join('\n')}`);
    L.push(`# SAÍDA\nSOMENTE um array JSON (sem texto antes ou depois; sem aspas duplas retas dentro dos textos): [{"titulo":"...","objetivo":"produto|conteudo|marca","marca":"","produto_id":0,"formato":"${allowF.join('|')}","tipo":"${allowK.join('|')}","plataforma":"Instagram|TikTok|YouTube|...","angulo":"o ângulo escolhido e por quê (1-2 frases)","briefing":"público, objetivo e os fatos que o roteirista pode usar, em 2-4 frases"}]\nNunca proponha pautas sobre fatos ou notícias que você não possa sustentar com a base; para notícias, descreva o tema e peça verificação de fonte no briefing. Não invente números, resultados ou depoimentos.`);
    const r = await callClaude({ agent: agentRow('chefe'), user: L.join('\n\n'), maxTokens: 3500 });
    let arr;
    try { arr = extractJson(r.text, '['); } catch { throw new Error('O Gerente não devolveu pautas em JSON'); }
    if (!Array.isArray(arr)) throw new Error('Formato de pautas inválido');
    const existing = new Set(titles.map(t => t.toLowerCase()));
    let made = 0; const left = quota && nq ? { ...quota } : null;
    for (const p of arr.slice(0, left ? n + 4 : n)) {
      const title = String(p.titulo || '').trim().slice(0, 200);
      if (!title || existing.has(title.toLowerCase())) continue;
      if (left) { if (!(left[p.formato] > 0)) continue; }   // respeita a meta por formato: nada além do pedido
      existing.add(title.toLowerCase());
      let goal = goalFixed !== null ? goalFixed : (p.objetivo === 'produto' ? 'produto' : p.objetivo === 'conteudo' ? 'conteudo' : '');
      let prod = null;
      if (goal === 'produto') {
        prod = prodFixed || (prods.find(x => x.id === +p.produto_id) || (prods.length === 1 ? prods[0] : null));
        if (!prod) goal = goalFixed === 'produto' ? 'produto' : '';   // sem produto válido: vira conteúdo de marca
        if (goal === 'produto' && !prod) continue;
      }
      let brand = brandFixed || (brands.includes(p.marca) ? p.marca : '') || (prod?.brands?.length === 1 ? prod.brands[0] : '');
      let format = allowF.includes(p.formato) ? p.formato : allowF[0];
      if (format === 'feed' && allowF.includes('carrossel') && /carrossel|slides?\b/i.test(`${p.titulo || ''} ${p.angulo || ''} ${p.briefing || ''}`)) format = 'carrossel';   // o ângulo pede carrossel: não deixa virar post único
      const kind = allowK.includes(p.tipo) ? p.tipo : (allowK.includes('educativo') ? 'educativo' : allowK[0]);
      const angulo = String(p.angulo || '').trim();
      createContent({
        title, format, kind, goal, brand, product_id: goal === 'produto' ? prod.id : null,
        platform: String(p.plataforma || input.platform || '').slice(0, 40),
        brief: ((angulo ? `ÂNGULO (definido pelo Gerente): ${angulo}\n` : '') + String(p.briefing || '')).slice(0, 4000)
      }, job.origin === 'manual' ? 'manual' : 'autopilot');   // só o modo autônomo conta na meta diária
      if (left) left[format]--;
      made++;
    }
    log('chefe', `${made} pauta(s) definida(s) pelo Gerente${left ? ' para a meta do dia' : ''} e enviada(s) ao Roteirista para produção`);
    return r;
  },

  // Designer aprende o estilo de arte da marca: lê artes aprovadas (e os motivos das devolvidas) ou imagens de referência e PROPÕE parâmetros
  async estilo(job) {
    const input = JSON.parse(job.input || '{}'), brand = String(input.brand || ''), cur = styleOwn(brand), imgs = [], L = [];
    if (input.origem === 'referencias') {
      for (const id of (input.assets || []).slice(0, 6)) {
        const a = one('SELECT * FROM assets WHERE id=?', +id), v = a && ['png', 'jpg', 'jpeg', 'webp'].includes(a.ext) ? visionImg(path.join(ASSET_DIR, a.id + '.' + a.ext)) : null;
        if (v) { imgs.push(v); L.push(`Imagem ${imgs.length}: ${a.name}${a.note ? ' — ' + a.note : ''}`); }
      }
      if (!imgs.length) throw new Error('Nenhuma referência utilizável: escolha imagens PNG, JPG ou WEBP de até 4 MB.');
    } else {
      const rows = all("SELECT * FROM contents WHERE teste=0 AND art_spec<>'' AND brand=? COLLATE NOCASE AND status IN ('approved','posted','awaiting_approval') ORDER BY id DESC LIMIT 6", brand);
      for (const c of rows) {
        L.push(`Peça #${c.id} “${clip(c.title, 70)}” (${c.format}, ${c.status}${c.score != null ? ', nota ' + Number(c.score).toFixed(1) : ''}): ${artSnapshot(c)}`);
        const f = arteFiles(c.id)[0]; if (f && imgs.length < 6) { const v = visionImg(path.join(ARTE_DIR(c.id), f.replace('.png', '.review.jpg'))); if (v) imgs.push(v); }
      }
      const bad = all("SELECT summary,detail FROM brain_events WHERE agent='designer' AND kind IN ('entrega_reprovada','ajuste_dono') AND brand=? COLLATE NOCASE ORDER BY id DESC LIMIT 8", brand);
      if (!rows.length && !bad.length) throw new Error('Ainda não há artes aprovadas nem devolvidas dessa marca para aprender. Produza e aprove algumas peças, ou use imagens de referência.');
      if (bad.length) L.push('\nARTES DEVOLVIDAS (o que não funcionou): ' + bad.map(e => clip((e.detail.match(/(?:Motivo[^:]*|Problemas): ([^\n]*)/) || [])[1] || e.summary, 200)).join(' | '));
    }
    const user = `# TAREFA\nVocê é o Designer. Extraia o ESTILO DE ARTE${brand ? ' da marca ' + brand : ' geral'} a partir do material abaixo e proponha os parâmetros que a equipe deve seguir daqui em diante: composição, estilo visual e, principalmente, como construir as imagens de fundo por IA (estilo, luz, lente, textura, negativo).\n\n# ESTILO ATUAL (JSON; deixe de fora o que não mudar)\n${JSON.stringify(cur)}\n\n# MATERIAL${imgs.length ? ' (as imagens anexadas seguem a ordem abaixo)' : ''}\n${L.join('\n')}\n\n# ESQUEMA DOS PARÂMETROS\n${STYLE_SCHEMA}\n\n# REGRAS\n1. Só proponha o que o material sustenta; campo sem evidência fica de fora.\n2. Cores e fontes NÃO entram aqui (já estão na Identidade da marca); descreva as cores em palavras só em \"paleta_prompt\".\n3. Os campos de "fundo_ia" ficam em inglês, curtos e reutilizáveis em qualquer cena.\n4. "evitar" só com erros que aparecem nas artes devolvidas ou claramente fora do padrão.\n\n# SAÍDA\nSomente JSON válido, sem texto fora dele e sem aspas duplas retas dentro dos textos: {"resumo":"2 frases sobre o estilo","evidencia":"o que no material sustenta","params":{...}}`;
    const r = await callClaude({ agent: agentRow('designer'), user, maxTokens: 2500, images: imgs });
    let out; try { out = extrairJSON(r.text, '{'); } catch { throw new Error(MANUAL ? 'Não consegui ler a resposta. Peça ao Claude: “Refaça somente o JSON válido, sem texto fora dele”, e cole de novo.' : 'O Designer não devolveu um JSON válido.'); }
    const n = styleProposal(brand, out.params, out.evidencia, input.origem === 'referencias' ? 'referências' : 'artes aprovadas', out.resumo);
    log('designer', n ? `Aprendeu o estilo de arte${brand ? ' de ' + brand : ''}: ${n} sugestão(ões) esperando seu OK` : `Estilo de arte${brand ? ' de ' + brand : ''}: nada novo para sugerir`);
    return r;
  },

  // O Cérebro: lê o que aconteceu (revisões, ajustes do dono, aprovações, métricas) e atualiza as regras de cada agente
  async cerebro() {
    const events = all('SELECT * FROM brain_events WHERE digest_id IS NULL ORDER BY id LIMIT 80');
    const mets = brainNewMetrics();
    if (!events.length && !mets.length) throw fail(409, 'Ainda não há atividade nova para o Cérebro aprender.');
    const ags = all('SELECT id,name,role FROM agents');
    const rules = all("SELECT * FROM brain_rules WHERE status IN ('ativa','proposta','teste') ORDER BY id");
    const ids = new Set(ags.map(a => a.id));
    const brandNames = all('SELECT name FROM brands').map(b => b.name);
    const evTxt = events.map(e => `[${e.id}] ${e.ts.slice(0, 10)} | ${e.agent || '-'} | ${e.kind} | “${e.title || '-'}”${e.brand ? ' | marca ' + e.brand : ''}${e.formato ? ' | formato ' + e.formato : ''}${e.tags ? ' | motivos ' + tagsDe(e).map(t => motivoRotulo(e.agent, t)).join(', ') : ''} | ${e.summary}${e.detail ? '\n    ' + e.detail.replace(/\n/g, '\n    ') : ''}`).join('\n') || '(nenhum evento novo)';
    const metTxt = mets.map(m => { const c = m.content_id ? getContent(m.content_id) : null; const eng = m.views ? ((m.likes + m.comments + m.shares + m.saves) / m.views * 100).toFixed(2) + '%' : '-'; return `${m.date} | ${m.platform || '-'} | ${m.post_title || c?.title || '-'} | ${c ? c.format + '/' + c.kind : '-'} | ${m.views} views | engajamento ${eng}${m.notes ? ' | ' + m.notes : ''}`; }).join('\n') || '(sem métricas novas)';
    const ruleTxt = rules.map(r => { const im = r.status === 'ativa' ? ruleImpacto(r) : null, ef = im && im.depois.ok + im.depois.bad >= 3 ? ` | efeito: antes ${im.antes.ok} aprov./${im.antes.bad} reprov., depois ${im.depois.ok} aprov./${im.depois.bad} reprov.` : ''; return `#${r.id} | ${r.agent === '*' ? 'todos' : r.agent} | ${r.type} | ${r.status} | peso ${r.weight}${r.brand ? ' | marca ' + r.brand : ''}${r.formato ? ' | formato ' + r.formato : ''}${ef} | ${r.text}`; }).join('\n') || '(ainda não há regras)';
    const user = `# TAREFA
Você agora atua como o CÉREBRO da agência: a memória central que aprende com o trabalho de todos os agentes e dita as regras que cada um deve seguir. Leia a atividade recente abaixo e destile LIÇÕES curtas, gerais e acionáveis para os agentes.

# AGENTES
${ags.map(a => `${a.id} — ${a.role}`).join('\n')}

# REGRAS ATUAIS DO CÉREBRO (id | agente | tipo | status | peso | texto)
${ruleTxt}

# ATIVIDADE RECENTE (id | data | agente | tipo | peça | resumo)
${evTxt}

# DESEMPENHO NAS PLATAFORMAS (métricas novas)
${metTxt}

# COMO CRIAR AS LIÇÕES
1. Só crie uma lição quando houver evidência no material acima, e cite-a em "evidencia". Não invente causas. Com menos de 2 sinais parecidos, prefira não criar nada.
2. Cada lição vale para UM agente (ou "todos"), é geral (não fala de uma peça específica), tem no máximo 220 caracteres e é uma instrução direta (“Sempre…”, “Nunca…”, “Prefira…”).
3. "tipo": "regra" (sempre fazer), "evitar" (nunca fazer) ou "padrao" (o que funciona, comprovado por métricas; use só com números que sustentem).
4. Se a lição repete uma regra já existente, use "reforca_id" com o id dela em vez de criar outra.
5. Ajustes pedidos pelo dono (tipo ajuste_dono) são os sinais mais fortes: transforme em regra o que ele corrige repetidamente. Um ajuste do dono com motivo objetivo já justifica uma lição “evitar” para o agente responsável, mesmo com um único sinal.
5b. Aprenda por agente e por resultado. REPROVADO ou DEVOLVIDO (revisao_reprovada, entrega_reprovada, ajuste_dono, revisor_deixou_passar): descubra POR QUE e escreva a lição “evitar” (ou “regra”) que impede o mesmo erro, citando o motivo em “evidencia”. RESULTADO REAL NAS REDES (resultado_bom = post acima da média, resultado_fraco = abaixo): descubra o que o roteiro, a arte, o vídeo e o Social Media (legenda, horário, hashtags) tiveram em comum e transforme em "padrao" (bom) ou "evitar" (fraco), só com 2 ou mais posts parecidos. APROVADO (revisao_aprovada, entrega_aprovada, aprovado_dono, roteiro_aprovado_dono, gerente_ok): registre o que deu certo como “padrao” ou reforce a regra existente (“reforca_id”), principalmente quando os pontos fortes se repetem. Designer e Editor aprendem com entrega_aprovada, entrega_reprovada e aprovado_dono; o Revisor aprende com revisor_deixou_passar.
6. Nunca crie regra que mande inventar fatos, números, depoimentos ou prometer resultado: as diretrizes de honestidade da base prevalecem.
5c. Preferências que o dono disse no chat (preferencia_dono) são ordens gerais: transforme-as em lição direta para o agente certo, sem exigir um segundo sinal.
7. Sugira arquivar (ids em "arquivar") só regras que a atividade recente contradiz ou cujo "efeito" mostra que as reprovações NÃO caíram depois dela (reescreva a lição de forma mais específica no lugar).
8a. Eventos com "motivos" (categorias que o dono marcou ou que a checagem automática mediu) já viram regra sozinhos quando se repetem. Só crie lição sobre eles se houver uma causa mais específica que a categoria não explica.
8c. "formato": lições de Designer ou Editor que valem só para um formato (carrossel, feed, stories ou video) devem trazer esse formato; vazio vale para todos. Não generalize um aprendizado de carrossel para vídeo nem o contrário.
8. No máximo 8 lições. "marca" fica vazio (vale para todas) ou traz o nome exato de uma marca: ${brandNames.length ? brandNames.join(', ') : '(nenhuma cadastrada)'}.

8b. ESTILO DE ARTE: se os sinais do Designer (aprovações e devoluções de arte, com os parâmetros de cada arte) mostrarem um padrão de estilo (composição, estilo visual, luz, lente, textura, fundo de imagem), proponha em "estilos" os ajustes de parâmetros por marca, só com evidência e só dos campos que mudam. Esquema dos parâmetros:
${STYLE_SCHEMA}

# SAÍDA
Responda SOMENTE com JSON válido (sem texto antes ou depois, sem cercas de código). Dentro dos textos NÃO use aspas duplas retas (use aspas simples ou “ ”) e não quebre linha. Formato:
{"resumo":"2 a 3 frases sobre o que a equipe aprendeu","licoes":[{"agente":"roteirista|designer|editor|revisor|gerente|publicador|todos","marca":"","tipo":"regra|evitar|padrao","formato":"","texto":"...","evidencia":"...","reforca_id":null}],"arquivar":[],"alertas":["pontos que pedem a atenção do dono"],"estilos":[{"marca":"","params":{},"evidencia":""}]}`;
    let r = await callClaude({ agent: agentRow('chefe'), user, maxTokens: 3000 });
    let out;
    try { out = extrairJSON(r.text, '{'); }
    catch (e1) {
      if (MANUAL) throw new Error('Não consegui ler a resposta. Peça ao Claude: “Refaça somente o JSON válido, sem texto antes ou depois, sem cercas de código e sem aspas duplas retas dentro dos textos” e cole de novo.');
      const r2 = await callClaude({ agent: agentRow('chefe'), user: `${user}\n\n# SUA RESPOSTA ANTERIOR (inválida)\n${r.text.slice(0, 6000)}\n\n# CORREÇÃO\nRefaça somente o JSON válido.`, maxTokens: 3000 });
      r = { ...r2, tin: (r.tin || 0) + (r2.tin || 0), tout: (r.tout || 0) + (r2.tout || 0) };
      try { out = extrairJSON(r2.text, '{'); } catch { throw new Error('O Cérebro não devolveu um JSON válido nem na segunda tentativa.'); }
    }
    if (!out || typeof out !== 'object') throw new Error('Resposta do Cérebro em formato inesperado.');
    const auto = settings().brain_auto === '1';
    const cl = (t, n) => String(t ?? '').replace(/["“”]/g, "'").replace(/\s+/g, ' ').trim().slice(0, n);
    let novas = 0, reforcadas = 0, arquivadas = 0; const detalhe = [];
    for (const l of (Array.isArray(out.licoes) ? out.licoes : []).slice(0, 8)) {
      const texto = cl(l.texto, 240); if (texto.length < 12) continue;
      const ag0 = String(l.agente || '').toLowerCase().trim(), ag = ({ revisor: 'gerente', gerente: 'chefe' })[ag0] || ag0, agent = ids.has(ag) ? ag : (['todos', 'todas', '*'].includes(ag) ? '*' : null); if (!agent) continue;
      const tipo = ['regra', 'evitar', 'padrao'].includes(l.tipo) ? l.tipo : 'regra';
      const brand = brandNames.find(b => b.toLowerCase() === String(l.marca || '').trim().toLowerCase()) || '';
      const evid = cl(l.evidencia, 500), formato = FORMATOS_REGRA.includes(String(l.formato || '').toLowerCase()) ? String(l.formato).toLowerCase() : '';
      let alvo = l.reforca_id ? one('SELECT * FROM brain_rules WHERE id=?', +l.reforca_id) : null;
      if (alvo && alvo.status === 'arquivada') alvo = null;
      if (!alvo) {
        const parecida = all('SELECT * FROM brain_rules WHERE (agent=? OR agent=\'*\' OR ?=\'*\')', agent, agent).find(x => brainSim(x.text, texto) >= 0.55 && (x.formato || '') === formato && (x.brand || '') === brand);
        if (parecida) { if (parecida.status === 'arquivada') continue; alvo = parecida; }   // o dono arquivou de propósito: não volta
      }
      if (alvo) {
        run('UPDATE brain_rules SET weight=weight+1, evidence=?, updated_at=? WHERE id=?', cl((alvo.evidence ? alvo.evidence + ' • ' : '') + evid, 900), T(), alvo.id);
        reforcadas++; detalhe.push({ agente: alvo.agent, tipo: alvo.type, texto: alvo.text, acao: 'reforçada' });
      } else {
        const visual = ['designer', 'editor'].includes(agent), st = auto ? (visual ? 'teste' : 'ativa') : 'proposta';   // regra de arte/vídeo entra em teste antes de valer de vez
        run('INSERT INTO brain_rules(agent,brand,type,text,evidence,source,status,formato,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)', agent, brand, tipo, texto, evid, 'aprendizado', st, formato, T(), T());
        novas++; detalhe.push({ agente: agent, tipo, texto, acao: auto ? (visual ? 'nova (em teste por 2 peças)' : 'nova (ativa)') : 'nova (aguarda seu OK)' });
      }
    }
    for (const id of (Array.isArray(out.arquivar) ? out.arquivar : []).slice(0, 10)) {
      const x = one("SELECT * FROM brain_rules WHERE id=? AND status='ativa'", +id); if (!x) continue;
      if (auto) { run("UPDATE brain_rules SET status='arquivada', updated_at=? WHERE id=?", T(), x.id); arquivadas++; }
      else run("UPDATE brain_rules SET flag='arquivar?', updated_at=? WHERE id=?", T(), x.id);
      detalhe.push({ agente: x.agent, tipo: x.type, texto: x.text, acao: auto ? 'arquivada' : 'sugestão de arquivar' });
    }
    const alertas = (Array.isArray(out.alertas) ? out.alertas : []).map(a => cl(a, 300)).filter(Boolean).slice(0, 5);
    let estN = 0; for (const e of (Array.isArray(out.estilos) ? out.estilos : []).slice(0, 4)) { const mb = brandNames.find(b => b.toLowerCase() === String(e?.marca || '').toLowerCase()) || ''; try { estN += styleProposal(mb, e?.params, e?.evidencia, 'Cérebro', 'Sugestão do Cérebro a partir das artes') ; } catch { /* sugestão inválida */ } }
    const dg = run('INSERT INTO brain_digests(ts,day,body) VALUES(?,?,?)', T(), today(), JSON.stringify({ resumo: cl(out.resumo, 700), novas, reforcadas, arquivadas, alertas, eventos: events.length, metricas: mets.length, licoes: detalhe, estilos: estN }));
    if (events.length) run(`UPDATE brain_events SET digest_id=? WHERE id IN (${events.map(() => '?').join(',')})`, +dg.lastInsertRowid, ...events.map(e => e.id));
    if (mets.length) run("INSERT INTO settings(key,value) VALUES('brain_met_last',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", String(Math.max(...mets.map(m => m.id))));
    run("DELETE FROM brain_events WHERE digest_id IS NOT NULL AND ts < datetime('now','-120 days')");
    // regra que não ajudou: se depois dela o agente passou a ser reprovado bem mais, marca para você rever
    for (const r0 of all("SELECT * FROM brain_rules WHERE status='ativa' AND flag='' AND source<>'manual'")) {
      const im = ruleImpacto(r0); if (!im) continue; const ta = im.antes.ok + im.antes.bad, td = im.depois.ok + im.depois.bad;
      if (ta >= 4 && td >= 5 && im.depois.bad / td - im.antes.bad / ta >= 0.2) run("UPDATE brain_rules SET flag='arquivar?', updated_at=? WHERE id=?", T(), r0.id);
    }
    log('chefe', `Cérebro aprendeu: ${novas} regra(s) nova(s)${auto ? '' : ' aguardando seu OK'}, ${reforcadas} reforçada(s)${arquivadas ? ', ' + arquivadas + ' arquivada(s)' : ''}`);
    return r;
  },

  async relatorio() {
    const rows = all('SELECT * FROM metrics ORDER BY date DESC, id DESC LIMIT 80');
    if (!rows.length) throw new Error('Sem métricas cadastradas para analisar');
    const csv = rows.map(m => {
      const eng = m.views ? ((m.likes + m.comments + m.shares + m.saves) / m.views * 100).toFixed(2) + '%' : '-';
      const c = m.content_id ? getContent(m.content_id) : null;
      return [m.date, m.platform, m.post_title, c ? `${c.format}/${c.kind}` : '-', m.views, m.likes, m.comments, m.shares, m.saves, m.followers, eng].join(' | ');
    }).join('\n');
    const user = `# TAREFA\nAnalise o desempenho do conteúdo e produza um relatório objetivo em Markdown com as seções: ## RESUMO, ## O QUE FUNCIONOU, ## O QUE NÃO FUNCIONOU, ## PADRÕES (formato, tema, gancho, plataforma), ## RECOMENDAÇÕES PARA AS PRÓXIMAS PAUTAS (5 itens acionáveis). Seja honesto sobre amostra pequena.\n\n# MÉTRICAS (data | plataforma | título | formato/tipo | views | curtidas | comentários | compartilhamentos | salvamentos | seguidores ganhos | engajamento)\n${csv}`;
    const r = await callClaude({ agent: agentRow('chefe'), user, maxTokens: 3500 });
    run('INSERT INTO reports(ts,body) VALUES(?,?)', T(), r.text);
    log('chefe', 'Relatório de desempenho atualizado');
    return r;
  }
};

const futuro = ra => !!ra && ra > T();
const stageLabel = (k, ra) => futuro(ra) ? 'Agendado para ' + fmtQuando(ra) : (MANUAL ? 'Aguardando o chat · ' : '') + STAGE_LABEL[k];

// ───────────────────────── Modo chat (sem API) ─────────────────────────
const gerenciaDireta = c => !!c && c.kind === 'noticia' && c.art_status === 'ok' && /Direção de arte montada pelo painel|Arte montada no layout salvo/.test(String(c.art || ''));   // arte determinística de notícia: a revisão da entrega não precisa de IA nem de pedido no chat
async function jobPrompt(job) {
  const c = job.content_id ? getContent(job.content_id) : null;
  if (job.content_id && !c) throw fail(404, 'Conteúdo removido');
  return als.run({ dry: true, brand: jobBrand(job, c), scoped: !!c, ctx: ctxDe(c), fmt: fmtGrupo(c?.format) }, async () => {
    try { await HANDLERS[job.kind](job, c); } catch (e) { if (e instanceof DryRun) return e.prompt; throw e; }
    throw fail(409, 'Este pedido foi resolvido pelo próprio painel (a arte da notícia já seguiu para a sua aprovação). Ele sai da fila.');
  });
}
function composePrompt(p, withBase) {
  const parts = [`# PAPEL: ${p.agent.name.toUpperCase()}\n${p.sys || agentPrompt(p.agent)}`];
  if (withBase) {
    parts.push(`# BASE DE CONHECIMENTO (fonte de verdade)\n${p.core || '(Base vazia: use apenas o briefing e não invente fatos.)'}`);
    if (p.extra) parts.push(`# CONHECIMENTO RELEVANTE PARA ESTE PEDIDO\n${p.extra}`);
  }
  parts.push(p.user, '---\nResponda agora como esse papel, entregando somente o resultado pedido, no formato indicado, sem comentários extras antes ou depois.');
  return parts.join('\n\n');
}
async function submitManual(job, text) {
  const c = job.content_id ? getContent(job.content_id) : null;
  if (job.content_id && !c) throw fail(404, 'Conteúdo removido');
  dlog('manual', `resposta colada no pedido #${job.id} (${job.kind}${c ? ', conteúdo #' + c.id + ' "' + String(c.title || '').slice(0, 50) + '"' : ''}): ${text.length} caracteres`);
  const t0m = Date.now();
  run("UPDATE jobs SET status='running', started_at=?, day=?, attempts=attempts+1 WHERE id=?", T(), today(), job.id);
  try {
    await als.run({ text, brand: jobBrand(job, c), scoped: !!c, ctx: ctxDe(c), fmt: fmtGrupo(c?.format) }, () => HANDLERS[job.kind](job, c));
    run("UPDATE jobs SET status='done', finished_at=?, output=? WHERE id=?", T(), text.slice(0, 20000), job.id);
    dlog('manual', `pedido #${job.id} (${job.kind}) concluído em ${Date.now() - t0m} ms`);
    if (c && (job.kind === 'arte' || job.kind === 'video')) checkProduction(c.id);
  } catch (e) {
    console.error(`${new Date().toISOString()} [manual] ERRO no pedido #${job.id} (${job.kind}): ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`);
    run("UPDATE jobs SET status='queued', error=? WHERE id=?", e.message, job.id);
    changed(); throw fail(400, e.message);
  }
  changed();
}

function checkProduction(contentId) {
  const c = getContent(contentId);
  if (!c || c.status !== 'producing') return;
  const active = one("SELECT COUNT(*) n FROM jobs WHERE content_id=? AND status IN ('queued','running')", contentId).n;
  if (!active) {
    setContent(c.id, { error: '' });
    enqueue(c.id, 'gerente', 'gerencia');
    log('gerente', `Entrega de "${c.title}" pronta — entrou na revisão do Revisor`, c.id);
  }
}

let running = 0;
let limitWarnedDay = '';
function nextJob(onlyChat = false) {
  return one(`SELECT j.* FROM jobs j JOIN agents a ON a.id=j.agent
    WHERE j.status='queued' AND a.enabled=1 AND (j.run_after IS NULL OR j.run_after<=?) ${onlyChat ? "AND j.kind IN ('chat','teste')" : ''} ORDER BY (j.kind IN ('chat','teste')) DESC, j.id LIMIT 1`, T());
}
// modo chat: a arte de roteiro no modelo do dono é montada pelo painel na hora, sem pedido para colar (a revisão segue normal)
let localRodando = false;
async function pumpLocal() {
  if (localRodando || settings().arte_do_roteiro === 'nunca') return; localRodando = true;
  try {
    for (const g of all("SELECT * FROM jobs WHERE status='queued' AND kind='gerencia' AND (run_after IS NULL OR run_after<=?) ORDER BY id LIMIT 5", T())) {   // notícia montada pelo painel: vai direto para a aprovação, sem pedido no chat
      const cg = g.content_id && getContent(g.content_id); if (!gerenciaDireta(cg)) continue;
      run("UPDATE jobs SET status='running', started_at=?, day=?, attempts=attempts+1 WHERE id=?", T(), today(), g.id); changed(); await runJob(g);
    }
    const jobs = all("SELECT * FROM jobs WHERE status='queued' AND agent='designer' AND kind='arte' AND (run_after IS NULL OR run_after<=?) ORDER BY id LIMIT 5", T());
    for (const job of jobs) {
      const inp = jparse(job.input, {}) || {}; if (inp.feedback || inp.layout_id || /pelo roteiro/.test(job.error || '')) continue;   // ajuste pedido ou layout escolhido: precisa do Designer
      const c = job.content_id && getContent(job.content_id); if (!c || !c.script || !paginasDoRoteiro(c.script, c.format, c.brand)) continue;
      run("UPDATE jobs SET status='running', started_at=?, day=?, attempts=attempts+1 WHERE id=?", T(), today(), job.id); changed();
      try { const ok = await arteDoRoteiro(c.id, 'modo chat'); run("UPDATE jobs SET status=?, finished_at=?, output=?, error=? WHERE id=?", ok ? 'done' : 'queued', ok ? T() : null, ok ? 'Montada pelo painel a partir do roteiro' : '', ok ? '' : 'Não consegui montar pelo roteiro: o pedido segue para o chat', job.id); if (ok) checkProduction(c.id); }
      catch (e) { run("UPDATE jobs SET status='queued', error=? WHERE id=?", 'Montagem pelo roteiro falhou: ' + e.message + ' (o pedido segue para o chat)', job.id); }
      changed();
    }
  } finally { localRodando = false; }
}
// O Agente de Notícias não usa IA: no modo chat o próprio painel roda a busca (não fica esperando você levar ao chat)
let radarLocalRodando = false;
async function pumpRadarLocal() {
  if (radarLocalRodando) return; radarLocalRodando = true;
  try { for (const job of all("SELECT * FROM jobs WHERE status='queued' AND kind='radar' AND (run_after IS NULL OR run_after<=?) ORDER BY id LIMIT 3", T())) {
    run("UPDATE jobs SET status='running', started_at=?, day=?, attempts=attempts+1 WHERE id=?", T(), today(), job.id); changed(); await runJob(job); } }
  finally { radarLocalRodando = false; }
}
function pump() {
  if (!API_KEY) { pumpRadarLocal().catch(e => console.error('radar:', e.message)); pumpLocal().catch(e => console.error('arte pelo roteiro:', e.message)); return; }
  const s = settings();
  const day = today();
  const used = one("SELECT COUNT(*) n FROM jobs WHERE day=? AND kind NOT IN ('chat','teste')", day).n;
  const limitHit = used >= +s.max_jobs_day;
  if (limitHit) {
    if (limitWarnedDay !== day && one("SELECT COUNT(*) n FROM jobs WHERE status='queued'").n) {
      limitWarnedDay = day; log(null, `Limite diário de ${s.max_jobs_day} tarefas atingido — a fila retoma amanhã (ou aumente o limite em Configurações)`);
    }
  }
  while (running < Math.max(1, +s.concurrency || 1)) {
    const job = nextJob(limitHit);   // com o limite diário batido, só o chat e os testes do dono continuam
    if (!job) break;
    run("UPDATE jobs SET status='running', started_at=?, day=?, attempts=attempts+1 WHERE id=?", T(), day, job.id);
    running++; changed();
    runJob(job).finally(() => { running--; changed(); setImmediate(pump); });
  }
}

const jobBrand = (job, c) => c?.brand || (() => { try { return JSON.parse(job.input || '{}').brand || ''; } catch { return ''; } })();
async function runJob(job) {
  const c = job.content_id ? getContent(job.content_id) : null;
  try {
    if (job.content_id && !c) throw new Error('Conteúdo removido');
    const r = await als.run({ brand: jobBrand(job, c), scoped: !!c, ctx: ctxDe(c), fmt: fmtGrupo(c?.format) }, () => HANDLERS[job.kind](job, c));
    run("UPDATE jobs SET status='done', finished_at=?, output=?, tokens_in=?, tokens_out=? WHERE id=?",
      T(), (r?.text || '').slice(0, 20000), r?.tin || 0, r?.tout || 0, job.id);
    if (c && (job.kind === 'arte' || job.kind === 'video')) checkProduction(c.id);
  } catch (e) {
    const attempts = job.attempts + 1;
    console.error(`job ${job.id} (${job.kind}) falhou:`, e.message);
    if (attempts < 2) {
      run("UPDATE jobs SET status='queued', error=?, run_after=? WHERE id=?", e.message, new Date(Date.now() + 30000).toISOString(), job.id);
      log(job.agent, `Falha em "${c?.title || job.kind}": ${e.message} — nova tentativa em 30 s`, c?.id);
    } else {
      run("UPDATE jobs SET status='error', finished_at=?, error=? WHERE id=?", T(), e.message, job.id);
      if (job.kind === 'chat' || job.kind === 'teste') addChat('gerente', `Não consegui concluir ${job.kind === 'teste' ? 'o teste' : 'a resposta'}: ${e.message}`, { job: job.id });
      if (c) setContent(c.id, { status: 'blocked', error: `${STAGE_LABEL[job.kind] || job.kind}: ${e.message}` });
      log(job.agent, `Erro em "${c?.title || job.kind}": ${e.message}`, c?.id);
    }
  }
  changed();
}
setInterval(pump, 3000).unref();

function createContent(f, createdBy = 'manual', runAt = null) {
  if (!agenteLigado('roteirista')) throw fail(400, 'O Roteirista está desativado (Agentes). Ative-o para criar conteúdos.');
  const r = run('INSERT INTO contents(title,format,kind,platform,brief,goal,product_id,brand,status,estilo_video,estilo_arte,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    f.title, f.format, f.kind, f.platform || '', f.brief || '', f.goal || '', f.product_id || null, f.brand || '', 'producing', f.format === 'video_vertical' ? (f.estilo_video === 'auto' || estiloVideo(String(f.estilo_video || ''))?.id || 'auto') : '', ['carrossel', 'feed', 'stories'].includes(f.format) ? (f.estilo_arte || '') : '', createdBy, T(), T());
  const id = +r.lastInsertRowid;
  enqueue(id, 'roteirista', 'roteiro', {}, 'auto', runAt);
  if (runAt) log(null, `"${f.title}" agendado para ${fmtQuando(runAt)}`, id);
  else log(createdBy === 'autopilot' ? 'roteirista' : null, `Novo conteúdo na fila: "${f.title}"`, id);
  return id;
}

// Agendador do modo autônomo
function fmtQuando(iso) {
  try { return new Intl.DateTimeFormat('pt-BR', { timeZone: settings().tz || 'America/Rio_Branco', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(',', ' às'); } catch { return iso; }
}
let lastDue = '';
function schedulerTick() {
  const s = settings();
  // pedidos programados que acabaram de vencer: avisa a tela e (com API) puxa a fila
  const due = all("SELECT id FROM jobs WHERE status='queued' AND run_after IS NOT NULL AND run_after<=? AND run_after>?", T(), new Date(Date.now() - 120000).toISOString()).map(j => j.id).join(',');
  if (due && due !== lastDue) { lastDue = due; changed(); setImmediate(pump); }
  const { date, hour } = localParts(s.tz);
  if (s.autopilot === '1' && hour >= +s.start_hour) {
    // Produz até bater a meta do dia e para: sem meta pendente, nenhum pedido novo (e nenhum crédito gasto). Máx. 3 tentativas por dia.
    const q = quotaHoje();
    if (q.ativo && q.faltaTotal > 0 && !one("SELECT 1 x FROM jobs WHERE kind='pautas' AND status IN ('queued','running')")
      && one("SELECT COUNT(*) n FROM jobs WHERE kind='pautas' AND origin='auto' AND cday=?", date).n < 3) {
      enqueue(null, 'chefe', 'pautas', { auto: true, quota: q.falta });
    }
  }
  { const rc = radarCfg();   // Radar: uma busca por marca ativa, uma vez por dia, a partir da hora escolhida
    if (rc.auto && hour >= rc.hora && agenteLigado('radar')) for (const [b, m] of Object.entries(rc.marcas)) {
      if (!m.ativo || !radarEstiloDaMarca(b) || one("SELECT 1 x FROM jobs WHERE kind='radar' AND cday=? AND input LIKE ?", date, '%' + JSON.stringify({ brand: b }).slice(1, -1) + '%')) continue;
      radarEnfileira(b, 'auto'); } }
  if (s.brain_daily === '1' && hour >= +s.brain_hour && (brainPendingEvents() || brainNewMetrics().length)
    && !one("SELECT 1 x FROM jobs WHERE kind='cerebro' AND (cday=? OR status IN ('queued','running'))", date)) {
    enqueue(null, 'chefe', 'cerebro', {}, 'auto');
  }
  if (s.autopilot === '1' && hour >= +s.report_hour && one('SELECT COUNT(*) n FROM metrics').n
    && !one("SELECT 1 x FROM jobs WHERE kind='relatorio' AND origin='auto' AND cday=?", date)) {
    enqueue(null, 'chefe', 'relatorio');
  }
}
setInterval(schedulerTick, 30000).unref();
setTimeout(schedulerTick, 5000).unref();

// ───────────────────────── Autenticação ─────────────────────────
const sha = s => crypto.createHash('sha256').update(s).digest();
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
function makeSession(uid = 0) { const exp = String(Date.now() + 14 * 864e5), body = `${exp}.${uid}`; return `${body}.${sign(body)}`; }
// devolve o id do usuário da sessão (0 = dono, que entra com a senha do .env) ou null se a sessão não vale
function validSession(tok) {
  if (!tok) return null;
  const [exp, uid, sig] = tok.split('.');
  if (!exp || uid === undefined || !sig || +exp < Date.now() || !/^\d+$/.test(uid)) return null;
  const a = Buffer.from(sig), b = Buffer.from(sign(`${exp}.${uid}`));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? +uid : null;
}
db.exec("CREATE TABLE IF NOT EXISTS cortes_jobs(id INTEGER PRIMARY KEY AUTOINCREMENT, job_id TEXT, url TEXT, brand TEXT DEFAULT '', instrucoes TEXT DEFAULT '', formato TEXT DEFAULT '9:16', status TEXT DEFAULT 'queued', etapa TEXT DEFAULT '', progresso REAL, resumo TEXT DEFAULT '', erro TEXT DEFAULT '', created_at TEXT, updated_at TEXT)");
// ── Usuários e permissões
const AREAS = [['dashboard', 'Dashboard'], ['office', 'Escritório'], ['chefe', 'Gerente (chat)'], ['pipeline', 'Pipeline'], ['radar', 'Radar de notícias'], ['video', 'Estúdio de vídeo'], ['arte', 'Estúdio de arte'], ['media', 'Biblioteca (aba do Estúdio de vídeo)'], ['knowledge', 'Conhecimento'], ['brain', 'Cérebro'], ['products', 'Produtos'], ['agents', 'Agentes'], ['metrics', 'Métricas'], ['settings', 'Configurações']];
const AREA_IDS = AREAS.map(a => a[0]);
const PERM_PRESETS = {
  admin: Object.fromEntries(AREA_IDS.map(a => [a, 'editar'])),
  editor: { dashboard: 'ver', office: 'ver', pipeline: 'editar', video: 'editar', arte: 'editar', media: 'editar', knowledge: 'ver', products: 'editar', brain: 'ver', metrics: 'ver' },
  leitor: { dashboard: 'ver', office: 'ver', pipeline: 'ver', video: 'ver', arte: 'ver', media: 'ver', knowledge: 'ver', brain: 'ver', products: 'ver', metrics: 'ver' }
};
const AREA_RULES = [   // [rota, áreas que podem ler, áreas que podem escrever]
  [/^\/api\/gerente/, ['chefe'], ['chefe']],
  [/^\/api\/(contents|jobs)/, ['pipeline', 'dashboard', 'office', 'video', 'arte'], ['pipeline', 'video', 'dashboard']],
  [/^\/api\/video-tests?/, ['video'], ['video']],
  [/^\/api\/cortes/, ['video'], ['video']],
  [/^\/api\/radar/, ['radar', 'pipeline', 'dashboard'], ['radar']],
  [/^\/api\/video-studio/, ['video', 'pipeline'], ['video']],
  [/^\/api\/(art-studio|art-layouts|lixeira)/, ['arte', 'video', 'pipeline'], ['arte', 'video']],
  [/^\/api\/motion-styles/, ['video', 'pipeline', 'dashboard'], ['video']],
  [/^\/api\/biblioteca-central/, ['settings'], ['settings']],
  [/^\/api\/(arte-modelos|art-templates)/, ['arte', 'pipeline', 'video'], ['arte']],
  [/^\/api\/imagens/, ['media', 'video', 'arte', 'pipeline'], ['media', 'video', 'arte']],
  [/^\/api\/(assets|poses)/, ['media', 'video', 'knowledge', 'products', 'pipeline', 'agents', 'arte'], ['media', 'video', 'knowledge', 'products', 'arte']],
  [/^\/api\/manuais/, ['knowledge', 'agents', 'pipeline', 'brain', 'dashboard'], ['knowledge']],
  [/^\/api\/backup/, ['settings'], ['settings']],
  [/^\/api\/pacote/, ['knowledge', 'agents', 'settings'], ['agents', 'settings']],
  [/^\/api\/evolucao/, ['brain', 'dashboard', 'metrics'], ['brain']],
  [/^\/api\/knowledge/, ['knowledge', 'products', 'media', 'video', 'agents', 'arte'], ['knowledge']],   // os documentos da marca não vão para quem só vê o pipeline
  [/^\/api\/(brands|knowledge)/, ['knowledge', 'products', 'media', 'video', 'pipeline', 'dashboard', 'office', 'agents', 'arte'], ['knowledge']],
  [/^\/api\/products/, ['products', 'knowledge', 'pipeline', 'dashboard', 'video'], ['products', 'knowledge']],
  [/^\/api\/art-styles/, ['media', 'video', 'pipeline', 'brain', 'knowledge'], ['media', 'knowledge']],
  [/^\/api\/motivos/, ['pipeline', 'video', 'brain', 'dashboard'], []],
  [/^\/api\/brain/, ['brain'], ['brain']],
  [/^\/api\/agents/, ['agents'], ['agents']],
  [/^\/api\/(metrics|custos|analysis)/, ['metrics', 'dashboard'], ['metrics']],
  [/^\/api\/(settings|autopilot)/, ['settings', 'dashboard', 'office'], ['settings', 'dashboard']],
  [/^\/api\/motor/, AREA_IDS, ['video', 'settings']]
];
const cleanPerms = o => { const r = {}; for (const a of AREA_IDS) { const v = o && o[a]; if (v === 'ver' || v === 'editar') r[a] = v; } return r; };
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const pwOk = (u, pw) => { try { const a = Buffer.from(hashPw(pw, u.salt), 'hex'), b = Buffer.from(u.hash, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); } catch { return false; } };
const OWNER = { id: 0, name: 'Dono', username: '', admin: true, owner: true, perms: PERM_PRESETS.admin };
const userOf = row => row ? { id: row.id, name: row.name, username: row.username, admin: row.role === 'admin', owner: false, perms: row.role === 'admin' ? PERM_PRESETS.admin : cleanPerms(JSON.parse(row.perms || '{}')) } : null;
function podeRota(u, p, m) {
  if (u.admin) return true;
  if (/^\/api\/users/.test(p)) return false;
  if (['/api/state', '/api/stream', '/api/me', '/api/logout'].includes(p) || p === '/api/me/password') return true;
  const rule = AREA_RULES.find(r => r[0].test(p));
  if (!rule) return m === 'GET';
  const need = m === 'GET' ? rule[1] : rule[2];
  return need.some(a => m === 'GET' ? u.perms[a] : u.perms[a] === 'editar');
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
const attempts = new Map();
const clientIp = req => (TRUST_PROXY && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || '?';

// Lê uma página pública (página de vendas) e devolve o texto limpo
function ipPrivado(ip) {
  if (ip.includes(':')) return /^(::1|fc|fd|fe80)/i.test(ip) || ip === '::';
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
// ───────── BIBLIOTECA CENTRAL (white label) ─────────
// O painel é cliente da Biblioteca Central (servidor separado, em biblioteca-central/): com BIBLIOTECA_URL e BIBLIOTECA_CHAVE no .env,
// ele baixa e mantém atualizados arquivos de mídia, templates de arte, conhecimento dos agentes e estilos de vídeo. Sincroniza ao
// iniciar e a cada 6 horas (ou pelo botão). Licença suspensa ou vencida: para de atualizar e mantém o que já recebeu.
// O painel MATRIZ (com BIBLIOTECA_ADMIN = o ADMIN_TOKEN da Biblioteca) também publica: escolhe o que é seu e manda para todos.
db.exec("CREATE TABLE IF NOT EXISTS central_itens(chave TEXT PRIMARY KEY, tipo TEXT NOT NULL, rev INTEGER NOT NULL, ref TEXT DEFAULT '', titulo TEXT DEFAULT '', updated_at TEXT NOT NULL)");
for (const [t, col, def] of [['assets', 'central', "TEXT DEFAULT ''"], ['art_templates', 'central', "TEXT DEFAULT ''"]]) { try { if (!db.prepare(`PRAGMA table_info(${t})`).all().some(c => c.name === col)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${col} ${def}`); } catch (e) { console.error('central:', t, e.message); } }
const bibCfg = () => ({ url: String(process.env.BIBLIOTECA_URL || '').replace(/\/+$/, ''), chave: String(process.env.BIBLIOTECA_CHAVE || ''), admin: String(process.env.BIBLIOTECA_ADMIN || '') });
const bibStatus = () => jparse(one("SELECT value FROM settings WHERE key='biblioteca_status'")?.value, {}) || {};
const bibSalvaStatus = o => { run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'biblioteca_status', JSON.stringify({ ...bibStatus(), ...o })); changed(); };
let bibRodando = false;
async function bibFetch(p, opt = {}) {
  const { url, chave } = bibCfg(); if (!url || !chave) throw new Error('Biblioteca Central não configurada');
  const r = await fetch(url + p, { ...opt, headers: { Authorization: 'Bearer ' + chave, 'x-painel': BUILD, ...(opt.headers || {}) }, signal: AbortSignal.timeout(opt.timeout || 60000) });
  if (!r.ok) { let m = ''; try { m = (await r.json()).error; } catch { /* sem corpo */ } throw Object.assign(new Error(m || `Biblioteca respondeu ${r.status}`), { status: r.status }); }
  return r;
}
const KIND_CENTRAL = k => ASSET_KINDS.includes(k) ? k : k === 'objeto' || k === 'icone' ? 'foto' : 'outro';
async function bibAplica(it) {
  const ja = one('SELECT * FROM central_itens WHERE chave=?', it.chave);
  if (it.tipo === 'midia') {
    const ext = String(it.ext || '').toLowerCase(); if (!ASSET_MIME[ext]) throw new Error('tipo de arquivo não aceito: ' + ext);
    const buf = Buffer.from(await (await bibFetch('/api/v1/arquivo/' + it.sha, { timeout: 180000 })).arrayBuffer());
    if (crypto.createHash('sha256').update(buf).digest('hex') !== it.sha) throw new Error('arquivo chegou corrompido');
    let a = ja?.ref ? one('SELECT * FROM assets WHERE id=? AND central=?', +ja.ref, it.chave) : null;
    const kind = KIND_CENTRAL(it.meta?.kind), nota = String(it.meta?.nota || '').slice(0, 600), tags = ['biblioteca central', it.meta?.tags].filter(Boolean).join(', ').slice(0, 300);
    if (a) {
      if (a.ext !== ext) { try { fs.unlinkSync(path.join(ASSET_DIR, a.id + '.' + a.ext)); } catch { /* já removido */ } }
      try { fs.unlinkSync(path.join(ASSET_DIR, a.id + '.thumb.jpg')); } catch { /* sem miniatura */ }
      fs.writeFileSync(path.join(ASSET_DIR, a.id + '.' + ext), buf); run('UPDATE assets SET kind=?, tags=?, note=?, ext=?, size=?, filename=? WHERE id=?', kind, tags, nota, ext, buf.length, (a.name || 'arquivo') + '.' + ext, a.id);
    } else {
      let base = slugName(it.meta?.nome || it.titulo) || 'central', name = base, n = 2; while (one("SELECT id FROM assets WHERE brand='' AND name=?", name)) name = base + '-' + n++;
      const r = run("INSERT INTO assets(brand,name,kind,tags,note,colecao,filename,ext,size,created_at,central) VALUES('',?,?,?,?,?,?,?,?,?,?)", name, kind, tags, nota, colecaoDe(it.meta?.colecao || '', kind), name + '.' + ext, ext, buf.length, T(), it.chave);
      a = { id: +r.lastInsertRowid }; fs.writeFileSync(path.join(ASSET_DIR, a.id + '.' + ext), buf);
    }
    try { const pr = probeAsset(a.id, ext); run('UPDATE assets SET dur=?, w=?, h=? WHERE id=?', pr.dur, pr.w, pr.h, a.id); } catch { /* sem medidas */ }
    return String(a.id);
  }
  if (it.tipo === 'conhecimento') {
    const ag = agId(it.meta?.agente); if (!ag) throw new Error('agente desconhecido: ' + it.meta?.agente);
    const txt = String(it.conteudo || '').slice(0, 60000), titulo = String(it.titulo).slice(0, 160), modo = it.meta?.modo === 'auto' ? 'auto' : 'sempre';
    let d = ja?.ref ? one('SELECT * FROM agent_docs WHERE id=?', +ja.ref) : null;
    if (!d) d = one('SELECT * FROM agent_docs WHERE agent=? AND titulo=?', ag, titulo);
    if (d) { if (d.editado) run("UPDATE agent_docs SET original=?, origem='central', updated_at=? WHERE id=?", txt, T(), d.id); else run("UPDATE agent_docs SET conteudo=?, original=?, titulo=?, modo=?, origem='central', updated_at=? WHERE id=?", txt, txt, titulo, modo, T(), d.id); return String(d.id); }
    const r = run("INSERT INTO agent_docs(agent,titulo,conteudo,original,modo,ordem,origem,created_at,updated_at) VALUES(?,?,?,?,?,?,'central',?,?)", ag, titulo, txt, txt, modo, (one('SELECT MAX(ordem) m FROM agent_docs WHERE agent=?', ag)?.m || 0) + 1, T(), T());
    return String(r.lastInsertRowid);
  }
  if (it.tipo === 'template') {
    const j = jparse(it.conteudo, null); if (!j || !Array.isArray(j.seq) || !j.seq.length) throw new Error('template sem estrutura');
    const seq = j.seq.filter(x => MODELO_IDS.includes(x?.modelo)).map(x => ({ modelo: x.modelo, papel: x.papel, mascote: !!x.mascote || undefined, foto: !!x.foto || undefined, fundo: x.fundo === 'claro' ? 'claro' : undefined, repetir: !!x.repetir || undefined }));
    const fm = (Array.isArray(j.formatos) ? j.formatos : ['carrossel']).filter(f => ['feed', 'carrossel', 'stories'].includes(f));
    const vals = [String(j.nome || it.titulo).slice(0, 80), String(j.uso || '').slice(0, 400), j.nivel === 'robusto' ? 'robusto' : 'simples', JSON.stringify(fm.length ? fm : ['carrossel']), JSON.stringify(seq), JSON.stringify(j.exemplo || null)];
    const t0 = ja?.ref ? one('SELECT id FROM art_templates WHERE id=? AND central=?', +ja.ref, it.chave) : null;
    if (t0) { run('UPDATE art_templates SET nome=?, uso=?, nivel=?, formatos=?, seq=?, exemplo=? WHERE id=?', ...vals, t0.id); return String(t0.id); }
    const r = run('INSERT INTO art_templates(nome,uso,nivel,formatos,seq,exemplo,brand,created_at,central) VALUES(?,?,?,?,?,?,?,?,?)', ...vals, '', T(), it.chave); return String(r.lastInsertRowid);
  }
  if (it.tipo === 'estilo_video') {
    const j = jparse(it.conteudo, null); if (!j || !j.nome || !j.receita) throw new Error('estilo sem nome ou receita');
    const id = 'central-' + slugEstilo(it.chave.replace(/^estilo_video\//, '')).slice(0, 32), f = (v, n) => String(v || '').replace(/[<>]/g, '').trim().slice(0, n);
    const look = LOOKS_VALIDOS.includes(j.look) ? j.look : 'editorial';
    run("INSERT OR REPLACE INTO motion_styles(id,nome,resumo,melhor,ritmo,look,cor,accent,receita,exemplo,origem,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'central',?)", id, f(j.nome, 80), f(j.resumo, 300), f(j.melhor, 200), f(j.ritmo, 80), look, JSON.stringify(Array.isArray(j.cor) ? j.cor.slice(0, 4) : []), f(j.accent, 9), f(j.receita, 12000), j.exemplo ? JSON.stringify(j.exemplo).slice(0, 60000) : '', T());
    return id;
  }
  throw new Error('tipo desconhecido: ' + it.tipo);
}
function bibRemove(chave) {
  const c = one('SELECT * FROM central_itens WHERE chave=?', chave); if (!c) return;
  if (c.ref === 'proprio') { run('DELETE FROM central_itens WHERE chave=?', chave); return; }
  if (c.tipo === 'midia') { const a = one('SELECT * FROM assets WHERE id=? AND central=?', +c.ref, chave); if (a) { for (const f of [path.join(ASSET_DIR, a.id + '.' + a.ext), path.join(ASSET_DIR, a.id + '.thumb.jpg')]) { try { fs.unlinkSync(f); } catch { /* já removido */ } } run('DELETE FROM assets WHERE id=?', a.id); } }
  else if (c.tipo === 'conhecimento') run("DELETE FROM agent_docs WHERE id=? AND origem='central' AND editado=0", +c.ref);
  else if (c.tipo === 'template') run('DELETE FROM art_templates WHERE id=? AND central=?', +c.ref, chave);
  else if (c.tipo === 'estilo_video') run("DELETE FROM motion_styles WHERE id=? AND origem='central'", c.ref);
  run('DELETE FROM central_itens WHERE chave=?', chave);
}
async function bibSync(origem = 'auto') {
  const { url, chave } = bibCfg(); if (!url || !chave) return { ok: false, msg: 'Biblioteca Central não configurada (BIBLIOTECA_URL e BIBLIOTECA_CHAVE no .env).' };
  if (bibRodando) return { ok: false, msg: 'Já está atualizando.' };
  bibRodando = true; const ini = Date.now(), res = { novos: 0, atualizados: 0, removidos: 0, erros: [] };
  try {
    const man = await (await bibFetch('/api/v1/manifest')).json();
    // no painel matriz, o que saiu dele mesmo não volta como cópia (ele é a fonte)
    const proprios = bibCfg().admin ? new Set(Object.values(bibPublicaveis()).flat().map(x => x.chave)) : new Set();
    for (const it of man.itens || []) {
      const ja = one('SELECT rev, ref FROM central_itens WHERE chave=?', it.chave);
      if (ja && ja.rev >= it.rev) continue;
      if (proprios.has(it.chave) && !(ja && ja.ref !== 'proprio')) { run('INSERT OR REPLACE INTO central_itens(chave,tipo,rev,ref,titulo,updated_at) VALUES(?,?,?,?,?,?)', it.chave, it.tipo, it.rev, 'proprio', String(it.titulo).slice(0, 200), T()); continue; }
      try { const ref = await bibAplica(it); run('INSERT OR REPLACE INTO central_itens(chave,tipo,rev,ref,titulo,updated_at) VALUES(?,?,?,?,?,?)', it.chave, it.tipo, it.rev, ref, String(it.titulo).slice(0, 200), T()); ja ? res.atualizados++ : res.novos++; }
      catch (e) { res.erros.push(`${it.titulo}: ${e.message}`); }
    }
    const vale = new Set(man.todas || (man.itens || []).map(i => i.chave));
    for (const r of all('SELECT chave FROM central_itens')) if (!vale.has(r.chave)) { bibRemove(r.chave); res.removidos++; }
    bibSalvaStatus({ ultimo: T(), rev: man.rev, cliente: man.cliente, plano: man.plano, expira: man.expira, licenca: 'ativa', erro: res.erros.slice(0, 5).join(' | '), itens: one('SELECT COUNT(*) n FROM central_itens').n, duracao_ms: Date.now() - ini });
    if (res.novos || res.atualizados || res.removidos) log(null, `Biblioteca Central: ${res.novos} novo(s), ${res.atualizados} atualizado(s), ${res.removidos} retirado(s)${origem === 'manual' ? ' (atualização pedida por você)' : ''}`);
    if (res.novos + res.atualizados && res.erros.length === 0) { /* tudo certo */ }
    return { ok: true, ...res, rev: man.rev };
  } catch (e) {
    const lic = e.status === 401 || e.status === 403;
    bibSalvaStatus({ tentativa: T(), licenca: lic ? 'inativa' : bibStatus().licenca || '', erro: e.message });
    return { ok: false, msg: lic ? e.message + ' O que já foi baixado continua no painel.' : 'Não consegui falar com a Biblioteca Central: ' + e.message };
  } finally { bibRodando = false; }
}
setTimeout(() => { bibSync('inicio').catch(() => {}); setInterval(() => bibSync('auto').catch(() => {}), 6 * 3600e3); }, 15000);
// MATRIZ: o que este painel pode publicar (o que é seu, não o que veio da Central)
function bibPublicaveis() {
  return {
    midia: all("SELECT id,name,kind,ext,size,tags FROM assets WHERE brand='' AND COALESCE(central,'')='' AND kind NOT IN ('narracao','audio') ORDER BY kind, name").map(a => ({ id: a.id, titulo: a.name, detalhe: `${a.kind} · ${a.ext} · ${Math.round(a.size / 1024)} KB`, chave: 'midia/' + a.name })),
    conhecimento: all("SELECT id,agent,titulo,modo,origem FROM agent_docs WHERE origem<>'central' ORDER BY agent, ordem").map(d => ({ id: d.id, titulo: d.titulo, detalhe: `${agentRow(d.agent)?.name || d.agent} · ${d.modo === 'auto' ? 'quando o assunto pede' : 'sempre'}`, chave: `conhecimento/${d.agent}/${slugName(d.titulo)}` })),
    template: [...TEMPLATES_CASA.map(t => ({ id: 'casa:' + t.id, titulo: t.nome, detalhe: 'template da casa · ' + t.nivel, chave: 'template/' + t.id })), ...all("SELECT id,nome,nivel FROM art_templates WHERE COALESCE(central,'')='' ORDER BY id DESC").map(t => ({ id: String(t.id), titulo: t.nome, detalhe: 'seu template · ' + t.nivel, chave: 'template/' + slugName(t.nome) }))],
    estilo_video: all("SELECT id,nome,look FROM motion_styles WHERE origem<>'central' ORDER BY nome").map(e => ({ id: e.id, titulo: e.nome, detalhe: 'estilo ' + e.look, chave: 'estilo_video/' + e.id }))
  };
}
async function bibPublica(sel) {
  const { url, admin } = bibCfg(); if (!url || !admin) throw fail(400, 'Para publicar, coloque BIBLIOTECA_URL e BIBLIOTECA_ADMIN (o ADMIN_TOKEN da Biblioteca Central) no .env deste painel.');
  const itens = [];
  for (const s0 of (Array.isArray(sel) ? sel : []).slice(0, 300)) {
    const id = String(s0.id || '');
    if (s0.tipo === 'midia') { const a = one("SELECT * FROM assets WHERE id=? AND COALESCE(central,'')=''", +id); if (!a) continue; const f = path.join(ASSET_DIR, a.id + '.' + a.ext); if (!fs.existsSync(f)) continue; itens.push({ tipo: 'midia', chave: 'midia/' + a.name, titulo: a.name, ext: a.ext, meta: { kind: a.kind, tags: a.tags, nota: a.note, nome: a.name, colecao: a.colecao }, arquivo_b64: fs.readFileSync(f).toString('base64') }); }
    else if (s0.tipo === 'conhecimento') { const d = one('SELECT * FROM agent_docs WHERE id=?', +id); if (d) itens.push({ tipo: 'conhecimento', chave: `conhecimento/${d.agent}/${slugName(d.titulo)}`, titulo: d.titulo, meta: { agente: d.agent, modo: d.modo }, conteudo: d.conteudo }); }
    else if (s0.tipo === 'template') { const t = id.startsWith('casa:') ? TEMPLATES_CASA.find(x => x.id === id.slice(5)) : (() => { const r = one('SELECT * FROM art_templates WHERE id=?', +id); return r ? tplDono(r) : null; })(); if (t) itens.push({ tipo: 'template', chave: 'template/' + (id.startsWith('casa:') ? t.id : slugName(t.nome)), titulo: t.nome, meta: { nivel: t.nivel }, conteudo: JSON.stringify({ nome: t.nome, uso: t.uso, nivel: t.nivel, formatos: t.formatos, seq: t.seq }) }); }
    else if (s0.tipo === 'estilo_video') { const e = one('SELECT * FROM motion_styles WHERE id=?', id); if (e) itens.push({ tipo: 'estilo_video', chave: 'estilo_video/' + e.id, titulo: e.nome, meta: { look: e.look }, conteudo: JSON.stringify({ nome: e.nome, resumo: e.resumo, melhor: e.melhor, ritmo: e.ritmo, look: e.look, cor: jparse(e.cor, []), accent: e.accent, receita: e.receita, exemplo: jparse(e.exemplo, null) }) }); }
  }
  if (!itens.length) throw fail(400, 'Escolha ao menos um item para publicar');
  const r = await fetch(url + '/api/admin/importar', { method: 'POST', headers: { Authorization: 'Bearer ' + admin, 'content-type': 'application/json' }, body: JSON.stringify({ origem: 'Painel matriz', itens }), signal: AbortSignal.timeout(300000) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw fail(502, 'A Biblioteca Central recusou: ' + (j.error || r.status));
  log(null, `Publicou na Biblioteca Central: ${j.novos} novo(s), ${j.atualizados} atualizado(s)`);
  return j;
}
// ───────── Banco de imagens na internet (só bancos com uso comercial liberado) ─────────
// Pexels, Unsplash e Pixabay com chave no .env (PEXELS_API_KEY, UNSPLASH_ACCESS_KEY, PIXABAY_API_KEY); sem chave, Openverse
// (fotos com licença que permite uso comercial). A foto escolhida é baixada para a Biblioteca da marca com o crédito do autor.
const BANCOS = [
  { id: 'pexels', nome: 'Pexels', chave: 'PEXELS_API_KEY', async busca(q, pag, key) {
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=24&page=${pag}&locale=pt-BR`, { headers: { Authorization: key }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Pexels ' + r.status);
    return (await r.json()).photos.map(p => ({ id: 'pexels-' + p.id, thumb: p.src.medium, full: p.src.large2x || p.src.original, w: p.width, h: p.height, autor: p.photographer, link: p.url, licenca: 'Licença Pexels (uso comercial livre)', alt: p.alt || '' })); } },
  { id: 'unsplash', nome: 'Unsplash', chave: 'UNSPLASH_ACCESS_KEY', async busca(q, pag, key) {
    const r = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=24&page=${pag}`, { headers: { Authorization: 'Client-ID ' + key, 'Accept-Version': 'v1' }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Unsplash ' + r.status);
    return (await r.json()).results.map(p => ({ id: 'unsplash-' + p.id, thumb: p.urls.small, full: p.urls.regular.replace(/w=\d+/, 'w=2000'), w: p.width, h: p.height, autor: p.user?.name || '', link: p.links?.html || '', licenca: 'Licença Unsplash (uso comercial livre)', alt: p.alt_description || '', ping: p.links?.download_location })); } },
  { id: 'pixabay', nome: 'Pixabay', chave: 'PIXABAY_API_KEY', async busca(q, pag, key) {
    const r = await fetch(`https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&per_page=24&page=${pag}&lang=pt&safesearch=true`, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Pixabay ' + r.status);
    return (await r.json()).hits.map(p => ({ id: 'pixabay-' + p.id, thumb: p.webformatURL, full: p.largeImageURL, w: p.imageWidth, h: p.imageHeight, autor: p.user, link: p.pageURL, licenca: 'Licença Pixabay (uso comercial livre)', alt: p.tags || '' })); } },
  { id: 'openverse', nome: 'Openverse', chave: null, async busca(q, pag) {
    const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&license_type=commercial&page_size=24&page=${pag}&mature=false`, { headers: { 'user-agent': 'AgentesSIM/1.0' }, signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error('Openverse ' + r.status);
    return (await r.json()).results.filter(p => p.url && (p.width || 0) >= 800).map(p => ({ id: 'openverse-' + p.id, thumb: p.thumbnail || p.url, full: p.url, w: p.width, h: p.height, autor: p.creator || '', link: p.foreign_landing_url || '', licenca: `${String(p.license || '').toUpperCase()} ${p.license_version || ''}`.trim(), alt: p.title || '' })); } }
];
const thumbCache = new Map();
const bancosAtivos = () => BANCOS.filter(b => !b.chave || process.env[b.chave]);
const buscaCache = new Map();
async function buscaImagens(q, pag = 1, banco = '') {
  q = String(q || '').trim().slice(0, 120); if (q.length < 2) throw fail(400, 'Escreva o que procurar');
  const lista = bancosAtivos().filter(b => !banco || b.id === banco), k = q.toLowerCase() + '|' + pag + '|' + banco, ck = buscaCache.get(k);
  if (ck && Date.now() - ck.t < 600000) return ck.v;
  const out = [], erros = [];
  for (const b of lista) {
    if (b.id === 'openverse' && !banco && out.length >= 18) continue;   // com banco pago respondendo, o Openverse só completa
    try { const r = await b.busca(q, pag, b.chave ? process.env[b.chave] : ''); out.push(...r.map(x => ({ ...x, fonte: b.nome }))); } catch (e) { erros.push(`${b.nome}: ${e.message}`); }
  }
  const v = { itens: out.slice(0, 60), bancos: lista.map(b => b.nome), erros };
  buscaCache.set(k, { t: Date.now(), v }); if (buscaCache.size > 200) buscaCache.delete(buscaCache.keys().next().value);
  return v;
}
async function baixaImagemSegura(u, max = 20e6, referer = '') {
  let url; try { url = new URL(u); } catch { throw fail(400, 'Link de imagem inválido'); }
  let r;
  for (let hop = 0; hop < 5; hop++) {
    if (url.protocol !== 'https:') throw fail(400, 'Só imagens em https');
    let addr; try { addr = (await dns.promises.lookup(url.hostname)).address; } catch { throw fail(400, 'Não consegui encontrar o endereço da imagem'); }
    if (ipPrivado(addr)) throw fail(400, 'Endereço não permitido');
    r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(40000), headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', accept: 'image/avif,image/webp,image/*,*/*;q=0.8', ...(referer ? { referer } : {}) } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), url); continue; }
    break;
  }
  if (!r.ok) throw fail(502, `O banco de imagens respondeu ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer()), ct = (r.headers.get('content-type') || '').toLowerCase();
  const ext = buf[0] === 0x89 && buf[1] === 0x50 ? 'png' : buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP' ? 'webp' : (/png/.test(ct) ? 'png' : /webp/.test(ct) ? 'webp' : /jpe?g/.test(ct) ? 'jpg' : null);   // pelo conteúdo: muitos sites mandam application/octet-stream
  if (!ext) throw fail(400, 'O link não é uma imagem (png, jpg ou webp)'); if (buf.length > max) throw fail(413, 'Imagem grande demais'); if (buf.length < 2000) throw fail(400, 'Imagem vazia');
  return { buf, ext };
}
// baixa a foto escolhida (opcional: recorta o fundo pelo fal.ai) e guarda na Biblioteca da marca com o crédito
async function importaImagem({ url: u, brand, nome, recorte = false, credito = '', ping = '', kind = 'foto', ref = '' }) {
  let { buf, ext } = await baixaImagemSegura(u);
  if (recorte) {
    if (!falKey()) throw fail(400, falMsg('Para recortar o fundo é preciso a FAL_KEY no .env'));
    const c = await falPost(process.env.FAL_BG_MODEL || 'fal-ai/birefnet/v2', { image_url: u }, 120000); const cu = c.image?.url || c.images?.[0]?.url; if (!cu) throw fail(502, 'O recorte não voltou');
    buf = await falBaixar(cu); ext = 'png'; addCost('recorte', 'birefnet', FAL_PRECO.recorte, ref || 'banco');
  }
  if (ping && /^https:\/\/api\.unsplash\.com\//.test(ping) && process.env.UNSPLASH_ACCESS_KEY) fetch(ping, { headers: { Authorization: 'Client-ID ' + process.env.UNSPLASH_ACCESS_KEY } }).catch(() => {});   // regra do Unsplash: avisar o download
  const b = (() => { const t = String(brand ?? '').trim().slice(0, 80); if (!t) return ''; run('INSERT OR IGNORE INTO brands(name,created_at) VALUES(?,?)', t, T()); return one('SELECT name FROM brands WHERE name=?', t)?.name || t; })(); let base = slugName(nome) || 'foto-banco', name = base, n = 2;
  while (one('SELECT id FROM assets WHERE brand=? AND name=?', b, name)) name = base + '-' + n++;
  const k = ASSET_KINDS.includes(kind) ? kind : 'foto';
  const r = run('INSERT INTO assets(brand,name,kind,tags,note,colecao,filename,ext,size,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', b, name, k, 'banco de imagens' + (recorte ? ', recorte' : ''), String(credito || '').slice(0, 600), colecaoDe('', k), name + '.' + ext, ext, buf.length, T());
  const id = +r.lastInsertRowid; fs.writeFileSync(path.join(ASSET_DIR, id + '.' + ext), buf);
  const pr = probeAsset(id, ext); run('UPDATE assets SET dur=?, w=?, h=? WHERE id=?', pr.dur, pr.w, pr.h, id); changed();
  return { id, name, kind: k, brand: b };
}
// Banco de elementos 3D (Fluent Emoji 3D da Microsoft, licença MIT): um arquivo só (pack.bin) + índice; cada peça vira imagem da marca só quando é usada
let _b3d = null;
function banco3d() {
  if (_b3d) return _b3d;
  try { const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'banco3d', 'index.json'), 'utf8')); _b3d = { cats: j.cats, items: j.items.map((r, i) => [r, i]).sort((a, b) => (j.cats.indexOf(a[0][3]) - j.cats.indexOf(b[0][3])) || (a[1] - b[1])).map(x => x[0]), byId: new Map(j.items.map(r => [r[0], r])) }; }
  catch { _b3d = { cats: [], items: [], byId: new Map() }; }
  return _b3d;
}
function banco3dBytes(id) {
  const r = banco3d().byId.get(id); if (!r) return null;
  const fd = fs.openSync(path.join(__dirname, 'banco3d', 'pack.bin'), 'r');
  try { const buf = Buffer.alloc(r[5]); fs.readSync(fd, buf, 0, r[5], r[4]); return buf; } finally { fs.closeSync(fd); }
}
function usaBanco3d(id, brand) {
  const r = banco3d().byId.get(String(id || '')); if (!r) throw fail(404, 'Elemento 3D não encontrado');
  const b = (() => { const t = String(brand ?? '').trim().slice(0, 80); if (!t) return ''; run('INSERT OR IGNORE INTO brands(name,created_at) VALUES(?,?)', t, T()); return one('SELECT name FROM brands WHERE name=?', t)?.name || t; })();
  const name = slugName('3d-' + r[0]), ja = one('SELECT * FROM assets WHERE brand=? AND name=?', b, name);
  if (ja) return { id: ja.id, name: ja.name, kind: ja.kind, brand: b, ext: ja.ext };
  const buf = banco3dBytes(r[0]); if (!buf) throw fail(500, 'Banco 3D incompleto: falta o arquivo pack.bin');
  const k = 'outro', ins = run('INSERT INTO assets(brand,name,kind,tags,note,colecao,filename,ext,size,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', b, name, k, '3d, banco 3d, ' + r[1].toLowerCase(), 'Fluent Emoji 3D (Microsoft, licença MIT): ' + r[1], '', name + '.webp', 'webp', buf.length, T());
  const id2 = +ins.lastInsertRowid; fs.writeFileSync(path.join(ASSET_DIR, id2 + '.webp'), buf);
  const pr = probeAsset(id2, 'webp'); run('UPDATE assets SET dur=?, w=?, h=? WHERE id=?', pr.dur, pr.w, pr.h, id2); changed();
  return { id: id2, name, kind: k, brand: b, ext: 'webp' };
}
// "Remover fundo" no editor: recorta o assunto da imagem (BiRefNet no fal.ai) e guarda como NOVA imagem da marca; a original fica intacta
async function removeFundoAsset(brand, nome) {
  if (!falKey()) throw fail(400, falMsg('Para remover o fundo é preciso a FAL_KEY no arquivo .env (recorte por IA, cerca de US$ 0,003 por imagem).'));
  const a = one('SELECT * FROM assets WHERE name=? AND brand=? COLLATE NOCASE', slugName(nome), String(brand || '')) || one('SELECT * FROM assets WHERE name=? COLLATE NOCASE', slugName(nome));
  if (!a) throw fail(404, 'Imagem não encontrada na biblioteca');
  if (!['png', 'jpg', 'jpeg', 'webp'].includes(a.ext)) throw fail(400, 'Só dá para remover o fundo de PNG, JPG ou WebP');
  if (a.ext === 'png' && /sem-fundo/.test(a.name)) throw fail(400, 'Essa imagem já está sem fundo');
  const f = path.join(ASSET_DIR, a.id + '.' + a.ext); if (!fs.existsSync(f)) throw fail(404, 'Arquivo da imagem não encontrado');
  const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[a.ext];
  const c = await falPost(process.env.FAL_BG_MODEL || 'fal-ai/birefnet/v2', { image_url: `data:${mime};base64,${fs.readFileSync(f).toString('base64')}` }, 120000);
  const cu = c.image?.url || c.images?.[0]?.url; if (!cu) throw fail(502, 'O recorte não voltou');
  const buf = await falBaixar(cu); addCost('recorte', 'birefnet', FAL_PRECO.recorte, 'editor');
  const b = a.brand || ''; const base = slugName(a.name.replace(/-sem-fundo(-\d+)?$/, '') + '-sem-fundo'); let name = base, n = 2;
  while (one('SELECT id FROM assets WHERE brand=? AND name=?', b, name)) name = base + '-' + n++;
  const k = ASSET_KINDS.includes(a.kind) ? a.kind : 'foto';
  const r = run('INSERT INTO assets(brand,name,kind,tags,note,colecao,filename,ext,size,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', b, name, k, 'recorte, sem fundo', 'Fundo removido de ' + a.name, a.colecao || colecaoDe('', k), name + '.png', 'png', buf.length, T());
  const id = +r.lastInsertRowid; fs.writeFileSync(path.join(ASSET_DIR, id + '.png'), buf);
  const pr = probeAsset(id, 'png'); run('UPDATE assets SET dur=?, w=?, h=? WHERE id=?', pr.dur, pr.w, pr.h, id); changed();
  return { id, name, kind: k, brand: b, ext: 'png' };
}
// foto de banco para a arte (o Designer pede "banco: termo"): primeira foto boa da busca, recortada quando é personagem/objeto; guardada em cache
async function fotoBanco(termo, recorte, creditos) {
  const dir = path.join(RENDER_DIR, '_banco'); fs.mkdirSync(dir, { recursive: true });
  const base = path.join(dir, crypto.createHash('sha1').update(termo.toLowerCase() + '|' + recorte).digest('hex').slice(0, 14));
  for (const e of ['png', 'jpg', 'webp']) if (fs.existsSync(base + '.' + e)) { try { const cr = fs.readFileSync(base + '.txt', 'utf8'); if (cr) creditos?.add(cr); } catch { /* sem crédito */ } return base + '.' + e; }
  const r = await buscaImagens(termo, 1); const it = r.itens.find(x => (x.w || 0) >= 900 && (x.h || 0) >= 600) || r.itens[0]; if (!it) throw new Error('nenhum resultado');
  let buf, ext;
  if (recorte) { if (!falKey()) throw new Error(falMsg('recorte precisa da FAL_KEY')); const c = await falPost(process.env.FAL_BG_MODEL || 'fal-ai/birefnet/v2', { image_url: it.full }, 120000); const cu = c.image?.url || c.images?.[0]?.url; if (!cu) throw new Error('sem recorte'); buf = await falBaixar(cu); ext = 'png'; addCost('recorte', 'birefnet', FAL_PRECO.recorte, 'banco'); }
  else ({ buf, ext } = await baixaImagemSegura(it.full));
  const cr = `${it.autor || 'autor'} (${it.fonte}${it.licenca ? ', ' + it.licenca : ''})`; fs.writeFileSync(base + '.' + ext, buf); fs.writeFileSync(base + '.txt', cr); creditos?.add(cr);
  if (it.ping && process.env.UNSPLASH_ACCESS_KEY) fetch(it.ping, { headers: { Authorization: 'Client-ID ' + process.env.UNSPLASH_ACCESS_KEY } }).catch(() => {});
  return base + '.' + ext;
}
async function lerPagina(u) {
  let url; try { url = new URL(u); } catch { throw fail(400, 'Link inválido'); }
  let r;
  for (let hop = 0; hop < 4; hop++) {
    if (!/^https?:$/.test(url.protocol)) throw fail(400, 'Use um link http:// ou https://');
    let addr; try { addr = (await dns.promises.lookup(url.hostname)).address; } catch { throw fail(400, 'Não consegui encontrar esse endereço'); }
    if (ipPrivado(addr)) throw fail(400, 'Esse endereço não é permitido');
    try { r = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0 (compatible; GrupoSIM/1.0)', accept: 'text/html,*/*;q=0.8', 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.5' } }); }
    catch { throw fail(502, 'Não consegui abrir a página (sem resposta ou bloqueada). Cole o texto dela manualmente.'); }
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { url = new URL(r.headers.get('location'), url); continue; }
    break;
  }
  if (!r.ok) throw fail(502, `A página respondeu ${r.status}. Cole o texto dela manualmente.`);
  const html = (await r.text()).slice(0, 1500000);
  const pick = re => (html.match(re) || [])[1] || '';
  const dec = t => t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
  const title = dec(pick(/<title[^>]*>([\s\S]*?)<\/title>/i)).trim();
  const desc = dec(pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)).trim();
  let body = html.replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|section|tr|ul|ol)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  body = dec(body).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, 14000);
  const text = [title && 'Título da página: ' + title, desc && 'Descrição: ' + desc, body].filter(Boolean).join('\n\n');
  return { title, text, chars: text.length, aviso: body.length < 600 ? 'A página trouxe pouco texto (provavelmente é carregada por JavaScript ou um vídeo). Cole o texto da página ou da VSL manualmente.' : '' };
}

// ───────────────────────── HTTP ─────────────────────────
function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'content-type': typeof data === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(body);
}
const fail = (status, message) => Object.assign(new Error(message), { status });

function readBody(req, limit = 3e6) {
  return new Promise((ok, no) => {
    let n = 0; const ch = [];
    req.on('data', c => { n += c.length; if (n > limit) { no(fail(413, 'Conteúdo grande demais')); req.destroy(); return; } ch.push(c); });
    req.on('end', () => { try { ok(ch.length ? JSON.parse(Buffer.concat(ch).toString('utf8')) : {}); } catch { no(fail(400, 'JSON inválido')); } });
    req.on('error', no);
  });
}

const str = (v, max, name, required = true) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) throw fail(400, `${name} é obrigatório`);
  if (s.length > max) throw fail(400, `${name} passou de ${max} caracteres`);
  return s;
};
const int = v => Math.max(0, Math.min(1e12, Math.floor(Number(v) || 0)));

function contentLight(c, active) {
  const { script, art, video, review, pack, brief: b, spec, art_spec, ...rest } = c;
  const act = active.filter(j => j.content_id === c.id);
  return { ...rest, has_script: !!script, has_art: !!art, has_video: !!video, has_spec: !!spec, has_arte: c.art_status === 'ok', stage: act.length ? act.map(j => ({ agent: j.agent, kind: j.kind, label: stageLabel(j.kind, j.run_after), run_after: futuro(j.run_after) ? j.run_after : null, status: j.status })) : [] };
}

function brandColors() {
  const out = {};
  for (const r of all("SELECT brand,content FROM knowledge WHERE brand<>'' AND category='marca' AND content LIKE '# IDENTIDADE VISUAL%'")) {
    const txt = String(r.content || ''), li = txt.split('\n').find(l => /^Principais:/i.test(l)) || '';
    const m = li.match(/#[0-9a-fA-F]{6}\b/) || txt.match(/#[0-9a-fA-F]{6}\b/);
    if (m && !out[r.brand]) out[r.brand] = m[0].toUpperCase();
  }
  return out;
}
function stateSnapshot() {
  const s = settings();
  const active = all("SELECT content_id,agent,kind,status,run_after FROM jobs WHERE status IN ('queued','running')");
  const runningJobs = all("SELECT j.id,j.agent,j.kind,j.started_at,j.content_id,c.title FROM jobs j LEFT JOIN contents c ON c.id=j.content_id WHERE j.status='running'");
  const stats = Object.fromEntries(all("SELECT agent, COUNT(*) n, SUM(tokens_in) ti, SUM(tokens_out) tout FROM jobs WHERE status='done' GROUP BY agent").map(r => [r.agent, r]));
  const agents = all('SELECT id,name,nick,role,color,model,enabled FROM agents').map(({ nick, ...a }) => {
    a = { ...a, base: a.name, name: nick || a.name, nick: nick || '' };
    const cur = runningJobs.find(j => j.agent === a.id);
    return { ...a, working: !!cur, current: cur ? { label: STAGE_LABEL[cur.kind], title: cur.title, since: cur.started_at, content_id: cur.content_id } : null, queued: active.filter(j => j.agent === a.id && j.status === 'queued').length, done: stats[a.id]?.n || 0, tokens: (stats[a.id]?.ti || 0) + (stats[a.id]?.tout || 0) };
  });
  const contents = all('SELECT * FROM contents WHERE teste=0 ORDER BY updated_at DESC LIMIT 300').map(c => contentLight(c, active));
  const counts = Object.fromEntries(all('SELECT status, COUNT(*) n FROM contents WHERE teste=0 GROUP BY status').map(r => [r.status, r.n]));
  const avg = one('SELECT AVG(score) a FROM contents WHERE score IS NOT NULL').a;
  return {
    api: { configured: true, provider: MANUAL ? 'manual' : 'api', model: s.model },
    waiting: MANUAL ? all("SELECT j.id,j.agent,j.kind,j.content_id,j.error,j.created_at,c.title,c.teste FROM jobs j LEFT JOIN contents c ON c.id=j.content_id WHERE j.status='queued' AND (j.run_after IS NULL OR j.run_after<=?) ORDER BY j.id LIMIT 60", T()).map(w => ({ ...w, label: STAGE_LABEL[w.kind] })) : [],
    scheduled: all("SELECT j.id,j.agent,j.kind,j.content_id,j.run_after,c.title FROM jobs j LEFT JOIN contents c ON c.id=j.content_id WHERE j.status='queued' AND j.run_after>? ORDER BY j.run_after LIMIT 40", T()).map(w => ({ ...w, label: STAGE_LABEL[w.kind] })),
    build: BUILD, brandColors: brandColors(), settings: s, agents, contents, counts, avgScore: avg, brainRules: one("SELECT COUNT(*) n FROM brain_rules WHERE status='ativa'").n, brainProps: one("SELECT COUNT(*) n FROM brain_rules WHERE status='proposta'").n, brainBase: one('SELECT COUNT(*) n FROM brain_base').n, brainProposals: one("SELECT COUNT(*) n FROM brain_rules WHERE status='proposta'").n,
    jobsToday: one('SELECT COUNT(*) n FROM jobs WHERE day=?', today()).n, quota: quotaHoje(), imgHoje: gastoImagensHoje(),
    activity: all('SELECT * FROM activity ORDER BY id DESC LIMIT 80'),
    now: T(), saude: saude()
  };
}

// Saúde do sistema: o que está travado, falhando ou parado, em linguagem simples (tela e Gerente leem a mesma coisa)
function saude() {
  const L = [], add = (nivel, titulo, detalhe, ir = '') => L.push({ nivel, titulo, detalhe, ir }), s = settings();
  try {
    if (MANUAL) add('info', 'Modo chat (sem chave de API)', 'Cada etapa vira um pedido para você levar ao chat. O Cérebro aprende, mas o aprendizado automático e o Gerente completo só funcionam com a chave da API.', 'settings');
    const err = all("SELECT kind,agent,error,finished_at FROM jobs WHERE status='error' AND finished_at > datetime('now','-24 hours') ORDER BY id DESC");
    if (err.length) add('bad', `${err.length} tarefa(s) falharam nas últimas 24 h`, `Última: ${clip(err[0].error, 160)} (${err[0].kind})`, 'pipeline');
    const trav = all("SELECT COUNT(*) n FROM jobs WHERE status='running' AND started_at < datetime('now','-15 minutes')")[0].n;
    if (trav) add('warn', `${trav} tarefa(s) rodando há mais de 15 min`, 'Pode ser uma peça pesada ou uma chamada travada. Se não andar, reprocesse a peça.', 'pipeline');
    const bloq = one("SELECT COUNT(*) n FROM contents WHERE status='blocked' AND teste=0").n;
    if (bloq) add('warn', `${bloq} peça(s) bloqueada(s) esperando você`, 'Abra a peça para ver o motivo e reprocessar ou decidir.', 'pipeline');
    const fila = one("SELECT COUNT(*) n FROM jobs WHERE status='queued' AND (run_after IS NULL OR run_after<=?)", T()).n;
    if (!MANUAL && fila > 10) add('warn', `Fila grande: ${fila} tarefas esperando`, 'Aumente a simultaneidade em Configurações se a sua chave da API aguenta.', 'settings');
    const usadas = one("SELECT COUNT(*) n FROM jobs WHERE day=? AND kind NOT IN ('chat','teste')", today()).n;
    if (!MANUAL && usadas >= +s.max_jobs_day) add('warn', 'Limite diário de tarefas atingido', `${usadas}/${s.max_jobs_day}: o resto fica para amanhã (ou aumente o limite em Configurações).`, 'settings');
    const off = all('SELECT name FROM agents WHERE enabled=0').map(a => a.name);
    if (off.length) add('warn', `Agentes desligados: ${off.join(', ')}`, 'Enquanto estiverem desligados, essa etapa do fluxo não roda.', 'agents');
    const prop = one("SELECT COUNT(*) n FROM brain_rules WHERE status='proposta'").n;
    if (prop) add('info', `${prop} lição(ões) do Cérebro esperando o seu OK`, 'Só depois de aprovadas os agentes passam a seguir.', 'brain');
    const pend = brainPendingEvents(), ult = one('SELECT ts FROM brain_digests ORDER BY id DESC LIMIT 1')?.ts;
    if (pend >= 8 && s.brain_daily !== '1') add('warn', `${pend} sinais sem aprender e o aprendizado automático está desligado`, 'Ligue em Cérebro, Ajustes, ou use Aprender agora.', 'brain');
    else if (pend >= 8 && ult && Date.now() - new Date(ult).getTime() > 36 * 36e5) add('warn', 'O Cérebro não aprende há mais de 36 h', `${pend} sinais esperando.`, 'brain');
    const sem = all("SELECT a.name FROM agents a WHERE a.enabled=1 AND (SELECT COUNT(*) FROM jobs j WHERE j.agent=a.id AND j.status='done' AND j.kind NOT IN ('chat','teste','cerebro','pautas','relatorio'))>=3 AND (SELECT COUNT(*) FROM brain_events e WHERE e.agent=a.id)=0").map(a => a.name);
    if (sem.length) add('info', `Sem sinais de aprendizado: ${sem.join(', ')}`, 'Esses agentes já trabalharam, mas ainda não receberam aprovação, devolução ou resultado de post. Aprove, peça ajustes ou cadastre métricas.', 'brain');
    if (!one('SELECT COUNT(*) n FROM brands').n) add('info', 'Nenhuma marca cadastrada', 'Cadastre ao menos uma marca na Base de conhecimento para os agentes seguirem tom, cores e logo.', 'knowledge');
  } catch (e) { add('warn', 'Não consegui checar a saúde do sistema', e.message); }
  const ord = { bad: 0, warn: 1, info: 2 }; return L.sort((a, b) => ord[a.nivel] - ord[b.nivel]);
}

// Valida e grava configurações (usado pela tela e pelo Gerente)
function applySettings(b) {
  const rules = {
    model: v => str(v, 80, 'Modelo'), copy_review: v => (v ? '1' : '0'), autopilot: v => (v ? '1' : '0'), web_search: v => (v ? '1' : '0'), auto_produce: v => (v ? '1' : '0'), approve_script: v => (v ? '1' : '0'), pacote_ia: v => (v ? '1' : '0'), auto_render: v => (v ? '1' : '0'), visual_check: v => (v ? '1' : '0'), max_gen_objects: v => String(Math.min(12, int(v))), voz_provider: v => (['auto', 'elevenlabs', 'murf', 'nenhuma'].includes(v) ? v : 'auto'), img_qualidade: v => (['rapida', 'alta', 'maxima', 'env'].includes(v) ? v : 'alta'), brain_auto: v => (v ? '1' : '0'), brain_daily: v => (v ? '1' : '0'), night_hour: v => String(Math.min(23, int(v))), art_gen: v => (v ? '1' : '0'), fal_pausa: v => (v ? '1' : '0'), max_art_gen: v => String(Math.min(12, int(v))), max_pose_gen: v => String(Math.min(8, int(v))), brain_hour: v => String(Math.min(23, int(v))),
    per_day: v => String(Math.max(1, Math.min(10, int(v)))),
    q_feed: v => String(Math.min(20, int(v))), q_carrossel: v => String(Math.min(20, int(v))), q_stories: v => String(Math.min(20, int(v))), q_video_vertical: v => String(Math.min(20, int(v))), q_video_horizontal: v => String(Math.min(20, int(v))),
    quota_days: v => [...new Set(String(v).split(',').map(x => x.trim()).filter(x => /^[0-6]$/.test(x)))].sort().join(','),
    arte_do_roteiro: v => ['chat', 'sempre', 'nunca'].includes(String(v)) ? String(v) : 'chat',
    carousel_slides: v => String(Math.max(3, Math.min(10, int(v)))), stories_slides: v => String(Math.max(1, Math.min(7, int(v)))), video_secs: v => String(Math.max(10, Math.min(120, int(v)))),
    img_budget_day: v => String(Math.max(0, Math.min(500, Number(v) || 0))), start_hour: v => String(Math.min(23, int(v))), report_hour: v => String(Math.min(23, int(v))),
    score_min: v => String(Math.max(0, Math.min(10, Number(v) || 7.5))), max_revisions: v => String(Math.min(5, int(v))),
    max_jobs_day: v => String(Math.max(1, Math.min(2000, int(v)))), concurrency: v => String(Math.max(1, Math.min(4, int(v)))),
    kb_budget: v => String(Math.max(5000, Math.min(300000, int(v)))), themes: v => str(v, 4000, 'Temas', false),
    webhook_url: v => { const s = str(v, 500, 'Webhook', false); if (s && !/^https?:\/\//i.test(s)) throw fail(400, 'O webhook precisa começar com http:// ou https://'); return s; },
    tz: v => { const s = str(v, 60, 'Fuso'); try { new Intl.DateTimeFormat('en', { timeZone: s }); } catch { throw fail(400, 'Fuso horário inválido'); } return s; }
  };
  const clean = Object.entries(b).filter(([k]) => rules[k]).map(([k, v]) => [k, rules[k](v)]); // valida tudo antes de gravar
  for (const [k, v] of clean) run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, v);
  changed(); setImmediate(pump); setImmediate(schedulerTick);
  return Object.keys(b);
}

// Ações do dono sobre uma peça (usadas pela tela e pelo Gerente)
function contentAct(id, act, b = {}) {
  const c = getContent(id);
  if (!c) throw fail(404, 'Conteúdo não encontrado');
  const jaProduzida = isVideo(c.format) ? !!c.video : !!c.art;
  if (act === 'approve' && c.status === 'blocked' && c.script && !jaProduzida && producaoDe(c).length) return contentAct(id, 'approve_script', b);   // roteiro travado na revisão: aprovar LIBERA a produção (antes marcava como pronto sem gerar o vídeo)
  if (act === 'approve') {
    if (!['awaiting_approval', 'blocked'].includes(c.status) || !c.script) throw fail(400, 'Este conteúdo não pode ser aprovado agora');
    if (c.art && !isVideo(c.format) && c.art_status !== 'ok' && !b.forcar) throw fail(409, 'A imagem desta peça ainda não foi gerada' + (c.art_status === 'sem_spec' ? ' (o Designer não entregou a especificação visual)' : '') + '. Gere a arte antes de aprovar, ou aprove assim mesmo confirmando.');
    setContent(id, { status: 'approved', error: '' });
    log(null, `Você aprovou "${c.title}"`, id); try { aprendePedidos(id); } catch (e) { console.error('aprendePedidos:', e.message); }
    { let mg = null; try { mg = c.manager ? JSON.parse(c.manager) : null; } catch { /* sem revisão */ }
      const nt = c.score != null ? Number(c.score).toFixed(1) : '-', forte = mg?.pontos_fortes?.length ? 'Pontos fortes apontados pelo Revisor: ' + mg.pontos_fortes.join(' | ') : '';
      brainEvent('roteirista', 'aprovado_dono', c, `Você aprovou a peça final (nota ${nt}, ${c.format}/${c.kind})`, forte);
      if (c.art) { if (c.art_spec && c.art_spec_base && c.art_spec_base !== c.art_spec) { try { arteAprende(getContent(id)); } catch (e) { console.error('aprendizado da edição:', e.message); } } else brainEvent('designer', 'aprovado_dono', c, `Você aprovou a arte (${c.format}/${c.kind})`, forte); }
      if (c.video) { if (c.spec && c.spec_base && c.spec_base !== c.spec) { try { videoAprende(getContent(id)); } catch (e) { console.error('aprendizado da edição do vídeo:', e.message); } } else brainEvent('editor', 'aprovado_dono', c, `Você aprovou o vídeo (${c.format}/${c.kind})`, forte); }
      if (mg?.veredito === 'aprovar') brainEvent('gerente', 'gerente_ok', c, `Você confirmou a aprovação do Revisor (${c.format}/${c.kind})`, 'O dono aprovou sem pedir ajustes: o critério do Revisor estava alinhado.'); }
    if (settings().pacote_ia === '1') enqueue(id, 'publicador', 'pacote');
    else {
      let pack = null; try { pack = c.pack ? JSON.parse(c.pack) : null; } catch {}
      if (!pack) { pack = montarPacote(c); setContent(id, { pack: JSON.stringify(pack), caption: pack.legenda_final || c.caption }); log('publicador', `Pacote de postagem pronto: "${c.title}"`, id); }
      enviarWebhook(getContent(id), pack);
    }
  } else if (act === 'approve_script') {
    if (!(c.status === 'awaiting_script' || (c.status === 'blocked' && !jaProduzida)) || !c.script) throw fail(400, 'Este roteiro não está esperando aprovação');
    const need = producaoDe(c);
    setContent(id, { status: 'producing', error: '' });
    log(null, `Você aprovou o roteiro de "${c.title}"${c.status === 'blocked' ? ' (que tinha travado na revisão)' : ''}`, id);
    brainEvent('roteirista', 'roteiro_aprovado_dono', c, `Você aprovou o roteiro (nota ${c.score != null ? Number(c.score).toFixed(1) : '-'}, ${c.format}/${c.kind})`);
    for (const ag of need) enqueue(id, ag, ag === 'designer' ? 'arte' : 'video');
    if (!need.length) paraAprovacao(id, `"${c.title}" aguardando sua aprovação`);
  } else if (act === 'changes') {
    if (!c.script) throw fail(400, 'Ainda não há roteiro para ajustar');
    let target = ['designer', 'editor'].includes(b.target) ? b.target : 'roteirista';
    if (target !== 'roteirista') target = isVideo(c.format) ? 'editor' : 'designer';   // vídeo é do Editor, arte é do Designer
    const fbRaw = String(b.feedback || '').trim().slice(0, 3500), marcados = target === 'roteirista' ? [] : motivosValidos(target, b.motivos);
    if (!fbRaw && !marcados.length) throw fail(400, 'Descreva o ajuste ou marque ao menos um motivo');
    const inferidos = target === 'roteirista' ? [] : inferMotivos(target, fbRaw).filter(x => !marcados.includes(x)), tagsAj = [...marcados, ...inferidos];
    const feedback = (fbRaw ? fbRaw + (marcados.length ? '\n\n' : '') : '') + (marcados.length ? 'Motivos marcados pelo dono (corrija todos):\n' + marcados.map(id => `- ${motivoRotulo(target, id)}: ${motivoInfo(target, id).regra}`).join('\n') : '');
    if (target === 'designer' && !c.art) throw fail(400, 'Ainda não há arte para ajustar');
    if (target === 'editor' && !c.video) throw fail(400, 'Ainda não há vídeo para ajustar');
    setContent(id, { status: 'producing', error: '', revisions: 0, prod_revisions: 0 });   // novo ciclo de revisões a partir do pedido do dono
    const quem = { roteirista: 'o texto/roteiro', designer: 'a arte', editor: 'o vídeo' }[target];
    log(null, `Você pediu ajustes em ${quem} de "${c.title}"`, id);
    brainEvent(target, 'ajuste_dono', c, `O dono pediu ajustes em ${quem} (${c.format}/${c.kind})`, `Motivo (por que não foi aprovado): ${fbRaw || '(só motivos marcados)'}${tagsAj.length ? '\nMotivos categorizados: ' + tagsAj.map(id => motivoRotulo(target, id)).join('; ') : ''}`, tagsAj);
    { let mg = null; try { mg = c.manager ? JSON.parse(c.manager) : null; } catch { /* sem revisão */ }
      if (mg?.veredito === 'aprovar' && c.status === 'awaiting_approval') brainEvent('gerente', 'revisor_deixou_passar', c, `O Revisor aprovou, mas o dono pediu ajustes em ${quem} (${c.format}/${c.kind})`, `O que o Revisor não enxergou: ${feedback}`); }
    if (target !== 'roteirista') brainAprendeDoDono(target, c, fbRaw);
    registraPedido(c, target, fbRaw || tagsAj.map(id => motivoRotulo(target, id)).join('; '));
    // Ajuste de arte ou de vídeo volta só para quem produziu (o roteiro aprovado não é refeito); depois o Revisor revisa a entrega de novo
    if (target === 'roteirista') enqueue(id, 'roteirista', 'roteiro', { feedback });
    else enqueue(id, target, target === 'designer' ? 'arte' : 'video', { feedback, from: 'dono' });
  } else if (act === 'reprocess') {
    setContent(id, { status: 'producing', error: '', revisions: 0, prod_revisions: 0 });
    log(null, `Reprocessando "${c.title}"`, id);
    if (c.script) enqueue(id, 'gerente', 'revisao'); else enqueue(id, 'roteirista', 'roteiro');
  } else {
    if (c.status !== 'approved') throw fail(400, 'Só conteúdos aprovados podem ser marcados como postados');
    setContent(id, { status: 'posted', posted_at: T(), post_url: str(b.post_url, 500, 'Link', false) });
    { const cp = getContent(id); if (cp && !cp.teste) brainEvent('publicador', 'postado_dono', cp, `Você postou o pacote do Social Media (${cp.format}/${cp.kind})`, 'O dono usou o pacote de postagem (legenda, hashtags e horário) sem pedir refação: o formato do pacote está de acordo.'); }
    log(null, `"${c.title}" marcado como postado`, id);
  }
}

async function api(req, res, url) {
  const p = url.pathname, m = req.method;
  const ip = clientIp(req);

  if (p === '/api/login' && m === 'POST') {
    if (req.headers['x-nerd'] !== '1') throw fail(403, 'Requisição inválida');
    const a = attempts.get(ip) || { n: 0, until: 0 };
    if (a.until > Date.now()) throw fail(429, 'Muitas tentativas. Aguarde alguns minutos.');
    const body = await readBody(req, 10000);
    const uname = String(body.username || '').trim().toLowerCase();
    let uid = 0, ok = false;
    if (typeof body.password === 'string') {
      if (!uname || uname === 'dono') ok = crypto.timingSafeEqual(sha(body.password), sha(ADMIN_PASSWORD));
      else { const ur = one('SELECT * FROM users WHERE username=?', uname); if (ur && ur.active && pwOk(ur, body.password)) { ok = true; uid = ur.id; run('UPDATE users SET last_login=? WHERE id=?', T(), ur.id); } else pwOk({ salt: '00', hash: '00' }, body.password); }
    }
    if (!ok) {
      a.n++; if (a.n >= 5) { a.until = Date.now() + 10 * 60000; a.n = 0; }
      attempts.set(ip, a); throw fail(401, uname && uname !== 'dono' ? 'Usuário ou senha incorretos' : 'Senha incorreta');
    }
    attempts.delete(ip);
    const secure = (req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted) ? '; Secure' : '';
    return send(res, 200, { ok: true }, { 'set-cookie': `nsess=${makeSession(uid)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${14 * 86400}${secure}` });
  }
  const suid = validSession(cookies(req).nsess);
  const user = suid === null ? null : suid === 0 ? OWNER : userOf(one('SELECT * FROM users WHERE id=? AND active=1', suid));
  if (p === '/api/me') return send(res, 200, { authed: !!user, user: user && { id: user.id, name: user.name, username: user.username, admin: user.admin, owner: user.owner, perms: user.perms }, areas: AREAS, presets: PERM_PRESETS });
  if (!user) throw fail(401, 'Não autenticado');
  if (m !== 'GET' && req.headers['x-nerd'] !== '1') throw fail(403, 'Requisição inválida');

  if (p === '/api/logout' && m === 'POST') return send(res, 200, { ok: true }, { 'set-cookie': 'nsess=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
  if (!podeRota(user, p, m)) throw fail(403, 'Você não tem permissão para isto. Peça a um administrador.');

  // ── Usuários (só administradores)
  if (p === '/api/me/password' && m === 'POST') {
    if (user.owner) throw fail(400, 'A senha do dono fica no arquivo .env do servidor.');
    const b = await readBody(req, 5000), ur = one('SELECT * FROM users WHERE id=?', user.id);
    if (!pwOk(ur, b.current)) throw fail(400, 'A senha atual não confere');
    if (String(b.next || '').length < 8) throw fail(400, 'A nova senha precisa ter pelo menos 8 caracteres');
    const salt = crypto.randomBytes(16).toString('hex'); run('UPDATE users SET salt=?, hash=? WHERE id=?', salt, hashPw(b.next, salt), user.id);
    return send(res, 200, { ok: true });
  }
  const userView = r => ({ id: r.id, name: r.name, username: r.username, role: r.role, perms: r.role === 'admin' ? PERM_PRESETS.admin : cleanPerms(JSON.parse(r.perms || '{}')), active: !!r.active, created_at: r.created_at, last_login: r.last_login });
  if (p === '/api/users' && m === 'GET') return send(res, 200, { users: all('SELECT * FROM users ORDER BY name COLLATE NOCASE').map(userView), areas: AREAS, presets: PERM_PRESETS });
  if (p === '/api/users' && m === 'POST') {
    const b = await readBody(req, 10000), username = String(b.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username) || username === 'dono') throw fail(400, 'Usuário: 3 a 30 caracteres (letras minúsculas, números, ponto, hífen ou _). “dono” é reservado.');
    if (one('SELECT 1 x FROM users WHERE username=?', username)) throw fail(400, 'Já existe um usuário com esse login');
    if (String(b.password || '').length < 8) throw fail(400, 'A senha precisa ter pelo menos 8 caracteres');
    const salt = crypto.randomBytes(16).toString('hex'), role = b.role === 'admin' ? 'admin' : 'custom';
    const r = run('INSERT INTO users(name,username,salt,hash,role,perms,active,created_at) VALUES(?,?,?,?,?,?,?,?)', str(b.name, 80, 'Nome'), username, salt, hashPw(b.password, salt), role, JSON.stringify(cleanPerms(b.perms)), b.active === false ? 0 : 1, T());
    log(null, `Usuário criado: ${b.name} (${username})`); changed(); return send(res, 200, { id: +r.lastInsertRowid });
  }
  const mu = p.match(/^\/api\/users\/(\d+)$/);
  if (mu) {
    const id = +mu[1], ur = one('SELECT * FROM users WHERE id=?', id); if (!ur) throw fail(404, 'Usuário não encontrado');
    if (m === 'PUT') {
      const b = await readBody(req, 10000), role = b.role === 'admin' ? 'admin' : 'custom', active = b.active === false ? 0 : 1;
      if (id === user.id && (!active || role !== 'admin')) throw fail(400, 'Você não pode tirar o próprio acesso de administrador nem se desativar.');
      run('UPDATE users SET name=?, role=?, perms=?, active=? WHERE id=?', str(b.name, 80, 'Nome'), role, JSON.stringify(cleanPerms(b.perms)), active, id);
      if (b.password) { if (String(b.password).length < 8) throw fail(400, 'A senha precisa ter pelo menos 8 caracteres'); const salt = crypto.randomBytes(16).toString('hex'); run('UPDATE users SET salt=?, hash=? WHERE id=?', salt, hashPw(b.password, salt), id); }
      log(null, `Usuário atualizado: ${b.name}`); changed(); return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') { if (id === user.id) throw fail(400, 'Você não pode excluir o próprio usuário.'); run('DELETE FROM users WHERE id=?', id); log(null, `Usuário excluído: ${ur.name}`); changed(); return send(res, 200, { ok: true }); }
  }

  if (p === '/api/stream' && m === 'GET') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 3000\n\n'); clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (p === '/api/state' && m === 'GET') return send(res, 200, stateSnapshot());

  // ── Conteúdos
  let mt;
  if (p === '/api/contents' && m === 'POST') {
    const b = await readBody(req);
    const mk = f => ({
      title: str(f.title, 200, 'Título'), format: FORMATS.includes(f.format) ? f.format : (() => { throw fail(400, 'Formato inválido'); })(),
      kind: KINDS.includes(f.kind) ? f.kind : 'educativo', platform: str(f.platform, 40, 'Plataforma', false), brief: str(f.brief, 6000, 'Briefing', false),
      goal: GOALS.includes(f.goal) ? f.goal : '', brand: str(f.brand, 80, 'Marca', false), estilo_video: String(f.estilo_video || '').slice(0, 40), estilo_arte: (() => { const v = String(f.estilo_arte || ''); if (/^t:/.test(v) && templateDe(v.slice(2))) return v; if (/^l:\d+$/.test(v) && one('SELECT id FROM art_layouts WHERE id=?', +v.slice(2))) return v; return ''; })(),
      product_id: f.goal === 'produto' && +f.product_id ? (one('SELECT id FROM products WHERE id=?', +f.product_id)?.id || (() => { throw fail(400, 'Produto não encontrado'); })()) : null
    });
    let runAt = null;
    if (b.run_at) {
      const t = new Date(b.run_at);
      if (isNaN(t) || t.getTime() < Date.now() - 60000) throw fail(400, 'Escolha uma data e hora no futuro');
      if (t.getTime() > Date.now() + 90 * 864e5) throw fail(400, 'Agende em até 90 dias');
      if (t.getTime() > Date.now() + 30000) runAt = t.toISOString();
    }
    if (Array.isArray(b.items)) {
      if (b.items.length > 30) throw fail(400, 'Máximo de 30 itens por vez');
      return send(res, 200, { ids: b.items.map(f => createContent(mk(f), 'manual', runAt)) });
    }
    return send(res, 200, { id: createContent(mk(b), 'manual', runAt) });
  }
  if ((mt = p.match(/^\/api\/contents\/(\d+)$/))) {
    const id = +mt[1], c = getContent(id);
    if (!c) throw fail(404, 'Conteúdo não encontrado');
    if (m === 'GET') {
      const jobs = all('SELECT id,agent,kind,status,error,attempts,created_at,started_at,finished_at,tokens_in,tokens_out,run_after FROM jobs WHERE content_id=? ORDER BY id', id);
      const parse = t => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
      const prod = c.product_id ? one('SELECT id,name,type,url FROM products WHERE id=?', c.product_id) : null;
      return send(res, 200, { ...c, product: prod, review: parse(c.review), manager: parse(c.manager), pack: parse(c.pack), jobs, stage: jobs.filter(j => ['queued', 'running'].includes(j.status)).map(j => ({ agent: j.agent, label: stageLabel(j.kind, j.run_after), run_after: futuro(j.run_after) ? j.run_after : null, status: j.status })) });
    }
    if (m === 'PUT') {
      const b = await readBody(req), f = {};
      if ('title' in b) f.title = str(b.title, 200, 'Título');
      for (const k of ['script', 'art', 'video', 'caption', 'brief']) if (k in b) f[k] = str(b[k], 200000, k, false);
      if ('spec' in b) { const t = String(b.spec || '').trim(); if (!t) f.spec = ''; else { let j; try { j = JSON.parse(t); } catch { throw fail(400, 'O spec não é um JSON válido'); } try { f.spec = JSON.stringify(sanitizeSpec(j)); } catch (e) { throw fail(400, e.message); } } }
      if ('post_url' in b) f.post_url = str(b.post_url, 500, 'Link', false);
      if ('scheduled_at' in b) f.scheduled_at = b.scheduled_at ? new Date(b.scheduled_at).toISOString() : null;
      if (!Object.keys(f).length) throw fail(400, 'Nada para atualizar');
      setContent(id, f); return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') { run('DELETE FROM contents WHERE id=?', id); cleanRender(id); log(null, `Conteúdo removido: "${c.title}"`); return send(res, 200, { ok: true }); }
  }
  if (p === '/api/contents/bulk-delete' && m === 'POST') {
    const b = await readBody(req);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200);
    if (!ids.length) throw fail(400, 'Nenhum projeto selecionado');
    let n = 0;
    for (const id of ids) { const c = getContent(id); if (c) { run('DELETE FROM contents WHERE id=?', id); cleanRender(id); n++; } }
    log(null, `${n} projeto(s) apagado(s)`); changed();
    return send(res, 200, { ok: true, n });
  }
  if ((mt = p.match(/^\/api\/jobs\/(\d+)$/)) && m === 'DELETE') {
    const job = one("SELECT * FROM jobs WHERE id=? AND status='queued'", +mt[1]);
    if (!job) throw fail(404, 'Esse pedido não está mais na fila');
    run('DELETE FROM jobs WHERE id=?', job.id); changed();
    return send(res, 200, { ok: true });
  }
  if ((mt = p.match(/^\/api\/contents\/(\d+)\/(approve|approve_script|changes|reprocess|posted)$/)) && m === 'POST') {
    const id = +mt[1], act = mt[2], b = await readBody(req);
    contentAct(id, act, b);
    return send(res, 200, { ok: true });
  }

  // ── Gerente (chat com o agente-chefe)
  // Estilos de arte (perfil por marca; '' = geral)
  if (p === '/api/art-styles' && m === 'GET') {
    const marcas = all('SELECT name FROM brands ORDER BY name COLLATE NOCASE').map(b => b.name);
    return send(res, 200, { styles: ['', ...marcas].map(b => { const r = styleRow(b), j = (t, d) => { try { return t ? JSON.parse(t) : d; } catch { return d; } };
      return { brand: b, params: j(r?.params, {}), proposta: j(r?.proposta, null), hist: j(r?.hist, []).slice(0, 8), aprovadas: one("SELECT COUNT(*) n FROM contents WHERE teste=0 AND art_spec<>'' AND brand=? COLLATE NOCASE AND status IN ('approved','posted','awaiting_approval')", b).n, updated_at: r?.updated_at || null, ident: identidadeDe(b) }; }), schema: STYLE_SCHEMA });
  }
  if (p === '/api/art-styles' && m === 'PUT') {
    const b = await readBody(req, 4e5), br = String(b.brand || '').trim(); if (br && !one('SELECT 1 x FROM brands WHERE name=? COLLATE NOCASE', br)) throw fail(400, 'Marca não encontrada');
    const nome = br ? one('SELECT name FROM brands WHERE name=? COLLATE NOCASE', br).name : '';
    const novo = cleanStyle(b.params), diff = styleDiff(styleOwn(nome), novo);
    styleSave(nome, novo, { hist: { origem: 'Você', resumo: diff.length ? `Editou ${diff.length} parâmetro(s)` : 'Salvou sem mudanças' } });
    return send(res, 200, { ok: true });
  }
  if (p === '/api/art-styles/proposta' && m === 'POST') {
    const b = await readBody(req), br = String(b.brand || '').trim(), row = styleRow(br); let pr = null; try { pr = row?.proposta ? JSON.parse(row.proposta) : null; } catch { /* corrompida */ }
    if (!pr) throw fail(404, 'Não há sugestão para esta marca');
    if (b.acao === 'aplicar') styleSave(row.brand, cleanStyle(pr.params), { proposta: '', hist: { origem: pr.origem || 'sugestão', resumo: `Aplicou ${pr.diff?.length || 0} mudança(s)${pr.resumo ? ': ' + pr.resumo : ''}` } });
    else styleSave(row.brand, styleOwn(row.brand), { proposta: '', hist: { origem: 'Você', resumo: 'Descartou uma sugestão de estilo' } });
    return send(res, 200, { ok: true });
  }
  if (p === '/api/art-styles/aprender' && m === 'POST') {
    const b = await readBody(req), br = String(b.brand || '').trim(); if (br && !one('SELECT 1 x FROM brands WHERE name=? COLLATE NOCASE', br)) throw fail(400, 'Marca não encontrada');
    if (!agenteLigado('designer')) throw fail(400, 'O Designer está desativado (aba Agentes).');
    const origem = b.origem === 'referencias' ? 'referencias' : 'aprovadas';
    if (origem === 'referencias' && MANUAL) throw fail(400, 'Analisar referências precisa da API: o Claude precisa ver as imagens. Use as artes aprovadas ou preencha o estilo à mão.');
    const assets = (Array.isArray(b.assets) ? b.assets : []).map(Number).filter(Boolean).slice(0, 6); if (origem === 'referencias' && !assets.length) throw fail(400, 'Escolha ao menos uma imagem de referência');
    const nome = br ? one('SELECT name FROM brands WHERE name=? COLLATE NOCASE', br).name : '';
    const job = enqueue(null, 'designer', 'estilo', { brand: nome, origem, assets }, 'manual'); return send(res, 200, { ok: true, job });
  }
  if (p === '/api/gerente' && m === 'GET') {
    const msgs = all('SELECT * FROM chat_msgs ORDER BY id DESC LIMIT 80').reverse().map(x => ({ ...x, actions: x.actions ? JSON.parse(x.actions) : null }));
    const pend = all("SELECT j.id,j.kind,j.status,j.agent,j.input,j.created_at FROM jobs j WHERE j.kind IN ('chat','teste') AND j.status IN ('queued','running') ORDER BY j.id").map(j => ({ id: j.id, kind: j.kind, status: j.status, agent: agentRow(j.agent)?.name || j.agent, resumo: j.kind === 'teste' ? clip((() => { try { return JSON.parse(j.input).pedido; } catch { return ''; } })(), 90) : '' }));
    const versions = all('SELECT id,ts,agent,field,nota,undone FROM agent_versions ORDER BY id DESC LIMIT 15').map(v => ({ ...v, agent_name: agentRow(v.agent)?.name || v.agent }));
    return send(res, 200, { msgs, pending: pend, versions, agent: agentRow('chefe') });
  }
  if (p === '/api/gerente/chat' && m === 'POST') {
    const b = await readBody(req, 4e5), text = str(b.text, 20000, 'Mensagem');
    if (!agenteLigado('chefe')) throw fail(400, 'O Gerente está desativado (aba Agentes). Ative-o para conversar.');
    const mid = addChat('user', text);
    {   // ordens claras (aprovar, criar, ensinar, montar arte, pautas, ligar o autônomo…) executam na hora, com ou sem API; o resto vai para a IA
      let ac = null, err = '';
      try { ac = gerenteInterpreta(text); } catch (e) { err = e.message; }
      if (err) { addChat('gerente', 'Não consegui executar: ' + err + '.'); changed(); return send(res, 200, { ok: true, msg: mid, local: true }); }
      if (!ac?.length) { const resp = gerenteLocal(text); if (resp) { addChat('gerente', resp); changed(); return send(res, 200, { ok: true, msg: mid, local: true }); } }
      if (ac?.length) {
        const feitos = [], jobs = [];
        for (const a of ac) { try { const r = { ok: true, acao: a.acao, ...gerenteAcao(a) }; feitos.push(r); if (r.job) jobs.push(r.job); } catch (e) { feitos.push({ ok: false, acao: a.acao, texto: 'Não consegui: ' + e.message }); } }
        addChat('gerente', feitos.length === 1 ? (feitos[0].ok ? 'Feito.' : 'Não deu certo.') : `Executei ${feitos.filter(x => x.ok).length} de ${feitos.length} ordens.`, { actions: feitos }); changed();
        return send(res, 200, { ok: true, msg: mid, local: true, job: jobs[0] || null });
      }
      if (MANUAL) addChat('gerente', 'Isso não é uma ordem que eu executo sozinho sem a API, então deixei o pedido pronto para o Claude (aparece em Pedidos pendentes). Escreva "ajuda" para ver tudo o que eu faço na hora.');
    }
    if (/\b(sempre|nunca|jamais|n[aã]o (quero|gosto|fa[cç]a|use|usa|coloque|ponha)|prefiro|pare de|chega de|a partir de agora|de agora em diante|evite|passe a)\b/i.test(text) && !/^\s*(teste|gere|crie|ligue|desligue)\b/i.test(text)) brainEvent('chefe', 'preferencia_dono', null, 'O dono disse no chat: ' + clip(text, 160), text.slice(0, 1200));
    const jid = enqueue(null, 'chefe', 'chat', { msg: mid }, 'chat');
    return send(res, 200, { ok: true, msg: mid, job: jid });
  }
  // Comandos diretos: o mesmo que o Gerente executa no chat, mas por botões e formulários (não usa IA, funciona sem API)
  if (p === '/api/gerente/acao' && m === 'POST') {
    const b = await readBody(req, 4e5), k = String(b.acao || '');
    if (!['testar_agente', 'ensinar_agente', 'desfazer', 'criar_conteudo', 'gerar_pautas', 'ajustar_peca', 'aprovar_roteiro', 'aprovar_final', 'reprocessar', 'configurar', 'memorizar', 'editar_regra', 'arquivar_regra', 'aprender_estilo', 'rodar_cerebro', 'gerar_relatorio', 'conhecimento_agente', 'criar_marca', 'renderizar_arte', 'montar_arte'].includes(k)) throw fail(400, 'Comando inválido');
    let r; try { r = { ok: true, acao: k, ...gerenteAcao(b) }; } catch (e) { throw fail(400, e.message); }
    addChat('gerente', 'Feito pelo painel: ' + r.texto, { actions: [r] }); changed();
    return send(res, 200, r);
  }
  if (p === '/api/gerente/chat' && m === 'DELETE') { run('DELETE FROM chat_msgs'); changed(); return send(res, 200, { ok: true }); }
  if ((mt = p.match(/^\/api\/gerente\/undo\/(\d+)$/)) && m === 'POST') {
    const r = gerenteAcao({ acao: 'desfazer', versao: +mt[1] }); return send(res, 200, { ok: true, ...r });
  }

  // ── Modo chat: montar pedido e receber resposta
  if ((mt = p.match(/^\/api\/jobs\/(\d+)\/prompt$/)) && m === 'GET') {
    const job = one("SELECT * FROM jobs WHERE id=? AND status='queued'", +mt[1]);
    if (!job) throw fail(404, 'Esse pedido não está mais na fila');
    const withBase = url.searchParams.get('base') !== '0';
    const c = job.content_id ? getContent(job.content_id) : null;
    let base;
    try { base = await jobPrompt(job); }
    catch (e) { if (e.status === 409) { run('DELETE FROM jobs WHERE id=?', job.id); changed(); } throw e; } // pedido sem utilidade: sai da fila
    const prompt = composePrompt(base, withBase);
    dlog('manual', `pedido #${job.id} (${job.kind}) aberto: ${prompt.length} caracteres, base de conhecimento ${withBase ? 'incluída' : 'fora'}`);
    return send(res, 200, { id: job.id, kind: job.kind, content_id: job.content_id, format: c?.format || '', agent: agentRow(job.agent).name, color: agentRow(job.agent).color, label: STAGE_LABEL[job.kind], title: c?.title || '', prompt, chars: prompt.length, lastError: job.error || '', feedback: String(jparse(job.input, {})?.feedback || '').slice(0, 1500) });
  }
  if ((mt = p.match(/^\/api\/jobs\/(\d+)\/submit$/)) && m === 'POST') {
    const job = one("SELECT * FROM jobs WHERE id=? AND status='queued'", +mt[1]);
    if (!job) throw fail(404, 'Esse pedido não está mais na fila');
    const b = await readBody(req, 4e6);
    const text = str(b.text, 200000, 'Resposta');
    if (text.length < 15) throw fail(400, 'A resposta colada está curta demais');
    await submitManual(job, text);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/knowledge/export' && m === 'GET') {
    const budget = +settings().kb_budget || 60000, br = String(url.searchParams.get('brand') || '').trim();
    let out = '';
    const rows = br ? all("SELECT * FROM knowledge WHERE brand='' OR brand=? COLLATE NOCASE ORDER BY brand, category, title", br) : all('SELECT * FROM knowledge ORDER BY category, title');
    for (const e of rows) { const b = kbBlock(e) + '\n\n'; if (out.length + b.length > budget) break; out += b; }
    out += assetCatalog(br) + '\n';
    return send(res, 200, { text: out.trim(), chars: out.length, brand: br });
  }

  // ── Conhecimento
  const voiceFields = (b, cat) => cat !== 'tom_de_voz' ? { p: '', n: '', i: '' } : { p: VOICE_PROV[b.voice_provider] ? b.voice_provider : 'elevenlabs', n: String(b.voice_name ?? '').trim().slice(0, 80), i: String(b.voice_id ?? '').trim().replace(/[^\w.-]/g, '').slice(0, 80) };
  const brandName = v => { const t = String(v ?? '').trim().slice(0, 80); if (!t) return ''; run('INSERT OR IGNORE INTO brands(name,created_at) VALUES(?,?)', t, T()); return one('SELECT name FROM brands WHERE name=?', t)?.name || t; };
  // ── Manuais do Roteirista (carregados por pedido)
  if (p === '/api/evolucao' && m === 'GET') {   // evolução por agente: aprovações x devoluções por semana e nota média das revisões
    const sem = 8, ini = new Date(Date.now() - sem * 7 * 864e5).toISOString(), wk = ts => Math.min(sem - 1, Math.max(0, sem - 1 - Math.floor((Date.now() - Date.parse(ts)) / (7 * 864e5))));
    const OKK = ['revisao_aprovada', 'entrega_aprovada', 'aprovado_dono', 'roteiro_aprovado_dono', 'gerente_ok', 'preferencia_dono'], BADK = ['revisao_reprovada', 'entrega_reprovada', 'ajuste_dono', 'checagem_falhou', 'gerente_ajustar', 'motivo_manual'];
    const ags = all('SELECT id,name,color FROM agents ORDER BY id'), A = {};
    for (const a of ags) A[a.id] = { id: a.id, nome: a.name, cor: a.color, ok: Array(sem).fill(0), bad: Array(sem).fill(0) };
    for (const e of all(`SELECT agent,kind,ts FROM brain_events WHERE ts>=? AND kind IN (${[...OKK, ...BADK].map(() => '?').join(',')})`, ini, ...OKK, ...BADK)) { const x = A[e.agent]; if (!x) continue; (OKK.includes(e.kind) ? x.ok : x.bad)[wk(e.ts)]++; }
    const notas = Array.from({ length: sem }, () => []);
    for (const c of all("SELECT score, manager, updated_at FROM contents WHERE teste=0 AND updated_at>=?", ini)) { let n = null; try { n = c.manager ? JSON.parse(c.manager).nota : null; } catch { } n = n ?? c.score; if (n != null && isFinite(+n)) notas[wk(c.updated_at)].push(+n); }
    const primeira = all("SELECT c.id FROM contents c WHERE c.teste=0 AND c.status IN ('approved','posted') AND c.updated_at>=?", ini).length, comAjuste = one("SELECT COUNT(DISTINCT content_id) n FROM brain_events WHERE kind='ajuste_dono' AND ts>=?", ini).n;
    return send(res, 200, { semanas: sem, agentes: Object.values(A).filter(x => x.ok.some(Boolean) || x.bad.some(Boolean)), notas: notas.map(v => v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null), aprovadas: primeira, com_ajuste: comAjuste });
  }
  if (p === '/api/backup/exportar' && m === 'GET') {   // baixa o pacote com tudo (banco + arquivos + chave)
    if (!(user.owner || user.admin)) throw fail(403, 'Só administrador pode exportar os dados.');
    const tmpDb = path.join(DATA_DIR, '_export.db'); try { fs.unlinkSync(tmpDb); } catch { /* não existia */ }
    db.exec("VACUUM INTO '" + tmpDb.replace(/'/g, "''") + "'");
    const lista = [{ nome: 'studio.db', f: tmpDb }, ...(fs.existsSync(secretFile) ? [{ nome: 'secret.key', f: secretFile }] : [])];
    for (const d of BK_PASTAS) { const dir = path.join(DATA_DIR, d); try { for (const n of fs.readdirSync(dir)) if (bkNomeOk(d + '/' + n) && fs.statSync(path.join(dir, n)).isFile()) lista.push({ nome: d + '/' + n, f: path.join(dir, n) }); } catch { /* pasta não existe */ } }
    const manifesto = Buffer.from(JSON.stringify({ build: BUILD, criado_em: T(), arquivos: lista.length }));
    async function* gera() {
      yield tarCabecalho('manifesto.json', manifesto.length, Date.now()); yield manifesto; if (manifesto.length % 512) yield Buffer.alloc(512 - manifesto.length % 512);
      for (const a of lista) {
        const st = fs.statSync(a.f); yield tarCabecalho(a.nome, st.size, st.mtimeMs); for await (const c of fs.createReadStream(a.f)) yield c; if (st.size % 512) yield Buffer.alloc(512 - st.size % 512);
      }
      yield Buffer.alloc(1024);
    }
    res.writeHead(200, { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="agentes-sim-dados-${new Date().toISOString().slice(0, 10)}.tar.gz"`, 'cache-control': 'no-store' });
    log(null, `Pacote de dados exportado (${lista.length} arquivos)`);
    await new Promise(ok => { const gz = zlib.createGzip({ level: 6 }); gz.on('error', ok); res.on('close', ok); gz.pipe(res); (async () => { try { for await (const c of gera()) if (!gz.write(c)) await new Promise(r => gz.once('drain', r)); gz.end(); } catch (e) { console.error('exportação:', e.message); gz.destroy(); } })(); });
    try { fs.unlinkSync(tmpDb); } catch { /* já removido */ }
    return;
  }
  if (p === '/api/backup/importar' && m === 'POST') {   // recebe o pacote; a troca dos dados acontece na reinicialização
    if (!(user.owner || user.admin)) throw fail(403, 'Só administrador pode importar os dados.');
    const tmp = BK_PENDENTE + '.up'; const max = 2e9;
    await new Promise((ok, no) => { let n = 0; const ws = fs.createWriteStream(tmp); req.on('data', c => { n += c.length; if (n > max) { ws.destroy(); req.destroy(); no(fail(413, 'Pacote grande demais')); } }); req.on('error', no); ws.on('error', no); ws.on('finish', ok); req.pipe(ws); }).catch(e => { try { fs.unlinkSync(tmp); } catch { /* removido */ } throw e; });
    let n = 0; try { n = bkValida(fs.readFileSync(tmp)).length; } catch (e) { try { fs.unlinkSync(tmp); } catch { /* removido */ } throw fail(400, e.message); }
    fs.renameSync(tmp, BK_PENDENTE); log(null, `Pacote de dados recebido (${n} arquivos): o painel reinicia para aplicar`);
    send(res, 200, { ok: true, arquivos: n }); setTimeout(() => { try { server.close(); db.close(); } catch { /* ok */ } process.exit(3); }, 800); return;
  }
  if (p === '/api/pacote' && m === 'GET') return send(res, 200, pacoteStatus());
  if (p === '/api/pacote' && m === 'POST') { const b = await readBody(req, 3e6); const r = importaPacote(b.texto); log(null, `Pacote do Roteirista importado: prompts do Roteirista e do Revisor de Copy + ${r.manuais} manuais`); changed(); return send(res, 200, { ok: true, ...r, status: pacoteStatus() }); }
  if (p === '/api/manuais' && m === 'GET') return send(res, 200, { items: all('SELECT code,titulo,editado,auto,updated_at,length(conteudo) tam FROM manuais ORDER BY auto DESC, code') });
  if ((mt = p.match(/^\/api\/manuais\/([A-Z0-9]{2,4})(\/restaurar)?$/))) {
    const r0 = one('SELECT * FROM manuais WHERE code=?', mt[1]); if (!r0) throw fail(404, 'Manual não encontrado');
    if (!mt[2] && m === 'GET') return send(res, 200, r0);
    if (!mt[2] && m === 'PUT') { const b = await readBody(req, 6e5), txt = String(b.conteudo || '').trim(); if (txt.length < 20) throw fail(400, 'O manual não pode ficar vazio'); run('UPDATE manuais SET conteudo=?, editado=?, updated_at=? WHERE code=?', txt, txt === r0.original ? 0 : 1, T(), r0.code); changed(); return send(res, 200, { ok: true }); }
    if (mt[2] && m === 'POST') { run('UPDATE manuais SET conteudo=original, editado=0, updated_at=? WHERE code=?', T(), r0.code); changed(); return send(res, 200, { ok: true }); }
  }
  if (p === '/api/knowledge' && m === 'GET') return send(res, 200, { items: all('SELECT * FROM knowledge ORDER BY category, title').map(e => user.admin || user.perms.knowledge || user.perms.products ? e : { ...e, content: '' }), brands: all('SELECT id,name FROM brands ORDER BY name COLLATE NOCASE'), assets: all('SELECT * FROM assets ORDER BY brand COLLATE NOCASE, kind, name'), categories: CATEGORIES, budget: +settings().kb_budget });
  if (p === '/api/knowledge' && m === 'POST') {
    const b = await readBody(req, 4e6);
    if (b.category !== undefined && b.category !== '' && !CATEGORIES.includes(b.category)) throw fail(400, 'Categoria inválida. Use: ' + CATEGORIES.join(', ') + '.');
    const cat = CATEGORIES.includes(b.category) ? b.category : 'outros';
    const vz = voiceFields(b, cat);
    const r = run('INSERT INTO knowledge(title,category,content,brand,voice_provider,voice_name,voice_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)', str(b.title, 200, 'Título'), cat, str(b.content, 300000, 'Conteúdo'), brandName(b.brand), vz.p, vz.n, vz.i, T(), T());
    changed(); return send(res, 200, { id: +r.lastInsertRowid });
  }
  if ((mt = p.match(/^\/api\/knowledge\/(\d+)$/))) {
    const id = +mt[1];
    if (m === 'PUT') {
      const b = await readBody(req, 4e6);
      if (b.category !== undefined && b.category !== '' && !CATEGORIES.includes(b.category)) throw fail(400, 'Categoria inválida. Use: ' + CATEGORIES.join(', ') + '.');
      const cat2 = CATEGORIES.includes(b.category) ? b.category : 'outros', vz = voiceFields(b, cat2);
      run('UPDATE knowledge SET title=?, category=?, content=?, brand=?, voice_provider=?, voice_name=?, voice_id=?, updated_at=? WHERE id=?', str(b.title, 200, 'Título'), cat2, str(b.content, 300000, 'Conteúdo'), brandName(b.brand), vz.p, vz.n, vz.i, T(), id);
      return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') { run('DELETE FROM knowledge WHERE id=?', id); return send(res, 200, { ok: true }); }
  }
  if (p === '/api/brands' && m === 'GET') return send(res, 200, { brands: all('SELECT id,name FROM brands ORDER BY name COLLATE NOCASE') });
  if (p === '/api/brands' && m === 'POST') {
    const b = await readBody(req, 1e4); const n = str(b.name, 80, 'Nome da marca');
    if (one('SELECT id FROM brands WHERE name=?', n)) throw fail(400, 'Já existe uma marca com esse nome');
    const r = run('INSERT INTO brands(name,created_at) VALUES(?,?)', n, T()); changed();
    return send(res, 200, { id: +r.lastInsertRowid, name: n });
  }
  if ((mt = p.match(/^\/api\/brands\/(\d+)$/))) {
    const br = one('SELECT * FROM brands WHERE id=?', +mt[1]); if (!br) throw fail(404, 'Marca não encontrada');
    if (m === 'PUT') {
      const b = await readBody(req, 1e4); const n = str(b.name, 80, 'Nome da marca');
      if (one('SELECT id FROM brands WHERE name=? AND id<>?', n, br.id)) throw fail(400, 'Já existe uma marca com esse nome');
      run('UPDATE brands SET name=? WHERE id=?', n, br.id);
      run('UPDATE knowledge SET brand=? WHERE brand=?', n, br.name); run('UPDATE assets SET brand=? WHERE brand=?', n, br.name); run('UPDATE product_brands SET brand=? WHERE brand=?', n, br.name); run('UPDATE contents SET brand=? WHERE brand=?', n, br.name);
      for (const k of all("SELECT id,content FROM knowledge WHERE brand=? AND content LIKE '# IDENTIDADE VISUAL%'", n)) run('UPDATE knowledge SET title=?, content=? WHERE id=?', 'Identidade visual — ' + n, k.content.replace(/^# IDENTIDADE VISUAL — .*/, '# IDENTIDADE VISUAL — ' + n), k.id);
      changed(); return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') {   // apagou, apagou: a marca e tudo o que é só dela somem de vez (não volta ao reiniciar); as peças já produzidas ficam, sem marca
      const n = br.name, rm = f => { try { fs.unlinkSync(f); } catch { /* já não existe */ } };
      for (const a of all("SELECT id, ext FROM assets WHERE brand=? COLLATE NOCASE AND COALESCE(central,'')=''", n)) rm(path.join(ASSET_DIR, a.id + '.' + a.ext));
      for (const a of all('SELECT id FROM assets WHERE brand=? COLLATE NOCASE', n)) { for (const f of fs.readdirSync(ASSET_DIR)) if (f.startsWith(a.id + '.') || f.startsWith(a.id + '-')) rm(path.join(ASSET_DIR, f)); }
      for (const a of all('SELECT id FROM poses WHERE brand=? COLLATE NOCASE', n)) rm(path.join(POSE_DIR, a.id + '.png'));
      for (const l of all('SELECT id FROM art_layouts WHERE brand=? COLLATE NOCASE', n)) rm(path.join(LAYOUT_DIR, l.id + '.jpg'));
      for (const t of ['knowledge', 'assets', 'poses', 'art_styles', 'art_layouts', 'art_edits', 'brain_rules', 'brain_events', 'brain_molds', 'product_brands']) run(`DELETE FROM ${t} WHERE brand=? COLLATE NOCASE`, n);
      run('DELETE FROM art_templates WHERE brand=? COLLATE NOCASE OR visual_brand=? COLLATE NOCASE', n, n);
      run("UPDATE contents SET brand='' WHERE brand=? COLLATE NOCASE", n);
      run('DELETE FROM brands WHERE id=?', br.id); changed(); log(null, `Marca ${n} apagada de vez (conhecimento, arquivos, estilos e aprendizados dela)`);
      return send(res, 200, { ok: true });
    }
  }

  // ── Produtos (ficha estruturada)
  const PF = ['name', 'type', 'url', 'price', 'deliverable', 'promise', 'audience', 'pains', 'objections', 'bonus', 'guarantee', 'page_text'];
  const prodVals = b => ({
    name: str(b.name, 160, 'Nome do produto'), type: PRODUCT_TYPES.includes(b.type) ? b.type : 'outro',
    url: (() => { const u = str(b.url, 500, 'Link', false); if (u && !/^https?:\/\//i.test(u)) throw fail(400, 'O link precisa começar com http:// ou https://'); return u; })(),
    price: str(b.price, 80, 'Preço', false), deliverable: str(b.deliverable, 3000, 'Entregável', false), promise: str(b.promise, 2000, 'Promessa', false), audience: str(b.audience, 2000, 'Público', false),
    pains: str(b.pains, 3000, 'Dores', false), objections: str(b.objections, 3000, 'Objeções', false), bonus: str(b.bonus, 2000, 'Bônus', false), guarantee: str(b.guarantee, 1000, 'Garantia', false), page_text: str(b.page_text, 40000, 'Texto da página', false)
  });
  // Seleção de produtos de uma marca: troca o conjunto inteiro de uma vez
  if ((mt = p.match(/^\/api\/brands\/(\d+)\/products$/)) && m === 'PUT') {
    const br = one('SELECT * FROM brands WHERE id=?', +mt[1]); if (!br) throw fail(404, 'Marca não encontrada');
    const b = await readBody(req, 1e5), ids = [...new Set((Array.isArray(b.product_ids) ? b.product_ids : []).map(Number))].filter(id => one('SELECT 1 x FROM products WHERE id=?', id));
    run('DELETE FROM product_brands WHERE brand=?', br.name); for (const id of ids) run('INSERT OR IGNORE INTO product_brands(product_id,brand) VALUES(?,?)', id, br.name);
    changed(); return send(res, 200, { ok: true, count: ids.length });
  }
  const withBrands = x => ({ ...x, brand: '', brands: brandsOfProduct(x.id) });
  // marcas escolhidas na ficha (só as que existem)
  const brandList = v => [...new Set((Array.isArray(v) ? v : []).map(x => String(x || '').trim()).filter(Boolean))].filter(n => one('SELECT 1 x FROM brands WHERE name=?', n));
  const setProductBrands = (id, list) => { run('DELETE FROM product_brands WHERE product_id=?', id); for (const n of list) run('INSERT OR IGNORE INTO product_brands(product_id,brand) VALUES(?,?)', id, n); };
  if (p === '/api/products' && m === 'GET') return send(res, 200, { products: all('SELECT * FROM products ORDER BY name COLLATE NOCASE').map(withBrands), types: PRODUCT_TYPES });
  if (p === '/api/products' && m === 'POST') {
    const b = await readBody(req, 2e6), v = prodVals(b);
    const r = run('INSERT INTO products(brand,name,type,url,price,deliverable,promise,audience,pains,objections,bonus,guarantee,page_text,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', '', v.name, v.type, v.url, v.price, v.deliverable, v.promise, v.audience, v.pains, v.objections, v.bonus, v.guarantee, v.page_text, T(), T());
    setProductBrands(+r.lastInsertRowid, brandList(b.brands));
    if (+b.image) run('UPDATE products SET image=? WHERE id=?', one('SELECT id FROM assets WHERE id=?', +b.image)?.id || 0, +r.lastInsertRowid);
    changed(); return send(res, 200, { id: +r.lastInsertRowid });
  }
  if (p === '/api/products/fetch' && m === 'POST') {
    const b = await readBody(req, 1e4); return send(res, 200, await lerPagina(str(b.url, 500, 'Link')));
  }
  if ((mt = p.match(/^\/api\/products\/(\d+)$/))) {
    const id = +mt[1]; if (!one('SELECT id FROM products WHERE id=?', id)) throw fail(404, 'Produto não encontrado');
    if (m === 'PUT') { const b = await readBody(req, 2e6), v = prodVals(b); if (b.image !== undefined) run('UPDATE products SET image=? WHERE id=?', one('SELECT id FROM assets WHERE id=?', +b.image)?.id || 0, id); run('UPDATE products SET name=?,type=?,url=?,price=?,deliverable=?,promise=?,audience=?,pains=?,objections=?,bonus=?,guarantee=?,page_text=?,updated_at=? WHERE id=?', v.name, v.type, v.url, v.price, v.deliverable, v.promise, v.audience, v.pains, v.objections, v.bonus, v.guarantee, v.page_text, T(), id); if (Array.isArray(b.brands)) setProductBrands(id, brandList(b.brands)); changed(); return send(res, 200, { ok: true }); }
    if (m === 'DELETE') { run('UPDATE contents SET product_id=NULL WHERE product_id=?', id); run('DELETE FROM product_brands WHERE product_id=?', id); run('DELETE FROM products WHERE id=?', id); changed(); return send(res, 200, { ok: true }); }
  }

  // ── Arquivos da marca
  if (p === '/api/assets' && m === 'GET') return send(res, 200, { assets: all('SELECT * FROM assets ORDER BY brand COLLATE NOCASE, kind, name'), max: { img: ASSET_MAX, aud: assetMax('mp3'), vid: assetMax('mp4') } });
  // Novo envio (binário direto, sem base64): POST /api/assets/upload?filename=&brand=&kind=&tags=&name=&note=
  if (p === '/api/biblioteca-central' && m === 'GET') { const c = bibCfg(); return send(res, 200, { configurada: !!(c.url && c.chave), matriz: !!(c.url && c.admin), url: c.url, status: bibStatus(), rodando: bibRodando, itens: all('SELECT tipo, COUNT(*) n FROM central_itens GROUP BY tipo'),
    acervo: { pasta: ASSET_DIR, total: one('SELECT COUNT(*) n, COALESCE(SUM(size),0) b FROM assets'), imagens: one("SELECT COUNT(*) n FROM assets WHERE ext IN ('png','jpg','jpeg','webp','gif','svg')").n, videos: one("SELECT COUNT(*) n FROM assets WHERE ext IN ('mp4','mov','webm','mkv','m4v')").n, audios: one("SELECT COUNT(*) n FROM assets WHERE ext IN ('mp3','wav','m4a','ogg','aac')").n, da_central: one("SELECT COUNT(*) n FROM assets WHERE COALESCE(central,'')<>''").n } }); }
  if (p === '/api/biblioteca-central/sync' && m === 'POST') return send(res, 200, await bibSync('manual'));
  if (p === '/api/biblioteca-central/publicaveis' && m === 'GET') { if (!bibCfg().admin) throw fail(400, 'Este painel não é a matriz (falta BIBLIOTECA_ADMIN no .env)'); const pub = new Set(all('SELECT chave FROM central_itens').map(r => r.chave)); return send(res, 200, { itens: bibPublicaveis(), ja: [...pub] }); }
  if (p === '/api/biblioteca-central/publicar' && m === 'POST') { const b = await readBody(req, 2e5); const r = await bibPublica(b.itens); const s2 = await bibSync('manual').catch(() => null); return send(res, 200, { ...r, sync: s2 }); }
  if (p === '/api/imagens/busca' && m === 'GET') return send(res, 200, await buscaImagens(url.searchParams.get('q'), Math.max(1, Math.min(20, +url.searchParams.get('pag') || 1)), url.searchParams.get('banco') || ''));
  if (p === '/api/imagens/thumb' && m === 'GET') {   // miniatura do banco passando pelo painel (a página só carrega imagens do próprio painel)
    const u = String(url.searchParams.get('u') || ''), ck = thumbCache.get(u);
    const out = ck || await baixaImagemSegura(u, 4e6); if (!ck) { thumbCache.set(u, out); if (thumbCache.size > 300) thumbCache.delete(thumbCache.keys().next().value); }
    res.writeHead(200, { 'content-type': { png: 'image/png', webp: 'image/webp' }[out.ext] || 'image/jpeg', 'cache-control': 'private, max-age=3600' }); return res.end(out.buf);
  }
  if (p === '/api/banco3d' && m === 'GET') { const b = banco3d(); return send(res, 200, { cats: b.cats, items: b.items.map(r => r.slice(0, 4)) }); }
  if (p === '/api/banco3d/usar' && m === 'POST') { const b = await readBody(req, 2e4); const a = usaBanco3d(str(b.id, 80, 'Elemento'), b.brand); return send(res, 200, a); }
  if (p === '/api/assets/remover-fundo' && m === 'POST') {
    const b = await readBody(req, 2e4);
    const a = await removeFundoAsset(b.brand, str(b.name, 120, 'Imagem'));
    log(null, `Fundo removido: ${a.name}`); return send(res, 200, a);
  }
  if (p === '/api/imagens/importar' && m === 'POST') {
    const b = await readBody(req, 2e4);
    const a = await importaImagem({ url: str(b.url, 2000, 'Link'), brand: b.brand, nome: str(b.nome || '', 80, 'Nome', false), recorte: !!b.recorte, credito: str(b.credito || '', 600, 'Crédito', false), ping: String(b.ping || ''), kind: b.kind });
    log(null, `Imagem do banco ${b.recorte ? '(recortada) ' : ''}guardada na Biblioteca: ${a.name}`); return send(res, 200, a);
  }
  if (p === '/api/assets/catalogo' && m === 'GET') return send(res, 200, { texto: assetCatalog(brandName(url.searchParams.get('brand') || ''), false) });   // exatamente o que os agentes leem da biblioteca
  if (p === '/api/assets/reconhecer' && m === 'POST') {   // reclassifica o que já está na biblioteca pelo nome e pela pasta (ex.: "mascote-pose-3.png" estava como foto)
    const lista = []; for (const a of all("SELECT * FROM assets WHERE kind IN ('foto','outro','fundo')")) { if (!(IMG_EXT.includes(a.ext) || VID_EXT.includes(a.ext))) continue; const k = inferirKind(a.ext, a.pasta, a.name + ' ' + (a.tags || '')); if (k !== kindFromExt(a.ext) && k !== a.kind && ASSET_KINDS.includes(k)) { run('UPDATE assets SET kind=?, colecao=? WHERE id=?', k, colecaoDe(a.colecao, k), a.id); lista.push({ name: a.name, de: a.kind, para: k }); } }
    if (lista.length) { changed(); log(null, `Biblioteca: ${lista.length} arquivo(s) reconhecido(s) pelo nome/pasta`); } return send(res, 200, { ok: true, alterados: lista });
  }
  if (p === '/api/assets/upload' && m === 'POST') {
    const q = url.searchParams, fn = str(q.get('filename'), 200, 'Arquivo'); const ext = (fn.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
    if (!ext || !ASSET_MIME[ext]) throw fail(400, 'Tipo de arquivo não aceito. Use png, jpg, webp, gif, svg, mp3, wav, m4a, mp4, webm, mov, ttf, otf, woff ou woff2.');
    const max = assetMax(ext), tmp = path.join(ASSET_DIR, '.up-' + crypto.randomBytes(6).toString('hex'));
    await new Promise((ok, no) => {
      let n = 0; const ws = fs.createWriteStream(tmp);
      req.on('data', c => { n += c.length; if (n > max) { ws.destroy(); req.destroy(); no(fail(413, `Arquivo acima de ${fmtMB(max)} para este tipo`)); } });
      req.on('error', no); ws.on('error', no); ws.on('finish', () => ok());
      req.pipe(ws);
    }).catch(e => { try { fs.unlinkSync(tmp); } catch { /* já removido */ } throw e; });
    const size = fs.statSync(tmp).size; if (!size) { fs.unlinkSync(tmp); throw fail(400, 'Arquivo vazio'); }
    const brand = brandName(q.get('brand')), pasta = pastaDe(q.get('pasta')); const kind = ASSET_KINDS.includes(q.get('kind')) ? q.get('kind') : inferirKind(ext, pasta, fn.replace(/\.[^.]+$/, ''));
    let base = slugName(q.get('name')) || slugName(fn.replace(/\.[^.]+$/, '')) || 'arquivo', name = base, n = 2;
    while (one('SELECT id FROM assets WHERE brand=? AND name=?', brand, name)) name = base + '-' + n++;
    const tagsUp = [str(q.get('tags') || '', 300, 'Etiquetas', false), ...pasta.split('/').map(x => x.toLowerCase())].filter(Boolean).join(', ').slice(0, 300);
    const r = run('INSERT INTO assets(brand,name,kind,tags,note,colecao,filename,ext,size,created_at,pasta) VALUES(?,?,?,?,?,?,?,?,?,?,?)', brand, name, kind, tagsUp, str(q.get('note') || '', 600, 'Descrição', false), colecaoDe(q.get('colecao'), kind), fn, ext, size, T(), pasta);
    const id = +r.lastInsertRowid; fs.renameSync(tmp, path.join(ASSET_DIR, id + '.' + ext));
    const pr = probeAsset(id, ext); run('UPDATE assets SET dur=?, w=?, h=? WHERE id=?', pr.dur, pr.w, pr.h, id);
    changed(); agendaFicha(id); return send(res, 200, { id, name, kind, pasta, dur: pr.dur });
  }
  if (p === '/api/assets' && m === 'POST') {
    const b = await readBody(req, 36e6);
    const fn = str(b.filename, 200, 'Arquivo'); const ext = (fn.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase();
    if (!ext || !ASSET_MIME[ext]) throw fail(400, 'Tipo de arquivo não aceito. Use png, jpg, webp, gif, svg, mp3, wav, m4a, mp4, webm, mov, ttf, otf, woff ou woff2.');
    const buf = Buffer.from(String(b.data || ''), 'base64'); if (!buf.length) throw fail(400, 'Arquivo vazio');
    if (buf.length > ASSET_MAX) throw fail(413, 'Arquivo acima de 25 MB');
    const brand = brandName(b.brand); const kind = ASSET_KINDS.includes(b.kind) ? b.kind : kindFromExt(ext);
    let base = slugName(b.name) || slugName(fn.replace(/\.[^.]+$/, '')) || 'arquivo', name = base, n = 2;
    while (one('SELECT id FROM assets WHERE brand=? AND name=?', brand, name)) name = base + '-' + n++;
    const r = run('INSERT INTO assets(brand,name,kind,tags,colecao,filename,ext,size,created_at) VALUES(?,?,?,?,?,?,?,?,?)', brand, name, kind, str(b.tags, 300, 'Etiquetas', false), colecaoDe(b.colecao, kind), fn, ext, buf.length, T());
    fs.writeFileSync(path.join(ASSET_DIR, r.lastInsertRowid + '.' + ext), buf);
    const pr = probeAsset(+r.lastInsertRowid, ext); run('UPDATE assets SET dur=?, w=?, h=? WHERE id=?', pr.dur, pr.w, pr.h, +r.lastInsertRowid);
    changed(); agendaFicha(+r.lastInsertRowid); return send(res, 200, { id: +r.lastInsertRowid, name });
  }
  // Fichas da Biblioteca: descrição de cada arquivo para o Editor
  if (p === '/api/assets/fichas/pedido' && m === 'GET') {
    const lista = all("SELECT * FROM assets WHERE ficha_status IN ('','tecnico','erro') AND ext IN ('png','jpg','jpeg','webp','gif','mp4','webm','mov') ORDER BY id").slice(0, 20);
    if (!lista.length) throw fail(400, 'Todos os arquivos já estão descritos');
    return send(res, 200, { count: lista.length, names: lista.map(a => a.name), prompt: `Você é o analista visual da biblioteca de um estúdio de vídeo motion. Vou anexar ${lista.length} arquivo(s). Descreva cada um para que o Editor saiba EXATAMENTE quando e como usá-lo.\n\nArquivos, na ordem em que estou anexando:\n${lista.map((a, i) => `${i + 1}. ${a.name}${a.tags ? ' (etiquetas: ' + a.tags + ')' : ''}`).join('\n')}\n\nDevolva SOMENTE um bloco \`\`\`json com uma lista, um item por arquivo, usando o nome exato:\n[{"nome":"nome-do-arquivo", ${FICHA_CAMPOS.slice(1)}]` });
  }
  if (p === '/api/assets/fichas/importar' && m === 'POST') {
    const b = await readBody(req, 4e5); let arr = null;
    for (const cand of [...[...String(b.texto || '').matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)].map(x => x[1]).reverse(), String(b.texto || '')]) { try { const x = extractJson(cand, '['); if (Array.isArray(x)) { arr = x; break; } } catch { /* próximo */ } }
    if (!arr) throw fail(400, 'Não encontrei a lista JSON na resposta. Cole a resposta inteira do Claude.');
    let ok = 0; const faltou = [];
    for (const it of arr) { const a = it && one('SELECT * FROM assets WHERE name=? COLLATE NOCASE ORDER BY brand', slugName(it.nome || it.name)); if (!a) { faltou.push(String(it?.nome || '?')); continue; } salvaFicha(a, it, 'ia'); ok++; }
    changed(); return send(res, 200, { ok, faltou });
  }
  if (p === '/api/assets/analisar' && m === 'POST') {
    if (MANUAL) throw fail(400, 'Sem chave de API neste painel. Use "Pedir análise ao Claude" e cole a resposta.');
    const b = await readBody(req, 1e4), ids = b.todos ? all("SELECT id FROM assets WHERE ext IN ('png','jpg','jpeg','webp','gif','mp4','webm','mov')").map(r => r.id) : all("SELECT id FROM assets WHERE ficha_status IN ('','tecnico','erro') AND ext IN ('png','jpg','jpeg','webp','gif','mp4','webm','mov')").map(r => r.id);
    for (const id of ids) { if (b.todos) run("UPDATE assets SET ficha_status='tecnico' WHERE id=? AND ficha_status<>'manual'", id); agendaFicha(id); }
    return send(res, 200, { fila: ids.length });
  }
  if ((mt = p.match(/^\/api\/assets\/(\d+)\/mascote(\/ia)?$/))) {
    const a = one('SELECT * FROM assets WHERE id=?', +mt[1]); if (!a) throw fail(404, 'Arquivo não encontrado');
    if (!mt[2] && m === 'GET') return send(res, 200, { ficha: mascoteFichaDe(a), campos: MASC_CAMPOS.map(c => ({ k: c[0], l: c[1] })) });
    if (!mt[2] && m === 'PUT') { const b = await readBody(req, 2e4); salvaMascoteFicha(a, b); changed(); return send(res, 200, { ok: true }); }
    if (mt[2] && m === 'POST') {
      if (MANUAL) throw fail(400, 'Sem chave de API neste painel. Preencha à mão.');
      if (!['png', 'jpg', 'jpeg', 'webp'].includes(a.ext)) throw fail(400, 'A IA só lê PNG, JPG ou WebP');
      const v = visionImg(assetPath(a)); if (!v) throw fail(400, 'Não consegui ler a imagem');
      const pedido = `Você é diretor de arte e vai escrever a FICHA TÉCNICA do mascote de uma marca, olhando a imagem anexa. Descreva SÓ o que se vê, de forma objetiva e detalhada, para que outro designer consiga reproduzir o personagem idêntico. Não invente o que não aparece (deixe "" se não der para saber).\n\nDevolva SOMENTE um bloco JSON com estas chaves (textos curtos em português do Brasil):\n{${MASC_CAMPOS.map(c => `"${c[0]}":"${c[1]}"`).join(',')}}\nEm "cores" cite cada cor com hex aproximado. Em "nunca" liste o que descaracterizaria o personagem (ex.: trocar a roupa, mudar o tom de pele, tirar o boné, mudar o estilo 3D).${a.note ? '\nObservação do dono: ' + a.note : ''}`;
      const r = await callClaude({ agent: agentRow('editor'), user: pedido, maxTokens: 1500, images: [v] });
      const j = extractJson(r.text, '{'); if (!j || typeof j !== 'object') throw fail(502, 'A IA respondeu sem JSON. Tente de novo.');
      const atual = mascoteFichaDe(a) || {}, novo = {};
      for (const [k] of MASC_CAMPOS) novo[k] = atual[k] ? atual[k] : j[k];   // o que o dono já escreveu não é sobrescrito
      salvaMascoteFicha(a, novo); changed(); return send(res, 200, { ok: true, ficha: mascoteFichaDe(one('SELECT * FROM assets WHERE id=?', a.id)) });
    }
  }
  if ((mt = p.match(/^\/api\/assets\/(\d+)\/ficha$/))) {
    const a = one('SELECT * FROM assets WHERE id=?', +mt[1]); if (!a) throw fail(404, 'Arquivo não encontrado');
    if (m === 'GET') return send(res, 200, { ficha: fichaDe(a), status: a.ficha_status });
    if (m === 'PUT') { const b = await readBody(req, 2e4); salvaFicha(a, b, 'manual'); changed(); return send(res, 200, { ok: true }); }
    if (m === 'POST') { if (MANUAL) throw fail(400, 'Sem chave de API neste painel.'); run("UPDATE assets SET ficha_status='tecnico' WHERE id=?", a.id); await prepararFicha(a.id); return send(res, 200, { ok: true, status: one('SELECT ficha_status s FROM assets WHERE id=?', a.id).s }); }
  }
  if ((mt = p.match(/^\/api\/assets\/(\d+)(\/file|\/thumb)?$/))) {
    const a = one('SELECT * FROM assets WHERE id=?', +mt[1]); if (!a) throw fail(404, 'Arquivo não encontrado');
    const file = path.join(ASSET_DIR, a.id + '.' + a.ext);
    if (mt[2] === '/thumb' && m === 'GET') {
      const th = path.join(ASSET_DIR, a.id + '.thumb.jpg'); if (!fs.existsSync(th)) { if (VID_EXT.includes(a.ext) && fs.existsSync(file)) probeAsset(a.id, a.ext); }
      if (!fs.existsSync(th)) throw fail(404, 'Sem miniatura');
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'private, max-age=300' }); return res.end(fs.readFileSync(th));
    }
    if (mt[2] === '/file' && m === 'GET') {
      if (!fs.existsSync(file)) throw fail(404, 'Arquivo sumiu do disco');
      const h = { 'content-type': ASSET_MIME[a.ext], 'cache-control': 'private, max-age=300', 'accept-ranges': 'bytes', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" };
      if (url.searchParams.get('download')) h['content-disposition'] = `attachment; filename="${a.name}.${a.ext}"`;
      const size = fs.statSync(file).size, rg = String(req.headers.range || '').match(/^bytes=(\d*)-(\d*)$/);
      if (rg && (rg[1] || rg[2])) {   // vídeo e áudio precisam de Range para avançar/voltar no player
        let st = rg[1] ? +rg[1] : Math.max(0, size - +rg[2]), en = rg[1] && rg[2] ? Math.min(+rg[2], size - 1) : size - 1;
        if (st > en || st >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
        res.writeHead(206, { ...h, 'content-range': `bytes ${st}-${en}/${size}`, 'content-length': en - st + 1 }); { const rs = fs.createReadStream(file, { start: st, end: en }); res.on('close', () => rs.destroy()); return rs.pipe(res); }
      }
      res.writeHead(200, { ...h, 'content-length': size }); { const rs = fs.createReadStream(file); res.on('close', () => rs.destroy()); return rs.pipe(res); }
    }
    if (m === 'PUT') {
      const b = await readBody(req, 2e4); const brand = brandName(b.brand);
      let name = slugName(b.name); if (!name) throw fail(400, 'Nome inválido');
      if (one('SELECT id FROM assets WHERE brand=? AND name=? AND id<>?', brand, name, a.id)) throw fail(400, 'Já existe um arquivo com esse nome nesta marca');
      run('UPDATE assets SET brand=?, name=?, kind=?, tags=?, note=?, colecao=?, pasta=? WHERE id=?', brand, name, ASSET_KINDS.includes(b.kind) ? b.kind : a.kind, str(b.tags, 300, 'Etiquetas', false), b.note == null ? a.note : str(b.note, 600, 'Descrição', false), b.colecao == null ? a.colecao : colecaoDe(b.colecao, ASSET_KINDS.includes(b.kind) ? b.kind : a.kind), b.pasta == null ? a.pasta : pastaDe(b.pasta), a.id);
      changed(); return send(res, 200, { ok: true });
    }
    if (m === 'DELETE') { for (const f of [file, path.join(ASSET_DIR, a.id + '.thumb.jpg')]) { try { fs.unlinkSync(f); } catch { /* já removido */ } } run('DELETE FROM assets WHERE id=?', a.id); changed(); return send(res, 200, { ok: true }); }
  }

  // ── Estúdio de vídeo (tela de teste do motor)
  if (p === '/api/video-tests' && m === 'GET') {
    const items = all('SELECT id,title,brand,status,spec,render_status,created_at,updated_at FROM contents WHERE teste=1 ORDER BY id DESC LIMIT 40')
      .map(({ spec, ...c }) => ({ ...c, has_spec: !!spec, has_video: fs.existsSync(renderFile(c.id)) }));
    return send(res, 200, { items });
  }
  if ((mt = p.match(/^\/api\/video-tests?\/(\d+)\/avaliar$/)) && m === 'POST') {
    const id = +mt[1], c = getContent(id); if (!c || !c.teste) throw fail(404, 'Vídeo não encontrado');
    if (!c.spec) throw fail(400, 'Este vídeo ainda não tem cenas para avaliar');
    if (!ensina(c)) throw fail(400, 'A demonstração pronta não ensina o Cérebro. Crie um vídeo com o seu tema para avaliar.');
    const b = await readBody(req, 2e4), maxId = one('SELECT COALESCE(MAX(id),0) n FROM brain_rules').n, antes = all("SELECT id,weight FROM brain_rules").map(r => r.id + ':' + r.weight);
    const estNome = c.estilo_video && c.estilo_video !== 'auto' ? (estiloVideo(c.estilo_video)?.nome || c.estilo_video) : 'escolhido pelo Editor';
    if (b.resultado === 'aprovado') { try { aprendePedidos(id); } catch (e) { console.error('aprendePedidos:', e.message); } }
    if (b.resultado === 'aprovado' && c.spec && c.spec_base && c.spec_base !== c.spec) { try { videoAprende(c); } catch (e) { console.error('aprendizado da edição do vídeo:', e.message); } }
    else if (b.resultado === 'aprovado') {
      brainEvent('editor', 'aprovado_dono', c, `Você aprovou o vídeo (estilo ${estNome})`, 'O dono aprovou o vídeo de primeira: estilo, ritmo, elementos e texto estavam de acordo.');
      log(null, `Você aprovou o vídeo "${c.title}"`, id);
    } else if (b.resultado === 'reprovado') {
      const fbRaw = String(b.feedback || '').trim().slice(0, 3000), marcados = motivosValidos('editor', b.motivos);
      if (!fbRaw && !marcados.length) throw fail(400, 'Marque ao menos um motivo ou descreva o que está errado');
      const inferidos = inferMotivos('editor', fbRaw).filter(x => !marcados.includes(x)), tagsAj = [...marcados, ...inferidos];
      const feedback = (fbRaw ? fbRaw + (marcados.length ? '\n\n' : '') : '') + (marcados.length ? 'Motivos marcados pelo dono (corrija todos):\n' + marcados.map(x => `- ${motivoRotulo('editor', x)}: ${motivoInfo('editor', x).regra}`).join('\n') : '');
      brainEvent('editor', 'ajuste_dono', c, `O dono reprovou o vídeo (estilo ${estNome})`, `Motivo (por que não foi aprovado): ${fbRaw || '(só motivos marcados)'}${tagsAj.length ? '\nMotivos categorizados: ' + tagsAj.map(x => motivoRotulo('editor', x)).join('; ') : ''}`, tagsAj);
      brainAprendeDoDono('editor', c, fbRaw);
      log(null, `Você reprovou o vídeo "${c.title}"`, id);
      if (b.refazer) { registraPedido(c, 'editor', fbRaw || tagsAj.map(x => motivoRotulo('editor', x)).join('; ')); enqueue(id, 'editor', 'video', { feedback, from: 'dono' }); }
    } else throw fail(400, 'Resultado inválido');
    changed();
    const novas = all('SELECT id,text,status FROM brain_rules WHERE id>?', maxId).map(r => ({ texto: r.text, status: r.status }));
    const reforcadas = all('SELECT id,text,weight FROM brain_rules').filter(r => antes.includes(r.id + ':' + (r.weight - 1))).map(r => ({ texto: r.text }));
    const molde = b.resultado === 'aprovado' && !!one("SELECT 1 x FROM brain_molds WHERE content_id=? AND agent='editor'", id);
    return send(res, 200, { ok: true, novas, reforcadas, molde });
  }
  if (p === '/api/video-test' && m === 'POST') {
    const b = await readBody(req, 2e5), brand = brandName(b.brand);
    const mode = b.mode === 'editor' ? 'editor' : 'exemplo';
    const nome = brand || 'Sem marca';
    const estId = b.estilo === 'auto' ? 'auto' : (estiloVideo(String(b.estilo || ''))?.id || (mode === 'editor' ? 'auto' : 'editorial'));
    const est = estId === 'auto' ? null : estiloVideo(estId);
    let id;
    if (mode === 'exemplo') {
      if (est?.tipo === 'hardcopy') throw fail(400, 'O VSL usa vídeos reais da biblioteca, então não tem demonstração pronta. Use "Criar com o meu tema".');
      const base = est?.exemplo ? JSON.parse(JSON.stringify(est.exemplo)) : JSON.parse(fs.readFileSync(path.join(MOTOR_DIR, 'exemplo.spec.json'), 'utf8'));
      base.brand = (brand || 'MARCA').toUpperCase() + ' • ' + (est?.nome || 'DEMONSTRAÇÃO').toUpperCase();
      if (est) { base.look = est.look; base.estilo = est.id; if (est.custom && est.accent && !base.accent) base.accent = est.accent; }
      const iv = brand && one("SELECT content FROM knowledge WHERE brand=? COLLATE NOCASE AND category='marca' AND content LIKE '# IDENTIDADE VISUAL%' LIMIT 1", brand);
      const hx = iv && (iv.content.match(/#[0-9a-fA-F]{6}\b/) || [])[0]; if (hx) base.accent = hx;
      const r = run("INSERT INTO contents(title,format,kind,platform,brief,brand,status,spec,estilo_video,teste,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,'manual',?,?)",
        `Demonstração · ${est?.nome || 'Exemplo'} · ${nome}`, 'video_vertical', 'educativo', 'teste', 'Demonstração do estilo ' + (est?.nome || 'padrão') + ' com o vídeo de exemplo.', brand, 'approved', JSON.stringify(sanitizeSpec(base)), est?.id || '', T(), T());
      id = +r.lastInsertRowid; changed();
      return send(res, 200, { id });
    }
    const theme = str(b.theme, 6000, 'Tema'), cta = str(b.cta, 200, 'CTA', false);
    const script = `# TEMA DO VÍDEO\n${theme}\n\n# CTA FINAL\n${cta || 'Chama no direct para saber mais'}`;
    const estNome = est ? est.nome : 'Editor escolhe';
    const r = run("INSERT INTO contents(title,format,kind,platform,brief,script,brand,status,estilo_video,teste,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,'manual',?,?)",
      `${theme.replace(/\s+/g, ' ').slice(0, 60)} · ${estNome}`, 'video_vertical', 'educativo', 'teste', 'VÍDEO AVULSO: o texto em "TEMA DO VÍDEO" pode ser só um tema OU um roteiro/narração já pronto. Se for roteiro pronto, mantenha as palavras do autor e apenas divida em cenas; se for só tema, crie as cenas e a narração (15 a 25 s, ou o ritmo do estilo escolhido). Termine com o CTA indicado.', script, brand, 'approved', estId, T(), T());
    id = +r.lastInsertRowid;
    const job = enqueue(id, 'editor', 'video', {}, 'manual');
    log('editor', `Vídeo na fila (${estNome}): "${theme.slice(0, 50)}"`, id);
    return send(res, 200, { id, job });
  }

  // ── Estilos de vídeo: catálogo, estilos próprios aprendidos de um vídeo de referência
  if (p === '/api/motion-styles' && m === 'GET') {
    const st = estilosVideo(), lib = {}; for (const r of all("SELECT colecao, COUNT(*) n FROM assets GROUP BY colecao")) lib[r.colecao || 'geral'] = r.n;
    return send(res, 200, { ocultos: all('SELECT id FROM motion_hidden').map(r => ESTILOS_MOTION.find(e => e.id === r.id)).filter(Boolean).map(e => ({ id: e.id, nome: e.nome })), styles: st.map(e => pubEstilo(e, e.tipo, e.custom)), looks: LOOKS_VALIDOS, biblioteca: lib, api: !MANUAL });
  }
  if (p === '/api/motion-styles/pedido' && m === 'GET') return send(res, 200, { prompt: pedidoEstiloReferencia(String(url.searchParams.get('obs') || '').slice(0, 600)) });
  if (p === '/api/motion-styles/importar' && m === 'POST') {
    const b = await readBody(req, 1e6);
    return send(res, 200, { ok: true, style: pubEstilo(salvaEstiloReferencia(String(b.texto || ''), String(b.nome || '')), 'motion', true) });
  }
  if (p === '/api/motion-styles/analisar' && m === 'POST') {
    if (MANUAL) throw fail(400, 'Sem chave de API neste painel. Use o pedido pronto: leve o vídeo ao chat com o Claude e cole a resposta aqui.');
    const b = await readBody(req, 14e6);
    const frames = (Array.isArray(b.frames) ? b.frames : []).slice(0, 10).map(f => String(f || '')).filter(f => /^data:image\/(jpeg|png|webp);base64,/.test(f) && f.length < 2.2e6);
    if (frames.length < 3) throw fail(400, 'Envie pelo menos 3 quadros do vídeo de referência');
    const imgs = frames.map(f => ({ type: f.slice(5, f.indexOf(';')), data: f.slice(f.indexOf(',') + 1) }));
    const r = await callClaude({ agent: agentRow('editor'), user: pedidoEstiloReferencia(String(b.obs || '').slice(0, 600)) + '\n\nOs quadros anexos são retirados do vídeo de referência, em ordem cronológica.', maxTokens: 6000, images: imgs }).catch(e => { throw e.status ? e : fail(502, e.message); });
    return send(res, 200, { ok: true, style: pubEstilo(salvaEstiloReferencia(r.text, String(b.nome || '')), 'motion', true) });
  }
  if ((mt = p.match(/^\/api\/motion-styles\/([a-z0-9-]{1,40})\/poster$/)) && m === 'GET') {
    const f = path.join(__dirname, 'public', 'estilos', mt[1] + '.jpg');
    if (!fs.existsSync(f)) throw fail(404, 'Sem imagem');
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' }); return res.end(fs.readFileSync(f));
  }
  if ((mt = p.match(/^\/api\/motion-styles\/([\w-]+)$/)) && m === 'DELETE') {
    if (!one('SELECT 1 x FROM motion_styles WHERE id=?', mt[1])) {
      if (!ESTILOS_MOTION.some(e => e.id === mt[1])) throw fail(404, 'Estilo não encontrado');
      run('INSERT OR IGNORE INTO motion_hidden(id) VALUES(?)', mt[1]);   // estilo pronto: some da galeria, dá para restaurar
    } else run('DELETE FROM motion_styles WHERE id=?', mt[1]);
    run("UPDATE contents SET estilo_video='auto' WHERE estilo_video=? AND teste=0 AND status<>'posted'", mt[1]); changed();
    return send(res, 200, { ok: true });
  }
  if ((mt = p.match(/^\/api\/motion-styles\/([\w-]+)\/restaurar$/)) && m === 'POST') {
    run('DELETE FROM motion_hidden WHERE id=?', mt[1]); changed(); return send(res, 200, { ok: true });
  }

  // ── Poses do mascote e custos
  if (p === '/api/custos' && m === 'GET') return send(res, 200, custosResumo());
  if (p === '/api/radar' && m === 'GET') {
    const cfg = radarCfg(), marcas = all('SELECT name FROM brands ORDER BY name COLLATE NOCASE').map(b => b.name);
    const itens = all("SELECT r.*, c.title ctitle, c.status cstatus FROM radar_items r LEFT JOIN contents c ON c.id=r.content_id ORDER BY r.id DESC LIMIT 120");
    const rodando = all("SELECT input FROM jobs WHERE kind='radar' AND status IN ('queued','running')").map(j => jparse(j.input, {})?.brand).filter(Boolean);
    const estilos = Object.fromEntries(marcas.map(b => [b, [...templatesDaMarca(b).filter(t => t.formatos.some(f => RADAR_FMTS.includes(f))).map(t => ({ id: t.id, nome: t.nome, formatos: t.formatos, tema: t.tema || '', casa: !!t.casa })), ...radarLayoutsDaMarca(b).map(l => ({ id: 'layout-' + l.id, nome: l.name + ' (layout salvo)', formatos: [l.format], tema: l.tema || '', casa: false }))]]));
    return send(res, 200, { estilos, cfg, marcas, itens, rodando, ligado: agenteLigado('radar'), api: !!API_KEY, nichos: Object.entries(RADAR_NICHOS).map(([id, n]) => ({ id, nome: n.nome, termos: n.termos })) });
  }
  if (p === '/api/radar' && m === 'PUT') {
    const b = await readBody(req, 4e4), marcas = all('SELECT name FROM brands').map(x => x.name), cur = radarCfg(), nm = {};
    for (const nome of marcas) { const x = b.marcas?.[nome] || cur.marcas[nome]; if (x) nm[nome] = x; }
    const fm = Object.fromEntries(cur.fontes.map(f => [f.id, f.ativo])); if (b.fontes && typeof b.fontes === 'object') for (const k of Object.keys(fm)) if (k in b.fontes) fm[k] = !!b.fontes[k];
    radarSalvaCfg({ auto: b.auto != null ? !!b.auto : cur.auto, hora: b.hora != null ? b.hora : cur.hora, geo: b.geo || cur.geo, marcas: nm, fontes: fm, extras: b.extras != null ? String(b.extras).slice(0, 1500) : cur.extras });
    migraNoticiaTemplates();   // o template/layout recém-escolhido já ganha a legenda e a contracapa gravadas
    return send(res, 200, { cfg: radarCfg() });
  }
  if (p === '/api/radar/run' && m === 'POST') {
    const b = await readBody(req, 2e3), cfg = radarCfg();
    if (!agenteLigado('radar')) throw fail(400, 'O Agente de Notícias está desativado (aba Agentes). Ative-o para buscar notícias.');
    const alvo = b.brand ? [String(b.brand)] : Object.entries(cfg.marcas).filter(([, x]) => x.ativo).map(([n]) => n);
    if (!alvo.length) throw fail(400, 'Ative o Agente de Notícias em pelo menos uma marca e escreva os assuntos dela.');
    for (const n of alvo) if (!one("SELECT 1 x FROM jobs WHERE kind='radar' AND status IN ('queued','running') AND input LIKE ?", '%' + JSON.stringify({ brand: n }).slice(1, -1) + '%')) radarEnfileira(n, 'manual');
    return send(res, 200, { ok: true, marcas: alvo });
  }
  { const mm = p.match(/^\/api\/radar\/item\/(\d+)$/); if (mm && m === 'POST') {
    const b = await readBody(req, 2e3), it = one('SELECT * FROM radar_items WHERE id=?', +mm[1]); if (!it) throw fail(404, 'Notícia não encontrada');
    if (b.acao === 'descartar') { run("UPDATE radar_items SET status='descartado' WHERE id=?", it.id); return send(res, 200, { ok: true }); }
    if (b.acao === 'pauta') { if (it.status === 'pauta') throw fail(400, 'Esta notícia já virou pauta'); const ft = await radarTemFoto(it); if (!ft.ok) throw fail(409, 'Esta notícia não virou pauta porque não achei foto boa (' + (ft.motivo || 'sem detalhe') + '). Sem foto a arte de notícia não sai, e o painel não gasta IA à toa.'); return send(res, 200, { ok: true, content_id: radarPauta(it, { formato: b.formato }) }); }
    throw fail(400, 'Ação inválida'); } }
  if (p === '/api/poses' && m === 'GET') {
    const br = url.searchParams.get('brand');
    const rows = br == null ? all('SELECT * FROM poses ORDER BY id DESC') : all('SELECT * FROM poses WHERE brand=? COLLATE NOCASE ORDER BY id DESC', br);
    return send(res, 200, { poses: rows, presets: POSE_PRESETS.map(([key, label, desc]) => ({ key, label, desc })), custos: custosResumo(), fal: !!falKey(), fal_pausa: falPausado() });
  }
  if (p === '/api/poses/generate' && m === 'POST') {
    reloadEnv(); if (!falKey()) throw fail(400, falMsg('Para gerar poses, coloque a FAL_KEY no arquivo .env e reinicie o painel.'));
    const b = await readBody(req, 2e4), brand = brandName(b.brand);
    const mas = one("SELECT * FROM assets WHERE name=? AND brand=? COLLATE NOCASE AND kind='mascote'", str(b.mascot, 80, 'Mascote'), brand) || one("SELECT * FROM assets WHERE name=? AND brand='' AND kind='mascote'", str(b.mascot, 80, 'Mascote'));
    if (!mas) throw fail(400, 'Mascote não encontrado. Suba o arquivo do mascote (tipo “Mascote”) nesta marca primeiro.');
    if (!IMG_MIME[mas.ext]) throw fail(400, 'O mascote precisa ser PNG, JPG ou WebP.');
    const list = (Array.isArray(b.poses) ? b.poses : []).slice(0, 12).map(x => ({ key: slugName(x.key || x.label) || 'pose', label: String(x.label || x.key || '').slice(0, 60), desc: String(x.desc || '').trim().slice(0, 240) })).filter(x => x.desc);
    if (!list.length) throw fail(400, 'Escolha ao menos uma pose');
    const ids = list.map(x => { const r = run("INSERT INTO poses(brand,mascot,key,label,desc,status,created_at) VALUES(?,?,?,?,?,'gerando',?)", brand, mas.name, x.key, x.label, x.desc, T()); poseEnqueue(+r.lastInsertRowid); return +r.lastInsertRowid; });
    changed(); return send(res, 200, { ids });
  }
  if ((mt = p.match(/^\/api\/poses\/(\d+)(?:\/(file|approve|regen))?$/))) {
    const pr = one('SELECT * FROM poses WHERE id=?', +mt[1]); if (!pr) throw fail(404, 'Pose não encontrada');
    const f = path.join(POSE_DIR, pr.id + '.png');
    if (mt[2] === 'file' && m === 'GET') { if (!fs.existsSync(f)) throw fail(404, 'Sem imagem'); res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }); return res.end(fs.readFileSync(f)); }
    if (mt[2] === 'approve' && m === 'POST') {
      if (pr.status !== 'pendente' || !fs.existsSync(f)) throw fail(400, 'Esta pose não está pronta para aprovar');
      let base = slugName(pr.mascot + '-' + pr.key), name = base, n = 2;
      while (one('SELECT id FROM assets WHERE brand=? AND name=?', pr.brand, name)) name = base + '-' + n++;
      const buf = fs.readFileSync(f);
      const r = run('INSERT INTO assets(brand,name,kind,tags,filename,ext,size,created_at) VALUES(?,?,?,?,?,?,?,?)', pr.brand, name, 'mascote', `pose: ${pr.label || pr.key}; mesmo mascote “${pr.mascot}”, fundo transparente`, name + '.png', 'png', buf.length, T());
      fs.writeFileSync(path.join(ASSET_DIR, r.lastInsertRowid + '.png'), buf);
      run("UPDATE poses SET status='aprovada', asset_id=? WHERE id=?", +r.lastInsertRowid, pr.id); changed(); return send(res, 200, { name });
    }
    if (mt[2] === 'regen' && m === 'POST') {
      if (pr.status === 'aprovada' || pr.status === 'gerando') throw fail(400, 'Não é possível refazer agora');
      run("UPDATE poses SET status='gerando', error='' WHERE id=?", pr.id); poseEnqueue(pr.id); changed(); return send(res, 200, { ok: true });
    }
    if (!mt[2] && m === 'DELETE') { try { fs.unlinkSync(f); } catch {} run('DELETE FROM poses WHERE id=?', pr.id); changed(); return send(res, 200, { ok: true }); }
  }

  // ── Entrega: imagens da arte
  if (p === '/api/arte-modelos' && m === 'GET') return send(res, 200, { modelos: MODELOS_ARTE });
  if (p === '/api/art-templates' && m === 'GET') return send(res, 200, { templates: templatesDaMarca(url.searchParams.get('brand') || ''), todos: templatesVisiveis('').map(t => ({ id: t.id, nome: t.nome, brand: t.brand || '', formatos: t.formatos, tema: t.tema, casa: !!t.casa })), padrao: estilosPadrao(), apagados: (ap => TEMPLATES_CASA.filter(t => !t.oculto && ap.has(t.id)))(tplApagados(url.searchParams.get('brand') || '')).map(t => ({ id: t.id, nome: t.nome, formatos: t.formatos })) });
  if ((mt = p.match(/^\/api\/art-templates\/([^/]+)\/estrutura$/)) && m === 'GET') {   // o que cada página do estilo comporta (a galeria mostra; os agentes de copy recebem o mesmo)
    const bn = String(url.searchParams.get('brand') || '').trim(), marca = bn ? (one('SELECT name FROM brands WHERE name=? COLLATE NOCASE', bn)?.name || '') : '';
    const est = estiloEstrutura(decodeURIComponent(mt[1]), url.searchParams.get('format') || 'carrossel', marca); if (!est) throw fail(404, 'Estilo não encontrado');
    return send(res, 200, { paginas: est }); }
  if (p === '/api/art-templates/previa' && m === 'POST') { const b = await readBody(req, 4e4); return send(res, 200, previaEstilo({ id: b.id, seq: b.seq, format: b.format, brand: (() => { const bn = String(b.brand || '').trim(); return bn ? (one('SELECT name FROM brands WHERE name=? COLLATE NOCASE', bn)?.name || '') : ''; })() })); }
  if (p === '/api/art-templates' && m === 'POST') {   // salva a arte (montada com modelos) como template reutilizável em qualquer marca
    const b = await readBody(req, 2e4);
    if (!b.content_id && Array.isArray(b.seq)) {   // estilo criado no Estúdio (sem partir de uma arte)
      const seq = seqOk(b.seq), nome = str(b.nome, 80, 'Nome do estilo'), uso = str(b.uso || '', 400, 'Quando usar', false), nivel = b.nivel === 'robusto' ? 'robusto' : 'simples', tema = TEMAS[b.tema] ? b.tema : 'geral';
      const fm = (Array.isArray(b.formatos) ? b.formatos : []).filter(f => ['feed', 'carrossel', 'stories'].includes(f)); const fmts = fm.length ? fm : ['carrossel'];
      const dono = (() => { const bn = String(b.brand || '').trim(); return bn ? (one('SELECT name FROM brands WHERE name=? COLLATE NOCASE', bn)?.name || '') : ''; })();
      const r = run('INSERT INTO art_templates(nome,uso,nivel,formatos,seq,exemplo,brand,created_at,tema) VALUES(?,?,?,?,?,?,?,?,?)', nome, uso, nivel, JSON.stringify(fmts), JSON.stringify(seq), '', dono, T(), tema);
      log('designer', `Novo estilo de arte: “${nome}” (${seq.length} página(s))${dono ? ' da marca ' + dono : ''}`); changed(); return send(res, 200, { id: 'dono-' + r.lastInsertRowid });
    }
    const c = getContent(+b.content_id); if (!c) throw fail(404, 'Arte não encontrada');
    const sp = jparse(c.art_spec, {}), seq = templateDaArte(sp); if (seq.length < 1) throw fail(400, 'Esta arte não foi montada com os modelos do estilo; monte (ou aplique um modelo em cada página) antes de salvar como template.');
    const nome = str(b.nome, 80, 'Nome do template'), uso = str(b.uso || '', 400, 'Quando usar', false), nivel = b.nivel === 'robusto' ? 'robusto' : 'simples';
    const fmts = c.format === 'feed' ? ['feed'] : c.format === 'stories' ? ['stories'] : ['carrossel'];
    const r = run('INSERT INTO art_templates(nome,uso,nivel,formatos,seq,exemplo,brand,created_at) VALUES(?,?,?,?,?,?,?,?)', nome, uso, nivel, JSON.stringify(fmts), JSON.stringify(seq), JSON.stringify((sp.slides || []).map(s => ({ modelo: s.modelo, dados: s.dados }))), c.brand || '', T());
    log('designer', `Novo template de arte: “${nome}” (${seq.length} página(s))`); brainLayoutSalvo(c, 'estilo', nome, c.brand || ''); changed(); return send(res, 200, { id: 'dono-' + r.lastInsertRowid });
  }
  if ((mt = p.match(/^\/api\/art-templates\/([a-z0-9-]+)\/(editar|visual|duplicar|padrao|restaurar|apagar|voltar)$/)) && m === 'POST') {   // galeria de estilos
    const id = mt[1], acao = mt[2], b = await readBody(req, 2e4), tpl = templateDe(id); if (!tpl) throw fail(404, 'Estilo não encontrado');
    const marcaX = (() => { const bn = String(b.brand || '').trim(); return bn ? (one('SELECT name FROM brands WHERE name=? COLLATE NOCASE', bn)?.name || '') : ''; })();
    if (acao === 'apagar') {   // estilo da casa: some da galeria e do Designer SÓ DA MARCA escolhida (os estilos salvos pelo dono ficam); as outras marcas continuam com ele; dá para trazer de volta
      if (!TEMPLATES_CASA.some(t => t.id === id)) throw fail(400, 'Use “Apagar” do estilo próprio');
      if (!marcaX) throw fail(400, 'Escolha a marca na galeria para apagar o estilo só dela (assim as outras marcas não perdem o estilo)');
      // nada é apagado aqui: o estilo só é escondido nesta marca (dá para trazer de volta). Os estilos que o dono salvou a partir dele continuam intactos
      run('INSERT OR IGNORE INTO art_hidden_b(id,brand) VALUES(?,?)', id, marcaX.toLowerCase());
      const pd = estilosPadrao(), kb = marcaX.toLowerCase(); if (pd[kb] === id) { delete pd[kb]; run("INSERT INTO settings(key,value) VALUES('estilo_padrao',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(pd)); }
      log('designer', `Estilo da casa apagado na marca ${marcaX}: “${tpl.nome}”`); changed(); return send(res, 200, { ok: true }); }
    if (acao === 'voltar') { run('DELETE FROM art_hidden_b WHERE id=? AND brand=?', id, marcaX.toLowerCase()); log('designer', `Estilo da casa trazido de volta${marcaX ? ' na marca ' + marcaX : ''}: “${tpl.nome}”`); changed(); return send(res, 200, { ok: true }); }
    const marca = (() => { const bn = String(b.brand || '').trim(); return bn ? (one('SELECT name FROM brands WHERE name=? COLLATE NOCASE', bn)?.name || '') : ''; })();
    if (acao === 'editar') {   // abre uma cópia de prévia (arte de exemplo na marca escolhida) para o dono mexer no editor
      return send(res, 200, previaEstilo({ id, format: b.format, brand: marca, fresh: true })); }
    if (acao === 'padrao') {   // estilo preferido da marca (usado nas artes montadas pelo roteiro)
      const pd = estilosPadrao(), k = marca.toLowerCase(); if (b.limpar) delete pd[k]; else pd[k] = id;
      run("INSERT INTO settings(key,value) VALUES('estilo_padrao',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(pd)); changed(); return send(res, 200, { ok: true, padrao: pd }); }
    if (acao === 'duplicar') {   // a cópia pertence à marca escolhida (ou à do original, se nenhuma foi escolhida); o visual de outra marca vem junto, sem as artes prontas dela
      const row = tplRow(id), nome = str(b.nome || tpl.nome + ' (cópia)', 80, 'Nome'), dono = marca || row?.brand || '';
      let vis = ''; if (row) { const mp = visMapa(row), ks = Object.keys(mp), kSrc = ks.find(k => k === String(row.brand || '').toLowerCase()) ?? ks[0]; if (kSrc !== undefined) { const { snaps, ...resto } = mp[kSrc]; vis = JSON.stringify({ [dono.toLowerCase()]: { ...resto, brand: dono } }); } }
      const r = run('INSERT INTO art_templates(nome,uso,nivel,formatos,seq,exemplo,brand,created_at,visual,visual_brand,visual_at,tema,deriva) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)', nome, tpl.uso || '', tpl.nivel || 'simples', JSON.stringify(tpl.formatos), JSON.stringify(tpl.seq), '', dono, T(), vis, vis ? dono : '', vis ? (row?.visual_at || '') : '', tpl.tema || 'geral', row ? 'dono-' + row.id : id);
      log('designer', `Estilo duplicado: “${nome}”${dono ? ' para a marca ' + dono : ''}`); changed(); return send(res, 200, { id: 'dono-' + r.lastInsertRowid }); }
    if (acao === 'restaurar') {   // volta um estilo da casa ao original (apaga a versão do dono)
      const row = tplRow(id); if (!row || row.central || !(row.base || (row.deriva && TEMPLATES_CASA.some(t => t.id === row.deriva)))) throw fail(400, 'Este estilo já está no original');
      { const pd = estilosPadrao(); let mud = false; for (const k of Object.keys(pd)) if (pd[k] === 'dono-' + row.id && row.deriva) { pd[k] = row.deriva; mud = true; } if (mud) run("INSERT INTO settings(key,value) VALUES('estilo_padrao',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(pd)); }
      lixeiraGuarda('estilo', row, 'Voltou ao original'); run('DELETE FROM art_templates WHERE id=?', row.id); log('designer', `Estilo “${row.nome}” voltou ao original (a sua versão fica ${LIXEIRA_DIAS} dias na lixeira)`); changed(); return send(res, 200, { ok: true }); }
    // visual: guarda TUDO o que o dono mexeu na arte de prévia (estrutura + visual) neste estilo
    const c = getContent(+b.content_id); if (!c || c.teste !== 3) throw fail(404, 'Arte de edição não encontrada');
    const sp = jparse(c.art_spec, {}); if (!(sp.slides || []).some(x => x.modelo)) throw fail(400, 'Esta arte não tem páginas montadas com os modelos');
    let row = tplRow(id); if (row?.central && !row.base) throw fail(400, 'Este estilo vem da Biblioteca Central: duplique para criar a sua versão.');
    const seq = templateDaArte(sp), vis = visualDaArte(sp, c.format, c.brand || ''), fmts = tpl.formatos.includes(c.format) ? tpl.formatos : [...tpl.formatos, c.format];
    const nome = str(b.nome || tpl.nome, 80, 'Nome do estilo');
    const bC = String(c.brand || '').trim();
    if (bC && (!row || (row.base && !row.brand) || (row.brand && !mesmaMarca(row.brand, bC)))) {   // estilo da casa/de outra marca: a marca ganha a PRÓPRIA cópia (o original e as outras marcas não mudam)
      const de = row && !row.base ? 'dono-' + row.id : id;
      let mine = one('SELECT * FROM art_templates WHERE brand=? COLLATE NOCASE AND deriva=?', bC, de);
      if (!mine) {
        const r = run('INSERT INTO art_templates(nome,uso,nivel,formatos,seq,exemplo,brand,created_at,base,tema,deriva) VALUES(?,?,?,?,?,?,?,?,?,?,?)', nome, tpl.uso || '', tpl.nivel || 'simples', JSON.stringify(fmts), JSON.stringify(seq), '', bC, T(), '', tpl.tema || 'geral', de);
        mine = one('SELECT * FROM art_templates WHERE id=?', +r.lastInsertRowid);
        const pd = estilosPadrao(), kb = bC.toLowerCase(); if (pd[kb] === id) { pd[kb] = 'dono-' + mine.id; run("INSERT INTO settings(key,value) VALUES('estilo_padrao',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", JSON.stringify(pd)); }
      }
      row = mine;
    } else if (!row) { const r = run('INSERT INTO art_templates(nome,uso,nivel,formatos,seq,exemplo,brand,created_at,base,tema) VALUES(?,?,?,?,?,?,?,?,?,?)', nome, tpl.uso || '', tpl.nivel || 'simples', JSON.stringify(fmts), JSON.stringify(seq), '', '', T(), id, tpl.tema || 'geral'); row = one('SELECT * FROM art_templates WHERE id=?', +r.lastInsertRowid); }
    else if (bC && !row.brand && !row.base) run('UPDATE art_templates SET brand=? WHERE id=?', bC, row.id);   // estilo sem dono: quem edita primeiro passa a ser a marca dele
    const mapa = visMapa(row), agora = T(), k0 = String(c.brand || '').toLowerCase(); const snapsN = { ...(mapa[k0]?.snaps || {}), [c.format]: sp }; let autoFeed = c.format === 'feed' ? false : !!mapa[k0]?.autoFeed;
    if (c.format === 'carrossel' && fmts.includes('feed') && (!snapsN.feed || autoFeed) && sp.slides?.[0]) { snapsN.feed = { ...sp, slides: [sp.slides[0]] }; autoFeed = true; }   // a vitrine do feed mostra a capa que o dono acabou de salvar (até ele salvar um feed próprio)
    mapa[k0] = { brand: c.brand || '', at: agora, pages: vis, snaps: snapsN, autoFeed };   // pages = o que muda (vale para conteúdos novos); snaps = a arte inteira como ficou (vitrine e reabrir)
    run('UPDATE art_templates SET nome=?, seq=?, formatos=?, exemplo=?, visual=?, visual_brand=?, visual_at=? WHERE id=?', nome, JSON.stringify(seq), JSON.stringify(fmts), '', JSON.stringify(mapa), c.brand || '', agora, row.id);
    const resumo = (() => {   // o que o sistema guardou deste estilo (para o dono conferir na hora)
      const NM = { color: 'cor', color2: 'cor 2', opacity: 'transparência', rot: 'giro', font: 'fonte', weight: 'peso', align: 'alinhamento', hide: 'visibilidade', stroke: 'contorno', radius: 'cantos', shadow: 'sombra', caixa: 'caixa', ls: 'espaçamento', lh: 'altura da linha', hl: 'cor do destaque', icon_color: 'cor do ícone', round: 'forma', z: 'ordem' };
      const ROT = { title: 'título', body: 'texto', label: 'chamada', badge: 'selo', cta: 'botão', footer: 'rodapé', number: 'número', hero: 'imagem principal' }, L = [];
      vis.forEach((pg, i) => { if (!pg) return; const q = [];
        for (const [grupo, kind] of [['t', ''], ['it', ''], ['sh', 'forma ']]) for (const [k, d] of Object.entries(pg[grupo] || {})) { const nome = kind + (ROT[k.split('#')[0]] || k.split('#')[0]); if (d.fora) { q.push(`${nome}: removido`); continue; } const m = []; if (d.p) for (const key of Object.keys(d.p)) { if (key === 'rot' && !d.p[key]) continue; if (key === 'round') continue; m.push(NM[key] || key); } if (d.dx || d.dy) m.push('posição'); if (d.rsize || d.rw || d.rh) m.push('tamanho'); if (m.length) q.push(`${nome}: ${[...new Set(m)].join(', ')}`); }
        const add = (pg.addT?.length || 0) + (pg.addI?.length || 0) + (pg.addS?.length || 0); if (add) q.push(`${add} elemento(s) acrescentado(s)`);
        if (Object.keys(pg.bg || {}).length) q.push('fundo'); if (Object.keys(pg.fx || {}).length) q.push('efeitos'); if (Object.keys(pg.top || {}).filter(k => k !== 'shade_dir').length || (pg.top?.shade_dir && 0)) q.push('escurecimento/ajustes da página');
        if (q.length) L.push(`Página ${i + 1} (${pg.modelo}): ` + q.join(' · ')); });
      return L;
    })();
    log('designer', `Estilo salvo: “${nome}” (${seq.length} página(s), visual completo${c.brand ? ' da marca ' + c.brand : ''})`); brainLayoutSalvo(c, 'estilo', nome, c.brand || ''); changed(); return send(res, 200, { id: tplDono(one('SELECT * FROM art_templates WHERE id=?', row.id)).id, resumo });
  }
  if ((mt = p.match(/^\/api\/art-templates\/dono-(\d+)$/))) {
    const row = one('SELECT * FROM art_templates WHERE id=?', +mt[1]); if (!row) throw fail(404, 'Template não encontrado');
    if (m === 'DELETE') { lixeiraGuarda('estilo', row, 'Apagado por você'); run('DELETE FROM art_templates WHERE id=?', row.id); limpaReferenciasArte('estilo', row.id, row.brand); log('designer', `Estilo apagado (fica ${LIXEIRA_DIAS} dias na lixeira para recuperar): “${row.nome}”${row.brand ? ' da marca ' + row.brand : ''}`); changed(); return send(res, 200, { ok: true, lixeira: LIXEIRA_DIAS }); }
    if (m === 'PUT') { const b = await readBody(req, 2e4);
      if (row.central) throw fail(400, 'Este estilo vem da Biblioteca Central: duplique para criar a sua versão.');
      const seq = Array.isArray(b.seq) ? seqOk(b.seq) : null, fm = Array.isArray(b.formatos) ? b.formatos.filter(f => ['feed', 'carrossel', 'stories'].includes(f)) : null;
      run('UPDATE art_templates SET tema=?, nome=?, uso=?, nivel=?, seq=?, formatos=?, exemplo=? WHERE id=?', TEMAS[b.tema] ? b.tema : (row.tema || 'geral'), str(b.nome ?? row.nome, 80, 'Nome'), str(b.uso ?? row.uso, 400, 'Quando usar', false), b.nivel === 'robusto' ? 'robusto' : b.nivel === 'simples' ? 'simples' : row.nivel, seq ? JSON.stringify(seq) : row.seq, fm?.length ? JSON.stringify(fm) : row.formatos, seq && JSON.stringify(seq) !== row.seq ? '' : row.exemplo, row.id);   // mudou as páginas: o exemplo antigo deixa de valer
      changed(); return send(res, 200, { ok: true }); }
  }
  if ((mt = p.match(/^\/api\/contents\/(\d+)\/arte(?:\/(file\/\d+|zip|render|spec|modelo|do-roteiro|atualizar-layout))?$/))) {
    const id = +mt[1], c = getContent(id); if (!c) throw fail(404, 'Conteúdo não encontrado');
    if (!mt[2] && m === 'GET') return send(res, 200, arteInfo(id));
    if (mt[2] === 'spec' && m === 'POST') {
      const b = await readBody(req, 4e6); let txt = str(b.text, 200000, 'Especificação').trim();
      if (txt.startsWith('{')) txt = '```json\n' + txt + '\n```';
      const sp = extractArteSpec(txt, c.format, c); if (!sp) throw fail(400, 'Não encontrei uma especificação válida: cole o bloco JSON com a lista "slides".');
      if (sp.format !== c.format && ['feed', 'carrossel'].includes(c.format)) setContent(id, { format: sp.format });
      setContent(id, { art_spec: JSON.stringify(sp.spec), art_status: '', art_note: '' }); renderArte(id); return send(res, 200, { ...arteInfo(id), status: 'running' });
    }
    if (mt[2] === 'atualizar-layout' && m === 'POST') {   // aplica o layout atual dos modelos nesta peça (só se a arte não foi editada à mão)
      if (c.art_spec !== c.art_spec_base) throw fail(409, 'Você editou esta arte à mão; ela não é refeita sozinha.');
      const ok = await recomporLayoutPeca(id); changed(); return send(res, 200, { ...arteInfo(id), atualizada: ok });
    }
    if (mt[2] === 'do-roteiro' && m === 'POST') {   // monta a arte direto do roteiro no modelo do dono (sem IA); o pedido do Designer na fila sai
      if (!c.script) throw fail(400, 'Esta peça ainda não tem roteiro');
      if (!paginasDoRoteiro(c.script, c.format, c.brand)) throw fail(400, 'O roteiro não está no modelo de páginas ("📌 Slide 1 — CAPA" com "Título:", "Texto:"…). Peça ao Designer pelo chat ou ajuste o roteiro.');
      if (arteState.get(id)?.status === 'running') throw fail(409, 'A arte desta peça já está sendo gerada');
      const ok = await arteDoRoteiro(id, 'pedido do dono'); if (!ok) throw fail(400, 'Não consegui montar a arte pelo roteiro');
      for (const j of all("SELECT id FROM jobs WHERE content_id=? AND agent='designer' AND kind='arte' AND status='queued'", id)) run("UPDATE jobs SET status='done', finished_at=?, output='Montada pelo painel a partir do roteiro' WHERE id=?", T(), j.id);
      checkProduction(id); changed(); return send(res, 200, arteInfo(id));
    }
    if (mt[2] === 'modelo' && m === 'POST') {   // editor: (re)compõe uma página com um modelo profissional, com as cores, fontes, logo e moldura da marca
      const b = await readBody(req, 2e5), mod = String(b.modelo || ''); if (!MODELO_IDS.includes(mod)) throw fail(400, 'Modelo desconhecido');
      const cur = jparse(c.art_spec, {}), n = Math.max(1, Math.min(+b.total || (cur.slides || []).length || 1, ART_MAX[c.format] || 10)), i = Math.max(0, Math.min(n - 1, +b.i || 0));
      const sl = comporSlide({ modelo: mod, dados: dadosOk(b.dados) }, { ...ctxMarca(c.brand, c.format, cur), i, total: n });
      const out = sanitizeArteSpec({ slides: [sl] }, 'carrossel'); return send(res, 200, { slide: out.slides[0] });
    }
    if (mt[2] === 'render' && m === 'POST') {
      const b = await readBody(req, 1e4);
      if (c.kind === 'noticia' && c.script) { try { const sp0 = JSON.parse(c.art_spec || '{}'); const noModelo = !((sp0.slides || []).length === 1 && (sp0.slides[0].texts || []).some(t => t.font === 'impact')); if (noModelo && await arteDoRoteiro(id, 'recompor: arte fora do template de notícia')) return send(res, 200, { ...arteInfo(id), status: 'ok' }); } catch { /* segue com a arte salva */ } }   // arte antiga de notícia que não está no template de notícia é refeita pelo roteiro
      renderArte(id, { regen: !!b.regen }); return send(res, 200, { ...arteInfo(id), status: 'running' });
    }
    if (mt[2] === 'zip' && m === 'GET') {
      const fl = arteFiles(id); if (!fl.length) throw fail(404, 'Ainda não há imagens');
      const base = slugName(c.title) || 'arte';
      const buf = zipStore(fl.map((f, i) => ({ name: `${base}-${String(i + 1).padStart(2, '0')}.png`, data: fs.readFileSync(path.join(ARTE_DIR(id), f)) })));
      res.writeHead(200, { 'content-type': 'application/zip', 'content-length': buf.length, 'content-disposition': `attachment; filename="${base}-${id}.zip"`, 'cache-control': 'no-store' }); return res.end(buf);
    }
    if (mt[2]?.startsWith('file/') && m === 'GET') {
      const n = +mt[2].slice(5), fl = arteFiles(id), f = fl[n - 1]; if (!f) throw fail(404, 'Imagem não encontrada');
      const rv = url.searchParams.get('review'), fp = path.join(ARTE_DIR(id), rv ? f.replace('.png', '.review.jpg') : f);
      const hd = { 'content-type': rv ? 'image/jpeg' : 'image/png', 'cache-control': 'no-store' };
      if (url.searchParams.get('download')) hd['content-disposition'] = `attachment; filename="${slugName(c.title) || 'arte'}-${String(n).padStart(2, '0')}.png"`;
      res.writeHead(200, hd); return res.end(fs.readFileSync(fp));
    }
  }

  // ── Estúdio de arte: artes avulsas, editor visual, layouts por marca
  if (p === '/api/art-studio' && m === 'GET') {
    const items = all('SELECT id,title,brand,format,status,art_status,art_spec,updated_at FROM contents WHERE teste=2 ORDER BY id DESC LIMIT 80').map(({ art_spec, ...c }) => ({ ...c, slides: (jparse(art_spec, {}).slides || []).length, thumb: arteFiles(c.id).length ? `/api/contents/${c.id}/arte/file/1?review=1&t=${encodeURIComponent(c.updated_at)}` : '', rendering: arteState.get(c.id)?.status === 'running', job: one("SELECT id FROM jobs WHERE content_id=? AND status IN ('queued','running') ORDER BY id DESC", c.id)?.id || null }));
    return send(res, 200, { items, formats: ART_FORMATS.map(f => ({ id: f, label: FMT_ROTULO[f], w: ART_SIZE[f][0], h: ART_SIZE[f][1] })), manual: MANUAL });
  }
  if (p === '/api/art-studio' && m === 'POST') {
    const b = await readBody(req, 2e5), modo = ['agente', 'branco', 'layout', 'estilo'].includes(b.modo) ? (b.modo === 'branco' ? 'estilo' : b.modo) : 'estilo';
    const lay = modo === 'layout' || b.layout_id ? one('SELECT * FROM art_layouts WHERE id=?', +b.layout_id) : null;
    if (modo === 'layout' && !lay) throw fail(404, 'Layout não encontrado');
    const format = lay && modo === 'layout' ? lay.format : (ART_FORMATS.includes(b.format) ? b.format : 'feed');
    const brand = brandName(b.brand ?? lay?.brand ?? ''), pedido = String(b.pedido || '').trim().slice(0, 6000);
    if (modo === 'agente' && pedido.length < 5) throw fail(400, 'Descreva a arte que o Designer deve criar');
    const title = String(b.titulo || pedido || lay?.name || 'Arte avulsa').replace(/\s+/g, ' ').trim().slice(0, 70);
    const brief = `ARTE AVULSA pedida pelo dono (não é uma peça de pipeline): não existe roteiro nem legenda. O texto em "PEDIDO" descreve exatamente o que deve estar na arte e o objetivo dela; use as palavras do dono nos textos da arte quando ele as fornecer.`;
    const pagsPedido = format === 'carrossel' || format === 'stories' ? Math.max(2, Math.min(ART_MAX[format] || 10, Math.round(+b.paginas || 0))) : 0;
    const r = run("INSERT INTO contents(title,format,kind,platform,brief,script,brand,status,teste,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,2,'manual',?,?)", title, format, 'educativo', 'teste', brief, `# PEDIDO\n${pedido || title}${b.paginas && pagsPedido ? `\n\nFORMATO: ${format === 'stories' ? 'sequência de stories' : 'carrossel'} com EXATAMENTE ${pagsPedido} páginas (slides), uma ideia por página: capa que prende, páginas de conteúdo e a última com a chamada para ação.` : ''}`, brand, 'awaiting_approval', T(), T());
    const id = +r.lastInsertRowid;
    if (modo === 'agente') {
      const job = enqueue(id, 'designer', 'arte', { layout_id: lay ? lay.id : (+b.layout_id || undefined) }, 'manual');
      log('designer', `Arte avulsa na fila: "${title}"`, id); changed();
      return send(res, 200, { id, job });
    }
    let spec;
    if (modo === 'estilo') {   // monta a peça com o ESTILO aprovado (modelos profissionais) e a identidade da marca
      const pags = format === 'feed' ? 1 : Math.max(format === 'stories' ? 1 : 2, Math.min(ART_MAX[format] || 10, Math.round(+b.paginas || (format === 'carrossel' ? 7 : 3))));
      const lidas = !b.template && paginasDoRoteiro(pedido, format, brand);   // o dono colou um roteiro no modelo ("📌 Slide 1 — CAPA"…): as páginas saem dele
      spec = compoeModelos({ slides: lidas || estruturaEstilo(format, pags, { ...b, template: b.template && templateDe(b.template) ? b.template : undefined }, brand), estilo: lidas ? escolheEstilo({ title: b.titulo || '', script: pedido, brand }, format) || undefined : undefined }, format, brand);
      if (lidas) { const cap = parseCaption(pedido), tt = String(lidas[0].dados.titulo || '').replace(/[*|]/g, '').replace(/\s+/g, ' ').trim(); setContent(id, { caption: cap || '', ...(b.titulo ? {} : { title: tt.slice(0, 70) || title }) }); }
      if (b.template && templateDe(b.template)) { try { run('UPDATE art_templates SET usos=usos+1 WHERE id=?', +String(b.template).replace('dono-', '') || 0); } catch { /* casa */ } }
      const clean = sanitizeArteSpec(spec, format); if (!clean) throw fail(400, 'Não consegui montar a arte');
      setContent(id, { art_spec: JSON.stringify(clean), art_spec_base: JSON.stringify(clean), art: '', art_status: '' });
      renderArte(id); changed(); log('designer', `Arte montada com o estilo da marca: "${title}"`, id);
      return send(res, 200, { id });
    }
    if (lay) {
      spec = jparse(lay.spec, {}); run('UPDATE art_layouts SET uses=uses+1 WHERE id=?', lay.id);
      const want = format === 'feed' ? 1 : Math.round(+b.paginas || 0);
      if (want > 0 && Array.isArray(spec.slides) && spec.slides.length) {   // ajusta o número de páginas repetindo a página do meio (a capa e a última ficam)
        const sl = spec.slides, mid = sl.length > 2 ? sl[Math.floor(sl.length / 2)] : sl[0];
        while (sl.length < want) sl.splice(Math.max(1, sl.length - 1), 0, JSON.parse(JSON.stringify(mid)));
        if (sl.length > want) spec.slides = [...sl.slice(0, Math.max(1, want - 1)), ...(want > 1 ? [sl[sl.length - 1]] : [])];
      }
    }
    else {
      const logo = one("SELECT name FROM assets WHERE kind='logo' AND (brand=? COLLATE NOCASE OR brand='') ORDER BY (brand<>'') DESC, id LIMIT 1", brand);
      const pags = format === 'feed' ? 1 : Math.max(1, Math.min(ART_MAX[format] || 10, Math.round(+b.paginas || (format === 'carrossel' ? 5 : 1))));
      const lg = logo ? [{ asset: logo.name, x: .5, y: .94, size: 190 }] : [];
      const capa = { bg: {}, shade: 0, pager: pags > 1, texts: [{ role: 'badge', value: 'CATEGORIA', x: .5, y: .12 }, { role: 'title', value: 'Seu título *aqui*', x: .5, y: .45 }, { role: 'body', value: pags > 1 ? 'Arraste para o lado' : 'Texto de apoio em uma ou duas linhas.', x: .5, y: .64 }, ...(pags > 1 ? [] : [{ role: 'cta', value: 'Saiba mais', x: .5, y: format === 'stories' ? .8 : .84 }])], items: lg, shapes: [] };
      const meio = n => ({ bg: {}, shade: 0, pager: true, texts: [{ role: 'number', value: String(n).padStart(2, '0'), x: .5, y: .2 }, { role: 'title', value: 'Ponto ' + n, x: .5, y: .42 }, { role: 'body', value: 'Explique este ponto em uma ou duas linhas.', x: .5, y: .6 }], items: lg, shapes: [] });
      const fim = { bg: {}, shade: 0, pager: true, texts: [{ role: 'title', value: 'Gostou? *Salve* e compartilhe', x: .5, y: .42 }, { role: 'cta', value: 'Saiba mais', x: .5, y: .62 }], items: lg, shapes: [] };
      spec = { slides: pags === 1 ? [capa] : [capa, ...Array.from({ length: pags - 2 }, (_, i) => meio(i + 1)), fim] };
    }
    const clean = sanitizeArteSpec(spec, format); if (!clean) throw fail(400, 'Layout sem conteúdo');
    clean.editada = true;
    setContent(id, { art_spec: JSON.stringify(clean), art_spec_base: JSON.stringify(clean), art: '', art_status: '' });
    renderArte(id); changed();
    return send(res, 200, { id });
  }
  if ((mt = p.match(/^\/api\/art-studio\/(\d+)(?:\/(editor|spec|aprovar|ajustes|diff|res\/[\w.-]+))?$/))) {
    const id = +mt[1], c = getContent(id); if (!c) throw fail(404, 'Arte não encontrada');
    if (!mt[2] && m === 'DELETE') { if (c.teste !== 2) throw fail(400, 'Só artes avulsas podem ser apagadas aqui'); run('DELETE FROM contents WHERE id=?', id); cleanRender(id); log(null, `Arte avulsa removida: "${c.title}"`); changed(); return send(res, 200, { ok: true }); }
    if (mt[2]?.startsWith('res/') && m === 'GET') {
      const nm = mt[2].slice(4); if (!/^(bg|it)-[\d-]+\.(png|jpe?g|webp)$/.test(nm)) throw fail(404, 'Imagem não encontrada');
      const fp = path.join(ARTE_DIR(id), 'res', nm); if (!fs.existsSync(fp)) throw fail(404, 'Imagem não encontrada');
      res.writeHead(200, { 'content-type': /png$/.test(nm) ? 'image/png' : /webp$/.test(nm) ? 'image/webp' : 'image/jpeg', 'cache-control': 'no-store' }); return res.end(fs.readFileSync(fp));
    }
    if (mt[2] === 'editor' && m === 'GET') {
      const sp = jparse(c.art_spec); if (!sp?.slides?.length) throw fail(400, 'Esta peça ainda não tem uma arte para editar (a especificação visual não foi entregue).');
      const [w, h] = ART_SIZE[c.format] || [1080, 1350], idv = identidadeDe(c.brand), comp = styleParams(c.brand).composicao || {};
      const IMG = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'], FONT = ['ttf', 'otf', 'woff', 'woff2'];
      const lib = all("SELECT id,name,kind,brand,ext FROM assets WHERE (brand=? COLLATE NOCASE OR brand='') ORDER BY (brand<>'') DESC, kind, name", c.brand || '');
      const find = n => { n = slugName(n); return lib.find(a => a.name === n && (a.brand || '').toLowerCase() === (c.brand || '').toLowerCase()) || lib.find(a => a.name === n && !a.brand); };
      const spec = JSON.parse(JSON.stringify(sp));
      if (!spec.editada) spec.slides.forEach((s, i) => { if (s.modelo) return; try { composicaoAplica(s, comp, i, []); } catch { /* composição opcional */ } });
      const rd = path.join(ARTE_DIR(id), 'res'), resFiles = (() => { try { return fs.readdirSync(rd); } catch { return []; } })();
      const resUrl = pre => { const f = resFiles.find(x => x.startsWith(pre + '.')); return f ? `/api/art-studio/${id}/res/${f}` : ''; };
      const fa = find(spec.font_asset || idv.fontAsset || ''), font = fa && FONT.includes(fa.ext) ? { family: 'BrandFont', src: `/api/assets/${fa.id}/file` } : null;
      const resolved = spec.slides.map((s, i) => ({
        bg: s.bg?.asset ? (find(s.bg.asset) && IMG.includes(find(s.bg.asset).ext) ? `/api/assets/${find(s.bg.asset).id}/file` : '') : (s.bg?.gen || s.bg?.banco ? resUrl(`bg-${i + 1}`) : ''),
        items: (s.items || []).map((it, k) => ((it.pose || ((it.gen || it.banco) && !it.asset)) && resUrl(`it-${i + 1}-${k}`)) || (find(it.asset) && IMG.includes(find(it.asset).ext) ? `/api/assets/${find(it.asset).id}/file` : ''))
      }));
      const base = jparse(c.art_spec_base);
      const panoUrl = spec.pano ? (spec.pano.asset ? (find(spec.pano.asset) ? `/api/assets/${find(spec.pano.asset).id}/file` : '') : resUrl('pano')) : '';
      return send(res, 200, {
        id, title: c.title, brand: c.brand, format: c.format, teste: c.teste, status: c.status, w, h, spec, resolved, font, pano_url: panoUrl, base_ajustes: base ? arteDiff(base, sp).length : 0,
        defaults: { accent: idv.accent || brandColors()[c.brand] || '#f59e0b', ink: idv.ink || '#ffffff', paper: idv.paper || '#0b0b0d', fonte: idv.fontAsset || '' },
        palette: [...new Set([idv.accent, brandColors()[c.brand], idv.ink, idv.paper, ...(idv.apoio || []), ...(idv.cores || [])].filter(x => /^#[0-9a-f]{6}$/i.test(x || '')).map(x => x.toLowerCase()))].slice(0, 12),
        assets: lib.filter(a => IMG.includes(a.ext)).map(a => ({ id: a.id, name: a.name, kind: a.kind, brand: a.brand, url: `/api/assets/${a.id}/file`, thumb: `/api/assets/${a.id}/thumb` })),
        layout_origem: (() => { const m0 = /^l:(\d+)$/.exec(c.estilo_arte || ''), lo = m0 ? one('SELECT id,name,brand FROM art_layouts WHERE id=?', +m0[1]) : null; return lo ? { id: lo.id, name: lo.name, brand: lo.brand } : null; })(),
        checks: checksLer(c.art_checks), arte: arteInfo(id), layouts: all("SELECT * FROM art_layouts ORDER BY (brand=? COLLATE NOCASE) DESC, (brand='') DESC, brand COLLATE NOCASE, id DESC LIMIT 400", c.brand || '').filter(l => sameDims(l.format, c.format)).map(layoutPub), fal: !!falKey() && settings().art_gen === '1'
      });
    }
    if (mt[2] === 'spec' && m === 'PUT') {
      if (c.teste === 0 && !['awaiting_approval', 'blocked', 'awaiting_script', 'approved'].includes(c.status)) throw fail(409, 'Esta peça está em produção agora; espere terminar para editar a arte.');
      const b = await readBody(req, 4e6), fmt = ['feed', 'carrossel'].includes(b.format) && ['feed', 'carrossel'].includes(c.format) ? b.format : c.format, clean = sanitizeArteSpec(b.spec, fmt); if (!clean) throw fail(400, 'A arte precisa de ao menos um slide');
      if (fmt !== c.format) { setContent(id, { format: fmt }); log(null, `Arte "${c.title}" virou ${fmt === 'carrossel' ? 'carrossel' : 'post de feed'}`, id); }
      clean.editada = true;
      if (arteState.get(id)?.status === 'running') throw fail(409, 'A imagem ainda está sendo gerada; aguarde alguns segundos e salve de novo.');
      const base = c.art_spec_base || c.art_spec;
      setContent(id, { art_spec: JSON.stringify(clean), art_spec_base: base, art_status: '', art_note: '' });
      renderArte(id, { regen: false }); changed();
      return send(res, 200, { ok: true, ajustes: arteDiff(jparse(base), clean).length, status: 'running' });
    }
    if (mt[2] === 'diff' && m === 'GET') { const d = jparse(c.art_spec_base) && jparse(c.art_spec) ? arteDiff(jparse(c.art_spec_base), jparse(c.art_spec)) : []; return send(res, 200, { items: d.map((x, i) => ({ i, txt: x.txt, learn: !!x.learn })) }); }
    if (mt[2] === 'aprovar' && m === 'POST') {
      const b = await readBody(req, 2e4);
      if (arteState.get(id)?.status === 'running') throw fail(409, 'A imagem ainda está sendo gerada; aguarde alguns segundos.');
      if (!c.art_spec) throw fail(400, 'Sem arte para aprovar');
      const ap = arteAprende(c, Array.isArray(b.ignorar) ? b.ignorar.map(Number) : []); ap.memorizado = aprendePedidos(id); let layout = null;
      if (b.salvar_layout) layout = layoutSalva(getContent(id), b.layout_nome || b.nome, b.layout_brand != null ? brandName(b.layout_brand) : (c.brand || ''), 'edicao', { modo: b.layout_modo === 'novo' ? 'novo' : 'auto' });
      if (c.teste === 2) setContent(id, { status: 'approved' });
      log(null, `Você aprovou a arte${ap.ajustes ? ` editada (${ap.ajustes} ajuste${ap.ajustes > 1 ? 's' : ''})` : ''}: "${c.title}"`, id); changed();
      return send(res, 200, { ok: true, ...ap, layout });
    }
    if (mt[2] === 'ajustes' && m === 'POST') {
      const b = await readBody(req, 2e4), fb = String(b.pedido || '').trim().slice(0, 4000); if (fb.length < 4) throw fail(400, 'Diga o que o Designer deve mudar');
      if (c.teste === 0) throw fail(400, 'Para peças do pipeline use “Pedir ajustes” na própria peça.');
      registraPedido(c, 'designer', fb); brainEvent('designer', 'ajuste_dono', c, `O dono pediu ajustes na arte (${c.format})`, 'Pedido: ' + fb); brainAprendeDoDono('designer', c, fb);
      const job = enqueue(id, 'designer', 'arte', { feedback: fb, from: 'dono' }, 'manual'); changed();
      return send(res, 200, { ok: true, job });
    }
  }
  if (p === '/api/art-layouts' && m === 'GET') {
    const brand = url.searchParams.get('brand'), rows = brand == null ? all('SELECT * FROM art_layouts ORDER BY brand COLLATE NOCASE, id DESC') : all('SELECT * FROM art_layouts WHERE brand=? COLLATE NOCASE ORDER BY id DESC', brand);
    return send(res, 200, { layouts: rows.map(layoutPub) });
  }
  if (p === '/api/art-layouts' && m === 'POST') {
    const b = await readBody(req, 2e4), c = getContent(+b.content_id); if (!c) throw fail(404, 'Arte não encontrada');
    const meta = { uso: b.uso, tema: b.tema, modo: b.modo === 'novo' ? 'novo' : 'auto' }, id = layoutSalva(c, b.name, b.brand != null ? brandName(b.brand) : (c.brand || ''), 'dono', meta); changed();
    return send(res, 200, { id, ...(meta.out || {}) });
  }
  // ── Replicar um layout para outras marcas: copia a diagramação e troca cores/fonte pela identidade da marca de destino (o que é da marca de origem — mascote, logo, fotos — não vai junto)
  if ((mt = p.match(/^\/api\/art-layouts\/(\d+)\/replicar$/)) && m === 'POST') {
    const l = one('SELECT * FROM art_layouts WHERE id=?', +mt[1]); if (!l) throw fail(404, 'Layout não encontrado');
    const b = await readBody(req, 1e4), alvos = [...new Set((Array.isArray(b.brands) ? b.brands : []).map(x => brandName(x)).filter(x => x && !mesmaMarca(x, l.brand)))].slice(0, 12);
    if (!alvos.length) throw fail(400, 'Escolha ao menos uma marca de destino');
    const sp0 = jparse(l.spec, {}), src = { accent: sp0.accent, ink: sp0.ink, paper: sp0.paper }, criados = [];
    for (const dest of alvos) {
      const idv = identidadeDe(dest), mapa = {}; for (const k of ['accent', 'ink', 'paper']) if (/^#[0-9a-f]{6}$/i.test(src[k] || '') && /^#[0-9a-f]{6}$/i.test(idv[k] || '')) mapa[src[k].toLowerCase()] = idv[k].toLowerCase();
      let txt = JSON.stringify(sp0); for (const [de, para] of Object.entries(mapa)) txt = txt.replace(new RegExp(de.replace('#', '\\#'), 'gi'), para);
      const sp = JSON.parse(txt); if (idv.fontAsset) sp.font_asset = idv.fontAsset; else delete sp.font_asset;
      for (const sl of sp.slides || []) { if (sl.bg?.asset && !assetDaMarca(dest, sl.bg.asset)) delete sl.bg.asset; sl.items = (sl.items || []).filter(it => !it.asset || assetDaMarca(dest, it.asset)); }
      let nome = `${l.name} (${dest})`.slice(0, 80); const ja = one('SELECT id FROM art_layouts WHERE brand=? COLLATE NOCASE AND name=? COLLATE NOCASE AND format=?', dest, nome, l.format);
      if (ja) { lixeiraGuarda('layout_versao', one('SELECT * FROM art_layouts WHERE id=?', ja.id), 'Versão anterior (antes de replicar de novo)'); run('UPDATE art_layouts SET spec=?, updated_at=? WHERE id=?', JSON.stringify(sp), T(), ja.id); criados.push({ brand: dest, id: ja.id, atualizado: true }); continue; }
      const nid = +run('INSERT INTO art_layouts(brand,name,format,spec,origem,created_at,updated_at,uso,tema) VALUES(?,?,?,?,?,?,?,?,?)', dest, nome, l.format, JSON.stringify(sp), 'replica', T(), T(), l.uso || '', l.tema || '').lastInsertRowid;
      try { fs.copyFileSync(path.join(LAYOUT_DIR, l.id + '.jpg'), path.join(LAYOUT_DIR, nid + '.jpg')); } catch { /* sem miniatura */ }
      criados.push({ brand: dest, id: nid });
    }
    log('designer', `Layout “${l.name}” (${l.brand || 'geral'}) replicado para: ${criados.map(x => x.brand).join(', ')} (cores e fonte da identidade de cada marca; confira no editor)`);
    try { brainSincronizaSalvos(); run("INSERT INTO brain_events(ts,agent,kind,content_id,brand,title,summary,detail,tags,formato) VALUES(?,?,?,?,?,?,?,?,?,?)", T(), 'designer', 'layout_replicado', null, l.brand || '', '', `Você replicou o layout “${l.name}” para ${criados.map(x => x.brand).join(', ')}: a mesma diagramação passa a valer nessas marcas`.slice(0, 400), '', tagsSql([]), fmtGrupo(l.format)); } catch { /* ok */ }
    changed(); return send(res, 200, { ok: true, criados });
  }
  // ── Lixeira: 7 dias para recuperar
  if (p === '/api/lixeira' && m === 'GET') {
    lixeiraLimpa(); const marca = url.searchParams.get('brand') || '';
    return send(res, 200, { dias: LIXEIRA_DIAS, itens: all(`SELECT * FROM lixeira_arte${marca ? ' WHERE brand=? COLLATE NOCASE' : ''} ORDER BY id DESC LIMIT 100`, ...(marca ? [marca] : [])).map(lixeiraPub) });
  }
  if ((mt = p.match(/^\/api\/lixeira\/(\d+)(\/thumb|\/recuperar)?$/))) {
    const r = one('SELECT * FROM lixeira_arte WHERE id=?', +mt[1]); if (!r) throw fail(404, 'Item não está mais na lixeira');
    if (mt[2] === '/thumb' && m === 'GET') { if (!r.thumb) throw fail(404, 'Sem miniatura'); res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' }); return res.end(Buffer.from(r.thumb, 'base64')); }
    if (mt[2] === '/recuperar' && m === 'POST') {
      const d = jparse(r.dados, null); if (!d) throw fail(400, 'Item corrompido');
      let msg = '';
      if (r.tipo === 'layout_versao') {
        const vivo = one('SELECT * FROM art_layouts WHERE id=?', r.orig_id);
        if (vivo) { lixeiraGuarda('layout_versao', vivo, 'Versão anterior (antes de voltar a uma versão antiga)'); run('UPDATE art_layouts SET spec=?, name=?, updated_at=? WHERE id=?', d.spec, d.name, T(), vivo.id); }
        else { const nid = +run('INSERT INTO art_layouts(brand,name,format,spec,origem,created_at,updated_at,uso,tema) VALUES(?,?,?,?,?,?,?,?,?)', d.brand || '', d.name, d.format, d.spec, d.origem || 'dono', d.created_at || T(), T(), d.uso || '', d.tema || '').lastInsertRowid; if (r.thumb) fs.writeFileSync(path.join(LAYOUT_DIR, nid + '.jpg'), Buffer.from(r.thumb, 'base64')); }
        msg = `Voltou à versão anterior do layout “${d.name}”`;
      } else if (r.tipo === 'layout') {
        const livre = !one('SELECT 1 x FROM art_layouts WHERE id=?', d.id), nome = one('SELECT 1 x FROM art_layouts WHERE brand=? COLLATE NOCASE AND name=? COLLATE NOCASE AND format=?', d.brand || '', d.name, d.format) ? d.name + ' (recuperado)' : d.name;
        const nid = livre ? d.id : null, q = livre ? run('INSERT INTO art_layouts(id,brand,name,format,spec,origem,uses,created_at,updated_at,uso,tema) VALUES(?,?,?,?,?,?,?,?,?,?,?)', nid, d.brand || '', nome, d.format, d.spec, d.origem || 'dono', d.uses || 0, d.created_at || T(), T(), d.uso || '', d.tema || '') : run('INSERT INTO art_layouts(brand,name,format,spec,origem,uses,created_at,updated_at,uso,tema) VALUES(?,?,?,?,?,?,?,?,?,?)', d.brand || '', nome, d.format, d.spec, d.origem || 'dono', d.uses || 0, d.created_at || T(), T(), d.uso || '', d.tema || '');
        const fid = +q.lastInsertRowid; if (r.thumb) { try { fs.writeFileSync(path.join(LAYOUT_DIR, fid + '.jpg'), Buffer.from(r.thumb, 'base64')); } catch { /* sem miniatura */ } }
        msg = `Layout “${nome}” recuperado`;
      } else if (r.tipo === 'estilo') {
        if (d.brand && !one('SELECT 1 x FROM brands WHERE name=? COLLATE NOCASE', d.brand)) throw fail(400, 'A marca deste estilo não existe mais');
        const livre = !one('SELECT 1 x FROM art_templates WHERE id=?', d.id), cols = ['nome', 'uso', 'nivel', 'formatos', 'seq', 'exemplo', 'brand', 'usos', 'created_at', 'central', 'visual', 'visual_brand', 'base', 'visual_at', 'tema', 'deriva'];
        run(`INSERT INTO art_templates(${livre ? 'id,' : ''}${cols.join(',')}) VALUES(${livre ? '?,' : ''}${cols.map(() => '?').join(',')})`, ...(livre ? [d.id] : []), ...cols.map(k => d[k] ?? ''));
        msg = `Estilo “${d.nome}” recuperado`;
      } else throw fail(400, 'Tipo desconhecido');
      run('DELETE FROM lixeira_arte WHERE id=?', r.id); try { brainSincronizaSalvos(); } catch { /* ok */ }
      log('designer', msg); changed(); return send(res, 200, { ok: true, msg });
    }
    if (!mt[2] && m === 'DELETE') { run('DELETE FROM lixeira_arte WHERE id=?', r.id); try { run('DELETE FROM art_apagados_copia WHERE tabela=? AND ref=?', r.tipo === 'estilo' ? 'art_templates' : 'art_layouts', r.orig_id); } catch { } changed(); return send(res, 200, { ok: true }); }
  }
  if (p === '/api/lixeira/esvaziar' && m === 'POST') { const n = run('DELETE FROM lixeira_arte').changes; try { run('DELETE FROM art_apagados_copia'); } catch { } log('designer', `Lixeira de artes esvaziada (${n} item(ns))`); changed(); return send(res, 200, { ok: true, n }); }
  if ((mt = p.match(/^\/api\/art-layouts\/(\d+)(\/thumb)?$/))) {
    const l = one('SELECT * FROM art_layouts WHERE id=?', +mt[1]); if (!l) throw fail(404, 'Layout não encontrado');
    if (mt[2] && m === 'GET') { const f = path.join(LAYOUT_DIR, l.id + '.jpg'); if (!fs.existsSync(f)) throw fail(404, 'Sem miniatura'); res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' }); return res.end(fs.readFileSync(f)); }
    if (m === 'GET') return send(res, 200, { ...layoutPub(l), spec: jparse(l.spec, {}) });
    if (m === 'PUT') { const b = await readBody(req, 1e4); run('UPDATE art_layouts SET name=?, brand=?, uso=?, tema=?, updated_at=? WHERE id=?', String(b.name ?? l.name).replace(/\s+/g, ' ').trim().slice(0, 80) || l.name, b.brand != null ? brandName(b.brand) : l.brand, b.uso != null ? String(b.uso).replace(/\s+/g, ' ').trim().slice(0, 300) : (l.uso || ''), b.tema != null ? (TEMAS[b.tema] ? b.tema : '') : (l.tema || ''), T(), l.id); try { brainSincronizaSalvos(); } catch { /* ok */ } changed(); return send(res, 200, { ok: true }); }
    if (m === 'DELETE') { lixeiraGuarda('layout', l, 'Apagado por você'); run('DELETE FROM art_layouts WHERE id=?', l.id); try { fs.unlinkSync(path.join(LAYOUT_DIR, l.id + '.jpg')); } catch { /* sem miniatura */ } limpaReferenciasArte('layout', l.id, l.brand); log('designer', `Layout apagado (fica ${LIXEIRA_DIAS} dias na lixeira para recuperar): “${l.name}”${l.brand ? ' da marca ' + l.brand : ''}`); changed(); return send(res, 200, { ok: true, lixeira: LIXEIRA_DIAS }); }
  }

  // ── Cortes (ClippyMe auto-hospedado): vídeo longo → melhores trechos em vertical, com legenda
  if (p === '/api/cortes/status' && m === 'GET') {
    const on = await CM.online();
    return send(res, 200, { online: on, gemini: !!CM.geminiKey(), dashboard: CM.dashboardUrl(), pasta: fs.existsSync(path.join(__dirname, 'clippyme', 'app')) });
  }
  if (p === '/api/cortes' && m === 'GET') {
    const rows = all('SELECT * FROM cortes_jobs ORDER BY id DESC LIMIT 40'), on = rows.some(r => !CM.finalizado(r.status)) ? await CM.online() : false;
    for (const r of rows) if (!CM.finalizado(r.status) && on) { try { const st = await CM.status(r.job_id), rs = CM.resumo(st); run('UPDATE cortes_jobs SET status=?, etapa=?, progresso=?, resumo=?, updated_at=? WHERE id=?', rs.status, rs.etapa, rs.progresso, JSON.stringify(rs), T(), r.id); Object.assign(r, { status: rs.status, etapa: rs.etapa, progresso: rs.progresso, resumo: JSON.stringify(rs) }); if (CM.finalizado(rs.status) && rs.status === 'completed') { log('editor', `ClippyMe terminou: ${rs.clips.length} corte(s) de ${r.url}`); changed(); } } catch (e) { if (e.status === 404) { run("UPDATE cortes_jobs SET status='failed', erro=? WHERE id=?", 'O ClippyMe não conhece mais este trabalho (reiniciou?)', r.id); r.status = 'failed'; r.erro = 'O ClippyMe não conhece mais este trabalho (reiniciou?)'; } } }
    return send(res, 200, { items: rows.map(r => { const rs = jparse(r.resumo, {}); return { id: r.id, url: r.url, brand: r.brand, formato: r.formato, status: r.status, etapa: r.etapa, progresso: r.progresso, erro: r.erro, created_at: r.created_at, detalhe: rs.detalhe || '', clips: rs.clips || [], logs: rs.logs || [] }; }) });
  }
  if (p === '/api/cortes' && m === 'POST') {
    const b = await readBody(req, 1e4), url = String(b.url || '').trim();
    if (!/^https?:\/\/\S+$/i.test(url)) throw fail(400, 'Cole o link do vídeo (YouTube ou outro site com http/https).');
    if (!(await CM.online())) throw fail(503, 'O ClippyMe não está ligado. Rode o iniciar-clippyme.bat (ou instalar-clippyme.bat na primeira vez) e espere 1 minuto.');
    let jobId; try { jobId = await CM.processa({ url, instrucoes: b.instrucoes, formato: b.formato, idioma: b.idioma, reframe: b.reframe }); } catch (e) { throw fail(400, e.message); }
    const brand = b.brand ? brandName(b.brand) : '';
    const r = run('INSERT INTO cortes_jobs(job_id,url,brand,instrucoes,formato,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', jobId, url, brand, String(b.instrucoes || '').slice(0, 1500), b.formato || '9:16', 'queued', T(), T());
    log('editor', `Cortes pedidos ao ClippyMe: ${url}`); changed(); return send(res, 200, { id: +r.lastInsertRowid });
  }
  { const mc = p.match(/^\/api\/cortes\/(\d+)\/(video|importar|cancelar|apagar)(?:\/(\d+))?$/);
    if (mc) {
      const r = one('SELECT * FROM cortes_jobs WHERE id=?', +mc[1]); if (!r) throw fail(404, 'Trabalho não encontrado');
      const clips = jparse(r.resumo, {}).clips || [];
      if (mc[2] === 'apagar' && m === 'POST') { run('DELETE FROM cortes_jobs WHERE id=?', r.id); changed(); return send(res, 200, { ok: true }); }
      if (mc[2] === 'cancelar' && m === 'POST') { try { await CM.cancela(r.job_id); } catch { /* já terminou */ } run("UPDATE cortes_jobs SET status='cancelled' WHERE id=?", r.id); changed(); return send(res, 200, { ok: true }); }
      const clip = clips[+mc[3]]; if (!clip?.url) throw fail(404, 'Corte não encontrado');
      if (!/^\/videos\/[\w.-]+\/[^?#]+$/.test(clip.url)) throw fail(400, 'Endereço de corte inválido');
      if (mc[2] === 'video' && m === 'GET') {
        const up = await CM.arquivo(encodeURI(decodeURI(clip.url)), req.headers.range).catch(() => null); if (!up || !(up.status === 200 || up.status === 206)) throw fail(502, 'O ClippyMe não entregou o vídeo (está ligado?)');
        const h = { 'content-type': up.headers.get('content-type') || 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'no-store' }; for (const k of ['content-length', 'content-range']) if (up.headers.get(k)) h[k] = up.headers.get(k);
        res.writeHead(up.status, h); const { Readable } = await import('node:stream'); Readable.fromWeb(up.body).pipe(res); return;
      }
      if (mc[2] === 'importar' && m === 'POST') {   // grava o corte na Biblioteca (Estúdio de vídeo) para o Editor e o Publicador usarem
        const up = await CM.arquivo(encodeURI(decodeURI(clip.url))).catch(() => null); if (!up || up.status !== 200) throw fail(502, 'O ClippyMe não entregou o vídeo (está ligado?)');
        const buf = Buffer.from(await up.arrayBuffer()); if (!buf.length) throw fail(502, 'Vídeo vazio');
        const ext = (clip.url.match(/\.([a-z0-9]+)$/i) || [, 'mp4'])[1].toLowerCase(), brand = r.brand || '';
        let base = 'corte-' + r.id + '-' + (+mc[3] + 1), name = base, n = 2; while (one('SELECT id FROM assets WHERE brand=? AND name=?', brand, name)) name = base + '-' + n++;
        const a = run('INSERT INTO assets(brand,name,kind,tags,note,colecao,filename,ext,size,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', brand, name, 'video', 'corte, clippyme, vertical', `Corte do ClippyMe: ${clip.titulo}${clip.gancho ? ' · gancho: ' + clip.gancho : ''} · origem ${r.url}`.slice(0, 600), colecaoDe('', 'video'), name + '.' + ext, ext, buf.length, T());
        fs.writeFileSync(path.join(ASSET_DIR, a.lastInsertRowid + '.' + ext), buf);
        const pr = probeAsset(+a.lastInsertRowid, ext); run('UPDATE assets SET dur=?, w=?, h=? WHERE id=?', pr.dur, pr.w, pr.h, +a.lastInsertRowid);
        log('editor', `Corte importado para a Biblioteca: ${name}`); changed(); return send(res, 200, { id: +a.lastInsertRowid, name });
      }
    } }
  // ── Ilha de edição de vídeo (editor com timeline)
  if ((mt = p.match(/^\/api\/video-studio\/(\d+)(?:\/(editor|spec|aprovar|ajustes|diff))?$/))) {
    const id = +mt[1], c = getContent(id); if (!c) throw fail(404, 'Vídeo não encontrado');
    if (mt[2] === 'diff' && m === 'GET') { const d = jparse(c.spec_base) && jparse(c.spec) ? videoDiff(jparse(c.spec_base), jparse(c.spec)) : []; return send(res, 200, { items: d.map((x, i) => ({ i, txt: x.txt, learn: !!x.learn })) }); }
    if (mt[2] === 'editor' && m === 'GET') {
      const sp = jparse(c.spec); if (!sp?.scenes?.length) throw fail(400, 'Este vídeo ainda não tem cenas para editar (o Editor não entregou o spec).');
      const lib = all("SELECT id,name,kind,brand,ext,dur,colecao FROM assets WHERE (brand=? COLLATE NOCASE OR brand='') ORDER BY (brand<>'') DESC, kind, name", c.brand || '');
      const base = jparse(c.spec_base), ri = renderInfo(id);
      return send(res, 200, {
        id, title: c.title, brand: c.brand, format: c.format, teste: c.teste, status: c.status, spec: sp, looks: LOOKS_VALIDOS, estilo: c.estilo_video || '',
        assets: lib.map(a => ({ id: a.id, name: a.name, kind: a.kind, brand: a.brand, ext: a.ext, dur: a.dur, colecao: a.colecao, url: `/api/assets/${a.id}/file`, thumb: `/api/assets/${a.id}/thumb` })),
        base_ajustes: base ? videoDiff(base, sp).length : 0, render: ri, stale: !!(ri.has_video && c.spec_edit_at && ri.video_at && c.spec_edit_at > ri.video_at), checks: checksLer(c.vid_checks), manual: MANUAL
      });
    }
    if (mt[2] === 'spec' && m === 'PUT') {
      const st = renderState.get(id); if (st && ['running', 'queued'].includes(st.status)) throw fail(409, 'O vídeo está sendo renderizado; espere terminar para salvar edições.');
      const b = await readBody(req, 4e6); let clean; try { clean = sanitizeSpec(b.spec); } catch (e) { throw fail(400, e.message); }
      const base = c.spec_base || c.spec;
      setContent(id, { spec: JSON.stringify(clean), spec_base: base, spec_edit_at: T(), render_status: '' });
      try { fs.rmSync(path.join(RENDER_DIR, String(id), 'previa'), { recursive: true, force: true }); } catch { /* sem prévia antiga */ }
      changed(); return send(res, 200, { ok: true, ajustes: videoDiff(jparse(base), clean).length, scenes: clean.scenes.length });
    }
    if (mt[2] === 'aprovar' && m === 'POST') {
      const b = await readBody(req, 2e4); if (!c.spec) throw fail(400, 'Sem vídeo para aprovar');
      const ap = videoAprende(c, Array.isArray(b.ignorar) ? b.ignorar.map(Number) : []); ap.memorizado = aprendePedidos(id); if (c.teste === 1) setContent(id, { status: 'approved' });
      log(null, `Você aprovou o vídeo${ap.ajustes ? ` editado (${ap.ajustes} ajuste${ap.ajustes > 1 ? 's' : ''})` : ''}: "${c.title}"`, id); changed();
      return send(res, 200, { ok: true, ...ap });
    }
    if (mt[2] === 'ajustes' && m === 'POST') {
      const b = await readBody(req, 2e4), fb = String(b.pedido || '').trim().slice(0, 4000); if (fb.length < 4) throw fail(400, 'Diga o que o Editor deve mudar');
      if (c.teste === 0) throw fail(400, 'Para peças do pipeline use “Pedir ajustes” na própria peça.');
      registraPedido(c, 'editor', fb); brainEvent('editor', 'ajuste_dono', c, 'O dono pediu ajustes no vídeo', 'Pedido: ' + fb); brainAprendeDoDono('editor', c, fb);
      const job = enqueue(id, 'editor', 'video', { feedback: fb, from: 'dono' }, 'manual'); changed();
      return send(res, 200, { ok: true, job });
    }
  }

  // ── Motor de vídeo
  if (p === '/api/motor' && m === 'GET') return send(res, 200, motorStatus());
  if ((mt = p.match(/^\/api\/contents\/(\d+)\/render(?:\/(file|previa))?$/))) {
    const id = +mt[1], c = getContent(id); if (!c) throw fail(404, 'Conteúdo não encontrado');
    if (!mt[2] && m === 'GET') return send(res, 200, renderInfo(id));
    if (!mt[2] && m === 'POST') {
      const b = await readBody(req, 1e4); const mode = ['video', 'semvoz', 'rapido', 'mudo', 'previa'].includes(b.mode) ? b.mode : 'video';
      startRender(id, mode); return send(res, 200, renderInfo(id));
    }
    if (mt[2] === 'previa' && m === 'GET') {
      const f = prevFile(id); if (!fs.existsSync(f)) throw fail(404, 'Sem prévia ainda');
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'no-store' }); return res.end(fs.readFileSync(f));
    }
    if (mt[2] === 'file' && m === 'GET') {
      const f = renderFile(id); if (!fs.existsSync(f)) throw fail(404, 'O vídeo ainda não foi renderizado');
      const size = fs.statSync(f).size, rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      const h = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
      if (url.searchParams.get('download')) h['content-disposition'] = `attachment; filename="${slugName(c.title) || 'video'}-${id}.mp4"`;
      if (rg && (rg[1] || rg[2])) {
        let a = rg[1] ? +rg[1] : size - +rg[2], z = rg[1] && rg[2] ? +rg[2] : size - 1; z = Math.min(z, size - 1);
        if (a > z || a >= size) { res.writeHead(416, { 'content-range': `bytes */${size}` }); return res.end(); }
        res.writeHead(206, { ...h, 'content-range': `bytes ${a}-${z}/${size}`, 'content-length': z - a + 1 }); { const rs = fs.createReadStream(f, { start: a, end: z }); res.on('close', () => rs.destroy()); return rs.pipe(res); }
      }
      res.writeHead(200, { ...h, 'content-length': size }); { const rs = fs.createReadStream(f); res.on('close', () => rs.destroy()); return rs.pipe(res); }
    }
  }

  // Inspeção visual (Revisor olha o que foi gerado)
  if ((mt = p.match(/^\/api\/contents\/(\d+)\/inspecao(?:\/(pedido|folha|importar))?$/))) {
    const id = +mt[1], c = getContent(id); if (!c) throw fail(404, 'Conteúdo não encontrado');
    const alvo = (url.searchParams.get('alvo') || '') === 'arte' ? 'arte' : 'video';
    if (!mt[2] && m === 'GET') return send(res, 200, { visual: checksLerObj(c.visual_review), checks: checksLer(c.vid_checks).concat(checksLer(c.art_checks)).filter(x => x.visual), api: !MANUAL });
    if (!mt[2] && m === 'POST') {
      if (MANUAL) throw fail(400, 'Sem chave de API neste painel. Use "Pedir ao Claude" e cole a resposta.');
      const b = await readBody(req, 1e4), al = b.alvo === 'arte' ? 'arte' : 'video';
      const r = al === 'arte' ? await inspecionaArte(id, { corrigir: b.corrigir !== false }) : (await inspecionaVideo(id, { corrigir: b.corrigir !== false })).res;
      return send(res, 200, { res: r });
    }
    if (mt[2] === 'pedido' && m === 'GET') {
      let quadros, dir;
      if (alvo === 'video') { if (!c.spec) throw fail(400, 'Este vídeo ainda não tem cenas'); try { quadros = await quadrosVideo(id); } catch (e) { throw fail(400, e.message); } dir = path.join(RENDER_DIR, String(id), 'previa'); }
      else {
        dir = path.join(RENDER_DIR, String(id), 'insp-arte'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
        quadros = arteFiles(id).slice(0, 8).map((f, i) => { const d = path.join(dir, 'v' + String(i).padStart(2, '0') + '.jpg'); try { fs.copyFileSync(path.join(ARTE_DIR(id), f.replace('.png', '.review.jpg')), d); return { file: d }; } catch { return null; } }).filter(Boolean);
        if (!quadros.length) throw fail(400, 'A arte ainda não foi renderizada');
      }
      try { folhaInspecao(quadros, dir); } catch (e) { throw fail(500, 'Não consegui montar a folha de imagens (ffmpeg): ' + e.message); }
      return send(res, 200, { n: quadros.length, folha: `/api/contents/${id}/inspecao/folha?alvo=${alvo}&t=${Date.now()}`, prompt: promptInspecao(c, alvo, quadros.length).replace('abaixo', 'na imagem anexada (uma folha com todos os quadros, da esquerda para a direita e de cima para baixo)') });
    }
    if (mt[2] === 'folha' && m === 'GET') {
      const f = path.join(RENDER_DIR, String(id), alvo === 'arte' ? 'insp-arte' : 'previa', 'inspecao.jpg'); if (!fs.existsSync(f)) throw fail(404, 'Sem folha ainda');
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store', ...(url.searchParams.get('download') ? { 'content-disposition': `attachment; filename="quadros-${id}.jpg"` } : {}) }); return res.end(fs.readFileSync(f));
    }
    if (mt[2] === 'importar' && m === 'POST') {
      const b = await readBody(req, 2e5), al = b.alvo === 'arte' ? 'arte' : 'video'; let out;
      try { out = leInspecao(String(b.texto || '')); } catch { throw fail(400, 'Não encontrei o JSON na resposta. Cole a resposta inteira do Claude.'); }
      const r = inspecaoSalva(c, al, out); if (b.corrigir !== false) corrigeVisual(c, al, r);
      changed(); return send(res, 200, { res: r });
    }
  }

  // ── Agentes
  if (p === '/api/agents' && m === 'GET') return send(res, 200, { agents: all('SELECT * FROM agents').map(a => ({ ...a, base: a.name, name: a.nick || a.name })), defaults: Object.fromEntries(AGENTS_SEED.map(a => [a.id, a.prompt])) });
  if ((mt = p.match(/^\/api\/agents\/(\w+)\/base(?:\/(\d+)(\/restaurar)?)?$/))) {
    const ag = one('SELECT id,name,prompt FROM agents WHERE id=?', mt[1]); if (!ag) throw fail(404, 'Agente não encontrado');
    if (!mt[2] && m === 'GET') { const items = all('SELECT id,titulo,modo,editado,ordem,length(conteudo) tam,updated_at FROM agent_docs WHERE agent=? ORDER BY ordem, id', ag.id); return send(res, 200, { items, sempre: items.filter(x => x.modo !== 'auto').reduce((a, x) => a + x.tam, 0), budget: AGDOC_BUDGET }); }
    if (!mt[2] && m === 'POST') {
      const b = await readBody(req, 4e6), docs = (Array.isArray(b.docs) ? b.docs : []).map(d => ({ titulo: String(d.titulo || '').replace(/\s+/g, ' ').trim().slice(0, 160) || 'Documento', conteudo: String(d.conteudo || '').trim().slice(0, 300000), modo: d.modo === 'auto' ? 'auto' : 'sempre' })).filter(d => d.conteudo.length >= 20).slice(0, 80);
      const pr = String(b.prompt || '').trim(); if (!docs.length && !pr) throw fail(400, 'Nada para importar: o arquivo precisa ter texto');
      if (b.substituir) run('DELETE FROM agent_docs WHERE agent=?', ag.id);
      let ord = one('SELECT COALESCE(MAX(ordem),0) n FROM agent_docs WHERE agent=?', ag.id).n, novos = 0, atual = 0;
      for (const d of docs) { const ja = one('SELECT id FROM agent_docs WHERE agent=? AND titulo=?', ag.id, d.titulo); if (ja) { run('UPDATE agent_docs SET conteudo=?, original=?, editado=0, modo=?, updated_at=? WHERE id=?', d.conteudo, d.conteudo, d.modo, T(), ja.id); atual++; } else { run('INSERT INTO agent_docs(agent,titulo,conteudo,original,modo,ordem,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)', ag.id, d.titulo, d.conteudo, d.conteudo, d.modo, ++ord, T(), T()); novos++; } }
      if (pr.length >= 40 && pr !== ag.prompt) { run('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)', 'prompt_antigo_' + ag.id, ag.prompt); run('UPDATE agents SET prompt=? WHERE id=?', pr, ag.id); }
      log(ag.id, `Base de conhecimento do ${ag.name}: ${novos} documento(s) novo(s), ${atual} atualizado(s)${pr.length >= 40 ? ' e prompt trocado' : ''}`); changed();
      return send(res, 200, { ok: true, novos, atualizados: atual, prompt: pr.length >= 40 });
    }
    const d0 = mt[2] ? one('SELECT * FROM agent_docs WHERE id=? AND agent=?', +mt[2], ag.id) : null; if (!d0) throw fail(404, 'Documento não encontrado');
    if (!mt[3] && m === 'GET') return send(res, 200, d0);
    if (!mt[3] && m === 'PUT') { const b = await readBody(req, 1e6); const c2 = b.conteudo != null ? String(b.conteudo).trim() : d0.conteudo; if (c2.length < 20) throw fail(400, 'O documento não pode ficar vazio'); run('UPDATE agent_docs SET titulo=?, conteudo=?, modo=?, editado=?, updated_at=? WHERE id=?', String(b.titulo ?? d0.titulo).trim().slice(0, 160) || d0.titulo, c2, b.modo === 'auto' ? 'auto' : b.modo === 'sempre' ? 'sempre' : d0.modo, c2 !== d0.original ? 1 : 0, T(), d0.id); changed(); return send(res, 200, { ok: true }); }
    if (!mt[3] && m === 'DELETE') { run('DELETE FROM agent_docs WHERE id=?', d0.id); changed(); return send(res, 200, { ok: true }); }
    if (mt[3] && m === 'POST') { run('UPDATE agent_docs SET conteudo=original, editado=0, updated_at=? WHERE id=?', T(), d0.id); changed(); return send(res, 200, { ok: true }); }
    throw fail(405, 'Método não suportado');
  }
  if ((mt = p.match(/^\/api\/agents\/(\w+)$/)) && m === 'PUT') {
    if (!agentRow(mt[1])) throw fail(404, 'Agente não encontrado');
    const b = await readBody(req);
    if (b.nick !== undefined) run('UPDATE agents SET nick=? WHERE id=?', str(b.nick, 30, 'Apelido', false), mt[1]);
    run('UPDATE agents SET prompt=?, model=?, enabled=?, learn=?, avoid=? WHERE id=?', str(b.prompt, 30000, 'Prompt'), str(b.model, 80, 'Modelo', false), b.enabled || ['gerente', 'chefe'].includes(mt[1]) ? 1 : 0, str(b.learn, 8000, 'Aprendizados', false), str(b.avoid, 8000, 'Evitar', false), mt[1]);
    changed(); return send(res, 200, { ok: true });
  }

  // ── Cérebro
  if (p === '/api/motivos' && m === 'GET') return send(res, 200, MOTIVOS_PUB);
  if (p === '/api/brain' && m === 'GET') {
    const sm = settings();
    const digests = all('SELECT * FROM brain_digests ORDER BY id DESC LIMIT 20').map(d => { let b = {}; try { b = JSON.parse(d.body); } catch { /* corrompido */ } return { id: d.id, ts: d.ts, day: d.day, ...b }; });
    const semanas = all("SELECT strftime('%Y-%W', updated_at) wk, MIN(substr(updated_at,1,10)) d0, ROUND(AVG(score),2) nota, ROUND(AVG(revisions),2) rev, COUNT(*) n FROM contents WHERE score IS NOT NULL AND teste=0 GROUP BY wk ORDER BY wk DESC LIMIT 8").reverse();
    return send(res, 200, {
      base: all('SELECT * FROM brain_base ORDER BY id'),
      rules: (() => { const cc = new Map(); return all("SELECT * FROM brain_rules WHERE status<>'arquivada' ORDER BY (status='proposta') DESC, (status='teste') DESC, weight DESC, id DESC").map(r => ({ ...r, impacto: r.status === 'ativa' ? ruleImpacto(r) : null, conflito: brainConflito(r, cc), teste_total: TESTE_PECAS })); })(),
      archived: all("SELECT * FROM brain_rules WHERE status='arquivada' ORDER BY updated_at DESC LIMIT 60"),
      events: all('SELECT * FROM brain_events ORDER BY id DESC LIMIT 60'),
      porAgente: (() => {
        const OK = BRAIN_OK, lim30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
        const ev = all("SELECT * FROM brain_events WHERE ts > datetime('now','-60 days') ORDER BY id DESC");
        return all('SELECT id FROM agents').map(({ id }) => {
          const mine = ev.filter(e => e.agent === id), ok = mine.filter(e => OK.includes(e.kind)), bad = mine.filter(e => BRAIN_BAD.includes(e.kind));
          const mot = e => ({ id: e.id, ts: e.ts, title: e.title, resumo: e.summary, motivo: (e.detail.match(/(?:Motivo[^:]*|Problemas|O que o Revisor não enxergou): ([^\n]*)/) || [])[1] || e.detail.split('\n')[0] || '' });
          return { agent: id, ok: ok.length, bad: bad.length, motivos: bad.slice(0, 4).map(mot), acertos: ok.slice(0, 3).map(mot), regras: one("SELECT COUNT(*) n FROM brain_rules WHERE status='ativa' AND (agent=? OR agent='*')", id).n, pendentes: mine.filter(e => e.digest_id === null).length, ...(() => { const n = e => ({ ok: e.filter(z => OK.includes(z.kind)).length, bad: e.filter(z => BRAIN_BAD.includes(z.kind)).length }), rec = n(mine.filter(e => e.ts.slice(0, 10) >= lim30)), ant = n(mine.filter(e => e.ts.slice(0, 10) < lim30)), tx = z => z.ok + z.bad >= 3 ? Math.round(z.ok / (z.ok + z.bad) * 100) : null; return { taxa: tx(rec), taxaAnt: tx(ant) }; })() };
        });
      })(),
      saude: (() => { const f = brainFaxinaScan(); return { duplicadas: f.duplicadas.reduce((n, g) => n + g.apagar.length, 0), conflitos: f.conflitos.length, paradas: f.paradas.length, inefetivas: f.inefetivas.length, arquivadas: f.arquivadas, eventos: f.eventos, limite: BRAIN_MAX_REGRAS, diario: one('SELECT COUNT(*) n FROM brain_digests').n, eventosTotal: one('SELECT COUNT(*) n FROM brain_events').n, desfazer: one('SELECT ts,resumo FROM brain_undo WHERE id=1') || null }; })(),
      digests, semanas, pending: brainPendingEvents(), newMetrics: brainNewMetrics().length,
      busy: !!one("SELECT 1 x FROM jobs WHERE kind='cerebro' AND status IN ('queued','running')"),
      last: digests[0]?.ts || null,
      cfg: { brain_auto: sm.brain_auto, brain_daily: sm.brain_daily, brain_hour: sm.brain_hour },
      brands: all('SELECT name FROM brands ORDER BY name COLLATE NOCASE').map(b => b.name),
      types: BRAIN_TYPES, formatos: FMT_ROTULO, moldes: one('SELECT COUNT(*) n FROM brain_molds').n
    });
  }
  const brainRuleBody = async (cur = null) => {
    const b = await readBody(req);
    const ag = String(b.agent ?? cur?.agent ?? '*'); if (ag !== '*' && !agentRow(ag)) throw fail(400, 'Agente inválido');
    const br = String(b.brand ?? cur?.brand ?? '').trim(); if (br && !one('SELECT 1 x FROM brands WHERE name=? COLLATE NOCASE', br)) throw fail(400, 'Marca não encontrada');
    const type = b.type ?? cur?.type ?? 'regra'; if (!BRAIN_TYPES[type]) throw fail(400, 'Tipo inválido');
    let status = b.status ?? cur?.status ?? 'ativa'; if (!['ativa', 'proposta', 'arquivada', 'teste'].includes(status)) throw fail(400, 'Status inválido');
    if (status === 'ativa' && cur?.status === 'proposta' && ['designer', 'editor'].includes(ag) && cur.source !== 'manual' && !b.direto) status = 'teste';   // aprovou uma sugestão visual: ela passa por 2 peças de teste
    const formato = String(b.formato ?? cur?.formato ?? '').toLowerCase(); if (formato && !FORMATOS_REGRA.includes(formato)) throw fail(400, 'Formato inválido');
    return { agent: ag, brand: br ? one('SELECT name FROM brands WHERE name=? COLLATE NOCASE', br).name : '', type, status, formato, text: str(b.text ?? cur?.text, 400, 'Regra') };
  };
  if (p === '/api/brain/base' && m === 'POST') {
    const b = await readBody(req); const t = str(b.title, 160, 'Título'), c = str(b.content, 12000, 'Conteúdo');
    const id = run("INSERT INTO brain_base(title,content,source,created_at,updated_at) VALUES(?,?,?,?,?)", t, c, 'manual', T(), T()).lastInsertRowid;
    changed(); return send(res, 200, { ok: true, id: +id });
  }
  if ((mt = p.match(/^\/api\/brain\/base\/(\d+)$/))) {
    const cur = one('SELECT * FROM brain_base WHERE id=?', +mt[1]); if (!cur) throw fail(404, 'Item não encontrado');
    if (m === 'PUT') { const b = await readBody(req); run('UPDATE brain_base SET title=?, content=?, updated_at=? WHERE id=?', str(b.title ?? cur.title, 160, 'Título'), str(b.content ?? cur.content, 12000, 'Conteúdo'), T(), cur.id); changed(); return send(res, 200, { ok: true }); }
    if (m === 'DELETE') { run('DELETE FROM brain_base WHERE id=?', cur.id); changed(); return send(res, 200, { ok: true }); }
  }
  if (p === '/api/brain/rules' && m === 'POST') {
    const r = await brainRuleBody();
    const id = run("INSERT INTO brain_rules(agent,brand,type,text,source,status,formato,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)", r.agent, r.brand, r.type, r.text, 'manual', r.status, r.formato, T(), T()).lastInsertRowid;
    changed(); return send(res, 200, { ok: true, id: +id });
  }
  if ((mt = p.match(/^\/api\/brain\/rules\/(\d+)$/))) {
    const cur = one('SELECT * FROM brain_rules WHERE id=?', +mt[1]); if (!cur) throw fail(404, 'Regra não encontrada');
    if (m === 'PUT') { const r = await brainRuleBody(cur); run("UPDATE brain_rules SET agent=?, brand=?, type=?, text=?, status=?, formato=?, flag='', aviso=CASE WHEN ?='ativa' THEN '' ELSE aviso END, updated_at=? WHERE id=?", r.agent, r.brand, r.type, r.text, r.status, r.formato, r.status, T(), cur.id); changed(); return send(res, 200, { ok: true }); }
    if (m === 'DELETE') { run('DELETE FROM brain_rules WHERE id=?', cur.id); changed(); return send(res, 200, { ok: true }); }
  }
  // ── Apagar e cuidar da memória do Cérebro
  if (p === '/api/brain/limpar' && m === 'POST') {
    const b = await readBody(req), esc = String(b.escopo || '');
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger);
    const ag = b.agent ? String(b.agent) : '', mk = b.brand ? String(b.brand) : '';
    const filtros = (alias = '') => { const w = [], a = []; if (ag) { w.push(`${alias}agent=?`); a.push(ag); } if (mk) { w.push(`${alias}brand=? COLLATE NOCASE`); a.push(mk); } return [w.length ? ' AND ' + w.join(' AND ') : '', a]; };
    const idsSql = x => `id IN (${x.map(() => '?').join(',')})`;
    if (!['regras', 'arquivadas', 'eventos', 'diario', 'base', 'moldes', 'tudo'].includes(esc)) throw fail(400, 'Escolha o que apagar');
    if (esc === 'tudo' && b.confirma !== 'APAGAR') throw fail(400, 'Para apagar tudo, confirme digitando APAGAR');
    brainGuardaDesfazer(`Apagou: ${esc}`);
    const out = {}; const [fw, fa] = filtros();
    if (esc === 'regras' || esc === 'tudo') out.regras = ids.length && esc === 'regras' ? run(`DELETE FROM brain_rules WHERE ${idsSql(ids)}`, ...ids).changes : run(`DELETE FROM brain_rules WHERE status IN ('ativa','proposta','teste')${esc === 'tudo' ? '' : fw}`, ...(esc === 'tudo' ? [] : fa)).changes;
    if (esc === 'arquivadas' || esc === 'tudo') out.arquivadas = run(`DELETE FROM brain_rules WHERE status='arquivada'${esc === 'tudo' ? '' : fw}`, ...(esc === 'tudo' ? [] : fa)).changes;
    if (esc === 'eventos' || esc === 'tudo') out.eventos = ids.length && esc === 'eventos' ? run(`DELETE FROM brain_events WHERE ${idsSql(ids)}`, ...ids).changes : run(`DELETE FROM brain_events WHERE 1=1${esc === 'tudo' ? '' : fw}${b.soAprendidos && esc === 'eventos' ? ' AND digest_id IS NOT NULL' : ''}`, ...(esc === 'tudo' ? [] : fa)).changes;
    if (esc === 'diario' || esc === 'tudo') out.diario = ids.length && esc === 'diario' ? run(`DELETE FROM brain_digests WHERE ${idsSql(ids)}`, ...ids).changes : run('DELETE FROM brain_digests').changes;
    if (esc === 'base' || esc === 'tudo') out.base = ids.length && esc === 'base' ? run(`DELETE FROM brain_base WHERE ${idsSql(ids)}`, ...ids).changes : run('DELETE FROM brain_base').changes;
    if (esc === 'moldes' || esc === 'tudo') out.moldes = ids.length && esc === 'moldes' ? run(`DELETE FROM brain_molds WHERE ${idsSql(ids)}`, ...ids).changes : run(`DELETE FROM brain_molds WHERE 1=1${esc === 'tudo' ? '' : fw}`, ...(esc === 'tudo' ? [] : fa)).changes;
    if (esc === 'tudo') run("INSERT INTO settings(key,value) VALUES('brain_met_last',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", String(one('SELECT COALESCE(MAX(id),0) n FROM metrics').n));   // métricas antigas não voltam como “novas”
    log('chefe', `Apagou memória do Cérebro (${esc}): ${Object.entries(out).map(([k, v]) => v + ' ' + k).join(', ')}`); changed();
    return send(res, 200, { ok: true, apagado: out, desfazer: true });
  }
  if (p === '/api/brain/desfazer' && m === 'POST') {
    const u = one('SELECT * FROM brain_undo WHERE id=1'); if (!u) throw fail(404, 'Não há nada para desfazer');
    let snap; try { snap = JSON.parse(u.data); } catch { throw fail(500, 'A cópia está corrompida'); }
    const n = brainRestaura(snap, { limpar: true }); run('DELETE FROM brain_undo WHERE id=1'); changed(); log('chefe', `Desfez a última limpeza do Cérebro (${n} itens de volta)`); return send(res, 200, { ok: true, n });
  }
  if (p === '/api/brain/backup' && m === 'GET') return send(res, 200, brainSnap());
  if (p === '/api/brain/restore' && m === 'POST') {
    const b = await readBody(req, 12e6); brainGuardaDesfazer('Antes de restaurar uma cópia'); const n = brainRestaura(b.snap, { limpar: !!b.substituir }); changed(); return send(res, 200, { ok: true, n });
  }
  if (p === '/api/brain/faxina' && m === 'GET') return send(res, 200, brainFaxinaScan());
  if (p === '/api/brain/faxina' && m === 'POST') {
    const b = await readBody(req), acoes = new Set(Array.isArray(b.acoes) ? b.acoes : []), sc = brainFaxinaScan(), out = {};
    brainGuardaDesfazer('Faxina da memória');
    if (acoes.has('duplicadas')) { out.duplicadas = 0; for (const g of sc.duplicadas) { run('UPDATE brain_rules SET weight=weight+?, updated_at=? WHERE id=?', g.apagar.length, T(), g.manter.id); for (const x of g.apagar) { run('DELETE FROM brain_rules WHERE id=?', x.id); out.duplicadas++; } } }
    if (acoes.has('paradas')) out.paradas = sc.paradas.reduce((n, r) => n + run("UPDATE brain_rules SET status='arquivada', updated_at=? WHERE id=? AND status='ativa'", T(), r.id).changes, 0);
    if (acoes.has('inefetivas')) out.inefetivas = sc.inefetivas.reduce((n, r) => n + run("UPDATE brain_rules SET status='arquivada', flag='', updated_at=? WHERE id=? AND status='ativa'", T(), r.id).changes, 0);
    if (acoes.has('arquivadas')) out.arquivadas = run(`DELETE FROM brain_rules WHERE status='arquivada' AND updated_at < ${dias(60)}`).changes;
    if (acoes.has('eventos')) out.eventos = run('DELETE FROM brain_events WHERE digest_id IS NOT NULL').changes;
    log('chefe', `Faxina da memória do Cérebro: ${Object.entries(out).map(([k, v]) => v + ' ' + k).join(', ') || 'nada a fazer'}`); changed();
    return send(res, 200, { ok: true, feito: out });
  }
  // ── Galeria: artes e vídeos por marca, com o motivo de cada reprovação e a regra que nasceu dali
  if (p === '/api/brain/galeria' && m === 'GET') {
    const marca = url.searchParams.get('brand') || '', ag0 = url.searchParams.get('agent') || '';
    const cs = all(`SELECT id,title,brand,format,kind,status,score,art_checks,vid_checks,art_spec,spec,video,updated_at FROM contents WHERE teste=0 AND (art_spec<>'' OR spec<>'')${marca ? ' AND brand=? COLLATE NOCASE' : ''} ORDER BY id DESC LIMIT 120`, ...(marca ? [marca] : []));
    const BAD = ['ajuste_dono', 'entrega_reprovada', 'checagem_falhou', 'motivo_manual'], GOOD = ['aprovado_dono', 'entrega_aprovada'];
    const itens = [];
    for (const c of cs) {
      for (const agent of [c.art_spec && 'designer', c.spec && 'editor'].filter(Boolean)) {
        if (ag0 && ag0 !== agent) continue;
        const ev = all('SELECT * FROM brain_events WHERE content_id=? AND agent=? ORDER BY id', c.id, agent);
        const ruins = ev.filter(e => BAD.includes(e.kind)), bom = ev.some(e => GOOD.includes(e.kind));
        const tags = new Map(); for (const e of ev) for (const t of tagsDe(e)) { const o = tags.get(t) || { id: t, label: motivoRotulo(agent, t), dono: 0, checagem: 0 }; if (['ajuste_dono', 'motivo_manual'].includes(e.kind)) o.dono++; else o.checagem++; tags.set(t, o); }
        const fmt = fmtGrupo(c.format);
        const regras = [...tags.keys()].flatMap(t => all("SELECT id,text,status,formato,brand,teste_ok,teste_ruim,aviso FROM brain_rules WHERE chave=? AND (brand='' OR brand=? COLLATE NOCASE) AND status<>'arquivada'", agent + ':' + t, c.brand || ''));
        const molde = one('SELECT id,fixo FROM brain_molds WHERE content_id=? AND agent=?', c.id, agent);
        const checks = checksLer(agent === 'designer' ? c.art_checks : c.vid_checks);
        itens.push({
          id: c.id, agent, title: c.title, brand: c.brand, format: c.format, formato: fmt, kind: c.kind, status: c.status, score: c.score, updated_at: c.updated_at,
          resultado: ruins.length ? 'ajustada' : bom ? 'aprovada' : 'andamento',
          primeira: bom && !ruins.length,
          thumb: agent === 'designer' ? (arteFiles(c.id).length ? `/api/contents/${c.id}/arte/file/1?review=1` : '') : (fs.existsSync(prevFile(c.id)) ? `/api/contents/${c.id}/render/previa` : ''),
          motivos: [...tags.values()], regras, molde: molde ? { id: molde.id, fixo: !!molde.fixo } : null,
          checks: checks.map(x => ({ ...x, label: motivoRotulo(agent, x.tipo) })),
          eventos: ev.slice(-6).map(e => ({ kind: e.kind, ts: e.ts, resumo: e.summary }))
        });
      }
    }
    const rf = url.searchParams.get('resultado') || '';
    const lista = rf ? itens.filter(i => i.resultado === rf) : itens;
    const salvos = [];   // layouts e estilos que o dono guardou: o Cérebro enxerga todos
    if (!ag0 || ag0 === 'designer') {
      for (const l of all(`SELECT id,brand,name,format,created_at,uses FROM art_layouts${marca ? ' WHERE brand=? COLLATE NOCASE' : ''} ORDER BY id DESC`, ...(marca ? [marca] : []))) salvos.push({ tipo: 'layout', id: l.id, nome: l.name, brand: l.brand, formato: l.format, ts: l.created_at, usos: l.uses, thumb: fs.existsSync(path.join(LAYOUT_DIR, l.id + '.jpg')) ? `/api/art-layouts/${l.id}/thumb` : '', cerebro: !!one("SELECT 1 x FROM brain_molds WHERE agent='designer' AND content_id=? AND fixo=1", -l.id) || !!one("SELECT 1 x FROM brain_molds WHERE agent='designer' AND brand=? COLLATE NOCASE AND lower(titulo)=lower(?) AND fixo=1", l.brand || '', l.name.slice(0, 160)) });
      for (const r of all(`SELECT id,nome,brand,created_at,usos FROM art_templates WHERE central=''${marca ? ' AND brand=? COLLATE NOCASE' : ''} ORDER BY id DESC`, ...(marca ? [marca] : []))) salvos.push({ tipo: 'estilo', id: r.id, nome: r.nome, brand: r.brand, formato: '', ts: r.created_at, usos: r.usos, thumb: '', cerebro: !!one("SELECT 1 x FROM brain_molds WHERE agent='designer' AND content_id=? AND fixo=1", -(100000 + r.id)) });
    }
    return send(res, 200, { salvos, itens: lista.slice(0, 80), total: itens.length, resumo: { aprovada: itens.filter(i => i.resultado === 'aprovada').length, ajustada: itens.filter(i => i.resultado === 'ajustada').length, andamento: itens.filter(i => i.resultado === 'andamento').length }, moldes: all('SELECT agent, brand, COUNT(*) n FROM brain_molds GROUP BY agent, brand') });
  }
  if (p === '/api/brain/galeria/motivo' && m === 'POST') {
    const b = await readBody(req), c = getContent(+b.content_id); if (!c) throw fail(404, 'Peça não encontrada');
    const agent = ['designer', 'editor'].includes(b.agent) ? b.agent : null; if (!agent) throw fail(400, 'Agente inválido');
    const tags = motivosValidos(agent, b.motivos); if (!tags.length) throw fail(400, 'Marque ao menos um motivo');
    brainEvent(agent, 'motivo_manual', c, `Você marcou na galeria: ${tags.map(t => motivoRotulo(agent, t)).join('; ')} (${c.format}/${c.kind})`, 'Marcação feita por você olhando a peça pronta.' + (b.nota ? '\n' + String(b.nota).slice(0, 300) : ''), tags);
    changed(); return send(res, 200, { ok: true });
  }
  if (p === '/api/brain/galeria/molde' && m === 'POST') {
    const b = await readBody(req), c = getContent(+b.content_id); if (!c) throw fail(404, 'Peça não encontrada');
    const agent = ['designer', 'editor'].includes(b.agent) ? b.agent : null; if (!agent) throw fail(400, 'Agente inválido');
    if (b.acao === 'remover') run('DELETE FROM brain_molds WHERE content_id=? AND agent=?', c.id, agent);
    else { if (!one('SELECT 1 x FROM brain_molds WHERE content_id=? AND agent=?', c.id, agent) && !brainMoldeSalva(agent, c, { forcar: true })) throw fail(400, 'Esta peça ainda não tem dados suficientes para virar molde'); if (b.acao === 'fixar') run('UPDATE brain_molds SET fixo=1 WHERE content_id=? AND agent=?', c.id, agent); }
    changed(); return send(res, 200, { ok: true });
  }
  if (p === '/api/brain/buscar' && m === 'GET') {
    const q = String(new URL(req.url, 'http://x').searchParams.get('q') || '').trim().slice(0, 120); if (q.length < 2) return send(res, 200, { itens: [] });
    const nm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''), ws = nm(q).split(/[^a-z0-9]+/).filter(w => w.length >= 2), need = Math.max(1, Math.ceil(ws.length * 0.6));
    const sc = t => { const x = nm(t); return ws.filter(w => x.includes(w)).length; };
    const itens = [];
    for (const r of all('SELECT * FROM brain_rules ORDER BY id DESC')) { const n = sc(r.text + ' ' + r.evidence + ' ' + r.brand); if (n >= need) itens.push({ tipo: 'regra', id: r.id, titulo: r.text, extra: `${r.agent === '*' ? 'todos' : r.agent} · ${r.status}${r.brand ? ' · ' + r.brand : ''}`, n }); }
    for (const x of all('SELECT * FROM brain_base ORDER BY id')) { const n = sc(x.title + ' ' + x.content); if (n >= need) itens.push({ tipo: 'base', id: x.id, titulo: x.title, extra: clip(x.content, 160), n }); }
    for (const e of all('SELECT * FROM brain_events ORDER BY id DESC LIMIT 600')) { const n = sc(e.title + ' ' + e.summary + ' ' + e.detail + ' ' + e.brand); if (n >= need) itens.push({ tipo: 'evento', id: e.id, titulo: e.summary, extra: `${e.agent} · ${e.title || ''} · ${e.ts.slice(0, 10)}`, n }); }
    for (const d of all('SELECT * FROM brain_digests ORDER BY id DESC LIMIT 100')) { const n = sc(d.body); if (n >= need) { let r = ''; try { r = JSON.parse(d.body).resumo || ''; } catch { /* corrompido */ } itens.push({ tipo: 'diario', id: d.id, titulo: r || 'Aprendizado de ' + d.day, extra: d.day, n }); } }
    itens.sort((a, b) => b.n - a.n); return send(res, 200, { itens: itens.slice(0, 40), total: itens.length });
  }
  if ((mt = p.match(/^\/api\/brain\/events\/(\d+)$/)) && m === 'DELETE') { run('DELETE FROM brain_events WHERE id=?', +mt[1]); changed(); return send(res, 200, { ok: true }); }
  if ((mt = p.match(/^\/api\/brain\/digests\/(\d+)$/)) && m === 'DELETE') { run('DELETE FROM brain_digests WHERE id=?', +mt[1]); changed(); return send(res, 200, { ok: true }); }
  if (p === '/api/brain/approve_all' && m === 'POST') {
    const n = run("UPDATE brain_rules SET status=CASE WHEN agent IN ('designer','editor') AND source<>'manual' THEN 'teste' ELSE 'ativa' END, aviso='', updated_at=? WHERE status='proposta'", T()).changes; changed(); return send(res, 200, { ok: true, n });
  }
  if (p === '/api/brain/learn' && m === 'POST') {
    if (one("SELECT 1 x FROM jobs WHERE kind='cerebro' AND status IN ('queued','running')")) throw fail(400, 'O Cérebro já tem um aprendizado em andamento.');
    if (!brainPendingEvents() && !brainNewMetrics().length) throw fail(400, 'Nada novo para aprender ainda. O Cérebro aprende com revisões, ajustes que você pede, aprovações e métricas.');
    return send(res, 200, { ok: true, id: enqueue(null, 'chefe', 'cerebro', {}, 'manual') });
  }
  if (p === '/api/brain/export' && m === 'GET') {
    const ags = all('SELECT id,name,role FROM agents'); let out = '# Super prompt do Cérebro — Agentes SIM\n\nBase de conhecimento da empresa e lições aprendidas com o trabalho. Todos os agentes recebem isto em cada pedido.\n';
    const bs = all('SELECT * FROM brain_base ORDER BY id'); if (bs.length) { out += '\n## Base (vale para todos)\n'; for (const x of bs) out += `\n### ${x.title}\n${x.content.trim()}\n`; }
    for (const a of [{ id: '*', name: 'Todos os agentes', role: 'valem para toda a equipe' }, ...ags]) {
      const rs = all("SELECT * FROM brain_rules WHERE status='ativa' AND agent=? ORDER BY type, weight DESC, id", a.id); if (!rs.length) continue;
      out += `\n## ${a.name} — ${a.role}\n`; for (const r of rs) out += `- [${BRAIN_TYPES[r.type]}]${r.brand ? ' (marca ' + r.brand + ')' : ''} ${r.text}\n`;
    }
    return send(res, 200, { text: out.trim() });
  }

  // ── Métricas e análise
  if (p === '/api/metrics' && m === 'GET') {
    return send(res, 200, { items: all('SELECT * FROM metrics ORDER BY date DESC, id DESC LIMIT 200'), reports: all('SELECT * FROM reports ORDER BY id DESC LIMIT 5'), contents: all("SELECT id,title FROM contents WHERE status IN ('approved','posted') ORDER BY id DESC LIMIT 100") });
  }
  if (p === '/api/metrics' && m === 'POST') {
    const b = await readBody(req);
    const rows = Array.isArray(b.items) ? b.items : [b];
    if (rows.length > 500) throw fail(400, 'Máximo de 500 linhas por vez');
    for (const r of rows) {
      const d = new Date(r.date);
      if (isNaN(d)) throw fail(400, `Data inválida: ${r.date}`);
      const cid = r.content_id && getContent(+r.content_id) ? +r.content_id : null;
      const ins = run('INSERT INTO metrics(date,platform,post_title,content_id,views,likes,comments,shares,saves,followers,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        d.toISOString().slice(0, 10), str(r.platform, 40, 'Plataforma', false), str(r.post_title, 200, 'Título do post', false), cid, int(r.views), int(r.likes), int(r.comments), int(r.shares), int(r.saves), int(r.followers), str(r.notes, 500, 'Notas', false));
      metricaSinal({ id: +ins.lastInsertRowid, content_id: cid, platform: str(r.platform, 40, 'Plataforma', false), views: int(r.views), likes: int(r.likes), comments: int(r.comments), shares: int(r.shares), saves: int(r.saves), notes: str(r.notes, 500, 'Notas', false) });
    }
    changed(); return send(res, 200, { ok: true, n: rows.length });
  }
  if ((mt = p.match(/^\/api\/metrics\/(\d+)$/)) && m === 'DELETE') { run('DELETE FROM metrics WHERE id=?', +mt[1]); return send(res, 200, { ok: true }); }
  if (p === '/api/analysis/run' && m === 'POST') {
    if (!one('SELECT COUNT(*) n FROM metrics').n) throw fail(400, 'Cadastre ou importe métricas antes de pedir a análise');
    enqueue(null, 'chefe', 'relatorio', {}, 'manual'); return send(res, 200, { ok: true });
  }
  if (p === '/api/autopilot/run-now' && m === 'POST') {
    const b = await readBody(req);
    const brands = all('SELECT name FROM brands').map(x => x.name);
    const jid = enqueue(null, 'chefe', 'pautas', {
      n: Math.max(1, Math.min(10, +b.n || 3)), auto: true,
      goal: ['produto', 'conteudo', 'marca'].includes(b.goal) ? b.goal : undefined,
      brand: brands.includes(b.brand) ? b.brand : '', product_id: +b.product_id || 0,
      formats: Array.isArray(b.formats) ? b.formats.filter(f => FORMATS.includes(f)) : [], kinds: Array.isArray(b.kinds) ? b.kinds.filter(k => KINDS.includes(k)) : [],
      platform: str(b.platform, 40, 'Plataforma', false), tema: str(b.tema, 1500, 'Foco', false)
    }, 'manual'); return send(res, 200, { ok: true, id: jid });
  }

  // ── Configurações
  if (p === '/api/settings' && m === 'PUT') {
    const b = await readBody(req);
    applySettings(b);
    return send(res, 200, { settings: settings() });
  }
  throw fail(404, 'Rota não encontrada');
}

const SEC_HEADERS = {
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'same-origin',
  'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self'; frame-src 'self' http://localhost:5175 http://127.0.0.1:5175; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
const indexFile = path.join(__dirname, 'public', 'index.html');

const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SEC_HEADERS)) res.setHeader(k, v);
  { const t0 = Date.now(), rota = (req.method || 'GET') + ' ' + String(req.url || '').split('?')[0], mut = req.method !== 'GET' && req.method !== 'HEAD', mudo = /^\/api\/(stream|state)$|^\/healthz$/.test(String(req.url || '').split('?')[0]);
    res.on('finish', () => { if (res.statusCode >= 400 || (mut && !mudo)) dlog('http', `${rota} -> ${res.statusCode} (${Date.now() - t0} ms)`); });
    res.on('close', () => { if (!res.writableFinished && !mudo) dlog('http', `${rota} interrompida pelo cliente/proxy antes de terminar (${Date.now() - t0} ms)`); });
    req.on('aborted', () => { if (!mudo) dlog('http', `${rota} abortada no envio (${Date.now() - t0} ms)`); }); }
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/healthz') return send(res, 200, { ok: true });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname === '/motor/engine.html') { res.setHeader('content-security-policy', "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; frame-ancestors 'self'; base-uri 'none'"); res.setHeader('x-frame-options', 'SAMEORIGIN'); res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(path.join(MOTOR_DIR, 'engine.html'))); }
    if (url.pathname.startsWith('/banco3d/')) { const id = path.basename(url.pathname).replace(/\.webp$/, ''); const buf = /^[a-z0-9-]{1,80}$/.test(id) ? banco3dBytes(id) : null; if (!buf) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': 'image/webp', 'cache-control': 'public, max-age=2592000' }); return res.end(buf); }
    if (url.pathname.startsWith('/fonts/')) { const fn = path.basename(url.pathname); const fp = path.join(__dirname, 'public', 'fonts', fn); if (/^[a-z0-9-]+\.woff2$/.test(fn) && fs.existsSync(fp)) { res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'public, max-age=604800' }); return res.end(fs.readFileSync(fp)); } res.writeHead(404); return res.end(); }
    if (['/arte-modelos.js', '/arte-metricas.js', '/arte-icones.js', '/escritorio3d.js', '/three.module.min.js'].includes(url.pathname)) { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'public', url.pathname.slice(1)))); }
    if (url.pathname === '/logo-agentes-sim.png') { try { const b = fs.readFileSync(path.join(__dirname, 'public', 'logo-agentes-sim.png')); res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=3600' }); return res.end(b); } catch { res.writeHead(404); return res.end(); } }
    if (url.pathname === '/arte-slide.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache' }); return res.end(fs.readFileSync(path.join(__dirname, 'public', 'arte-slide.js'))); }
    if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, fs.readFileSync(indexFile, 'utf8'));
    return send(res, 404, { error: 'Não encontrado' });
  } catch (e) {
    if (!e.status) console.error(`${new Date().toISOString()} [http] ERRO ${req.method} ${req.url}:`, e); else if (e.status >= 400) dlog('http', `${req.method} ${String(req.url).split('?')[0]} recusada ${e.status}: ${e.message}`);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Erro interno' });
  }
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`✖ A porta ${PORT} já está em uso: provavelmente o painel antigo ainda está aberto em outra janela preta. Feche essa janela e abra de novo (ou mude PORT no .env).`);
  else console.error('✖ Erro no servidor:', e.message);
  process.exit(1);
});
// Conserto único: carrosséis que nasceram como "feed" tiveram as páginas cortadas para 1; recupera a entrega completa do Designer e gera as imagens de novo
setTimeout(() => {
  if (one("SELECT 1 x FROM settings WHERE key='reparo_carrossel_v1'")) return; run("INSERT INTO settings(key,value) VALUES('reparo_carrossel_v1','1')");
  for (const c of all("SELECT id, format, art_spec, status FROM contents WHERE teste=0 AND format='feed' AND art_spec<>''")) {
    try {
      if ((jparse(c.art_spec, {}).slides || []).length > 1) continue; const j = one("SELECT output FROM jobs WHERE content_id=? AND agent='designer' AND kind='arte' AND status='done' ORDER BY id DESC LIMIT 1", c.id); if (!j?.output) continue;
      const sp = extractArteSpec(j.output, 'feed'); if (!sp || sp.spec.slides.length < 2) continue;
      setContent(c.id, { format: 'carrossel', art_spec: JSON.stringify(sp.spec), art_spec_base: JSON.stringify(sp.spec), art_status: '' }); log('designer', `Carrossel recuperado com ${sp.spec.slides.length} páginas: as imagens estão sendo geradas de novo`, c.id); renderArte(c.id).catch(() => { });
    } catch (e) { console.error('reparo de carrossel:', e.message); }
  }
}, 4000);
try {   // rede de segurança: qualquer estilo/layout que sair do banco, por qualquer caminho, deixa uma cópia completa aqui
  db.exec(`CREATE TABLE IF NOT EXISTS art_apagados_copia(id INTEGER PRIMARY KEY AUTOINCREMENT, tabela TEXT, ref INTEGER, dados TEXT, quando TEXT);
    CREATE TRIGGER IF NOT EXISTS art_tpl_antes_apagar BEFORE DELETE ON art_templates BEGIN INSERT INTO art_apagados_copia(tabela,ref,dados,quando) VALUES('art_templates',OLD.id,json_object('id',OLD.id,'nome',OLD.nome,'uso',OLD.uso,'nivel',OLD.nivel,'formatos',OLD.formatos,'seq',OLD.seq,'exemplo',OLD.exemplo,'brand',OLD.brand,'usos',OLD.usos,'created_at',OLD.created_at,'central',OLD.central,'visual',OLD.visual,'visual_brand',OLD.visual_brand,'base',OLD.base,'visual_at',OLD.visual_at,'tema',OLD.tema,'deriva',OLD.deriva),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;
    CREATE TRIGGER IF NOT EXISTS art_lay_antes_apagar BEFORE DELETE ON art_layouts BEGIN INSERT INTO art_apagados_copia(tabela,ref,dados,quando) VALUES('art_layouts',OLD.id,json_object('id',OLD.id,'brand',OLD.brand,'name',OLD.name,'format',OLD.format,'spec',OLD.spec,'origem',OLD.origem,'uses',OLD.uses,'created_at',OLD.created_at,'uso',OLD.uso,'tema',OLD.tema),strftime('%Y-%m-%dT%H:%M:%fZ','now')); END;`);
  run("DELETE FROM art_apagados_copia WHERE quando < strftime('%Y-%m-%dT%H:%M:%fZ','now','-60 days')");
} catch (e) { console.error('cópia de segurança de estilos:', e.message); }
restauraEstilosApagados();
lixeiraLimpa();
brainLimpaPrevias();
try { brainReplicaRegrasGerais(); } catch (e) { console.error('regras gerais:', e.message); }
radarDesfazTrocaAutomatica();
migraNoticiaTemplates();   // grava nos templates/layouts de notícia a regra da legenda e a contracapa
try { brainSincronizaSalvos(); } catch (e) { console.error('cérebro (salvos):', e.message); }
setInterval(lixeiraLimpa, 3600e3).unref();
setTimeout(async () => {   // uma vez por versão: peças de notícia AINDA NÃO aprovadas e sem edição à mão ganham o layout atual (manchete maior, legenda menor)
  try {
    await reparaPecasForaDaTela();
    if (one("SELECT value FROM settings WHERE key='layout_recomp'")?.value === BUILD) return;
    let n = 0;
    for (const r of all("SELECT id FROM contents WHERE teste=0 AND kind='noticia' AND status IN ('awaiting_approval','producing','blocked','awaiting_script') AND art_spec!='' AND art_spec=art_spec_base ORDER BY id DESC LIMIT 60")) {
      try { if (await recomporLayoutPeca(r.id)) n++; } catch (e) { console.error('layout da peça ' + r.id + ':', e.message); }
    }
    run("INSERT INTO settings(key,value) VALUES('layout_recomp',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", BUILD);
    if (n) { log('designer', `Layout atualizado em ${n} peça(s) de notícia que ainda não estavam aprovadas (manchete maior, "Leia a legenda" menor)`); changed(); }
  } catch (e) { console.error('atualização de layout das peças:', e.message); }
}, 8000).unref();
server.listen(PORT, HOST, () => {
  console.log(`✔ Agentes SIM em http://${HOST}:${PORT}  (dados em ${DATA_DIR})`);
  if (!API_KEY) console.log('ℹ Modo chat ativo (sem API): o painel monta os pedidos e você cola as respostas do Claude.');
  garanteFontes().catch(e => console.error('Fontes:', e.message));
  setImmediate(pump);
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { server.close(); db.close(); process.exit(0); });
