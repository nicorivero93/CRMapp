import { describe, expect, it } from 'vitest';
import { roundRobinWeighted, type AssignableUser } from './assignment.js';

function mkUser(id: string, target: number, today = 0, role: AssignableUser['role'] = 'sales'): AssignableUser {
  return { id, dailyLeadTarget: target, assignedToday: today, isActive: true, role };
}
function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `L${String(i + 1).padStart(3, '0')}`);
}

describe('roundRobinWeighted', () => {
  it('3 users (50/30/15) + 95 leads → reparte 50/30/15 exacto', () => {
    const users = [mkUser('a', 50), mkUser('b', 30), mkUser('c', 15)];
    const r = roundRobinWeighted({ users, leadIds: ids(95) });
    expect(r.perUser.get('a')?.length).toBe(50);
    expect(r.perUser.get('b')?.length).toBe(30);
    expect(r.perUser.get('c')?.length).toBe(15);
    expect(r.unassigned).toHaveLength(0);
  });

  it('3 users + 100 leads → 50/30/15 + 5 unassigned', () => {
    const users = [mkUser('a', 50), mkUser('b', 30), mkUser('c', 15)];
    const r = roundRobinWeighted({ users, leadIds: ids(100) });
    expect(r.perUser.get('a')?.length).toBe(50);
    expect(r.perUser.get('b')?.length).toBe(30);
    expect(r.perUser.get('c')?.length).toBe(15);
    expect(r.unassigned).toHaveLength(5);
  });

  it('capacity tie → smaller assignedTotal wins', () => {
    const users = [mkUser('a', 10, 5), mkUser('b', 10, 3)];
    // capacities 5 and 7 → b first, but test a tie scenario:
    const tied = [mkUser('a', 10, 0), mkUser('b', 10, 0)];
    const r = roundRobinWeighted({ users: tied, leadIds: ['L1'] });
    // tied capacity + tied assignedTotal → lex id "a" wins
    expect(r.perUser.get('a')).toEqual(['L1']);
  });

  it('capacity tie + assignedTotal tie → lexicographic id wins', () => {
    const users = [mkUser('z', 10, 0), mkUser('a', 10, 0), mkUser('m', 10, 0)];
    const r = roundRobinWeighted({ users, leadIds: ['L1'] });
    expect(r.perUser.get('a')).toEqual(['L1']);
  });

  it('capacity 0 user is excluded', () => {
    const users = [mkUser('a', 0), mkUser('b', 10, 10), mkUser('c', 5, 0)];
    const r = roundRobinWeighted({ users, leadIds: ids(5) });
    expect(r.perUser.get('c')?.length).toBe(5);
    expect(r.perUser.has('a')).toBe(false);
    expect(r.perUser.has('b')).toBe(false);
  });

  it('inactive + viewer users excluded', () => {
    const users: AssignableUser[] = [
      { id: 'a', dailyLeadTarget: 10, assignedToday: 0, isActive: false, role: 'sales' },
      { id: 'b', dailyLeadTarget: 10, assignedToday: 0, isActive: true, role: 'viewer' },
      mkUser('c', 10),
    ];
    const r = roundRobinWeighted({ users, leadIds: ids(5) });
    expect(r.perUser.get('c')?.length).toBe(5);
    expect(r.unassigned).toHaveLength(0);
  });

  it('owner is eligible', () => {
    const users: AssignableUser[] = [mkUser('a', 10, 0, 'owner')];
    const r = roundRobinWeighted({ users, leadIds: ids(5) });
    expect(r.perUser.get('a')?.length).toBe(5);
  });

  it('excludeUserId removes candidate (recycling case)', () => {
    const users = [mkUser('a', 50), mkUser('b', 50)];
    const r = roundRobinWeighted({ users, leadIds: ids(10), excludeUserId: 'a' });
    expect(r.perUser.get('b')?.length).toBe(10);
    expect(r.perUser.has('a')).toBe(false);
  });

  it('no eligible users → all leads unassigned', () => {
    const users: AssignableUser[] = [
      { id: 'a', dailyLeadTarget: 10, assignedToday: 0, isActive: false, role: 'sales' },
    ];
    const r = roundRobinWeighted({ users, leadIds: ids(3) });
    expect(r.unassigned).toEqual(['L001', 'L002', 'L003']);
    expect(r.perUser.size).toBe(0);
  });

  it('weighted distribution — round robin preserves fairness over many passes', () => {
    // 10/20/30 targets, 60 leads → should end 10/20/30
    const users = [mkUser('a', 10), mkUser('b', 20), mkUser('c', 30)];
    const r = roundRobinWeighted({ users, leadIds: ids(60) });
    expect(r.perUser.get('a')?.length).toBe(10);
    expect(r.perUser.get('b')?.length).toBe(20);
    expect(r.perUser.get('c')?.length).toBe(30);
  });

  it('partial assignedToday reduces capacity', () => {
    // b already has 15 of 20 assigned today → capacity 5
    const users = [mkUser('a', 10, 0), mkUser('b', 20, 15)];
    const r = roundRobinWeighted({ users, leadIds: ids(15) });
    expect(r.perUser.get('a')?.length).toBe(10);
    expect(r.perUser.get('b')?.length).toBe(5);
  });
});
