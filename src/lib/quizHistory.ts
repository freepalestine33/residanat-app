import { createId } from './createId';
import { db, type QuizResult } from '../db/db';
import { queueSyncChange } from './syncEvents';
import { buildReviewSchedule, type ReviewRating, type ReviewSchedule } from './errorSchedule';

export interface LectureAnswers {
  selections: Record<string, string[]>;
  quizResults: Record<string, boolean>;
  vfAnswers: Record<string, boolean>;
  vfResults: Record<string, boolean>;
}

/** Validated answers of the lecture's quiz (checkbox indices) and vrai/faux. */
interface StoredAnswer {
  questionId: string;
  kind: string;
  correct: boolean;
  answer: string[];
}

/** Keeps the most recent validated answer per question. */
function storedAnswersFromRows(rows: QuizResult[]): StoredAnswer[] {
  const latest = new Map<string, QuizResult>();
  for (const row of rows) {
    const previous = latest.get(row.questionId);
    if (!previous || row.updatedAt >= previous.updatedAt) latest.set(row.questionId, row);
  }
  return [...latest.values()].map((row) => ({
    questionId: row.questionId,
    kind: String(row.details.kind ?? 'quiz'),
    correct: row.details.correct === true || row.score === 1,
    answer: Array.isArray(row.details.answer) ? row.details.answer.map(String) : [],
  }));
}

/**
 * Restores the answers already validated for a lecture so the learner finds the
 * questions solved when coming back to the course.
 */
export async function loadLectureAnswers(lectureId: string): Promise<LectureAnswers> {
  const rows = await db.quizResults.where('lectureId').equals(lectureId).toArray();
  const answers: LectureAnswers = { selections: {}, quizResults: {}, vfAnswers: {}, vfResults: {} };
  for (const row of storedAnswersFromRows(rows)) {
    if (row.kind === 'vf') {
      answers.vfAnswers[row.questionId] = row.answer[0] === 'true';
      answers.vfResults[row.questionId] = row.correct;
    } else {
      answers.selections[row.questionId] = row.answer;
      answers.quizResults[row.questionId] = row.correct;
    }
  }
  return answers;
}

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
