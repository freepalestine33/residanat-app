import { useState } from 'react';
import { db } from '../db/db';
import type { Lecture } from '../lib/schema';
import type { Note } from '../types/note';
import type { Memo } from '../lib/mnemonicApi';

const COURSE_COUNT = 500;
const CARDS_PER_COURSE = 40;
const QUIZ_PER_COURSE = 10;
const VF_PER_COURSE = 10;
const NOTE_COUNT = 5000;
const MEMO_COUNT = 1500;
const AUDIO_COUNT = 1000;
const VIDEO_COUNT = 500;

const SEED_PREFIX = 'seed';
const words = ['fièvre', 'infection', 'cardiaque', 'pulmonaire', 'rénale', 'hépatique', 'traumatique', 'aiguë', 'chronique', 'bactérienne', 'virale', 'inflammatoire', 'dégénérative', 'congénitale', 'terrain', 'complication', 'diagnostic', 'traitement', 'pronostic', 'évolution'];
const pick = <T,>(arr: T[], i: number) => arr[i % arr.length];
const phrase = (seed: number, len: number) => Array.from({ length: len }, (_, i) => pick(words, seed * 7 + i * 3)).join(' ');

function makeLecture(index: number): Lecture {
  const n = String(index).padStart(4, '0');
  const id = `seedc${n}`;
  const cards = Array.from({ length: CARDS_PER_COURSE }, (_, i) => ({
    id: `c${i + 1}`,
    type: (i % 5 === 4 ? 'contrast' : 'basic') as 'basic' | 'contrast',
    q: `Question ${i + 1} du cours ${n} : ${phrase(index + i, 6)} ?`,
    a: `Réponse détaillée ${i + 1} : ${phrase(index * 3 + i, 10)}.`,
    freq: (i % 4) + 1,
  }));
  const quiz = Array.from({ length: QUIZ_PER_COURSE }, (_, i) => ({
    id: `q${i + 1}`,
    q: `QCM ${i + 1} — ${phrase(index + i * 2, 7)} ?`,
    cards: [`c${(i % CARDS_PER_COURSE) + 1}`],
    explain: `Explication ${i + 1} : ${phrase(index + i, 8)}.`,
    opts: [
      { t: `Option A correcte ${i}`, ok: true },
      { t: `Option B fausse ${i}`, ok: false },
      { t: `Option C fausse ${i}`, ok: false },
    ],
  }));
  const vf = Array.from({ length: VF_PER_COURSE }, (_, i) => ({
    id: `v${i + 1}`,
    s: `Affirmation ${i + 1} : ${phrase(index + i * 5, 6)} est toujours vraie.`,
    a: i % 3 !== 0,
    w: `Détail ${i + 1} : ${phrase(index + i, 7)}.`,
    cards: [`c${(i % CARDS_PER_COURSE) + 1}`],
  }));
  return {
    schema: 1,
    id,
    progId: null,
    name: `Cours de test ${n} — ${pick(words, index)} ${pick(words, index + 11)}`,
    keys: [`Point clé ${index}a`, `Point clé ${index}b`],
    contrasts: [`Contraste ${index}`],
    cards,
    quiz,
    vf,
  };
}

function makeMemo(index: number): Memo {
  return {
    title: `Mémo test ${index}`,
    subtitle: 'Donnée synthétique pour les tests de performance',
    steps: Array.from({ length: 5 }, (_, i) => ({
      icon: 'star',
      heading: `Étape ${i + 1}`,
      caption: phrase(index + i, 8),
    })),
    legend: [
      { term: 'Terme A', meaning: phrase(index, 5) },
      { term: 'Terme B', meaning: phrase(index + 1, 5) },
    ],
  };
}

/** ~180 KB WAV (8-bit PCM, 3 kHz, 60 s) — same order of magnitude as a voice memo. */
function makeAudioBlob(): Blob {
  const sampleRate = 3000;
  const seconds = 60;
  const dataSize = sampleRate * seconds;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  writeStr(36, 'data'); view.setUint32(40, dataSize, true);
  for (let i = 0; i < dataSize; i++) view.setUint8(44 + i, 128 + ((i * 37) % 40) - 20);
  return new Blob([buffer], { type: 'audio/wav' });
}

async function makeImageBlob(): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 800; canvas.height = 600;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible.');
  ctx.fillStyle = '#f4ede0'; ctx.fillRect(0, 0, 800, 600);
  ctx.fillStyle = '#33415c';
  for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % 760, (i * 61) % 560, 30 + (i % 5) * 8, 18 + (i % 4) * 6);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error('Export image impossible.');
  return blob;
}

