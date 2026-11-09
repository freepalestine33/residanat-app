import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useSyncStore } from '../stores/syncStore';

export function useSync() {
  const user = useAuthStore((state) => state.user);
  const initializeAuth = useAuthStore((state) => state.initializeAuth);
  const syncNow = useSyncStore((state) => state.syncNow);
  const setOffline = useSyncStore((state) => state.setOffline);

  useEffect(() => initializeAuth(), [initializeAuth]);

  useEffect(() => {
    if (!user) return;
    const sync = () => { void syncNow(user); };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onLocalChange = () => {
      clearTimeout(timer);
      timer = setTimeout(sync, 5000);
    };
    const onFocus = () => { if (document.visibilityState === 'visible') sync(); };
    const onVisibilityChange = () => sync();
    const onOnline = () => { setOffline(false); sync(); };
    const onOffline = () => setOffline(true);
    window.addEventListener('residanat:local-change', onLocalChange);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') sync();
    }, 30_000);
    sync();
    return () => {
      clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener('residanat:local-change', onLocalChange);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [setOffline, syncNow, user]);
}
