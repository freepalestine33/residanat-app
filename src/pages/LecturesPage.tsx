import React, { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, BrainCircuit, Check, FolderPlus, Search, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { useLectureStore } from '../stores/lectureStore';
import { coreTabs } from '../components/layout/tabs';
import { otrProgramme } from '../data/otrProgramme';
import { db, type QuizResult, type UserModule } from '../db/db';
import { isCustomModuleComplete, lectureCompletionPercent } from '../lib/lectureCompletion';
import { reviewedCountByLecture } from '../lib/srs';
import { deleteUserLecture } from '../lib/userLectureActions';
import { createUserModule, moveUserLecture } from '../lib/userModules';
import type { LectureMeta } from '../types/lecture';

const AiLectureGeneratorModal = lazy(() => import('../components/lecture/AiLectureGeneratorModal').then((module) => ({ default: module.AiLectureGeneratorModal })));

const CourseProgressRing: React.FC<{ percent: number }> = ({ percent }) => {
  const gradientId = useId();
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const complete = value >= 100;

  return (
    <span
      className={complete ? 'course-progress-ring is-complete' : 'course-progress-ring'}
      role="img"
      aria-label={`Progression : ${value} %`}
      title={`${value} % terminé`}
    >
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent-2, var(--accent))" />
          </linearGradient>
        </defs>
        <circle className="course-progress-ring-track" cx="22" cy="22" r={radius} />
        <circle
          className="course-progress-ring-value"
          cx="22"
          cy="22"
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 100)}
        />
      </svg>
      <span className="course-progress-ring-label">
        {complete ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : <>{value}<small>%</small></>}
      </span>
    </span>
  );
};

function normalizeSearch(value: string) {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr');
}

