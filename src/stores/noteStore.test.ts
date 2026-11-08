import { describe, expect, it } from 'vitest';
import { resolveNoteImage } from './noteStore';

describe('note image persistence', () => {
  const previous = { image: new Blob(['old']), imagePath: 'notes/old.webp' };

  it('preserves the current image when an edit does not change it', () => {
    expect(resolveNoteImage({}, previous)).toEqual(previous);
  });

  it('persists an explicit image clear instead of restoring the previous image', () => {
    expect(resolveNoteImage({ clearImage: true }, previous)).toEqual({ image: undefined, imagePath: undefined });
  });

  it('uses a replacement image and keeps the existing remote image path', () => {
    const replacement = new Blob(['new']);
    expect(resolveNoteImage({ image: replacement }, previous)).toEqual({
      image: replacement,
      imagePath: previous.imagePath,
    });
  });
});
