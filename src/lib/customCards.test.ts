import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../types/card';

const mocks = vi.hoisted(() => ({
  db: {
    customCards: {
      where: vi.fn(),
      toArray: vi.fn(),
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
    },
    syncQueue: {},
    transaction: vi.fn(),
  },
  queueSyncChange: vi.fn(),
  createId: vi.fn(),
}));

vi.mock('../db/db', () => ({ db: mocks.db }));
vi.mock('./syncEvents', () => ({ queueSyncChange: mocks.queueSyncChange }));
vi.mock('./createId', () => ({ createId: mocks.createId }));

import {
  addCustomCard,
  deleteCustomCard,
  isCustomCardId,
  mergeLectureCards,
  queueCustomCardSnapshot,
  updateLectureCard,
} from './customCards';

const sourceCards: Card[] = [
  { id: 'card-1', type: 'basic', q: 'Original question', a: 'Original answer', src: 'Course source' },
  { id: 'card-2', type: 'contrast', q: 'Keep question', a: 'Keep answer' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.transaction.mockImplementation(async (...args: unknown[]) => {
    const callback = args[args.length - 1] as () => Promise<unknown>;
    return callback();
  });
  mocks.db.customCards.put.mockResolvedValue(undefined);
  mocks.db.customCards.get.mockResolvedValue(undefined);
  mocks.db.customCards.delete.mockResolvedValue(undefined);
  mocks.queueSyncChange.mockResolvedValue(undefined);
});

describe('lecture card edits', () => {
  it('replaces an edited source card without adding a duplicate', () => {
    const edited: Card = { ...sourceCards[0], q: 'Edited question', a: 'Edited answer' };
    const merged = mergeLectureCards(sourceCards, [edited]);

    expect(merged).toEqual([edited, sourceCards[1]]);
    expect(merged.filter((card) => card.id === 'card-1')).toHaveLength(1);
    expect(merged[0].src).toBe('Course source');
  });

  it('appends learner-created cards and keeps the source order', () => {
    const created: Card = { id: 'u-newcard', type: 'basic', q: 'My question', a: 'My answer' };

    expect(mergeLectureCards(sourceCards, [created])).toEqual([...sourceCards, created]);
  });

  it('does not append stale edits for source cards that are no longer in the course', () => {
    const staleEdit: Card = { id: 'removed-card', type: 'basic', q: 'Old', a: 'Old answer' };

    expect(mergeLectureCards(sourceCards, [staleEdit])).toEqual(sourceCards);
  });

  it('only treats learner-created card IDs as additional cards', () => {
    expect(isCustomCardId('u-created')).toBe(true);
    expect(isCustomCardId('source-card')).toBe(false);
  });

  it('queues newly added cards for account sync', async () => {
    mocks.createId.mockReturnValue('fixed-id');
    const card = await addCustomCard('lecture-a', { q: ' Question ', a: ' Answer ' });
    const gid = `lecture-a.${card.id}`;

    expect(mocks.db.customCards.put).toHaveBeenCalledWith(expect.objectContaining({ gid, lectureId: 'lecture-a', card }));
    expect(mocks.queueSyncChange).toHaveBeenCalledWith(
      'customCards',
      gid,
      'upsert',
      expect.objectContaining({ id: gid, lecture_id: 'lecture-a', card }),
    );
  });

  it('queues edits and deletions for account sync', async () => {
    await updateLectureCard('lecture-a', sourceCards[0], { q: 'Edited question', a: 'Edited answer' });
    await deleteCustomCard('lecture-a.card-1');

    expect(mocks.queueSyncChange).toHaveBeenNthCalledWith(
      1,
      'customCards',
      'lecture-a.card-1',
      'upsert',
      expect.objectContaining({ id: 'lecture-a.card-1', lecture_id: 'lecture-a' }),
    );
    expect(mocks.queueSyncChange).toHaveBeenNthCalledWith(2, 'customCards', 'lecture-a.card-1', 'delete');
  });

  it('queues existing local custom cards for one-time sync backfill', async () => {
    const card: Card = { id: 'u-existing', type: 'basic', q: 'Saved', a: 'Answer' };
    mocks.db.customCards.toArray.mockResolvedValue([
      { gid: 'lecture-a.u-existing', lectureId: 'lecture-a', card, updatedAt: 123 },
    ]);

    await queueCustomCardSnapshot();

    expect(mocks.queueSyncChange).toHaveBeenCalledWith(
      'customCards',
      'lecture-a.u-existing',
      'upsert',
      expect.objectContaining({ lecture_id: 'lecture-a', card, updated_at: new Date(123).toISOString() }),
    );
  });
});
