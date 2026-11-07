import React from 'react';
import { BookOpen, ChevronDown, ChevronUp, Volume2, VolumeX } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProgressStore, useSettingsStore } from '../../stores';
import { SyncStatus } from './SyncStatus';

export const Header: React.FC = () => {
  const { dueCount, matureCount, errorCount, streak, progressPercent } = useProgressStore();
  const { headerCollapsed, toggleHeader, soundEnabled, toggleSound } = useSettingsStore();

  if (headerCollapsed) {
    return (
      <header className="app-header app-header-collapsed">
        <div className="app-header-inner collapsed-inner">
          <Link className="brand-lockup" to="/" aria-label="Résidanat, accueil">
            <span className="brand-mark"><BookOpen size={19} strokeWidth={1.8} /></span>
            <span className="brand-name">Résidanat</span>
          </Link>
          <div className="collapsed-summary">
            <span><strong>{dueCount}</strong> à revoir</span>
            <span className="summary-divider" aria-hidden="true" />
            <span><strong>{progressPercent}%</strong> progressé</span>
          </div>
          <SyncStatus />
          <button className="icon-button" onClick={toggleHeader} type="button" aria-label="Afficher l’en-tête">
            <ChevronDown size={17} />
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link className="brand-lockup" to="/" aria-label="Résidanat, accueil">
          <span className="brand-mark"><BookOpen size={19} strokeWidth={1.8} /></span>
          <span>
            <span className="brand-name">Résidanat</span>
            <span className="brand-caption">Smart Learning</span>
          </span>
        </Link>

        <div className="header-progress" aria-label={`Progression ${progressPercent}%`}>
          <div className="header-progress-copy">
            <span>Progression globale</span>
            <strong>{progressPercent}%</strong>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        <div className="header-stats" aria-label="Résumé de votre activité">
          <span className="header-stat"><strong>{dueCount}</strong><span>à revoir</span></span>
          <span className="header-stat"><strong>{matureCount}</strong><span>maîtrisées</span></span>
          <span className="header-stat"><strong>{streak}<small>j</small></strong><span>série</span></span>
          <span className="header-stat header-stat-errors"><strong>{errorCount}</strong><span>erreurs</span></span>
        </div>

        <div className="header-actions">
          <SyncStatus />
          <button
            className="icon-button"
            onClick={toggleSound}
            type="button"
            title={soundEnabled ? 'Désactiver les sons' : 'Activer les sons'}
            aria-label={soundEnabled ? 'Désactiver les sons' : 'Activer les sons'}
          >
            {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
          <button className="icon-button collapse-button" onClick={toggleHeader} type="button" aria-label="Réduire l’en-tête">
            <ChevronUp size={17} />
          </button>
        </div>
      </div>
    </header>
  );
};
