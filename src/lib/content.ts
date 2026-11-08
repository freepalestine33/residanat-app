import { IndexSchema, LectureDraftSchema, LectureSchema, type Lecture, type LectureDraft } from './schema';
import { z } from 'zod';

const base = import.meta.env.BASE_URL + 'data/';
type LectureIndex = z.infer<typeof IndexSchema>;
let indexPromise: Promise<LectureIndex> | null = null;
const lecturePromises = new Map<string, Promise<Lecture>>();

async function getJson(path: string): Promise<unknown> {
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(`Impossible de charger ${path} (HTTP ${r.status}).`);
  const contentType = r.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) throw new Error(`Le fichier ${path} n’est pas disponible.`);
  return r.json();
}
export const loadIndex = (): Promise<LectureIndex> => {
  if (!indexPromise) {
    indexPromise = getJson('index.json').then((data) => IndexSchema.parse(data)).catch((error: unknown) => {
      indexPromise = null;
      throw error;
    });
  }
  return indexPromise;
};
export const loadLectureDraft = async (id: string): Promise<LectureDraft> => {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error('Invalid draft id.');
  const response = await fetch(`${import.meta.env.BASE_URL}data/drafts/${id}.json`);
  if (!response.ok) throw new Error(`Draft ${id} is unavailable in this local app (HTTP ${response.status}).`);
  return LectureDraftSchema.parse(await response.json());
};
// Lectures load lazily, one file at a time.
export class LectureNotFoundError extends Error {
  constructor(id: string) {
    super(`Le cours « ${id} » n’existe pas dans le contenu disponible.`);
    this.name = 'LectureNotFoundError';
  }
}
export const loadLecture = async (id: string): Promise<Lecture> => {
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new LectureNotFoundError(id);
  const cached = lecturePromises.get(id);
  if (cached) return cached;
  const pending = (async () => {
    const index = await loadIndex();
    if (!index.lectures.some((lecture) => lecture.id === id)) throw new LectureNotFoundError(id);
    try {
      return LectureSchema.parse(await getJson(`lectures/${id}.json`));
    } catch (error) {
      if (error instanceof SyntaxError) throw new LectureNotFoundError(id);
      throw error;
    }
  })();
  lecturePromises.set(id, pending);
  try {
    return await pending;
  } catch (error) {
    if (lecturePromises.get(id) === pending) lecturePromises.delete(id);
    throw error;
  }
};
