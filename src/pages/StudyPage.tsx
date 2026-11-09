import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { db, type CardProgress } from '../db/db';
import { Rating, review } from '../lib/srs';
import { isCorrectSelection } from '../lib/answers';
import { saveQuizResult, scheduleQuizResult } from '../lib/quizHistory';
import {
  REVIEW_INTERVAL_DAYS,
  REVIEW_RATINGS,
  REVIEW_RATING_LABELS,
  collectScheduledQuestions,
  compareByEarliestDue,
  formatDueDate,
  organizeByLecture,
  splitDueUpcoming,
  type ReviewRating,
  type ReviewSchedule,
  type ScheduledQuestion,
} from '../lib/errorSchedule';
import { loadAllLectures } from '../data/lectures';
import { CardWebSearchButton } from '../components/ui/CardWebSearchButton';
import { CardNoteControl } from '../components/ui/CardNoteControl';
import { useCardStore } from '../stores/cardStore';
import { useProgressStore } from '../stores/progressStore';
import type { Card } from '../types/card';
import type { Lecture } from '../lib/schema';
import { readStudySession, saveStudySession, type StudySessionSnapshot } from '../lib/studySession';

type StudyCard = { card: Card; lectureId: string; lectureName: string };
type ReviewQuestion = { lectureId: string; lectureName: string; dueAt: number } & (
  | { kind: 'quiz'; question: Lecture['quiz'][number] }
  | { kind: 'vf'; question: Lecture['vf'][number] }
);
type RevisionGroup = {
  id: string;
  name: string;
  cards: StudyCard[];
  due: number;
  fresh: number;
  dueQuestions: ReviewQuestion[];
  upcomingQuestions: ReviewQuestion[];
  earliestDueAt: number | null;
};

const SESSION_SIZE = 20;

const CARD_RATINGS: { rating: ReviewRating; fsrs: Exclude<Rating, Rating.Manual> }[] = [
  { rating: 'again', fsrs: Rating.Again },
  { rating: 'hard', fsrs: Rating.Hard },
  { rating: 'good', fsrs: Rating.Good },
  { rating: 'easy', fsrs: Rating.Easy },
];

function joinScheduledQuestions(scheduled: ScheduledQuestion[], sourceLectures: Lecture[]): ReviewQuestion[] {
  const lectureById = new Map(sourceLectures.map((lecture) => [lecture.id, lecture]));
  const joined: ReviewQuestion[] = [];
  for (const item of scheduled) {
    const lecture = lectureById.get(item.lectureId);
    if (!lecture) continue;
    if (item.kind === 'quiz') {
      const question = lecture.quiz.find((entry) => entry.id === item.questionId);
      if (question) joined.push({ kind: 'quiz', lectureId: lecture.id, lectureName: lecture.name, question, dueAt: item.dueAt });
    } else {
      const question = lecture.vf.find((entry) => entry.id === item.questionId);
      if (question) joined.push({ kind: 'vf', lectureId: lecture.id, lectureName: lecture.name, question, dueAt: item.dueAt });
    }
  }
  return joined;
}

