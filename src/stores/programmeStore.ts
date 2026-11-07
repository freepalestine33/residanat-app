import { create } from 'zustand';
import type { ProgrammeData, ProgrammeCategoryCode, ProgrammeGroup, ProgrammeItem } from '../types/programme';
import { loadProgramme, getProgrammeItems, searchProgramme, getProgrammeCategories, getProgrammeGroups } from '../data/programme';

interface ProgrammeState {
  programme: ProgrammeData | null;
  currentCategory: ProgrammeCategoryCode;
  currentItems: ProgrammeItem[];
  favorites: Set<string>;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  loadProgramme: () => Promise<void>;
  setCategory: (category: ProgrammeCategoryCode) => void;
  setSearchQuery: (query: string) => void;
  toggleFavorite: (itemId: string) => void;
  getCategories: () => Array<{ code: string; name: string }>;
  getGroups: (category: ProgrammeCategoryCode) => ProgrammeGroup[];
}

export const useProgrammeStore = create<ProgrammeState>((set, get) => ({
  programme: null,
  currentCategory: 'M',
  currentItems: [],
  favorites: new Set(),
  searchQuery: '',
  loading: false,
  error: null,

  loadProgramme: async () => {
    set({ loading: true, error: null });
    try {
      const programme = await loadProgramme();
      const currentItems = getProgrammeItems(programme, 'M');

      // Load favorites from localStorage
      let favorites = new Set<string>();
      try {
        const storedFavorites = localStorage.getItem('sa_prog_favorites');
        if (storedFavorites) {
          const parsed: unknown = JSON.parse(storedFavorites);
          if (Array.isArray(parsed)) favorites = new Set(parsed.filter((value): value is string => typeof value === 'string'));
        }
      } catch {
        console.warn('Programme favorites could not be read; keeping the stored value unchanged.');
      }

      set({
        programme,
        currentItems,
        favorites,
        loading: false,
      });
    } catch (err) {
      set({ error: String(err), loading: false });
    }
  },

  setCategory: (category) => {
    const { programme, searchQuery } = get();
    if (!programme) return;

    let items: ProgrammeItem[];
    if (searchQuery) {
      items = searchProgramme(programme, searchQuery);
    } else {
      items = getProgrammeItems(programme, category);
    }

    set({ currentCategory: category, currentItems: items });
  },

  setSearchQuery: (query) => {
    const { programme, currentCategory } = get();
    if (!programme) return;

    let items: ProgrammeItem[];
    if (query) {
      items = searchProgramme(programme, query);
    } else {
      items = getProgrammeItems(programme, currentCategory);
    }

    set({ searchQuery: query, currentItems: items });
  },

  toggleFavorite: (itemId) => {
    set(state => {
      const newFavorites = new Set(state.favorites);
      if (newFavorites.has(itemId)) {
        newFavorites.delete(itemId);
      } else {
        newFavorites.add(itemId);
      }
      try {
        localStorage.setItem('sa_prog_favorites', JSON.stringify([...newFavorites]));
      } catch {
        console.warn('Programme favorite could not be persisted in local storage.');
      }
      return { favorites: newFavorites };
    });
  },

  getCategories: () => {
    const { programme } = get();
    if (!programme) return [];
    return getProgrammeCategories(programme);
  },

  getGroups: (category) => {
    const { programme } = get();
    if (!programme) return [];
    return getProgrammeGroups(programme, category);
  },
}));
