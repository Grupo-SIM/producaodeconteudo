// Narração ElevenLabs sincronizada palavra a palavra com o spec.json
//
// Uso:
//   Configure o .env (veja .env.example): ELEVENLABS_API_KEY e ELEVENLABS_VOICE_ID
//   node elevenlabs-voz.mjs spec.json [--voice-id ID] [--model eleven_multilingual_v2] [--out voz]
//
// Cada cena do spec pode ter "narration". O script usa o endpoint with-timestamps, que devolve o
// instante de cada caractere falado, e com isso:
//   • ajusta "dur" de cada cena à fala real
//   • preenche "times" de cada palavra na tela (a palavra-chave estoura quando é dita)
//   • monta voz/voz.mp3 e voz/spec.sync.json
// Depois: node render.mjs voz/spec.sync.json saida.mp4 --voice voz/voz.mp3 --music trilha.mp3
import './env.mjs';                         // lê o arquivo .env
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const BASE = process.env.ELEVEN_BASE || 'https://api.elevenlabs.io';
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('Defina ELEVENLABS_API_KEY no arquivo .env (copie de .env.example) ou no ambiente.'); process.exit(1); }

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const specPath = args.find(a => a.endsWith('.json'));
const voiceId = opt('--voice-id', process.env.ELEVENLABS_VOICE_ID);
if (!specPath || !voiceId) { console.error('Uso: node elevenlabs-voz.mjs spec.json [--voice-id ID] [--model ID] [--out voz]  (ou defina ELEVENLABS_VOICE_ID no .env)'); process.exit(1); }
const model = opt('--model', process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2');
const outDir = opt('--out', 'voz');
const PAD = 0.3;                                   // respiro depois da fala de cada cena
fs.mkdirSync(outDir, { recursive: true });

const dur = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const nWordsOf = T => T.value.split('|').join(' ').trim().split(/\s+/).filter(Boolean).length;

// palavras faladas com início, a partir do alinhamento por caractere
function spokenWords(al) {
  const ch = al.characters, st = al.character_start_times_seconds, en = al.character_end_times_seconds;
  const words = []; let cur = null;
  ch.forEach((c, i) => {
    if (/\s/.test(c)) { if (cur) { words.push(cur); cur = null; } return; }
    if (!cur) cur = { start: st[i], end: en[i] };
    cur.end = en[i];
  });
  if (cur) words.push(cur);
  return words;
}

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const clips = [];
let t0 = 0;

for (const [i, s] of spec.scenes.entries()) {
  if (!s.narration) { t0 += s.dur; continue; }
  const r = await fetch(`${BASE}/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: s.narration, model_id: model }),
  });
  const raw = await r.text();
  if (!r.ok) throw new Error(`ElevenLabs cena ${i} → HTTP ${r.status}: ${raw.slice(0, 300)}`);
  const res = JSON.parse(raw);
  const file = path.join(outDir, `cena${String(i).padStart(2, '0')}.mp3`);
  fs.writeFileSync(file, Buffer.from(res.audio_base64, 'base64'));
  const d = dur(file);
  const words = spokenWords(res.alignment || res.normalized_alignment);
  const M = words.length;

  // tempo de cada palavra na tela = início da palavra falada correspondente
  const texts = Array.isArray(s.text) ? s.text : s.text ? [s.text] : [];
  const N = texts.reduce((a, T) => a + nWordsOf(T), 0);
  let k = 0;
  texts.forEach(T => {
    const n = nWordsOf(T);
    T.times = Array.from({ length: n }, () => {
      const idx = N === M ? k : Math.round(k * (M - 1) / Math.max(1, N - 1));
      k++;
      return +Math.max(0.05, (words[Math.min(M - 1, idx)]?.start ?? 0.1) - 0.04).toFixed(3);   // 40ms antes: o olho precisa ver antes de ouvir
    });
  });

  s.dur = +Math.max(s.dur, d + PAD).toFixed(2);
  clips.push({ file, at: t0 });
  console.log(`cena ${i}: fala ${d.toFixed(2)}s, ${M} palavras → dur ${s.dur}s`);
  t0 += s.dur;
}

if (!clips.length) { console.error('Nenhuma cena tem o campo "narration" no spec. Adicione o texto falado em cada cena.'); process.exit(1); }
const inputs = clips.flatMap(c => ['-i', c.file]);
const filt = clips.map((c, j) => `[${j}:a]adelay=${Math.round(c.at * 1000)}:all=1[a${j}]`).join(';') +
  ';' + clips.map((_, j) => `[a${j}]`).join('') + `amix=inputs=${clips.length}:normalize=0[o]`;
const voz = path.join(outDir, 'voz.mp3');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filt, '-map', '[o]', '-t', String(t0), voz]);
fs.writeFileSync(path.join(outDir, 'spec.sync.json'), JSON.stringify(spec, null, 1));
console.log(`OK → ${voz} e ${path.join(outDir, 'spec.sync.json')} (${t0.toFixed(1)}s)`);
