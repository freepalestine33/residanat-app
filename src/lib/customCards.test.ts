import { describe, expect, it } from 'vitest';
import type { Card } from '../types/card';
import { isCustomCardId, mergeLectureCards } from './customCards';

const sourceCards: Card[] = [
  { id: 'card-1', type: 'basic', q: 'Original question', a: 'Original answer', src: 'Course source' },
  { id: 'card-2', type: 'contrast', q: 'Keep question', a: 'Keep answer' },
];

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
});
