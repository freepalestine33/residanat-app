// src/hooks/useMnemonicMemo.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { MnemonicError, requestMemo, type Memo, type MnemonicErrorCode } from '../lib/mnemonicApi';
import { cardHash, MAX_VARIANT } from './useMnemonicImage';

export type MemoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; memo: Memo; variant: number }
  | { status: 'error'; code: MnemonicErrorCode; message: string };

const read = (k: string): { memo: Memo; variant: number } | null => {
  try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v?.memo?.steps ? v : null; } catch { return null; }
};
const write = (k: string, v: { memo: Memo; variant: number }) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export function useMnemonicMemo(question: string, answer: string) {
  const key = `memo:${cardHash(question, answer)}`;
  const [state, setState] = useState<MemoState>(() => { const h = read(key); return h ? { status: 'ready', ...h } : { status: 'idle' }; });
  const abort = useRef<AbortController | null>(null);
  const busy = useRef(false);

  useEffect(() => {                         // the card changed: load its saved memo, or reset
    abort.current?.abort(); busy.current = false;
    const h = read(key);
    setState(h ? { status: 'ready', ...h } : { status: 'idle' });
  }, [key]);
  useEffect(() => () => abort.current?.abort(), []);

  const generate = useCallback(async (variant = 0) => {
    if (busy.current) return;
    busy.current = true;
    abort.current = new AbortController();
    setState({ status: 'loading' });
    try {
      const memo = await requestMemo({ question, answer, variant }, abort.current.signal);
      write(key, { memo, variant });
      setState({ status: 'ready', memo, variant });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      const err = e as MnemonicError;
      setState({ status: 'error', code: err.code ?? 'failed', message: err.message || 'La génération a échoué.' });
    } finally { busy.current = false; }
  }, [question, answer, key]);

  const nextVariant = state.status === 'ready' ? (state.variant + 1) % (MAX_VARIANT + 1) : 0;
  return { state, generate, nextVariant };
}
