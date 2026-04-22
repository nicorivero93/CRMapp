import { describe, expect, it } from 'vitest';
import { planRecycling, type RecyclingLeadInput, type RecyclingRuleInput } from './recycling.js';

const NOW = new Date('2026-04-21T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);
}

function mkLead(o: Partial<RecyclingLeadInput> & { id: string }): RecyclingLeadInput {
  return {
    id: o.id,
    status: o.status ?? 'assigned',
    assignedTo: 'assignedTo' in o ? o.assignedTo! : 'u1',
    assignedAt: 'assignedAt' in o ? (o.assignedAt ?? null) : daysAgo(10),
    lastContactAt: 'lastContactAt' in o ? (o.lastContactAt ?? null) : null,
    recycledCount: o.recycledCount ?? 0,
  };
}

function mkRule(o: Partial<RecyclingRuleInput> & { id: string }): RecyclingRuleInput {
  return {
    id: o.id,
    name: o.name ?? `Rule ${o.id}`,
    enabled: o.enabled ?? true,
    statusIn: o.statusIn ?? ['assigned'],
    daysSinceLastContact: o.daysSinceLastContact ?? 7,
    action: o.action ?? 'return-to-pool',
    maxRecyclesPerLead: o.maxRecyclesPerLead ?? 3,
  };
}

describe('planRecycling', () => {
  it('ignores disabled rules', () => {
    const plan = planRecycling({
      now: NOW,
      rules: [mkRule({ id: 'r1', enabled: false })],
      leads: [mkLead({ id: 'l1' })],
      ownerId: null,
    });
    expect(plan.decisions).toHaveLength(0);
    expect(plan.evaluated).toBe(0);
  });

  it('return-to-pool action for assigned-but-not-contacted lead older than cutoff', () => {
    const plan = planRecycling({
      now: NOW,
      rules: [mkRule({ id: 'r1', action: 'return-to-pool', daysSinceLastContact: 7 })],
      leads: [mkLead({ id: 'l1', assignedAt: daysAgo(10) })],
      ownerId: null,
    });
    expect(plan.decisions).toHaveLength(1);
    expect(plan.decisions[0]).toMatchObject({ type: 'return-to-pool', leadId: 'l1' });
    expect(plan.perRule.r1).toEqual({ matched: 1, recycled: 1, discarded: 0 });
  });

  it('uses lastContactAt when present, not assignedAt', () => {
    const plan = planRecycling({
      now: NOW,
      rules: [mkRule({ id: 'r1', daysSinceLastContact: 7 })],
      leads: [
        mkLead({ id: 'old', assignedAt: daysAgo(30), lastContactAt: daysAgo(2) }),
        mkLead({ id: 'recent', assignedAt: daysAgo(2), lastContactAt: daysAgo(10) }),
      ],
      ownerId: null,
    });
    // old lead: lastContactAt was 2 days ago → inside cutoff, skip
    // recent lead: lastContactAt was 10 days ago → recycles
    expect(plan.decisions.map((d) => d.leadId)).toEqual(['recent']);
  });

  it('status filter restricts candidates', () => {
    const plan = planRecycling({
      now: NOW,
      rules: [mkRule({ id: 'r1', statusIn: ['assigned'] })],
      leads: [
        mkLead({ id: 'a', status: 'assigned' }),
        mkLead({ id: 'b', status: 'converted' }),
        mkLead({ id: 'c', status: 'contacted' }),
      ],
      ownerId: null,
    });
    expect(plan.decisions.map((d) => d.leadId)).toEqual(['a']);
  });

  it('discards lead at maxRecyclesPerLead instead of running action', () => {
    const plan = planRecycling({
      now: NOW,
      rules: [mkRule({ id: 'r1', action: 'reassign-to-different-user', maxRecyclesPerLead: 3 })],
      leads: [
        mkLead({ id: 'fresh', recycledCount: 0 }),
        mkLead({ id: 'ceiling', recycledCount: 3 }),
        mkLead({ id: 'over', recycledCount: 5 }),
      ],
      ownerId: null,
    });
    const byId = Object.fromEntries(plan.decisions.map((d) => [d.leadId, d.type]));
    expect(byId.fresh).toBe('reassign');
    expect(byId.ceiling).toBe('discard');
    expect(byId.over).toBe('discard');
    expect(plan.perRule.r1).toEqual({ matched: 3, recycled: 1, discarded: 2 });
  });

  it('escalate-to-owner without an ownerId degrades to return-to-pool', () => {
    const plan = planRecycling({
      now: NOW,
      rules: [mkRule({ id: 'r1', action: 'escalate-to-owner' })],
      leads: [mkLead({ id: 'l1' })],
      ownerId: null,
    });
    expect(plan.decisions[0]?.type).toBe('return-to-pool');
  });

  it('escalate-to-owner sets ownerId when available', () => {
    const plan = planRecycling({
      now: NOW,
      rules: [mkRule({ id: 'r1', action: 'escalate-to-owner' })],
      leads: [mkLead({ id: 'l1' })],
      ownerId: 'owner-123',
    });
    const d = plan.decisions[0];
    if (d?.type !== 'escalate') throw new Error('expected escalate');
    expect(d.ownerId).toBe('owner-123');
    expect(d.previousAssignee).toBe('u1');
  });

  it('first matching rule wins — lead is not double-counted', () => {
    const plan = planRecycling({
      now: NOW,
      rules: [
        mkRule({ id: 'r1', daysSinceLastContact: 5, action: 'return-to-pool' }),
        mkRule({ id: 'r2', daysSinceLastContact: 10, action: 'reassign-to-different-user' }),
      ],
      leads: [mkLead({ id: 'l1', assignedAt: daysAgo(15) })],
      ownerId: null,
    });
    expect(plan.decisions).toHaveLength(1);
    expect(plan.decisions[0]?.type).toBe('return-to-pool');
    expect(plan.perRule.r1).toEqual({ matched: 1, recycled: 1, discarded: 0 });
    expect(plan.perRule.r2).toEqual({ matched: 0, recycled: 0, discarded: 0 });
  });

  it('leads inside cutoff window are skipped', () => {
    const plan = planRecycling({
      now: NOW,
      rules: [mkRule({ id: 'r1', daysSinceLastContact: 7 })],
      leads: [
        mkLead({ id: 'a', assignedAt: daysAgo(3) }),
        mkLead({ id: 'b', assignedAt: daysAgo(8) }),
      ],
      ownerId: null,
    });
    expect(plan.decisions.map((d) => d.leadId)).toEqual(['b']);
  });

  it('lead with no assignedAt and no lastContactAt is never recycled', () => {
    const plan = planRecycling({
      now: NOW,
      rules: [mkRule({ id: 'r1' })],
      leads: [mkLead({ id: 'l1', assignedAt: null, lastContactAt: null })],
      ownerId: null,
    });
    expect(plan.decisions).toHaveLength(0);
  });
});
