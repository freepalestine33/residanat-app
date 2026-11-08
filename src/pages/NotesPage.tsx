import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { useLectureStore, useNoteStore } from '../stores';
import { loadLegacyNotes, type LegacyNote } from '../lib/legacyNotes';
import { compressNoteImage } from '../lib/images';
import type { Note } from '../types/note';
import { isPhotoLink, PhotoLinkPreview } from '../components/ui/PhotoLinkPreview';

type NoteEntry = { key: string; note: Note | LegacyNote; legacy: boolean };

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
  const { lectures, loadLectures } = useLectureStore();
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
    void loadLectures();
    loadLegacyNotes().then(setLegacy).catch(() => setLegacyError('Les anciennes notes ne peuvent pas être lues dans ce navigateur.'));
  }, [loadNotes, loadLectures]);
  useEffect(() => {
    const requested = searchParams.get('rel');
    if (requested) setRel(requested);
  }, [searchParams]);

  const safeLegacy = useMemo(() => legacy.filter((note) => note.rel && note.rel !== 'libre' || note.text || note.link || note.image), [legacy]);
  const notesByCourse = useMemo(() => {
    const groups = new Map<string, { key: string; title: string; entries: NoteEntry[] }>();
    const add = (note: Note | LegacyNote, isLegacy: boolean, key: string) => {
      const [type, ...rest] = note.rel.split(':');
      const subject = rest.join(':');
      const lectureId = type === 'libre' || !subject ? '' : subject.split('.')[0];
      const lecture = lectures.find((item) => item.id === lectureId || item.progId === lectureId);
      const groupKey = lectureId || 'libre';
      const title = lecture?.name ?? (lectureId ? `Cours ${lectureId}` : 'Notes libres');
      const group = groups.get(groupKey) ?? { key: groupKey, title, entries: [] };
      group.entries.push({ key, note, legacy: isLegacy });
      groups.set(groupKey, group);
    };
    notes.forEach((note) => add(note, false, `local-${note.id}`));
    safeLegacy.forEach((note) => add(note, true, `legacy-${note.id}`));
    const getDate = (note: Note | LegacyNote) => 'updated' in note ? note.updated : Date.parse(note.timestamp ?? '') || 0;
    return [...groups.values()].map((group) => ({
      ...group,
      entries: group.entries.sort((a, b) => getDate(b.note) - getDate(a.note)),
    })).sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  }, [lectures, notes, safeLegacy]);

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
      <main className="wrap notes-wrap">
        <section className="panel notes-composer">
          <p className="eyebrow">Stockage local · anciennes notes conservées</p>
          <h1>Notes & images</h1>
          <p className="muted">Les notes sont regroupées par cours. Ajoutez-en directement depuis une carte, ou utilisez ce formulaire pour une note libre.</p>
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
        <section className="panel notes-library">
          <div className="notes-library-heading">
            <div><p className="eyebrow">Votre carnet</p><h2>Mes notes</h2></div>
            <span className="pill">{notes.length + safeLegacy.length} notes · {notesByCourse.length} cours</span>
          </div>
          {loading && <p className="muted" role="status">Chargement des notes…</p>}
          {!loading && notesByCourse.length === 0 && <p className="muted">Aucune note enregistrée.</p>}
          {notesByCourse.map((group) => (
            <details className="notes-course-group" key={group.key}>
              <summary><span>{group.title}</span><small>{group.entries.length} note{group.entries.length === 1 ? '' : 's'}</small></summary>
              <div className="notes-course-content">
                {group.entries.map(({ key, note, legacy: isLegacy }) => (
                  <article key={key} className="card note-card">
                    <div className="question-meta"><span className="pill">{isLegacy ? `Ancienne note · ${relationLabel(note.rel)}` : relationLabel(note.rel)}</span><span className="muted">{'updated' in note ? new Date(note.updated).toLocaleDateString('fr-FR') : note.timestamp ? new Date(note.timestamp).toLocaleDateString('fr-FR') : 'Date inconnue'}</span></div>
                    {note.text && <p className="note-text">{note.text}</p>}
                    {note.link && previewLink(note.link) && (isPhotoLink(note.link)
                      ? <PhotoLinkPreview url={note.link} />
                      : <a className="text-link" href={previewLink(note.link)} target="_blank" rel="noreferrer">{note.link}</a>)}
                    {note.image && (!isLegacy || note.image !== '[idb]') && <NoteImage image={note.image} />}
                    {isLegacy && note.image === '[idb]' && <p className="muted">Image conservée dans le stockage source historique.</p>}
                    {isLegacy ? <p className="muted">Conservée sans modification dans le stockage historique.</p> : <div className="btn-row">
                      <button className="btn ghost btn-sm" type="button" onClick={() => edit(note as Note)}>Modifier</button>
                      {(note as Note).id !== undefined && <button className="btn ghost btn-sm" type="button" onClick={() => void deleteNote((note as Note).id!)}>Supprimer</button>}
                    </div>}
                  </article>
                ))}
              </div>
            </details>
          ))}
        </section>
        <p className="muted"><Link className="text-link" to="/progress">Retour à la progression</Link></p>
      </main>
    </>
  );
}
