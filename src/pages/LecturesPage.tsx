import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { useLectureStore } from '../stores';
import { coreTabs } from '../components/layout/tabs';
import { otrProgramme } from '../data/otrProgramme';

export const LecturesPage: React.FC = () => {
  const { lectures, loadLectures, loading, error } = useLectureStore();
  const [query, setQuery] = useState('');
  const [interactiveOnly, setInteractiveOnly] = useState(false);
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
          <div className="library-tools">
            <label className="library-search">
              <Search size={17} aria-hidden="true" />
              <span className="sr-only">Rechercher un cours</span>
              <input id="lecture-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher parmi les cours OTR…" />
            </label>
            <label className="check-filter library-interactive-filter"><input type="checkbox" checked={interactiveOnly} onChange={(event) => setInteractiveOnly(event.target.checked)} /> Cours avec cartes interactives uniquement</label>
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
                  {lecture ? <Link className="course-open" to={`/lecture/${lecture.id}`} aria-label={`Ouvrir ${topic.title}`}><ArrowRight size={16} aria-hidden="true" /></Link> : <span className="course-coming-soon">Bientôt</span>}
                </div>
                <h2 className="course-title">{topic.title}</h2>
                {lecture ? <>
                  <p className="course-counts"><span>{lecture.cards} cartes</span><span aria-hidden="true">·</span><span>{lecture.quiz} quiz</span><span aria-hidden="true">·</span><span>{lecture.vf} vrai / faux</span></p>
                  <div className="course-actions">
                    <Link to={`/lecture/${lecture.id}?tab=cards`}>Cartes</Link>
                    <Link to={`/lecture/${lecture.id}?tab=quiz`}>Quiz</Link>
                    <Link to={`/lecture/${lecture.id}?tab=vf`}>Vrai / faux</Link>
                  </div>
                </> : <p className="course-coming-soon-copy">Les cartes et exercices interactifs seront ajoutés bientôt.</p>}
              </article>;
            })}
          </div>
          {otherLectures.length > 0 && <section className="other-lectures-section">
            <h2>Autres cours interactifs</h2>
            <div className="course-grid library-course-grid">
              {otherLectures.map((lecture) => <article key={lecture.id} className="course-card">
                <div className="course-card-topline"><span className="course-index">OTR</span><Link className="course-open" to={`/lecture/${lecture.id}`} aria-label={`Ouvrir ${lecture.name}`}><ArrowRight size={16} aria-hidden="true" /></Link></div>
                <Link className="text-link course-title-link" to={`/lecture/${lecture.id}`}><h2>{lecture.name}</h2></Link>
                <p className="course-counts"><span>{lecture.cards} cartes</span><span aria-hidden="true">·</span><span>{lecture.quiz} quiz</span><span aria-hidden="true">·</span><span>{lecture.vf} vrai / faux</span></p>
              </article>)}
            </div>
          </section>}
        </section>
      </main>
    </>
  );
};
