import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { useLectureStore, useProgrammeStore } from '../stores';
import type { ProgrammeCategoryCode } from '../types/programme';

const categories: Array<{ code: ProgrammeCategoryCode; name: string }> = [
  { code: 'M', name: 'Médecine' },
  { code: 'C', name: 'Chirurgie' },
  { code: 'B', name: 'Biologie' },
];

export const ProgrammePage: React.FC = () => {
  const {
    programme, currentCategory, setCategory, loadProgramme, loading, error,
    favorites, toggleFavorite, getGroups,
  } = useProgrammeStore();
  const { lectures, loadLectures } = useLectureStore();
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  useEffect(() => { void loadProgramme(); void loadLectures(); }, [loadProgramme, loadLectures]);

  const groups = useMemo(() => getGroups(currentCategory).map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (favoritesOnly && !favorites.has(item.n)) return false;
      const term = query.trim().toLocaleLowerCase('fr');
      return !term || [item.n, item.t, item.d, item.w, item.s].join(' ').toLocaleLowerCase('fr').includes(term);
    }),
  })).filter((group) => group.items.length > 0), [currentCategory, favorites, favoritesOnly, getGroups, query, programme]);
  const counts = useMemo(
    () => Object.fromEntries(categories.map(({ code }) => [code, getGroups(code).reduce((sum, group) => sum + group.items.length, 0)])),
    [getGroups, programme],
  );
  const totalVisible = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap programme-wrap">
        <section className="panel programme-overview">
          <p className="eyebrow">Programme officiel importé</p>
          <h1>Programme du résidanat</h1>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            209 cours organisés par spécialité. Les fiches interactives s’ouvrent directement dans l’application.
          </p>
          {loading && <p className="muted" role="status">Chargement du programme…</p>}
          {error && <p className="notice error" role="alert">Impossible de charger le programme : {error}</p>}

          <div className="category-tabs" role="tablist" aria-label="Spécialité">
            {categories.map((category) => (
              <button
                key={category.code}
                type="button"
                role="tab"
                aria-selected={currentCategory === category.code}
                className={currentCategory === category.code ? 'category-tab active' : 'category-tab'}
                onClick={() => setCategory(category.code)}
                disabled={!programme}
              >
                <strong>{category.name}</strong>
                <span>{counts[category.code] ?? 0} cours</span>
              </button>
            ))}
          </div>

          <div className="filters programme-filters">
            <label className="search-field">
              <span className="field-label">Rechercher dans {categories.find((item) => item.code === currentCategory)?.name}</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, description, source…" />
            </label>
            <label className="check-filter"><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /> Favoris uniquement</label>
          </div>
          <p className="muted">{totalVisible} cours affichés</p>
        </section>

        {!loading && !error && totalVisible === 0 && <p className="panel muted">Aucun cours ne correspond à ces filtres.</p>}
        {groups.map((group) => (
          <section className="panel programme-group" key={group.name}>
            <h2>{group.name}</h2>
            {group.items.map((item) => {
              const lecture = lectures.find((candidate) => candidate.id === item.n);
              const favorite = favorites.has(item.n);
              return (
                <article className="card programme-item" key={item.n}>
                  <div className="question-meta">
                    <span className="pill">{item.n}</span>
                    <h3>{item.t}</h3>
                    <button className="star-button" type="button" aria-pressed={favorite} onClick={() => toggleFavorite(item.n)}>{favorite ? '★ Favori' : '☆ Favori'}</button>
                  </div>
                  {item.d && <p>{item.d}</p>}
                  {item.w && <p className="programme-warning">{item.w}</p>}
                  {item.s && <p className="muted programme-sources">Sources : {item.s.split(';').map((source) => source.trim()).filter(Boolean).join(' · ')}</p>}
                  {lecture && <Link className="btn ghost btn-sm" to={`/lecture/${lecture.id}`}>Ouvrir le cours interactif →</Link>}
                </article>
              );
            })}
          </section>
        ))}
      </main>
    </>
  );
};
