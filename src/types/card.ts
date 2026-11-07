export type CardType = 'basic' | 'contrast';

export interface Card {
  id: string;
  type: CardType;
  q: string;
  a: string;
  src?: string;
  freq?: number; // Frequency in exams
}

export interface CardProgress {
  gid: string; // Global ID: ${lectureId}.${cardId}
  due: number; // Timestamp
  state: CardState;
  updated: number; // Timestamp
}

export interface CardState {
  interval: number;
  ease: number;
  due: string;
  reps: number;
  lapses: number;
  last: string | null;
  lastRating: number | null;
  prio: number;
}
