import { LoginPage } from '../../pages/LoginPage';
import { PasswordRecoveryPage } from '../../pages/PasswordRecoveryPage';
import { useAuthStore } from '../../stores';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const configured = useAuthStore((state) => state.configured);
  const initialized = useAuthStore((state) => state.initialized);
  const user = useAuthStore((state) => state.user);
  const passwordRecovery = useAuthStore((state) => state.passwordRecovery);

  if (!initialized) {
    return <main className="auth-shell"><section className="panel" role="status">Checking your sign-in…</section></main>;
  }
  if (passwordRecovery) return <PasswordRecoveryPage />;
  if (!configured || !user) return <LoginPage configured={configured} />;
  return children;
}
