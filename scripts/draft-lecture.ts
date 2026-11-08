import { resolve } from 'node:path';
import { LectureSchema } from '../src/lib/schema';
import { createLectureDraft } from './create-lecture-draft';
import { printCheck, readLectureFile } from './lecturePipeline';

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
printCheck(result);
if (result.errors.length || !result.lecture) process.exit(1);
let lecture = result.lecture;
let otrNumber: number | undefined;
if (otrText) {
  otrNumber = Number(otrText);
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
if (pdfInput && !/\.pdf$/i.test(pdfInput)) {
  console.error('ERROR --pdf must point to a .pdf file.');
  process.exit(1);
}

try {
  const { draftPath } = createLectureDraft(lecture, { pdfPath: pdfInput ? resolve(pdfInput) : undefined });
  console.log(`Draft created: ${draftPath}`);
  console.log(`Preview in the app: /#/draft/${lecture.id}`);
} catch (error) {
  console.error(`ERROR ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
