import { and, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import type { CountryCode } from 'libphonenumber-js';
import { leads, leadEvents, importBatches, type LeadRow, type LeadEventRow } from '@mycrm/db';
import {
  addLeadEventSchema,
  assignLeadsSchema,
  createLeadSchema,
  leadListQuerySchema,
  patchLeadSchema,
  pasteLeadsSchema,
  importLeadsMetaSchema,
  type LeadDTO,
  type LeadEventDTO,
  type LeadSource,
} from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { AppError } from '../lib/errors.js';
import { normalizePhone, phoneKey } from '../lib/phone.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { broadcast } from '../stream/sse.js';
import { dedupBatch, parseCsvBuffer, parsePasteText, type ParsedLead } from './ingestion.js';
import { runAssignment } from './assignmentService.js';

type App = Awaited<ReturnType<typeof buildApp>>;

function toDTO(row: LeadRow): LeadDTO {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    phoneNormalized: row.phoneNormalized,
    source: row.source,
    sourceMeta: row.sourceMeta as Record<string, unknown> | null,
    importBatchId: row.importBatchId,
    status: row.status,
    assignedTo: row.assignedTo,
    assignedAt: row.assignedAt?.toISOString() ?? null,
    firstContactAt: row.firstContactAt?.toISOString() ?? null,
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    responseCount: row.responseCount,
    noResponseCount: row.noResponseCount,
    recycledCount: row.recycledCount,
    lastRecycledAt: row.lastRecycledAt?.toISOString() ?? null,
    tags: (row.tags as string[] | null) ?? [],
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
  };
}

function eventToDTO(row: LeadEventRow): LeadEventDTO {
  return {
    id: row.id,
    leadId: row.leadId,
    at: row.at.toISOString(),
    type: row.type,
    byUserId: row.byUserId,
    meta: row.meta as Record<string, unknown> | null,
  };
}

interface InsertLeadParams {
  parsed: ParsedLead;
  source: LeadSource;
  importBatchId: string | null;
  createdBy: string;
  now: Date;
}

function insertParsedLead(p: InsertLeadParams): LeadRow | null {
  const db = getDb();
  const id = newId();
  try {
    db.insert(leads)
      .values({
        id,
        name: p.parsed.name,
        phone: p.parsed.phone,
        phoneNormalized: p.parsed.phoneNormalized,
        source: p.source,
        sourceMeta: p.parsed.sourceMeta,
        importBatchId: p.importBatchId,
        status: 'new',
        responseCount: 0,
        noResponseCount: 0,
        recycledCount: 0,
        tags: [],
        notes: p.parsed.notes,
        createdAt: p.now,
        updatedAt: p.now,
        createdBy: p.createdBy,
      })
      .run();
  } catch (err) {
    // Any insert error (FK, constraint, etc.) → skip this lead
    return null;
  }

  db.insert(leadEvents)
    .values({
      id: newId(),
      leadId: id,
      at: p.now,
      type: 'imported',
      byUserId: p.createdBy,
      meta: { source: p.source, batchId: p.importBatchId },
    })
    .run();

  const row = db.select().from(leads).where(eq(leads.id, id)).get();
  return row ?? null;
}

function existingPhoneKeys(keys: string[]): Set<string> {
  if (keys.length === 0) return new Set();
  const db = getDb();
  const found = db
    .select({ k: leads.phoneNormalized })
    .from(leads)
    .where(inArray(leads.phoneNormalized, keys))
    .all();
  return new Set(found.map((r) => r.k));
}

