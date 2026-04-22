import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { leads, leadEvents, users, type UserRow } from '@mycrm/db';
import type { AssignmentMode } from '@mycrm/shared';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { getSettings } from '../settings/service.js';
import { roundRobinWeighted, type AssignableUser } from './assignment.js';
import { broadcast } from '../stream/sse.js';

/**
 * Start of "today" in the given IANA timezone, returned as a UTC Date.
 * Used to count how many leads each user has been assigned today.
 */
export function startOfTodayInTZ(timezone: string, now = new Date()): Date {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')!.value;
    const m = parts.find((p) => p.type === 'month')!.value;
    const d = parts.find((p) => p.type === 'day')!.value;
    // Walk backwards from local midnight by computing the UTC time whose local
    // date in the target TZ is exactly Y-M-D 00:00. Binary search is overkill;
    // we use a two-pass approximation that is correct across DST transitions.
    const guess = new Date(`${y}-${m}-${d}T00:00:00Z`);
    const tzOffsetMs = guess.getTime() - localMidnightInTZ(guess, timezone).getTime();
    return new Date(guess.getTime() + tzOffsetMs);
  } catch {
    // Fallback: UTC midnight.
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }
}

function localMidnightInTZ(utc: Date, timezone: string): Date {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = fmt.formatToParts(utc).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return new Date(
    `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`,
  );
}

export interface AssignRunOptions {
  leadIds: string[];
  byUserId: string | null;
  excludeUserId?: string;
  /** Override the configured assignment mode (used for forced manual runs). */
  forceMode?: AssignmentMode;
}

export interface AssignRunReport {
  assigned: Array<{ leadId: string; userId: string }>;
  unassigned: string[];
  perUser: Record<string, number>;
}

export function loadAssignableUsers(timezone: string): AssignableUser[] {
  const db = getDb();
  const dayStart = startOfTodayInTZ(timezone);
  const allUsers = db.select().from(users).where(eq(users.isActive, true)).all() as UserRow[];

  if (allUsers.length === 0) return [];

  const candidates = allUsers.filter((u) => u.role === 'sales' || u.role === 'owner');
  if (candidates.length === 0) return [];

  const counts = db
    .select({ userId: leads.assignedTo, n: sql<number>`count(*)` })
    .from(leads)
    .where(and(gte(leads.assignedAt, dayStart), inArray(leads.assignedTo, candidates.map((u) => u.id))))
    .groupBy(leads.assignedTo)
    .all();
  const todayByUser = new Map<string, number>();
  for (const c of counts) if (c.userId) todayByUser.set(c.userId, Number(c.n));

  return candidates.map((u) => ({
    id: u.id,
    dailyLeadTarget: u.dailyLeadTarget,
    assignedToday: todayByUser.get(u.id) ?? 0,
    isActive: u.isActive,
    role: u.role,
  }));
}

/**
 * Run the assignment engine against the given lead ids, persist the assignments,
 * emit `assigned` events, and broadcast `lead.updated` for every reassigned lead.
 *
 * Callers decide when to invoke (auto on create, manual batch via endpoint,
 * or the cron for recycling).
 */
export function runAssignment(opts: AssignRunOptions): AssignRunReport {
  const settings = getSettings();
  const mode = opts.forceMode ?? settings.assignmentMode;
  if (mode === 'manual-only') {
    return { assigned: [], unassigned: [...opts.leadIds], perUser: {} };
  }

  const candidates = loadAssignableUsers(settings.timezone);
  const result = roundRobinWeighted({
    users: candidates,
    leadIds: opts.leadIds,
    excludeUserId: opts.excludeUserId,
  });

  const db = getDb();
  const now = new Date();
  const assigned: AssignRunReport['assigned'] = [];
  const perUser: Record<string, number> = {};

  for (const [userId, list] of result.perUser.entries()) {
    if (list.length === 0) continue;
    db.update(leads)
      .set({
        assignedTo: userId,
        assignedAt: now,
        status: 'assigned',
        updatedAt: now,
      })
      .where(inArray(leads.id, list))
      .run();
    for (const leadId of list) {
      db.insert(leadEvents)
        .values({
          id: newId(),
          leadId,
          at: now,
          type: 'assigned',
          byUserId: opts.byUserId,
          meta: { userId, mode },
        })
        .run();
      assigned.push({ leadId, userId });
      const row = db.select().from(leads).where(eq(leads.id, leadId)).get();
      if (row) broadcast('lead.updated', toDTO(row));
    }
    perUser[userId] = list.length;
  }

  return { assigned, unassigned: result.unassigned, perUser };
}

function toDTO(row: typeof leads.$inferSelect) {
  return {
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
  };
}
