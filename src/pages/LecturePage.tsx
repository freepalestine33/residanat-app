import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { loadLecture } from '../lib/content';
import { LectureNotFoundError } from '../lib/content';
import { isCorrectSelection } from '../lib/answers';
import { saveQuizResult } from '../lib/quizHistory';
import { Rating, review } from '../lib/srs';
import type { Lecture } from '../lib/schema';
import { useCardStore, useProgressStore } from '../stores';

type Section = 'overview' | 'cards' | 'quiz' | 'vf';
const sections: Array<{ id: Section; label: string }> = [
  { id: 'overview', label: 'Résumé' },
  { id: 'cards', label: 'Cartes' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'vf', label: 'Vrai / faux' },
];

export default function LecturePage() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [quizResults, setQuizResults] = useState<Record<string, boolean>>({});
  const [vfAnswers, setVfAnswers] = useState<Record<string, boolean>>({});
  const [vfResults, setVfResults] = useState<Record<string, boolean>>({});
  const [resultError, setResultError] = useState('');
  const { refreshDueCount } = useCardStore();
  const { loadStats } = useProgressStore();

  useEffect(() => {
    let active = true;
    setLecture(null);
    setError('');
    setNotFound(false);
    loadLecture(id)
      .then((data) => { if (active) setLecture(data); })
      .catch((reason: unknown) => {
        if (!active) return;
        setNotFound(reason instanceof LectureNotFoundError);
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    const requested = searchParams.get('tab');
    setSection(sections.some((item) => item.id === requested) ? requested as Section : 'overview');
  }, [id, searchParams]);

  const rateCard = async (cardId: string, rating: Exclude<Rating, Rating.Manual>) => {
    if (!lecture) return;
    try {
      await review(`${lecture.id}.${cardId}`, rating);
      setReviewed((state) => ({ ...state, [cardId]: true }));
      await Promise.all([refreshDueCount(), loadStats()]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const verifyQuiz = async (questionId: string, correct: boolean, selected: string[]) => {
    if (!lecture) return;
    try {
      await saveQuizResult(lecture.id, questionId, 'quiz', correct, selected);
      setQuizResults((state) => ({ ...state, [questionId]: correct }));
      setResultError('');
    } catch (reason) {
      setResultError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const verifyVf = async (questionId: string, answer: boolean, correctAnswer: boolean) => {
    if (!lecture) return;
    try {
      const correct = answer === correctAnswer;
      await saveQuizResult(lecture.id, questionId, 'vf', correct, [String(answer)]);
      setVfResults((state) => ({ ...state, [questionId]: correct }));
      setResultError('');
    } catch (reason) {
      setResultError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  if (error && !lecture) {
    return <><Header /><TabBar tabs={coreTabs} /><main className="wrap"><section className="panel"><p className="eyebrow">{notFound ? 'Cours introuvable' : 'Erreur de chargement'}</p><h2>{notFound ? 'Ce cours n’est pas disponible.' : 'Le cours ne peut pas être chargé.'}</h2><p className="muted">{notFound ? 'Vérifiez le lien ou choisissez un cours dans la liste.' : 'Réessayez plus tard, ou revenez à la liste des cours.'}</p>{!notFound && <p className="muted">{error}</p>}<Link className="btn ghost" to="/lectures">Retour aux cours</Link></section></main></>;
  }
  if (!lecture) {
    return <><Header /><TabBar tabs={coreTabs} /><main className="wrap"><p className="muted" role="status">Chargement du cours…</p></main></>;
  }

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap">
        {resultError && <p className="notice error" role="alert">Impossible d’enregistrer le résultat localement : {resultError}</p>}
        <p><Link className="text-link" to="/lectures">← Tous les cours</Link></p>
        <section className="panel">
          <p className="eyebrow">Cours interactif · {lecture.id}</p>
          <h2>{lecture.name}</h2>
          <p className="muted">{lecture.cards.length} cartes · {lecture.quiz.length} quiz · {lecture.vf.length} vrai/faux</p>
          {lecture.pdfUrl && <p style={{ marginTop: '0.5rem' }}><a className="text-link" href={lecture.pdfUrl} target="_blank" rel="noreferrer">Ouvrir le support PDF ↗</a></p>}
        </section>

        <div className="section-tabs" role="tablist" aria-label="Contenu du cours">
          {sections.map((item) => (
            <button key={item.id} type="button" role="tab" aria-selected={section === item.id} className={section === item.id ? 'section-tab active' : 'section-tab'} onClick={() => setSection(item.id)}>
              {item.label}{item.id === 'cards' ? ` (${lecture.cards.length})` : item.id === 'quiz' ? ` (${lecture.quiz.length})` : item.id === 'vf' ? ` (${lecture.vf.length})` : ''}
            </button>
          ))}
        </div>

        {section === 'overview' && (
          <div className="panel">
            <h2>Points clés</h2>
            {lecture.keys.length ? <ol className="content-list">{lecture.keys.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol> : <p className="muted">Aucun point clé disponible.</p>}
            <Link className="btn ghost btn-sm" to={`/notes?rel=keys:${lecture.id}`}>Ajouter une note aux points clés</Link>
            <h2 style={{ marginTop: '1.2rem' }}>Contrastes à retenir</h2>
            {lecture.contrasts.length ? <ul className="content-list">{lecture.contrasts.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="muted">Aucun contraste disponible.</p>}
          </div>
        )}

        {section === 'cards' && (
          <section aria-label="Flashcards du cours">
            <p className="muted section-intro">Révélez la réponse, puis choisissez une difficulté pour la planifier avec FSRS.</p>
            {lecture.cards.length === 0 && <p className="panel muted">Aucune carte dans ce cours.</p>}
            {lecture.cards.map((card) => (
              <article key={card.id} className="card">
                <p className="pill">{card.type === 'contrast' ? 'Contraste' : 'Carte'}{card.freq ? ` · ${card.freq} examens` : ''}</p>
                <h3 className="question-text">{card.q}</h3>
                <Link className="text-link note-context-link" to={`/notes?rel=card:${lecture.id}.${card.id}`}>Ajouter / voir une note</Link>
                {card.src && <p className="muted">Source : {card.src}</p>}
                {!revealed[card.id] ? (
                  <button className="btn ghost" type="button" onClick={() => setRevealed((state) => ({ ...state, [card.id]: true }))}>Afficher la réponse</button>
                ) : (
                  <div className="answer-block">
                    <p>{card.a}</p>
                    {reviewed[card.id] ? <p className="notice success" role="status">Réponse planifiée dans vos révisions.</p> : (
                      <div className="rating-row" aria-label="Évaluer cette carte">
                        {([
                          ['Encore', Rating.Again],
                          ['Difficile', Rating.Hard],
                          ['Bien', Rating.Good],
                          ['Facile', Rating.Easy],
                        ] as const).map(([label, rating]) => <button key={label} type="button" className={`btn rating-${label.toLowerCase()}`} onClick={() => void rateCard(card.id, rating)}>{label}</button>)}
                      </div>
                    )}
                  </div>
                )}
              </article>
            ))}
          </section>
        )}

        {section === 'quiz' && (
          <section aria-label="Quiz du cours">
            <p className="muted section-intro">Sélectionnez toutes les propositions correctes, puis vérifiez votre réponse.</p>
            {lecture.quiz.length === 0 && <p className="panel muted">Aucun quiz disponible.</p>}
            {lecture.quiz.map((question, index) => {
              const selected = selections[question.id] ?? [];
              const result = quizResults[question.id];
              return (
                <article key={question.id} className="card quiz-question">
                  <p className="eyebrow">Question {index + 1} / {lecture.quiz.length}</p>
                  <h3 className="question-text">{question.q}</h3>
                  <Link className="text-link note-context-link" to={`/notes?rel=quiz:${lecture.id}.${question.id}`}>Ajouter / voir une note</Link>
                  {question.src && <p className="muted">Source : {question.src}</p>}
                  <fieldset className="option-list" disabled={result !== undefined}>
                    <legend className="sr-only">Choix de réponse</legend>
                    {question.opts.map((option, optionIndex) => {
                      const optionId = `${lecture.id}-${question.id}-${optionIndex}`;
                      return <label className="option-row" key={optionIndex}>
                        <input type="checkbox" id={optionId} checked={selected.includes(String(optionIndex))} onChange={(event) => setSelections((state) => ({ ...state, [question.id]: event.target.checked ? [...selected, String(optionIndex)] : selected.filter((item) => item !== String(optionIndex)) }))} />
                        <span>{option.t}</span>
                        {result !== undefined && option.ok && <strong className="correct-mark">✓</strong>}
                      </label>;
                    })}
                  </fieldset>
                  {result === undefined ? (
                    <button className="btn" type="button" disabled={!selected.length} onClick={() => void verifyQuiz(question.id, isCorrectSelection(question.opts.flatMap((option, optionIndex) => option.ok ? [String(optionIndex)] : []), selected), selected)}>Vérifier</button>
                  ) : (
                    <p className={result ? 'notice success' : 'notice error'} role="status">{result ? 'Bonne réponse.' : 'Réponse incorrecte.'} {question.explain}</p>
                  )}
                  {question.cards.length > 0 && <p className="muted linked-cards">Cartes liées : {question.cards.join(', ')}</p>}
                </article>
              );
            })}
          </section>
        )}

        {section === 'vf' && (
          <section aria-label="Vrai ou faux">
            <p className="muted section-intro">Évaluez chaque affirmation. La correction apparaît après validation.</p>
            {lecture.vf.length === 0 && <p className="panel muted">Aucune affirmation disponible.</p>}
            {lecture.vf.map((question, index) => {
              const answer = vfAnswers[question.id];
              const result = vfResults[question.id];
              return (
                <article key={question.id} className="card">
                  <p className="eyebrow">Affirmation {index + 1} / {lecture.vf.length}</p>
                  <h3 className="question-text">{question.s}</h3>
                  <Link className="text-link note-context-link" to={`/notes?rel=vf:${lecture.id}.${question.id}`}>Ajouter / voir une note</Link>
                  {result === undefined ? (
                    <>
                      <div className="rating-row">
                        {[true, false].map((value) => <button key={String(value)} className={answer === value ? 'btn selected-answer' : 'btn ghost'} type="button" aria-pressed={answer === value} onClick={() => setVfAnswers((state) => ({ ...state, [question.id]: value }))}>{value ? 'Vrai' : 'Faux'}</button>)}
                      </div>
                      <button className="btn" type="button" disabled={answer === undefined} onClick={() => void verifyVf(question.id, answer, question.a)}>Vérifier</button>
                    </>
                  ) : (
                    <p className={result ? 'notice success' : 'notice error'} role="status">
                      {result ? 'Exact.' : `Incorrect : la réponse est ${question.a ? 'vrai' : 'faux'}.`} {question.w}
                    </p>
                  )}
                  {question.cards.length > 0 && <p className="muted linked-cards">Cartes liées : {question.cards.join(', ')}</p>}
                </article>
              );
            })}
          </section>
        )}
        {error && <p className="notice error" role="alert">{error}</p>}
      </main>
    </>
  );
}
