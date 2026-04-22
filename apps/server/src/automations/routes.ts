import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { automationRules, type AutomationRuleRow } from '@mycrm/db';
import {
  createAutomationSchema,
  patchAutomationSchema,
  type AutomationDTO,
  type AutomationTestResult,
  type AutomationTriggerType,
} from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { AppError } from '../lib/errors.js';
import { requireRole } from '../auth/middleware.js';
import { evaluateRule } from './engine.js';
import { hydrateRule } from './dispatcher.js';

type App = Awaited<ReturnType<typeof buildApp>>;

function toDTO(row: AutomationRuleRow): AutomationDTO {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    trigger: row.trigger as AutomationDTO['trigger'],
    conditions: ((row.conditions ?? []) as unknown[]) as AutomationDTO['conditions'],
    actions: row.actions as AutomationDTO['actions'],
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    runCount: row.runCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const testBodySchema = z.object({
  entity: z.record(z.unknown()).default({}),
  triggerParams: z.record(z.unknown()).optional(),
});

export async function registerAutomationRoutes(app: App): Promise<void> {
  app.get('/api/automations', { preHandler: requireRole('owner') }, async () => {
    const rows = getDb()
      .select()
      .from(automationRules)
      .orderBy(asc(automationRules.createdAt))
      .all();
    return { automations: rows.map(toDTO) };
  });

  app.post('/api/automations', { preHandler: requireRole('owner') }, async (req, reply) => {
    const body = createAutomationSchema.parse(req.body);
    const id = newId();
    const db = getDb();
    const now = new Date();
    db.insert(automationRules)
      .values({
        id,
        name: body.name,
        enabled: body.enabled,
        trigger: body.trigger,
        conditions: body.conditions,
        actions: body.actions,
        runCount: 0,
        lastRunAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const created = db
      .select()
      .from(automationRules)
      .where(eq(automationRules.id, id))
      .get()!;
    reply.status(201).send({ automation: toDTO(created) });
  });

  app.patch('/api/automations/:id', { preHandler: requireRole('owner') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchAutomationSchema.parse(req.body);
    const db = getDb();
    const existing = db
      .select()
      .from(automationRules)
      .where(eq(automationRules.id, id))
      .get();
    if (!existing) throw new AppError('NOT_FOUND', 'Automation no encontrada', 404);
    const patch: Partial<typeof automationRules.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.enabled !== undefined) patch.enabled = body.enabled;
    if (body.trigger !== undefined) patch.trigger = body.trigger;
    if (body.conditions !== undefined) patch.conditions = body.conditions;
    if (body.actions !== undefined) patch.actions = body.actions;
    db.update(automationRules).set(patch).where(eq(automationRules.id, id)).run();
    const updated = db
      .select()
      .from(automationRules)
      .where(eq(automationRules.id, id))
      .get()!;
    return { automation: toDTO(updated) };
  });

  app.delete('/api/automations/:id', { preHandler: requireRole('owner') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const existing = db
      .select()
      .from(automationRules)
      .where(eq(automationRules.id, id))
      .get();
    if (!existing) throw new AppError('NOT_FOUND', 'Automation no encontrada', 404);
    db.delete(automationRules).where(eq(automationRules.id, id)).run();
    reply.status(204).send();
  });

  app.post('/api/automations/:id/test', { preHandler: requireRole('owner') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = testBodySchema.parse(req.body ?? {});
    const db = getDb();
    const row = db.select().from(automationRules).where(eq(automationRules.id, id)).get();
    if (!row) throw new AppError('NOT_FOUND', 'Automation no encontrada', 404);
    const rule = hydrateRule(row);
    if (!rule) {
      const fallback: AutomationTestResult = {
        matched: false,
        ranConditions: false,
        wouldExecute: [],
        reason: 'rule-malformed',
      };
      return { result: fallback };
    }
    const triggerType = rule.trigger.type as AutomationTriggerType;
    const result = evaluateRule({
      rule,
      ctx: {
        triggerType,
        triggerParams: body.triggerParams ?? (rule.trigger.params as Record<string, unknown>) ?? {},
        entity: body.entity,
      },
    });
    return { result };
  });
}
