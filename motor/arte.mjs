// Renderiza as artes estáticas (feed, carrossel, stories, capas) em PNG.
// Uso: node arte.mjs spec.resolvido.json pasta_saida
// O spec já vem resolvido pelo painel: arquivos viram file://, fundos de IA já foram baixados.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs'; import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';

const [specPath, outDir] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
if (!spec.fontsBase) spec.fontsBase = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts')).href + '/';   // fontes embutidas (Anton, Bebas, Oswald...)
fs.mkdirSync(outDir, { recursive: true });
const W = spec.w || 1080, H = spec.h || 1350;
const accent = spec.accent || '#f59e0b', ink = spec.ink || '#ffffff', paper = spec.paper || '#0b0b0d';
import { slideHtml as slideHtmlBase, roles } from '../public/arte-slide.js';
const ROLE = roles(W);
const slideHtml = (s, i, total) => slideHtmlBase(spec, s, i, total);
const M = Math.max(0, Math.min(.2, Number(spec.margem) || 0)), STORIES = H / W > 1.7;
const effSize = t => t.size || (ROLE[t.role] || ROLE.title).size;
const hexLum = hex => { const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
const rgbLum = css => { const m = String(css).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); if ((p[3] ?? 1) < .5) return null; const v = p.slice(0, 3).map(x => x / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
const inter = (a, b) => { const w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t); return w > 0 && h > 0 ? w * h : 0; };
const area = r => Math.max(1, (r.r - r.l) * (r.b - r.t));
async function analisar(page, s) {
  const texts = await page.evaluate(() => [...document.querySelectorAll('.t')].map(el => { const rg = document.createRange(); rg.selectNodeContents(el); const r = rg.getBoundingClientRect(), cs = getComputedStyle(el), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.1; return { k: +el.dataset.k, role: el.dataset.role, l: r.left, t: r.top, r: r.right, b: r.bottom, color: cs.color, bg: cs.backgroundColor, fs: parseFloat(cs.fontSize), lines: Math.max(1, Math.round(r.height / lh)) }; }));
  const items = await page.evaluate(() => [...document.querySelectorAll('.it:not(.ghost):not(.front)')].map(el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, k: +el.dataset.k }; }));
  await page.evaluate(() => document.querySelectorAll('.t').forEach(e => { e.style.visibility = 'hidden'; }));
  const shot = (await page.screenshot({ type: 'jpeg', quality: 60 })).toString('base64');
  await page.evaluate(() => document.querySelectorAll('.t').forEach(e => { e.style.visibility = ''; }));
  const lums = await page.evaluate(async ({ b64, boxes }) => {
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0);
    const lin = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; };
    return boxes.map(b => { const x0 = Math.max(0, Math.floor(b.l)), y0 = Math.max(0, Math.floor(b.t)), w = Math.min(cv.width - x0, Math.ceil(b.r - b.l)), h = Math.min(cv.height - y0, Math.ceil(b.b - b.t)); if (w < 2 || h < 2) return null; const d = cx.getImageData(x0, y0, w, h).data, arr = []; for (let i = 0; i < d.length; i += 28) arr.push(.2126 * lin(d[i]) + .7152 * lin(d[i + 1]) + .0722 * lin(d[i + 2])); arr.sort((a, c) => a - c); const q = p => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))]; return { lo: q(.12), mid: q(.5), hi: q(.88) }; });
  }, { b64: shot, boxes: texts });
  const out = [], mpx = M * W;
  texts.forEach((t, j) => {
    const tt = s.texts[t.k] || {}, bad = [];
    if (tt.outline || tt.decor || (tt.opacity ?? 1) < .6) return;   // texto decorativo (letra gigante vazada, marca d'água): pode sangrar e ficar atrás
    if (t.l < -1 || t.r > W + 1 || t.t < -1 || t.b > H + 1) out.push({ tipo: 'texto_cortado', k: t.k, sev: 'erro', fix: true, msg: `texto “${String(tt.value || '').replace(/[*|]/g, ' ').trim().slice(0, 28)}” sai do quadro` });
    else if (mpx > 0 && (t.l < mpx - 4 || t.r > W - mpx + 4) && !['cta', 'badge'].includes(t.role)) out.push({ tipo: 'margem_estilo', k: t.k, sev: 'aviso', fix: true, msg: 'texto dentro da margem definida no estilo da marca' });
    else if (t.t < H * .02 || t.b > H * .98 || t.l < W * .02 || t.r > W * .98) out.push({ tipo: 'texto_cortado', k: t.k, sev: 'aviso', fix: true, msg: 'texto colado na borda' });
    if (STORIES && ['title', 'body', 'number'].includes(t.role) && (t.t < H * .12 || t.b > H * .84)) out.push({ tipo: 'zona_segura', k: t.k, sev: 'aviso', fix: true, msg: 'texto na zona de interface do stories (topo/base)' });
    if (t.role === 'title' && t.lines > 5) out.push({ tipo: 'texto_demais', k: t.k, sev: 'aviso', fix: true, forte: true, msg: `título com ${t.lines} linhas` });
    if (t.role === 'title' && t.fs < W * .05) out.push({ tipo: 'titulo_pequeno', k: t.k, sev: 'aviso', fix: false, msg: 'título pequeno para o tamanho da peça' });
    const tl = rgbLum(t.color), own = rgbLum(t.bg), L = lums[j];
    if (tl != null && (own != null || L) && !tt.band) {
      const lo = own ?? L.lo, hi = own ?? L.hi, mid = own ?? L.mid, cm = ratio(tl, mid), worst = Math.min(ratio(tl, lo), ratio(tl, hi));
      if (cm < 3) out.push({ tipo: 'contraste_baixo', k: t.k, sev: 'erro', fix: true, msg: `contraste ${cm.toFixed(1)}:1 (mínimo 3:1)`, bgs: { lo, mid, hi }, own: own != null });
      else if (worst < 2.2) out.push({ tipo: 'contraste_baixo', k: t.k, sev: 'aviso', fix: true, msg: `contraste desigual (${worst.toFixed(1)}:1 em parte do texto)`, bgs: { lo, mid, hi }, own: own != null });
    }
    // REDE DE SEGURANÇA das páginas compostas por modelo: mede o texto de verdade (fonte real) e corrige o que a conta não previu
    if (!tt.decor && !tt.moldura && ['title', 'body', 'number'].includes(t.role)) {
      const mxm = W * (s.modelo ? .07 : 0), cw = t.r - t.l;
      if (s.modelo && cw > 2 && (t.r > W - mxm + 6 || t.l < mxm - 6)) { const al = tt.align || 'left', livre = al === 'center' ? W - 2 * mxm : al === 'right' ? t.r - mxm : W - mxm - t.l, esc = livre / cw; if (esc < .995) out.push({ tipo: 'margem_modelo', k: t.k, sev: 'erro', fix: true, esc, msg: 'texto passava da margem da peça (reduzido)' }); }
      for (const it of items) { const c = s.items[it.k]; if (!c || !(c.card || c.fotoCard)) continue; const ia = inter(t, it) / area(t); if (ia > .02 && t.t < it.t) { out.push({ tipo: 'sobre_cartao', k: t.k, sev: 'erro', fix: true, limite: it.t - H * .02, msg: 'texto encostava na foto (reduzido)' }); break; } }
    }
    for (let q = j + 1; q < texts.length; q++) {
      const o = texts[q], ia = inter(t, o); { const ot = s.texts[o.k] || {}; if (ot.outline || ot.decor || (ot.opacity ?? 1) < .6) continue; }
      if (s.modelo && !spec.editada && !s.texts[o.k]?.mexido && !tt.mexido) continue;   // página composta por modelo: medidas exatas, o recorte do glifo engana a checagem
      if (ia / Math.min(area(t), area(o)) > .18) {
        const up = t.t <= o.t ? t : o, lw = up === t ? o : t, hh = (lw.b - lw.t) / 2, ny = (up.b + H * .018 + hh) / H, cabe = ny + hh / H <= .93 && !['cta', 'badge'].includes(lw.role);
        out.push({ tipo: 'sobreposicao', k: lw.k, sev: 'erro', fix: cabe, ny, msg: 'dois textos se sobrepõem' });
      }
    }
    for (const it of (s.modelo && !spec.editada ? [] : items)) { if (inter(t, it) / area(t) > .35) { out.push({ tipo: 'sobreposicao', k: t.k, sev: 'aviso', fix: false, msg: 'mascote ou imagem cobre o texto' }); break; } }
  });
  // mascote/imagem principal x texto, medidos na imagem REAL renderizada: se o personagem cobre texto ou a logo, procura o maior espaço livre e reposiciona
  for (const it of items) {
    const sp = s.items?.[it.k]; if (!sp?.hero || sp.hide || sp.cruza || sp.moldura || sp.pessoa) continue;   // personagem do modelo heroi: a composição já o põe grande à direita, com degradê sob o texto
    const iw = it.r - it.l, ih = it.b - it.t; if (iw < 40 || ih < 40) continue;
    const fixos = texts.filter(t => t.role !== 'footer' && (t.r - t.l) > 4).map(t => ({ l: t.l, t: t.t, r: t.r, b: t.b, k: t.k, a: area(t) }));
    for (const o of items) { const so = s.items?.[o.k]; if (so?.moldura) fixos.push({ l: o.l, t: o.t, r: o.r, b: o.b, a: area(o) }); }
    const cobre = fixos.filter(f => inter(f, it) / f.a > .12);
    if (!cobre.length) continue;
    const rt = ih / iw, w0 = iw, cx0 = (it.l + it.r) / 2, cy0 = (it.t + it.b) / 2, mg = Math.max(M * W, W * .02); let melhor = null;
    for (const k of [1, .88, .76, .64, .52, .42]) {
      const w = w0 * k, h = w * rt; if (w > W - 2 * mg || h > H * .9) continue; let best = null;
      for (let cx = mg + w / 2; cx <= W - mg - w / 2 + 1; cx += W * .03) for (let cy = h / 2 + mg; cy <= H * .95 - h / 2 + 1; cy += H * .025) {
        const bx = { l: cx - w / 2, r: cx + w / 2, t: cy - h / 2, b: cy + h / 2 }; if (fixos.some(f => inter({ l: f.l - 12, r: f.r + 12, t: f.t - 12, b: f.b + 12 }, bx) > 0)) continue;
        const d = Math.hypot(cx - cx0, cy - cy0); if (!best || d < best.d) best = { cx, cy, w, d }; }
      if (best) { melhor = best; break; } }
    out.push({ tipo: 'sobreposicao', k: it.k, item: true, sev: 'erro', fix: !!melhor, nx: melhor ? melhor.cx / W : 0, ny: melhor ? melhor.cy / H : 0, nsize: melhor ? Math.round((sp.size || iw) * melhor.w / iw) : 0, msg: melhor ? 'o mascote cobria texto ou logo (reposicionado na área livre)' : 'o mascote cobre texto ou logo e não há espaço livre: reduza o texto ou o mascote' });
  }
  return out;
}
const clampN = (v, a, z) => Math.max(a, Math.min(z, v));
function aplicaCorrecao(s, it, info) {
  if (it.item) { const m = s.items?.[it.k]; if (!m || !it.nsize) return false; m.x = +it.nx.toFixed(4); m.y = +it.ny.toFixed(4); m.size = it.nsize; return true; }
  const t = s.texts[it.k]; if (!t) return false;
  const m = M || .06;
  if (it.tipo === 'texto_cortado' || it.tipo === 'margem_estilo' || it.tipo === 'texto_demais') {
    const al = t.align || 'center', w = t.w ?? (ROLE[t.role] || ROLE.title).w, x = t.x ?? .5;
    if (!['cta', 'badge'].includes(t.role)) {
      if (al === 'left') { t.x = clampN(x, m, 1 - m - .3); t.w = Math.min(w, 1 - t.x - m); }
      else if (al === 'right') { t.x = clampN(x, m + .3, 1 - m); t.w = Math.min(w, t.x - m); }
      else { t.w = Math.min(w, 1 - 2 * m); t.x = clampN(x, m + t.w / 2, 1 - m - t.w / 2); }
    }
    const hh = (info.b - info.t) / 2, y = t.y ?? .5; t.y = clampN(y, (hh + m * W) / H, 1 - (hh + m * W) / H);
    if (it.tipo !== 'margem_estilo') t.size = Math.round(effSize(t) * (it.forte ? .78 : .9));
    return true;
  }
  if (it.tipo === 'margem_modelo' || it.tipo === 'sobre_cartao') {
    const h0 = info.b - info.t, esc = it.tipo === 'margem_modelo' ? it.esc : Math.max(.55, (it.limite - info.t) / Math.max(1, h0)); if (!(esc < 1)) return false;
    t.size = Math.max(10, Math.floor(effSize(t) * esc * .985)); t.y = clampN((info.t + h0 * esc / 2) / H, .02, .98); return true;
  }
  if (it.tipo === 'sobreposicao' && it.ny != null) { t.y = it.ny; return true; }
  if (it.tipo === 'zona_segura') { const hh = (info.b - info.t) / 2; t.y = clampN(t.y ?? .5, (H * .13 + hh) / H, (H * .83 - hh) / H); return true; }
  if (it.tipo === 'contraste_baixo') {
    const { lo, mid, hi } = it.bgs, cur = rgbLum(info.color) ?? 1;
    if (!it.own) {
      const cands = [['#ffffff', 1], ['#0a0a0a', .003]], score = l => Math.min(ratio(l, lo), ratio(l, hi), ratio(l, mid) + 1);
      const best = cands.map(([c, l]) => ({ c, sc: score(l), cm: ratio(l, mid) })).sort((a, b) => b.sc - a.sc)[0];
      if (best.cm >= 4.5 && best.sc > score(cur)) { t.color = best.c; return true; }
    }
    if (cur > .4 && !it.own) { s.shade = Math.min(.85, (s.shade ?? (s.bg?.src ? .5 : 0)) + .22); s.shade_dir = s.shade_dir || 'full'; return true; }
    if (it.own) { t.color = cur > .4 ? '#0a0a0a' : '#ffffff'; return true; }
    t.color = '#ffffff'; return true;
  }
  return false;
}

