import { describe, expect, it } from 'vitest';
import type { QuizResult } from '../db/db';
import {
  DAY_MS,
  REVIEW_INTERVAL_DAYS,
  REVIEW_RATINGS,
  REVIEW_RATING_LABELS,
  buildReviewSchedule,
  collectScheduledQuestions,
  compareByEarliestDue,
  formatDueDate,
  latestQuestionResults,
  organizeByLecture,
  parseReviewSchedule,
  questionResultKey,
  splitDueUpcoming,
} from './errorSchedule';

const NOW = new Date(2026, 0, 15, 10, 30, 0).getTime();

function makeResult(partial: Partial<QuizResult> = {}): QuizResult {
  return {
    id: 'result-1',
    lectureId: 'lecture-a',
    questionId: 'question-1',
    score: 0,
    details: { kind: 'quiz', correct: false, answer: ['0'] },
    updatedAt: NOW,
    ...partial,
  };
}

describe('shared review intervals', () => {
  it('exposes the predictable 1/3/7/14 day mapping and French labels', () => {
    expect(REVIEW_INTERVAL_DAYS).toEqual({ again: 1, hard: 3, good: 7, easy: 14 });
    expect(REVIEW_RATINGS).toEqual(['again', 'hard', 'good', 'easy']);
    expect(REVIEW_RATING_LABELS).toEqual({ again: 'Encore', hard: 'Difficile', good: 'Bien', easy: 'Facile' });
  });

  it('builds a schedule at now + interval days for every rating', () => {
    for (const rating of REVIEW_RATINGS) {
      expect(buildReviewSchedule(rating, NOW)).toEqual({
        nextReviewAt: NOW + REVIEW_INTERVAL_DAYS[rating] * DAY_MS,
        reviewRating: rating,
        reviewIntervalDays: REVIEW_INTERVAL_DAYS[rating],
      });
    }
  });
});

describe('parseReviewSchedule (untrusted details boundary)', () => {
  it('accepts a complete, consistent schedule embedded in generic details', () => {
    const schedule = buildReviewSchedule('good', NOW);
    expect(parseReviewSchedule({ kind: 'quiz', correct: true, answer: ['true'], ...schedule })).toEqual(schedule);
  });

  it('rejects legacy details and missing fields', () => {
    expect(parseReviewSchedule({ kind: 'quiz', correct: false, answer: ['0'] })).toBeNull();
    expect(parseReviewSchedule({ nextReviewAt: NOW + DAY_MS })).toBeNull();
    expect(parseReviewSchedule({ nextReviewAt: NOW + DAY_MS, reviewRating: 'again' })).toBeNull();
  });

  it('rejects malformed or inconsistent values without throwing', () => {
    const base = buildReviewSchedule('again', NOW);
    for (const nextReviewAt of ['tomorrow', NaN, Infinity, -1, null, undefined]) {
      expect(parseReviewSchedule({ ...base, nextReviewAt })).toBeNull();
    }
    for (const reviewRating of ['Again', 'manual', '', 1, null]) {
      expect(parseReviewSchedule({ ...base, reviewRating })).toBeNull();
    }
    for (const reviewIntervalDays of [2, 5, '1', null, NaN]) {
      expect(parseReviewSchedule({ ...base, reviewIntervalDays })).toBeNull();
    }
    expect(parseReviewSchedule({ ...base, reviewRating: 'good', reviewIntervalDays: 1 })).toBeNull();
    expect(parseReviewSchedule(null)).toBeNull();
    expect(parseReviewSchedule('schedule')).toBeNull();
    expect(parseReviewSchedule([base])).toBeNull();
  });
});

describe('latestQuestionResults', () => {
  it('keeps the most recent answer per (lectureId, kind, questionId)', () => {
    const older = makeResult({ id: 'old', updatedAt: NOW - 5000 });
    const newer = makeResult({ id: 'new', updatedAt: NOW });
    const latest = latestQuestionResults([newer, older]);
    expect(latest.size).toBe(1);
    expect(latest.get(questionResultKey('lecture-a', 'quiz', 'question-1'))?.id).toBe('new');
  });

  it('ignores results without a quiz/vf kind', () => {
    expect(latestQuestionResults([makeResult({ details: { correct: false } })]).size).toBe(0);
    expect(latestQuestionResults([makeResult({ details: { kind: 'card' } })]).size).toBe(0);
  });
});

