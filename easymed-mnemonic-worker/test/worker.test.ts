import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { type Env } from '../src/index.ts';
import { finalizePrompt, hasPeopleWords } from '../src/prompt.ts';
import { validateMemo, ICON_NAMES } from '../src/memo.ts';

const ORIGIN = 'https://easymed.example';
const MEMO_JSON = JSON.stringify({
  title: 'Marche : le trio de l’appui', subtitle: 'QUAD – FESSIER – TRICEPS',
  steps: [
    { icon: 'shield-check', tag: 'frein', heading: 'Quadriceps', caption: 'Amortit la mise en charge.' },
    { icon: 'scale', tag: 'NIVEAU', heading: 'Moyen fessier', caption: 'Garde le bassin horizontal.' },
    { icon: 'rocket', tag: 'PROPULSION', heading: 'Triceps sural', caption: 'Propulse vers l’avant.' },
  ],
  legend: [{ term: 'QUAD', meaning: 'Amortit' }, { term: 'FESSIER', meaning: 'Stabilise' }],
});
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');

function makeEnv(over: Partial<Env> = {}, llm = 'A giant red traffic cone blocking a glass pipe filled with tiny red balls, funny and bright') {
  const store = new Map<string, { v: Uint8Array | string; meta?: unknown }>();
  const calls: { model: string; input: any }[] = [];
  const kv = {
    async get(k: string, t?: any) {
      const e = store.get(k); if (!e) return null;
      if (t === 'arrayBuffer' || t?.type === 'arrayBuffer') return (e.v as Uint8Array).buffer;
      return typeof e.v === 'string' ? e.v : null;
    },
    async getWithMetadata(k: string, _t?: any) {
      const e = store.get(k);
      return { value: e ? new ReadableStream() : null, metadata: e?.meta ?? null };
    },
    async put(k: string, v: any, o?: any) { store.set(k, { v: typeof v === 'string' ? v : new Uint8Array(v), meta: o?.metadata }); },
  } as unknown as KVNamespace;
  const AI = {
    async run(model: string, input: any) {
      calls.push({ model, input });
      if (model.includes('flux')) return { image: JPEG_B64 };
      if (model.includes('mistral')) return { response: MEMO_JSON };
      return { response: llm };
    },
  };
  const env: Env = { AI, IMAGES: kv, ALLOWED_ORIGINS: ORIGIN, DAILY_NEURON_BUDGET: '400', DAILY_PER_IP: '3', ...over };
  return { env, calls, store };
}
const post = (body: unknown, origin: string | null = ORIGIN, ip = '1.1.1.1', path = '/generate') =>
  new Request('https://w.example' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}), 'CF-Connecting-IP': ip },
    body: JSON.stringify(body),
  });
const card = { question: 'Quel agent cause la gale ?', answer: 'Sarcoptes scabiei hominis', variant: 0 };

test('generates, stores and serves an image', async () => {
  const { env, calls } = makeEnv();
  const r = await worker.fetch(post(card), env);
  assert.equal(r.status, 200);
  const j: any = await r.json();
  assert.equal(j.cached, false);
  assert.match(j.url, /^https:\/\/w\.example\/img\/[a-f0-9]{40}$/);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepEqual(calls.map((c) => c.model), ['@cf/meta/llama-3.2-3b-instruct', '@cf/black-forest-labs/flux-1-schnell']);
  assert.match(calls[1].input.prompt, /No text/);
  assert.equal(calls[1].input.steps, 4);
  const img = await worker.fetch(new Request(j.url), env);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(new Uint8Array(await img.arrayBuffer())[0], 0xff);
});

test('same card is served from cache with zero AI calls', async () => {
  const { env, calls } = makeEnv();
  await worker.fetch(post(card), env);
  const n = calls.length;
  const r = await worker.fetch(post(card, ORIGIN, '9.9.9.9'), env);
  assert.equal(((await r.json()) as any).cached, true);
  assert.equal(calls.length, n);
});

test('different variant => different image', async () => {
  const { env } = makeEnv();
  const a: any = await (await worker.fetch(post(card), env)).json();
  const b: any = await (await worker.fetch(post({ ...card, variant: 1 }), env)).json();
  assert.notEqual(a.url, b.url);
});

