import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ClipboardPaste, ImagePlus, LoaderCircle, MessageCircle, Pencil, Plus, Trash2, Upload, Wand2, X } from 'lucide-react';
import { useNoteStore } from '../../stores/noteStore';
import type { Note } from '../../types/note';
import { compressNoteImage } from '../../lib/images';
import { checkMediaQuota } from '../../lib/mediaUsage';
import { PhotoLinkPreview } from './PhotoLinkPreview';
import { getHttpUrl, getImageImportFailure, getPastedAttachment } from './cardNoteAttachments';
import { NoteImage } from './NoteImage';
import { useMnemonicMemo } from '../../hooks/useMnemonicMemo';
import type { Memo } from '../../lib/mnemonicApi';
import { NoteMemo } from './NoteMemo';
import { NoteAudioPlayer } from './NoteAudioPlayer';
import { VoiceNoteRecorder } from './VoiceNoteRecorder';
import { NoteVideoList, NoteVideosField } from './NoteVideos';
import type { NoteVideo } from '../../types/note';

const MAX_SOURCE_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 15_000;

function memoToText(memo: Memo) {
  return [
    memo.title,
    ...(memo.subtitle ? [memo.subtitle] : []),
    ...memo.steps.map((s, i) => `${i + 1}. ${s.heading}${s.caption ? ' — ' + s.caption : ''}`),
    ...(memo.legend ?? []).map((l) => `${l.term} = ${l.meaning}`),
  ].join('\n');
}

interface CardNoteControlProps {
  relation: string;
  label: string;
  question?: string;
  answer?: string;
}

