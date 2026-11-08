import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBody, requireMethod, sendError } from '../_lib/http';
import { authenticateRequest } from '../_lib/supabase';
import { LectureSchema } from '../../src/lib/schema';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const configuredSecret = process.env.N8N_WEBHOOK_SECRET;
    const providedSecret = req.headers['x-n8n-secret'] || req.headers['x-webhook-secret'];
    let authenticatedUserId: string | null = null;
    let supabaseClient = null;

    if (configuredSecret && providedSecret === configuredSecret) {
      // Secret-authenticated webhook (service-level)
      const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
      const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
      if (url && anonKey) {
        supabaseClient = createClient(url, anonKey);
      }
    } else {
      // User-authenticated via Supabase token
      const client = await authenticateRequest(req);
      authenticatedUserId = client.user.id;
      supabaseClient = client.supabase;
    }

    const body = getBody(req);
    let lecture: any;

    if (body.lecture && typeof body.lecture === 'object') {
      lecture = LectureSchema.parse(body.lecture);
    } else if (typeof body.text === 'string' && body.text.trim()) {
      // n8n provided raw text, call Gemini or OpenAI directly
      const provider = body.provider === 'openai' || (typeof body.apiKey === 'string' && body.apiKey.startsWith('sk-'))
        ? 'openai'
        : 'gemini';

      const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : 'Cours généré par n8n';
      const id = typeof body.id === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(body.id)
        ? body.id
        : name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9_-]+/g, '_').slice(0, 32);

      const prompt = `Tu es un assistant pédagogique pour le concours de résidanat médical en français.
Transforme ce document (cours ou QCM) en un cours interactif complet en JSON valide.
Titre : ${name}
ID : ${id}
${body.otrNumber ? `OTR N° ${body.otrNumber}` : ''}

Texte :
${body.text.slice(0, 180000)}

Réponds UNIQUEMENT avec un JSON valide :
{
  "schema": 1,
  "id": "${id}",
  "name": "${name}",
  "keys": ["Point clé..."],
  "contrasts": ["Piège..."],
  "cards": [{ "id": "c1", "type": "basic", "q": "Question", "a": "Réponse", "src": "p. 1" }],
  "quiz": [{ "id": "q1", "q": "Question QCM", "cards": ["c1"], "explain": "Explication", "opts": [{ "t": "Choix 1", "ok": true }, { "t": "Choix 2", "ok": false }] }],
  "vf": [{ "id": "vf1", "s": "Affirmation", "a": true, "w": "Explication", "cards": ["c1"] }]
}`;

      let content = '';
      if (provider === 'gemini') {
        const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim()) || process.env.GEMINI_API_KEY;
        if (!apiKey) {
          return res.status(400).json({ error: 'GEMINI_API_KEY is not configured on the server or in request.' });
        }
        const model = (typeof body.model === 'string' && body.model) || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
        const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 16000 }
          }),
        });
        if (!aiRes.ok) {
          const errText = await aiRes.text();
          return res.status(502).json({ error: `Gemini error: ${errText.slice(0, 500)}` });
        }
        const aiData = await aiRes.json() as any;
        content = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        const apiKey = (typeof body.apiKey === 'string' && body.apiKey.trim()) || process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return res.status(400).json({ error: 'OPENAI_API_KEY is not configured on the server or in request.' });
        }
        const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: (typeof body.model === 'string' && body.model) || process.env.OPENAI_MODEL || 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' },
            temperature: 0.2,
          }),
        });
        if (!aiRes.ok) {
          const errText = await aiRes.text();
          return res.status(502).json({ error: `OpenAI error: ${errText.slice(0, 500)}` });
        }
        const aiData = await aiRes.json() as any;
        content = aiData.choices?.[0]?.message?.content || '';
      }

      const start = content.indexOf('{');
      const end = content.lastIndexOf('}');
      lecture = LectureSchema.parse(JSON.parse(content.substring(start, end + 1)));
    } else {
      return res.status(400).json({ error: 'Fournir "lecture" (objet JSON) ou "text" (texte extrait du PDF).' });
    }

    // If authenticated with Supabase user, save to user's lectures table
    let savedToDatabase = false;
    if (supabaseClient && (authenticatedUserId || body.userId)) {
      const targetUserId = authenticatedUserId || String(body.userId);
      const { error: dbError } = await supabaseClient
        .from('lectures')
        .upsert({
          id: lecture.id,
          user_id: targetUserId,
          name: lecture.name,
          content: lecture,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,id' });

      if (!dbError) savedToDatabase = true;
    }

    return res.status(200).json({
      success: true,
      message: `Cours “${lecture.name}” importé avec succès.`,
      lecture,
      stats: {
        cards: lecture.cards.length,
        quiz: lecture.quiz.length,
        vf: lecture.vf.length,
      },
      savedToDatabase,
    });
  } catch (error) {
    return sendError(res, error);
  }
}
