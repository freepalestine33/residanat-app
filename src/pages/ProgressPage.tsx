import React from 'react';
import { ArrowRight, Check, Clock3, Flame, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { useProgressStore } from '../stores/progressStore';
import { useErrorStore } from '../stores/errorStore';
import { coreTabs } from '../components/layout/tabs';

export const ProgressPage: React.FC = () => {
  const { dueCount, matureCount, errorCount, streak, progressPercent } = useProgressStore();
  const { errors } = useErrorStore();

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap progress-wrap">
        <section className="progress-overview">
          <div className="progress-title">
            <p className="eyebrow">Votre parcours</p>
            <h1>La progression se construit.</h1>
            <p className="muted">Un aperçu de vos révisions et des points à retravailler.</p>
          </div>
          <div className="progress-summary">
            <div className="progress-summary-ring" style={{ '--progress': `${progressPercent}%` } as React.CSSProperties}>
              <span><strong>{progressPercent}<small>%</small></strong><small>parcouru</small></span>
            </div>
            <div className="progress-summary-note"><Check size={16} /><span><strong>{matureCount}</strong> cartes maîtrisées</span></div>
          </div>
        </section>

        <section className="progress-stat-grid" aria-label="Vos statistiques">
          <article className="progress-stat">
            <span className="progress-stat-icon stat-blue"><Clock3 size={17} /></span>
            <span><strong>{dueCount}</strong><small>À revoir</small></span>
          </article>
          <article className="progress-stat">
            <span className="progress-stat-icon stat-green"><Check size={17} /></span>
            <span><strong>{matureCount}</strong><small>Cartes matures</small></span>
          </article>
          <article className="progress-stat">
            <span className="progress-stat-icon stat-orange"><Flame size={17} /></span>
            <span><strong>{streak}<small>j</small></strong><small>Série actuelle</small></span>
          </article>
          <article className="progress-stat">
            <span className="progress-stat-icon stat-red"><TriangleAlert size={17} /></span>
            <span><strong>{errorCount}</strong><small>Erreurs suivies</small></span>
          </article>
        </section>

        <section className="panel error-journal">
          <div className="section-heading">
            <div><p className="eyebrow">À consolider</p><h2>Carnet d’erreurs</h2></div>
            <span className="pill">{errors.length} enregistrées</span>
          </div>
          {errors.length > 0 ? (
            <div className="error-journal-list">
              {errors.slice(0, 5).map((error, index) => (
                <article key={`${error.ts}-${index}`} className="error-journal-item">
                  <span className="error-journal-mark"><TriangleAlert size={15} /></span>
                  <div className="error-journal-copy">
                    <p>{error.q}</p>
                    <time className="muted" dateTime={new Date(error.ts).toISOString()}>{new Date(error.ts).toLocaleDateString('fr-FR')}</time>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="journal-empty"><span className="empty-check"><Check size={17} /></span><div><strong>Rien à signaler pour le moment.</strong><p className="muted">Les erreurs rencontrées en révision apparaîtront ici.</p></div></div>
          )}
          <Link className="progress-action" to="/study">Continuer à réviser <ArrowRight size={15} /></Link>
        </section>
      </main>
    </>
  );
};
