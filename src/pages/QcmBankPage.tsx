import { useEffect, useMemo, useState } from 'react';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { otrProgramme } from '../data/otrProgramme';
import {
  buildQcmBankIndex,
  fetchQcmBankIndex,
  fetchQcmChapter,
  type QcmBankEntry,
  type QcmBankIndexEntry,
} from '../lib/qcmBank';

type QuizQuestion = {
  entry: QcmBankEntry;
  options: Array<{ label: string; correct: boolean; key: string }>;
};

type QuizSession = {
  queue: QuizQuestion[];
  index: number;
  selected: string[];
  checked: boolean;
  results: Array<{ question: QuizQuestion; correct: boolean }>;
  complete: boolean;
};

const emptySession = (): QuizSession => ({ queue: [], index: 0, selected: [], checked: false, results: [], complete: false });

function shuffle<T>(values: T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function toQuizQuestion(entry: QcmBankEntry): QuizQuestion {
  return {
    entry,
    options: entry.options.map((option, index) => ({
      label: `${option.l}. ${option.t}`,
      correct: option.c,
      key: String(index),
    })),
  };
}

export function QcmBankPage() {
  const [indexEntries, setIndexEntries] = useState<QcmBankIndexEntry[] | null>(null);
  const [error, setError] = useState('');
  const [otrFilter, setOtrFilter] = useState('ALL');
  const [openModule, setOpenModule] = useState<string | null>(null);
  const [chapter, setChapter] = useState<{ module: string; chapter: string } | null>(null);
  const [questions, setQuestions] = useState<QcmBankEntry[] | null>(null);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [session, setSession] = useState<QuizSession>(emptySession);

  useEffect(() => {
    let active = true;
    fetchQcmBankIndex()
      .then((entries) => { if (active) setIndexEntries(entries); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);

  const bankIndex = useMemo(() => (indexEntries ? buildQcmBankIndex(indexEntries) : null), [indexEntries]);

  // Chapters visibles selon le filtre sujet OTR
  const visibleModules = useMemo(() => {
    if (!bankIndex || !indexEntries) return [];
    const allowed = otrFilter === 'ALL' ? null : new Set((bankIndex.chaptersByOtr.get(Number(otrFilter)) ?? []).map((c) => `${c.module}::${c.chapter}`));
    const result: Array<{ module: string; chapters: Array<{ name: string; count: number }> }> = [];
    for (const [module, chapters] of bankIndex.tree) {
      const filtered = [...chapters.entries()]
        .filter(([name]) => !allowed || allowed.has(`${module}::${name}`))
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      if (filtered.length) result.push({ module, chapters: filtered });
    }
    return result.sort((a, b) => b.chapters.reduce((s, c) => s + c.count, 0) - a.chapters.reduce((s, c) => s + c.count, 0));
  }, [bankIndex, indexEntries, otrFilter]);

  const otrOptions = useMemo(() => {
    if (!bankIndex) return [];
    return otrProgramme.filter((entry) => bankIndex.chaptersByOtr.has(entry.number));
  }, [bankIndex]);

  const selectChapter = (module: string, name: string) => {
    setChapter({ module, chapter: name });
    setQuestions(null);
    setRevealed(new Set());
    setSession(emptySession());
    setQuestionsLoading(true);
    fetchQcmChapter(module, name)
      .then(setQuestions)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setQuestionsLoading(false));
  };

  const chapterQuestions = questions ?? [];
  const correctedCount = chapterQuestions.filter((q) => q.corrected).length;

  const startQuiz = () => {
    const pool = shuffle(chapterQuestions.filter((q) => q.corrected).map(toQuizQuestion));
    setSession({ ...emptySession(), queue: pool });
  };

  const { queue, index, selected, checked, results, complete } = session;
  const current = queue[index];

  const isCorrect = (question: QuizQuestion, answers: string[]) => {
    const correctKeys = question.options.flatMap((option, optionIndex) => option.correct ? [String(optionIndex)] : []);
    const picked = new Set(answers);
    return picked.size === correctKeys.length && correctKeys.every((key) => picked.has(key));
  };

  const submitOrNext = () => {
    if (!current) return;
    if (!checked) {
      setSession((previous) => ({
        ...previous,
        results: [...previous.results, { question: current, correct: isCorrect(current, selected) }],
        checked: true,
      }));
      return;
    }
    setSession((previous) => {
      if (index + 1 >= queue.length) return { ...previous, complete: true };
      return { ...previous, index: index + 1, selected: [], checked: false };
    });
  };

  const toggleReveal = (id: number) => {
    setRevealed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap practice-wrap">
        <section className="panel practice-overview">
          <p className="eyebrow">Banque d'annales OTR · questions corrigées</p>
          <h1>Banque QCM</h1>
          <p className="muted">
            {indexEntries
              ? `${bankIndex?.total ?? 0} questions réelles des annales et auto-évaluations OTR, classées par module et chapitre. Utilisez-les pour viser ce qui tombe au concours.`
              : 'Chargement de la banque…'}
          </p>
          {error && <p className="notice error" role="alert">{error}</p>}
          <div className="practice-controls">
            <label>
              <span className="field-label">Sujet OTR</span>
              <select value={otrFilter} onChange={(event) => { setOtrFilter(event.target.value); setOpenModule(null); setChapter(null); setQuestions(null); setSession(emptySession()); }}>
                <option value="ALL">Tous les modules</option>
                {otrOptions.map((entry) => <option key={entry.number} value={String(entry.number)}>N° {entry.number} · {entry.title}</option>)}
              </select>
            </label>
          </div>
        </section>

        <div className="qcm-layout">
          <section className="panel qcm-tree" aria-label="Modules et chapitres">
            {!indexEntries && !error && <p className="muted" role="status">Chargement…</p>}
            {visibleModules.map(({ module, chapters }) => {
              const total = chapters.reduce((sum, c) => sum + c.count, 0);
              const open = openModule === module;
              return (
                <div key={module} className="qcm-module">
                  <button type="button" className="qcm-module-btn" onClick={() => setOpenModule(open ? null : module)} aria-expanded={open}>
                    <span>{module}</span>
                    <span className="muted">{total} question{total > 1 ? 's' : ''}</span>
                  </button>
                  {open && (
                    <ul className="qcm-chapters">
                      {chapters.map(({ name, count }) => (
                        <li key={name}>
                          <button
                            type="button"
                            className={`qcm-chapter-btn ${chapter?.module === module && chapter.chapter === name ? 'active' : ''}`}
                            onClick={() => selectChapter(module, name)}
                          >
                            <span>{name}</span>
                            <span className="muted">{count}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>

          <section className="qcm-detail">
            {!chapter && <section className="panel"><p className="muted">Sélectionnez un chapitre pour parcourir ses questions d'annales.</p></section>}
            {chapter && questionsLoading && <section className="panel"><p className="muted" role="status">Chargement des questions…</p></section>}
            {chapter && !questionsLoading && questions && (
              <>
                <section className="panel">
                  <div className="practice-question-topline">
                    <div>
                      <p className="eyebrow">{chapter.module} · {chapter.chapter}</p>
                      <h2>{chapter.chapter}</h2>
                    </div>
                    <button type="button" className="btn" disabled={correctedCount === 0} onClick={startQuiz}>
                      Quiz · {correctedCount} corrigée{correctedCount > 1 ? 's' : ''}
                    </button>
                  </div>
                  {correctedCount === 0 && <p className="muted">Aucune question corrigée dans ce chapitre — parcours uniquement.</p>}
                </section>

                {current && !complete && (
                  <article className="panel practice-question" aria-live="polite">
                    <div className="practice-question-topline">
                      <p className="eyebrow">Question {index + 1} / {queue.length} · annale réelle</p>
                      <span className="practice-step-count">{results.filter((r) => r.correct).length} justes</span>
                    </div>
                    <div className="study-session-track" aria-label={`Progression : ${index + 1} sur ${queue.length}`}><span style={{ width: `${(((index + (checked ? 1 : 0)) / queue.length) * 100)}%` }} /></div>
                    {current.entry.context && <p className="muted">{current.entry.context}</p>}
                    <h3 className="question-text">{current.entry.stem}</h3>
                    {current.entry.sources.length > 0 && <p className="muted">Source : {current.entry.sources.join(' ; ')}</p>}
                    <fieldset className="option-list" disabled={checked}>
                      <legend className="sr-only">Choisissez une ou plusieurs réponses</legend>
                      {current.options.map((option, optionIndex) => {
                        const value = String(optionIndex);
                        const isSelected = selected.includes(value);
                        return (
                          <label key={value} className={`option-row ${checked && option.correct ? 'option-correct' : ''} ${checked && isSelected && !option.correct ? 'option-incorrect' : ''}`}>
                            <input
                              type="checkbox"
                              name={String(current.entry.bank_id)}
                              checked={isSelected}
                              onChange={() => setSession((previous) => ({
                                ...previous,
                                selected: isSelected ? previous.selected.filter((item) => item !== value) : [...previous.selected, value],
                              }))}
                            />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </fieldset>
                    {checked && (
                      <p className={results.at(-1)?.correct ? 'notice success' : 'notice error'} role="status">
                        {results.at(-1)?.correct ? 'Bonne réponse.' : 'Réponse incorrecte.'}
                        {current.entry.justification ? ` ${current.entry.justification}` : ''}
                      </p>
                    )}
                    <button className="btn" type="button" onClick={submitOrNext}>
                      {!checked ? 'Vérifier' : index + 1 === queue.length ? 'Terminer' : 'Question suivante →'}
                    </button>
                  </article>
                )}

                {complete && (
                  <section className="panel">
                    <p className="eyebrow">Session terminée</p>
                    <h2>{results.filter((r) => r.correct).length} / {results.length} bonnes réponses</h2>
                    <div className="btn-row">
                      <button type="button" className="btn" onClick={startQuiz}>Recommencer</button>
                      <button type="button" className="btn ghost" onClick={() => setSession(emptySession())}>Voir les questions</button>
                    </div>
                    {results.filter((r) => !r.correct).map(({ question }) => (
                      <article key={question.entry.bank_id} className="card">
                        <h3 className="question-text">{question.entry.stem}</h3>
                        <p>{question.options.filter((o) => o.correct).map((o) => o.label).join(' · ')}</p>
                        {question.entry.justification && <p className="muted">{question.entry.justification}</p>}
                      </article>
                    ))}
                  </section>
                )}

                {!queue.length && !complete && chapterQuestions.map((q) => {
                  const showCorrection = revealed.has(q.id);
                  return (
                    <article key={q.id} className="panel qcm-question">
                      <div className="practice-question-topline">
                        <p className="eyebrow">
                          Q{q.bank_id}{q.star ? ' ⭐' : ''}{q.corrected ? ' · corrigée' : ' · sans corrigé'}
                        </p>
                        <button type="button" className="btn ghost" onClick={() => toggleReveal(q.id)}>
                          {showCorrection ? 'Masquer' : 'Correction'}
                        </button>
                      </div>
                      {q.context && <p className="muted">{q.context}</p>}
                      <h3 className="question-text">{q.stem}</h3>
                      <ul className="qcm-options">
                        {q.options.map((option) => (
                          <li key={option.l} className={showCorrection && option.c ? 'qcm-option-correct' : ''}>
                            <strong>{option.l}.</strong> {option.t}
                            {showCorrection && option.c ? ' ✅' : ''}
                          </li>
                        ))}
                      </ul>
                      {showCorrection && q.justification && <p className="notice">{q.justification}</p>}
                      {q.sources.length > 0 && <p className="muted">Source : {q.sources.join(' ; ')}</p>}
                    </article>
                  );
                })}
              </>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
