import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { db, type CardProgress, type QuizResult } from '../db/db';
import { Rating, review } from '../lib/srs';
import { isCorrectSelection } from '../lib/answers';
import { saveQuizResult } from '../lib/quizHistory';
import { loadAllLectures } from '../data/lectures';
import { CardWebSearchButton } from '../components/ui/CardWebSearchButton';
import { CardNoteControl } from '../components/ui/CardNoteControl';
import { useCardStore } from '../stores/cardStore';
import { useProgressStore } from '../stores/progressStore';
import type { Card } from '../types/card';
import type { Lecture } from '../lib/schema';

type StudyCard = { card: Card; lectureId: string; lectureName: string };
type ReviewQuestion =
  | { kind: 'quiz'; lectureId: string; lectureName: string; question: Lecture['quiz'][number] }
  | { kind: 'vf'; lectureId: string; lectureName: string; question: Lecture['vf'][number] };
type RevisionGroup = { id: string; name: string; cards: StudyCard[]; due: number; fresh: number; quizErrors: ReviewQuestion[]; vfErrors: ReviewQuestion[] };

const SESSION_SIZE = 20;

async function findMissedQuestions(lectures: Lecture[]): Promise<ReviewQuestion[]> {
  const latest = new Map<string, QuizResult>();
  const results = await db.quizResults.orderBy('updatedAt').toArray();
  for (const result of results) {
    const kind = result.details.kind;
    if (kind === 'quiz' || kind === 'vf') latest.set(`${result.lectureId}:${kind}:${result.questionId}`, result);
  }

  const lectureById = new Map(lectures.map((lecture) => [lecture.id, lecture]));
  const missed: ReviewQuestion[] = [];
  for (const result of latest.values()) {
    if (result.score > 0) continue;
    const lecture = lectureById.get(result.lectureId);
    if (!lecture) continue;
    const kind = result.details.kind;
    if (kind === 'quiz') {
      const question = lecture.quiz.find((item) => item.id === result.questionId);
      if (question) missed.push({ kind, lectureId: lecture.id, lectureName: lecture.name, question });
    } else if (kind === 'vf') {
      const question = lecture.vf.find((item) => item.id === result.questionId);
      if (question) missed.push({ kind, lectureId: lecture.id, lectureName: lecture.name, question });
    }
  }
  return missed;
}

