import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { AuthBrandPanel } from '../components/auth/AuthBrandPanel';

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
    <main className="auth-shell auth-login-shell">
      <AuthBrandPanel />
      <section className="panel auth-panel">
        <p className="eyebrow">Espace personnel</p>
        <h1>{mode === 'reset' ? 'Réinitialiser le mot de passe' : mode === 'signUp' ? 'Créer votre compte' : 'Reprendre vos révisions'}</h1>
        <p className="muted auth-intro">Connectez-vous pour retrouver votre progression et synchroniser vos révisions entre vos appareils. Vos cours restent accessibles hors ligne après connexion.</p>
        {!configured ? (
          <div className="notice error" role="alert">
            La connexion n’est pas encore configurée. Renseignez <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans l’environnement de déploiement, ainsi que les variables Supabase côté serveur.
          </div>
        ) : (
          <form className="note-form" onSubmit={(event) => void submit(event)}>
            <label>
              <span className="field-label">Adresse e-mail</span>
              <input type="email" autoComplete="email" autoFocus required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {mode !== 'reset' && (
              <label>
                <span className="field-label">Mot de passe</span>
                <input type="password" autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'} minLength={mode === 'signUp' ? 8 : undefined} required value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
            )}
            {mode === 'signUp' && (
              <label>
                <span className="field-label">Confirmer le mot de passe</span>
                <input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
              </label>
            )}
            <button type="submit" className="btn btn-lg" disabled={loading}>
              {loading ? 'Veuillez patienter…' : mode === 'signUp' ? 'Créer mon compte' : mode === 'reset' ? 'Recevoir le lien de réinitialisation' : 'Se connecter'}
            </button>
            <div className="auth-secondary-actions">
              {mode === 'signIn' && <button className="auth-text-action" type="button" disabled={loading} onClick={() => { setMode('reset'); clearError(); }}>Mot de passe oublié ?</button>}
              {mode !== 'signIn' && <button className="auth-text-action" type="button" disabled={loading} onClick={() => { setMode('signIn'); clearError(); }}>Retour à la connexion</button>}
              {mode !== 'reset' && <button className="auth-account-action" type="button" disabled={loading} onClick={() => { setMode(mode === 'signUp' ? 'signIn' : 'signUp'); clearError(); }}>{mode === 'signUp' ? 'Déjà inscrit ? Se connecter' : 'Nouveau ici ? Créer un compte'}</button>}
            </div>
            {mode === 'signIn' && <button className="auth-magic-action" type="button" disabled={loading || !email} onClick={() => void requestMagicLink()}>Recevoir un lien de connexion par e-mail</button>}
            {success && <p className="notice success" role="status">{success}</p>}
            {error && <p className="notice error" role="alert">{error}</p>}
          </form>
        )}
        <p className="muted auth-footer">Votre mot de passe est géré de façon sécurisée par Supabase et n’est jamais stocké par l’application.</p>
      </section>
    </main>
  );
}
