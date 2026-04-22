import { eq } from 'drizzle-orm';
import {
  automationRules,
  contacts,
  deals,
  leadEvents,
  leads,
  type AutomationRuleRow,
} from '@mycrm/db';
import type {
  AutomationAction,
  AutomationCondition,
  AutomationTrigger,
  AutomationTriggerType,
} from '@mycrm/shared';
import { getDb } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { newId } from '../lib/ids.js';
import { broadcast } from '../stream/sse.js';
import { evaluateRule, type HydratedRule } from './engine.js';

/* =========================================================================
 *  In-process event bus. Other features call `emit(...)`; we load every
 *  enabled rule whose trigger.type matches, evaluate, and run side effects.
 *  Actions that throw are logged (warn) but don't abort the remaining ones.
 * ========================================================================= */

export type EntityKind = 'lead' | 'deal' | 'contact' | 'event';

export interface EmitMeta {
  /** Hint about what kind of entity is being passed (defaults inferred from trigger type). */
  entityKind?: EntityKind;
  /** The user that caused the emit, if any. */
  byUserId?: string;
}

export interface EmitReport {
  triggered: number;
  evaluated: number;
  executed: number;
  errors: number;
}

export async function emit(
  triggerType: AutomationTriggerType,
  triggerParams: Record<string, unknown>,
  entity: Record<string, unknown>,
  meta: EmitMeta = {},
): Promise<EmitReport> {
  const db = getDb();
  const rows = db
    .select()
    .from(automationRules)
    .where(eq(automationRules.enabled, true))
    .all() as AutomationRuleRow[];

  const matching = rows.filter((r) => {
    const t = r.trigger as AutomationTrigger | { type?: string } | null;
    return t?.type === triggerType;
  });

  const report: EmitReport = {
    triggered: matching.length,
    evaluated: 0,
    executed: 0,
    errors: 0,
  };

  const entityKind = meta.entityKind ?? inferEntityKind(triggerType);

  for (const row of matching) {
    const rule = hydrateRule(row);
    if (!rule) {
      report.errors += 1;
      continue;
    }
    report.evaluated += 1;

    const result = evaluateRule({
      rule,
      ctx: { triggerType, triggerParams, entity },
    });

    if (!result.matched) {
      logger.debug(
        { ruleId: rule.id, reason: result.reason, trigger: triggerType },
        'automation skipped',
      );
      continue;
    }

    logger.info(
      {
        ruleId: rule.id,
        ruleName: rule.name,
        trigger: triggerType,
        actions: result.wouldExecute.length,
      },
      'automation firing',
    );

    // Run each action independently — failures don't abort subsequent actions.
    for (const action of result.wouldExecute) {
      try {
        await runAction(action, entity, { kind: entityKind, byUserId: meta.byUserId, ruleId: rule.id });
        report.executed += 1;
      } catch (err) {
        report.errors += 1;
        logger.warn(
          { err, ruleId: rule.id, actionType: action.type },
          'automation action failed',
        );
      }
    }

    // Increment bookkeeping regardless of individual action failures.
    try {
      db.update(automationRules)
        .set({
          lastRunAt: new Date(),
          runCount: (row.runCount ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(automationRules.id, row.id))
        .run();
    } catch (err) {
      logger.warn({ err, ruleId: rule.id }, 'automation bookkeeping update failed');
    }
  }

  return report;
}

/* ------------------------------------------------------------------------- */

interface ActionCtx {
  kind: EntityKind;
  byUserId?: string;
  ruleId: string;
}

const UPDATABLE_LEAD_FIELDS = new Set(['name', 'notes', 'status']);

async function runAction(
  action: AutomationAction,
  entity: Record<string, unknown>,
  ctx: ActionCtx,
): Promise<void> {
  const db = getDb();

  switch (action.type) {
    case 'add-tag': {
      const tag = action.params.tag;
      const entityId = String(entity.id ?? '');
      if (!entityId) return;
      if (ctx.kind === 'lead') {
        const row = db.select().from(leads).where(eq(leads.id, entityId)).get();
        if (!row) return;
        const current = (row.tags ?? []) as string[];
        if (current.includes(tag)) return;
        db.update(leads)
          .set({ tags: [...current, tag], updatedAt: new Date() })
          .where(eq(leads.id, entityId))
          .run();
        const updated = db.select().from(leads).where(eq(leads.id, entityId)).get();
        if (updated) broadcast('lead.updated', { id: updated.id, tags: updated.tags });
      } else if (ctx.kind === 'contact') {
        const row = db.select().from(contacts).where(eq(contacts.id, entityId)).get();
        if (!row) return;
        const current = (row.tags ?? []) as string[];
        if (current.includes(tag)) return;
        db.update(contacts)
          .set({ tags: [...current, tag], updatedAt: new Date() })
          .where(eq(contacts.id, entityId))
          .run();
      }
      return;
    }

    case 'assign-owner': {
      const userId = action.params.userId;
      if (ctx.kind !== 'lead') return;
      const entityId = String(entity.id ?? '');
      if (!entityId) return;
      db.update(leads)
        .set({ assignedTo: userId, assignedAt: new Date(), updatedAt: new Date() })
        .where(eq(leads.id, entityId))
        .run();
      const updated = db.select().from(leads).where(eq(leads.id, entityId)).get();
      if (updated) broadcast('lead.updated', { id: updated.id, assignedTo: updated.assignedTo });
      return;
    }

    case 'move-stage': {
      if (ctx.kind !== 'deal') return;
      const entityId = String(entity.id ?? '');
      if (!entityId) return;
      db.update(deals)
        .set({ stageId: action.params.stageId })
        .where(eq(deals.id, entityId))
        .run();
      return;
    }

    case 'notify-user': {
      // We insert a note on the lead's timeline if we can resolve a leadId.
      const leadId =
        ctx.kind === 'lead'
          ? String(entity.id ?? '')
          : typeof entity.leadId === 'string'
            ? entity.leadId
            : '';
      if (!leadId) return;
      db.insert(leadEvents)
        .values({
          id: newId(),
          leadId,
          at: new Date(),
          type: 'note-added',
          byUserId: action.params.userId ?? ctx.byUserId ?? null,
          meta: { autoRule: ctx.ruleId, text: action.params.message },
        })
        .run();
      broadcast('lead.event-added', { leadId });
      return;
    }

    case 'update-field': {
      if (ctx.kind !== 'lead') return;
      const { field, value } = action.params;
      if (!UPDATABLE_LEAD_FIELDS.has(field)) return;
      const entityId = String(entity.id ?? '');
      if (!entityId) return;
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      patch[field] = value;
      db.update(leads).set(patch).where(eq(leads.id, entityId)).run();
      const updated = db.select().from(leads).where(eq(leads.id, entityId)).get();
      if (updated) broadcast('lead.updated', { id: updated.id });
      return;
    }

    default: {
      // Exhaustiveness check — unknown action type.
      const _never: never = action;
      void _never;
    }
  }
}

/* ------------------------------------------------------------------------- */

export function hydrateRule(row: AutomationRuleRow): HydratedRule | null {
  try {
    const trigger = row.trigger as AutomationTrigger;
    const conditions = ((row.conditions ?? []) as unknown[]) as AutomationCondition[];
    const actions = (row.actions as unknown) as AutomationAction[];
    if (!trigger?.type || !Array.isArray(actions)) return null;
    return {
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      trigger,
      conditions: Array.isArray(conditions) ? conditions : [],
      actions,
    };
  } catch {
    return null;
  }
}

function inferEntityKind(trigger: AutomationTriggerType): EntityKind {
  switch (trigger) {
    case 'lead.created':
    case 'lead.status-changed':
      return 'lead';
    case 'deal.stage-changed':
      return 'deal';
    case 'contact.created':
      return 'contact';
    case 'event.canceled':
      return 'event';
  }
}
