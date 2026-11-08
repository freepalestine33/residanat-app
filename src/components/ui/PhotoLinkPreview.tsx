import { useState } from 'react';

export function isPhotoLink(value: string) {
  try {
    const url = new URL(value);
    return /(^|\.)photos\.google\.com$|(^|\.)photos\.app\.goo\.gl$|(^|\.)googleusercontent\.com$/i.test(url.hostname)
      || /\.(avif|gif|jpe?g|png|webp)$/i.test(url.pathname);
  } catch {
    return false;
  }
}

export function PhotoLinkPreview({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="photo-preview-error">Cette adresse ne fournit pas directement une image. Téléversez la photo ou collez un lien direct vers le fichier image.</p>;
  return <img className="card-note-image" src={url} alt="Photo jointe à la note" loading="lazy" onError={() => setFailed(true)} />;
}
