import type { Lecture, LectureMeta } from '../types/lecture';
import { loadIndex, loadLecture } from '../lib/content';
import { db } from '../db/db';

export async function loadLectureIndex(): Promise<LectureMeta[]> {
  const index = await loadIndex();
  const imported = await db.userLectures.toArray();
  return [
    ...index.lectures,
    ...imported.map(({ content }) => ({
      id: content.id,
      progId: content.progId ?? null,
      otrNumber: content.otrNumber,
      name: content.name,
      cards: content.cards.length,
      quiz: content.quiz.length,
      vf: content.vf.length,
      ...(content.pdfUrl ? { pdfUrl: content.pdfUrl } : {}),
    })),
  ];
}

export async function loadLectureById(id: string): Promise<Lecture> {
  try {
    return await loadLecture(id);
  } catch (error) {
    const imported = (await db.userLectures.toArray()).find((lecture) => lecture.content.id === id);
    if (imported) return imported.content;
    throw error;
  }
}

export async function loadLecturePdf(id: string): Promise<{ blob: Blob; name?: string } | undefined> {
  const imported = await db.userLectures.get(id);
  return imported?.pdfBlob ? { blob: imported.pdfBlob, name: imported.pdfName } : undefined;
}

export async function loadAllLectures(): Promise<Lecture[]> {
  const index = await loadIndex();
  const [lectures, imported] = await Promise.all([
    Promise.all(index.lectures.map(meta => loadLectureById(meta.id))),
    db.userLectures.toArray(),
  ]);
  return [...lectures, ...imported.map(({ content }) => content)];
}

export function getLectureById(lectures: Lecture[], id: string): Lecture | undefined {
  return lectures.find(l => l.id === id);
}

export function getLecturesByProgId(lectures: Lecture[], progId: string): Lecture[] {
  return lectures.filter(l => l.progId === progId);
}

export function searchLectures(lectures: Lecture[], query: string): Lecture[] {
  const q = query.toLowerCase().trim();
  if (!q) return lectures;

  return lectures.filter(l =>
    l.name.toLowerCase().includes(q) ||
    l.keys.some(k => k.toLowerCase().includes(q)) ||
    l.contrasts.some(c => c.toLowerCase().includes(q))
  );
}
