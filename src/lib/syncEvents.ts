import { db, type SyncQueueItem } from '../db/db';

export type SyncCollection = 'lectures' | 'cards' | 'quizResults' | 'errors' | 'notes' | 'settings';

export async function queueSyncChange(
  collection: SyncCollection,
  recordId: string,
  operation: SyncQueueItem['operation'],
  record?: Record<string, unknown>,
) {
  const updatedAt = Date.now();
  const key = `${collection}:${recordId}`;
  await db.syncQueue.put({ key, collection, recordId, operation, record, updatedAt });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('residanat:local-change'));
}

export function notifySyncChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('residanat:local-change'));
}

export function queueSettingsSync(preferences: Record<string, unknown>) {
  const updated_at = new Date().toISOString();
  localStorage.setItem('sa_settings_updated_at', updated_at);
  return queueSyncChange('settings', 'settings', 'upsert', {
    preferences: {
      ...preferences,
      streak: Number(localStorage.getItem('sa_streak') || '0'),
      errorCount: Number(localStorage.getItem('sa_error_count') || '0'),
    },
    updated_at,
  });
}
