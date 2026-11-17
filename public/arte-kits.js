// KITS DE CARROSSEL (treino do Designer, referências do dono de 17/11/2026)
// Cada kit replica o FUNDO e a composição de uma referência: papel, texturas, luz, objetos atravessando a emenda dos slides,
// elementos desenhados (grade, rabiscos, barra do Photoshop, papel rasgado...). O texto não vem da referência: vem do Roteirista,
// com a fonte da marca. A cor de destaque é a da marca (a do kit só vale na prévia, quando a marca não tem cor).
// Três páginas por kit: capa, miolo (repete) e fim. Os modelos são "kit-capa", "kit-texto" e "kit-fim"; o kit vai em dados.kit.

const F2 = v => Math.round(v * 10000) / 10000;

// ───────── catálogo ─────────
export const KITS = [
  { id: 'k01', nome: 'Mesa do designer (personagem e rabiscos)', accent: '#b8d42a', fTit: 'bebas', fTxt: 'poppins', desc: 'Capa escura com personagem dramático e luz da cor de destaque; miolo em papel quadriculado claro com barra de ferramentas do Photoshop, rabiscos à mão (coroa, !!!, $, #, sublinhado) e o personagem atravessando a emenda; páginas escuras intercaladas.' },
  { id: 'k02', nome: 'Xadrez em preto e bege (faixas e rodapé de agência)', accent: '#f0b429', fTit: 'anton', fTxt: 'outfit', desc: 'Capa de foto escura com título em faixas brancas e palavra gigante na cor de destaque; miolo bege com forma gigante clara ao fundo e peça de xadrez 3D sangrando entre os slides; fim escuro com prédios e formas geométricas; rodapé de agência em todas.' },
  { id: 'k03', nome: 'Mármore e verde (moldura arredondada)', accent: '#22c55e', fTit: 'montserrat', fTxt: 'poppins', desc: 'Capa escura com moldura arredondada e busto de mármore; miolo em papel cinza claro com ícone na cor de destaque, busto e cavalo de xadrez na emenda e dinheiro na base; hashtags verticais nas bordas; fim escuro com selo circular girando.' },
  { id: 'k04', nome: 'Narrativo escuro com palavra gigante', accent: '#1fd65f', fTit: 'poppins', fTxt: 'poppins', desc: 'Fundo preto esverdeado chapado, palavras gigantes em verde escuro atravessando os slides (horizontal e vertical), ladrilhos da marca desfocados; logo pequeno no topo e “Arraste para o lado” fixo embaixo.' },
  { id: 'k05', nome: 'Claro com marca d’água e palavra vertical', accent: '#d946a8', fTit: 'poppins', fTxt: 'poppins', desc: 'Fundo branco limpo com marca d’água circular na cor de destaque bem clara e palavras gigantes verticais; capa com foto em moldura arredondada; perfil com verificado no topo.' },
  { id: 'k06', nome: 'Objeto-símbolo (branco e roxo)', accent: '#c026d3', fTit: 'montserrat', fTxt: 'poppins', desc: 'Páginas alternando branco texturizado e roxo profundo com linhas de luz; o mesmo objeto-símbolo no centro de todas, mudando de contexto (pedestal, vitrine); título em caixa alta pesada com apoio em serifa itálica.' },
  { id: 'k07', nome: 'Mascote e magenta (dica com exemplos)', accent: '#d91fd9', fTit: 'montserrat', fTxt: 'poppins', desc: 'Capa clara com mascote grande no canto e marcas de seleção do Photoshop; miolo alternando roxo escuro (palavra gigante apagada) e branco; botão “Arraste” e selo final na cor de destaque.' },
  { id: 'k08', nome: 'Tutorial petróleo com prints', accent: '#2fa8ff', fTit: 'poppins', fTxt: 'poppins', desc: 'Fundo azul-petróleo escuro com luz suave, logo centralizado no topo, cartão arredondado para print de tela e o nome da marca gigante vazado atravessando o rodapé de todos os slides.' },
  { id: 'k09', nome: 'Bege e preto com peça de xadrez', accent: '#f5b301', fTit: 'montserrat', fTxt: 'poppins', desc: 'Capa de foto escura com título em caixa alta e destaque amarelo; miolo alternando bege e preto com uma forma gigante apagada ao fundo e a peça de xadrez entrando pela emenda.' },
  { id: 'k10', nome: 'Preto e dourado com fumaça', accent: '#f5c518', fTit: 'montserrat', fTxt: 'poppins', desc: 'Fundo preto com fumaça branca, rei de xadrez dourado e notas de dinheiro atravessando a base; números e títulos grandes; fim com o rei e o @ em destaque.' },
  { id: 'k11', nome: 'Fogo (dinheiro queimando)', accent: '#e11d2e', fTit: 'anton', fTxt: 'outfit', desc: 'Capa com fogo real e nota queimando; título em faixas brancas com palavra gigante vermelha num bloco preto; miolo preto com fumaça e nota queimando na emenda; fim escuro; rodapé de agência.' },
  { id: 'k12', nome: 'Espaço ciano', accent: '#22d3ee', fTit: 'bebas', fTxt: 'poppins', desc: 'Céu estrelado azul-petróleo granulado com astronauta na capa; caneta digital e computador retrô 3D atravessando as emendas; selo-pílula no topo, títulos condensados ciano com seta circular e rodapé em cartões com contorno.' },
  { id: 'k13', nome: 'Colagem pop (papel rasgado)', accent: '#39ff14', fTit: 'bebas', fTxt: 'poppins', desc: 'Fundos magenta, roxo e branco com bordas de papel rasgado; recortes de foto em preto e branco, objetos 3D brancos (megafone, foguete, alvo), “X” verde-neon, tipografia condensada gigante e selo circular girando.' },
  { id: 'k14', nome: 'Retrô P&B em fundo branco', accent: '#e8178a', fTit: 'oswald', fTxt: 'poppins', desc: 'Fundo branco com personagens vintage em preto e branco atravessando as emendas, galhos secos na base, pílula de perfil e barra de “arraste” no topo; dois destaques (magenta e turquesa), mãozinha apontando e check duplo.' }
];
export const KIT_IDS = KITS.map(k => k.id);
const kitDe = id => KITS.find(k => k.id === id) || KITS[0];

