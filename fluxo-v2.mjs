// Fluxo v2: base do novo front (public/app.html).
// - Mapeia contents.status + jobs para os estados novos (etapa do agente, Esperando você, Em ajuste, Parado, Na fila, Finalizado)
// - Tabela de formatos (raias): etapas, meta por dia, modo Manual/Automático
// - Ações: aprovar, pedir ajuste, descartar, restaurar, marcar postado, salvar edição (gera versão)
// - Histórico de versões por item e regra aprendida da edição do dono (com "desfazer")
// Recebe tudo o que precisa do server.js por injeção, para não duplicar regra de negócio.

export const ESTADOS = {
  etapa: 'Etapa do agente', esperando: 'Esperando você', ajuste: 'Em ajuste',
  parado: 'Parado', fila: 'Na fila', finalizado: 'Finalizado', descartado: 'Descartado'
};

export const FORMATOS_PADRAO = [
  { id: 'carrossel', nome: 'Carrossel', etapas: ['roteirista', 'gerente', 'designer', 'revisao', 'publicacao'], meta: 2 },
  { id: 'estatico', nome: 'Estático', etapas: ['roteirista', 'gerente', 'designer', 'revisao', 'publicacao'], meta: 1 },
  { id: 'stories', nome: 'Stories de venda', etapas: ['roteirista', 'gerente', 'designer', 'revisao', 'publicacao'], meta: 1 },
  { id: 'reels', nome: 'Reels', etapas: ['roteirista', 'gerente', 'editor', 'revisao', 'publicacao'], meta: 1 },
  { id: 'materia', nome: 'Matéria de jornal', etapas: ['radar', 'roteirista', 'gerente', 'designer', 'revisao', 'publicacao'], meta: 2 },
  { id: 'blog', nome: 'Post de blog', etapas: ['roteirista', 'gerente', 'revisao', 'publicacao'], meta: 1 }
];
export const ETAPA_NOME = { radar: 'Radar', roteirista: 'Roteiro', gerente: 'Revisão do gerente', designer: 'Arte', editor: 'Vídeo', publicador: 'Pacote', revisao: 'Sua revisão', publicacao: 'Publicação' };

// Campos que o dono pode editar pela revisão e que viram versão
const CAMPOS_EDITAVEIS = ['title', 'script', 'caption', 'materia', 'art_spec', 'spec', 'brief'];

export function raiaDe(c, ctx) {
  if (c.raia) return c.raia;
  if (ctx.isVideo(c.format)) return 'reels';
  if (c.materia || c.kind === 'noticia') return 'materia';
  if (ctx.textoPuro(c)) return 'blog';
  if (c.format === 'stories') return 'stories';
  if (c.format === 'carrossel') return 'carrossel';
  return 'estatico';
}

// Estado novo a partir do status antigo e dos jobs ativos do item
export function estadoDe(c, jobs = []) {
  const ativos = jobs.filter(j => j.status === 'queued' || j.status === 'running');
  const rodando = ativos.find(j => j.status === 'running');
  const futuro = t => t && new Date(t).getTime() > Date.now();
  const comErro = jobs.some(j => j.status === 'error') && !ativos.length;
  const ajuste = !!c.em_ajuste;
  switch (c.status) {
    case 'posted': return { estado: 'finalizado', etapa: 'publicacao' };
    case 'discarded': return { estado: 'descartado', etapa: '' };
    case 'approved': return { estado: c.avulso ? 'finalizado' : 'esperando', etapa: 'publicacao' };
    case 'awaiting_approval': case 'awaiting_script': return { estado: 'esperando', etapa: 'revisao', roteiro: c.status === 'awaiting_script' };
    case 'blocked': if (!/dangerously-skip|root\/sudo|limite de uso|sem resposta/i.test(c.error || '')) return { estado: 'esperando', etapa: 'revisao', travado: true, motivo: c.error || 'O revisor reprovou: decida você' }; return { estado: 'fila', etapa: 'roteirista', motivo: '' };
    case 'error': return { estado: 'parado', etapa: rodando?.agent || '', motivo: c.error || 'Erro' };
  }
  if (comErro || c.error && !ativos.length) return { estado: 'parado', etapa: jobs.at(-1)?.agent || '', motivo: c.error || jobs.at(-1)?.error || 'Parado' };
  if (rodando) return { estado: ajuste ? 'ajuste' : 'etapa', etapa: rodando.agent };
  if (ativos.length) {
    const j = ativos[0];
    if (futuro(j.run_after) || c.status === 'queued') return { estado: 'fila', etapa: j.agent, quando: j.run_after || null };
    return { estado: ajuste ? 'ajuste' : 'etapa', etapa: j.agent, aguardando: true };
  }
  if (c.status === 'queued') return { estado: 'fila', etapa: 'roteirista' };
  // entre uma etapa e outra o item fica alguns instantes sem tarefa: não é parado
  if (c.updated_at && Date.now() - new Date(c.updated_at).getTime() < 3 * 60e3) return { estado: ajuste ? 'ajuste' : 'etapa', etapa: jobs.at(-1)?.agent || 'roteirista', aguardando: true };
  return { estado: 'parado', etapa: '', motivo: 'Sem tarefa na fila' };
}

