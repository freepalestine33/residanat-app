import type { QuizResult } from '../db/db';

/**
 * Pure scheduling model for question revisions (quiz / vrai-faux).
 *
 * Persisted `QuizResult.details` is an untrusted local/sync boundary: schedule
 * fields are optional and validated here instead of trusted. Legacy results
 * (no schedule fields) keep the historical behavior — a wrong answer is due
 * immediately, a correct answer without an explicit schedule creates no review.
 */

export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type QuestionKind = 'quiz' | 'vf';

/** Canonical order of the four interval choices shown to the learner. */
export const REVIEW_RATINGS: readonly ReviewRating[] = ['again', 'hard', 'good', 'easy'];

/** Single source of truth for card and question review intervals (days). */
export const REVIEW_INTERVAL_DAYS: Record<ReviewRating, number> = {
  again: 1,
  hard: 3,
  good: 7,
  easy: 14,
};

export const REVIEW_RATING_LABELS: Record<ReviewRating, string> = {
  again: 'Encore',
  hard: 'Difficile',
  good: 'Bien',
  easy: 'Facile',
};

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewSchedule {
  /** Epoch milliseconds of the next scheduled review. */
  nextReviewAt: number;
  reviewRating: ReviewRating;
  reviewIntervalDays: number;
}

export function isReviewRating(value: unknown): value is ReviewRating {
  return value === 'again' || value === 'hard' || value === 'good' || value === 'easy';
}

/**
 * Reads the optional schedule fields from persisted details. Returns null when
 * any field is missing, malformed, or inconsistent (the interval must match the
 * rating's canonical interval), so callers safely fall back to legacy behavior.
 */
export function parseReviewSchedule(details: unknown): ReviewSchedule | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const record = details as Record<string, unknown>;
  const nextReviewAt = record.nextReviewAt;
  const reviewRating = record.reviewRating;
  const reviewIntervalDays = record.reviewIntervalDays;
  if (typeof nextReviewAt !== 'number' || !Number.isFinite(nextReviewAt) || nextReviewAt < 0) return null;
  if (!isReviewRating(reviewRating)) return null;
  if (typeof reviewIntervalDays !== 'number' || REVIEW_INTERVAL_DAYS[reviewRating] !== reviewIntervalDays) return null;
  return { nextReviewAt, reviewRating, reviewIntervalDays };
}

/** Builds the schedule persisted when the learner picks an interval. */
export function buildReviewSchedule(rating: ReviewRating, now: number): ReviewSchedule {
  const reviewIntervalDays = REVIEW_INTERVAL_DAYS[rating];
  return { nextReviewAt: now + reviewIntervalDays * DAY_MS, reviewRating: rating, reviewIntervalDays };
}

export function questionResultKey(lectureId: string, kind: QuestionKind, questionId: string): string {
  return `${lectureId}:${kind}:${questionId}`;
}

export interface ScheduledQuestion {
  resultId: string;
  lectureId: string;
  questionId: string;
  kind: QuestionKind;
  /** Correctness of the latest answer. */
  correct: boolean;
  /** Epoch milliseconds; 0 for legacy wrong answers (due now). */
  dueAt: number;
  /** Validated schedule, or null for legacy/unscheduled wrong answers. */
  schedule: ReviewSchedule | null;
  updatedAt: number;
}

/**
 * Latest answer per (lectureId, kind, questionId). Results are ordered by
 * `updatedAt` ascending and the last one wins, matching the historical
 * `orderBy('updatedAt')` derivation. Unknown kinds are ignored.
 */
export function latestQuestionResults(results: readonly QuizResult[]): Map<string, QuizResult> {
  const latest = new Map<string, QuizResult>();
  const ordered = [...results].sort((a, b) => a.updatedAt - b.updatedAt);
  for (const result of ordered) {
    const kind = result.details?.kind;
    if (kind !== 'quiz' && kind !== 'vf') continue;
    latest.set(questionResultKey(result.lectureId, kind, result.questionId), result);
  }
  return latest;
}

/**
 * Derives the pending question reviews: every latest wrong answer (scheduled at
 * its chosen date, or due now when legacy/unscheduled) plus any latest correct
 * answer carrying an explicit valid schedule. Sorted by due timestamp ascending.
 */
