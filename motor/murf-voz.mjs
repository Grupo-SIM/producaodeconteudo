// Integração Murf.ai → narração sincronizada com o spec.json
//
// Uso:
//   Configure o .env (veja .env.example): MURF_API_KEY e MURF_VOICE_ID
//   node murf-voz.mjs --list [--locale pt-BR]     lista vozes disponíveis
//   node murf-voz.mjs spec.json --voice-id ID [--locale pt-BR] [--out voz]
//
// Cada cena do spec pode ter "narration": "texto falado". O script gera um áudio por cena,
// mede a duração real, ajusta "dur" da cena e os tempos das palavras, e monta voz/voz.mp3 +
// voz/spec.sync.json. Depois:  node render.mjs voz/spec.sync.json saida.mp4 --voice voz/voz.mp3 --music trilha.mp3
import './env.mjs';                         // lê o arquivo .env
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const API = 'https://api.murf.ai/v1';
const key = process.env.MURF_API_KEY;
if (!key) { console.error('Defina MURF_API_KEY no arquivo .env (copie de .env.example) ou no ambiente.'); process.exit(1); }

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = k => args.includes(k);
const locale = opt('--locale', 'pt-BR');
const headers = { 'api-key': key, 'Content-Type': 'application/json' };

async function api(p, init = {}) {
  const r = await fetch(API + p, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  const body = await r.text();
  if (!r.ok) throw new Error(`Murf ${p} → HTTP ${r.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}
const dur = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

if (has('--list')) {
  const voices = await api('/speech/voices');
  const list = (Array.isArray(voices) ? voices : voices.voices || []).filter(v =>
    JSON.stringify(v).toLowerCase().includes(locale.toLowerCase()));
  list.forEach(v => console.log([v.voiceId, v.displayName || v.name, v.locale || '', v.gender || ''].join('\t')));
  console.log(`${list.length} vozes para ${locale}`);
  process.exit(0);
}

const specPath = args.find(a => a.endsWith('.json'));
const voiceId = opt('--voice-id', process.env.MURF_VOICE_ID);
if (!specPath || !voiceId) { console.error('Uso: node murf-voz.mjs spec.json --voice-id ID [--locale pt-BR] [--out voz]'); process.exit(1); }
const outDir = opt('--out', 'voz');
fs.mkdirSync(outDir, { recursive: true });
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const PAD = 0.3;                       // respiro depois da fala de cada cena
const clips = [];
let t0 = 0;

for (const [i, s] of spec.scenes.entries()) {
  if (!s.narration) { t0 += s.dur; continue; }
  const res = await api('/speech/generate', {
    method: 'POST',
    body: JSON.stringify({ text: s.narration, voiceId, locale, format: 'MP3', sampleRate: 44100 }),
  });
  const url = res.audioFile || res.audio_file;
  if (!url) throw new Error('Resposta sem audioFile: ' + JSON.stringify(res).slice(0, 200));
  const raw = path.join(outDir, `cena${String(i).padStart(2, '0')}.mp3`);
  fs.writeFileSync(raw, Buffer.from(await (await fetch(url)).arrayBuffer()));
  const d = dur(raw);
  const total = Math.max(s.dur, d + PAD);
  // tempos das palavras distribuídos pela duração real da fala
  const texts = (Array.isArray(s.text) ? s.text : s.text ? [s.text] : []);
  const nWords = texts.reduce((a, T) => a + T.value.split('|').join(' ').trim().split(/\s+/).filter(Boolean).length, 0);
  if (nWords) {
    const lead = 0.08, step = Math.max(0.09, (d - lead) / nWords);
    let k = 0;
    texts.forEach(T => {
      const n = T.value.split('|').join(' ').trim().split(/\s+/).filter(Boolean).length;
      T.times = Array.from({ length: n }, () => +(lead + (k++) * step).toFixed(3));
    });
  }
  s.dur = +total.toFixed(2);
  clips.push({ file: raw, at: t0 });
  console.log(`cena ${i}: fala ${d.toFixed(2)}s → dur ${s.dur}s`);
  t0 += s.dur;
}

// monta voz.mp3 com cada trecho no início da sua cena
if (!clips.length) { console.error('Nenhuma cena tem o campo "narration" no spec. Adicione o texto falado em cada cena.'); process.exit(1); }
const inputs = clips.flatMap(c => ['-i', c.file]);
const filt = clips.map((c, j) => `[${j}:a]adelay=${Math.round(c.at * 1000)}:all=1[a${j}]`).join(';') +
  ';' + clips.map((_, j) => `[a${j}]`).join('') + `amix=inputs=${clips.length}:normalize=0[o]`;
const voz = path.join(outDir, 'voz.mp3');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filt, '-map', '[o]', '-t', String(t0), voz]);
fs.writeFileSync(path.join(outDir, 'spec.sync.json'), JSON.stringify(spec, null, 1));
console.log(`OK → ${voz} e ${path.join(outDir, 'spec.sync.json')} (${t0.toFixed(1)}s)`);
