import { db } from '../db/db';
import type { Card } from '../types/card';
import { createId } from './createId';
import { queueSyncChange } from './syncEvents';

/** Fired whenever the user adds or edits a card, so open views can refresh. */
export const CARDS_UPDATED_EVENT = 'residanat:cards-updated';

/** Personal cards created by the learner use ids prefixed with `u-`. */
export function isCustomCardId(cardId: string): boolean {
  return cardId.startsWith('u-');
}

export function notifyCustomCardsUpdated() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CARDS_UPDATED_EVENT));
}

function syncRecord(gid: string, lectureId: string, card: Card, updatedAt: number) {
  return {
    id: gid,
    lecture_id: lectureId,
    card,
    updated_at: new Date(updatedAt).toISOString(),
    deleted_at: null,
  };
}

export async function queueCustomCardSnapshot() {
  const rows = await db.customCards.toArray();
  for (const row of rows) {
    await queueSyncChange('customCards', row.gid, 'upsert', syncRecord(row.gid, row.lectureId, row.card, row.updatedAt));
  }
}

async function saveCustomCard(lectureId: string, card: Card) {
  const gid = `${lectureId}.${card.id}`;
  const updatedAt = Date.now();
  await db.transaction('rw', db.customCards, db.syncQueue, async () => {
    await db.customCards.put({ gid, lectureId, card, updatedAt });
    await queueSyncChange('customCards', gid, 'upsert', syncRecord(gid, lectureId, card, updatedAt));
  });
  notifyCustomCardsUpdated();
}

export async function listCustomCards(lectureId: string): Promise<Card[]> {
  const rows = await db.customCards.where('lectureId').equals(lectureId).toArray();
  return rows.sort((a, b) => a.updatedAt - b.updatedAt).map((row) => row.card);
}

/** Apply saved edits to source cards and append learner-created cards. */
export function mergeLectureCards(sourceCards: Card[], savedCards: Card[]): Card[] {
  const savedById = new Map(savedCards.map((card) => [card.id, card]));
  const sourceIds = new Set(sourceCards.map((card) => card.id));
  const merged = sourceCards.map((card) => savedById.get(card.id) ?? card);
  for (const card of savedCards) {
    if (isCustomCardId(card.id) && !sourceIds.has(card.id)) merged.push(card);
  }
  return merged;
}

export async function listAllCustomCards(): Promise<Array<{ lectureId: string; card: Card }>> {
  const rows = await db.customCards.toArray();
  return rows.filter((row) => isCustomCardId(row.card.id)).map((row) => ({ lectureId: row.lectureId, card: row.card }));
}

export async function addCustomCard(lectureId: string, input: { q: string; a: string }): Promise<Card> {
  const q = input.q.trim();
  const a = input.a.trim();
  if (!q || !a) throw new Error('La question et la réponse sont obligatoires.');
  const card: Card = { id: `u-${createId().slice(0, 8)}`, type: 'basic', q, a };
  await saveCustomCard(lectureId, card);
  return card;
}

export async function updateLectureCard(lectureId: string, sourceCard: Card, input: { q: string; a: string }): Promise<Card> {
  const q = input.q.trim();
  const a = input.a.trim();
  if (!q || !a) throw new Error('La question et la réponse sont obligatoires.');
  const gid = `${lectureId}.${sourceCard.id}`;
  const existing = await db.customCards.get(gid);
  if (isCustomCardId(sourceCard.id) && !existing) throw new Error('Cette carte personnelle est introuvable.');
  const card: Card = { ...(existing?.card ?? sourceCard), q, a };
  await saveCustomCard(lectureId, card);
  return card;
}

export async function deleteCustomCard(gid: string): Promise<void> {
  await db.transaction('rw', db.customCards, db.syncQueue, async () => {
    await db.customCards.delete(gid);
    await queueSyncChange('customCards', gid, 'delete');
  });
  notifyCustomCardsUpdated();
}
