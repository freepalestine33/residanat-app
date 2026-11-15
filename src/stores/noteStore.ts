import { create } from 'zustand';
import type { Note } from '../types/note';
import { db } from '../db/db';
import { queueSyncChange } from '../lib/syncEvents';
import { createId } from '../lib/createId';
import { checkMediaQuota } from '../lib/mediaUsage';

interface NoteState {
  notes: Note[];
  loading: boolean;
  error: string | null;
  loadNotes: () => Promise<void>;
  upsertNote: (note: Note) => Promise<void>;
  deleteNote: (id: number) => Promise<void>;
  getNotesForRelation: (rel: string) => Note[];
  clearError: () => void;
}

export function resolveNoteImage(
  note: Pick<Note, 'image' | 'imagePath' | 'clearImage'>,
  previous?: Pick<Note, 'image' | 'imagePath'>,
) {
  if (note.clearImage) return { image: undefined, imagePath: undefined };
  return {
    image: note.image ?? previous?.image,
    imagePath: note.imagePath ?? previous?.imagePath,
  };
}

export function resolveNoteAudio(
  note: Pick<Note, 'audio' | 'audioPath' | 'audioDuration' | 'clearAudio'>,
  previous?: Pick<Note, 'audio' | 'audioPath' | 'audioDuration'>,
) {
  if (note.clearAudio) return { audio: undefined, audioPath: undefined, audioDuration: undefined };
  return {
    audio: note.audio ?? previous?.audio,
    audioPath: note.audioPath ?? previous?.audioPath,
    audioDuration: note.audioDuration ?? previous?.audioDuration,
  };
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  loading: false,
  error: null,

  loadNotes: async () => {
    set({ loading: true, error: null });
    try {
      const notes = await db.notes.toArray();
      set({ notes, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  upsertNote: async (note) => {
    try {
      const previous = note.id === undefined ? undefined : await db.notes.get(note.id);
      // Enforce the per-user media cap when new blobs replace or add media.
      const delta =
        (note.image instanceof Blob ? note.image.size - (previous?.imageBytes ?? 0) : 0) +
        (note.audio instanceof Blob ? note.audio.size - (previous?.audioBytes ?? 0) : 0);
      if (delta > 0) {
        const quotaError = await checkMediaQuota(delta);
        if (quotaError) {
          set({ error: quotaError });
          return;
        }
      }
      const image = resolveNoteImage(note, previous);
      const audio = resolveNoteAudio(note, previous);
      const { clearImage: _clearImage, clearAudio: _clearAudio, clearMemo: _clearMemo, audioChanged: _audioChanged, ...noteValues } = note;
      const value = {
        ...noteValues,
        syncId: note.syncId ?? previous?.syncId ?? createId(),
        ...image,
        ...audio,
        videos: note.videos ?? previous?.videos,
        memo: note.clearMemo ? undefined : note.memo ?? previous?.memo,
        imageBytes: image.image instanceof Blob
          ? image.image.size
          : image.image === undefined
            ? undefined
            : note.imageBytes ?? previous?.imageBytes,
        audioBytes: audio.audio instanceof Blob
          ? audio.audio.size
          : audio.audio === undefined
            ? undefined
            : note.audioBytes ?? previous?.audioBytes,
        updated: Date.now(),
      };
      await db.notes.put(value);
      await queueSyncChange('notes', value.syncId, 'upsert', {
        id: value.syncId,
        data: {
          rel: value.rel,
          text: value.text,
          link: value.link,
          audio_path: value.audioPath ?? null,
          audio_duration: value.audioDuration ?? null,
          videos: value.videos?.length ? value.videos : null,
          memo: value.memo ?? null,
          image_bytes: value.imageBytes ?? null,
          audio_bytes: value.audioBytes ?? null,
        },
        image: value.image,
        image_path: value.imagePath ?? null,
        audio: value.audio,
        audio_changed: note.audioChanged === true ? true : undefined,
        updated_at: new Date(value.updated).toISOString(),
        deleted_at: null,
      });
      await get().loadNotes();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteNote: async (id) => {
    try {
      const note = await db.notes.get(id);
      if (note) {
        const syncId = note.syncId ?? `legacy-${id}`;
        const deletedAt = Date.now();
        await queueSyncChange('notes', syncId, 'delete', {
          id: syncId,
          updated_at: new Date(deletedAt).toISOString(),
          deleted_at: new Date(deletedAt).toISOString(),
        });
      }
      await db.notes.delete(id);
      await get().loadNotes();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  getNotesForRelation: (rel) => {
    return get().notes.filter(n => n.rel === rel);
  },
  clearError: () => set({ error: null }),
}));