async function fetchImageFile(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal, credentials: 'omit', cache: 'no-store' });
  if (!response.ok) throw new Error(`Le serveur a répondu avec le code ${response.status}.`);
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (!contentType.startsWith('image/')) {
    throw new Error('Cette adresse renvoie une page ou un contenu qui n’est pas une image.');
  }

  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error('Cette image dépasse la limite de téléchargement de 8 Mo.');
  }
  if (!response.body) {
    throw new Error('Le téléchargement ne peut pas être limité dans ce navigateur.');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_SOURCE_IMAGE_BYTES) {
        await reader.cancel();
        throw new Error('Cette image dépasse la limite de téléchargement de 8 Mo.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) throw new Error('Le serveur n’a renvoyé aucune donnée image.');
  const buffer = new ArrayBuffer(total);
  const bytes = new Uint8Array(buffer);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const blob = new Blob([buffer], { type: contentType });
  return new File([blob], 'photo-importee', { type: contentType });
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

export const CardNoteControl: React.FC<CardNoteControlProps> = ({ relation, label, question, answer }) => {
  const canMemo = Boolean(question && answer);
  const memo = useMnemonicMemo(question ?? '', answer ?? '');
  const [memoPending, setMemoPending] = useState(false);
  const [draftMemo, setDraftMemo] = useState<Memo | null>(null);
  const draftRef = useRef('');
  const autoMemoText = useRef('');
  const [open, setOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftLink, setDraftLink] = useState('');
  const [draftImage, setDraftImage] = useState<Blob | string | null>();
  const [draftAudio, setDraftAudio] = useState<Blob | string | null>();
  const [draftAudioDuration, setDraftAudioDuration] = useState<number>();
  const [draftVideos, setDraftVideos] = useState<NoteVideo[]>([]);
  const [imagePasteValue, setImagePasteValue] = useState('');
  const [editingId, setEditingId] = useState<number>();
  const [formError, setFormError] = useState('');
  const [attachmentError, setAttachmentError] = useState('');
  const [attachmentStatus, setAttachmentStatus] = useState('');
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const busyRef = useRef(false);
  const ids = useId();
  const notes = useNoteStore((state) => state.notes);
  const loading = useNoteStore((state) => state.loading);
  const error = useNoteStore((state) => state.error);
  const loadNotes = useNoteStore((state) => state.loadNotes);
  const upsertNote = useNoteStore((state) => state.upsertNote);
  const deleteNote = useNoteStore((state) => state.deleteNote);
  const clearError = useNoteStore((state) => state.clearError);
  const relatedNotes = useMemo(() => notes.filter((note) => note.rel === relation).sort((a, b) => b.updated - a.updated), [notes, relation]);

  useEffect(() => { draftRef.current = draft; }, [draft]);

  const resetAttachmentFeedback = () => {
    setAttachmentError('');
    setAttachmentStatus('');
  };

  // Once a requested memo is ready, store its small JSON on the note draft.
  useEffect(() => {
    if (!memoPending) return;
    if (memo.state.status === 'ready') {
      setMemoPending(false);
      const ready = memo.state.memo;
      setDraftMemo(ready);
      const memoText = memoToText(ready);
      if (!draftRef.current.trim() || draftRef.current.trim() === autoMemoText.current) {
        setDraft(memoText);
        autoMemoText.current = memoText;
      }
      setAttachmentStatus('Mémo visuel joint. Enregistrez la note pour le synchroniser.');
      setFormError('');
    } else if (memo.state.status === 'error') {
      setMemoPending(false);
      setAttachmentError(memo.state.message);
    }
  }, [memo.state, memoPending]);

  const startMemo = (variant: number) => {
    setMemoPending(true);
    setAttachmentError('');
    setAttachmentStatus('');
    void memo.generate(variant);
  };

  const attachMemo = () => {
    if (memo.state.status === 'ready') {
      const ready = memo.state.memo;
      setDraftMemo(ready);
      const memoText = memoToText(ready);
      if (!draftRef.current.trim() || draftRef.current.trim() === autoMemoText.current) {
        setDraft(memoText);
        autoMemoText.current = memoText;
      }
      setAttachmentStatus('Mémo visuel joint. Enregistrez la note pour le synchroniser.');
      return;
    }
    startMemo(0);
  };

  const compressAndAttach = async (file: File) => {
    if (busyRef.current) {
      setAttachmentError('Une image est déjà en cours de traitement. Réessayez dans un instant.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setAttachmentError('Choisissez ou collez un fichier image.');
      setAttachmentStatus('');
      return;
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      setAttachmentError('Cette image dépasse la limite de 8 Mo avant compression.');
      setAttachmentStatus('');
      return;
    }
    busyRef.current = true;
    setAttachmentBusy(true);
    setAttachmentError('');
    setAttachmentStatus('Compression de la photo…');
    try {
      const compressed = await compressNoteImage(file);
      const quotaError = await checkMediaQuota(compressed.size);
      if (quotaError) {
        setAttachmentStatus('');
        setAttachmentError(quotaError);
        return;
      }
      setDraftImage(compressed);
      setAttachmentError('');
      setAttachmentStatus('Photo prête à être enregistrée.');
      setFormError('');
    } catch (reason) {
      setAttachmentStatus('');
      setAttachmentError(errorMessage(reason));
    } finally {
      busyRef.current = false;
      setAttachmentBusy(false);
    }
  };

  const importImageUrl = async (input: string) => {
    const url = getHttpUrl(input);
    if (!url) {
      setAttachmentError('Collez une adresse Web valide commençant par http:// ou https://.');
      setAttachmentStatus('');
      return;
    }
    if (busyRef.current) {
      setAttachmentError('Une image est déjà en cours de traitement. Réessayez dans un instant.');
      return;
    }
    setDraftLink(url);
    busyRef.current = true;
    setAttachmentBusy(true);
    setAttachmentError('');
    setAttachmentStatus('Récupération de l’image depuis le lien…');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    try {
      const file = await fetchImageFile(url, controller.signal);
      setAttachmentStatus('Compression de la photo…');
      const compressed = await compressNoteImage(file);
      const quotaError = await checkMediaQuota(compressed.size);
      if (quotaError) {
        setAttachmentStatus('');
        setAttachmentError(quotaError);
        return;
      }
      setDraftImage(compressed);
      setDraftLink((current) => current.trim() === url ? '' : current);
      setAttachmentError('');
      setAttachmentStatus('Photo importée et prête à être enregistrée.');
      setFormError('');
    } catch (reason) {
      const failure = getImageImportFailure(url, reason, controller.signal.aborted);
      if (failure) setDraftLink(failure.link);
      setAttachmentStatus('');
      setAttachmentError(failure?.message ?? `Import impossible. L’adresse a été conservée comme lien.`);
    } finally {
      window.clearTimeout(timeout);
      busyRef.current = false;
      setAttachmentBusy(false);
    }
  };

  const handleAttachmentPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    const clipboard = event.clipboardData;
    const pasted = getPastedAttachment(Array.from(clipboard.items), Array.from(clipboard.files), clipboard.getData('text/plain'));
    if (pasted?.type === 'image') {
      event.preventDefault();
      setImagePasteValue('');
      void compressAndAttach(pasted.file);
      return;
    }
    if (pasted?.type === 'url') {
      event.preventDefault();
      setImagePasteValue('');
      void importImageUrl(pasted.url);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith('image/'));
    if (!file) {
      setAttachmentError('Déposez un fichier image pour le joindre à la note.');
      setAttachmentStatus('');
      return;
    }
    void compressAndAttach(file);
  };

  const resetComposer = () => {
    setComposerOpen(false);
    setEditingId(undefined);
    setAttachmentsOpen(false);
    setDraft('');
    setDraftLink('');
    setDraftImage(undefined);
    setDraftAudio(undefined);
    setDraftAudioDuration(undefined);
    setDraftVideos([]);
    setDraftMemo(null);
    setImagePasteValue('');
    setFormError('');
    resetAttachmentFeedback();
  };

  const toggle = () => {
    if (!open) {
      void loadNotes();
      resetComposer();
    } else {
      resetComposer();
    }
    setOpen((value) => !value);
  };

  const edit = (note: Note) => {
    setComposerOpen(true);
    setEditingId(note.id);
    setAttachmentsOpen(Boolean(note.image));
    setDraft(note.text);
    setDraftLink(note.link ?? '');
    setDraftImage(note.image);
    setDraftAudio(note.audio);
    setDraftAudioDuration(note.audioDuration);
    setDraftVideos(note.videos ?? []);
    setDraftMemo(note.memo ?? null);
    setImagePasteValue('');
    setFormError('');
    resetAttachmentFeedback();
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (attachmentBusy) {
      setFormError('Attendez la fin du traitement de la photo avant d’enregistrer.');
      return;
    }
    if (draftLink.trim()) {
      if (!getHttpUrl(draftLink)) {
        setFormError('Ajoutez un lien Web valide commençant par http:// ou https://.');
        return;
      }
    }
    const clearedAttachment = editingId !== undefined && (draftImage === null || draftAudio === null);
    if (!draft.trim() && !draftLink.trim() && !draftImage && !draftAudio && !draftVideos.length && !draftMemo && !clearedAttachment) {
      setFormError('Ajoutez un commentaire, un lien, une photo, un mémo vocal, un mémo visuel ou une vidéo avant de l’enregistrer.');
      return;
    }
    clearError();
    await upsertNote({
      id: editingId,
      rel: relation,
      text: draft.trim(),
      link: draftLink.trim() || undefined,
      image: draftImage ?? undefined,
      clearImage: draftImage === null,
      audio: draftAudio ?? undefined,
      audioDuration: draftAudioDuration,
      clearAudio: draftAudio === null,
      audioChanged: draftAudio instanceof Blob || draftAudio === null ? true : undefined,
      videos: draftVideos,
      memo: draftMemo ?? undefined,
      clearMemo: draftMemo === null,
      updated: Date.now(),
    });
    const nextError = useNoteStore.getState().error;
    if (nextError) {
      setFormError(nextError);
      return;
    }
    resetComposer();
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
    if (editingId === note.id) resetComposer();
    setFormError('');
  };

  const startNewNote = () => {
    if (editingId !== undefined) {
      setDraft('');
      setDraftLink('');
      setDraftImage(undefined);
      setDraftAudio(undefined);
      setDraftAudioDuration(undefined);
      setDraftVideos([]);
      setDraftMemo(null);
      setImagePasteValue('');
      setFormError('');
      resetAttachmentFeedback();
    }
    setEditingId(undefined);
    setAttachmentsOpen(false);
    setComposerOpen(true);
  };
const renderEditor = () => <form className="card-note-form" onSubmit={(event) => void save(event)}>
    <label>
      <span className="field-label">{editingId === undefined ? 'Ajouter une note' : 'Modifier la note'}</span>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} placeholder="Un rappel, une astuce ou un point à revoir…" />
    </label>

    {(formError || error) && <p className="notice error" role="alert">{formError || error}</p>}

    <div className="btn-row card-note-submit">
      <button className="btn btn-sm" type="submit" disabled={attachmentBusy}>
        {editingId === undefined ? <><Plus size={15} aria-hidden="true" /> Enregistrer</> : <>Enregistrer la modification</>}
      </button>
      <button className="btn ghost btn-sm" type="button" onClick={resetComposer}>Annuler</button>
    </div>

    <button
      type="button"
      className="card-note-attach-toggle"
      aria-expanded={attachmentsOpen}
      aria-controls={`${ids}-attachments`}
      onClick={() => setAttachmentsOpen((value) => !value)}
    >
      <ImagePlus size={15} aria-hidden="true" />
      {attachmentsOpen ? 'Masquer les ajouts' : 'Ajouter photo, mémo vocal ou vidéo'}
    </button>

    {attachmentsOpen && <div className="card-note-attachments" id={`${ids}-attachments`}>
      <div className="card-note-attachment-heading">
        <div>
          <span className="field-label">Photo, mémo vocal ou vidéo</span>
          <p>Collez, déposez ou choisissez une image, enregistrez un mémo vocal, ou ajoutez une vidéo YouTube.</p>
        </div>
        <ImagePlus size={19} aria-hidden="true" />
      </div>

      <label className="card-note-paste-field">
        <span className="card-note-paste-icon"><ClipboardPaste size={16} aria-hidden="true" /></span>
        <span className="visually-hidden">Coller une image ou une adresse de photo</span>
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          value={imagePasteValue}
          onChange={(event) => setImagePasteValue(event.target.value)}
          onPaste={handleAttachmentPaste}
          placeholder="Touchez ici, puis collez une image ou son URL"
          aria-describedby={`${ids}-paste-help ${ids}-attachment-status`}
          disabled={attachmentBusy}
        />
      </label>
      <p className="card-note-attachment-help" id={`${ids}-paste-help`}>Le champ est activable au toucher pour recevoir une image copiée. Les liens directs sont importés si le site l’autorise.</p>

      <div className="card-note-audio-section">
        <span className="field-label">Mémo vocal</span>
        <VoiceNoteRecorder
          disabled={attachmentBusy}
          onRecorded={(blob, seconds) => {
            setDraftAudio(blob);
            setDraftAudioDuration(seconds);
            setAttachmentError('');
            setAttachmentStatus('Mémo vocal enregistré.');
            setFormError('');
          }}
        />
      </div>

      <div className="card-note-video-section">
        <NoteVideosField videos={draftVideos} onChange={setDraftVideos} disabled={attachmentBusy} />
      </div>

      <div
        className="card-note-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={handleDrop}
      >
        <Upload size={17} aria-hidden="true" />
        <span>ou déposez une image ici</span>
        <label className="card-note-file-button">
          <input
            type="file"
            accept="image/*"
            aria-label="Choisir une image depuis cet appareil"
            disabled={attachmentBusy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void compressAndAttach(file);
              event.target.value = '';
            }}
          />
          <ImagePlus size={15} aria-hidden="true" />
          Choisir un fichier
        </label>
      </div>
    </div>}

    {draftImage && <div className="card-note-image-preview">
      <NoteImage image={draftImage} className="card-note-image" alt="Photo jointe à la note" />
      <div className="card-note-image-preview-meta">
        <span>Photo jointe</span>
        <button type="button" className="card-note-remove-image" onClick={() => {
          setDraftImage(null);
          setAttachmentError('');
          setAttachmentStatus('Photo retirée. Enregistrez pour confirmer la modification.');
        }} disabled={attachmentBusy}>
          <Trash2 size={14} aria-hidden="true" />
          Retirer
        </button>
      </div>
    </div>}
    {draftAudio && <div className="card-note-audio-preview">
      <NoteAudioPlayer audio={draftAudio} duration={draftAudioDuration} />
      <div className="card-note-image-preview-meta">
        <span>Mémo vocal</span>
        <button type="button" className="card-note-remove-image" onClick={() => {
          setDraftAudio(null);
          setDraftAudioDuration(undefined);
          setAttachmentError('');
          setAttachmentStatus('Mémo vocal retiré. Enregistrez pour confirmer la modification.');
        }} disabled={attachmentBusy}>
          <Trash2 size={14} aria-hidden="true" />
          Retirer
        </button>
      </div>
    </div>}
    {draftMemo && <div className="card-note-memo-preview">
      <NoteMemo memo={draftMemo} />
      <div className="card-note-image-preview-meta">
        <span>Mémo visuel</span>
        <button type="button" className="card-note-remove-image" onClick={() => {
          setDraftMemo(null);
          setAttachmentError('');
          setAttachmentStatus('Mémo visuel retiré. Enregistrez pour confirmer la modification.');
        }} disabled={attachmentBusy}>
          <Trash2 size={14} aria-hidden="true" />
          Retirer
        </button>
      </div>
    </div>}
    {attachmentBusy && <p className="card-note-attachment-status is-busy" id={`${ids}-attachment-status`} role="status"><LoaderCircle size={15} aria-hidden="true" />{attachmentStatus}</p>}
    {!attachmentBusy && attachmentStatus && <p className="card-note-attachment-status" id={`${ids}-attachment-status`} role="status">{attachmentStatus}</p>}
    {!attachmentStatus && !attachmentBusy && <span className="visually-hidden" id={`${ids}-attachment-status`} />}
    {attachmentError && <p className="notice error card-note-attachment-error" role="alert">{attachmentError}</p>}

    <p className="muted card-note-hint">Votre texte, sa photo, son mémo vocal et ses vidéos sont enregistrés ensemble sur cette carte.</p>
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
          <div className="card-note-editor-tools">
            {composerOpen && <button className="icon-button card-note-back" type="button" aria-label="Retour aux notes" title="Retour aux notes" onClick={resetComposer}>
              <ArrowLeft size={16} aria-hidden="true" />
            </button>}
            <button className="icon-button" type="button" aria-label="Fermer les notes" onClick={() => {
              resetComposer();
              setOpen(false);
            }}><X size={16} /></button>
          </div>
        </div>
        {loading && <p className="muted" role="status">Chargement des notes…</p>}
        {!composerOpen && (formError || error) && <p className="notice error" role="alert">{formError || error}</p>}
        {!composerOpen && <div className="card-note-memo-actions">
          {canMemo && <>
            <button
              type="button"
              className="card-note-memo-btn"
              onClick={() => { if (!composerOpen) startNewNote(); attachMemo(); }}
              disabled={attachmentBusy || memo.state.status === 'loading' || memoPending}
            >
              <Wand2 size={15} aria-hidden="true" />
              {memo.state.status === 'loading' || memoPending ? 'Création du mémo…' : 'Créer un mémo visuel (IA)'}
            </button>
            {memo.state.status === 'ready' && <button
              type="button"
              className="card-note-memo-btn card-note-memo-alt"
              onClick={() => { if (!composerOpen) startNewNote(); startMemo(memo.nextVariant); }}
              disabled={attachmentBusy}
            >
              Autre version
            </button>}
          </>}
          <VoiceNoteRecorder
            disabled={attachmentBusy}
            onRecorded={(blob, seconds) => {
              void checkMediaQuota(blob.size).then((quotaError) => {
                if (quotaError) {
                  setAttachmentError(quotaError);
                  setAttachmentStatus('');
                  return;
                }
                if (!composerOpen) startNewNote();
                setDraftAudio(blob);
                setDraftAudioDuration(seconds);
                setAttachmentError('');
                setAttachmentStatus('Mémo vocal enregistré.');
                setFormError('');
              });
            }}
          />
        </div>}
        {!composerOpen && <button className="card-note-new" type="button" aria-label={`Ajouter une note · ${label}`} onClick={startNewNote}>
          <span className="card-note-new-icon"><Plus size={16} aria-hidden="true" /></span>
          Ajouter une note
        </button>}
        {composerOpen && editingId === undefined && renderEditor()}
        {relatedNotes.map((note) => <div className="card-note-entry" key={note.id ?? note.syncId}>
          <article className="card-note-saved">
            {note.text && <p>{note.text}</p>}
            {note.link && <PhotoLinkPreview url={note.link} />}
            {note.image && <NoteImage image={note.image} imagePath={note.imagePath} className="card-note-image" alt="Photo jointe à la note" />}
            {note.audio && <NoteAudioPlayer audio={note.audio} audioPath={note.audioPath} duration={note.audioDuration} />}
            {note.videos?.length ? <NoteVideoList videos={note.videos} noteKey={`note-${note.syncId ?? note.id}`} /> : null}
            {note.memo && <NoteMemo memo={note.memo} />}
            <div className="card-note-saved-meta"><span className="muted">{new Date(note.updated).toLocaleDateString('fr-FR')}</span>
              {note.id !== undefined && <div className="card-note-actions">
                <button type="button" className="text-link" onClick={() => edit(note)}><Pencil size={13} /> Modifier</button>
                <button type="button" className="card-note-delete" onClick={() => void remove(note)}><Trash2 size={13} /> Supprimer</button>
              </div>}
            </div>
          </article>
          {composerOpen && editingId !== undefined && editingId === note.id && renderEditor()}
        </div>)}
        {!loading && !composerOpen && relatedNotes.length === 0 && <p className="muted">Aucune note pour le moment, ajoutez la première.</p>}
      </section>}
    </div>
  );
};
