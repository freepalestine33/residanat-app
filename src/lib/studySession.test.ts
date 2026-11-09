import { describe, expect, it } from 'vitest';
import { parseStudySession } from './studySession';

describe('parseStudySession', () => {
  it('accepts a saved session and an explicitly cleared session', () => {
    const session = {
      version: 1,
      cardIds: ['course.card-1', 'course.card-2'],
      index: 1,
      revealed: true,
      lectureId: 'course',
      updatedAt: 123,
    };
    expect(parseStudySession(session)).toEqual(session);
    expect(parseStudySession(null)).toBeNull();
  });

  it('rejects invalid positions and oversized queues', () => {
    expect(() => parseStudySession({
      version: 1,
      cardIds: ['course.card-1'],
      index: 1,
      revealed: false,
      lectureId: 'course',
      updatedAt: 123,
    })).toThrow('Saved study session is invalid.');

    expect(() => parseStudySession({
      version: 1,
      cardIds: Array.from({ length: 21 }, (_, index) => `course.card-${index}`),
      index: 0,
      revealed: false,
      lectureId: 'course',
      updatedAt: 123,
    })).toThrow('Saved study session is invalid.');
  });
});
