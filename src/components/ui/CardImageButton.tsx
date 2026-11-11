import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CardImageButtonProps {
  lectureId: string;
  lectureName: string;
  cardId: string;
  question: string;
  answer: string;
}

async function authorizedFetch(input: string, init?: RequestInit) {
  if (!supabase) throw new Error('La génération d’illustrations nécessite la connexion au cloud.');
  const { data: { session }, error } = await supabase.getSession();
  if (error) throw error;
  if (!session) throw new Error('Connectez-vous pour générer une illustration.');
  return fetch(input, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${session.access_token}` },
  });
}

async function readError(response: Response) {
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    return 'Le service d’illustration n’est pas disponible dans cet environnement.';
  }
  try {
    const body = await response.json() as { error?: unknown };
    if (typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // fall through to the generic message
  }
  return `La génération a échoué (${response.status}).`;
}

async function readJson<T>(response: Response): Promise<T> {
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) {
    throw new Error('Le service d’illustration n’est pas disponible dans cet environnement.');
  }
  return response.json() as Promise<T>;
}

/**
 * Card illustration trigger + panel. The request only fires when the learner
 * opens the panel or asks to generate, so browsing and studying stay unaffected.
 */
export function CardImageButton({ lectureId, lectureName, cardId, question, answer }: CardImageButtonProps) {
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [saveApiKey, setSaveApiKey] = useState(true);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    setApiKey(localStorage.getItem('sa_gemini_api_key') ?? '');
  }, []);

  const close = useCallback(() => {
    requestRef.current += 1;
    setOpen(false);
    setError('');
    setGenerating(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const requestId = ++requestRef.current;
    setLoadingExisting(true);
    setError('');
    const query = new URLSearchParams({ lectureId, cardId });
    void authorizedFetch(`/api/ai/generate-card-image?${query.toString()}`)
      .then(async (response) => {
        if (requestId !== requestRef.current) return;
        const type = response.headers.get('content-type') ?? '';
        if (!type.includes('application/json')) throw new Error(await readError(response));
        if (!response.ok) throw new Error(await readError(response));
        const result = await readJson<{ imageUrl?: unknown }>(response);
        if (requestId === requestRef.current && typeof result.imageUrl === 'string') setImageUrl(result.imageUrl);
      })
      .catch((reason: unknown) => {
        if (requestId === requestRef.current) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (requestId === requestRef.current) setLoadingExisting(false);
      });
  }, [open, lectureId, cardId]);

  const generate = async () => {
    if (generating) return;
    const requestId = ++requestRef.current;
    setGenerating(true);
    setError('');
    try {
      const response = await authorizedFetch('/api/ai/generate-card-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lectureId, cardId, lectureName, question, answer, apiKey: apiKey.trim() }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = await response.json() as { imageUrl?: unknown };
      if (typeof result.imageUrl !== 'string') throw new Error('La réponse ne contient pas d’illustration.');
      if (requestId === requestRef.current) setImageUrl(result.imageUrl);
    } catch (reason) {
      if (requestId === requestRef.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (requestId === requestRef.current) setGenerating(false);
    }
  };

  const updateApiKeyPreference = (): boolean => {
    try {
      if (saveApiKey && apiKey.trim()) {
        localStorage.setItem('sa_gemini_api_key', apiKey.trim());
      } else {
        localStorage.removeItem('sa_gemini_api_key');
      }
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    }
  };

  const generateWithKey = async () => {
    if (!updateApiKeyPreference()) return;
    await generate();
  };

  return (
    <>
      <button
        type="button"
        className="card-image-button"
        aria-label={`Illustration IA : ${question}`}
        title="Générer une illustration de cette carte"
        onClick={() => setOpen(true)}
      >
        <ImageIcon size={17} aria-hidden="true" />
      </button>

      {open && (
        <div className="card-image-backdrop" onClick={close}>
          <section
            className="card-image-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`card-image-title-${lectureId}-${cardId}`}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="card-image-dialog-head">
              <div>
                <p className="eyebrow">Illustration IA · {lectureName}</p>
                <h3 id={`card-image-title-${lectureId}-${cardId}`}>{question}</h3>
              </div>
              <button ref={closeRef} type="button" className="card-image-close" aria-label="Fermer l’illustration" onClick={close}>
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            <div className="card-image-frame">
              {imageUrl ? (
                <img className="card-image-preview" src={imageUrl} alt={`Illustration de la carte : ${question}`} />
              ) : (
                <div className="card-image-empty">
                  {loadingExisting || generating ? (
                    <><LoaderCircle className="card-image-spinner" size={22} aria-hidden="true" /><span>{generating ? 'Création de l’illustration…' : 'Recherche d’une illustration…'}</span></>
                  ) : (
                    <><ImageIcon size={26} aria-hidden="true" /><span>Aucune illustration pour cette carte.</span></>
                  )}
                </div>
              )}
            </div>

            {error && <p className="notice error" role="alert">{error}</p>}
            <p className="muted card-image-note">Illustration mémorielle générée à partir de la carte, puis vérifiée avant stockage pour bloquer les visages. La révision reste instantanée.</p>

            <div className="card-image-key">
              <div className="card-image-key-heading">
                <label className="field-label" htmlFor={`card-image-api-key-${lectureId}-${cardId}`}>Clé API Google Gemini</label>
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Obtenir une clé</a>
              </div>
              <input
                id={`card-image-api-key-${lectureId}-${cardId}`}
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="AIzaSy… (ou clé configurée sur le serveur)"
                aria-describedby={`card-image-api-key-note-${lectureId}-${cardId}`}
              />
              <label className="card-image-key-save">
                <input type="checkbox" checked={saveApiKey} onChange={(event) => setSaveApiKey(event.target.checked)} />
                Mémoriser cette clé dans ce navigateur
              </label>
              <p className="muted" id={`card-image-api-key-note-${lectureId}-${cardId}`}>
                La clé est envoyée au serveur pour générer et vérifier l’image. Cette vérification Gemini supplémentaire peut prendre quelques secondes. Elle n’est pas synchronisée avec votre compte.
              </p>
            </div>

            <div className="card-image-actions">
              <button type="button" className="btn" disabled={generating || loadingExisting} onClick={() => void generateWithKey()}>
                {generating ? 'Génération…' : imageUrl ? <><RefreshCw size={15} aria-hidden="true" /> Régénérer</> : 'Générer une illustration'}
              </button>
              <button type="button" className="btn ghost" onClick={close}>Fermer</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
