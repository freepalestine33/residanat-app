import { useSyncExternalStore } from 'react';

let activeKey: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Claims the single app-wide video iframe slot for `key`. */
export function activateNoteVideo(key: string) {
  if (activeKey === key) return;
  activeKey = key;
  emit();
}

/** Releases the iframe slot if `key` currently owns it (e.g. on unmount). */
export function releaseNoteVideo(key: string) {
  if (activeKey !== key) return;
  activeKey = null;
  emit();
}

/** Returns the key of the video currently allowed to render an iframe. */
export function useActiveNoteVideoKey(): string | null {
  return useSyncExternalStore(subscribe, () => activeKey);
}
