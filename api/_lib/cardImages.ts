import { ApiError } from './supabase';
import type { AuthenticatedClient } from './supabase';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const CARD_IMAGE_BUCKET = 'card-images';

/** Deterministic per-card path so any device can fetch the illustration without syncing a record. */
export function cardImagePath(userId: string, lectureId: string, cardId: string): string {
  return `${userId}/${lectureId}/${cardId}/illustration`;
}

export async function uploadCardImage(
  client: AuthenticatedClient,
  lectureId: string,
  cardId: string,
  mime: unknown,
  base64: unknown,
): Promise<string> {
  const mimeType = typeof mime === 'string' && allowedTypes.has(mime) ? mime : 'image/png';
  if (typeof base64 !== 'string' || !base64) throw new ApiError(502, 'The image model returned no image.');
  const encoded = base64.replace(/^data:[^;]+;base64,/, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new ApiError(502, 'The image model returned invalid image data.');
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length) throw new ApiError(502, 'The image model returned an empty image.');
  if (buffer.length > MAX_IMAGE_BYTES) throw new ApiError(413, 'The generated image is too large.');

  const path = cardImagePath(client.user.id, lectureId, cardId);
  const { error } = await client.supabase.storage
    .from(CARD_IMAGE_BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: true });
  if (error) throw new ApiError(500, 'Could not store the card illustration.');
  return path;
}

/** Returns a short-lived signed URL, or null when this card has no illustration yet. */
export async function createCardImageUrl(
  client: AuthenticatedClient,
  lectureId: string,
  cardId: string,
): Promise<string | null> {
  const path = cardImagePath(client.user.id, lectureId, cardId);
  const { data, error } = await client.supabase.storage
    .from(CARD_IMAGE_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
