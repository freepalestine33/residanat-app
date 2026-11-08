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
  success: string | null;
  passwordRecovery: boolean;
  initializeAuth: () => () => void;
  sendMagicLink: (email: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
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
  success: null,
  passwordRecovery: false,

  initializeAuth: () => {
    if (!supabase) {
      set({ initialized: true });
      return () => undefined;
    }
    let active = true;
    void supabase.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) set({ error: error.message, initialized: true });
        else set({ session: data.session, user: data.session?.user ?? null, initialized: true });
      })
      .catch((error: unknown) => {
        if (active) set({ error: error instanceof Error ? error.message : String(error), initialized: true });
      });
    const { data: { subscription } } = supabase.onAuthStateChange((event, session) => {
      set({
        session,
        user: session?.user ?? null,
        initialized: true,
        error: null,
        passwordRecovery: event === 'PASSWORD_RECOVERY',
      });
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
    set({ loading: true, error: null, success: null });
    try {
      const { error } = await supabase.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      set({ loading: false, error: error?.message ?? null, success: error ? null : 'Check your inbox for the sign-in link.' });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error), success: null });
    }
  },

  signInWithPassword: async (email, password) => {
    if (!supabase) {
      set({ error: 'Add Supabase URL and publishable key to enable sign-in.' });
      return;
    }
    set({ loading: true, error: null, success: null });
    try {
      const { data, error } = await supabase.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      set({ session: data.session, user: data.user, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  signUpWithPassword: async (email, password) => {
    if (!supabase) {
      set({ error: 'Add Supabase URL and publishable key to enable sign-in.' });
      return;
    }
    set({ loading: true, error: null, success: null });
    try {
      const { data, error } = await supabase.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) throw error;
      if (data.session) {
        set({ session: data.session, user: data.user, loading: false });
      } else {
        set({ loading: false, success: 'Account created. Check your email once to confirm it, then sign in with your password.' });
      }
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  sendPasswordReset: async (email) => {
    if (!supabase) {
      set({ error: 'Add Supabase URL and publishable key to enable sign-in.' });
      return;
    }
    set({ loading: true, error: null, success: null });
    try {
      const { error } = await supabase.resetPasswordForEmail(email.trim(), {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      set({ loading: false, success: 'If an account exists for this email, a password reset link is on its way.' });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  updatePassword: async (password) => {
    if (!supabase) {
      set({ error: 'Supabase is not configured.' });
      return;
    }
    set({ loading: true, error: null, success: null });
    try {
      const { error } = await supabase.updateUser({ password });
      if (error) throw error;
      const { error: signOutError } = await supabase.signOut();
      if (signOutError) throw signOutError;
      set({
        loading: false,
        passwordRecovery: false,
        session: null,
        user: null,
        success: 'Password updated. Sign in with your email and password.',
      });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  signOut: async () => {
    if (!supabase) return;
    set({ loading: true, error: null, success: null });
    try {
      const { error } = await supabase.signOut();
      set({ loading: false, error: error?.message ?? null, passwordRecovery: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  clearError: () => set({ error: null, success: null }),
}));
