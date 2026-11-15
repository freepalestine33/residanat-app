import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface NoteImageProps {
  image: Blob | string;
  imagePath?: string;
  className: string;
  alt: string;
}

export function NoteImage({ image, imagePath, className, alt }: NoteImageProps) {
  const [src, setSrc] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const refreshAttempted = useRef(false);

  useEffect(() => {
    refreshAttempted.current = false;
    if (typeof image === 'string') {
      setSrc(image);
      return;
    }
    const url = URL.createObjectURL(image);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [image, imagePath]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (viewerOpen && !dialog.open) dialog.showModal();
    if (!viewerOpen && dialog.open) dialog.close();
  }, [viewerOpen]);

  const refreshImageUrl = async () => {
    if (!imagePath || refreshAttempted.current) return;
    refreshAttempted.current = true;
    try {
      if (!supabase) throw new Error('Cloud storage is not configured.');
      const { data: { session }, error } = await supabase.getSession();
      if (error) throw error;
      if (!session) throw new Error('Sign in is required to refresh this note image.');

      const query = new URLSearchParams({ imagePath });
      const response = await fetch(`/api/notes?${query}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await response.json() as { imageUrl?: unknown; error?: string };
      if (!response.ok || typeof result.imageUrl !== 'string') {
        throw new Error(result.error || `Could not refresh note image (${response.status}).`);
      }
      setSrc(result.imageUrl);
    } catch (reason) {
      console.error('Could not refresh note image.', reason);
    }
  };

  if (!src) return null;
  return (
    <>
      <button
        type="button"
        className="note-image-trigger"
        onClick={() => setViewerOpen(true)}
        aria-label={`Agrandir l’image : ${alt}`}
        title="Agrandir l’image"
      >
        <img className={className} src={src} alt={alt} onError={() => void refreshImageUrl()} />
      </button>
      <dialog
        ref={dialogRef}
        className="note-image-dialog"
        aria-label={alt}
        onClose={() => setViewerOpen(false)}
        onClick={(event) => { if (event.target === dialogRef.current) setViewerOpen(false); }}
      >
        <img className="note-image-full" src={src} alt={alt} />
      </dialog>
    </>
  );
}
