import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpenText, CheckCircle2, Layers3, ListChecks } from 'lucide-react';
import { Header } from '../components/layout/Header';
import { TabBar } from '../components/layout/TabBar';
import { coreTabs } from '../components/layout/tabs';
import { loadLectureDraft } from '../lib/content';
import type { LectureDraft } from '../lib/schema';

type PreviewSection = 'overview' | 'cards' | 'quiz' | 'vf';

function reviewChecklist(draft: LectureDraft) {
  const lecture = draft.lecture;
  const cardIds = new Set(lecture.cards.map((card) => card.id));
  const missingQuizLinks = lecture.quiz.filter((question) => !question.cards.length || question.cards.some((id) => !cardIds.has(id))).length;
  const missingVfLinks = lecture.vf.filter((question) => !question.cards.length || question.cards.some((id) => !cardIds.has(id))).length;
  const emptyExplanations = lecture.quiz.filter((question) => !question.explain.trim()).length;
  const emptyVfExplanations = lecture.vf.filter((question) => !question.w.trim()).length;
  const missingSources = lecture.quiz.filter((question) => !question.src?.trim()).length;
  const answerCounts = lecture.quiz.map((question) => question.opts.filter((option) => option.ok).length);
  const uniformAnswerPattern = answerCounts.length > 1 && answerCounts.every((count) => count === answerCounts[0]);
  return [
    { label: 'Questions de quiz liées à une carte existante', count: missingQuizLinks, tone: missingQuizLinks ? 'issue' : 'ok' },
    { label: 'Questions vrai / faux liées à une carte existante', count: missingVfLinks, tone: missingVfLinks ? 'issue' : 'ok' },
    { label: 'Explications de quiz manquantes', count: emptyExplanations, tone: emptyExplanations ? 'warning' : 'ok' },
    { label: 'Explications vrai / faux manquantes', count: emptyVfExplanations, tone: emptyVfExplanations ? 'warning' : 'ok' },
    { label: 'Sources de quiz manquantes', count: missingSources, tone: missingSources ? 'warning' : 'ok' },
    { label: 'Même nombre de bonnes réponses dans chaque quiz', count: uniformAnswerPattern ? lecture.quiz.length : 0, tone: uniformAnswerPattern ? 'warning' : 'ok' },
  ];
}

