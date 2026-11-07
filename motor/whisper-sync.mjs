// Sincroniza uma narração já gravada (voz própria, locutor, áudio da Biblioteca) com o spec.json
//
// Uso:
//   node whisper-sync.mjs spec.json narracao.mp3 [--out voz] [--model small]
//
// Roda o faster-whisper (local, grátis, CPU) para achar o instante de cada palavra falada e:
//   • ajusta "dur" de cada cena para começar quando a fala dela começa
//   • preenche "times" de cada palavra na tela (a palavra aparece quando é dita)
//   • grava voz/spec.sync.json (o áudio é usado como está, a partir do 0)
// Se a cena tiver "narration", as palavras faladas são divididas entre as cenas pela contagem da
// narração; senão, pela contagem das palavras na tela.
// Requer: pip install faster-whisper. Sai com código 2 se não estiver instalado (o pipeline segue sem sincronia).
// Modelo: --model ou WHISPER_MODEL (padrão small; large-v3 é mais preciso e bem mais lento em CPU).
import './env.mjs';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const pos = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const specPath = pos.find(a => a.endsWith('.json'));
const audio = pos.find(a => !a.endsWith('.json'));
if (!specPath || !audio) { console.error('Uso: node whisper-sync.mjs spec.json narracao.mp3 [--out voz] [--model small]'); process.exit(1); }
const outDir = opt('--out', 'voz');
const model = opt('--model', process.env.WHISPER_MODEL || 'small');
const PY = process.env.PYTHON || 'python3';

const pyCode = `
import sys, json
from faster_whisper import WhisperModel
m = WhisperModel(sys.argv[2], device="auto", compute_type="int8")
segs, info = m.transcribe(sys.argv[1], language="pt", word_timestamps=True, vad_filter=True)
print(json.dumps({"dur": info.duration, "words": [{"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3)} for s in segs for w in (s.words or [])]}))
`;

let words, audioDur;
try {
  ({ words, dur: audioDur } = JSON.parse(execFileSync(PY, ['-c', pyCode, audio, model], { maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }).toString()));
} catch (e) {
  const msg = String(e.stderr || e.message);
  if (/No module named|ENOENT/.test(msg)) { console.error('faster-whisper não instalado (pip install faster-whisper). Seguindo sem sincronia.'); process.exit(2); }
  console.error('Falha na transcrição: ' + msg.slice(-400)); process.exit(1);
}
if (!words.length) { console.error('Nenhuma palavra reconhecida no áudio.'); process.exit(1); }

const nWords = v => String(v || '').split('|').join(' ').trim().split(/\s+/).filter(Boolean).length;
const textsOf = s => Array.isArray(s.text) ? s.text : s.text ? [s.text] : [];

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const scenes = spec.scenes;
const useNarr = scenes.every(s => s.narration || !textsOf(s).length);
const weight = scenes.map(s => useNarr ? nWords(s.narration) : textsOf(s).reduce((a, T) => a + nWords(T.value), 0));
const W = weight.reduce((a, b) => a + b, 0) || 1;
const M = words.length;

// fatia de palavras faladas de cada cena: [ini, fim)
let acc = 0;
const range = weight.map(w => { const a = Math.round(acc / W * M); acc += w; return [a, Math.round(acc / W * M)]; });

// início absoluto de cada cena: primeira palavra falada dela (cena sem fala herda o fim da anterior)
const start = [];
scenes.forEach((s, i) => {
  const [a, b] = range[i];
  start[i] = i === 0 ? 0 : b > a ? Math.max(start[i - 1] + 0.3, words[a].start - 0.15) : start[i - 1] + 0.3;
});

scenes.forEach((s, i) => {
  const [a, b] = range[i];
  const end = i + 1 < scenes.length ? start[i + 1] : Math.max(audioDur, (words[M - 1]?.end ?? 0)) + 0.3;
  s.dur = +Math.max(0.3, end - start[i]).toFixed(2);
  const texts = textsOf(s);
  const N = texts.reduce((t, T) => t + nWords(T.value), 0);
  const n = Math.max(1, b - a);
  let k = 0;
  texts.forEach(T => {
    T.times = Array.from({ length: nWords(T.value) }, () => {
      const idx = a + Math.min(n - 1, N === n ? k : Math.round(k * (n - 1) / Math.max(1, N - 1)));
      k++;
      return +Math.max(0.05, (words[Math.min(M - 1, idx)].start - start[i]) - 0.04).toFixed(3);   // 40ms antes, igual ao ElevenLabs
    });
  });
  console.log(`cena ${i}: ${b - a} palavras faladas a partir de ${start[i].toFixed(2)}s → dur ${s.dur}s`);
});

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'spec.sync.json'), JSON.stringify(spec, null, 1));
fs.writeFileSync(path.join(outDir, 'palavras.json'), JSON.stringify(words));
console.log(`OK → ${path.join(outDir, 'spec.sync.json')} (${M} palavras, áudio ${audioDur.toFixed(1)}s)`);
