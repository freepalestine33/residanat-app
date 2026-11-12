import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBody, requireArray, requireMethod, requireObject, requireString, requireTimestamp, sendError, ApiError } from '../_lib/http';
import { uploadNoteImage } from '../_lib/noteImages';
import { mergeFlashcard, upsertIfNewer } from '../_lib/sync';
import { authenticateRequest } from '../_lib/supabase';

const tables = {
  lectures: 'lectures',
  modules: 'modules',
  customCards: 'custom_cards',
  cards: 'flashcard_progress',
  quizResults: 'quiz_results',
  errors: 'errors',
  notes: 'notes',
} as const;
type Collection = keyof typeof tables;

function parseRecord(value: unknown, collection: Collection | 'settings'): Record<string, unknown> & { updated_at: string; id?: string } {
  const record = requireObject(value, collection);
  const updated_at = requireTimestamp(record.updated_at, 'updated_at');
  if (collection === 'settings') {
    return { preferences: requireObject(record.preferences, 'preferences'), updated_at };
  }
  const id = requireString(record.id, `${collection}.id`, 300);
  if (collection === 'lectures') {
    return { id, name: requireString(record.name, 'name', 200), content: requireObject(record.content, 'content'), updated_at, deleted_at: record.deleted_at ?? null };
  }
  if (collection === 'modules') {
    const name = requireString(record.name, 'name', 60).trim();
    if (!name) throw new ApiError(400, 'Module name is invalid.');
    return {
      id,
      name,
      created_at: requireTimestamp(record.created_at, 'created_at'),
      updated_at,
      deleted_at: record.deleted_at ?? null,
    };
  }
  if (collection === 'customCards') {
    const lecture_id = requireString(record.lecture_id, 'lecture_id', 300);
    const card = requireObject(record.card, 'card');
    if (typeof card.id !== 'string' || `${lecture_id}.${card.id}` !== id) {
      throw new ApiError(400, 'Custom card identifiers are invalid.');
    }
    return { id, lecture_id, card, updated_at, deleted_at: record.deleted_at ?? null };
  }
  if (collection === 'cards') {
    const due_date = requireTimestamp(record.due_date, 'due_date');
    const reps = Number(record.reps);
    if (!Number.isInteger(reps) || reps < 0) throw new ApiError(400, 'Card reps are invalid.');
    return { id, state: requireObject(record.state, 'state'), reps, due_date, updated_at, deleted_at: record.deleted_at ?? null };
  }
  if (collection === 'quizResults') {
    return {
      id,
      lecture_id: typeof record.lecture_id === 'string' ? record.lecture_id : null,
      question_id: requireString(record.question_id, 'question_id', 300),
      score: Number(record.score),
      details: requireObject(record.details, 'details'),
      updated_at,
      deleted_at: record.deleted_at ?? null,
    };
  }
  if (collection === 'errors') {
    return { id, data: requireObject(record.data, 'data'), resolved: record.resolved === true, updated_at, deleted_at: record.deleted_at ?? null };
  }
  return {
    id,
    data: requireObject(record.data, 'data'),
    image_path: typeof record.image_path === 'string' ? record.image_path : null,
    image_base64: record.image_base64,
    image_mime: record.image_mime,
    updated_at,
    deleted_at: record.deleted_at ?? null,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const body = getBody(req);
    const deviceId = requireString(body.deviceId, 'deviceId', 100);
    const changes = requireObject(body.changes, 'changes');
    const client = await authenticateRequest(req);
    let accepted = 0;

    for (const collection of Object.keys(tables) as Collection[]) {
      const records = requireArray(changes[collection] ?? [], collection, 500);
      for (const item of records) {
        const raw = requireObject(item, collection);
        if (typeof raw.deleted_at === 'string') {
          const id = requireString(raw.id, `${collection}.id`, 300);
          const updated_at = requireTimestamp(raw.updated_at, 'updated_at');
          const { error } = await client.supabase
            .from(tables[collection])
            .update({ deleted_at: requireTimestamp(raw.deleted_at, 'deleted_at'), updated_at })
            .eq('user_id', client.user.id)
            .eq('id', id)
            .lte('updated_at', updated_at);
          if (error) throw new ApiError(500, `Could not delete ${collection} record.`);
          accepted++;
          continue;
        }
        const record = parseRecord(item, collection) as Record<string, unknown> & { id: string; updated_at: string };
        if (collection === 'notes' && typeof record.image_base64 === 'string') {
          const { data: existing, error: existingError } = await client.supabase
            .from('notes')
            .select('updated_at')
            .eq('user_id', client.user.id)
            .eq('id', record.id)
            .maybeSingle();
          if (existingError) throw new ApiError(500, 'Could not check the existing note.');
          if (existing && Date.parse(existing.updated_at) >= Date.parse(record.updated_at)) continue;
          record.image_path = await uploadNoteImage(client, requireString(record.id, 'notes.id', 300), record.updated_at, record.image_mime, record.image_base64);
          delete record.image_base64;
          delete record.image_mime;
        }
        const stored = await upsertIfNewer(
          client,
          tables[collection],
          record,
          collection === 'cards' ? mergeFlashcard : undefined,
        );
        if (stored) accepted++;
      }
    }

    if (changes.settings != null) {
      const settings = parseRecord(changes.settings, 'settings');
      const { data: existing, error: readError } = await client.supabase
        .from('settings')
        .select('updated_at')
        .eq('user_id', client.user.id)
        .maybeSingle();
      if (readError) throw new ApiError(500, 'Could not check settings.');
      if (!existing || Date.parse(settings.updated_at) > Date.parse(existing.updated_at)) {
        const { error } = await client.supabase.from('settings').upsert({
          user_id: client.user.id,
          preferences: settings.preferences,
          updated_at: settings.updated_at,
        });
        if (error) throw new ApiError(500, 'Could not save settings.');
        accepted++;
      }
    }

    const syncedAt = new Date().toISOString();
    const { error } = await client.supabase.from('sync_state').upsert({
      user_id: client.user.id,
      device_id: deviceId,
      last_sync_at: syncedAt,
      updated_at: syncedAt,
    });
    if (error) throw new ApiError(500, 'Could not update sync state.');
    return res.status(200).json({ syncedAt, accepted });
  } catch (error) {
    return sendError(res, error);
  }
}
