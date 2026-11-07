import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBody, requireMethod, requireString, sendError } from '../_lib/http';
import { createImageUrl } from '../_lib/noteImages';
import { readSettings, readSince } from '../_lib/sync';
import { authenticateRequest } from '../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const body = getBody(req);
    const deviceId = requireString(body.deviceId, 'deviceId', 100);
    const since = body.since == null ? null : requireString(body.since, 'since', 40);
    if (since && !Number.isFinite(Date.parse(since))) return res.status(400).json({ error: 'since is invalid.' });
    const client = await authenticateRequest(req);
    const [lectures, cards, quizResults, errors, noteRows, settings] = await Promise.all([
      readSince(client, 'lectures', since),
      readSince(client, 'flashcard_progress', since),
      readSince(client, 'quiz_results', since),
      readSince(client, 'errors', since),
      readSince(client, 'notes', since),
      readSettings(client, since),
    ]);
    const notes = await Promise.all(noteRows.map(async (row) => ({
      ...row,
      image_url: await createImageUrl(client, typeof row.image_path === 'string' ? row.image_path : null),
    })));
    const syncedAt = new Date().toISOString();
    const { error } = await client.supabase.from('sync_state').upsert({
      user_id: client.user.id,
      device_id: deviceId,
      last_sync_at: syncedAt,
      updated_at: syncedAt,
    });
    if (error) throw new Error('Could not update sync state.');
    return res.status(200).json({ syncedAt, lectures, cards, quizResults, errors, notes, settings });
  } catch (error) {
    return sendError(res, error);
  }
}
