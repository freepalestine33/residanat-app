import { db } from '../db/db';
import type { Card } from '../types/card';
import { createId } from './createId';

/** Fired whenever the user adds, edits or removes a personal card, so open views can refresh. */
export const CARDS_UPDATED_EVENT = 'residanat:cards-updated';

/** Personal cards created by the learner use ids prefixed with `u-`. */
export function isCustomCardId(cardId: string): boolean {
  return cardId.startsWith('u-');
}

export async function listCustomCards(lectureId: string): Promise<Card[]> {
  const rows = await db.customCards.where('lectureId').equals(lectureId).toArray();
  return rows.sort((a, b) => a.updatedAt - b.updatedAt).map((row) => row.card);
}

export async function listAllCustomCards(): Promise<Array<{ lectureId: string; card: Card }>> {
  const rows = await db.customCards.toArray();
  return rows.map((row) => ({ lectureId: row.lectureId, card: row.card }));
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

export async function updateCustomCard(gid: string, input: { q: string; a: string }): Promise<Card> {
  const q = input.q.trim();
  const a = input.a.trim();
  if (!q || !a) throw new Error('La question et la réponse sont obligatoires.');
  const existing = await db.customCards.get(gid);
  if (!existing) throw new Error('Cette carte personnelle est introuvable.');
  const card: Card = { ...existing.card, q, a };
  await db.customCards.put({ ...existing, card, updatedAt: Date.now() });
  window.dispatchEvent(new CustomEvent(CARDS_UPDATED_EVENT));
  return card;
}

export async function deleteCustomCard(gid: string): Promise<void> {
  await db.customCards.delete(gid);
  window.dispatchEvent(new CustomEvent(CARDS_UPDATED_EVENT));
}
