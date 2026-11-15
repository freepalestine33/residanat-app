import { useEffect, useState } from 'react';
import { Play, Trash2 } from 'lucide-react';
import type { NoteVideo } from '../../types/note';
import { activateNoteVideo, releaseNoteVideo, useActiveNoteVideoKey } from '../../lib/activeNoteVideo';
import { formatAudioTime } from '../../lib/audioTime';
import {
  MAX_NOTE_VIDEOS,
  MAX_VIDEO_LABEL,
  parseYouTubeUrl,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from '../../lib/youtube';

/**
 * Lightweight YouTube card: a thumbnail placeholder until tapped, then the
 * single app-wide iframe slot is claimed. Always offers the watch URL fallback.
 */
export function NoteVideoPlayer({ video, videoKey }: { video: NoteVideo; videoKey: string }) {
  const activeKey = useActiveNoteVideoKey();
  const active = activeKey === videoKey;
  const [thumbFailed, setThumbFailed] = useState(false);
  const label = video.label?.trim() || 'Vidéo YouTube';

  useEffect(() => () => releaseNoteVideo(videoKey), [videoKey]);

  return (
    <div className="note-video">
      {active ? (
        <iframe
          className="note-video-frame"
          src={youtubeEmbedUrl(video)}
          title={label}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          className="note-video-frame note-video-placeholder"
          onClick={() => activateNoteVideo(videoKey)}
          aria-label={`Lire « ${label} »`}
        >
          {!thumbFailed && (
            <img
              src={youtubeThumbnailUrl(video.id)}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setThumbFailed(true)}
            />
          )}
          <span className="note-video-play" aria-hidden="true">
            <Play size={22} fill="currentColor" />
          </span>
          {video.start ? <span className="note-video-start">{formatAudioTime(video.start)}</span> : null}
        </button>
      )}
      <div className="note-video-meta">
        <span className="note-video-label">{label}</span>
        <a className="note-video-link" href={youtubeWatchUrl(video)} target="_blank" rel="noreferrer">
          Ouvrir sur YouTube
        </a>
      </div>
    </div>
  );
}

export function NoteVideoList({ videos, noteKey }: { videos: NoteVideo[]; noteKey: string }) {
  if (!videos.length) return null;
  return (
    <div className="note-videos">
      {videos.map((video, index) => (
        <NoteVideoPlayer
          key={`${noteKey}-${index}`}
          video={video}
          videoKey={`${noteKey}:${video.id}:${video.start ?? 0}:${index}`}
        />
      ))}
    </div>
  );
}

interface NoteVideosFieldProps {
  videos: NoteVideo[];
  onChange: (videos: NoteVideo[]) => void;
  disabled?: boolean;
}

/** Editor for up to MAX_NOTE_VIDEOS YouTube links on a note. */
export function NoteVideosField({ videos, onChange, disabled }: NoteVideosFieldProps) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');

  const add = (raw: string): boolean => {
    const candidate = raw.trim().match(/https?:\/\/\S+/)?.[0] ?? raw.trim();
    const parsed = parseYouTubeUrl(candidate);
    if (!parsed) {
      setError('Collez un lien YouTube valide (youtube.com ou youtu.be).');
      return false;
    }
    if (videos.length >= MAX_NOTE_VIDEOS) {
      setError(`Maximum ${MAX_NOTE_VIDEOS} vidéos par note.`);
      return false;
    }
    const duplicate = videos.some((v) => v.id === parsed.id && (v.start ?? 0) === (parsed.start ?? 0));
    if (duplicate) {
      setError('Cette vidéo est déjà dans la note.');
      return false;
    }
    const trimmedLabel = label.trim().slice(0, MAX_VIDEO_LABEL);
    onChange([...videos, { ...parsed, label: trimmedLabel || undefined }]);
    setUrl('');
    setLabel('');
    setError('');
    return true;
  };

  return (
    <div className="note-videos-field">
      <span className="field-label">Vidéos YouTube · {videos.length}/{MAX_NOTE_VIDEOS}</span>
      {videos.length > 0 && (
        <ul className="note-videos-list">
          {videos.map((video, index) => (
            <li key={`${video.id}-${video.start ?? 0}-${index}`}>
              <span className="note-videos-list-label">
                {video.label || 'Vidéo YouTube'}
                {video.start ? <span className="muted"> · {formatAudioTime(video.start)}</span> : null}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Retirer la vidéo"
                disabled={disabled}
                onClick={() => {
                  onChange(videos.filter((_, i) => i !== index));
                  setError('');
                }}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {videos.length < MAX_NOTE_VIDEOS && (
        <div className="note-videos-add">
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            value={url}
            disabled={disabled}
            onChange={(event) => setUrl(event.target.value)}
            onPaste={(event) => {
              const text = event.clipboardData.getData('text/plain').trim();
              if (text && add(text)) event.preventDefault();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add(url);
              }
            }}
            placeholder="Collez un lien YouTube…"
            aria-label="Lien YouTube de la vidéo"
          />
          <input
            type="text"
            autoComplete="off"
            maxLength={MAX_VIDEO_LABEL}
            value={label}
            disabled={disabled}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Libellé (facultatif)"
            aria-label="Libellé de la vidéo"
          />
          <button type="button" className="btn ghost btn-sm" disabled={disabled || !url.trim()} onClick={() => add(url)}>
            Ajouter
          </button>
        </div>
      )}
      {error && <p className="notice error" role="alert">{error}</p>}
      <p className="muted note-videos-hint">La vidéo se lit directement dans la note, rien n’est téléchargé.</p>
    </div>
  );
}
