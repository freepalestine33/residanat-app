import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBody, requireObject, requireString, requireTimestamp, sendError } from '../_lib/http';
import { authenticateRequest } from '../_lib/supabase';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Use GET or POST.' });
  }
  try {
    const client = await authenticateRequest(req);
    if (req.method === 'GET') {
      const { data, error } = await client.supabase
        .from('lectures')
        .select('id,name,content,updated_at,deleted_at')
        .eq('user_id', client.user.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false });
      if (error) throw new Error('Could not load lectures.');
      return res.status(200).json({ lectures: data });
    }

    const body = getBody(req);
    const name = requireString(body.name, 'name', 200);
    const content = requireObject(body.content, 'content');
    const updated_at = body.updatedAt ? requireTimestamp(body.updatedAt) : new Date().toISOString();
    const id = typeof body.id === 'string' ? body.id : undefined;
    const { data, error } = await client.supabase
      .from('lectures')
      .upsert({ ...(id ? { id } : {}), user_id: client.user.id, name, content, updated_at }, { onConflict: 'user_id,id' })
      .select('id,name,content,updated_at')
      .single();
    if (error) throw new Error('Could not save this lecture.');
    return res.status(200).json({ lecture: data });
  } catch (error) {
    return sendError(res, error);
  }
}
