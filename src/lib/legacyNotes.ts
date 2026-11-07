export interface LegacyNote {
  id: string;
  rel: string;
  text: string;
  link?: string;
  image?: string | Blob;
  timestamp?: string;
}

interface LegacyRecord {
  id?: number | string | null;
  rel?: string;
  text?: string;
  link?: string;
  image?: string | Blob;
  ts?: string;
  updated?: number;
}

const LEGACY_DB = 'sa_notes_db_v1';
const LEGACY_STORE = 'notes';
const LEGACY_KEY = 'sa_notes_v3';

function normalize(note: LegacyRecord): LegacyNote | null {
  if (!note || typeof note !== 'object') return null;
  const id = note.id == null ? '' : String(note.id);
  if (!id) return null;
  return {
    id,
    rel: typeof note.rel === 'string' ? note.rel : 'libre',
    text: typeof note.text === 'string' ? note.text : '',
    link: typeof note.link === 'string' ? note.link : undefined,
    image: typeof note.image === 'string' || note.image instanceof Blob ? note.image : undefined,
    timestamp: typeof note.ts === 'string'
      ? note.ts
      : typeof note.updated === 'number' ? new Date(note.updated).toISOString() : undefined,
  };
}

async function readLegacyDatabase(): Promise<LegacyRecord[]> {
  if (typeof indexedDB === 'undefined') return [];
  const factory = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
  if (!factory.databases) return [];
  const databases = await factory.databases();
  if (!databases.some((database) => database.name === LEGACY_DB)) return [];

  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    if (!database.objectStoreNames.contains(LEGACY_STORE)) return [];
    return await new Promise<LegacyRecord[]>((resolve, reject) => {
      const request = database.transaction(LEGACY_STORE, 'readonly').objectStore(LEGACY_STORE).getAll();
      request.onsuccess = () => resolve(request.result as LegacyRecord[]);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function loadLegacyNotes(): Promise<LegacyNote[]> {
  let fromDb: LegacyRecord[] = [];
  try {
    fromDb = await readLegacyDatabase();
  } catch {
    fromDb = [];
  }
  let fromStorage: LegacyRecord[] = [];
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]');
    if (Array.isArray(parsed)) fromStorage = parsed as LegacyRecord[];
  } catch {
    fromStorage = [];
  }

  const notesById = new Map<string, LegacyNote>();
  for (const raw of [...fromStorage, ...fromDb]) {
    const note = normalize(raw);
    if (!note) continue;
    const previous = notesById.get(note.id);
    const imageIsPlaceholder = note.image === '[idb]';
    const previousHasFullImage = previous?.image && previous.image !== '[idb]';
    if (!previous || (imageIsPlaceholder && previousHasFullImage)) continue;
    notesById.set(note.id, note);
  }
  return [...notesById.values()].sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
}
