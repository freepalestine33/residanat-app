import { createEmptyCard, fsrs, generatorParameters, Rating, type Card as FsrsCard } from 'ts-fsrs';
import { db } from '../db/db';
import { queueSyncChange } from './syncEvents';

const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));
const reviewIntervalsDays: Record<Exclude<Rating, Rating.Manual>, number> = {
  [Rating.Again]: 1,
  [Rating.Hard]: 3,
  [Rating.Good]: 7,
  [Rating.Easy]: 14,
};
export { Rating };

export async function getState(gid: string): Promise<FsrsCard> {
  const row = await db.cards.get(gid);
  return row ? (row.state as FsrsCard) : createEmptyCard(new Date());
}
export async function review(gid: string, rating: Exclude<Rating, Rating.Manual>) {
  const now = new Date();
  const next = scheduler.next(await getState(gid), now, rating).card;
  // Keep FSRS memory state while applying the learner's chosen, predictable review interval.
  next.due = new Date(now.getTime() + reviewIntervalsDays[rating] * 24 * 60 * 60 * 1000);
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
