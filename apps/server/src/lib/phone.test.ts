import { describe, expect, it } from 'vitest';
import { normalizePhone, phoneKey } from './phone.js';

describe('normalizePhone', () => {
  it('formats AR mobile with 9', () => {
    const r = normalizePhone('11 2345 6789');
    // Argentine mobile 11-2345-6789 → +54911234567...
    expect(r.e164).toBeTruthy();
    expect(r.e164!.startsWith('+54')).toBe(true);
  });

  it('keeps E.164 intact when already formatted', () => {
    const r = normalizePhone('+5491123456789');
    expect(r.e164).toBe('+5491123456789');
  });

  it('returns digits-only fallback when unparseable', () => {
    const r = normalizePhone('abc123');
    expect(r.digits).toBe('123');
    expect(r.e164).toBeNull();
  });

  it('phoneKey prefers e164', () => {
    const r = normalizePhone('+5491123456789');
    expect(phoneKey(r)).toBe('+5491123456789');
  });

  it('phoneKey falls back to digits if invalid', () => {
    const r = { e164: null, digits: '1234567890' };
    expect(phoneKey(r)).toBe('1234567890');
  });
});
