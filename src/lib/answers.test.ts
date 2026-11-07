import { describe, expect, it } from 'vitest';
import { isCorrectSelection } from './answers';

describe('isCorrectSelection', () => {
  it('accepts a complete answer set regardless of selection order', () => {
    expect(isCorrectSelection(['A', 'C'], ['C', 'A'])).toBe(true);
  });

  it('rejects missing, additional, and empty answer sets', () => {
    expect(isCorrectSelection(['A', 'C'], ['A'])).toBe(false);
    expect(isCorrectSelection(['A'], ['A', 'B'])).toBe(false);
    expect(isCorrectSelection([], [])).toBe(false);
  });
});
