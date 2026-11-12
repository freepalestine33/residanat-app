import { describe, expect, it } from 'vitest';
import type { QuizResult } from '../db/db';
import { isCustomModuleComplete, lectureCompletionPercent } from './lectureCompletion';

const lecture = { id: 'amputations', cards: 10, quiz: 4, vf: 6 };

function result(
  questionId: string,
  kind: 'quiz' | 'vf',
  correct = false,
  lectureId = lecture.id,
): QuizResult {
  return {
    id: `${lectureId}-${kind}-${questionId}`,
    lectureId,
    questionId,
    score: Number(correct),
    details: { kind, correct, answer: [] },
    updatedAt: 1,
  };
}

describe('lectureCompletionPercent', () => {
  it('reaches 100% after every card, quiz and true/false question is completed', () => {
    const results = [
      ...Array.from({ length: lecture.quiz }, (_, index) => result(`q-${index}`, 'quiz', true)),
      ...Array.from({ length: lecture.vf }, (_, index) => result(`vf-${index}`, 'vf', true)),
    ];

    expect(lectureCompletionPercent(lecture, lecture.cards, results)).toBe(100);
  });

  it('combines completed cards, quiz and true/false items in one percentage', () => {
    const results = [
      result('q-1', 'quiz', true),
      result('vf-1', 'vf', true),
      result('vf-2', 'vf', false),
    ];
    expect(lectureCompletionPercent(lecture, 5, results)).toBe(35);
  });

  describe('isCustomModuleComplete', () => {
    it('requires at least one lecture and every lecture at 100%', () => {
      expect(isCustomModuleComplete([])).toBe(false);
      expect(isCustomModuleComplete([100, 100])).toBe(true);
      expect(isCustomModuleComplete([100, 99])).toBe(false);
    });
  });

  it('does not count an incorrect answer as completed', () => {
    expect(lectureCompletionPercent(lecture, 0, [result('q-1', 'quiz')])).toBe(0);
  });

  it('counts a question once if it was ever correct, even if a later attempt was incorrect', () => {
    const results = [
      result('q-1', 'quiz', true),
      { ...result('q-1', 'quiz', false), id: 'retry-q-1', updatedAt: 2 },
      result('q-1', 'quiz', true),
    ];
    expect(lectureCompletionPercent(lecture, 0, results)).toBe(5);
  });

  it('supports legacy correct scores and counts the same id once per kind', () => {
    const results = [
      { ...result('shared', 'quiz'), score: 1, details: { kind: 'quiz', answer: [] } },
      { ...result('shared', 'quiz', true), id: 'another-correct-attempt' },
      result('shared', 'vf', true),
    ];
    expect(lectureCompletionPercent(lecture, 0, results)).toBe(10);
  });

  it('does not reach 100% until every required item is complete', () => {
    const results = [
      ...Array.from({ length: lecture.quiz }, (_, index) => result(`q-${index}`, 'quiz', true)),
      ...Array.from({ length: lecture.vf - 1 }, (_, index) => result(`vf-${index}`, 'vf', true)),
    ];
    expect(lectureCompletionPercent(lecture, lecture.cards, results)).toBe(95);
  });

  it('never rounds an incomplete lecture up to 100%', () => {
    expect(lectureCompletionPercent({ id: lecture.id, cards: 200, quiz: 0, vf: 0 }, 199, [])).toBe(99);
  });

  it('handles lectures with zero true/false questions', () => {
    const noVfLecture = { ...lecture, cards: 2, quiz: 1, vf: 0 };
    expect(lectureCompletionPercent(noVfLecture, 2, [result('q-1', 'quiz', true)])).toBe(100);
  });

  it('ignores other lectures and caps counts to the current course content', () => {
    const results = [result('q-1', 'quiz', true, 'another-course')];
    expect(lectureCompletionPercent(lecture, 100, results)).toBe(50);
  });

  it('returns zero for a course with no activities', () => {
    expect(lectureCompletionPercent({ id: lecture.id, cards: 0, quiz: 0, vf: 0 }, 0, [])).toBe(0);
  });
});
