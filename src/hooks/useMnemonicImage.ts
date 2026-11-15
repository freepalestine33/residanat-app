// src/hooks/useMnemonicImage.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { MnemonicError, requestMnemonic, type MnemonicErrorCode } from '../lib/mnemonicApi';

export type MnemonicState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string; variant: number }
  | { status: 'error'; code: MnemonicErrorCode; message: string };

export const MAX_VARIANT = 3;

// Small string hash: if the card text is edited, the old cached image is not reused.
function hash(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const cardHash = (q: string, a: string) => hash(q + '\u0000' + a);
const storageKey = (q: string, a: string) => `mnemo:${cardHash(q, a)}`;
const read = (k: string): { url: string; variant: number } | null => {
  try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v?.url ? v : null; } catch { return null; }
};
const write = (k: string, v: { url: string; variant: number }) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full/blocked: fine */ } };

export function useMnemonicImage(question: string, answer: string) {
  const key = storageKey(question, answer);
  const [state, setState] = useState<MnemonicState>(() => {
    const hit = read(key);
    return hit ? { status: 'ready', ...hit } : { status: 'idle' };
  });
  const abort = useRef<AbortController | null>(null);
  const busy = useRef(false);

  // card changed (e.g. next card in a session): reload its saved image or reset
  useEffect(() => {
    abort.current?.abort(); busy.current = false;
    const hit = read(key);
    setState(hit ? { status: 'ready', ...hit } : { status: 'idle' });
  }, [key]);
  useEffect(() => () => abort.current?.abort(), []);

  const generate = useCallback(async (variant = 0) => {
    if (busy.current) return;               // ignore double clicks
    busy.current = true;
    abort.current = new AbortController();
    setState({ status: 'loading' });
    try {
      const { url } = await requestMnemonic({ question, answer, variant }, abort.current.signal);
      write(key, { url, variant });
      setState({ status: 'ready', url, variant });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const err = e as MnemonicError;
      setState({ status: 'error', code: err.code ?? 'failed', message: err.message || 'La génération a échoué.' });
    } finally {
      busy.current = false;
    }
  }, [question, answer, key]);

  return { state, generate };
}
