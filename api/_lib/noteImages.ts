import { ApiError } from './supabase';
import type { AuthenticatedClient } from './supabase';

const MAX_IMAGE_BYTES = 500 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function uploadNoteImage(
  client: AuthenticatedClient,
  noteId: string,
  updatedAt: string,
  mime: unknown,
  base64: unknown,
): Promise<string> {
  if (typeof mime !== 'string' || !allowedTypes.has(mime)) throw new ApiError(400, 'Use a JPEG, PNG, or WebP image.');
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 128) {
    throw new ApiError(413, 'Images must be 500 KB or smaller after compression.');
  }
  const encoded = base64.replace(/^data:[^;]+;base64,/, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new ApiError(400, 'Image data is invalid.');
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new ApiError(413, 'Images must be 500 KB or smaller after compression.');
  const ext = mime === 'image/jpeg' ? 'jpg' : mime.slice(6);
  const version = Date.parse(updatedAt);
  const path = `${client.user.id}/${noteId}/${version}.${ext}`;
  const { error } = await client.supabase.storage.from('note-images').upload(path, buffer, { contentType: mime, upsert: true });
  if (error) throw new ApiError(500, 'Could not upload the note image.');
  return path;
}

export async function createImageUrl(client: AuthenticatedClient, path: string | null) {
  if (!path) return null;
  const { data, error } = await client.supabase.storage.from('note-images').createSignedUrl(path, 60 * 60);
  if (error) throw new ApiError(500, 'Could not create an image link.');
  return data.signedUrl;
}
