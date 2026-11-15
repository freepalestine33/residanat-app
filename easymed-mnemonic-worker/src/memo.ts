/** Structured memo ("infographic") generation: prompt, validation, sanitising. Pure functions. */

export const MEMO_VERSION = 'm1'; // bump to invalidate cached memos

// Icons the front-end can draw (Lucide). Objects/symbols only: no people, no animals.
export const ICON_NAMES = ["activity", "ambulance", "anchor", "arrow-right-left", "atom", "ban", "bandage", "battery-low", "bean", "bell", "biohazard", "bomb", "bone", "box", "brain", "cable", "calendar", "check", "chevrons-down", "circle-alert", "circle-dot", "clipboard-list", "clock", "cloud", "compass", "construction", "cross", "crown", "dna", "door-open", "droplet", "droplets", "dumbbell", "flag", "flame", "flask-conical", "funnel", "gauge", "gem", "git-branch", "hammer", "heart-pulse", "hospital", "hourglass", "key", "layers", "lightbulb", "link", "lock", "lock-open", "magnet", "merge", "microscope", "moon", "mountain", "package", "paperclip", "pill", "pin", "plug", "puzzle", "radiation", "refresh-cw", "rocket", "ruler", "scale", "scissors", "shield", "shield-alert", "shield-check", "shuffle", "siren", "skull", "snowflake", "spline", "split", "stethoscope", "sun", "swords", "syringe", "tablets", "target", "test-tube", "thermometer", "timer", "traffic-cone", "trending-down", "trending-up", "triangle-alert", "umbrella", "waves", "weight", "wind", "wrench", "x", "zap"] as const;
const ICON_SET = new Set<string>(ICON_NAMES);

export interface Memo {
  title: string;
  subtitle?: string;
  steps: { icon: string; tag?: string; heading: string; caption: string }[];
  legend?: { term: string; meaning: string }[];
}

const EXAMPLE = {
  title: 'Marche : le trio musculaire de l\u2019appui',
  subtitle: 'QUAD \u2013 FESSIER \u2013 TRICEPS',
  steps: [
    { icon: 'shield-check', tag: 'FREIN', heading: 'Quadriceps', caption: 'Amortit la mise en charge et emp\u00eache l\u2019effondrement du genou.' },
    { icon: 'scale', tag: 'NIVEAU', heading: 'Moyen fessier', caption: 'Garde le bassin horizontal en appui unipodal (anti-Trendelenburg).' },
    { icon: 'rocket', tag: 'PROPULSION', heading: 'Triceps sural', caption: 'Contr\u00f4le l\u2019avanc\u00e9e du tibia puis propulse vers l\u2019avant.' },
  ],
  legend: [
    { term: 'QUAD', meaning: 'Amortit et bloque la chute' },
    { term: 'FESSIER', meaning: 'Stabilise le bassin' },
    { term: 'TRICEPS', meaning: 'Contr\u00f4le puis propulse' },
  ],
};

export const MEMO_SYSTEM_PROMPT = `Tu cr\u00e9es un M\u00c9MO VISUEL pour aider un \u00e9tudiant en m\u00e9decine \u00e0 m\u00e9moriser une carte (question + r\u00e9ponse).
R\u00e9ponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans markdown.

R\u00e8gles :
- N'ajoute AUCUN fait m\u00e9dical qui n'est pas dans la r\u00e9ponse. Tu reformules, tu d\u00e9coupes, tu ne compl\u00e8tes pas.
- D\u00e9coupe la r\u00e9ponse en 2 \u00e0 6 \u00e9tapes ou points cl\u00e9s (dans l'ordre logique).
- Pour chaque \u00e9tape, choisis UNE ic\u00f4ne dans la liste, comme m\u00e9taphore visuelle de l'id\u00e9e (ex. frein = shield, ressort/amortisseur = layers, niveau \u00e0 bulle = scale, fus\u00e9e = rocket, danger = triangle-alert).
- "tag" : un mot-cl\u00e9 m\u00e9morable en majuscules (max 14 caract\u00e8res), optionnel.
- "heading" : max 28 caract\u00e8res. "caption" : une phrase courte, max 90 caract\u00e8res.
- "title" : max 60 caract\u00e8res. "subtitle" : optionnel, max 80 (un acronyme ou une accroche m\u00e9morable).
- "legend" : optionnel, 2 \u00e0 4 lignes "terme = signification" (terme max 14, signification max 48) pour r\u00e9sumer.
- Langue : celle de la carte (fran\u00e7ais en g\u00e9n\u00e9ral). Accents corrects.
- Ic\u00f4nes autoris\u00e9es : ${ICON_NAMES.join(', ')}.

Exemple de format (ne le recopie pas, adapte-toi \u00e0 la carte) :
${JSON.stringify(EXAMPLE)}`;

export const memoUserMessage = (question: string, answer: string) => `QUESTION : ${question}\nR\u00c9PONSE : ${answer}`;

/* ---------- parsing & validation ---------- */
export function parseJsonLoose(raw: unknown): unknown {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

const str = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v.replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max)
    : '';

/** Returns a clean Memo, or null if the LLM output is unusable. */
export function validateMemo(raw: unknown): Memo | null {
  const o = parseJsonLoose(raw) as any;
  if (!o || typeof o !== 'object') return null;
  const title = str(o.title, 60);
  const stepsIn = Array.isArray(o.steps) ? o.steps.slice(0, 6) : [];
  const steps = stepsIn
    .map((s: any) => ({
      icon: ICON_SET.has(s?.icon) ? s.icon : 'circle-dot',
      tag: str(s?.tag, 14).toUpperCase() || undefined,
      heading: str(s?.heading, 28),
      caption: str(s?.caption, 90),
    }))
    .filter((s: any) => s.heading || s.caption)
    .map((s: any) => ({ ...s, heading: s.heading || s.caption.slice(0, 28) }));
  if (!title || steps.length < 2) return null;
  const legend = (Array.isArray(o.legend) ? o.legend.slice(0, 4) : [])
    .map((l: any) => ({ term: str(l?.term, 14), meaning: str(l?.meaning, 48) }))
    .filter((l: any) => l.term && l.meaning);
  const memo: Memo = { title, steps };
  const subtitle = str(o.subtitle, 80);
  if (subtitle) memo.subtitle = subtitle;
  if (legend.length >= 2) memo.legend = legend;
  return memo;
}
