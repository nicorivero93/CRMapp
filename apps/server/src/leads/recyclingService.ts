import { eq, inArray } from 'drizzle-orm';
import { leads, leadEvents, recyclingRules, users, type UserRow } from '@mycrm/db';
import type { LeadStatus, RecyclingReport } from '@mycrm/shared';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { broadcast } from '../stream/sse.js';
import { logger } from '../lib/logger.js';
import {
  planRecycling,
  type RecyclingLeadInput,
  type RecyclingRuleInput,
} from './recycling.js';
import { runAssignment } from './assignmentService.js';

interface RunOptions {
  now?: Date;
  byUserId?: string | null;
}

/**
 * Orchestrates the full recycling cycle: loads active rules + eligible leads,
 * invokes the pure planner, persists decisions (status changes, reassignments,
 * event log, counters), and broadcasts SSE updates.
 */
export function runRecyclingCycle(opts: RunOptions = {}): RecyclingReport {
  const db = getDb();
  const now = opts.now ?? new Date();
  const byUserId = opts.byUserId ?? null;

  // Load rules
  const ruleRows = db.select().from(recyclingRules).all();
  const rules: RecyclingRuleInput[] = ruleRows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    statusIn: (r.statusIn as LeadStatus[]),
    daysSinceLastContact: r.daysSinceLastContact,
    action: r.action,
    maxRecyclesPerLead: r.maxRecyclesPerLead,
  }));

  // Enabled rules are sorted by daysSinceLastContact descending so stricter
  // rules (e.g. "30 days → discard") fire before lax ones ("7 days →
  // return-to-pool"), but "first rule wins" means we only recycle once.
  rules.sort((a, b) => b.daysSinceLastContact - a.daysSinceLastContact);

  // Only load leads that could plausibly match any rule to keep memory bounded.
  const candidateStatuses = Array.from(
    new Set(rules.filter((r) => r.enabled).flatMap((r) => r.statusIn)),
  ) as LeadStatus[];
  if (candidateStatuses.length === 0) {
    return emptyReport();
  }

  const leadRows = db
    .select()
    .from(leads)
    .where(inArray(leads.status, candidateStatuses))
    .all();
  const leadInputs: RecyclingLeadInput[] = leadRows.map((l) => ({
    id: l.id,
    status: l.status,
    assignedTo: l.assignedTo,
    assignedAt: l.assignedAt,
    lastContactAt: l.lastContactAt,
    recycledCount: l.recycledCount,
  }));

  // Find the primary owner for escalate-to-owner actions.
  const ownerRow = db.select().from(users).where(eq(users.role, 'owner')).get() as UserRow | undefined;
  const ownerId = ownerRow?.id ?? null;

  const plan = planRecycling({ now, rules, leads: leadInputs, ownerId });

  let recycled = 0;
  let discarded = 0;
  let reassigned = 0;
  let escalated = 0;
  let returnedToPool = 0;
  const reassignTargets: string[] = [];
  const excludedByLead = new Map<string, string | null>();

  for (const d of plan.decisions) {
    const leadBefore = leadRows.find((l) => l.id === d.leadId);
    if (!leadBefore) continue;
    const fromStatus = leadBefore.status;

    if (d.type === 'discard') {
      db.update(leads)
        .set({ status: 'discarded', updatedAt: now })
        .where(eq(leads.id, d.leadId))
        .run();
      db.insert(leadEvents)
        .values({
          id: newId(),
          leadId: d.leadId,
          at: now,
          type: 'status-changed',
          byUserId,
          meta: { from: fromStatus, to: 'discarded', reason: 'max-recycles', ruleId: d.ruleId },
        })
        .run();
      discarded++;
    } else if (d.type === 'return-to-pool') {
      db.update(leads)
        .set({
          status: 'recycled',
          assignedTo: null,
          assignedAt: null,
          recycledCount: leadBefore.recycledCount + 1,
          lastRecycledAt: now,
          updatedAt: now,
        })
        .where(eq(leads.id, d.leadId))
        .run();
      db.insert(leadEvents)
        .values({
          id: newId(),
          leadId: d.leadId,
          at: now,
          type: 'recycled',
          byUserId,
          meta: { action: 'return-to-pool', ruleId: d.ruleId, from: d.previousAssignee },
        })
        .run();
      returnedToPool++;
      recycled++;
    } else if (d.type === 'reassign') {
      // Stage the lead for batch reassignment below.
      db.update(leads)
        .set({
          status: 'recycled',
          assignedTo: null,
          assignedAt: null,
          recycledCount: leadBefore.recycledCount + 1,
          lastRecycledAt: now,
          updatedAt: now,
        })
        .where(eq(leads.id, d.leadId))
        .run();
      db.insert(leadEvents)
        .values({
          id: newId(),
          leadId: d.leadId,
          at: now,
          type: 'recycled',
          byUserId,
          meta: { action: 'reassign', ruleId: d.ruleId, from: d.previousAssignee },
        })
        .run();
      reassignTargets.push(d.leadId);
      excludedByLead.set(d.leadId, d.previousAssignee);
      reassigned++;
      recycled++;
    } else if (d.type === 'escalate') {
      db.update(leads)
        .set({
          status: 'assigned',
          assignedTo: d.ownerId,
          assignedAt: now,
          recycledCount: leadBefore.recycledCount + 1,
          lastRecycledAt: now,
          updatedAt: now,
        })
        .where(eq(leads.id, d.leadId))
        .run();
      db.insert(leadEvents)
        .values({
          id: newId(),
          leadId: d.leadId,
          at: now,
          type: 'recycled',
          byUserId,
          meta: { action: 'escalate-to-owner', ruleId: d.ruleId, from: d.previousAssignee, to: d.ownerId },
        })
        .run();
      escalated++;
      recycled++;
    }
  }

  // Reassign the staged leads. Pass excludeUserId per-lead via individual runs
  // to respect the previous assignee constraint (the engine takes one
  // excludeUserId per invocation).
  if (reassignTargets.length > 0) {
    const byExcluded = new Map<string | null, string[]>();
    for (const leadId of reassignTargets) {
      const key = excludedByLead.get(leadId) ?? null;
      const list = byExcluded.get(key) ?? [];
      list.push(leadId);
      byExcluded.set(key, list);
    }
    for (const [excl, ids] of byExcluded.entries()) {
      runAssignment({
        leadIds: ids,
        byUserId,
        excludeUserId: excl ?? undefined,
        forceMode: 'capacity-weighted',
      });
    }
  }

  // Broadcast the latest state for all touched leads.
  const touchedIds = plan.decisions.map((d) => d.leadId);
  if (touchedIds.length > 0) {
    const updated = db.select().from(leads).where(inArray(leads.id, touchedIds)).all();
    for (const row of updated) {
      broadcast('lead.updated', {
        id: row.id,
        name: row.name,
        phone: row.phone,
        phoneNormalized: row.phoneNormalized,
        source: row.source,
        sourceMeta: row.sourceMeta,
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
      });
    }
  }

  const report: RecyclingReport = {
    evaluated: plan.evaluated,
    recycled,
    discarded,
    reassigned,
    escalated,
    returnedToPool,
    perRule: plan.perRule,
  };
  logger.info(report, 'recycling cycle done');
  return report;
}

function emptyReport(): RecyclingReport {
  return {
    evaluated: 0,
    recycled: 0,
    discarded: 0,
    reassigned: 0,
    escalated: 0,
    returnedToPool: 0,
    perRule: {},
  };
}
