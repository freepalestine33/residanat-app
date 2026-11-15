import { describe, expect, it } from 'vitest';
import { resolveNoteAudio, resolveNoteImage } from './noteStore';

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

describe('note audio persistence', () => {
  const previous = { audio: new Blob(['old']), audioPath: 'notes/old.webm', audioDuration: 42 };

  it('preserves the current audio when an edit does not change it', () => {
    expect(resolveNoteAudio({}, previous)).toEqual(previous);
  });

  it('persists an explicit audio clear instead of restoring the previous audio', () => {
    expect(resolveNoteAudio({ clearAudio: true }, previous)).toEqual({ audio: undefined, audioPath: undefined, audioDuration: undefined });
  });

  it('uses a replacement recording and keeps the existing remote audio path', () => {
    const replacement = new Blob(['new'], { type: 'audio/webm' });
    expect(resolveNoteAudio({ audio: replacement, audioDuration: 12 }, previous)).toEqual({
      audio: replacement,
      audioPath: previous.audioPath,
      audioDuration: 12,
    });
  });
});
