import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { formatAudioTime } from '../../lib/audioTime';
import type { PcmRecordingSession } from '../../lib/pcmCapture';

const MAX_SECONDS = 120;

function isSupported() {
  return typeof AudioContext !== 'undefined'
    && typeof navigator !== 'undefined'
    && Boolean(navigator.mediaDevices?.getUserMedia);
}

interface VoiceNoteRecorderProps {
  onRecorded: (blob: Blob, durationSec: number) => void;
  disabled?: boolean;
}

export function VoiceNoteRecorder({ onRecorded, disabled }: VoiceNoteRecorderProps) {
  const [state, setState] = useState<'idle' | 'requesting' | 'recording' | 'error'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const sessionRef = useRef<PcmRecordingSession | null>(null);
  const elapsedRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const stopAtRef = useRef<number | undefined>(undefined);
  const onRecordedRef = useRef(onRecorded);
  onRecordedRef.current = onRecorded;

  const clearTimers = () => {
    window.clearInterval(timerRef.current);
    window.clearTimeout(stopAtRef.current);
    timerRef.current = undefined;
    stopAtRef.current = undefined;
  };

  const stop = async () => {
    clearTimers();
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) {
      setState('idle');
      return;
    }
    try {
      const blob = await session.stop();
      if (blob.size > 0) onRecordedRef.current(blob, Math.round(elapsedRef.current));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Enregistrement impossible sur cet appareil.');
      setState('error');
      return;
    }
    setState('idle');
  };

  useEffect(() => () => {
    clearTimers();
    sessionRef.current?.cancel();
    sessionRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isSupported()) return null;

  const start = async () => {
    setError('');
    setState('requesting');
    try {
      // Lazy: pulls in the PCM capture module, lamejs and the encoder worker
      // only when the user actually taps Record.
      const { startPcmRecording } = await import('../../lib/pcmCapture');
      const session = await startPcmRecording({
        onFatal: (message) => {
          sessionRef.current = null;
          clearTimers();
          setError(message);
          setState('idle');
        },
      });
      sessionRef.current = session;
      elapsedRef.current = 0;
      setElapsed(0);
      setState('recording');
      timerRef.current = window.setInterval(() => {
        elapsedRef.current += 0.25;
        setElapsed(elapsedRef.current);
      }, 250);
      stopAtRef.current = window.setTimeout(() => void stop(), MAX_SECONDS * 1000);
    } catch (reason) {
      const name = reason instanceof DOMException ? reason.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Accès au microphone refusé. Autorisez-le dans les réglages du navigateur.'
        : reason instanceof Error ? reason.message : 'Le micro est indisponible sur cet appareil.');
      setState('error');
    }
  };

  if (state === 'recording') {
    return (
      <div className="note-audio-recorder is-recording">
        <span className="note-audio-rec-dot" aria-hidden="true" />
        <span className="note-audio-rec-time">{formatAudioTime(elapsed)}</span>
        <button type="button" className="note-audio-rec-stop" onClick={() => void stop()}>
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
