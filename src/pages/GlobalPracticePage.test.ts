import { describe, expect, it } from 'vitest';
import { createPracticeSession, getPracticeSessionForKind } from './GlobalPracticePage';

describe('global practice kind switching', () => {
  it('discards questions and feedback when switching practice kind', () => {
    const quiz = {
      ...createPracticeSession('quiz'),
      queue: [{ id: 'SA.q1', lectureId: 'SA', lectureName: 'Cours', prompt: 'Question QCM', options: [], explanation: '' }],
      selected: ['0'],
      checked: true,
      results: [{ question: { id: 'SA.q1', lectureId: 'SA', lectureName: 'Cours', prompt: 'Question QCM', options: [], explanation: '' }, correct: false }],
      complete: true,
    };

    expect(getPracticeSessionForKind(quiz, 'vf')).toEqual(createPracticeSession('vf'));
    expect(getPracticeSessionForKind(quiz, 'quiz')).toBe(quiz);
  });
});
