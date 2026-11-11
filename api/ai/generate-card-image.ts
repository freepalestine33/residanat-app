import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBody, requireString, sendError, ApiError } from '../_lib/http';
import { authenticateRequest } from '../_lib/supabase';
import { createCardImageUrl, uploadCardImage } from '../_lib/cardImages';
import { buildIllustrationPrompt, isFaceFreeIllustrationReview } from '../../src/lib/cardIllustration';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function requireId(value: unknown, label: string): string {
  const id = requireString(value, label, 64);
  if (!ID_PATTERN.test(id)) throw new ApiError(400, 'Identifiants de carte invalides.');
  return id;
}

/**
 * On-demand card illustrations. Deliberately separate from /api/ai/generate-lecture
 * so the lecture, quiz and vrai-faux generation prompts and latency are untouched.
 *
 * GET  ?lectureId&cardId  -> signed URL of an existing illustration (404 if none)
 * POST { lectureId, cardId, lectureName, question, answer, apiKey? } -> generates via Gemini image
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }

  try {
    const client = await authenticateRequest(req);

    if (req.method === 'GET') {
      const lectureId = requireId(req.query.lectureId, 'lectureId');
      const cardId = requireId(req.query.cardId, 'cardId');
      const imageUrl = await createCardImageUrl(client, lectureId, cardId);
      if (!imageUrl) return res.status(404).json({ error: 'Aucune illustration pour cette carte.' });
      return res.status(200).json({ imageUrl });
    }

    const body = getBody(req);
    const lectureId = requireId(body.lectureId, 'lectureId');
    const cardId = requireId(body.cardId, 'cardId');
    const lectureName = requireString(body.lectureName, 'lectureName', 200);
    const question = requireString(body.question, 'question', 2000);
    const answer = requireString(body.answer, 'answer', 4000);

    const providedApiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
    if (providedApiKey.length > 512) throw new ApiError(400, 'La clé API Gemini est invalide.');
    const apiKey = providedApiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new ApiError(400, 'Saisissez une clé API Gemini ou configurez GEMINI_API_KEY côté serveur.');
    }
    const model = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
    const prompt = buildIllustrationPrompt({ lectureName, question, answer });

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
      },
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      throw new ApiError(502, `Le modèle d’image a renvoyé une erreur (${geminiRes.status}). ${detail.slice(0, 200)}`);
    }

    const payload = await geminiRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<Record<string, unknown>> } }>;
    };
    const parts = payload.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((part) => {
      const inline = (part.inlineData ?? part.inline_data) as { data?: unknown } | undefined;
      return typeof inline?.data === 'string' && inline.data.length > 0;
    });
    const inline = (imagePart?.inlineData ?? imagePart?.inline_data) as { data?: string; mimeType?: string; mime_type?: string } | undefined;
    if (!inline?.data) throw new ApiError(502, 'Le modèle n’a renvoyé aucune image pour cette carte.');

    const reviewModel = process.env.GEMINI_IMAGE_REVIEW_MODEL || 'gemini-2.5-flash';
    const reviewRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(reviewModel)}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              {
                text: 'Inspect this image for any human face or recognizable facial depiction, including partial, stylized, tiny, or blurred faces. If you are uncertain, mark it as containing a face. Return JSON only with the boolean property containsHumanFace.',
              },
              {
                inlineData: {
                  mimeType: inline.mimeType ?? inline.mime_type ?? 'image/png',
                  data: inline.data,
                },
              },
            ],
          }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0 },
        }),
      },
    );

    if (!reviewRes.ok) {
      const detail = await reviewRes.text();
      throw new ApiError(502, `Impossible de vérifier l’absence de visage dans l’illustration (${reviewRes.status}). ${detail.slice(0, 200)}`);
    }

    const reviewPayload = await reviewRes.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
    };
    const reviewText = reviewPayload.candidates?.[0]?.content?.parts
      ?.map((part) => typeof part.text === 'string' ? part.text : '')
      .join('');
    let review: unknown;
    try {
      review = JSON.parse(reviewText ?? '');
    } catch {
      throw new ApiError(502, 'La vérification de sécurité de l’illustration a renvoyé une réponse invalide.');
    }
    if (!isFaceFreeIllustrationReview(review)) {
      throw new ApiError(422, 'L’illustration contient peut-être un visage ou n’a pas pu être vérifiée. Aucune image n’a été enregistrée ; réessayez.');
    }

    await uploadCardImage(client, lectureId, cardId, inline.mimeType ?? inline.mime_type ?? 'image/png', inline.data);
    const imageUrl = await createCardImageUrl(client, lectureId, cardId);
    if (!imageUrl) throw new ApiError(500, 'L’illustration a été générée mais n’a pas pu être relue.');

    return res.status(200).json({ imageUrl });
  } catch (error) {
    return sendError(res, error);
  }
}
