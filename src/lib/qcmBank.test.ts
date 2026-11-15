import { describe, expect, it } from 'vitest';
import { buildQcmBankIndex, type QcmBankIndexEntry } from './qcmBank';

const entry = (overrides: Partial<QcmBankIndexEntry>): QcmBankIndexEntry => ({
  id: 1,
  module: 'Traumatologie',
  chapter: 'Hanche traumatique',
  otr_number: 26,
  star: false,
  corrected: true,
  ...overrides,
});

describe('buildQcmBankIndex', () => {
  it('compte les questions par module puis chapitre', () => {
    const index = buildQcmBankIndex([
      entry({ id: 1 }),
      entry({ id: 2 }),
      entry({ id: 3, module: 'Rhumatologie', chapter: 'Goutte', otr_number: 27 }),
    ]);
    expect(index.total).toBe(3);
    expect(index.tree.get('Traumatologie')?.get('Hanche traumatique')).toBe(2);
    expect(index.tree.get('Rhumatologie')?.get('Goutte')).toBe(1);
  });

  it('indexe les chapitres par numéro de sujet OTR sans doublon', () => {
    const index = buildQcmBankIndex([
      entry({ id: 1, chapter: 'Hanche traumatique' }),
      entry({ id: 2, chapter: 'Hanche traumatique' }),
      entry({ id: 3, chapter: 'Fémur', otr_number: null }),
    ]);
    const chapters = index.chaptersByOtr.get(26) ?? [];
    expect(chapters).toEqual([{ module: 'Traumatologie', chapter: 'Hanche traumatique' }]);
    expect(index.chaptersByOtr.has(27)).toBe(false);
  });
});
