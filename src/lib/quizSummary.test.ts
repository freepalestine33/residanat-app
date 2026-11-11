import { describe, expect, it } from 'vitest';
import { summarizeQuiz } from './quizSummary';

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
