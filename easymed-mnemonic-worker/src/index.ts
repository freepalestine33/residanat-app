import { PROMPT_VERSION, SYSTEM_PROMPT, finalizePrompt, userMessage } from './prompt';
import { MEMO_SYSTEM_PROMPT, MEMO_VERSION, memoUserMessage, validateMemo, type Memo } from './memo';

export interface Env {
  AI: unknown;
  IMAGES: KVNamespace;
  ALLOWED_ORIGINS?: string;
  ALLOW_LOCALHOST?: string;
  DAILY_NEURON_BUDGET?: string; // our own safety cap, below Cloudflare's 10,000 free neurons/day
  DAILY_PER_IP?: string;        // new generations (memos + illustrations) per visitor per UTC day
  IMAGE_STEPS?: string;
  LLM_MODEL?: string;           // writes the illustration prompt (cheap model is fine)
  MEMO_MODEL?: string;          // writes the memo JSON (needs good French + JSON)
}
type AiLike = { run(model: string, input: unknown): Promise<any> };

const IMAGE_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const DEFAULT_LLM = '@cf/meta/llama-3.2-3b-instruct';
const DEFAULT_MEMO_MODEL = '@cf/mistralai/mistral-small-3.1-24b-instruct';
// Rough neuron cost per NEW generation (from Cloudflare's price list, rounded up).
const MEMO_COST = 60;
const IMAGE_COST = 80;
const MAX_Q = 600;
const MAX_A = 1200;
const MAX_VARIANT = 3;
const IMG_TTL_SECONDS = 60 * 60 * 24 * 120;
const MEMO_TTL_SECONDS = 60 * 60 * 24 * 365;

/* ---------- helpers ---------- */
const enc = new TextEncoder();
async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const norm = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();
const today = () => new Date().toISOString().slice(0, 10); // UTC day = Cloudflare's reset time
const int = (v: string | undefined, d: number) => (v && Number.isFinite(+v) ? Math.max(0, Math.floor(+v)) : d);

function allowedOrigin(req: Request, env: Env): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes(origin)) return origin;
  if (env.ALLOW_LOCALHOST === 'true' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}
function cors(origin: string | null): HeadersInit {
  return origin
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' }
    : { Vary: 'Origin' };
}
function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors(origin) } });
}
const err = (code: string, message: string, status: number, origin: string | null) => json({ error: code, message }, status, origin);

const peek = async (kv: KVNamespace, key: string) => parseInt((await kv.get(key)) ?? '0', 10) || 0;
async function bump(kv: KVNamespace, key: string, by = 1) {
  await kv.put(key, String((await peek(kv, key)) + by), { expirationTtl: 60 * 60 * 48 });
}
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ---------- request parsing & budgets ---------- */
type Parsed = { question: string; answer: string; variant: number };
async function parseCard(req: Request, origin: string): Promise<Parsed | Response> {
  let body: any;
  try { body = await req.json(); } catch { return err('bad_json', 'Body must be JSON.', 400, origin); }
  const question = typeof body?.question === 'string' ? norm(body.question) : '';
  const answer = typeof body?.answer === 'string' ? norm(body.answer) : '';
  const variant = Number.isInteger(body?.variant) ? body.variant : 0;
  if (!question || !answer) return err('missing_fields', 'question and answer are required.', 400, origin);
  if (question.length > MAX_Q || answer.length > MAX_A) return err('too_long', `question max ${MAX_Q} chars, answer max ${MAX_A}.`, 413, origin);
  if (variant < 0 || variant > MAX_VARIANT) return err('bad_variant', `variant must be 0..${MAX_VARIANT}.`, 400, origin);
  return { question, answer, variant };
}

/** Checks the free-tier budgets and reserves them. Returns a Response if refused. */
async function reserve(env: Env, req: Request, origin: string, cost: number): Promise<Response | null> {
  const day = today();
  const ip = req.headers.get('CF-Connecting-IP') ?? 'unknown';
  const ipKey = `cnt:ip:${(await sha256Hex(ip)).slice(0, 16)}:${day}`;
  const nKey = `cnt:neurons:${day}`;
  if ((await peek(env.IMAGES, nKey)) + cost > int(env.DAILY_NEURON_BUDGET, 9000))
    return err('daily_limit', "Le quota gratuit du jour est atteint. Réessayez demain.", 429, origin);
  if ((await peek(env.IMAGES, ipKey)) >= int(env.DAILY_PER_IP, 15))
    return err('user_limit', "Vous avez atteint votre limite pour aujourd'hui.", 429, origin);
  await bump(env.IMAGES, nKey, cost);
  await bump(env.IMAGES, ipKey);
  return null;
}

