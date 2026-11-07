import { create } from 'zustand';
import type { Card } from '../types/card';
import { loadAllLectures } from '../data/lectures';
import { dueCount } from '../lib/srs';

interface CardState {
  allCards: Array<{ card: Card; lectureId: string; lectureName: string }>;
  dueCount: number;
  loading: boolean;
  error: string | null;
  loadCards: () => Promise<void>;
  refreshDueCount: () => Promise<void>;
}

export const useCardStore = create<CardState>((set) => ({
  allCards: [],
  dueCount: 0,
  loading: false,
  error: null,

  loadCards: async () => {
    set({ loading: true, error: null });
    try {
      const lectures = await loadAllLectures();
      const allCards = lectures.flatMap(lecture =>
        lecture.cards.map(card => ({
          card,
          lectureId: lecture.id,
          lectureName: lecture.name,
        }))
      );
      const due = await dueCount();
      set({ allCards, dueCount: due, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  refreshDueCount: async () => {
    try {
      const due = await dueCount();
      set({ dueCount: due });
    } catch (err) {
      console.error('Failed to refresh due count:', err);
    }
  },
}));
