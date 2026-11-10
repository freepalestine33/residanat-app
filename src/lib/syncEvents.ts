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

/** Raw local map (lectureId → value) used by the synced lecture progress. */
function readStoredMap(key: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function queueSettingsSync(preferences: Record<string, unknown>) {
  const updated_at = new Date().toISOString();
  localStorage.setItem('sa_settings_updated_at', updated_at);
  let activeStudySession: unknown;
  try {
    const storedSession = localStorage.getItem('sa_active_study_session_v1');
    if (storedSession !== null) activeStudySession = JSON.parse(storedSession) as unknown;
  } catch (error) {
    console.error('Could not read the saved study session for synchronization.', error);
  }
  return queueSyncChange('settings', 'settings', 'upsert', {
    preferences: {
      ...preferences,
      ...(activeStudySession !== undefined ? { activeStudySession } : {}),
      lecturePositions: readStoredMap('sa_lecture_positions_v1'),
      lectureSections: readStoredMap('sa_lecture_sections_v1'),
      streak: Number(localStorage.getItem('sa_streak') || '0'),
      errorCount: Number(localStorage.getItem('sa_error_count') || '0'),
    },
    updated_at,
  });
}
