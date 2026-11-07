import { useState } from 'react';
import { useAuthStore } from '../stores';

export function LoginPage({ configured }: { configured: boolean }) {
  const {
    loading,
    error,
    success,
    sendMagicLink,
    signInWithPassword,
    signUpWithPassword,
    sendPasswordReset,
    clearError,
  } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'reset'>('signIn');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    if (mode === 'reset') {
      await sendPasswordReset(email);
      return;
    }
    if (mode === 'signUp' && password !== confirmPassword) {
      useAuthStore.setState({ error: 'The passwords do not match.' });
      return;
    }
    if (mode === 'signUp') await signUpWithPassword(email, password);
    else await signInWithPassword(email, password);
  };

  const requestMagicLink = async () => {
    clearError();
    await sendMagicLink(email);
  };

  return (
    <main className="auth-shell">
      <section className="panel auth-panel">
        <p className="eyebrow">Résidanat · Smart Learning</p>
        <h1>Sign in to your study space</h1>
        <p className="muted">Sign in with your email and password. Your study progress will sync across your devices and remain available offline after sign-in.</p>
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
            {mode !== 'reset' && (
              <label>
                <span className="field-label">Password</span>
                <input type="password" autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} minLength={mode === 'signUp' ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
            )}
            {mode === 'signUp' && (
              <label>
                <span className="field-label">Confirm password</span>
                <input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </label>
            )}
            <button type="submit" className="btn btn-lg" disabled={loading}>
              {loading ? 'Please wait…' : mode === 'signUp' ? 'Create account' : mode === 'reset' ? 'Email password reset link' : 'Sign in'}
            </button>
            {mode === 'signIn' && <button className="btn ghost" type="button" disabled={loading} onClick={() => { setMode('reset'); clearError(); }}>Forgot password?</button>}
            <div className="btn-row">
              {mode !== 'signIn' && <button className="btn ghost" type="button" disabled={loading} onClick={() => { setMode('signIn'); clearError(); }}>Back to sign in</button>}
              {mode !== 'reset' && <button className="btn ghost" type="button" disabled={loading} onClick={() => { setMode(mode === 'signUp' ? 'signIn' : 'signUp'); clearError(); }}>{mode === 'signUp' ? 'I already have an account' : 'Create an account'}</button>}
            </div>
            {mode === 'signIn' && <button className="btn ghost" type="button" disabled={loading || !email} onClick={() => void requestMagicLink()}>Email me a sign-in link instead</button>}
            {success && <p className="notice success" role="status">{success}</p>}
            {error && <p className="notice error" role="alert">{error}</p>}
          </form>
        )}
        <p className="muted auth-footer">Your password is securely handled by Supabase and is never stored by this app.</p>
      </section>
    </main>
  );
}
