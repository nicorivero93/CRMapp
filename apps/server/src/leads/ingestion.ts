import { parse as parseCsv } from 'csv-parse/sync';
import type { CountryCode } from 'libphonenumber-js';
import type { LeadSource } from '@mycrm/shared';
import { normalizePhone, phoneKey } from '../lib/phone.js';

export interface ParsedLead {
  name: string | null;
  phone: string;
  phoneNormalized: string;
  notes: string | null;
  sourceMeta: Record<string, unknown> | null;
}

export interface ParseResult {
  leads: ParsedLead[];
  errors: string[];
  totalRows: number;
}

const PHONE_REGEX = /(\+?\d[\d\s\-().]{6,}\d)/;

export function parsePasteText(
  text: string,
  defaultCountry: CountryCode = 'AR',
): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const leads: ParsedLead[] = [];
  const errors: string[] = [];
  for (const line of lines) {
    const phoneMatch = line.match(PHONE_REGEX);
    if (!phoneMatch) {
      errors.push(`Sin teléfono: ${truncate(line)}`);
      continue;
    }
    const phone = phoneMatch[1]!;
    const name = line.replace(phone, '').replace(/[\t|;,\-—·•]+/g, ' ').trim() || null;
    const norm = normalizePhone(phone, defaultCountry);
    if (!norm.e164 && norm.digits.length < 7) {
      errors.push(`Teléfono inválido: ${truncate(line)}`);
      continue;
    }
    leads.push({
      name,
      phone: phone.trim(),
      phoneNormalized: phoneKey(norm),
      notes: null,
      sourceMeta: null,
    });
  }
  return { leads, errors, totalRows: lines.length };
}

export interface CsvParseOptions {
  defaultCountry?: CountryCode;
}

export function parseCsvBuffer(buffer: Buffer, opts: CsvParseOptions = {}): ParseResult {
  const defaultCountry = opts.defaultCountry ?? 'AR';
  let rows: Array<Record<string, string>>;
  try {
    rows = parseCsv(buffer, {
      columns: (header: string[]) => header.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    }) as Array<Record<string, string>>;
  } catch (err) {
    return {
      leads: [],
      errors: [`CSV inválido: ${(err as Error).message}`],
      totalRows: 0,
    };
  }

  const leads: ParsedLead[] = [];
  const errors: string[] = [];

  for (const [i, row] of rows.entries()) {
    const phoneRaw = pickField(row, ['phone', 'telefono', 'teléfono', 'celular', 'whatsapp', 'wa']);
    if (!phoneRaw) {
      errors.push(`Fila ${i + 2}: sin columna teléfono`);
      continue;
    }
    const name = pickField(row, ['name', 'nombre', 'contacto']) ?? null;
    const notes = pickField(row, ['notes', 'notas', 'comentario', 'comentarios']) ?? null;
    const norm = normalizePhone(phoneRaw, defaultCountry);
    if (!norm.e164 && norm.digits.length < 7) {
      errors.push(`Fila ${i + 2}: teléfono inválido "${phoneRaw}"`);
      continue;
    }
    const meta: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      if (v && !['phone', 'telefono', 'teléfono', 'celular', 'whatsapp', 'wa',
        'name', 'nombre', 'contacto', 'notes', 'notas', 'comentario', 'comentarios'].includes(k)) {
        meta[k] = v;
      }
    }
    leads.push({
      name,
      phone: phoneRaw.trim(),
      phoneNormalized: phoneKey(norm),
      notes,
      sourceMeta: Object.keys(meta).length ? meta : null,
    });
  }

  return { leads, errors, totalRows: rows.length };
}

function pickField(row: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v && v.trim().length > 0) return v.trim();
  }
  return null;
}

function truncate(s: string, max = 80): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** Strip provided parsed leads against phoneNormalized uniqueness. */
export function dedupBatch(leads: ParsedLead[]): { unique: ParsedLead[]; duplicates: number } {
  const seen = new Set<string>();
  const unique: ParsedLead[] = [];
  let duplicates = 0;
  for (const l of leads) {
    if (seen.has(l.phoneNormalized)) {
      duplicates++;
      continue;
    }
    seen.add(l.phoneNormalized);
    unique.push(l);
  }
  return { unique, duplicates };
}

/** Per-source identifier for lead sources (used to tag lead source when known) */
export const sourcesKnownToSystem = new Set<LeadSource>();
