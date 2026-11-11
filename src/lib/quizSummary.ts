export interface QuizSummary {
  completed: number;
  correct: number;
  total: number;
  percentage: number;
  isComplete: boolean;
}

export function filterQuizQuestions<T extends { id: string }>(
  questions: T[],
  results: Record<string, boolean>,
  incorrectOnly: boolean,
): T[] {
  return incorrectOnly ? questions.filter((question) => results[question.id] !== true) : questions;
}

export function summarizeQuiz(
  questionIds: string[],
  results: Record<string, boolean>,
): QuizSummary {
  const completed = questionIds.filter((questionId) => results[questionId] !== undefined);
  const correct = completed.filter((questionId) => results[questionId] === true).length;
  const total = questionIds.length;

  return {
    completed: completed.length,
    correct,
    total,
    percentage: total ? Math.round((correct / total) * 100) : 0,
    isComplete: total > 0 && completed.length === total,
  };
}
