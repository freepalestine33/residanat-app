import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatAudioTime } from '../../lib/audioTime';

interface NoteAudioPlayerProps {
  audio: Blob | string;
  audioPath?: string;
  duration?: number;
}

const EXT_MIME: Record<string, string> = {
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
};

/** Best-effort mime of the recording: blob type, data URL, or storage path/URL extension. */
function resolveAudioMime(audio: Blob | string, audioPath?: string): string {
  if (audio instanceof Blob) return audio.type || '';
  const dataMatch = /^data:([^;,]+)/.exec(audio);
  if (dataMatch) return dataMatch[1];
  const source = audioPath || audio;
  const ext = source.split(/[?#]/)[0].split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? '';
}

function canPlayMime(el: HTMLAudioElement, mime: string): boolean {
  const base = mime.split(';')[0].trim();
  return el.canPlayType(base) !== '' || (base !== mime && el.canPlayType(mime) !== '');
}

export function NoteAudioPlayer({ audio, audioPath, duration }: NoteAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const objectUrl = useRef('');
  const [src, setSrc] = useState(typeof audio === 'string' ? audio : '');
  const [status, setStatus] = useState<'idle' | 'loading' | 'playing' | 'error' | 'unsupported'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(duration ?? 0);
  const refreshAttempted = useRef(false);

  const mime = resolveAudioMime(audio, audioPath);

  useEffect(() => {
    refreshAttempted.current = false;
    setElapsed(0);
    setStatus('idle');
    if (typeof audio === 'string') {
      setSrc(audio);
      return;
    }
    setSrc('');
    return () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = '';
    };
  }, [audio, audioPath]);

  useEffect(() => {
    const el = audioRef.current;
    if (el && mime && !canPlayMime(el, mime)) setStatus('unsupported');
  }, [mime]);

  const refreshAudioUrl = async () => {
    if (!audioPath || refreshAttempted.current) return;
    refreshAttempted.current = true;
    try {
      if (!supabase) throw new Error('Cloud storage is not configured.');
      const { data: { session }, error } = await supabase.getSession();
      if (error) throw error;
      if (!session) throw new Error('Sign in is required to refresh this note audio.');

      const query = new URLSearchParams({ audioPath });
      const response = await fetch(`/api/notes?${query}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json() as { audioUrl?: unknown; error?: string };
      if (!response.ok || typeof result.audioUrl !== 'string') {
        throw new Error(result.error || `Could not refresh note audio (${response.status}).`);
      }
      setSrc(result.audioUrl);
      setStatus('idle');
    } catch (reason) {
      console.error('Could not refresh note audio.', reason);
      setStatus('error');
    }
  };

  const ensureSrc = async () => {
    if (src) return src;
    if (typeof audio !== 'string') {
      if (!objectUrl.current) objectUrl.current = URL.createObjectURL(audio);
      const url = objectUrl.current;
      setSrc(url);
      return url;
    }
    return '';
  };

  const toggle = async () => {
    const el = audioRef.current;
    if (!el || status === 'loading' || status === 'unsupported') return;
    if (mime && !canPlayMime(el, mime)) {
      setStatus('unsupported');
      return;
    }
    if (status === 'playing') {
      el.pause();
      return;
    }
    setStatus('loading');
    try {
      const url = await ensureSrc();
      if (url && el.src !== url) el.src = url;
      await el.play();
    } catch {
      setStatus('error');
      void refreshAudioUrl();
    }
  };

  const shown = status === 'playing' ? elapsed : (total || elapsed);
  return (
    <span className="note-audio">
      <button
        type="button"
        className="note-audio-btn"
        onClick={() => void toggle()}
        disabled={status === 'loading'}
        aria-label={status === 'playing' ? 'Mettre le mémo vocal en pause' : 'Écouter le mémo vocal'}
      >
        {status === 'loading' ? <span className="note-audio-spinner" aria-hidden="true" /> : status === 'playing' ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        <span>{formatAudioTime(shown)}</span>
      </button>
      {status === 'unsupported' && (
        <span className="note-audio-error">Ce mémo a été enregistré dans un format que cet appareil ne peut pas lire. Réécoutez-le sur tablette/PC ou ré-enregistrez-le.</span>
      )}
      {status === 'error' && <span className="note-audio-error">Lecture impossible</span>}
      <audio
        ref={audioRef}
        preload="none"
        src={src || undefined}
        onPlay={() => setStatus('playing')}
        onPause={() => setStatus('idle')}
        onEnded={() => { setStatus('idle'); setElapsed(0); }}
        onTimeUpdate={(event) => setElapsed(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          const d = event.currentTarget.duration;
          if (!total && Number.isFinite(d) && d > 0) setTotal(d);
        }}
        onError={() => { setStatus('error'); void refreshAudioUrl(); }}
      />
    </span>
  );
}
