import { db } from '../db/db';
import type { Card } from '../types/card';
import { createId } from './createId';

/** Fired whenever the user adds or edits a card, so open views can refresh. */
export const CARDS_UPDATED_EVENT = 'residanat:cards-updated';

/** Personal cards created by the learner use ids prefixed with `u-`. */
export function isCustomCardId(cardId: string): boolean {
  return cardId.startsWith('u-');
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
  await db.customCards.put({ gid: `${lectureId}.${card.id}`, lectureId, card, updatedAt: Date.now() });
  window.dispatchEvent(new CustomEvent(CARDS_UPDATED_EVENT));
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
  await db.customCards.put({ gid, lectureId, card, updatedAt: Date.now() });
  window.dispatchEvent(new CustomEvent(CARDS_UPDATED_EVENT));
  return card;
}

export async function deleteCustomCard(gid: string): Promise<void> {
  await db.customCards.delete(gid);
  window.dispatchEvent(new CustomEvent(CARDS_UPDATED_EVENT));
}