test('people words from the LLM are rejected -> template prompt used', async () => {
  const { env, calls } = makeEnv({}, 'A smiling doctor holding a scabies mite while a patient laughs');
  await worker.fetch(post(card), env);
  const p: string = calls[1].input.prompt;
  assert.ok(!hasPeopleWords(p), p);
  assert.match(p, /Sarcoptes/);
});

test('LLM failure falls back to template and still draws', async () => {
  const { env, calls } = makeEnv();
  (env.AI as any).run = async (model: string, input: any) => {
    calls.push({ model, input });
    if (!model.includes('flux')) throw new Error('llm down');
    return { image: JPEG_B64 };
  };
  const r = await worker.fetch(post(card), env);
  assert.equal(r.status, 200);
});

test('image model failure -> 502 and nothing cached', async () => {
  const { env, store } = makeEnv();
  (env.AI as any).run = async (m: string) => { if (m.includes('flux')) throw new Error('boom'); return { response: 'x'.repeat(40) }; };
  const r = await worker.fetch(post(card), env);
  assert.equal(r.status, 502);
  assert.ok(![...store.keys()].some((k) => k.startsWith('img:')));
});

test('validation', async () => {
  const { env } = makeEnv();
  assert.equal((await worker.fetch(post({ question: 'q' }), env)).status, 400);
  assert.equal((await worker.fetch(post({ ...card, variant: 9 }), env)).status, 400);
  assert.equal((await worker.fetch(post({ ...card, answer: 'a'.repeat(1300) }), env)).status, 413);
  const bad = new Request('https://w.example/generate', { method: 'POST', headers: { Origin: ORIGIN }, body: '{nope' });
  assert.equal((await worker.fetch(bad, env)).status, 400);
});

test('foreign origin is blocked, localhost allowed only when enabled', async () => {
  const { env } = makeEnv();
  assert.equal((await worker.fetch(post(card, 'https://evil.example'), env)).status, 403);
  assert.equal((await worker.fetch(post(card, null), env)).status, 403);
  assert.equal((await worker.fetch(post(card, 'http://localhost:5173'), env)).status, 403);
  const dev = makeEnv({ ALLOW_LOCALHOST: 'true' });
  assert.equal((await worker.fetch(post(card, 'http://localhost:5173'), dev.env)).status, 200);
});