export function criarFluxoV2(ctx) {
  const { db, all, one, run, T, getContent, setContent, contentAct, changed, log, readBody, send, fail, str, addChat, clip } = ctx;
  const path = ctx.path, fsx = ctx.fs;
  db.exec(`CREATE TABLE IF NOT EXISTS descobertas(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, semana TEXT NOT NULL, raia TEXT DEFAULT '', agente TEXT DEFAULT 'roteirista', marca TEXT DEFAULT '', texto TEXT NOT NULL, evidencia TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'nova', regra_id INTEGER, UNIQUE(semana, texto))`);

  db.exec(`CREATE TABLE IF NOT EXISTS formatos(
    id TEXT PRIMARY KEY, nome TEXT NOT NULL, etapas TEXT NOT NULL, meta_dia INTEGER NOT NULL DEFAULT 1,
    modo TEXT NOT NULL DEFAULT 'manual', ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, updated_at TEXT)`);
  db.exec(`CREATE TABLE IF NOT EXISTS content_versions(
    id INTEGER PRIMARY KEY AUTOINCREMENT, content_id INTEGER NOT NULL, n INTEGER NOT NULL, ts TEXT NOT NULL,
    autor TEXT NOT NULL DEFAULT 'dono', motivo TEXT DEFAULT '', campos TEXT NOT NULL, antes TEXT NOT NULL, depois TEXT NOT NULL, resumo TEXT DEFAULT '', aprendido INTEGER DEFAULT 0)`);
  db.exec('CREATE INDEX IF NOT EXISTS content_versions_c ON content_versions(content_id, n)');
  for (const [col, def] of [['em_ajuste', 'INTEGER DEFAULT 0'], ['ajuste_motivo', "TEXT DEFAULT ''"], ['status_antes', "TEXT DEFAULT ''"], ['raia', "TEXT DEFAULT ''"], ['avulso', 'INTEGER DEFAULT 0']]) {
    if (!db.prepare('PRAGMA table_info(contents)').all().some(x => x.name === col)) db.exec(`ALTER TABLE contents ADD COLUMN ${col} ${def}`);
  }
  FORMATOS_PADRAO.forEach((f, i) => run('INSERT OR IGNORE INTO formatos(id,nome,etapas,meta_dia,modo,ordem,updated_at) VALUES(?,?,?,?,?,?,?)', f.id, f.nome, JSON.stringify(f.etapas), f.meta, 'manual', i, T()));

  // Produtos conhecidos do treino (conhecimento/produtos.json): entram uma vez, sem sobrescrever o que já foi cadastrado ou editado
  try {
    const lista = JSON.parse(fsx.readFileSync(path.join(ctx.dirname, 'conhecimento', 'produtos.json'), 'utf8'));
    for (const p of lista) {
      if (one('SELECT 1 x FROM products WHERE lower(name)=lower(?)', p.name)) continue;
      const r = run('INSERT INTO products(brand,name,type,url,price,deliverable,promise,audience,pains,objections,bonus,guarantee,page_text,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', '', p.name, p.type || 'outro', p.url || '', p.price || '', p.deliverable || '', p.promise || '', p.audience || '', p.pains || '', p.objections || '', p.bonus || '', p.guarantee || '', p.page_text || '', T(), T());
      for (const m of p.marcas || []) { const b = one('SELECT name FROM brands WHERE lower(name)=lower(?)', m); if (b) run('INSERT OR IGNORE INTO product_brands(product_id,brand) VALUES(?,?)', +r.lastInsertRowid, b.name); }
      log(null, `Produto cadastrado a partir do treino: ${p.name}`);
    }
  } catch (e) { if (e.code !== 'ENOENT') console.error('produtos do treino:', e.message); }
  // Itens parados pelo erro antigo de configuração (já corrigido no servidor): voltam sozinhos para a fila, sem aparecer como problema
  setTimeout(() => { try {
    const presos = all("SELECT DISTINCT c.id FROM contents c LEFT JOIN jobs j ON j.content_id=c.id WHERE c.status NOT IN ('posted','discarded','approved') AND (c.error LIKE '%dangerously-skip-permissions%' OR c.error LIKE '%root/sudo%' OR j.error LIKE '%dangerously-skip-permissions%' OR j.error LIKE '%root/sudo%')");
    for (const { id } of presos) { run("UPDATE jobs SET status='done', error='' WHERE content_id=? AND status='error'", id); setContent(id, { error: '' }); try { contentAct(id, 'reprocess'); } catch { /* segue */ } }
    if (presos.length) { log(null, `${presos.length} item(ns) parados pelo erro antigo de configuração voltaram para a fila`); changed(); }
  } catch (e) { console.error('reprocessar presos:', e.message); } }, 3000).unref?.();
  db.exec('CREATE TABLE IF NOT EXISTS brand_metas(brand TEXT NOT NULL, raia TEXT NOT NULL, qtd INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(brand, raia))');
  const novoFormatos = () => { try { return JSON.parse(fsx.readFileSync(path.join(ctx.dirname, 'conhecimento', 'formatos-novo-conteudo.json'), 'utf8')); } catch { return []; } };
  const diaLocal = t => new Date(t).toLocaleDateString('en-CA', { timeZone: ctx.settings().tz || 'America/Sao_Paulo' });
  // Modo autônomo por marca: a cada minuto confere a meta de cada marca × formato e pede ao Gerente só as pautas que faltam
  function metasTick() {
    const s = ctx.settings();   // a grade de Produção diária é o único gatilho: tudo zerado = nada é criado sozinho
    const hora = +new Date().toLocaleString('en-US', { timeZone: s.tz || 'America/Sao_Paulo', hour: 'numeric', hour12: false }); if (hora < +(s.start_hour || 0)) return;
    const hoje = diaLocal(Date.now()), F = novoFormatos();
    const feitos = all("SELECT * FROM contents WHERE teste=0 AND created_by IN ('autopilot','grade_aprovada') AND created_at>=?", new Date(Date.now() - 40 * 3600e3).toISOString()).filter(c => diaLocal(c.created_at) === hoje);
    for (const m of all('SELECT * FROM brand_metas WHERE qtd>0')) {
      const f = F.find(x => x.id === m.raia); if (!f) continue;
      const falta = m.qtd - feitos.filter(c => (c.brand || '').toLowerCase() === m.brand.toLowerCase() && raiaDe(c, ctx) === m.raia).length; if (falta <= 0) continue;
      // primeiro a copy já aprovada (nada de copy nova enquanto houver aprovada para o formato); só sem nenhuma o Gerente pede pauta nova
      let usadas = 0; for (let k = 0; k < falta; k++) { const pc = aprovadaPara(m.brand, m.raia); if (!pc) break; criarDeAprovada(pc, m.brand, 'grade_aprovada'); usadas++; }
      if (usadas >= falta) continue;
      const tag = `"meta":"${m.brand}|${m.raia}"`;
      if (one("SELECT 1 x FROM jobs WHERE kind='pautas' AND status IN ('queued','running') AND input LIKE ?", '%' + tag + '%')) continue;
      if (one("SELECT COUNT(*) n FROM jobs WHERE kind='pautas' AND cday=? AND input LIKE ?", hoje, '%' + tag + '%').n >= 3) continue;
      ctx.enqueue(null, 'chefe', 'pautas', { auto: true, brand: m.brand, quota: { [f.format]: falta - usadas }, kinds: f.tipos.map(t => t[0]), meta: `${m.brand}|${m.raia}` }, 'auto');
    }
  }
  // Itens parados por causa técnica que se resolve sozinha (limite da assinatura, resposta vazia, erro antigo): tenta de novo a cada hora
  function retentaTick() {
    const L = all("SELECT DISTINCT c.id FROM contents c JOIN jobs j ON j.content_id=c.id WHERE c.teste=0 AND c.status NOT IN ('posted','discarded','approved','awaiting_approval','awaiting_script') AND j.status='error' AND (j.error LIKE '%limite de uso%' OR j.error LIKE '%sem resposta%' OR j.error LIKE '%dangerously-skip%' OR j.error LIKE '%root/sudo%') AND (j.finished_at IS NULL OR j.finished_at < ?)", new Date(Date.now() - 3600e3).toISOString());
    for (const { id } of L) { run("UPDATE jobs SET status='done', error='' WHERE content_id=? AND status='error'", id); setContent(id, { error: '' }); try { contentAct(id, 'reprocess'); } catch { /* segue */ } }
    if (L.length) { log(null, `${L.length} item(ns) parados por limite ou falha do Claude voltaram para a fila sozinhos`); changed(); }
  }
  ctx.temMetasMarca = () => !!one('SELECT 1 x FROM brand_metas WHERE qtd>0');
  // uma vez só: tira da fila as sobras da versão antiga (pautas automáticas e notícias criadas sozinhas que não chegaram na Mesa); vão para a lixeira
  setTimeout(() => { try { if (one("SELECT 1 x FROM settings WHERE key='sobras_limpas_v1'")) return;
    const L = all("SELECT id,status FROM contents WHERE teste=0 AND created_by NOT IN ('manual','treino_designer','grade_aprovada') AND status NOT IN ('posted','discarded','approved','awaiting_approval','awaiting_script')");
    for (const c of L) { run("DELETE FROM jobs WHERE content_id=? AND status='queued'", c.id); setContent(c.id, { status: 'discarded', status_antes: c.status, em_ajuste: 0 }); }
    run("DELETE FROM jobs WHERE status='queued' AND content_id IS NULL AND kind IN ('pautas','radar') AND origin='auto'");
    run("INSERT OR REPLACE INTO settings(key,value) VALUES('sobras_limpas_v1','1')");
    if (L.length) { log(null, `${L.length} peça(s) criadas sozinhas pela versão antiga saíram da fila (estão na lixeira)`); changed(); }
  } catch (e) { console.error('limpar sobras:', e.message); } }, 4000).unref?.();
  ctx.metaDe = (brand, raia) => one('SELECT qtd FROM brand_metas WHERE brand=? COLLATE NOCASE AND raia=?', brand, raia)?.qtd || 0;
  // começa tudo zerado (decisão do dono, em treino): uma vez só, zera as metas que já existiam
  if (!one("SELECT 1 x FROM settings WHERE key='metas_zeradas_v1'")) { run('UPDATE brand_metas SET qtd=0'); run("INSERT OR REPLACE INTO settings(key,value) VALUES('metas_zeradas_v1','1')"); }
  setInterval(() => { try { metasTick(); } catch (e) { console.error('metas por marca:', e.message); } }, 60e3).unref();
  setInterval(() => { try { retentaTick(); } catch (e) { console.error('retentativa:', e.message); } }, 15 * 60e3).unref();

  const formatos = () => all('SELECT * FROM formatos ORDER BY ordem').map(f => ({ ...f, etapas: JSON.parse(f.etapas), ativo: !!f.ativo }));
  const jobsDe = id => all('SELECT agent,kind,status,error,run_after FROM jobs WHERE content_id=? ORDER BY id', id);
  const hoje = () => new Date().toISOString().slice(0, 10);

  function item(c, jobs) {
    const e = estadoDe(c, jobs ?? jobsDe(c.id));
    return {
      id: c.id, titulo: c.title, marca: c.brand || '', produto_id: c.product_id || null, formato: c.format, tipo: c.kind, raia: raiaDe(c, ctx),
      status: c.status, ...e, estado_nome: ESTADOS[e.estado], etapa_nome: ETAPA_NOME[e.etapa] || e.etapa,
      em_ajuste: !!c.em_ajuste, ajuste_motivo: c.ajuste_motivo || '', nota: c.score, post_url: c.post_url || '', postado_em: c.posted_at,
      tem_arte: c.art_status === 'ok', tem_video: !!c.video, tem_spec: !!c.spec, tem_art_spec: !!c.art_spec, atualizado: c.updated_at, criado: c.created_at,
      thumb: c.art_status === 'ok' ? `/api/contents/${c.id}/arte/file/1?review=1&t=${encodeURIComponent(c.updated_at)}` : ''
    };
  }

  function fluxo({ marca = '', incluirDescartados = false } = {}) {
    const ativos = all("SELECT content_id,agent,kind,status,error,run_after FROM jobs WHERE status IN ('queued','running','error') AND content_id IS NOT NULL ORDER BY id");
    const porC = new Map(); for (const j of ativos) { if (!porC.has(j.content_id)) porC.set(j.content_id, []); porC.get(j.content_id).push(j); }
    const rows = all(`SELECT * FROM contents WHERE teste=0 ${marca ? 'AND brand=? COLLATE NOCASE' : ''} ${incluirDescartados ? '' : "AND status<>'discarded'"} AND (status<>'posted' OR posted_at>=?) ORDER BY updated_at DESC LIMIT 600`, ...(marca ? [marca] : []), new Date(Date.now() - 14 * 864e5).toISOString());
    const itens = rows.map(c => item(c, porC.get(c.id) || []));
    // por que está aguardando: posição na fila (mesma ordem do agendador) e quem está rodando agora
    const fila = all("SELECT j.id,j.content_id,j.kind,j.agent FROM jobs j JOIN agents a ON a.id=j.agent LEFT JOIN contents c ON c.id=j.content_id WHERE j.status='queued' AND a.enabled=1 AND (j.run_after IS NULL OR j.run_after<=?) ORDER BY (j.kind IN ('chat','teste')) DESC, (j.origin='manual' OR c.created_by IN ('manual','treino_designer')) DESC, j.id", T());
    const st = ctx.settings(), usadas = one("SELECT COUNT(*) n FROM jobs WHERE day=? AND kind NOT IN ('chat','teste')", diaLocal(Date.now()))?.n || 0, limite = 0;
    const rodando = all("SELECT j.agent, c.title FROM jobs j LEFT JOIN contents c ON c.id=j.content_id WHERE j.status='running'");
    const vagas = Math.max(1, +ctx.settings().concurrency || 1), manual = !!ctx.manual?.();
    for (const i of itens) if (i.aguardando) {   // posição na fila do próprio agente
      const meu = fila.find(j => j.content_id === i.id), dele = meu ? fila.filter(j => j.agent === meu.agent) : [];
      i.fila = { pos: meu ? dele.indexOf(meu) + 1 : 0, ocupado: meu ? rodando.some(r => r.agent === meu.agent) : false, rodando: rodando.length, vagas, manual, limite }; }
    const fs = formatos().map(f => {
      const da = itens.filter(i => i.raia === f.id), cont = {};
      for (const i of da) cont[i.estado] = (cont[i.estado] || 0) + 1;
      const feitosHoje = one(`SELECT COUNT(*) n FROM contents WHERE teste=0 AND status IN ('approved','posted') AND substr(updated_at,1,10)=? ${marca ? 'AND brand=? COLLATE NOCASE' : ''}`, hoje(), ...(marca ? [marca] : [])).n;
      return { ...f, contagem: cont, total: da.length, hoje: da.filter(i => ['finalizado', 'esperando'].includes(i.estado) && i.atualizado?.slice(0, 10) === hoje()).length, feitos_hoje_geral: feitosHoje };
    });
    const avisos = itens.filter(i => i.estado === 'parado').slice(0, 5).map(i => ({ id: i.id, titulo: i.titulo, motivo: i.motivo }));
    return { formatos: fs, itens, avisos, estados: ESTADOS, etapas: ETAPA_NOME, rodando, vagas: Math.max(1, +ctx.settings().concurrency || 1) };
  }

  function novaVersao(id, autor, campos, antes, depois, motivo = '', resumo = '') {
    const n = (one('SELECT MAX(n) n FROM content_versions WHERE content_id=?', id)?.n || 0) + 1;
    run('INSERT INTO content_versions(content_id,n,ts,autor,motivo,campos,antes,depois,resumo) VALUES(?,?,?,?,?,?,?,?,?)', id, n, T(), autor, motivo, JSON.stringify(campos), JSON.stringify(antes), JSON.stringify(depois), resumo);
    return n;
  }

  // Diferença legível entre dois textos (palavras removidas/incluídas) para o gerente
  function resumoDiff(a, b) {
    a = String(a ?? ''); b = String(b ?? '');
    if (a === b) return '';
    const wa = a.split(/\s+/).filter(Boolean), wb = b.split(/\s+/).filter(Boolean);
    const sa = new Set(wa), sb = new Set(wb);
    const saiu = [...new Set(wa.filter(w => !sb.has(w)))].slice(0, 12), entrou = [...new Set(wb.filter(w => !sa.has(w)))].slice(0, 12);
    const tam = wb.length - wa.length;
    return [saiu.length && `tirou: ${saiu.join(' ')}`, entrou.length && `incluiu: ${entrou.join(' ')}`, tam && `${tam > 0 ? '+' : ''}${tam} palavras`].filter(Boolean).join(' · ');
  }

  function salvarEdicao(id, b, autor) {
    const c = getContent(id); if (!c) throw fail(404, 'Conteúdo não encontrado');
    const f = {}, antes = {}, depois = {};
    for (const k of CAMPOS_EDITAVEIS) if (k in (b.campos || {})) {
      let v = b.campos[k]; if (typeof v !== 'string') v = JSON.stringify(v);
      v = str(v, 200000, k, false);
      if (v !== (c[k] ?? '')) { f[k] = v; antes[k] = c[k] ?? ''; depois[k] = v; }
    }
    if (!Object.keys(f).length) return { ok: true, versao: null, mudou: [] };
    if (c.status === 'posted' || c.status === 'discarded') throw fail(400, 'Este item não pode mais ser editado');
    // a primeira edição do dono guarda a versão do agente como n=1, para o histórico ter o original
    if (!one('SELECT 1 x FROM content_versions WHERE content_id=?', id)) novaVersao(id, 'agente', Object.keys(f), {}, Object.fromEntries(Object.keys(f).map(k => [k, c[k] ?? ''])), 'Versão do agente');
    const resumo = Object.keys(f).map(k => `${k}: ${resumoDiff(antes[k], depois[k])}`).join('\n');
    if (f.art_spec && !c.art_spec_base) f.art_spec_base = c.art_spec || '';
    if (f.spec && !c.spec_base) f.spec_base = c.spec || '';
    setContent(id, f);
    const n = novaVersao(id, autor, Object.keys(depois), antes, depois, str(b.motivo, 500, 'Motivo', false), resumo);
    log(null, `Você editou "${c.title}" (versão ${n})`, id);
    return { ok: true, versao: n, mudou: Object.keys(depois), resumo };
  }

  // Ao aprovar: o gerente olha as edições do dono ainda não aprendidas e grava uma regra (status ativa), com "desfazer" no chat
  function aprenderDasEdicoes(c) {
    const vs = all("SELECT * FROM content_versions WHERE content_id=? AND autor<>'agente' AND aprendido=0 ORDER BY n", c.id);
    if (!vs.length) return null;
    run('UPDATE content_versions SET aprendido=1 WHERE content_id=?', c.id);
    const agente = vs.some(v => JSON.parse(v.campos).some(k => k === 'art_spec')) ? 'designer' : vs.some(v => JSON.parse(v.campos).includes('spec')) ? 'editor' : 'roteirista';
    const resumo = vs.map(v => v.resumo).filter(Boolean).join('\n');
    const motivo = vs.map(v => v.motivo).filter(Boolean).join('; ');
    const texto = clip(`Nas peças de ${raiaDe(c, ctx)}${c.brand ? ' da marca ' + c.brand : ''}, siga o padrão que o dono aplicou ao editar: ${motivo || resumo.replace(/\n/g, '; ')}`, 600);
    const r = run("INSERT INTO brain_rules(agent,brand,type,text,evidence,source,status,weight,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", agente, c.brand || '', 'regra', texto, clip(`Edição do dono em "${c.title}" (#${c.id}):\n${resumo}`, 1500), 'edicao_dono', 'ativa', 2, T(), T());
    const rid = +r.lastInsertRowid;
    addChat('gerente', `Aprendi com a sua edição em "${clip(c.title, 60)}" e salvei uma regra para o ${agente}:\n“${texto}”`, { actions: [{ ok: true, texto: `Regra #${rid} salva para o ${agente}`, tipo: 'desfazer_regra', regra: rid, rotulo: 'Desfazer' }] });
    return rid;
  }

  function acao(id, nome, b, user) {
    const c = getContent(id); if (!c) throw fail(404, 'Conteúdo não encontrado');
    const autor = user?.name || 'dono';
    if (nome === 'aprovar') {
      if (c.status === 'awaiting_script') contentAct(id, 'approve_script', b);
      else contentAct(id, 'approve', b);
      setContent(id, { em_ajuste: 0, ajuste_motivo: '' });
      const regra = aprenderDasEdicoes(getContent(id));
      if (c.avulso && getContent(id).status === 'approved') setContent(id, { status: 'posted', posted_at: T() });   // roteiro avulso vai direto para Finalizado
      return { ok: true, regra };
    }
    if (nome === 'ajuste') {
      const motivo = str(b.motivo, 3500, 'Motivo');
      contentAct(id, 'changes', { feedback: motivo, target: b.alvo, motivos: b.motivos });
      setContent(id, { em_ajuste: 1, ajuste_motivo: motivo });
      return { ok: true };
    }
    if (nome === 'descartar') {
      if (c.status === 'discarded') return { ok: true };
      run("DELETE FROM jobs WHERE content_id=? AND status='queued'", id);
      setContent(id, { status: 'discarded', status_antes: c.status, em_ajuste: 0 });
      log(null, `Você descartou "${c.title}" (fica na lixeira)`, id);
      return { ok: true };
    }
    if (nome === 'restaurar') {
      if (c.status !== 'discarded') throw fail(400, 'Este item não está na lixeira');
      const volta = c.status_antes || 'awaiting_approval';
      setContent(id, { status: volta, status_antes: '' });
      if (['producing', 'queued'].includes(volta)) contentAct(id, 'reprocess');   // os pedidos da fila foram apagados ao descartar: recomeça a etapa
      log(null, `Você restaurou "${c.title}" da lixeira`, id);
      return { ok: true };
    }
    if (nome === 'postado') {
      const link = str(b.link ?? b.post_url, 500, 'Link', false);
      if (link && !/^https?:\/\//i.test(link)) throw fail(400, 'O link precisa começar com http:// ou https://');
      contentAct(id, 'posted', { post_url: link });
      return { ok: true };
    }
    if (nome === 'resolver') {   // o dono resolveu a causa (login, limite, ajuste): limpa o erro e a etapa recomeça de onde parou
      if (['posted', 'discarded'].includes(c.status)) throw fail(400, 'Este item não está parado');
      run("UPDATE jobs SET status='done', error='' WHERE content_id=? AND status='error'", id);
      setContent(id, { error: '' });
      contentAct(id, 'reprocess');
      log(null, `Você marcou "${c.title}" como resolvido: a produção recomeçou`, id);
      return { ok: true };
    }
    if (nome === 'editar') return salvarEdicao(id, b, autor);
    if (nome === 'voltar_versao') {
      const v = one('SELECT * FROM content_versions WHERE content_id=? AND n=?', id, +b.n); if (!v) throw fail(404, 'Versão não encontrada');
      // reconstroi o estado dos campos na versão n (último valor gravado até n)
      const campos = {}; for (const x of all('SELECT depois FROM content_versions WHERE content_id=? AND n<=? ORDER BY n', id, v.n)) Object.assign(campos, JSON.parse(x.depois));
      return salvarEdicao(id, { campos, motivo: `Voltou para a versão ${v.n}` }, autor);
    }
    throw fail(404, 'Ação desconhecida');
  }


  // ── Otimização
  const engaj = x => (x.likes || 0) + 2 * (x.saves || 0) + 2 * (x.shares || 0) + (x.comments || 0);
  function otimizacao() {
    const rows = all(`SELECT c.id,c.title,c.brand,c.format,c.kind,c.materia,c.raia,c.posted_at,c.post_url, COALESCE(MAX(m.views),0) views, COALESCE(MAX(m.likes),0) likes, COALESCE(MAX(m.saves),0) saves, COALESCE(MAX(m.shares),0) shares, COALESCE(MAX(m.comments),0) comments, COUNT(m.id) medidas
      FROM contents c LEFT JOIN metrics m ON m.content_id=c.id WHERE c.teste=0 AND c.status='posted' GROUP BY c.id ORDER BY c.posted_at DESC LIMIT 500`);
    const itens = rows.map(r => ({ ...r, raia: raiaDe(r, ctx), score: engaj(r) }));
    const porRaia = {}; for (const i of itens) (porRaia[i.raia] ||= []).push(i);
    return { itens: itens.sort((a, b) => b.score - a.score), contagem: Object.fromEntries(Object.entries(porRaia).map(([k, v]) => [k, { postados: v.length, medidos: v.filter(x => x.medidas).length }])), descobertas: all("SELECT * FROM descobertas ORDER BY status='nova' DESC, id DESC LIMIT 40"), minimo: 10 };
  }
  // Descobertas da semana: compara tipos de conteúdo e marcas dentro de cada formato (só com dados suficientes)
  function gerarDescobertas() {
    const semana = (() => { const d = new Date(); d.setDate(d.getDate() - d.getDay()); return d.toISOString().slice(0, 10); })();
    const { itens } = otimizacao(), novas = [];
    const porRaia = {}; for (const i of itens.filter(x => x.medidas)) (porRaia[i.raia] ||= []).push(i);
    for (const [raia, L] of Object.entries(porRaia)) {
      if (L.length < 4) continue;
      const media = L.reduce((a, x) => a + x.score, 0) / L.length || 1;
      const grupos = {}; for (const x of L) (grupos[x.kind] ||= []).push(x);
      for (const [kind, G] of Object.entries(grupos)) {
        if (G.length < 2) continue;
        const mg = G.reduce((a, x) => a + x.score, 0) / G.length, rel = mg / media;
        if (rel >= 1.3 || rel <= 0.7) {
          const texto = rel >= 1.3 ? `Em ${raia}, priorize conteúdo do tipo "${kind}": rende ${Math.round((rel - 1) * 100)}% acima da média.` : `Em ${raia}, evite conteúdo do tipo "${kind}": rende ${Math.round((1 - rel) * 100)}% abaixo da média.`;
          const ev = `${G.length} posts de "${kind}" contra ${L.length} no formato. Melhor: ${G.sort((a, b) => b.score - a.score)[0].title}`;
          const r = run('INSERT OR IGNORE INTO descobertas(ts,semana,raia,agente,texto,evidencia) VALUES(?,?,?,?,?,?)', T(), semana, raia, 'roteirista', texto, ev);
          if (r.changes) novas.push(texto);
        }
      }
      const top = [...L].sort((a, b) => b.score - a.score)[0];
      if (top && top.score > media * 1.8) { const t = `Em ${raia}, use como referência o post "${clip(top.title, 80)}": foi o de melhor desempenho.`; if (run('INSERT OR IGNORE INTO descobertas(ts,semana,raia,agente,texto,evidencia,marca) VALUES(?,?,?,?,?,?,?)', T(), semana, raia, 'roteirista', t, `Engajamento ${top.score} contra média ${Math.round(media)}`, top.brand || '').changes) novas.push(t); }
    }
    if (novas.length) { addChat('gerente', `Descobertas da semana na Otimização:\n• ${novas.join('\n• ')}\nAbra a tela Otimização para virar regra ou ignorar.`); changed(); }
    return novas;
  }
  // Sincronização com a pasta conhecimento/: regras aprendidas viram arquivos em conhecimento/aprendido/<agente>.md (fora da pasta de bases, para não entrarem em dobro no prompt)
  const raizCon = () => path.join(ctx.dirname, 'conhecimento');
  function exportarAprendido() {
    const dir = path.join(raizCon(), 'aprendido'); fsx.mkdirSync(dir, { recursive: true });
    const regras = all("SELECT * FROM brain_rules WHERE status='ativa' ORDER BY agent, brand, id"), por = {};
    for (const r of regras) (por[r.agent] ||= []).push(r);
    const arquivos = [];
    for (const [ag, L] of Object.entries(por)) {
      const f = path.join(dir, `${ag.replace(/[^a-z0-9_*-]/gi, '') || 'geral'}.md`.replace('*', 'todos'));
      fsx.writeFileSync(f, `# Regras aprendidas: ${ag}\n\n<!-- gerado pelo sistema em ${T()}: não edite à mão; ensine pelo chat ou pelos arquivos em conhecimento/agentes -->\n\n` + L.map(r => `- ${r.brand ? `[${r.brand}] ` : ''}${r.text.replace(/\n/g, ' ')} _(#${r.id}, ${r.source})_`).join('\n') + '\n');
      arquivos.push(path.relative(ctx.dirname, f));
    }
    run("INSERT INTO settings(key,value) VALUES('sync_exportado',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", T());
    return { ok: true, arquivos, regras: regras.length };
  }
  function syncStatus() {
    let bases = 0; try { for (const a of fsx.readdirSync(path.join(raizCon(), 'agentes'))) bases += fsx.readdirSync(path.join(raizCon(), 'agentes', a)).filter(f => f.endsWith('.md')).length; } catch { /* sem pasta */ }
    return { entrada: { arquivos: bases, carregados: one("SELECT COUNT(*) n FROM agent_docs WHERE origem='casa'")?.n || 0, como: 'Os arquivos de conhecimento/agentes entram sozinhos a cada início do servidor (e pelo botão Importar).' },
      saida: { ultima: one("SELECT value FROM settings WHERE key='sync_exportado'")?.value || null, regras: one("SELECT COUNT(*) n FROM brain_rules WHERE status='ativa'").n, como: 'As regras aprendidas são gravadas em conhecimento/aprendido/. Para chegarem ao GitHub, faça commit dessa pasta.' } };
  }
  setInterval(() => { try { if (new Date().getDay() === 1 && new Date().getHours() === 8) gerarDescobertas(); exportarAprendido(); } catch (e) { console.error('fluxo-v2 rotina:', e.message); } }, 3600e3).unref();

  function criarDeAprovada(pc, marca, origem) {
    const leg = (pc.texto.match(/^Legenda:\s*([\s\S]*?)(?:\n\s*\n|$)/m) || [])[1] || '', script = pc.texto.replace(/^Legenda:[\s\S]*?(?:\n\s*\n|$)/m, '').trim();
    const r = run("INSERT INTO contents(title,format,kind,platform,brief,goal,brand,status,script,caption,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
      pc.titulo, pc.format, pc.kind, 'instagram', `${origem === 'treino_designer' ? 'Treino do Designer' : 'Produção diária'}: copy aprovada nº ${pc.n} (${pc.secao}). Não reescreva a copy: dê vida a ela.`, '', marca, 'producing', script, leg.trim(), origem, T(), T());
    const id = +r.lastInsertRowid, ag = pc.format === 'video_vertical' ? 'editor' : 'designer';
    ctx.enqueue(id, ag, ag === 'designer' ? 'arte' : 'video', {}, 'manual');
    log(null, `${origem === 'treino_designer' ? 'Treino do Designer' : 'Produção diária'}: copy aprovada nº ${pc.n} "${pc.titulo}" foi para ${ag === 'designer' ? 'o Designer' : 'o Editor'} (${marca})`, id); changed();
    return id;
  }
  // assunto de cada marca (conhecimento/marcas-assuntos.json): copy de marketing só vai para marca de marketing, e assim por diante
  const semAc = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  // marca institucional: o produto citado na peça é a própria marca (ex.: Atlas -> Atlas Hosting)
  function institucionalDe(titulo) {
    let A = {}; try { A = JSON.parse(fsx.readFileSync(path.join(ctx.dirname, 'conhecimento', 'marcas-assuntos.json'), 'utf8'))._institucionais || {}; } catch { return ''; }
    const t = semAc(titulo), reais = all('SELECT name FROM brands').map(x => x.name);
    for (const [marca, prods] of Object.entries(A)) if (prods.some(pr => new RegExp('\\b' + semAc(pr) + '\\b').test(t))) return reais.find(r => semAc(r) === semAc(marca)) || marca;
    return '';
  }
  function marcasDoAssunto(nicho) {
    let A = {}; try { A = JSON.parse(fsx.readFileSync(path.join(ctx.dirname, 'conhecimento', 'marcas-assuntos.json'), 'utf8')); } catch { return []; }
    const k = Object.keys(A).find(x => x[0] !== '_' && semAc(x) === semAc(nicho)); const nomes = k ? A[k] : [];
    const reais = all('SELECT name FROM brands').map(x => x.name); return nomes.map(n => reais.find(r => semAc(r).replace(/\s+/g, '') === semAc(n).replace(/\s+/g, '')) || n);
  }
  // copy aprovada ainda não usada para a marca e o formato da grade (primeiro as feitas para a marca, depois as sem marca definida)
  const RAIA_FMT = { carrossel: p => p.format === 'carrossel', estatico: p => p.format === 'feed' && p.kind !== 'noticia', materia: p => p.format === 'feed' && p.kind === 'noticia', stories: p => p.format === 'stories', reels: p => p.format === 'video_vertical' };
  function aprovadaPara(marca, raia) {
    const ok = RAIA_FMT[raia]; if (!ok) return null;
    const L = pecasAprovadas().filter(p => !p.enviado && ok(p));
    return L.find(p => (p.sugeridas || []).some(b => b.toLowerCase() === marca.toLowerCase())) || null;
  }
  // lê as peças aprovadas no treino do Roteirista, com o formato de cada seção
  function pecasAprovadas() {
    let md = ''; try { md = fsx.readFileSync(path.join(ctx.dirname, 'carrosseis-aprovados-producao.md'), 'utf8'); } catch { return []; }
    const SEC = [[/^Educativo/i, 'carrossel', 'educativo'], [/^Hist[óo]ria real/i, 'carrossel', 'historia_real'], [/^Est[áa]tico/i, 'feed', 'educativo'], [/^Stories/i, 'stories', 'venda'], [/^Posts? de venda/i, 'carrossel', 'venda'], [/^Educativos aprovados/i, 'carrossel', 'educativo'], [/^Reels/i, 'video_vertical', 'educativo'], [/^Mat[ée]rias?/i, 'feed', 'noticia'], [/^Posts? de blog/i, '', 'texto']];
    const marcas = all('SELECT name FROM brands').map(x => x.name), usados = new Map(all("SELECT id, brief, status FROM contents WHERE created_by IN ('treino_designer','grade_aprovada') AND status<>'discarded'").map(c => [(c.brief.match(/nº (\w+)/) || [])[1], c]));
    const out = []; let sec = null, cur = null;
    for (const l of md.split('\n')) {
      const h2 = l.match(/^## (.+)/), h3 = l.match(/^### (\w+)\.\s*(.+)/);
      if (h2 && !cur?.dentroMateria) { const k = SEC.find(([re]) => re.test(h2[1])); if (k || /^N[ãa]o inclu/i.test(h2[1])) { sec = k ? { nome: h2[1].trim(), format: k[1], kind: k[2] } : null; cur = null; continue; } }
      if (h3) { cur = null; if (!sec) continue; const t = h3[2].trim(), marca = marcas.find(mm => t.toLowerCase().includes(mm.toLowerCase())) || '', sugeridas = marca ? [marca] : (/institucional/i.test(t) && institucionalDe(t)) ? [institucionalDe(t)] : marcasDoAssunto(t.split(':')[0]);
        let format = sec.format, kind = sec.kind; if (format === 'video_vertical') kind = /venda/i.test(t) ? 'venda' : /institucional/i.test(t) ? 'institucional' : 'educativo';
        const u = usados.get(h3[1]);
        cur = { n: h3[1], titulo: t.replace(/^[^:]{2,40}:\s*/, '').replace(/\s*\(.*?\)\s*,?\s*aprovad[oa].*$/i, '').replace(/,\s*aprovad[oa].*$/i, '').trim(), secao: sec.nome, nicho: t.split(':')[0], format, kind, marca, sugeridas, enviado: u ? { id: u.id, status: u.status } : null, texto: '' }; out.push(cur); continue; }
      if (cur) cur.texto += l + '\n';
    }
    return out;
  }

  async function rota(req, res, p, m, user) {
    let mt;
    if (p === '/api/v2/fluxo' && m === 'GET') { const u = new URL(req.url, 'http://x'); return send(res, 200, fluxo({ marca: u.searchParams.get('marca') || '', incluirDescartados: u.searchParams.get('lixeira') === '1' })); }
    if (p === '/api/v2/novo-formatos' && m === 'GET') { try { return send(res, 200, { formatos: JSON.parse(fsx.readFileSync(path.join(ctx.dirname, 'conhecimento', 'formatos-novo-conteudo.json'), 'utf8')) }); } catch { return send(res, 200, { formatos: [] }); } }
    // Fila: o que cada agente está fazendo agora e o que espera, na ordem em que vai ser feito
    if (p === '/api/v2/fila' && m === 'GET') {
      const st = ctx.settings(), usadas = one("SELECT COUNT(*) n FROM jobs WHERE day=? AND kind NOT IN ('chat','teste')", diaLocal(Date.now()))?.n || 0;
      const J = all(`SELECT j.id,j.agent,j.kind,j.status,j.origin,j.run_after,j.started_at,j.content_id,c.title,c.brand,c.created_by,c.status cst FROM jobs j LEFT JOIN contents c ON c.id=j.content_id
        WHERE j.status IN ('queued','running') ORDER BY (j.status='running') DESC, (j.kind IN ('chat','teste')) DESC, (j.origin='manual' OR c.created_by IN ('manual','treino_designer')) DESC, j.id`);
      const ag = all('SELECT id,name,enabled FROM agents ORDER BY rowid');
      const voce = j => j.origin === 'manual' || ['manual', 'treino_designer', 'grade_aprovada'].includes(j.created_by) || ['chat', 'teste'].includes(j.kind);
      const f = j => ({ job: j.id, id: j.content_id, titulo: j.title || ({ chat: 'Respondendo você no chat', pautas: 'Criando pautas', radar: 'Buscando notícias', cerebro: 'Consolidando o Cérebro', relatorio: 'Lendo as métricas' })[j.kind] || j.kind, marca: j.brand || '', voce: voce(j), sozinho: !voce(j) && !!j.content_id, quando: j.run_after && new Date(j.run_after) > new Date() ? j.run_after : null, desde: j.started_at });
      return send(res, 200, { usadas, limite: +st.max_jobs_day, vagas: Math.max(1, +st.concurrency || 1), agentes: ag.map(a => ({ id: a.id, nome: a.name, ligado: !!a.enabled, agora: J.filter(j => j.agent === a.id && j.status === 'running').map(f), fila: J.filter(j => j.agent === a.id && j.status === 'queued').map(f) })).filter(a => a.agora.length || a.fila.length),
        sozinhos: one(`SELECT COUNT(*) n FROM contents WHERE teste=0 AND created_by NOT IN ('manual','treino_designer','grade_aprovada') AND status NOT IN ('posted','discarded','approved','awaiting_approval','awaiting_script')`).n });
    }
    // descarta de uma vez o que foi criado sozinho e ainda não chegou na Mesa do dono (vai para a lixeira, dá para restaurar)
    if (p === '/api/v2/fila/limpar-sozinhos' && m === 'POST') {
      const L = all(`SELECT id,status,title FROM contents WHERE teste=0 AND created_by NOT IN ('manual','treino_designer','grade_aprovada') AND status NOT IN ('posted','discarded','approved','awaiting_approval','awaiting_script')`);
      for (const c of L) { run("DELETE FROM jobs WHERE content_id=? AND status='queued'", c.id); setContent(c.id, { status: 'discarded', status_antes: c.status, em_ajuste: 0 }); }
      if (L.length) log(null, `Você descartou ${L.length} peça(s) criadas sozinhas que ainda não tinham chegado para você (ficam na lixeira)`); changed();
      return send(res, 200, { descartados: L.length });
    }
    // Treino do Designer: copy já aprovada (carrosseis-aprovados-producao.md) vai direto para a arte, sem escrever roteiro novo
    if (p === '/api/v2/treino-designer' && m === 'GET') return send(res, 200, { pecas: pecasAprovadas().map(({ texto, ...x }) => x) });
    if (p === '/api/v2/treino-designer' && m === 'POST') {
      const b = await readBody(req, 20000), pc = pecasAprovadas().find(x => x.n === String(b.n)); if (!pc) throw fail(404, 'Peça aprovada não encontrada');
      if (!pc.format) throw fail(400, 'Este formato não tem arte (post de blog)');
      const br = one('SELECT name FROM brands WHERE name=? COLLATE NOCASE', String(b.brand || pc.marca || '')); if (!br) throw fail(400, 'Escolha a marca');
      return send(res, 200, { id: criarDeAprovada(pc, br.name, 'treino_designer') });
    }
    if (p === '/api/v2/metas' && m === 'GET') return send(res, 200, { metas: all('SELECT * FROM brand_metas'), formatos: novoFormatos(), marcas: all('SELECT name FROM brands ORDER BY name').map(x => x.name), autopilot: ctx.settings().autopilot === '1', hora: +(ctx.settings().start_hour || 0) });
    if (p === '/api/v2/metas' && m === 'PUT') {
      const b = await readBody(req, 20000), br = one('SELECT name FROM brands WHERE name=? COLLATE NOCASE', String(b.brand || '')); if (!br) throw fail(400, 'Marca não encontrada');
      if (!novoFormatos().some(f => f.id === b.raia)) throw fail(400, 'Formato inválido');
      run('INSERT INTO brand_metas(brand,raia,qtd) VALUES(?,?,?) ON CONFLICT(brand,raia) DO UPDATE SET qtd=excluded.qtd', br.name, b.raia, Math.max(0, Math.min(20, Math.round(+b.qtd || 0))));
      changed(); return send(res, 200, { ok: true });
    }
    if (p === '/api/v2/autonomo' && m === 'PUT') { const b = await readBody(req, 2000); run("INSERT INTO settings(key,value) VALUES('autopilot',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", b.ligado ? '1' : '0'); log(null, `Modo autônomo ${b.ligado ? 'ligado' : 'desligado'}`); changed(); return send(res, 200, { ok: true }); }
    if (p === '/api/v2/formatos' && m === 'GET') return send(res, 200, { formatos: formatos() });
    if ((mt = p.match(/^\/api\/v2\/formatos\/([a-z_]+)$/)) && m === 'PUT') {
      const f = one('SELECT * FROM formatos WHERE id=?', mt[1]); if (!f) throw fail(404, 'Formato não encontrado');
      const b = await readBody(req, 20000), up = {};
      if ('meta_dia' in b) up.meta_dia = Math.max(0, Math.min(50, Math.round(+b.meta_dia || 0)));
      if ('modo' in b) { if (!['manual', 'automatico'].includes(b.modo)) throw fail(400, 'Modo inválido'); up.modo = b.modo; }
      if ('ativo' in b) up.ativo = b.ativo ? 1 : 0;
      if ('nome' in b) up.nome = str(b.nome, 60, 'Nome');
      if ('etapas' in b) { if (!Array.isArray(b.etapas) || !b.etapas.length || b.etapas.some(e => !ETAPA_NOME[e])) throw fail(400, 'Etapas inválidas'); up.etapas = JSON.stringify(b.etapas); }
      if (!Object.keys(up).length) throw fail(400, 'Nada para atualizar');
      run(`UPDATE formatos SET ${Object.keys(up).map(k => k + '=?').join(',')}, updated_at=? WHERE id=?`, ...Object.values(up), T(), f.id);
      log(null, `Formato ${f.nome}: ${Object.entries(up).map(([k, v]) => k + '=' + v).join(', ')}`); changed();
      return send(res, 200, { ok: true });
    }
    if ((mt = p.match(/^\/api\/v2\/itens\/(\d+)$/)) && m === 'GET') {
      const c = getContent(+mt[1]); if (!c) throw fail(404, 'Conteúdo não encontrado');
      return send(res, 200, { ...item(c), roteiro: c.script, legenda: c.caption, materia: c.materia, brief: c.brief, art_spec: c.art_spec, spec: c.spec, video: c.video, versoes: all('SELECT n,ts,autor,motivo,campos,resumo FROM content_versions WHERE content_id=? ORDER BY n DESC', c.id).map(v => ({ ...v, campos: JSON.parse(v.campos) })) });
    }
    if ((mt = p.match(/^\/api\/v2\/itens\/(\d+)\/versoes$/)) && m === 'GET') return send(res, 200, { versoes: all('SELECT * FROM content_versions WHERE content_id=? ORDER BY n DESC', +mt[1]).map(v => ({ ...v, campos: JSON.parse(v.campos), antes: JSON.parse(v.antes), depois: JSON.parse(v.depois) })) });
    if ((mt = p.match(/^\/api\/v2\/itens\/(\d+)\/(aprovar|ajuste|descartar|restaurar|postado|editar|voltar_versao|resolver)$/)) && m === 'POST') {
      const b = await readBody(req, 4e5);
      const r = acao(+mt[1], mt[2], b, user); changed();
      return send(res, 200, r);
    }
    if ((mt = p.match(/^\/api\/v2\/regras\/(\d+)\/desfazer$/)) && m === 'POST') {
      const r = one('SELECT * FROM brain_rules WHERE id=?', +mt[1]); if (!r) throw fail(404, 'Regra não encontrada');
      run("UPDATE brain_rules SET status='arquivada', updated_at=? WHERE id=?", T(), r.id);
      addChat('gerente', `Pronto, desfiz a regra #${r.id}. Ela não vale mais.`); changed();
      return send(res, 200, { ok: true });
    }

    // ── Etapa 6: dados do Cérebro (agentes, arquivos e regras); q acende os arquivos ligados à pergunta
    if (p === '/api/v2/cerebro' && m === 'GET') {
      const q = String(new URL(req.url, 'http://x').searchParams.get('q') || '');
      const pal = new Set(q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3));
      const nota = t => { if (!pal.size) return 0; const w = String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); let n = 0; for (const x of pal) if (w.includes(x)) n++; return n; };
      const agentes = all('SELECT id,name,nick,role,color,enabled FROM agents ORDER BY id').map(a => {
        const docs = all('SELECT id,titulo,modo,origem,substr(conteudo,1,4000) c FROM agent_docs WHERE agent=? ORDER BY ordem,id', a.id).map(d => ({ id: 'd' + d.id, tipo: 'arquivo', titulo: d.titulo, modo: d.modo, origem: d.origem, n: nota(d.titulo + ' ' + d.titulo + ' ' + d.c) }));
        const regras = all("SELECT id,text,brand FROM brain_rules WHERE status='ativa' AND agent=? ORDER BY id DESC LIMIT 60", a.id).map(r => ({ id: 'r' + r.id, tipo: 'regra', titulo: clip(r.text, 140), marca: r.brand, n: nota(r.text) }));
        return { id: a.id, nome: a.nick || a.name, papel: a.role, cor: a.color, ativo: !!a.enabled, itens: [...docs, ...regras] };
      });
      const acesos = pal.size ? agentes.flatMap(a => a.itens.filter(i => i.n > 0).map(i => ({ agente: a.id, id: i.id, n: i.n }))).sort((x, y) => y.n - x.n).slice(0, 12) : [];
      return send(res, 200, { agentes, acesos });
    }
    if ((mt = p.match(/^\/api\/v2\/cerebro\/(d|r)(\d+)$/)) && m === 'GET') {
      const x = mt[1] === 'd' ? one('SELECT titulo, conteudo, agent, modo, origem, updated_at FROM agent_docs WHERE id=?', +mt[2]) : one('SELECT text conteudo, agent, brand, evidence, source origem, updated_at FROM brain_rules WHERE id=?', +mt[2]);
      if (!x) throw fail(404, 'Não encontrado'); return send(res, 200, x);
    }
    // ── Etapa 8: otimização (só postados)
    if (p === '/api/v2/otimizacao' && m === 'GET') return send(res, 200, otimizacao());
    if (p === '/api/v2/otimizacao/metricas' && m === 'POST') {
      const b = await readBody(req, 20000), c = getContent(+b.content_id); if (!c || c.status !== 'posted') throw fail(400, 'Só itens postados entram na otimização');
      const n = v => Math.max(0, Math.round(+v || 0));
      run('INSERT INTO metrics(date,platform,post_title,content_id,views,likes,comments,shares,saves,followers,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?)', (b.date || T()).slice(0, 10), str(b.platform, 40, 'Rede', false), c.title, c.id, n(b.views), n(b.likes), n(b.comments), n(b.shares), n(b.saves), 0, '');
      changed(); return send(res, 200, { ok: true });
    }
    if (p === '/api/v2/descobertas/gerar' && m === 'POST') return send(res, 200, { novas: gerarDescobertas() });
    if ((mt = p.match(/^\/api\/v2\/descobertas\/(\d+)\/(regra|ignorar)$/)) && m === 'POST') {
      const d = one('SELECT * FROM descobertas WHERE id=?', +mt[1]); if (!d) throw fail(404, 'Descoberta não encontrada');
      if (mt[2] === 'ignorar') run("UPDATE descobertas SET status='ignorada' WHERE id=?", d.id);
      else {
        const r = run("INSERT INTO brain_rules(agent,brand,type,text,evidence,source,status,weight,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", d.agente, d.marca, 'regra', d.texto, d.evidencia, 'otimizacao', 'ativa', 2, T(), T());
        run("UPDATE descobertas SET status='regra', regra_id=? WHERE id=?", +r.lastInsertRowid, d.id);
        addChat('gerente', `Virou regra: “${d.texto}”`, { actions: [{ ok: true, texto: `Regra #${r.lastInsertRowid} salva para o ${d.agente}`, tipo: 'desfazer_regra', regra: +r.lastInsertRowid }] });
      }
      changed(); return send(res, 200, { ok: true });
    }
    // ── Etapa 9: notificações e busca geral
    if (p === '/api/v2/notificacoes' && m === 'GET') {
      const f = fluxo();
      const L = f.itens.filter(i => i.estado === 'esperando').map(i => ({ chave: i.id + ':' + i.etapa, id: i.id, tipo: 'esperando', titulo: i.etapa === 'publicacao' ? `Pronto para postar: ${i.titulo}` : `Para você revisar: ${i.titulo}`, detalhe: i.marca || '', ts: i.atualizado }));
      return send(res, 200, { itens: L.sort((a, b) => String(b.ts).localeCompare(String(a.ts))).slice(0, 60) });
    }
    if (p === '/api/v2/busca' && m === 'GET') {
      const q = String(new URL(req.url, 'http://x').searchParams.get('q') || '').trim().slice(0, 80); if (q.length < 2) return send(res, 200, { resultados: [] });
      const like = '%' + q.replace(/[%_]/g, '') + '%', R = [];
      for (const c of all("SELECT id,title,brand,status FROM contents WHERE teste=0 AND (title LIKE ? OR script LIKE ? OR caption LIKE ?) ORDER BY updated_at DESC LIMIT 15", like, like, like)) R.push({ tipo: 'conteudo', id: c.id, titulo: c.title, sub: c.brand || '' });
      for (const b of all('SELECT id,name FROM brands WHERE name LIKE ? LIMIT 5', like)) R.push({ tipo: 'marca', id: b.id, titulo: b.name, sub: 'Marca' });
      for (const x of all('SELECT id,name FROM products WHERE name LIKE ? OR promise LIKE ? LIMIT 5', like, like)) R.push({ tipo: 'produto', id: x.id, titulo: x.name, sub: 'Produto' });
      for (const r of all("SELECT id,agent,text FROM brain_rules WHERE status='ativa' AND text LIKE ? LIMIT 8", like)) R.push({ tipo: 'regra', id: r.id, titulo: clip(r.text, 120), sub: 'Regra · ' + r.agent });
      for (const k of all('SELECT id,title,brand FROM knowledge WHERE title LIKE ? OR content LIKE ? LIMIT 6', like, like)) R.push({ tipo: 'documento', id: k.id, titulo: k.title, sub: k.brand || 'Base' });
      return send(res, 200, { resultados: R });
    }
    // ── Configurações: gasto do mês
    if (p === '/api/v2/gastos' && m === 'GET') {
      const ini = new Date(); ini.setDate(1); ini.setHours(0, 0, 0, 0); const i0 = ini.toISOString();
      const img = one('SELECT COALESCE(SUM(usd),0) s, COUNT(*) n FROM gen_costs WHERE ts>=?', i0), tk = one('SELECT COALESCE(SUM(tokens_in),0) ti, COALESCE(SUM(tokens_out),0) tout, COUNT(*) n FROM jobs WHERE created_at>=?', i0);
      return send(res, 200, { mes: i0.slice(0, 7), imagens_usd: img.s, imagens: img.n, tarefas: tk.n, tokens_in: tk.ti, tokens_out: tk.tout });
    }
    // ── Etapa 10: sincronizar o treino com conhecimento/
    if (p === '/api/v2/sync' && m === 'GET') return send(res, 200, syncStatus());
    if (p === '/api/v2/sync/exportar' && m === 'POST') { const r = exportarAprendido(); changed(); return send(res, 200, r); }
    if (p === '/api/v2/sync/importar' && m === 'POST') { ctx.carregaBasesAgentes?.(); changed(); return send(res, 200, { ok: true, ...syncStatus() }); }
    throw fail(404, 'Rota não encontrada');
  }

  return { rota, fluxo, acao, formatos, item, temMetasMarca: ctx.temMetasMarca, metaDe: ctx.metaDe };
}
