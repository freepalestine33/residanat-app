import { ApiError, type AuthenticatedClient } from './supabase';

export interface SyncRecord {
  id: string;
  updated_at: string;
  [key: string]: unknown;
}

export async function readSince(
  client: AuthenticatedClient,
  table: string,
  since: string | null,
): Promise<SyncRecord[]> {
  const records: SyncRecord[] = [];
  const pageSize = 500;
  let start = 0;
  while (true) {
    let query = client.supabase.from(table).select('*').eq('user_id', client.user.id).order('updated_at').range(start, start + pageSize - 1);
    if (since) query = query.gt('updated_at', since);
    const { data, error } = await query;
    if (error) throw new ApiError(500, `Could not read ${table} for synchronization.`);
    const rows = data as SyncRecord[] | null;
    records.push(...(rows ?? []));
    if (!rows || rows.length < pageSize) return records;
    start += pageSize;
  }
}

export async function readSettings(client: AuthenticatedClient, since: string | null) {
  let query = client.supabase.from('settings').select('*').eq('user_id', client.user.id);
  if (since) query = query.gt('updated_at', since);
  const { data, error } = await query.maybeSingle();
  if (error) throw new ApiError(500, 'Could not read settings for synchronization.');
  return data;
}

export function newer<T extends { updated_at: string }>(local: T, remote: T): T {
  return Date.parse(local.updated_at) >= Date.parse(remote.updated_at) ? local : remote;
}

export async function upsertIfNewer(
  client: AuthenticatedClient,
  table: string,
  record: Record<string, unknown> & { id: string; updated_at: string },
  merge?: (local: SyncRecord, remote: SyncRecord) => Record<string, unknown>,
) {
  const { data: existing, error: readError } = await client.supabase
    .from(table)
    .select('*')
    .eq('user_id', client.user.id)
    .eq('id', record.id)
    .maybeSingle();
  if (readError) throw new ApiError(500, `Could not check the existing ${table} record.`);
  const previous = existing as SyncRecord | null;
  let value: Record<string, unknown> = record;
  if (previous) {
    if (merge) value = merge(record as SyncRecord, previous);
    else if (Date.parse(previous.updated_at) >= Date.parse(record.updated_at)) return false;
  }
  const { error } = await client.supabase.from(table).upsert({ ...value, user_id: client.user.id });
  if (error) throw new ApiError(500, `Could not save ${table} changes.`);
  return true;
}

export function mergeFlashcard(local: SyncRecord, remote: SyncRecord): Record<string, unknown> {
  const localReps = Number(local.reps ?? 0);
  const remoteReps = Number(remote.reps ?? 0);
  if (localReps !== remoteReps) return localReps > remoteReps ? local : remote;
  const localDue = Date.parse(String(local.due_date ?? ''));
  const remoteDue = Date.parse(String(remote.due_date ?? ''));
  if (localDue !== remoteDue) return localDue > remoteDue ? local : remote;
  return newer(local, remote);
}
