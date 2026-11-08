export function getHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function getSafeExternalLinkProps(value: string) {
  const href = getHttpUrl(value);
  return href ? { href, target: '_blank' as const, rel: 'noopener noreferrer' } : null;
}

export function getPastedAttachment(
  items: readonly Pick<DataTransferItem, 'kind' | 'getAsFile'>[],
  files: Iterable<File>,
  text: string,
) {
  const image = items
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .find((file): file is File => Boolean(file?.type.startsWith('image/')))
    ?? Array.from(files).find((file) => file.type.startsWith('image/'));
  if (image) return { type: 'image' as const, file: image };
  const url = getHttpUrl(text);
  return url ? { type: 'url' as const, url } : null;
}

export function getImageImportFailure(input: string, reason: unknown, timedOut = false) {
  const url = getHttpUrl(input);
  if (!url) return null;
  const detail = timedOut
    ? 'Le téléchargement a dépassé 15 secondes.'
    : reason instanceof TypeError
      ? 'Le navigateur n’a pas pu lire cette image (souvent à cause des règles CORS du site ou d’une connexion indisponible).'
      : reason instanceof Error
        ? reason.message
        : String(reason);
  return {
    link: url,
    message: `Import impossible : ${detail} L’adresse a été conservée comme lien. Essayez une URL directe autorisée ou téléversez la photo.`,
  };
}
