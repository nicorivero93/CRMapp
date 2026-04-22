import { asc, eq } from 'drizzle-orm';
import { recyclingRules, type RecyclingRuleRow } from '@mycrm/db';
import {
  createRecyclingRuleSchema,
  patchRecyclingRuleSchema,
  type RecyclingRuleDTO,
} from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { AppError } from '../lib/errors.js';
import { requireRole } from '../auth/middleware.js';
import { runRecyclingCycle } from '../leads/recyclingService.js';

type App = Awaited<ReturnType<typeof buildApp>>;

function toDTO(row: RecyclingRuleRow): RecyclingRuleDTO {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    statusIn: (row.statusIn as string[]) ?? [],
    daysSinceLastContact: row.daysSinceLastContact,
    action: row.action,
    maxRecyclesPerLead: row.maxRecyclesPerLead,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function registerRecyclingRoutes(app: App): Promise<void> {
  app.get('/api/recycling-rules', { preHandler: requireRole('owner') }, async () => {
    const rows = getDb().select().from(recyclingRules).orderBy(asc(recyclingRules.createdAt)).all();
    return { rules: rows.map(toDTO) };
  });

  app.post('/api/recycling-rules', { preHandler: requireRole('owner') }, async (req, reply) => {
    const body = createRecyclingRuleSchema.parse(req.body);
    const id = newId();
    const db = getDb();
    const now = new Date();
    db.insert(recyclingRules)
      .values({
        id,
        name: body.name,
        enabled: body.enabled,
        statusIn: body.statusIn,
        daysSinceLastContact: body.daysSinceLastContact,
        action: body.action,
        maxRecyclesPerLead: body.maxRecyclesPerLead,
        createdAt: now,
      })
      .run();
    const row = db.select().from(recyclingRules).where(eq(recyclingRules.id, id)).get()!;
    reply.status(201).send({ rule: toDTO(row) });
  });

  app.patch('/api/recycling-rules/:id', { preHandler: requireRole('owner') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchRecyclingRuleSchema.parse(req.body);
    const db = getDb();
    const existing = db.select().from(recyclingRules).where(eq(recyclingRules.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Regla no encontrada', 404);
    const patch: Partial<typeof recyclingRules.$inferInsert> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.statusIn !== undefined) patch.statusIn = body.statusIn;
    if (body.daysSinceLastContact !== undefined) patch.daysSinceLastContact = body.daysSinceLastContact;
    if (body.action !== undefined) patch.action = body.action;
    if (body.maxRecyclesPerLead !== undefined) patch.maxRecyclesPerLead = body.maxRecyclesPerLead;
    if (Object.keys(patch).length > 0) {
      db.update(recyclingRules).set(patch).where(eq(recyclingRules.id, id)).run();
    }
    const row = db.select().from(recyclingRules).where(eq(recyclingRules.id, id)).get()!;
    return { rule: toDTO(row) };
  });

  app.delete('/api/recycling-rules/:id', { preHandler: requireRole('owner') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const existing = db.select().from(recyclingRules).where(eq(recyclingRules.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Regla no encontrada', 404);
    db.delete(recyclingRules).where(eq(recyclingRules.id, id)).run();
    reply.status(204).send();
  });

  app.post('/api/recycling/run-now', { preHandler: requireRole('owner') }, async (req) => {
    const report = runRecyclingCycle({ byUserId: req.currentUser!.id });
    return { report };
  });
}
