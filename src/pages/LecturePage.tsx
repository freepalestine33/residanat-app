import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpenText, CheckCircle2, Layers3, ListChecks } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { loadLectureById, loadLecturePdf } from '../data/lectures';
import { LectureNotFoundError } from '../lib/content';
import { isCorrectSelection } from '../lib/answers';
import { loadLectureAnswers, saveQuizResult } from '../lib/quizHistory';
import { summarizeQuiz } from '../lib/quizSummary';
import { Rating, review } from '../lib/srs';
import { CardWebSearchButton } from '../components/ui/CardWebSearchButton';
import { CardNoteControl } from '../components/ui/CardNoteControl';
import { CardSpeakButton } from '../components/ui/CardSpeakButton';
import { CardAddControl } from '../components/ui/CardAddControl';
import { CardEditControl } from '../components/ui/CardEditControl';
import { CARDS_UPDATED_EVENT } from '../lib/customCards';
import { readLecturePosition, readLectureSection, saveLecturePosition, saveLectureSection } from '../lib/lectureProgress';
import type { Lecture } from '../lib/schema';
import { useCardStore } from '../stores/cardStore';
import { useProgressStore } from '../stores/progressStore';

function persistLecturePosition(lectureId: string, index: number) {
  void saveLecturePosition(lectureId, index).catch((reason: unknown) => console.error('Could not save the card position.', reason));
}

function persistLectureSection(lectureId: string, section: Section) {
  void saveLectureSection(lectureId, section).catch((reason: unknown) => console.error('Could not save the lecture section.', reason));
}

type Section = 'overview' | 'cards' | 'quiz' | 'vf';
const sections: Array<{ id: Section; label: string; icon: typeof BookOpenText; count?: (lecture: Lecture) => number }> = [
  { id: 'overview', label: 'Résumé', icon: BookOpenText },
  { id: 'cards', label: 'Cartes', icon: Layers3, count: (lecture) => lecture.cards.length },
  { id: 'quiz', label: 'Quiz', icon: ListChecks, count: (lecture) => lecture.quiz.length },
  { id: 'vf', label: 'Vrai / faux', icon: CheckCircle2, count: (lecture) => lecture.vf.length },
];

