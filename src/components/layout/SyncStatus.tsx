import { Link } from 'react-router-dom';
import { Cloud, CloudOff, RefreshCw, CircleAlert } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { useSyncStore } from '../../stores/syncStore';

const indicators = {
  local: { className: 'is-local', label: 'Données locales', Icon: CloudOff },
  offline: { className: 'is-offline', label: 'Hors ligne · changements enregistrés', Icon: CloudOff },
  syncing: { className: 'is-syncing', label: 'Synchronisation…', Icon: RefreshCw },
  synced: { className: 'is-synced', label: 'Synchronisé', Icon: Cloud },
  error: { className: 'is-error', label: 'Erreur de synchronisation', Icon: CircleAlert },
  conflict: { className: 'is-conflict', label: 'Choisir la synchronisation initiale', Icon: CircleAlert },
} as const;

export function SyncStatus() {
  const status = useSyncStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const configured = useAuthStore((state) => state.configured);
  const indicator = indicators[status];
  const { Icon } = indicator;
  return (
    <Link className={`sync-status ${indicator.className}`} to="/settings" title={indicator.label} aria-label={`${indicator.label}. Open sync settings.`}>
      <Icon className="sync-status-icon" size={15} strokeWidth={1.8} aria-hidden="true" />
      <span>{user ? indicator.label : configured ? 'Connectez-vous pour synchroniser' : 'Données locales'}</span>
    </Link>
  );
}
