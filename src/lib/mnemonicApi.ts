// src/lib/mnemonicApi.ts  — talks to the Cloudflare Worker.
const API = (import.meta.env.VITE_MNEMONIC_API as string | undefined)?.replace(/\/$/, '');

export type MnemonicErrorCode = 'not_configured' | 'daily_limit' | 'user_limit' | 'network' | 'failed';
export class MnemonicError extends Error {
  constructor(public code: MnemonicErrorCode, message: string) { super(message); }
}

export interface Memo {
  title: string;
  subtitle?: string;
  steps: { icon: string; tag?: string; heading: string; caption: string }[];
  legend?: { term: string; meaning: string }[];
}

async function post(path: string, body: unknown, signal?: AbortSignal): Promise<any> {
  if (!API) throw new MnemonicError('not_configured', 'VITE_MNEMONIC_API is not set.');
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new MnemonicError('network', 'Pas de connexion au service.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  if (data.error === 'daily_limit' || data.error === 'user_limit') throw new MnemonicError(data.error, data.message);
  throw new MnemonicError('failed', data.message || 'La génération a échoué.');
}

/** The memo (title, steps, legend) that the app draws as an infographic. */
export async function requestMemo(p: { question: string; answer: string; variant: number }, signal?: AbortSignal): Promise<Memo> {
  const data = await post('/memo', p, signal);
  if (!data?.memo?.steps) throw new MnemonicError('failed', 'Réponse invalide du service.');
  return data.memo as Memo;
}

export async function requestMnemonic(
  p: { question: string; answer: string; variant: number },
  signal?: AbortSignal,
): Promise<{ url: string; cached: boolean }> {
  const data = await post('/generate', p, signal);
  if (typeof data.url !== 'string') throw new MnemonicError('failed', 'Réponse invalide du service.');
  return { url: data.url, cached: !!data.cached };
}
