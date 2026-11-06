// Ponte com o ClippyMe (https://github.com/fralapo/clippyme, MIT): programa auto-hospedado que baixa um vídeo longo,
// acha os melhores trechos com o Gemini e corta em vertical 9:16 com legenda. Roda ao lado do painel (Docker) em CLIPPYME_URL.
const BASE = () => String(process.env.CLIPPYME_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const TOKEN = () => String(process.env.CLIPPYME_API_TOKEN || '');
export const geminiKey = () => String(process.env.GEMINI_API_KEY || '').trim();
export const dashboardUrl = () => String(process.env.CLIPPYME_DASHBOARD_URL || 'http://localhost:5175');
const hdr = (extra = {}) => ({ ...(TOKEN() ? { 'x-api-token': TOKEN() } : {}), ...extra });

async function chama(path, { method = 'GET', body, headers, timeout = 15000, raw = false } = {}) {
  const ac = new AbortController(), tm = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(BASE() + path, { method, headers: hdr(headers), body, signal: ac.signal });
    if (raw) return r;
    const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch { /* texto puro */ }
    if (!r.ok) { const d = j?.detail; throw Object.assign(new Error(typeof d === 'string' ? d : d ? JSON.stringify(d).slice(0, 300) : (txt.slice(0, 200) || 'HTTP ' + r.status)), { status: r.status }); }
    return j ?? txt;
  } finally { clearTimeout(tm); }
}
export async function online() { try { const h = await chama('/api/health', { timeout: 2500 }); return h?.status === 'healthy'; } catch { return false; } }
export async function processa({ url, instrucoes, formato, idioma, reframe, semAnalise }) {
  const key = geminiKey(); if (!key) throw new Error('Falta a chave do Gemini: coloque GEMINI_API_KEY no arquivo .env (chave grátis em https://aistudio.google.com/apikey) e reinicie o painel.');
  const corpo = { url: String(url).trim() };
  if (instrucoes) corpo.instructions = String(instrucoes).slice(0, 1500);
  if (['9:16', '1:1', '16:9'].includes(formato)) corpo.aspect = formato;
  if (idioma) corpo.language = String(idioma).slice(0, 16);
  if (['auto', 'disabled', 'subject', 'object'].includes(reframe)) corpo.reframe_mode = reframe;
  if (semAnalise) corpo.skip_analysis = true;
  const r = await chama('/api/process', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gemini-key': key }, body: JSON.stringify(corpo), timeout: 30000 });
  if (!r?.job_id) throw new Error('O ClippyMe não devolveu o número do trabalho');
  return r.job_id;
}
export const status = id => chama('/api/status/' + encodeURIComponent(id));
export const cancela = id => chama('/api/cancel/' + encodeURIComponent(id), { method: 'POST' });
// Resposta crua do arquivo de vídeo (para repassar com suporte a Range)
export const arquivo = (caminho, range) => chama(caminho, { raw: true, timeout: 120000, headers: range ? { range } : {} });
const FINAIS = ['completed', 'failed', 'cancelled', 'stopped'];
export const finalizado = s => FINAIS.includes(String(s || '').toLowerCase());
// Resumo enxuto e seguro de um trabalho para o painel
export function resumo(st) {
  const res = st?.result || {}, clips = (res.clips || []).map((c, i) => ({
    n: i, titulo: String(c.video_title_for_youtube_short || c.title || c.viral_hook_text || 'Corte ' + (i + 1)).slice(0, 140),
    gancho: String(c.viral_hook_text || c.hook_text || '').slice(0, 140), inicio: c.start ?? null, fim: c.end ?? null, nota: c.viral_score ?? c.virality_score ?? c.score ?? null,
    descricao: String(c.video_description_for_tiktok || c.video_description_for_instagram || c.description || '').slice(0, 400), url: c.video_url || ''
  }));
  return { status: String(st?.status || ''), etapa: res.stage || '', progresso: res.progress ?? null, detalhe: res.detail || '', clips, logs: (st?.logs || []).slice(-12).map(l => String(l).slice(0, 300)) };
}
