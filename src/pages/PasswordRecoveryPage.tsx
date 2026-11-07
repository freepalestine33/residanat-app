import { useState } from 'react';
import { useAuthStore } from '../stores';

export function PasswordRecoveryPage() {
  const { loading, error, updatePassword, clearError } = useAuthStore();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    if (password !== confirmation) {
      useAuthStore.setState({ error: 'The passwords do not match.' });
      return;
    }
    await updatePassword(password);
  };

  return (
    <main className="auth-shell">
      <section className="panel auth-panel">
        <p className="eyebrow">Résidanat · Smart Learning</p>
        <h1>Set a new password</h1>
        <p className="muted">Choose a password with at least 8 characters. You can use it to sign in without requesting an email link.</p>
        <form className="note-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span className="field-label">New password</span>
            <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label>
            <span className="field-label">Confirm new password</span>
            <input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
          <button type="submit" className="btn btn-lg" disabled={loading}>{loading ? 'Updating password…' : 'Set password'}</button>
          {error && <p className="notice error" role="alert">{error}</p>}
        </form>
      </section>
    </main>
  );
}
