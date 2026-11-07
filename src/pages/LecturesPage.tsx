import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookOpen, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { useLectureStore } from '../stores';
import { coreTabs } from '../components/layout/tabs';

export const LecturesPage: React.FC = () => {
  const { lectures, loadLectures, loading, error } = useLectureStore();
  const [query, setQuery] = useState('');
  useEffect(() => { void loadLectures(); }, [loadLectures]);
  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('fr');
    return lectures.filter((lecture) => !term || lecture.name.toLocaleLowerCase('fr').includes(term));
  }, [lectures, query]);

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap library-wrap">
        <section className="library-heading">
          <div className="page-title-block">
            <p className="eyebrow">Votre bibliothèque</p>
            <h1>Cours interactifs OTR</h1>
            <p className="muted">{lectures.length} cours · cartes, quiz et vrai/faux reliés aux données importées.</p>
          </div>
          <label className="library-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Rechercher un cours</span>
            <input id="lecture-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un cours…" />
          </label>
        </section>
        <section className="library-results" aria-label="Cours disponibles">
          {loading && <p className="muted" role="status">Chargement des cours…</p>}
          {error && <p className="notice error" role="alert">Impossible de charger les cours : {error}</p>}
          {!loading && !error && visible.length === 0 && (
            <p className="library-empty"><BookOpen size={20} aria-hidden="true" />Aucun cours ne correspond à cette recherche.</p>
          )}
          <div className="course-grid library-course-grid">
            {visible.map((lecture, index) => (
              <article key={lecture.id} className="course-card">
                <div className="course-card-topline">
                  <span className="course-index">{String(index + 1).padStart(2, '0')}</span>
                  <Link className="course-open" to={`/lecture/${lecture.id}`} aria-label={`Ouvrir ${lecture.name}`}>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
                <Link className="text-link course-title-link" to={`/lecture/${lecture.id}`}><h2>{lecture.name}</h2></Link>
                <p className="course-counts"><span>{lecture.cards} cartes</span><span aria-hidden="true">·</span><span>{lecture.quiz} quiz</span><span aria-hidden="true">·</span><span>{lecture.vf} vrai / faux</span></p>
                <div className="course-actions">
                  <Link to={`/lecture/${lecture.id}?tab=cards`}>Flashcards</Link>
                  <Link to={`/lecture/${lecture.id}?tab=quiz`}>Quiz</Link>
                  <Link to={`/lecture/${lecture.id}?tab=vf`}>Vrai / faux</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
};