test('CORS preflight', async () => {
  const { env } = makeEnv();
  const r = await worker.fetch(new Request('https://w.example/generate', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});

test('per-visitor limit then global cap (cache hits are free)', async () => {
  const { env } = makeEnv();
  for (let i = 0; i < 3; i++) assert.equal((await worker.fetch(post({ ...card, answer: 'a' + i }), env)).status, 200);
  const r = await worker.fetch(post({ ...card, answer: 'a-new' }), env);
  assert.equal(r.status, 429);
  assert.equal(((await r.json()) as any).error, 'user_limit');
  assert.equal((await worker.fetch(post({ ...card, answer: 'a0' }), env)).status, 200); // cached
  // other visitors until the global cap (5)
  assert.equal((await worker.fetch(post({ ...card, answer: 'b1' }, ORIGIN, '2.2.2.2'), env)).status, 200);
  assert.equal((await worker.fetch(post({ ...card, answer: 'b2' }, ORIGIN, '2.2.2.2'), env)).status, 200);
  const g = await worker.fetch(post({ ...card, answer: 'b3' }, ORIGIN, '3.3.3.3'), env);
  assert.equal(g.status, 429);
  assert.equal(((await g.json()) as any).error, 'daily_limit');
});

test('img route rejects bad keys and 404s unknown ones', async () => {
  const { env } = makeEnv();
  assert.equal((await worker.fetch(new Request('https://w.example/img/../../x'), env)).status, 404);
  assert.equal((await worker.fetch(new Request('https://w.example/img/' + 'a'.repeat(40)), env)).status, 404);
});

test('finalizePrompt keeps clean output and appends style', () => {
  const r = finalizePrompt('"A giant red key unlocking a bone-shaped padlock in a sunny garden"', 'q', 'a');
  assert.equal(r.usedFallback, false);
  assert.ok(!r.prompt.startsWith('"'));
  assert.match(r.prompt, /sticker illustration/);
});

/* ---------------- memo (infographic) ---------------- */
const memoPost = (b: unknown, o: string | null = ORIGIN, ip = '1.1.1.1') => post(b, o, ip, '/memo');

test('memo: generated, validated, cached; cache hit uses no AI', async () => {
  const { env, calls } = makeEnv();
  const r = await worker.fetch(memoPost(card), env);
  assert.equal(r.status, 200);
  const j: any = await r.json();
  assert.equal(j.cached, false);
  assert.equal(j.memo.steps.length, 3);
  assert.equal(j.memo.steps[0].tag, 'FREIN'); // upper-cased
  assert.equal(calls.length, 1);
  assert.match(calls[0].model, /mistral/);
  assert.ok(calls[0].input.messages[0].content.includes('shield-check'));
  const again: any = await (await worker.fetch(memoPost(card, ORIGIN, '8.8.8.8'), env)).json();
  assert.equal(again.cached, true);
  assert.deepEqual(again.memo, j.memo);
  assert.equal(calls.length, 1);
});

test('memo: invalid JSON is retried once, then 502 and nothing cached', async () => {
  const { env, store } = makeEnv();
  let n = 0;
  (env.AI as any).run = async () => { n++; return { response: n === 1 ? 'désolé, voici...' : MEMO_JSON }; };
  assert.equal((await worker.fetch(memoPost(card), env)).status, 200);
  assert.equal(n, 2);
  const bad = makeEnv();
  (bad.env.AI as any).run = async () => ({ response: 'not json' });
  assert.equal((await worker.fetch(memoPost(card), bad.env)).status, 502);
  assert.ok(![...bad.store.keys()].some((k) => k.startsWith('memo:')));
  assert.ok(store.size > 0);
});

test('memo: shares the daily neuron budget and visitor limit with illustrations', async () => {
  const { env } = makeEnv({ DAILY_NEURON_BUDGET: '130', DAILY_PER_IP: '10' });
  assert.equal((await worker.fetch(memoPost({ ...card, answer: 'm1' }), env)).status, 200);   // 60
  assert.equal((await worker.fetch(memoPost({ ...card, answer: 'm2' }), env)).status, 200);   // 120
  const r = await worker.fetch(post({ ...card, answer: 'm3' }), env);                          // image costs 80 -> over
  assert.equal(r.status, 429);
  assert.equal(((await r.json()) as any).error, 'daily_limit');
});

test('validateMemo: fences, bad icons, clipping, minimum steps', () => {
  const fenced = '```json\n' + MEMO_JSON + '\n```';
  assert.equal(validateMemo(fenced)?.steps.length, 3);
  const m = validateMemo({ title: 'T', steps: [{ icon: 'human-face', heading: 'A', caption: 'x'.repeat(300) }, { icon: 'bone', heading: 'B', caption: 'c' }] })!;
  assert.equal(m.steps[0].icon, 'circle-dot');            // unknown icon -> neutral
  assert.equal(m.steps[0].caption.length, 90);
  assert.equal(validateMemo({ title: 'T', steps: [{ heading: 'only one', caption: 'x' }] }), null);
  assert.equal(validateMemo({ steps: [] }), null);
  const many = validateMemo({ title: 'T', steps: Array.from({ length: 10 }, (_, i) => ({ icon: 'bone', heading: 'h' + i, caption: 'c' })) })!;
  assert.equal(many.steps.length, 6);
  const x = validateMemo({ title: '<script>alert(1)</script>', steps: [{ heading: 'a', caption: 'b' }, { heading: 'c', caption: 'd' }] })!;
  assert.ok(!/[<>]/.test(x.title));
  assert.ok(!(ICON_NAMES as readonly string[]).some((n) => /face|human|person|dog|cat|baby/.test(n)));
});

test('people / animal words rejected in illustration prompts', () => {
  assert.ok(hasPeopleWords('a snail on a leaf'));
  assert.ok(hasPeopleWords('a doctor'));
  assert.ok(!hasPeopleWords('a glass pipe with a red cone'));
});
