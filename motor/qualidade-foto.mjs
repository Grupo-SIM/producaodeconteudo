// Qualidade de foto para as capas: filtro local (sem API), acabamento e ampliação opcional.
// Usa só o ffmpeg, que o sistema já exige para os vídeos. Sem ffmpeg, o filtro de nitidez é ignorado
// e valem só as regras de tamanho (a foto nunca deixa de entrar por falha da ferramenta).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const run = (cmd, args, opt = {}) => new Promise((resolve, reject) => execFile(cmd, args, { timeout: 60000, maxBuffer: 64 * 1024 * 1024, encoding: 'buffer', windowsHide: true, ...opt }, (e, so, se) => e ? reject(Object.assign(e, { stderr: se })) : resolve(so)));
const tmp = ext => path.join(os.tmpdir(), 'sim-foto-' + crypto.randomBytes(6).toString('hex') + '.' + ext);

let ffOk = null;
export async function temFfmpeg() {
  if (ffOk !== null) return ffOk;
  try { await run('ffmpeg', ['-version'], { timeout: 8000 }); ffOk = true; } catch { ffOk = false; }
  return ffOk;
}

// tamanho real da imagem (largura x altura)
export async function tamanhoImagem(file) {
  try {
    const so = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file], { timeout: 15000 });
    const [w, h] = String(so).trim().split('x').map(Number); return w > 0 && h > 0 ? { w, h } : null;
  } catch { return null; }
}

// Parte da foto que fica depois do corte vertical (proporção da capa): para foto horizontal o corte perde largura
export function areaUtil(w, h, W = 1080, H = 1350) {
  const ar = W / H; let cw = w, ch = h;
  if (w / h > ar) cw = Math.round(h * ar); else ch = Math.round(w / ar);
  return { cw, ch, escala: ch / H };   // escala < 1: a foto precisa ser esticada para cobrir a capa
}

