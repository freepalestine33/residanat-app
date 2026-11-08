import { LectureSchema, type Lecture } from './schema';

export type AiProvider = 'gemini' | 'groq' | 'openrouter' | 'openai';

export interface GenerateLectureOptions {
  provider?: AiProvider;
  apiKey?: string;
  model?: string;
  endpoint?: string;
  isMcqFocused?: boolean;
  onProgress?: (message: string) => void;
}

export interface GenerateLectureInput {
  text: string;
  id: string;
  name: string;
  otrNumber?: number;
}

export interface GenerateLectureResult {
  lecture: Lecture;
  warnings: string[];
}

export const MEDICAL_AI_PROMPT_TEMPLATE = `Tu es un professeur agrégé et assistant de préparation pédagogique pour le concours de Résidanat en médecine (programme officiel ECN / résidanat en français).
Transforme le document fourni en un cours interactif hautement pédagogique, rigoureux et fidèle à la source médicale.

Directives médicales et de fidélité :
- Rigueur absolue : base-toi UNIQUEMENT sur les faits cliniques, diagnostiques et thérapeutiques du texte fourni. N'invente aucun chiffre, dose, seuil, contre-indication ou piège non justifié.
- Si le document est un recueil de QCM / annales d'examens :
  1. Extrais chaque QCM fidèlement avec ses propositions (options vraies et fausses), une explication claire et détaillée pour chaque proposition.
  2. Synthétise les notions clés testées sous forme de fiches mémo (flashcards) dans "cards".
  3. Crée des affirmations Vrai/Faux stimulantes dans "vf" pour cibler les pièges classiques du concours.
- Si le texte est ambigu ou incomplet, omets l'item douteux plutôt que d'extrapoler.
- Veille à lier chaque question de quiz et chaque affirmation vrai/faux à au moins un identifiant de carte ("cards") existant dans la liste "cards".
- Chaque QCM dans "quiz" doit contenir au minimum 2 propositions (idéalement 4 à 5) et au moins une proposition correcte ("ok": true).
- Fournis une explication didactique ("explain" / "w") pour chaque question et cite la section ou la page dans "src".

Retourne STRICTEMENT et UNIQUEMENT un objet JSON valide conforme à la structure suivante (aucun bloc markdown, aucun texte avant ou après) :
{
  "schema": 1,
  "id": "identifiant_stable",
  "name": "Titre officiel du cours",
  "keys": [
    "Point clé 1 incontournable pour le concours",
    "Point clé 2..."
  ],
  "contrasts": [
    "Piège classique / Diagnostic différentiel majeur / Distinction clinique"
  ],
  "cards": [
    {
      "id": "c1",
      "type": "basic",
      "q": "Question de révision courte et ciblée",
      "a": "Réponse précise et synthétique",
      "src": "Section / p. X"
    }
  ],
  "quiz": [
    {
      "id": "q1",
      "q": "Énoncé du QCM médical",
      "src": "Section / p. X",
      "cards": ["c1"],
      "explain": "Justification médicale détaillée de la ou des bonnes réponses.",
      "opts": [
        { "t": "Proposition A", "ok": true, "c": ["c1"] },
        { "t": "Proposition B", "ok": false },
        { "t": "Proposition C", "ok": false }
      ]
    }
  ],
  "vf": [
    {
      "id": "vf1",
      "s": "Affirmation clinique vérifiable dans le cours",
      "a": true,
      "w": "Explication médicale de la réponse.",
      "cards": ["c1"]
    }
  ]
}`;

/**
 * Normalizes and fixes common model schema mismatches before strict Zod parsing.
 */
