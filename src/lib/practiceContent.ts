import { z } from 'zod';
import { LectureQuizSchema, TrueFalseSchema } from './schema';
import { db } from '../db/db';

const PracticeLectureSchema = z.object({
  id: z.string(),
  name: z.string(),
  quiz: z.array(LectureQuizSchema),
  vf: z.array(TrueFalseSchema),
});
export type PracticeLecture = z.infer<typeof PracticeLectureSchema>;

const PracticeIndexSchema = z.object({ lectures: z.array(PracticeLectureSchema) });

const base = import.meta.env.BASE_URL + 'data/';
let practicePromise: Promise<PracticeLecture[]> | null = null;

// Loads the slim build-time practice index (quiz/vf questions only) plus any
// user-imported lectures from IndexedDB. Fetched lazily — never on app start.
export function loadPracticeLectures(): Promise<PracticeLecture[]> {
  if (!practicePromise) {
    practicePromise = (async () => {
      const response = await fetch(`${base}practice.json`);
      if (!response.ok) throw new Error(`practice.json indisponible (HTTP ${response.status}).`);
      const { lectures } = PracticeIndexSchema.parse(await response.json());
      const imported = (await db.userLectures.toArray()).map(({ content }) => ({
        id: content.id,
        name: content.name,
        quiz: content.quiz,
        vf: content.vf,
      }));
      return [...lectures, ...imported];
    })().catch((error: unknown) => {
      practicePromise = null;
      throw error;
    });
  }
  return practicePromise;
}
