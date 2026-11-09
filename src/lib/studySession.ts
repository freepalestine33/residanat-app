import { queueSettingsSync } from './syncEvents';

export interface StudySessionSnapshot {
  version: 1;
  cardIds: string[];
  index: number;
  revealed: boolean;
  lectureId: string | null;
  updatedAt: number;
}

const SESSION_KEY = 'sa_active_study_session_v1';

export function parseStudySession(value: unknown): StudySessionSnapshot | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Saved study session is invalid.');
  }
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1
    || !Array.isArray(record.cardIds)
    || record.cardIds.length === 0
    || record.cardIds.length > 20
    || !record.cardIds.every((id) => typeof id === 'string' && id.length > 0)
    || !Number.isInteger(record.index)
    || Number(record.index) < 0
    || Number(record.index) >= record.cardIds.length
    || typeof record.revealed !== 'boolean'
    || !(typeof record.lectureId === 'string' || record.lectureId === null)
    || typeof record.updatedAt !== 'number'
    || !Number.isFinite(record.updatedAt)
  ) {
    throw new Error('Saved study session is invalid.');
  }
  return {
    version: 1,
    cardIds: record.cardIds as string[],
    index: record.index as number,
    revealed: record.revealed,
    lectureId: record.lectureId,
    updatedAt: record.updatedAt,
  };
}

export function readStudySession(): StudySessionSnapshot | null {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    return stored === null ? null : parseStudySession(JSON.parse(stored) as unknown);
  } catch (error) {
    console.error('Could not read the saved study session.', error);
    return null;
  }
}

function readPreferences() {
  try {
    const preferences: unknown = JSON.parse(localStorage.getItem('sa_settings_v1') || '{}');
    return preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? preferences as Record<string, unknown>
      : {};
  } catch (error) {
    console.error('Could not read settings while saving the study session.', error);
    return {};
  }
}

export async function saveStudySession(session: StudySessionSnapshot | null) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  await queueSettingsSync({ ...readPreferences(), activeStudySession: session });
  window.dispatchEvent(new Event('residanat:study-session-updated'));
}
