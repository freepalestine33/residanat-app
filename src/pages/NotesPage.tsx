import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { useLectureStore } from '../stores/lectureStore';
import { useNoteStore } from '../stores/noteStore';
import { loadLegacyNotes, type LegacyNote } from '../lib/legacyNotes';
import { compressNoteImage } from '../lib/images';
import { checkMediaQuota, formatMediaBytes, getMediaUsage, MEDIA_LIMIT_BYTES } from '../lib/mediaUsage';
import type { Note } from '../types/note';
import { isPhotoLink, PhotoLinkPreview } from '../components/ui/PhotoLinkPreview';
import { NoteImage } from '../components/ui/NoteImage';
import { NoteAudioPlayer } from '../components/ui/NoteAudioPlayer';
import { NoteVideoList, NoteVideosField } from '../components/ui/NoteVideos';
import { NoteMemo } from '../components/ui/NoteMemo';
import type { NoteVideo } from '../types/note';
import '../styles/notes-composer.css';

type NoteEntry = { key: string; note: Note | LegacyNote; legacy: boolean };

const NOTES_PAGE_SIZE = 30;

const KIND_LABELS: Record<string, string> = {
  keys: 'Points clés',
  card: 'Carte',
  quiz: 'Quiz',
  vf: 'Vrai / faux',
};

