import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBody, requireObject, requireTimestamp, sendError, ApiError } from '../_lib/http';
import { createImageUrl, uploadNoteImage } from '../_lib/noteImages';
import { authenticateRequest } from '../_lib/supabase';

async function signedNote(client: Awaited<ReturnType<typeof authenticateRequest>>, row: Record<string, unknown>) {
  const imageUrl = await createImageUrl(client, typeof row.image_path === 'string' ? row.image_path : null);
  return imageUrl ? { ...row, image_url: imageUrl } : row;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }
  try {
    const client = await authenticateRequest(req);
    if (req.method === 'GET') {
      if (req.query.imagePath !== undefined) {
        if (typeof req.query.imagePath !== 'string' || !req.query.imagePath) {
          throw new ApiError(400, 'imagePath is invalid.');
        }
        const { data: row, error } = await client.supabase
          .from('notes')
          .select('image_path')
          .eq('user_id', client.user.id)
          .eq('image_path', req.query.imagePath)
          .is('deleted_at', null)
          .maybeSingle();
        if (error) throw new ApiError(500, 'Could not find this note image.');
        if (!row) throw new ApiError(404, 'This note image is no longer available.');
        const imageUrl = await createImageUrl(client, req.query.imagePath);
        if (!imageUrl) throw new ApiError(404, 'This note image is no longer available.');
        return res.status(200).json({ imageUrl });
      }
      const { data, error } = await client.supabase
        .from('notes')
        .select('*')
        .eq('user_id', client.user.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw new ApiError(500, 'Could not load notes.');
      const notes = await Promise.all((data ?? []).map((row) => signedNote(client, row)));
      return res.status(200).json({ notes });
    }

    const body = getBody(req);
    const data = requireObject(body.data, 'data');
    const id = typeof body.id === 'string' && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : randomUUID();
    const updated_at = body.updatedAt ? requireTimestamp(body.updatedAt) : new Date().toISOString();
    let image_path = typeof body.imagePath === 'string' ? body.imagePath : null;
    if (body.imageBase64 != null) image_path = await uploadNoteImage(client, id, updated_at, body.imageMime, body.imageBase64);
    const { data: row, error } = await client.supabase
      .from('notes')
      .upsert({ id, user_id: client.user.id, data, image_path, updated_at, deleted_at: null })
      .select('*')
      .single();
    if (error) throw new ApiError(500, 'Could not save this note.');
    return res.status(200).json({ note: await signedNote(client, row) });
  } catch (error) {
    return sendError(res, error);
  }
}
