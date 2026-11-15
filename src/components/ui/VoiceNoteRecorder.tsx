import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { formatAudioTime } from '../../lib/audioTime';

const MAX_SECONDS = 120;
const BITRATE = 24_000;
const MIME_CANDIDATES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
];

function pickMime() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return '';
  return MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? '';
}

function isSupported() {
  return typeof MediaRecorder !== 'undefined'
    && typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia)
    && Boolean(pickMime());
}

interface VoiceNoteRecorderProps {
  onRecorded: (blob: Blob, durationSec: number) => void;
  disabled?: boolean;
}

export function VoiceNoteRecorder({ onRecorded, disabled }: VoiceNoteRecorderProps) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'error'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const elapsedRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const stopAtRef = useRef<number | undefined>(undefined);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const cleanup = () => {
    window.clearInterval(timerRef.current);
    window.clearTimeout(stopAtRef.current);
    timerRef.current = undefined;
    stopAtRef.current = undefined;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const stop = () => {
    const recorder = recorderRef.current;
    window.clearInterval(timerRef.current);
    window.clearTimeout(stopAtRef.current);
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop(); // onstop flushes the last chunk, then cleanup() stops the tracks
    } else {
      cleanup();
    }
  };

  useEffect(() => () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSupported()) return null;

  const start = async () => {
    setError('');
    setState('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const mime = pickMime();
      const recorder = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: BITRATE });
      recorderRef.current = recorder;
      chunksRef.current = [];
      elapsedRef.current = 0;
      setElapsed(0);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || 'audio/webm' });
        chunksRef.current = [];
        recorderRef.current = null;
        cleanup();
        if (blob.size > 0) onRecordedRef.current(blob, Math.round(elapsedRef.current));
        setState('idle');
      };
      recorder.start(250);
      setState('recording');
      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 0.25;
        setElapsed(elapsedRef.current);
      }, 250);
      stopAtRef.current = window.setTimeout(() => stop(), MAX_SECONDS * 1000);
    } catch (reason) {
      cleanup();
      recorderRef.current = null;
      const name = reason instanceof DOMException ? reason.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Accès au microphone refusé. Autorisez-le dans les réglages du navigateur.'
        : 'Le micro est indisponible sur cet appareil.');
      setState('error');
    }
  };

  if (state === 'recording') {
    return (
      <div className="note-audio-recorder is-recording">
        <span className="note-audio-rec-dot" aria-hidden="true" />
        <span className="note-audio-rec-time">{formatAudioTime(elapsed)}</span>
        <button type="button" className="note-audio-rec-stop" onClick={stop}>
          <Square size={13} aria-hidden="true" /> Arrêter
        </button>
      </div>
    );
  }

  return (
    <div className="note-audio-recorder">
      <button
        type="button"
        className="card-note-memo-btn"
        onClick={() => void start()}
        disabled={disabled || state === 'requesting'}
      >
        <Mic size={15} aria-hidden="true" />
        {state === 'requesting' ? 'Demande du micro…' : 'Enregistrer un mémo vocal'}
      </button>
      {state === 'error' && <p className="notice error" role="alert">{error}</p>}
    </div>
  );
}
