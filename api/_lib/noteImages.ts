import { ApiError } from './supabase';
import type { AuthenticatedClient } from './supabase';

const MAX_IMAGE_BYTES = 500 * 1024;
// Voice memos are capped at 2 min; even ~128 kbps stays under this. Kept below
// the serverless request-body limit after base64 inflation (~4.5 MB).
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const audioExtensions: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};

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

export async function uploadNoteAudio(
  client: AuthenticatedClient,
  noteId: string,
  updatedAt: string,
  mime: unknown,
  base64: unknown,
): Promise<string> {
  const baseMime = typeof mime === 'string' ? mime.split(';')[0].trim().toLowerCase() : '';
  const ext = audioExtensions[baseMime];
  if (!ext) throw new ApiError(400, 'Use a WebM, MP4, OGG, MPEG, or WAV audio recording.');
  if (typeof base64 !== 'string' || base64.length > Math.ceil(MAX_AUDIO_BYTES * 4 / 3) + 128) {
    throw new ApiError(413, 'Audio must be 2 MB or smaller.');
  }
  const encoded = base64.replace(/^data:[^;]+;base64,/, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new ApiError(400, 'Audio data is invalid.');
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > MAX_AUDIO_BYTES) throw new ApiError(413, 'Audio must be 2 MB or smaller.');
  const version = Date.parse(updatedAt);
  const path = `${client.user.id}/${noteId}/audio-${version}.${ext}`;
  const { error } = await client.supabase.storage.from('note-images').upload(path, buffer, { contentType: baseMime, upsert: true });
  if (error) throw new ApiError(500, `Could not upload the note audio: ${error.message}`);
  return path;
}

export async function createImageUrl(client: AuthenticatedClient, path: string | null) {
  if (!path) return null;
  const { data, error } = await client.supabase.storage.from('note-images').createSignedUrl(path, 60 * 60);
  if (error) throw new ApiError(500, 'Could not create an image link.');
  return data.signedUrl;
}