describe('collectScheduledQuestions', () => {
  it('does not treat a newer correct answer as a pending review when unscheduled', () => {
    const olderWrong = makeResult({ id: 'old', score: 0, updatedAt: NOW - 5000 });
    const newerCorrect = makeResult({
      id: 'new',
      score: 1,
      details: { kind: 'quiz', correct: true, answer: ['1'] },
      updatedAt: NOW,
    });
    expect(collectScheduledQuestions([newerCorrect, olderWrong])).toEqual([]);
  });

  it('keeps a newer wrong answer due now even after an older correct answer', () => {
    const olderCorrect = makeResult({ id: 'old', score: 1, details: { kind: 'quiz', correct: true }, updatedAt: NOW - 5000 });
    const newerWrong = makeResult({ id: 'new', score: 0, updatedAt: NOW });
    const scheduled = collectScheduledQuestions([newerWrong, olderCorrect]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ resultId: 'new', dueAt: 0, correct: false, schedule: null });
  });

  it('tracks quiz and VF independently for the same question id', () => {
    const quiz = makeResult({ id: 'quiz-result', details: { kind: 'quiz', correct: false }, updatedAt: NOW });
    const vf = makeResult({ id: 'vf-result', details: { kind: 'vf', correct: false }, updatedAt: NOW + 1 });
    const scheduled = collectScheduledQuestions([quiz, vf]);
    expect(scheduled.map((item) => item.kind).sort()).toEqual(['quiz', 'vf']);
    expect(scheduled.map((item) => item.resultId).sort()).toEqual(['quiz-result', 'vf-result']);
  });

  it('shows legacy wrong answers as due now and ignores legacy correct answers', () => {
    const wrong = makeResult({ id: 'wrong', score: 0 });
    const right = makeResult({ id: 'right', questionId: 'question-2', score: 1, details: { kind: 'quiz', correct: true } });
    const scheduled = collectScheduledQuestions([wrong, right]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ resultId: 'wrong', dueAt: 0, schedule: null, correct: false });
  });

  it('uses the chosen date for scheduled answers, whether correct or wrong', () => {
    const schedule = buildReviewSchedule('easy', NOW);
    const wrongScheduled = makeResult({ id: 'w', score: 0, details: { kind: 'quiz', correct: false, ...schedule } });
    const rightScheduled = makeResult({ id: 'r', questionId: 'question-2', score: 1, details: { kind: 'vf', correct: true, ...schedule } });
    const scheduled = collectScheduledQuestions([wrongScheduled, rightScheduled]);
    expect(scheduled).toHaveLength(2);
    expect(scheduled.every((item) => item.dueAt === schedule.nextReviewAt)).toBe(true);
    expect(scheduled.find((item) => item.resultId === 'r')).toMatchObject({ correct: true, kind: 'vf', schedule });
  });

  it('falls back safely when schedule fields are malformed', () => {
    const malformedWrong = makeResult({
      id: 'w',
      score: 0,
      details: { kind: 'quiz', correct: false, nextReviewAt: 'bientôt', reviewRating: 'again', reviewIntervalDays: 1 },
    });
    const malformedRight = makeResult({
      id: 'r',
      questionId: 'question-2',
      score: 1,
      details: { kind: 'quiz', correct: true, nextReviewAt: NOW + DAY_MS, reviewRating: 'again', reviewIntervalDays: 99 },
    });
    const scheduled = collectScheduledQuestions([malformedWrong, malformedRight]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({ resultId: 'w', dueAt: 0, schedule: null });
  });

  it('sorts due timestamps ascending regardless of input order', () => {
    const legacy = makeResult({ id: 'legacy', questionId: 'q-legacy', updatedAt: NOW - 10 });
    const soon = makeResult({
      id: 'soon',
      questionId: 'q-soon',
      details: { kind: 'quiz', correct: false, ...buildReviewSchedule('again', NOW - 2 * DAY_MS) },
      updatedAt: NOW - 9,
    });
    const later = makeResult({
      id: 'later',
      questionId: 'q-later',
      score: 1,
      details: { kind: 'quiz', correct: true, ...buildReviewSchedule('good', NOW) },
      updatedAt: NOW - 8,
    });
    const scheduled = collectScheduledQuestions([later, soon, legacy]);
    expect(scheduled.map((item) => item.resultId)).toEqual(['legacy', 'soon', 'later']);
    const dueTimes = scheduled.map((item) => item.dueAt);
    expect(dueTimes).toEqual([...dueTimes].sort((a, b) => a - b));
  });
});

