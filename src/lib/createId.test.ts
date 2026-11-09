import { describe, expect, it } from 'vitest';
import { createId } from './createId';

describe('createId', () => {
  it('creates UUIDs', () => {
    expect(createId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(createId()).not.toBe(createId());
  });
});
