import React, { useId, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { updateLectureCard } from '../../lib/customCards';
import type { Card } from '../../types/card';

interface CardEditControlProps {
  lectureId: string;
  card: Card;
  label: string;
}

/** Pen button for editing a learner-created or built-in lecture card. */
export const CardEditControl: React.FC<CardEditControlProps> = ({ lectureId, card, label }) => {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState(card.q);
  const [answer, setAnswer] = useState(card.a);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = useId();

  const close = () => {
    setOpen(false);
    setError('');
  };

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setQuestion(card.q);
    setAnswer(card.a);
    setError('');
    setOpen(true);
  };

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    if (!question.trim() || !answer.trim()) {
      setError('Renseignez la question et la réponse.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateLectureCard(lectureId, card, { q: question, a: answer });
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card-note-widget">
      <button
        type="button"
        className="card-web-search-button"
        aria-label={`Modifier la carte · ${label}`}
        aria-expanded={open}
        title="Modifier cette carte"
        onClick={toggle}
      >
        <Pencil size={16} aria-hidden="true" />
      </button>
      {open && <section className="card-note-editor card-add-editor" aria-label={`Modifier la carte · ${label}`}>
        <div className="card-note-editor-heading">
          <div><p className="eyebrow">Modifier la carte</p><strong>{label}</strong></div>
          <button className="icon-button" type="button" aria-label="Fermer la modification de carte" onClick={close}><X size={16} /></button>
        </div>
        <form className="card-note-form" onSubmit={(event) => void save(event)}>
          <label>
            <span className="field-label">Question</span>
            <textarea id={`${ids}-question`} value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} placeholder="Énoncé de la question…" autoFocus />
          </label>
          <label>
            <span className="field-label">Réponse</span>
            <textarea id={`${ids}-answer`} value={answer} onChange={(event) => setAnswer(event.target.value)} rows={3} placeholder="Réponse attendue…" />
          </label>
          {error && <p className="notice error" role="alert">{error}</p>}
          <p className="muted card-note-hint">La version modifiée est enregistrée sur cet appareil sans changer le cours d’origine.</p>
          <div className="btn-row">
            <button className="btn btn-sm" type="submit" disabled={busy}><Check size={15} /> Enregistrer</button>
          </div>
        </form>
      </section>}
    </div>
  );
};
