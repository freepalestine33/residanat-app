// Builds public/data/practice.json — a slim quiz/vf-only index so the global
// practice pages never have to fetch every full lecture file on mount.
// Run automatically via `npm run build`; also available as `npm run content:practice`.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDir = fileURLToPath(new URL('../public/data/', import.meta.url));
const lecturesDir = join(dataDir, 'lectures');

const index = JSON.parse(readFileSync(join(dataDir, 'index.json'), 'utf8'));
const indexedIds = new Set(index.lectures.map((lecture) => lecture.id));
const metaById = new Map(index.lectures.map((lecture) => [lecture.id, lecture]));

const lectures = [];
for (const file of readdirSync(lecturesDir).filter((name) => name.endsWith('.json')).sort()) {
  let content;
  try {
    content = JSON.parse(readFileSync(join(lecturesDir, file), 'utf8'));
  } catch {
    continue;
  }
  const id = content.id ?? file.replace(/\.json$/, '');
  const meta = metaById.get(id);
  // Skip files that are neither indexed nor self-identifying lecture content.
  if (!indexedIds.has(id) && !Array.isArray(content.quiz) && !Array.isArray(content.vf)) continue;
  lectures.push({
    id,
    name: content.name ?? meta?.name ?? id,
    quiz: Array.isArray(content.quiz) ? content.quiz : [],
    vf: Array.isArray(content.vf) ? content.vf : [],
  });
}

writeFileSync(
  join(dataDir, 'practice.json'),
  JSON.stringify({ lectures }),
);

const quizCount = lectures.reduce((sum, lecture) => sum + lecture.quiz.length, 0);
const vfCount = lectures.reduce((sum, lecture) => sum + lecture.vf.length, 0);
console.log(`practice.json: ${lectures.length} cours, ${quizCount} quiz, ${vfCount} vf`);