function parseRel(value: string) {
  const [type, ...rest] = value.split(':');
  const subject = rest.join(':');
  if (type === 'libre' || !subject) return { type: 'libre', lectureRef: '', itemId: '' };
  const dot = subject.indexOf('.');
  return {
    type,
    lectureRef: dot === -1 ? subject : subject.slice(0, dot),
    itemId: dot === -1 ? '' : subject.slice(dot + 1),
  };
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
  const [hadRemoteImage, setHadRemoteImage] = useState(false);
  const [imageCleared, setImageCleared] = useState(false);
  const [videos, setVideos] = useState<NoteVideo[]>([]);
  const [keepsAudio, setKeepsAudio] = useState(false);
  const [editing, setEditing] = useState<number>();
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [query, setQuery] = useState('');
  const [mediaUsage, setMediaUsage] = useState<number | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const composerRef = useRef<HTMLElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadNotes();
    void loadLectures();
    void getMediaUsage().then(setMediaUsage).catch(() => setMediaUsage(null));
    loadLegacyNotes().then(setLegacy).catch(() => setLegacyError('Les anciennes notes ne peuvent pas être lues dans ce navigateur.'));
  }, [loadNotes, loadLectures]);
  useEffect(() => {
    const requested = searchParams.get('rel');
    if (requested) setRel(requested);
  }, [searchParams]);
  useEffect(() => {
    if (!saved) return undefined;
    const timer = window.setTimeout(() => setSaved(false), 2500);
    return () => window.clearTimeout(timer);
  }, [saved]);

  const sortedLectures = useMemo(
    () => [...lectures].sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [lectures],
  );
  const safeLegacy = useMemo(() => legacy.filter((note) => note.rel && note.rel !== 'libre' || note.text || note.link || note.image), [legacy]);

  const relationLabel = (value: string) => {
    if (value === 'libre') return 'Note libre';
    const [type, ...rest] = value.split(':');
    const subject = rest.join(':');
    return `${KIND_LABELS[type] ?? type} · ${subject}`;
  };
  const noteSourceLink = (value: string): string | null => {
    if (!value || value === 'libre') return null;
    const { type, lectureRef, itemId } = parseRel(value);
    if (!lectureRef) return null;
    const lecture = lectures.find((item) => item.id === lectureRef || item.progId === lectureRef);
    if (!lecture) return null;
    const tab = type === 'card' ? 'cards' : type === 'quiz' ? 'quiz' : type === 'vf' ? 'vf' : 'overview';
    const params = new URLSearchParams({ tab });
    if (itemId) params.set('focus', itemId);
    return `/lecture/${encodeURIComponent(lecture.id)}?${params.toString()}`;
  };
  const previewLink = (value: string) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
    } catch {
      return '';
    }
  };

  const notesByCourse = useMemo(() => {
    const groups = new Map<string, { key: string; title: string; entries: NoteEntry[] }>();
    const needle = query.trim().toLocaleLowerCase('fr');
    const add = (note: Note | LegacyNote, isLegacy: boolean, key: string) => {
      const { lectureRef } = parseRel(note.rel);
      const lecture = lectures.find((item) => item.id === lectureRef || item.progId === lectureRef);
      const groupKey = lectureRef || 'libre';
      const title = lecture?.name ?? (lectureRef ? `Cours ${lectureRef}` : 'Notes libres');
      if (needle) {
        const haystack = `${title} ${note.text ?? ''} ${note.link ?? ''} ${note.rel}`.toLocaleLowerCase('fr');
        if (!haystack.includes(needle)) return;
      }
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
  }, [lectures, notes, safeLegacy, query]);

  const isSearching = query.trim().length > 0;

  const reset = () => {
    setEditing(undefined);
    setText('');
    setLink('');
    setImage(undefined);
    setHadRemoteImage(false);
    setImageCleared(false);
    setVideos([]);
    setKeepsAudio(false);
    setShowLink(false);
    setShowVideo(false);
    setRel(searchParams.get('rel') || 'libre');
    setFormError('');
    if (fileRef.current) fileRef.current.value = '';
  };
  const edit = (note: Note) => {
    setEditing(note.id);
    setRel(note.rel);
    setText(note.text);
    setLink(note.link ?? '');
    setShowLink(Boolean(note.link));
    setImage(note.image);
    setHadRemoteImage(Boolean(note.imagePath) && !note.image);
    setImageCleared(false);
    setVideos(note.videos ?? []);
    setShowVideo(Boolean(note.videos?.length));
    setKeepsAudio(Boolean(note.audio || note.audioPath));
    setFormError('');
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.setTimeout(() => textRef.current?.focus({ preventScroll: true }), 250);
  };
  const removeImage = () => {
    setImage(undefined);
    setHadRemoteImage(false);
    // Only tell the store to drop the stored image when we are editing a note that had one.
    if (editing !== undefined) setImageCleared(true);
    if (fileRef.current) fileRef.current.value = '';
  };
  const pickImage = (file: File | undefined) => {
    if (!file) return;
    compressNoteImage(file).then(async (blob) => {
      const quotaError = await checkMediaQuota(blob.size);
      if (quotaError) {
        setFormError(quotaError);
        return;
      }
      setImage(blob);
      setHadRemoteImage(false);
      setImageCleared(false);
      setFormError('');
    }).catch((reason: unknown) => setFormError(reason instanceof Error ? reason.message : String(reason)));
  };

  const save = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const hasImage = Boolean(image) || hadRemoteImage;
    if (!text.trim() && !link.trim() && !hasImage && !videos.length && !keepsAudio) {
      setFormError('Écrivez quelque chose ou ajoutez une image, un lien ou une vidéo.');
      return;
    }
    clearError();
    await upsertNote({
      id: editing,
      rel: rel.trim() || 'libre',
      text: text.trim(),
      link: link.trim() || undefined,
      image,
      clearImage: imageCleared && !image ? true : undefined,
      videos,
      updated: Date.now(),
    });
    const nextError = useNoteStore.getState().error;
    if (nextError) {
      setFormError(nextError);
      return;
    }
    reset();
    setSaved(true);
    void getMediaUsage().then(setMediaUsage).catch(() => undefined);
  };

  // --- "Associer à" helpers -------------------------------------------------
  const relInfo = parseRel(rel);
  const specific = relInfo.type !== 'libre' && relInfo.type !== 'keys';
  const selectedLecture = lectures.find((item) => item.id === relInfo.lectureRef || item.progId === relInfo.lectureRef);
  const selectValue = relInfo.lectureRef ? (selectedLecture?.id ?? relInfo.lectureRef) : '';
  const lectureName = selectedLecture?.name ?? (relInfo.lectureRef ? `Cours ${relInfo.lectureRef}` : '');

  const hasThumb = Boolean(image);
  const linkOpen = showLink || Boolean(link);
  const videoOpen = showVideo || videos.length > 0;

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap notes-wrap">
        <section className="panel notes-composer nc" ref={composerRef}>
          <div className="nc-head">
            <div>
              <p className="eyebrow">{editing === undefined ? 'Nouvelle note' : 'Modifier la note'}</p>
              <h1>Notes & images</h1>
            </div>
            {saved && <span className="nc-saved" role="status">✓ Note enregistrée</span>}
          </div>

          <form className="nc-form" onSubmit={(event) => void save(event)}>
            <textarea
              ref={textRef}
              className="nc-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void save();
                }
              }}
              rows={3}
              placeholder="Piège fréquent, moyen mnémotechnique, rappel…"
              aria-label="Texte de la note"
            />

            <div className="nc-tools" role="group" aria-label="Ajouter à la note">
              <button type="button" className={`nc-tool${hasThumb || hadRemoteImage ? ' is-on' : ''}`} onClick={() => fileRef.current?.click()}>
                <span aria-hidden="true">🖼</span> Image
              </button>
              <button type="button" className={`nc-tool${linkOpen ? ' is-on' : ''}`} aria-pressed={linkOpen} onClick={() => setShowLink((value) => !value)}>
                <span aria-hidden="true">🔗</span> Lien
              </button>
              <button type="button" className={`nc-tool${videoOpen ? ' is-on' : ''}`} aria-pressed={videoOpen} onClick={() => setShowVideo((value) => !value)}>
                <span aria-hidden="true">▶</span> Vidéo
              </button>
              <input
                ref={fileRef}
                className="sr-only"
                type="file"
                accept="image/*"
                tabIndex={-1}
                onChange={(event) => pickImage(event.target.files?.[0])}
              />
            </div>

            {linkOpen && (
              <label className="nc-extra">
                <span className="field-label">Lien</span>
                <input type="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://…" autoFocus={showLink && !link} />
              </label>
            )}

            {(hasThumb || hadRemoteImage) && (
              <div className="nc-extra nc-image">
                {hasThumb
                  ? <NoteImage image={image as Blob | string} className="note-image nc-thumb" alt="Image jointe à la note" />
                  : <span className="muted">Une image est déjà jointe à cette note.</span>}
                <div className="btn-row">
                  <button type="button" className="btn ghost btn-sm" onClick={() => fileRef.current?.click()}>Remplacer</button>
                  <button type="button" className="btn ghost btn-sm" onClick={removeImage}>Retirer</button>
                </div>
              </div>
            )}

            {videoOpen && (
              <div className="nc-extra">
                <NoteVideosField videos={videos} onChange={setVideos} />
              </div>
            )}

            <div className="nc-rel">
              <span className="field-label">Associer à</span>
              {specific ? (
                <div className="nc-rel-chip">
                  <span className="pill">{relationLabel(rel)}</span>
                  {lectureName && <span className="muted">{lectureName}</span>}
                  {relInfo.lectureRef && (
                    <button type="button" className="btn ghost btn-sm" onClick={() => setRel(`keys:${selectValue}`)}>
                      Rattacher au cours entier
                    </button>
                  )}
                </div>
              ) : (
                <select
                  value={selectValue}
                  onChange={(event) => setRel(event.target.value ? `keys:${event.target.value}` : 'libre')}
                  aria-label="Cours associé"
                >
                  <option value="">Aucun cours (note libre)</option>
                  {relInfo.lectureRef && !selectedLecture && <option value={relInfo.lectureRef}>{`Cours ${relInfo.lectureRef}`}</option>}
                  {sortedLectures.map((lecture) => <option key={lecture.id} value={lecture.id}>{lecture.name}</option>)}
                </select>
              )}
              <details className="nc-advanced">
                <summary>Avancé</summary>
                <input value={rel} onChange={(event) => setRel(event.target.value)} placeholder="libre, keys:SA, card:SA.c1…" aria-label="Code de liaison" />
                <span className="muted">Exemples : libre, keys:ID, card:ID.carte, quiz:ID.question, vf:ID.question.</span>
              </details>
            </div>

            {mediaUsage !== null && (
              <p className="muted" style={{ margin: 0, fontSize: '0.78rem' }}>
                Médias joints : {formatMediaBytes(mediaUsage)} / {formatMediaBytes(MEDIA_LIMIT_BYTES)}
              </p>
            )}
            {formError && <p className="notice error" role="alert">{formError}</p>}
            <div className="nc-actions">
              <button className="btn" type="submit">{editing === undefined ? 'Enregistrer' : 'Mettre à jour'}</button>
              {editing !== undefined && <button className="btn ghost" type="button" onClick={reset}>Annuler</button>}
              <span className="muted nc-hint">Ctrl + Entrée pour enregistrer</span>
            </div>
          </form>
        </section>

        {(error || legacyError) && <p className="notice error" role="alert">{error || legacyError}</p>}
        <section className="panel notes-library">
          <div className="notes-library-heading">
            <div><p className="eyebrow">Votre carnet</p><h2>Mes notes</h2></div>
            <span className="pill">{notes.length + safeLegacy.length} notes · {notesByCourse.length} cours</span>
          </div>
          {(notes.length + safeLegacy.length) > 3 && (
            <input
              className="nc-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher dans mes notes…"
              aria-label="Rechercher dans mes notes"
            />
          )}
          {loading && <p className="muted" role="status">Chargement des notes…</p>}
          {!loading && notesByCourse.length === 0 && <p className="muted">{query ? 'Aucune note ne correspond.' : 'Aucune note enregistrée.'}</p>}
          {notesByCourse.map((group) => {
            const expanded = isSearching || expandedGroups.has(group.key);
            const visibleEntries = expanded ? group.entries : group.entries.slice(0, NOTES_PAGE_SIZE);
            return (
            <details className="notes-course-group" key={group.key} open={query ? true : undefined}>
              <summary><span>{group.title}</span><small>{group.entries.length} note{group.entries.length === 1 ? '' : 's'}</small></summary>
              <div className="notes-course-content">
                {visibleEntries.map(({ key, note, legacy: isLegacy }) => {
                  const sourceLink = noteSourceLink(note.rel);
                  return (
                  <article key={key} className="card note-card">
                    <div className="question-meta"><span className="pill">{isLegacy ? `Ancienne note · ${relationLabel(note.rel)}` : relationLabel(note.rel)}</span><span className="muted">{'updated' in note ? new Date(note.updated).toLocaleDateString('fr-FR') : note.timestamp ? new Date(note.timestamp).toLocaleDateString('fr-FR') : 'Date inconnue'}</span></div>
                    {note.text && <p className="note-text">{note.text}</p>}
                    {note.link && previewLink(note.link) && (isPhotoLink(note.link)
                      ? <PhotoLinkPreview url={note.link} />
                      : <a className="text-link" href={previewLink(note.link)} target="_blank" rel="noreferrer">{note.link}</a>)}
                    {note.image && (!isLegacy || note.image !== '[idb]') && <NoteImage image={note.image} imagePath={'imagePath' in note ? note.imagePath : undefined} className="note-image" alt="Image jointe à la note" />}
                    {'audio' in note && note.audio && <NoteAudioPlayer audio={note.audio} audioPath={note.audioPath} duration={note.audioDuration} />}
                    {'videos' in note && note.videos?.length ? <NoteVideoList videos={note.videos} noteKey={`notes-${note.syncId ?? note.id ?? key}`} /> : null}
                    {'memo' in note && note.memo && <NoteMemo memo={note.memo} />}
                    {isLegacy && note.image === '[idb]' && <p className="muted">Image conservée dans le stockage source historique.</p>}
                    {isLegacy ? <div className="btn-row">
                      <p className="muted">Conservée sans modification dans le stockage historique.</p>
                      {sourceLink && <Link className="btn ghost btn-sm" to={sourceLink}>Voir la source</Link>}
                    </div> : <div className="btn-row">
                      {sourceLink && <Link className="btn ghost btn-sm" to={sourceLink}>Voir la source</Link>}
                      <button className="btn ghost btn-sm" type="button" onClick={() => edit(note as Note)}>Modifier</button>
                      {(note as Note).id !== undefined && <button className="btn ghost btn-sm" type="button" onClick={() => void deleteNote((note as Note).id!)}>Supprimer</button>}
                    </div>}
                  </article>
                  );
                })}
                {!expanded && group.entries.length > NOTES_PAGE_SIZE && (
                  <button
                    type="button"
                    className="btn ghost btn-sm notes-show-more"
                    onClick={() => setExpandedGroups((previous) => new Set(previous).add(group.key))}
                  >
                    Afficher les {group.entries.length - NOTES_PAGE_SIZE} notes restantes
                  </button>
                )}
              </div>
            </details>
            );
          })}
        </section>
        <p className="muted"><Link className="text-link" to="/progress">Retour à la progression</Link></p>
      </main>
    </>
  );
}
