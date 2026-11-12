import { db, type UserModule } from '../db/db';
import { createId } from './createId';
import { notifyModulesUpdated } from './syncEvents';
import type { Lecture } from './schema';

export function normalizeModuleName(name: string) {
  return name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}

export function validateModuleName(name: string, existingNames: string[]) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Saisissez un nom pour ce module.');
  if (trimmed.length > 60) throw new Error('Le nom du module doit contenir 60 caractères maximum.');
  const normalized = normalizeModuleName(trimmed);
  if (existingNames.some((existing) => normalizeModuleName(existing) === normalized)) {
    throw new Error('Un module porte déjà ce nom.');
  }
  return trimmed;
}

export function assignLectureToModule(lecture: Lecture, moduleId: string | null): Lecture {
  return { ...lecture, moduleId };
}

export async function createUserModule(name: string): Promise<UserModule> {
  const module = await db.transaction('rw', db.modules, db.syncQueue, async () => {
    const modules = await db.modules.toArray();
    const trimmed = validateModuleName(name, modules.map((item) => item.name));
    const now = Date.now();
    const created: UserModule = { id: createId(), name: trimmed, createdAt: now, updatedAt: now };
    await db.modules.add(created);
    await db.syncQueue.put({
      key: `modules:${created.id}`,
      collection: 'modules',
      recordId: created.id,
      operation: 'upsert',
      record: {
        id: created.id,
        name: created.name,
        created_at: new Date(created.createdAt).toISOString(),
        updated_at: new Date(created.updatedAt).toISOString(),
        deleted_at: null,
      },
      updatedAt: now,
    });
    return created;
  });
  notifyModulesUpdated();
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('residanat:local-change'));
  return module;
}

export async function moveUserLecture(lectureId: string, moduleId: string | null) {
  await db.transaction('rw', db.userLectures, db.modules, db.syncQueue, async () => {
    const lecture = await db.userLectures.get(lectureId);
    if (!lecture) throw new Error('Ce cours personnel est introuvable.');
    if (moduleId && !(await db.modules.get(moduleId))) throw new Error('Ce module est introuvable.');
    const updatedAt = Math.max(Date.now(), lecture.updatedAt + 1);
    const content = assignLectureToModule(lecture.content, moduleId);
    const updated = { ...lecture, content, updatedAt };
    await db.userLectures.put(updated);
    await db.syncQueue.put({
      key: `lectures:${lectureId}`,
      collection: 'lectures',
      recordId: lectureId,
      operation: 'upsert',
      record: {
        id: lectureId,
        name: updated.name,
        content,
        updated_at: new Date(updatedAt).toISOString(),
        deleted_at: null,
      },
      updatedAt,
    });
  });
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('residanat:local-change'));
}
