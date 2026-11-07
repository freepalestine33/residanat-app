import { create } from 'zustand';
import type { ErrorEntry } from '../types/error';
import { queueSyncChange } from '../lib/syncEvents';

function persistErrors(errors: ErrorEntry[]) {
  localStorage.setItem('sa_errors_v3', JSON.stringify(errors));
  const updatedAt = new Date().toISOString();
  for (const error of errors) {
    void queueSyncChange('errors', error.id, 'upsert', {
      id: error.id,
      data: { ...error },
      resolved: false,
      updated_at: updatedAt,
      deleted_at: null,
    }).catch((reason: unknown) => console.error('Could not queue error-log sync.', reason));
  }
}

interface ErrorState {
  errors: ErrorEntry[];
  loading: boolean;
  error: string | null;
  loadErrors: () => Promise<void>;
  addError: (error: ErrorEntry) => Promise<void>;
  removeError: (id: string) => Promise<void>;
  clearOldErrors: (days: number) => Promise<void>;
}

export const useErrorStore = create<ErrorState>((set) => ({
  errors: [],
  loading: false,
  error: null,

  loadErrors: async () => {
    set({ loading: true, error: null });
    try {
      const stored = localStorage.getItem('sa_errors_v3');
      if (stored) {
        const errors = JSON.parse(stored) as ErrorEntry[];
        set({ errors, loading: false });
      } else {
        set({ errors: [], loading: false });
      }
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  addError: async (error) => {
    set(state => {
      const updated = [...state.errors, error];
      persistErrors(updated);
      return { errors: updated };
    });
  },

  removeError: async (id) => {
    set(state => {
      const updated = state.errors.filter(e => e.id !== id);
      persistErrors(updated);
      const deletedAt = new Date().toISOString();
      void queueSyncChange('errors', id, 'delete', { id, updated_at: deletedAt, deleted_at: deletedAt })
        .catch((reason: unknown) => console.error('Could not queue error deletion sync.', reason));
      return { errors: updated };
    });
  },

  clearOldErrors: async (days) => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    set(state => {
      const updated = state.errors.filter(e => new Date(e.ts).getTime() > cutoff);
      persistErrors(updated);
      const retained = new Set(updated.map((entry) => entry.id));
      const deletedAt = new Date().toISOString();
      for (const removed of state.errors.filter((entry) => !retained.has(entry.id))) {
        void queueSyncChange('errors', removed.id, 'delete', { id: removed.id, updated_at: deletedAt, deleted_at: deletedAt })
          .catch((reason: unknown) => console.error('Could not queue expired error deletion sync.', reason));
      }
      return { errors: updated };
    });
  },
}));
