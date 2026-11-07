import { create } from 'zustand';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  configured: boolean;
  initialized: boolean;
  loading: boolean;
  error: string | null;
  initializeAuth: () => () => void;
  sendMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  configured: supabase !== null,
  initialized: false,
  loading: false,
  error: null,

  initializeAuth: () => {
    if (!supabase) {
      set({ initialized: true });
      return () => undefined;
    }
    let active = true;
    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) set({ error: error.message, initialized: true });
        else set({ session: data.session, user: data.session?.user ?? null, initialized: true });
      })
      .catch((error: unknown) => {
        if (active) set({ error: error instanceof Error ? error.message : String(error), initialized: true });
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, user: session?.user ?? null, initialized: true, error: null });
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  },

  sendMagicLink: async (email) => {
    if (!supabase) {
      set({ error: 'Add Supabase URL and anon key to enable cloud sync.' });
      return;
    }
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      set({ loading: false, error: error?.message ?? null });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  signOut: async () => {
    if (!supabase) return;
    set({ loading: true, error: null });
    try {
      const { error } = await supabase.auth.signOut();
      set({ loading: false, error: error?.message ?? null });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  clearError: () => set({ error: null }),
}));
