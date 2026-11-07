import { useState } from 'react';
import { useAuthStore } from '../stores';

export function LoginPage({ configured }: { configured: boolean }) {
  const { loading, error, sendMagicLink, clearError } = useAuthStore();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setSent(false);
    await sendMagicLink(email);
    if (!useAuthStore.getState().error) setSent(true);
  };

  return (
    <main className="auth-shell">
      <section className="panel auth-panel">
        <p className="eyebrow">Résidanat · Smart Learning</p>
        <h1>Sign in to your study space</h1>
        <p className="muted">Use your email to receive a secure sign-in link. Your study progress will sync across your devices and remain available offline after sign-in.</p>
        {!configured ? (
          <div className="notice error" role="alert">
            Cloud sign-in is not configured. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your deployment environment, and configure the server-side Supabase variables.
          </div>
        ) : (
          <form className="note-form" onSubmit={(event) => void submit(event)}>
            <label>
              <span className="field-label">Email address</span>
              <input type="email" autoComplete="email" autoFocus required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <button type="submit" className="btn btn-lg" disabled={loading}>{loading ? 'Sending sign-in link…' : 'Email me a sign-in link'}</button>
            {sent && <p className="notice success" role="status">If this email can sign in, a secure link is on its way. Check your inbox.</p>}
            {error && <p className="notice error" role="alert">{error}</p>}
          </form>
        )}
        <p className="muted auth-footer">Your account is private. No password is stored by this app.</p>
      </section>
    </main>
  );
}
