export function isCorrectSelection(correct: readonly string[], selected: readonly string[]): boolean {
  if (correct.length === 0 || selected.length !== correct.length) return false;
  const selectedSet = new Set(selected);
  return correct.every((answer) => selectedSet.has(answer));
}
