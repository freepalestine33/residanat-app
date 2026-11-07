import fs from 'node:fs';
import { LectureSchema } from '../src/lib/schema';
const dir = 'public/data'; let bad = 0;
const fail = (m: string) => { bad++; console.error('✗', m); };
let lectureCount = 0;
let cardCount = 0;
let quizCount = 0;
let vfCount = 0;
for (const f of fs.readdirSync(`${dir}/lectures`)) {
  const r = LectureSchema.safeParse(JSON.parse(fs.readFileSync(`${dir}/lectures/${f}`, 'utf8')));
  if (!r.success) { fail(`${f}: ${r.error.issues[0].path.join('.')} ${r.error.issues[0].message}`); continue; }
  lectureCount++;
  cardCount += r.data.cards.length;
  quizCount += r.data.quiz.length;
  vfCount += r.data.vf.length;
  const ids = new Set(r.data.cards.map((c) => c.id));
  for (const q of r.data.quiz) for (const c of q.cards) if (!ids.has(c)) fail(`${f}: quiz ${q.id} cites unknown card ${c}`);
  for (const v of r.data.vf) for (const c of v.cards) if (!ids.has(c)) fail(`${f}: vf ${v.id} cites unknown card ${c}`);
}
console.log(bad ? `${bad} problem(s)` : `OK — ${lectureCount} lectures, ${cardCount} cards, ${quizCount} quizzes, ${vfCount} true/false items`);
process.exit(bad ? 1 : 0);