export const StudyPage: React.FC = () => {
  const { dueCount, allCards, loading, error, loadCards, refreshDueCount } = useCardStore();
  const { loadStats } = useProgressStore();
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [savedSession, setSavedSession] = useState<StudySessionSnapshot | null>(() => readStudySession());
  const [cardsReady, setCardsReady] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [progressRows, setProgressRows] = useState<CardProgress[]>([]);
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [reviewQuestions, setReviewQuestions] = useState<ReviewQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState('');
  const [questionQueue, setQuestionQueue] = useState<ReviewQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [questionSelection, setQuestionSelection] = useState<string[]>([]);
  const [questionChecked, setQuestionChecked] = useState<boolean>();
  const [questionBusy, setQuestionBusy] = useState(false);
  const [pendingResultId, setPendingResultId] = useState<string | null>(null);
  const [questionSchedule, setQuestionSchedule] = useState<ReviewSchedule | null>(null);
  const [returnToRevision, setReturnToRevision] = useState(false);
  const revisionSectionRef = useRef<HTMLElement>(null);

  const refreshQuestionErrors = async (sourceLectures = lectures) => {
    setQuestionsLoading(true);
    setQuestionsError('');
    try {
      const results = await db.quizResults.toArray();
      setReviewQuestions(joinScheduledQuestions(collectScheduledQuestions(results), sourceLectures));
    } catch (reason) {
      setQuestionsError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setQuestionsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    void loadCards().then(async () => {
      if (!active) return;
      try {
        setProgressRows(await db.cards.toArray());
      } catch (reason) {
        setSessionError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        setCardsReady(true);
      }
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
    const updateSavedSession = () => {
      try {
        setSavedSession(readStudySession());
        setSessionError('');
      } catch (reason) {
        setSessionError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    window.addEventListener('residanat:study-session-updated', updateSavedSession);
    return () => window.removeEventListener('residanat:study-session-updated', updateSavedSession);
  }, []);

  useEffect(() => {
    if (!cardsReady || !savedSession) return;
    const cardsById = new Map(allCards.map((item) => [`${item.lectureId}.${item.card.id}`, item]));
    const restored = savedSession.cardIds.flatMap((id) => {
      const card = cardsById.get(id);
      return card ? [card] : [];
    });
    if (!restored.length) {
      setSessionError('La session enregistrée contient des cartes qui ne sont pas disponibles sur cet appareil.');
      return;
    }
    const cardsBeforeCurrent = savedSession.cardIds.slice(0, savedSession.index)
      .filter((id) => cardsById.has(id)).length;
    const restoredIndex = Math.min(cardsBeforeCurrent, restored.length - 1);
    setQueue(restored);
    setIndex(restoredIndex);
    setRevealed(savedSession.revealed);
    if (restored.length !== savedSession.cardIds.length || restoredIndex !== savedSession.index) {
      const updated = {
        ...savedSession,
        cardIds: restored.map((item) => `${item.lectureId}.${item.card.id}`),
        index: restoredIndex,
        updatedAt: Date.now(),
      };
      setSavedSession(updated);
      void saveStudySession(updated).catch((reason: unknown) => {
        setSessionError(reason instanceof Error ? reason.message : String(reason));
      });
    }
  }, [allCards, cardsReady, savedSession]);

  useEffect(() => {
    if (returnToRevision && questionQueue.length === 0) {
      revisionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setReturnToRevision(false);
    }
  }, [questionQueue.length, returnToRevision]);

  const current = queue[index];
  const currentQuestion = questionQueue[questionIndex];
  const progressById = useMemo(() => new Map(progressRows.map((item) => [item.gid, item])), [progressRows]);
  const questionSplit = useMemo(() => splitDueUpcoming(reviewQuestions, Date.now()), [reviewQuestions]);
  const dueQuestions = questionSplit.due;
  const upcomingQuestions = questionSplit.upcoming;
  const nextUpcomingAt = upcomingQuestions.length > 0 ? upcomingQuestions[0].dueAt : null;

  const revisionGroups = useMemo(() => {
    const now = Date.now();
    const scheduleByLecture = new Map(organizeByLecture(reviewQuestions, now).map((schedule) => [schedule.lectureId, schedule]));
    const groups = new Map<string, RevisionGroup>();
    const getGroup = (id: string, name: string) => {
      const existing = groups.get(id);
      if (existing) return existing;
      const created: RevisionGroup = { id, name, cards: [], due: 0, fresh: 0, dueQuestions: [], upcomingQuestions: [], earliestDueAt: null };
      groups.set(id, created);
      return created;
    };
    const earliestCardDue = new Map<string, number>();
    for (const item of allCards) {
      const group = getGroup(item.lectureId, item.lectureName);
      group.cards.push(item);
      const row = progressById.get(`${item.lectureId}.${item.card.id}`);
      if (!row) group.fresh += 1;
      else {
        if (row.due <= now) group.due += 1;
        const previous = earliestCardDue.get(item.lectureId);
        if (previous === undefined || row.due < previous) earliestCardDue.set(item.lectureId, row.due);
      }
    }
    for (const item of reviewQuestions) getGroup(item.lectureId, item.lectureName);
    for (const group of groups.values()) {
      const schedule = scheduleByLecture.get(group.id);
      if (schedule) {
        group.dueQuestions = schedule.due;
        group.upcomingQuestions = schedule.upcoming;
      }
      const times = [earliestCardDue.get(group.id), schedule?.earliestDueAt].filter((time): time is number => time !== undefined && time !== null);
      group.earliestDueAt = times.length > 0 ? Math.min(...times) : null;
    }
    return [...groups.values()].sort(compareByEarliestDue);
  }, [allCards, reviewQuestions, progressById]);

  const startSession = async (lectureId?: string) => {
    setReviewError('');
    setMessage('');
    setSessionError('');
    try {
      const selectedCards = lectureId ? allCards.filter((item) => item.lectureId === lectureId) : allCards;
      const due = selectedCards.filter((item) => {
        const row = progressById.get(`${item.lectureId}.${item.card.id}`);
        return row && row.due <= Date.now();
      });
      const fresh = selectedCards.filter((item) => !progressById.has(`${item.lectureId}.${item.card.id}`));
      const next = [...due, ...fresh].slice(0, SESSION_SIZE);
      if (!next.length) {
        setMessage('Aucune carte nouvelle ou échue pour ce cours.');
        return;
      }
      const session: StudySessionSnapshot = {
        version: 1,
        cardIds: next.map((item) => `${item.lectureId}.${item.card.id}`),
        index: 0,
        revealed: false,
        lectureId: lectureId ?? null,
        updatedAt: Date.now(),
      };
      setSavedSession(session);
      setQueue(next);
      setIndex(0);
      setRevealed(false);
      await saveStudySession(session);
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const resumeSession = () => {
    if (!savedSession || !cardsReady) return;
    const cardsById = new Map(allCards.map((item) => [`${item.lectureId}.${item.card.id}`, item]));
    const restored = savedSession.cardIds.flatMap((id) => {
      const card = cardsById.get(id);
      return card ? [card] : [];
    });
    if (!restored.length) {
      setSessionError('La session enregistrée contient des cartes qui ne sont pas disponibles sur cet appareil.');
      return;
    }
    const cardsBeforeCurrent = savedSession.cardIds.slice(0, savedSession.index)
      .filter((id) => cardsById.has(id)).length;
    setQueue(restored);
    setIndex(Math.min(cardsBeforeCurrent, restored.length - 1));
    setRevealed(savedSession.revealed);
    setSessionError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const pauseSession = () => {
    setQueue([]);
    setRevealed(false);
    setMessage('Session mise en pause et enregistrée. Vous pourrez la reprendre à votre retour.');
  };

  const startQuestionReview = (items: ReviewQuestion[]) => {
    setQueue([]);
    setIndex(0);
    setRevealed(false);
    setQuestionQueue(items);
    setQuestionIndex(0);
    setQuestionSelection([]);
    setQuestionChecked(undefined);
    setPendingResultId(null);
    setQuestionSchedule(null);
    setQuestionsError('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const leaveQuestionReview = () => {
    setQuestionQueue([]);
    setQuestionIndex(0);
    setQuestionSelection([]);
    setQuestionChecked(undefined);
    setPendingResultId(null);
    setQuestionSchedule(null);
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
      if (index + 1 >= queue.length) {
        setSavedSession(null);
        setQueue([]);
        setIndex(0);
        setRevealed(false);
        setMessage(`Session terminée : ${queue.length} carte${queue.length > 1 ? 's' : ''} planifiée${queue.length > 1 ? 's' : ''}.`);
        await saveStudySession(null);
      } else {
        const nextIndex = index + 1;
        const session: StudySessionSnapshot = {
          version: 1,
          cardIds: queue.map((item) => `${item.lectureId}.${item.card.id}`),
          index: nextIndex,
          revealed: false,
          lectureId: savedSession?.lectureId ?? null,
          updatedAt: Date.now(),
        };
        setSavedSession(session);
        setIndex(nextIndex);
        setRevealed(false);
        await saveStudySession(session);
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
      let resultId = '';
      if (currentQuestion.kind === 'quiz') {
        const correctOptions = currentQuestion.question.opts.flatMap((option, optionIndex) => option.ok ? [String(optionIndex)] : []);
        correct = isCorrectSelection(correctOptions, questionSelection);
        const result = await saveQuizResult(currentQuestion.lectureId, currentQuestion.question.id, 'quiz', correct, questionSelection);
        resultId = result.id;
      } else {
        const answer = questionSelection[0] === 'true';
        correct = answer === currentQuestion.question.a;
        const result = await saveQuizResult(currentQuestion.lectureId, currentQuestion.question.id, 'vf', correct, [String(answer)]);
        resultId = result.id;
      }
      setPendingResultId(resultId);
      setQuestionChecked(correct);
      await refreshQuestionErrors();
    } catch (reason) {
      setQuestionsError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setQuestionBusy(false);
    }
  };

  const pickQuestionInterval = async (rating: ReviewRating) => {
    if (!pendingResultId || questionBusy) return;
    setQuestionBusy(true);
    setQuestionsError('');
    try {
      const schedule = await scheduleQuizResult(pendingResultId, rating);
      setQuestionSchedule(schedule);
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
    setPendingResultId(null);
    setQuestionSchedule(null);
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
              <p className="muted">{dueCount} carte{dueCount === 1 ? '' : 's'} à revoir · {dueQuestions.length} question{dueQuestions.length === 1 ? '' : 's'} à reprendre maintenant.</p>
            </div>
            <span className="study-method-mark"><span>FSRS</span><small>révision<br />espacée</small></span>
          </div>
          <p className="muted study-storage-note">Vos réponses, votre progression et la carte en cours sont enregistrées au fil de la session. Connectez-vous pour la reprendre sur vos autres appareils. Répondez puis évaluez chaque carte : Encore 1 jour · Difficile 3 jours · Bien 7 jours · Facile 14 jours. Chaque réponse incorrecte à un quiz ou vrai/faux planifie une reprise ; après une question vérifiée, choisissez son prochain intervalle parmi les mêmes choix.</p>
          <div className="btn-row">
            {!current && savedSession && questionQueue.length === 0 && <button type="button" className="btn" disabled={!cardsReady} onClick={resumeSession}>
              {cardsReady ? `Continuer la session · ${savedSession.index + 1}/${savedSession.cardIds.length}` : 'Chargement de la session…'}
            </button>}
            <button type="button" className="btn ghost" disabled={loading || allCards.length === 0 || busy} onClick={() => void startSession()}>
              {loading ? 'Chargement des cartes…' : savedSession ? 'Commencer une nouvelle session globale' : 'Commencer la révision globale'}
            </button>
            {queue.length > 0 && <button type="button" className="btn ghost" onClick={pauseSession}>Mettre la session en pause</button>}
            {questionQueue.length > 0 && <button type="button" className="btn ghost" onClick={() => setQuestionQueue([])}>Terminer les questions</button>}
          </div>
          {loading && <p className="muted" role="status">Chargement des cartes du cours…</p>}
          {error && <p className="notice error" role="alert">Impossible de charger les cartes : {error}</p>}
          {reviewError && <p className="notice error" role="alert">{reviewError}</p>}
          {sessionError && <p className="notice error" role="alert">{sessionError}</p>}
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
            {!revealed ? <button type="button" className="btn" onClick={() => {
              const session = savedSession ? { ...savedSession, revealed: true, updatedAt: Date.now() } : null;
              if (!session) return;
              setRevealed(true);
              setSavedSession(session);
              void saveStudySession(session).catch((reason: unknown) => {
                setSessionError(reason instanceof Error ? reason.message : String(reason));
              });
            }}>Afficher la réponse</button> : (
              <div className="answer-block">
                <p>{current.card.a}</p>
                <p className="muted rating-hint">Quand souhaitez-vous revoir cette carte ?</p>
                <div className="rating-row">{CARD_RATINGS.map(({ rating, fsrs }) => <button key={rating} type="button" className={`btn rating-${REVIEW_RATING_LABELS[rating].toLowerCase()}`} disabled={busy} onClick={() => void rate(fsrs)}>{REVIEW_RATING_LABELS[rating]} · {REVIEW_INTERVAL_DAYS[rating]}j</button>)}</div>
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
            <div className="study-interval-choice">
              <p className="muted rating-hint">Quand souhaitez-vous revoir cette question ?</p>
              <div className="rating-row">{REVIEW_RATINGS.map((rating) => <button
                key={rating}
                type="button"
                className={`btn rating-${REVIEW_RATING_LABELS[rating].toLowerCase()}${questionSchedule?.reviewRating === rating ? ' interval-selected' : ''}`}
                disabled={questionBusy || !pendingResultId}
                aria-pressed={questionSchedule?.reviewRating === rating}
                onClick={() => void pickQuestionInterval(rating)}
              >{REVIEW_RATING_LABELS[rating]} · {REVIEW_INTERVAL_DAYS[rating]}j</button>)}</div>
              {questionSchedule && <p className="muted study-interval-confirmed" role="status">Prochaine révision : {formatDueDate(questionSchedule.nextReviewAt, Date.now())} · dans {questionSchedule.reviewIntervalDays} jour{questionSchedule.reviewIntervalDays > 1 ? 's' : ''}.</p>}
            </div>
            <button className="btn" type="button" disabled={!questionSchedule || questionBusy} onClick={nextQuestion}>{questionIndex + 1 === questionQueue.length ? 'Terminer' : 'Question suivante'}</button>
          </>}
        </article>}

        {questionQueue.length === 0 && <section ref={revisionSectionRef} className="panel revision-by-course">
          <div className="notes-library-heading">
            <div><p className="eyebrow">Votre progression, par cours</p><h2>Révisions organisées</h2></div>
            <span className="pill">{revisionGroups.length} cours</span>
          </div>
          {!questionsLoading && !questionsError && <div className="revision-schedule-summary">
            <div className="revision-schedule-status">
              {dueQuestions.length > 0 ? <>
                <strong className="revision-schedule-due">{dueQuestions.length} question{dueQuestions.length === 1 ? '' : 's'} à revoir maintenant</strong>
                <span className="muted">{dueQuestions.filter((item) => item.kind === 'quiz').length} quiz · {dueQuestions.filter((item) => item.kind === 'vf').length} vrai/faux{nextUpcomingAt !== null ? ` · prochaine reprise : ${formatDueDate(nextUpcomingAt, Date.now())}` : ''}</span>
              </> : upcomingQuestions.length > 0 ? <>
                <strong>Aucune question à revoir maintenant</strong>
                <span className="muted">Prochaine reprise : {formatDueDate(upcomingQuestions[0].dueAt, Date.now())} · {upcomingQuestions.length} question{upcomingQuestions.length === 1 ? '' : 's'} à venir</span>
              </> : <>
                <strong>Aucune reprise planifiée</strong>
                <span className="muted">Les réponses incorrectes aux quiz et vrai/faux apparaîtront ici, puis reviendront à la date choisie.</span>
              </>}
            </div>
            {dueQuestions.length > 0 && <button className="btn" type="button" onClick={() => startQuestionReview(dueQuestions)}>Revoir les questions dues · {dueQuestions.length}</button>}
          </div>}
          {questionsLoading && <p className="muted" role="status">Chargement des erreurs récentes…</p>}
          {!revisionGroups.length && !loading && <p className="muted">Aucun contenu de révision n’est disponible.</p>}
          {revisionGroups.map((group) => {
            const dueQuiz = group.dueQuestions.filter((item) => item.kind === 'quiz');
            const dueVf = group.dueQuestions.filter((item) => item.kind === 'vf');
            const upcomingQuiz = group.upcomingQuestions.filter((item) => item.kind === 'quiz');
            const upcomingVf = group.upcomingQuestions.filter((item) => item.kind === 'vf');
            const hasDueNow = group.due > 0 || group.dueQuestions.length > 0;
            const dateLabel = hasDueNow ? 'Aujourd’hui' : group.earliestDueAt !== null ? formatDueDate(group.earliestDueAt, Date.now()) : null;
            const nextGroupUpcomingAt = group.upcomingQuestions.length > 0 ? group.upcomingQuestions[0].dueAt : null;
            return <details className="revision-course" key={group.id}>
              <summary>
                <span className="revision-course-name">{group.name}</span>
                <span className="revision-course-counts">
                  {dateLabel && <span className={hasDueNow ? 'pill due' : 'pill'}>{dateLabel}</span>}
                  {group.cards.length > 0 && <span>{group.due} cartes dues</span>}
                  {dueQuiz.length > 0 && <span className="revision-count-due">{dueQuiz.length} quiz à revoir</span>}
                  {dueVf.length > 0 && <span className="revision-count-due">{dueVf.length} vrai/faux à revoir</span>}
                  {group.upcomingQuestions.length > 0 && <span>{group.upcomingQuestions.length} à venir</span>}
                </span>
              </summary>
              <div className="revision-course-content">
                {group.cards.length > 0 && <div className="revision-course-action">
                  <div><strong>Cartes</strong><p className="muted">{group.due} à revoir · {group.fresh} nouvelles · {group.cards.length} au total</p></div>
                  <button className="btn btn-sm" type="button" disabled={!group.due && !group.fresh} onClick={() => void startSession(group.id)}>Réviser les cartes</button>
                </div>}
                {group.dueQuestions.length > 0 && <div className="revision-schedule-block revision-due-block">
                  <div className="revision-schedule-block-head"><strong>À revoir</strong><span className="pill due">Aujourd’hui</span></div>
                  <p className="muted">{dueQuiz.length} quiz · {dueVf.length} vrai/faux</p>
                  <div className="revision-schedule-actions">
                    {dueQuiz.length > 0 && <button className="btn ghost btn-sm" type="button" onClick={() => startQuestionReview(dueQuiz)}>Revoir les quiz · {dueQuiz.length}</button>}
                    {dueVf.length > 0 && <button className="btn ghost btn-sm" type="button" onClick={() => startQuestionReview(dueVf)}>Revoir le vrai / faux · {dueVf.length}</button>}
                  </div>
                </div>}
                {group.upcomingQuestions.length > 0 && nextGroupUpcomingAt !== null && <div className="revision-schedule-block revision-upcoming-block">
                  <div className="revision-schedule-block-head"><strong>À venir</strong><span className="pill">{formatDueDate(nextGroupUpcomingAt, Date.now())}</span></div>
                  <p className="muted">{upcomingQuiz.length} quiz · {upcomingVf.length} vrai/faux</p>
                </div>}
              </div>
            </details>;
          })}
        </section>}
      </main>
    </>
  );
};
