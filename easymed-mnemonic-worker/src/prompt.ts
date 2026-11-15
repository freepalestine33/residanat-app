/** Prompt building + safety filter. Pure functions: easy to test. */

export const PROMPT_VERSION = 'v1'; // bump to invalidate every cached image

// Words that make an image model draw people. If the LLM output contains one,
// we throw it away and use the template prompt instead.
const PEOPLE_WORDS =
  /\b(person|people|man|men|woman|women|boy|girl|child|children|kid|kids|baby|infant|doctor|physician|surgeon|nurse|patient|human|humans|portrait|face|faces|selfie|crowd|student|animal|animals|snail|dog|cat|bird|fish|insect|spider|mouse|rat|horse|cow|pig|rabbit|monkey|lion|tiger|bear|snake|frog|turtle|owl|butterfly|bee|ant|worm)\b/i;

export const hasPeopleWords = (s: string) => PEOPLE_WORDS.test(s);

export const STYLE_SUFFIX =
  'Bold cartoon sticker illustration, bright saturated colors, clean plain background, ' +
  'one clear central scene made only of objects, tools, anatomical structures and symbols. No text.';

export const SYSTEM_PROMPT = `You write ONE prompt for an AI image generator. The image is a mnemonic picture that helps a medical student memorise a flashcard.
Rules:
- Read the QUESTION and ANSWER (they may be in French). Find the single key idea of the ANSWER.
- Turn it into ONE vivid, simple, slightly absurd scene that works as a visual metaphor or pun for that idea.
- Use ONLY objects, tools, plants, cartoon microbes, cartoon organs or bones, and symbols. NEVER include people, human faces, doctors, patients, crowds or animals.
- NEVER ask for text, letters, numbers, labels or captions in the image.
- Write in English, maximum 55 words, one paragraph.
- Output ONLY the prompt. No quotes, no explanations.`;

export function userMessage(question: string, answer: string): string {
  return `QUESTION: ${question}\nANSWER: ${answer}`;
}

/** Remove control characters, quotes and line breaks; cap the length. */
export function cleanLlmOutput(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/^["'`\s]+|["'`\s]+$/g, '')
    .replace(/^prompt\s*:\s*/i, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 600)
    .trim();
}

/** Used when the LLM fails or returns something unsafe. */
export function fallbackPrompt(question: string, answer: string): string {
  const idea = (answer || question)
    .replace(PEOPLE_WORDS, '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .slice(0, 160)
    .trim();
  return `A memorable symbolic still life that represents the idea: ${idea}. ${STYLE_SUFFIX}`;
}

/** Final image prompt from the (untrusted) LLM output. */
export function finalizePrompt(llmOutput: unknown, question: string, answer: string): { prompt: string; usedFallback: boolean } {
  const cleaned = cleanLlmOutput(llmOutput);
  if (cleaned.length < 20 || hasPeopleWords(cleaned)) {
    return { prompt: fallbackPrompt(question, answer), usedFallback: true };
  }
  return { prompt: `${cleaned} ${STYLE_SUFFIX}`.slice(0, 2000), usedFallback: false };
}
