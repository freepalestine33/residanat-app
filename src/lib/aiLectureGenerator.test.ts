import { describe, it, expect } from 'vitest';
import {
  extractJsonFromAiResponse,
  sanitizeLecturePayload,
  fitGroqRequest,
  GROQ_ON_DEMAND_TPM,
  MEDICAL_AI_PROMPT_TEMPLATE,
} from './aiLectureGenerator';

describe('aiLectureGenerator', () => {
  describe('extractJsonFromAiResponse', () => {
    it('extracts clean JSON from raw text', () => {
      const raw = '{"schema": 1, "id": "test"}';
      const parsed = extractJsonFromAiResponse(raw);
      expect(parsed).toEqual({ schema: 1, id: 'test' });
    });

    it('extracts JSON surrounded by markdown code fences', () => {
      const raw = '```json\n{"schema": 1, "id": "test_fences"}\n```';
      const parsed = extractJsonFromAiResponse(raw);
      expect(parsed).toEqual({ schema: 1, id: 'test_fences' });
    });

    it('extracts JSON when AI includes conversational preamble and postamble', () => {
      const raw = 'Voici votre cours en JSON :\n{"schema": 1, "id": "test_preamble"}\nJ’espère que cela vous aidera.';
      const parsed = extractJsonFromAiResponse(raw);
      expect(parsed).toEqual({ schema: 1, id: 'test_preamble' });
    });

    it('throws error when no valid JSON object exists', () => {
      expect(() => extractJsonFromAiResponse('Désolé, je ne peux pas.')).toThrow();
    });
  });

  describe('sanitizeLecturePayload', () => {
    it('sanitizes and fixes incomplete model outputs into valid LectureSchema', () => {
      const raw = {
        name: 'Cours de test',
        keys: ['Point 1', 'Point 2'],
        contrasts: ['Piège 1'],
        cards: [
          { id: 'c1', q: 'Définition ?', a: 'Boiterie' },
        ],
        quiz: [
          {
            id: 'q1',
            q: 'Quel est le diagnostic ?',
            opts: [
              { t: 'Choix A', ok: true },
              { t: 'Choix B', ok: false },
            ],
            // Missing cards link
          },
        ],
        vf: [
          {
            id: 'vf1',
            s: 'Le rhume de hanche est fébrile.',
            a: false,
            w: 'Il est apyrétique.',
            // Missing cards link
          },
        ],
      };

      const input = {
        id: 'test_course',
        name: 'Cours de test',
        otrNumber: 11,
        text: 'dummy text',
      };

      const lecture = sanitizeLecturePayload(raw, input);
      expect(lecture.schema).toBe(1);
      expect(lecture.id).toBe('test_course');
      expect(lecture.otrNumber).toBe(11);
      expect(lecture.cards.length).toBe(1);
      expect(lecture.quiz[0].cards).toContain('c1');
      expect(lecture.vf[0].cards).toContain('c1');
    });

    it('creates a fallback card if the AI returned empty cards array', () => {
      const raw = {
        name: 'Test Course',
        keys: ['Fact 1'],
        quiz: [
          {
            q: 'Question ?',
            opts: [{ t: 'A', ok: true }, { t: 'B', ok: false }],
          },
        ],
      };

      const input = {
        id: 'test_course',
        name: 'Test Course',
        text: 'dummy',
      };

      const lecture = sanitizeLecturePayload(raw, input);
      expect(lecture.cards.length).toBeGreaterThan(0);
      expect(lecture.quiz[0].cards.length).toBeGreaterThan(0);
    });
  });

  describe('fitGroqRequest', () => {
    const system = 'Tu es un assistant expert en pédagogie médicale pour le concours de résidanat. Tu réponds obligatoirement par un JSON valide.';
    const before = `${MEDICAL_AI_PROMPT_TEMPLATE}\n\n<metadata>\nTitre du cours attendu : Boiterie\n</metadata>\n\n<texte_source>\n`;
    const after = '\n</texte_source>\n\nReste concis. Réponds uniquement par l\'objet JSON :';

    it('keeps a short course under the Groq 8000 token ceiling', () => {
      const source = 'QCM. La boiterie de hanche chez l’enfant oriente vers une épiphysiolyse. '.repeat(30);
      const plan = fitGroqRequest({ system, before, after, source });
      expect(plan.truncated).toBe(false);
      expect(plan.maxTokens).toBeLessThan(8000);
      expect(plan.estimatedInputTokens + plan.maxTokens).toBeLessThanOrEqual(GROQ_ON_DEMAND_TPM - 500);
    });

    it('truncates a long PDF so prompt plus reserved completion still fits', () => {
      const source = 'Signe clinique, seuil et conduite à tenir. '.repeat(20000);
      const plan = fitGroqRequest({ system, before, after, source });
      expect(plan.truncated).toBe(true);
      expect(plan.estimatedInputTokens + plan.maxTokens).toBeLessThanOrEqual(GROQ_ON_DEMAND_TPM - 500);
      expect(plan.source.length).toBeLessThan(source.length);
    });
  });
});
