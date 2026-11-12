import type { User } from '@supabase/supabase-js';
import { db, type Note, type SyncQueueItem } from '../db/db';
import { blobToBase64, compressNoteImage } from './images';
import { notifyModulesUpdated, queueSyncChange } from './syncEvents';
import { supabase } from './supabase';
import { useSettingsStore } from '../stores/settingsStore';
import { useProgressStore } from '../stores/progressStore';
import { useErrorStore } from '../stores/errorStore';
import { loadLegacyNotes } from './legacyNotes';
import { CardSchema, LectureSchema } from './schema';
import { createId } from './createId';
import { parseStudySession } from './studySession';
import {
  readLecturePositions,
  readLectureSections,
  sanitizeLecturePositions,
  sanitizeLectureSections,
} from './lectureProgress';
import { preserveLocalLecturePdf } from './userLectureSync';
import { notifyCustomCardsUpdated, queueCustomCardSnapshot } from './customCards';
import { readSyncResponse } from './syncResponse';

export type SyncStatus = 'local' | 'offline' | 'syncing' | 'synced' | 'error' | 'conflict';
type Collection = 'lectures' | 'modules' | 'customCards' | 'cards' | 'quizResults' | 'errors' | 'notes';
type CloudRecord = Record<string, unknown> & { id: string; updated_at: string };
type PullPayload = {
  syncedAt: string;
  lectures: CloudRecord[];
  modules: CloudRecord[];
  customCards: CloudRecord[];
  cards: CloudRecord[];
  quizResults: CloudRecord[];
  errors: CloudRecord[];
  notes: CloudRecord[];
  settings: (Record<string, unknown> & { updated_at: string }) | null;
};
type PushChanges = Record<Collection, Record<string, unknown>[]> & { settings?: Record<string, unknown> };
export interface SyncOutcome {
  status: SyncStatus;
  message?: string;
  error?: string;
  initialChoiceRequired?: boolean;
}
const LAST_SYNC_KEY = 'sa_sync_last_at';
const DEVICE_KEY = 'sa_sync_device_id';
const initializedKey = (userId: string) => `sa_sync_initialized_${userId}`;
const customCardsBackfillKey = (userId: string) => `sa_custom_cards_backfilled_v1_${userId}`;
let currentSync: Promise<SyncOutcome> | null = null;

function deviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = createId();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function requestApi<T>(path: string, method: 'GET' | 'POST' | 'DELETE', token: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return readSyncResponse<T>(response, path);
}

