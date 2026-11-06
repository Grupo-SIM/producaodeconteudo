// Uso: node render.mjs spec.json saida.mp4 [--voice voz.mp3] [--music trilha.mp3] [--no-sfx] [--preview]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const specPath = args[0], out = args[1] || 'out.mp4';
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const has = k => args.includes(k);
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const fps = spec.fps || 30;
const preview = has('--preview');            // metade da resolução / 15fps para checar rápido
const work = fs.mkdtempSync(path.join(path.dirname(path.resolve(out)), '.m2d-'));

const browser = await chromium.launch({ args: ['--disable-web-security', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: preview ? 0.5 : 1 });
await page.goto(pathToFileURL(path.join(here, 'engine.html')).href);
await page.evaluate(s => window.load(s), spec);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const total = await page.evaluate(() => window.TOTAL);
const rfps = preview ? 15 : fps;
const nFrames = Math.ceil(total * rfps);

const silent = path.join(work, 'video.mp4');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(rfps), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', preview ? '26' : '17', '-preset', preview ? 'veryfast' : 'medium', silent], { stdio: ['pipe', 'inherit', 'inherit'] });
const t0 = Date.now();
for (let f = 0; f < nFrames; f++) {
  await page.evaluate(t => window.renderAt(t), f / rfps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (f % 60 === 0) process.stdout.write(`\rframe ${f}/${nFrames}`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
const events = await page.evaluate(() => window.EVENTS);
await browser.close();
console.log(`\nvídeo pronto em ${((Date.now() - t0) / 1000).toFixed(0)}s — ${events.length} eventos de som`);

// ===== áudio: SFX sintetizados + voz + trilha =====
const sfx = {
  tick: "0.22*sin(2*PI*2400*t)*exp(-110*t)+0.12*sin(2*PI*1200*t)*exp(-60*t)",
  pop: "0.55*sin(2*PI*(500+1800*exp(-45*t))*t)*exp(-28*t)",
  hit: "0.9*sin(2*PI*(55+160*exp(-18*t))*t)*exp(-5*t)+0.25*sin(2*PI*(700+1500*exp(-40*t))*t)*exp(-25*t)",
};
for (const [k, e] of Object.entries(sfx))
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc='${e}':s=48000:d=${k === 'hit' ? 0.9 : 0.25}`, path.join(work, k + '.wav')]);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anoisesrc=d=0.55:c=pink:a=0.5:r=48000',
  '-af', "highpass=f=400,lowpass=f=5000,volume='0.2+1.6*sin(PI*t/0.55)':eval=frame,afade=t=out:st=0.4:d=0.15", path.join(work, 'whoosh.wav')]);

const inputs = [], filters = [], mixes = [];
let n = 0;
const add = f => { inputs.push('-i', f); return n++; };
const voice = opt('--voice'), music = opt('--music');
if (!has('--no-sfx')) {
  const vol = { tick: voice ? 0.35 : 0.6, pop: voice ? 0.5 : 0.8, hit: voice ? 0.55 : 0.9, whoosh: voice ? 0.45 : 0.7 };
  const ev = events.filter(e => e.t >= 0 && e.t < total).sort((a, b) => a.t - b.t);
  const byKind = {};
  ev.forEach(e => (byKind[e.kind] ||= []).push(e.t));
  for (const [k, ts] of Object.entries(byKind)) {
    const i = add(path.join(work, k + '.wav'));
    const labels = ts.map((_, j) => `[${k}${j}]`);
    filters.push(`[${i}:a]volume=${vol[k]},asplit=${ts.length}${labels.join('')}`);
    ts.forEach((t, j) => { filters.push(`${labels[j]}adelay=${Math.round(t * 1000)}:all=1[${k}d${j}]`); mixes.push(`[${k}d${j}]`); });
  }
}
if (voice) { const i = add(voice); filters.push(`[${i}:a]volume=1.0[vo]`); mixes.push('[vo]'); }
if (music) {
  const i = add(music);
  filters.push(`[${i}:a]atrim=0:${total},asetpts=N/SR/TB,volume=${voice ? 0.22 : 0.6},afade=t=in:d=0.3,afade=t=out:st=${Math.max(0, total - 1.2)}:d=1.2[mu]`);
  mixes.push('[mu]');
}
if (!mixes.length) { fs.copyFileSync(silent, out); }
else {
  filters.push(`${mixes.join('')}amix=inputs=${mixes.length}:normalize=0:dropout_transition=0,atrim=0:${total},alimiter=limit=0.8[aout]`);
  const vi = n;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-i', silent, '-filter_complex', filters.join(';'),
    '-map', `${vi}:v`, '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
}
fs.rmSync(work, { recursive: true, force: true });
console.log('OK →', out);
