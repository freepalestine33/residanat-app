import { describe, expect, it } from 'vitest';
import {
  buildIllustrationPrompt,
  isFaceFreeIllustrationReview,
  isInvalidGeminiApiKeyResponse,
  isSuspendedGeminiProjectResponse,
} from './cardIllustration';

describe('buildIllustrationPrompt', () => {
  const input = {
    lectureName: 'Spondylarthrite Ankylosante',
    question: 'Quel est le mécanisme de la douleur inflammatoire ?',
    answer: 'Réveil nocturne, soulagement par les AINS, raideur matinale.',
  };

  it('includes the lecture, question and answer context', () => {
    const prompt = buildIllustrationPrompt(input);
    expect(prompt).toContain('Spondylarthrite Ankylosante');
    expect(prompt).toContain('Quel est le mécanisme de la douleur inflammatoire ?');
    expect(prompt).toContain('Réveil nocturne, soulagement par les AINS');
  });

  it('creates a recall-focused mnemonic without text or recognizable faces', () => {
    const prompt = buildIllustrationPrompt(input).toLowerCase();
    expect(prompt).toContain('visual mnemonic');
    expect(prompt).toContain('visual associations');
    expect(prompt).toContain('no text');
    expect(prompt).toContain('square composition');
    expect(prompt).toContain('no watermark');
    expect(prompt).toContain('do not depict people, human bodies, heads, portraits, or faces');
    expect(prompt).toContain('heavily blur the entire head and face');
  });

  it('is deterministic and collapses whitespace', () => {
    const messy = buildIllustrationPrompt({ ...input, question: 'Ligne 1\n\n   Ligne 2   ' });
    expect(messy).toBe(buildIllustrationPrompt({ ...input, question: 'Ligne 1\n\n   Ligne 2   ' }));
    expect(messy).toContain('Ligne 1 Ligne 2');
    expect(messy).not.toMatch(/\n\n/);
  });

  it('clamps oversized fields instead of building an unbounded prompt', () => {
    const prompt = buildIllustrationPrompt({ ...input, answer: 'a'.repeat(5000) });
    const factsLine = prompt.split('\n').find((line) => line.startsWith('Key facts'));
    expect(factsLine?.length).toBeLessThanOrEqual('Key facts the image must convey: '.length + 1200);
  });

  it('only accepts an explicit face-free review result', () => {
    expect(isFaceFreeIllustrationReview({ containsHumanFace: false })).toBe(true);
    expect(isFaceFreeIllustrationReview({ containsHumanFace: true })).toBe(false);
    expect(isFaceFreeIllustrationReview({})).toBe(false);
    expect(isFaceFreeIllustrationReview(null)).toBe(false);
    expect(isFaceFreeIllustrationReview('{"containsHumanFace":false}')).toBe(false);
  });

  it('recognizes Gemini invalid API key responses without misclassifying other errors', () => {
    const response = JSON.stringify({
      error: {
        status: 'INVALID_ARGUMENT',
        message: 'API key not valid. Please pass a valid API key.',
        details: [{ reason: 'API_KEY_INVALID' }],
      },
    });
    expect(isInvalidGeminiApiKeyResponse(400, response)).toBe(true);
    expect(isInvalidGeminiApiKeyResponse(400, 'API_KEY_INVALID')).toBe(true);
    expect(isInvalidGeminiApiKeyResponse(403, response)).toBe(false);
    expect(isInvalidGeminiApiKeyResponse(400, '{"error":{"message":"Quota exceeded"}}')).toBe(false);
  });

  it('recognizes suspended Gemini projects without misclassifying other permission errors', () => {
    const response = '{"error":{"code":403,"message":"Permission denied: Consumer project has been suspended.","status":"PERMISSION_DENIED"}}';
    expect(isSuspendedGeminiProjectResponse(403, response)).toBe(true);
    expect(isSuspendedGeminiProjectResponse(403, '{"error":{"message":"Permission denied"}}')).toBe(false);
    expect(isSuspendedGeminiProjectResponse(400, response)).toBe(false);
  });
});
