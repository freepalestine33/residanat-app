import { describe, expect, it } from 'vitest';
import { getHttpUrl, getImageImportFailure, getPastedAttachment, getSafeExternalLinkProps } from './cardNoteAttachments';

describe('card note attachment links and import failures', () => {
  it('accepts only HTTP and HTTPS links and canonicalizes whitespace', () => {
    expect(getHttpUrl('  https://photos.example/album  ')).toBe('https://photos.example/album');
    expect(getHttpUrl('javascript:alert(1)')).toBeNull();
    expect(getHttpUrl('not a URL')).toBeNull();
  });

  it('returns a safe, actionable external link for saved URLs', () => {
    expect(getSafeExternalLinkProps('https://photos.example/album')).toEqual({
      href: 'https://photos.example/album',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(getSafeExternalLinkProps('javascript:alert(1)')).toBeNull();
  });

  it('prefers a pasted image and recognizes a pasted URL as the fallback', () => {
    const image = new File(['image'], 'photo.png', { type: 'image/png' });
    const nonImage = new File(['text'], 'note.txt', { type: 'text/plain' });
    const pastedImage = getPastedAttachment([
      { kind: 'file', getAsFile: () => nonImage },
      { kind: 'file', getAsFile: () => image },
    ], [], 'https://photos.example/share');
    expect(pastedImage).toEqual({ type: 'image', file: image });
    expect(getPastedAttachment([], [], 'https://photos.example/share')).toEqual({
      type: 'url',
      url: 'https://photos.example/share',
    });
    expect(getPastedAttachment([], [], 'ordinary text')).toBeNull();
  });

  it('retains the URL and explains CORS/network failures', () => {
    const failure = getImageImportFailure('https://photos.example/share', new TypeError('Failed to fetch'));
    expect(failure?.link).toBe('https://photos.example/share');
    expect(failure?.message).toContain('règles CORS');
    expect(failure?.message).toContain('conservée comme lien');
  });

  it('reports timeouts without losing the source URL', () => {
    const failure = getImageImportFailure('https://photos.example/image', new Error('AbortError'), true);
    expect(failure?.link).toBe('https://photos.example/image');
    expect(failure?.message).toContain('dépassé 15 secondes');
  });
});
