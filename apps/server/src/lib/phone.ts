import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

export interface NormalizedPhone {
  /** E.164 format, e.g. +5491123456789. null if phone is invalid. */
  e164: string | null;
  /** Digits-only, always. Used for comparison/dedup when e164 is null. */
  digits: string;
}

export function normalizePhone(raw: string, defaultCountry: CountryCode = 'AR'): NormalizedPhone {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D+/g, '');
  if (digits.length < 6) return { e164: null, digits };
  try {
    const parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
    if (parsed && parsed.isValid()) return { e164: parsed.number, digits };
  } catch {
    // fallthrough
  }
  // fallback: if it started with + assume E.164-ish and use it
  if (trimmed.startsWith('+') && digits.length >= 8) return { e164: `+${digits}`, digits };
  return { e164: null, digits };
}

/** Canonical key used for dedup. Prefers E.164; falls back to digits-only. */
export function phoneKey(normalized: NormalizedPhone): string {
  return normalized.e164 ?? normalized.digits;
}
