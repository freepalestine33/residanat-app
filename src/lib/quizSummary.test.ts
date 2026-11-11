import { describe, expect, it } from 'vitest';
import { filterQuizQuestions, summarizeQuiz } from './quizSummary';

describe('summarizeQuiz', () => {
  it('counts correct answers and the score percentage after all questions are resolved', () => {
    expect(summarizeQuiz(['q1', 'q2', 'q3', 'q4'], {
      q1: true,
      q2: false,
      q3: true,
      q4: true,
    })).toEqual({
      completed: 4,
      correct: 3,
      total: 4,
      percentage: 75,
      isComplete: true,
    });
  });

  it('does not count unanswered questions as completed or correct', () => {
    expect(summarizeQuiz(['q1', 'q2'], { q1: true })).toEqual({
      completed: 1,
      correct: 1,
      total: 2,
      percentage: 50,
      isComplete: false,
    });
  });

  describe('filterQuizQuestions', () => {
    const questions = [{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }];

    it('returns only unanswered or incorrect questions when review filtering is active', () => {
      expect(filterQuizQuestions(questions, { q1: true, q2: false }, true)).toEqual([
        { id: 'q2' },
        { id: 'q3' },
      ]);
    });

    it('returns every question when review filtering is inactive', () => {
      expect(filterQuizQuestions(questions, { q1: true, q2: false }, false)).toEqual(questions);
    });
  });

  it('does not show a complete summary for an empty quiz', () => {
    expect(summarizeQuiz([], {})).toEqual({
      completed: 0,
      correct: 0,
      total: 0,
      percentage: 0,
      isComplete: false,
    });
  });
});
