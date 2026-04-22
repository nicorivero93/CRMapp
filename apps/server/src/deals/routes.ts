import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { deals, leads, leadEvents, stages, type DealRow } from '@mycrm/db';
import {
  createDealSchema,
  patchDealSchema,
  moveDealSchema,
  dealListQuerySchema,
  convertLeadToDealSchema,
  type DealDTO,
} from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { AppError } from '../lib/errors.js';
import { requireAuth } from '../auth/middleware.js';
import { broadcast } from '../stream/sse.js';
import { convertLeadToContact } from '../contacts/routes.js';
import { emit as emitAutomation } from '../automations/dispatcher.js';

type App = Awaited<ReturnType<typeof buildApp>>;

export function dealToDTO(row: DealRow): DealDTO {
  return {
    id: row.id,
    title: row.title,
    value: row.value,
    currency: row.currency,
    stageId: row.stageId,
    contactId: row.contactId ?? null,
    leadId: row.leadId ?? null,
    ownerId: row.ownerId ?? null,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
  };
}

function requireStageExists(stageId: string): void {
  const row = getDb().select().from(stages).where(eq(stages.id, stageId)).get();
  if (!row) throw new AppError('STAGE_NOT_FOUND', 'Stage no encontrado', 400);
}

export async function registerDealRoutes(app: App): Promise<void> {
  app.get('/api/deals', { preHandler: requireAuth }, async (req) => {
    const q = dealListQuerySchema.parse(req.query);
    const db = getDb();
    const conditions: SQL[] = [];
    if (q.stageId) conditions.push(eq(deals.stageId, q.stageId));
    if (q.ownerId) conditions.push(eq(deals.ownerId, q.ownerId));
    if (q.contactId) conditions.push(eq(deals.contactId, q.contactId));
    if (q.leadId) conditions.push(eq(deals.leadId, q.leadId));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const rows = db
      .select()
      .from(deals)
      .where(whereClause)
      .orderBy(desc(deals.createdAt))
      .limit(q.limit)
      .offset(q.offset)
      .all();

    const countRow = db.select({ n: sql<number>`count(*)` }).from(deals).where(whereClause).get();

    return {
      deals: rows.map(dealToDTO),
      total: countRow?.n ?? 0,
      limit: q.limit,
      offset: q.offset,
    };
  });

  app.get('/api/deals/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const row = db.select().from(deals).where(eq(deals.id, id)).get();
    if (!row) throw new AppError('NOT_FOUND', 'Deal no encontrado', 404);
    const stageRow = db.select().from(stages).where(eq(stages.id, row.stageId)).get();
    return {
      deal: dealToDTO(row),
      stage: stageRow
        ? {
            id: stageRow.id,
            name: stageRow.name,
            order: stageRow.order,
            color: stageRow.color ?? null,
            isClosedWon: stageRow.isClosedWon,
          }
        : null,
    };
  });

  app.post('/api/deals', { preHandler: requireAuth }, async (req, reply) => {
    const body = createDealSchema.parse(req.body);
    requireStageExists(body.stageId);
    const db = getDb();
    const id = newId();
    const now = new Date();
    const stageRow = db.select().from(stages).where(eq(stages.id, body.stageId)).get()!;
    db.insert(deals)
      .values({
        id,
        title: body.title,
        value: body.value,
        currency: body.currency,
        stageId: body.stageId,
        contactId: body.contactId ?? null,
        leadId: body.leadId ?? null,
        ownerId: body.ownerId ?? req.currentUser!.id,
        createdAt: now,
        closedAt: stageRow.isClosedWon ? now : null,
      })
      .run();
    const created = db.select().from(deals).where(eq(deals.id, id)).get()!;
    const dto = dealToDTO(created);
    broadcast('deal.created', dto);
    reply.status(201).send({ deal: dto });
  });

  app.patch('/api/deals/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchDealSchema.parse(req.body);
    const db = getDb();
    const existing = db.select().from(deals).where(eq(deals.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Deal no encontrado', 404);
    if (body.stageId !== undefined && body.stageId !== existing.stageId) {
      requireStageExists(body.stageId);
    }
    const patch: Partial<typeof deals.$inferInsert> = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.value !== undefined) patch.value = body.value;
    if (body.currency !== undefined) patch.currency = body.currency;
    if (body.stageId !== undefined) patch.stageId = body.stageId;
    if (body.contactId !== undefined) patch.contactId = body.contactId;
    if (body.leadId !== undefined) patch.leadId = body.leadId;
    if (body.ownerId !== undefined) patch.ownerId = body.ownerId;
    if (Object.keys(patch).length > 0) {
      db.update(deals).set(patch).where(eq(deals.id, id)).run();
    }
    const updated = db.select().from(deals).where(eq(deals.id, id)).get()!;
    const dto = dealToDTO(updated);
    broadcast('deal.updated', dto);
    return { deal: dto };
  });

  app.post('/api/deals/:id/move', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    const body = moveDealSchema.parse(req.body);
    const db = getDb();
    const existing = db.select().from(deals).where(eq(deals.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Deal no encontrado', 404);
    const targetStage = db.select().from(stages).where(eq(stages.id, body.stageId)).get();
    if (!targetStage) throw new AppError('STAGE_NOT_FOUND', 'Stage no encontrado', 400);
    const fromStageId = existing.stageId;
    const patch: Partial<typeof deals.$inferInsert> = { stageId: body.stageId };
    // set closedAt when moving into a closedWon stage; don't reset when moving out.
    if (targetStage.isClosedWon && !existing.closedAt) {
      patch.closedAt = new Date();
    }
    db.update(deals).set(patch).where(eq(deals.id, id)).run();
    const updated = db.select().from(deals).where(eq(deals.id, id)).get()!;
    const dto = dealToDTO(updated);
    broadcast('deal.moved', { id: dto.id, fromStageId, toStageId: dto.stageId });
    void emitAutomation(
      'deal.stage-changed',
      { fromStageId, toStageId: dto.stageId },
      dto as unknown as Record<string, unknown>,
    );
    return { deal: dto };
  });

  app.delete('/api/deals/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const existing = db.select().from(deals).where(eq(deals.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Deal no encontrado', 404);
    db.delete(deals).where(eq(deals.id, id)).run();
    broadcast('deal.deleted', { id });
    reply.status(204).send();
  });

  app.post('/api/deals/from-lead/:leadId', { preHandler: requireAuth }, async (req, reply) => {
    const { leadId } = req.params as { leadId: string };
    const body = convertLeadToDealSchema.parse(req.body);
    requireStageExists(body.stageId);
    const db = getDb();
    const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
    if (!lead) throw new AppError('NOT_FOUND', 'Lead no encontrado', 404);

    let contactId: string | null = lead.convertedContactId ?? null;
    if (body.createContact && !contactId) {
      const result = convertLeadToContact({
        leadId: lead.id,
        byUserId: req.currentUser!.id,
      });
      contactId = result.contact.id;
    }

    const stageRow = db.select().from(stages).where(eq(stages.id, body.stageId)).get()!;
    const dealId = newId();
    const now = new Date();
    db.insert(deals)
      .values({
        id: dealId,
        title: body.title,
        value: body.value,
        currency: body.currency,
        stageId: body.stageId,
        contactId,
        leadId: lead.id,
        ownerId: lead.assignedTo ?? req.currentUser!.id,
        createdAt: now,
        closedAt: stageRow.isClosedWon ? now : null,
      })
      .run();

    // Update lead: set convertedDealId + status=converted.
    db.update(leads)
      .set({
        convertedDealId: dealId,
        status: 'converted',
        updatedAt: now,
      })
      .where(eq(leads.id, lead.id))
      .run();

    // Only log 'converted' event if we didn't already log one via contact conversion.
    if (!body.createContact || lead.convertedContactId) {
      db.insert(leadEvents)
        .values({
          id: newId(),
          leadId: lead.id,
          at: now,
          type: 'converted',
          byUserId: req.currentUser!.id,
          meta: { dealId },
        })
        .run();
    }

    const created = db.select().from(deals).where(eq(deals.id, dealId)).get()!;
    const dto = dealToDTO(created);
    const updatedLead = db.select().from(leads).where(eq(leads.id, lead.id)).get()!;

    broadcast('deal.created', dto);
    broadcast('lead.updated', {
      id: updatedLead.id,
      status: updatedLead.status,
      convertedContactId: updatedLead.convertedContactId ?? null,
      convertedDealId: updatedLead.convertedDealId ?? null,
      updatedAt: updatedLead.updatedAt.toISOString(),
    });

    reply.status(201).send({
      deal: dto,
      lead: {
        id: updatedLead.id,
        status: updatedLead.status,
        convertedContactId: updatedLead.convertedContactId ?? null,
        convertedDealId: updatedLead.convertedDealId ?? null,
      },
    });
  });
}
