import React from 'react';
import { useProgressStore, useSettingsStore } from '../../stores';
import { SyncStatus } from './SyncStatus';

export const Header: React.FC = () => {
  const { dueCount, matureCount, errorCount, streak, progressPercent } = useProgressStore();
  const { headerCollapsed, toggleHeader, soundEnabled, toggleSound } = useSettingsStore();

  const collapsedStyle = {
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: '0.5rem',
    padding: '0.35rem 0.85rem',
    background: 'var(--card)',
    borderBottom: '1px solid var(--border)',
    fontSize: '0.72rem',
    color: 'var(--muted)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
  };

  const headerWrapStyle = {
    position: 'sticky' as const,
    top: 0,
    zIndex: 50,
    background: 'rgba(11, 15, 20, 0.85)',
    backdropFilter: 'saturate(160%) blur(18px)',
    WebkitBackdropFilter: 'saturate(160%) blur(18px)',
    borderBottom: '1px solid var(--border)',
  };

  const topbarStyle = {
    background: 'transparent',
    borderBottom: 'none',
    padding: '0.85rem 1.1rem 0.65rem',
    position: 'relative' as const,
  };

  const buttonStyle = {
    position: 'absolute' as const,
    top: '0.55rem',
    right: '0.55rem',
    width: '30px',
    height: '30px',
    border: 'none',
    borderRadius: '50%',
    background: 'var(--card2)',
    color: 'var(--muted)',
    fontSize: '0.8rem',
    cursor: 'pointer',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    zIndex: 2,
  };

  const soundButtonStyle = {
    ...buttonStyle,
    right: '2.4rem',
  };

  const h1Style = {
    fontSize: '1.15rem',
    fontWeight: 650,
    letterSpacing: '-0.03em',
    color: 'var(--text)',
    marginBottom: '0.15rem',
  };

  const subStyle = {
    fontSize: '0.72rem',
    color: 'var(--muted)',
    fontWeight: 400,
    letterSpacing: '-0.01em',
  };

  const progressRowStyle = {
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: '0.55rem',
    marginTop: '0.55rem',
  };

  const statPillsStyle = {
    display: 'flex' as const,
    gap: '0.35rem',
    flexWrap: 'wrap' as const,
    marginTop: '0.45rem',
  };

  if (headerCollapsed) {
    return (
      <div className="header-collapsed-bar" style={collapsedStyle}>
        <span>
          Due <strong>{dueCount}</strong> · <strong>{progressPercent}%</strong>
        </span>
        <SyncStatus />
        <button
          onClick={toggleHeader}
          style={{
            border: '1px solid var(--border)',
            borderRadius: '7px',
            background: 'var(--card2)',
            color: 'var(--text-secondary)',
            padding: '0.25rem 0.7rem',
            fontSize: '0.72rem',
            cursor: 'pointer',
          }}
        >
          ▾ Afficher header
        </button>
      </div>
    );
  }

  return (
    <div className="header-wrap" style={headerWrapStyle}>
      <div className="topbar" style={topbarStyle}>
        <button
          onClick={toggleSound}
          style={soundButtonStyle}
          title={soundEnabled ? 'Sons activés' : 'Sons désactivés'}
        >
          {soundEnabled ? '🔊' : '🔇'}
        </button>

        <button
          onClick={toggleHeader}
          style={buttonStyle}
          title="Réduire le header"
        >
          ▴
        </button>
        <SyncStatus />

        <h1 style={h1Style}>
          Résidanat · Smart Learning
        </h1>
        <div className="sub" style={subStyle}>
          Révision espacée · multi-cours
        </div>

        <div className="progress-row" style={progressRowStyle}>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{progressPercent}%</span>
        </div>

        <div className="stat-pills" style={statPillsStyle}>
          <span className="pill due" title="Révisions dues + nouvelles du jour">
            À revoir : <strong>{dueCount}</strong>
          </span>
          <span className="pill">
            Mature : <strong>{matureCount}</strong>
          </span>
          <span className="pill err">
            Erreurs : <strong>{errorCount}</strong>
          </span>
          <span className="pill">
            Streak : <strong>{streak}</strong>j
          </span>
        </div>
      </div>
    </div>
  );
};
