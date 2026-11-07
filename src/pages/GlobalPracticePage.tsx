import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { loadAllLectures } from '../data/lectures';
import { saveQuizResult } from '../lib/quizHistory';
import type { Lecture } from '../lib/schema';

type Kind = 'quiz' | 'vf';
type PracticeQuestion = {
  id: string;
  lectureId: string;
  lectureName: string;
  prompt: string;
  options: Array<{ label: string; correct: boolean }>;
  explanation: string;
  source?: string;
};
type Result = { question: PracticeQuestion; correct: boolean };
type PracticeSession = {
  kind: Kind;
  queue: PracticeQuestion[];
  index: number;
  selected: string[];
  checked: boolean;
  results: Result[];
  complete: boolean;
};

export function createPracticeSession(kind: Kind): PracticeSession {
  return { kind, queue: [], index: 0, selected: [], checked: false, results: [], complete: false };
}

export function getPracticeSessionForKind(session: PracticeSession, kind: Kind): PracticeSession {
  return session.kind === kind ? session : createPracticeSession(kind);
}

function shuffle<T>(values: T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function createPool(lectures: Lecture[], kind: Kind, scope: string): PracticeQuestion[] {
  return lectures
    .filter((lecture) => scope === 'ALL' || lecture.id === scope)
    .flatMap((lecture) => kind === 'quiz'
      ? lecture.quiz.map((question) => ({
          id: `${lecture.id}.${question.id}`,
          lectureId: lecture.id,
          lectureName: lecture.name,
          prompt: question.q,
          options: question.opts.map((option, index) => ({ label: option.t, correct: option.ok, key: String(index) })),
          explanation: question.explain,
          source: question.src,
        }))
      : lecture.vf.map((question) => ({
          id: `${lecture.id}.${question.id}`,
          lectureId: lecture.id,
          lectureName: lecture.name,
          prompt: question.s,
          options: [{ label: 'Vrai', correct: question.a }, { label: 'Faux', correct: !question.a }],
          explanation: question.w,
        })))
    .map((question) => ({ ...question, options: question.options.map(({ label, correct }) => ({ label, correct })) }));
}

export function GlobalPracticePage({ kind }: { kind: Kind }) {
  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scope, setScope] = useState('ALL');
  const [count, setCount] = useState('10');
  const [exam, setExam] = useState(false);
  const [session, setSession] = useState(() => createPracticeSession(kind));
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let active = true;
    loadAllLectures()
      .then((items) => { if (active) setLectures(items); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const pool = useMemo(() => createPool(lectures, kind, scope), [lectures, kind, scope]);
  useEffect(() => {
    setSession(createPracticeSession(kind));
    setExam(false);
  }, [kind]);

  const activeSession = getPracticeSessionForKind(session, kind);
  const { queue, index, selected, checked, results, complete } = activeSession;
  const current = queue[index];
  const start = () => {
    const shuffled = shuffle(pool);
    setSession({
      ...createPracticeSession(kind),
      queue: count === 'all' ? shuffled : shuffled.slice(0, Math.min(Number(count), shuffled.length)),
    });
  };
  const getCorrect = (question: PracticeQuestion, answers: string[]) => {
    const correct = question.options.flatMap((option, optionIndex) => option.correct ? [String(optionIndex)] : []);
    const selected = new Set(answers);
    return selected.size === correct.length && correct.every((answer) => selected.has(answer));
  };
  const submitOrNext = async () => {
    if (!current) return;
    if (!checked && !exam) {
      const correct = getCorrect(current, selected);
      try {
        await saveQuizResult(current.lectureId, current.id.split('.').slice(1).join('.'), kind, correct, selected);
      } catch (reason) {
        setSaveError(reason instanceof Error ? reason.message : String(reason));
        return;
      }
      setSession((previous) => previous.kind !== kind ? previous : {
        ...previous,
        results: [...previous.results, { question: current, correct }],
        checked: true,
      });
      return;
    }
    setSession((previous) => {
      if (previous.kind !== kind) return previous;
      const nextResults = !checked && exam
        ? [...previous.results, { question: current, correct: getCorrect(current, selected) }]
        : previous.results;
      if (index + 1 >= queue.length) return { ...previous, results: nextResults, complete: true };
      return { ...previous, results: nextResults, index: index + 1, selected: [], checked: false };
    });
    if (!checked && exam) {
      try {
        await saveQuizResult(current.lectureId, current.id.split('.').slice(1).join('.'), kind, getCorrect(current, selected), selected);
      } catch (reason) {
        setSaveError(reason instanceof Error ? reason.message : String(reason));
      }
    }
  };

  const title = kind === 'quiz' ? 'Quiz global' : 'Vrai / faux global';
  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className={`wrap practice-wrap practice-${kind}`}>
        <section className="panel practice-overview">
          <p className="eyebrow">Pratique inter-cours · données locales</p>
          <h1>{title}</h1>
          <p className="muted">
            {kind === 'quiz'
              ? 'Mélangez les quiz des cours, choisissez le nombre de questions et lancez un mode examen avec correction à la fin.'
              : 'Entraînez-vous sur les affirmations de tous les cours ou limitez la session à un cours.'}
          </p>
          {loading && <p className="muted" role="status">Chargement des questions…</p>}
          {error && <p className="notice error" role="alert">Impossible de charger les questions : {error}</p>}
          {saveError && <p className="notice error" role="alert">Impossible d’enregistrer ce résultat localement : {saveError}</p>}
          <div className="practice-controls">
            <label>
              <span className="field-label">Portée</span>
              <select value={scope} onChange={(event) => setScope(event.target.value)} disabled={loading}>
                <option value="ALL">Tous les cours · interleaving</option>
                {lectures.map((lecture) => <option key={lecture.id} value={lecture.id}>{lecture.name}</option>)}
              </select>
            </label>
            <label>
              <span className="field-label">Questions</span>
              <select value={count} onChange={(event) => setCount(event.target.value)} disabled={loading}>
                <option value="5">5</option><option value="10">10</option><option value="20">20</option><option value="all">Toutes ({pool.length})</option>
              </select>
            </label>
            {kind === 'quiz' && <label className="check-filter exam-toggle"><input type="checkbox" checked={exam} onChange={(event) => setExam(event.target.checked)} /> Mode examen · correction à la fin</label>}
          </div>
          <div className="btn-row">
            <button type="button" className="btn" disabled={loading || pool.length === 0} onClick={start}>{queue.length ? 'Recommencer la session' : 'Démarrer la session'}</button>
            {queue.length > 0 && !complete && <button type="button" className="btn ghost" onClick={() => setSession(createPracticeSession(kind))}>Quitter</button>}
          </div>
          {!loading && !error && pool.length === 0 && <p className="muted">Aucune question disponible pour cette portée.</p>}
        </section>

        {current && !complete && (
          <article className="panel practice-question" aria-live="polite">
            <div className="practice-question-topline">
              <div>
                <p className="eyebrow">{kind === 'quiz' ? 'Question à choix' : 'Affirmation'}</p>
                <Link className="text-link muted" to={`/lecture/${current.lectureId}`}>{current.lectureName}</Link>
              </div>
              <span className="practice-step-count">{String(index + 1).padStart(2, '0')} <span>/ {String(queue.length).padStart(2, '0')}</span></span>
            </div>
            <div className="study-session-track" aria-label={`Progression de la session : ${index + 1} sur ${queue.length}`}><span style={{ width: `${((index + 1) / queue.length) * 100}%` }} /></div>
            <h3 className="question-text">{current.prompt}</h3>
            {current.source && <p className="muted">Source : {current.source}</p>}
            <fieldset className="option-list" disabled={checked}>
              <legend className="sr-only">Choisissez une ou plusieurs réponses</legend>
              {current.options.map((option, optionIndex) => {
                const value = String(optionIndex);
                const isSelected = selected.includes(value);
                return <label key={`${current.id}-${value}`} className={`option-row ${checked && option.correct ? 'option-correct' : ''} ${checked && isSelected && !option.correct ? 'option-incorrect' : ''}`}>
                  <input type={kind === 'vf' ? 'radio' : 'checkbox'} name={current.id} checked={isSelected} onChange={() => setSession((previous) => previous.kind !== kind ? previous : {
                    ...previous,
                    selected: kind === 'vf' ? [value] : isSelected ? previous.selected.filter((item) => item !== value) : [...previous.selected, value],
                  })} />
                  <span>{kind === 'quiz' ? option.label : option.label}</span>
                </label>;
              })}
            </fieldset>
            {checked && !exam && <p className={results.at(-1)?.correct ? 'notice success' : 'notice error'} role="status">
              {results.at(-1)?.correct ? 'Bonne réponse.' : 'Réponse incorrecte.'} {current.explanation}
            </p>}
            <button className="btn" type="button" disabled={kind === 'vf' && !selected.length} onClick={() => void submitOrNext()}>
              {!checked && !exam ? 'Vérifier' : index + 1 === queue.length ? 'Terminer' : 'Question suivante →'}
            </button>
          </article>
        )}

        {complete && (
          <section className="panel">
            <p className="eyebrow">Session terminée</p>
            <h2>{results.filter((result) => result.correct).length} / {results.length} bonnes réponses</h2>
            <p className="muted">{exam ? 'Mode examen : correction affichée après la dernière question.' : 'Votre récapitulatif de session.'}</p>
            {results.filter((result) => !result.correct).map(({ question }) => (
              <article key={question.id} className="card">
                <p className="eyebrow">{question.lectureName}</p>
                <h3 className="question-text">{question.prompt}</h3>
                <p>{question.options.filter((option) => option.correct).map((option) => option.label).join(' · ') || 'Aucune proposition correcte'}</p>
                {question.explanation && <p className="muted">{question.explanation}</p>}
              </article>
            ))}
            <button type="button" className="btn" onClick={start}>Nouvelle session</button>
          </section>
        )}
      </main>
    </>
  );
}
