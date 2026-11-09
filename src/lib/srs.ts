import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard } from 'ts-fsrs';
import { db } from '../db/db';
import { queueSyncChange } from './syncEvents';
import { DAY_MS, REVIEW_INTERVAL_DAYS, type ReviewRating } from './errorSchedule';

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));
const ratingKeys: Record<Exclude<Rating, Rating.Manual>, ReviewRating> = {
  [Rating.Again]: 'again',
  [Rating.Hard]: 'hard',
  [Rating.Good]: 'good',
  [Rating.Easy]: 'easy',
};
export { Rating };
export { REVIEW_INTERVAL_DAYS, REVIEW_RATING_LABELS, REVIEW_RATINGS, type ReviewRating } from './errorSchedule';

export async function getState(gid: string): Promise<FsrsCard> {
  const row = await db.cards.get(gid);
  return row ? (row.state as FsrsCard) : createEmptyCard(new Date());
}
export async function review(gid: string, rating: Exclude<Rating, Rating.Manual>) {
  const now = new Date();
  const next = scheduler.next(await getState(gid), now, rating).card;
  // Keep FSRS memory state while applying the learner's chosen, predictable review interval.
  next.due = new Date(now.getTime() + REVIEW_INTERVAL_DAYS[ratingKeys[rating]] * DAY_MS);
  const due = new Date(next.due).getTime();
  const updated = now.getTime();
  await db.cards.put({ gid, due, state: next, updated });
  await queueSyncChange('cards', gid, 'upsert', {
    id: gid,
    state: next,
    reps: next.reps,
    due_date: new Date(due).toISOString(),
    updated_at: now.toISOString(),
    deleted_at: null,
  });
  return next;
}
export const dueCount = () => db.cards.where('due').belowOrEqual(Date.now()).count();

/** Number of already-reviewed cards per lecture id (card gids are `${lectureId}.${cardId}`). */
export async function reviewedCountByLecture(): Promise<Map<string, number>> {
  const rows = await db.cards.toArray();
  const counts = new Map<string, number>();
  for (const row of rows) {
    const state = row.state && typeof row.state === 'object' ? row.state as { reps?: unknown } : {};
    if (Number(state.reps ?? 0) <= 0) continue;
    const lectureId = row.gid.split('.')[0];
    counts.set(lectureId, (counts.get(lectureId) ?? 0) + 1);
  }
  return counts;
}
