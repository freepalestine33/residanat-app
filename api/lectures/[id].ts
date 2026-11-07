import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireMethod, sendError, ApiError } from '../_lib/http';
import { authenticateRequest } from '../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'DELETE')) return;
  try {
    const id = req.query.id;
    if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError(400, 'Lecture id is invalid.');
    const client = await authenticateRequest(req);
    const now = new Date().toISOString();
    const { data, error } = await client.supabase
      .from('lectures')
      .update({ deleted_at: now, updated_at: now })
      .eq('user_id', client.user.id)
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) throw new Error('Could not delete this lecture.');
    if (!data) return res.status(404).json({ error: 'Lecture not found.' });
    return res.status(200).json({ deleted: true });
  } catch (error) {
    return sendError(res, error);
  }
}
