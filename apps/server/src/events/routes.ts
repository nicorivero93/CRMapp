import { and, asc, eq, gt, lt, type SQL } from 'drizzle-orm';
import { events, type EventRow } from '@mycrm/db';
import {
  createEventSchema,
  patchEventSchema,
  eventRangeQuerySchema,
  type EventDTO,
} from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { AppError } from '../lib/errors.js';
import { requireAuth } from '../auth/middleware.js';
import { broadcast } from '../stream/sse.js';

type App = Awaited<ReturnType<typeof buildApp>>;

export function eventToDTO(row: EventRow): EventDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    start: row.start.toISOString(),
    end: row.end.toISOString(),
    status: row.status,
    ownerId: row.ownerId ?? null,
    leadId: row.leadId ?? null,
    contactId: row.contactId ?? null,
    dealId: row.dealId ?? null,
    attendees: Array.isArray(row.attendees) ? row.attendees : [],
    color: row.color ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function getEventOr404(id: string): EventRow {
  const row = getDb().select().from(events).where(eq(events.id, id)).get();
  if (!row) throw new AppError('NOT_FOUND', 'Evento no encontrado', 404);
  return row;
}

/**
 * Helper exportado para otros features (Contactos / Pipeline / LeadDetail).
 * Devuelve eventos NO cancelados asociados a la entidad indicada.
 */
export function getEventsForEntity(filter: {
  leadId?: string;
  contactId?: string;
  dealId?: string;
}): EventDTO[] {
  const conditions: SQL[] = [eq(events.status, 'confirmed')];
  if (filter.leadId) conditions.push(eq(events.leadId, filter.leadId));
  if (filter.contactId) conditions.push(eq(events.contactId, filter.contactId));
  if (filter.dealId) conditions.push(eq(events.dealId, filter.dealId));
  if (conditions.length === 1) return []; // no entity filter → nada
  const rows = getDb()
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(asc(events.start))
    .all();
  return rows.map(eventToDTO);
}

export async function registerEventRoutes(app: App): Promise<void> {
  // GET /api/events?from&to&ownerId?&includeCanceled?
  app.get('/api/events', { preHandler: requireAuth }, async (req) => {
    const q = eventRangeQuerySchema.parse(req.query);
    const from = new Date(q.from);
    const to = new Date(q.to);
    const conditions: SQL[] = [lt(events.start, to), gt(events.end, from)];
    if (!q.includeCanceled) conditions.push(eq(events.status, 'confirmed'));
    if (q.ownerId) conditions.push(eq(events.ownerId, q.ownerId));

    const rows = getDb()
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(asc(events.start))
      .all();
    return { events: rows.map(eventToDTO) };
  });

  // GET /api/events/:id
  app.get('/api/events/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const row = getEventOr404(id);
    return { event: eventToDTO(row) };
  });

  // POST /api/events
  app.post('/api/events', { preHandler: requireAuth }, async (req, reply) => {
    const body = createEventSchema.parse(req.body);
    const id = newId();
    const now = new Date();
    const db = getDb();
    db.insert(events)
      .values({
        id,
        title: body.title,
        description: body.description ?? null,
        start: new Date(body.start),
        end: new Date(body.end),
        status: 'confirmed',
        ownerId: req.currentUser!.id,
        leadId: body.leadId ?? null,
        contactId: body.contactId ?? null,
        dealId: body.dealId ?? null,
        attendees: body.attendees ?? [],
        color: body.color ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const created = db.select().from(events).where(eq(events.id, id)).get()!;
    const dto = eventToDTO(created);
    broadcast('event.created', dto);
    reply.status(201).send({ event: dto });
  });

  // PATCH /api/events/:id
  app.patch('/api/events/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const current = getEventOr404(id);
    const body = patchEventSchema.parse(req.body);

    // Validate start < end across (possibly partial) update.
    const nextStart = body.start ? new Date(body.start) : current.start;
    const nextEnd = body.end ? new Date(body.end) : current.end;
    if (nextStart.getTime() >= nextEnd.getTime()) {
      throw new AppError('INVALID_RANGE', 'start debe ser anterior a end', 400);
    }

    const db = getDb();
    const patch: Partial<typeof events.$inferInsert> = { updatedAt: new Date() };
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description ?? null;
    if (body.start !== undefined) patch.start = new Date(body.start);
    if (body.end !== undefined) patch.end = new Date(body.end);
    if (body.status !== undefined) patch.status = body.status;
    if (body.leadId !== undefined) patch.leadId = body.leadId ?? null;
    if (body.contactId !== undefined) patch.contactId = body.contactId ?? null;
    if (body.dealId !== undefined) patch.dealId = body.dealId ?? null;
    if (body.attendees !== undefined) patch.attendees = body.attendees;
    if (body.color !== undefined) patch.color = body.color ?? null;

    db.update(events).set(patch).where(eq(events.id, id)).run();
    const updated = db.select().from(events).where(eq(events.id, id)).get()!;
    const dto = eventToDTO(updated);
    if (body.status === 'canceled' && current.status !== 'canceled') {
      broadcast('event.canceled', dto);
    } else {
      broadcast('event.updated', dto);
    }
    return { event: dto };
  });

  // DELETE /api/events/:id  (soft delete)
  app.delete('/api/events/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    getEventOr404(id);
    const db = getDb();
    db.update(events)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(eq(events.id, id))
      .run();
    const updated = db.select().from(events).where(eq(events.id, id)).get()!;
    const dto = eventToDTO(updated);
    broadcast('event.canceled', dto);
    const { emit: emitAutomation } = await import('../automations/dispatcher.js');
    void emitAutomation('event.canceled', {}, dto as unknown as Record<string, unknown>);
    reply.status(204).send();
  });
}
