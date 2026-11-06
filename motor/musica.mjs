// Trilha base sintetizada (sem direitos autorais): pad suave + batida leve no BPM pedido. Funciona em Windows, Mac e Linux.
// Uso: node musica.mjs SEGUNDOS saida.mp3 [BPM]
import { execFileSync } from 'child_process';
const [dur, out, bpmArg] = process.argv.slice(2);
if (!dur || !out) { console.error('Uso: node musica.mjs SEGUNDOS saida.mp3 [BPM]'); process.exit(1); }
const D = Math.max(2, +dur || 20), B = (60 / (+bpmArg || 110)).toFixed(5);
const expr = `0.10*sin(2*PI*110*t)+0.07*sin(2*PI*164.81*t)+0.07*sin(2*PI*220*t)+0.05*sin(2*PI*261.63*t)*(0.6+0.4*sin(2*PI*0.2*t))+0.55*sin(2*PI*(48+110*exp(-30*mod(t,${B})))*mod(t,${B}))*exp(-8*mod(t,${B}))`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=${D}`,
  '-af', `lowpass=f=2500,afade=t=in:d=0.5,afade=t=out:st=${Math.max(0, D - 1.2)}:d=1.2,alimiter=limit=0.8`, '-c:a', 'libmp3lame', '-b:a', '160k', out]);
console.log('trilha base →', out);
