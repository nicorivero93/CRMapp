import { and, desc, gte, lte, sql } from 'drizzle-orm';
import { leads, recyclingRules, type LeadRow } from '@mycrm/db';
import type { DashboardReport, SourcesReport } from '@mycrm/shared';
import { analyticsRangeSchema } from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { getDb } from '../db/client.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

type App = Awaited<ReturnType<typeof buildApp>>;

const CONVERTED_STATUSES = new Set(['converted', 'qualified']);

export async function registerAnalyticsRoutes(app: App): Promise<void> {
  app.get('/api/analytics/sources', { preHandler: requireAuth }, async (req) => {
    const q = analyticsRangeSchema.parse(req.query);
    const from = q.from ? new Date(q.from) : null;
    const to = q.to ? new Date(q.to) : null;
    const db = getDb();
    const conds = [];
    if (from) conds.push(gte(leads.createdAt, from));
    if (to) conds.push(lte(leads.createdAt, to));

    const rows = db
      .select({
        source: leads.source,
        status: leads.status,
        n: sql<number>`count(*)`,
      })
      .from(leads)
      .where(conds.length ? and(...conds) : undefined)
      .groupBy(leads.source, leads.status)
      .all();

    const perSource = new Map<string, { total: number; byStatus: Record<string, number> }>();
    let grandTotal = 0;
    let grandConverted = 0;
    let grandDiscarded = 0;
    for (const r of rows) {
      const n = Number(r.n);
      grandTotal += n;
      if (CONVERTED_STATUSES.has(r.status)) grandConverted += n;
      if (r.status === 'discarded') grandDiscarded += n;
      const entry = perSource.get(r.source) ?? { total: 0, byStatus: {} };
      entry.total += n;
      entry.byStatus[r.status] = (entry.byStatus[r.status] ?? 0) + n;
      perSource.set(r.source, entry);
    }

    const report: SourcesReport = {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      totals: { total: grandTotal, converted: grandConverted, discarded: grandDiscarded },
      rows: Array.from(perSource.entries())
        .map(([source, v]) => ({
          source,
          total: v.total,
          byStatus: v.byStatus,
          conversionRate: v.total > 0
            ? ((v.byStatus.converted ?? 0) + (v.byStatus.qualified ?? 0)) / v.total
            : 0,
        }))
        .sort((a, b) => b.total - a.total),
    };
    return { report };
  });

  app.get('/api/analytics/dashboard', { preHandler: requireAuth }, async () => {
    const db = getDb();
    const statusRows = db
      .select({ status: leads.status, n: sql<number>`count(*)` })
      .from(leads)
      .groupBy(leads.status)
      .all();
    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const r of statusRows) {
      const n = Number(r.n);
      byStatus[r.status] = n;
      total += n;
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const todayRow = db
      .select({ n: sql<number>`count(*)` })
      .from(leads)
      .where(gte(leads.assignedAt, dayStart))
      .get();
    const todayAssigned = Number(todayRow?.n ?? 0);

    // Pending recycling: leads whose lastContactAt (or assignedAt fallback) is
    // older than any enabled rule's cutoff.
    const rules = db.select().from(recyclingRules).all().filter((r) => r.enabled);
    let pendingRecycling = 0;
    if (rules.length > 0) {
      const now = Date.now();
      const statuses = Array.from(new Set(rules.flatMap((r) => r.statusIn as string[])));
      if (statuses.length > 0) {
        const candidateLeads = db
          .select()
          .from(leads)
          .where(sql`${leads.status} IN (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})`)
          .all();
        for (const l of candidateLeads) {
          const last = l.lastContactAt ?? l.assignedAt;
          if (!last) continue;
          const matches = rules.some(
            (r) =>
              (r.statusIn as string[]).includes(l.status) &&
              now - last.getTime() >= r.daysSinceLastContact * 24 * 60 * 60 * 1000,
          );
          if (matches) pendingRecycling++;
        }
      }
    }

    const recentRows = db
      .select()
      .from(leads)
      .orderBy(desc(leads.createdAt))
      .limit(8)
      .all() as LeadRow[];

    const report: DashboardReport = {
      totals: {
        total,
        new: byStatus.new ?? 0,
        assigned: byStatus.assigned ?? 0,
        contacted: byStatus.contacted ?? 0,
        responded: byStatus.responded ?? 0,
        converted: byStatus.converted ?? 0,
        discarded: byStatus.discarded ?? 0,
        recycled: byStatus.recycled ?? 0,
      },
      todayAssigned,
      pendingRecycling,
      recentLeads: recentRows.map((r) => ({
        id: r.id,
        name: r.name,
        phone: r.phone,
        status: r.status,
        source: r.source,
        assignedTo: r.assignedTo,
        createdAt: r.createdAt.toISOString(),
      })),
    };
    return { report };
  });

  // Expose a lightweight "owner-wants-dry-run" preview of the recycling queue.
  app.get('/api/recycling/preview', { preHandler: requireRole('owner') }, async () => {
    const db = getDb();
    const rules = db.select().from(recyclingRules).all().filter((r) => r.enabled);
    if (rules.length === 0) return { candidates: [] };
    const statuses = Array.from(new Set(rules.flatMap((r) => r.statusIn as string[])));
    if (statuses.length === 0) return { candidates: [] };
    const rows = db
      .select()
      .from(leads)
      .where(sql`${leads.status} IN (${sql.join(statuses.map((s) => sql`${s}`), sql`, `)})`)
      .all() as LeadRow[];
    const now = Date.now();
    const preview = rows
      .map((l) => {
        const last = l.lastContactAt ?? l.assignedAt;
        if (!last) return null;
        const match = rules.find(
          (r) =>
            (r.statusIn as string[]).includes(l.status) &&
            now - last.getTime() >= r.daysSinceLastContact * 24 * 60 * 60 * 1000,
        );
        if (!match) return null;
        return {
          leadId: l.id,
          name: l.name,
          phone: l.phone,
          status: l.status,
          assignedTo: l.assignedTo,
          lastActivityAt: last.toISOString(),
          ruleId: match.id,
          ruleName: match.name,
          willDiscard: l.recycledCount >= match.maxRecyclesPerLead,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
    return { candidates: preview };
  });
}
