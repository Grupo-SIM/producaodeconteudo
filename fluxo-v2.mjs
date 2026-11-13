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
    case 'blocked': return { estado: 'parado', etapa: rodando?.agent || 'gerente', motivo: c.error || 'Travou na revisão' };
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

  const formatos = () => all('SELECT * FROM formatos ORDER BY ordem').map(f => ({ ...f, etapas: JSON.parse(f.etapas), ativo: !!f.ativo }));
  const jobsDe = id => all('SELECT agent,kind,status,error,run_after FROM jobs WHERE content_id=? ORDER BY id', id);
  const hoje = () => new Date().toISOString().slice(0, 10);

  function item(c, jobs) {
    const e = estadoDe(c, jobs ?? jobsDe(c.id));
    return {
      id: c.id, titulo: c.title, marca: c.brand || '', produto_id: c.product_id || null, formato: c.format, tipo: c.kind, raia: raiaDe(c, ctx),
      status: c.status, ...e, estado_nome: ESTADOS[e.estado], etapa_nome: ETAPA_NOME[e.etapa] || e.etapa,
      em_ajuste: !!c.em_ajuste, ajuste_motivo: c.ajuste_motivo || '', nota: c.score, post_url: c.post_url || '', postado_em: c.posted_at,
      tem_arte: c.art_status === 'ok', tem_video: !!c.video, atualizado: c.updated_at, criado: c.created_at,
      thumb: c.art_status === 'ok' ? `/api/contents/${c.id}/arte/file/1?review=1&t=${encodeURIComponent(c.updated_at)}` : ''
    };
  }

  function fluxo({ marca = '', incluirDescartados = false } = {}) {
    const ativos = all("SELECT content_id,agent,kind,status,error,run_after FROM jobs WHERE status IN ('queued','running','error') AND content_id IS NOT NULL ORDER BY id");
    const porC = new Map(); for (const j of ativos) { if (!porC.has(j.content_id)) porC.set(j.content_id, []); porC.get(j.content_id).push(j); }
    const rows = all(`SELECT * FROM contents WHERE teste=0 ${marca ? 'AND brand=? COLLATE NOCASE' : ''} ${incluirDescartados ? '' : "AND status<>'discarded'"} AND (status<>'posted' OR posted_at>=?) ORDER BY updated_at DESC LIMIT 600`, ...(marca ? [marca] : []), new Date(Date.now() - 14 * 864e5).toISOString());
    const itens = rows.map(c => item(c, porC.get(c.id) || []));
    const fs = formatos().map(f => {
      const da = itens.filter(i => i.raia === f.id), cont = {};
      for (const i of da) cont[i.estado] = (cont[i.estado] || 0) + 1;
      const feitosHoje = one(`SELECT COUNT(*) n FROM contents WHERE teste=0 AND status IN ('approved','posted') AND substr(updated_at,1,10)=? ${marca ? 'AND brand=? COLLATE NOCASE' : ''}`, hoje(), ...(marca ? [marca] : [])).n;
      return { ...f, contagem: cont, total: da.length, hoje: da.filter(i => ['finalizado', 'esperando'].includes(i.estado) && i.atualizado?.slice(0, 10) === hoje()).length, feitos_hoje_geral: feitosHoje };
    });
    const avisos = itens.filter(i => i.estado === 'parado').slice(0, 5).map(i => ({ id: i.id, titulo: i.titulo, motivo: i.motivo }));
    return { formatos: fs, itens, avisos, estados: ESTADOS, etapas: ETAPA_NOME };
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

  async function rota(req, res, p, m, user) {
    let mt;
    if (p === '/api/v2/fluxo' && m === 'GET') { const u = new URL(req.url, 'http://x'); return send(res, 200, fluxo({ marca: u.searchParams.get('marca') || '', incluirDescartados: u.searchParams.get('lixeira') === '1' })); }
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
    if ((mt = p.match(/^\/api\/v2\/itens\/(\d+)\/(aprovar|ajuste|descartar|restaurar|postado|editar|voltar_versao)$/)) && m === 'POST') {
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
      const L = f.itens.filter(i => i.estado === 'esperando' || i.estado === 'parado').map(i => ({ chave: i.id + ':' + i.estado + ':' + i.etapa, id: i.id, tipo: i.estado, titulo: i.estado === 'parado' ? `Parou: ${i.titulo}` : i.etapa === 'publicacao' ? `Pronto para postar: ${i.titulo}` : `Chegou para você: ${i.titulo}`, detalhe: i.motivo || i.marca || '', ts: i.atualizado }));
      for (const a of all("SELECT id,name FROM agents WHERE enabled=1")) { const e = one("SELECT error,finished_at FROM jobs WHERE agent=? ORDER BY id DESC LIMIT 1", a.id); if (e?.error && e.finished_at && Date.now() - new Date(e.finished_at) < 864e5) L.push({ chave: 'ag:' + a.id + ':' + e.finished_at, tipo: 'agente', titulo: `${a.name} parou com erro`, detalhe: clip(e.error, 140), ts: e.finished_at }); }
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

  return { rota, fluxo, acao, formatos, item };
}
