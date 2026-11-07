import { LoginPage } from '../../pages/LoginPage';
import { useAuthStore } from '../../stores';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const configured = useAuthStore((state) => state.configured);
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);

  if (!initialized) {
    return <main className="auth-shell"><section className="panel" role="status">Checking your sign-in…</section></main>;
  }
  if (!configured || !user) return <LoginPage configured={configured} />;
  return children;
}
