import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { db, type UserLecture } from '../db/db';
import { blobToBase64 } from '../lib/images';
import { LectureSchema } from '../lib/schema';
import { queueSyncChange } from '../lib/syncEvents';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useSyncStore } from '../stores/syncStore';
import { createId } from '../lib/createId';

const LOCAL_KEYS = [
  'sa_settings_v1',
  'sa_settings_updated_at',
  'sa_active_study_session_v1',
  'sa_streak',
  'sa_error_count',
  'sa_errors_v3',
  'sa_prog_favorites',
  'sa_sync_last_at',
  'sa_srs_v3',
  'sa_log_v4',
  'sa_lectures_v1',
  'sa_custom_cards_v1',
  'sa_meta_v3',
  'sa_scope_v1',
  'sa_prog_done_v1',
  'sa_header_collapsed_v1',
];

export function SettingsPage() {
  const { user, configured, loading: authLoading, error: authError, sendMagicLink, signOut, clearError } = useAuthStore();
  const { status, error: syncError, initialChoiceRequired, syncNow, chooseInitialSync } = useSyncStore();
  const { theme, setTheme, studyTrack, setStudyTrack } = useSettingsStore();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [exportError, setExportError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [importedLectures, setImportedLectures] = useState<UserLecture[]>([]);

  const refreshImported = async () => setImportedLectures(await db.userLectures.toArray());
  useEffect(() => { void refreshImported(); }, []);

  const sendLink = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    await sendMagicLink(email);
    if (!useAuthStore.getState().error) setSent(true);
  };

  const exportData = async () => {
    setExportError('');
    try {
      const [cards, quizResults, notes, userLectures] = await Promise.all([
        db.cards.toArray(),
        db.quizResults.toArray(),
        db.notes.toArray(),
        db.userLectures.toArray(),
      ]);
      const serializedNotes = await Promise.all(notes.map(async (note) => ({
        ...note,
        image: note.image instanceof Blob ? { mime: note.image.type, base64: await blobToBase64(note.image) } : note.image,
      })));
      const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        cards,
        quizResults,
        notes: serializedNotes,
        userLectures,
        errors: JSON.parse(localStorage.getItem('sa_errors_v3') || '[]') as unknown,
        settings: JSON.parse(localStorage.getItem('sa_settings_v1') || '{}') as unknown,
        streak: localStorage.getItem('sa_streak'),
      };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `residanat-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const clearLocalData = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await Promise.all([
        db.cards.clear(),
        db.attempts.clear(),
        db.quizResults.clear(),
        db.notes.clear(),
        db.userLectures.clear(),
        db.syncQueue.clear(),
      ]);
      for (const key of LOCAL_KEYS) localStorage.removeItem(key);
      setConfirmClear(false);
      setMessage('Local study data cleared. Cloud data was not deleted and may sync back after sign-in.');
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const importLecture = async (file?: File) => {
    if (!file) return;
    setExportError('');
    try {
      const source: unknown = JSON.parse(await file.text());
      const lecture = LectureSchema.parse(source);
      const id = createId();
      const content = { ...lecture, id: createId().replaceAll('-', ''), progId: null };
      const updatedAt = Date.now();
      const imported = { id, name: content.name, content, updatedAt };
      await db.userLectures.put(imported);
      await queueSyncChange('lectures', id, 'upsert', {
        id,
        name: imported.name,
        content: { ...content },
        updated_at: new Date(updatedAt).toISOString(),
        deleted_at: null,
      });
      await refreshImported();
      setMessage(`Imported “${imported.name}”.`);
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const deleteLecture = async (lecture: UserLecture) => {
    const deletedAt = new Date().toISOString();
    try {
      await queueSyncChange('lectures', lecture.id, 'delete', {
        id: lecture.id,
        updated_at: deletedAt,
        deleted_at: deletedAt,
      });
      await db.userLectures.delete(lecture.id);
      await refreshImported();
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const runSync = async () => {
    if (!user) return;
    setBusy(true);
    await syncNow(user);
    setBusy(false);
  };

  const initialSync = async (choice: 'upload' | 'download') => {
    if (!user) return;
    setBusy(true);
    await chooseInitialSync(user, choice);
    setBusy(false);
  };

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap settings-wrap">
        <section className="panel settings-section">
          <p className="eyebrow">Votre cursus</p>
          <h2>Quel programme souhaitez-vous suivre ?</h2>
          <p className="muted">Le choix du cursus adapte les modules affichés dans le Programme.</p>
          <label>
            <span className="field-label">Niveau d’études</span>
            <select value={studyTrack} onChange={(event) => setStudyTrack(event.target.value as 'residency' | 'fifth-year')}>
              <option value="residency">Résidanat — programme officiel d’Oran (209 cours)</option>
              <option value="fifth-year">5e année médecine — modules OTR, pédiatrie et psychiatrie</option>
            </select>
          </label>
        </section>
        <section className="panel appearance-panel">
          <div>
            <p className="eyebrow">Apparence</p>
            <h2>Votre thème</h2>
            <p className="muted">Votre préférence est enregistrée sur cet appareil et synchronisée avec votre compte.</p>
          </div>
          <div className="theme-switch" role="group" aria-label="Thème de couleur">
            <button type="button" className={theme === 'light' ? 'theme-choice active' : 'theme-choice'} aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>Clair</button>
            <button type="button" className={theme === 'dark' ? 'theme-choice active' : 'theme-choice'} aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>Sombre</button>
          </div>
        </section>

        <section className="panel settings-section">
          <p className="eyebrow">Compte · synchronisation hors ligne</p>
          <h2>Compte et synchronisation</h2>
          {!configured && <p className="notice error">La connexion cloud n’est pas configurée. Renseignez l’URL Supabase et la clé anon dans l’environnement de déploiement.</p>}
          {configured && !user && (
            <form className="note-form" onSubmit={(event) => void sendLink(event)}>
              <p className="muted">Connectez-vous par lien e-mail pour synchroniser vos données de révision entre vos appareils. Vos changements restent sur cet appareil hors ligne.</p>
              <label>
                <span className="field-label">Adresse e-mail</span>
                <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <button className="btn" type="submit" disabled={authLoading}>{authLoading ? 'Envoi…' : 'Envoyer le lien de connexion'}</button>
              {sent && <p className="notice success" role="status">Consultez votre boîte de réception pour ouvrir le lien de connexion.</p>}
              {authError && <p className="notice error" role="alert">{authError}</p>}
            </form>
          )}
          {user && (
            <>
              <p className="muted">Connecté en tant que {user.email ?? 'votre compte'}.</p>
              <p className="notice sync-detail" role="status">État de synchronisation : {status}{syncError ? ` · ${syncError}` : ''}</p>
              {initialChoiceRequired && (
                <div className="notice">
                  <strong>Choisissez comment démarrer sur cet appareil.</strong>
                  <p>Vos données locales et cloud seront fusionnées. Les enregistrements les plus récents et la progression de révision seront préservés.</p>
                  <div className="btn-row">
                    <button className="btn" type="button" disabled={busy} onClick={() => void initialSync('upload')}>Envoyer les données locales</button>
                    <button className="btn ghost" type="button" disabled={busy} onClick={() => void initialSync('download')}>Télécharger les données cloud</button>
                  </div>
                </div>
              )}
              <div className="btn-row">
                <button className="btn" type="button" disabled={busy || status === 'offline'} onClick={() => void runSync()}>{busy ? 'Synchronisation…' : 'Synchroniser maintenant'}</button>
                <button className="btn ghost" type="button" disabled={busy} onClick={() => void signOut()}>Se déconnecter</button>
              </div>
              {authError && <p className="notice error" role="alert">{authError}</p>}
            </>
          )}
        </section>

        <section className="panel settings-section">
          <p className="eyebrow">Bibliothèque personnelle</p>
          <h2>Cours importés</h2>
          <p className="muted">Importez un cours au format JSON de l’application. Il sera enregistré localement puis synchronisé de façon sécurisée.</p>
          <label>
            <span className="field-label">Fichier JSON du cours</span>
            <input type="file" accept=".json,application/json" onChange={(event) => void importLecture(event.target.files?.[0])} />
          </label>
          {importedLectures.map((lecture) => (
            <div className="card" key={lecture.id}>
              <div className="question-meta"><strong>{lecture.name}</strong><span className="pill">Custom</span></div>
              <p className="muted">{lecture.content.cards.length} cartes · {lecture.content.quiz.length} quiz · {lecture.content.vf.length} vrai / faux</p>
              <button className="btn ghost btn-sm" type="button" onClick={() => void deleteLecture(lecture)}>Supprimer ce cours</button>
            </div>
          ))}
        </section>

        <section className="panel settings-section">
          <p className="eyebrow">Sauvegarde et stockage</p>
          <h2>Données sur cet appareil</h2>
          <p className="muted">Vos données de révision sont conservées dans ce navigateur et restent accessibles hors ligne. Effacer cet appareil ne supprime pas votre copie cloud.</p>
          <div className="btn-row">
            <button className="btn ghost" type="button" onClick={() => void exportData()}>Exporter une sauvegarde JSON</button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => void clearLocalData()}>{confirmClear ? 'Confirmer l’effacement local' : 'Effacer les données locales'}</button>
            {confirmClear && <button className="btn ghost" type="button" onClick={() => setConfirmClear(false)}>Annuler</button>}
          </div>
          {exportError && <p className="notice error" role="alert">{exportError}</p>}
          {message && <p className="notice success" role="status">{message}</p>}
        </section>
      </main>
    </>
  );
}