describe('splitDueUpcoming', () => {
  it('treats the exact due timestamp as due now and keeps ascending order', () => {
    const items = [
      { id: 'tomorrow', dueAt: NOW + DAY_MS },
      { id: 'now', dueAt: NOW },
      { id: 'legacy', dueAt: 0 },
      { id: 'later', dueAt: NOW + 3 * DAY_MS },
    ];
    const { due, upcoming } = splitDueUpcoming(items, NOW);
    expect(due.map((item) => item.id)).toEqual(['legacy', 'now']);
    expect(upcoming.map((item) => item.id)).toEqual(['tomorrow', 'later']);
  });

  it('handles empty input', () => {
    expect(splitDueUpcoming([], NOW)).toEqual({ due: [], upcoming: [] });
  });
});

describe('organizeByLecture', () => {
  it('groups by lecture with due/upcoming buckets and earliest due time', () => {
    const items = [
      { lectureId: 'b', dueAt: NOW + DAY_MS },
      { lectureId: 'a', dueAt: 0 },
      { lectureId: 'a', dueAt: NOW + 2 * DAY_MS },
      { lectureId: 'b', dueAt: NOW - DAY_MS },
    ];
    const groups = organizeByLecture(items, NOW);
    expect(groups.map((group) => group.lectureId)).toEqual(['a', 'b']);
    expect(groups[0]).toMatchObject({ lectureId: 'a', earliestDueAt: 0 });
    expect(groups[0].due).toHaveLength(1);
    expect(groups[0].upcoming).toHaveLength(1);
    expect(groups[1].due.map((item) => item.dueAt)).toEqual([NOW - DAY_MS]);
    expect(groups[1].upcoming.map((item) => item.dueAt)).toEqual([NOW + DAY_MS]);
    expect(groups[1].earliestDueAt).toBe(NOW - DAY_MS);
  });

  it('sorts lectures chronologically by earliest due time', () => {
    const groups = organizeByLecture([
      { lectureId: 'z', dueAt: NOW + 5 * DAY_MS },
      { lectureId: 'y', dueAt: NOW + DAY_MS },
      { lectureId: 'x', dueAt: NOW },
    ], NOW);
    expect(groups.map((group) => group.lectureId)).toEqual(['x', 'y', 'z']);
  });
});

describe('compareByEarliestDue', () => {
  it('orders by earliest due time before name', () => {
    const groups = [
      { name: 'Alpha', earliestDueAt: NOW + DAY_MS },
      { name: 'Zèbre', earliestDueAt: NOW },
    ];
    expect([...groups].sort(compareByEarliestDue).map((group) => group.name)).toEqual(['Zèbre', 'Alpha']);
  });

  it('breaks ties with French name order', () => {
    const groups = [
      { name: 'Zoologie', earliestDueAt: NOW },
      { name: 'Anatomie', earliestDueAt: NOW },
      { name: 'Épidémiologie', earliestDueAt: NOW },
    ];
    expect([...groups].sort(compareByEarliestDue).map((group) => group.name)).toEqual(['Anatomie', 'Épidémiologie', 'Zoologie']);
  });

  it('places groups without any due time last', () => {
    const groups = [
      { name: 'Sans échéance', earliestDueAt: null },
      { name: 'Urgent', earliestDueAt: NOW },
    ];
    expect([...groups].sort(compareByEarliestDue).map((group) => group.name)).toEqual(['Urgent', 'Sans échéance']);
  });
});

describe('formatDueDate', () => {
  it('labels today and tomorrow in French', () => {
    expect(formatDueDate(NOW, NOW)).toBe('Aujourd’hui');
    expect(formatDueDate(new Date(2026, 0, 15, 23, 59).getTime(), NOW)).toBe('Aujourd’hui');
    expect(formatDueDate(new Date(2026, 0, 16, 0, 1).getTime(), NOW)).toBe('Demain');
  });

  it('uses a short localized date for other days, including overdue ones', () => {
    const timestamp = new Date(2026, 0, 22, 9, 0).getTime();
    const expected = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short' }).format(new Date(timestamp));
    expect(formatDueDate(timestamp, NOW)).toBe(expected);
    const overdue = new Date(2026, 0, 12, 9, 0).getTime();
    expect(formatDueDate(overdue, NOW)).toBe(new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short' }).format(new Date(overdue)));
  });

  it('includes the year for dates in another year', () => {
    const timestamp = new Date(2027, 2, 3, 9, 0).getTime();
    const expected = new Intl.DateTimeFormat('fr', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(timestamp));
    expect(formatDueDate(timestamp, NOW)).toBe(expected);
  });
});