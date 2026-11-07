export interface QuizOption {
  t: string; // Option text
  ok: boolean; // Correctness
  c?: string[]; // Linked card IDs
}

export interface QuizQuestion {
  id: string;
  q: string; // Question text
  src?: string; // Section reference
  cards: string[]; // Linked card IDs
  explain: string; // Explanation
  opts: QuizOption[];
}

export interface McqAttempt {
  id?: number;
  qid: number;
  at: number; // Timestamp
  picked: string[]; // Selected option labels
  correct: boolean;
}
