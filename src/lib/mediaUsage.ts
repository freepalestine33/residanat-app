import { db } from '../db/db';

/** Soft per-user cap for note media (photos + voice memos) stored in Supabase. */
export const MEDIA_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB

/** Mirrors the server cap in api/_lib/noteImages.ts — larger audio can never sync. */
export const AUDIO_SYNC_LIMIT_BYTES = 2 * 1024 * 1024; // 2 MB

/** Total bytes of note media known to this device (synced notes carry their sizes). */
export async function getMediaUsage(): Promise<number> {
  const notes = await db.notes.toArray();
  let total = 0;
  for (const note of notes) total += (note.imageBytes ?? 0) + (note.audioBytes ?? 0);
  return total;
}

/** Returns an error message if adding `additionalBytes` would exceed the cap, else null. */
export async function checkMediaQuota(additionalBytes: number): Promise<string | null> {
  const used = await getMediaUsage();
  if (used + additionalBytes > MEDIA_LIMIT_BYTES) {
    return 'Stockage des médias plein (50 Mo). Supprimez d’anciennes photos ou mémos vocaux pour en ajouter.';
  }
  return null;
}

export function formatMediaBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${bytes} o`;
}
