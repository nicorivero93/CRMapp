import { describe, expect, it } from 'vitest';
import { dedupBatch, parseCsvBuffer, parsePasteText } from './ingestion.js';

describe('parsePasteText', () => {
  it('extracts phone + name from line', () => {
    const r = parsePasteText('Juan Perez 11 2345 6789\nMaría +54 911 8765 4321');
    expect(r.errors).toHaveLength(0);
    expect(r.leads).toHaveLength(2);
    expect(r.leads[0]?.name).toMatch(/Juan/);
    expect(r.leads[0]?.phoneNormalized).toMatch(/^\+?\d+$/);
  });

  it('errors lines without phone', () => {
    const r = parsePasteText('solo texto\n11 2345 6789 Pepe');
    expect(r.leads).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
  });

  it('sets name to null when line is only phone', () => {
    const r = parsePasteText('+5491123456789');
    expect(r.leads[0]?.name).toBeNull();
  });
});

describe('parseCsvBuffer', () => {
  it('parses csv with header variants (case/accent)', () => {
    const csv = Buffer.from('Nombre,Teléfono,Notas\nAna,1123456789,vip\nJuan,+5491198765432,');
    const r = parseCsvBuffer(csv);
    expect(r.errors).toHaveLength(0);
    expect(r.leads).toHaveLength(2);
    expect(r.leads[0]?.name).toBe('Ana');
    expect(r.leads[0]?.notes).toBe('vip');
    expect(r.leads[1]?.notes).toBeNull();
  });

  it('reports rows missing phone column', () => {
    const csv = Buffer.from('name,email\nAna,ana@test.com');
    const r = parseCsvBuffer(csv);
    expect(r.leads).toHaveLength(0);
    expect(r.errors[0]).toMatch(/teléfono/i);
  });

  it('keeps unknown columns in sourceMeta', () => {
    const csv = Buffer.from('name,phone,origen,utm\nAna,1123456789,IG,summer');
    const r = parseCsvBuffer(csv);
    expect(r.leads[0]?.sourceMeta).toEqual({ origen: 'IG', utm: 'summer' });
  });
});

describe('dedupBatch', () => {
  it('keeps first occurrence and counts duplicates', () => {
    const r = dedupBatch([
      { name: 'A', phone: '1', phoneNormalized: '+1', notes: null, sourceMeta: null },
      { name: 'B', phone: '1', phoneNormalized: '+1', notes: null, sourceMeta: null },
      { name: 'C', phone: '2', phoneNormalized: '+2', notes: null, sourceMeta: null },
    ]);
    expect(r.unique).toHaveLength(2);
    expect(r.duplicates).toBe(1);
    expect(r.unique[0]?.name).toBe('A');
  });
});
