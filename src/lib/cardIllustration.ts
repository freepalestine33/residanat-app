export interface CardIllustrationInput {
  lectureName: string;
  question: string;
  answer: string;
}

export function isFaceFreeIllustrationReview(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  return (value as { containsHumanFace?: unknown }).containsHumanFace === false;
}

export function isInvalidGeminiApiKeyResponse(status: number, body: string): boolean {
  if (status !== 400) return false;
  if (/API key not valid|API_KEY_INVALID/i.test(body)) return true;

  try {
    const payload: unknown = JSON.parse(body);
    if (!payload || typeof payload !== 'object') return false;
    const error = (payload as { error?: unknown }).error;
    if (!error || typeof error !== 'object') return false;
    const details = (error as { details?: unknown }).details;
    return Array.isArray(details) && details.some((detail) => (
      Boolean(detail)
      && typeof detail === 'object'
      && (detail as { reason?: unknown }).reason === 'API_KEY_INVALID'
    ));
  } catch {
    return false;
  }
}

export function isSuspendedGeminiProjectResponse(status: number, body: string): boolean {
  return status === 403 && /project.{0,100}has been suspended|project.{0,100}suspended/i.test(body);
}

const MAX_FIELD_CHARS = 1200;

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_FIELD_CHARS);
}

/**
 * Builds the image-model prompt for a single flashcard. Pure so it can be unit
 * tested and reused without touching the lecture-generation prompt.
 *
 * Text is explicitly forbidden because image models render lettering poorly and
 * the app already shows the question/answer next to the illustration.
 */
export function buildIllustrationPrompt({ lectureName, question, answer }: CardIllustrationInput): string {
  return [
    'Create one educational medical illustration for a French residency (résidanat) study flashcard.',
    `Topic area: ${clean(lectureName)}.`,
    `Learning point to visualise: ${clean(question)}`,
    `Key facts the image must convey: ${clean(answer)}`,
    'Memory goal: create a memorable visual mnemonic that makes the key facts easy to recall. Combine a small number of clear visual symbols into one coherent scene; use visual associations, metaphor, or a simple sequence to connect the facts. Prioritise the learning point over decoration.',
    'Visual direction: clean editorial medical illustration, calm navy and teal palette on a soft neutral background, generous negative space, simple concept diagram with a clear visual hierarchy, subtle depth, professional textbook quality.',
    'Audience: medical residents. Prioritise conceptual clarity and memorable associations over photorealism.',
    'Constraints: no text, letters, numbers, labels, captions, no watermark, and no logos. Do not depict people, human bodies, heads, portraits, or faces. Avoid facial features entirely. If a human figure is absolutely essential, use a faceless abstract silhouette and heavily blur the entire head and face so no features are recognizable. Do not depict identifiable real patients or graphic distress.',
    'Square composition, one clear focal subject, high detail.',
  ].join('\n');
}
