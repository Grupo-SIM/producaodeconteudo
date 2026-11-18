// Sites no Atlas: os agentes postam nos sites que o dono tem no Atlas Hosting (Criador de Sites e WordPress).
// - O Atlas é outro sistema: aqui só chamamos a API dele (ATLAS_URL + ATLAS_API_TOKEN), que atende os sites da conta master.
// - Cada "destino" liga um site do Atlas a uma marca e a um formato (Post de blog ou Matéria), com os agentes escolhidos,
//   a meta por dia e a chave "Publicar sem aprovação" (desligada por padrão: o post espera você na Mesa de revisão).
// - Recebe tudo o que precisa do server.js por injeção, como o fluxo-v2.mjs.

export const FORMATOS_DESTINO = {
  blog: { nome: 'Post de blog', agentes: ['revisorcopy', 'gerente'], obrigatorios: [] },
  materia: { nome: 'Matéria', agentes: ['radar', 'revisorcopy', 'seo', 'gerente', 'designer'], obrigatorios: ['radar'] }
};
export const AGENTE_NOME = { roteirista: 'Roteirista', radar: 'Agente de Notícias', revisorcopy: 'Revisor de Copy', seo: 'Agente de SEO', gerente: 'Revisor', designer: 'Designer (capa)' };

const ROTULOS = [
  ['palavra', /^palavra-chave(?: principal)?$/], ['relacionadas', /^palavras relacionadas$/], ['tituloSeo', /^t[íi]tulo seo$/],
  ['meta', /^meta descri[çc][ãa]o$|^meta description$/], ['slug', /^slug$|^url$/], ['manchete', /^manchete(?: \(h1\))?$/], ['linhaFina', /^linha fina$/],
  ['data', /^data e hora$/], ['autor', /^autor$/], ['secao', /^se[çc][ãa]o$/], ['fontes', /^fontes$/], ['links', /^links internos sugeridos$/], ['imagem', /^imagem$/]
];
const BLOCO = new Set(['fontes', 'links']);   // rótulos seguidos de lista

