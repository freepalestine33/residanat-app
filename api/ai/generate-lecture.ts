import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBody, requireMethod, sendError } from '../_lib/http';
import { authenticateRequest } from '../_lib/supabase';
import { LectureSchema } from '../../src/lib/schema';

const MEDICAL_SYSTEM_PROMPT = `Tu es un professeur agrégé et assistant de préparation pédagogique pour le concours de Résidanat en médecine (programme officiel en français).
Transforme le document fourni en un cours interactif hautement pédagogique, rigoureux et fidèle à la source médicale.

Directives médicales :
- Rigueur absolue : base-toi UNIQUEMENT sur les faits du texte fourni. N'invente aucun chiffre, dose, seuil, contre-indication ou piège non justifié.
- Si le document contient des QCM / questions d'examens :
  1. Extrais chaque QCM fidèlement avec ses options (vraies et fausses) et une explication claire.
  2. Synthétise les notions clés testées sous forme de fiches mémo (flashcards) dans "cards".
  3. Crée des affirmations Vrai/Faux stimulantes dans "vf" pour cibler les pièges classiques du concours.
- Chaque QCM dans "quiz" doit contenir au minimum 2 propositions et au moins une proposition correcte ("ok": true).
- Lie chaque question de quiz et chaque affirmation vrai/faux à au moins un identifiant de carte ("cards") existant dans "cards".

Retourne STRICTEMENT et UNIQUEMENT un objet JSON valide conforme à cette structure :
{
  "schema": 1,
  "id": "identifiant_stable",
  "name": "Titre du cours",
  "keys": ["Point clé 1", "Point clé 2"],
  "contrasts": ["Piège / Diagnostic différentiel important"],
  "cards": [
    { "id": "c1", "type": "basic", "q": "Question courte", "a": "Réponse synthétique", "src": "Source..." }
  ],
  "quiz": [
    {
      "id": "q1",
      "q": "Question QCM",
      "src": "Source...",
      "cards": ["c1"],
      "explain": "Justification...",
      "opts": [
        { "t": "Option A", "ok": true, "c": ["c1"] },
        { "t": "Option B", "ok": false }
      ]
    }
  ],
  "vf": [
    { "id": "vf1", "s": "Affirmation clinique", "a": true, "w": "Explication...", "cards": ["c1"] }
  ]
}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const body = getBody(req);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ error: 'Le champ "text" (texte extrait du cours ou QCM) est requis.' });
    }

    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Nouveau cours interactif';
    const id = typeof body.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(body.id)
      ? body.id
      : name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'cours_ia';
    const otrNumber = typeof body.otrNumber === 'number' && Number.isInteger(body.otrNumber) && body.otrNumber >= 1 && body.otrNumber <= 43
      ? body.otrNumber
      : undefined;
    const isMcqFocused = Boolean(body.isMcqFocused);

    // Determine provider: Gemini (default) or OpenAI
    const provider = body.provider === 'openai' || (typeof body.apiKey === 'string' && body.apiKey.startsWith('sk-'))
      ? 'openai'
      : 'gemini';

    const prompt = `${MEDICAL_SYSTEM_PROMPT}

<metadata>
Titre du cours : ${name}
Identifiant : ${id}
${otrNumber ? `Sujet OTR N° ${otrNumber}` : ''}
${isMcqFocused ? 'Attention : Le document source contient des QCM / questions d’examen. Extrais-les fidèlement.' : ''}
</metadata>

<texte_source>
${text.slice(0, 180000)}
</texte_source>

