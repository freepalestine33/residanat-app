import type { Card } from './card';
import type { QuizQuestion } from './quiz';
import type { VFQuestion } from './vf';

export interface Lecture {
  schema: 1;
  id: string;
  progId?: string | null;
  otrNumber?: number;
  moduleId?: string | null;
  name: string;
  keys: string[];
  contrasts: string[];
  cards: Card[];
  quiz: QuizQuestion[];
  vf: VFQuestion[];
  pdf?: string;
  pdfUrl?: string;
}

export interface LectureMeta {
  id: string;
  progId: string | null;
  otrNumber?: number;
  moduleId?: string | null;
  name: string;
  cards: number;
  quiz: number;
  vf: number;
  pdfUrl?: string;
  isUserCreated?: boolean;
  userLectureId?: string;
}
