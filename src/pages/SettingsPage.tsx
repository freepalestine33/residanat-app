import { useEffect, useState } from 'react';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { db, type UserLecture } from '../db/db';
import { blobToBase64 } from '../lib/images';
import { LectureSchema } from '../lib/schema';
import { queueSyncChange } from '../lib/syncEvents';
import { useAuthStore, useSyncStore } from '../stores';

const LOCAL_KEYS = [
  'sa_settings_v1',
  'sa_settings_updated_at',
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
      const id = crypto.randomUUID();
      const content = { ...lecture, id: crypto.randomUUID().replaceAll('-', ''), progId: null };
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
      <main className="wrap">
        <section className="panel">
          <p className="eyebrow">Secure account · offline-ready</p>
          <h2>Account & synchronisation</h2>
          {!configured && <p className="notice error">Cloud sign-in is not configured. Set the Supabase URL and anon key in the deployment environment.</p>}
          {configured && !user && (
            <form className="note-form" onSubmit={(event) => void sendLink(event)}>
              <p className="muted">Sign in with an email magic link to sync your study data across devices. Changes stay on this device while offline.</p>
              <label>
                <span className="field-label">Email</span>
                <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
              </label>
              <button className="btn" type="submit" disabled={authLoading}>{authLoading ? 'Sending…' : 'Send sign-in link'}</button>
              {sent && <p className="notice success" role="status">Check your inbox for the sign-in link.</p>}
              {authError && <p className="notice error" role="alert">{authError}</p>}
            </form>
          )}
          {user && (
            <>
              <p className="muted">Signed in as {user.email ?? 'your account'}.</p>
              <p className="notice" role="status">Sync status: {status}{syncError ? ` · ${syncError}` : ''}</p>
              {initialChoiceRequired && (
                <div className="notice">
                  <strong>Choose how to start on this device.</strong>
                  <p>Your local and cloud data will be merged safely; newer records win, with review progress merged by review count and due date.</p>
                  <div className="btn-row">
                    <button className="btn" type="button" disabled={busy} onClick={() => void initialSync('upload')}>Upload this device’s data</button>
                    <button className="btn ghost" type="button" disabled={busy} onClick={() => void initialSync('download')}>Download cloud data</button>
                  </div>
                </div>
              )}
              <div className="btn-row">
                <button className="btn" type="button" disabled={busy || status === 'offline'} onClick={() => void runSync()}>{busy ? 'Synchronizing…' : 'Sync now'}</button>
                <button className="btn ghost" type="button" disabled={busy} onClick={() => void signOut()}>Sign out</button>
              </div>
              {authError && <p className="notice error" role="alert">{authError}</p>}
            </>
          )}
        </section>

        <section className="panel">
          <h2>Imported lectures</h2>
          <p className="muted">Import a lecture JSON file matching the app’s lecture format. It is saved locally and queued for secure cloud sync.</p>
          <label>
            <span className="field-label">Lecture JSON</span>
            <input type="file" accept=".json,application/json" onChange={(event) => void importLecture(event.target.files?.[0])} />
          </label>
          {importedLectures.map((lecture) => (
            <div className="card" key={lecture.id}>
              <div className="question-meta"><strong>{lecture.name}</strong><span className="pill">Custom</span></div>
              <p className="muted">{lecture.content.cards.length} cards · {lecture.content.quiz.length} quizzes · {lecture.content.vf.length} true/false</p>
              <button className="btn ghost btn-sm" type="button" onClick={() => void deleteLecture(lecture)}>Delete lecture</button>
            </div>
          ))}
        </section>

        <section className="panel">
          <h2>Local data</h2>
          <p className="muted">Study data is stored in this browser and remains available offline. Clearing this device does not delete your cloud copy.</p>
          <div className="btn-row">
            <button className="btn ghost" type="button" onClick={() => void exportData()}>Export all data (JSON backup)</button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => void clearLocalData()}>{confirmClear ? 'Confirm clear local data' : 'Clear local data'}</button>
            {confirmClear && <button className="btn ghost" type="button" onClick={() => setConfirmClear(false)}>Cancel</button>}
          </div>
          {exportError && <p className="notice error" role="alert">{exportError}</p>}
          {message && <p className="notice success" role="status">{message}</p>}
        </section>
      </main>
    </>
  );
}
