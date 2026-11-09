import { createId } from './createId';
import { db, type QuizResult } from '../db/db';
import { queueSyncChange } from './syncEvents';
import { buildReviewSchedule, type ReviewRating, type ReviewSchedule } from './errorSchedule';

export async function saveQuizResult(
  lectureId: string,
  questionId: string,
  kind: 'quiz' | 'vf',
  correct: boolean,
  answer: string[],
): Promise<QuizResult> {
  const updatedAt = Date.now();
  const id = createId();
  const details = { kind, correct, answer };
  const result: QuizResult = { id, lectureId, questionId, score: Number(correct), details, updatedAt };
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
  return result;
}

/**
 * Persists the learner's chosen next review on an existing quiz result, keeping
 * `details` a generic JSON object (existing fields are preserved) and mirroring
 * the same sync payload shape as saveQuizResult.
 */
export async function scheduleQuizResult(
  resultId: string,
  rating: ReviewRating,
  now = Date.now(),
): Promise<ReviewSchedule> {
  const existing = await db.quizResults.get(resultId);
  if (!existing) throw new Error('Réponse introuvable : impossible de planifier la révision.');
  const schedule = buildReviewSchedule(rating, now);
  const details = { ...existing.details, ...schedule };
  const updatedAt = Math.max(existing.updatedAt, now);
  await db.quizResults.put({ ...existing, details, updatedAt });
  await queueSyncChange('quizResults', resultId, 'upsert', {
    id: resultId,
    lecture_id: existing.lectureId,
    question_id: existing.questionId,
    score: existing.score,
    details,
    updated_at: new Date(updatedAt).toISOString(),
    deleted_at: null,
  });
  return schedule;
}