async function pull(token: string, since: string | null) {
  return requestApi<PullPayload>('/api/sync/pull', 'POST', token, { since, deviceId: deviceId() });
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function iso(value: number | string | undefined, fallback = Date.now()) {
  const time = typeof value === 'number' ? value : value ? Date.parse(value) : fallback;
  return new Date(Number.isFinite(time) ? time : fallback).toISOString();
}

function readErrors() {
  try {
    const stored = JSON.parse(localStorage.getItem('sa_errors_v3') || '[]') as unknown;
    return Array.isArray(stored) ? stored.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object') : [];
  } catch (error) {
    console.error('Could not read the local error log for sync.', error);
    return [];
  }
}

function readSettings() {
  let preferences: Record<string, unknown> = {};
  try {
    preferences = objectValue(JSON.parse(localStorage.getItem('sa_settings_v1') || '{}'));
  } catch (error) {
    console.error('Could not read local settings for sync.', error);
  }
  try {
    const storedSession = localStorage.getItem('sa_active_study_session_v1');
    if (storedSession !== null) preferences.activeStudySession = JSON.parse(storedSession) as unknown;
  } catch (error) {
    console.error('Could not read the saved study session for sync.', error);
  }
  preferences.streak = Number(localStorage.getItem('sa_streak') || '0');
  preferences.errorCount = Number(localStorage.getItem('sa_error_count') || '0');
  preferences.lecturePositions = readLecturePositions();
  preferences.lectureSections = readLectureSections();
  let updatedAt = localStorage.getItem('sa_settings_updated_at');
  if (!updatedAt) {
    updatedAt = new Date().toISOString();
    localStorage.setItem('sa_settings_updated_at', updatedAt);
  }
  return { preferences, updated_at: iso(updatedAt) };
}

async function queueFullLocalSnapshot() {
  const [cards, quizResults, notes, lectures, modules] = await Promise.all([
    db.cards.toArray(),
    db.quizResults.toArray(),
    db.notes.toArray(),
    db.userLectures.toArray(),
    db.modules.toArray(),
  ]);
  const legacyNotes = await loadLegacyNotes();
  for (const lecture of lectures) {
    await queueSyncChange('lectures', lecture.id, 'upsert', {
      id: lecture.id,
      name: lecture.name,
      content: { ...lecture.content },
      updated_at: iso(lecture.updatedAt),
      deleted_at: null,
    });
  }
  for (const module of modules) {
    await queueSyncChange('modules', module.id, 'upsert', {
      id: module.id,
      name: module.name,
      created_at: iso(module.createdAt),
      updated_at: iso(module.updatedAt),
      deleted_at: null,
    });
  }
  await queueCustomCardSnapshot();
  for (const card of cards) {
    const state = objectValue(card.state);
    const record = {
      id: card.gid,
      state,
      reps: Number(state.reps ?? 0),
      due_date: iso(card.due),
      updated_at: iso(card.updated),
      deleted_at: null,
    };
    await queueSyncChange('cards', card.gid, 'upsert', record);
  }
  for (const result of quizResults) {
    await queueSyncChange('quizResults', result.id, 'upsert', {
      id: result.id,
      lecture_id: result.lectureId,
      question_id: result.questionId,
      score: result.score,
      details: result.details,
      updated_at: iso(result.updatedAt),
      deleted_at: null,
    });
  }
  for (const note of notes) await queueNote(note);
  for (const note of legacyNotes) {
    const syncId = `legacy-${note.id}`;
    await queueSyncChange('notes', syncId, 'upsert', {
      id: syncId,
      data: { rel: note.rel, text: note.text, link: note.link },
      image: note.image,
      image_path: null,
      updated_at: iso(note.timestamp),
      deleted_at: null,
    });
  }
  for (const entry of readErrors()) {
    if (typeof entry.id !== 'string') continue;
    await queueSyncChange('errors', entry.id, 'upsert', {
      id: entry.id,
      data: entry,
      resolved: entry.resolved === true,
      updated_at: iso(typeof entry.ts === 'string' ? entry.ts : undefined),
      deleted_at: null,
    });
  }
  await queueSyncChange('settings', 'settings', 'upsert', readSettings());
}

async function queueNote(note: Note) {
  const syncId = note.syncId || (note.id === undefined ? createId() : `legacy-${note.id}`);
  if (note.syncId !== syncId && note.id !== undefined) await db.notes.update(note.id, { syncId });
  await queueSyncChange('notes', syncId, 'upsert', {
    id: syncId,
    data: { rel: note.rel, text: note.text, link: note.link },
    image: note.image,
    image_path: note.imagePath ?? null,
    updated_at: iso(note.updated),
    deleted_at: null,
  });
}

async function imageFields(image: unknown) {
  if (image instanceof Blob) {
    const compressed = await compressNoteImage(new File([image], 'note-image', { type: image.type || 'image/webp' }));
    return { image_base64: await blobToBase64(compressed), image_mime: compressed.type };
  }
  if (typeof image !== 'string' || !image.startsWith('data:image/')) return {};
  const blob = await (await fetch(image)).blob();
  const compressed = await compressNoteImage(new File([blob], 'note-image', { type: blob.type }));
  return { image_base64: await blobToBase64(compressed), image_mime: compressed.type };
}

async function prepareChanges(items: SyncQueueItem[]): Promise<PushChanges> {
  const changes: PushChanges = { lectures: [], modules: [], customCards: [], cards: [], quizResults: [], errors: [], notes: [] };
  for (const item of items) {
    if (item.collection === 'settings') {
      if (item.operation === 'upsert' && item.record) changes.settings = item.record;
      continue;
    }
    if (!(item.collection in changes)) continue;
    const collection = item.collection as Collection;
    if (item.operation === 'delete') {
      changes[collection].push({ id: item.recordId, updated_at: iso(item.updatedAt), deleted_at: iso(item.updatedAt) });
      continue;
    }
    const record = { ...(item.record ?? {}) };
    if (collection === 'notes') {
      const { image, ...rest } = record;
      changes.notes.push({ ...rest, ...await imageFields(image) });
    } else {
      changes[collection].push(record);
    }
  }
  return changes;
}

async function applyCards(records: CloudRecord[]) {
  for (const record of records) {
    const id = record.id;
    const remoteDeleted = typeof record.deleted_at === 'string';
    const local = await db.cards.get(id);
    if (remoteDeleted) {
      if (local && Date.parse(String(record.deleted_at)) >= local.updated) await db.cards.delete(id);
      continue;
    }
    const remoteState = objectValue(record.state);
    const remoteReps = Number(record.reps ?? 0);
    const remoteDue = Date.parse(String(record.due_date));
    const localState = objectValue(local?.state);
    const localReps = Number(localState.reps ?? 0);
    const localWins = !!local && (localReps > remoteReps || (localReps === remoteReps && local.due > remoteDue));
    if (localWins) {
      await queueSyncChange('cards', id, 'upsert', {
        id,
        state: localState,
        reps: localReps,
        due_date: iso(local?.due),
        updated_at: iso(local?.updated),
        deleted_at: null,
      });
    } else {
      await db.cards.put({ gid: id, state: remoteState, due: remoteDue, updated: Date.parse(record.updated_at) });
    }
  }
}

async function applyNotes(records: CloudRecord[], forceCloud = false) {
  for (const record of records) {
    const id = record.id;
    const existing = await db.notes.where('syncId').equals(id).first();
    const data = objectValue(record.data);
    const updated = Date.parse(record.updated_at);
    if (typeof record.deleted_at === 'string') {
      if (existing && updated >= existing.updated) await db.notes.delete(existing.id!);
      continue;
    }
    if (existing && !forceCloud && existing.updated > updated) continue;
    await db.notes.put({
      ...(existing?.id !== undefined ? { id: existing.id } : {}),
      syncId: id,
      rel: typeof data.rel === 'string' ? data.rel : 'libre',
      text: typeof data.text === 'string' ? data.text : '',
      link: typeof data.link === 'string' ? data.link : undefined,
      image: typeof record.image_url === 'string' ? record.image_url : undefined,
      imagePath: typeof record.image_path === 'string' ? record.image_path : undefined,
      updated,
    });
  }
}

async function applyRemote(payload: PullPayload, forceCloud = false) {
  let modulesChanged = false;
  for (const record of payload.modules ?? []) {
    const local = await db.modules.get(record.id);
    const updatedAt = Date.parse(record.updated_at);
    if (typeof record.deleted_at === 'string') {
      if (local && Date.parse(String(record.deleted_at)) >= local.updatedAt) {
        await db.modules.delete(record.id);
        modulesChanged = true;
      }
      continue;
    }
    if (local && !forceCloud && local.updatedAt > updatedAt) continue;
    await db.modules.put({
      id: record.id,
      name: String(record.name),
      createdAt: Date.parse(String(record.created_at ?? record.updated_at)),
      updatedAt,
    });
    modulesChanged = true;
  }
  if (modulesChanged) notifyModulesUpdated();
  let customCardsChanged = false;
  for (const record of payload.customCards ?? []) {
    const local = await db.customCards.get(record.id);
    const updatedAt = Date.parse(record.updated_at);
    if (typeof record.deleted_at === 'string') {
      if (local && Date.parse(String(record.deleted_at)) >= local.updatedAt) {
        await db.customCards.delete(record.id);
        customCardsChanged = true;
      }
      continue;
    }
    if (local && !forceCloud && local.updatedAt > updatedAt) {
      await queueSyncChange('customCards', local.gid, 'upsert', {
        id: local.gid,
        lecture_id: local.lectureId,
        card: local.card,
        updated_at: iso(local.updatedAt),
        deleted_at: null,
      });
      continue;
    }
    await db.customCards.put({
      gid: record.id,
      lectureId: String(record.lecture_id),
      card: CardSchema.parse(record.card),
      updatedAt,
    });
    customCardsChanged = true;
  }
  if (customCardsChanged) notifyCustomCardsUpdated();
  for (const record of payload.lectures ?? []) {
    const local = await db.userLectures.get(record.id);
    const updatedAt = Date.parse(record.updated_at);
    if (typeof record.deleted_at === 'string') {
      if (local && Date.parse(String(record.deleted_at)) >= local.updatedAt) await db.userLectures.delete(record.id);
      continue;
    }
    if (local && !forceCloud && local.updatedAt > updatedAt) continue;
    await db.userLectures.put(preserveLocalLecturePdf({
      id: record.id,
      name: String(record.name),
      content: LectureSchema.parse(record.content),
      updatedAt,
    }, local));
  }
  await applyCards(payload.cards ?? []);
  for (const record of payload.quizResults ?? []) {
    const existing = await db.quizResults.get(record.id);
    if (typeof record.deleted_at === 'string') {
      if (existing && Date.parse(String(record.deleted_at)) >= existing.updatedAt) await db.quizResults.delete(record.id);
      continue;
    }
    const updatedAt = Date.parse(record.updated_at);
    if (!existing || forceCloud || updatedAt >= existing.updatedAt) {
      const details = objectValue(record.details);
      await db.quizResults.put({
        id: record.id,
        lectureId: String(record.lecture_id ?? ''),
        questionId: String(record.question_id),
        score: Number(record.score),
        details,
        updatedAt,
      });
    }
  }
  for (const record of payload.errors ?? []) {
    const existing = readErrors();
    const local = existing.find((entry) => entry.id === record.id);
    const updated = Date.parse(record.updated_at);
    if (local && !forceCloud && Date.parse(String(local.ts ?? 0)) > updated) continue;
    const others = existing.filter((entry) => entry.id !== record.id);
    if (typeof record.deleted_at !== 'string') others.push(objectValue(record.data));
    localStorage.setItem('sa_errors_v3', JSON.stringify(others));
  }
  await applyNotes(payload.notes ?? [], forceCloud);
  if (payload.settings) {
    const updated = Date.parse(payload.settings.updated_at);
    const localUpdated = Date.parse(localStorage.getItem('sa_settings_updated_at') ?? '1970-01-01');
    if (forceCloud || updated >= localUpdated) {
      const preferences = objectValue(payload.settings.preferences);
      const settings = {
        soundEnabled: preferences.soundEnabled ?? true,
        speechEnabled: preferences.speechEnabled ?? false,
        theme: preferences.theme ?? 'light',
        headerCollapsed: preferences.headerCollapsed ?? false,
        studyTrack: preferences.studyTrack === 'fifth-year' ? 'fifth-year' : 'residency',
      };
      if (Object.hasOwn(preferences, 'activeStudySession')) {
        const studySession = parseStudySession(preferences.activeStudySession);
        localStorage.setItem('sa_active_study_session_v1', JSON.stringify(studySession));
        window.dispatchEvent(new Event('residanat:study-session-updated'));
      }
      if (Object.hasOwn(preferences, 'lecturePositions') || Object.hasOwn(preferences, 'lectureSections')) {
        if (Object.hasOwn(preferences, 'lecturePositions')) {
          localStorage.setItem('sa_lecture_positions_v1', JSON.stringify(sanitizeLecturePositions(preferences.lecturePositions)));
        }
        if (Object.hasOwn(preferences, 'lectureSections')) {
          localStorage.setItem('sa_lecture_sections_v1', JSON.stringify(sanitizeLectureSections(preferences.lectureSections)));
        }
        window.dispatchEvent(new Event('residanat:lecture-progress-updated'));
      }
      localStorage.setItem('sa_settings_v1', JSON.stringify(settings));
      localStorage.setItem('sa_streak', String(preferences.streak ?? 0));
      localStorage.setItem('sa_error_count', String(preferences.errorCount ?? 0));
      localStorage.setItem('sa_settings_updated_at', payload.settings.updated_at);
      useSettingsStore.getState().loadSettings();
    }
  }
  // Recompute derived statistics so the Progression page reflects freshly synced data.
  void useProgressStore.getState().loadStats();
  void useErrorStore.getState().loadErrors();
}

function recordCount(payload: PullPayload) {
  return payload.lectures.length + payload.modules.length + payload.customCards.length + payload.cards.length + payload.quizResults.length + payload.errors.length + payload.notes.length + Number(!!payload.settings);
}

async function localDataCount() {
  const [cards, quizzes, notes, legacyNotes, lectures, modules, customCards] = await Promise.all([
    db.cards.count(),
    db.quizResults.count(),
    db.notes.count(),
    loadLegacyNotes(),
    db.userLectures.count(),
    db.modules.count(),
    db.customCards.count(),
  ]);
  return cards + quizzes + notes + legacyNotes.length + lectures + modules + customCards + readErrors().length + Number(!!localStorage.getItem('sa_settings_v1'));
}

async function pushQueue(token: string) {
  const items = await db.syncQueue.toArray();
  if (!items.length) return;
  const imageNotes = items.filter((item) => item.collection === 'notes' && (item.record?.image instanceof Blob || typeof item.record?.image === 'string'));
  const regular = items.filter((item) => !imageNotes.includes(item));
  const batches: SyncQueueItem[][] = [];
  for (let index = 0; index < regular.length; index += 100) batches.push(regular.slice(index, index + 100));
  batches.push(...imageNotes.map((item) => [item]));

  for (const batch of batches) {
    const body = { deviceId: deviceId(), changes: await prepareChanges(batch) };
    await requestApi('/api/sync/push', 'POST', token, body);
    for (const item of batch) {
      const latest = await db.syncQueue.get(item.key);
      if (latest?.updatedAt === item.updatedAt) await db.syncQueue.delete(item.key);
    }
  }
}

async function performSync(user: User, initialChoice?: 'upload' | 'download'): Promise<SyncOutcome> {
  if (!supabase) return { status: 'local' };
  if (!navigator.onLine) return { status: 'offline' };
  const { data: { session }, error } = await supabase.getSession();
  if (error || !session) return { status: 'local', error: error?.message };
  const token = session.access_token;
  const firstSync = localStorage.getItem(initializedKey(user.id)) !== '1';
  const customCardsBackfilled = localStorage.getItem(customCardsBackfillKey(user.id)) === '1';
  if (!firstSync && !customCardsBackfilled) {
    await queueCustomCardSnapshot();
    localStorage.setItem(customCardsBackfillKey(user.id), '1');
  }

  if (firstSync && !initialChoice) {
    const [remote, localCount] = await Promise.all([pull(token, null), localDataCount()]);
    if (localCount && recordCount(remote)) return { status: 'conflict', initialChoiceRequired: true };
    if (recordCount(remote)) await applyRemote(remote, true);
    else if (localCount) await queueFullLocalSnapshot();
    localStorage.setItem(initializedKey(user.id), '1');
    localStorage.setItem(LAST_SYNC_KEY, remote.syncedAt);
  } else if (initialChoice === 'download') {
    const remote = await pull(token, null);
    await applyRemote(remote, true);
    localStorage.setItem(initializedKey(user.id), '1');
    localStorage.setItem(LAST_SYNC_KEY, remote.syncedAt);
  } else if (initialChoice === 'upload') {
    await queueFullLocalSnapshot();
    await pushQueue(token);
    const remote = await pull(token, null);
    await applyRemote(remote);
    localStorage.setItem(initializedKey(user.id), '1');
    localStorage.setItem(LAST_SYNC_KEY, remote.syncedAt);
  }

  if (firstSync) localStorage.setItem(customCardsBackfillKey(user.id), '1');
  await pushQueue(token);
  const since = localStorage.getItem(LAST_SYNC_KEY);
  const remote = await pull(token, since);
  await applyRemote(remote);
  localStorage.setItem(LAST_SYNC_KEY, remote.syncedAt);
  return { status: 'synced', message: 'Data synced across devices.' };
}

export function synchronize(user: User, initialChoice?: 'upload' | 'download'): Promise<SyncOutcome> {
  if (currentSync) return currentSync;
  currentSync = performSync(user, initialChoice)
    .catch((error: unknown) => ({
      status: navigator.onLine ? 'error' as const : 'offline' as const,
      error: error instanceof Error ? error.message : String(error),
    }))
    .finally(() => { currentSync = null; });
  return currentSync;
}
