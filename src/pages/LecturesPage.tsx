import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, BrainCircuit, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { useLectureStore } from '../stores/lectureStore';
import { coreTabs } from '../components/layout/tabs';
import { otrProgramme } from '../data/otrProgramme';

const AiLectureGeneratorModal = lazy(() => import('../components/lecture/AiLectureGeneratorModal').then((module) => ({ default: module.AiLectureGeneratorModal })));

export const LecturesPage: React.FC = () => {
  const { lectures, loadLectures, loading, error } = useLectureStore();
  const [query, setQuery] = useState('');
  const [interactiveOnly, setInteractiveOnly] = useState(false);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiModalOtr, setAiModalOtr] = useState<number | undefined>(undefined);

  useEffect(() => { void loadLectures(); }, [loadLectures]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('fr');
    return otrProgramme.filter((topic) => {
      if (interactiveOnly && !lectures.some((lecture) => (lecture.id === topic.lectureId || lecture.otrNumber === topic.number) && lecture.cards > 0)) return false;
      return !term || `${topic.number} ${topic.title}`.toLocaleLowerCase('fr').includes(term);
    });
  }, [interactiveOnly, lectures, query]);

  const interactiveCount = otrProgramme.filter((topic) => lectures.some((lecture) => (lecture.id === topic.lectureId || lecture.otrNumber === topic.number) && lecture.cards > 0)).length;
  const otherLectures = lectures.filter((lecture) => !otrProgramme.some((topic) => topic.lectureId === lecture.id));

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap library-wrap">
        <section className="library-heading">
          <div className="page-title-block">
            <p className="eyebrow">Votre bibliothèque OTR</p>
            <h1>Les 43 cours du programme</h1>
            <p className="muted">{interactiveCount} séances interactives · {otrProgramme.length - interactiveCount} cours bientôt disponibles.</p>
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
              <input id="lecture-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher parmi les cours OTR…" />
            </label>
            <label className="check-filter library-interactive-filter">
              <input type="checkbox" checked={interactiveOnly} onChange={(event) => setInteractiveOnly(event.target.checked)} />
              Cours avec cartes interactives uniquement
            </label>
          </div>
        </section>
        <section className="library-results" aria-label="Programme des cours OTR">
          {loading && <p className="muted" role="status">Chargement des cours interactifs…</p>}
          {error && <p className="notice error" role="alert">Impossible de charger les cours : {error}</p>}
          {!loading && !error && visible.length === 0 && (
            <p className="library-empty"><BookOpen size={20} aria-hidden="true" />Aucun cours ne correspond à cette recherche.</p>
          )}
          <div className="course-grid library-course-grid">
            {visible.map((topic) => {
              const lecture = lectures.find((item) => item.id === topic.lectureId || item.otrNumber === topic.number);
              return <article key={topic.number} className={lecture ? 'course-card' : 'course-card course-card-coming-soon'}>
                <div className="course-card-topline">
                  <span className="course-index">{String(topic.number).padStart(2, '0')}</span>
                  {lecture ? (
                    <Link className="course-open" to={`/lecture/${lecture.id}`} aria-label={`Ouvrir ${topic.title}`}>
                      <ArrowRight size={16} aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="course-coming-soon">Bientôt</span>
                  )}
                </div>
                <h2 className="course-title">{topic.title}</h2>
                {lecture ? (
                  <>
                    <p className="course-counts">
                      <span>{lecture.cards} cartes</span><span aria-hidden="true">·</span>
                      <span>{lecture.quiz} quiz</span><span aria-hidden="true">·</span>
                      <span>{lecture.vf} vrai / faux</span>
                    </p>
                    <div className="course-actions">
                      <Link to={`/lecture/${lecture.id}?tab=cards`}>Cartes</Link>
                      <Link to={`/lecture/${lecture.id}?tab=quiz`}>Quiz</Link>
                      <Link to={`/lecture/${lecture.id}?tab=vf`}>Vrai / faux</Link>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="course-coming-soon-copy">Les cartes et exercices interactifs seront ajoutés bientôt.</p>
                    <button
                      type="button"
                      className="btn ghost btn-sm"
                      style={{
                        marginTop: '0.5rem',
                        width: '100%',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.35rem',
                        fontSize: '0.8rem',
                      }}
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
          {otherLectures.length > 0 && (
            <section className="other-lectures-section">
              <h2>Autres cours interactifs</h2>
              <div className="course-grid library-course-grid">
                {otherLectures.map((lecture) => (
                  <article key={lecture.id} className="course-card">
                    <div className="course-card-topline">
                      <span className="course-index">OTR</span>
                      <Link className="course-open" to={`/lecture/${lecture.id}`} aria-label={`Ouvrir ${lecture.name}`}>
                        <ArrowRight size={16} aria-hidden="true" />
                      </Link>
                    </div>
                    <Link className="text-link course-title-link" to={`/lecture/${lecture.id}`}>
                      <h2>{lecture.name}</h2>
                    </Link>
                    <p className="course-counts">
                      <span>{lecture.cards} cartes</span><span aria-hidden="true">·</span>
                      <span>{lecture.quiz} quiz</span><span aria-hidden="true">·</span>
                      <span>{lecture.vf} vrai / faux</span>
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}
        </section>
      </main>

      {isAiModalOpen && (
        <Suspense fallback={null}>
          <AiLectureGeneratorModal
            isOpen
            onClose={() => setIsAiModalOpen(false)}
            initialOtrNumber={aiModalOtr}
          />
        </Suspense>
      )}
    </>
  );
};