export async function registerLeadRoutes(app: App): Promise<void> {
  app.get('/api/leads', { preHandler: requireAuth }, async (req) => {
    const q = leadListQuerySchema.parse(req.query);
    const db = getDb();
    const conditions = [];
    if (q.status) conditions.push(eq(leads.status, q.status));
    if (q.source) conditions.push(eq(leads.source, q.source));
    if (q.assignedTo) {
      const val = q.assignedTo === 'me' ? req.currentUser!.id : q.assignedTo;
      conditions.push(eq(leads.assignedTo, val));
    }
    if (q.q) {
      const like$ = `%${q.q}%`;
      conditions.push(
        or(like(leads.name, like$), like(leads.phone, like$), like(leads.phoneNormalized, like$))!,
      );
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const rows = db
      .select()
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.createdAt))
      .limit(q.limit)
      .offset(q.offset)
      .all();

    const countRow = db
      .select({ n: sql<number>`count(*)` })
      .from(leads)
      .where(whereClause)
      .get();

    return {
      leads: rows.map(toDTO),
      total: countRow?.n ?? 0,
      limit: q.limit,
      offset: q.offset,
    };
  });

  app.get('/api/leads/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const row = db.select().from(leads).where(eq(leads.id, id)).get();
    if (!row) throw new AppError('NOT_FOUND', 'Lead not found', 404);
    const events = db
      .select()
      .from(leadEvents)
      .where(eq(leadEvents.leadId, id))
      .orderBy(desc(leadEvents.at))
      .all();
    return { lead: toDTO(row), events: events.map(eventToDTO) };
  });

  app.post('/api/leads', { preHandler: requireAuth }, async (req, reply) => {
    const body = createLeadSchema.parse(req.body);
    const norm = normalizePhone(body.phone);
    if (!norm.e164 && norm.digits.length < 7) {
      throw new AppError('INVALID_PHONE', 'Teléfono inválido', 400);
    }
    const key = phoneKey(norm);
    if (existingPhoneKeys([key]).has(key)) {
      throw new AppError('DUPLICATE_PHONE', 'Ya existe un lead con este teléfono', 409);
    }
    const row = insertParsedLead({
      parsed: {
        name: body.name ?? null,
        phone: body.phone,
        phoneNormalized: key,
        notes: body.notes ?? null,
        sourceMeta: body.sourceMeta ?? null,
      },
      source: body.source,
      importBatchId: null,
      createdBy: req.currentUser!.id,
      now: new Date(),
    });
    if (!row) throw new AppError('INTERNAL', 'No se pudo crear el lead', 500);
    broadcast('lead.created', toDTO(row));
    runAssignment({ leadIds: [row.id], byUserId: req.currentUser!.id });
    const refreshed = getDb().select().from(leads).where(eq(leads.id, row.id)).get()!;
    reply.status(201).send({ lead: toDTO(refreshed) });
  });

  app.patch('/api/leads/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchLeadSchema.parse(req.body);
    const db = getDb();
    const existing = db.select().from(leads).where(eq(leads.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Lead not found', 404);

    const now = new Date();
    const patch: Partial<typeof leads.$inferInsert> = { updatedAt: now };
    if (body.name !== undefined) patch.name = body.name;
    if (body.tags !== undefined) patch.tags = body.tags;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.status !== undefined) patch.status = body.status;
    if (body.assignedTo !== undefined) {
      patch.assignedTo = body.assignedTo;
      patch.assignedAt = body.assignedTo ? now : null;
    }
    db.update(leads).set(patch).where(eq(leads.id, id)).run();

    if (body.status !== undefined && body.status !== existing.status) {
      db.insert(leadEvents)
        .values({
          id: newId(),
          leadId: id,
          at: now,
          type: 'status-changed',
          byUserId: req.currentUser!.id,
          meta: { from: existing.status, to: body.status },
        })
        .run();
    }

    const updated = db.select().from(leads).where(eq(leads.id, id)).get()!;
    const dto = toDTO(updated);
    broadcast('lead.updated', dto);
    return { lead: dto };
  });

  app.post('/api/leads/:id/events', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = addLeadEventSchema.parse(req.body);
    const db = getDb();
    const lead = db.select().from(leads).where(eq(leads.id, id)).get();
    if (!lead) throw new AppError('NOT_FOUND', 'Lead not found', 404);
    const now = new Date();
    const eventId = newId();
    db.insert(leadEvents)
      .values({
        id: eventId,
        leadId: id,
        at: now,
        type: body.type,
        byUserId: req.currentUser!.id,
        meta: body.meta ?? null,
      })
      .run();

    if (body.type === 'note-added') {
      db.update(leads).set({ updatedAt: now }).where(eq(leads.id, id)).run();
    }

    const evtRow = db.select().from(leadEvents).where(eq(leadEvents.id, eventId)).get()!;
    const dto = eventToDTO(evtRow);
    broadcast('lead.event-added', dto);
    reply.status(201).send({ event: dto });
  });

  app.post('/api/leads/paste', { preHandler: requireAuth }, async (req, reply) => {
    const body = pasteLeadsSchema.parse(req.body);
    const parsed = parsePasteText(body.text, body.defaultCountry as CountryCode);
    const { unique, duplicates: inBatchDupes } = dedupBatch(parsed.leads);
    const existing = existingPhoneKeys(unique.map((l) => l.phoneNormalized));
    const toInsert = unique.filter((l) => !existing.has(l.phoneNormalized));
    const dedupedAgainstDb = unique.length - toInsert.length;
    const now = new Date();
    const batchId = newId();

    const createdIds: string[] = [];
    for (const l of toInsert) {
      const row = insertParsedLead({
        parsed: l,
        source: body.source,
        importBatchId: batchId,
        createdBy: req.currentUser!.id,
        now,
      });
      if (row) createdIds.push(row.id);
    }

    const errorsSample = parsed.errors.slice(0, 20);
    getDb()
      .insert(importBatches)
      .values({
        id: batchId,
        source: body.source,
        fileName: null,
        totalRows: parsed.totalRows,
        imported: createdIds.length,
        deduped: inBatchDupes + dedupedAgainstDb,
        errors: parsed.errors.length,
        errorsSample,
        createdBy: req.currentUser!.id,
        createdAt: now,
      })
      .run();

    broadcast('lead.imported', { batchId, imported: createdIds.length });
    const assignReport = runAssignment({ leadIds: createdIds, byUserId: req.currentUser!.id });

    reply.status(201).send({
      batchId,
      totalRows: parsed.totalRows,
      imported: createdIds.length,
      deduped: inBatchDupes + dedupedAgainstDb,
      errors: parsed.errors.length,
      errorsSample,
      assigned: assignReport.assigned.length,
      unassigned: assignReport.unassigned.length,
    });
  });

  app.post('/api/leads/import', { preHandler: requireAuth }, async (req, reply) => {
    const parts = req.parts();
    let fileBuffer: Buffer | null = null;
    let fileName: string | null = null;
    const fields: Record<string, string> = {};
    for await (const part of parts) {
      if (part.type === 'file') {
        fileName = part.filename;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk as Buffer);
        fileBuffer = Buffer.concat(chunks);
      } else if (part.type === 'field') {
        fields[part.fieldname] = String(part.value);
      }
    }
    if (!fileBuffer) throw new AppError('NO_FILE', 'Subí un archivo CSV', 400);
    const meta = importLeadsMetaSchema.parse(fields);
    const parsed = parseCsvBuffer(fileBuffer, { defaultCountry: meta.defaultCountry as CountryCode });
    const { unique, duplicates: inBatchDupes } = dedupBatch(parsed.leads);
    const existing = existingPhoneKeys(unique.map((l) => l.phoneNormalized));
    const toInsert = unique.filter((l) => !existing.has(l.phoneNormalized));
    const dedupedAgainstDb = unique.length - toInsert.length;
    const now = new Date();
    const batchId = newId();

    const createdIds: string[] = [];
    for (const l of toInsert) {
      const row = insertParsedLead({
        parsed: l,
        source: meta.source,
        importBatchId: batchId,
        createdBy: req.currentUser!.id,
        now,
      });
      if (row) createdIds.push(row.id);
    }

    const errorsSample = parsed.errors.slice(0, 20);
    getDb()
      .insert(importBatches)
      .values({
        id: batchId,
        source: meta.source,
        fileName,
        totalRows: parsed.totalRows,
        imported: createdIds.length,
        deduped: inBatchDupes + dedupedAgainstDb,
        errors: parsed.errors.length,
        errorsSample,
        createdBy: req.currentUser!.id,
        createdAt: now,
      })
      .run();

    broadcast('lead.imported', { batchId, imported: createdIds.length });
    const assignReport = runAssignment({ leadIds: createdIds, byUserId: req.currentUser!.id });

    reply.status(201).send({
      batchId,
      totalRows: parsed.totalRows,
      imported: createdIds.length,
      deduped: inBatchDupes + dedupedAgainstDb,
      errors: parsed.errors.length,
      errorsSample,
      assigned: assignReport.assigned.length,
      unassigned: assignReport.unassigned.length,
    });
  });

  app.post('/api/leads/assign', { preHandler: requireRole('owner') }, async (req) => {
    const body = assignLeadsSchema.parse(req.body);
    const db = getDb();
    let leadIds: string[];
    if (body.leadIds && body.leadIds.length > 0) {
      leadIds = body.leadIds;
    } else if (body.allUnassigned) {
      const rows = db
        .select({ id: leads.id })
        .from(leads)
        .where(and(eq(leads.status, 'new'), sql`${leads.assignedTo} IS NULL`))
        .all();
      leadIds = rows.map((r) => r.id);
    } else {
      throw new AppError('BAD_REQUEST', 'Especificá leadIds o allUnassigned=true', 400);
    }
    if (leadIds.length === 0) {
      return { assigned: [], unassigned: [], perUser: {}, total: 0 };
    }
    const report = runAssignment({
      leadIds,
      byUserId: req.currentUser!.id,
      excludeUserId: body.excludeUserId,
      forceMode: 'capacity-weighted',
    });
    return { ...report, total: leadIds.length };
  });
}
