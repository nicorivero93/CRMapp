import { z } from 'zod';
import { leadSourceSchema, leadStatusSchema } from './lead.js';

export const analyticsRangeSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type AnalyticsRange = z.infer<typeof analyticsRangeSchema>;

export interface SourcesBreakdownRow {
  source: string;
  total: number;
  byStatus: Record<string, number>;
  conversionRate: number;
}

export interface SourcesReport {
  from: string | null;
  to: string | null;
  totals: { total: number; converted: number; discarded: number };
  rows: SourcesBreakdownRow[];
}

export interface DashboardReport {
  totals: {
    total: number;
    new: number;
    assigned: number;
    contacted: number;
    responded: number;
    converted: number;
    discarded: number;
    recycled: number;
  };
  todayAssigned: number;
  pendingRecycling: number;
  recentLeads: Array<{
    id: string;
    name: string | null;
    phone: string;
    status: string;
    source: string;
    assignedTo: string | null;
    createdAt: string;
  }>;
}

// re-export so consumers can import from one spot
export { leadSourceSchema, leadStatusSchema };