const YT_IDS = ['dQw4w9WgXcQ', '9bZkp7q19f0', 'kJQP7kiw5Fk', '60ItHLz5WEA', 'RgKAFK5djSk'];

function makeNote(index: number, audioBlob: Blob | null, imageBlob: Blob | null): Note {
  const hasMemo = index < MEMO_COUNT;
  const hasAudio = index >= MEMO_COUNT && index < MEMO_COUNT + AUDIO_COUNT;
  const hasVideo = index >= MEMO_COUNT + AUDIO_COUNT && index < MEMO_COUNT + AUDIO_COUNT + VIDEO_COUNT;
  const hasImage = index % 20 === 0;
  const lectureId = `seedc${String((index % 120) + 1).padStart(4, '0')}`;
  const rel = index % 4 === 0 ? 'libre' : `card:${lectureId}.c${(index % CARDS_PER_COURSE) + 1}`;
  return {
    syncId: `${SEED_PREFIX}-note-${index}`,
    rel,
    text: `Note de test ${index} — ${phrase(index, 12)}.`,
    link: index % 7 === 0 ? 'https://example.com/ressource' : undefined,
    image: hasImage ? imageBlob ?? undefined : undefined,
    imageBytes: hasImage ? imageBlob?.size : undefined,
    audio: hasAudio ? audioBlob ?? undefined : undefined,
    audioPath: hasAudio ? `${SEED_PREFIX}/audio-${index}.wav` : undefined,
    audioDuration: hasAudio ? 60 : undefined,
    audioBytes: hasAudio ? audioBlob?.size : undefined,
    videos: hasVideo ? Array.from({ length: (index % 3) + 1 }, (_, v) => ({
      id: YT_IDS[(index + v) % YT_IDS.length],
      start: v === 1 ? 90 : undefined,
      label: `Vidéo ${v + 1} — ${pick(words, index + v)}`,
    })) : undefined,
    memo: hasMemo ? makeMemo(index) : undefined,
    updated: Date.now() - index * 1000,
  };
}

async function deleteSeeded() {
  await db.userLectures.where('id').startsWith(SEED_PREFIX).delete();
  const seededNotes = await db.notes.filter((note) => (note.syncId ?? '').startsWith(`${SEED_PREFIX}-`) || note.rel.includes('seedc')).toArray();
  await db.notes.bulkDelete(seededNotes.map((note) => note.id!).filter((id) => id !== undefined));
}

export function SeedPage() {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const seed = async () => {
    setBusy(true);
    try {
      await deleteSeeded();
      setStatus('Génération des 500 cours…');
      const lectures = Array.from({ length: COURSE_COUNT }, (_, i) => ({
        id: `${SEED_PREFIX}-lect-${String(i + 1).padStart(4, '0')}`,
        name: `Cours de test ${String(i + 1).padStart(4, '0')}`,
        content: makeLecture(i + 1),
        updatedAt: Date.now(),
      }));
      await db.userLectures.bulkPut(lectures);

      setStatus('Génération des médias synthétiques…');
      const audioBlob = makeAudioBlob();
      const imageBlob = await makeImageBlob();

      setStatus('Génération des 5 000 notes…');
      const notes: Note[] = [];
      for (let i = 0; i < NOTE_COUNT; i++) {
        notes.push(makeNote(i, audioBlob, imageBlob));
        if (i % 500 === 499) setStatus(`Notes : ${i + 1} / ${NOTE_COUNT}`);
      }
      await db.notes.bulkPut(notes);
      setStatus(`Terminé : ${COURSE_COUNT} cours, ${NOTE_COUNT} notes (${MEMO_COUNT} mémos, ${AUDIO_COUNT} audios, ${VIDEO_COUNT} vidéos).`);
    } catch (reason) {
      setStatus(`Erreur : ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await deleteSeeded();
      setStatus('Données de test supprimées.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="wrap">
      <section className="panel">
        <h1>Seed de test (dev uniquement)</h1>
        <p className="muted">
          Génère {COURSE_COUNT} cours, {NOTE_COUNT} notes ({MEMO_COUNT} avec mémo visuel, {AUDIO_COUNT} avec mémo vocal ~180 Ko, {VIDEO_COUNT} avec liens YouTube).
          Les données sont locales (Dexie), préfixées « seed », et ne sont pas envoyées à la synchro.
        </p>
        <div className="btn-row">
          <button type="button" className="btn" disabled={busy} onClick={() => void seed()}>{busy ? 'Travail…' : 'Générer les données de test'}</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => void clear()}>Supprimer les données de test</button>
        </div>
        {status && <p className="notice" role="status">{status}</p>}
      </section>
    </main>
  );
}
