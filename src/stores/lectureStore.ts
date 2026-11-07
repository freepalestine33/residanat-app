import { create } from 'zustand';
import type { Lecture, LectureMeta } from '../types/lecture';
import { loadLectureIndex, loadLectureById } from '../data/lectures';

interface LectureState {
  lectures: LectureMeta[];
  currentLecture: Lecture | null;
  loading: boolean;
  error: string | null;
  loadLectures: () => Promise<void>;
  loadLecture: (id: string) => Promise<void>;
  setCurrentLecture: (lecture: Lecture | null) => void;
}

export const useLectureStore = create<LectureState>((set) => ({
  lectures: [],
  currentLecture: null,
  loading: false,
  error: null,

  loadLectures: async () => {
    set({ loading: true, error: null });
    try {
      const lectures = await loadLectureIndex();
      set({ lectures, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  loadLecture: async (id) => {
    set({ loading: true, error: null });
    try {
      const lecture = await loadLectureById(id);
      set({ currentLecture: lecture, loading: false });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  setCurrentLecture: (lecture) => {
    set({ currentLecture: lecture });
  },
}));
