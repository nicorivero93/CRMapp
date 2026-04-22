import type { LeadStatus, RecyclingAction } from '@mycrm/shared';

export interface RecyclingRuleInput {
  id: string;
  name: string;
  enabled: boolean;
  statusIn: LeadStatus[];
  daysSinceLastContact: number;
  action: RecyclingAction;
  maxRecyclesPerLead: number;
}

export interface RecyclingLeadInput {
  id: string;
  status: LeadStatus;
  assignedTo: string | null;
  assignedAt: Date | null;
  lastContactAt: Date | null;
  recycledCount: number;
}

export type RecyclingDecision =
  | { type: 'discard'; leadId: string; ruleId: string; previousAssignee: string | null }
  | { type: 'return-to-pool'; leadId: string; ruleId: string; previousAssignee: string | null }
  | {
      type: 'reassign';
      leadId: string;
      ruleId: string;
      previousAssignee: string | null;
    }
  | {
      type: 'escalate';
      leadId: string;
      ruleId: string;
      previousAssignee: string | null;
      ownerId: string;
    };

export interface RecyclingPlanInput {
  now: Date;
  rules: RecyclingRuleInput[];
  leads: RecyclingLeadInput[];
  /** Owner user id, required for `escalate-to-owner` action. If null, escalation
   * rules degrade to return-to-pool. */
  ownerId: string | null;
}

export interface RecyclingPlan {
  decisions: RecyclingDecision[];
  /** Per-rule breakdown for debugging and reports. */
  perRule: Record<string, { matched: number; recycled: number; discarded: number }>;
  evaluated: number;
}

/**
 * Pure planner. Decides what should happen to each lead given the rules and
 * current state. No DB, no side effects — the orchestrator is in
 * `recyclingService.ts`.
 *
 * Eligibility per rule:
 *   lead.status ∈ rule.statusIn
 *   AND ( lead.lastContactAt < now - days
 *         OR (lead.lastContactAt IS NULL AND lead.assignedAt < now - days) )
 *
 * One decision per lead — the first rule whose filter matches wins.
 * recycledCount ≥ maxRecyclesPerLead → discard (even if the rule action was
 * something else); otherwise the rule's action runs.
 */
export function planRecycling(input: RecyclingPlanInput): RecyclingPlan {
  const decisions: RecyclingDecision[] = [];
  const perRule: Record<string, { matched: number; recycled: number; discarded: number }> = {};
  const seenLeads = new Set<string>();
  let evaluated = 0;

  const enabled = input.rules.filter((r) => r.enabled);
  for (const rule of enabled) {
    perRule[rule.id] = { matched: 0, recycled: 0, discarded: 0 };
    const cutoff = new Date(
      input.now.getTime() - rule.daysSinceLastContact * 24 * 60 * 60 * 1000,
    );
    for (const lead of input.leads) {
      if (seenLeads.has(lead.id)) continue;
      if (!rule.statusIn.includes(lead.status)) continue;
      const last = lead.lastContactAt ?? lead.assignedAt;
      if (!last) continue;
      if (last.getTime() >= cutoff.getTime()) continue;

      evaluated++;
      perRule[rule.id]!.matched++;
      seenLeads.add(lead.id);

      if (lead.recycledCount >= rule.maxRecyclesPerLead) {
        decisions.push({
          type: 'discard',
          leadId: lead.id,
          ruleId: rule.id,
          previousAssignee: lead.assignedTo,
        });
        perRule[rule.id]!.discarded++;
        continue;
      }

      const action: RecyclingAction =
        rule.action === 'escalate-to-owner' && !input.ownerId ? 'return-to-pool' : rule.action;

      if (action === 'return-to-pool') {
        decisions.push({
          type: 'return-to-pool',
          leadId: lead.id,
          ruleId: rule.id,
          previousAssignee: lead.assignedTo,
        });
      } else if (action === 'reassign-to-different-user') {
        decisions.push({
          type: 'reassign',
          leadId: lead.id,
          ruleId: rule.id,
          previousAssignee: lead.assignedTo,
        });
      } else if (action === 'escalate-to-owner') {
        decisions.push({
          type: 'escalate',
          leadId: lead.id,
          ruleId: rule.id,
          previousAssignee: lead.assignedTo,
          ownerId: input.ownerId!,
        });
      }
      perRule[rule.id]!.recycled++;
    }
  }

  return { decisions, perRule, evaluated };
}
