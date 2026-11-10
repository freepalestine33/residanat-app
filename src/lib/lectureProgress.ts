import { queueSettingsSync } from './syncEvents';

export type LectureSection = 'overview' | 'cards' | 'quiz' | 'vf';

/** Card index reached in each lecture, keyed by lecture id. */
export type LecturePositions = Record<string, number>;
/** Last section opened in each lecture, keyed by lecture id. */
export type LectureSections = Record<string, LectureSection>;

export const LECTURE_POSITIONS_KEY = 'sa_lecture_positions_v1';
export const LECTURE_SECTIONS_KEY = 'sa_lecture_sections_v1';

const SECTIONS: LectureSection[] = ['overview', 'cards', 'quiz', 'vf'];

function isSection(value: unknown): value is LectureSection {
  return typeof value === 'string' && SECTIONS.includes(value as LectureSection);
}

function readStore(key: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch (error) {
    console.error('Could not read the saved lecture progress.', error);
    return {};
  }
}

export function sanitizeLecturePositions(value: unknown): LecturePositions {
  const positions: LecturePositions = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return positions;
  for (const [lectureId, entry] of Object.entries(value as Record<string, unknown>)) {
    const index = Number(entry);
    if (lectureId && Number.isInteger(index) && index >= 0) positions[lectureId] = index;
  }
  return positions;
}

export function sanitizeLectureSections(value: unknown): LectureSections {
  const sections: LectureSections = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return sections;
  for (const [lectureId, entry] of Object.entries(value as Record<string, unknown>)) {
    if (lectureId && isSection(entry)) sections[lectureId] = entry;
  }
  return sections;
}

export function readLecturePositions(): LecturePositions {
  return sanitizeLecturePositions(readStore(LECTURE_POSITIONS_KEY));
}

export function readLectureSections(): LectureSections {
  return sanitizeLectureSections(readStore(LECTURE_SECTIONS_KEY));
}

export function readLecturePosition(lectureId: string): number | null {
  const positions = readLecturePositions();
  return Object.hasOwn(positions, lectureId) ? positions[lectureId] : null;
}

export function readLectureSection(lectureId: string): LectureSection | null {
  const sections = readLectureSections();
  return Object.hasOwn(sections, lectureId) ? sections[lectureId] : null;
}

function readPreferences() {
  try {
    const preferences: unknown = JSON.parse(localStorage.getItem('sa_settings_v1') || '{}');
    return preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      ? preferences as Record<string, unknown>
      : {};
  } catch (error) {
    console.error('Could not read settings while saving the lecture progress.', error);
    return {};
  }
}

/**
 * Lecture reading progress (card index + last section) travels with the settings
 * payload, so the learner resumes at the same place on any device.
 */
async function queueProgressSync() {
  await queueSettingsSync({
    ...readPreferences(),
    lecturePositions: readLecturePositions(),
    lectureSections: readLectureSections(),
  });
}

export async function saveLecturePosition(lectureId: string, index: number) {
  const positions = readLecturePositions();
  if (positions[lectureId] === index) return;
  positions[lectureId] = index;
  localStorage.setItem(LECTURE_POSITIONS_KEY, JSON.stringify(positions));
  await queueProgressSync();
}

export async function saveLectureSection(lectureId: string, section: LectureSection) {
  const sections = readLectureSections();
  if (sections[lectureId] === section) return;
  sections[lectureId] = section;
  localStorage.setItem(LECTURE_SECTIONS_KEY, JSON.stringify(sections));
  await queueProgressSync();
}
