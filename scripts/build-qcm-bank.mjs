#!/usr/bin/env node
/**
 * Extrait la banque de QCM OTR depuis le HTML source et génère :
 *  - supabase/migrations/202611160001_qcm_bank.sql  (schéma + RLS)
 *  - supabase/qcm_bank_seed.sql                     (données, à exécuter après la migration)
 *
 * Usage : node scripts/build-qcm-bank.mjs <chemin-vers-Banque_QCM_OTR_reclassified-3.html>
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = process.argv[2];
if (!htmlPath) {
  console.error('Usage: node scripts/build-qcm-bank.mjs <Banque_QCM_OTR_reclassified-3.html>');
  process.exit(1);
}

const html = readFileSync(htmlPath, 'utf8');

function extractConst(name) {
  const match = html.match(new RegExp(`const ${name}=(\\[[\\s\\S]*?\\]);`));
  if (!match) throw new Error(`const ${name} introuvable dans le HTML`);
  return JSON.parse(match[1]);
}

const questions = extractConst('DATA');
const coursNames = extractConst('COURS');

// Vérifie la correspondance COURS[i] ↔ otrProgramme (number = i+1)
const programmeSrc = readFileSync(join(root, 'src/data/otrProgramme.ts'), 'utf8');
const programme = [...programmeSrc.matchAll(/\{\s*number:\s*(\d+),\s*title:\s*'([^']+)'/g)]
  .map((m) => ({ number: Number(m[1]), title: m[2] }));
const mismatches = [];
for (const entry of programme) {
  const bankName = coursNames[entry.number - 1];
  if (bankName && bankName !== entry.title) mismatches.push({ number: entry.number, bank: bankName, app: entry.title });
}
if (mismatches.length) {
  console.warn('Écarts COURS ↔ otrProgramme :', mismatches);
}

// Validation / normalisation
const seenIds = new Set();
const rows = questions.map((q, idx) => {
  if (!q.stem || !Array.isArray(q.options) || !q.options.length) {
    throw new Error(`Question invalide à l'index ${idx} (id ${q.id})`);
  }
  if (seenIds.has(q.id)) throw new Error(`id dupliqué : ${q.id}`);
  seenIds.add(q.id);
  const otrNumber = Number.isInteger(q.cours) && q.cours >= 1 && q.cours <= coursNames.length ? q.cours : null;
  return {
    bank_id: q.id,
    otr_number: otrNumber,
    module: String(q.module || 'Autre'),
    chapter: String(q.chapter || 'Non classé'),
    context: q.context ? String(q.context) : null,
    star: Boolean(q.star),
    corrected: Boolean(q.corrected),
    stem: String(q.stem),
    options: q.options.map((o) => ({ l: String(o.l || ''), t: String(o.t || ''), c: Boolean(o.c) })),
    justification: q.justification ? String(q.justification) : null,
    sources: Array.isArray(q.sources) ? q.sources.map(String) : [],
  };
});

const stats = {
  total: rows.length,
  corrected: rows.filter((r) => r.corrected).length,
  star: rows.filter((r) => r.star).length,
  withJustification: rows.filter((r) => r.justification).length,
  modules: [...new Set(rows.map((r) => r.module))],
};
console.log('Stats :', stats);

const sqlStr = (value) => value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
const sqlJson = (value) => `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;

// ---------- Migration : schéma + RLS ----------
const migration = `-- Banque de QCM OTR (annales 2014-2022) — données de référence publiques en lecture.
create table if not exists public.qcm_bank (
  id bigint generated always as identity primary key,
  bank_id integer not null,
  otr_number integer,
  module text not null,
  chapter text not null,
  context text,
  star boolean not null default false,
  corrected boolean not null default false,
  stem text not null,
  options jsonb not null,
  justification text,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qcm_bank_module_chapter_idx on public.qcm_bank (module, chapter);
create index if not exists qcm_bank_otr_idx on public.qcm_bank (otr_number);
create index if not exists qcm_bank_corrected_idx on public.qcm_bank (corrected) where corrected;

alter table public.qcm_bank enable row level security;

drop policy if exists "qcm_bank_read" on public.qcm_bank;
create policy "qcm_bank_read" on public.qcm_bank
  for select to anon, authenticated using (true);
`;

mkdirSync(join(root, 'supabase/migrations'), { recursive: true });
writeFileSync(join(root, 'supabase/migrations/202611160001_qcm_bank.sql'), migration);

// ---------- Seed : fichiers séparés (l'éditeur SQL Supabase refuse les grosses requêtes) ----------
const PER_FILE = 200;
const files = Math.ceil(rows.length / PER_FILE);
const seedDir = join(root, 'supabase/qcm_bank_seed');
mkdirSync(seedDir, { recursive: true });

let totalBytes = 0;
for (let f = 0; f < files; f += 1) {
  const slice = rows.slice(f * PER_FILE, (f + 1) * PER_FILE);
  let sql = `-- Banque de QCM OTR — partie ${f + 1}/${files} (${slice.length} questions).\n-- À exécuter APRÈS la migration 202611160001_qcm_bank.sql, dans l'ordre.\n-- La première partie vide la table ; les suivantes sont de simples insertions.\n\n`;
  if (f === 0) sql += 'truncate table public.qcm_bank restart identity;\n\n';
  const values = slice.map((r) => `(${[
    r.bank_id, r.otr_number, sqlStr(r.module), sqlStr(r.chapter), sqlStr(r.context),
    r.star, r.corrected, sqlStr(r.stem), sqlJson(r.options), sqlStr(r.justification), sqlJson(r.sources),
  ].join(', ')})`).join(',\n');
  sql += `insert into public.qcm_bank\n  (bank_id, otr_number, module, chapter, context, star, corrected, stem, options, justification, sources)\nvalues\n${values};\n`;
  const file = join(seedDir, `part-${String(f + 1).padStart(2, '0')}.sql`);
  writeFileSync(file, sql);
  totalBytes += sql.length;
}

console.log(`Écrit : supabase/migrations/202611160001_qcm_bank.sql et ${files} fichiers dans supabase/qcm_bank_seed/ (${(totalBytes / 1024 / 1024).toFixed(2)} Mo)`);
