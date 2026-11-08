import { useState } from 'react';
import { getSafeExternalLinkProps } from './cardNoteAttachments';

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
  const linkProps = getSafeExternalLinkProps(url);
  return (
    <div className="photo-link-preview">
      {failed
        ? <p className="photo-preview-error">Cette adresse ne fournit pas directement une image. Ouvrez-la pour consulter la page, ou téléversez la photo pour l’intégrer à la note.</p>
        : <img className="card-note-image" src={url} alt="Aperçu de la photo liée" loading="lazy" onError={() => setFailed(true)} />}
      {linkProps
        ? <a className="photo-link-anchor" {...linkProps}>{url}</a>
        : <span className="photo-preview-error">Cette adresse n’est pas un lien Web http ou https valide.</span>}
    </div>
  );
}
