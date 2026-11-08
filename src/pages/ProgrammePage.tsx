import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { useLectureStore } from '../stores/lectureStore';
import { useProgrammeStore } from '../stores/programmeStore';
import { useSettingsStore } from '../stores/settingsStore';
import type { ProgrammeCategoryCode, ProgrammeItem } from '../types/programme';
import { otrProgramme } from '../data/otrProgramme';

const categories: Array<{ code: ProgrammeCategoryCode; name: string }> = [
  { code: 'B', name: 'Biologie' },
  { code: 'M', name: 'Médecine' },
  { code: 'C', name: 'Chirurgie' },
];

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').replace(/[^a-z0-9]+/g, ' ').trim();

export const ProgrammePage: React.FC = () => {
  const {
    programme, currentCategory, setCategory, loadProgramme, loading, error,
    favorites, toggleFavorite, getGroups,
  } = useProgrammeStore();
  const { lectures, loadLectures } = useLectureStore();
  const studyTrack = useSettingsStore((state) => state.studyTrack);
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(true);
  const [interactiveOnly, setInteractiveOnly] = useState(false);

  useEffect(() => { void loadProgramme(); void loadLectures(); }, [loadProgramme, loadLectures]);

  const residentGroups = useMemo(() => getGroups(currentCategory).map((group) => ({
    ...group,
    items: group.items.filter((item) => {
      if (favoritesOnly && !favorites.has(item.n)) return false;
      const term = query.trim().toLocaleLowerCase('fr');
      const groupMatches = group.name.toLocaleLowerCase('fr').includes(term);
      return !term || groupMatches || [item.n, item.t, item.d, item.w, item.s, item.alternativeCourseSource, item.alternativeQcmSource].join(' ').toLocaleLowerCase('fr').includes(term);
    }),
  })).filter((group) => group.items.length > 0), [currentCategory, favorites, favoritesOnly, getGroups, query, programme]);

  const fifthYearModules = useMemo(() => {
    const otrItems: ProgrammeItem[] = otrProgramme.map((topic) => ({
      n: String(topic.number), t: topic.title, d: '', w: '', s: '', linkedLectureId: topic.lectureId,
    }));
    return [
      { name: 'Orthopédie, traumatologie et rhumatologie (OTR)', groups: [{ name: 'Programme OTR · 43 cours', items: otrItems }] },
      { name: 'Pédiatrie', groups: [{ name: 'Cours', items: [] as ProgrammeItem[] }] },
      { name: 'Psychiatrie', groups: [{ name: 'Cours', items: [] as ProgrammeItem[] }] },
    ].map((module) => ({
      ...module,
      groups: module.groups.map((group) => ({ ...group, items: group.items.filter((item) => {
        if (interactiveOnly && !lectures.some((lecture) => (lecture.id === item.linkedLectureId || lecture.otrNumber === Number(item.n)) && lecture.cards > 0)) return false;
        if (favoritesOnly && !favorites.has(item.n)) return false;
        const term = query.trim().toLocaleLowerCase('fr');
        return !term || [item.n, item.t].join(' ').toLocaleLowerCase('fr').includes(term);
      }) })),
    }));
  }, [favorites, favoritesOnly, interactiveOnly, lectures, query]);

  const counts = useMemo(
    () => Object.fromEntries(categories.map(({ code }) => [code, getGroups(code).reduce((sum, group) => sum + group.items.length, 0)])),
    [getGroups, programme],
  );
  const totalVisible = residentGroups.reduce((sum, group) => sum + group.items.length, 0);
  const findLecture = (item: ProgrammeItem) => lectures.find((candidate) => {
    if (item.linkedLectureId) return candidate.id === item.linkedLectureId;
    if (Number.isFinite(Number(item.n)) && candidate.otrNumber === Number(item.n)) return true;
    const candidateName = normalize(candidate.name);
    const itemName = normalize(item.t);
    return candidate.id === item.n || candidate.progId === item.n || candidateName === itemName || candidateName.includes(itemName) || itemName.includes(candidateName);
  });

  const renderLecture = (item: ProgrammeItem, showComingSoon = false) => {
    const lecture = showComingSoon
      ? lectures.find((candidate) => candidate.id === item.linkedLectureId)
      : findLecture(item);
    const favorite = favorites.has(item.n);
    const hasSources = Boolean(item.courseSource || item.qcmSource || item.s || item.alternativeCourseSource || item.alternativeQcmSource);
    return (
      <details className="programme-lecture" key={item.n}>
        <summary className="programme-lecture-summary">
          <span className="pill">{item.n}</span><strong>{item.t}</strong>
          {showComingSoon && !lecture && <span className="course-coming-soon">Bientôt</span>}
          {item.d && <span className="programme-lecture-description">{item.d}</span>}
        </summary>
        <div className="programme-lecture-content">
          <div className="programme-lecture-tools">
            <button className="star-button" type="button" aria-pressed={favorite} onClick={() => toggleFavorite(item.n)}>{favorite ? '★ Favori' : '☆ Favori'}</button>
            {lecture && <div className="programme-session-actions">
              <Link className="btn btn-sm" to={`/lecture/${lecture.id}?tab=cards`}>Commencer la séance</Link>
              {lecture.pdfUrl && <a className="btn ghost btn-sm" href={`${import.meta.env.BASE_URL}data/${lecture.pdfUrl}`} target="_blank" rel="noreferrer">PDF du cours ↗</a>}
            </div>}
          </div>
          {hasSources && <div className="programme-source-grid">
            <div><h4>Source du cours</h4><p>{item.courseSource || item.s?.split(';')[0]?.trim() || 'Non précisée dans le document'}</p></div>
            <div><h4>Source des QCM</h4><p>{item.qcmSource || item.s?.split(';').slice(1).join(';').trim() || 'Non précisée dans le document'}</p></div>
          </div>}
          {showAlternatives && (item.alternativeCourseSource || item.alternativeQcmSource) && <div className="programme-source-grid programme-source-alternative">
            <div><h4>Source alternative du cours · Brahimi 2017–18</h4><p>{item.alternativeCourseSource || 'Non précisée'}</p></div>
            <div><h4>Source alternative des QCM · Brahimi 2017–18</h4><p>{item.alternativeQcmSource || 'Non précisée'}</p></div>
          </div>}
          {item.w && <p className="programme-warning">{item.w}</p>}
          {!hasSources && !item.w && showComingSoon && !lecture && <p className="muted">Le contenu interactif de ce cours sera ajouté bientôt.</p>}
          {!hasSources && !item.w && !showComingSoon && <p className="muted">Aucune source indiquée dans le document.</p>}
        </div>
      </details>
    );
  };

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap programme-wrap">
        <section className="panel programme-overview">
          <p className="eyebrow">{studyTrack === 'residency' ? 'Programme officiel · Oran' : 'Programme de 5e année médecine'}</p>
          <h1>{studyTrack === 'residency' ? 'Parcourez les 209 cours du résidanat' : 'Choisissez un module de 5e année'}</h1>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            {studyTrack === 'residency'
              ? 'Ouvrez une spécialité, puis un cours pour consulter ses sources et commencer une séance quand le contenu est disponible.'
              : 'Le module OTR contient les cartes et séances déjà disponibles. Pédiatrie et psychiatrie sont affichées pour organiser le parcours.'}
          </p>
          {loading && <p className="muted" role="status">Chargement du programme…</p>}
          {error && studyTrack === 'residency' && <p className="notice error" role="alert">Impossible de charger le programme : {error}</p>}

          {studyTrack === 'residency' ? <>
            <div className="category-tabs" role="tablist" aria-label="Spécialité">
              {categories.map((category) => (
                <button key={category.code} type="button" role="tab" aria-selected={currentCategory === category.code}
                  className={currentCategory === category.code ? 'category-tab active' : 'category-tab'}
                  onClick={() => setCategory(category.code)} disabled={!programme}>
                  <strong>{category.name}</strong><span>{counts[category.code] ?? 0} cours</span>
                </button>
              ))}
            </div>
            <div className="filters programme-filters">
              <label className="search-field">
                <span className="field-label">Rechercher un cours, un module ou une source</span>
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. cardiologie, série Q, Sahraoui…" />
              </label>
              <label className="check-filter"><input type="checkbox" checked={favoritesOnly} onChange={(event) => setFavoritesOnly(event.target.checked)} /> Favoris uniquement</label>
              <label className="check-filter"><input type="checkbox" checked={showAlternatives} onChange={(event) => setShowAlternatives(event.target.checked)} /> Sources Brahimi 2017–18</label>
            </div>
            <p className="muted">{totalVisible} cours affichés</p>
            {currentCategory !== 'B' && <p className="notice">Pour la médecine et la chirurgie, la distinction « cours » / « QCM » suit le classement du document fourni. Celui-ci précise que cette attribution est une déduction à confirmer.</p>}
          </> : <div className="fifth-year-module-summary">
            <strong>{interactiveOnly ? 'Cours OTR avec cartes interactives' : '11 séances OTR disponibles · 32 bientôt'}</strong>
            <label className="check-filter"><input type="checkbox" checked={interactiveOnly} onChange={(event) => setInteractiveOnly(event.target.checked)} /> Cours avec cartes interactives uniquement</label>
            <Link className="text-link" to="/settings">Modifier mon cursus</Link>
          </div>}
        </section>

        {studyTrack === 'residency' ? <>
          {!loading && !error && totalVisible === 0 && <p className="panel muted">Aucun cours ne correspond à ces filtres.</p>}
          {residentGroups.map((group) => (
            <details className="panel programme-module" key={group.name} open={Boolean(query)}>
              <summary><span>{group.name}</span><small>{group.items.length} cours</small></summary>
              <div className="programme-module-content">{group.items.map((item) => renderLecture(item))}</div>
            </details>
          ))}
        </> : fifthYearModules.map((module) => {
          const moduleCount = module.groups.reduce((sum, group) => sum + group.items.length, 0);
          const moduleHasMatches = (interactiveOnly ? moduleCount > 0 : true) && (!query || module.name.toLocaleLowerCase('fr').includes(query.toLocaleLowerCase('fr')) || module.groups.some((group) => group.items.length > 0));
          if (!moduleHasMatches) return null;
          return <details className="panel programme-module" key={module.name} open={Boolean(query)}>
            <summary><span>{module.name}</span><small>{moduleCount ? `${moduleCount} cours` : 'À compléter'}</small></summary>
            <div className="programme-module-content">
              {module.groups.map((group) => <section className="programme-submodule" key={group.name}>
                <h2>{group.name}</h2>
                {group.items.length ? group.items.map((item) => renderLecture(item, module.name.includes('(OTR)'))) : <p className="muted">Les cours et leurs sources ne sont pas encore ajoutés à l’application.</p>}
              </section>)}
            </div>
          </details>;
        })}
      </main>
    </>
  );
};
