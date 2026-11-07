// Pipeline completo: objetos (fal.ai) → voz (ElevenLabs ou Murf) → trilha → render
//
// Uso:
//   cp .env.example .env   (e preencha as chaves)
//   node pipeline.mjs spec.ia.json saida.mp4 [--voz elevenlabs|murf] [--voice-id ID] [--music minha-trilha.mp3] [--skip-objetos] [--skip-voz] [--voice-file narracao.mp3] [--sem-audio] [--preview]
// Sem --voz, usa ElevenLabs se houver ELEVENLABS_API_KEY; senão Murf se houver MURF_API_KEY (ou VOZ_PROVIDER no .env).
//
// Sem --music, gera uma trilha base com musica.mjs. Cada etapa pode ser pulada para reaproveitar o que já existe.
import './env.mjs';                         // lê o arquivo .env (as etapas filhas herdam as variáveis)
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const [specIn, out] = args.filter(a => !a.startsWith('--') && (a.endsWith('.json') || a.endsWith('.mp4')));
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = k => args.includes(k);
if (!specIn || !out) { console.error('Uso: node pipeline.mjs spec.json saida.mp4 [--voz elevenlabs|murf] [--voice-id ID] [--music arq.mp3] [--skip-objetos] [--skip-voz] [--preview]'); process.exit(1); }
const run = (cmd, a) => {
  try { execFileSync(cmd, a, { stdio: 'inherit', cwd: process.cwd() }); }
  catch (e) { console.error(`\n✗ Etapa falhou: ${path.basename(String(a[0]))} (código ${e.status ?? '?'}). A causa está nas linhas acima.`); process.exit(e.status || 1); }
};
const step = n => console.log(`\n=== ${n} ===`);

let spec = specIn;
if (!has('--skip-objetos')) {
  step('1/4 objetos com fundo transparente (fal.ai)');
  run(process.execPath, [path.join(here, 'fal-objetos.mjs'), spec, '--out', 'objetos']);
  spec = 'objetos/spec.objetos.json';
}
let voice = opt('--voice-file');   // narração já gravada (biblioteca): sincroniza o texto com faster-whisper, se instalado
if (voice) {
  step('2/4 narração própria: ' + path.basename(voice));
  try { execFileSync(process.execPath, [path.join(here, 'whisper-sync.mjs'), spec, voice, '--out', 'voz'], { stdio: 'inherit' }); spec = 'voz/spec.sync.json'; }
  catch { console.log('Sem sincronia por palavra: o texto segue os tempos do spec.'); }
} else if (!has('--skip-voz')) {
  const prov = opt('--voz', process.env.VOZ_PROVIDER || (process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : process.env.MURF_API_KEY ? 'murf' : 'elevenlabs'));
  const murf = prov === 'murf';
  const voiceId = opt('--voice-id', murf ? process.env.MURF_VOICE_ID : process.env.ELEVENLABS_VOICE_ID);
  if (!voiceId) { console.error(`Falta o ID da voz: use --voice-id ou defina ${murf ? 'MURF_VOICE_ID' : 'ELEVENLABS_VOICE_ID'} no .env (ou use --skip-voz).`); process.exit(1); }
  step(`2/4 narração sincronizada (${murf ? 'Murf' : 'ElevenLabs'})`);
  run(process.execPath, [path.join(here, murf ? 'murf-voz.mjs' : 'elevenlabs-voz.mjs'), spec, '--voice-id', voiceId, '--out', 'voz']);
  spec = 'voz/spec.sync.json'; voice = 'voz/voz.mp3';
}
let music = opt('--music');
const semAudio = has('--sem-audio');   // vídeo totalmente mudo: sem voz, sem trilha e sem efeitos
if (semAudio) step('3/4 sem áudio (trilha e efeitos desligados)');
else if (!music) {
  step('3/4 trilha base');
  const total = JSON.parse(fs.readFileSync(spec, 'utf8')).scenes.reduce((a, s) => a + s.dur, 0);
  music = 'trilha-base.mp3';
  run(process.execPath, [path.join(here, 'musica.mjs'), String(Math.ceil(total) + 1), music, '110']);
} else step('3/4 trilha própria: ' + music);
step('4/4 render');
run(process.execPath, [path.join(here, 'render.mjs'), spec, out, ...(voice ? ['--voice', voice] : []), ...(semAudio ? ['--no-sfx'] : ['--music', music]), ...(has('--preview') ? ['--preview'] : [])]);
console.log('\nPronto →', out);
