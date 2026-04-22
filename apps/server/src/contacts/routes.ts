import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  contacts,
  deals,
  events,
  importBatches,
  leads,
  leadEvents,
  type ContactRow,
  type DealRow,
  type EventRow,
} from '@mycrm/db';
import {
  createContactSchema,
  patchContactSchema,
  contactListQuerySchema,
  type ContactDTO,
} from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { AppError } from '../lib/errors.js';
import { normalizePhone, phoneKey } from '../lib/phone.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { broadcast } from '../stream/sse.js';

type App = Awaited<ReturnType<typeof buildApp>>;

export function contactToDTO(row: ContactRow): ContactDTO {
  return {
    id: row.id,
    leadId: row.leadId ?? null,
    name: row.name,
    phone: row.phone,
    email: row.email ?? null,
    company: row.company ?? null,
    industry: row.industry ?? null,
    tags: (row.tags as string[] | null) ?? [],
    ownerId: row.ownerId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface DealLite {
  id: string;
  title: string;
  value: number;
  currency: string;
  stageId: string;
  ownerId: string | null;
  createdAt: string;
  closedAt: string | null;
}

function dealToLite(d: DealRow): DealLite {
  return {
    id: d.id,
    title: d.title,
    value: d.value,
    currency: d.currency,
    stageId: d.stageId,
    ownerId: d.ownerId ?? null,
    createdAt: d.createdAt.toISOString(),
    closedAt: d.closedAt?.toISOString() ?? null,
  };
}

interface EventLite {
  id: string;
  title: string;
  start: string;
  end: string;
  status: 'confirmed' | 'canceled';
  ownerId: string | null;
}

function eventToLite(e: EventRow): EventLite {
  return {
    id: e.id,
    title: e.title,
    start: e.start.toISOString(),
    end: e.end.toISOString(),
    status: e.status,
    ownerId: e.ownerId ?? null,
  };
}

function normalizedPhoneOrThrow(phone: string): string {
  const norm = normalizePhone(phone);
  if (!norm.e164 && norm.digits.length < 7) {
    throw new AppError('INVALID_PHONE', 'Teléfono inválido', 400);
  }
  return phoneKey(norm);
}

function existingContactPhoneKeys(keys: string[]): Set<string> {
  if (keys.length === 0) return new Set();
  const db = getDb();
  // contacts table has no phoneNormalized column — we match by phone exact key
  const found = db.select({ k: contacts.phone }).from(contacts).where(inArray(contacts.phone, keys)).all();
  return new Set(found.map((r) => r.k));
}

export async function registerContactRoutes(app: App): Promise<void> {
  app.get('/api/contacts', { preHandler: requireAuth }, async (req) => {
    const q = contactListQuerySchema.parse(req.query);
    const db = getDb();
    const conditions = [];
    if (q.q) {
      const like$ = `%${q.q}%`;
      conditions.push(
        or(
          like(contacts.name, like$),
          like(contacts.phone, like$),
          like(contacts.email, like$),
        )!,
      );
    }
    if (q.industry) conditions.push(eq(contacts.industry, q.industry));
    // tag: stored as JSON array — use LIKE on serialized JSON (sqlite json as text)
    if (q.tag) {
      conditions.push(sql`${contacts.tags} LIKE ${`%"${q.tag}"%`}`);
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const rows = db
      .select()
      .from(contacts)
      .where(whereClause)
      .orderBy(desc(contacts.createdAt))
      .limit(q.limit)
      .offset(q.offset)
      .all();

    const countRow = db.select({ n: sql<number>`count(*)` }).from(contacts).where(whereClause).get();

    return {
      contacts: rows.map(contactToDTO),
      total: countRow?.n ?? 0,
      limit: q.limit,
      offset: q.offset,
    };
  });

  app.get('/api/contacts/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const row = db.select().from(contacts).where(eq(contacts.id, id)).get();
    if (!row) throw new AppError('NOT_FOUND', 'Contacto no encontrado', 404);

    const dealRows = db.select().from(deals).where(eq(deals.contactId, id)).orderBy(desc(deals.createdAt)).all();
    const eventRows = db
      .select()
      .from(events)
      .where(eq(events.contactId, id))
      .orderBy(desc(events.start))
      .limit(20)
      .all();

    return {
      contact: contactToDTO(row),
      deals: dealRows.map(dealToLite),
      events: eventRows.map(eventToLite),
    };
  });

  app.post('/api/contacts', { preHandler: requireAuth }, async (req, reply) => {
    const body = createContactSchema.parse(req.body);
    const db = getDb();
    const phoneKeyVal = normalizedPhoneOrThrow(body.phone);

    if (body.leadId) {
      const l = db.select().from(leads).where(eq(leads.id, body.leadId)).get();
      if (!l) throw new AppError('NOT_FOUND', 'Lead no encontrado', 404);
    }

    const id = newId();
    const now = new Date();
    db.insert(contacts)
      .values({
        id,
        leadId: body.leadId ?? null,
        name: body.name,
        phone: phoneKeyVal,
        email: body.email ?? null,
        company: body.company ?? null,
        industry: body.industry ?? null,
        tags: body.tags ?? [],
        ownerId: req.currentUser!.id,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const created = db.select().from(contacts).where(eq(contacts.id, id)).get()!;
    const dto = contactToDTO(created);
    const { emit: emitAutomation } = await import('../automations/dispatcher.js');
    void emitAutomation('contact.created', {}, dto as unknown as Record<string, unknown>);
    reply.status(201).send({ contact: dto });
  });

  app.patch('/api/contacts/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchContactSchema.parse(req.body);
    const db = getDb();
    const existing = db.select().from(contacts).where(eq(contacts.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Contacto no encontrado', 404);

    const now = new Date();
    const patch: Partial<typeof contacts.$inferInsert> = { updatedAt: now };
    if (body.name !== undefined) patch.name = body.name;
    if (body.phone !== undefined) patch.phone = normalizedPhoneOrThrow(body.phone);
    if (body.email !== undefined) patch.email = body.email;
    if (body.company !== undefined) patch.company = body.company;
    if (body.industry !== undefined) patch.industry = body.industry;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.ownerId !== undefined) patch.ownerId = body.ownerId;

    db.update(contacts).set(patch).where(eq(contacts.id, id)).run();
    const updated = db.select().from(contacts).where(eq(contacts.id, id)).get()!;
    return { contact: contactToDTO(updated) };
  });

  app.delete('/api/contacts/:id', { preHandler: requireRole('owner') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const existing = db.select().from(contacts).where(eq(contacts.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Contacto no encontrado', 404);
    db.delete(contacts).where(eq(contacts.id, id)).run();
    reply.status(204).send();
  });

  app.post('/api/contacts/import', { preHandler: requireAuth }, async (req, reply) => {
    const parts = req.parts();
    let fileBuffer: Buffer | null = null;
    let fileName: string | null = null;
    for await (const part of parts) {
      if (part.type === 'file') {
        fileName = part.filename;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk as Buffer);
        fileBuffer = Buffer.concat(chunks);
      }
    }
    if (!fileBuffer) throw new AppError('NO_FILE', 'Subí un archivo CSV', 400);

    let records: Array<Record<string, string>>;
    try {
      records = parseCsv(fileBuffer, {
        columns: (hdr: string[]) => hdr.map((h) => h.trim().toLowerCase()),
        skip_empty_lines: true,
        trim: true,
        bom: true,
      }) as Array<Record<string, string>>;
    } catch (err: any) {
      throw new AppError('BAD_CSV', `CSV inválido: ${err.message ?? 'error'}`, 400);
    }

    const totalRows = records.length;
    const errors: string[] = [];
    type Parsed = {
      name: string;
      phone: string;
      phoneKey: string;
      email: string | null;
      company: string | null;
      industry: string | null;
      tags: string[];
    };
    const parsed: Parsed[] = [];

    function get(r: Record<string, string>, ...keys: string[]): string {
      for (const k of keys) {
        const v = r[k];
        if (v !== undefined && v !== null && String(v).trim().length > 0) return String(v).trim();
      }
      return '';
    }

    for (let i = 0; i < records.length; i++) {
      const r = records[i]!;
      const name = get(r, 'nombre', 'name');
      const phoneRaw = get(r, 'telefono', 'teléfono', 'phone');
      if (!name) {
        errors.push(`Fila ${i + 2}: falta nombre`);
        continue;
      }
      if (!phoneRaw) {
        errors.push(`Fila ${i + 2}: falta telefono`);
        continue;
      }
      const norm = normalizePhone(phoneRaw);
      if (!norm.e164 && norm.digits.length < 7) {
        errors.push(`Fila ${i + 2}: teléfono inválido (${phoneRaw})`);
        continue;
      }
      const tagsStr = get(r, 'tags', 'etiquetas');
      const tags = tagsStr
        ? tagsStr
            .split(',')
            .map((t) => t.trim())
            .filter((t) => t.length > 0)
        : [];
      parsed.push({
        name,
        phone: phoneRaw,
        phoneKey: phoneKey(norm),
        email: get(r, 'email', 'correo') || null,
        company: get(r, 'empresa', 'company') || null,
        industry: get(r, 'industria', 'industry') || null,
        tags,
      });
    }

    // dedup in-batch by phoneKey
    const seen = new Set<string>();
    const uniq: Parsed[] = [];
    let dedupedInBatch = 0;
    for (const p of parsed) {
      if (seen.has(p.phoneKey)) {
        dedupedInBatch++;
        continue;
      }
      seen.add(p.phoneKey);
      uniq.push(p);
    }

    const existingKeys = existingContactPhoneKeys(uniq.map((p) => p.phoneKey));
    const toInsert = uniq.filter((p) => !existingKeys.has(p.phoneKey));
    const dedupedAgainstDb = uniq.length - toInsert.length;

    const now = new Date();
    const db = getDb();
    let imported = 0;
    for (const p of toInsert) {
      try {
        db.insert(contacts)
          .values({
            id: newId(),
            leadId: null,
            name: p.name,
            phone: p.phoneKey,
            email: p.email,
            company: p.company,
            industry: p.industry,
            tags: p.tags,
            ownerId: req.currentUser!.id,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        imported++;
      } catch (err: any) {
        errors.push(`Insert error: ${p.name} (${p.phone}): ${err.message ?? 'error'}`);
      }
    }

    const errorsSample = errors.slice(0, 20);
    let batchId: string | null = null;
    try {
      batchId = newId();
      db.insert(importBatches)
        .values({
          id: batchId,
          source: 'csv-import',
          fileName,
          totalRows,
          imported,
          deduped: dedupedInBatch + dedupedAgainstDb,
          errors: errors.length,
          errorsSample,
          createdBy: req.currentUser!.id,
          createdAt: now,
        })
        .run();
    } catch {
      batchId = null;
    }

    reply.status(201).send({
      batchId,
      totalRows,
      imported,
      deduped: dedupedInBatch + dedupedAgainstDb,
      errors: errors.length,
      errorsSample,
    });
  });
}

/**
 * Helper used by leads routes: convert a lead row into a new contact.
 * Throws AppError 409 if lead already converted.
 */
export function convertLeadToContact(params: {
  leadId: string;
  overrides?: {
    name?: string;
    email?: string | null;
    company?: string | null;
    industry?: string | null;
  };
  byUserId: string;
}): { contact: ContactRow; leadId: string } {
  const db = getDb();
  const lead = db.select().from(leads).where(eq(leads.id, params.leadId)).get();
  if (!lead) throw new AppError('NOT_FOUND', 'Lead no encontrado', 404);
  if (lead.convertedContactId) {
    throw new AppError('ALREADY_CONVERTED', 'Este lead ya fue convertido', 409);
  }

  const now = new Date();
  const contactId = newId();
  const name = params.overrides?.name?.trim() || lead.name || 'Contacto sin nombre';

  db.insert(contacts)
    .values({
      id: contactId,
      leadId: lead.id,
      name,
      phone: lead.phoneNormalized,
      email: params.overrides?.email ?? null,
      company: params.overrides?.company ?? null,
      industry: params.overrides?.industry ?? null,
      tags: (lead.tags as string[] | null) ?? [],
      ownerId: lead.assignedTo ?? params.byUserId,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.update(leads)
    .set({
      convertedContactId: contactId,
      status: 'converted',
      updatedAt: now,
    })
    .where(eq(leads.id, lead.id))
    .run();

  db.insert(leadEvents)
    .values({
      id: newId(),
      leadId: lead.id,
      at: now,
      type: 'converted',
      byUserId: params.byUserId,
      meta: { contactId },
    })
    .run();

  const contact = db.select().from(contacts).where(eq(contacts.id, contactId)).get()!;
  return { contact, leadId: lead.id };
}
