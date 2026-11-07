import React, { useEffect, useMemo, useState } from 'react';
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
      <div className="wrap">
        <div className="panel">
          <h2>Cours interactifs OTR</h2>
          <p className="muted" style={{ marginBottom: '0.65rem' }}>
            {lectures.length} cours · cartes, quiz et vrai/faux reliés aux données importées.
          </p>
          <label className="field-label" htmlFor="lecture-search">Rechercher un cours</label>
          <input id="lecture-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom du cours…" />
          {loading && <p className="muted" role="status">Chargement des cours…</p>}
          {error && <p className="notice error" role="alert">Impossible de charger les cours : {error}</p>}
          {!loading && !error && visible.length === 0 && <p className="muted">Aucun cours ne correspond à cette recherche.</p>}
          <div style={{ marginTop: '1rem' }}>
            {visible.map((lecture) => (
              <div key={lecture.id} className="card">
                <Link className="text-link" to={`/lecture/${lecture.id}`}>
                  <h3 style={{ fontSize: '0.95rem', marginBottom: '0.3rem' }}>{lecture.name}</h3>
                </Link>
                <p className="muted" style={{ fontSize: '0.75rem' }}>
                  {lecture.cards} cartes · {lecture.quiz} quiz · {lecture.vf} vrai/faux
                </p>
                <div className="btn-row">
                  <Link className="btn ghost btn-sm" to={`/lecture/${lecture.id}?tab=cards`}>Cartes</Link>
                  <Link className="btn ghost btn-sm" to={`/lecture/${lecture.id}?tab=quiz`}>Quiz</Link>
                  <Link className="btn ghost btn-sm" to={`/lecture/${lecture.id}?tab=vf`}>Vrai / faux</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};
