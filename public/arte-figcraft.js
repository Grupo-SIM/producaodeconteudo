// Ponte entre a arte do sistema (spec JSON) e o FigCraft (editor de design embutido em /figcraft/).
// abre(): desenha cada página como um quadro do FigCraft, com uma camada por texto, imagem e forma (cada uma guarda de qual
//         elemento da arte veio). le(): lê o que a pessoa mexeu e devolve a arte com SÓ o que mudou. O que o FigCraft não
//         desenha (faixas, curva, texturas, grão, brilho, vinheta, fades) fica intacto na arte e aparece na prévia final.
import { FONTES, zDe, camadas, roles, aplicaCaixa } from '/arte-slide.js';

export const GAP = 160;
const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000, clone = o => JSON.parse(JSON.stringify(o));
const hx = n => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');
const corHex = c => typeof c === 'string' ? c.toLowerCase().slice(0, 7) : c && typeof c === 'object' ? '#' + hx(c.r) + hx(c.g) + hx(c.b) : null;
const norm = a => { a = ((a % 360) + 540) % 360 - 180; return Math.abs(a) < .05 ? 0 : r1(a); };
const LST = { text: 'texts', item: 'items', shape: 'shapes' };
const mixHex = (a, b, t) => { const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

// formas que o FigCraft não desenha por si (selo, estrela, balão, ícone, cubo 3D, vidro, brilho, degradê, tracejado…): viram imagem fiel, que se move e redimensiona
const FORMA_SIMPLES = new Set(['rect', 'pill', 'circle', 'ring', 'line']);
const formaAssada = o => !!o && (!FORMA_SIMPLES.has(o.kind || 'rect') || o.tile || o.glass || o.glow || o.blur || o.color2 || o.dash || o.icon || o.stroke && o.kind !== 'ring');
const FX_TOPO = ['fade', 'vignette', 'fadeFront', 'grain'], FX_NOME = { fade: 'Degradê de leitura', vignette: 'Vinheta', fadeFront: 'Degradê na frente', grain: 'Grão' };
const hForma = (o, W, H) => o.kind === 'line' ? Math.max(2, Math.round((o.h ?? .004) * W)) : ['circle', 'star', 'ring'].includes(o.kind) ? (o.h != null ? Math.round(o.h * H) : Math.round((o.w ?? .3) * W)) : Math.round((o.h ?? .2) * H);

export function criaPonte(fc, ctx) {
  const { W, H, manifest } = ctx, ROLE = roles(W), D = ctx.defaults;
  const ex = (c, p) => fc.execute(c, p);
  const loaded = new Set(), famOf = {};   // arquivos de fonte já enviados ao FigCraft
  let snap = null;
  const pagina = ins => (snap && ins.pages?.find(p => p.id === snap.pageId)) || ins.pages?.[ins.pages.length - 1] || ins.pages?.[0];   // a página do FigCraft onde está a arte (se a pessoa criar outra página lá, a arte continua sendo esta)

  // ───────── fontes
  const arqFonte = (key, w) => {
    const F = FONTES[key]; if (!F) return null; const ws = F.weights, wm = ws.reduce((a, b) => Math.abs(b - w) < Math.abs(a - w) ? b : a, ws[0]);
    return `${F.file}-latin-${wm}-normal`;
  };
  const carregaFonte = async nome => {
    if (loaded.has(nome) || !manifest[nome]) return !!manifest[nome];
    loaded.add(nome);
    try { const r = await fetch(`${ctx.fontsBase}${nome}.ttf`); if (!r.ok) return false; await ex('text.loadFont', { data: b64(await r.arrayBuffer()) }); return true; } catch { loaded.delete(nome); return false; }
  };
  const fonteDe = t => {
    const r = ROLE[t.role] || ROLE.title, F = FONTES[t.font], w = t.weight || (F && F.weights.length === 1 ? F.weights[0] : r.weight);
    let nome = F ? arqFonte(t.font, w) : (ctx.brandFamily ? null : arqFonte('poppins', w));
    if (!F && ctx.brandFamily) return { family: ctx.brandFamily, style: 'Regular', nome: null };
    if (!manifest[nome]) nome = Object.keys(manifest).find(n => n.startsWith('poppins-latin-400')) || Object.keys(manifest)[0];
    return { family: manifest[nome].family, style: manifest[nome].style, nome };
  };
  const reverso = {};
  for (const [n, m] of Object.entries(manifest)) reverso[m.family + '|' + m.style] = n;
  const chaveDe = (family, style) => {   // (família, estilo) do FigCraft → { font, weight } da arte
    const n = reverso[family + '|' + style]; const m = n && /^(.+)-latin-(\d+)-normal$/.exec(n); if (!m) return null;
    const key = Object.keys(FONTES).find(k => FONTES[k].file === m[1]); return key ? { font: key, weight: +m[2] } : null;
  };
  const precarregaRestante = async (onProg) => {
    const todas = Object.keys(manifest).filter(n => !loaded.has(n)); let i = 0;
    for (const n of todas) { await carregaFonte(n); onProg?.(++i, todas.length); }
  };

  // ───────── texto exibido no FigCraft
  const exibe = t => {
    let v = String(t.value ?? '').replace(/\[i:[a-z-]+\]/g, '');
    const cxT = ['alta', 'baixa', 'frase', 'titulo'].includes(t.caixa) ? t.caixa : '', js = ['baixa', 'frase', 'titulo'].includes(cxT) ? cxT : '';
    if (t.reflow && !t.band) v = v.replace(/\s*\|\s*/g, ' ');
    if (js) v = aplicaCaixa(v, js);
    const linhas = v.split('|'), hls = []; let out = '';
    linhas.forEach((l, i) => {
      if (i) out += '\n';
      const re = /\*([^*]+)\*/g; let m, last = 0;
      while ((m = re.exec(l))) { out += l.slice(last, m.index); hls.push([out.length, out.length + m[1].length]); out += m[1]; last = m.index + m[0].length; }
      out += l.slice(last);
    });
    const up = cxT ? cxT === 'alta' : (t.upper || t.role === 'label'); if (up) out = out.toUpperCase();
    return { str: out, hls };
  };
  const pctEm = (v, size) => { if (v == null) return null; const s = String(v); const n = parseFloat(s); if (!Number.isFinite(n)) return null; return /px$/.test(s) ? n / size : /%$/.test(s) ? n / 100 : n; };

  // ───────── imagens
  const imgCache = new Map();
  const imagem = async url => {
    if (imgCache.has(url)) return imgCache.get(url);
    const p = (async () => {
      const r = await fetch(url); if (!r.ok) throw new Error('imagem ' + r.status); const bm = await createImageBitmap(await r.blob());
      const k = Math.min(1, 2048 / Math.max(bm.width, bm.height)), cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(bm.width * k)); cv.height = Math.max(1, Math.round(bm.height * k));
      cv.getContext('2d').drawImage(bm, 0, 0, cv.width, cv.height);
      const blob = await new Promise(res => cv.toBlob(res, 'image/png')); return { data: b64(await blob.arrayBuffer()), nw: bm.width, nh: bm.height };
    })();
    imgCache.set(url, p); return p;
  };

  // ───────── fundo
  const gradFills = (g, base) => {
    const cs = (g?.cores || []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 4);
    if (cs.length < 2) return [{ type: 'solid', color: base }];
    if (g.tipo === 'radial') { const cx = (g.x ?? 50) / 100, cy = (g.y ?? 30) / 100, R = (g.r ?? 120) / 100; return [{ type: 'radialGradient', stops: cs, from: [r3(cx), r3(cy)], to: [r3(cx), r3(cy + R)], width: [r3(cx + R), r3(cy)] }]; }
    const a = ((g.ang ?? 160) * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a), L = Math.abs(W * dx) + Math.abs(H * dy);
    return [{ type: 'linearGradient', stops: cs, from: [r3(.5 - dx * L / 2 / W), r3(.5 - dy * L / 2 / H)], to: [r3(.5 + dx * L / 2 / W), r3(.5 + dy * L / 2 / H)] }];
  };
  const sigFill = n => JSON.stringify((n.fills || []).map(f => f.type === 'solid' ? ['s', corHex(f.color)] : ['g', f.kind, (f.stops || []).map(s => corHex(s.color)), (f.from || []).map(v => r3(v)), (f.to || []).map(v => r3(v))]));

  // ───────── abre: monta o FigCraft com a arte (cada página vai em UM lote de comandos: bem mais rápido que um por vez)
  async function abre(spec, onProg) {
    const ins0 = await fc.inspect(), pg = pagina(ins0);
    const velhos = (pg.children || []).map(n => n.id); if (velhos.length) { await ex('select.set', { ids: velhos }); await ex('edit.delete', {}); }
    snap = { pageId: pg.id, base: clone(spec), frames: new Map(), nodes: new Map(), byEl: new Map(), bgsig: [], ordem: [], sys: [] };
    const todo = [];
    const usadas = new Set(); for (const s of spec.slides) for (const t of s.texts || []) { const f = fonteDe(t); if (f.nome) usadas.add(f.nome); }
    if (ctx.brandFont?.src) { try { const r = await fetch(ctx.brandFont.src); if (r.ok && /\.(ttf|otf)(\?|$)/i.test(ctx.brandFont.src)) { const o = await ex('text.loadFont', { data: b64(await r.arrayBuffer()) }); ctx.brandFamily = o?.families?.[0] || null; } } catch { /* fonte da marca em woff2: usa a Poppins */ } }
    for (const n of usadas) await carregaFonte(n);
    // camadas de fidelidade: o servidor desenha (com o mesmo motor do PNG final) o que o FigCraft não sabe: fundo com imagem, escurecimento, brilhos,
    // tinta, texturas, vinheta, degradês, grão e as formas especiais. Se falhar, a arte abre só com a estrutura.
    const cam = new Map(); let semCam = '';
    if (ctx.camadas) {
      const peds = [];
      spec.slides.forEach((s, si) => {
        const fx = s.fx || {};
        if (ctx.srcBg(s) || (s.shade ?? 0) > 0 || fx.glows?.length || fx.tint?.color || fx.textura?.length) peds.push({ id: si + '-under', si, tipo: 'under' });
        for (const k of FX_TOPO) if (fx[k]) peds.push({ id: si + '-fx-' + k, si, tipo: 'fx', k });
        (s.shapes || []).forEach((o, k) => { if (formaAssada(o)) peds.push({ id: si + '-shape-' + k, si, tipo: 'shape', k }); });
      });
      if (peds.length) { onProg?.('efeitos e formas'); try { for (const c of await ctx.camadas(peds.slice(0, 80), spec)) cam.set(c.id, c); } catch (e) { semCam = e.message || 'falha'; } }
    }
    snap.semCam = semCam;
    for (let si = 0; si < spec.slides.length; si++) {
      const s = spec.slides[si], bg = s.bg || {}, base = bg.color || D.paper, X = si * (W + GAP);
      const cmds = [], metas = []; let seq = 0;
      const push = (command, params, as, meta) => { cmds.push({ command, params, ...(as ? { as } : {}) }); metas.push(meta || null); };
      const F = { $ref: 'f' };
      push('node.create', { type: 'frame', x: X, y: 0, width: W, height: H, name: 'Página ' + (si + 1), select: false, props: { clipsContent: true, pluginData: { slide: si } } }, 'f', { frame: si });
      push('node.set', { ids: [F], props: { fills: gradFills(bg.grad, base) } });
      onProg?.('Página ' + (si + 1));
      const poePng = (c, nm, nome, pd, lock, w = c.w, h = c.h, x = c.x, y = c.y) => {
        push('image.place', { data: c.png.slice(c.png.indexOf(',') + 1), x: 0, y: 0, parent: F }, nm, lock ? null : { reg: { kind: 'shape', si, k: pd.kk, o: s.shapes[pd.kk] } });
        push('node.set', { ids: [{ $ref: nm }], props: { x: r1(x), y: r1(y), width: r1(w), height: r1(h), name: nome, ...(lock ? { locked: true } : {}), pluginData: pd.dado } });
      };
      const urlBg = ctx.srcBg(s), under = cam.get(si + '-under'); snap.sys[si] = new Set();
      if (under) { poePng(under, 'u' + si, 'Fundo e efeitos', { dado: { k: 'sys:under', s: si } }, true); snap.sys[si].add('under'); }
      else if (urlBg) { try { const im = await imagem(urlBg); push('image.place', { data: im.data, x: 0, y: 0, parent: F }, 'bg'); push('node.set', { ids: [{ $ref: 'bg' }], props: { x: 0, y: 0, width: W, height: H, name: 'Fundo (imagem)', locked: true, pluginData: { k: 'bg', s: si } } }, null, null); metas[metas.length - 2] = { reg: { kind: 'bg', si } }; } catch { /* fundo sem imagem carregável: fica a cor */ } }
      const lista = camadas(s).filter(l => !l.sys || (FX_TOPO.includes(l.id) && cam.has(si + '-fx-' + l.id))).reverse();   // de baixo para cima
      snap.ordem[si] = lista.map(l => l.id);
      for (const l of lista) {
        if (l.sys) { poePng(cam.get(si + '-fx-' + l.id), 'x' + (seq++), 'Efeito: ' + FX_NOME[l.id], { dado: { k: 'sys:' + l.id, s: si } }, true); snap.sys[si].add(l.id); continue; }
        const o = s[LST[l.kind]][l.k], pd = { k: l.id, s: si }, nm = 'e' + (seq++), R = { $ref: nm };
        if (l.kind === 'text') {
          const { str, hls } = exibe(o), f = fonteDe(o), r = ROLE[o.role] || ROLE.title, size = o.size || r.size, FF = FONTES[o.font];
          const align = o.align || 'center', w = Math.max(40, Math.round((o.w ?? r.w) * W));
          const lhv = o.lh || FF?.lh || r.lh, lsv = o.ls != null ? o.ls : (parseFloat(FF?.ls ?? r.ls) || 0);
          const auto = o.role === 'cta' || o.role === 'badge' || (o.nowrap && !o.reflow) || (o.role === 'footer' && !o.w);
          const color = o.outline ? (o.stroke || o.color || D.ink) : (o.color || D.ink);
          const name = (o.role === 'cta' ? 'Botão: ' : o.role === 'badge' ? 'Selo: ' : '') + str.replace(/\s+/g, ' ').slice(0, 28);
          push('node.create', { type: 'text', x: 0, y: 0, parent: F, name, text: str || ' ', select: false, props: { fontFamily: f.family, fontStyle: f.style, fontSize: size, fill: color, width: w, textAlign: align, lineHeight: Math.round(lhv * 100) + '%', letterSpacing: r1(lsv * 100) + '%', pluginData: pd } }, nm, { reg: { kind: 'text', si, k: l.k, o, align } });
          if (auto) push('node.set', { ids: [R], props: { textAutoResize: 'widthAndHeight' } });
          const hl = o.hl || D.accent; for (const [x1, x2] of hls) push('text.style', { id: R, start: x1, end: x2, textFills: [{ type: 'solid', color: hl }] });
        } else if (l.kind === 'item') {
          const url = ctx.srcItem(o), size = o.size || Math.round(W * .2); let nat = null, ok = false;
          if (url) { try { nat = await imagem(url); push('image.place', { data: nat.data, x: 0, y: 0, parent: F }, nm, { reg: { kind: 'item', si, k: l.k, o } }); ok = true; } catch { nat = null; } }
          if (!ok) push('node.create', { type: 'rectangle', x: 0, y: 0, width: size, height: size, parent: F, select: false, props: { fill: '#2a2a30' } }, nm, { reg: { kind: 'item', si, k: l.k, o } });
          const hh = o.h ? o.h * H : (o.round || o.forma || !nat) ? size : size * nat.nh / nat.nw;
          push('node.set', { ids: [R], props: { width: size, height: Math.max(2, hh), name: (o.asset || 'Imagem') + (ok ? '' : ' (ainda sem imagem)'), cornerRadius: o.round ? size / 2 : 0, opacity: o.opacity ?? 1, pluginData: pd } });
        } else if (cam.has(si + '-shape-' + l.k)) {   // forma especial: imagem fiel (mexe, gira, redimensiona; a cor continua a do desenho)
          const c = cam.get(si + '-shape-' + l.k);
          poePng(c, nm, 'Forma: ' + ({ star: 'estrela', icon: 'ícone', bubble: 'balão', arrow: 'seta', tile: 'cubo 3D' }[o.tile ? 'tile' : o.kind] || o.kind || 'forma'), { kk: l.k, dado: { ...pd, baked: 1 } }, false);
          push('node.set', { ids: [R], props: { opacity: Math.max(0, Math.min(1, o.opacity ?? 1)) } });
        } else {
          const w = Math.round((o.w ?? .3) * W), line = o.kind === 'line', h = line ? Math.max(2, Math.round((o.h ?? .004) * W)) : ['circle', 'star', 'ring'].includes(o.kind) ? (o.h != null ? Math.round(o.h * H) : w) : Math.round((o.h ?? .2) * H);
          const col = o.color || D.accent, tipo = o.kind === 'circle' || o.kind === 'ring' ? 'ellipse' : 'rectangle';
          const rad = o.kind === 'pill' ? Math.min(w, h) / 2 : Math.round((o.radius || 0) * Math.min(w, h));
          const nome = 'Forma: ' + ({ rect: 'retângulo', circle: 'círculo', pill: 'cápsula', line: 'linha', ring: 'anel', star: 'estrela', icon: 'ícone' }[o.kind] || o.kind || 'forma');
          const props = { cornerRadius: rad, opacity: Math.max(0, Math.min(1, o.opacity ?? 1)), pluginData: pd };
          if (o.kind === 'ring') { props.fills = []; props.strokes = [{ type: 'solid', color: o.stroke || col }]; props.strokeWeight = Math.max(1, Math.round((o.stroke_w ?? .006) * W)); }
          else if (o.kind === 'icon') props.fills = []; else props.fill = col;
          push('node.create', { type: tipo, x: 0, y: 0, width: w, height: h, parent: F, name: nome, select: false, props }, nm, { reg: { kind: 'shape', si, k: l.k, o } });
        }
        if (o.hide) push('node.set', { ids: [R], props: { visible: false } });
      }
      const res = await ex('command.batch', { label: 'Montar página ' + (si + 1), commands: cmds });
      metas.forEach((m, i) => { if (!m) return; const id = res?.[i]?.id; if (m.frame != null) { snap.frames.set(id, m.frame); todo.push({ id, kind: 'frame', si }); } else if (m.reg) todo.push({ id, ...m.reg }); });
    }
    // 2ª passada: com as alturas reais dos textos, posiciona pelo centro; depois aplica a rotação (graus, horário na arte)
    let ins = await fc.inspect(), idx = indexa(ins); const fix = [];
    for (const t of todo) {
      if (t.kind === 'bg' || t.kind === 'frame') continue; const n = idx.get(t.id); if (!n) continue; const o = t.o, cxp = (o.x ?? .5) * W, cyp = (o.y ?? .5) * H;
      const cx = t.kind === 'text' ? (t.align === 'left' ? cxp + n.width / 2 : t.align === 'right' ? cxp - n.width / 2 : cxp) : cxp;
      fix.push({ command: 'node.set', params: { ids: [t.id], props: { x: r1(cx - n.width / 2), y: r1(cyp - n.height / 2) } } });
    }
    for (const t of todo) if (t.o?.rot) fix.push({ command: 'node.set', params: { ids: [t.id], props: { rotation: -t.o.rot } } });
    if (fix.length) await ex('command.batch', { label: 'Posicionar', commands: fix });
    ins = await fc.inspect(); idx = indexa(ins);
    for (const t of todo) {   // medidas reais (o que o FigCraft devolve) = ponto de partida para saber o que mudou
      const n = idx.get(t.id); if (!n || t.kind === 'frame') continue; const fr = n._pai;
      const mm = medir(n, fr); snap.nodes.set(t.id, { si: t.si, kind: t.kind, k: t.k, fr: fr?.id, m: mm }); if (t.kind !== 'bg') snap.byEl.set(t.si + ':' + t.kind + ':' + t.k, mm);
    }
    for (const [fid, si] of snap.frames) { const n = idx.get(fid); snap.bgsig[si] = n ? sigFill(n) : ''; }
    snap.rank = {}; spec.slides.forEach((s, si) => (snap.ordem[si] || []).forEach((id, r) => { snap.rank[si + ':' + id] = r; }));
    return { slides: spec.slides.length };
  }

  const indexa = ins => {
    const m = new Map(); const walk = (n, pai) => { n._pai = pai; m.set(n.id, n); (n.children || []).forEach(c => walk(c, n)); };
    (pagina(ins)?.children || []).forEach(n => walk(n, null)); return m;
  };
  const medir = (n, fr) => {
    const b = n.absoluteBounds || { x: n.x, y: n.y, width: n.width, height: n.height }, fb = fr?.absoluteBounds || { x: 0, y: 0 };
    const f0 = (n.fills || [])[0], m = { cx: b.x + b.width / 2 - fb.x, cy: b.y + b.height / 2 - fb.y, w: n.width, h: n.height, rot: n.rotation || 0, op: n.opacity ?? 1, vis: n.visible !== false };
    if (n.type === 'TEXT') Object.assign(m, { size: n.fontSize, fam: n.fontFamily, sty: n.fontStyle, chars: n.characters, align: n.textAlign, fill: f0 && f0.type === 'solid' ? corHex(f0.color) : null, ls: n.letterSpacing, lh: n.lineHeight });
    else Object.assign(m, { fill: f0 && f0.type === 'solid' ? corHex(f0.color) : null, rad: n.cornerRadius || 0, stroke: corHex(n.strokes?.[0]?.color) });
    return m;
  };

  // ───────── le: devolve a arte com o que mudou
  async function le() {
    if (!snap) throw new Error('FigCraft ainda não foi aberto');
    const ins = await fc.inspect(), pg = pagina(ins), idx = indexa(ins);
    const frames = (pg.children || []).filter(n => n.type === 'FRAME').sort((a, b) => (a.x - b.x) || (a.y - b.y));
    const base = snap.base, avisos = [], out = clone(base); out.slides = []; let ignorados = 0;
    const dif = (a, b, t = .6) => Math.abs((a ?? 0) - (b ?? 0)) > t;
    for (const fr of frames) {
      const ownIdx = snap.frames.get(fr.id), b = ownIdx ?? (Number.isInteger(+fr.pluginData?.slide) && base.slides[+fr.pluginData.slide] ? +fr.pluginData.slide : -1);
      const s = b >= 0 ? clone(base.slides[b]) : { bg: {}, texts: [], items: [], shapes: [], pager: true };
      s.texts = []; s.items = []; s.shapes = [];
      // fundo: só muda se a pessoa mexeu no preenchimento do quadro
      if (ownIdx != null && sigFill(fr) !== snap.bgsig[ownIdx]) {
        const f0 = (fr.fills || [])[0]; s.bg = s.bg || {};
        if (f0?.type === 'solid') { s.bg.color = corHex(f0.color); delete s.bg.grad; delete s.bg.color2; }
        else if (f0?.type === 'gradient') {
          const cs = (f0.stops || []).map(x => corHex(x.color)).filter(Boolean).slice(0, 4);
          if (cs.length >= 2) {
            if (f0.kind === 'radial') { const c = f0.center || f0.from || [.5, .3]; s.bg.grad = { tipo: 'radial', cores: cs, x: Math.round(c[0] * 100), y: Math.round(c[1] * 100), r: s.bg.grad?.r ?? 120 }; }
            else { const dx = ((f0.to?.[0] ?? .5) - (f0.from?.[0] ?? .5)) * W, dy = ((f0.to?.[1] ?? 1) - (f0.from?.[1] ?? 0)) * H; s.bg.grad = { tipo: 'linear', cores: cs, ang: Math.round(((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360) }; }
            s.bg.color = cs[0];
          }
        }
      } else if (ownIdx == null && b >= 0) { /* quadro duplicado: herda o fundo do original */ }
      { // efeitos desenhados pelo servidor: se a pessoa apagou a camada, o efeito sai da arte
        const ref = ownIdx ?? b, tem = new Set((fr.children || []).map(n => n.pluginData?.k).filter(k => typeof k === 'string' && k.startsWith('sys:')));
        for (const id of (ref >= 0 && snap.sys[ref]) || []) if (!tem.has('sys:' + id)) {
          s.fx = s.fx || {};
          if (id === 'under') { delete s.fx.glows; delete s.fx.tint; delete s.fx.textura; s.shade = 0; } else delete s.fx[id];
        }
      }
      const lista = [];   // de baixo para cima
      for (const n of fr.children || []) {
        const sn = snap.nodes.get(n.id), pd = n.pluginData || {};
        if (sn?.kind === 'bg' || pd.k === 'bg' || (typeof pd.k === 'string' && pd.k.startsWith('sys:'))) continue;
        let kind, k, si, orig = false;
        if (sn && sn.fr === fr.id) { kind = sn.kind; k = sn.k; si = sn.si; orig = true; }
        else if (sn) { kind = sn.kind; k = sn.k; si = sn.si; }
        else if (typeof pd.k === 'string' && /^(text|item|shape):\d+$/.test(pd.k)) { [kind, k] = pd.k.split(':'); k = +k; si = Number.isInteger(+pd.s) ? +pd.s : b; }
        const baseEl = kind && base.slides[si]?.[LST[kind]]?.[k];
        const m = medir(n, fr), m0 = orig ? sn.m : (snap.byEl.get(si + ':' + kind + ':' + k) || m);
        let el, oldRank = null;
        if (baseEl) { el = clone(baseEl); delete el.grp; if (orig) oldRank = snap.rank[si + ':' + kind + ':' + k]; }
        else el = null;
        if (n.type === 'TEXT') {
          if (!el) { el = { role: 'body', value: '', x: .5, y: .5, align: 'center' }; kind = 'text'; }
          if (kind !== 'text') continue; patchTexto(el, n, m, baseEl ? m0 : null);
        } else if (kind === 'item' && baseEl) patchItem(el, m, m0);
        else if (kind === 'shape' && baseEl) patchForma(el, n, m, m0);
        else if (!baseEl) {
          const novo = novoDe(n, m, pd); if (!novo) { ignorados++; continue; } el = novo.el; kind = novo.kind;
        } else continue;
        lista.push({ kind, el, kOrig: orig ? k : null, rank: oldRank, zOld: orig && baseEl ? zDe(kind, baseEl, k) : null });
      }
      // ordem das camadas → z
      const sur = lista.filter(x => x.rank != null);
      const mudou = lista.some(x => x.rank == null) || sur.some((x, i) => i && x.rank < sur[i - 1].rank);
      if (mudou) atribuiZ(lista);
      lista.forEach((x, i) => { x.i = i; }); for (const kd of ['text', 'item', 'shape']) lista.filter(x => x.kind === kd).sort((p, q) => (p.kOrig ?? 1e9) - (q.kOrig ?? 1e9) || p.i - q.i).forEach(x => s[LST[kd]].push(x.el));
      for (const key of ['texts', 'items', 'shapes']) s[key] = s[key].slice(0, 30);
      out.slides.push(s);
    }
    if (!out.slides.length) throw new Error('Não há nenhuma página no FigCraft');
    if (ignorados) avisos.push(ignorados + ' camada(s) do FigCraft não têm equivalente na arte e foram ignoradas (imagens coladas direto, grupos, vetores). Para colocar uma imagem, use “Imagem” na barra ao lado.');
    return { spec: out, avisos };
  }

  const ancora = (align, m) => align === 'left' ? m.cx - m.w / 2 : align === 'right' ? m.cx + m.w / 2 : m.cx;
  function patchTexto(el, n, m, m0) {
    const nova = !m0; if (!nova) { m0 = { ...m0 }; }
    const v = String(n.characters ?? '');
    if (nova || v !== m0.chars) el.value = v.replace(/\r?\n/g, '|');
    if (nova || dif0(m.size, m0.size, .05)) el.size = Math.round(m.size);
    if (m.fill && (nova || m.fill !== m0.fill)) { el.color = m.fill; if (el.outline) delete el.outline; }
    const al = ['left', 'center', 'right'].includes(String(n.textAlign).toLowerCase()) ? String(n.textAlign).toLowerCase() : 'center';
    const alMudou = nova || al !== String(m0.align).toLowerCase(); if (alMudou) el.align = al;
    if (nova || alMudou || dif0(m.cx, m0.cx) || dif0(m.w, m0.w)) el.x = r3(ancora(el.align || al, m) / W);
    if (nova || dif0(m.cy, m0.cy)) el.y = r3(m.cy / H);
    if (nova || dif0(m.w, m0.w, 1)) { if (!(nova === false && ['cta', 'badge'].includes(el.role) && !el.w)) el.w = r3(m.w / W); }
    if (nova || n.fontFamily !== m0.fam || n.fontStyle !== m0.sty) { const c = chaveDe(n.fontFamily, n.fontStyle); if (c) { if (c.font === 'poppins' && !ctx.brandFamily) { delete el.font; el.weight = c.weight; } else { el.font = c.font; el.weight = c.weight; } } }
    if (!nova && n.letterSpacing !== m0.ls) { const e = pctEm(n.letterSpacing, m.size); if (e != null) el.ls = r3(e); }
    if (!nova && n.lineHeight !== m0.lh) { const e = pctEm(n.lineHeight, m.size); if (e != null && /%|px/.test(String(n.lineHeight))) el.lh = r3(e); }
    comum(el, m, m0, nova);
  }
  const dif0 = (a, b, t = .6) => Math.abs((a ?? 0) - (b ?? 0)) > t;
  function comum(el, m, m0, nova) {
    if (nova || dif0(m.rot, m0.rot, .3)) { const r = norm(-m.rot); if (r) el.rot = r; else delete el.rot; }
    if (nova ? m.op < .999 : dif0(m.op, m0.op, .005)) { if (m.op < .999) el.opacity = r3(m.op); else delete el.opacity; }
    if (!nova && m.vis !== m0.vis) { if (m.vis) delete el.hide; else el.hide = true; }
  }
  function patchItem(el, m, m0) {
    if (dif0(m.cx, m0.cx)) el.x = r3(m.cx / W); if (dif0(m.cy, m0.cy)) el.y = r3(m.cy / H);
    if (dif0(m.w, m0.w, 1)) el.size = Math.round(m.w);
    if (!el.round && (dif0(m.h / m.w, m0.h / m0.w, .01) || (el.h && dif0(m.h, m0.h, 1)))) el.h = r3(m.h / H);
    comum(el, m, m0, false);
  }
  function patchForma(el, n, m, m0) {
    if (n.pluginData?.baked) {   // forma desenhada pelo servidor: vale o quanto mexeu (posição, proporção, giro, transparência)
      if (dif0(m.cx, m0.cx)) el.x = r3((el.x ?? .5) + (m.cx - m0.cx) / W); if (dif0(m.cy, m0.cy)) el.y = r3((el.y ?? .5) + (m.cy - m0.cy) / H);
      const rw = m.w / m0.w, rh = m.h / m0.h, h0 = hForma(el, W, H);
      if (dif0(rw, 1, .004)) el.w = r3((el.w ?? .3) * rw);
      if (dif0(rh, 1, .004) && (el.h != null || !['circle', 'star', 'ring'].includes(el.kind) || dif0(rh, rw, .004))) el.h = r3(el.kind === 'line' ? h0 * rh / W : h0 * rh / H);
      comum(el, m, m0, false); return;
    }
    if (dif0(m.cx, m0.cx)) el.x = r3(m.cx / W); if (dif0(m.cy, m0.cy)) el.y = r3(m.cy / H);
    if (dif0(m.w, m0.w, 1)) el.w = r3(m.w / W);
    if (dif0(m.h, m0.h, 1)) el.h = r3(el.kind === 'line' ? m.h / W : m.h / H);
    if (el.kind === 'ring') { if (m.stroke && m.stroke !== m0.stroke) el.stroke = m.stroke; }
    else if (m.fill && m.fill !== m0.fill) { el.color = m.fill; if (el.kind !== 'icon') delete el.color2; else el.icon_color = m.fill; }
    if (dif0(m.rad, m0.rad, .5) && !['circle', 'ring', 'pill'].includes(el.kind)) el.radius = r3(Math.min(.5, m.rad / Math.max(1, Math.min(m.w, m.h))));
    comum(el, m, m0, false);
  }
  function novoDe(n, m, pd) {
    const base = { x: r3(m.cx / W), y: r3(m.cy / H) };
    if (n.type === 'RECTANGLE' || n.type === 'ELLIPSE' || n.type === 'LINE' || n.type === 'STAR' || n.type === 'POLYGON') {
      const f0 = (n.fills || [])[0];
      if (f0?.type === 'image') {
        if (pd.asset) return { kind: 'item', el: { asset: pd.asset, ...base, size: Math.round(m.w), ...(pd.ar && Math.abs(m.h / m.w - pd.ar) > .01 ? { h: r3(m.h / H) } : {}), ...(m.rot ? { rot: norm(-m.rot) } : {}), ...(m.op < .999 ? { opacity: r3(m.op) } : {}) } };
        return null;
      }
      const cor = f0?.type === 'solid' ? corHex(f0.color) : corHex(n.strokes?.[0]?.color) || D.accent;
      const el = { kind: n.type === 'ELLIPSE' ? 'circle' : n.type === 'LINE' ? 'line' : n.type === 'STAR' ? 'star' : 'rect', ...base, w: r3(m.w / W), color: cor, opacity: r3(m.op), rot: norm(-m.rot) };
      if (el.kind === 'line') el.h = r3(Math.max(2, n.strokeWeight || 4) / W); else el.h = r3(m.h / H);
      if (el.kind === 'rect') { const rr = n.cornerRadius || 0; if (rr) el.radius = r3(Math.min(.5, rr / Math.max(1, Math.min(m.w, m.h)))); }
      for (const k of ['rot', 'opacity']) if (!el[k] || (k === 'opacity' && el[k] >= .999)) delete el[k];
      return { kind: 'shape', el };
    }
    return null;
  }
  // Reordenar camadas muda o "z" só do que se mexeu: quem manteve a ordem relativa fica como está
  function atribuiZ(lista) {
    const n = lista.length, idx = []; lista.forEach((x, i) => { if (x.rank != null) idx.push(i); });
    const len = idx.map(() => 1), prev = idx.map(() => -1);
    for (let i = 0; i < idx.length; i++) for (let j = 0; j < i; j++) if (lista[idx[j]].rank < lista[idx[i]].rank && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
    let bi = 0; for (let i = 0; i < idx.length; i++) if (len[i] > len[bi]) bi = i;
    const fixos = new Set(); for (let i = idx.length ? bi : -1; i >= 0; i = prev[i]) fixos.add(idx[i]);
    const z = new Array(n).fill(null); for (const i of fixos) z[i] = lista[i].zOld;
    for (let i = 0; i < n;) {
      if (z[i] != null) { i++; continue; }
      let j = i; while (j < n && z[j] == null) j++; const m = j - i;
      const lo = i > 0 ? z[i - 1] : Math.max(0, (j < n ? z[j] : 10 * (m + 1)) - 10 * (m + 1)), hi = j < n ? z[j] : lo + 10 * (m + 1);
      for (let q = 0; q < m; q++) z[i + q] = Math.round(lo + (hi - lo) * (q + 1) / (m + 1));
      i = j;
    }
    for (let i = 0; i < n; i++) z[i] = Math.min(20000, Math.max(z[i], i ? z[i - 1] + 1 : 1));
    lista.forEach((x, i) => { x.el.z = z[i]; });
  }


  // ───────── apoio do editor
  const quadros = ins => (pagina(ins)?.children || []).filter(n => n.type === 'FRAME').sort((a, b) => (a.x - b.x) || (a.y - b.y));
  async function pagSel() {   // página (0, 1, …) onde está a seleção do FigCraft, ou -1
    const ins = await fc.inspect(), idx = indexa(ins); let n = idx.get((ins.selection || [])[0]); while (n && n._pai) n = n._pai;
    return n ? quadros(ins).findIndex(f => f.id === n.id) : -1;
  }
  const tk = { u: [], r: 0, n: 0 };
  async function token() {   // muda quando a pessoa edita; carregar fonte em segundo plano e o histórico do FigCraft descartando entradas antigas não contam
    const h = (await fc.inspect()).history || {}, u = (h.undo || []).filter(x => x !== 'Load font file'), r = (h.redo || []).length;
    const igual = u.length === tk.u.length && u.every((x, i) => x === tk.u[i]) && r === tk.r;
    const aparado = !igual && u.length < tk.u.length && r === tk.r && u.every((x, i) => x === tk.u[i]);   // o histórico vem do mais novo para o mais antigo: o FigCraft descarta o fim
    if (!igual && !aparado) tk.n++; tk.u = u; tk.r = r; return String(tk.n);
  }
  async function poeImagem(asset, url, pagina, fixoW) {
    const ins = await fc.inspect(), fr = quadros(ins)[Math.max(0, pagina)]; if (!fr) throw new Error('Não há página aberta no FigCraft');
    const im = await imagem(url), size = fixoW || Math.round(W * .4), hh = Math.round(size * im.nh / im.nw);
    const r = await ex('command.batch', { label: 'Imagem da biblioteca', commands: [{ command: 'image.place', as: 'i', params: { data: im.data, x: 0, y: 0, parent: fr.id } }, { command: 'node.set', params: { ids: [{ $ref: 'i' }], props: { x: Math.round((W - size) / 2), y: Math.round((H - hh) / 2), width: size, height: hh, name: asset, pluginData: { asset, ar: im.nh / im.nw } } } }] });
    await ex('select.set', { ids: [r[0].id] }); return r[0].id;
  }
  async function foca(pagina) { const fr = quadros(await fc.inspect())[pagina]; if (!fr) return; await ex('select.set', { ids: [fr.id] }); await ex('view.zoomSelection', {}); }
  const editaBase = fn => { if (snap) fn(snap.base); };

  return { abre, le, carregaFonte, precarregaRestante, pagSel, token, poeImagem, foca, editaBase, snap: () => snap };
}
