import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LectureSchema, type Lecture } from '../src/lib/schema';
import { otrProgramme } from '../src/data/otrProgramme';

export interface LectureCheck {
  lecture?: Lecture;
  errors: string[];
  warnings: string[];
}

export function validateLectureValue(value: unknown): LectureCheck {
  const parsed = LectureSchema.safeParse(value);
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'lecture'}: ${issue.message}`),
      warnings: [],
    };
  }

  const lecture = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  const registerId = (id: string, label: string) => {
    if (!id.trim()) errors.push(`${label}: id cannot be empty.`);
    else if (seenIds.has(id)) errors.push(`${label}: duplicate content id "${id}".`);
    else seenIds.add(id);
  };

  lecture.cards.forEach((card, index) => {
    registerId(card.id, `cards[${index}]`);
    if (!card.q.trim()) errors.push(`cards[${index}]: question cannot be empty.`);
    if (!card.a.trim()) errors.push(`cards[${index}]: answer cannot be empty.`);
  });
  lecture.quiz.forEach((question, index) => {
    registerId(question.id, `quiz[${index}]`);
    if (!question.q.trim()) errors.push(`quiz[${index}]: question cannot be empty.`);
    if (!question.cards.length) errors.push(`quiz[${index}] (${question.id}): link at least one card in cards[].`);
    for (const cardId of question.cards) if (!lecture.cards.some((card) => card.id === cardId)) errors.push(`quiz[${index}] (${question.id}): unknown linked card "${cardId}".`);
    for (const option of question.opts) for (const cardId of option.c ?? []) {
      if (!lecture.cards.some((card) => card.id === cardId)) errors.push(`quiz[${index}] (${question.id}): option cites unknown card "${cardId}".`);
    }
    const correctCount = question.opts.filter((option) => option.ok).length;
    if (!correctCount) errors.push(`quiz[${index}] (${question.id}): mark at least one correct option.`);
    else if (correctCount === question.opts.length) warnings.push(`quiz[${index}] (${question.id}): every option is marked correct; verify this is intentional.`);
    if (!question.explain.trim()) warnings.push(`quiz[${index}] (${question.id}): explanation is empty.`);
    if (!question.src?.trim()) warnings.push(`quiz[${index}] (${question.id}): source is not specified.`);
  });
  if (lecture.quiz.length > 1) {
    const correctOptionCounts = lecture.quiz.map((question) => question.opts.filter((option) => option.ok).length);
    if (correctOptionCounts.every((count) => count === correctOptionCounts[0])) {
      warnings.push(`All ${lecture.quiz.length} quiz questions have ${correctOptionCounts[0]} correct option(s); verify the answer pattern.`);
    }
  }
  lecture.vf.forEach((question, index) => {
    registerId(question.id, `vf[${index}]`);
    if (!question.s.trim()) errors.push(`vf[${index}]: statement cannot be empty.`);
    if (!question.cards.length) errors.push(`vf[${index}] (${question.id}): link at least one card in cards[].`);
    for (const cardId of question.cards) if (!lecture.cards.some((card) => card.id === cardId)) errors.push(`vf[${index}] (${question.id}): unknown linked card "${cardId}".`);
    if (!question.w.trim()) warnings.push(`vf[${index}] (${question.id}): explanation is empty.`);
  });
  if (!lecture.cards.length) errors.push('The lecture must contain at least one interactive card.');

  if (lecture.otrNumber !== undefined) {
    const topic = otrProgramme.find((entry) => entry.number === lecture.otrNumber);
    if (!topic) errors.push(`otrNumber ${lecture.otrNumber} is not in the OTR programme.`);
    else if (topic.lectureId && topic.lectureId !== lecture.id) errors.push(`OTR topic ${lecture.otrNumber} is already integrated as ${topic.lectureId}.`);
  }

  return { lecture, errors, warnings };
}

export function readLectureFile(filePath: string): LectureCheck {
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) return { errors: [`File not found: ${absolutePath}`], warnings: [] };
  try {
    return validateLectureValue(JSON.parse(readFileSync(absolutePath, 'utf8')) as unknown);
  } catch (error) {
    return { errors: [`Could not read JSON: ${error instanceof Error ? error.message : String(error)}`], warnings: [] };
  }
}

export function printCheck(check: LectureCheck) {
  for (const error of check.errors) console.error(`ERROR ${error}`);
  for (const warning of check.warnings) console.warn(`WARN  ${warning}`);
  if (check.lecture && !check.errors.length) {
    console.log(`Valid lecture ${check.lecture.id}: ${check.lecture.cards.length} cards, ${check.lecture.quiz.length} quizzes, ${check.lecture.vf.length} true/false.`);
  }
}
