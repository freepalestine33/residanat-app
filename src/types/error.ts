export type ErrorType = 'card' | 'quiz' | 'vf';

export interface ErrorEntry {
  type: ErrorType;
  id: string; // Global ID
  lec: string; // Lecture ID
  q: string; // Question
  a: string; // Answer/explanation
  detail: string; // Detailed error
  highConfWrong: boolean; // High confidence wrong answer
  count: number; // Repeat errors
  made: Record<number, string>; // Created cards from errors (propIndex -> cardId)
  ts: string; // ISO timestamp
}
