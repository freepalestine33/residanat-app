import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LectureSchema } from '../src/lib/schema';
import { otrProgramme } from '../src/data/otrProgramme';
import { printCheck, readLectureFile } from './lecturePipeline';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const input = args.find((arg) => !arg.startsWith('--'));
const pdfIndex = args.indexOf('--pdf');
const otrIndex = args.indexOf('--otr');
const pdfInput = pdfIndex >= 0 ? args[pdfIndex + 1] : undefined;
const otrText = otrIndex >= 0 ? args[otrIndex + 1] : undefined;

if (!input || (pdfIndex >= 0 && !pdfInput) || (otrIndex >= 0 && !otrText)) {
  console.error('Usage: npm run lecture:draft -- <lecture.json> [--pdf <source.pdf>] [--otr <1-43>]');
  process.exit(2);
}

const result = readLectureFile(input);
if (result.errors.length) {
  printCheck(result);
  process.exit(1);
}
printCheck(result);
let lecture = result.lecture!;
if (otrText) {
  const otrNumber = Number(otrText);
  if (!Number.isInteger(otrNumber) || otrNumber < 1 || otrNumber > 43) {
    console.error('ERROR --otr must be a number from 1 to 43.');
    process.exit(1);
  }
  if (lecture.otrNumber !== undefined && lecture.otrNumber !== otrNumber) {
    console.error(`ERROR Lecture already declares OTR topic ${lecture.otrNumber}, not ${otrNumber}.`);
    process.exit(1);
  }
  lecture = LectureSchema.parse({ ...lecture, otrNumber });
}
if (lecture.otrNumber !== undefined) {
  const topic = otrProgramme.find((entry) => entry.number === lecture.otrNumber);
  if (topic?.lectureId && topic.lectureId !== lecture.id) {
    console.error(`ERROR OTR topic ${lecture.otrNumber} is already integrated as ${topic.lectureId}.`);
    process.exit(1);
  }
}

const indexPath = resolve(repoRoot, 'public/data/index.json');
const indexData = JSON.parse(readFileSync(indexPath, 'utf8')) as { lectures: Array<{ id: string }> };
if (indexData.lectures.some((item) => item.id === lecture.id)) {
  console.error(`ERROR Lecture id ${lecture.id} is already published.`);
  process.exit(1);
}

if (pdfInput && !/\.pdf$/i.test(pdfInput)) {
  console.error('ERROR --pdf must point to a .pdf file.');
  process.exit(1);
}
const draftDir = resolve(repoRoot, 'data/drafts');
const draftPath = resolve(draftDir, `${lecture.id}.json`);
if (existsSync(draftPath)) {
  console.error(`ERROR Draft already exists: ${draftPath}`);
  process.exit(1);
}
mkdirSync(draftDir, { recursive: true });

let sourcePdfName: string | undefined;
let sourcePdfPath: string | undefined;
if (pdfInput) {
  const inputPdfPath = resolve(pdfInput);
  if (!existsSync(inputPdfPath)) {
    console.error(`ERROR PDF not found: ${inputPdfPath}`);
    process.exit(1);
  }
  const pdfDir = resolve(draftDir, 'pdfs');
  mkdirSync(pdfDir, { recursive: true });
  sourcePdfName = basename(inputPdfPath);
  sourcePdfPath = `pdfs/${lecture.id}.pdf`;
  copyFileSync(inputPdfPath, resolve(pdfDir, `${lecture.id}.pdf`));
}

const draft = { status: 'draft' as const, generatedAt: Date.now(), sourcePdfName, sourcePdfPath, lecture };
writeFileSync(draftPath, `${JSON.stringify(draft, null, 2)}\n`, 'utf8');
console.log(`Draft created: ${draftPath}`);
console.log(`Preview in the app: /#/draft/${lecture.id}`);
