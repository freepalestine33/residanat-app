import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { db } from '../db/db';
import { Rating, review } from '../lib/srs';
import { useCardStore, useProgressStore } from '../stores';
import type { Card } from '../types/card';

type StudyCard = { card: Card; lectureId: string; lectureName: string };
const SESSION_SIZE = 20;

export const StudyPage: React.FC = () => {
  const { dueCount, allCards, loading, error, loadCards, refreshDueCount } = useCardStore();
  const { loadStats } = useProgressStore();
  const [queue, setQueue] = useState<StudyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [reviewError, setReviewError] = useState('');

  useEffect(() => { void loadCards(); }, [loadCards]);

  const current = queue[index];
  const remaining = Math.max(0, queue.length - index);
  const startSession = async () => {
    setReviewError('');
    setMessage('');
    try {
      const progress = await db.cards.toArray();
      const byId = new Map(progress.map((item) => [item.gid, item]));
      const due = allCards.filter((item) => {
        const row = byId.get(`${item.lectureId}.${item.card.id}`);
        return row && row.due <= Date.now();
      });
      const fresh = allCards.filter((item) => !byId.has(`${item.lectureId}.${item.card.id}`));
      const next = [...due, ...fresh].slice(0, SESSION_SIZE);
      setQueue(next);
      setIndex(0);
      setRevealed(false);
      if (next.length === 0) setMessage('Aucune carte nouvelle ou échue. Vos cartes planifiées restent enregistrées sur cet appareil.');
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const rate = async (rating: Exclude<Rating, Rating.Manual>) => {
    if (!current) return;
    setBusy(true);
    setReviewError('');
    try {
      await review(`${current.lectureId}.${current.card.id}`, rating);
      await Promise.all([refreshDueCount(), loadStats()]);
      setRevealed(false);
      if (index + 1 >= queue.length) {
        setQueue([]);
        setMessage(`Session terminée : ${queue.length} carte${queue.length > 1 ? 's' : ''} planifiée${queue.length > 1 ? 's' : ''}.`);
      } else {
        setIndex((value) => value + 1);
      }
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const courseCardCounts = useMemo(() => new Map(
    allCards.reduce((groups, item) => groups.set(item.lectureName, (groups.get(item.lectureName) ?? 0) + 1), new Map<string, number>()),
  ), [allCards]);

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap">
        <section className="panel">
          <p className="eyebrow">Répétition espacée · FSRS</p>
          <h2>Révision</h2>
          <p className="muted">{dueCount} carte{dueCount === 1 ? '' : 's'} planifiée{dueCount === 1 ? '' : 's'} à revoir aujourd’hui.</p>
          <p className="muted" style={{ marginTop: '0.25rem' }}>Les évaluations sont sauvegardées dans la base locale IndexedDB.</p>
          <div className="btn-row">
            <button type="button" className="btn" disabled={loading || allCards.length === 0 || busy} onClick={() => void startSession()}>
              {loading ? 'Chargement des cartes…' : 'Commencer une session'}
            </button>
            {queue.length > 0 && <button type="button" className="btn ghost" onClick={() => { setQueue([]); setIndex(0); setRevealed(false); }}>Terminer la session</button>}
          </div>
          {loading && <p className="muted" role="status">Chargement des cartes du cours…</p>}
          {error && <p className="notice error" role="alert">Impossible de charger les cartes : {error}</p>}
          {reviewError && <p className="notice error" role="alert">{reviewError}</p>}
          {message && <p className="notice success" role="status">{message}</p>}
        </section>

        {current && (
          <article className="panel study-session" aria-live="polite">
            <div className="question-meta">
              <span className="pill">Carte {index + 1} / {queue.length}</span>
              <span className="muted">{remaining} restante{remaining > 1 ? 's' : ''}</span>
            </div>
            <p className="muted"><Link className="text-link" to={`/lecture/${current.lectureId}`}>{current.lectureName}</Link></p>
            <h2 className="study-prompt">{current.card.q}</h2>
            {current.card.src && <p className="muted">Source : {current.card.src}</p>}
            {!revealed ? (
              <button type="button" className="btn" onClick={() => setRevealed(true)}>Afficher la réponse</button>
            ) : (
              <div className="answer-block">
                <p>{current.card.a}</p>
                <p className="muted rating-hint">Quand souhaitez-vous revoir cette carte ?</p>
                <div className="rating-row">
                  {([
                    ['Encore', Rating.Again],
                    ['Difficile', Rating.Hard],
                    ['Bien', Rating.Good],
                    ['Facile', Rating.Easy],
                  ] as const).map(([label, rating]) => <button key={label} type="button" className={`btn rating-${label.toLowerCase()}`} disabled={busy} onClick={() => void rate(rating)}>{label}</button>)}
                </div>
              </div>
            )}
          </article>
        )}

        <section className="panel">
          <h2>Bibliothèque de cartes</h2>
          <p className="muted">{loading ? 'Chargement…' : `${allCards.length} cartes dans ${courseCardCounts.size} cours.`}</p>
          {!loading && allCards.length === 0 && !error && <p className="muted">Aucune carte n’est disponible.</p>}
          {allCards.length > 0 && (
            <details>
              <summary>Parcourir les cours et leurs cartes</summary>
              {Array.from(courseCardCounts.entries()).map(([name, count]) => (
                <p key={name} className="library-row"><span>{name}</span><span className="pill">{count} cartes</span></p>
              ))}
            </details>
          )}
        </section>
      </main>
    </>
  );
};
