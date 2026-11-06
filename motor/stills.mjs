// Uso: node stills.mjs spec.json pasta_saida [t1 t2 ...]  → PNGs + contact sheet
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs'; import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url'; import { execFileSync } from 'child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const [specPath, outDir, ...ts] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto(pathToFileURL(path.join(here, 'engine.html')).href);
await p.evaluate(s => window.load(s), JSON.parse(fs.readFileSync(specPath, 'utf8')));
await p.evaluate(() => document.fonts.ready);
let times = ts.map(Number);
if (!times.length) { // meio-fim de cada cena
  times = await p.evaluate(() => SCENES.map(S => +(S.t0 + S.dur * 0.8).toFixed(2)));
}
for (const [i, t] of times.entries()) { await p.evaluate(t => renderAt(t), t); await p.screenshot({ path: path.join(outDir, `f${String(i).padStart(2, '0')}.png`) }); }
await b.close();
const cols = Math.min(6, times.length), rows = Math.ceil(times.length / cols);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(outDir, 'f%02d.png'), '-vf', `scale=270:-1,tile=${cols}x${rows}`, '-frames:v', '1', path.join(outDir, 'sheet.png')]);
console.log('times', times.join(' '));
