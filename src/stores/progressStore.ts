import { create } from 'zustand';
import { db } from '../db/db';
import { dueCount } from '../lib/srs';
import { loadAllLectures } from '../data/lectures';

interface ProgressState {
  dueCount: number;
  matureCount: number;
  errorCount: number;
  streak: number;
  progressPercent: number;
  loading: boolean;
  loadStats: () => Promise<void>;
  updateProgress: () => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  dueCount: 0,
  matureCount: 0,
  errorCount: 0,
  streak: 0,
  progressPercent: 0,
  loading: false,

  loadStats: async () => {
    set({ loading: true });
    try {
      const [due, rows, lectures] = await Promise.all([
        dueCount(),
        db.cards.toArray(),
        loadAllLectures(),
      ]);
      const stateValues = rows.map((row) => row.state && typeof row.state === 'object' ? row.state as { reps?: unknown; stability?: unknown } : {});
      const reviewed = stateValues.filter((value) => Number(value.reps ?? 0) > 0).length;
      const mature = stateValues.filter((value) => Number(value.stability ?? 0) >= 21).length;
      const legacyNumber = (key: string) => {
        const value = Number.parseInt(localStorage.getItem(key) || '0', 10);
        return Number.isFinite(value) && value >= 0 ? value : 0;
      };
      const errors = legacyNumber('sa_error_count');
      const streak = legacyNumber('sa_streak');
      const totalCards = lectures.reduce((sum, lecture) => sum + lecture.cards.length, 0);
      const progress = totalCards ? Math.round((reviewed / totalCards) * 100) : 0;

      set({
        dueCount: due,
        matureCount: mature,
        errorCount: errors,
        streak,
        progressPercent: progress,
        loading: false,
      });
    } catch (err) {
      console.error('Failed to load stats:', err);
      set({ loading: false });
    }
  },

  updateProgress: () => {
    // Triggered after review session
    set(state => ({
      dueCount: Math.max(0, state.dueCount - 1),
      progressPercent: Math.min(100, state.progressPercent + 1),
    }));
  },
}));
