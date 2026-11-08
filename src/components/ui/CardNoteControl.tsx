import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useNoteStore } from '../../stores';
import type { Note } from '../../types/note';
import { compressNoteImage } from '../../lib/images';
import { PhotoLinkPreview } from './PhotoLinkPreview';

function InlineNoteImage({ image }: { image: Blob | string }) {
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
  return src ? <img className="card-note-image" src={src} alt="Photo jointe à la note" /> : null;
}

interface CardNoteControlProps {
  relation: string;
  label: string;
}

export const CardNoteControl: React.FC<CardNoteControlProps> = ({ relation, label }) => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftLink, setDraftLink] = useState('');
  const [draftImage, setDraftImage] = useState<Blob | string | undefined>();
  const [editingId, setEditingId] = useState<number>();
  const [formError, setFormError] = useState('');
  const notes = useNoteStore((state) => state.notes);
  const loading = useNoteStore((state) => state.loading);
  const error = useNoteStore((state) => state.error);
  const loadNotes = useNoteStore((state) => state.loadNotes);
  const upsertNote = useNoteStore((state) => state.upsertNote);
  const deleteNote = useNoteStore((state) => state.deleteNote);
  const clearError = useNoteStore((state) => state.clearError);
  const relatedNotes = useMemo(() => notes.filter((note) => note.rel === relation).sort((a, b) => b.updated - a.updated), [notes, relation]);

  const toggle = () => {
    if (!open) void loadNotes();
    setOpen((value) => !value);
    setFormError('');
  };

  const edit = (note: Note) => {
    setEditingId(note.id);
    setDraft(note.text);
    setDraftLink(note.link ?? '');
    setDraftImage(note.image);
    setFormError('');
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draftLink.trim()) {
      try {
        const url = new URL(draftLink.trim());
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Lien non pris en charge.');
      } catch {
        setFormError('Ajoutez un lien Web valide commençant par http:// ou https://.');
        return;
      }
    }
    if (!draft.trim() && !draftLink.trim() && !draftImage) {
      setFormError('Ajoutez un commentaire, un lien ou une photo avant de l’enregistrer.');
      return;
    }
    clearError();
    await upsertNote({ id: editingId, rel: relation, text: draft.trim(), link: draftLink.trim() || undefined, image: draftImage, updated: Date.now() });
    const nextError = useNoteStore.getState().error;
    if (nextError) {
      setFormError(nextError);
      return;
    }
    setDraft('');
    setDraftLink('');
    setDraftImage(undefined);
    setEditingId(undefined);
    setFormError('');
  };

  const remove = async (note: Note) => {
    if (note.id === undefined) return;
    clearError();
    await deleteNote(note.id);
    const nextError = useNoteStore.getState().error;
    if (nextError) {
      setFormError(nextError);
      return;
    }
    if (editingId === note.id) {
      setEditingId(undefined);
      setDraft('');
      setDraftLink('');
      setDraftImage(undefined);
    }
    setFormError('');
  };

  const renderEditor = () => <form className="card-note-form" onSubmit={(event) => void save(event)}>
    <label>
      <span className="field-label">{editingId === undefined ? 'Ajouter une note' : 'Modifier la note'}</span>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder="Un rappel, une astuce ou un point à revoir…" />
    </label>
    <label>
      <span className="field-label">Lien direct vers une photo</span>
      <input type="url" value={draftLink} onChange={(event) => setDraftLink(event.target.value)} placeholder="Collez l’adresse directe de l’image" />
      <span className="muted">Les liens de partage Google Photos ouvrent une page d’album. Pour afficher la photo ici, téléversez-la ou utilisez son adresse directe.</span>
    </label>
    <label>
      <span className="field-label">Ou joindre une photo</span>
      <input type="file" accept="image/*" onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        void compressNoteImage(file).then((blob) => {
          setDraftImage(blob);
          setFormError('');
        }).catch((reason: unknown) => setFormError(reason instanceof Error ? reason.message : String(reason)));
      }} />
    </label>
    {draftImage && <p className="muted">Une photo est jointe à cette note.</p>}
    <p className="muted card-note-hint">Votre texte et sa photo sont enregistrés ensemble sur cette carte.</p>
    {(formError || error) && <p className="notice error" role="alert">{formError || error}</p>}
    <div className="btn-row">
      <button className="btn btn-sm" type="submit">{editingId === undefined ? <><Plus size={15} /> Enregistrer</> : 'Mettre à jour'}</button>
      {editingId !== undefined && <button className="btn ghost btn-sm" type="button" onClick={() => { setEditingId(undefined); setDraft(''); setDraftLink(''); setDraftImage(undefined); setFormError(''); }}>Annuler</button>}
    </div>
  </form>;

  return (
    <div className="card-note-widget">
      <button
        type="button"
        className="card-web-search-button card-note-trigger"
        aria-label={`${relatedNotes.length ? 'Voir ou ajouter une note' : 'Ajouter une note'} · ${label}`}
        aria-expanded={open}
        title={relatedNotes.length ? 'Voir ou ajouter une note' : 'Ajouter une note'}
        onClick={toggle}
      >
        <MessageCircle size={17} aria-hidden="true" />
        {relatedNotes.length > 0 && <span className="card-note-count">{relatedNotes.length}</span>}
      </button>
      {open && <section className="card-note-editor" aria-label={`Notes · ${label}`}>
        <div className="card-note-editor-heading">
          <div><p className="eyebrow">Note liée à cette carte</p><strong>{label}</strong></div>
          <button className="icon-button" type="button" aria-label="Fermer les notes" onClick={() => setOpen(false)}><X size={16} /></button>
        </div>
        {loading && <p className="muted" role="status">Chargement des notes…</p>}
        {relatedNotes.map((note) => <div className="card-note-entry" key={note.id ?? note.syncId}>
          <article className="card-note-saved">
            {note.text && <p>{note.text}</p>}
            {note.link && <PhotoLinkPreview url={note.link} />}
            {note.image && <InlineNoteImage image={note.image} />}
            <div className="card-note-saved-meta"><span className="muted">{new Date(note.updated).toLocaleDateString('fr-FR')}</span>
              {note.id !== undefined && <div className="card-note-actions">
                <button type="button" className="text-link" onClick={() => edit(note)}><Pencil size={13} /> Modifier</button>
                <button type="button" className="card-note-delete" onClick={() => void remove(note)}><Trash2 size={13} /> Supprimer</button>
              </div>}
            </div>
          </article>
          {editingId !== undefined && editingId === note.id && renderEditor()}
        </div>)}
        {editingId === undefined && renderEditor()}
      </section>}
    </div>
  );
};
