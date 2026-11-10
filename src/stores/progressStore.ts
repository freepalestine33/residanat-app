import { create } from 'zustand';

/** Number of entries currently stored in the local error journal (see errorStore). */
function readErrorJournalCount(): number {
  try {
    const raw = localStorage.getItem('sa_errors_v3');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/** Consecutive days with at least one reviewed card, ending today or yesterday. */
function reviewStreak(rows: Array<{ updated?: number }>, now = Date.now()): number {
  const days = new Set<string>();
  for (const row of rows) {
    const updated = Number(row.updated);
    if (Number.isFinite(updated) && updated > 0) days.add(new Date(updated).toDateString());
  }
  if (!days.size) return 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(cursor.toDateString())) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(cursor.toDateString())) return 0;
  }
  let streak = 0;
  while (days.has(cursor.toDateString())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

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
      const [{ db }, { dueCount }, { loadLectureIndex }] = await Promise.all([
        import('../db/db'),
        import('../lib/srs'),
        import('../data/lectures'),
      ]);
      const [due, rows, lectures] = await Promise.all([
        dueCount(),
        db.cards.toArray(),
        loadLectureIndex(),
      ]);
      const stateValues = rows.map((row) => row.state && typeof row.state === 'object' ? row.state as { reps?: unknown; stability?: unknown } : {});
      const reviewed = stateValues.filter((value) => Number(value.reps ?? 0) > 0).length;
      const mature = stateValues.filter((value) => Number(value.stability ?? 0) >= 21).length;
      const errors = readErrorJournalCount();
      const streak = reviewStreak(rows);
      const totalCards = lectures.reduce((sum, lecture) => sum + lecture.cards, 0);
      const progress = totalCards ? Math.round((reviewed / totalCards) * 100) : 0;

      // Keep the legacy keys in step so the settings sync payload carries fresh values.
      localStorage.setItem('sa_error_count', String(errors));
      localStorage.setItem('sa_streak', String(streak));

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
