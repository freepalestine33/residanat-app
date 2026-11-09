import { create } from 'zustand';
import type { Note } from '../types/note';
import { db } from '../db/db';
import { queueSyncChange } from '../lib/syncEvents';
import { createId } from '../lib/createId';

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
      const image = resolveNoteImage(note, previous);
      const { clearImage: _clearImage, ...noteValues } = note;
      const value = {
        ...noteValues,
        syncId: note.syncId ?? previous?.syncId ?? createId(),
        ...image,
        updated: Date.now(),
      };
      await db.notes.put(value);
      await queueSyncChange('notes', value.syncId, 'upsert', {
        id: value.syncId,
        data: { rel: value.rel, text: value.text, link: value.link },
        image: value.image,
        image_path: value.imagePath ?? null,
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
