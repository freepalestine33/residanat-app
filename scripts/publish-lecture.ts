import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LectureDraftSchema, LectureSchema } from '../src/lib/schema';
import { otrProgramme } from '../src/data/otrProgramme';
import { validateLectureValue } from './lecturePipeline';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requestedDraft = process.argv[2];
if (!requestedDraft) {
  console.error('Usage: npm run lecture:publish -- <data/drafts/id.json>');
  process.exit(2);
}

const draftPath = resolve(requestedDraft);
const draftsRoot = resolve(repoRoot, 'data/drafts');
if (!draftPath.startsWith(`${draftsRoot}\\`) && !draftPath.startsWith(`${draftsRoot}/`)) {
  console.error('ERROR Publish only accepts a draft under data/drafts/.');
  process.exit(1);
}
if (!existsSync(draftPath)) {
  console.error(`ERROR Draft not found: ${draftPath}`);
  process.exit(1);
}

let draft;
try {
  draft = LectureDraftSchema.parse(JSON.parse(readFileSync(draftPath, 'utf8')) as unknown);
} catch (error) {
  console.error(`ERROR Invalid draft: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
const check = validateLectureValue(draft.lecture);
for (const error of check.errors) console.error(`ERROR ${error}`);
for (const warning of check.warnings) console.warn(`WARN  ${warning}`);
if (check.errors.length) process.exit(1);

const lecture = LectureSchema.parse(draft.lecture);
const indexPath = resolve(repoRoot, 'public/data/index.json');
const indexData = JSON.parse(readFileSync(indexPath, 'utf8')) as { lectures: Array<Record<string, unknown> & { id: string }> };
if (indexData.lectures.some((item) => item.id === lecture.id)) {
  console.error(`ERROR Lecture id ${lecture.id} is already published.`);
  process.exit(1);
}
if (lecture.otrNumber !== undefined) {
  const topic = otrProgramme.find((entry) => entry.number === lecture.otrNumber);
  if (!topic) {
    console.error(`ERROR OTR topic ${lecture.otrNumber} is not in the programme.`);
    process.exit(1);
  }
  if (topic.lectureId && topic.lectureId !== lecture.id) {
    console.error(`ERROR OTR topic ${lecture.otrNumber} is already integrated as ${topic.lectureId}.`);
    process.exit(1);
  }
  if (indexData.lectures.some((item) => item.otrNumber === lecture.otrNumber)) {
    console.error(`ERROR OTR topic ${lecture.otrNumber} already has a published lecture.`);
    process.exit(1);
  }
}

const lecturePath = resolve(repoRoot, `public/data/lectures/${lecture.id}.json`);
if (existsSync(lecturePath)) {
  console.error(`ERROR Lecture file already exists: ${lecturePath}`);
  process.exit(1);
}

let publishedLecture = { ...lecture };
let publishedPdfPath: string | undefined;
if (draft.sourcePdfPath) {
  const safeRelativePath = draft.sourcePdfPath.replace(/\\/g, '/');
  if (!safeRelativePath.startsWith('pdfs/') || safeRelativePath.includes('..')) {
    console.error('ERROR Draft PDF reference is invalid.');
    process.exit(1);
  }
  const sourcePdf = resolve(dirname(draftPath), safeRelativePath);
  if (!existsSync(sourcePdf)) {
    console.error(`ERROR Draft source PDF is missing: ${sourcePdf}`);
    process.exit(1);
  }
  const pdfDir = resolve(repoRoot, 'data/published-drafts/pdfs');
  mkdirSync(pdfDir, { recursive: true });
  publishedPdfPath = resolve(pdfDir, `${lecture.id}.pdf`);
  if (existsSync(publishedPdfPath)) {
    console.error(`ERROR Archived PDF already exists: ${publishedPdfPath}`);
    process.exit(1);
  }
  copyFileSync(sourcePdf, publishedPdfPath);
}

const entry: Record<string, unknown> = {
  id: lecture.id,
  progId: lecture.progId ?? null,
  name: lecture.name,
  cards: lecture.cards.length,
  quiz: lecture.quiz.length,
  vf: lecture.vf.length,
};
if (lecture.otrNumber !== undefined) entry.otrNumber = lecture.otrNumber;
if (lecture.pdfUrl) entry.pdfUrl = lecture.pdfUrl;
const nextIndex = { ...indexData, lectures: [...indexData.lectures, entry as typeof indexData.lectures[number]] };

const temporaryLecturePath = `${lecturePath}.tmp`;
const temporaryIndexPath = `${indexPath}.tmp`;
writeFileSync(temporaryLecturePath, `${JSON.stringify(publishedLecture, null, 2)}\n`, 'utf8');
writeFileSync(temporaryIndexPath, `${JSON.stringify(nextIndex, null, 1)}\n`, 'utf8');
renameSync(temporaryLecturePath, lecturePath);
renameSync(temporaryIndexPath, indexPath);

const archiveDir = resolve(repoRoot, 'data/published-drafts');
mkdirSync(archiveDir, { recursive: true });
const archivedDraftPath = resolve(archiveDir, `${lecture.id}.json`);
const archivedDraft = { ...draft, status: 'published' as const, publishedAt: Date.now() };
writeFileSync(archivedDraftPath, `${JSON.stringify(archivedDraft, null, 2)}\n`, 'utf8');
renameSync(draftPath, resolve(archiveDir, `${lecture.id}.draft.json`));
console.log(`Published ${lecture.id} to ${lecturePath}`);
console.log(`Updated ${indexPath}`);
console.log(`Draft archived at ${archivedDraftPath}`);