export const LecturesPage: React.FC = () => {
  const { lectures, loadLectures, loading, error } = useLectureStore();
  const [modules, setModules] = useState<UserModule[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [interactiveOnly, setInteractiveOnly] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiModalOtr, setAiModalOtr] = useState<number | undefined>(undefined);
  const [reviewedByLecture, setReviewedByLecture] = useState<Map<string, number>>(new Map());
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [deletingLectureId, setDeletingLectureId] = useState<string | null>(null);
  const [movingLectureId, setMovingLectureId] = useState<string | null>(null);
  const [moduleName, setModuleName] = useState('');
  const [creatingModule, setCreatingModule] = useState(false);
  const [operationError, setOperationError] = useState('');

  const refreshModules = () => db.modules.toArray().then(setModules);

  useEffect(() => {
    void loadLectures();
    void refreshModules().catch((reason: unknown) => setOperationError(reason instanceof Error ? reason.message : String(reason)));
    const onModulesUpdated = () => { void refreshModules(); };
    window.addEventListener('residanat:modules-updated', onModulesUpdated);
    return () => window.removeEventListener('residanat:modules-updated', onModulesUpdated);
  }, [loadLectures]);

  const removeLecture = async (lecture: LectureMeta) => {
    if (!lecture.isUserCreated || !lecture.userLectureId || deletingLectureId) return;
    if (!window.confirm(`Supprimer « ${lecture.name} » ? Ce cours sera supprimé de vos appareils synchronisés.`)) return;
    setOperationError('');
    setDeletingLectureId(lecture.userLectureId);
    try {
      await deleteUserLecture(lecture.userLectureId);
      await loadLectures();
    } catch (reason) {
      setOperationError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setDeletingLectureId(null);
    }
  };

  const moveLecture = async (lecture: LectureMeta, moduleId: string | null) => {
    if (!lecture.isUserCreated || !lecture.userLectureId || movingLectureId) return;
    setOperationError('');
    setMovingLectureId(lecture.userLectureId);
    try {
      await moveUserLecture(lecture.userLectureId, moduleId);
      await loadLectures();
    } catch (reason) {
      setOperationError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setMovingLectureId(null);
    }
  };

  const handleCreateModule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatingModule(true);
    setOperationError('');
    try {
      const created = await createUserModule(moduleName);
      await refreshModules();
      setModuleName('');
      setSelectedModuleId(created.id);
      setQuery('');
      setInteractiveOnly(false);
    } catch (reason) {
      setOperationError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setCreatingModule(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([reviewedCountByLecture(), db.quizResults.toArray()])
      .then(([counts, results]) => {
        if (!active) return;
        setReviewedByLecture(counts);
        setQuizResults(results);
      })
      .catch((reason: unknown) => {
        console.error('Could not load course completion progress.', reason);
      });
    return () => { active = false; };
  }, [lectures]);

  const progressPercent = (lecture: LectureMeta) => lectureCompletionPercent(
    lecture,
    reviewedByLecture.get(lecture.id) ?? 0,
    quizResults,
  );
  const moduleIsComplete = (moduleId: string) => {
    const moduleLectures = lectures.filter((lecture) => lecture.isUserCreated && lecture.moduleId === moduleId);
    return isCustomModuleComplete(moduleLectures.map(progressPercent));
  };

  const term = normalizeSearch(query);
  const visibleTopics = useMemo(() => otrProgramme.filter((topic) => {
    const lecture = lectures.find((item) => item.moduleId == null && (item.id === topic.lectureId || item.otrNumber === topic.number));
    if (interactiveOnly && !(lecture && lecture.cards > 0)) return false;
    return !term || normalizeSearch(`${topic.number} ${topic.title}`).includes(term);
  }), [interactiveOnly, lectures, term]);

  const otherOtrLectures = useMemo(() => lectures.filter((lecture) =>
    lecture.isUserCreated &&
    lecture.moduleId == null &&
    !otrProgramme.some((topic) => topic.lectureId === lecture.id || topic.number === lecture.otrNumber) &&
    (!term || normalizeSearch(lecture.name).includes(term)),
  ), [lectures, term]);
  const customModuleLectures = useMemo(() => lectures.filter((lecture) =>
    lecture.isUserCreated &&
    lecture.moduleId === selectedModuleId &&
    (!term || normalizeSearch(lecture.name).includes(term)),
  ), [lectures, selectedModuleId, term]);
  const moduleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lecture of lectures) {
      if (lecture.isUserCreated && lecture.moduleId) counts.set(lecture.moduleId, (counts.get(lecture.moduleId) ?? 0) + 1);
    }
    return counts;
  }, [lectures]);
  const selectedModule = modules.find((module) => module.id === selectedModuleId);

  const renderUserActions = (lecture: LectureMeta) => (
    <>
      <div className="course-actions">
        <Link to={`/lecture/${lecture.id}?tab=cards`}>Cartes</Link>
        <Link to={`/lecture/${lecture.id}?tab=quiz`}>Quiz</Link>
        <Link to={`/lecture/${lecture.id}?tab=vf`}>Vrai / faux</Link>
        {lecture.isUserCreated && (
          <label className="course-move-control">
            <span className="sr-only">Déplacer {lecture.name} vers un autre module</span>
            <select
              aria-label={`Déplacer ${lecture.name} vers un autre module`}
              value={lecture.moduleId ?? ''}
              disabled={movingLectureId === lecture.userLectureId}
              onChange={(event) => void moveLecture(lecture, event.target.value || null)}
            >
              <option value="">OTR · programme officiel</option>
              {modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
            </select>
          </label>
        )}
        {lecture.isUserCreated && (
          <button
            type="button"
            className="course-delete"
            disabled={deletingLectureId === lecture.userLectureId}
            onClick={() => void removeLecture(lecture)}
          >
            <Trash2 size={14} aria-hidden="true" />
            {deletingLectureId === lecture.userLectureId ? 'Suppression…' : 'Supprimer'}
          </button>
        )}
      </div>
      {movingLectureId === lecture.userLectureId && <p className="muted course-operation-status" role="status">Déplacement…</p>}
    </>
  );

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap library-wrap">
        <section className="library-heading">
          <div className="page-title-block">
            <p className="eyebrow">Votre bibliothèque de cours</p>
            <h1>{selectedModule ? selectedModule.name : 'Vos collections de révision'}</h1>
            <p className="muted">
              {selectedModule
                ? `${moduleCounts.get(selectedModule.id) ?? 0} cours dans ce module personnel`
                : `${lectures.filter((lecture) => lecture.moduleId == null && lecture.cards > 0).length} séances interactives dans la collection OTR intégrée.`}
            </p>
          </div>
          <div className="library-tools" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', padding: '0.55rem 1rem' }}
              onClick={() => {
                setAiModalOtr(undefined);
                setIsAiModalOpen(true);
              }}
            >
              <BrainCircuit size={16} /> Générer un cours par IA (PDF)
            </button>
            <label className="library-search" style={{ margin: 0 }}>
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Rechercher un cours</span>
              <input
                id="lecture-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={selectedModule ? `Rechercher dans ${selectedModule.name}…` : 'Rechercher dans OTR…'}
              />
            </label>
            {!selectedModule && (
              <label className="check-filter library-interactive-filter">
                <input type="checkbox" checked={interactiveOnly} onChange={(event) => setInteractiveOnly(event.target.checked)} />
                Cours avec cartes interactives uniquement
              </label>
            )}
          </div>
        </section>

        <section className="module-library-controls" aria-label="Collections de cours">
          <div className="module-section-list" role="group" aria-label="Choisir une collection">
            <button
              type="button"
              className={`module-section-button${selectedModuleId === null ? ' is-active' : ''}`}
              aria-pressed={selectedModuleId === null}
              onClick={() => { setSelectedModuleId(null); setInteractiveOnly(false); }}
            >
              <span><strong>Programme OTR</strong><small>Collection intégrée</small></span>
              <span className="module-section-count">{otrProgramme.length + otherOtrLectures.length}</span>
            </button>
            {modules.map((module) => {
              const finished = moduleIsComplete(module.id);
              return (
                <button
                  type="button"
                  key={module.id}
                  className={`module-section-button${selectedModuleId === module.id ? ' is-active' : ''}`}
                  aria-pressed={selectedModuleId === module.id}
                  onClick={() => { setSelectedModuleId(module.id); setInteractiveOnly(false); }}
                >
                  <span>
                    <strong>{module.name}</strong>
                    <small>Module personnel</small>
                    {finished && <small className="module-finished-status" role="status">Module terminé</small>}
                  </span>
                  <span className="module-section-count">{moduleCounts.get(module.id) ?? 0}</span>
                </button>
              );
            })}
          </div>
          <form className="module-create-form" onSubmit={(event) => void handleCreateModule(event)}>
            <label className="field-label" htmlFor="new-module-name">Créer un module personnel</label>
            <div className="module-create-fields">
              <input
                id="new-module-name"
                type="text"
                value={moduleName}
                maxLength={60}
                onChange={(event) => setModuleName(event.target.value)}
                placeholder="Ex. Pédiatrie"
                aria-describedby={operationError ? 'module-create-error' : undefined}
              />
              <button className="btn ghost btn-sm" type="submit" disabled={creatingModule}>
                <FolderPlus size={15} aria-hidden="true" />
                {creatingModule ? 'Création…' : 'Créer'}
              </button>
            </div>
          </form>
        </section>

        <section className="library-results" aria-label={selectedModule ? `Cours du module ${selectedModule.name}` : 'Programme des cours OTR'}>
          {loading && <p className="muted" role="status">Chargement des cours interactifs…</p>}
          {error && <p className="notice error" role="alert">Impossible de charger les cours : {error}</p>}
          {operationError && <p id="module-create-error" className="notice error" role="alert">Impossible de modifier la bibliothèque : {operationError}</p>}

          {!selectedModule && <>
            <div className="library-section-heading">
              <div><p className="eyebrow">Collection intégrée</p><h2>Programme officiel OTR</h2></div>
              <span className="muted">{visibleTopics.length} cours affichés</span>
            </div>
            {interactiveOnly && visibleTopics.length === 0 && (
              <p className="library-empty"><BookOpen size={20} aria-hidden="true" />Aucun cours interactif ne correspond à cette recherche.</p>
            )}
            {!interactiveOnly && visibleTopics.length === 0 && (
              <p className="library-empty"><BookOpen size={20} aria-hidden="true" />Aucun cours ne correspond à cette recherche.</p>
            )}
            <div className="course-grid library-course-grid">
              {visibleTopics.map((topic) => {
                const lecture = lectures.find((item) => item.moduleId == null && (item.id === topic.lectureId || item.otrNumber === topic.number));
                return <article key={topic.number} className={lecture ? 'course-card' : 'course-card course-card-coming-soon'}>
                  <div className="course-card-topline">
                    <span className="course-index">{String(topic.number).padStart(2, '0')}</span>
                    <div className="course-card-topline-right">
                      {lecture && <CourseProgressRing percent={progressPercent(lecture)} />}
                      {lecture ? (
                        <Link className="course-open" to={`/lecture/${lecture.id}`} aria-label={`Ouvrir ${topic.title}`}>
                          <ArrowRight size={16} aria-hidden="true" />
                        </Link>
                      ) : <span className="course-coming-soon">Bientôt</span>}
                    </div>
                  </div>
                  <h2 className="course-title">{topic.title}</h2>
                  {lecture ? (
                    <>
                      <p className="course-counts">
                        <span>{lecture.cards} cartes</span><span aria-hidden="true">·</span>
                        <span>{lecture.quiz} quiz</span><span aria-hidden="true">·</span>
                        <span>{lecture.vf} vrai / faux</span>
                      </p>
                      {renderUserActions(lecture)}
                    </>
                  ) : (
                    <>
                      <p className="course-coming-soon-copy">Les cartes et exercices interactifs seront ajoutés bientôt.</p>
                      <button
                        type="button"
                        className="btn ghost btn-sm"
                        style={{ marginTop: '0.5rem', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', fontSize: '0.8rem' }}
                        onClick={() => {
                          setAiModalOtr(topic.number);
                          setIsAiModalOpen(true);
                        }}
                      >
                        <BrainCircuit size={14} /> Créer avec l'IA (PDF)
                      </button>
                    </>
                  )}
                </article>;
              })}
            </div>
            {otherOtrLectures.length > 0 && (
              <section className="other-lectures-section">
                <div className="library-section-heading">
                  <div><p className="eyebrow">Cours personnels sans module</p><h2>Autres cours OTR</h2></div>
                  <span className="muted">{otherOtrLectures.length} cours</span>
                </div>
                <div className="course-grid library-course-grid">
                  {otherOtrLectures.map((lecture) => (
                    <article key={lecture.id} className="course-card">
                      <div className="course-card-topline">
                        <span className="course-index">OTR</span>
                        <div className="course-card-topline-right">
                          <CourseProgressRing percent={progressPercent(lecture)} />
                          <Link className="course-open" to={`/lecture/${lecture.id}`} aria-label={`Ouvrir ${lecture.name}`}>
                            <ArrowRight size={16} aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                      <Link className="text-link course-title-link" to={`/lecture/${lecture.id}`}><h2>{lecture.name}</h2></Link>
                      <p className="course-counts">
                        <span>{lecture.cards} cartes</span><span aria-hidden="true">·</span>
                        <span>{lecture.quiz} quiz</span><span aria-hidden="true">·</span>
                        <span>{lecture.vf} vrai / faux</span>
                      </p>
                      {renderUserActions(lecture)}
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>}

          {selectedModule && (
            <>
              <div className="library-section-heading">
                <div>
                  <p className="eyebrow">Module personnel · privé et synchronisé</p>
                  <h2>{selectedModule.name}</h2>
                  {moduleIsComplete(selectedModule.id) && <p className="module-finished-status" role="status">Module terminé · tous les cours sont complets</p>}
                </div>
                <span className="muted">{customModuleLectures.length} cours affichés</span>
              </div>
              {customModuleLectures.length === 0 ? (
                <p className="library-empty">
                  <BookOpen size={20} aria-hidden="true" />
                  {term ? 'Aucun cours ne correspond à cette recherche.' : 'Ce module est encore vide. Générez un cours pour commencer.'}
                </p>
              ) : (
                <div className="course-grid library-course-grid">
                  {customModuleLectures.map((lecture) => (
                    <article key={lecture.id} className="course-card">
                      <div className="course-card-topline">
                        <span className="course-index">{String(lecture.cards).padStart(2, '0')} cartes</span>
                        <div className="course-card-topline-right">
                          <CourseProgressRing percent={progressPercent(lecture)} />
                          <Link className="course-open" to={`/lecture/${lecture.id}`} aria-label={`Ouvrir ${lecture.name}`}>
                            <ArrowRight size={16} aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                      <Link className="text-link course-title-link" to={`/lecture/${lecture.id}`}><h2>{lecture.name}</h2></Link>
                      <p className="course-counts">
                        <span>{lecture.cards} cartes</span><span aria-hidden="true">·</span>
                        <span>{lecture.quiz} quiz</span><span aria-hidden="true">·</span>
                        <span>{lecture.vf} vrai / faux</span>
                      </p>
                      {renderUserActions(lecture)}
                    </article>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      </main>

      {isAiModalOpen && (
        <Suspense fallback={null}>
          <AiLectureGeneratorModal
            isOpen
            onClose={() => setIsAiModalOpen(false)}
            initialOtrNumber={aiModalOtr}
            initialModuleId={selectedModuleId ?? undefined}
          />
        </Suspense>
      )}
    </>
  );
};