const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await b.newPage({ viewport: { width: W, height: H } });
const n = spec.slides.length;
const checks = [], falhas = new Set();
for (const [i, s] of spec.slides.entries()) {
  const f = path.join(outDir, `slide-${String(i + 1).padStart(2, '0')}.html`), done = new Set();
  for (let pass = 0; pass < 4; pass++) {
    fs.writeFileSync(f, slideHtml(s, i, n));
    await page.goto(pathToFileURL(f).href);
    await page.evaluate(() => document.fonts.ready);
    for (const fam of await page.evaluate(() => [...document.fonts].filter(f => f.status === 'error').map(f => f.family.replace(/['"]/g, '')))) falhas.add(fam);
    await page.waitForTimeout(pass ? 60 : 120);
    let found = []; try { found = await analisar(page, s); } catch (e) { console.error('checagem:', e.message); }
    const fixable = spec.editada ? [] : found.filter(x => x.fix && x.sev === 'erro' || x.fix && pass < 2 && x.sev === 'aviso');
    if (pass < 3 && fixable.length) {
      const infoAll = await page.evaluate(() => [...document.querySelectorAll('.t')].map(el => { const rg = document.createRange(); rg.selectNodeContents(el); const r = rg.getBoundingClientRect(); return { k: +el.dataset.k, t: r.top, b: r.bottom, color: getComputedStyle(el).color }; }));
      for (const it of fixable) { const info = infoAll.find(x => x.k === it.k) || { t: 0, b: 0, color: '#fff' }; if (aplicaCorrecao(s, it, info)) { const key = it.tipo + (it.item ? 'i' : 't') + ':' + it.k; if (!done.has(key)) { done.add(key); checks.push({ slide: i + 1, tipo: it.tipo, sev: it.sev, corrigido: true, msg: it.msg }); } } }
      continue;
    }
    for (const it of found) { const j = checks.findIndex(x => x.slide === i + 1 && x.tipo === it.tipo && x.corrigido); if (j >= 0) checks.splice(j, 1); checks.push({ slide: i + 1, tipo: it.tipo, sev: it.sev, corrigido: false, msg: it.msg }); }
    break;
  }
  const base = path.join(outDir, `slide-${String(i + 1).padStart(2, '0')}`);
  await page.screenshot({ path: base + '.png' });
  await page.screenshot({ path: base + '.review.jpg', type: 'jpeg', quality: 72 });
  fs.rmSync(f, { force: true });
  console.log('slide', i + 1, '/', n);
}
fs.writeFileSync(path.join(outDir, 'checks.json'), JSON.stringify(checks));
fs.writeFileSync(path.join(outDir, 'fontes_falhas.json'), JSON.stringify([...falhas]));
await b.close();
