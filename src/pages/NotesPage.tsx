import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { useNoteStore } from '../stores';
import { loadLegacyNotes, type LegacyNote } from '../lib/legacyNotes';
import { compressNoteImage } from '../lib/images';
import type { Note } from '../types/note';

function NoteImage({ image }: { image: Blob | string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    if (typeof image === 'string') {
      setSrc(image);
      return;
    }
    const url = URL.createObjectURL(image);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);
  return src ? <img className="note-image" src={src} alt="Image jointe à la note" /> : null;
}

export function NotesPage() {
  const [searchParams] = useSearchParams();
  const { notes, loadNotes, upsertNote, deleteNote, loading, error, clearError } = useNoteStore();
  const [legacy, setLegacy] = useState<LegacyNote[]>([]);
  const [legacyError, setLegacyError] = useState('');
  const [rel, setRel] = useState(searchParams.get('rel') || 'libre');
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [image, setImage] = useState<Blob | string | undefined>();
  const [editing, setEditing] = useState<number>();
  const [formError, setFormError] = useState('');

  useEffect(() => {
    void loadNotes();
    loadLegacyNotes().then(setLegacy).catch(() => setLegacyError('Les anciennes notes ne peuvent pas être lues dans ce navigateur.'));
  }, [loadNotes]);
  useEffect(() => {
    const requested = searchParams.get('rel');
    if (requested) setRel(requested);
  }, [searchParams]);

  const safeLegacy = useMemo(() => legacy.filter((note) => note.rel && note.rel !== 'libre' || note.text || note.link || note.image), [legacy]);
  const reset = () => {
    setEditing(undefined);
    setText('');
    setLink('');
    setImage(undefined);
    setRel(searchParams.get('rel') || 'libre');
    setFormError('');
  };
  const edit = (note: Note) => {
    setEditing(note.id);
    setRel(note.rel);
    setText(note.text);
    setLink(note.link ?? '');
    setImage(note.image);
    setFormError('');
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim() && !link.trim() && !image) {
      setFormError('Ajoutez un texte, un lien ou une image avant d’enregistrer.');
      return;
    }
    clearError();
    await upsertNote({ id: editing, rel: rel.trim() || 'libre', text: text.trim(), link: link.trim() || undefined, image, updated: Date.now() });
    const nextError = useNoteStore.getState().error;
    if (nextError) {
      setFormError(nextError);
      return;
    }
    reset();
  };
  const remove = async (id: number) => {
    await deleteNote(id);
  };

  const relationLabel = (value: string) => {
    if (value === 'libre') return 'Note libre';
    const [type, ...rest] = value.split(':');
    const subject = rest.join(':');
    const typeLabel = type === 'keys' ? 'Points clés' : type === 'card' ? 'Carte' : type === 'quiz' ? 'Quiz' : type === 'vf' ? 'Vrai / faux' : type;
    return `${typeLabel} · ${subject}`;
  };
  const previewLink = (value: string) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
      return '';
    }
  };

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap">
        <section className="panel">
          <p className="eyebrow">Stockage local · anciennes notes conservées</p>
          <h2>Notes & images</h2>
          <p className="muted">Les notes de l’ancienne application sont affichées en lecture seule depuis leur stockage d’origine. Les nouvelles notes sont enregistrées dans la base locale de l’application.</p>
          <form className="note-form" onSubmit={(event) => void save(event)}>
            <label>
              <span className="field-label">Associer à</span>
              <input value={rel} onChange={(event) => setRel(event.target.value)} placeholder="libre, keys:SA, card:SA.c1…" />
              <span className="muted">Exemples : libre, keys:ID, card:ID.carte, quiz:ID.question, vf:ID.question.</span>
            </label>
            <label>
              <span className="field-label">Texte / commentaire</span>
              <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} placeholder="Piège fréquent, moyen mnémotechnique, rappel…" />
            </label>
            <label>
              <span className="field-label">Lien (facultatif)</span>
              <input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…" />
            </label>
            <label>
              <span className="field-label">Image (facultatif)</span>
              <input type="file" accept="image/*" onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void compressNoteImage(file).then((blob) => {
                  setImage(blob);
                  setFormError('');
                }).catch((reason: unknown) => setFormError(reason instanceof Error ? reason.message : String(reason)));
              }} />
            </label>
            {image && <NoteImage image={image} />}
            {formError && <p className="notice error" role="alert">{formError}</p>}
            <div className="btn-row">
              <button className="btn" type="submit">{editing === undefined ? 'Enregistrer la note' : 'Mettre à jour'}</button>
              {editing !== undefined && <button className="btn ghost" type="button" onClick={reset}>Annuler</button>}
            </div>
          </form>
        </section>

        {(error || legacyError) && <p className="notice error" role="alert">{error || legacyError}</p>}
        <section className="panel">
          <h2>Mes notes ({notes.length + safeLegacy.length})</h2>
          {loading && <p className="muted" role="status">Chargement des notes…</p>}
          {!loading && notes.length === 0 && safeLegacy.length === 0 && <p className="muted">Aucune note enregistrée.</p>}
          {notes.map((note) => (
            <article key={`local-${note.id}`} className="card note-card">
              <div className="question-meta"><span className="pill">{relationLabel(note.rel)}</span><span className="muted">{new Date(note.updated).toLocaleDateString('fr-FR')}</span></div>
              {note.text && <p className="note-text">{note.text}</p>}
              {note.link && previewLink(note.link) && <a className="text-link" href={previewLink(note.link)} target="_blank" rel="noreferrer">{note.link}</a>}
              {note.image && <NoteImage image={note.image} />}
              <div className="btn-row">
                <button className="btn ghost btn-sm" type="button" onClick={() => edit(note)}>Modifier</button>
                {note.id !== undefined && <button className="btn ghost btn-sm" type="button" onClick={() => void remove(note.id!)}>Supprimer</button>}
              </div>
            </article>
          ))}
          {safeLegacy.map((note) => (
            <article key={`legacy-${note.id}`} className="card note-card">
              <div className="question-meta"><span className="pill">Ancienne note · {relationLabel(note.rel)}</span><span className="muted">{note.timestamp ? new Date(note.timestamp).toLocaleDateString('fr-FR') : 'Date inconnue'}</span></div>
              {note.text && <p className="note-text">{note.text}</p>}
              {note.link && previewLink(note.link) && <a className="text-link" href={previewLink(note.link)} target="_blank" rel="noreferrer">{note.link}</a>}
              {note.image && note.image !== '[idb]' && <NoteImage image={note.image} />}
              {note.image === '[idb]' && <p className="muted">Image conservée dans le stockage source historique.</p>}
              <p className="muted">Conservée sans modification dans le stockage historique.</p>
            </article>
          ))}
        </section>
        <p className="muted"><Link className="text-link" to="/progress">Retour à la progression</Link></p>
      </main>
    </>
  );
}
