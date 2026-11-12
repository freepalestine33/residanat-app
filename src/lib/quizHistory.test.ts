import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QuizResult } from '../db/db';

const mocks = vi.hoisted(() => ({
  db: {
    quizResults: {
      where: vi.fn(),
      bulkDelete: vi.fn(),
    },
    syncQueue: {},
    transaction: vi.fn(),
  },
  queueSyncChange: vi.fn(),
}));

vi.mock('../db/db', () => ({ db: mocks.db }));
vi.mock('./syncEvents', () => ({ queueSyncChange: mocks.queueSyncChange }));

import { restartLectureAnswers } from './quizHistory';

describe('restartLectureAnswers', () => {
  const rows: QuizResult[] = [
    { id: 'quiz-a', lectureId: 'lecture-a', questionId: 'q1', score: 1, details: { kind: 'quiz', correct: true }, updatedAt: 1 },
    { id: 'vf-a', lectureId: 'lecture-a', questionId: 'v1', score: 0, details: { kind: 'vf', correct: false }, updatedAt: 2 },
    { id: 'other-lecture', lectureId: 'lecture-b', questionId: 'q1', score: 1, details: { kind: 'quiz' }, updatedAt: 3 },
    { id: 'other-kind', lectureId: 'lecture-a', questionId: 'x1', score: 1, details: { kind: 'other' }, updatedAt: 4 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.quizResults.where.mockReturnValue({
      equals: vi.fn((lectureId: string) => ({
        toArray: vi.fn().mockResolvedValue(rows.filter((row) => row.lectureId === lectureId)),
      })),
    });
    mocks.db.quizResults.bulkDelete.mockResolvedValue(undefined);
    mocks.db.transaction.mockImplementation(async (...args: unknown[]) => {
      const callback = args[args.length - 1] as () => Promise<number>;
      return callback();
    });
  });

  it('deletes only this lecture’s quiz and vrai/faux answers and queues tombstones', async () => {
    await expect(restartLectureAnswers('lecture-a')).resolves.toBe(2);

    expect(mocks.db.quizResults.bulkDelete).toHaveBeenCalledWith(['quiz-a', 'vf-a']);
    expect(mocks.queueSyncChange).toHaveBeenNthCalledWith(1, 'quizResults', 'quiz-a', 'delete');
    expect(mocks.queueSyncChange).toHaveBeenNthCalledWith(2, 'quizResults', 'vf-a', 'delete');
    expect(mocks.queueSyncChange).toHaveBeenCalledTimes(2);
  });

  it('returns zero and does not delete when there are no answer attempts', async () => {
    mocks.db.quizResults.where.mockReturnValue({
      equals: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue(rows.filter((row) => row.id === 'other-kind')),
      }),
    });

    await expect(restartLectureAnswers('lecture-a')).resolves.toBe(0);

    expect(mocks.db.quizResults.bulkDelete).not.toHaveBeenCalled();
    expect(mocks.queueSyncChange).not.toHaveBeenCalled();
  });
});
