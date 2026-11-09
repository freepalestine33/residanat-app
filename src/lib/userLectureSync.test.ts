import { describe, expect, it } from 'vitest';
import type { UserLecture } from '../db/db';
import { preserveLocalLecturePdf } from './userLectureSync';

function lecture(overrides: Partial<UserLecture> = {}): UserLecture {
  return {
    id: 'generated-course',
    name: 'Generated course',
    content: {
      schema: 1,
      id: 'generated-course',
      name: 'Generated course',
      keys: [],
      contrasts: [],
      cards: [],
      quiz: [],
      vf: [],
    },
    updatedAt: 1,
    ...overrides,
  };
}

describe('preserveLocalLecturePdf', () => {
  it('keeps the locally saved PDF when applying a cloud lecture update', () => {
    const pdfBlob = new Blob(['pdf content'], { type: 'application/pdf' });
    const remote = lecture({ name: 'Updated course', updatedAt: 2 });

    const merged = preserveLocalLecturePdf(
      remote,
      lecture({ pdfBlob, pdfName: 'source.pdf' }),
    );

    expect(merged.name).toBe('Updated course');
    expect(merged.updatedAt).toBe(2);
    expect(merged.pdfBlob).toBe(pdfBlob);
    expect(merged.pdfName).toBe('source.pdf');
  });

  it('does not add PDF fields when the local lecture has no PDF', () => {
    const remote = lecture();

    expect(preserveLocalLecturePdf(remote)).toBe(remote);
  });
});
