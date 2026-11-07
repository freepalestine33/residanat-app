import { Link } from 'react-router-dom';
import { useAuthStore, useSyncStore } from '../../stores';

const indicators = {
  local: { color: 'var(--muted)', label: 'Local only' },
  offline: { color: 'var(--muted)', label: 'Offline · changes saved locally' },
  syncing: { color: 'var(--orange)', label: 'Syncing…' },
  synced: { color: 'var(--green)', label: 'Synced' },
  error: { color: 'var(--red)', label: 'Sync error' },
  conflict: { color: 'var(--orange)', label: 'Choose initial sync' },
} as const;

export function SyncStatus() {
  const status = useSyncStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const configured = useAuthStore((state) => state.configured);
  const indicator = indicators[status];
  return (
    <Link className="sync-status" to="/settings" title={indicator.label} aria-label={`${indicator.label}. Open sync settings.`}>
      <span className="sync-status-dot" style={{ background: indicator.color }} aria-hidden="true">☁</span>
      <span>{user ? indicator.label : configured ? 'Sign in to sync' : 'Local only'}</span>
    </Link>
  );
}
