import type { Lecture, LectureMeta } from '../types/lecture';
import { loadIndex, loadLecture } from '../lib/content';
import { db } from '../db/db';
import { listAllCustomCards, listCustomCards, mergeLectureCards } from '../lib/customCards';

export async function loadLectureIndex(): Promise<LectureMeta[]> {
  const index = await loadIndex();
  const imported = await db.userLectures.toArray();
  const customCounts = new Map<string, number>();
  for (const { lectureId } of await listAllCustomCards()) {
    customCounts.set(lectureId, (customCounts.get(lectureId) ?? 0) + 1);
  }
  const lecturesById = new Map<string, LectureMeta>(index.lectures.map((lecture) => [lecture.id, lecture]));
  for (const { id: userLectureId, content } of imported) {
    lecturesById.set(content.id, {
      id: content.id,
      progId: content.progId ?? null,
      otrNumber: content.otrNumber,
      name: content.name,
      cards: content.cards.length,
      quiz: content.quiz.length,
      vf: content.vf.length,
      ...(content.pdfUrl ? { pdfUrl: content.pdfUrl } : {}),
      isUserCreated: true,
      userLectureId,
    });
  }
  for (const [lectureId, extra] of customCounts) {
    const meta = lecturesById.get(lectureId);
    if (meta) lecturesById.set(lectureId, { ...meta, cards: meta.cards + extra });
  }
  return [...lecturesById.values()];
}

export async function loadLectureById(id: string): Promise<Lecture> {
  let lecture: Lecture;
  try {
    lecture = await loadLecture(id);
  } catch (error) {
    const imported = (await db.userLectures.toArray()).find((item) => item.content.id === id);
    if (!imported) throw error;
    lecture = imported.content;
  }
  const custom = await listCustomCards(id);
  return custom.length ? { ...lecture, cards: mergeLectureCards(lecture.cards, custom) } : lecture;
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
  const importedLectures = await Promise.all(imported.map(async ({ content }) => {
    const custom = await listCustomCards(content.id);
    return custom.length ? { ...content, cards: mergeLectureCards(content.cards, custom) } : content;
  }));
  return [...lectures, ...importedLectures];
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
