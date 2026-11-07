import React from 'react';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { useProgressStore, useErrorStore } from '../stores';
import { coreTabs } from '../components/layout/tabs';

export const ProgressPage: React.FC = () => {
  const { dueCount, matureCount, errorCount, streak, progressPercent } = useProgressStore();
  const { errors } = useErrorStore();

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <div className="wrap">
        <div className="panel">
          <h2>Statistiques</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginTop: '1rem' }}>
            <div className="card">
              <p className="muted">Progression</p>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>{progressPercent}%</p>
            </div>
            <div className="card">
              <p className="muted">Cartes matures</p>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--green)' }}>{matureCount}</p>
            </div>
            <div className="card">
              <p className="muted">Streak</p>
              <p style={{ fontSize: '2rem', fontWeight: 700 }}>{streak}j</p>
            </div>
            <div className="card">
              <p className="muted">À revoir</p>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--orange)' }}>{dueCount}</p>
            </div>
            <div className="card">
              <p className="muted">Erreurs enregistrées</p>
              <p style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--red)' }}>{errorCount}</p>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Carnet d'erreurs</h2>
          <p className="muted" style={{ marginBottom: '0.65rem' }}>
            {errors.length} erreurs enregistrées
          </p>
          {errors.length > 0 ? (
            <div style={{ marginTop: '1rem' }}>
              {errors.slice(0, 5).map((error, index) => (
                <div key={index} className="card">
                  <p style={{ fontSize: '0.9rem' }}>{error.q}</p>
                  <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                    {new Date(error.ts).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Aucune erreur enregistrée</p>
          )}
        </div>
      </div>
    </>
  );
};
