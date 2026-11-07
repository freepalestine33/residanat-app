import { db } from '../db/db';
import { queueSyncChange } from './syncEvents';

export async function saveQuizResult(
  lectureId: string,
  questionId: string,
  kind: 'quiz' | 'vf',
  correct: boolean,
  answer: string[],
) {
  const updatedAt = Date.now();
  const id = crypto.randomUUID();
  const details = { kind, correct, answer };
  const result = { id, lectureId, questionId, score: Number(correct), details, updatedAt };
  await db.quizResults.put(result);
  await queueSyncChange('quizResults', id, 'upsert', {
    id,
    lecture_id: lectureId,
    question_id: questionId,
    score: result.score,
    details,
    updated_at: new Date(updatedAt).toISOString(),
    deleted_at: null,
  });
}