// Nitidez: variância do laplaciano em cinza, na largura fixa de 640 px (comparável entre tamanhos).
// Foto pequena esticada ou desfocada fica com valor baixo; foto de verdade tem borda e textura.
async function cinza(file, largura) {
  const so = await run('ffmpeg', ['-v', 'error', '-i', file, '-frames:v', '1', '-vf', `scale=${largura}:-2:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { timeout: 40000 });
  return so;
}
export async function medeNitidez(file) {
  const tam = await tamanhoImagem(file); if (!tam) return null;
  const L = 640, H = Math.max(2, Math.round(tam.h * L / tam.w / 2) * 2), buf = await cinza(file, L);
  if (buf.length < L * H) return null;
  // só o miolo (60% central) e uma grade que ignora fundo liso: média das 4 regiões mais detalhadas
  const x0 = Math.floor(L * .2), x1 = Math.floor(L * .8), y0 = Math.floor(H * .2), y1 = Math.floor(H * .8), cel = 32, vals = [];
  for (let by = y0; by + cel < y1; by += cel) for (let bx = x0; bx + cel < x1; bx += cel) {
    let s = 0, s2 = 0, n = 0;
    for (let y = by + 1; y < by + cel - 1; y++) for (let x = bx + 1; x < bx + cel - 1; x++) {
      const i = y * L + x, lap = 4 * buf[i] - buf[i - 1] - buf[i + 1] - buf[i - L] - buf[i + L]; s += lap; s2 += lap * lap; n++;
    }
    vals.push(s2 / n - (s / n) ** 2);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => b - a);
  const top = vals.slice(0, Math.max(1, Math.ceil(vals.length * .35)));
  return top.reduce((a, b) => a + b, 0) / top.length;
}

// Impacto visual (sem API): contraste (percentil 95 menos 5 da luz, 0 a 255) e foco no assunto (detalhe do miolo dividido pelo detalhe das bordas; acima de 1 = assunto no centro).
export async function medeImpacto(file) {
  const tam = await tamanhoImagem(file); if (!tam) return null;
  const L = 320, H = Math.max(2, Math.round(tam.h * L / tam.w / 2) * 2), buf = await cinza(file, L);
  if (buf.length < L * H) return null;
  const hist = new Array(256).fill(0); for (let i = 0; i < L * H; i++) hist[buf[i]]++;
  const pct = q => { let a = 0; const alvo = L * H * q; for (let v = 0; v < 256; v++) { a += hist[v]; if (a >= alvo) return v; } return 255; };
  const contraste = pct(.95) - pct(.05);
  let mi = 0, ni = 0, bo = 0, nb = 0; const x0 = Math.floor(L * .25), x1 = Math.floor(L * .75), y0 = Math.floor(H * .25), y1 = Math.floor(H * .75);
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < L - 1; x++) {
    const i = y * L + x, g = Math.abs(buf[i + 1] - buf[i - 1]) + Math.abs(buf[i + L] - buf[i - L]);
    if (x >= x0 && x < x1 && y >= y0 && y < y1) { mi += g; ni++; } else { bo += g; nb++; }
  }
  const centro = nb && bo ? (mi / ni) / (bo / nb) : 1;
  return { contraste, centro: Math.round(centro * 100) / 100 };
}

export const LIMITES = { nitidezMin: 28, escalaMin: .85 };
// Avalia uma foto no disco: tamanho depois do corte vertical e nitidez. { ok, motivo, w, h, nitidez, escala }
export async function avaliaFoto(file, { W = 1080, H = 1350, limites = LIMITES } = {}) {
  const tam = await tamanhoImagem(file);
  if (!tam) return { ok: true, motivo: 'tamanho não medido', semMedida: true };
  const { ch, escala } = areaUtil(tam.w, tam.h, W, H), r = { w: tam.w, h: tam.h, escala: +escala.toFixed(2) };
  if (escala < limites.escalaMin) return { ...r, ok: false, motivo: `pequena demais (${tam.w}x${tam.h}; depois do corte vertical sobram ${ch}px de altura, a capa pede ${H})` };
  if (!(await temFfmpeg())) return { ...r, ok: true, motivo: 'sem ffmpeg: nitidez não medida', semMedida: true };
  let n = null; try { n = await medeNitidez(file); } catch { /* ferramenta falhou: não derruba a peça */ }
  if (n == null) return { ...r, ok: true, motivo: 'nitidez não medida', semMedida: true };
  r.nitidez = Math.round(n * 10) / 10;
  if (n < limites.nitidezMin) return { ...r, ok: false, motivo: `borrada (nitidez ${r.nitidez}, mínimo ${limites.nitidezMin})` };
  try { const im = await medeImpacto(file); if (im) Object.assign(r, im); } catch { /* impacto nao medido: nao derruba a foto */ }
  return { ...r, ok: true, motivo: 'ok' };
}

// Ordena candidatas dos bancos: primeiro as que cobrem a capa sem esticar, preferindo vertical; empate por tamanho.
export function ordenaCandidatas(itens, { W = 1080, H = 1350, limites = LIMITES } = {}) {
  return itens.filter(it => (it.w || 0) > 0 && (it.h || 0) > 0).map(it => {
    const { escala } = areaUtil(it.w, it.h, W, H), vert = it.h >= it.w * 1.05 ? 1 : 0;
    return { it, escala, nota: Math.min(escala, 1.5) + vert * .15 };
  }).filter(x => x.escala >= limites.escalaMin).sort((a, b) => b.nota - a.nota).map(x => x.it);
}

// Corte vertical onde há mais detalhe (rosto/objeto) + nitidez leve e contraste. Devolve o caminho do JPG pronto.
export async function acabamentoCapa(entrada, saida, { W = 1080, H = 1350 } = {}) {
  const tam = await tamanhoImagem(entrada); if (!tam) throw new Error('imagem ilegível');
  const { cw, ch } = areaUtil(tam.w, tam.h, W, H);
  let cx = Math.floor((tam.w - cw) / 2), cy = 0;
  if (tam.w > cw + 8 && (await temFfmpeg())) {   // foto horizontal: escolhe a janela vertical mais detalhada (varre a largura)
    try {
      const L = 320, Hh = Math.max(2, Math.round(tam.h * L / tam.w)), buf = await cinza(entrada, L), jan = Math.round(cw * L / tam.w);
      const col = new Float64Array(L); for (let x = 1; x < L - 1; x++) { let s = 0; for (let y = 1; y < Hh - 1; y++) { const i = y * L + x; s += Math.abs(buf[i + 1] - buf[i - 1]) + Math.abs(buf[i + L] - buf[i - L]); } col[x] = s; }
      let best = -1, bx = 0, acc = 0; for (let x = 0; x < jan; x++) acc += col[x];
      for (let x = 0; x + jan <= L; x++) { if (x) acc += col[x + jan - 1] - col[x - 1]; const centro = 1 - Math.abs((x + jan / 2) / L - .5) * .5; const sc = acc * centro; if (sc > best) { best = sc; bx = x; } }
      cx = Math.max(0, Math.min(tam.w - cw, Math.round(bx * tam.w / L)));
    } catch { /* fica no centro */ }
  } else if (tam.h > ch + 8) cy = 0;   // foto mais alta que a capa: mantém o topo (rosto)
  const alvoW = Math.max(W, Math.min(cw, 2160)), vf = `crop=${cw}:${ch}:${cx}:${cy},scale=${alvoW}:-2:flags=lanczos,unsharp=5:5:0.5:5:5:0.0,eq=contrast=1.04:saturation=1.04`;
  await run('ffmpeg', ['-v', 'error', '-y', '-i', entrada, '-frames:v', '1', '-vf', vf, '-q:v', '2', saida], { timeout: 60000 });
  return saida;
}

// Ampliação opcional com Real-ESRGAN (programa gratuito, roda no PC). Só age se o executável existir.
export function realesrganBin(raiz) {
  const cand = [process.env.REALESRGAN_BIN, path.join(raiz, 'motor', 'realesrgan', 'realesrgan-ncnn-vulkan.exe'), path.join(raiz, 'motor', 'realesrgan', 'realesrgan-ncnn-vulkan')].filter(Boolean);
  return cand.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) || '';
}
export async function amplia2x(entrada, saida, raiz) {
  const bin = realesrganBin(raiz); if (!bin) return false;
  try { await run(bin, ['-i', entrada, '-o', saida, '-s', '2', '-n', 'realesrgan-x4plus', '-f', 'png'], { cwd: path.dirname(bin), timeout: 180000 }); return fs.existsSync(saida) && fs.statSync(saida).size > 2000; } catch { return false; }
}
export const arquivoTemp = tmp;