/** Lê a ficha (linhas rotuladas) e o corpo da matéria ou do post de blog que o Roteirista entregou. */
export function extrairArtigo(texto) {
  let t = String(texto || '').replace(/\r\n?/g, '\n').replace(/^```[a-z]*\n?|```\s*$/gim, '');
  t = t.replace(/^[ \t]*#{0,3}[ \t]*(?:\*\*)?MAT[ÉE]RIA(?:[ \t]+COMPLETA)?(?:\*\*)?[ \t]*:?[ \t]*\n/im, '');
  // o que vem depois da legenda ou dos pedidos ao gerente não é parte do artigo
  t = t.replace(/\n[ \t]*#{1,3}[ \t]*(LEGENDA|PEDIDOS? AO GERENTE|OBSERVA[ÇC][ÕO]ES)\b[\s\S]*$/i, '');
  const ficha = {}, corpo = [], linhas = t.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(/^\s*(?:[-*]\s*)?\**\s*([^:*]{2,40}?)\s*\**\s*:\s*\**\s*(.*)$/);
    const chave = m && ROTULOS.find(([, re]) => re.test(m[1].trim().toLowerCase()))?.[0];
    if (!chave) { corpo.push(linhas[i]); continue; }
    let valor = m[2].replace(/\*\*$/, '').trim();
    if (BLOCO.has(chave)) {
      const itens = valor ? [valor] : [];
      while (i + 1 < linhas.length && /^\s*([-*•]|\d+[.)])\s+|^\s*https?:\/\//.test(linhas[i + 1])) itens.push(linhas[++i].replace(/^\s*([-*•]|\d+[.)])\s+/, '').trim());
      valor = itens;
    }
    ficha[chave] = valor;
  }
  let md = corpo.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // o H1 vira o título do post: não repete no corpo
  const h1 = md.match(/^#\s+(.+)$/m);
  if (h1) md = md.replace(h1[0], '').trim();
  if (Array.isArray(ficha.fontes) && ficha.fontes.length) md += `\n\n## Fontes\n\n${ficha.fontes.map(f => `- ${f}`).join('\n')}`;
  const titulo = String(ficha.manchete || h1?.[1] || ficha.tituloSeo || '').replace(/^["“]|["”]$/g, '').trim();
  const slug = String(ficha.slug || '').replace(/^https?:\/\/[^/]+/, '').replace(/^\/+|\/+$/g, '').split('/').pop() || '';
  const imagem = String(ficha.imagem || ''), alt = (imagem.match(/(?:alt|texto alternativo)[^:]*:\s*(.+)$/i) || [])[1] || imagem;
  return { titulo, slug, resumo: String(ficha.meta || ficha.linhaFina || '').trim(), secao: String(ficha.secao || '').trim(), alt: alt.trim().slice(0, 280), corpoMd: md };
}

export function criarAtlas(ctx) {
  const { db, all, one, run, T, getContent, setContent, contentAct, changed, log, readBody, send, fail, str, addChat, clip } = ctx;
  const jp = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

  db.exec(`CREATE TABLE IF NOT EXISTS atlas_destinos(
    id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, site_id TEXT NOT NULL, nome TEXT NOT NULL DEFAULT '', dominio TEXT DEFAULT '',
    brand TEXT NOT NULL, formato TEXT NOT NULL, categoria TEXT DEFAULT '', foco TEXT DEFAULT '', agentes TEXT NOT NULL DEFAULT '[]',
    meta_dia INTEGER NOT NULL DEFAULT 0, publica_sozinho INTEGER NOT NULL DEFAULT 0, ativo INTEGER NOT NULL DEFAULT 1, criado_em TEXT, atualizado_em TEXT)`);
  for (const [col, def] of [['destino_id', 'INTEGER'], ['agentes', "TEXT DEFAULT ''"], ['atlas_status', "TEXT DEFAULT ''"], ['atlas_erro', "TEXT DEFAULT ''"], ['atlas_url', "TEXT DEFAULT ''"], ['atlas_em', "TEXT DEFAULT ''"]]) {
    if (!db.prepare('PRAGMA table_info(contents)').all().some(x => x.name === col)) db.exec(`ALTER TABLE contents ADD COLUMN ${col} ${def}`);
  }

  const cfg = () => ({ url: String(process.env.ATLAS_URL || '').trim().replace(/\/+$/, ''), token: String(process.env.ATLAS_API_TOKEN || '').trim() });
  const configurado = () => { const c = cfg(); return !!(c.url && c.token); };
  async function chamaAtlas(caminho, { method = 'GET', body, timeout = 600000 } = {}) {
    const c = cfg();
    if (!configurado()) throw fail(503, 'Ligação com o Atlas desligada: preencha ATLAS_URL e ATLAS_API_TOKEN no .env (o token é o mesmo PDC_API_TOKEN do Atlas).');
    let r;
    try {
      r = await fetch(c.url + caminho, { method, headers: { authorization: 'Bearer ' + c.token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout), redirect: 'error' });
    } catch (e) { throw new Error(e?.name === 'TimeoutError' ? 'O Atlas demorou demais para responder.' : 'Não consegui falar com o Atlas (' + (e?.cause?.code || e?.message || 'rede') + ').'); }
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('O Atlas recusou o token: confira se ATLAS_API_TOKEN é igual ao PDC_API_TOKEN do Atlas.');
    if (!r.ok || j.ok === false) throw new Error(j.error || `O Atlas respondeu ${r.status}.`);
    return j;
  }

  const destino = id => id ? one('SELECT * FROM atlas_destinos WHERE id=?', +id) : null;
  const destinoView = d => ({ ...d, agentes: jp(d.agentes, []), publica_sozinho: !!d.publica_sozinho, ativo: !!d.ativo });
  /** Agentes que trabalham neste item; `null` = item fora de um site do Atlas (vale o padrão do painel). */
  const agentesDo = c => { const a = c?.destino_id ? jp(c.agentes, null) : null; return Array.isArray(a) ? a : null; };

  function normalizaAgentes(formato, lista) {
    const F = FORMATOS_DESTINO[formato];
    return ['roteirista', ...new Set([...F.obrigatorios, ...(Array.isArray(lista) ? lista : []).filter(a => F.agentes.includes(a))])];
  }
  function vincular(contentId, destinoId) {
    const d = destino(destinoId); if (!d || !contentId) return;
    setContent(contentId, { destino_id: d.id, agentes: d.agentes });
  }
  /** Notícia criada pelo Agente de Notícias: vai para o site que recebe matérias desta marca (o primeiro ativo). */
  function vincularPorMarca(contentId, brand, formato) {
    const d = one('SELECT id FROM atlas_destinos WHERE ativo=1 AND formato=? AND brand=? COLLATE NOCASE ORDER BY id LIMIT 1', formato, brand || '');
    if (d) vincular(contentId, d.id);
  }

  // ───────── publicar
  const enviando = new Set();
  function pronto(c, d) {
    if (d.formato === 'materia') return !!c.materia && !!c.materia_aprovada && c.materia_aprovada !== 'pendente';
    return ['approved', 'posted'].includes(c.status) && !!c.script;
  }
  async function publicar(id, { forcar = false } = {}) {
    const c = getContent(id), d = destino(c?.destino_id);
    if (!c || !d) throw fail(400, 'Este item não está ligado a um site do Atlas.');
    if (!pronto(c, d)) throw fail(400, d.formato === 'materia' ? 'Aprove a matéria do site antes de publicar.' : 'Aprove o post antes de publicar.');
    if (!forcar && c.atlas_status === 'ok') return { ok: true, url: c.atlas_url };
    if (enviando.has(c.id)) return { ok: true, enviando: true };
    enviando.add(c.id);
    setContent(c.id, { atlas_status: 'enviando', atlas_erro: '' }); changed();
    try {
      const art = ctx.extrair(c, d.formato);
      const capa = ctx.capaDe(c);   // 1ª arte do Designer ou a foto da notícia; sem nenhuma, o post vai sem capa
      const r = await chamaAtlas('/api/pdc/posts', { method: 'POST', body: {
        destino: { tipo: d.tipo, id: d.site_id }, pdcId: `c${c.id}`, titulo: (art.titulo || c.title).slice(0, 300), slug: art.slug || null,
        resumo: art.resumo.slice(0, 1000) || null, corpoMd: art.corpoMd, categoria: (d.categoria || art.secao || '').slice(0, 80) || null,
        capa: capa ? { base64: capa.buf.toString('base64'), tipo: capa.tipo, alt: (art.alt || c.title).slice(0, 300) } : null
      } });
      setContent(c.id, { atlas_status: r.url ? 'ok' : 'salvo', atlas_url: r.url || '', atlas_erro: r.aviso || '', atlas_em: T() });
      if (r.url) {
        if (d.formato === 'materia') { try { ctx.fluxoAcao(c.id, 'postado', { rede: 'site', link: r.url }); } catch (e) { console.error('marcar matéria postada:', e.message); } }
        else {
          run('INSERT OR REPLACE INTO postagens(content_id,rede,parte,url,ts) VALUES(?,?,?,?,?)', c.id, 'site', 'post', r.url, T());
          if (getContent(c.id).status === 'approved') contentAct(c.id, 'posted', { post_url: r.url });
        }
      }
      log('publicador', r.url ? `Publicado no site ${d.nome || d.dominio}: "${c.title}" (${r.url})` : `Salvo no site ${d.nome || d.dominio}, mas não foi ao ar: ${r.aviso || ''}`, c.id);
      if (r.aviso) addChat('gerente', `“${clip(c.title, 70)}” foi para o site ${d.nome || d.dominio}, com um aviso: ${r.aviso}`);
      changed();
      return { ok: true, url: r.url || null, aviso: r.aviso || '' };
    } catch (e) {
      const msg = clip(e?.message || 'Falha ao publicar.', 400);
      setContent(c.id, { atlas_status: 'erro', atlas_erro: msg });
      log('publicador', `Falha ao publicar no site ${d.nome || d.dominio}: "${c.title}" — ${msg}`, c.id);
      addChat('gerente', `Não consegui publicar “${clip(c.title, 70)}” no site ${d.nome || d.dominio}: ${msg}\nAbra o item e use “Publicar no site de novo”.`);
      changed();
      if (e?.status) throw e;
      return { ok: false, error: msg };
    } finally { enviando.delete(c.id); }
  }
  const publicarSolto = id => { publicar(id).catch(e => console.error('publicar no Atlas:', e.message)); };

  /** Você aprovou (o post ou só a matéria): se o item é de um site do Atlas, publica. */
  function depoisDeAprovar(id) {
    const c = getContent(id), d = destino(c?.destino_id);
    if (c && d && d.ativo && pronto(c, d) && c.atlas_status !== 'ok') publicarSolto(id);
  }
  /** O item chegou na Mesa de revisão: se o site publica sem aprovação, aprova e publica sozinho. */
  function chegouNaMesa(id) {
    const c = getContent(id), d = destino(c?.destino_id);
    if (!c || !d || !d.ativo || !d.publica_sozinho) return;
    setImmediate(() => {
      try {
        if (d.formato === 'materia') {
          if (!c.materia) return;
          setContent(id, { materia_aprovada: T() });
          log(null, `Matéria de "${c.title}" aprovada sozinha: o site ${d.nome || d.dominio} publica sem aprovação`, id);
          publicarSolto(id);
        } else {
          log(null, `"${c.title}" aprovado sozinho: o site ${d.nome || d.dominio} publica sem aprovação`, id);
          contentAct(id, 'approve', { forcar: true });   // o contentAct chama depoisDeAprovar
        }
        changed();
      } catch (e) { log('publicador', `Não consegui aprovar sozinho "${c.title}": ${e.message}`, id); }
    });
  }

  // ───────── meta por dia de cada site
  const diaLocal = t => new Date(t).toLocaleDateString('en-CA', { timeZone: ctx.settings().tz || 'America/Sao_Paulo' });
  function pedir(d, qtd, origem = 'auto') {
    if (d.formato === 'materia') return ctx.enqueue(null, 'radar', 'radar', { brand: d.brand, destino_id: d.id }, origem);
    return ctx.enqueue(null, 'chefe', 'pautas', { auto: origem === 'auto', brand: d.brand, quota: { feed: qtd }, kinds: ['texto'], destino_id: d.id, meta: `atlas|${d.id}`, ...(d.foco ? { tema: d.foco } : {}) }, origem);
  }
  function metasTick() {
    const s = ctx.settings(), hora = +new Date().toLocaleString('en-US', { timeZone: s.tz || 'America/Sao_Paulo', hour: 'numeric', hour12: false });
    if (hora < +(s.start_hour || 0) || !configurado()) return;
    const hoje = diaLocal(Date.now()), desde = new Date(Date.now() - 40 * 3600e3).toISOString();
    for (const d of all('SELECT * FROM atlas_destinos WHERE ativo=1 AND meta_dia>0')) {
      const feitos = all('SELECT created_at FROM contents WHERE destino_id=? AND created_at>=?', d.id, desde).filter(c => diaLocal(c.created_at) === hoje).length;
      const falta = d.meta_dia - feitos; if (falta <= 0) continue;
      const tag = `"destino_id":${d.id}`;
      if (one("SELECT 1 x FROM jobs WHERE kind IN ('pautas','radar') AND status IN ('queued','running') AND input LIKE ?", '%' + tag + '%')) continue;
      if (one("SELECT COUNT(*) n FROM jobs WHERE kind IN ('pautas','radar') AND cday=? AND input LIKE ?", hoje, '%' + tag + '%').n >= 3) continue;
      pedir(d, falta);
    }
  }
  setInterval(() => { try { metasTick(); } catch (e) { console.error('metas dos sites do Atlas:', e.message); } }, 60e3).unref();

  // ───────── API /api/v2/atlas/...
  function lerDestino(b, atual = {}) {
    const formato = b.formato ?? atual.formato;
    if (!FORMATOS_DESTINO[formato]) throw fail(400, 'Formato inválido: escolha Post de blog ou Matéria.');
    const brand = str(b.brand ?? atual.brand, 120, 'Marca');
    if (!one('SELECT 1 x FROM brands WHERE name=? COLLATE NOCASE', brand)) throw fail(400, 'Marca não encontrada.');
    return {
      formato, brand,
      categoria: str(b.categoria ?? atual.categoria ?? '', 80, 'Categoria', false),
      foco: str(b.foco ?? atual.foco ?? '', 1500, 'Foco', false),
      agentes: JSON.stringify(normalizaAgentes(formato, b.agentes ?? jp(atual.agentes, []))),
      meta_dia: Math.max(0, Math.min(20, Math.trunc(+(b.meta_dia ?? atual.meta_dia ?? 0) || 0))),
      publica_sozinho: (b.publica_sozinho ?? !!atual.publica_sozinho) ? 1 : 0,
      ativo: (b.ativo ?? atual.ativo ?? 1) ? 1 : 0
    };
  }

  async function rota(req, res, p, m) {
    let mt;
    if (p === '/api/v2/atlas/estado' && m === 'GET') return send(res, 200, { configurado: configurado(), formatos: FORMATOS_DESTINO, nomes: AGENTE_NOME });
    if (p === '/api/v2/atlas/sites' && m === 'GET') {
      const r = await chamaAtlas('/api/pdc/sites', { timeout: 30000 });
      const D = all('SELECT id,tipo,site_id,formato,brand FROM atlas_destinos');
      return send(res, 200, { sites: (r.sites || []).map(s => ({ ...s, destinos: D.filter(d => d.tipo === s.tipo && d.site_id === String(s.id)) })) });
    }
    if (p === '/api/v2/atlas/destinos' && m === 'GET') {
      const u = new URL(req.url, 'http://x'), marca = u.searchParams.get('marca') || '';
      const L = marca ? all('SELECT * FROM atlas_destinos WHERE brand=? COLLATE NOCASE ORDER BY id', marca) : all('SELECT * FROM atlas_destinos ORDER BY brand, id');
      return send(res, 200, { destinos: L.map(d => ({ ...destinoView(d), publicados: one("SELECT COUNT(*) n FROM contents WHERE destino_id=? AND atlas_status='ok'", d.id).n })) });
    }
    if (p === '/api/v2/atlas/destinos' && m === 'POST') {
      const b = await readBody(req), v = lerDestino(b);
      const tipo = ['builder', 'wordpress'].includes(b.tipo) ? b.tipo : null; if (!tipo) throw fail(400, 'Tipo de site inválido.');
      const siteId = str(String(b.site_id ?? ''), 64, 'Site');
      const r = run('INSERT INTO atlas_destinos(tipo,site_id,nome,dominio,brand,formato,categoria,foco,agentes,meta_dia,publica_sozinho,ativo,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        tipo, siteId, str(b.nome ?? '', 160, 'Nome', false), str(b.dominio ?? '', 255, 'Domínio', false), v.brand, v.formato, v.categoria, v.foco, v.agentes, v.meta_dia, v.publica_sozinho, v.ativo, T(), T());
      log(null, `Site do Atlas conectado: ${b.nome || b.dominio || siteId} (${FORMATOS_DESTINO[v.formato].nome} de ${v.brand})`);
      changed();
      return send(res, 200, { ok: true, id: +r.lastInsertRowid });
    }
    if ((mt = p.match(/^\/api\/v2\/atlas\/destinos\/(\d+)$/))) {
      const d = destino(mt[1]); if (!d) throw fail(404, 'Site conectado não encontrado.');
      if (m === 'PUT') {
        const v = lerDestino(await readBody(req), d);
        run('UPDATE atlas_destinos SET brand=?,formato=?,categoria=?,foco=?,agentes=?,meta_dia=?,publica_sozinho=?,ativo=?,atualizado_em=? WHERE id=?', v.brand, v.formato, v.categoria, v.foco, v.agentes, v.meta_dia, v.publica_sozinho, v.ativo, T(), d.id);
        changed(); return send(res, 200, { ok: true });
      }
      if (m === 'DELETE') {
        run('DELETE FROM atlas_destinos WHERE id=?', d.id);
        log(null, `Site do Atlas desconectado: ${d.nome || d.dominio}`); changed();
        return send(res, 200, { ok: true });
      }
    }
    if ((mt = p.match(/^\/api\/v2\/atlas\/destinos\/(\d+)\/gerar$/)) && m === 'POST') {
      const d = destino(mt[1]); if (!d) throw fail(404, 'Site conectado não encontrado.');
      pedir(d, 1, 'manual'); ctx.pump?.();
      log(null, `Você pediu 1 ${FORMATOS_DESTINO[d.formato].nome.toLowerCase()} agora para o site ${d.nome || d.dominio}`);
      return send(res, 200, { ok: true });
    }
    if ((mt = p.match(/^\/api\/v2\/atlas\/itens\/(\d+)$/)) && m === 'GET') {
      const c = getContent(+mt[1]); if (!c) throw fail(404, 'Conteúdo não encontrado');
      const d = destino(c.destino_id);
      return send(res, 200, { destino: d ? destinoView(d) : null, agentes: agentesDo(c), status: c.atlas_status || '', erro: c.atlas_erro || '', url: c.atlas_url || '', em: c.atlas_em || '', pronto: d ? pronto(c, d) : false });
    }
    if ((mt = p.match(/^\/api\/v2\/atlas\/itens\/(\d+)\/publicar$/)) && m === 'POST') {
      const r = await publicar(+mt[1], { forcar: true });
      if (!r.ok) throw fail(502, r.error);
      return send(res, 200, r);
    }
    throw fail(404, 'Rota não encontrada');
  }

  return { rota, agentesDo, vincular, vincularPorMarca, depoisDeAprovar, chegouNaMesa, publicar };
}