export function sanitizeLecturePayload(raw: any, input: GenerateLectureInput): Lecture {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Le modèle n’a pas renvoyé d’objet JSON valide.');
  }

  const id = (raw.id && typeof raw.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(raw.id))
    ? raw.id
    : input.id;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : input.name;
  const otrNumber = typeof raw.otrNumber === 'number' ? raw.otrNumber : input.otrNumber;

  const rawCards = Array.isArray(raw.cards) ? raw.cards : [];
  const cards = rawCards.map((c: any, index: number) => ({
    id: typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `c${index + 1}`,
    type: c.type === 'contrast' ? ('contrast' as const) : ('basic' as const),
    q: typeof c.q === 'string' ? c.q.trim() : `Question ${index + 1}`,
    a: typeof c.a === 'string' ? c.a.trim() : '',
    ...(c.src ? { src: String(c.src).trim() } : {}),
    ...(typeof c.freq === 'number' ? { freq: c.freq } : {}),
  })).filter((c: any) => c.q && c.a);

  // If the model produced no cards, generate fallback cards from quiz/keys
  if (!cards.length) {
    cards.push({
      id: 'c1',
      type: 'basic' as const,
      q: `Quels sont les points essentiels de : ${name} ?`,
      a: Array.isArray(raw.keys) && raw.keys.length
        ? raw.keys.join('\n• ')
        : 'Revoir l’ensemble des notions clés du cours.',
      src: 'Généralités',
    });
  }

  const validCardIds = new Set(cards.map((c: any) => c.id));
  const fallbackCardId = cards[0].id;

  const rawQuiz = Array.isArray(raw.quiz) ? raw.quiz : [];
  const quiz = rawQuiz.map((q: any, index: number) => {
    const rawOpts = Array.isArray(q.opts) ? q.opts : [];
    let opts = rawOpts.map((opt: any) => ({
      t: typeof opt.t === 'string' ? opt.t.trim() : '',
      ok: Boolean(opt.ok),
      ...(Array.isArray(opt.c)
        ? { c: opt.c.filter((cid: string) => validCardIds.has(cid)) }
        : {}),
    })).filter((opt: any) => opt.t);

    if (opts.length < 2) {
      opts = [
        { t: 'Proposition exacte', ok: true },
        { t: 'Proposition inexacte', ok: false },
      ];
    }
    // Ensure at least one option is true
    if (!opts.some((opt: any) => opt.ok)) {
      opts[0].ok = true;
    }

    const linkedCards = Array.isArray(q.cards)
      ? q.cards.filter((cid: string) => validCardIds.has(cid))
      : [];
    if (!linkedCards.length) {
      linkedCards.push(fallbackCardId);
    }

    return {
      id: typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q${index + 1}`,
      q: typeof q.q === 'string' ? q.q.trim() : `Question ${index + 1}`,
      explain: typeof q.explain === 'string' ? q.explain.trim() : '',
      src: typeof q.src === 'string' ? q.src.trim() : undefined,
      cards: linkedCards,
      opts,
    };
  }).filter((q: any) => q.q);

  const rawVf = Array.isArray(raw.vf) ? raw.vf : [];
  const vf = rawVf.map((v: any, index: number) => {
    const linkedCards = Array.isArray(v.cards)
      ? v.cards.filter((cid: string) => validCardIds.has(cid))
      : [];
    if (!linkedCards.length) {
      linkedCards.push(fallbackCardId);
    }

    return {
      id: typeof v.id === 'string' && v.id.trim() ? v.id.trim() : `vf${index + 1}`,
      s: typeof v.s === 'string' ? v.s.trim() : `Affirmation ${index + 1}`,
      a: Boolean(v.a),
      w: typeof v.w === 'string' ? v.w.trim() : '',
      cards: linkedCards,
    };
  }).filter((v: any) => v.s);

  const keys = Array.isArray(raw.keys)
    ? raw.keys.filter((k: any) => typeof k === 'string' && k.trim()).map((k: string) => k.trim())
    : [];
  const contrasts = Array.isArray(raw.contrasts)
    ? raw.contrasts.filter((c: any) => typeof c === 'string' && c.trim()).map((c: string) => c.trim())
    : [];

  const candidate = {
    schema: 1 as const,
    id,
    name,
    ...(otrNumber ? { otrNumber } : {}),
    keys,
    contrasts,
    cards,
    quiz,
    vf,
  };

  return LectureSchema.parse(candidate);
}

/**
 * Extracts JSON text from raw AI response that may contain Markdown or codeblocks.
 */
export function extractJsonFromAiResponse(rawText: string): unknown {
  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('L’IA n’a pas renvoyé de bloc JSON valide.');
  }

  const jsonSubstring = cleaned.substring(start, end + 1);
  return JSON.parse(jsonSubstring);
}

function buildPrompt(input: GenerateLectureInput, isMcqFocused?: boolean): string {
  return `${MEDICAL_AI_PROMPT_TEMPLATE}

<metadata>
Titre du cours attendu : ${input.name}
Identifiant : ${input.id}
${input.otrNumber ? `Sujet OTR N° ${input.otrNumber}` : ''}
${isMcqFocused ? 'Attention : Le document source contient des QCM / questions d’examen. Extrais-les fidèlement.' : ''}
</metadata>

<texte_source>
${input.text.slice(0, 180000)}
</texte_source>

Génère dès maintenant l'objet JSON du cours interactif. Réponds uniquement par l'objet JSON :`;
}

/**
 * Generates an interactive lecture using Google Gemini API.
 */
export async function generateLectureWithGemini(
  input: GenerateLectureInput,
  options: GenerateLectureOptions
): Promise<GenerateLectureResult> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error('Clé API Gemini manquante. Obtenez une clé gratuite sur https://aistudio.google.com/app/apikey');
  }

  const model = options.model || 'gemini-1.5-flash';
  const prompt = buildPrompt(input, options.isMcqFocused);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        maxOutputTokens: 16000,
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `Erreur Gemini (${response.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.message) {
        message = parsed.error.message;
        if (message.includes('suspended')) {
          message += ' — Ce projet Google Cloud est suspendu. Sur Google AI Studio, cliquez sur "Create API key" puis "Create API key in NEW project" (Nouveau projet). Ou utilisez Groq / OpenRouter ci-dessous.';
        }
      }
    } catch {
      message = errorBody.slice(0, 300);
    }
    throw new Error(`Google Gemini API : ${message}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason === 'SAFETY') {
    throw new Error('La réponse a été bloquée par les filtres de sécurité Gemini.');
  }

  const rawContent = candidate?.content?.parts?.[0]?.text;
  if (!rawContent) {
    throw new Error('Gemini a renvoyé une réponse vide.');
  }

  const parsedJson = extractJsonFromAiResponse(rawContent);
  const lecture = sanitizeLecturePayload(parsedJson, input);
  return { lecture, warnings: [] };
}

/** Free on-demand budget for gpt-oss-120b and gpt-oss-20b. One request cannot exceed it. */
export const GROQ_ON_DEMAND_TPM = 8000;

const GROQ_SYSTEM_PROMPT =
  'Tu es un assistant expert en pédagogie médicale pour le concours de résidanat. Tu réponds obligatoirement par un JSON valide.';

/**
 * Conservative token estimate. Groq bills prompt tokens plus the reserved max_tokens,
 * and French medical text is denser than the usual 4 characters per token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 2.5);
}

export interface GroqRequestFit {
  source: string;
  maxTokens: number;
  estimatedInputTokens: number;
  truncated: boolean;
}

/**
 * Keeps prompt tokens + reserved completion tokens under Groq's per-request TPM ceiling.
 * max_tokens is counted in full even when the model writes less, which is why a small
 * PDF was rejected at 9398 tokens with max_tokens set to 8000.
 */
export function fitGroqRequest(args: {
  system: string;
  before: string;
  after: string;
  source: string;
}): GroqRequestFit {
  const safety = 500;
  const desiredMaxTokens = 3200;
  const minimumMaxTokens = 900;
  const overhead = estimateTokens(`${args.system}\n${args.before}\n${args.after}`);
  let maxTokens = desiredMaxTokens;
  let sourceTokenBudget = GROQ_ON_DEMAND_TPM - safety - maxTokens - overhead;

  if (sourceTokenBudget < 250) {
    maxTokens = Math.max(minimumMaxTokens, GROQ_ON_DEMAND_TPM - safety - overhead - 250);
    sourceTokenBudget = GROQ_ON_DEMAND_TPM - safety - maxTokens - overhead;
  }

  if (sourceTokenBudget < 200 || maxTokens < 600) {
    throw new Error(
      'Le prompt dépasse le quota gratuit Groq (8 000 jetons par minute) avant le texte du cours. Collez un extrait plus court, ou utilisez Gemini.'
    );
  }

  const maxChars = Math.floor(sourceTokenBudget * 2.5);
  const truncated = args.source.length > maxChars;
  const source = truncated ? args.source.slice(0, maxChars) : args.source;
  const estimatedInputTokens = overhead + estimateTokens(source);
  maxTokens = Math.min(maxTokens, GROQ_ON_DEMAND_TPM - safety - estimatedInputTokens);
  if (maxTokens < 600) {
    throw new Error(
      'Le texte reste trop long pour le quota gratuit Groq (8 000 jetons par minute). Réduisez le PDF ou collez un extrait.'
    );
  }

  return { source, maxTokens, estimatedInputTokens, truncated };
}

function groqPromptParts(input: GenerateLectureInput, isMcqFocused?: boolean): { before: string; after: string } {
  return {
    before: `${MEDICAL_AI_PROMPT_TEMPLATE}

<metadata>
Titre du cours attendu : ${input.name}
Identifiant : ${input.id}
${input.otrNumber ? `Sujet OTR N° ${input.otrNumber}` : ''}
${isMcqFocused ? 'Attention : Le document source contient des QCM / questions d’examen. Extrais-les fidèlement.' : ''}
</metadata>

<texte_source>
`,
    after: `
</texte_source>

Reste concis pour tenir dans la réponse : au plus 8 cartes, 8 QCM et 8 vrai/faux pour ce passage.
Génère dès maintenant l'objet JSON du cours interactif. Réponds uniquement par l'objet JSON :`,
  };
}

function splitSource(source: string, chunkChars: number, maxChunks: number): { chunks: string[]; omitted: boolean } {
  if (source.length <= chunkChars) return { chunks: [source], omitted: false };
  const chunks: string[] = [];
  let offset = 0;
  while (offset < source.length && chunks.length < maxChunks) {
    let end = Math.min(source.length, offset + chunkChars);
    if (end < source.length) {
      const lineBreak = source.lastIndexOf('\n', end);
      if (lineBreak > offset + Math.floor(chunkChars * 0.6)) end = lineBreak;
    }
    const piece = source.slice(offset, end).trim();
    if (piece) chunks.push(piece);
    offset = end;
  }
  return { chunks, omitted: offset < source.length };
}

function mergeLectures(parts: Lecture[], input: GenerateLectureInput): Lecture {
  const cards: Lecture['cards'] = [];
  const quiz: Lecture['quiz'] = [];
  const vf: Lecture['vf'] = [];
  const keys: string[] = [];
  const contrasts: string[] = [];

  for (const part of parts) {
    const idMap = new Map<string, string>();
    for (const card of part.cards) {
      const id = `c${cards.length + 1}`;
      idMap.set(card.id, id);
      cards.push({ ...card, id });
    }
    const remap = (ids: string[]) => {
      const linked = ids.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id));
      if (linked.length) return linked;
      return cards[0] ? [cards[0].id] : [];
    };
    for (const item of part.quiz) {
      quiz.push({
        ...item,
        id: `q${quiz.length + 1}`,
        cards: remap(item.cards),
        opts: item.opts.map((opt) => {
          const linked = opt.c?.map((id) => idMap.get(id)).filter((id): id is string => Boolean(id));
          return linked && linked.length ? { ...opt, c: linked } : { t: opt.t, ok: opt.ok };
        }),
      });
    }
    for (const item of part.vf) {
      vf.push({ ...item, id: `vf${vf.length + 1}`, cards: remap(item.cards) });
    }
    keys.push(...part.keys);
    contrasts.push(...part.contrasts);
  }

  return LectureSchema.parse({
    schema: 1 as const,
    id: input.id,
    name: input.name,
    ...(input.otrNumber ? { otrNumber: input.otrNumber } : {}),
    keys: [...new Set(keys)],
    contrasts: [...new Set(contrasts)],
    cards,
    quiz,
    vf,
  });
}

function groqCooldownMs(reservedTokens: number): number {
  return Math.ceil((reservedTokens / GROQ_ON_DEMAND_TPM) * 65_000);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestGroqLecture(
  input: GenerateLectureInput,
  apiKey: string,
  model: string,
  before: string,
  after: string,
  source: string,
): Promise<{ lecture: Lecture; reservedTokens: number; warnings: string[] }> {
  let currentSource = source;
  let warnings: string[] = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const fit = fitGroqRequest({
      system: GROQ_SYSTEM_PROMPT,
      before,
      after,
      source: currentSource,
    });
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: GROQ_SYSTEM_PROMPT },
          { role: 'user', content: `${before}${fit.source}${after}` },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
        max_tokens: fit.maxTokens,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const rawContent = data.choices?.[0]?.message?.content;
      if (!rawContent) throw new Error('Groq a renvoyé une réponse vide.');
      if (data.choices?.[0]?.finish_reason === 'length') {
        warnings = [...warnings, 'La réponse Groq a été coupée par la limite de jetons. Le cours reste incomplet sur ce passage.'];
      }
      const parsedJson = extractJsonFromAiResponse(rawContent);
      return {
        lecture: sanitizeLecturePayload(parsedJson, input),
        reservedTokens: fit.estimatedInputTokens + fit.maxTokens,
        warnings: fit.truncated
          ? [...warnings, 'Une partie du passage a été raccourcie pour rester sous les 8 000 jetons Groq.']
          : warnings,
      };
    }

    const errorBody = await response.text();
    let message = `Erreur Groq (${response.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      message = errorBody.slice(0, 300);
    }

    const tooLarge = response.status === 413 || /request too large/i.test(message);
    const rateLimited = response.status === 429 && !tooLarge;
    if (tooLarge && attempt < 2) {
      currentSource = currentSource.slice(0, Math.floor(currentSource.length * 0.6));
      warnings = [...warnings, 'Groq a encore refusé la taille de la requête. Le passage a été réduit.'];
      continue;
    }
    if (rateLimited && attempt < 2) {
      const waitMatch = message.match(/try again in ([0-9.]+)s/i);
      const waitMs = waitMatch ? Math.ceil(Number(waitMatch[1]) * 1000) + 750 : 20_000;
      await sleep(waitMs);
      continue;
    }
    throw new Error(`Groq API : ${message}`);
  }

  throw new Error('Groq API : la requête reste trop volumineuse pour le quota de 8 000 jetons par minute.');
}

/**
 * Generates an interactive lecture using the Groq API.
 */
export async function generateLectureWithGroq(
  input: GenerateLectureInput,
  options: GenerateLectureOptions
): Promise<GenerateLectureResult> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error('Clé API Groq manquante. Obtenez une clé gratuite sans carte bancaire sur https://console.groq.com/keys');
  }

  const model = options.model || 'openai/gpt-oss-120b';
  const { before, after } = groqPromptParts(input, options.isMcqFocused);
  const probe = fitGroqRequest({
    system: GROQ_SYSTEM_PROMPT,
    before,
    after,
    source: input.text,
  });
  const split = splitSource(input.text, Math.max(probe.source.length, 800), 3);
  const warnings: string[] = [];
  if (split.chunks.length > 1) {
    warnings.push(`Le document a été découpé en ${split.chunks.length} parties pour respecter le quota gratuit Groq (8 000 jetons par minute).`);
  }
  if (split.omitted) {
    warnings.push('La fin du document n’a pas été envoyée : le quota Groq ne permet que trois parties par génération.');
  }

  const lectures: Lecture[] = [];
  let reservedTokens = 0;
  for (let index = 0; index < split.chunks.length; index += 1) {
    if (index > 0) {
      const waitMs = groqCooldownMs(reservedTokens);
      options.onProgress?.(
        `Quota Groq : pause de ${Math.ceil(waitMs / 1000)} s avant la partie ${index + 1}/${split.chunks.length}…`,
      );
      await sleep(waitMs);
    }
    options.onProgress?.(
      split.chunks.length > 1
        ? `Génération Groq, partie ${index + 1}/${split.chunks.length}…`
        : 'Génération Groq en cours…',
    );
    const result = await requestGroqLecture(input, apiKey, model, before, after, split.chunks[index]);
    lectures.push(result.lecture);
    reservedTokens = result.reservedTokens;
    warnings.push(...result.warnings);
  }

  return {
    lecture: lectures.length === 1 ? lectures[0] : mergeLectures(lectures, input),
    warnings,
  };
}

/**
 * Generates an interactive lecture using OpenRouter API.
 */
export async function generateLectureWithOpenRouter(
  input: GenerateLectureInput,
  options: GenerateLectureOptions
): Promise<GenerateLectureResult> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error('Clé API OpenRouter manquante. Obtenez une clé sur https://openrouter.ai/keys');
  }

  const model = options.model || 'google/gemini-2.0-flash-exp:free';
  const prompt = buildPrompt(input, options.isMcqFocused);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://residanat-smart-learning.app',
      'X-Title': 'Residanat App',
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'Tu es un assistant expert en pédagogie médicale. Tu réponds obligatoirement par un JSON valide.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `Erreur OpenRouter (${response.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      message = errorBody.slice(0, 300);
    }
    throw new Error(`OpenRouter : ${message}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) throw new Error('OpenRouter a renvoyé une réponse vide.');

  const parsedJson = extractJsonFromAiResponse(rawContent);
  const lecture = sanitizeLecturePayload(parsedJson, input);
  return { lecture, warnings: [] };
}

/**
 * Generates an interactive lecture from text using OpenAI Chat Completions.
 */
export async function generateLectureWithOpenAi(
  input: GenerateLectureInput,
  options: GenerateLectureOptions
): Promise<GenerateLectureResult> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error('Clé API OpenAI manquante. Veuillez saisir votre clé API OpenAI.');
  }

  const model = options.model || 'gpt-4o';
  const prompt = buildPrompt(input, options.isMcqFocused);

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'Tu es un assistant expert en pédagogie médicale. Tu réponds obligatoirement avec un JSON valide et structuré.',
        },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 16000,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `Erreur OpenAI (${response.status})`;
    try {
      const parsed = JSON.parse(errorBody);
      if (parsed.error?.message) {
        message = parsed.error.message;
      }
    } catch {
      message = errorBody.slice(0, 300);
    }
    throw new Error(`OpenAI API : ${message}`);
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('OpenAI a renvoyé une réponse vide.');
  }

  const parsedJson = extractJsonFromAiResponse(rawContent);
  const lecture = sanitizeLecturePayload(parsedJson, input);
  return { lecture, warnings: [] };
}

/**
 * Unified generation entrypoint supporting Gemini, Groq, OpenRouter, and OpenAI.
 */
export async function generateLecture(
  input: GenerateLectureInput,
  options: GenerateLectureOptions
): Promise<GenerateLectureResult> {
  const provider = options.provider || 'gemini';
  if (provider === 'gemini') {
    return generateLectureWithGemini(input, options);
  }
  if (provider === 'groq') {
    return generateLectureWithGroq(input, options);
  }
  if (provider === 'openrouter') {
    return generateLectureWithOpenRouter(input, options);
  }
  return generateLectureWithOpenAi(input, options);
}
