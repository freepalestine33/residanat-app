import { describe, expect, it } from 'vitest';
import { assignLectureToModule, normalizeModuleName, validateModuleName } from './userModules';
import { createGeneratedLectureId } from './lectureIds';

describe('user module names', () => {
  it('trims names and rejects blank names', () => {
    expect(validateModuleName('  Pédiatrie  ', [])).toBe('Pédiatrie');
    expect(() => validateModuleName('   ', [])).toThrow('Saisissez un nom');
  });

  it('prevents case- and accent-insensitive duplicates', () => {
    expect(normalizeModuleName(' Gynécologie ')).toBe('gynecologie');
    expect(() => validateModuleName('PEDIATRIE', ['Pédiatrie'])).toThrow('Un module porte déjà ce nom');
  });

  it('limits module names to 60 characters', () => {
    expect(() => validateModuleName('a'.repeat(61), [])).toThrow('60 caractères maximum');
  });
});

describe('lecture module assignment', () => {
  const lecture = {
    schema: 1 as const,
    id: 'course_1',
    name: 'Pédiatrie',
    otrNumber: 12,
    keys: [],
    contrasts: [],
    cards: [],
    quiz: [],
    vf: [],
  };

  it('preserves an OTR number while moving a lecture into a custom module', () => {
    const assigned = assignLectureToModule(lecture, 'module-1');
    expect(assigned).toMatchObject({ id: lecture.id, otrNumber: 12, moduleId: 'module-1' });
  });

  it('restores the OTR association after a move round trip', () => {
    const moved = assignLectureToModule(lecture, 'module-1');
    const restored = assignLectureToModule(moved, null);
    expect(restored).toMatchObject({
      id: 'course_1',
      otrNumber: 12,
      moduleId: null,
    });
  });
});

describe('generated lecture ids', () => {
  it('creates valid distinct ids for user-created courses and retains explicit OTR ids', () => {
    const first = createGeneratedLectureId();
    const second = createGeneratedLectureId();
    expect(first).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    expect(first).not.toBe(second);
    expect(createGeneratedLectureId('otr_11_course')).toBe('otr_11_course');
  });
});