export function collectScheduledQuestions(results: readonly QuizResult[]): ScheduledQuestion[] {
  const scheduled: ScheduledQuestion[] = [];
  for (const result of latestQuestionResults(results).values()) {
    const kind = result.details?.kind;
    if (kind !== 'quiz' && kind !== 'vf') continue;
    const correct = typeof result.score === 'number' && result.score > 0;
    const schedule = parseReviewSchedule(result.details);
    if (correct && !schedule) continue;
    scheduled.push({
      resultId: result.id,
      lectureId: result.lectureId,
      questionId: result.questionId,
      kind,
      correct,
      dueAt: schedule ? schedule.nextReviewAt : 0,
      schedule,
      updatedAt: result.updatedAt,
    });
  }
  return scheduled.sort((a, b) =>
    a.dueAt - b.dueAt
    || a.lectureId.localeCompare(b.lectureId, 'fr')
    || a.kind.localeCompare(b.kind, 'fr')
    || a.questionId.localeCompare(b.questionId, 'fr'));
}

const byDueAt = <T extends { dueAt: number }>(a: T, b: T) => a.dueAt - b.dueAt;

export interface DueSplit<T> {
  due: T[];
  upcoming: T[];
}

/** Partitions items into due now (dueAt <= now) and upcoming, each sorted ascending. */
export function splitDueUpcoming<T extends { dueAt: number }>(items: readonly T[], now: number): DueSplit<T> {
  const due: T[] = [];
  const upcoming: T[] = [];
  for (const item of items) (item.dueAt <= now ? due : upcoming).push(item);
  due.sort(byDueAt);
  upcoming.sort(byDueAt);
  return { due, upcoming };
}

export interface LectureSchedule<T> {
  lectureId: string;
  due: T[];
  upcoming: T[];
  /** Earliest due timestamp across due + upcoming, null when empty. */
  earliestDueAt: number | null;
}

/**
 * Organizes items by lecture with due/upcoming buckets, sorted by earliest due
 * time ascending (lectures without pending time last), then lecture id.
 */
export function organizeByLecture<T extends { dueAt: number; lectureId: string }>(
  items: readonly T[],
  now: number,
): LectureSchedule<T>[] {
  const byLecture = new Map<string, LectureSchedule<T>>();
  for (const item of items) {
    let group = byLecture.get(item.lectureId);
    if (!group) {
      group = { lectureId: item.lectureId, due: [], upcoming: [], earliestDueAt: null };
      byLecture.set(item.lectureId, group);
    }
    (item.dueAt <= now ? group.due : group.upcoming).push(item);
    group.earliestDueAt = group.earliestDueAt === null ? item.dueAt : Math.min(group.earliestDueAt, item.dueAt);
  }
  const groups = [...byLecture.values()];
  for (const group of groups) {
    group.due.sort(byDueAt);
    group.upcoming.sort(byDueAt);
  }
  return groups.sort((a, b) => {
    const aTime = a.earliestDueAt ?? Number.POSITIVE_INFINITY;
    const bTime = b.earliestDueAt ?? Number.POSITIVE_INFINITY;
    if (aTime !== bTime) return aTime < bTime ? -1 : 1;
    return a.lectureId.localeCompare(b.lectureId, 'fr');
  });
}

/**
 * Orders named revision groups (cards + questions) by earliest relevant due
 * time ascending, then French name. Groups without any due time sort last.
 */
export function compareByEarliestDue(
  a: { earliestDueAt: number | null; name: string },
  b: { earliestDueAt: number | null; name: string },
): number {
  const aTime = a.earliestDueAt ?? Number.POSITIVE_INFINITY;
  const bTime = b.earliestDueAt ?? Number.POSITIVE_INFINITY;
  if (aTime !== bTime) return aTime < bTime ? -1 : 1;
  return a.name.localeCompare(b.name, 'fr');
}

const shortDateFormatter = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short' });
const shortDateWithYearFormatter = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short', year: 'numeric' });

function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}

/** French agenda label: Aujourd’hui, Demain, otherwise a short localized date. */
export function formatDueDate(timestamp: number, now: number): string {
  if (isSameLocalDay(timestamp, now)) return 'Aujourd’hui';
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameLocalDay(timestamp, tomorrow.getTime())) return 'Demain';
  const date = new Date(timestamp);
  const formatter = date.getFullYear() === new Date(now).getFullYear() ? shortDateFormatter : shortDateWithYearFormatter;
  return formatter.format(date);
}