// ───────── utilidades de desenho ─────────
const lumH = h => { h = String(h || '#000').replace('#', ''); const n = parseInt(h.slice(0, 6), 16) || 0; const v = [n >> 16 & 255, n >> 8 & 255, n & 255].map(c => c / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
const escuro = c => lumH(c) < .4;
const pagina = (cor, fx = {}) => ({ bg: { color: cor }, shade: 0, pager: false, fx: { grain: .12, ...fx }, texts: [], items: [], shapes: [] });
// divide o título em parte normal e destaque (*palavra*); sem marcação, a última palavra é o destaque
function partes(t) {
  t = String(t || '').trim(); const m = t.match(/^(.*?)\*([^*]+)\*(.*)$/);
  if (m) return { antes: (m[1] + ' ' + m[3]).replace(/\s+/g, ' ').trim(), dest: m[2].trim(), depois: m[3].trim() };
  const p = t.split(/\s+/); if (p.length < 2) return { antes: '', dest: t, depois: '' };
  return { antes: p.slice(0, -1).join(' '), dest: p[p.length - 1], depois: '' };
}
const semMarca = t => String(t || '').replace(/\*/g, '');
// objeto gerado por IA (recortado), ou arquivo/mascote da marca quando o roteiro mandar
function obj(H, desc, x, y, size, extra = {}) {
  const g = H.genOuAsset(desc); if (!g) return null;
  const src = g.gen ? { gen: g.gen } : g.banco ? { banco: g.banco } : g.pose ? { asset: g.asset, pose: g.pose } : { asset: g.asset };
  return { ...src, x: F2(x), y: F2(y), size: Math.round(size), hero: true, ...extra };
}
// palavra gigante decorativa que atravessa os slides: cada página mostra o pedaço que cai nela
function palavraGigante(ctx, s, palavra, { inicio = 0, y = .5, size = 1.1, cor, op = .1, rot = 0, outline = false, font } = {}) {
  const { W, i } = ctx, sz = Math.round(W * size), x = inicio - i;   // a palavra começa na página "inicio" (fração da largura) e segue para a direita
  if (x > 1 || x < -4) return;
  s.texts.push({ role: 'number', value: palavra, x: F2(x), y: F2(y), align: 'left', w: 4, size: sz, font, weight: 900, ls: -.02, lh: .85, color: outline ? undefined : cor, outline: outline || undefined, stroke: outline ? cor : undefined, stroke_w: outline ? Math.max(2, Math.round(sz * .006)) : undefined, opacity: op, rot: rot || undefined, upper: true, caixa: 'alta', shadow: false, decor: true });
}
const tinta = papel => escuro(papel) ? '#ffffff' : '#121212';
const cinza = papel => escuro(papel) ? '#ffffffb8' : '#3a3a3a';
// barra de ferramentas do Photoshop (coluna escura com ícones)
function barraPS(s, x, y, escala = 1, cor = '#2a2a2a') {
  const icons = ['move', 'scan', 'crop', 'paintbrush', 'pen-tool', 'type', 'wand', 'hand', 'search'], h = .36 * escala, w = .052 * escala;
  s.shapes.push({ kind: 'rect', x, y, w, h, radius: .12, color: cor, opacity: .96 });
  icons.forEach((ic, q) => s.shapes.push({ kind: 'icon', icon: ic, icon_color: '#d6d6d6', x, y: F2(y - h / 2 + h * (q + .7) / (icons.length + .4)), w: F2(w * .5), h: F2(w * .5 * .8) }));
}
// rabisco à mão: glifo em fonte de marcador
const rabisco = (s, v, x, y, size, cor, rot = 0, font = 'marker', op = 1) => s.texts.push({ role: 'number', value: v, x: F2(x), y: F2(y), align: 'center', w: 1, size: Math.round(size), font, weight: 400, ls: 0, lh: 1, color: cor, rot: rot || undefined, opacity: op, shadow: false, decor: true });
// borda de papel rasgado (forma com recorte serrilhado)
function rasgado(seed, lado = 'dir', amp = 2.4) {
  let r = seed * 9301 + 49297; const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  const P = [], n = 26;
  if (lado === 'dir') { P.push('0% 0%'); for (let k = 0; k <= n; k++) P.push(`${(100 - amp * 2 + rnd() * amp * 2).toFixed(1)}% ${(k * 100 / n).toFixed(1)}%`); P.push('0% 100%'); }
  else { P.push('100% 0%'); for (let k = 0; k <= n; k++) P.push(`${(rnd() * amp * 2).toFixed(1)}% ${(k * 100 / n).toFixed(1)}%`); P.push('100% 100%'); }
  return `polygon(${P.join(',')})`;
}
// rodapé de agência (logo à esquerda, pílulas com redes e telefone, slogan)
function rodapeAgencia(ctx, s, papel, { y = .79, slogan = true, cards = false } = {}) {
  const { W } = ctx, c = ctx.contatos || {}, t = tinta(papel), fz = Math.round(W * .016);
  if (ctx.logo) s.items.push({ asset: escuro(papel) ? ctx.logo : (ctx.logoEscura || ctx.logo), x: .2, y: F2(y + .005), size: Math.round(W * .2), moldura: true });
  else s.texts.push({ role: 'label', value: ctx.marca || 'SUA LOGO', x: .1, y: F2(y + .005), align: 'left', size: Math.round(W * .032), weight: 800, ls: 0, color: t, upper: true, caixa: 'alta', nowrap: true, shadow: false });
  const pil = (x, w, txt, icon) => {
    if (cards) s.shapes.push({ kind: 'rect', x: F2(x), y: F2(y), w, h: .045, radius: .25, color: '#00000000', stroke: escuro(papel) ? '#ffffff73' : '#00000059', stroke_w: .0014 });
    else s.shapes.push({ kind: 'rect', x: F2(x), y: F2(y - .012), w, h: .026, radius: .2, color: escuro(papel) ? '#1e1e1e' : '#111111' });
    s.texts.push({ role: 'footer', value: txt, x: F2(x), y: F2(cards ? y : y - .012), align: 'center', size: fz, weight: 600, color: cards || escuro(papel) ? t : '#ffffff', icon, nowrap: true, shadow: false });
  };
  pil(.47, .24, (c.instagram || '@suamarca') + ' • ' + (c.site || 'suamarca.com'), 'instagram');
  pil(.72, .16, c.whatsapp || '(00) 0000-0000', 'telefone');
  if (slogan && !cards) s.texts.push({ role: 'footer', value: ctx.slogan || 'Seu slogan *aqui*', x: .35, y: F2(y + .022), align: 'left', size: Math.round(W * .02), weight: 400, color: t, nowrap: true, shadow: false });
}
// cabeçalho de perfil (avatar + nome + verificado) no topo
function perfilTopo(ctx, s, papel, { x = .045, y = .06, cor } = {}) {
  const { W } = ctx, t = cor || tinta(papel), av = Math.round(W * .045);
  s.items.push({ asset: ctx.avatar || ctx.logo || 'avatar-padrao', x: F2(x + av / W / 2), y, size: av, round: true, moldura: true });
  s.texts.push({ role: 'footer', value: ctx.marca || 'Sua marca', x: F2(x + av / W + .012), y, align: 'left', size: Math.round(W * .019), weight: 700, color: t, nowrap: true, shadow: false });
  const nx = x + av / W + .02 + String(ctx.marca || 'Sua marca').length * .0105;
  s.shapes.push({ kind: 'circle', x: F2(nx), y, w: .02, color: '#1d9bf0', icon: 'check', icon_color: '#ffffff' });
}
// "Arraste para o lado" discreto
const arrasteTexto = (ctx, s, papel, { x = .5, y = .93, cor } = {}) => { if (ctx.i >= ctx.total - 1) return; s.texts.push({ role: 'footer', value: 'Arraste para o lado', x, y, align: 'center', size: Math.round(ctx.W * .02), weight: 600, color: cor || tinta(papel), icon: 'chevron-right', icon_end: true, nowrap: true, shadow: false }); };

// ───────── blocos de texto (fonte da marca) ─────────
function bloco(ctx, H, s, itens, { x, w, topo, centro, base, align = 'left' }) {
  const { W, H: Hh, T } = ctx, X = align === 'center' ? x * W : align === 'right' ? x * W : x * W, cw = w * W, B = [];
  for (const b of itens) {
    if (!b || (b.v == null || b.v === '') && !b.forma) continue;
    const f = b.f === 'txt' ? T.txt : b.f === 'txtB' ? T.txtB : b.f === 'lab' ? T.lab : { ...T.tit, ...(b.fw ? { w: b.fw } : {}) };
    const fx = { ...f, ...(b.k ? { k: b.k } : {}), ...(b.caixa ? { caixa: b.caixa, upper: b.caixa === 'alta' } : {}), ...(b.lh ? { lh: b.lh } : {}) };
    if (b.f === 'txt' || b.f === 'txtB') {
      const r = H.quebraTexto(b.v, fx, cw * (b.wf || 1), Hh * (b.maxH || .3), W * (b.max || .034), W * (b.min || .024));
      B.push({ h: r.linhas.length * fx.lh * r.size, gap: Hh * (b.gap ?? .02), make: y => H.texto(ctx, fx, r.linhas, r.size, { x: X, yTop: y, align, role: 'body', color: b.cor, extra: { hl: b.hl || ctx.accent, ...(b.extra || {}) } }).t });
    } else {
      const r = H.ajusta(b.v, fx, cw * (b.wf || 1), Hh * (b.maxH || .2), { maxSize: W * (b.max || .1), minSize: W * (b.min || .03), maxLinhas: b.linhas || 3 });
      B.push({ h: r.linhas.length * (fx.lh || 1) * r.size, gap: Hh * (b.gap ?? .015), make: y => H.texto(ctx, fx, r.linhas, r.size, { x: X, yTop: y, align, role: b.role || 'title', color: b.cor, extra: { hl: b.hl || ctx.accent, ...(b.extra || {}) } }).t });
    }
  }
  const tot = B.reduce((a, b, k) => a + b.h + (k ? b.gap : 0), 0);
  let y = topo != null ? topo * Hh : base != null ? base * Hh - tot : (centro ?? .5) * Hh - tot / 2;
  const y0 = y; B.forEach((b, k) => { if (k) y += b.gap; s.texts.push(...[].concat(b.make(y))); y += b.h; });
  return { y0: y0 / Hh, y1: y / Hh };
}
// botão "arraste" (pílula + círculo com seta)
function botaoArraste(ctx, s, { x, y, bg, cor, txt = 'Arrasta para o lado', contorno = false, align = 'left', size = .026 }) {
  s.texts.push({ role: 'cta', value: txt, x, y, align, size: Math.round(ctx.W * size), weight: 700, bg: contorno ? '#00000000' : bg, color: cor, shape: contorno ? 'outline' : 'pill', arrow: 'arrow-right', arrow_bg: contorno ? '#00000000' : bg, arrow_color: cor, upper: true, caixa: 'alta', nowrap: true, shadow: false, seta: false });
}


// ───────── ARTE REAL DA REFERÊNCIA (versão 2, pedido do dono: "copie exatamente igual") ─────────
// Cada slide da referência virou uma placa sem texto (public/kits/kNN-M.jpg). A capa usa a placa 1, o fim a última e o miolo
// gira pelas do meio, na ordem da referência (os objetos que atravessam a emenda continuam certos). O texto entra onde ficava
// na referência: [x, largura, y, âncora (topo|centro|base), alinhamento, fundo (c = claro, e = escuro)].
const Z = (x, w, y, an = 'topo', al = 'left', t = 'e') => ({ x, w, y, an, al, t });
export const PLACAS = {
  k01: { n: 6, capa: 'impacto', z: { 1: Z(.5, .86, .9, 'base', 'center'), 2: Z(.04, .34, .55, 'topo', 'left', 'c'), 3: Z(.04, .3, .6, 'topo', 'left', 'c'), 4: Z(.44, .52, .07, 'topo', 'left'), 5: Z(.06, .56, .1, 'topo', 'left', 'c'), 6: Z(.06, .55, .08, 'topo', 'left', 'c') } },
  k02: { n: 3, capa: 'faixas', z: { 1: Z(.48, .62, .45, 'centro', 'center'), 2: Z(.3, .5, .2, 'topo', 'left', 'c'), 3: Z(.5, .8, .4, 'centro', 'center') } },
  k03: { n: 5, capa: 'impacto', z: { 1: Z(.5, .72, .72, 'topo', 'center'), 2: Z(.28, .5, .14, 'topo', 'left', 'c'), 3: Z(.36, .5, .14, 'topo', 'left', 'c'), 4: Z(.3, .52, .14, 'topo', 'left', 'c'), 5: Z(.5, .6, .66, 'topo', 'center') } },
  k04: { n: 10, capa: 'texto', z: { fim: Z(.5, .76, .45, 'centro', 'center'), meio: Z(.1, .76, .4, 'centro', 'left') } },
  k05: { n: 8, capa: 'impacto', z: { 1: Z(.5, .8, .74, 'topo', 'center', 'c'), fim: Z(.5, .8, .45, 'centro', 'center', 'c'), meio: Z(.13, .74, .17, 'topo', 'left', 'c') } },
  k06: { n: 9, capa: 'serifa', temac: 'cecceccec', z: { fim: Z(.5, .8, .72, 'topo', 'center', 'c'), meio: Z(.5, .86, .08, 'topo', 'center') } },
  k07: { n: 4, capa: 'italico', temas: 'cece', z: { 1: Z(.5, .88, .08, 'topo', 'center', 'c'), meio: Z(.08, .84, .45, 'centro', 'left'), fim: Z(.08, .84, .42, 'centro', 'left') } },
  k08: { n: 8, capa: 'texto', z: { fim: Z(.5, .8, .45, 'centro', 'center'), meio: Z(.1, .8, .18, 'topo', 'left') } },
  k09: { n: 9, capa: 'faixas', temas: 'ececececE', z: { 1: Z(.07, .72, .84, 'base', 'left'), fim: Z(.5, .8, .62, 'centro', 'center'), meio: Z(.1, .72, .16, 'topo', 'left') } },
  k10: { n: 8, capa: 'impacto', z: { 1: Z(.5, .84, .6, 'topo', 'center'), 3: Z(.5, .8, .1, 'topo', 'center'), fim: Z(.5, .8, .64, 'topo', 'center'), meio: Z(.1, .76, .16, 'topo', 'left') } },
  k11: { n: 3, capa: 'faixas', z: { 1: Z(.34, .6, .44, 'centro', 'center'), 2: Z(.3, .5, .2, 'topo', 'left'), 3: Z(.5, .8, .4, 'centro', 'center') } },
  k12: { n: 5, capa: 'monitor', z: { 1: Z(.36, .4, .42, 'centro', 'center', 'c'), fim: Z(.5, .7, .36, 'centro', 'center'), meio: Z(.12, .6, .24, 'topo', 'left') } },
  k13: { n: 6, capa: 'impacto', z: { 1: Z(.08, .6, .88, 'base', 'left'), 2: Z(.06, .4, .08, 'topo', 'left', 'c'), 3: Z(.6, .36, .2, 'topo', 'left'), 4: Z(.06, .5, .1, 'topo', 'left'), 5: Z(.62, .34, .1, 'topo', 'left'), 6: Z(.08, .5, .2, 'topo', 'left', 'c') } },
  k14: { n: 5, capa: 'serifa', z: { 1: Z(.08, .5, .3, 'topo', 'left', 'c'), 5: Z(.55, .4, .3, 'topo', 'left', 'c'), meio: Z(.05, .58, .22, 'topo', 'left', 'c') } }
};
function comporPlaca(papel, d, ctx, H) {
  const P = PLACAS[d.kit], A = ctx.accent, { i, total, W } = ctx;
  const m = P.n - 2, num = papel === 'capa' ? 1 : papel === 'fim' ? P.n : 2 + ((i - 1) % Math.max(1, m)), placa = `${d.kit}-${num}`;
  const z = P.z[num] || (papel === 'fim' ? P.z.fim : null) || P.z.meio || Z(.1, .76, .16);
  const t = P.temas ? (P.temas[num - 1] || 'e').toLowerCase() : z.t, claro = t === 'c';
  const tc = claro ? '#111111' : '#ffffff', sub = claro ? '#2b2b2b' : '#ffffffd9';
  const s = { bg: { placa, color: claro ? '#ffffff' : '#000000' }, shade: 0, pager: false, fx: {}, texts: [], items: [], shapes: [] };
  const box = { x: z.x, w: z.w, align: z.al, ...(z.an === 'base' ? { base: z.y } : z.an === 'centro' ? { centro: z.y } : { topo: z.y }) };
  const pt = partes(d.titulo);
  if (papel === 'capa') {
    const est = P.capa;
    if (est === 'faixas') bloco(ctx, H, s, [{ v: pt.antes, f: 'tit', fw: 400, k: ctx.T.txt.k, cor: '#111111', max: .07, maxH: .14, linhas: 2, extra: { band: '#ffffff' } }, { v: pt.dest, cor: A, max: .2, maxH: .17, linhas: 1, caixa: 'alta', gap: 0 }, { v: d.texto, f: 'txt', cor: tc, max: .03, gap: .03 }], box);
    else if (est === 'serifa') bloco(ctx, H, s, [{ v: pt.antes || pt.dest, cor: claro ? '#111111' : '#ffffff', max: .085, maxH: .2, linhas: 3, caixa: 'alta' }, { v: pt.antes ? pt.dest : '', f: 'tit', k: 'playfair', fw: 400, cor: A, max: .07, linhas: 2, gap: 0, caixa: 'normal', extra: { italic: true } }, { v: d.texto, f: 'txt', cor: sub, max: .03, gap: .03 }], box);
    else if (est === 'italico') bloco(ctx, H, s, [{ v: semMarca(d.titulo), cor: A, max: .09, maxH: .2, linhas: 2, caixa: 'alta', extra: { italic: true } }], box);
    else if (est === 'monitor') bloco(ctx, H, s, [{ v: pt.antes, cor: '#111111', max: .05, linhas: 2, caixa: 'alta' }, { v: pt.dest, cor: '#111111', max: .15, maxH: .14, linhas: 1, caixa: 'alta', gap: 0 }], box);
    else if (est === 'texto') bloco(ctx, H, s, [{ v: d.titulo, f: 'txtB', cor: tc, max: .045, maxH: .25, hl: A }, { v: d.texto, f: 'txt', cor: tc, max: .034, maxH: .3, gap: .03 }], box);
    else bloco(ctx, H, s, [{ v: pt.antes, cor: tc, max: .085, maxH: .14, linhas: 2, caixa: 'alta' }, { v: pt.dest, cor: A, max: .2, maxH: .17, linhas: 1, caixa: 'alta', gap: 0 }, { v: d.texto, f: 'txt', cor: sub, max: .03, gap: .03 }], box);
  } else if (papel === 'fim') {
    bloco(ctx, H, s, [{ v: d.titulo || 'Gostou do *conteúdo*?', cor: tc, max: .085, maxH: .22, linhas: 3 }, { v: d.texto, f: 'txt', cor: sub, max: .034, gap: .02 }, { v: d.cta || (ctx.contatos?.instagram ? 'Siga ' + ctx.contatos.instagram : ''), f: 'txtB', cor: A, max: .045, gap: .03 }], box);
  } else {
    const tit = d.titulo ? (d.numero ? `${d.numero}. ` : '') + d.titulo : '';
    bloco(ctx, H, s, [{ v: tit, cor: tc, max: .06, maxH: .14, linhas: 3, hl: A }, { v: d.texto, f: 'txt', cor: sub, max: .032, min: .024, maxH: .4, gap: .025, hl: claro ? '#000000' : '#ffffff', extra: { hw: 700 } }], box);
  }
  return s;
}

// ───────── composição de cada kit (versão 1, desenhada por código) ─────────
const COMP = {
  // 1 · Mesa do designer
  k01(p, d, ctx, H) {
    const A = ctx.accent, { i } = ctx, papelClaro = '#e4e4e2', pr = p === 'capa' ? '#0c1206' : (p === 'texto' && i % 3 === 2) ? '#0b0b0b' : papelClaro, s = pagina(pr, { grain: .2 });
    const pers = d.objeto || d.foto || 'sinister charismatic villain businessman in a purple suit and green vest, dramatic pose, arms open';
    if (p === 'capa') {
      s.bg = { gen: d.ambiente || `dark moody studio with green smoke haze, dramatic ${A} light`, color: pr };
      s.items.push(obj(H, pers, .62, .5, ctx.W * 1.05, { pessoa: true, glow: undefined, shadow: 1 }));
      s.fx.fade = [{ dir: 'bottom', a: .95, ext: .5 }]; s.fx.glows = [{ x: .8, y: .1, r: .6, color: A, opacity: .35 }];
      barraPS(s, .1, .3, .9, '#1f1f1f');
      const t = partes(d.titulo);
      bloco(ctx, H, s, [{ v: t.antes, cor: '#ffffff', max: .085, maxH: .1, linhas: 1, caixa: 'alta' }, { v: t.dest, cor: A, max: .22, maxH: .16, linhas: 1, caixa: 'alta', gap: 0 }], { x: .5, w: .86, base: .87, align: 'center' });
      s.texts.push({ role: 'cta', value: d.cta || 'Saiba como evitar', x: .5, y: .915, align: 'center', size: Math.round(ctx.W * .022), weight: 700, bg: A, color: '#0a0a0a', shape: 'pill', icon: 'star', icon_end: true, upper: true, caixa: 'alta', nowrap: true, shadow: false });
      return s;
    }
    const claro = !escuro(pr);
    if (claro) { s.fx.textura = [{ tipo: 'quadriculado', cor: '#000000', op: 1 }]; }
    else { s.fx.glows = [{ x: .9, y: .2, r: .5, color: A, opacity: .18 }]; }
    barraPS(s, .965, .5, 1, '#2b2b2b');
    // personagem atravessando a emenda (só nas páginas pares do miolo)
    if (p === 'texto' && i % 2 === 1 && i < ctx.total - 1) s.items.push(obj(H, pers, 1, .55, ctx.W * .9, { pessoa: true, cruza: true, shadow: 1 }));
    const tc = tinta(pr);
    rabisco(s, '♛', .18, .16, ctx.W * .12, claro ? '#1a1a1a' : A, -10, 'marker', .85);
    rabisco(s, i % 2 ? '$' : '#', .82, .2, ctx.W * .22, A, 8, 'marker', .9);
    rabisco(s, '!!!', .2, .84, ctx.W * .14, A, -6, 'marker', .95);
    if (p === 'fim') {
      bloco(ctx, H, s, [{ v: d.titulo || 'Te ajudei de alguma forma?', cor: tc, max: .075, linhas: 2, caixa: 'alta' }], { x: .5, w: .8, topo: .12, align: 'center' });
      [['heart', 'Curta'], ['message-circle', 'Comenta'], ['send', 'Compartilhe'], ['bookmark', 'Salve']].forEach(([ic, l], q) => { const x = .2 + q * .2; s.shapes.push({ kind: 'icon', icon: ic, icon_color: tc, x, y: .36, w: .07, h: .056 }); rabisco(s, l, x, .42, ctx.W * .032, tc, 0, 'caveat'); });
      rabisco(s, '♛', .5, .6, ctx.W * .3, A, 0, 'marker', .9);
      return s;
    }
    const t = partes(d.titulo), num = d.numero || String(i).padStart(1, '0');
    const r = bloco(ctx, H, s, [{ v: `${num}. ${t.antes} *${t.dest}*`.replace(/\s+\*/, ' *'), cor: tc, max: .06, maxH: .1, linhas: 2, caixa: 'alta', hl: claro ? '#111111' : A, extra: claro ? { deco: 'sublinhado' } : {} }, { v: d.texto, f: 'txt', cor: cinza(pr), max: .03, min: .022, maxH: .4, gap: .025 }], { x: .1, w: .62, topo: .24 });
    rabisco(s, 'Arraste p/ lado →', .78, .93, ctx.W * .03, tc, -4, 'caveat', .8);
    return s;
  },
  // 2 · Xadrez em preto e bege
  k02(p, d, ctx, H) {
    const A = ctx.accent, { i } = ctx, pr = p === 'capa' ? '#0a0a0a' : p === 'fim' ? '#0c0c0c' : '#e9e5d9', s = pagina(pr, { grain: .15, vignette: p === 'texto' ? 0 : .4 });
    const peca = d.objeto || 'glossy black marble chess king piece, studio lighting';
    if (p === 'capa') {
      s.bg = { gen: d.ambiente || 'dark moody room with candles and a mysterious man sitting in shadow, cinematic', color: pr }; s.shade = .55;
      s.items.push(obj(H, peca, .93, .55, ctx.W * .6, { rot: -25, cruza: true, shadow: 2 }), obj(H, 'black marble chess pawn', .12, .32, ctx.W * .2, { blur: 3, rot: 15, shadow: 1 }));
      const t = partes(d.titulo);
      const r = bloco(ctx, H, s, [{ v: t.antes, f: 'tit', fw: 400, cor: '#111111', max: .07, maxH: .14, linhas: 2, k: ctx.T.txt.k, extra: { band: '#ffffff' } }, { v: t.dest, cor: A, max: .2, maxH: .16, linhas: 1, caixa: 'alta', gap: 0 }], { x: .48, w: .7, centro: .45, align: 'center' });
      botaoArraste(ctx, s, { x: .2, y: F2(r.y1 + .07), bg: A, cor: '#111111' });
      rodapeAgencia(ctx, s, pr); return s;
    }
    if (p === 'fim') {
      s.bg = { gen: d.ambiente || 'dark city skyscrapers at night in black and white, geometric shards, moody', color: pr }; s.shade = .7; s.shade_dir = 'full';
      bloco(ctx, H, s, [{ v: d.titulo || 'Gosta desse tipo de conteúdo?', cor: '#ffffff', max: .09, linhas: 2 }, { v: d.cta || 'Curta - Salve - Compartilhe', f: 'txtB', cor: '#ffffff', max: .034, gap: .03, caixa: 'alta' }], { x: .5, w: .8, centro: .42, align: 'center' });
      rodapeAgencia(ctx, s, pr); return s;
    }
    s.shapes.push({ kind: 'circle', x: .3, y: .45, w: 1.3, color: '#dcd7c8', opacity: .55 }, { kind: 'rect', x: .85, y: .7, w: .5, h: .5, radius: .3, color: '#dcd7c8', opacity: .5, rot: 20 });
    if (i < ctx.total - 1 && i % 2 === 1) s.items.push(obj(H, peca, 1.02, .72, ctx.W * .62, { cruza: true, shadow: 2 }));
    s.shapes.push({ kind: 'icon', icon: 'heart', icon_color: '#6b6b6b', x: .86, y: .07, w: .025, h: .02 }, { kind: 'icon', icon: 'send', icon_color: '#6b6b6b', x: .9, y: .07, w: .025, h: .02 }, { kind: 'icon', icon: 'bookmark', icon_color: '#6b6b6b', x: .94, y: .07, w: .025, h: .02 });
    const t = d.titulo ? `${d.numero ? d.numero + '. ' : ''}${semMarca(d.titulo)}` : '';
    bloco(ctx, H, s, [{ v: t, f: 'txtB', cor: '#111111', max: .042, maxH: .1, gap: 0 }, { v: d.texto, f: 'txt', cor: '#3a3a3a', max: .031, maxH: .3, gap: .015 }], { x: .3, w: .55, topo: .2 });
    rodapeAgencia(ctx, s, pr); return s;
  },
  // 3 · Mármore e verde
  k03(p, d, ctx, H) {
    const A = ctx.accent, { i } = ctx, pr = p === 'texto' ? '#e7e7e4' : '#111311', s = pagina(pr, { grain: .25, vignette: escuro(pr) ? .5 : 0 });
    const busto = d.objeto || 'white marble greek statue bust of a bearded man wearing sunglasses';
    const tags = (ctx.tags || ['#dicas', '#marketing', '#vendas']).join('   ');
    s.texts.push({ role: 'label', value: tags, x: .025, y: .5, align: 'center', w: 1, size: Math.round(ctx.W * .014), weight: 500, ls: .2, color: A, opacity: .7, rot: -90, nowrap: true, shadow: false, decor: true }, { role: 'label', value: tags, x: .975, y: .5, align: 'center', w: 1, size: Math.round(ctx.W * .014), weight: 500, ls: .2, color: A, opacity: .7, rot: 90, nowrap: true, shadow: false, decor: true });
    if (p === 'capa') {
      s.fx.glows = [{ x: .5, y: .3, r: .6, color: A, opacity: .12 }];
      s.shapes.push({ kind: 'rect', x: .5, y: .42, w: .78, h: .62, radius: .14, color: '#1b1e1b', stroke: '#e6e6e6', stroke_w: .006 });
      s.items.push(obj(H, busto, .5, .36, ctx.W * .62, { shadow: 2 }), obj(H, 'glossy 3D app icon tile, blue', .82, .8, ctx.W * .2, { blur: 2, rot: 12 }), obj(H, 'stack of dollar bills', .2, .9, ctx.W * .3, { blur: 1, rot: -8 }));
      const t = partes(d.titulo);
      const r = bloco(ctx, H, s, [{ v: t.antes, cor: '#ffffff', max: .085, linhas: 2, caixa: 'alta' }, { v: t.dest, f: 'txtB', cor: A, max: .06, linhas: 1, gap: 0 }], { x: .5, w: .7, topo: .66, align: 'center' });
      s.texts.push({ role: 'cta', value: 'Arraste para o lado', x: .5, y: F2(r.y1 + .05), align: 'center', size: Math.round(ctx.W * .018), weight: 600, bg: '#00000000', color: A, shape: 'outline', arrow: 'arrow-right', arrow_bg: '#00000000', arrow_color: A, upper: true, caixa: 'alta', nowrap: true, shadow: false, seta: false });
      return s;
    }
    if (p === 'fim') {
      s.fx.glows = [{ x: .5, y: .4, r: .5, color: A, opacity: .15 }];
      s.shapes.push({ kind: 'ring', x: .5, y: .34, w: .36, color: A, stroke_w: .003 }, { kind: 'icon', icon: 'rocket', icon_color: A, x: .5, y: .34, w: .16, h: .13 });
      s.texts.push({ role: 'label', value: d.kicker || 'Vamos decolar suas vendas', x: .5, y: .2, align: 'center', w: .5, size: Math.round(ctx.W * .026), weight: 800, ls: .05, color: '#ffffff', curva: 60, upper: true, caixa: 'alta', shadow: false }, { role: 'label', value: 'Vem com a gente', x: .5, y: .49, align: 'center', w: .5, size: Math.round(ctx.W * .024), weight: 800, ls: .05, color: '#ffffff', curva: -60, upper: true, caixa: 'alta', shadow: false });
      bloco(ctx, H, s, [{ v: d.titulo || 'Solicite um orçamento', f: 'txtB', cor: A, max: .032, caixa: 'alta' }, { v: (ctx.contatos?.whatsapp || '(00) 0000-0000'), f: 'txtB', cor: '#ffffff', max: .034, gap: .01 }], { x: .5, w: .7, topo: .66, align: 'center' });
      s.items.push(obj(H, 'stack of dollar bills, money pile', .1, .95, ctx.W * .4, { cruza: false, rot: 6 }));
      return s;
    }
    if (i < ctx.total - 1) s.items.push(obj(H, i % 2 ? busto.replace('wearing sunglasses', 'cracked and broken, fragments flying') : 'black marble chess knight horse piece with green glow', 1, .45, ctx.W * .6, { cruza: true, shadow: 2 }));
    s.items.push(obj(H, 'stack of dollar bills', .9, .95, ctx.W * .32, { rot: -6 }));
    const ic = d.icone || ['flame', 'thermometer', 'snowflake', 'target'][(i - 1) % 4];
    s.shapes.push({ kind: 'icon', icon: ic, icon_color: A, x: .12, y: .14, w: .08, h: .065 });
    bloco(ctx, H, s, [{ v: semMarca(d.titulo), f: 'tit', cor: '#111111', max: .06, linhas: 1, gap: 0 }, { v: d.apoio || d.texto, f: 'txtB', cor: '#222222', max: .036, maxH: .3, gap: .02, extra: { deco: 'sublinhado' } }, { v: d.apoio ? d.texto : '', f: 'txt', cor: '#555555', max: .024, maxH: .2, gap: .04 }], { x: .17, w: .6, topo: .11 });
    return s;
  },
  // 4 · Narrativo escuro com palavra gigante
  k04(p, d, ctx, H) {
    const A = ctx.accent, { i, W } = ctx, pr = '#060b07', s = pagina(pr, { grain: .1, vignette: .5 });
    s.fx.glows = [{ x: .1, y: .9, r: .6, color: A, opacity: .14 }, { x: .9, y: .1, r: .5, color: A, opacity: .1 }];
    const palavras = d.fantasma ? String(d.fantasma).split(/[,;]/).map(x => x.trim()).filter(Boolean) : ['PATRÃO', 'VENDA', 'LUCRO'];
    const pw = palavras[Math.floor(i / 2) % palavras.length];
    if (i % 3 === 1) palavraGigante(ctx, s, pw, { inicio: .55, y: .85, size: .28, cor: A, op: .12, font: ctx.T.tit.k });
    else s.texts.push({ role: 'number', value: pw, x: .93, y: .45, align: 'center', w: 2, size: Math.round(W * .2), font: ctx.T.tit.k, weight: 900, color: A, opacity: .12, rot: -90, upper: true, caixa: 'alta', nowrap: true, shadow: false, decor: true });
    [[.15, .2, .22, -14], [.85, .75, .3, 18], [.4, .95, .18, 8]].forEach(([x, y, f, r], q) => { if ((q + i) % 2) s.shapes.push({ kind: 'rect', tile: true, icon: 'chevron-right', icon_color: '#0a0a0a', color: A, x, y, w: f, h: F2(f * .8), radius: .24, rot: r, blur: 14, opacity: .25 }); });
    if (ctx.logo) s.items.push({ asset: ctx.logo, x: .14, y: .06, size: Math.round(W * .16), moldura: true });
    else s.texts.push({ role: 'footer', value: ctx.marca || 'Sua marca', x: .08, y: .06, align: 'left', size: Math.round(W * .018), weight: 700, color: '#ffffff', icon: 'square', nowrap: true, shadow: false });
    arrasteTexto(ctx, s, pr, { x: .22, y: .9 });
    if (p === 'fim') { bloco(ctx, H, s, [{ v: d.titulo, f: 'txt', cor: '#ffffff', max: .036, maxH: .3 }, { v: d.cta || `Siga ${ctx.contatos?.instagram || '@suamarca'}`, f: 'tit', cor: A, max: .06, linhas: 2, gap: .05 }], { x: .5, w: .75, centro: .45, align: 'center' }); return s; }
    bloco(ctx, H, s, [{ v: d.titulo, f: p === 'capa' ? 'txtB' : 'txt', cor: '#ffffff', max: p === 'capa' ? .042 : .034, maxH: .25 }, { v: d.texto, f: 'txt', cor: '#ffffff', max: .034, maxH: .35, gap: .035 }], { x: .1, w: .72, centro: .42 });
    return s;
  },
  // 5 · Claro com marca d'água
  k05(p, d, ctx, H) {
    const A = ctx.accent, { i, W } = ctx, pr = '#ffffff', s = pagina(pr, { grain: .05 });
    s.shapes.push({ kind: 'circle', x: .6, y: .55, w: 1.1, color: A, opacity: .07 }, { kind: 'ring', x: .6, y: .55, w: .7, color: A, stroke_w: .05, opacity: .07 }, { kind: 'icon', icon: 'rocket', icon_color: A, x: .6, y: .55, w: .5, h: .4, opacity: .06 });
    const vert = d.fantasma || ['VISUALIZAÇÕES', 'YOUTUBE'][i % 2];
    if (i % 2 === 1 && p !== 'fim') s.texts.push({ role: 'number', value: vert, x: 1, y: .5, align: 'center', w: 3, size: Math.round(W * .22), font: ctx.T.tit.k, weight: 900, color: A, opacity: .18, rot: -90, upper: true, caixa: 'alta', nowrap: true, shadow: false, decor: true, cruza: true });
    perfilTopo(ctx, s, pr);
    arrasteTexto(ctx, s, pr, { y: .92, cor: A });
    if (p === 'capa') {
      const f = d.foto || d.objeto || 'two smiling content creators portrait, studio';
      s.items.push({ ...(H.genOuAsset(f).gen ? { gen: H.genOuAsset(f).gen } : H.genOuAsset(f)), x: .5, y: .38, size: Math.round(W * .7), h: .42, radius: .05, card: true, fotoCard: true, hero: true, shadow: 1 });
      const t = partes(d.titulo);
      bloco(ctx, H, s, [{ v: t.dest, cor: A, max: .065, linhas: 2, caixa: 'alta' }, { v: t.antes, f: 'txt', cor: '#1a1a1a', max: .045, linhas: 2, gap: 0, caixa: 'alta' }], { x: .5, w: .8, topo: .66, align: 'center' });
      return s;
    }
    if (p === 'fim') { bloco(ctx, H, s, [{ v: d.titulo || 'Para mais conteúdos como esse siga', cor: '#111111', max: .075, linhas: 3 }, { v: ctx.contatos?.instagram || '@suamarca', cor: A, max: .075, linhas: 1, gap: 0 }], { x: .5, w: .78, centro: .45, align: 'center' }); return s; }
    bloco(ctx, H, s, [{ v: semMarca(d.titulo), f: 'txtB', cor: '#1a1a1a', max: .036, maxH: .1 }, { v: d.texto, f: 'txt', cor: '#2a2a2a', max: .03, maxH: .5, gap: .02 }, { v: d.apoio, f: 'txt', cor: A, max: .026, gap: .03 }], { x: .14, w: .7, topo: .17 });
    return s;
  },
  // 6 · Objeto-símbolo (branco e roxo)
  k06(p, d, ctx, H) {
    const A = ctx.accent, { i, W } = ctx, claro = p === 'capa' || i % 2 === 0, pr = claro ? '#f1f0f2' : '#14061f', s = pagina(pr, { grain: .2, vignette: claro ? .15 : .5 });
    if (claro) s.fx.textura = [{ tipo: 'concreto', op: .25, blend: 'multiply' }];
    else { s.bg.grad = { tipo: 'radial', cores: ['#4c1d95', '#14061f'], x: 50, y: 60, r: 90 }; s.fx.glows = [{ x: .5, y: .3, r: .6, color: A, opacity: .35 }]; s.shapes.push({ kind: 'line', x: .5, y: .2, w: 1.2, h: .002, color: A, opacity: .4, rot: -8 }, { kind: 'line', x: .5, y: .78, w: 1.2, h: .002, color: A, opacity: .3, rot: 6 }); }
    perfilTopo(ctx, s, pr, { cor: claro ? '#111111' : '#ffffff' });
    arrasteTexto(ctx, s, pr, { y: .94 });
    const simb = d.objeto || 'rough grey granite rock';
    const ctxCena = ['', ' on a white pedestal', ' inside a glass display case museum', ' held in hands', ' on a luxury velvet cushion'][i % 5];
    const tc = claro ? '#111111' : '#ffffff';
    if (p === 'fim') { s.items.push(obj(H, d.foto || 'stylish person in black suit pointing down, cartoon smartphone head mascot', .5, .48, W * .8, { pessoa: true })); bloco(ctx, H, s, [{ v: d.titulo || 'Venha fazer parte da comunidade', cor: tc, max: .065, linhas: 2 }, { v: d.cta || 'Link na bio!', f: 'txtB', cor: tc, max: .032, gap: .02, extra: { deco: 'sublinhado' } }], { x: .5, w: .8, topo: .7, align: 'center' }); return s; }
    s.items.push(obj(H, simb + ctxCena, .5, .6, W * .62, { shadow: 2 }));
    const t = partes(d.titulo);
    bloco(ctx, H, s, [{ v: t.antes || t.dest, cor: p === 'capa' ? A : tc, max: .09, linhas: 2, caixa: 'alta', extra: { italic: p === 'capa' } }, { v: t.antes ? t.dest : '', f: 'tit', k: 'playfair', fw: 400, cor: tc, max: .055, linhas: 1, gap: 0, extra: { italic: true }, caixa: 'normal' }], { x: .5, w: .84, topo: .1, align: 'center' });
    if (d.texto) bloco(ctx, H, s, [{ v: d.texto, f: 'txt', cor: tc, max: .028, maxH: .1 }], { x: .5, w: .8, base: .9, align: 'center' });
    return s;
  },
  // 7 · Mascote e magenta
  k07(p, d, ctx, H) {
    const A = ctx.accent, { i, W } = ctx, claro = p === 'capa' || i % 2 === 0, pr = claro ? '#f7f7f8' : '#1c0522', s = pagina(pr, { grain: .1, vignette: claro ? 0 : .4 });
    if (!claro) { s.fx.glows = [{ x: .9, y: .9, r: .6, color: A, opacity: .2 }]; palavraGigante(ctx, s, d.fantasma || 'DICA', { inicio: .55, y: .5, size: .9, cor: '#ffffff', op: .04, font: ctx.T.tit.k }); }
    perfilTopo(ctx, s, pr);
    const tc = claro ? '#121212' : '#ffffff';
    if (i < ctx.total - 1) s.texts.push({ role: 'cta', value: 'Arraste para o lado', x: .5, y: .93, align: 'center', size: Math.round(W * .026), weight: 600, bg: A, color: '#ffffff', shape: 'reto', icon: 'chevron-right', icon_end: true, nowrap: true, shadow: false, seta: false });
    if (p === 'capa') {
      s.items.push(obj(H, d.objeto || 'woman in black blazer with a cartoon smartphone head showing a scared face, hands on head, 3D', .3, .72, W * .78, { pessoa: true }));
      [[.05, .2], [.43, .38]].forEach(([x, y]) => barraPS(s, x, y, .45, '#e9e9ee'));
      const t = partes(d.titulo);
      bloco(ctx, H, s, [{ v: semMarca(d.titulo), cor: A, max: .085, linhas: 2, caixa: 'alta', extra: { italic: true } }], { x: .5, w: .86, topo: .1, align: 'center' });
      if (d.texto) bloco(ctx, H, s, [{ v: d.texto, f: 'txtB', cor: '#121212', max: .034, maxH: .2 }], { x: .55, w: .38, topo: .38 });
      return s;
    }
    if (p === 'fim') { bloco(ctx, H, s, [{ v: d.titulo, f: 'txt', cor: tc, max: .04, maxH: .35 }, { v: d.texto, f: 'txtB', cor: tc, max: .04, gap: .04 }], { x: .1, w: .8, centro: .4 }); s.texts.push({ role: 'cta', value: d.cta || `Siga: ${ctx.contatos?.instagram || '@suamarca'}`, x: .5, y: .72, align: 'center', size: Math.round(W * .05), weight: 700, bg: A, color: '#ffffff', shape: 'reto', nowrap: true, shadow: false, seta: false }); return s; }
    bloco(ctx, H, s, [{ v: claro ? semMarca(d.titulo) : '', cor: A, max: .05, linhas: 2 }, { v: claro ? d.texto : `*${semMarca(d.titulo)}* ${d.texto || ''}`, f: 'txt', cor: tc, max: .04, maxH: .5, gap: .04, hl: tc, extra: { hw: 700 } }], { x: .08, w: .84, centro: .45 });
    return s;
  },
  // 8 · Tutorial petróleo
  k08(p, d, ctx, H) {
    const A = ctx.accent, { i, W } = ctx, pr = '#07141a', s = pagina(pr, { grain: .15, vignette: .4 });
    s.bg.grad = { tipo: 'linear', ang: 180, cores: ['#06121a', '#0b2a33', '#06121a'] }; s.fx.glows = [{ x: .5, y: .95, r: .7, color: '#1ea3b0', opacity: .25 }];
    palavraGigante(ctx, s, d.fantasma || ctx.marca || 'SUAMARCA', { inicio: -.05 + (i % 2 ? 0 : 0), y: .92, size: .32, cor: '#3cc4d6', op: .2, outline: false, font: ctx.T.tit.k });
    if (ctx.logo) s.items.push({ asset: ctx.logo, x: .5, y: .07, size: Math.round(W * .18), moldura: true }); else s.texts.push({ role: 'footer', value: ctx.marca || 'Sua marca', x: .5, y: .07, align: 'center', size: Math.round(W * .02), weight: 700, color: '#ffffff', nowrap: true, shadow: false });
    arrasteTexto(ctx, s, pr, { y: .92 });
    const f = d.foto || 'clean screenshot of a web app dashboard interface';
    if (p === 'fim') { bloco(ctx, H, s, [{ v: d.titulo, f: 'txt', cor: '#ffffff', max: .036, maxH: .4 }, { v: d.texto, f: 'txt', cor: '#ffffff', max: .034, gap: .03 }], { x: .5, w: .78, centro: .45, align: 'center' }); return s; }
    const r = bloco(ctx, H, s, [{ v: d.titulo, f: p === 'capa' ? 'txtB' : 'txt', cor: '#ffffff', max: .036, maxH: .22 }, { v: d.texto, f: 'txt', cor: '#ffffffd9', max: .032, maxH: .2, gap: .025 }], { x: .1, w: .8, topo: .18 });
    const g = H.genOuAsset(f); s.items.push({ ...(g.gen ? { gen: g.gen } : g), x: .5, y: F2(Math.min(.68, r.y1 + .2)), size: Math.round(W * .8), h: .3, radius: .03, card: true, fotoCard: true, hero: true, shadow: 2 });
    return s;
  },
  // 9 · Bege e preto com peça de xadrez
  k09(p, d, ctx, H) {
    const A = ctx.accent, { i, W } = ctx, pr = p === 'capa' ? '#0b0b0b' : p === 'fim' ? '#0b0b0b' : i % 2 ? '#e6e1d4' : '#0b0b0b', s = pagina(pr, { grain: .18, vignette: escuro(pr) ? .35 : 0 });
    const tc = tinta(pr), peca = d.objeto || 'black marble chess king piece';
    s.shapes.push({ kind: 'rect', x: .7, y: .55, w: .9, h: .75, radius: .45, rot: -25, color: escuro(pr) ? '#ffffff' : '#000000', opacity: escuro(pr) ? .04 : .05 });
    if (ctx.logo) s.items.push({ asset: escuro(pr) ? ctx.logo : (ctx.logoEscura || ctx.logo), x: .14, y: .055, size: Math.round(W * .15), moldura: true }); else s.texts.push({ role: 'footer', value: ctx.marca || 'Sua marca', x: .07, y: .055, align: 'left', size: Math.round(W * .018), weight: 600, color: tc, nowrap: true, shadow: false });
    arrasteTexto(ctx, s, pr, { y: .91 });
    if (p === 'capa') {
      s.bg = { gen: d.ambiente || 'dark smoky dramatic scene, a businessman sitting on a golden throne in shadows, cinematic low key', color: pr }; s.shade = .75;
      s.items.push(obj(H, peca, .88, .78, W * .5, { cruza: true, shadow: 2 }));
      const t = partes(d.titulo);
      bloco(ctx, H, s, [{ v: t.antes, cor: '#ffffff', max: .055, linhas: 2, caixa: 'alta', extra: { band: '#ffffff' }, k: ctx.T.tit.k }, { v: t.dest, cor: A, max: .085, linhas: 2, caixa: 'alta', gap: .005 }], { x: .07, w: .7, base: .84 });
      // faixa branca da 1ª parte com tinta preta
      for (const tx of s.texts) if (tx.band === '#ffffff') tx.color = '#111111';
      return s;
    }
    if (i < ctx.total - 1 && i % 2 === 0) s.items.push(obj(H, peca, 1.02, .66, W * .5, { cruza: true, shadow: 2, rot: -10 }));
    if (p === 'fim') { bloco(ctx, H, s, [{ v: d.titulo, cor: '#ffffff', max: .055, linhas: 3 }, { v: d.cta, cor: A, max: .05, linhas: 2, gap: .03 }], { x: .5, w: .8, centro: .55, align: 'center' }); return s; }
    bloco(ctx, H, s, [{ v: d.titulo, f: 'txt', cor: tc, max: .036, maxH: .3, hl: tc, extra: { hw: 700 } }, { v: d.texto, f: 'txt', cor: tc, max: .036, maxH: .4, gap: .03, hl: tc, extra: { hw: 700 } }], { x: .1, w: .72, topo: .16 });
    return s;
  },
  // 10 · Preto e dourado com fumaça
  k10(p, d, ctx, H) {
    const A = ctx.accent, { i, W } = ctx, pr = '#070707', s = pagina(pr, { grain: .2, vignette: .5 });
    s.fx.textura = [{ tipo: 'fumaca', op: .35, blend: 'screen' }];
    const rei = d.objeto || 'golden and black chess king piece with crown, luxury, glossy';
    if (ctx.logo) s.items.push({ asset: ctx.logo, x: .12, y: .055, size: Math.round(W * .14), moldura: true }); else s.texts.push({ role: 'footer', value: ctx.marca || 'Sua marca', x: .06, y: .055, align: 'left', size: Math.round(W * .017), weight: 600, color: '#ffffff', nowrap: true, shadow: false });
    arrasteTexto(ctx, s, pr, { y: .93 });
    if (i % 3 === 1 && i < ctx.total - 1) s.items.push(obj(H, 'fan of brazilian 100 reais banknotes', 1, .93, W * .7, { cruza: true, rot: -8 }));
    if (p === 'capa') {
      s.items.push(obj(H, rei, .5, .32, W * .55, { shadow: 2 }), obj(H, 'luxury golden cosmetic bottles', .18, .4, W * .3, { rot: -10 }));
      const t = partes(d.titulo);
      bloco(ctx, H, s, [{ v: t.antes, cor: '#ffffff', max: .07, linhas: 2, caixa: 'alta' }, { v: t.dest, cor: '#111111', max: .075, linhas: 1, caixa: 'alta', gap: 0, extra: { band: '#ffffff' } }, { v: d.texto, f: 'txt', cor: '#ffffff', max: .03, gap: .04 }], { x: .5, w: .84, topo: .55, align: 'center' });
      return s;
    }
    if (p === 'fim') { s.items.push(obj(H, rei, .5, .38, W * .6, { shadow: 2 })); bloco(ctx, H, s, [{ v: d.titulo || 'Para mais conteúdos como esse siga', cor: '#ffffff', max: .065, linhas: 3 }, { v: ctx.contatos?.instagram || '@suamarca', cor: A, max: .07, gap: 0 }], { x: .5, w: .8, topo: .66, align: 'center' }); return s; }
    if (i % 3 === 2) s.items.push(obj(H, rei + ' held by a hand full of money', .25, .5, W * .55, { shadow: 2 }));
    bloco(ctx, H, s, [{ v: d.numero, cor: A, max: .12, linhas: 1 }, { v: semMarca(d.titulo), cor: '#ffffff', max: .05, linhas: 2, caixa: 'alta' }, { v: d.texto, f: 'txt', cor: '#ffffff', max: .032, maxH: .35, gap: .03 }], { x: i % 3 === 2 ? .5 : .1, w: i % 3 === 2 ? .44 : .78, topo: .18 });
    return s;
  },
  // 11 · Fogo
  k11(p, d, ctx, H) {
    const A = ctx.accent, { i, W } = ctx, pr = '#090909', s = pagina(pr, { grain: .15, vignette: .5 });
    if (p === 'capa') {
      s.bg = { gen: d.ambiente || 'big real orange fire flames on pure black background, burning', color: pr }; s.shade = .25;
      s.items.push(obj(H, d.objeto || 'stack of burning dollar bills with flames', .92, .65, W * .6, { cruza: true, rot: -15, shadow: 2 }));
      const t = partes(d.titulo);
      s.shapes.push({ kind: 'rect', x: .32, y: .44, w: .62, h: .14, color: '#0a0a0a', rot: -2 });
      const r = bloco(ctx, H, s, [{ v: t.antes, f: 'tit', fw: 400, cor: '#111111', max: .07, linhas: 1, k: ctx.T.txt.k, extra: { band: '#ffffff' } }, { v: t.dest, cor: A, max: .2, maxH: .15, linhas: 1, caixa: 'alta', gap: 0 }, { v: t.depois, f: 'tit', fw: 400, cor: '#111111', max: .07, linhas: 1, gap: 0, k: ctx.T.txt.k, extra: { band: '#ffffff' } }], { x: .32, w: .58, centro: .44, align: 'center' });
      botaoArraste(ctx, s, { x: .12, y: F2(r.y1 + .07), bg: A, cor: '#ffffff' });
      rodapeAgencia(ctx, s, pr); return s;
    }
    if (p === 'fim') { s.bg = { gen: d.ambiente || 'dark city skyscrapers in black and white, geometric dark shapes, moody', color: pr }; s.shade = .75; s.shade_dir = 'full'; bloco(ctx, H, s, [{ v: d.titulo || 'Gosta desse tipo de conteúdo?', cor: '#ffffff', max: .09, linhas: 2 }, { v: d.cta || 'Curta - Salve - Compartilhe', f: 'txtB', cor: '#ffffff', max: .034, gap: .03, caixa: 'alta' }], { x: .5, w: .8, centro: .42, align: 'center' }); rodapeAgencia(ctx, s, pr); return s; }
    s.fx.textura = [{ tipo: 'fumaca', op: .3, blend: 'screen' }];
    if (i < ctx.total - 1) s.items.push(obj(H, 'burning brazilian 100 reais banknote with flames and smoke', 1, .9, W * .5, { cruza: true, rot: 10 }));
    s.shapes.push({ kind: 'rect', x: .5, y: .5, w: 1.6, h: .9, rot: -35, color: '#ffffff', opacity: .025 });
    const t = d.titulo ? `${d.numero ? d.numero + '. ' : ''}${semMarca(d.titulo)}` : '';
    bloco(ctx, H, s, [{ v: t, f: 'txtB', cor: '#ffffff', max: .042, maxH: .1, gap: 0 }, { v: d.texto, f: 'txt', cor: '#ffffffd9', max: .031, maxH: .3, gap: .015 }], { x: .2, w: .62, topo: .2 });
    rodapeAgencia(ctx, s, pr); return s;
  },
  // 12 · Espaço ciano
  k12(p, d, ctx, H) {
    const A = ctx.accent, { i, W } = ctx, pr = '#04121a', s = pagina(pr, { grain: .45, vignette: .4 });
    s.bg = { gen: d.ambiente || (p === 'capa' ? 'deep space starfield with cyan teal nebula glow and a bright planet horizon, grainy' : 'deep space starfield, dark teal and cyan, grainy, lunar surface at the bottom'), color: pr };
    const objs = ['cyan digital drawing tablet stylus pen, 3D', 'retro white beige personal computer with keyboard, 3D, cyan rim light', 'vintage film camera, 3D, cyan light'];
    if (p !== 'capa' && i < ctx.total - 1 && i % 2 === 1) s.items.push(obj(H, objs[Math.floor(i / 2) % objs.length], 1, .55, W * .6, { cruza: true, rot: 25, shadow: 2 }));
    rodapeAgencia(ctx, s, pr, { y: .86, cards: true });
    if (p === 'capa') {
      s.items.push(obj(H, d.objeto || 'astronaut in white spacesuit holding a computer monitor screen in front of the helmet', .35, .62, W * .95, { shadow: 2 }));
      s.shapes.push({ kind: 'rect', x: .32, y: .4, w: .54, h: .27, radius: .03, color: '#e9eef0' });
      const t = partes(d.titulo);
      bloco(ctx, H, s, [{ v: t.antes, cor: '#111111', max: .05, linhas: 2, caixa: 'alta' }, { v: t.dest, cor: '#111111', max: .14, linhas: 1, caixa: 'alta', gap: 0 }], { x: .32, w: .48, centro: .4, align: 'center' });
      botaoArraste(ctx, s, { x: .12, y: .69, bg: A, cor: '#04222a', size: .022 });
      return s;
    }
    s.texts.push({ role: 'badge', value: d.kicker || 'Segredos do mkt', x: .5, y: .1, align: 'center', size: Math.round(W * .018), weight: 600, color: '#ffffff', bg: '#00000000', icon: 'arrow-down', nowrap: true, shadow: false });
    if (p === 'fim') { bloco(ctx, H, s, [{ v: d.titulo || 'Gostou do conteúdo?', f: 'tit', k: ctx.T.txt.k, fw: 800, cor: '#ffffff', max: .08, linhas: 2 }, { v: d.texto || 'Compartilhe com os amigos!', f: 'txt', cor: '#ffffff', max: .036, gap: .01 }], { x: .5, w: .7, centro: .4, align: 'center' }); s.texts.push({ role: 'cta', value: d.cta || 'Quero orçamento', x: .5, y: .62, align: 'center', size: Math.round(W * .026), weight: 700, bg: A, color: '#04222a', shape: 'pill', upper: true, caixa: 'alta', nowrap: true, shadow: false, seta: false }); return s; }
    const t = partes(d.titulo);
    bloco(ctx, H, s, [{ v: `${d.numero || String(i).padStart(2, '0')}. ${semMarca(d.titulo)}`, cor: A, max: .075, linhas: 4, caixa: 'alta', extra: { icon: 'arrow-right' } }, { v: d.texto, f: 'txt', cor: '#ffffff', max: .03, maxH: .2, gap: .02 }], { x: .1, w: .55, topo: .2 });
    return s;
  },
  // 13 · Colagem pop
  k13(p, d, ctx, H) {
    const A = ctx.accent, MAG = '#ff1f8f', ROXO = '#3a1659', { i, W } = ctx, cores = [MAG, '#f4f1ea', ROXO, '#f4f1ea', MAG], pr = p === 'capa' ? MAG : p === 'fim' ? '#f4f1ea' : cores[i % cores.length], s = pagina(pr, { grain: .3 });
    s.fx.textura = [{ tipo: 'papel', op: .5, blend: 'multiply' }];
    const prox = cores[(i + 1) % cores.length];
    if (i < ctx.total - 1) s.shapes.push({ kind: 'rect', x: .97, y: .5, w: .1, h: 1.05, color: prox, clip: rasgado(i + 3, 'esq', 18) });
    const tc = tinta(pr), dest = pr === MAG ? '#ffffff' : pr === ROXO ? A : MAG;
    const objs = ['white 3D megaphone, clay render', 'white 3D rocket, clay render', 'white 3D hand giving thumbs up, clay render', 'dartboard target with arrow, 3D'];
    rabisco(s, '✕ ✕ ✕', .72, .07, W * .08, A, -6, 'marker', .95);
    if (p === 'capa') {
      s.items.push(obj(H, d.foto || 'black and white halftone portrait of a cat, collage cutout', .45, .3, W * .8, { pessoa: true, fil: { gray: 1, co: 1.2 } }));
      s.shapes.push({ kind: 'ring', x: .78, y: .27, w: .34, color: '#2a1140', stroke_w: .035 }, { kind: 'circle', x: .78, y: .27, w: .16, color: '#ffffff', icon: 'heart', icon_color: MAG });
      s.texts.push({ role: 'label', value: (ctx.marca || 'sua empresa') + ' • arrazando • ', x: .78, y: .19, align: 'center', w: .3, size: Math.round(W * .018), weight: 800, color: A, curva: 80, upper: true, caixa: 'alta', shadow: false });
      const t = partes(d.titulo);
      bloco(ctx, H, s, [{ v: t.antes, cor: '#ffffff', max: .07, linhas: 5, caixa: 'alta' }, { v: t.dest, cor: A, max: .07, linhas: 1, caixa: 'alta', gap: 0 }], { x: .08, w: .6, base: .86 });
      s.texts.push({ role: 'cta', value: 'Arraste para o lado', x: .08, y: .92, align: 'left', size: Math.round(W * .016), weight: 600, bg: '#00000000', color: '#ffffff', shape: 'outline', arrow: 'arrow-right', arrow_bg: '#00000000', arrow_color: '#ffffff', upper: true, caixa: 'alta', nowrap: true, shadow: false, seta: false });
      return s;
    }
    if (p === 'fim') {
      s.items.push(obj(H, 'white 3D hand giving thumbs up with orange sleeve, clay render', .78, .3, W * .45));
      bloco(ctx, H, s, [{ v: d.titulo || 'Gostou do conteúdo?', cor: '#2a1140', max: .07, linhas: 2, caixa: 'alta' }], { x: .1, w: .5, topo: .18 });
      [['heart', 'Curta'], ['message-circle', 'Comente'], ['bookmark', 'Salve'], ['send', 'Compartilhe']].forEach(([ic, l], q) => { s.shapes.push({ kind: 'icon', icon: ic, icon_color: '#2a1140', x: .12, y: F2(.42 + q * .08), w: .05, h: .04 }); s.texts.push({ role: 'title', value: l, x: .18, y: F2(.42 + q * .08), align: 'left', size: Math.round(W * .065), font: ctx.T.tit.k, weight: 700, color: MAG, upper: true, caixa: 'alta', nowrap: true, shadow: false }); });
      return s;
    }
    s.items.push(obj(H, objs[(i - 1) % objs.length], i % 2 ? .78 : .7, .72, W * .55, { shadow: 2 }));
    if (i % 2) s.items.push(obj(H, 'black and white halftone vintage portrait of a man in profile, collage cutout with neon green paint strokes', 1, .45, W * .7, { pessoa: true, cruza: i < ctx.total - 1, fil: { gray: 1, co: 1.15 } }));
    const t = partes(d.titulo);
    bloco(ctx, H, s, [{ v: t.antes, cor: tc, max: .09, linhas: 3, caixa: 'alta' }, { v: t.dest, cor: dest, max: .2, maxH: .25, linhas: 3, caixa: 'alta', gap: 0 }, { v: d.texto, f: 'txt', cor: tc, max: .028, maxH: .2, gap: .02, wf: .8 }], { x: .07, w: .58, topo: .12 });
    s.texts.push({ role: 'cta', value: 'Arraste para o lado', x: .07, y: .93, align: 'left', size: Math.round(W * .014), weight: 600, bg: '#00000000', color: tc, shape: 'outline', arrow: 'arrow-right', arrow_bg: '#00000000', arrow_color: tc, upper: true, caixa: 'alta', nowrap: true, shadow: false, seta: false });
    return s;
  },
  // 14 · Retrô P&B em fundo branco
  k14(p, d, ctx, H) {
    const A = ctx.accent, A2 = ctx.accent2 || '#1fc8b5', { i, W } = ctx, pr = '#ffffff', s = pagina(pr, { grain: .06 });
    const c = i % 2 ? A2 : A;
    // perfil em pílula e barra de "arraste" no topo
    s.shapes.push({ kind: 'pill', x: .14, y: .07, w: .2, h: .045, color: '#ffffff', stroke: '#9a9a9a', stroke_w: .0015 }, { kind: 'pill', x: .43, y: .075, w: .3, h: .02, color: '#ffffff', stroke: '#9a9a9a', stroke_w: .0015 }, { kind: 'icon', icon: i >= ctx.total - 1 ? 'arrow-down' : 'arrow-right', icon_color: '#111111', x: .55, y: .075, w: .03, h: .02 });
    s.items.push({ asset: ctx.avatar || ctx.logo || 'avatar-padrao', x: .075, y: .07, size: Math.round(W * .04), round: true, moldura: true });
    s.texts.push({ role: 'footer', value: ctx.contatos?.instagram || '@suamarca', x: .1, y: .07, align: 'left', size: Math.round(W * .016), weight: 500, color: '#111111', nowrap: true, shadow: false });
    if (i % 2 === 0) s.items.push(obj(H, 'dry dead tree branches and roots tangle on grey rocks, isolated', .5, 1, W * 1.1, { cruza: false }));
    const pessoas = ['vintage black and white photo of a 1950s man sitting in a leather armchair reading a big newspaper, legs crossed', 'vintage black and white photo of a smiling 1950s woman lying on the floor listening to a retro radio with headphones', 'vintage black and white photo of a 1950s man in hat and suspenders looking through binoculars, full body'];
    if (p !== 'fim' && i < ctx.total - 1) s.items.push(obj(H, pessoas[i % 3], 1, i % 3 === 1 ? .78 : .55, W * (i % 3 === 1 ? .6 : .75), { pessoa: true, cruza: true, fil: { gray: 1 } }));
    if (p === 'capa') {
      const t = partes(d.titulo);
      s.texts.push({ role: 'number', value: d.numero || '7', x: .17, y: .37, align: 'center', w: .3, size: Math.round(W * .34), font: 'playfair', weight: 900, color: A, shadow: false });
      s.shapes.push({ kind: 'ring', x: .17, y: .37, w: .32, h: .24, color: '#111111', stroke_w: .004, rot: -15 });
      bloco(ctx, H, s, [{ v: t.dest, f: 'tit', k: 'playfair', cor: A, max: .085, linhas: 2 }, { v: t.antes, f: 'txt', cor: '#111111', max: .045, maxH: .2, gap: 0, extra: { deco: 'sublinhado' } }], { x: .34, w: .44, topo: .26 });
      s.texts.push({ role: 'cta', value: 'Arraste para o lado', x: .12, y: .66, align: 'left', size: Math.round(W * .02), weight: 700, bg: A, color: '#ffffff', shape: 'box', icon: 'arrow-right', icon_end: true, nowrap: true, shadow: false, seta: false });
      return s;
    }
    if (p === 'fim') {
      s.items.push(obj(H, pessoas[2], .3, .55, W * .8, { pessoa: true, fil: { gray: 1 } }));
      s.shapes.push({ kind: 'rect', x: .72, y: .55, w: .44, h: .2, radius: .08, color: '#ffffff', stroke: A, stroke_w: .002 }, { kind: 'rect', x: .72, y: .74, w: .44, h: .08, radius: .2, color: '#ffffff', stroke: A, stroke_w: .002 });
      bloco(ctx, H, s, [{ v: d.titulo || 'Evite esses erros e conquiste o mercado!', f: 'tit', fw: 500, cor: '#111111', max: .04, linhas: 2 }, { v: d.texto, f: 'txt', cor: '#111111', max: .02, gap: .015, extra: { deco: 'sublinhado' } }], { x: .53, w: .38, topo: .48 });
      s.texts.push({ role: 'footer', value: ctx.contatos?.whatsapp || '(00) 00000-0000', x: .72, y: .74, align: 'center', size: Math.round(W * .022), weight: 700, color: '#111111', icon: 'whatsapp', nowrap: true, shadow: false });
      return s;
    }
    bloco(ctx, H, s, [{ v: d.kicker || `Erro ${i}:`, f: 'tit', k: ctx.T.tit.k, cor: '#222222', max: .045, linhas: 1, extra: { icon: 'hand', icon_color: '#e6a817' } }, { v: semMarca(d.titulo) + ' ✓✓', f: 'tit', cor: c, max: .05, linhas: 2, gap: .005 }, { v: d.texto, f: 'txt', cor: '#222222', max: .028, maxH: .2, gap: .015, wf: .9 }], { x: .1, w: .55, topo: .2 });
    return s;
  }
};

// ponto de entrada: monta a página do kit (arte real da referência quando há placas; senão o desenho por código)
export function comporKit(papel, d, ctx, H) {
  if (PLACAS[d.kit] && !d.desenho) return comporPlaca(papel, d, ctx, H);
  const k = kitDe(d.kit), fn = COMP[k.id];
  const s = fn(papel, d, ctx, H);
  s.items = s.items.filter(Boolean);
  return s;
}
// textos de exemplo para a prévia (o Roteirista escreve os de verdade)
export function exemploKit(id, n = 5) {
  const capa = { titulo: 'Sua empresa vai *quebrar*', texto: 'Uma frase curta de apoio da capa.' };
  const miolo = q => ({ numero: String(q), titulo: ['Ausência na *internet*', 'Falta de *engajamento*', 'Design *pobre*', 'Sem *estratégia*', 'Preço *errado*', 'Sem *funil*'][(q - 1) % 6], texto: 'Explique o ponto em duas ou três frases curtas, com a palavra mais importante em destaque. O texto vem do Roteirista.' });
  const pags = [{ modelo: 'kit-capa', dados: { kit: id, ...capa } }];
  for (let q = 1; q <= n - 2; q++) pags.push({ modelo: 'kit-texto', dados: { kit: id, ...miolo(q) } });
  pags.push({ modelo: 'kit-fim', dados: { kit: id, titulo: 'Gostou do *conteúdo*?', cta: 'Siga para mais' } });
  return pags;
}
