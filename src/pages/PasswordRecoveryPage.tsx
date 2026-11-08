import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel';

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
    <main className="auth-shell auth-login-shell">
      <AuthBrandPanel />
      <section className="panel auth-panel">
        <p className="eyebrow">Espace personnel</p>
        <h1>Choisir un nouveau mot de passe</h1>
        <p className="muted">Choisissez un mot de passe d’au moins 8 caractères. Vous pourrez ensuite vous connecter avec votre adresse e-mail.</p>
        <form className="note-form" onSubmit={(event) => void submit(event)}>
          <label>
            <span className="field-label">Nouveau mot de passe</span>
            <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label>
            <span className="field-label">Confirmer le nouveau mot de passe</span>
            <input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          </label>
          <button type="submit" className="btn btn-lg" disabled={loading}>{loading ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}</button>
          {error && <p className="notice error" role="alert">{error}</p>}
        </form>
      </section>
    </main>
  );
}
