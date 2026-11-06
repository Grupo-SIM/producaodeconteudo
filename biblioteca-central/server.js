// Biblioteca Central — servidor separado que abastece todos os painéis (o seu e os white label) com:
// arquivos de mídia, templates de arte, conhecimento dos agentes e estilos de vídeo. Cada painel cliente tem uma chave
// de licença; ele baixa o catálogo (manifesto) e só o que mudou. Você publica aqui (pelo painel de admin ou direto do
// seu painel matriz) e todos os clientes ativos recebem na próxima sincronização.
// Node 22+, sem dependências: node server.js (variáveis no .env desta pasta).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// .env simples (CHAVE=valor)
try { for (const l of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); } } catch { /* sem .env */ }
const PORT = +process.env.PORT || 3500, HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || './dados'), FILES = path.join(DATA_DIR, 'arquivos');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '', ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
if (ADMIN_PASSWORD.length < 8) { console.error('Defina ADMIN_PASSWORD (mínimo 8 caracteres) no .env da Biblioteca Central'); process.exit(1); }
fs.mkdirSync(FILES, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'biblioteca.db'));
db.exec('PRAGMA journal_mode=WAL');
db.exec(`CREATE TABLE IF NOT EXISTS itens(chave TEXT PRIMARY KEY, tipo TEXT NOT NULL, titulo TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}', sha TEXT DEFAULT '', ext TEXT DEFAULT '', size INTEGER DEFAULT 0,
  conteudo TEXT DEFAULT '', rev INTEGER NOT NULL, ativo INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS clientes(id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, contato TEXT DEFAULT '', chave TEXT NOT NULL UNIQUE, plano TEXT DEFAULT 'completo', ativo INTEGER NOT NULL DEFAULT 1,
  expira TEXT DEFAULT '', ultimo_sync TEXT DEFAULT '', rev_sync INTEGER DEFAULT 0, versao_painel TEXT DEFAULT '', ip TEXT DEFAULT '', created_at TEXT NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS historico(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, msg TEXT NOT NULL)`);
db.exec(`CREATE TABLE IF NOT EXISTS conf(k TEXT PRIMARY KEY, v TEXT)`);
const one = (q, ...a) => db.prepare(q).get(...a), all = (q, ...a) => db.prepare(q).all(...a), run = (q, ...a) => db.prepare(q).run(...a);
const T = () => new Date().toISOString();
const hist = msg => { run('INSERT INTO historico(ts,msg) VALUES(?,?)', T(), String(msg).slice(0, 500)); run('DELETE FROM historico WHERE id < (SELECT MAX(id) FROM historico) - 500'); };
const proxRev = () => { const r = (+(one("SELECT v FROM conf WHERE k='rev'")?.v || 0)) + 1; run("INSERT OR REPLACE INTO conf(k,v) VALUES('rev',?)", String(r)); return r; };
const revAtual = () => +(one("SELECT v FROM conf WHERE k='rev'")?.v || 0);

const TIPOS = ['midia', 'template', 'conhecimento', 'estilo_video'];
const EXT_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2', json: 'application/json' };
const MAX_FILE = 200e6;
const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9/]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 120);
const fail = (status, msg) => Object.assign(new Error(msg), { status });
const send = (res, st, data, h = {}) => { const b = typeof data === 'string' ? data : JSON.stringify(data); res.writeHead(st, { 'content-type': typeof data === 'string' ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h }); res.end(b); };
const ipDe = req => { const a = String(req.socket.remoteAddress || ''); return (/^(::ffff:)?127\.|^::1$/.test(a) && req.headers['x-forwarded-for']) ? String(req.headers['x-forwarded-for']).split(',').pop().trim().slice(0, 60) : a.slice(0, 60); };
const readBody = (req, max) => new Promise((ok, no) => { let n = 0; const ch = []; req.on('data', c => { n += c.length; if (n > max) { no(fail(413, 'Envio grande demais')); req.destroy(); } else ch.push(c); }); req.on('end', () => ok(Buffer.concat(ch))); req.on('error', no); });
const readJson = async (req, max = 50e6) => { const b = await readBody(req, max); try { return b.length ? JSON.parse(b.toString('utf8')) : {}; } catch { throw fail(400, 'JSON inválido'); } };