Génère dès maintenant l'objet JSON du cours interactif :`;

    let rawContent = '';

    if (provider === 'gemini') {
      const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim()) || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'Aucune clé API Gemini fournie ou configurée.' });
      }
      const model = (typeof body.model === 'string' && body.model.trim()) || process.env.GEMINI_MODEL || 'gemini-1.5-flash';

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            maxOutputTokens: 16000,
          },
        }),
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return res.status(502).json({ error: `Erreur Gemini (${geminiRes.status}): ${errText.slice(0, 500)}` });
      }

      const aiData = await geminiRes.json() as any;
      rawContent = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim()) || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: 'Aucune clé API OpenAI fournie ou configurée.' });
      }
      const model = (typeof body.model === 'string' && body.model.trim()) || process.env.OPENAI_MODEL || 'gpt-4o';

      const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'Tu es un assistant de préparation pédagogique médicale. Tu réponds obligatoirement par un JSON valide.' },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
          max_tokens: 16000,
        }),
      });

      if (!openAiResponse.ok) {
        const errText = await openAiResponse.text();
        return res.status(502).json({ error: `Erreur OpenAI (${openAiResponse.status}): ${errText.slice(0, 500)}` });
      }

      const aiData = await openAiResponse.json() as any;
      rawContent = aiData.choices?.[0]?.message?.content || '';
    }

    if (!rawContent) {
      return res.status(502).json({ error: 'Le modèle a renvoyé une réponse vide.' });
    }

    let parsed: any;
    try {
      const start = rawContent.indexOf('{');
      const end = rawContent.lastIndexOf('}');
      parsed = JSON.parse(rawContent.substring(start, end + 1));
    } catch (parseErr) {
      return res.status(502).json({ error: 'La réponse reçue de l’IA ne contient pas de JSON valide.' });
    }

    // Build normalized lecture structure
    const cards = (Array.isArray(parsed.cards) ? parsed.cards : []).map((c: any, index: number) => ({
      id: typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `c${index + 1}`,
      type: c.type === 'contrast' ? 'contrast' : 'basic',
      q: typeof c.q === 'string' ? c.q.trim() : `Question ${index + 1}`,
      a: typeof c.a === 'string' ? c.a.trim() : '',
      ...(c.src ? { src: String(c.src).trim() } : {}),
      ...(typeof c.freq === 'number' ? { freq: c.freq } : {}),
    })).filter((c: any) => c.q && c.a);

    if (!cards.length) {
      cards.push({ id: 'c1', type: 'basic', q: `Notions clés : ${name}`, a: 'Voir les points clés du cours.', src: 'Généralités' });
    }
    const validCardIds = new Set(cards.map((c: any) => c.id));
    const fallbackCardId = cards[0].id;

    const quiz = (Array.isArray(parsed.quiz) ? parsed.quiz : []).map((q: any, index: number) => {
      let opts = (Array.isArray(q.opts) ? q.opts : []).map((opt: any) => ({
        t: typeof opt.t === 'string' ? opt.t.trim() : '',
        ok: Boolean(opt.ok),
        ...(Array.isArray(opt.c) ? { c: opt.c.filter((cid: string) => validCardIds.has(cid)) } : {}),
      })).filter((opt: any) => opt.t);

      if (opts.length < 2) {
        opts = [{ t: 'Proposition exacte', ok: true }, { t: 'Proposition inexacte', ok: false }];
      }
      if (!opts.some((opt: any) => opt.ok)) opts[0].ok = true;

      const linkedCards = Array.isArray(q.cards) ? q.cards.filter((cid: string) => validCardIds.has(cid)) : [];
      if (!linkedCards.length) linkedCards.push(fallbackCardId);

      return {
        id: typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q${index + 1}`,
        q: typeof q.q === 'string' ? q.q.trim() : `Question ${index + 1}`,
        explain: typeof q.explain === 'string' ? q.explain.trim() : '',
        src: typeof q.src === 'string' ? q.src.trim() : undefined,
        cards: linkedCards,
        opts,
      };
    }).filter((q: any) => q.q);

    const vf = (Array.isArray(parsed.vf) ? parsed.vf : []).map((v: any, index: number) => {
      const linkedCards = Array.isArray(v.cards) ? v.cards.filter((cid: string) => validCardIds.has(cid)) : [];
      if (!linkedCards.length) linkedCards.push(fallbackCardId);

      return {
        id: typeof v.id === 'string' && v.id.trim() ? v.id.trim() : `vf${index + 1}`,
        s: typeof v.s === 'string' ? v.s.trim() : `Affirmation ${index + 1}`,
        a: Boolean(v.a),
        w: typeof v.w === 'string' ? v.w.trim() : '',
        cards: linkedCards,
      };
    }).filter((v: any) => v.s);

    const lectureCandidate = {
      schema: 1,
      id,
      name,
      ...(otrNumber ? { otrNumber } : {}),
      keys: Array.isArray(parsed.keys) ? parsed.keys.map(String) : [],
      contrasts: Array.isArray(parsed.contrasts) ? parsed.contrasts.map(String) : [],
      cards,
      quiz,
      vf,
    };

    const lecture = LectureSchema.parse(lectureCandidate);

    // If user asked to save directly to their Supabase account
    if (body.saveToAccount) {
      try {
        const client = await authenticateRequest(req);
        const { error: upsertErr } = await client.supabase
          .from('lectures')
          .upsert({
            id: lecture.id,
            user_id: client.user.id,
            name: lecture.name,
            content: lecture,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id,id' });
        if (upsertErr) {
          console.warn('Could not save to Supabase automatically:', upsertErr);
        }
      } catch (authErr) {
        // Continue even if auth fails, client can save locally
      }
    }

    return res.status(200).json({ success: true, lecture });
  } catch (error) {
    return sendError(res, error);
  }
}
