import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface AuthenticatedClient {
  supabase: SupabaseClient;
  user: User;
}

export async function authenticateRequest(req: VercelRequest): Promise<AuthenticatedClient> {
  const authorization = req.headers.authorization;
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new ApiError(401, 'Sign in is required.');

  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new ApiError(503, 'Supabase server configuration is incomplete.');

  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new ApiError(401, 'Your sign-in has expired. Please sign in again.');
  return { supabase, user: data.user };
}