/* ---------- /memo : structured infographic content ---------- */
async function writeMemo(env: Env, p: Parsed): Promise<Memo | null> {
  const ai = env.AI as AiLike;
  const messages = [
    { role: 'system', content: MEMO_SYSTEM_PROMPT },
    { role: 'user', content: memoUserMessage(p.question, p.answer) },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {          // one retry if the JSON is unusable
    try {
      const res = await ai.run(env.MEMO_MODEL || DEFAULT_MEMO_MODEL, {
        messages, max_tokens: 700, temperature: attempt === 0 ? 0.3 : 0.1,
      });
      const memo = validateMemo(res?.response);
      if (memo) return memo;
    } catch { /* try again */ }
  }
  return null;
}

async function handleMemo(req: Request, env: Env, origin: string | null): Promise<Response> {
  if (!origin) return err('forbidden_origin', 'Origin not allowed.', 403, null);
  const p = await parseCard(req, origin);
  if (p instanceof Response) return p;

  const key = (await sha256Hex(`${MEMO_VERSION}|${p.variant}|${p.question}|${p.answer}`)).slice(0, 40);
  const cached = await env.IMAGES.get(`memo:${key}`);
  if (cached) { try { return json({ memo: JSON.parse(cached), cached: true }, 200, origin); } catch { /* regenerate */ } }

  const refused = await reserve(env, req, origin, MEMO_COST);
  if (refused) return refused;

  const memo = await writeMemo(env, p);
  if (!memo) return err('generation_failed', "La création du mémo a échoué. Réessayez dans un instant.", 502, origin);
  await env.IMAGES.put(`memo:${key}`, JSON.stringify(memo), { expirationTtl: MEMO_TTL_SECONDS });
  return json({ memo, cached: false }, 200, origin);
}

/* ---------- /generate : optional text-free illustration (FLUX) ---------- */
async function writeImagePrompt(env: Env, question: string, answer: string) {
  const ai = env.AI as AiLike;
  try {
    const res = await ai.run(env.LLM_MODEL || DEFAULT_LLM, {
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userMessage(question, answer) }],
      max_tokens: 160, temperature: 0.8,
    });
    return finalizePrompt(res?.response, question, answer);
  } catch {
    return finalizePrompt('', question, answer);
  }
}
async function drawImage(env: Env, prompt: string, seed: number): Promise<Uint8Array> {
  const steps = Math.min(8, Math.max(1, int(env.IMAGE_STEPS, 4)));
  const res = await (env.AI as AiLike).run(IMAGE_MODEL, { prompt, steps, seed });
  if (!res?.image || typeof res.image !== 'string') throw new Error('no image returned');
  return b64ToBytes(res.image);
}

async function handleGenerate(req: Request, env: Env, origin: string | null, reqUrl: URL): Promise<Response> {
  if (!origin) return err('forbidden_origin', 'Origin not allowed.', 403, null);
  const p = await parseCard(req, origin);
  if (p instanceof Response) return p;

  const key = (await sha256Hex(`${PROMPT_VERSION}|${p.variant}|${p.question}|${p.answer}`)).slice(0, 40);
  const imageUrl = `${reqUrl.origin}/img/${key}`;
  const hit = await env.IMAGES.getWithMetadata(`img:${key}`, { type: 'stream' });
  if (hit.value) { await hit.value.cancel(); return json({ url: imageUrl, cached: true }, 200, origin); }

  const refused = await reserve(env, req, origin, IMAGE_COST);
  if (refused) return refused;
  try {
    const { prompt, usedFallback } = await writeImagePrompt(env, p.question, p.answer);
    const bytes = await drawImage(env, prompt, parseInt(key.slice(0, 6), 16) + p.variant);
    await env.IMAGES.put(`img:${key}`, bytes, { expirationTtl: IMG_TTL_SECONDS, metadata: { prompt, usedFallback, at: Date.now() } });
    return json({ url: imageUrl, cached: false }, 200, origin);
  } catch {
    return err('generation_failed', "La génération a échoué. Réessayez dans un instant.", 502, origin);
  }
}

async function handleImage(key: string, env: Env): Promise<Response> {
  const data = await env.IMAGES.get(`img:${key}`, { type: 'arrayBuffer' });
  if (!data) return new Response('Not found', { status: 404 });
  return new Response(data, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Origin': '*', // lets the PNG export read the picture (the URL is an unguessable hash)
    },
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = allowedOrigin(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: origin ? 204 : 403, headers: cors(origin) });
    if (req.method === 'POST' && url.pathname === '/memo') return handleMemo(req, env, origin);
    if (req.method === 'POST' && url.pathname === '/generate') return handleGenerate(req, env, origin, url);
    const m = req.method === 'GET' && url.pathname.match(/^\/img\/([a-f0-9]{40})$/);
    if (m) return handleImage(m[1], env);
    if (req.method === 'GET' && url.pathname === '/') return new Response('easymed-mnemonic worker: ok');
    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
