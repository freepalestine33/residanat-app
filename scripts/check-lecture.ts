import { printCheck, readLectureFile } from './lecturePipeline';

const input = process.argv[2];
if (!input) {
  console.error('Usage: npm run lecture:check -- <lecture.json>');
  process.exit(2);
}

const result = readLectureFile(input);
printCheck(result);
if (result.errors.length) process.exit(1);
