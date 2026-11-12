import { z } from 'zod';

/** Lecture format (schema v1) — same shape as the original single-file app, now validated. */
export const CardSchema = z.object({
  id: z.string(),
  type: z.enum(['basic', 'contrast']),
  q: z.string(),
  a: z.string(),
  src: z.string().optional(),
  freq: z.number().optional(), // how often it came up in exams
});
export const LectureQuizOptionSchema = z.object({ t: z.string(), ok: z.boolean(), c: z.array(z.string()).optional() });
export const LectureQuizSchema = z.object({
  id: z.string(), q: z.string(), src: z.string().optional(), cards: z.array(z.string()).default([]),
  explain: z.string().default(''), opts: z.array(LectureQuizOptionSchema).min(2),
});
export const TrueFalseSchema = z.object({
  id: z.string(), s: z.string(), a: z.boolean(), w: z.string().default(''), cards: z.array(z.string()).default([]),
});
export const LectureSchema = z.object({
  schema: z.literal(1),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/),
  progId: z.string().nullable().optional(),
  otrNumber: z.number().int().min(1).max(43).optional(),
  moduleId: z.string().min(1).nullable().optional(),
  name: z.string(),
  keys: z.array(z.string()),
  contrasts: z.array(z.string()),
  cards: z.array(CardSchema),
  quiz: z.array(LectureQuizSchema),
  vf: z.array(TrueFalseSchema),
  pdf: z.string().optional(),
  pdfUrl: z.string().optional(),
});
export type Lecture = z.infer<typeof LectureSchema>;
export type Card = z.infer<typeof CardSchema>;

export const LectureDraftSchema = z.object({
  status: z.literal('draft'),
  generatedAt: z.number(),
  sourcePdfName: z.string().optional(),
  sourcePdfPath: z.string().optional(),
  lecture: LectureSchema,
});
export type LectureDraft = z.infer<typeof LectureDraftSchema>;

export const IndexSchema = z.object({
  lectures: z.array(z.object({ id: z.string(), progId: z.string().nullable(), otrNumber: z.number().int().min(1).max(43).optional(), name: z.string(), cards: z.number(), quiz: z.number(), vf: z.number(), pdfUrl: z.string().optional() })),
});