// ───────── itens ─────────
function salvaArquivo(buf, ext) {
  ext = String(ext || '').toLowerCase().replace(/^\./, ''); if (!EXT_MIME[ext]) throw fail(400, `Tipo de arquivo não aceito (.${ext})`);
  if (!buf.length) throw fail(400, 'Arquivo vazio'); if (buf.length > MAX_FILE) throw fail(413, 'Arquivo acima de 200 MB');
  const sha = crypto.createHash('sha256').update(buf).digest('hex'), f = path.join(FILES, sha + '.' + ext);
  if (!fs.existsSync(f)) fs.writeFileSync(f, buf);
  return { sha, ext, size: buf.length };
}
function upsertItem({ tipo, chave, titulo, meta = {}, conteudo = '', arquivo = null }) {
  if (!TIPOS.includes(tipo)) throw fail(400, 'Tipo inválido (use midia, template, conhecimento ou estilo_video)');
  titulo = String(titulo || '').trim().slice(0, 200); if (!titulo) throw fail(400, 'Falta o título');
  chave = slug(chave || `${tipo}/${titulo}`); if (!chave.startsWith(tipo + '/')) chave = tipo + '/' + chave.replace(/^[^/]*\//, '');
  const atual = one('SELECT * FROM itens WHERE chave=?', chave);
  let f = arquivo ? salvaArquivo(arquivo.buf, arquivo.ext) : (atual ? { sha: atual.sha, ext: atual.ext, size: atual.size } : { sha: '', ext: '', size: 0 });
  if (tipo === 'midia' && !f.sha) throw fail(400, 'Item de mídia precisa do arquivo');
  if (tipo !== 'midia') { conteudo = String(conteudo || ''); if (!conteudo.trim()) throw fail(400, 'Falta o conteúdo'); if (conteudo.length > 2e6) throw fail(413, 'Conteúdo grande demais'); if (tipo !== 'conhecimento') { try { JSON.parse(conteudo); } catch { throw fail(400, 'O conteúdo de template e de estilo de vídeo precisa ser JSON'); } } }
  const metaS = JSON.stringify(meta && typeof meta === 'object' ? meta : {});
  if (atual && atual.ativo && atual.titulo === titulo && atual.meta === metaS && atual.sha === f.sha && atual.conteudo === conteudo) return { chave, mudou: false, rev: atual.rev };
  const rev = proxRev();
  run('INSERT OR REPLACE INTO itens(chave,tipo,titulo,meta,sha,ext,size,conteudo,rev,ativo,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)', chave, tipo, titulo, metaS, f.sha, f.ext, f.size, conteudo, rev, T());
  return { chave, mudou: true, rev, novo: !atual };
}
function removeItem(chave) { const it = one('SELECT * FROM itens WHERE chave=? AND ativo=1', chave); if (!it) throw fail(404, 'Item não encontrado'); run('UPDATE itens SET ativo=0, rev=?, updated_at=? WHERE chave=?', proxRev(), T(), chave); hist(`Retirou ${chave}`); }
const pubItem = (r, comConteudo = true) => ({ chave: r.chave, tipo: r.tipo, titulo: r.titulo, meta: JSON.parse(r.meta || '{}'), sha: r.sha || undefined, ext: r.ext || undefined, size: r.size || undefined, rev: r.rev, ...(comConteudo && r.tipo !== 'midia' ? { conteudo: r.conteudo } : {}), updated_at: r.updated_at });

// ───────── clientes (licenças) ─────────
const novaChave = () => 'bc_' + crypto.randomBytes(24).toString('base64url');
function clienteDaChave(req) {
  const k = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim(); if (!k) throw fail(401, 'Falta a chave da licença');
  const c = one('SELECT * FROM clientes WHERE chave=?', k); if (!c) throw fail(401, 'Chave de licença inválida');
  if (!c.ativo) throw fail(403, 'Licença suspensa: fale com o fornecedor para reativar as atualizações');
  if (c.expira && c.expira < new Date().toISOString().slice(0, 10)) throw fail(403, `Licença vencida em ${c.expira.split('-').reverse().join('/')}: renove para voltar a receber atualizações`);
  return c;
}
const vePlano = (c, it) => { const p = JSON.parse(it.meta || '{}').planos; return !Array.isArray(p) || !p.length || p.includes(c.plano); };

// ───────── admin: sessão ─────────
const sessoes = new Map();   // token -> expira (ms)
const cookie = req => Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
function isAdmin(req) {
  const tk = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (ADMIN_TOKEN && tk && tk.length === ADMIN_TOKEN.length && crypto.timingSafeEqual(Buffer.from(tk), Buffer.from(ADMIN_TOKEN))) return true;
  const s = cookie(req).bc_sess, exp = s && sessoes.get(s); if (exp && exp > Date.now()) return true; return false;
}
const tentativas = new Map();

// ───────── HTTP ─────────
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'content-security-policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'" };
const server = http.createServer(async (req, res) => {
  for (const [k, v] of Object.entries(SEC)) res.setHeader(k, v);
  try {
    const url = new URL(req.url, 'http://x'), p = url.pathname, m = req.method;
    if (p === '/healthz') return send(res, 200, { ok: true, rev: revAtual() });
    // ── API dos painéis (licença) ──
    if (p === '/api/v1/manifest' && m === 'GET') {
      const c = clienteDaChave(req), desde = Math.max(0, +url.searchParams.get('desde') || 0);
      const itens = all('SELECT * FROM itens WHERE ativo=1 AND rev>? ORDER BY rev', desde).filter(it => vePlano(c, it)).map(r => pubItem(r));
      const removidos = all('SELECT chave FROM itens WHERE ativo=0 AND rev>?', desde).map(r => r.chave);
      const todas = all('SELECT chave FROM itens WHERE ativo=1').map(r => r.chave);
      run('UPDATE clientes SET ultimo_sync=?, rev_sync=?, versao_painel=?, ip=? WHERE id=?', T(), revAtual(), String(req.headers['x-painel'] || '').slice(0, 40), ipDe(req), c.id);
      return send(res, 200, { rev: revAtual(), cliente: c.nome, plano: c.plano, expira: c.expira || null, itens, removidos, todas });
    }
    let mt;
    if ((mt = p.match(/^\/api\/v1\/arquivo\/([a-f0-9]{64})$/)) && m === 'GET') {
      const c = clienteDaChave(req), it = one('SELECT * FROM itens WHERE sha=? AND ativo=1', mt[1]); if (!it || !vePlano(c, it)) throw fail(404, 'Arquivo não encontrado');
      const f = path.join(FILES, it.sha + '.' + it.ext); if (!fs.existsSync(f)) throw fail(404, 'Arquivo ausente no servidor');
      res.writeHead(200, { 'content-type': EXT_MIME[it.ext] || 'application/octet-stream', 'content-length': fs.statSync(f).size, 'cache-control': 'private, max-age=86400' }); return fs.createReadStream(f).pipe(res);
    }
    // ── admin ──
    if (p === '/api/admin/login' && m === 'POST') {
      const ip = ipDe(req), t = tentativas.get(ip) || { n: 0, ate: 0 }; if (t.ate > Date.now()) throw fail(429, 'Muitas tentativas. Espere alguns minutos.');
      const b = await readJson(req, 1e4), ok = String(b.senha || '').length === ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(String(b.senha)), Buffer.from(ADMIN_PASSWORD));
      if (!ok) { t.n++; if (t.n >= 6) { t.ate = Date.now() + 10 * 60e3; t.n = 0; } tentativas.set(ip, t); throw fail(401, 'Senha incorreta'); }
      tentativas.delete(ip); const s = crypto.randomBytes(24).toString('hex'); sessoes.set(s, Date.now() + 7 * 864e5);
      return send(res, 200, { ok: true }, { 'set-cookie': `bc_sess=${s}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 86400}${process.env.HTTPS === '1' ? '; Secure' : ''}` });
    }
    if (p === '/api/admin/logout' && m === 'POST') { const s = cookie(req).bc_sess; sessoes.delete(s); return send(res, 200, { ok: true }, { 'set-cookie': 'bc_sess=; Path=/; Max-Age=0' }); }
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) throw fail(401, 'Entre com a senha de administrador');
      if (p === '/api/admin/resumo' && m === 'GET') {
        const porTipo = Object.fromEntries(TIPOS.map(t => [t, one('SELECT COUNT(*) n FROM itens WHERE ativo=1 AND tipo=?', t).n]));
        const cls = all('SELECT * FROM clientes ORDER BY id DESC').map(c => ({ ...c, chave: c.chave.slice(0, 7) + '…' + c.chave.slice(-4), em_dia: c.rev_sync >= revAtual() }));
        return send(res, 200, { rev: revAtual(), porTipo, clientes: cls, historico: all('SELECT * FROM historico ORDER BY id DESC LIMIT 40'), espaco: all('SELECT COALESCE(SUM(size),0) s FROM itens WHERE ativo=1')[0].s });
      }
      if (p === '/api/admin/itens' && m === 'GET') return send(res, 200, { itens: all('SELECT * FROM itens WHERE ativo=1 ORDER BY tipo, titulo').map(r => pubItem(r, false)) });
      if ((mt = p.match(/^\/api\/admin\/itens\/(.+)$/))) {
        const chave = decodeURIComponent(mt[1]);
        if (m === 'GET') { const it = one('SELECT * FROM itens WHERE chave=?', chave); if (!it) throw fail(404, 'Item não encontrado'); return send(res, 200, pubItem(it)); }
        if (m === 'DELETE') { removeItem(chave); return send(res, 200, { ok: true, rev: revAtual() }); }
      }
      if ((mt = p.match(/^\/api\/admin\/arquivo\/([a-f0-9]{64})$/)) && m === 'GET') {
        const it = one('SELECT * FROM itens WHERE sha=?', mt[1]); if (!it) throw fail(404, 'Arquivo não encontrado'); const f = path.join(FILES, it.sha + '.' + it.ext); if (!fs.existsSync(f)) throw fail(404, 'Arquivo ausente');
        res.writeHead(200, { 'content-type': EXT_MIME[it.ext] || 'application/octet-stream', 'cache-control': 'private, max-age=3600' }); return fs.createReadStream(f).pipe(res);
      }
      // texto (template, conhecimento, estilo) em JSON
      if (p === '/api/admin/itens' && m === 'POST') { const b = await readJson(req, 4e6); const r = upsertItem(b); if (r.mudou) hist(`${r.novo ? 'Publicou' : 'Atualizou'} ${r.chave}`); return send(res, 200, { ...r, rev: revAtual() }); }
      // arquivo de mídia (corpo cru): ?titulo=&kind=&tags=&chave=&ext=
      if (p === '/api/admin/midia' && m === 'POST') {
        const q = url.searchParams, buf = await readBody(req, MAX_FILE);
        const meta = { kind: String(q.get('kind') || 'outro').slice(0, 20), tags: String(q.get('tags') || '').slice(0, 300), nome: slug(q.get('nome') || q.get('titulo') || '').replace(/\//g, '-').slice(0, 60), nota: String(q.get('nota') || '').slice(0, 600), colecao: String(q.get('colecao') || '').slice(0, 20), planos: q.get('planos') ? q.get('planos').split(',').map(s => s.trim()).filter(Boolean) : undefined };
        const r = upsertItem({ tipo: 'midia', chave: q.get('chave') || '', titulo: q.get('titulo') || meta.nome, meta, arquivo: { buf, ext: q.get('ext') } });
        if (r.mudou) hist(`${r.novo ? 'Publicou' : 'Atualizou'} ${r.chave}`); return send(res, 200, { ...r, rev: revAtual() });
      }
      // pacote vindo do painel matriz: vários itens de uma vez (arquivos em base64)
      if (p === '/api/admin/importar' && m === 'POST') {
        const b = await readJson(req, 400e6), L = Array.isArray(b.itens) ? b.itens.slice(0, 500) : []; const out = { novos: 0, atualizados: 0, iguais: 0, erros: [] };
        for (const it of L) { try { const r = upsertItem({ tipo: it.tipo, chave: it.chave, titulo: it.titulo, meta: it.meta, conteudo: it.conteudo, arquivo: it.arquivo_b64 ? { buf: Buffer.from(it.arquivo_b64, 'base64'), ext: it.ext } : null }); if (!r.mudou) out.iguais++; else if (r.novo) out.novos++; else out.atualizados++; } catch (e) { out.erros.push(`${it.chave || it.titulo}: ${e.message}`); } }
        if (out.novos || out.atualizados) hist(`Importou do painel ${b.origem ? '“' + String(b.origem).slice(0, 40) + '”' : ''}: ${out.novos} novo(s), ${out.atualizados} atualizado(s)`);
        return send(res, 200, { ...out, rev: revAtual() });
      }
      if (p === '/api/admin/clientes' && m === 'POST') {
        const b = await readJson(req, 1e4), nome = String(b.nome || '').trim().slice(0, 100); if (!nome) throw fail(400, 'Falta o nome do cliente');
        const chave = novaChave(); const r = run('INSERT INTO clientes(nome,contato,chave,plano,ativo,expira,created_at) VALUES(?,?,?,?,1,?,?)', nome, String(b.contato || '').slice(0, 200), chave, String(b.plano || 'completo').slice(0, 30), /^\d{4}-\d{2}-\d{2}$/.test(b.expira || '') ? b.expira : '', T());
        hist(`Novo cliente: ${nome}`); return send(res, 200, { id: +r.lastInsertRowid, chave });
      }
      if ((mt = p.match(/^\/api\/admin\/clientes\/(\d+)(\/nova-chave|\/chave)?$/))) {
        const c = one('SELECT * FROM clientes WHERE id=?', +mt[1]); if (!c) throw fail(404, 'Cliente não encontrado');
        if (mt[2] === '/chave' && m === 'GET') return send(res, 200, { chave: c.chave });
        if (mt[2] === '/nova-chave' && m === 'POST') { const k = novaChave(); run('UPDATE clientes SET chave=? WHERE id=?', k, c.id); hist(`Trocou a chave de ${c.nome}`); return send(res, 200, { chave: k }); }
        if (m === 'PUT') { const b = await readJson(req, 1e4); run('UPDATE clientes SET nome=?, contato=?, plano=?, ativo=?, expira=? WHERE id=?', String(b.nome ?? c.nome).slice(0, 100), String(b.contato ?? c.contato).slice(0, 200), String(b.plano ?? c.plano).slice(0, 30), b.ativo === undefined ? c.ativo : (b.ativo ? 1 : 0), b.expira === undefined ? c.expira : (/^\d{4}-\d{2}-\d{2}$/.test(b.expira || '') ? b.expira : ''), c.id); if (b.ativo !== undefined && !!b.ativo !== !!c.ativo) hist(`${b.ativo ? 'Reativou' : 'Suspendeu'} ${c.nome}`); return send(res, 200, { ok: true }); }
        if (m === 'DELETE') { run('DELETE FROM clientes WHERE id=?', c.id); hist(`Apagou o cliente ${c.nome}`); return send(res, 200, { ok: true }); }
      }
      throw fail(404, 'Rota não encontrada');
    }
    if (p === '/' || p === '/index.html') return send(res, 200, fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8'));
    throw fail(404, 'Não encontrado');
  } catch (e) {
    const st = e.status || 500; if (st >= 500) console.error(e);
    if (!res.headersSent) send(res, st, { error: st >= 500 ? 'Erro interno' : e.message }); else res.end();
  }
});
server.listen(PORT, HOST, () => console.log(`Biblioteca Central em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} (dados em ${DATA_DIR})`));
