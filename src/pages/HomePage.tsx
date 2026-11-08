import React, { useEffect } from 'react';
import { ArrowRight, BookOpen, Check, Clock3, Layers3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLectureStore } from '../stores/lectureStore';
import { useProgressStore } from '../stores/progressStore';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';

export const HomePage: React.FC = () => {
  const { lectures, loadLectures, loading, error } = useLectureStore();
  const { dueCount, matureCount, progressPercent, loading: statsLoading } = useProgressStore();

  useEffect(() => {
    loadLectures();
  }, [loadLectures]);

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap home-wrap">
        <section className="home-hero">
          <div className="hero-copy">
            <p className="eyebrow">Votre espace de révision</p>
            <h1>Un pas de plus<br />vers la maîtrise.</h1>
            <p className="hero-description">
              Reprenez là où vous en étiez. Des sessions courtes et régulières font toute la différence.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-lg hero-primary" to="/study">
                <BookOpen size={17} aria-hidden="true" />
                <span>Commencer à réviser</span>
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <span className="hero-due-note">
                <Clock3 size={14} aria-hidden="true" />
                {statsLoading ? 'Mise à jour…' : `${dueCount} carte${dueCount > 1 ? 's' : ''} à revoir`}
              </span>
            </div>
          </div>
          <div className="hero-progress" aria-label={`${progressPercent}% de progression globale`}>
            <span className="hero-progress-label">Votre progression</span>
            <div className="hero-progress-ring" style={{ '--progress': `${progressPercent}%` } as React.CSSProperties}>
              <div className="hero-progress-center">
                <strong>{progressPercent}<small>%</small></strong>
                <span>accompli</span>
              </div>
            </div>
            <span className="hero-progress-caption">
              <Check size={14} aria-hidden="true" />
              {matureCount} cartes maîtrisées
            </span>
          </div>
        </section>

        <section className="home-metrics" aria-label="Résumé de votre activité">
          <div className="metric-item">
            <span className="metric-icon metric-icon-blue"><Clock3 size={17} /></span>
            <span className="metric-copy"><strong>{statsLoading ? '—' : dueCount}</strong><span>À revoir aujourd’hui</span></span>
          </div>
          <div className="metric-item">
            <span className="metric-icon metric-icon-green"><Check size={17} /></span>
            <span className="metric-copy"><strong>{statsLoading ? '—' : matureCount}</strong><span>Cartes maîtrisées</span></span>
          </div>
          <div className="metric-item">
            <span className="metric-icon metric-icon-neutral"><Layers3 size={17} /></span>
            <span className="metric-copy"><strong>{loading ? '—' : lectures.length}</strong><span>Cours disponibles</span></span>
          </div>
        </section>

        <section className="home-section course-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Votre bibliothèque</p>
              <h2>Cours interactifs OTR</h2>
            </div>
            <Link className="text-link section-more" to="/lectures">
              Tous les cours <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <p className="section-description">
            {loading ? 'Chargement des cours…' : `${lectures.length} cours · flashcards, quiz et vrai / faux`}
          </p>
          {error && <p className="notice error" role="alert">Impossible de charger les cours : {error}</p>}
          {!loading && !error && lectures.length === 0 && (
            <p className="empty-library">Aucun cours disponible pour le moment.</p>
          )}
          <div className="course-grid">
            {lectures.map((lecture, index) => (
              <article key={lecture.id} className="course-card">
                <div className="course-card-topline">
                  <span className="course-index">{String(index + 1).padStart(2, '0')}</span>
                  <Link className="course-open" to={`/lecture/${lecture.id}`} aria-label={`Ouvrir ${lecture.name}`}>
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                </div>
                <Link className="text-link course-title-link" to={`/lecture/${lecture.id}`}>
                  <h3>{lecture.name}</h3>
                </Link>
                <p className="course-counts">
                  <span>{lecture.cards} cartes</span><span aria-hidden="true">·</span>
                  <span>{lecture.quiz} quiz</span><span aria-hidden="true">·</span>
                  <span>{lecture.vf} vrai / faux</span>
                </p>
                <div className="course-actions">
                  <Link to={`/lecture/${lecture.id}?tab=cards`}>Flashcards</Link>
                  <Link to={`/lecture/${lecture.id}?tab=quiz`}>Quiz</Link>
                  <Link to={`/lecture/${lecture.id}?tab=vf`}>Vrai / faux</Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="programme-promo">
          <div className="programme-promo-mark"><Layers3 size={20} aria-hidden="true" /></div>
          <div className="programme-promo-copy">
            <p className="eyebrow">Pour aller plus loin</p>
            <h2>Le programme du résidanat</h2>
            <p>Explorez les 209 cours et leurs références par spécialité.</p>
          </div>
          <Link className="btn ghost programme-promo-link" to="/programme">
            Explorer <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      </main>
    </>
  );
};
