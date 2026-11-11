import { describe, expect, it } from 'vitest';
import type { QuizResult } from '../db/db';
import { lectureCompletionPercent } from './lectureCompletion';

const lecture = { id: 'amputations', cards: 10, quiz: 4, vf: 6 };

function result(questionId: string, kind: 'quiz' | 'vf', lectureId = lecture.id): QuizResult {
  return {
    id: `${lectureId}-${kind}-${questionId}`,
    lectureId,
    questionId,
    score: 0,
    details: { kind, correct: false, answer: [] },
    updatedAt: 1,
  };
}

describe('lectureCompletionPercent', () => {
  it('reaches 100% after every card, quiz and true/false question is completed', () => {
    const results = [
      ...Array.from({ length: lecture.quiz }, (_, index) => result(`q-${index}`, 'quiz')),
      ...Array.from({ length: lecture.vf }, (_, index) => result(`vf-${index}`, 'vf')),
    ];

    expect(lectureCompletionPercent(lecture, lecture.cards, results)).toBe(100);
  });

  it('combines completed cards, quiz and true/false items in one percentage', () => {
    const results = [result('q-1', 'quiz'), result('vf-1', 'vf'), result('vf-2', 'vf')];
    expect(lectureCompletionPercent(lecture, 5, results)).toBe(40);
  });

  it('counts each question once, including incorrect but validated answers', () => {
    const results = [
      result('q-1', 'quiz'),
      { ...result('q-1', 'quiz'), id: 'retry-q-1', updatedAt: 2 },
    ];
    expect(lectureCompletionPercent(lecture, 0, results)).toBe(5);
  });

  it('ignores other lectures and caps counts to the current course content', () => {
    const results = [result('q-1', 'quiz', 'another-course')];
    expect(lectureCompletionPercent(lecture, 100, results)).toBe(50);
  });

  it('returns zero for a course with no activities', () => {
    expect(lectureCompletionPercent({ id: lecture.id, cards: 0, quiz: 0, vf: 0 }, 0, [])).toBe(0);
  });
});
