import React, { useId, useState } from 'react';
import { Plus, PlusCircle, X } from 'lucide-react';
import { addCustomCard } from '../../lib/customCards';

interface CardAddControlProps {
  lectureId: string;
  label: string;
}

export const CardAddControl: React.FC<CardAddControlProps> = ({ lectureId, label }) => {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = useId();

  const close = () => {
    setOpen(false);
    setQuestion('');
    setAnswer('');
    setError('');
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
      await addCustomCard(lectureId, { q: question, a: answer });
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
        className="card-web-search-button card-add-trigger"
        aria-label={`Ajouter une carte · ${label}`}
        aria-expanded={open}
        title="Ajouter une carte (question / réponse)"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <PlusCircle size={17} aria-hidden="true" />
      </button>
      {open && <section className="card-note-editor card-add-editor" aria-label={`Nouvelle carte · ${label}`}>
        <div className="card-note-editor-heading">
          <div><p className="eyebrow">Nouvelle carte</p><strong>{label}</strong></div>
          <button className="icon-button" type="button" aria-label="Fermer l’ajout de carte" onClick={close}><X size={16} /></button>
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
          <p className="muted card-note-hint">La carte est enregistrée dans ce cours et rejoint vos révisions.</p>
          <div className="btn-row">
            <button className="btn btn-sm" type="submit" disabled={busy}><Plus size={15} /> Enregistrer</button>
          </div>
        </form>
      </section>}
    </div>
  );
};
