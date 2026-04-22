import { describe, expect, it, beforeAll } from 'vitest';

process.env.COOKIE_SECRET = 'test-cookie-secret-for-secrets-test';

const { encryptSecret, decryptSecret, tryDecrypt } = await import('./secrets.js');

describe('secrets crypto', () => {
  it('round-trips a short value', () => {
    const enc = encryptSecret('hello');
    expect(enc).not.toBe('hello');
    expect(decryptSecret(enc)).toBe('hello');
  });

  it('different plaintexts produce different ciphertexts (IV randomness)', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same');
    expect(decryptSecret(b)).toBe('same');
  });

  it('tampered ciphertext fails authentication', () => {
    const enc = encryptSecret('confidential');
    const parts = enc.split('.');
    // flip one base64 char of the ct
    const ct = Buffer.from(parts[2]!, 'base64');
    ct[0] = ct[0] ^ 0xff;
    parts[2] = ct.toString('base64');
    const tampered = parts.join('.');
    expect(() => decryptSecret(tampered)).toThrow();
    expect(tryDecrypt(tampered)).toBeNull();
  });

  it('malformed envelope returns null via tryDecrypt', () => {
    expect(tryDecrypt('not-a-valid-envelope')).toBeNull();
    expect(tryDecrypt(null)).toBeNull();
  });
});
