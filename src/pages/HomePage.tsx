import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLectureStore, useProgressStore } from '../stores';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';

export const HomePage: React.FC = () => {
  const { lectures, loadLectures, loading, error } = useLectureStore();
  const { dueCount, loading: statsLoading } = useProgressStore();

  useEffect(() => {
    loadLectures();
  }, [loadLectures]);

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <div className="wrap">
        <section className="panel">
          <p className="eyebrow">Votre espace de révision</p>
          <h2>Apprendre, revoir, progresser.</h2>
          <p className="muted" style={{ marginTop: '0.35rem' }}>
            Retrouvez les cours interactifs et vos révisions espacées.
          </p>
          <div className="btn-row">
            <Link className="btn" to="/study">Commencer à réviser · {dueCount} à revoir</Link>
            <Link className="btn ghost" to="/quiz">Commencer un quiz</Link>
          </div>
        </section>

        <div className="panel">
          <h2>Cours interactifs OTR</h2>
          <p className="muted" style={{ marginBottom: '0.35rem' }}>
            {loading ? 'Chargement des cours…' : `${lectures.length} cours · flashcards, quiz et vrai/faux`}
          </p>
          {error && <p className="notice error" role="alert">Impossible de charger les cours : {error}</p>}
          {!loading && !error && lectures.length === 0 && (
            <p className="muted">Aucun cours disponible pour le moment.</p>
          )}
          <div style={{ marginTop: '1rem' }}>
            {lectures.map((lecture) => (
              <div key={lecture.id} className="card">
                <Link className="text-link" to={`/lecture/${lecture.id}`}>
                  <h3 style={{ fontSize: '0.95rem', marginBottom: '0.3rem' }}>{lecture.name}</h3>
                </Link>
                <p className="muted" style={{ fontSize: '0.75rem' }}>
                  {lecture.cards} cartes · {lecture.quiz} quiz · {lecture.vf} vrai/faux
                </p>
                <div className="btn-row" style={{ marginTop: '0.55rem' }}>
                  <Link className="btn ghost btn-sm" to={`/lecture/${lecture.id}?tab=cards`}>Flashcards</Link>
                  <Link className="btn ghost btn-sm" to={`/lecture/${lecture.id}?tab=quiz`}>Quiz</Link>
                  <Link className="btn ghost btn-sm" to={`/lecture/${lecture.id}?tab=vf`}>Vrai / faux</Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Programme du résidanat</h2>
          <p className="muted" style={{ marginBottom: '0.65rem' }}>
            Consultez les 209 cours et leurs références par spécialité.
          </p>
          <Link className="btn" to="/programme">Explorer le programme</Link>
        </div>
        {statsLoading && <p className="muted" role="status">Mise à jour de la progression…</p>}
      </div>
    </>
  );
};
