import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LectureSchema } from '../src/lib/schema';
import { otrProgramme } from '../src/data/otrProgramme';
import { validateLectureValue } from './lecturePipeline';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function createLectureDraft(value: unknown, options: { pdfPath?: string; otrNumber?: number } = {}) {
  const parsed = LectureSchema.parse(value);
  const lecture = LectureSchema.parse({ ...parsed, ...(options.otrNumber === undefined ? {} : { otrNumber: options.otrNumber }) });
  const check = validateLectureValue(lecture);
  if (check.errors.length) throw new Error(check.errors.join('\n'));

  if (lecture.otrNumber !== undefined) {
    const topic = otrProgramme.find((entry) => entry.number === lecture.otrNumber);
    if (topic?.lectureId && topic.lectureId !== lecture.id) {
      throw new Error(`OTR topic ${lecture.otrNumber} is already integrated as ${topic.lectureId}.`);
    }
  }

  const indexPath = resolve(repoRoot, 'public/data/index.json');
  const indexData = JSON.parse(readFileSync(indexPath, 'utf8')) as { lectures: Array<{ id: string }> };
  if (indexData.lectures.some((item) => item.id === lecture.id)) throw new Error(`Lecture id ${lecture.id} is already published.`);

  const draftDir = resolve(repoRoot, 'data/drafts');
  const draftPath = resolve(draftDir, `${lecture.id}.json`);
  const pdfDir = resolve(draftDir, 'pdfs');
  const storedPdfPath = options.pdfPath ? resolve(pdfDir, `${lecture.id}.pdf`) : undefined;
  if (existsSync(draftPath)) throw new Error(`Draft already exists: ${draftPath}`);
  if (storedPdfPath && existsSync(storedPdfPath)) throw new Error(`Draft PDF already exists: ${storedPdfPath}`);
  if (options.pdfPath && !existsSync(options.pdfPath)) throw new Error(`PDF not found: ${options.pdfPath}`);

  mkdirSync(draftDir, { recursive: true });
  if (storedPdfPath) {
    mkdirSync(pdfDir, { recursive: true });
    copyFileSync(options.pdfPath!, storedPdfPath);
  }

  const draft = {
    status: 'draft' as const,
    generatedAt: Date.now(),
    ...(options.pdfPath ? { sourcePdfName: basename(options.pdfPath), sourcePdfPath: `pdfs/${lecture.id}.pdf` } : {}),
    lecture,
  };
  const temporaryPath = `${draftPath}.tmp`;
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
    renameSync(temporaryPath, draftPath);
  } catch (error) {
    if (existsSync(temporaryPath)) removeFile(temporaryPath);
    if (storedPdfPath && existsSync(storedPdfPath)) removeFile(storedPdfPath);
    throw error;
  }

  return { lecture, draft, draftPath, warnings: check.warnings };
}

function removeFile(path: string) {
  try { unlinkSync(path); } catch { /* Preserve the original write error. */ }
}
