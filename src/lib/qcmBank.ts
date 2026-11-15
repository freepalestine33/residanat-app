export interface QcmBankOption {
  l: string;
  t: string;
  c: boolean;
}

export interface QcmBankEntry {
  id: number;
  bank_id: number;
  otr_number: number | null;
  module: string;
  chapter: string;
  context: string | null;
  star: boolean;
  corrected: boolean;
  stem: string;
  options: QcmBankOption[];
  justification: string | null;
  sources: string[];
}

export interface QcmBankIndexEntry {
  id: number;
  module: string;
  chapter: string;
  otr_number: number | null;
  star: boolean;
  corrected: boolean;
}

const INDEX_SELECT = 'id,module,chapter,otr_number,star,corrected';
const FULL_SELECT = 'id,bank_id,otr_number,module,chapter,context,star,corrected,stem,options,justification,sources';

function supabaseRestUrl(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return `${url.replace(/\/+$/, '')}/rest/v1/qcm_bank`;
}

function restHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' };
}

async function qcmFetch(path: string): Promise<unknown> {
  const base = supabaseRestUrl();
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !key) throw new Error('Supabase non configuré.');
  const response = await fetch(`${base}?${path}`, { headers: restHeaders(key) });
  if (!response.ok) throw new Error(`Banque QCM indisponible (${response.status}).`);
  return response.json();
}

let indexPromise: Promise<QcmBankIndexEntry[]> | null = null;

/** Index léger (sans énoncés) pour naviguer module → chapitre. Mis en cache pour la session. */
export function fetchQcmBankIndex(): Promise<QcmBankIndexEntry[]> {
  indexPromise ??= qcmFetch(`${INDEX_SELECT}&order=module.asc,chapter.asc`)
    .then((data) => (Array.isArray(data) ? (data as QcmBankIndexEntry[]) : []))
    .catch((reason) => {
      indexPromise = null;
      throw reason;
    });
  return indexPromise;
}

/** Questions complètes d'un chapitre. */
export async function fetchQcmChapter(module: string, chapter: string): Promise<QcmBankEntry[]> {
  const params = new URLSearchParams({
    select: FULL_SELECT,
    module: `eq.${module}`,
    chapter: `eq.${chapter}`,
    order: 'star.desc,corrected.desc,bank_id.asc',
  });
  const data = await qcmFetch(params.toString());
  return Array.isArray(data) ? (data as QcmBankEntry[]) : [];
}

/** Questions complètes d'un sujet OTR (pour le mode entraînement par sujet). */
export async function fetchQcmByOtr(otrNumber: number, limit = 60): Promise<QcmBankEntry[]> {
  const params = new URLSearchParams({
    select: FULL_SELECT,
    otr_number: `eq.${otrNumber}`,
    corrected: 'eq.true',
    order: 'star.desc,bank_id.asc',
    limit: String(limit),
  });
  const data = await qcmFetch(params.toString());
  return Array.isArray(data) ? (data as QcmBankEntry[]) : [];
}

export interface QcmChapterRef {
  module: string;
  chapter: string;
}

export interface QcmBankIndex {
  /** module -> chapter -> nb de questions */
  tree: Map<string, Map<string, number>>;
  chaptersByOtr: Map<number, QcmChapterRef[]>;
  total: number;
}

/** Construit l'arborescence module → chapitre et l'index par sujet OTR. */
export function buildQcmBankIndex(entries: QcmBankIndexEntry[]): QcmBankIndex {
  const tree = new Map<string, Map<string, number>>();
  const chaptersByOtr = new Map<number, QcmChapterRef[]>;
  const seen = new Set<string>();
  for (const entry of entries) {
    const moduleChapters = tree.get(entry.module) ?? new Map<string, number>();
    moduleChapters.set(entry.chapter, (moduleChapters.get(entry.chapter) ?? 0) + 1);
    tree.set(entry.module, moduleChapters);
    if (entry.otr_number != null) {
      const key = `${entry.module}::${entry.chapter}`;
      if (!seen.has(key)) {
        seen.add(key);
        const list = chaptersByOtr.get(entry.otr_number) ?? [];
        list.push({ module: entry.module, chapter: entry.chapter });
        chaptersByOtr.set(entry.otr_number, list);
      }
    }
  }
  return { tree, chaptersByOtr, total: entries.length };
}

const EXAM_CONTEXT_CACHE = new Map<string, Promise<string>>();
const MAX_EXAM_QUESTIONS = 12;

function formatExamQuestion(q: QcmBankEntry): string {
  const correct = q.options.filter((o) => o.c).map((o) => o.l).join(', ');
  const stem = q.stem.replace(/\s+/g, ' ').trim();
  return `- ${stem}\n  Réponses exactes : ${correct}${q.justification ? ` — ${q.justification.replace(/\s+/g, ' ').trim()}` : ''}`;
}

/**
 * Construit le bloc « questions d'annales » injecté dans le prompt de génération.
 * Retourne '' si la banque est indisponible ou sans sujet correspondant.
 */
export function fetchQcmExamContext(input: { otrNumber?: number; name?: string }): Promise<string> {
  const key = input.otrNumber ? `otr:${input.otrNumber}` : `name:${(input.name ?? '').toLowerCase()}`;
  let promise = EXAM_CONTEXT_CACHE.get(key);
  if (!promise) {
    promise = buildExamContext(input).catch(() => '');
    EXAM_CONTEXT_CACHE.set(key, promise);
  }
  return promise;
}

async function buildExamContext(input: { otrNumber?: number; name?: string }): Promise<string> {
  if (!supabaseRestUrl()) return '';
  let rows: QcmBankEntry[] = [];
  if (input.otrNumber) {
    rows = await fetchQcmByOtr(input.otrNumber, MAX_EXAM_QUESTIONS);
  } else if (input.name) {
    // Recherche par mots-clés du titre dans les intitulés de chapitres.
    const tokens = input.name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-zà-ÿ0-9]+/i).filter((t) => t.length > 3);
    if (tokens.length) {
      const params = new URLSearchParams({
        select: FULL_SELECT,
        corrected: 'eq.true',
        order: 'star.desc,bank_id.asc',
        limit: String(MAX_EXAM_QUESTIONS),
      });
      params.set('or', `(${tokens.slice(0, 3).map((t) => `chapter.ilike.*${t}*`).join(',')})`);
      const data = await qcmFetch(params.toString());
      rows = Array.isArray(data) ? (data as QcmBankEntry[]) : [];
    }
  }
  if (!rows.length) return '';
  const lines = rows.map(formatExamQuestion);
  return [
    '<questions_annales>',
    `Questions réelles de la banque QCM OTR sur ce sujet (${rows.length} extraites). Elles indiquent les thèmes et formulations qui tombent réellement au concours :`,
    ...lines,
    'Utilise-les comme référence de priorité : les notions qu\'elles couvrent sont les plus examinées. Reste fidèle au texte source fourni ; ne reprends une question d\'annale dans le quiz que si le cours fourni en confirme les notions.',
    '</questions_annales>',
  ].join('\n');
}
