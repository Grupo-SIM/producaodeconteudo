// Modelos profissionais de composição (padrão de agência): o Designer escolhe o MODELO de cada página e escreve os textos;
// este módulo desenha a página com medidas exatas — título que preenche a largura do bloco, pilha vertical sem sobreposição,
// hierarquia fixa (chamada pequena > título forte > apoio > botão), moldura da marca (logo, contatos, "arraste") igual em
// todas as páginas e profundidade (luz, granulado, objetos desfocados). Usado pelo servidor (ao receber a arte do Designer)
// e pelo editor (trocar o modelo de uma página). O resultado é a especificação comum do arte-slide.js: tudo continua editável.
import { METRICAS } from './arte-metricas.js';

// ───────── medidas de texto (larguras reais das fontes embutidas, medidas no navegador) ─────────
const IDX = (() => { const m = new Map(); [...METRICAS.chars].forEach((c, i) => m.set(c, i)); return m; })();
const PESOS = { anton: [400], bebas: [400], impact: [400], impactx: [400], archivo: [400], oswald: [300, 400, 500, 600, 700], montserrat: [300, 400, 500, 600, 700, 800, 900], poppins: [300, 400, 500, 600, 700, 800, 900], inter: [300, 400, 500, 600, 700, 800, 900], sora: [300, 400, 500, 600, 700, 800], tech: [400, 500, 600, 700, 800, 900], dmsans: [400, 500, 700], grotesk: [400, 500, 700], outfit: [400, 500, 700, 800], jakarta: [400, 600, 800], rubik: [400, 500, 700, 800], raleway: [400, 600, 800], nunito: [400, 700, 800], roboto: [400, 500, 700, 900], spartan: [400, 600, 800], manrope: [400, 600, 800], barlow: [500, 700, 800], bigshoulders: [700, 800, 900], staatliches: [400], bungee: [400], passion: [400, 700, 900], playfair: [400, 700, 900], lora: [400, 600, 700], merriweather: [400, 700, 900], dmserif: [400], abril: [400], cormorant: [400, 600, 700], pacifico: [400], dancing: [400, 700], caveat: [400, 700], marker: [400], lobster: [400], bangers: [400], syne: [600, 800], unbounded: [500, 700, 900], righteous: [400], jetbrains: [400, 700], spacemono: [400, 700] };
const tabela = (fk, w) => { const ws = PESOS[fk] || PESOS.poppins, k = PESOS[fk] ? fk : 'poppins', near = ws.reduce((a, b) => Math.abs(b - w) < Math.abs(a - w) ? b : a, ws[0]); return METRICAS.f[k + near] || METRICAS.f.poppins700; };
const CX_OK = ['alta', 'baixa', 'frase', 'titulo', 'normal'];
const CX_SIGLAS = new Set(['IA', 'SEO', 'CTA', 'CRM', 'ROI', 'KPI', 'PDF', 'UX', 'UI', 'API', 'PIX', 'CNPJ', 'CPF', 'MEI', 'ERP', 'SP', 'RJ', 'USD', 'BR', 'TV', 'FAQ', 'SMS', 'WhatsApp'.toUpperCase()]);
const CX_PEQ = new Set(['a', 'as', 'o', 'os', 'um', 'uma', 'de', 'da', 'das', 'do', 'dos', 'e', 'em', 'no', 'na', 'nos', 'nas', 'por', 'para', 'com', 'ou', 'ao', 'aos', 'à', 'às', 'que', 'se', 'é', 'são']);
// caixa do texto: alta (MAIÚSCULAS), baixa (minúsculas), frase (só a 1ª letra maiúscula), titulo (Cada Palavra Maiúscula), normal (como foi escrito)
export function aplicaCaixa(s, cx) {
  s = String(s ?? ''); if (!cx || cx === 'normal' || !CX_OK.includes(cx)) return s;
  const tk = []; let t = s.replace(/\[i:[a-z-]+\]/g, m => { tk.push(m); return '\u0001' + (tk.length - 1) + '\u0001'; });
  if (cx === 'alta') t = t.toUpperCase();
  else if (cx === 'baixa') t = t.toLowerCase();
  else {
    // sigla (IA, SEO, CTA) escrita em maiúsculas no meio de um texto normal continua como está; texto todo em maiúsculas é convertido por inteiro
    const todoAlto = !(/\p{Ll}/u.test(t)), poeBaixa = w => (CX_SIGLAS.has(w) || (!todoAlto && /^[A-Z0-9]{2,5}$/.test(w) && /[A-Z]/.test(w)) ? w : w.toLowerCase());
    t = t.replace(/[\p{L}\p{M}\d]+/gu, poeBaixa);
    if (cx === 'frase') t = t.replace(/(^|[.!?…]\s+|[.!?…]\|)([^\p{L}]*)(\p{L})/gu, (m, a, b, c) => a + b + c.toUpperCase()).replace(/^([^\p{L}]*)(\p{L})/u, (m, a, b) => a + b.toUpperCase());
    else { let i = 0; t = t.replace(/(^|[\s|*("“'\-\/])(\p{L}[\p{L}\p{M}]*)/gu, (m, a, w) => { const first = i++ === 0; return a + (!first && CX_PEQ.has(w) ? w : w[0].toUpperCase() + w.slice(1)); }); }
  }
  return t.replace(/\u0001(\d+)\u0001/g, (m, n) => tk[+n]);
}
const cxDe = (v, pad) => CX_OK.includes(v) ? v : pad;
const cxSai = f => f && f.caixa && f.caixa !== 'alta' ? f.caixa : undefined;
export const limpa = s => String(s ?? '').replace(/\[i:[a-z-]+\]/g, '').replace(/[*]/g, '');
const icones = s => (String(s ?? '').match(/\[i:[a-z-]+\]/g) || []).length;
// largura em px de uma linha (sem quebra) — f: { k, w, ls (em), upper }
export function largura(linha, f, size) {
  const t = tabela(f.k, f.w), txt = aplicaCaixa(limpa(linha), f.caixa || (f.upper ? 'alta' : '')), avg = t[IDX.get('n')] || 550;
  let u = 0; for (const ch of txt) { const i = IDX.get(ch); u += i == null ? avg : t[i]; }
  return (u / 1000) * size + [...txt].length * (f.ls || 0) * size + icones(linha) * size * 1.05;
}
// quebra gulosa numa largura máxima
export function quebra(texto, f, size, maxW) {
  const out = [];
  for (const par of String(texto ?? '').split('|')) {
    let cur = '';
    for (const w of par.trim().split(/\s+/).filter(Boolean)) { const tent = cur ? cur + ' ' + w : w; if (cur && largura(tent, f, size) > maxW) { out.push(cur); cur = w; } else cur = tent; }
    if (cur) out.push(cur);
  }
  return out;
}
// melhor divisão em k linhas (equilibradas pela largura) — para títulos sem "|" definidos
const FRACAS = new Set(['a', 'o', 'as', 'os', 'e', 'é', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'que', 'um', 'uma', 'para', 'pra', 'com', 'por', 'não', 'se', 'te', 'me', 'seu', 'sua', 'mais', 'muito', 'ao', 'à']);
function equilibra(palavras, k, f) {
  const n = palavras.length; if (k >= n) return palavras.map(x => [x]);
  let best = null;
  const rec = (i, kk, acc) => {
    if (kk === 1) { const l = [...acc, palavras.slice(i)]; let m = Math.max(...l.map(x => largura(x.join(' '), f, 1)));
      // como um designer quebra: nenhuma linha termina em palavra fraca ("de", "não", "o"...) e nenhuma linha fica com uma palavra curta sozinha
      for (const x of l.slice(0, -1)) if (FRACAS.has(limpa(x[x.length - 1]).toLowerCase())) m *= 1.25;
      for (const x of l) if (x.length === 1 && limpa(x[0]).length <= 3) m *= 1.2;
      if (!best || m < best.m) best = { m, l }; return; }
    for (let j = i + 1; j <= n - kk + 1; j++) rec(j, kk - 1, [...acc, palavras.slice(i, j)]);
  };
  if (n <= 14) rec(0, k, []); else { const per = Math.ceil(n / k); best = { l: Array.from({ length: k }, (_, q) => palavras.slice(q * per, (q + 1) * per)).filter(x => x.length) }; }
  return best.l;
}
// destaque: se a palavra marcada com * foi partida entre linhas, cada linha recebe o seu par de *
const reMarca = linhas => { let aberto = false; return linhas.map(l => { let s = aberto ? '*' + l : l; const n = (l.match(/\*/g) || []).length; if (n % 2) aberto = !aberto; if (aberto) s += '*'; return s.replace(/\*\*/g, ''); }); };
// título que PREENCHE o bloco: maior tamanho em que todas as linhas cabem na largura e o bloco cabe na altura
export function ajusta(texto, f, maxW, maxH, { maxSize = 9999, minSize = 10, maxLinhas = 4 } = {}) {
  const lh = f.lh || 1;
  const tam = linhas => Math.max(minSize, Math.min(maxSize, maxW / Math.max(...linhas.map(l => largura(l, f, 1)), .01), maxH / (linhas.length * lh)));
  if (String(texto).includes('|')) {
    const linhas = String(texto).split('|').map(x => x.trim()).filter(Boolean), sz = Math.floor(tam(linhas) * .985);
    // as quebras (|) do Designer não manda na legibilidade: se refazer as linhas pela largura dá uma letra bem maior, refaz
    if (linhas.length > 1 && linhas.length <= maxLinhas + 1) { const auto = ajusta(linhas.join(' '), f, maxW, maxH, { maxSize, minSize, maxLinhas: Math.max(maxLinhas, linhas.length) }); if (auto.size > sz * 1.3) return auto; }
    return { linhas, size: sz };
  }
  const pal = String(texto).trim().split(/\s+/).filter(Boolean); let best = null;
  for (let k = 1; k <= Math.min(maxLinhas, pal.length); k++) {
    const linhas = reMarca(equilibra(pal, k, f).map(x => x.join(' '))), s = tam(linhas);
    // palavra curta ou fraca sozinha numa linha ("A" / "VOLTA" / "À LUA") conta como título menor: o dono reprovou esse corte
    const solta = linhas.length > 1 && linhas.some(l => { const w = limpa(l).trim().split(/\s+/); return w.length === 1 && (w[0].length <= 2 || FRACAS.has(w[0].toLowerCase())); }), nota = solta ? s * .72 : s;
    // mais linhas só se o ganho de tamanho for real (título em 1 linha longa fica fino; em pedaços demais fica picado)
    if (!best || nota > best.nota * (k > 2 ? 1.12 : 1.04)) best = { linhas, size: s, nota };
  }
  if (!best) return { linhas: [''], size: minSize };   // texto vazio: nunca derruba a composição
  return { linhas: best.linhas, size: Math.floor(best.size * .985) };
}

// ───────── cores ─────────
const rgb = h => { h = String(h || '#000').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h.slice(0, 6), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mistura = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
export const lum = h => { const v = rgb(h).map(c => c / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
// manchete em caixa alta com acento (Á Ã Í Ó É Ç): o acento sobe e bate na linha de cima; abre o entrelinha só quando precisa
export const lhAcento = txt => /[áàâãäéèêëíìîïóòôõöúùûüç]/i.test(String(txt || '')) ? 1.17 : 1;
export const sobre = h => lum(h) > .36 ? '#0a0a0a' : '#ffffff';
const matiz = h => { const [r, g, b] = rgb(h).map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (!d) return -1; let x = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; x *= 60; return x < 0 ? x + 360 : x; };
export function corEmIngles(h) {
  const m = matiz(h); if (m < 0) return lum(h) > .5 ? 'cold white' : 'deep black';
  return m < 15 ? 'red' : m < 40 ? 'orange' : m < 62 ? 'golden yellow' : m < 95 ? 'lime green' : m < 160 ? 'vivid green' : m < 195 ? 'cyan' : m < 250 ? 'electric blue' : m < 290 ? 'purple' : m < 335 ? 'magenta' : 'red';
}

// ───────── estilo tipográfico ─────────
// fontes do título e do texto saem da Identidade da marca; sem regra na marca, títulos condensados (padrão de agência)
const FAMILIA = [['impactx', /impact\s*extravagant/i], ['impact', /\bimpact\b/i], ['anton', /anton/i], ['bebas', /bebas/i], ['oswald', /oswald/i], ['archivo', /archivo/i], ['montserrat', /montserrat/i], ['poppins', /poppins/i], ['inter', /\binter\b/i], ['sora', /sora/i], ['tech', /orbitron/i], ['dmsans', /dm\s*sans/i], ['grotesk', /space\s*grotesk/i], ['outfit', /outfit/i], ['jakarta', /jakarta/i], ['rubik', /rubik/i], ['raleway', /raleway/i], ['nunito', /nunito/i], ['roboto', /\broboto\b/i], ['spartan', /spartan/i], ['manrope', /manrope/i], ['barlow', /barlow/i], ['bigshoulders', /big\s*shoulders/i], ['staatliches', /staatliches/i], ['bungee', /bungee/i], ['passion', /passion\s*one/i], ['playfair', /playfair/i], ['lora', /\blora\b/i], ['merriweather', /merriweather/i], ['dmserif', /dm\s*serif/i], ['abril', /abril/i], ['cormorant', /cormorant/i], ['pacifico', /pacifico/i], ['dancing', /dancing/i], ['caveat', /caveat/i], ['marker', /permanent\s*marker/i], ['lobster', /lobster/i], ['bangers', /bangers/i], ['syne', /\bsyne\b/i], ['unbounded', /unbounded/i], ['righteous', /righteous/i], ['jetbrains', /jetbrains/i], ['spacemono', /space\s*mono/i]];
const fonteDe = txt => (FAMILIA.find(([, re]) => re.test(String(txt || ''))) || [])[0];
const CONDENSADA = { anton: 1, bebas: 1, oswald: 1, impact: 1, impactx: 1 };
export function tipografia(ctx) {
  const kt = ctx.fTit || fonteDe(ctx.ftit) || 'anton', kx = ctx.fTxt || fonteDe(ctx.ftxt) || (kt === 'anton' || kt === 'bebas' || kt === 'oswald' ? 'sora' : kt);
  const cx = ctx.caixa || {}, cond = !!CONDENSADA[kt], wt = cond ? (kt === 'oswald' ? 700 : 400) : (/black|900/i.test(ctx.ftit || '') ? 900 : 800);
  return {
    tit: { k: kt, w: wt, caixa: cxDe(cx.titulo, 'normal'), upper: cxDe(cx.titulo, 'normal') === 'alta', ls: cond ? 0 : -.01, lh: cond ? .96 : 1.08 },   // letras nunca se tocam (fonte pesada pede quase 0) e a entrelinha respira
    txt: { k: kx, w: 400, ls: 0, lh: 1.32 },        // subtítulo e texto corrido: fino (regular), contraste claro com o título pesado
    txtM: { k: kx, w: 400, ls: 0, lh: 1.26 },
    txtB: { k: kx, w: 600, ls: 0, lh: 1.24 },
    lab: { k: kx, w: 500, ls: .3, caixa: cxDe(cx.rotulo, 'alta'), upper: cxDe(cx.rotulo, 'alta') === 'alta', lh: 1.2 },
    btn: { k: cond ? kt : kx, w: cond ? wt : 700, caixa: cxDe(cx.botao, 'alta'), upper: cxDe(cx.botao, 'alta') === 'alta', ls: cond ? .02 : .03, lh: 1.1 }
  };
}

// ───────── peças de texto (spec do arte-slide.js) ─────────
const F2 = v => Math.round(v * 10000) / 10000;
const fontKey = (f, ctx) => ctx.fonteMarca && f.k === (ctx.fonteMarcaK || 'poppins') ? undefined : f.k;   // fonte cadastrada da marca: usa o arquivo dela
function texto(ctx, f, linhas, size, { x, yTop, align = 'left', role = 'title', color, extra = {} }) {
  const h = linhas.length * (f.lh || 1) * size;
  return { h, t: { role, value: linhas.join('|'), x: F2(x / ctx.W), y: F2((yTop + h / 2) / ctx.H), align, size: Math.round(size), font: fontKey(f, ctx), weight: f.w, ls: f.ls, lh: f.lh, upper: f.upper || undefined, caixa: cxSai(f), color, nowrap: true, shadow: false, ...extra } };
}
// pilha vertical: blocos com altura conhecida, centrados num ponto (ou ancorados no topo/base)
function pilha(blocos, centro, ctx, { topo, base } = {}) {
  const tot = blocos.reduce((a, b, i) => a + b.h + (i ? b.gap || 0 : 0), 0);
  let y = topo != null ? topo : base != null ? base - tot : centro - tot / 2;
  const out = []; blocos.forEach((b, i) => { if (i) y += b.gap || 0; out.push(...[].concat(b.make(y))); y += b.h; });
  return { itens: out, tot, y0: topo != null ? topo : base != null ? base - tot : centro - tot / 2 };
}
// parágrafo corrido: quebra de linha gulosa (largura real da fonte) no maior tamanho que cabe; o *negrito* continua valendo em cada linha
function quebraTexto(txt, f, maxW, maxH, maxSize, minSize) {
  const pal = String(txt).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean); if (!pal.length) return { linhas: [''], size: Math.round(minSize) };
  for (let sz = Math.floor(maxSize); sz >= minSize; sz -= 2) {
    const L = []; let cur = '';
    for (const w of pal) { const t = cur ? cur + ' ' + w : w; if (cur && largura(t.replace(/\*/g, ''), f, sz) > maxW) { L.push(cur); cur = w; } else cur = t; }
    if (cur) L.push(cur);
    if (L.length * (f.lh || 1.3) * sz <= maxH || sz - 2 < minSize) return { linhas: reMarca(L), size: sz };
  }
}
const botaoH = size => size * 1.1 + 2 * Math.round(size * .6);
// largura útil do texto do botão: o botão tem recuo lateral (2,2 em) e a seta redonda (1,7 em), então o texto cabe em (largura − 3,9 em)
const ctaSz = (txt, f, maxBtnW, maxSize) => Math.min(maxSize, maxBtnW / (largura(txt, f, 1) + 3.9));

// ───────── moldura da marca (igual em todas as páginas) ─────────
function moldura(ctx, d, papel, { semArraste = false } = {}) {
  // Grade fixa de agência: CABEÇALHO (logo à esquerda ou no centro, conforme a marca, e o contador de páginas à direita) e
  // RODAPÉ ("Arraste" discreto no canto). Mesmas posições e tamanhos em todas as páginas; nada da moldura encosta no conteúdo.
  const { W, H } = ctx, out = { texts: [], items: [], shapes: [], topo: H * .07, base: H * .93 }, escuro = lum(papel) < .4, tinta = escuro ? ctx.ink : ctx.inkEscura;
  const m = ctx.molde || {}, TY = ctx.storiesH ? .085 : .05, BY = ctx.storiesH ? .86 : .95, pos = ctx.logo && m.logo !== 'nenhum' ? (m.logo || 'topo-centro') : 'nenhum';
  if (ctx.storiesH) { out.topo = H * .13; out.base = H * .82; }
  const r = ctx.logoRatio || .2; let lw = Math.round(W * (m.logo_w || (pos === 'topo-centro' ? .27 : .2))), lh = lw * r;
  const maxH = W * (r > .6 ? .08 : .056); if (lh > maxH) { lh = maxH; lw = Math.round(lh / r); }   // logo quadrada/alta não vira um bloco gigante
  const hh = Math.max(lh, W * .03), hy = H * TY + hh / 2;   // linha do cabeçalho
  if (pos !== 'nenhum') {
    const cx = pos === 'topo-centro' || pos === 'rodape-centro' ? W / 2 : ctx.mx + lw / 2, cy = pos.startsWith('topo') ? hy : H * BY - lh / 2;
    if (!escuro && !ctx.logoEscura) {   // logo clara em página clara: vai numa cápsula escura para não sumir
      const pad = Math.max(lh * .45, W * .012);
      out.shapes.push({ kind: r > .6 ? 'rect' : 'pill', radius: .3, x: F2(cx / W), y: F2(cy / H), w: F2((lw + pad * 2) / W), h: F2((lh + pad * 2) / H), color: ctx.paper, moldura: true, behind: true });
    }
    out.items.push({ asset: escuro ? ctx.logo : (ctx.logoEscura || ctx.logo), x: F2(cx / W), y: F2(cy / H), size: lw, moldura: true });
    if (pos.startsWith('rodape')) out.base = Math.min(out.base, H * BY - lh - H * .04);
  }
  const lab = { ...ctx.T.lab, ls: .2 }, ls = Math.round(W * .021);
  // contador de páginas à direita do cabeçalho (carrossel) — ou o @ da marca no post único
  const dir = ctx.total > 1 ? `${String(ctx.i + 1).padStart(2, '0')} / ${String(ctx.total).padStart(2, '0')}` : (ctx.contatos?.instagram || '');
  if (dir && m.contador === true && !m.ig) out.texts.push({ role: 'label', value: dir, x: F2(1 - ctx.mx / W), y: F2(hy / H), align: 'right', size: ls, font: fontKey(lab, ctx), weight: 600, ls: .2, color: tinta, opacity: .75, nowrap: true, shadow: false, moldura: true, front: true });
  // ícones do Instagram (curtir, comentar, enviar, salvar) — no lugar do contador, do lado oposto à logo
  if (m.ig) { const s = Math.round(W * .022), esq = pos !== 'topo-esq'; ['coracao', 'play', 'comentario', 'salvar'].forEach((ic, q) => out.shapes.push({ kind: 'icon', icon: ic, icon_color: tinta, x: F2((esq ? ctx.mx + s / 2 + q * s * 1.45 : W - ctx.mx - s / 2 - (3 - q) * s * 1.45) / W), y: F2(hy / H), w: F2(s / W), h: F2(s / H), opacity: .85, moldura: true })); }
  if (pos.startsWith('topo') || dir || m.ig) out.topo = Math.max(out.topo, H * TY + hh + H * .045);
  // "Arraste": regra da marca ("texto" = centralizado em todas menos a última) ou, por padrão, discreto no canto (não na capa, que já tem o botão)
  const ultima = ctx.i >= ctx.total - 1;
  if (ctx.total > 1 && !ultima && !semArraste && (m.arraste !== false)) {
    const f = { ...ctx.T.txtB, ls: 0 }, size = Math.round(W * .024), centro = m.arraste !== 'canto';
    const y = pos === 'rodape-centro' ? out.base - size : H * BY - size * .6;
    out.texts.push({ role: 'footer', value: centro ? 'Arraste para o lado' : 'Arraste', x: centro ? .5 : F2(1 - ctx.mx / W), y: F2(y / H), align: centro ? 'center' : 'right', size, font: fontKey(f, ctx), weight: f.w, color: tinta, opacity: centro ? undefined : .8, icon: 'seta', icon_end: true, nowrap: true, shadow: false, moldura: true, front: true });
    out.base = Math.min(out.base, y - size * 1.6);
  }
  return out;
}
// bloco de contatos (WhatsApp, @, site, cidade) — capa e última página
function contatos(ctx, papel, yBase, { x = ctx.mx, align = 'left' } = {}) {
  const c = ctx.contatos || {}, linhas = [c.whatsapp, c.instagram, c.site].filter(Boolean); if (!linhas.length) return null;
  const tinta = lum(papel) < .4 ? ctx.ink : ctx.inkEscura, size = Math.round(ctx.W * .024), f = ctx.T.txtB;
  const ic = c.whatsapp ? 'whatsapp' : c.instagram ? 'instagram' : 'site', h = linhas.length * size * 1.3;
  return { h, t: { role: 'footer', value: linhas.join('|') + (c.local ? '|' + c.local : ''), x: F2(x / ctx.W), y: F2((yBase - h / 2) / ctx.H), align, size, font: fontKey(f, ctx), weight: 600, lh: 1.3, color: tinta, icon: ic, icon_bg: tinta, icon_color: lum(tinta) > .5 ? '#0a0a0a' : '#ffffff', nowrap: true, shadow: false } };
}
// "Arrasta para o lado" em pílula + círculo com seta (capa de carrossel)
function arrastaPilula(ctx, papel, x, yTop, txt = 'Arrasta para o lado') {
  const f = { ...ctx.T.txtM, upper: false }, size = Math.round(ctx.W * .03), escuro = lum(papel) < .4;
  return { h: botaoH(size), make: y => ({ role: 'cta', value: txt, x: F2(x / ctx.W), y: F2((y + botaoH(size) / 2) / ctx.H), align: 'left', size, font: fontKey(f, ctx), weight: 500, ls: -.01, bg: escuro ? '#ffffff' : '#0a0a0a', color: escuro ? '#0a0a0a' : '#ffffff', shape: 'pill', arrow: 'seta-diag', arrow_bg: ctx.accent, arrow_color: sobre(ctx.accent), nowrap: true, shadow: false }) };
}
// objeto 3D (cubo/ladrilho com ícone) quando não há foto: dá profundidade sem imagem por IA
const ladrilho = (ctx, icon, x, y, frac, { rot = 12, blur = 0, opacity = 1, cor } = {}) => ({ kind: 'rect', tile: true, icon: icon || 'porcento', icon_color: '#e9e9ee', color: cor || '#1b1b20', x, y, w: frac, h: F2(frac * ctx.W / ctx.H), radius: .24, rot, blur: blur || undefined, opacity, decor: true });

// ───────── prompts de imagem (inglês) com a composição de cada modelo ─────────
const promptFoto = (ctx, desc, lugar) => `${desc}, ${lugar}, dramatic low-key cinematic lighting, deep dark background, strong ${corEmIngles(ctx.accent)} rim light and ${corEmIngles(ctx.accent)} color cast, high contrast, film grain, shallow depth of field, photorealistic, editorial advertising photography, 85mm lens`;
const promptPessoa = (ctx, desc) => `${desc}, photorealistic editorial portrait, cinematic, ${corEmIngles(ctx.accent)} rim light on the edges, high contrast`;
const promptAmbiente = (ctx, d) => `${d.ambiente || 'dark cinematic studio backdrop with soft smoke'}, very dark and moody, soft ${corEmIngles(ctx.accent)} haze light glowing from the upper right, bokeh, out of focus, empty, no people, no objects in focus`;
// personagem recortado em camadas: grande, saindo pela borda de baixo, com luz de contorno na cor da marca
const pessoaItem = (ctx, foto, x, frac, extra = {}) => { const size = Math.round(ctx.W * frac); return { ...srcDe(foto, x => promptPessoa(ctx, x)), pessoa: true, x, y: F2((ctx.H * 1.015 - size / 2) / ctx.H), size, glow: ctx.accent, shadow: 1, hero: true, ...extra }; };
// partículas do tema (notas, moedas, peças) desfocadas em volta, umas atrás e outras na frente: profundidade de campanha
const particulas = (ctx, desc) => { if (!desc) return []; const g = genOuAsset(desc); const src = srcDe(g, x => `${x}, single object, hyper realistic`);
  return [[.1, .1, .3, 7, -22, .75, false], [.93, .06, .22, 11, 28, .6, false], [.62, .2, .14, 3, 12, .9, false], [.04, .86, .36, 15, 18, .8, true], [.97, .72, .26, 5, -34, .9, true]].map(([x, y, f, blur, rot, opacity, front]) => ({ ...src, x, y, size: Math.round(ctx.W * f), blur, rot, opacity, front: front || undefined, hero: true, copia: true, particula: true })); };
const promptObjeto = (ctx, desc) => `${desc}, hyper realistic 3D render, premium material, dramatic studio lighting with subtle ${corEmIngles(ctx.accent)} reflections`;
// imagem pedida pelo Designer: nome de arquivo do catálogo, "banco: termo" (foto de banco na internet) ou descrição para gerar por IA
const genOuAsset = v => { if (!v) return null; if (typeof v === 'string') { const b = v.match(/^\s*banco\s*:\s*(.{2,120})$/i); if (b) return { banco: b[1].trim() }; const ps = v.match(/^\s*([a-z0-9-]{2,80})\s*\(pose:\s*([^)]{3,240})\)\s*$/); if (ps) return { asset: ps[1], pose: ps[2].trim() }; return /^[a-z0-9-]{2,80}$/.test(v) && !/\s/.test(v) && v.includes('-') && v.length < 60 ? { asset: v } : { gen: v }; } return v.asset ? { asset: String(v.asset), ...(v.pose ? { pose: String(v.pose) } : {}) } : v.banco ? { banco: String(v.banco) } : v.gen ? { gen: String(v.gen) } : null; };
const srcDe = (g, fn) => g.gen ? { gen: fn(g.gen) } : g.banco ? { banco: g.banco } : g.pose ? { asset: g.asset, pose: g.pose } : { asset: g.asset };

// ───────── MODELOS ─────────

// Cartão de post do X (antigo Twitter) para a contracapa da notícia, pequeno e na parte de baixo, como no print do dono: avatar redondo à esquerda; ao lado, nome com selo azul e logo abaixo o texto CURTO. Fonte Inter (parecida com a do X). Só mudam o logo e o nome da marca.
function postX(d, ctx, s) {
  const { W, H, T } = ctx, bonito = v => /^[^a-zà-ÿ]+$/.test(v) ? v.toLowerCase().replace(/(^|\s)(\p{L})(\p{L}*)/gu, (x, sp, p, r) => sp + (/^(do|da|de|dos|das|e)$/.test(p + r) && sp ? p + r : p.toUpperCase() + r)) : v;
  const nome = bonito(String(d.nome || ctx.marca || '').trim()), cardW = Math.round(W * .86), pad = Math.round(W * .034), av = Math.round(W * .078), gx = Math.round(W * .02), ink = '#0f1419';
  s.shade = .72; s.shade_dir = 'bottom';   // fade escuro por trás do cartão (atrás, não na frente)
  const fi = { ...T.txt, k: 'inter', w: 500, lh: 1.28, upper: false }, fn = { ...T.txtB, k: 'inter', w: 800, upper: false, caixa: undefined };
  const nz = Math.round(W * .036), colW = cardW - pad * 2 - av - gx, ti = quebraTexto(String(d.titulo || ''), fi, colW, H * .2, W * .037, W * .028), hNome = Math.round(nz * 1.35), hTxt = ti.linhas.length * fi.lh * ti.size;
  const hCard = pad + hNome + hTxt + pad, cx = W / 2, yBot = ctx.storiesH ? H * .8 : H * .9, yTop = yBot - hCard, left = cx - cardW / 2 + pad, nx = left + av + gx;
  s.shapes.push({ kind: 'rect', x: F2(cx / W), y: F2((yTop + hCard / 2) / H), w: F2(cardW / W), h: F2(hCard / H), radius: .17, color: '#ffffff' });
  if (!d.foto && ctx.logo) { const lw = Math.round(W * .62), lh = ctx.logoRatio ? lw / ctx.logoRatio : lw * .3; s.items.push({ asset: ctx.logo, x: .5, y: F2((yTop * .5) / H), size: ctx.logoRatio > 1.4 ? Math.round(W * .95) : Math.round(W * .5), shadow: 1 }); }   // sem foto: a marca grande ocupa o alto, em vez de um vazio
  const ay = yTop + pad + av / 2, quad = ctx.logo && ctx.logoRatio > .7 && ctx.logoRatio < 1.4, avA = ctx.avatar || (quad ? ctx.logo : '');
  if (avA) s.items.push({ asset: avA, x: F2((left + av / 2) / W), y: F2(ay / H), size: av, round: true, moldura: true });
  else { s.shapes.push({ kind: 'circle', x: F2((left + av / 2) / W), y: F2(ay / H), w: F2(av / W), h: F2(av / H), color: '#0a0a0c' }); const ini = (nome.match(/[A-Za-zÀ-ÿ0-9]/) || ['N'])[0].toUpperCase(); s.texts.push({ role: 'badge', value: ini, x: F2((left + av / 2) / W), y: F2(ay / H), align: 'center', size: Math.round(av * .5), font: fontKey(fn, ctx), weight: 800, color: '#ffffff', nowrap: true, shadow: false }); }
  const ny = yTop + pad + hNome / 2;
  s.texts.push({ role: 'body', value: nome, x: F2(nx / W), y: F2(ny / H), align: 'left', size: nz, font: fontKey(fn, ctx), weight: 800, color: ink, nowrap: true, shadow: false });
  const vz = Math.round(nz * 1.05), vx = nx + largura(nome, fn, nz) * .975 + vz * .68;   // selo azul recortado (dois quadrados arredondados girados) com o check branco
  for (const rot of [0, 45]) s.shapes.push({ kind: 'rect', x: F2(vx / W), y: F2(ny / H), w: F2(vz * .74 / W), h: F2(vz * .74 / H), radius: .3, color: '#1d9bf0', rot });
  s.shapes.push({ kind: 'circle', x: F2(vx / W), y: F2(ny / H), w: F2(vz * .72 / W), h: F2(vz * .72 / H), color: '#1d9bf0', icon: 'check', icon_color: '#ffffff' });
  s.texts.push(texto(ctx, fi, ti.linhas, ti.size, { x: nx, yTop: yTop + pad + hNome, align: 'left', role: 'body', color: ink, extra: { hl: ink, hw: 800 } }).t);
  return s;
}

export const MODELOS = [
  { id: 'heroi', nome: 'Personagem em destaque', uso: 'capa ou post único', desc: 'Personagem recortado e grande à direita, saindo pela borda de baixo, com luz de contorno na cor da marca, ambiente desfocado e partículas do tema; à esquerda chamada, título enorme (linha final na cor de destaque), apoio espaçado e botão.', campos: ['kicker', 'titulo', 'apoio', 'texto', 'cta', 'foto', 'objeto', 'particulas', 'ambiente', 'icone'] },
  { id: 'revista', nome: 'Capa de revista', uso: 'capa ou post único', desc: 'Título gigante de lado a lado no alto e o personagem recortado NA FRENTE cobrindo parte das letras; apoio e botão embaixo. É a capa que mais para o dedo.', campos: ['titulo', 'apoio', 'cta', 'foto', 'objeto', 'particulas', 'ambiente', 'icone'] },
  { id: 'dividido', nome: 'Título partido pelo objeto', uso: 'capa ou post único', desc: 'Objeto central na frente do título, que fica partido em duas palavras (esquerda e direita); apoio em faixas abaixo; cópias desfocadas do objeto dão profundidade.', campos: ['titulo', 'apoio', 'objeto', 'icone'] },
  { id: 'capa-faixa', nome: 'Capa com faixas e palavra gigante', uso: 'capa de carrossel', desc: 'Foto no alto escurecendo para baixo; título em faixas brancas e a última palavra gigante na cor de destaque; botão “arrasta”.', campos: ['titulo', 'cta', 'foto', 'objeto'] },
  { id: 'capa-minimal', nome: 'Capa escura minimalista', uso: 'capa de carrossel', desc: 'Fundo escuro limpo, frase em peso médio com palavras na cor de destaque, pílula “Arrasta para o lado” com seta e objeto 3D no canto.', campos: ['titulo', 'texto', 'cta', 'icone', 'objeto'] },
  { id: 'frase', nome: 'Frase central', uso: 'página interna', desc: 'Uma frase forte no centro com palavras de destaque; objeto 3D desfocado no canto para profundidade.', campos: ['titulo', 'icone', 'objeto'] },
  { id: 'texto', nome: 'Ideia com título e apoio', uso: 'página interna', desc: 'Chamada, título e texto de apoio alinhados à esquerda; fundo escuro ou claro (alternar entre páginas). Pode levar uma foto em cartão embaixo (foto) ou o mascote/objeto recortado saindo pelo canto (objeto).', campos: ['kicker', 'titulo', 'texto', 'fundo', 'foto', 'objeto', 'fantasma'] },
  { id: 'lista', nome: 'Lista numerada', uso: 'página interna', desc: 'Fundo claro, até 4 itens “1. Título” em negrito com explicação curta; letra gigante quase invisível ao fundo.', campos: ['titulo', 'itens', 'fundo', 'objeto'] },
  { id: 'numero', nome: 'Número gigante', uso: 'página interna', desc: 'Número enorme na cor de destaque, título e apoio: dica 1, passo 2, erro 3... Pode levar foto em cartão (foto) ou mascote/objeto (objeto).', campos: ['numero', 'titulo', 'texto', 'fundo', 'foto', 'objeto'] },
  { id: 'pilulas', nome: 'Estouro com pílulas', uso: 'página interna', desc: 'Forma estourada grande na cor da marca com 2 a 4 frases curtas em pílulas empilhadas.', campos: ['itens'] },
  { id: 'noticia', nome: 'Capa de jornal (notícia)', uso: 'capa de carrossel', desc: 'Foto da notícia em página inteira com degradê escuro embaixo, selo “Notícia urgente!”, manchete em caixa alta centralizada, fio com a marca e “Leia a legenda”.', campos: ['titulo', 'selo', 'legenda', 'foto'] },
  { id: 'manchete-foto', nome: 'Manchete sobre foto (perfil no topo)', uso: 'capa ou post único', desc: 'Foto em página inteira que escurece embaixo; perfil da marca no topo à esquerda (avatar, nome e verificado); manchete em caixa alta centralizada, “Leia a legenda” e barra na cor da marca no rodapé.', campos: ['titulo', 'legenda', 'nome', 'foto'] },
  { id: 'citacao', nome: 'Frase de personalidade (retrato + citação)', uso: 'capa ou post único', desc: 'Retrato em página inteira que escurece até o preto embaixo; fio com a logo da marca e o @ no meio; nome de quem disse e a frase centralizados, em caixa alta.', campos: ['nome', 'frase', 'foto', 'handle'] },
  { id: 'post-card', nome: 'Contra-capa em cartão (notícia)', uso: 'última página', desc: 'Fundo escuro de foto com um cartão branco arredondado: avatar da marca, nome verificado e o texto da notícia (palavra em *negrito*).', campos: ['titulo', 'nome', 'foto'] },
  { id: 'coluna', nome: 'Coluna de texto', uso: 'páginas internas de carrossel', desc: 'Padrão do dono: página só de texto em coluna à esquerda, parágrafos curtos de leitura fácil, palavras-chave em destaque e lista com marcadores; fundo claro com grão ou escuro com brilho. Mascote ou imagem pequena opcional no canto, sem cobrir o texto.', campos: ['paragrafos', 'itens', 'objeto', 'fundo'] },
  { id: 'capa-mascote', nome: 'Capa com mascote grande', uso: 'capa de carrossel ou post único', desc: 'Réplica da arte aprovada da Central: título grande alinhado à esquerda com uma palavra em destaque, texto de apoio embaixo, botão opcional e o mascote enorme cortado pelo canto direito de baixo, com sombra à esquerda e brilho na cor da marca.', campos: ['kicker', 'titulo', 'texto', 'cta', 'objeto'] },
  { id: 'cinema-capa', nome: 'Cinema: capa', uso: 'capa de carrossel', desc: 'Fundo escuro de cinema com brilho na cor da marca; palavra gigante vazada ao fundo, pessoa ou personagem recortado à esquerda, título fino com destaque embaixo, apoio curto e “Deslize”.', campos: ['kicker', 'titulo', 'texto', 'foto'] },
  { id: 'cinema-texto', nome: 'Cinema: texto', uso: 'página interna', desc: 'Fundo escuro de cinema, fio vertical fino e um bloco de texto à esquerda: frase grande e fina e 2 ou 3 parágrafos curtos.', campos: ['titulo', 'texto'] },
  { id: 'cinema-pergunta', nome: 'Cinema: pergunta', uso: 'página interna', desc: 'Dois blocos separados por um fio: chamada curta e pergunta entre aspas na cor da marca, de novo chamada e a segunda pergunta.', campos: ['apoio', 'titulo', 'texto', 'nota'] },
  { id: 'cinema-card', nome: 'Cinema: cartão final', uso: 'última página', desc: 'Cartão translúcido com borda fina no centro: frase com palavras em destaque, linhas de fechamento e a chamada para seguir.', campos: ['titulo', 'texto'] },
  { id: 'agencia-capa', nome: 'Agência: capa com objeto 3D', uso: 'capa de carrossel', desc: 'Fundo escuro chapado, tags no topo e logo à direita, frase fina branca e título gigante grosso na cor da marca, objeto 3D de vidro saindo pela borda de baixo e rodapé em três pílulas (marca, redes, WhatsApp).', campos: ['apoio', 'titulo', 'objeto', 'icone'] },
  { id: 'agencia-objeto', nome: 'Agência: objeto no alto', uso: 'página interna', desc: 'Objeto 3D grande e centralizado no alto, título médio na cor da marca, seta para baixo e linha de resultado com a palavra inicial em negrito branco.', campos: ['titulo', 'texto', 'objeto', 'icone'] },
  { id: 'agencia-texto', nome: 'Agência: texto à esquerda com objeto', uso: 'página interna', desc: 'Selo redondo com ícone, frase de abertura fina e frase de virada em negrito com palavras na cor da marca, à esquerda; objeto 3D grande sangrando pela direita e brilho na cor da marca.', campos: ['apoio', 'titulo', 'objeto', 'icone'] },
  { id: 'agencia-cards', nome: 'Agência: dois cartões', uso: 'página interna', desc: 'Dois cartões de contorno arredondado na cor da marca: o primeiro com a frase de abertura e seta, o segundo com a virada em branco e o apoio fino; objeto 3D ao lado.', campos: ['titulo', 'apoio', 'texto', 'nota', 'objeto', 'icone'] },
  { id: 'agencia-lista', nome: 'Agência: lista em caixas', uso: 'página interna', desc: 'Título com ícone, até 4 caixas de contorno com os pontos, pergunta de fechamento com trecho entre aspas, linha de chamada na cor da marca e três avatares.', campos: ['titulo', 'itens', 'texto', 'apoio', 'icone'] },
  { id: 'agencia-cta', nome: 'Agência: chamada final', uso: 'última página', desc: 'Pergunta de venda com palavras em destaque, linha de convite, três avatares redondos e objeto 3D saindo pelo canto de baixo.', campos: ['titulo', 'apoio', 'objeto', 'icone'] },
  { id: 'cta', nome: 'Chamada final', uso: 'última página', desc: 'Frase de fechamento no centro com destaque e um botão grande na cor da marca; o mascote ou objeto da capa pode voltar acima da frase; contatos no rodapé.', campos: ['titulo', 'cta', 'objeto', 'icone'] }
];
export const MODELO_IDS = MODELOS.map(m => m.id);

// textura do fundo: a enviada pela marca (Biblioteca › Texturas) ou uma desenhada: concreto + riscos de luz no escuro (fumaça na capa),
// papel nas páginas claras, grade técnica nas marcas de tecnologia
// textura do fundo: só a que a marca enviou (Biblioteca › Texturas). Sem textura cadastrada, o fundo fica limpo (padrão aprovado).
const texturas = (ctx, papel) => {
  if (!ctx.texturas?.length) return undefined;
  const escuro = lum(papel) < .4;
  return [{ asset: ctx.texturas[ctx.i % ctx.texturas.length], op: escuro ? .35 : .5, blend: escuro ? 'screen' : 'multiply' }];
};
// textura do banco geral (Biblioteca › Geral › Texturas): em fundo escuro, papel amassado em screen e tecido em soft-light, alternando por página; em fundo claro, papel claro em multiply
const texBanco = (ctx, papel) => {
  const L = ctx.bancoTex || []; if (!L.length || (ctx.texturas || []).length) return undefined;
  const esc = lum(papel) < .4, A = L.filter(t => t.escuro === esc || (!esc && !t.escuro)), B = L.filter(t => !t.escuro && /tecido|papel-amassado/.test(t.name));
  if (esc) { const t = ctx.i % 2 === 0 ? (A[0] || B[0]) : (B[ctx.i % Math.max(1, B.length)] || A[0]); return t ? [{ asset: t.name, op: t.escuro ? .4 : .2, blend: t.escuro ? 'screen' : 'soft-light' }] : undefined; }
  const t = A[ctx.i % Math.max(1, A.length)]; return t ? [{ asset: t.name, op: .3, blend: 'multiply' }] : undefined;
};
const base = (ctx, papel, extra = {}) => ({ bg: { color: papel }, shade: 0, pager: false, fx: { grain: .18, vignette: .45, textura: texturas(ctx, papel), ...extra }, texts: [], items: [], shapes: [] });
const tintaDe = (ctx, papel) => lum(papel) < .4 ? ctx.ink : ctx.inkEscura;
const papelDe = (ctx, d) => d.fundo === 'claro' ? ctx.claro : ctx.paper;

// Mídia das páginas internas: foto em cartão (embaixo) ou mascote/objeto recortado saindo pelo canto. Devolve onde o texto fica.
function midia(d, ctx, s, mol, fr) {
  const { W, H, mx } = ctx, foto = genOuAsset(d.foto), obj = !foto && genOuAsset(d.objeto);
  if (foto) {
    const cardH = H * (fr || (ctx.storiesH ? .3 : .34)), top = mol.base - cardH;
    s.items.push({ ...srcDe(foto, x => `${x}, editorial photograph, cinematic lighting with subtle ${corEmIngles(ctx.accent)} accents, photorealistic, high detail`), card: true, x: .5, y: F2((top + cardH / 2) / H), size: Math.round(W - mx * 2), h: F2(cardH / H), radius: .035, shadow: 1, hero: true, fotoCard: true });
    return { topo: mol.topo, base: top - H * .045, colW: W - mx * 2 };
  }
  if (obj) {
    const topoObj = H * .56, size = Math.round(Math.min(W * .5, (mol.base - topoObj) * 1.08));   // objeto inteiro, dentro do quadro e acima do rodapé
    s.items.push({ ...srcDe(obj, x => promptObjeto(ctx, x)), x: F2(1 - (mx * .6 + size / 2) / W), y: F2((mol.base - size / 2 + size * .04) / H), size, shadow: 2, hero: true });
    if (lum(s.bg.color || ctx.paper) < .4) (s.fx.glows ||= []).push({ x: F2(1 - (mx * .6 + size / 2) / W), y: F2((mol.base - size / 2) / H), r: .35, color: ctx.accent, opacity: .3 });
    return { topo: mol.topo, base: topoObj - H * .02, colW: W - mx * 2 };
  }
  return { topo: mol.topo, base: mol.base, colW: W - mx * 2 };
}

// Encaixe: o bloco de texto (chamada + título + apoio) TEM que caber acima do cartão de foto / do objeto e acima do rodapé.
// Tenta o cartão no tamanho padrão e vai encolhendo o texto até 86%; se ainda não couber, diminui o cartão; por último encolhe mais o texto.
// monta(md, k) devolve os blocos da pilha com o texto na escala k (1 = tamanho cheio).
function encaixa(d, ctx, s, mol, monta) {
  const { H } = ctx, foto = !!genOuAsset(d.foto), fracs = foto ? [ctx.storiesH ? .3 : .34, .28, .23, .19] : [undefined];
  const tot = B => B.reduce((a, b, i) => a + b.h + (i ? b.gap || 0 : 0), 0);
  const prova = (fr, k) => {
    const dummy = { items: [], fx: {}, bg: s.bg, texts: [], shapes: [] }, md = midia(d, ctx, dummy, mol, fr), B = monta(md, k);
    const ancorado = md.base < mol.base, ini = ancorado ? md.topo + H * .05 : mol.topo + H * .02, fim = ancorado ? md.base : mol.base - H * .02;
    return tot(B) <= (fim - ini) * .985;
  };
  // escalas (título, apoio): primeiro só o apoio encolhe um pouco, depois os dois; só depois o cartão diminui
  const ESC = [[1, 1], [1, .94], [1, .88]], ESC2 = [[.92, .88], [.86, .84], [.8, .8], [.74, .76], [.68, .72], [.62, .68]];
  let esc = null;
  for (const fr of fracs) { for (const k of ESC) if (prova(fr, k)) { esc = { fr, k }; break; } if (esc) break; }
  if (!esc) { const fr = fracs[fracs.length - 1]; for (const k of ESC2) if (prova(fr, k)) { esc = { fr, k }; break; } if (!esc) esc = { fr, k: ESC2[ESC2.length - 1] }; }
  const md = midia(d, ctx, s, mol, esc.fr), B = monta(md, esc.k);
  // sobra de espaço: o bloco desce um pouco (não fica colado no topo com um buraco antes do cartão)
  const ancorado = md.base < mol.base, ini = ancorado ? md.topo + H * .05 : null, folga = ancorado ? Math.max(0, md.base - ini - tot(B)) : 0;
  return { md, B, k: esc.k, topo: ancorado ? ini + Math.min(folga * .4, H * .06) : null };
}
// Agência: reprodução fiel dos dois templates do dono (coordenadas medidas nas referências, em fração da largura e da altura).
// Verde (capa, objeto, chamada): tags no topo, título centralizado na cor da marca, objeto 3D sangrando por baixo, rodapé em 3 pílulas.
// Roxo (texto, cartões, lista): texto à esquerda ou em cartões de contorno, objeto 3D sangrando pela direita, brilho da cor da marca.
function agencia(d, ctx, tipo) {
  const { W, H, T } = ctx, verde = ['capa', 'objeto', 'cta'].includes(tipo), tinta = ctx.ink, hl = ctx.accent, ct = ctx.contatos || {};
  const s = base(ctx, ctx.paper, { grain: .06, vignette: 0, textura: [] }), mol = moldura(ctx, d, ctx.paper, { semArraste: true });
  const F = T.lab, bold = { ...T.tit, w: 700, lh: 1.1, ls: -.02, upper: false, caixa: 'normal' }, reg = { ...T.txt, w: 400, lh: 1.15, ls: -.005 }, med = { ...T.txt, w: 500, lh: 1.15 };
  const obj = genOuAsset(d.objeto), objSrc = obj ? srcDe(obj, x => promptObjeto(ctx, x)) : null;
  const fx = v => F2(v), clean = t => String(t || '').replace(/\*/g, '');
  // bloco de texto posicionado pelo CENTRO vertical (fração de H) e pelo x (fração de W)
  const blk = (lin, f, size, x, yc, o = {}) => { const h = lin.length * (f.lh || 1) * size; return texto(ctx, f, lin, size, { x: x * W, yTop: yc * H - h / 2, align: o.align || 'left', role: o.role || 'title', color: o.color || tinta, extra: { ...(o.hl ? { hl: o.hl, hw: o.hw || 800 } : {}), front: true } }).t; };
  const cabe = (txt, f, maxW, maxH, maxSize, maxLinhas) => ajusta(txt, f, maxW * W, maxH * H, { maxSize: maxSize * W, minSize: 12, maxLinhas });
  // brilho e dobras de vidro só no modelo roxo (como na referência); o verde é fundo chapado
  const glow = (x, y, r, op) => (s.fx.glows ||= []).push({ x, y, r, color: ctx.accent, opacity: op });
  const cantos = () => [[.04, .1], [.96, .1], [.04, .9], [.96, .9]].forEach(([x, y]) => [45, -45].forEach(r => s.shapes.push({ kind: 'rect', x, y, w: fx(.17), h: fx(.0016 * W / H), rot: r, color: '#ffffff', opacity: .07, decor: true })));
  const tile = (x, y, f, rot) => { const ic = d.icone || ({ capa: 'dinheiro', objeto: 'carrinho', cta: 'megaphone', texto: 'foguete', cards: 'foguete' })[tipo] || 'dinheiro', vid = mistura(ctx.paper, ctx.accent, .32); s.shapes.push(ladrilho(ctx, ic, x, y, f, { rot, cor: vid })); };
  const objeto = (x, y, size, rot = 0, sombra = 2) => objSrc ? s.items.push({ ...objSrc, x: fx(x), y: fx(y), size: Math.round(size * W), rot: rot || undefined, shadow: sombra, hero: true }) : tile(x, y, size * .5, rot);
  const avatares = yc => [-1, 0, 1].forEach((k, i) => { const x = .5 + k * .052, dia = .066; s.shapes.push({ kind: 'pill', x: fx(x), y: fx(yc), w: fx((dia + .012) / 1), h: fx((dia + .012) * W / H), color: verde ? ctx.accent : '#ffffff', opacity: 1, radius: .5 }, { kind: 'pill', x: fx(x), y: fx(yc), w: fx(dia), h: fx(dia * W / H), color: [mistura(ctx.accent, '#000', .35), '#e8e8ee', mistura(ctx.accent, '#fff', .45)][i], opacity: 1, radius: .5 }, { kind: 'icon', icon: 'usuario', icon_color: i === 1 ? '#222' : '#fff', x: fx(x), y: fx(yc), w: fx(dia * .55), h: fx(dia * .55 * W / H) }); });
  // topo: três tags com seta (e a logo da marca no verde)
  const tags = (Array.isArray(d.tags) && d.tags.length ? d.tags : ['MARKETING', 'SOCIAL MEDIA', 'DIGITAL']).slice(0, 3), ty = verde ? .12 : .092, xs = verde ? [.216, .476, .752] : [.13, .40, .655], ts = Math.round(W * .0165);
  tags.forEach((t, i) => s.texts.push({ role: 'label', value: String(t).toUpperCase(), x: fx(xs[i]), y: fx(ty), align: 'left', size: ts, font: fontKey(F, ctx), weight: 700, ls: .14, color: tinta, opacity: verde ? 1 : .75, icon: 'seta', icon_color: verde ? hl : hl, nowrap: true, shadow: false, moldura: true, front: true }));
  if (verde) {
    cantos();
    const logo = mol.items.find(i => i.moldura); if (logo) { const ls = Math.min(logo.size, W * .06); s.items.push({ ...logo, size: ls, x: .905, y: fx(ty) }); }
    // rodapé: três pílulas centradas (marca, redes, WhatsApp)
    const py = .933, ph = .04, ps = Math.round(W * .0165), pf = { ...T.txtB, upper: false }, ig = ct.instagram || ('/' + String(ctx.marca || 'marca').toLowerCase().replace(/[^a-z0-9]/g, '')), marca = String(ctx.marca || '').toUpperCase().replace(/[<>]/g, '').slice(0, 20);
    const pill = (x0, x1, txt, icon, forte) => { const cx = (x0 + x1) / 2;
      s.shapes.push({ kind: 'pill', x: fx(cx), y: fx(py), w: fx(x1 - x0 + .003), h: fx(ph + .002), color: '#ffffff', opacity: .38, radius: .5 }, { kind: 'pill', x: fx(cx), y: fx(py), w: fx(x1 - x0), h: fx(ph), color: ctx.paper, opacity: 1, radius: .5 });
      if (txt) s.texts.push({ role: 'footer', value: txt, x: fx(cx), y: fx(py), align: 'center', size: ps, font: fontKey(pf, ctx), weight: forte ? 800 : 500, ls: forte ? .2 : .04, color: tinta, icon, icon_color: tinta, nowrap: true, shadow: false, front: true }); };
    if (ct.whatsapp) { pill(.166, .376, marca, null, true); pill(.386, .596, ig, 'instagram'); pill(.606, .826, ct.whatsapp, 'whatsapp'); } else { pill(.2, .5, marca, null, true); pill(.51, .8, ig, 'instagram'); }
  }
  const cW = .84;
  if (tipo === 'capa') {
    const ap = clean(d.apoio), q = cabe(d.titulo || '', bold, cW, .21, .09, 3), fz = Math.min(W * .034, cW * W / Math.max(1, largura(ap, reg, 1)));
    if (ap) s.texts.push(blk([ap], reg, fz, .5, .28, { align: 'center', role: 'body' }));
    s.texts.push(blk(q.linhas.map(clean), bold, q.size, .5, .28 + .015 + (q.linhas.length * 1.1 * q.size / H) / 2 + .03, { align: 'center', color: hl }));
    objeto(.5, .78, .74, 0);
  } else if (tipo === 'objeto') {
    objeto(.5, .35, .56, 0);
    const q = cabe(d.titulo || '', bold, cW, .14, .066, 3), nl = q.linhas.length, yc = .6 + (nl * 1.1 * q.size / H) / 2;
    s.texts.push(blk(q.linhas.map(clean), bold, q.size, .5, yc, { align: 'center', color: hl }));
    const yb = yc + (nl * 1.1 * q.size / H) / 2 + .04; s.shapes.push({ kind: 'icon', icon: 'seta-baixo', icon_color: '#ffffff', x: .5, y: fx(yb), w: fx(.034), h: fx(.034 * W / H) });
    const tx = String(d.texto || ''); if (tx) { const t = quebraTexto(tx, reg, cW * .72 * W, .1 * H, W * .04, W * .028); s.texts.push(blk(t.linhas, reg, t.size, .5, yb + .035 + (t.linhas.length * 1.15 * t.size / H) / 2, { align: 'center', role: 'body', hl: tinta, hw: 800 })); }
  } else if (tipo === 'cta') {
    const q = cabe(d.titulo || '', { ...bold, w: 600 }, cW, .15, .068, 3), nl = q.linhas.length, yc = .3 + (nl * 1.1 * q.size / H) / 2 - .02;
    s.texts.push(blk(q.linhas, { ...bold, w: 600 }, q.size, .5, yc, { align: 'center', color: hl, hl: tinta, hw: 800 }));
    const ap = clean(d.apoio || 'Converse com nossa agência.'), fz = Math.min(W * .033, cW * W / Math.max(1, largura(ap, reg, 1))), ya = yc + (nl * 1.1 * q.size / H) / 2 + .055;
    s.texts.push(blk([ap], reg, fz, .5, ya, { align: 'center', role: 'body' })); avatares(ya + .06);
    objeto(.52, .8, 1.02, -6);
  } else if (tipo === 'texto') {
    glow(.62, 1.02, .5, .38);
    s.shapes.push({ kind: 'pill', x: fx(.225), y: .262, w: fx(.05), h: fx(.05 * W / H), color: ctx.accent, opacity: 1, radius: .5 }, { kind: 'icon', icon: d.icone || 'circle-check', icon_color: sobre(ctx.accent), x: fx(.225), y: .262, w: fx(.03), h: fx(.03 * W / H) });
    const a = cabe(clean(d.apoio || ''), reg, .5, .1, .036, 3), b = cabe(d.titulo || '', { ...bold, w: 700, lh: 1.08 }, .64, .3, .078, 5), y0 = .31, ha = a.linhas.length * 1.15 * a.size / H;
    if (d.apoio) s.texts.push(blk(a.linhas, reg, a.size, .2, y0 + ha / 2, { role: 'body' }));
    const yb = y0 + ha + .04; s.texts.push(blk(b.linhas, { ...bold, w: 700, lh: 1.08 }, b.size, .2, yb + (b.linhas.length * 1.08 * b.size / H) / 2, { hl: hl, hw: 800 }));
    objeto(.8, .76, .62, -10);
  } else if (tipo === 'cards') {
    glow(.96, .32, .42, .42); glow(.04, 1, .4, .3);
    const card = (y0, y1) => { const cx = .316, cw = .426, cy = (y0 + y1) / 2, h = y1 - y0; s.shapes.push({ kind: 'rect', x: fx(cx), y: fx(cy), w: fx(cw + .004), h: fx(h + .004 * W / H), radius: .1, color: ctx.accent, opacity: .9 }, { kind: 'rect', x: fx(cx), y: fx(cy), w: fx(cw), h: fx(h), radius: .1, color: ctx.paper, opacity: 1 }); };
    card(.248, .48); card(.5, .77);
    const t1 = cabe(d.titulo || '', med, .34, .12, .052, 3); s.texts.push(blk(t1.linhas.map(clean), med, t1.size, .166, .345 + (t1.linhas.length - 2) * .018, { color: hl }));
    s.shapes.push({ kind: 'icon', icon: 'seta-baixo', icon_color: hl, x: .46, y: .44, w: fx(.028), h: fx(.028 * W / H) });
    const a = cabe(d.apoio || d.nota || '', { ...bold, w: 700 }, .34, .14, .052, 3), la = a.linhas, ya0 = .545;
    // primeira linha em peso normal, o restante em negrito (como a referência: “É sobre” / “comunicar melhor.”)
    const prim = [la[0]], resto = la.slice(1); s.texts.push(blk(prim, reg, a.size, .166, ya0 + a.size * 1.1 / H / 2, { color: tinta }));
    if (resto.length) s.texts.push(blk(resto, { ...bold, w: 700 }, a.size, .166, ya0 + a.size * 1.1 / H + (resto.length * 1.1 * a.size / H) / 2, { color: tinta }));
    const tx = String(d.texto || ''); if (tx) { const q = quebraTexto(tx, reg, .33 * W, .06 * H, W * .03, W * .022); s.texts.push(blk(q.linhas, reg, q.size, .166, .708, { role: 'body', opacity: .85, color: mistura(tinta, ctx.paper, .2) })); }
    objeto(.84, .5, .6, 6);
  } else {
    glow(0, .45, .4, .42); glow(.96, 1, .4, .3);
    s.shapes.push({ kind: 'icon', icon: d.icone || 'clipboard-list', icon_color: hl, x: .245, y: .185, w: fx(.04), h: fx(.04 * W / H) });
    const itens = (Array.isArray(d.itens) ? d.itens.map(x => typeof x === 'string' ? x : x?.t || '') : String(d.texto || '').split('|')).map(x => String(x).trim()).filter(Boolean).slice(0, 4), q = cabe(clean(d.titulo || ''), { ...bold, w: 700 }, .6, .1, .06, 2);
    q.linhas.forEach((l, i) => s.texts.push(blk([l], i ? reg : { ...bold, w: 700 }, q.size, .23, .22 + i * .045, { role: 'title' })));
    itens.forEach((it, i) => { const cy = .354 + i * .083, bx = .214, bw = .486, bh = .067, sz = Math.min(W * .034, bw * W * .9 / Math.max(1, largura(it, reg, 1)));
      s.shapes.push({ kind: 'rect', x: fx(bx + bw / 2), y: fx(cy), w: fx(bw + .004), h: fx(bh + .004 * W / H), radius: .3, color: ctx.accent, opacity: .9 }, { kind: 'rect', x: fx(bx + bw / 2), y: fx(cy), w: fx(bw), h: fx(bh), radius: .3, color: ctx.paper, opacity: 1 });
      s.texts.push(blk([it], reg, sz, bx + .02, cy, { role: 'body' })); });
    const pg = String(d.apoio || '').trim(); if (pg) { const t = quebraTexto(pg, med, .74 * W, .08 * H, W * .038, W * .028); s.texts.push(blk(t.linhas, med, t.size, .5, .7 + (t.linhas.length - 1) * .018, { align: 'center', role: 'body', hl: tinta, hw: 800 })); }
    const cl = String(d.cta || d.nota || '').trim(); if (cl) s.texts.push(blk([cl], { ...bold, w: 600 }, Math.min(W * .04, .8 * W / Math.max(1, largura(cl, bold, 1))), .5, .795, { align: 'center', role: 'body', color: hl }));
    avatares(.87); if (objSrc) objeto(.06, .66, .3, 0);
  }
  return s;
}
const COMPOR = {
  heroi(d, ctx) {
    const { W, H, mx, T } = ctx, foto = genOuAsset(d.foto), obj = !foto && genOuAsset(d.objeto), s = base(ctx, ctx.paper), mol = moldura(ctx, d, ctx.paper);
    const larga = !foto && !obj && String(d.titulo || '').split(/\s+/).length > 5;   // sem imagem e título longo: o texto ocupa a largura e o ladrilho fica só no fundo
    const colW = (foto && d.recorte !== false ? .5 : obj ? .8 : larga ? .86 : .56) * W;   // com personagem recortado a coluna do texto para antes da mão/ombro dele (.54 encostava no dedo do mascote)
    if (foto && d.recorte !== false) {   // padrão de agência: ambiente desfocado + personagem recortado + partículas + texto (camadas)
      s.bg = { gen: promptAmbiente(ctx, d), color: ctx.paper, blur: 4 }; s.shade = .82; s.shade_dir = 'left';
      s.items.push(...particulas(ctx, d.particulas).filter(p => !p.front), pessoaItem(ctx, foto, .8, .98), ...particulas(ctx, d.particulas).filter(p => p.front));
      s.fx.fade = [{ dir: 'left', a: .92, ext: .62 }, { dir: 'bottom', a: .7, ext: .3 }];
    } else if (foto) { s.bg = { ...srcDe(foto, x => promptFoto(ctx, x, 'subject positioned on the right half of the frame, lots of empty dark negative space on the left half')), color: ctx.paper, pos: 'direita', grade: d.tratamento === 'natural' ? undefined : { color: ctx.accent, amount: .45 } }; s.shade = .88; s.shade_dir = 'left'; }
    if (obj) { const sz = Math.round(W * .62); s.items.push({ ...srcDe(obj, x => promptObjeto(ctx, x)), x: F2(1 - (mx * .4 + sz / 2) / W), y: F2((mol.base - sz / 2 + sz * .06) / H), size: sz, shadow: 2, hero: true }); (s.fx.glows ||= []).push({ x: .75, y: .7, r: .45, color: ctx.accent, opacity: .3 }); }
    s.fx.glows = foto && d.recorte !== false ? [{ x: .74, y: .32, r: .5, color: ctx.accent, opacity: .2 }, { x: 1, y: 0, r: .65, color: ctx.accent, opacity: .32 }] : [{ x: .92, y: .12, r: .75, color: ctx.accent, opacity: foto ? .32 : .5 }, ...(foto || obj ? [] : [{ x: .1, y: .95, r: .5, color: ctx.accent, opacity: .2 }])];
    s.fx.vignette = .55; s.fx.grain = .32;
    if (!foto && !obj) s.shapes.push(ladrilho(ctx, d.icone || 'raio', .985, .9, .3, { rot: -14, blur: 12, opacity: larga ? .35 : .55 }), ladrilho(ctx, d.icone || 'raio', .9, .14, .13, { rot: 22, blur: 7, opacity: .45 }), ...(larga ? [] : [ladrilho(ctx, d.icone || 'raio', .815, .47, .28, { rot: 12 })]));
    const B = [];
    if (d.kicker) { const f = T.lab, sz = Math.min(W * .028, colW / Math.max(1, largura(d.kicker, f, 1))); B.push({ h: sz * f.lh, gap: 0, make: y => texto(ctx, f, [d.kicker], sz, { x: mx, yTop: y, role: 'label', color: /\*/.test(d.titulo || '') ? ctx.ink : ctx.accent }).t }); }
    const longo = String(d.titulo || '').split(/\s+/).length > 8, ti = ajusta(d.titulo || '', T.tit, colW, H * (obj ? (longo ? .3 : .22) : .4), { maxLinhas: longo ? 4 : 3 });
    if (d.icone && ti.linhas.length) { ti.linhas[0] += ` [i:${d.icone}]`; ti.size = Math.floor(Math.min(ti.size, colW / Math.max(...ti.linhas.map(l => largura(l, T.tit, 1))) * .985)); }
    B.push({ h: ti.linhas.length * T.tit.lh * ti.size, gap: H * .018, make: y => texto(ctx, T.tit, ti.linhas, ti.size, { x: mx, yTop: y, color: ctx.ink, extra: { hl: ctx.accent } }).t });
    if (d.apoio) { const f = T.lab, sz = Math.min(W * .034, colW * .9 / Math.max(1, largura(d.apoio, f, 1))); B.push({ h: sz * f.lh, gap: H * .028, make: y => texto(ctx, f, [d.apoio], sz, { x: mx + 4, yTop: y, role: 'label', color: ctx.ink }).t }); }
    if (d.texto) { const f = T.txt, sz = W * .034, ls = quebra(d.texto, f, sz, colW * (foto && d.recorte !== false ? .8 : .95)).slice(0, 6); B.push({ h: ls.length * f.lh * sz, gap: H * .024, make: y => texto(ctx, f, ls, sz, { x: mx, yTop: y, role: 'body', color: mistura(ctx.ink, ctx.paper, .14) }).t }); }
    if (d.cta) { const f = T.btn, sz = ctaSz(d.cta, f, colW * .92, W * .056); B.push({ h: botaoH(sz), gap: H * .05, make: y => ({ role: 'cta', value: d.cta, x: F2(mx / W), y: F2((y + botaoH(sz) / 2) / H), align: 'left', size: Math.round(sz), font: fontKey(f, ctx), weight: f.w, ls: f.ls, upper: f.upper || undefined, caixa: cxSai(f), italic: !!CONDENSADA[f.k], bg: ctx.accent, color: sobre(ctx.accent), shape: 'box', glow: d.brilho === true ? ctx.accent : undefined, nowrap: true, shadow: false }) }); }
    const ct = ctx.total === 1 ? contatos(ctx, ctx.paper, mol.base) : null;   // carrossel: contatos só na última página
    const fim = ct ? mol.base - ct.h - H * .05 : mol.base;
    const P = obj ? pilha(B, 0, ctx, { topo: mol.topo + H * .04 }) : pilha(B, Math.min((mol.topo + fim) / 2, H * .47), ctx); s.texts.push(...P.itens.map(t => foto && d.recorte !== false ? { ...t, front: true } : t));
    if (ct) s.texts.push(ct.t);
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  dividido(d, ctx) {
    const { W, H, mx, T } = ctx, obj = genOuAsset(d.objeto), s = base(ctx, ctx.paper), mol = moldura(ctx, d, ctx.paper);
    let partes = String(d.titulo || '').split('|').map(x => x.trim()).filter(Boolean);
    if (partes.length < 2) { const p = partes.join(' ').split(/\s+/); const k = Math.ceil(p.length / 2); partes = [p.slice(0, k).join(' '), p.slice(k).join(' ')]; }
    partes = [partes[0], partes.slice(1).join(' ')];
    const vao = W * (obj ? .13 : .14), meiaW = W / 2 - mx * .7 - vao, tl = largura(partes[0], T.tit, 1), tr = largura(partes[1], T.tit, 1);
    const sz = Math.floor(Math.min(meiaW / tl, meiaW / tr, H * .2 / T.tit.lh) * .985), yT = H * .4, hT = sz * T.tit.lh;
    s.texts.push(texto(ctx, T.tit, [partes[0]], sz, { x: W / 2 - vao, yTop: yT - hT / 2, align: 'right', color: ctx.ink, extra: { hl: ctx.accent } }).t);
    s.texts.push(texto(ctx, T.tit, [partes[1]], sz, { x: W / 2 + vao, yTop: yT - hT / 2, align: 'left', color: ctx.ink, extra: { hl: ctx.accent } }).t);
    if (obj) {
      const src = srcDe(obj, x => promptObjeto(ctx, x));
      s.items.push({ ...src, x: .5, y: .49, size: Math.round(W * .6), front: true, shadow: 2, hero: true });
      s.items.unshift({ ...src, x: -.02, y: .88, size: Math.round(W * .62), blur: 14, opacity: .55, rot: -14, hero: true, copia: true }, { ...src, x: 1.04, y: .1, size: Math.round(W * .5), blur: 18, opacity: .45, rot: 18, hero: true, copia: true });
    } else s.shapes.push(ladrilho(ctx, d.icone || 'relogio', .5, .48, .3, { rot: 0 }), ladrilho(ctx, d.icone || 'relogio', .03, .9, .3, { rot: -16, blur: 10, opacity: .6 }), ladrilho(ctx, d.icone || 'relogio', 1.02, .08, .26, { rot: 20, blur: 14, opacity: .5 }));
    s.fx.glows = [{ x: .5, y: .46, r: .55, color: ctx.accent, opacity: .45 }, { x: .5, y: .02, r: .6, color: ctx.accent, opacity: .22 }];
    if (d.apoio) {
      const f = { ...T.lab, ls: .2 }, linhas = String(d.apoio).split('|').map(x => x.trim()).filter(Boolean).slice(0, 2);
      const fz = Math.min(W * .032, W * .66 / Math.max(...linhas.map(l => largura(l, f, 1) + .8)));
      s.texts.push({ role: 'label', value: linhas.join('|'), x: .5, y: .655, align: 'center', size: Math.round(fz), font: fontKey(f, ctx), weight: 600, ls: .2, upper: ctx.T.lab.upper || undefined, caixa: cxSai(ctx.T.lab), band: mistura(ctx.accent, '#000000', .25), band2: ctx.accent, band_color: sobre(ctx.accent), front: true, shadow: false, nowrap: true });
    }
    const ct = ctx.total === 1 ? contatos(ctx, ctx.paper, mol.base, {}) : null; if (ct) s.texts.push(ct.t);
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  revista(d, ctx) {   // título gigante de lado a lado e o personagem NA FRENTE cobrindo parte das letras (efeito capa de revista)
    const { W, H, mx, T } = ctx, foto = genOuAsset(d.foto) || genOuAsset(d.objeto), s = base(ctx, ctx.paper), mol = moldura(ctx, d, ctx.paper);
    s.bg = foto ? { gen: promptAmbiente(ctx, d), color: ctx.paper, blur: 4 } : { color: ctx.paper };
    let yT = Math.max(mol.topo - H * .01, H * .075); const cham = d.kicker || d.apoio;
    if (cham) { const f = T.lab, sz = Math.min(W * .03, (W - mx * 2) * .9 / Math.max(1, largura(cham, f, 1))); s.texts.push(texto(ctx, f, [cham], sz, { x: W / 2, yTop: yT, align: 'center', role: 'label', color: /\*/.test(d.titulo || '') ? ctx.ink : ctx.accent }).t); yT += sz * f.lh + H * .024; }
    const ti = ajusta(d.titulo || '', T.tit, W - mx * 1.2, H * .3, { maxLinhas: 2 }), hT = ti.linhas.length * T.tit.lh * ti.size;
    s.texts.push(texto(ctx, T.tit, ti.linhas, ti.size, { x: W / 2, yTop: yT, align: 'center', color: ctx.ink, extra: { hl: ctx.accent } }).t);
    if (foto) { const it = genOuAsset(d.foto) ? pessoaItem(ctx, foto, .5, 1.02, { front: true }) : { ...srcDe(foto, x => promptObjeto(ctx, x)), x: .5, y: F2((yT + hT * .55 + W * .36) / H), size: Math.round(W * .78), front: true, shadow: 2, glow: ctx.accent, hero: true };
      if (genOuAsset(d.foto)) { const lin = T.tit.lh * ti.size, alvo = ti.linhas.length > 1 ? yT + hT + H * .008 : yT + hT - lin * .3; /* 1 linha: a cabeça encosta no título; 2 linhas: logo abaixo, sem cobrir letra */ it.size = Math.round(Math.max(W * .8, Math.min(W * 1.15, (H * 1.015 - alvo) / .97))); it.y = F2((H * 1.015 - it.size / 2) / H); }   // a cabeça encosta na parte de baixo do título (efeito revista)
      s.items.push(...particulas(ctx, d.particulas).filter(p => !p.front), it, ...particulas(ctx, d.particulas).filter(p => p.front)); }
    else s.shapes.push(ladrilho(ctx, d.icone || 'raio', .5, F2((yT + hT + H * .16) / H), .4, { rot: 8 }));
    s.shade = foto ? .38 : 0; s.shade_dir = 'full'; if (foto) s.fx.fadeFront = [{ dir: 'bottom', a: .94, ext: .42 }];
    s.fx.glows = [{ x: .88, y: .04, r: .7, color: ctx.accent, opacity: .34 }, { x: .5, y: .5, r: .42, color: ctx.accent, opacity: .16 }]; s.fx.vignette = .7; s.fx.grain = .3;
    const B = [];
    if (d.cta) { const f = T.btn, sz = ctaSz(d.cta, f, W * .74, W * .05); B.push({ h: botaoH(sz), gap: H * .025, make: y => ({ role: 'cta', value: d.cta, x: .5, y: F2((y + botaoH(sz) / 2) / H), align: 'center', size: Math.round(sz), font: fontKey(f, ctx), weight: f.w, ls: f.ls, upper: f.upper || undefined, caixa: cxSai(f), italic: !!CONDENSADA[f.k], bg: ctx.accent, color: sobre(ctx.accent), shape: 'box', glow: d.brilho === true ? ctx.accent : undefined, nowrap: true, shadow: false, front: true }) }); }
    else if (ctx.total > 1 && ctx.molde?.arraste === false) { const a = arrastaPilula(ctx, ctx.paper, 0, 0); const sz = Math.round(W * .03), wv = largura('Arrasta para o lado', { ...T.txtM, upper: false }, sz) + sz * 2.2; B.push({ h: a.h, gap: H * .025, make: y => ({ ...a.make(y), x: F2((W / 2 - (wv + sz * 2.55) / 2) / W), front: true }) }); }
    if (B.length) s.texts.push(...pilha(B, 0, ctx, { base: mol.base }).itens);
    s.texts.push(...mol.texts.map(t => ({ ...t, front: true }))); s.items.push(...mol.items.map(i => ({ ...i, front: true }))); s.shapes.push(...mol.shapes); return s;
  },
  'capa-faixa'(d, ctx) {
    const { W, H, mx, T } = ctx, foto = genOuAsset(d.foto), obj = !foto && genOuAsset(d.objeto), s = base(ctx, ctx.paper), mol = moldura(ctx, d, ctx.paper);
    if (foto) { s.bg = { ...srcDe(foto, x => promptFoto(ctx, x, 'subject in the upper half of the frame, the lower half fades into pure darkness')), color: ctx.paper, pos: 'topo', grade: d.tratamento === 'natural' ? undefined : { color: ctx.accent, amount: .35 } }; s.shade = .95; s.shade_dir = 'bottom'; }
    if (obj) s.items.push({ ...srcDe(obj, x => promptObjeto(ctx, x)), x: .68, y: .3, size: Math.round(W * .62), shadow: 2, hero: true });
    else if (!foto) s.shapes.push(ladrilho(ctx, d.icone || 'raio', .64, .3, .42, { rot: 10 }), ladrilho(ctx, d.icone || 'raio', .1, .12, .18, { rot: -16, blur: 8, opacity: .6 }), ladrilho(ctx, d.icone || 'raio', .96, .56, .16, { rot: 24, blur: 10, opacity: .5 }));   // sem imagem: o ladrilho 3D segura a capa
    s.fx.glows = [{ x: .8, y: .1, r: .6, color: ctx.accent, opacity: .3 }];
    let tituloF = String(d.titulo || '');
    if (!tituloF.includes('|')) {   // título corrido: vira faixas (palavras em até 4 linhas) + a última palavra gigante; nunca uma linha só minúscula
      const pal = tituloF.trim().split(/\s+/).filter(Boolean);
      if (pal.length >= 3) {
        const ult = pal.pop(), fb = { ...T.txtB, upper: false, lh: 1.32 }, cw = W * .7 * .86; let melhor = null;
        for (let k = 1; k <= Math.min(4, pal.length); k++) { const ls = reMarca(equilibra(pal, k, fb).map(x => x.join(' '))), fz = Math.min(W * .062, cw / Math.max(...ls.map(l => largura(l, fb, 1)))); melhor = { ls, fz }; if (fz >= W * .055) break; }
        tituloF = [...melhor.ls, ult].join('|');
      }
    }
    const linhas = tituloF.split('|').map(x => x.trim()).filter(Boolean); const ultima = linhas.length > 1 ? linhas.pop() : null;
    const colW = W * .7, B = [];
    if (linhas.length) {
      const f = { ...T.txtB, upper: false, lh: 1.32 }, fz = Math.min(W * .062, colW * .86 / Math.max(...linhas.map(l => largura(l, f, 1)))), pad = Math.round(fz * .1), h = linhas.length * (fz * 1.15 + pad * 2) + (linhas.length - 1) * Math.round(fz * .14);
      B.push({ h, gap: 0, make: y => ({ role: 'body', value: linhas.join('|'), x: F2(mx / W), y: F2((y + h / 2) / H), align: 'left', size: Math.round(fz), font: fontKey(f, ctx), weight: 700, ls: -.01, band: ctx.ink, band2: ctx.ink, band_color: mistura(ctx.paper, '#000000', .2), nowrap: true, shadow: false }) });
    }
    if (ultima) { const ti = ajusta(ultima, T.tit, colW, H * .2, { maxLinhas: 1 }); B.push({ h: ti.size * T.tit.lh, gap: H * .012, make: y => texto(ctx, T.tit, ti.linhas, ti.size, { x: mx - ti.size * .02, yTop: y, color: ctx.accent, extra: { glow: d.brilho === true ? ctx.accent : undefined } }).t }); }
    const cta = arrastaPilula(ctx, ctx.paper, mx, 0, d.cta || 'Arrasta para o lado'); if (d.cta || (ctx.total > 1 && ctx.molde?.arraste === false)) B.push({ ...cta, gap: H * .04 });
    const P = pilha(B, 0, ctx, { base: mol.base - H * .01 }); s.texts.push(...P.itens);
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  'capa-minimal'(d, ctx) {
    const { W, H, mx, T } = ctx, obj = genOuAsset(d.objeto), s = base(ctx, ctx.paper, { grain: .22, vignette: .35 }), mol = moldura({ ...ctx, molde: { ...ctx.molde, ig: ctx.molde?.ig !== false } }, d, ctx.paper);
    const f = { ...T.txtM, upper: false }, colW = W * .74, ti = ajusta(d.titulo || '', f, colW, H * .3, { maxSize: W * .078, maxLinhas: 4 });
    const B = [{ h: ti.linhas.length * f.lh * ti.size, gap: 0, make: y => texto(ctx, f, ti.linhas, ti.size, { x: mx, yTop: y, role: 'title', color: ctx.ink, extra: { hl: ctx.accent, weight: 500 } }).t }];
    const sub = String(d.texto || d.apoio || '').replace(/[*|]/g, ' ').replace(/\s+/g, ' ').trim();
    if (sub) { const f2 = { ...T.txt, upper: false }, si = ajusta(sub, f2, colW, H * .12, { maxSize: W * .036, maxLinhas: 3 }); B.push({ h: si.linhas.length * f2.lh * si.size, gap: H * .025, make: y => texto(ctx, f2, si.linhas, si.size, { x: mx, yTop: y, role: 'body', color: mistura(ctx.ink, ctx.paper, .25) }).t }); }
    if (d.cta || (ctx.total > 1 && ctx.molde?.arraste === false)) B.push({ ...arrastaPilula(ctx, ctx.paper, mx, 0, d.cta || 'Arrasta para o lado'), gap: H * .05 });
    s.texts.push(...pilha(B, (mol.topo + mol.base) / 2 - H * .02, ctx).itens);
    if (obj) s.items.push({ ...srcDe(obj, x => promptObjeto(ctx, x)), x: .86, y: .12, size: Math.round(W * .3), rot: 12, shadow: 2, hero: true });
    else s.shapes.push(ladrilho(ctx, d.icone, .86, .1, .19, { rot: 14 }), ladrilho(ctx, d.icone, .03, .74, .15, { rot: -18, blur: 6, opacity: .85 }));
    s.fx.glows = [{ x: .95, y: .0, r: .55, color: ctx.accent, opacity: .16 }];
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  frase(d, ctx) {
    const { W, H, T } = ctx, papel = papelDe(ctx, d), obj = genOuAsset(d.objeto), s = base(ctx, papel, { grain: .22, vignette: lum(papel) < .4 ? .35 : 0 }), mol = moldura(ctx, d, papel);
    const f = { ...T.txtM, upper: false }, ti = ajusta(d.titulo || d.texto || d.frase || '', f, W * .76, H * .34, { maxSize: W * .074, maxLinhas: 5 }), h = ti.linhas.length * f.lh * ti.size;
    s.texts.push(texto(ctx, f, ti.linhas, ti.size, { x: W / 2, yTop: (mol.topo + mol.base) / 2 - h / 2, align: 'center', color: tintaDe(ctx, papel), extra: { hl: lum(papel) < .4 ? ctx.accent : mistura(ctx.accent, '#000000', .35), weight: 500 } }).t);
    if (obj) s.items.push({ ...srcDe(obj, x => promptObjeto(ctx, x)), x: .62, y: .93, size: Math.round(W * .5), blur: 10, rot: -10, opacity: .85, hero: true });
    else s.shapes.push(ladrilho(ctx, d.icone, .6, .95, .34, { rot: -14, blur: 12, opacity: .75 }));
    s.fx.glows = [{ x: .5, y: .5, r: .6, color: ctx.accent, opacity: lum(papel) < .4 ? .1 : 0 }];
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  texto(d, ctx) {
    const { W, H, mx, T } = ctx, papel = papelDe(ctx, d), escuro = lum(papel) < .4, tinta = tintaDe(ctx, papel), s = base(ctx, papel, { grain: escuro ? .25 : .18, vignette: escuro ? .4 : 0 }), mol = moldura(ctx, d, papel);
    const hl = escuro ? ctx.accent : mistura(ctx.accent, '#000000', .35);
    const monta = (md, k) => {
      const colW = md.colW, B = [];
      if (d.kicker) { const f = T.lab, sz = W * .026; B.push({ h: sz * f.lh, gap: 0, make: y => texto(ctx, f, [d.kicker], sz, { x: mx, yTop: y, role: 'label', color: hl }).t }); }
      const ti = ajusta(d.titulo || '', T.tit, colW, (md.base - md.topo) * .5 * k[0], { maxSize: W * .12 * k[0], maxLinhas: 4 });
      B.push({ h: ti.linhas.length * T.tit.lh * ti.size, gap: H * .016, make: y => texto(ctx, T.tit, ti.linhas, ti.size, { x: mx, yTop: y, color: tinta, extra: { hl } }).t });
      if (d.texto) { const f = T.txt, sz = W * .036 * k[1], ls = quebra(d.texto, f, sz, colW * .92); B.push({ h: ls.length * f.lh * sz, gap: H * .03 * k[1], make: y => texto(ctx, f, ls, sz, { x: mx, yTop: y, role: 'body', color: escuro ? mistura(ctx.ink, papel, .12) : mistura(tinta, papel, .1), extra: { hl } }).t }); }
      return B;
    };
    const { md, B, topo } = encaixa(d, ctx, s, mol, monta);
    if (d.fantasma && !d.foto) { const g = limpa(d.fantasma).toUpperCase().slice(0, 9), sz = Math.min(W * .3, H * .92 / Math.max(1, largura(g, T.tit, 1))); s.texts.push({ role: 'title', value: g, x: .93, y: .5, align: 'center', size: Math.round(sz), font: fontKey(T.tit, ctx), weight: T.tit.w, upper: true, rot: 90, color: escuro ? mistura(ctx.paper, ctx.accent, .16) : mistura(papel, '#000000', .06), nowrap: true, shadow: false, decor: true }); }
    s.texts.push(...(topo != null ? pilha(B, 0, ctx, { topo }) : pilha(B, (md.topo + md.base) / 2 - ctx.H * .03, ctx)).itens);
    s.fx.glows = escuro ? [{ x: .0, y: 1, r: .7, color: ctx.accent, opacity: .3 }] : [];
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  lista(d, ctx) {
    const { W, H, mx, T } = ctx, papel = d.fundo === 'escuro' ? ctx.paper : ctx.claro, escuro = lum(papel) < .4, tinta = tintaDe(ctx, papel), s = base(ctx, papel, { grain: .16, vignette: escuro ? .4 : 0 }), mol = moldura(ctx, d, papel);
    const obj = genOuAsset(d.objeto), colW = (obj ? .66 : .84) * W, hl = escuro ? ctx.accent : mistura(ctx.accent, '#000000', .35);
    const itens = (Array.isArray(d.itens) ? d.itens : String(d.itens || '').split('||')).map(x => typeof x === 'string' ? { t: x.split(':')[0], d: x.split(':').slice(1).join(':').trim() } : { t: x.t || x.titulo || '', d: x.d || x.texto || '' }).filter(x => x.t).slice(0, 4);
    const g = limpa(d.fantasma || '').trim().charAt(0).toUpperCase(); if (g) s.texts.push({ role: 'title', value: g, x: .86, y: .56, align: 'center', size: Math.round(H * .9), font: fontKey(T.tit, ctx), weight: T.tit.w, color: escuro ? mistura(papel, ctx.accent, .08) : mistura(papel, '#000000', .035), nowrap: true, shadow: false, decor: true });
    const ct = !!d.contraste && itens.length >= 2;   // certo × errado: sem número, letras maiores e o lado certo na cor de destaque
    const B = [], fT = { ...T.txtB, upper: false }, fD = T.txt, sT = W * (ct ? .047 : .042), sD = W * (ct ? .037 : .031);
    if (d.titulo) { const ti = ajusta(d.titulo, T.tit, colW, H * .14, { maxSize: W * .09, maxLinhas: 2 }); B.push({ h: ti.linhas.length * T.tit.lh * ti.size, gap: 0, make: y => texto(ctx, T.tit, ti.linhas, ti.size, { x: mx, yTop: y, color: tinta, extra: { hl } }).t }); }
    itens.forEach((it, q) => {
      const lt = quebra(ct ? it.t : `${q + 1}. ${it.t}`, fT, sT, colW), ld = it.d ? quebra(it.d, fD, sD, colW) : [];
      const h = lt.length * fT.lh * sT + (ld.length ? H * .008 + ld.length * fD.lh * sD : 0);
      B.push({ h, gap: q || d.titulo ? H * (ct ? .06 : .045) : 0, make: y => [texto(ctx, fT, lt, sT, { x: mx, yTop: y, role: 'body', color: ct && q === itens.length - 1 ? (escuro ? ctx.accent : mistura(ctx.accent, '#000000', .18)) : tinta, extra: { weight: 700, hl } }).t, ...(ld.length ? [texto(ctx, fD, ld, sD, { x: mx, yTop: y + lt.length * fT.lh * sT + H * .008, role: 'body', color: mistura(tinta, papel, .18) }).t] : [])] });
    });
    s.texts.push(...pilha(B, 0, ctx, { topo: mol.topo + ctx.H * .05 }).itens);
    if (obj) { const size = Math.round(W * .36); s.items.push({ ...srcDe(obj, x => promptObjeto(ctx, x)), x: F2(1 - (mx * .6 + size / 2) / W), y: F2((mol.base - size / 2) / H), size, shadow: 2, hero: true }); }
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  numero(d, ctx) {
    const { W, H, mx, T } = ctx, papel = papelDe(ctx, d), escuro = lum(papel) < .4, tinta = tintaDe(ctx, papel), s = base(ctx, papel, { grain: .22, vignette: escuro ? .4 : 0 }), mol = moldura(ctx, d, papel);
    const hl = escuro ? ctx.accent : mistura(ctx.accent, '#000000', .35);
    const monta = (md, k) => {
      const colW = md.colW, B = [], esp = md.base - md.topo;
      const n = String(d.numero ?? '1').slice(0, 4), fN = { ...T.tit, ls: -.02 }, sN = Math.min(Math.min(H * .2, esp * (md.base < mol.base ? .28 : .5)) / fN.lh, colW * .7 / Math.max(.1, largura(n, fN, 1))) * Math.max(k[0], .8);
      B.push({ h: sN * fN.lh, gap: 0, make: y => texto(ctx, fN, [n], sN, { x: mx - sN * .03, yTop: y, role: 'number', color: hl }).t });
      const ti = ajusta(d.titulo || '', T.tit, colW, esp * .28 * k[0], { maxSize: W * .1 * k[0], maxLinhas: 3 });
      B.push({ h: ti.linhas.length * T.tit.lh * ti.size, gap: H * .02, make: y => texto(ctx, T.tit, ti.linhas, ti.size, { x: mx, yTop: y, color: tinta, extra: { hl } }).t });
      if (d.texto) { const f = T.txt, sz = W * .035 * k[1], ls = quebra(d.texto, f, sz, colW * .9); B.push({ h: ls.length * f.lh * sz, gap: H * .028 * k[1], make: y => texto(ctx, f, ls, sz, { x: mx, yTop: y, role: 'body', color: mistura(tinta, papel, .14) }).t }); }
      return B;
    };
    const { md, B, topo } = encaixa(d, ctx, s, mol, monta);
    s.texts.push(...(topo != null ? pilha(B, 0, ctx, { topo }) : pilha(B, (md.topo + md.base) / 2 - ctx.H * .03, ctx)).itens);
    s.fx.glows = escuro ? [{ x: .1, y: .2, r: .6, color: ctx.accent, opacity: .25 }] : [];
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  pilulas(d, ctx) {
    const { W, H, T } = ctx, s = base(ctx, ctx.paper, { grain: .2, vignette: .3 }), mol = moldura(ctx, d, ctx.paper);
    const itens = (Array.isArray(d.itens) ? d.itens : String(d.itens || d.titulo || '').split(/\|\||\|/)).map(x => limpa(typeof x === 'string' ? x : x.t || '').trim()).filter(Boolean).slice(0, 4);
    const forte = ctx.accent, tons = [mistura(forte, '#000000', .55), mistura(forte, '#ffffff', .3), mistura(forte, '#000000', .72), mistura(forte, '#ffffff', .15)];
    const cy = (mol.topo + mol.base) / 2;
    s.shapes.push({ kind: 'star', x: .5, y: F2(cy / H), w: 1.0, h: F2(W * 1.0 / H), color: forte, points: 14, inner: .8, decor: true });
    const f = { ...T.txtM, upper: false }, sz = Math.min(W * .042, W * .66 / Math.max(...itens.map(i => largura(i, f, 1)), 1)), hb = botaoH(sz), gap = sz * .7;
    const B = itens.map((it, q) => ({ h: hb, gap: q ? gap : 0, make: y => ({ role: 'cta', value: it, x: .5, y: F2((y + hb / 2) / H), align: 'center', size: Math.round(sz), font: fontKey(f, ctx), weight: 500, bg: tons[q % 4], color: sobre(tons[q % 4]), shape: 'pill', nowrap: true, shadow: false }) }));
    s.texts.push(...pilha(B, cy, ctx).itens);
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  // Manchete sobre foto com o perfil da marca no topo: foto em página inteira, escurece embaixo, manchete em caixa alta, "Leia a legenda" e barra na cor da marca
  'manchete-foto'(d, ctx) {
    const { W, H, mx, T } = ctx, foto = genOuAsset(d.foto), s = base(ctx, '#000000', { grain: .12, vignette: 0 });
    if (foto) s.bg = { ...srcDe(foto, x => `${x}, sharp editorial news photograph, subject in the upper two thirds of the frame, natural light, no text, no watermark`), color: '#000000', pos: 'topo' };
    else s.fx.glows = [{ x: .5, y: .3, r: .8, color: ctx.accent, opacity: .35 }];
    s.fx.fadeFront = [{ dir: 'bottom', a: .94, ext: .52 }];
    const nome = String(d.nome || ctx.marca || '').trim().replace(/\S+/g, w => w === w.toUpperCase() && w.length > 3 ? w[0] + w.slice(1).toLowerCase() : w), av = Math.round(W * .056), ay = H * .052, ax = mx * .62 + av / 2;
    if (d.topo === 'logo') {   // logo da marca (com mascote) solta no canto, sem avatar nem nome
      if (ctx.logo) { const r = ctx.logoRatio || .2, lw = Math.round(Math.min(W * .27, W * .14 / r)); s.items.push({ asset: ctx.logo, x: F2((mx * .62 + lw / 2) / W), y: F2((H * .045 + lw * r / 2) / H), size: lw, moldura: true, front: true }); }
    } else if (d.topo !== 'nenhum') {
    const quad = ctx.logo && ctx.logoRatio > .7 && ctx.logoRatio < 1.4;
    if (quad) s.items.push({ asset: ctx.logo, x: F2(ax / W), y: F2(ay / H), size: av, round: true, moldura: true });
    else { s.shapes.push({ kind: 'circle', x: F2(ax / W), y: F2(ay / H), w: F2(av / W), h: F2(av / H), color: ctx.accent }); const ini = (nome.match(/[A-Za-zÀ-ÿ0-9]/) || ['N'])[0].toUpperCase(); s.texts.push({ role: 'badge', value: ini, x: F2(ax / W), y: F2(ay / H), align: 'center', size: Math.round(av * .5), font: fontKey(T.txtB, ctx), weight: 800, color: sobre(ctx.accent), nowrap: true, shadow: false }); }
    const nz = Math.round(W * .021), nx = ax + av / 2 + W * .014, fn = { ...T.txtB, w: 700 };
    if (nome) { s.texts.push({ role: 'label', value: nome, x: F2(nx / W), y: F2(ay / H), align: 'left', size: nz, font: fontKey(fn, ctx), weight: 700, ls: 0, caixa: 'normal', color: '#ffffff', nowrap: true, shadow: false, front: true });
      const vz = Math.round(nz * 1.05); s.shapes.push({ kind: 'circle', x: F2((nx + largura(nome, fn, nz) + W * .01 + vz / 2) / W), y: F2(ay / H), w: F2(vz / W), h: F2(vz / H), color: '#1d9bf0', icon: 'check', icon_color: '#ffffff', front: true }); }
    }
    const fio = d.rodape === 'fio', logoR = d.rodape === 'logo', barH = fio || logoR ? Math.round(H * .006) : Math.round(H * .034), tf = { ...T.tit, k: 'impact', w: 400, ls: 0, upper: true, caixa: undefined, lh: lhAcento(d.titulo) }, sombra = d.sombra ? ctx.accent : undefined, ti = ajusta(d.titulo || '', tf, W * .9, H * .36, { maxSize: W * .145, maxLinhas: 4 }), leg = String(d.legenda || 'Leia a legenda').trim(), lz = Math.round(W * .021);   // hierarquia: manchete grande, legenda pequena
    if (fio) { const cores = ['#ff4d8d', '#ff9a3c', '#ffe14d', '#4db8ff', '#3be08a'], x0 = mx * .62, ww = (W - x0 * 2) / 4, cy = H - H * .03;
      for (let q = 0; q < 4; q++) s.shapes.push({ kind: 'rect', x: F2((x0 + ww * (q + .5)) / W), y: F2(cy / H), w: F2(ww / W), h: F2(barH / H), color: cores[q], color2: cores[q + 1], grad: 90, radius: q === 0 || q === 3 ? .5 : 0, front: true }); }
    else if (!logoR) s.shapes.push({ kind: 'rect', x: .5, y: F2((H - barH / 2) / H), w: 1, h: F2(barH / H), color: ctx.accent, front: true });
    const B = [{ h: ti.linhas.length * tf.lh * ti.size, gap: 0, make: y => texto(ctx, tf, ti.linhas, ti.size, { x: W / 2, yTop: y, align: 'center', color: '#ffffff', extra: { hl: lum(ctx.accent) > .4 ? ctx.accent : '#ffffff', front: true, italic: d.italico ? true : undefined, sh_color: sombra } }).t },
      ...(logoR && ctx.logo ? [(() => { const r = ctx.logoRatio || .2, lh = Math.min(W * .075, W * .16 * r), lw = Math.round(lh / r); return { h: lh, gap: H * .03, make: y => (s.items.push({ asset: ctx.logo, x: .5, y: F2((y + lh / 2) / H), size: lw, moldura: true, front: true }), []) }; })()] : []),
      { h: lz * 1.3, gap: H * .03, make: y => ({ role: 'body', value: leg, x: .5, y: F2((y + lz * .65) / H), align: 'center', size: lz, font: fontKey(T.txt, ctx), weight: 300, color: '#ffffff', nowrap: true, shadow: false, front: true }) }];
    s.texts.push(...(() => { const P = pilha(B, 0, ctx, { base: fio ? H - H * .06 : logoR ? H - H * .05 : H - barH - H * .022 }); if (d.linha) s.shapes.push({ kind: 'line', x: .5, y: F2((P.y0 - H * .035) / H), w: .56, h: .0022, color: '#ffffff', front: true }); return P.itens; })());
    return s;
  },
  // Frase de personalidade: retrato em página inteira, preto embaixo, fio com a marca e o @ no meio, nome de quem disse e a frase centralizados
  citacao(d, ctx) {
    const { W, H, T } = ctx, foto = genOuAsset(d.foto), s = base(ctx, '#000000', { grain: .12, vignette: 0 });
    if (foto) s.bg = { ...srcDe(foto, x => `${x}, portrait photograph of the person, face clearly visible in the upper half of the frame, dramatic dark background, photorealistic, no text, no watermark`), color: '#000000', pos: 'topo' };
    else s.fx.glows = [{ x: .5, y: .3, r: .8, color: ctx.accent, opacity: .3 }];
    s.fx.fadeFront = d.impact === true ? [{ dir: 'bottom', a: 1, ext: .78 }, { dir: 'bottom', a: 1, ext: .46 }, { dir: 'bottom', a: 1, ext: .28 }] : [{ dir: 'bottom', a: 1, ext: .42 }];   // notícia: escurece bem mais para a logo, a linha e a manchete ficarem legíveis sobre qualquer foto
    const imp = d.impact === true, f = imp ? { ...T.tit, k: 'impact', w: 400, upper: true, caixa: undefined, ls: 0, lh: lhAcento(d.frase || d.titulo) } : { ...T.txtB, w: 800, upper: true, caixa: undefined, ls: 0, lh: 1.22 }, nome = String(d.nome || '').trim(), frase = String(d.frase || d.titulo || '').trim().replace(/(\p{L})\*(\p{L})/gu, '$1∗$2').replace(/\*/g, ''), handle = String(d.handle || ctx.contatos?.instagram || '').trim();
    const tiI = imp && !nome ? ajusta(frase, f, W * .9, H * .3, { maxSize: W * .108, minSize: W * .05, maxLinhas: 5 }) : null, topI = tiI ? H * .915 - tiI.linhas.length * f.lh * tiI.size : 0;   // notícia sem nome: a manchete é o MAIOR que couber (até 5 linhas) e a linha/logo sobem junto quando ela é longa
    const yLinha = tiI ? Math.max(H * .5, topI - H * .034) : H * (imp ? (nome ? .672 : .695) : .697), x0 = W * .155, x1 = W * .845;
    s.shapes.push({ kind: 'line', x: .5, y: F2(yLinha / H), w: F2((x1 - x0) / W), h: .0028, color: '#ffffff', moldura: true, front: true });
    if (ctx.logo) { const r = ctx.logoRatio || .2, lh = W * .08, lw = Math.min(W * .2, lh / r); s.items.push({ asset: ctx.logo, x: .5, y: F2((yLinha - (imp ? H * .052 : 0)) / H), size: Math.round(r > .6 ? lh : lw), moldura: true, front: true }); }
    if (handle) s.texts.push({ role: 'label', value: handle.toUpperCase(), x: F2(x1 / W), y: F2((yLinha - H * .02) / H), align: 'right', size: Math.round(W * .0185), font: fontKey(f, ctx), weight: 700, ls: .02, color: '#ffffff', nowrap: true, shadow: false, front: true });
    const B = [], nz = Math.round(W * .043);
    if (nome) B.push({ h: nz * f.lh, gap: 0, make: y => texto(ctx, f, [nome], nz, { x: W / 2, yTop: y, align: 'center', role: 'title', color: '#ffffff', extra: { front: true } }).t });
    const ti = imp ? (tiI || ajusta(frase, f, W * .88, H * .14, { maxSize: W * .088, minSize: W * .04, maxLinhas: 4 }))  /* com nome da pessoa sobra menos altura até o Leia a legenda */ : ajusta(frase, f, W * .84, H * .2, { maxSize: W * .047, minSize: W * .03, maxLinhas: 6 });
    B.push({ h: ti.linhas.length * f.lh * ti.size, gap: nome ? H * .032 : 0, make: y => texto(ctx, f, ti.linhas, ti.size, { x: W / 2, yTop: y, align: 'center', role: 'body', color: '#ffffff', extra: { front: true } }).t });
    if (imp) { const lz = Math.round(W * .021), fl = { ...T.txt, w: 300, ls: .02, lh: 1, upper: false, caixa: 'normal' }; s.texts.push(texto(ctx, fl, ['Leia a legenda'], lz, { x: W / 2, yTop: H * .948, align: 'center', role: 'label', color: '#ffffff', extra: { front: true, nowrap: true, opacity: .85 } }).t); }   // notícia: sempre "Leia a legenda" embaixo da manchete, em posição fixa
    if (imp && !nome) s.texts.push(texto(ctx, f, ti.linhas, ti.size, { x: W / 2, yTop: topI, align: 'center', role: 'body', color: '#ffffff', extra: { front: true } }).t);
    else s.texts.push(...pilha(B, 0, ctx, { topo: H * (imp ? .712 : .748) }).itens);
    return s;
  },
  // Capa de jornal: foto de página inteira, degradê escuro-azulado embaixo, selo, manchete em caixa alta centralizada, fio com a marca e "Leia a legenda"
  noticia(d, ctx) {
    const { W, H, mx, T } = ctx, foto = genOuAsset(d.foto), azul = mistura(ctx.accent, '#000000', lum(ctx.accent) > .5 ? .8 : .66), s = base(ctx, azul, { grain: .22, vignette: .3 });
    if (foto) { s.bg = { ...srcDe(foto, x => `${x}, photojournalism, realistic news photograph, natural light, high contrast, sharp focus, no text, no watermark`), color: azul, pos: 'topo' }; s.shade = .3; s.shade_dir = 'bottom'; }
    else s.fx.glows = [{ x: .5, y: .3, r: .8, color: ctx.accent, opacity: .35 }];
    s.fx.fadeFront = [{ dir: 'bottom', a: .96, ext: .62 }];
    const tf = { ...T.tit, k: 'impact', w: 400, ls: 0, lh: lhAcento(d.titulo), upper: true, caixa: undefined }, selo = String(d.selo || 'Notícia urgente!').trim(), legenda = String(d.legenda || 'Leia a legenda').trim();
    const ti = ajusta(d.titulo || '', tf, W * .92, H * .37, { maxSize: W * .15, maxLinhas: 4 }), hl = lum(ctx.accent) > .4 ? ctx.accent : mistura(ctx.accent, '#ffffff', .6);
    const fs = { ...T.txtB, upper: true, caixa: undefined, ls: 0 }, sz = Math.round(Math.min(W * .03, (W * .7) / Math.max(1, largura(selo.toUpperCase(), fs, 1)))), hs = botaoH(sz), fl = Math.round(W * .021);
    const logoW = ctx.logo ? Math.round(Math.min(W * .16, (W * .05) / (ctx.logoRatio || .2))) : 0, logoH = ctx.logo ? logoW * (ctx.logoRatio || .2) : 0, hLinha = Math.max(logoH, W * .012);
    const base0 = ctx.storiesH ? H * .8 : H * .93, B = [];
    B.push({ h: hs, gap: 0, make: y => ({ role: 'cta', value: selo, x: .5, y: F2((y + hs / 2) / H), align: 'center', size: sz, font: fontKey(fs, ctx), weight: fs.w, upper: true, italic: true, bg: ctx.accent, color: sobre(ctx.accent), shape: 'pill', nowrap: true, shadow: false, front: true }) });
    B.push({ h: ti.linhas.length * tf.lh * ti.size, gap: H * .028, make: y => texto(ctx, tf, ti.linhas, ti.size, { x: W / 2, yTop: y, align: 'center', color: '#ffffff', extra: { hl, hw: tf.w, upper: true, front: true } }).t });
    B.push({ h: hLinha, gap: H * .03, make: y => { const cy = y + hLinha / 2, lw = (W - mx * 2 - (logoW ? logoW + W * .06 : 0)) / 2, ox = (logoW ? logoW / 2 + W * .03 : W * .015) + lw / 2;
      const linha = sx => ({ kind: 'line', x: F2((W / 2 + sx * ox) / W), y: F2(cy / H), w: F2(lw / W), h: .0018, color: '#ffffff', opacity: .75, moldura: true, front: true });
      if (logoW) s.items.push({ asset: ctx.logo, x: .5, y: F2(cy / H), size: logoW, moldura: true, front: true });
      s.shapes.push(linha(-1), linha(1)); return []; } });
    B.push({ h: fl * 1.2, gap: H * .018, make: y => ({ role: 'body', value: legenda, x: .5, y: F2((y + fl * .6) / H), align: 'center', size: fl, font: fontKey(T.txt, ctx), weight: 300, color: '#ffffff', opacity: .85, nowrap: true, shadow: false, front: true }) });
    s.texts.push(...pilha(B, 0, ctx, { base: base0 }).itens);
    return s;
  },
  // Contra-capa de jornal: fundo escuro de foto + cartão branco arredondado com avatar da marca, nome verificado e o texto da notícia
  // ───────── Cinema: fundo escuro de filme, tipografia fina, destaque na cor da marca ─────────
  coluna(d, ctx) {
    const { W, H, mx, T } = ctx, papel = papelDe(ctx, d), escuro = lum(papel) < .4, tinta = tintaDe(ctx, papel), s = base(ctx, papel, { grain: escuro ? .25 : .18, vignette: escuro ? .45 : 0 }), mol = moldura(ctx, d, papel);
    const hl = escuro ? ctx.accent : mistura(ctx.accent, '#000000', .35), obj = genOuAsset(d.objeto), colW = W - mx * 2 - (obj ? W * .2 : 0);
    const paras = (Array.isArray(d.paragrafos) ? d.paragrafos : String(d.paragrafos || d.texto || '').split(/\n{2,}|\|\|/)).map(x => String(x).trim()).filter(Boolean);
    const itens = (Array.isArray(d.itens) ? d.itens : []).map(x => typeof x === 'string' ? { t: x, d: '' } : { t: x.t || x.titulo || '', d: x.d || x.texto || '' }).filter(x => x.t).slice(0, 4);
    const sz = W * (paras.join(' ').length + itens.length * 60 > 330 ? .037 : .042), f = T.txt, B = [];
    paras.slice(0, 4).forEach((pg, i) => { const ls = quebra(pg, f, sz, colW); B.push({ h: ls.length * f.lh * sz, gap: i ? H * .03 : 0, make: y => texto(ctx, f, ls, sz, { x: mx, yTop: y, role: 'body', color: tinta, extra: { hl } }).t }); });
    itens.forEach((it, i) => { const ls = quebra(`•  ${it.t}${it.d ? ': ' + it.d : ''}`, f, sz, colW - sz); B.push({ h: ls.length * f.lh * sz, gap: H * (i || paras.length ? .028 : 0), make: y => texto(ctx, f, ls, sz, { x: mx, yTop: y, role: 'body', color: tinta, extra: { hl } }).t }); });
    s.texts.push(...pilha(B, H * .47, ctx).itens);
    if (obj) { const size = Math.round(W * .34); s.items.push({ ...srcDe(obj, x => promptObjeto(ctx, x)), x: F2(1 - (mx * .3 + size / 2) / W), y: F2((mol.base - size / 2 + size * .08) / H), size, shadow: 2, hero: true }); }
    if (escuro) s.fx.glows = [{ x: 1, y: .85, r: .7, color: ctx.accent, opacity: .35 }];
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  'capa-mascote'(d, ctx) {
    const { W, H, mx, T } = ctx, obj = genOuAsset(d.objeto) || genOuAsset(d.foto), s = base(ctx, ctx.paper, { grain: .25, vignette: .5, textura: undefined }), mol = moldura(ctx, d, ctx.paper);
    s.shade = .72; s.shade_dir = 'left';
    s.fx.glows = [{ x: .85, y: .1, r: .6, color: ctx.accent, opacity: .25 }, { x: .82, y: .78, r: .4, color: ctx.accent, opacity: .18 }];
    if (obj) { const sz = Math.round(W * (obj.gen ? .8 : .98)); s.items.push({ ...srcDe(obj, x => promptObjeto(ctx, x)), x: .93, y: .785, size: sz, shadow: 2, hero: true }); }
    const colW = W * (obj ? .54 : .88), B = [];
    if (d.kicker) { const f = T.lab, sz = W * .028; B.push({ h: sz * f.lh, gap: 0, make: y => texto(ctx, f, [String(d.kicker).toUpperCase()], sz, { x: mx, yTop: y, role: 'label', color: ctx.accent }).t }); }
    const tituloCapa = String(d.titulo || '').toUpperCase(), ti = ajusta(tituloCapa, T.tit, colW, H * .36, { maxLinhas: 5, maxSize: W * .085 });
    B.push({ h: ti.linhas.length * T.tit.lh * ti.size, gap: H * .026, make: y => texto(ctx, T.tit, ti.linhas, ti.size, { x: mx, yTop: y, color: ctx.ink, extra: { hl: ctx.accent } }).t });
    const ap = d.texto || d.apoio;
    if (ap) { const f = T.txt, sz = W * .0315, ls = quebra(ap, f, sz, W * (obj ? .46 : .8)).slice(0, 6); B.push({ h: ls.length * f.lh * sz, gap: H * .022, make: y => texto(ctx, f, ls, sz, { x: mx, yTop: y, role: 'body', color: ctx.ink }).t }); }
    if (d.cta) { const f = T.btn, sz = ctaSz(d.cta, f, W * .6, W * .029); B.push({ h: botaoH(sz), gap: H * .045, make: y => ({ role: 'cta', value: d.cta, x: F2(mx / W), y: F2((y + botaoH(sz) / 2) / H), align: 'left', size: Math.round(sz), font: fontKey(f, ctx), weight: f.w, ls: f.ls, upper: f.upper || undefined, caixa: cxSai(f) }) }); }
    s.texts.push(...pilha(B, H * .43, ctx).itens.map(t => ({ ...t, front: true })));
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  'cinema-capa'(d, ctx) {
    const { W, H, mx, T } = ctx, foto = genOuAsset(d.foto), s = base(ctx, ctx.paper, { grain: .26, vignette: .62, textura: texBanco(ctx, ctx.paper) }), mol = moldura(ctx, d, ctx.paper);
    s.bg = { gen: promptAmbiente(ctx, d), color: ctx.paper, blur: 3 }; s.shade = .5; s.shade_dir = 'bottom';
    s.fx.glows = [{ x: .78, y: .22, r: .75, color: ctx.accent, opacity: .28 }, { x: .1, y: .95, r: .6, color: ctx.accent, opacity: .16 }];
    const fl = { ...T.txt, w: 300, ls: -.02, lh: 1, upper: true, caixa: 'alta' }, gh = String(d.kicker || (String(d.titulo || '').match(/\*([^*]+)\*/)?.[1]) || d.titulo || '').replace(/[*|]/g, '').trim().split(/\s+/).sort((x, y) => y.length - x.length)[0]?.toUpperCase().slice(0, 12) || '';
    if (gh) { const sz = Math.round(Math.min(W * .3, W * .86 / Math.max(.1, largura(gh, fl, 1)))); s.texts.push({ role: 'title', value: gh, x: F2(mx * .7 / W), y: .27, align: 'left', size: sz, font: fontKey(fl, ctx), weight: 300, ls: -.02, upper: true, color: ctx.ink, opacity: .3, nowrap: true, shadow: false }); }
    if (foto) s.items.push(pessoaItem(ctx, foto, .3, .88));
    const colW = W * .84, tf = { ...T.txt, w: 400, ls: -.01, lh: 1.14 }, hl = lum(ctx.accent) > .45 ? ctx.accent : mistura(ctx.accent, '#ffffff', .55), B = [];
    const ti = ajusta(d.titulo || '', tf, colW, H * .2, { maxSize: W * .078, maxLinhas: 3 });
    B.push({ h: ti.linhas.length * tf.lh * ti.size, gap: 0, make: y => texto(ctx, tf, ti.linhas, ti.size, { x: mx, yTop: y, color: '#ffffff', extra: { hl, hw: 500, front: true } }).t });
    const ap = String(d.texto || d.apoio || '').trim();
    if (ap) { const fa = { ...T.txt, w: 300, lh: 1.3 }, q = quebraTexto(ap, fa, colW * .8, H * .1, W * .03, W * .024); B.push({ h: q.linhas.length * fa.lh * q.size, gap: H * .018, make: y => texto(ctx, fa, q.linhas, q.size, { x: mx, yTop: y, role: 'body', color: '#ffffff', extra: { opacity: .88, front: true } }).t }); }
    s.texts.push(...pilha(B, 0, ctx, { base: mol.base - H * .05 }).itens, ...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  'cinema-texto'(d, ctx) {
    const { W, H, mx, T } = ctx, s = base(ctx, ctx.paper, { grain: .24, vignette: .6, textura: texBanco(ctx, ctx.paper) }), mol = moldura(ctx, d, ctx.paper), foto = genOuAsset(d.foto);
    s.bg = foto ? { ...srcDe(foto, x => promptAmbiente(ctx, { ambiente: x })), color: ctx.paper, blur: 2 } : { gen: promptAmbiente(ctx, d), color: ctx.paper, blur: 3 }; s.shade = .6; s.shade_dir = 'left';
    s.fx.glows = [{ x: .85, y: .4, r: .7, color: ctx.accent, opacity: .22 }];
    const x0 = mx * .8 + W * .04, colW = W * .6, tf = { ...T.txt, w: 400, ls: -.01, lh: 1.2 }, hl = lum(ctx.accent) > .45 ? ctx.accent : mistura(ctx.accent, '#ffffff', .55), B = [];
    const ti = ajusta(d.titulo || '', tf, colW, H * .26, { maxSize: W * .078, maxLinhas: 5 });
    B.push({ h: ti.linhas.length * tf.lh * ti.size, gap: 0, make: y => texto(ctx, tf, ti.linhas, ti.size, { x: x0, yTop: y, color: '#ffffff', extra: { hl, hw: 500, front: true } }).t });
    const fp = { ...T.txt, w: 300, lh: 1.32 }, ps = String(d.texto || '').split('|').map(x => x.trim()).filter(Boolean).slice(0, 3);
    for (const pr of ps) { const q = quebraTexto(pr, fp, colW, H * .14, W * .04, W * .03); B.push({ h: q.linhas.length * fp.lh * q.size, gap: H * .022, make: y => texto(ctx, fp, q.linhas, q.size, { x: x0, yTop: y, role: 'body', color: '#ffffff', extra: { opacity: .86, front: true } }).t }); }
    const P = pilha(B, H * .36, ctx), ymin = P.y0, ymax = P.y0 + P.tot;
    s.shapes.push({ kind: 'rect', x: F2((mx * .8 + W * .004) / W), y: F2(((ymin + ymax) / 2) / H), w: F2(W * .0022 / W), h: F2((ymax - ymin + H * .02) / H), color: '#ffffff', opacity: .6 });
    s.texts.push(...P.itens, ...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  'cinema-pergunta'(d, ctx) {
    const { W, H, mx, T } = ctx, s = base(ctx, ctx.paper, { grain: .24, vignette: .6, textura: texBanco(ctx, ctx.paper) }), mol = moldura(ctx, d, ctx.paper);
    s.bg = { gen: promptAmbiente(ctx, d), color: ctx.paper, blur: 3 }; s.shade = .62; s.shade_dir = 'full';
    s.fx.glows = [{ x: .2, y: .3, r: .7, color: ctx.accent, opacity: .2 }];
    const x0 = W * .24, colW = W * .66, fl = { ...T.txt, w: 300, lh: 1.3 }, fq = { ...T.txt, w: 500, ls: -.01, lh: 1.16 }, hl = lum(ctx.accent) > .45 ? ctx.accent : mistura(ctx.accent, '#ffffff', .55);
    const bloco = (lead, perg) => { const B = [];
      if (lead) { const q = quebraTexto(lead, fl, colW, H * .07, W * .038, W * .03); B.push({ h: q.linhas.length * fl.lh * q.size, gap: 0, make: y => texto(ctx, fl, q.linhas, q.size, { x: x0, yTop: y, role: 'body', color: '#ffffff', extra: { front: true } }).t }); }
      if (perg) { const ti = ajusta(perg, fq, colW * .92, H * .15, { maxSize: W * .062, maxLinhas: 3 }), L = ti.linhas.slice(); L[0] = '*“* ' + L[0]; L[L.length - 1] += ' *”*';
        B.push({ h: L.length * fq.lh * ti.size, gap: H * .012, make: y => texto(ctx, fq, L, ti.size, { x: x0 - ti.size * .9, yTop: y, color: '#ffffff', extra: { hl, hw: 700, front: true } }).t }); }
      return B; };
    const tq = String(d.texto || ''), soTexto = !d.nota && /\?\s*$/.test(tq), B1 = bloco(String(d.apoio || ''), String(d.titulo || '')), B2 = soTexto ? bloco('', tq) : bloco(tq, String(d.nota || ''));
    const P1 = pilha(B1, 0, ctx, { base: H * .445 }), P2 = pilha(B2, 0, ctx, { topo: H * .515 });
    s.texts.push(...P1.itens, ...P2.itens, ...mol.texts); s.items.push(...mol.items);
    if (B2.length) s.shapes.push({ kind: 'rect', x: .5, y: .48, w: .72, h: .0014, color: '#ffffff', opacity: .35 });
    s.shapes.push(...mol.shapes); return s;
  },
  'cinema-card'(d, ctx) {
    const { W, H, mx, T } = ctx, s = base(ctx, ctx.paper, { grain: .24, vignette: .55, textura: texBanco(ctx, ctx.paper) }), mol = moldura(ctx, d, ctx.paper);
    s.bg = { gen: promptAmbiente(ctx, d), color: ctx.paper, blur: 4 }; s.shade = .5; s.shade_dir = 'full';
    s.fx.glows = [{ x: .5, y: .5, r: .8, color: ctx.accent, opacity: .2 }];
    const cardW = W * .84, colW = cardW * .82, tf = { ...T.txt, w: 400, ls: -.01, lh: 1.22 }, hl = lum(ctx.accent) > .45 ? ctx.accent : mistura(ctx.accent, '#ffffff', .55), B = [];
    const ti = ajusta(d.titulo || '', tf, colW, H * .22, { maxSize: W * .058, maxLinhas: 4 });
    B.push({ h: ti.linhas.length * tf.lh * ti.size, gap: 0, make: y => texto(ctx, tf, ti.linhas, ti.size, { x: W / 2, yTop: y, align: 'center', color: '#ffffff', extra: { hl, hw: 600, front: true } }).t });
    const fp = { ...T.txt, w: 300, lh: 1.34 };
    for (const pr of String(d.texto || '').split('|').map(x => x.trim()).filter(Boolean).slice(0, 3)) { const q = quebraTexto(pr, fp, colW, H * .09, W * .04, W * .03); B.push({ h: q.linhas.length * fp.lh * q.size, gap: H * .022, make: y => texto(ctx, fp, q.linhas, q.size, { x: W / 2, yTop: y, align: 'center', role: 'body', color: '#ffffff', extra: { opacity: .9, front: true } }).t }); }
    const tot = B.reduce((a, b, i) => a + b.h + (i ? b.gap : 0), 0), cardH = Math.min(H * .7, tot + H * .12), cy = H * .47;
    s.shapes.push({ kind: 'rect', x: .5, y: F2(cy / H), w: F2(cardW / W), h: F2(cardH / H), radius: .045, color: '#ffffff', opacity: .1 }, { kind: 'rect', x: .5, y: F2(cy / H), w: F2((cardW + W * .004) / W), h: F2((cardH + W * .004) / H), radius: .046, color: '#ffffff', opacity: .12, behind: true });
    s.texts.push(...pilha(B, cy, ctx).itens, ...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  },
  // ───────── Agência: fundo escuro chapado, título grosso na cor da marca, objeto 3D de vidro, rodapé em pílulas ─────────
  'agencia-capa'(d, ctx) { return agencia(d, ctx, 'capa'); },
  'agencia-objeto'(d, ctx) { return agencia(d, ctx, 'objeto'); },
  'agencia-cta'(d, ctx) { return agencia(d, ctx, 'cta'); },
  'agencia-texto'(d, ctx) { return agencia(d, ctx, 'texto'); },
  'agencia-cards'(d, ctx) { return agencia(d, ctx, 'cards'); },
  'agencia-lista'(d, ctx) { return agencia(d, ctx, 'lista'); },
  'post-card'(d, ctx) {
    const { W, H, mx, T } = ctx, foto = genOuAsset(d.foto), azul = mistura(ctx.accent, '#000000', .78), s = base(ctx, azul, { grain: .2, vignette: 0 });
    if (foto) { s.bg = { ...srcDe(foto, x => `${x}, photojournalism, realistic news photograph, natural light, no text, no watermark`), color: azul, pos: 'topo' }; s.shade = .62; s.shade_dir = 'full'; }
    else s.fx.glows = d.x ? [{ x: .5, y: .3, r: .85, color: ctx.accent, opacity: .6 }, { x: .05, y: .05, r: .6, color: ctx.accent, opacity: .35 }, { x: .95, y: .65, r: .6, color: ctx.accent, opacity: .3 }] : [{ x: .5, y: .35, r: .8, color: ctx.accent, opacity: .3 }];
    if (d.x) return postX(d, ctx, s);   // contracapa de notícia: cartão idêntico a um post do X
    const nome = String(d.nome || ctx.marca || '').trim(), cardW = W - mx * 2, pad = Math.round(W * .05), av = Math.round(W * .105), ink = '#0a0a0c';
    const f = { ...T.txt, w: 500, lh: 1.32, upper: false }, ti = quebraTexto(String(d.titulo || ''), f, cardW - pad * 2, H * .36, W * .05, W * .032);
    const hTxt = ti.linhas.length * f.lh * ti.size, hCard = pad + av + Math.round(W * .035) + hTxt + pad, cx = W / 2, yBot = ctx.storiesH ? H * .8 : H * .9, yTop = yBot - hCard, left = mx + pad;
    s.shapes.push({ kind: 'rect', x: F2(cx / W), y: F2((yTop + hCard / 2) / H), w: F2(cardW / W), h: F2(hCard / H), radius: .1, color: '#ffffff' });
    const ay = yTop + pad + av / 2, quad = ctx.logo && ctx.logoRatio > .7 && ctx.logoRatio < 1.4;
    if (quad) s.items.push({ asset: ctx.logo, x: F2((left + av / 2) / W), y: F2(ay / H), size: av, round: true, moldura: true });
    else { s.shapes.push({ kind: 'circle', x: F2((left + av / 2) / W), y: F2(ay / H), w: F2(av / W), h: F2(av / H), color: ctx.accent }); const ini = (nome.match(/[A-Za-zÀ-ÿ0-9]/) || ['N'])[0].toUpperCase(); s.texts.push({ role: 'badge', value: ini, x: F2((left + av / 2) / W), y: F2(ay / H), align: 'center', size: Math.round(av * .5), font: fontKey(T.txtB, ctx), weight: 800, color: sobre(ctx.accent), nowrap: true, shadow: false }); }
    const fn = { ...T.txtB, w: 800 }, nz = Math.round(W * .038), nx = left + av + W * .025;
    s.texts.push({ role: 'body', value: nome, x: F2(nx / W), y: F2(ay / H), align: 'left', size: nz, font: fontKey(fn, ctx), weight: 800, color: ink, nowrap: true, shadow: false });
    const vz = Math.round(nz * .95); s.shapes.push({ kind: 'circle', x: F2((nx + largura(nome, fn, nz) + W * .012 + vz / 2) / W), y: F2(ay / H), w: F2(vz / W), h: F2(vz / H), color: '#1d9bf0', icon: 'check', icon_color: '#ffffff' });
    s.texts.push(texto(ctx, f, ti.linhas, ti.size, { x: left, yTop: yTop + pad + av + Math.round(W * .035), align: 'left', role: 'body', color: ink, extra: { hl: ink, hw: 800 } }).t);
    return s;
  },
  cta(d, ctx) {
    const { W, H, T } = ctx, s = base(ctx, ctx.paper), mol = moldura(ctx, d, ctx.paper, { semArraste: true });
    const f = { ...T.txtM, upper: false }, ti = ajusta(d.titulo || '', f, W * .78, H * .3, { maxSize: W * .072, maxLinhas: 4 }), B = [], obj = genOuAsset(d.objeto);
    if (obj) { const size = Math.round(W * .42); B.push({ h: size * .92, gap: 0, make: y => (s.items.push({ ...srcDe(obj, x => promptObjeto(ctx, x)), x: .5, y: F2((y + size * .46) / H), size, shadow: 2, hero: true }), []) }); }
    B.push({ h: ti.linhas.length * f.lh * ti.size, gap: obj ? H * .03 : 0, make: y => texto(ctx, f, ti.linhas, ti.size, { x: W / 2, yTop: y, align: 'center', color: ctx.ink, extra: { hl: ctx.accent, weight: 500 } }).t });
    if (d.cta) { const fb = { ...T.txtB, upper: T.btn.upper, caixa: T.btn.caixa, ls: .08 }, sz = ctaSz(d.cta, fb, W * .72, W * .03); B.push({ h: botaoH(sz), gap: H * .05, make: y => ({ role: 'cta', value: d.cta, x: .5, y: F2((y + botaoH(sz) / 2) / H), align: 'center', size: Math.round(sz), font: fontKey(fb, ctx), weight: 700, ls: .08, upper: fb.upper || undefined, caixa: cxSai(fb), bg: ctx.accent, color: sobre(ctx.accent), shape: 'pill', glow: d.brilho === true ? ctx.accent : undefined, nowrap: true, shadow: false }) }); }
    const ct = contatos(ctx, ctx.paper, mol.base, { x: W / 2, align: 'center' });
    s.texts.push(...pilha(B, (mol.topo + (ct ? mol.base - ct.h - H * .04 : mol.base)) / 2, ctx).itens);
    if (ct) { ct.t.icon = undefined; ct.t.icon_bg = undefined; s.texts.push(ct.t); }
    if (d.icone) s.shapes.push(ladrilho(ctx, d.icone, .86, .14, .17, { rot: 14 }));
    s.fx.glows = [{ x: .5, y: .55, r: .55, color: ctx.accent, opacity: .18 }];
    s.texts.push(...mol.texts); s.items.push(...mol.items); s.shapes.push(...mol.shapes); return s;
  }
};

// contexto padrão a partir das cores da peça; o servidor completa com a Identidade da marca (fontes, logo, contatos, moldura)
export function contexto(c = {}) {
  const W = c.W || 1080, H = c.H || 1350, paper = c.paper || '#0b0b0f', accent = c.accent || '#f59e0b';
  const escuro = lum(paper) < .4;
  const ctx = { W, H, accent, paper: escuro ? paper : '#0b0b0f', ink: c.ink && lum(c.ink) > .5 ? c.ink : '#ffffff', inkEscura: c.inkEscura || '#0a0a0c', claro: c.claro || (escuro ? '#eceae5' : paper), mx: Math.round(W * (c.margem || .08)), i: c.i || 0, total: c.total || 1, logo: c.logo, avatar: c.avatar, logoEscura: c.logoEscura, logoRatio: c.logoRatio || .2, contatos: c.contatos || {}, molde: c.molde || {}, marca: c.marca || '', bancoTex: c.bancoTex || [], texturas: c.texturas || [], texEstilo: c.texEstilo || '', ftit: c.ftit, ftxt: c.ftxt, fTit: c.fTit, fTxt: c.fTxt, fonteMarca: !!c.fonteMarca, fonteMarcaK: c.fonteMarcaK, caixa: c.caixa || {} };
  if (H / W > 1.6) ctx.storiesH = true;
  ctx.T = tipografia(ctx);
  return ctx;
}
// compõe uma página: devolve a página pronta (textos, imagens, formas, efeitos) guardando o modelo e os dados para refazer depois
// texto com itens numerados ("1. Para quem? ... 2. Qual problema? ...") não é parágrafo: vira lista de verdade, com título em negrito e explicação
export function itensNumerados(txt) {
  const partes = String(txt || '').split(/\|\||\||\n/).map(x => x.trim()).filter(Boolean);
  if (partes.length < 2) return null;
  const itens = [];
  for (const p of partes) {
    const m = p.match(/^(\d{1,2})\s*[.)\-–:]\s+(.+)$/); if (!m) return null;
    const r = m[2].trim(), q = r.search(/[?:]\s|\.\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/);
    if (q > 3 && q < r.length - 2) { const fim = r[q] === '.' ? q : q + (r[q] === '?' ? 1 : 0); itens.push({ t: r.slice(0, fim).replace(/[:.]$/, '').trim(), d: r.slice(q + (r[q] === '?' ? 1 : 1)).replace(/^[\s:.]+/, '').trim() }); }
    else itens.push({ t: r.replace(/[.]$/, ''), d: '' });
  }
  return itens.length >= 2 && itens.length <= 4 ? itens : null;
}
export function comporSlide(slide, ctxBase) {
  let id = slide?.modelo; const d = { ...(slide?.dados || {}) };
  if (id === 'texto' && !d.foto && !d.objeto) { const it = itensNumerados(d.texto); if (it) { id = 'lista'; d.itens = it; delete d.texto; if (!d.fundo) d.fundo = 'escuro'; } }
  const fn = COMPOR[id]; if (!fn) return null;
  // copy escrita TODA em maiúsculas (título, apoio, texto) vira frase normal, a não ser que a marca tenha pedido caixa alta; título gritado em tudo é ilegível e parece erro
  { const altoMarca = (ctxBase?.T?.tit?.caixa || ctxBase?.caixa?.titulo) === 'alta' || d.caixa_titulo === 'alta', gritado = v => { const t = String(v || '').replace(/\[i:[a-z-]+\]|[*|]/g, ''); return t.length > 14 && /\p{Lu}/u.test(t) && !/\p{Ll}/u.test(t); };
    if (!altoMarca) for (const k of ['titulo', 'texto', 'apoio']) if (gritado(d[k])) d[k] = aplicaCaixa(d[k], 'frase'); }
  for (const k of ['kicker', 'titulo', 'apoio', 'cta', 'texto', 'numero', 'fantasma', 'selo', 'legenda', 'nome', 'frase', 'handle']) if (d[k] != null) d[k] = String(d[k]).replace(/[<>]/g, '').replace(/[ \t]+([?!:;,.…])/g, '$1').replace(/[ \t]{2,}/g, ' ').trim().slice(0, 400);   // "pronto ?" vira "pronto?"; espaço duplo some
  // hierarquia: só UMA coisa em destaque. Título inteiro marcado vira branco (o destaque passa para a chamada pequena)
  if (d.titulo) { const t = String(d.titulo).trim(), m = t.match(/^\*([^*]+)\*$/); if (m) d.titulo = m[1]; else { const n = (t.match(/\*[^*]+\*/g) || []); if (n.length > 1) { let k = 0; d.titulo = t.replace(/\*([^*]+)\*/g, (x, y) => k++ ? y : x); } } }
  let ctx = ctxBase.T ? ctxBase : contexto(ctxBase);
  // capas (herói, faixas, revista) foram desenhadas sobre fundo escuro: numa marca de papel claro, a capa usa um fundo escuro da cor da marca (com tinta branca) em vez de ficar cinza e borrada
  if (['heroi', 'capa-faixa', 'revista'].includes(id) && lum(ctx.paper) > .55) ctx = { ...ctx, paper: mistura(ctx.accent, '#000000', .9), ink: '#ffffff' };
  // o Designer (ou o dono, num ajuste) pode escolher a caixa dos textos desta página: vale mais que a regra da marca
  { const T = { ...ctx.T }; let mudou = false;
    for (const [k, tk] of [['caixa_titulo', 'tit'], ['caixa_rotulo', 'lab'], ['caixa_botao', 'btn']]) { const v = d[k]; if (CX_OK.includes(v)) { T[tk] = { ...T[tk], caixa: v, upper: v === 'alta' }; mudou = true; } }
    if (mudou) ctx = { ...ctx, T }; }
  // título com acento: entrelinha mínima para o acento não bater na linha de cima (vale para todos os modelos que usam o título da marca)
  if (ctx.T?.tit && ctx.T.tit.lh < 1.14 && /[áàâãäéèêëíìîïóòôõöúùûüç]/i.test(String(d.titulo || d.frase || ''))) ctx = { ...ctx, T: { ...ctx.T, tit: { ...ctx.T.tit, lh: 1.14 } } };
  let out = fn(d, ctx);
  return { ...out, modelo: slide.modelo, dados: slide.dados || {} };
}
// stories: aperta o conteúdo para a faixa segura (12% a 84% da altura), sem mexer em fundo e decoração
function zonaStories(s, ctx) {
  const ys = [...s.texts.filter(t => !t.decor), ...s.items.filter(i => !i.copia && !i.moldura)].map(t => t.y); if (!ys.length) return s;
  const lo = Math.min(...ys), hi = Math.max(...ys); if (lo >= .12 && hi <= .84) return s;
  const k = Math.min(1, .72 / Math.max(.01, hi - lo)), c0 = (lo + hi) / 2;
  for (const t of [...s.texts.filter(t => !t.decor), ...s.items.filter(i => !i.copia && !i.moldura)]) t.y = F2(.48 + (t.y - c0) * k);
  return s;
}
