// Objetos de cena com fundo transparente via fal.ai (gera a imagem e recorta o fundo)
//
// Uso:
//   Configure o .env (veja .env.example): FAL_KEY, FAL_GEN_MODEL e FAL_BG_MODEL
//   node fal-objetos.mjs spec.json [--out objetos] [--gen-model fal-ai/flux/schnell] [--bg-model fal-ai/birefnet/v2]
//
// Em qualquer item do spec, troque o emoji por:  "gen": "descrição do objeto em inglês"
// O script gera o PNG transparente, guarda em objetos/ (cache por prompt, não paga duas vezes pelo mesmo)
// e grava objetos/spec.objetos.json com o item já convertido para {"type":"img","src":"file://..."}.
import './env.mjs';                         // lê o arquivo .env
import fs from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import crypto from 'crypto';

const BASE = process.env.FAL_BASE || 'https://fal.run';
const key = process.env.FAL_KEY;
if (!key) { console.error('Defina FAL_KEY no arquivo .env (copie de .env.example) ou no ambiente.'); process.exit(1); }

const args = process.argv.slice(2);
const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const specPath = args.find(a => a.endsWith('.json'));
if (!specPath) { console.error('Uso: node fal-objetos.mjs spec.json [--out objetos]'); process.exit(1); }
const outDir = path.resolve(opt('--out', 'objetos'));
const genModel = opt('--gen-model', process.env.FAL_GEN_MODEL || 'fal-ai/flux/schnell');
const bgModel = opt('--bg-model', process.env.FAL_BG_MODEL || 'fal-ai/birefnet/v2');
fs.mkdirSync(outDir, { recursive: true });

// o estilo fica fixo para todos os objetos do vídeo parecerem da mesma família
const STYLE = 'single object, centered, glossy 3D render, soft studio lighting, high detail, isolated on a plain white background, no text, no shadow';

async function call(model, body) {
  const r = await fetch(`${BASE}/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`fal ${model} → HTTP ${r.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}
const download = async (url, file) => fs.writeFileSync(file, Buffer.from(await (await fetch(url)).arrayBuffer()));

const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
let gasto = 0;
for (const [si, s] of spec.scenes.entries()) {
  for (const [ii, it] of (s.items || []).entries()) {
    if (!it.gen) continue;
    const id = crypto.createHash('sha1').update(it.gen + genModel + bgModel).digest('hex').slice(0, 12);
    const png = path.join(outDir, `${id}.png`);
    if (!fs.existsSync(png)) {
      const g = await call(genModel, { prompt: `${it.gen}, ${STYLE}`, image_size: 'square_hd', num_inference_steps: 4, num_images: 1 });
      const imgUrl = g.images?.[0]?.url;
      if (!imgUrl) throw new Error('fal: resposta de geração sem images[0].url');
      const b = await call(bgModel, { image_url: imgUrl, output_format: 'png' });
      const cutUrl = b.image?.url || b.images?.[0]?.url;
      if (!cutUrl) throw new Error('fal: resposta de recorte sem image.url');
      await download(cutUrl, png);
      gasto++;
      console.log(`cena ${si} item ${ii}: "${it.gen.slice(0, 40)}" → ${path.basename(png)}`);
    } else console.log(`cena ${si} item ${ii}: já em cache (${path.basename(png)})`);
    it.type = 'img'; it.src = pathToFileURL(png).href; delete it.value;
  }
}
const out = path.join(outDir, 'spec.objetos.json');
fs.writeFileSync(out, JSON.stringify(spec, null, 1));
console.log(`OK → ${out} (${gasto} objetos novos gerados)`);
