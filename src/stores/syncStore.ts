import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { synchronize, type SyncOutcome, type SyncStatus } from '../lib/syncEngine';
import { useToast } from '../hooks/useToast';

interface SyncState {
  status: SyncStatus;
  error: string | null;
  initialChoiceRequired: boolean;
  lastSyncedAt: number | null;
  syncNow: (user: User) => Promise<void>;
  chooseInitialSync: (user: User, choice: 'upload' | 'download') => Promise<void>;
  setOffline: (offline: boolean) => void;
}

function applyOutcome(outcome: SyncOutcome) {
  return {
    status: outcome.status,
    error: outcome.error ?? null,
    initialChoiceRequired: outcome.initialChoiceRequired ?? false,
    ...(outcome.status === 'synced' ? { lastSyncedAt: Date.now() } : {}),
  };
}

export const useSyncStore = create<SyncState>((set) => ({
  status: navigator.onLine ? 'local' : 'offline',
  error: null,
  initialChoiceRequired: false,
  lastSyncedAt: null,

  syncNow: async (user) => {
    const firstSuccessfulSync = useSyncStore.getState().lastSyncedAt === null;
    set({ status: navigator.onLine ? 'syncing' : 'offline', error: null });
    const outcome = await synchronize(user);
    set(applyOutcome(outcome));
    if (outcome.status === 'synced' && firstSuccessfulSync) useToast.getState().showToast('Data synced across devices.', 'success');
  },

  chooseInitialSync: async (user, choice) => {
    set({ status: 'syncing', error: null });
    const outcome = await synchronize(user, choice);
    set(applyOutcome(outcome));
    if (outcome.status === 'synced') useToast.getState().showToast('Data synced across devices.', 'success');
  },

  setOffline: (offline) => set((state) => ({
    status: offline ? 'offline' : state.status === 'offline' ? 'local' : state.status,
  })),
}));
