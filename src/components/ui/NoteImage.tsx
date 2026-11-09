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

  return src ? <img className={className} src={src} alt={alt} onError={() => void refreshImageUrl()} /> : null;
}
