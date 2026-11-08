import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  BrainCircuit,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Key,
  BookOpen,
  Layers3,
  ListChecks,
  Save,
  Download,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { extractTextFromPdf } from '../../lib/pdfExtractor';
import { generateLecture, type AiProvider, type GenerateLectureInput } from '../../lib/aiLectureGenerator';
import { otrProgramme } from '../../data/otrProgramme';
import { db } from '../../db/db';
import { queueSyncChange } from '../../lib/syncEvents';
import { useLectureStore } from '../../stores';
import type { Lecture } from '../../lib/schema';
import { useNavigate } from 'react-router-dom';

interface AiLectureGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialOtrNumber?: number;
}

type TabType = 'overview' | 'cards' | 'quiz' | 'vf';

export const AiLectureGeneratorModal: React.FC<AiLectureGeneratorModalProps> = ({
  isOpen,
  onClose,
  initialOtrNumber,
}) => {
  const navigate = useNavigate();
  const loadLectures = useLectureStore((state) => state.loadLectures);

  // Form State
  const [otrNumber, setOtrNumber] = useState<number | undefined>(initialOtrNumber ?? 11);
  const [customName, setCustomName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [manualText, setManualText] = useState('');
  const [useManualText, setUseManualText] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isMcqFocused, setIsMcqFocused] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // AI Configuration - Support Gemini, Groq, OpenRouter, OpenAI
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [saveKey, setSaveKey] = useState(true);
  const [model, setModel] = useState('gemini-1.5-flash');

  // Execution State
  const [loading, setLoading] = useState(false);
  const [stepMessage, setStepMessage] = useState('');
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState<string | null>(null);
  const [generatedLecture, setGeneratedLecture] = useState<Lecture | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [previewTab, setPreviewTab] = useState<TabType>('overview');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load saved API key from localStorage when provider changes or on mount
  useEffect(() => {
    const keyStorageName = `sa_${provider}_api_key`;
    const saved = localStorage.getItem(keyStorageName);
    setApiKey(saved || '');

    if (provider === 'gemini') {
      setModel('gemini-1.5-flash');
    } else if (provider === 'groq') {
      setModel('openai/gpt-oss-120b');
    } else if (provider === 'openrouter') {
      setModel('google/gemini-2.0-flash-exp:free');
    } else {
      setModel('gpt-4o');
    }
  }, [provider]);

  // Update selected OTR topic when prop changes
  useEffect(() => {
    if (initialOtrNumber) {
      setOtrNumber(initialOtrNumber);
    }
  }, [initialOtrNumber]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const changedBackground: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }> = [];
    let ancestor: HTMLElement | null = modalRef.current;

    while (ancestor?.parentElement) {
      const parent = ancestor.parentElement;
      Array.from(parent.children).forEach((sibling) => {
        if (sibling instanceof HTMLElement && !sibling.contains(modalRef.current)) {
          changedBackground.push({
            element: sibling,
            inert: sibling.inert,
            ariaHidden: sibling.getAttribute('aria-hidden'),
          });
          sibling.inert = true;
          sibling.setAttribute('aria-hidden', 'true');
        }
      });
      ancestor = parent;
    }

    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(
        modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);

      if (!focusable.length) {
        event.preventDefault();
        modalRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!modalRef.current.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && (active === first || active === modalRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleDialogKeyDown, true);
      changedBackground.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      document.body.style.overflow = bodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentTopic = otrProgramme.find((t) => t.number === otrNumber);
  const resolvedName = customName.trim() || currentTopic?.title || 'Cours interactif';
  const resolvedId = currentTopic?.lectureId
    ? currentTopic.lectureId
    : `otr_${String(otrNumber || 'cours').padStart(2, '0')}_${resolvedName
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/g, '_')
        .slice(0, 20)}`;

  const acceptPdfFile = (file: File | undefined | null) => {
    if (!file) return;
    const looksLikePdf =
      file.type === 'application/pdf' ||
      file.type === 'application/x-pdf' ||
      file.name.toLowerCase().endsWith('.pdf');
    if (!looksLikePdf) {
      setSelectedFile(null);
      setError('Ce fichier n’est pas un PDF. Choisissez un fichier .pdf, ou collez le texte du cours / QCM.');
      return;
    }
    setSelectedFile(file);
    setUseManualText(false);
    setError(null);
    setIsDraggingFile(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    acceptPdfFile(file);
    // Reset after the event so the same PDF can be chosen again, without
    // clearing the File object captured above.
    window.setTimeout(() => {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }, 0);
  };

  const eventHasFiles = (event: React.DragEvent) =>
    Array.from(event.dataTransfer.types).includes('Files');

  const handleGenerate = async () => {
    setError(null);
    setWarnings([]);
    setGeneratedLecture(null);
    setSaveSuccess(false);

    const pastedText = manualText.trim();
    if (!selectedFile && !pastedText) {
      setError('Veuillez sélectionner un fichier PDF ou coller le texte de votre cours / QCM.');
      return;
    }

    if (!apiKey.trim()) {
      setError(`Veuillez saisir votre clé API pour ${provider.toUpperCase()}.`);
      return;
    }

    if (saveKey) {
      localStorage.setItem(`sa_${provider}_api_key`, apiKey.trim());
    }

    try {
      setLoading(true);
      setActiveStep(1);
      setStepMessage('Préparation du document…');

      // Step 1: Extract text
      let textContent = '';
      const preferPastedText = (useManualText || !selectedFile) && pastedText.length > 0;
      if (preferPastedText) {
        textContent = pastedText;
        setStepMessage('Texte récupéré avec succès...');
      } else if (selectedFile) {
        setStepMessage(`Extraction du texte du PDF "${selectedFile.name}"...`);
        const extracted = await extractTextFromPdf(selectedFile);
        textContent = extracted.text;
        setStepMessage(`${extracted.pages} pages extraites (${extracted.chars.toLocaleString('fr-FR')} car.). Analyse IA en cours...`);
      }

      // Step 2: Call selected AI provider
      const providerLabel = provider === 'gemini' ? 'Google Gemini' : provider === 'groq' ? 'Groq GPT-OSS' : provider === 'openrouter' ? 'OpenRouter' : 'OpenAI';
      setActiveStep(2);
      setStepMessage(`Génération avec ${providerLabel} (${model})...`);

      const input: GenerateLectureInput = {
        text: textContent,
        id: resolvedId,
        name: resolvedName,
        otrNumber,
      };

      const result = await generateLecture(input, {
        provider,
        apiKey: apiKey.trim(),
        model,
        isMcqFocused,
        onProgress: setStepMessage,
      });

      setGeneratedLecture(result.lecture);
      setWarnings(result.warnings);
      setStepMessage('Génération terminée avec succès !');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToApp = async () => {
    if (!generatedLecture) return;

    try {
      setLoading(true);
      const id = generatedLecture.id;
      const updatedAt = Date.now();
      const imported = {
        id,
        name: generatedLecture.name,
        content: generatedLecture,
        updatedAt,
      };

      // 1. Save to local Dexie
      await db.userLectures.put(imported);

      // 2. Queue sync change for Supabase
      await queueSyncChange('lectures', id, 'upsert', {
        id,
        name: imported.name,
        content: generatedLecture,
        updated_at: new Date(updatedAt).toISOString(),
        deleted_at: null,
      });

      // 3. Refresh store
      await loadLectures();
      setSaveSuccess(true);

      // Navigate to the lecture after small delay
      setTimeout(() => {
        onClose();
        navigate(`/lecture/${id}`);
      }, 700);
    } catch (err) {
      setError(`Erreur lors de l'enregistrement : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadJson = () => {
    if (!generatedLecture) return;
    const blob = new Blob([JSON.stringify(generatedLecture, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedLecture.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="modal-backdrop ai-lecture-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-lecture-modal-title"
      onDragOver={(event) => {
        if (eventHasFiles(event)) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files?.length) return;
        event.preventDefault();
        acceptPdfFile(event.dataTransfer.files[0]);
      }}
    >
      <div className="panel ai-lecture-modal" ref={modalRef} tabIndex={-1}>
        {/* Header */}
        <div className="ai-lecture-header">
          <div className="ai-lecture-heading">
            <span className="ai-lecture-mark" aria-hidden="true"><BrainCircuit size={22} /></span>
            <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className="pill ai-lecture-kicker" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                IA MÉDICALE · STUDIO DE RÉVISION
              </span>
            </div>
            <h1 id="ai-lecture-modal-title" className="ai-lecture-title">Générateur de cours interactif</h1>
            <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
              Transformez n'importe quel PDF (cours ou QCM) en fiches mémo, quiz et vrai/faux interactifs.
            </p>
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="btn ghost btn-sm ai-lecture-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Generated Preview Mode */}
        {generatedLecture ? (
          <div>
            <div className="notice success" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <CheckCircle2 size={24} style={{ color: 'var(--green)' }} />
              <div>
                <strong>Cours interactif généré avec succès !</strong>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>
                  {generatedLecture.cards.length} cartes de révision · {generatedLecture.quiz.length} QCM ·{' '}
                  {generatedLecture.vf.length} Vrai / Faux
                </p>
              </div>
            </div>

            {warnings.length > 0 && (
              <div className="notice warning" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                {warnings.map((w, i) => (
                  <p key={i} style={{ margin: 0 }}>⚠️ {w}</p>
                ))}
              </div>
            )}

            {/* Preview Tabs */}
            <div className="section-tabs" style={{ marginBottom: '1rem' }}>
              <button
                type="button"
                className={previewTab === 'overview' ? 'section-tab active' : 'section-tab'}
                onClick={() => setPreviewTab('overview')}
              >
                <BookOpen size={16} /> Résumé ({generatedLecture.keys.length} clés)
              </button>
              <button
                type="button"
                className={previewTab === 'cards' ? 'section-tab active' : 'section-tab'}
                onClick={() => setPreviewTab('cards')}
              >
                <Layers3 size={16} /> Cartes ({generatedLecture.cards.length})
              </button>
              <button
                type="button"
                className={previewTab === 'quiz' ? 'section-tab active' : 'section-tab'}
                onClick={() => setPreviewTab('quiz')}
              >
                <ListChecks size={16} /> QCM ({generatedLecture.quiz.length})
              </button>
              <button
                type="button"
                className={previewTab === 'vf' ? 'section-tab active' : 'section-tab'}
                onClick={() => setPreviewTab('vf')}
              >
                <CheckCircle2 size={16} /> Vrai / Faux ({generatedLecture.vf.length})
              </button>
            </div>

            {/* Preview Tab Content */}
            <div className="ai-lecture-preview">
              {previewTab === 'overview' && (
                <div>
                  <h3 style={{ fontSize: '1rem', marginTop: 0 }}>Points clés essentiels</h3>
                  <ul className="content-list" style={{ paddingLeft: '1.25rem' }}>
                    {generatedLecture.keys.map((k, i) => (
                      <li key={i}>{k}</li>
                    ))}
                  </ul>
                  {generatedLecture.contrasts.length > 0 && (
                    <>
                      <h3 style={{ fontSize: '1rem', marginTop: '1rem' }}>Pièges & Diagnostics différentiels</h3>
                      <ul className="content-list" style={{ paddingLeft: '1.25rem' }}>
                        {generatedLecture.contrasts.map((c, i) => (
                          <li key={i}>{c}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              {previewTab === 'cards' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {generatedLecture.cards.map((card) => (
                    <div key={card.id} className="card" style={{ padding: '0.85rem' }}>
                      <p className="pill" style={{ display: 'inline-block', fontSize: '0.75rem' }}>{card.id}</p>
                      <strong style={{ display: 'block', margin: '0.35rem 0' }}>{card.q}</strong>
                      <p style={{ margin: 0, color: 'var(--text-secondary)' }}>{card.a}</p>
                      {card.src && <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Source : {card.src}</span>}
                    </div>
                  ))}
                </div>
              )}

              {previewTab === 'quiz' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {generatedLecture.quiz.map((q, idx) => (
                    <div key={q.id} className="card" style={{ padding: '0.85rem' }}>
                      <p className="eyebrow" style={{ margin: 0 }}>Question {idx + 1}</p>
                      <h4 style={{ margin: '0.25rem 0 0.5rem', fontSize: '0.95rem' }}>{q.q}</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.5rem' }}>
                        {q.opts.map((opt, oIdx) => (
                          <div
                            key={oIdx}
                            style={{
                              padding: '0.4rem 0.6rem',
                              borderRadius: '6px',
                              fontSize: '0.85rem',
                              backgroundColor: opt.ok ? 'var(--green-soft)' : 'var(--card2)',
                              border: opt.ok ? '1px solid var(--green)' : '1px solid var(--border)',
                              display: 'flex',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>{opt.t}</span>
                            {opt.ok && <strong style={{ color: '#10b981' }}>✓ Correcte</strong>}
                          </div>
                        ))}
                      </div>
                      {q.explain && <p className="notice" style={{ margin: 0, fontSize: '0.8rem' }}>{q.explain}</p>}
                    </div>
                  ))}
                </div>
              )}

              {previewTab === 'vf' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {generatedLecture.vf.map((v, idx) => (
                    <div key={v.id} className="card" style={{ padding: '0.85rem' }}>
                      <p className="eyebrow" style={{ margin: 0 }}>Item {idx + 1}</p>
                      <h4 style={{ margin: '0.25rem 0', fontSize: '0.95rem' }}>{v.s}</h4>
                      <span className={`pill ${v.a ? 'pill-success' : 'pill-danger'}`} style={{ fontSize: '0.75rem' }}>
                        {v.a ? 'VRAI' : 'FAUX'}
                      </span>
                      {v.w && <p style={{ fontSize: '0.85rem', margin: '0.4rem 0 0', color: 'var(--text-secondary)' }}>{v.w}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions for generated lecture */}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => setGeneratedLecture(null)}>
                ← Recommencer
              </button>
              <button type="button" className="btn secondary" onClick={handleDownloadJson}>
                <Download size={16} /> Télécharger le JSON
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleSaveToApp}
                disabled={loading || saveSuccess}
              >
                {loading ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                {saveSuccess ? 'Enregistré ! Ouverture...' : 'Ajouter à mes cours & Ouvrir'}
              </button>
            </div>
          </div>
        ) : (
          /* Input / Configuration Form */
          <div>
            {error && (
              <div className="notice error" style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <span style={{ fontWeight: 600 }}>Erreur :</span>
                    <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem' }}>{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Provider Switcher */}
            <div className="ai-lecture-provider">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span className="field-label" style={{ margin: 0 }}>Choisissez votre fournisseur d'IA :</span>
                {provider === 'gemini' && (
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.8rem', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}
                  >
                    Google AI Studio <ExternalLink size={12} />
                  </a>
                )}
                {provider === 'groq' && (
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.8rem', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none', fontWeight: 600 }}
                  >
                    Clé gratuite Groq instantanée <ExternalLink size={12} />
                  </a>
                )}
                {provider === 'openrouter' && (
                  <a
                    href="https://openrouter.ai/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', textDecoration: 'none' }}
                  >
                    Clé OpenRouter <ExternalLink size={12} />
                  </a>
                )}
              </div>

              <div className="ai-lecture-provider-options">
                <button
                  type="button"
                  className={`btn btn-sm ${provider === 'groq' ? 'primary' : 'ghost'}`}
                  aria-pressed={provider === 'groq'}
                  style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => setProvider('groq')}
                >
                  <Zap size={14} /> Groq (100% Gratuit)
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${provider === 'gemini' ? 'primary' : 'ghost'}`}
                  aria-pressed={provider === 'gemini'}
                  style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => setProvider('gemini')}
                >
                  <BrainCircuit size={14} /> Google Gemini
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${provider === 'openrouter' ? 'primary' : 'ghost'}`}
                  aria-pressed={provider === 'openrouter'}
                  style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => setProvider('openrouter')}
                >
                  OpenRouter
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${provider === 'openai' ? 'primary' : 'ghost'}`}
                  aria-pressed={provider === 'openai'}
                  style={{ display: 'inline-flex', justifyContent: 'center', alignItems: 'center', gap: '0.35rem' }}
                  onClick={() => setProvider('openai')}
                >
                  OpenAI
                </button>
              </div>

              {provider === 'gemini' && (
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  ℹ️ <strong>Erreur "project suspended" ?</strong> Créez une nouvelle clé sur Google AI Studio en choisissant <em>"Create API key in NEW project"</em> (Nouveau projet propre). Ou utilisez <strong>Groq</strong> (aucun problème de projet).
                </p>
              )}
              {provider === 'groq' && (
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--green)' }}>
                  Modèle conseillé : GPT-OSS 120B. Le quota gratuit limite chaque requête à 8 000 jetons, réponse comprise : un PDF long est envoyé en plusieurs parties.
                </p>
              )}
            </div>

            {/* Status / Loading Stepper */}
            {loading && (
              <div className="ai-lecture-progress" role="status" aria-live="polite" aria-busy="true">
                <div className="ai-lecture-progress-heading">
                  <span className="ai-lecture-progress-icon"><Loader2 size={18} className="spin" /></span>
                  <div>
                    <strong>
                      {activeStep}/3 · {activeStep === 1
                        ? 'Lecture du document…'
                        : `Analyse avec ${provider === 'groq' ? 'Groq' : provider === 'gemini' ? 'Gemini' : provider === 'openrouter' ? 'OpenRouter' : 'OpenAI'}…`}
                    </strong>
                    <p>{stepMessage}</p>
                  </div>
                </div>
                <ol className="ai-lecture-steps" aria-label="Étapes de génération">
                  {['Lecture du document', 'Analyse par l’IA', 'Création du cours'].map((label, index) => {
                    const step = (index + 1) as 1 | 2 | 3;
                    const state = step < activeStep ? 'complete' : step === activeStep ? 'active' : 'upcoming';
                    return (
                      <li key={label} className={`ai-lecture-step is-${state}`} aria-current={step === activeStep ? 'step' : undefined}>
                        <span className="ai-lecture-step-number">{step < activeStep ? <CheckCircle2 size={15} /> : step}</span>
                        <span>{label}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            <div className="ai-lecture-fields ai-lecture-fields--two">
              {/* OTR Lecture Selection */}
              <div>
                <label className="field-label" htmlFor="ai-otr-select">
                  Associer à un cours du programme OTR
                </label>
                <select
                  id="ai-otr-select"
                  value={otrNumber ?? ''}
                  onChange={(e) => {
                    const val = e.target.value ? Number(e.target.value) : undefined;
                    setOtrNumber(val);
                    if (val) {
                      const topic = otrProgramme.find((t) => t.number === val);
                      if (topic) setCustomName(topic.title);
                    }
                  }}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '8px' }}
                >
                  <option value="">-- Autre / Cours personnalisé --</option>
                  {otrProgramme.map((topic) => (
                    <option key={topic.number} value={topic.number}>
                      {String(topic.number).padStart(2, '0')}. {topic.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Title */}
              <div>
                <label className="field-label" htmlFor="ai-title-input">
                  Titre du cours
                </label>
                <input
                  id="ai-title-input"
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder={currentTopic?.title || 'Ex : Boiterie chez l’enfant (QCM)'}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '8px' }}
                />
              </div>
            </div>

            {/* Document Source: PDF or Text */}
            <div className="ai-lecture-source">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <span className="field-label" style={{ margin: 0 }}>Source du document</span>
                <button
                  type="button"
                  className="btn ghost btn-sm"
                  aria-pressed={useManualText}
                  style={{ fontSize: '0.8rem', padding: '0.2rem 0.5rem' }}
                  onClick={() => setUseManualText(!useManualText)}
                >
                  {useManualText ? 'Basculer vers upload PDF' : 'Coller du texte à la place'}
                </button>
              </div>

              {useManualText ? (
                <div>
                  <textarea
                    rows={6}
                    value={manualText}
                    onChange={(e) => {
                      setManualText(e.target.value);
                      if (e.target.value.trim()) setError(null);
                    }}
                    placeholder="Collez ici les QCM, corrigés ou le texte du cours..."
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', fontSize: '0.85rem' }}
                  />
                  {selectedFile && (
                    <p className="muted" style={{ fontSize: '0.78rem', margin: '0.4rem 0 0' }}>
                      PDF déjà choisi : {selectedFile.name}. Le texte collé sera utilisé en priorité.
                    </p>
                  )}
                </div>
              ) : (
                <div
                  className={`ai-lecture-dropzone${selectedFile ? ' has-file' : ''}${isDraggingFile ? ' is-dragging' : ''}`}
                  onDragEnter={(event) => {
                    if (eventHasFiles(event)) setIsDraggingFile(true);
                  }}
                  onDragOver={(event) => {
                    if (!eventHasFiles(event)) return;
                    event.preventDefault();
                    setIsDraggingFile(true);
                  }}
                  onDragLeave={(event) => {
                    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                    setIsDraggingFile(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setIsDraggingFile(false);
                    acceptPdfFile(event.dataTransfer.files?.[0]);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    id="ai-pdf-input"
                    type="file"
                    accept=".pdf,application/pdf"
                    aria-label="Sélectionner un fichier PDF"
                    onChange={handleFileChange}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer',
                      fontSize: 0,
                    }}
                  />
                  {selectedFile ? (
                    <div style={{ pointerEvents: 'none' }}>
                      <FileText size={36} style={{ color: 'var(--green)', margin: '0 auto 0.5rem' }} />
                      <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>{selectedFile.name}</p>
                      <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} Mo · Cliquez ou déposez un autre PDF pour changer
                      </p>
                    </div>
                  ) : (
                    <div style={{ pointerEvents: 'none' }}>
                      <Upload size={36} style={{ color: isDraggingFile ? 'var(--green)' : 'var(--muted)', margin: '0 auto 0.5rem' }} />
                      <p style={{ fontWeight: 600, margin: '0 0 0.25rem' }}>
                        {isDraggingFile ? 'Relâchez pour importer ce PDF' : 'Cliquez ou déposez votre PDF ici'}
                      </p>
                      <p className="muted" style={{ fontSize: '0.8rem', margin: 0 }}>
                        Fichier PDF de QCM ou de cours (ex : Boiterie chez l'enfant)
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Mode & AI Key Config */}
            <div className="ai-lecture-fields ai-lecture-fields--two">
              <div>
                <label className="field-label" htmlFor="ai-key-input" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Key size={14} /> Clé API {provider.toUpperCase()}
                </label>
                <input
                  id="ai-key-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={
                    provider === 'gemini'
                      ? 'AIzaSy...'
                      : provider === 'groq'
                      ? 'gsk_...'
                      : provider === 'openrouter'
                      ? 'sk-or-...'
                      : 'sk-proj-...'
                  }
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', fontSize: '0.85rem' }}
                />
                <label
                  className="ai-lecture-option"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', marginTop: '0.35rem', color: 'var(--text-secondary)' }}
                >
                  <input type="checkbox" checked={saveKey} onChange={(e) => setSaveKey(e.target.checked)} />
                  Mémoriser la clé dans ce navigateur
                </label>
              </div>

              <div>
                <label className="field-label" htmlFor="ai-model-select">
                  Modèle d'IA
                </label>
                <select
                  id="ai-model-select"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '8px' }}
                >
                  {provider === 'gemini' && (
                    <>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash (Rapide & Quota gratuit élevé)</option>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash (Nouvelle génération)</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Raisonnement médical approfondi)</option>
                    </>
                  )}
                  {provider === 'groq' && (
                    <>
                      <option value="openai/gpt-oss-120b">GPT-OSS 120B (Recommandé)</option>
                      <option value="openai/gpt-oss-20b">GPT-OSS 20B (Plus rapide)</option>
                    </>
                  )}
                  {provider === 'openrouter' && (
                    <>
                      <option value="google/gemini-2.0-flash-exp:free">Gemini 2.0 Flash (Gratuit OpenRouter)</option>
                      <option value="meta-llama/llama-3.3-70b-instruct:free">Llama 3.3 70B (Gratuit)</option>
                      <option value="deepseek/deepseek-chat:free">DeepSeek V3 (Gratuit)</option>
                    </>
                  )}
                  {provider === 'openai' && (
                    <>
                      <option value="gpt-4o">GPT-4o (Recommandé · Haute fidélité)</option>
                      <option value="gpt-4o-mini">GPT-4o-mini (Rapide et économique)</option>
                    </>
                  )}
                </select>

                <label className="ai-lecture-option" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', marginTop: '0.45rem', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={isMcqFocused} onChange={(e) => setIsMcqFocused(e.target.checked)} />
                  Optimiser pour les QCM & annales d'examen
                </label>
              </div>
            </div>

            {/* Modal Bottom Actions */}
            <div className="ai-lecture-footer">
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                Compatible Groq, Gemini, OpenRouter, OpenAI & n8n.
              </span>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" className="btn ghost" onClick={onClose} disabled={loading}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={handleGenerate}
                  disabled={loading}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      Traitement en cours...
                    </>
                  ) : (
                    <>
                      <BrainCircuit size={16} />
                      Générer le cours interactif
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
