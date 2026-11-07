import { useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowRight, BookOpen, Check, Clock3, Layers3 } from 'lucide-react';

type PreviewScreen = 'home' | 'study';

export function DesignPreviewPage() {
  const [screen, setScreen] = useState<PreviewScreen>('home');

  return (
    <div className="design-preview">
      <header className="app-header">
        <div className="app-header-inner preview-header-inner">
          <div className="brand-lockup" aria-label="Résidanat, aperçu de design">
            <span className="brand-mark"><BookOpen size={19} strokeWidth={1.8} /></span>
            <span><span className="brand-name">Résidanat</span><span className="brand-caption">Smart Learning</span></span>
          </div>
          <div className="preview-label"><span /> Aperçu design · données fictives</div>
        </div>
      </header>
      <nav className="nav" aria-label="Navigation de l’aperçu">
        <div className="nav-inner">
          <button type="button" className={`nav-link ${screen === 'home' ? 'active' : ''}`} onClick={() => setScreen('home')}>Accueil</button>
          <button type="button" className={`nav-link ${screen === 'study' ? 'active' : ''}`} onClick={() => setScreen('study')}>Révision</button>
          <span className="preview-nav-note">Navigation de démonstration · aucune session ouverte</span>
        </div>
      </nav>
      {screen === 'home' ? (
        <main className="wrap home-wrap">
          <section className="home-hero">
            <div className="hero-copy">
              <p className="eyebrow">Votre espace de révision</p>
              <h1>Un pas de plus<br />vers la maîtrise.</h1>
              <p className="hero-description">Reprenez là où vous en étiez. Des sessions courtes et régulières font toute la différence.</p>
              <div className="hero-actions">
                <button className="btn btn-lg hero-primary" type="button" onClick={() => setScreen('study')}>
                  <BookOpen size={17} aria-hidden="true" /><span>Commencer à réviser</span><ArrowRight size={16} aria-hidden="true" />
                </button>
                <span className="hero-due-note"><Clock3 size={14} aria-hidden="true" />12 cartes à revoir <span className="preview-data-tag">démo</span></span>
              </div>
            </div>
            <div className="hero-progress" aria-label="Progression fictive de démonstration">
              <span className="hero-progress-label">Votre progression</span>
              <div className="hero-progress-ring" style={{ '--progress': '58%' } as CSSProperties}>
                <div className="hero-progress-center"><strong>58<small>%</small></strong><span>accompli</span></div>
              </div>
              <span className="hero-progress-caption"><Check size={14} aria-hidden="true" />42 cartes maîtrisées <span className="preview-data-tag">démo</span></span>
            </div>
          </section>
          <section className="home-metrics" aria-label="Indicateurs fictifs de démonstration">
            <div className="metric-item"><span className="metric-icon metric-icon-blue"><Clock3 size={17} /></span><span className="metric-copy"><strong>12</strong><span>À revoir aujourd’hui</span></span></div>
            <div className="metric-item"><span className="metric-icon metric-icon-green"><Check size={17} /></span><span className="metric-copy"><strong>42</strong><span>Cartes maîtrisées</span></span></div>
            <div className="metric-item"><span className="metric-icon metric-icon-neutral"><Layers3 size={17} /></span><span className="metric-copy"><strong>11</strong><span>Cours disponibles</span></span></div>
          </section>
          <section className="home-section course-section">
            <div className="section-heading"><div><p className="eyebrow">Votre bibliothèque</p><h2>Cours interactifs OTR</h2></div><span className="text-link section-more">Tous les cours <ArrowRight size={15} /></span></div>
            <p className="section-description">Aperçu de la bibliothèque · données non liées à un compte</p>
            <div className="course-grid">
              {['Exemple de cours — Flashcards', 'Exemple de cours — Quiz'].map((name, index) => (
                <article key={name} className="course-card">
                  <div className="course-card-topline"><span className="course-index">0{index + 1}</span><span className="course-open"><ArrowRight size={16} /></span></div>
                  <h3>{name}</h3>
                  <p className="course-counts"><span>24 cartes</span><span aria-hidden="true">·</span><span>8 quiz</span><span aria-hidden="true">·</span><span>12 vrai / faux</span></p>
                  <div className="course-actions"><span>Flashcards</span><span>Quiz</span><span>Vrai / faux</span></div>
                </article>
              ))}
            </div>
          </section>
        </main>
      ) : (
        <main className="wrap study-wrap">
          <section className="panel study-overview">
            <p className="eyebrow">Répétition espacée · FSRS</p>
            <div className="study-heading-row">
              <div><h1>Votre temps de révision.</h1><p className="muted">12 cartes planifiées à revoir aujourd’hui. <span className="preview-data-tag">démo</span></p></div>
              <span className="study-method-mark"><span>FSRS</span><small>révision<br />espacée</small></span>
            </div>
            <p className="muted study-storage-note">Cette vue est un aperçu visuel : aucune carte ne sera enregistrée ou évaluée.</p>
            <div className="btn-row"><button type="button" className="btn" disabled>Aperçu de session</button></div>
          </section>
          <article className="panel study-session study-active-session" aria-label="Carte de démonstration, aucune réponse n’est enregistrée">
            <div className="study-session-topline">
              <div><p className="eyebrow">Session de démonstration</p><p className="muted">Cours exemple · contenu fictif</p></div>
              <span className="study-step-count">01 <span>/ 12</span></span>
            </div>
            <div className="study-session-track" aria-hidden="true"><span style={{ width: '8.3%' }} /></div>
            <h2 className="study-prompt">Aperçu du format d’une carte de révision</h2>
            <div className="answer-block">
              <p>Cette carte de démonstration sert uniquement à montrer la hiérarchie et les commandes de l’interface.</p>
              <p className="muted rating-hint">Quand souhaitez-vous revoir cette carte ?</p>
              <div className="rating-row">{['Encore', 'Difficile', 'Bien', 'Facile'].map((rating) => <button key={rating} type="button" className={`btn rating-${rating.toLowerCase()}`} disabled>{rating}</button>)}</div>
            </div>
          </article>
        </main>
      )}
    </div>
  );
}