export function DraftPreviewPage() {
  const { id = '' } = useParams();
  const [draft, setDraft] = useState<LectureDraft | null>(null);
  const [section, setSection] = useState<PreviewSection>('overview');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setDraft(null);
    setError('');
    loadLectureDraft(id).then((value) => { if (active) setDraft(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [id]);

  const sections: Array<{ id: PreviewSection; label: string; count?: number }> = draft ? [
    { id: 'overview', label: 'Résumé' },
    { id: 'cards', label: 'Cartes', count: draft.lecture.cards.length },
    { id: 'quiz', label: 'Quiz', count: draft.lecture.quiz.length },
    { id: 'vf', label: 'Vrai / faux', count: draft.lecture.vf.length },
  ] : [];

  return (
    <>
      <Header />
      <TabBar tabs={coreTabs} />
      <main className="wrap draft-preview-wrap">
        <p><Link className="text-link draft-back-link" to="/lectures"><ArrowLeft size={15} /> Retour aux cours OTR</Link></p>
        {error ? <section className="panel">
          <p className="eyebrow">Aperçu local indisponible</p>
          <h1>Ce brouillon ne peut pas être chargé.</h1>
          <p className="muted">{error}</p>
          <p className="muted">Vérifiez que le fichier existe sous <code>data/drafts/{id}.json</code>, puis relancez l’application locale.</p>
        </section> : !draft ? <p className="muted" role="status">Chargement du brouillon…</p> : <>
          <section className="panel draft-preview-heading">
            <div className="draft-status"><span className="draft-status-dot" /> Brouillon · non publié</div>
            <p className="eyebrow">Aperçu de validation · OTR {draft.lecture.otrNumber ? `n° ${draft.lecture.otrNumber}` : 'sans numéro'}</p>
            <h1>{draft.lecture.name}</h1>
            <p className="muted">Généré le {new Date(draft.generatedAt).toLocaleString('fr-FR')} · {draft.lecture.cards.length} cartes · {draft.lecture.quiz.length} quiz · {draft.lecture.vf.length} vrai / faux</p>
            {draft.sourcePdfName && <p className="muted draft-source-pdf">PDF de référence : <strong>{draft.sourcePdfName}</strong></p>}
            {draft.sourcePdfPath && <a className="btn ghost btn-sm" href={`${import.meta.env.BASE_URL}data/drafts/${draft.sourcePdfPath}`} target="_blank" rel="noreferrer">Ouvrir le PDF de référence ↗</a>}
            <div className="notice draft-review-notice"><strong>À vérifier avant publication</strong><span>Confirmez les réponses correctes, les explications, les pièges et les liens vers les cartes. Cet aperçu ne publie rien.</span></div>
            <div className="draft-publish-command"><span className="field-label">Après votre validation, publiez depuis le terminal :</span><code>npm run lecture:publish -- data/drafts/{id}.json</code></div>
          </section>

          <section className="panel draft-checklist" aria-label="Checklist de publication">
            <h2>Checklist de publication</h2>
            <ul>
              {reviewChecklist(draft).map((item) => <li className={`draft-check-${item.tone}`} key={item.label}>
                <span>{item.label}</span><strong>{item.count === 0 ? 'OK' : `${item.count} à vérifier`}</strong>
              </li>)}
            </ul>
            <p className="muted">Cette liste signale les points structurels à revoir. Vérifiez aussi chaque réponse médicale avec sa source.</p>
          </section>

          <div className="section-tabs" role="tablist" aria-label="Contenu du brouillon">
            {sections.map((item) => {
              const Icon = item.id === 'overview' ? BookOpenText : item.id === 'cards' ? Layers3 : item.id === 'quiz' ? ListChecks : CheckCircle2;
              return <button key={item.id} type="button" role="tab" aria-selected={section === item.id} className={section === item.id ? 'section-tab active' : 'section-tab'} onClick={() => setSection(item.id)}>
                <Icon className="section-tab-icon" size={17} aria-hidden="true" /><span className="section-tab-label">{item.label}</span>
                {item.count !== undefined && <span className="section-tab-count">{item.count}</span>}
              </button>;
            })}
          </div>

          {section === 'overview' && <section className="panel draft-content-preview">
            <h2>Points clés</h2>
            {draft.lecture.keys.length ? <ol className="content-list">{draft.lecture.keys.map((keyPoint, index) => <li key={`${index}-${keyPoint}`}>{keyPoint}</li>)}</ol> : <p className="muted">Aucun point clé dans le brouillon.</p>}
            <h2>Contrastes à retenir</h2>
            {draft.lecture.contrasts.length ? <ul className="content-list">{draft.lecture.contrasts.map((contrast, index) => <li key={`${index}-${contrast}`}>{contrast}</li>)}</ul> : <p className="muted">Aucun contraste dans le brouillon.</p>}
          </section>}

          {section === 'cards' && <section className="draft-content-preview" aria-label="Cartes du brouillon">
            {draft.lecture.cards.map((card) => <article className="card" key={card.id}>
              <p className="pill">{card.type === 'contrast' ? 'Contraste' : 'Carte'} · {card.id}{card.freq ? ` · ${card.freq} examens` : ''}</p>
              <h2 className="question-text">{card.q}</h2>
              <div className="answer-block"><p>{card.a}</p></div>
              {card.src && <p className="muted">Source : {card.src}</p>}
            </article>)}
          </section>}

          {section === 'quiz' && <section className="draft-content-preview" aria-label="Quiz du brouillon">
            {draft.lecture.quiz.map((question, index) => <article className="card" key={question.id}>
              <p className="eyebrow">Question {index + 1} · {question.id}</p>
              <h2 className="question-text">{question.q}</h2>
              <div className="option-list">{question.opts.map((option, optionIndex) => <div className={`option-row ${option.ok ? 'option-correct' : ''}`} key={`${question.id}-${optionIndex}`}><span>{option.t}</span>{option.ok && <strong className="correct-mark">✓ Correcte</strong>}</div>)}</div>
              <p className="muted">Cartes liées : {question.cards.join(', ') || 'Aucune'}</p>
              {question.explain && <p className="notice">{question.explain}</p>}
              {question.src && <p className="muted">Source : {question.src}</p>}
            </article>)}
          </section>}

          {section === 'vf' && <section className="draft-content-preview" aria-label="Vrai ou faux du brouillon">
            {draft.lecture.vf.map((question, index) => <article className="card" key={question.id}>
              <p className="eyebrow">Affirmation {index + 1} · {question.id}</p>
              <h2 className="question-text">{question.s}</h2>
              <p className="notice success">Réponse attendue : {question.a ? 'Vrai' : 'Faux'}</p>
              <p className="muted">Cartes liées : {question.cards.join(', ') || 'Aucune'}</p>
              {question.w && <p>{question.w}</p>}
            </article>)}
          </section>}
        </>}
      </main>
    </>
  );
}
