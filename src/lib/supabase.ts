import { GoTrueClient } from '@supabase/auth-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && anonKey
  ? new GoTrueClient({
      url: `${url.replace(/\/+$/, '')}/auth/v1`,
      headers: { apikey: anonKey },
      storageKey: `sb-${new URL(url).hostname.split('.')[0]}-auth-token`,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    })
  : null;