export const StudyPage: React.FC = () => {
  const { dueCount, allCards, loading, error, loadCards, refreshDueCount } = useCardStore();
  const { loadStats } = useProgressStore();
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [progressRows, setProgressRows] = useState<CardProgress[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [missedQuestions, setMissedQuestions] = useState<ReviewQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState('');
  const [questionQueue, setQuestionQueue] = useState<ReviewQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionSelection, setQuestionSelection] = useState<string[]>([]);
  const [questionChecked, setQuestionChecked] = useState<boolean>();
  const [questionBusy, setQuestionBusy] = useState(false);
  const [returnToRevision, setReturnToRevision] = useState(false);
  const revisionSectionRef = useRef<HTMLElement>(null);

  const refreshQuestionErrors = async (sourceLectures = lectures) => {
    setQuestionsLoading(true);
    setQuestionsError('');
    try {
      setMissedQuestions(await findMissedQuestions(sourceLectures));
    } catch (reason) {
      setQuestionsError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setQuestionsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void loadCards().then(async () => {
      if (active) setProgressRows(await db.cards.toArray());
    });
    void loadAllLectures().then(async (loaded) => {
      if (!active) return;
      setLectures(loaded);
      await refreshQuestionErrors(loaded);
    }).catch((reason: unknown) => {
      if (active) {
        setQuestionsError(reason instanceof Error ? reason.message : String(reason));
        setQuestionsLoading(false);
      }
    });
    return () => { active = false; };
  }, [loadCards]);

  useEffect(() => {
    if (returnToRevision && questionQueue.length === 0) {
      revisionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setReturnToRevision(false);
    }
  }, [questionQueue.length, returnToRevision]);

  const current = queue[index];
  const currentQuestion = questionQueue[questionIndex];
  const progressById = useMemo(() => new Map(progressRows.map((item) => [item.gid, item])), [progressRows]);

  const revisionGroups = useMemo(() => {
    const groups = new Map<string, RevisionGroup>();
    const getGroup = (id: string, name: string) => {
      const existing = groups.get(id);
      if (existing) return existing;
      const created: RevisionGroup = { id, name, cards: [], due: 0, fresh: 0, quizErrors: [], vfErrors: [] };
      groups.set(id, created);
      return created;
    };
    for (const item of allCards) {
      const group = getGroup(item.lectureId, item.lectureName);
      group.cards.push(item);
      const row = progressById.get(`${item.lectureId}.${item.card.id}`);
      if (!row) group.fresh += 1;
      else if (row.due <= Date.now()) group.due += 1;
    }
    for (const item of missedQuestions) {
      const group = getGroup(item.lectureId, item.lectureName);
      (item.kind === 'quiz' ? group.quizErrors : group.vfErrors).push(item);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [allCards, missedQuestions, progressById]);

  const startSession = async (lectureId?: string) => {
    setReviewError('');
    setMessage('');
    try {
      const selectedCards = lectureId ? allCards.filter((item) => item.lectureId === lectureId) : allCards;
      const due = selectedCards.filter((item) => {
        const row = progressById.get(`${item.lectureId}.${item.card.id}`);
        return row && row.due <= Date.now();
      });
      const fresh = selectedCards.filter((item) => !progressById.has(`${item.lectureId}.${item.card.id}`));
      const next = [...due, ...fresh].slice(0, SESSION_SIZE);
      setQueue(next);
      setIndex(0);
      setRevealed(false);
      if (next.length === 0) setMessage('Aucune carte nouvelle ou échue pour ce cours.');
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const startQuestionReview = (items: ReviewQuestion[]) => {
    setQueue([]);
    setIndex(0);
    setRevealed(false);
    setQuestionQueue(items);
    setQuestionIndex(0);
    setQuestionSelection([]);
    setQuestionChecked(undefined);
    setQuestionsError('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const leaveQuestionReview = () => {
    setQuestionQueue([]);
    setQuestionIndex(0);
    setQuestionSelection([]);
    setQuestionChecked(undefined);
    setReturnToRevision(true);
  };

  const rate = async (rating: Exclude<Rating, Rating.Manual>) => {
    if (!current) return;
    setBusy(true);
    setReviewError('');
    try {
      await review(`${current.lectureId}.${current.card.id}`, rating);
      const [rows] = await Promise.all([db.cards.toArray(), refreshDueCount(), loadStats()]);
      setProgressRows(rows);
      setRevealed(false);
      if (index + 1 >= queue.length) {
        setQueue([]);
        setMessage(`Session terminée : ${queue.length} carte${queue.length > 1 ? 's' : ''} planifiée${queue.length > 1 ? 's' : ''}.`);
      } else {
        setIndex((value) => value + 1);
      }
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const checkQuestion = async () => {
    if (!currentQuestion || !questionSelection.length) return;
    setQuestionBusy(true);
    setQuestionsError('');
    try {
      let correct = false;
      if (currentQuestion.kind === 'quiz') {
        const correctOptions = currentQuestion.question.opts.flatMap((option, optionIndex) => option.ok ? [String(optionIndex)] : []);
        correct = isCorrectSelection(correctOptions, questionSelection);
        await saveQuizResult(currentQuestion.lectureId, currentQuestion.question.id, 'quiz', correct, questionSelection);
      } else {
        const answer = questionSelection[0] === 'true';
        correct = answer === currentQuestion.question.a;
        await saveQuizResult(currentQuestion.lectureId, currentQuestion.question.id, 'vf', correct, [String(answer)]);
      }
      setQuestionChecked(correct);
      await refreshQuestionErrors();
    } catch (reason) {
      setQuestionsError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setQuestionBusy(false);
    }
  };

  const nextQuestion = () => {
    if (questionIndex + 1 >= questionQueue.length) {
      setQuestionQueue([]);
      setQuestionIndex(0);
      setMessage('Révision des questions terminée.');
      setReturnToRevision(true);
    } else {
      setQuestionIndex((value) => value + 1);
    }
    setQuestionSelection([]);
    setQuestionChecked(undefined);
  };

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap study-wrap">
        {questionQueue.length === 0 && <section className="panel study-overview">
          <p className="eyebrow">Répétition espacée · FSRS</p>
          <div className="study-heading-row">
            <div>
              <h1>Révisez par cours, selon vos besoins.</h1>
              <p className="muted">{dueCount} carte{dueCount === 1 ? '' : 's'} à revoir · {missedQuestions.length} question{missedQuestions.length === 1 ? '' : 's'} ratée{missedQuestions.length === 1 ? '' : 's'} à reprendre.</p>
            </div>
            <span className="study-method-mark"><span>FSRS</span><small>révision<br />espacée</small></span>
          </div>
          <p className="muted study-storage-note">Vos réponses et évaluations sont enregistrées par cours. Répondez puis évaluez chaque carte : Encore 1 jour · Difficile 3 jours · Bien 7 jours · Facile 14 jours.</p>
          <div className="btn-row">
            <button type="button" className="btn" disabled={loading || allCards.length === 0 || busy} onClick={() => void startSession()}>
              {loading ? 'Chargement des cartes…' : 'Commencer la révision globale'}
            </button>
            {queue.length > 0 && <button type="button" className="btn ghost" onClick={() => { setQueue([]); setIndex(0); setRevealed(false); }}>Terminer les cartes</button>}
            {questionQueue.length > 0 && <button type="button" className="btn ghost" onClick={() => setQuestionQueue([])}>Terminer les questions</button>}
          </div>
          {loading && <p className="muted" role="status">Chargement des cartes du cours…</p>}
          {error && <p className="notice error" role="alert">Impossible de charger les cartes : {error}</p>}
          {reviewError && <p className="notice error" role="alert">{reviewError}</p>}
          {questionsError && <p className="notice error" role="alert">{questionsError}</p>}
          {message && <p className="notice success" role="status">{message}</p>}
        </section>}

        {current && questionQueue.length === 0 && (
          <article className="panel study-session study-active-session" aria-live="polite">
            <div className="study-session-topline">
              <div><p className="eyebrow">Carte en cours</p><p className="muted"><Link className="text-link" to={`/lecture/${current.lectureId}`}>{current.lectureName}</Link></p></div>
              <div className="study-session-actions-top">
                <CardWebSearchButton lectureName={current.lectureName} question={current.card.q} answer={current.card.a} />
                <CardNoteControl relation={`card:${current.lectureId}.${current.card.id}`} label={`Carte · ${current.lectureName}`} />
                <span className="study-step-count">{String(index + 1).padStart(2, '0')} <span>/ {String(queue.length).padStart(2, '0')}</span></span>
              </div>
            </div>
            <div className="study-session-track" aria-label={`Progression de la session : ${index + 1} sur ${queue.length}`}><span style={{ width: `${((index + 1) / queue.length) * 100}%` }} /></div>
            <h2 className="study-prompt">{current.card.q}</h2>
            {current.card.src && <p className="muted">Source : {current.card.src}</p>}
            {!revealed ? <button type="button" className="btn" onClick={() => setRevealed(true)}>Afficher la réponse</button> : (
              <div className="answer-block">
                <p>{current.card.a}</p>
                <p className="muted rating-hint">Quand souhaitez-vous revoir cette carte ?</p>
                <div className="rating-row">{([
                  ['Encore · 1j', Rating.Again], ['Difficile · 3j', Rating.Hard], ['Bien · 7j', Rating.Good], ['Facile · 14j', Rating.Easy],
                ] as const).map(([label, rating]) => <button key={label} type="button" className={`btn rating-${label.split(' ')[0].toLowerCase()}`} disabled={busy} onClick={() => void rate(rating)}>{label}</button>)}</div>
              </div>
            )}
          </article>
        )}

        {currentQuestion && <article className="panel study-question-session study-focused-review" aria-live="polite">
          <div className="study-session-topline">
            <div className="study-review-course">
              <button type="button" className="btn ghost btn-sm study-review-back" aria-label="Retour aux révisions" title="Retour aux révisions" onClick={leaveQuestionReview}><ArrowLeft size={16} /></button>
              <div><p className="eyebrow">{currentQuestion.kind === 'quiz' ? 'Quiz à reprendre' : 'Vrai / faux à reprendre'}</p><p className="muted"><Link className="text-link" to={`/lecture/${currentQuestion.lectureId}?tab=${currentQuestion.kind}`}>{currentQuestion.lectureName}</Link></p></div>
            </div>
            <span className="study-step-count">{String(questionIndex + 1).padStart(2, '0')} <span>/ {String(questionQueue.length).padStart(2, '0')}</span></span>
          </div>
          {questionsError && <p className="notice error" role="alert">{questionsError}</p>}
          <div className="study-session-track"><span style={{ width: `${((questionIndex + 1) / questionQueue.length) * 100}%` }} /></div>
          <h2 className="study-prompt">{currentQuestion.kind === 'quiz' ? currentQuestion.question.q : currentQuestion.question.s}</h2>
          {currentQuestion.kind === 'quiz' ? <fieldset className="option-list" disabled={questionChecked !== undefined || questionBusy}>
            <legend className="sr-only">Choix de réponse</legend>
            {currentQuestion.question.opts.map((option, optionIndex) => {
              const value = String(optionIndex);
              const selected = questionSelection.includes(value);
              const optionClass = questionChecked !== undefined && option.ok ? 'option-correct' : questionChecked !== undefined && selected && !option.ok ? 'option-incorrect' : '';
              return <label key={value} className={`option-row ${optionClass}`}>
                <input type="checkbox" checked={selected} onChange={(event) => setQuestionSelection((previous) => event.target.checked ? [...previous, value] : previous.filter((item) => item !== value))} />
                <span>{option.t}</span>
                {questionChecked !== undefined && option.ok && <strong className="correct-mark">✓</strong>}
                {questionChecked !== undefined && selected && !option.ok && <strong className="incorrect-mark">×</strong>}
              </label>;
            })}
          </fieldset> : <div className="rating-row">
            {[true, false].map((value) => {
              const selected = questionSelection[0] === String(value);
              const correctOption = questionChecked !== undefined && value === currentQuestion.question.a;
              const wrongOption = questionChecked !== undefined && selected && value !== currentQuestion.question.a;
              return <button key={String(value)} type="button" disabled={questionChecked !== undefined || questionBusy} className={`btn ${correctOption ? 'option-correct' : wrongOption ? 'option-incorrect' : selected ? 'selected-answer' : 'ghost'}`} onClick={() => setQuestionSelection([String(value)])}>{value ? 'Vrai' : 'Faux'}{correctOption ? ' ✓' : wrongOption ? ' ×' : ''}</button>;
            })}
          </div>}
          {questionChecked === undefined ? <button className="btn" type="button" disabled={!questionSelection.length || questionBusy} onClick={() => void checkQuestion()}>{questionBusy ? 'Vérification…' : 'Vérifier'}</button> : <>
            <p className={questionChecked ? 'notice success' : 'notice error'} role="status">{questionChecked ? 'Bonne réponse.' : 'Réponse incorrecte.'} {currentQuestion.kind === 'quiz' ? currentQuestion.question.explain : currentQuestion.question.w}</p>
            <button className="btn" type="button" onClick={nextQuestion}>{questionIndex + 1 === questionQueue.length ? 'Terminer' : 'Question suivante'}</button>
          </>}
        </article>}

        {questionQueue.length === 0 && <section ref={revisionSectionRef} className="panel revision-by-course">
          <div className="notes-library-heading">
            <div><p className="eyebrow">Votre progression, par cours</p><h2>Révisions organisées</h2></div>
            <span className="pill">{revisionGroups.length} cours</span>
          </div>
          {questionsLoading && <p className="muted" role="status">Chargement des erreurs récentes…</p>}
          {!revisionGroups.length && !loading && <p className="muted">Aucun contenu de révision n’est disponible.</p>}
          {revisionGroups.map((group) => <details className="revision-course" key={group.id}>
            <summary><span className="revision-course-name">{group.name}</span><span className="revision-course-counts"><span>{group.due} cartes dues</span><span>{group.quizErrors.length} quiz ratés</span><span>{group.vfErrors.length} vrai/faux ratés</span></span></summary>
            <div className="revision-course-content">
              {group.cards.length > 0 && <div className="revision-course-action">
                <div><strong>Cartes</strong><p className="muted">{group.due} à revoir · {group.fresh} nouvelles · {group.cards.length} au total</p></div>
                <button className="btn btn-sm" type="button" disabled={!group.due && !group.fresh} onClick={() => void startSession(group.id)}>Réviser les cartes</button>
              </div>}
              {(group.quizErrors.length > 0 || group.vfErrors.length > 0) && <div className="revision-question-actions">
                {group.quizErrors.length > 0 && <div className="revision-course-action"><div><strong>Quiz à reprendre</strong><p className="muted">{group.quizErrors.length} erreur{group.quizErrors.length > 1 ? 's' : ''} récente{group.quizErrors.length > 1 ? 's' : ''}</p></div><button className="btn ghost btn-sm" type="button" onClick={() => startQuestionReview(group.quizErrors)}>Revoir les quiz</button></div>}
                {group.vfErrors.length > 0 && <div className="revision-course-action"><div><strong>Vrai / faux à reprendre</strong><p className="muted">{group.vfErrors.length} erreur{group.vfErrors.length > 1 ? 's' : ''} récente{group.vfErrors.length > 1 ? 's' : ''}</p></div><button className="btn ghost btn-sm" type="button" onClick={() => startQuestionReview(group.vfErrors)}>Revoir le vrai / faux</button></div>}
              </div>}
            </div>
          </details>)}
        </section>}
      </main>
    </>
  );
};
