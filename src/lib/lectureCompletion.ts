import type { QuizResult } from '../db/db';
import type { LectureMeta } from '../types/lecture';

type LectureCompletionCounts = Pick<LectureMeta, 'id' | 'cards' | 'quiz' | 'vf'>;

export function isCustomModuleComplete(lectureProgress: readonly number[]): boolean {
  return lectureProgress.length > 0 && lectureProgress.every((percent) => percent === 100);
}

export function lectureCompletionPercent(
  lecture: LectureCompletionCounts,
  reviewedCards: number,
  results: QuizResult[],
): number {
  const total = lecture.cards + lecture.quiz + lecture.vf;
  if (total === 0) return 0;

  const completedQuestions = new Map<string, Set<string>>([
    ['quiz', new Set()],
    ['vf', new Set()],
  ]);
  for (const result of results) {
    if (result.lectureId !== lecture.id) continue;
    const kind = result.details.kind;
    if (kind !== 'quiz' && kind !== 'vf') continue;
    if (result.details.correct !== true && !(typeof result.score === 'number' && result.score > 0)) continue;
    completedQuestions.get(kind)?.add(result.questionId);
  }

  const completedCards = Math.min(lecture.cards, Math.max(0, reviewedCards));
  const completedQuiz = Math.min(lecture.quiz, completedQuestions.get('quiz')?.size ?? 0);
  const completedVf = Math.min(lecture.vf, completedQuestions.get('vf')?.size ?? 0);
  const completed = completedCards + completedQuiz + completedVf;
  const roundedPercent = Math.round((completed / total) * 100);
  return completed < total ? Math.min(roundedPercent, 99) : 100;
}
