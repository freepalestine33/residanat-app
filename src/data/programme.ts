import type { ProgrammeData, ProgrammeCategory, ProgrammeGroup, ProgrammeItem, ProgrammeCategoryCode } from '../types/programme';

// Load programme.json from public/data
const base = import.meta.env.BASE_URL + 'data/';

async function getJson(path: string): Promise<unknown> {
  const r = await fetch(base + path);
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

let programmePromise: Promise<ProgrammeData> | null = null;

export async function loadProgramme(): Promise<ProgrammeData> {
  if (!programmePromise) {
    programmePromise = getJson('programme.json').then((data) => data as ProgrammeData).catch((error: unknown) => {
      programmePromise = null;
      throw error;
    });
  }
  return programmePromise;
}

export function getProgrammeCategory(data: ProgrammeData, code: ProgrammeCategoryCode): ProgrammeCategory | null {
  return data[code] || null;
}

export function getProgrammeItems(data: ProgrammeData, code: ProgrammeCategoryCode): ProgrammeItem[] {
  const cat = getProgrammeCategory(data, code);
  if (!cat) return [];
  return cat.groups.flatMap(g => g.items);
}

export function getAllProgrammeItems(data: ProgrammeData): ProgrammeItem[] {
  return Object.values(data).flatMap(cat =>
    cat.groups.flatMap(g => g.items)
  );
}

export function searchProgramme(data: ProgrammeData, query: string): ProgrammeItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return getAllProgrammeItems(data);

  return getAllProgrammeItems(data).filter(item =>
    item.t.toLowerCase().includes(q) ||
    item.d.toLowerCase().includes(q) ||
    item.s.toLowerCase().includes(q)
  );
}

export function getProgrammeCategories(data: ProgrammeData): Array<{ code: string; name: string }> {
  return Object.entries(data).map(([code, cat]) => ({
    code,
    name: cat.name
  }));
}

export function getProgrammeGroups(data: ProgrammeData, categoryCode: ProgrammeCategoryCode): ProgrammeGroup[] {
  const cat = getProgrammeCategory(data, categoryCode);
  return cat?.groups || [];
}
