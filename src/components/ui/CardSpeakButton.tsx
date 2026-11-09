import React, { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface CardSpeakButtonProps {
  question?: string;
  answer?: string;
  text?: string;
  label?: string;
}

function selectFrenchVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const frenchVoices = voices.filter((voice) => /^fr(?:-|$)/i.test(voice.lang));
  return frenchVoices.find((voice) => /google/i.test(voice.name))
    ?? frenchVoices.find((voice) => /^fr-FR$/i.test(voice.lang))
    ?? frenchVoices[0];
}

export const CardSpeakButton: React.FC<CardSpeakButtonProps> = ({ question, answer, text, label = 'la carte' }) => {
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const content = (text ?? [question, answer].filter(Boolean).join('. ')).trim();

  useEffect(() => () => {
    if (utteranceRef.current && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const toggleSpeech = () => {
    if (!supported || !content) return;
    const speech = window.speechSynthesis;
    if (speaking) {
      speech.cancel();
      utteranceRef.current = null;
      setSpeaking(false);
      return;
    }

    speech.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    const voice = selectFrenchVoice(speech.getVoices());
    utterance.lang = voice?.lang ?? 'fr-FR';
    if (voice) utterance.voice = voice;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => {
      utteranceRef.current = null;
      setSpeaking(false);
    };
    utterance.onerror = () => {
      utteranceRef.current = null;
      setSpeaking(false);
    };
    utteranceRef.current = utterance;
    speech.speak(utterance);
  };

  return (
    <button
      type="button"
      className={`card-speak-button${speaking ? ' is-speaking' : ''}`}
      aria-label={speaking ? `Arrêter la lecture de ${label}` : `Écouter ${label}`}
      aria-pressed={speaking}
      title={supported ? (speaking ? 'Arrêter la lecture' : `Écouter ${label}`) : 'Synthèse vocale indisponible dans ce navigateur'}
      disabled={!supported || !content}
      onClick={toggleSpeech}
    >
      {speaking ? <VolumeX size={17} aria-hidden="true" /> : <Volume2 size={17} aria-hidden="true" />}
    </button>
  );
};