export default function LecturePage() {
  const { id = '' } = useParams();
  const [searchParams] = useSearchParams();
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [uploadedPdf, setUploadedPdf] = useState<{ url: string; name?: string } | null>(null);
  const [pdfError, setPdfError] = useState('');
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [quizResults, setQuizResults] = useState<Record<string, boolean>>({});
  const [quizSummaryOpen, setQuizSummaryOpen] = useState(false);
  const [vfAnswers, setVfAnswers] = useState<Record<string, boolean>>({});
  const [vfResults, setVfResults] = useState<Record<string, boolean>>({});
  const [resultError, setResultError] = useState('');
  const userNavigatedRef = useRef(false);
  const userSectionRef = useRef(false);
  const { refreshDueCount } = useCardStore();
  const { loadStats } = useProgressStore();

  useEffect(() => {
    let active = true;
    setLecture(null);
    setUploadedPdf(null);
    setPdfError('');
    setError('');
    setNotFound(false);
    setActiveCardIndex(0);
    userNavigatedRef.current = false;
    userSectionRef.current = false;
    setRevealed({});
    setReviewed({});
    setSelections({});
    setQuizResults({});
    setQuizSummaryOpen(false);
    setVfAnswers({});
    setVfResults({});
    loadLectureById(id)
      .then((data) => { if (active) setLecture(data); })
      .catch((reason: unknown) => {
        if (!active) return;
        setNotFound(reason instanceof LectureNotFoundError);
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    // Restore the quiz and vrai/faux answers already validated for this lecture.
    loadLectureAnswers(id)
      .then((saved) => {
        if (!active) return;
        setSelections(saved.selections);
        setQuizResults(saved.quizResults);
        setVfAnswers(saved.vfAnswers);
        setVfResults(saved.vfResults);
      })
      .catch((reason: unknown) => {
        if (active) console.error('Could not restore the saved quiz answers.', reason);
      });
    let pdfUrl: string | undefined;
    loadLecturePdf(id)
      .then((pdf) => {
        if (!active || !pdf) return;
        pdfUrl = URL.createObjectURL(pdf.blob);
        setUploadedPdf({ url: pdfUrl, name: pdf.name });
      })
      .catch((reason: unknown) => {
        if (active) setPdfError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [id]);

  useEffect(() => {
    const onCardsUpdated = () => {
      void loadLectureById(id)
        .then((data) => setLecture(data))
        .catch(() => undefined);
    };
    window.addEventListener(CARDS_UPDATED_EVENT, onCardsUpdated);
    return () => window.removeEventListener(CARDS_UPDATED_EVENT, onCardsUpdated);
  }, [id]);

  // Resume the lecture at the card reached last time (locally, or synced from another device).
  useEffect(() => {
    if (!lecture || userNavigatedRef.current) return;
    const saved = readLecturePosition(lecture.id);
    if (saved === null) return;
    setActiveCardIndex(Math.max(0, Math.min(saved, lecture.cards.length - 1)));
  }, [lecture]);

  useEffect(() => {
    if (!lecture) return;
    const onProgressUpdated = () => {
      if (!userNavigatedRef.current) {
        const savedIndex = readLecturePosition(lecture.id);
        if (savedIndex !== null) setActiveCardIndex(Math.max(0, Math.min(savedIndex, lecture.cards.length - 1)));
      }
      if (!userSectionRef.current) {
        const savedSection = readLectureSection(lecture.id);
        if (savedSection) setSection(savedSection);
      }
    };
    window.addEventListener('residanat:lecture-progress-updated', onProgressUpdated);
    return () => window.removeEventListener('residanat:lecture-progress-updated', onProgressUpdated);
  }, [lecture]);

  useEffect(() => {
    const requested = searchParams.get('tab');
    if (sections.some((item) => item.id === requested)) {
      userSectionRef.current = true;
      setSection(requested as Section);
      return;
    }
    setSection(readLectureSection(id) ?? 'overview');
  }, [id, searchParams]);

  const focusId = searchParams.get('focus');

  useEffect(() => {
    if (!lecture || !focusId) return;
    if (section === 'cards') {
      const index = lecture.cards.findIndex((card) => card.id === focusId);
      if (index >= 0) {
        userNavigatedRef.current = true;
        setActiveCardIndex(index);
        persistLecturePosition(lecture.id, index);
      }
      return;
    }
    const target = document.getElementById(`focus-${focusId}`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('focus-highlight');
    const timer = window.setTimeout(() => target.classList.remove('focus-highlight'), 2200);
    return () => window.clearTimeout(timer);
  }, [lecture, focusId, section]);

  const goToCard = (index: number) => {
    if (!lecture) return;
    userNavigatedRef.current = true;
    const clamped = Math.max(0, Math.min(index, lecture.cards.length - 1));
    setActiveCardIndex(clamped);
    persistLecturePosition(lecture.id, clamped);
  };

  const selectSection = (next: Section) => {
    userSectionRef.current = true;
    setSection(next);
    persistLectureSection(id, next);
  };

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

  const overviewSpeech = [
    lecture.name,
    lecture.keys.length ? `Points clés. ${lecture.keys.join('. ')}` : '',
    lecture.contrasts.length ? `Contrastes à retenir. ${lecture.contrasts.join('. ')}` : '',
  ].filter(Boolean).join('. ');
  const quizSummary = summarizeQuiz(lecture.quiz.map((question) => question.id), quizResults);

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap">
        {resultError && <p className="notice error" role="alert">Impossible d’enregistrer le résultat localement : {resultError}</p>}
        <nav className="lecture-topbar" aria-label="Retour à la liste des cours">
          <Link className="back-link" to="/lectures">
            <span className="back-link-icon"><ArrowLeft size={16} strokeWidth={2.4} aria-hidden="true" /></span>
            <span className="back-link-label">Tous les cours</span>
          </Link>
        </nav>
        <section className="panel">
          <p className="eyebrow">Cours interactif · {lecture.id}</p>
          <h2>{lecture.name}</h2>
          <p className="muted">{lecture.cards.length} cartes · {lecture.quiz.length} quiz · {lecture.vf.length} vrai/faux</p>
          {uploadedPdf && <>
            <p style={{ marginTop: '0.5rem' }}><a className="text-link" href={uploadedPdf.url} target="_blank" rel="noreferrer">Ouvrir le PDF source{uploadedPdf.name ? ` (${uploadedPdf.name})` : ''} ↗</a></p>
            <p className="muted" style={{ fontSize: '0.8rem' }}>Le PDF importé est conservé sur cet appareil et n’est pas inclus dans la synchronisation du cours.</p>
          </>}
          {lecture.pdfUrl && <p style={{ marginTop: '0.5rem' }}><a className="text-link" href={`${import.meta.env.BASE_URL}data/${lecture.pdfUrl}`} target="_blank" rel="noreferrer">Ouvrir le support PDF ↗</a></p>}
          {pdfError && <p className="notice error" role="alert">Impossible d’ouvrir le PDF importé : {pdfError}</p>}
        </section>

        <div className="section-tabs" role="tablist" aria-label="Contenu du cours">
          {sections.map(({ icon: Icon, ...item }) => (
            <button key={item.id} type="button" role="tab" aria-selected={section === item.id} className={section === item.id ? 'section-tab active' : 'section-tab'} onClick={() => selectSection(item.id)}>
              <Icon className="section-tab-icon" size={17} strokeWidth={1.9} aria-hidden="true" />
              <span className="section-tab-label">{item.label}</span>
              {item.count && <span className="section-tab-count">{item.count(lecture)}</span>}
            </button>
          ))}
        </div>

        {section === 'overview' && (
          <div className="panel">
            <div className="overview-heading-row">
              <h2>Points clés</h2>
              <CardSpeakButton text={overviewSpeech} label="le résumé du cours" />
            </div>
            {lecture.keys.length ? <ol className="content-list">{lecture.keys.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol> : <p className="muted">Aucun point clé disponible.</p>}
            <CardNoteControl relation={`keys:${lecture.id}`} label="Points clés du cours" />
            <h2 style={{ marginTop: '1.2rem' }}>Contrastes à retenir</h2>
            {lecture.contrasts.length ? <ul className="content-list">{lecture.contrasts.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="muted">Aucun contraste disponible.</p>}
          </div>
        )}

        {section === 'cards' && (
          <section aria-label="Flashcards du cours">
            <p className="muted section-intro">Révélez la réponse, puis choisissez une difficulté pour la planifier avec FSRS.</p>
            {lecture.cards.length === 0 && <>
              <p className="panel muted">Aucune carte dans ce cours. Ajoutez votre première carte avec le bouton de création.</p>
              <CardAddControl lectureId={lecture.id} label={lecture.name} />
            </>}
            {lecture.cards.length > 0 && <div className="cards-study-main">
                {(() => {
                  const card = lecture.cards[activeCardIndex];
                  return <article key={card.id} className="card lecture-flashcard">
                    <div className="lecture-flashcard-topline">
                      <div className="lecture-flashcard-meta">
                        <p className="pill">{card.type === 'contrast' ? 'Contraste' : 'Carte'}{card.freq ? ' - ' + card.freq + ' examens' : ''}</p>
                        <span className="lecture-card-progress" role="progressbar" aria-label="Progression des cartes" aria-valuemin={0} aria-valuemax={lecture.cards.length} aria-valuenow={activeCardIndex + 1}>
                          <span className="lecture-card-progress-count">{activeCardIndex + 1}/{lecture.cards.length}</span>
                          <span className="lecture-card-progress-track">
                            <span style={{ width: ((activeCardIndex + 1) / lecture.cards.length) * 100 + '%' }} />
                          </span>
                        </span>
                      </div>
                      <div className="card-quick-actions">
                        <CardWebSearchButton lectureName={lecture.name} question={card.q} answer={card.a} />
                        <CardNoteControl relation={'card:' + lecture.id + '.' + card.id} label={'Carte ' + card.id} />
                        <CardSpeakButton question={card.q} answer={card.a} />
                        <CardEditControl lectureId={lecture.id} card={card} label={lecture.name} />
                        <CardAddControl lectureId={lecture.id} label={lecture.name} />
                      </div>
                    </div>
                    <h3 className="question-text">{card.q}</h3>
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
                            ] as const).map(([label, rating]) => <button key={label} type="button" className={'btn rating-' + label.toLowerCase()} onClick={() => void rateCard(card.id, rating)}>{label}</button>)}
                          </div>
                        )}
                      </div>
                    )}
                    <nav className="cards-study-navigation" aria-label="Navigation des cartes">
                      <button className="btn ghost" type="button" disabled={activeCardIndex === 0} onClick={() => goToCard(activeCardIndex - 1)}><ArrowLeft size={16} aria-hidden="true" /> Précédente</button>
                      <span>Carte {activeCardIndex + 1} sur {lecture.cards.length}</span>
                      <button className="btn" type="button" disabled={activeCardIndex === lecture.cards.length - 1} onClick={() => goToCard(activeCardIndex + 1)}>Suivante <ArrowRight size={16} aria-hidden="true" /></button>
                    </nav>
                  </article>;
                })()}
            </div>}
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
                <article key={question.id} id={`focus-${question.id}`} className="card quiz-question">
                  <p className="eyebrow">Question {index + 1} / {lecture.quiz.length}</p>
                  <h3 className="question-text">{question.q}</h3>
                  <CardNoteControl relation={`quiz:${lecture.id}.${question.id}`} label={`Question ${index + 1}`} />
                  {question.src && <p className="muted">Source : {question.src}</p>}
                  <fieldset className="option-list" disabled={result !== undefined}>
                    <legend className="sr-only">Choix de réponse</legend>
                    {question.opts.map((option, optionIndex) => {
                      const optionId = `${lecture.id}-${question.id}-${optionIndex}`;
                      const isSelected = selected.includes(String(optionIndex));
                      const optionClass = result !== undefined && option.ok ? 'option-correct' : result !== undefined && isSelected && !option.ok ? 'option-incorrect' : '';
                      return <label className={`option-row ${optionClass}`} key={optionIndex}>
                        <input type="checkbox" id={optionId} checked={selected.includes(String(optionIndex))} onChange={(event) => setSelections((state) => ({ ...state, [question.id]: event.target.checked ? [...selected, String(optionIndex)] : selected.filter((item) => item !== String(optionIndex)) }))} />
                        <span>{option.t}</span>
                        {result !== undefined && option.ok && <strong className="correct-mark" aria-label="Bonne réponse">✓</strong>}
                        {result !== undefined && isSelected && !option.ok && <strong className="incorrect-mark" aria-label="Réponse incorrecte">×</strong>}
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
            {quizSummary.isComplete && (
              <div className="quiz-summary-trigger">
                <button
                  type="button"
                  className="btn"
                  aria-expanded={quizSummaryOpen}
                  aria-controls={`quiz-summary-${lecture.id}`}
                  onClick={() => setQuizSummaryOpen((open) => !open)}
                >
                  {quizSummaryOpen ? 'Masquer le bilan du quiz' : 'Voir le bilan et les explications'}
                </button>
              </div>
            )}
            {quizSummaryOpen && quizSummary.isComplete && (
              <section className="panel quiz-summary" id={`quiz-summary-${lecture.id}`} aria-labelledby={`quiz-summary-title-${lecture.id}`}>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Quiz terminé</p>
                    <h2 id={`quiz-summary-title-${lecture.id}`}>Votre bilan</h2>
                  </div>
                </div>
                <div className="quiz-summary-stats" aria-label="Statistiques du quiz">
                  <article className="quiz-summary-stat">
                    <strong>{quizSummary.correct}<span> / {quizSummary.total}</span></strong>
                    <small>Bonnes réponses</small>
                  </article>
                  <article className="quiz-summary-stat">
                    <strong>{quizSummary.percentage}<span>%</span></strong>
                    <small>Score</small>
                  </article>
                  <article className="quiz-summary-stat">
                    <strong>{quizSummary.total - quizSummary.correct}</strong>
                    <small>À revoir</small>
                  </article>
                </div>
                <div className="quiz-summary-review">
                  {lecture.quiz.map((question, index) => {
                    const correct = quizResults[question.id] === true;
                    const selected = selections[question.id] ?? [];
                    return (
                      <article key={question.id} className={correct ? 'quiz-review-item is-correct' : 'quiz-review-item is-incorrect'}>
                        <div className="quiz-review-heading">
                          <p className="eyebrow">Question {index + 1}</p>
                          <span className="quiz-review-status">{correct ? 'Correcte' : 'À revoir'}</span>
                        </div>
                        <h3 className="question-text">{question.q}</h3>
                        <ul className="quiz-review-options">
                          {question.opts.map((option, optionIndex) => {
                            const wasSelected = selected.includes(String(optionIndex));
                            const optionClass = option.ok
                              ? 'option-row option-correct'
                              : wasSelected ? 'option-row option-incorrect' : 'option-row';
                            return (
                              <li key={optionIndex} className={optionClass}>
                                <span>{option.t}</span>
                                {option.ok && <strong>Bonne réponse</strong>}
                                {!option.ok && wasSelected && <strong>Votre choix</strong>}
                              </li>
                            );
                          })}
                        </ul>
                        <p className={correct ? 'notice success quiz-review-explanation' : 'notice error quiz-review-explanation'}>
                          <strong>{correct ? 'Explication' : 'Correction'}</strong>
                          {' '}{question.explain || 'Aucune explication détaillée n’est disponible pour cette question.'}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
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
                <article key={question.id} id={`focus-${question.id}`} className="card">
                  <p className="eyebrow">Affirmation {index + 1} / {lecture.vf.length}</p>
                  <h3 className="question-text">{question.s}</h3>
                  <CardNoteControl relation={`vf:${lecture.id}.${question.id}`} label={`Affirmation ${index + 1}`} />
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
