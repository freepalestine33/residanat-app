export interface VFQuestion {
  id: string;
  s: string; // Statement
  a: boolean; // Answer
  w: string; // Wrong answer explanation
  cards: string[]; // Linked card IDs
}
