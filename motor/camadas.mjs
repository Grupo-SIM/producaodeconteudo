// Camadas de fidelidade para o editor FigCraft: desenha, em PNG transparente, o que o FigCraft não sabe desenhar.
// Uso: node camadas.mjs entrada.json saida_dir
//   entrada: { spec (já resolvido, imagens em file://), pedidos: [{ id, si, tipo: 'under' | 'fx' | 'shape', k }] }
//   'under' = fundo (com imagem) + escurecimento, brilhos, tinta e texturas; 'fx' = um efeito por cima (fade, vignette, fadeFront, grain);
//   'shape' = uma forma sozinha (selo, estrela, balão, ícone, cubo 3D…), no centro, com folga para brilho e desfoque.
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs'; import path from 'path'; import { pathToFileURL, fileURLToPath } from 'url';
import { slideHtml } from '../public/arte-slide.js';

const [entrada, outDir] = process.argv.slice(2);
const { spec: sp, pedidos } = JSON.parse(fs.readFileSync(entrada, 'utf8'));
if (!sp.fontsBase) sp.fontsBase = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts')).href + '/';
fs.mkdirSync(outDir, { recursive: true });
const W = sp.w || 1080, H = sp.h || 1350;
const b = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const res = [];
const seguro = id => id.replace(/[^\w-]/g, '_');
const ctxs = {};
const pagina = async esc => ctxs[esc] ||= await (await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: esc })).newPage();
for (const p of pedidos) {
  const s0 = sp.slides[p.si]; if (!s0) continue;
  const fx = s0.fx || {}, base = { ...s0, bg: {}, texts: [], items: [], shapes: [], pager: false, modelo: undefined };
  let s, esc = .5, shape = null;
  if (p.tipo === 'under') {   // fundo (com a imagem, se houver) + escurecimento, brilhos, tinta e texturas
    const bg = { ...(s0.bg || {}), color: undefined, color2: undefined, grad: undefined }; if (bg.src) esc = 1;
    s = { ...base, bg, shade: s0.shade, shade_dir: s0.shade_dir, fx: { glows: fx.glows, tint: fx.tint, textura: fx.textura } };
  } else if (p.tipo === 'fx') { s = { ...base, shade: 0, fx: { [p.k]: fx[p.k] } }; }
  else {   // forma sozinha, no centro, sem rotação e sem transparência: o FigCraft aplica depois
    const sh = (s0.shapes || [])[p.k]; if (!sh) continue; esc = 1;
    s = { ...base, shade: 0, fx: {}, shapes: [{ ...sh, hide: false, z: undefined, front: false, x: .5, y: .5, rot: 0, opacity: 1 }] };
    shape = sh;
  }
  const spec = { ...sp, slides: [s], transparent: true, semScript: true, pano: undefined };
  const f = path.join(outDir, `t-${seguro(p.id)}.html`);
  fs.writeFileSync(f, slideHtml(spec, s, 0, 1));
  const page = await pagina(esc); await page.goto(pathToFileURL(f).href); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(60);
  const png = path.join(outDir, seguro(p.id) + '.png');
  if (shape) {
    const bb = await page.locator('.sh').first().boundingBox(); if (!bb || bb.width < 1 || bb.height < 1) { fs.rmSync(f, { force: true }); continue; }
    const hx = Math.min(W / 2, bb.width / 2 * 1.35 + 8), hy = Math.min(H / 2, bb.height / 2 * 1.35 + 8);
    await page.screenshot({ path: png, omitBackground: true, clip: { x: W / 2 - hx, y: H / 2 - hy, width: hx * 2, height: hy * 2 } });
    res.push({ id: p.id, file: path.basename(png), x: W / 2 - hx, y: H / 2 - hy, w: hx * 2, h: hy * 2, cw: bb.width, ch: bb.height });
  } else { await page.screenshot({ path: png, omitBackground: true }); res.push({ id: p.id, file: path.basename(png), x: 0, y: 0, w: W, h: H }); }
  fs.rmSync(f, { force: true });
}
await b.close();
fs.writeFileSync(path.join(outDir, 'resultado.json'), JSON.stringify(res));
