export interface AssignableUser {
  id: string;
  dailyLeadTarget: number;
  assignedToday: number;
  isActive: boolean;
  role: 'owner' | 'sales' | 'viewer';
}

export interface AssignmentInput {
  users: AssignableUser[];
  leadIds: string[];
  /** When recycling, the previous assignee to exclude from candidates. */
  excludeUserId?: string;
}

export interface AssignmentResult {
  /** Map userId -> leadIds assigned to them in this run. */
  perUser: Map<string, string[]>;
  /** Leads that could not be assigned (no capacity or no eligible users). */
  unassigned: string[];
}

/**
 * Weighted round-robin assignment.
 *
 * Spec (from docs/sprint-2-local-prompt.md §7):
 *  1. Eligible = active && role in [sales, owner] && dailyLeadTarget > 0 && assignedToday < dailyLeadTarget.
 *  2. capacity[u] = dailyLeadTarget - assignedToday.
 *  3. Each pass picks the user with the highest *remaining* capacity.
 *     Tiebreak: smaller absolute assignedToday. If still tied, lexicographic id.
 *  4. Stop when leads run out or no one has capacity.
 *  5. `excludeUserId` (for recycling) is removed from the candidate pool.
 *
 * Pure function. No DB, no side effects.
 */
export function roundRobinWeighted(input: AssignmentInput): AssignmentResult {
  const eligible = input.users
    .filter(
      (u) =>
        u.isActive &&
        (u.role === 'sales' || u.role === 'owner') &&
        u.dailyLeadTarget > 0 &&
        u.assignedToday < u.dailyLeadTarget &&
        u.id !== input.excludeUserId,
    )
    .map((u) => ({
      id: u.id,
      assignedTotal: u.assignedToday,
      capacity: u.dailyLeadTarget - u.assignedToday,
    }));

  const perUser = new Map<string, string[]>();
  const unassigned: string[] = [];

  if (eligible.length === 0) {
    unassigned.push(...input.leadIds);
    return { perUser, unassigned };
  }

  for (const leadId of input.leadIds) {
    // Pick user with max capacity; tiebreak on lowest assignedTotal, then lex id.
    let best: (typeof eligible)[number] | null = null;
    for (const u of eligible) {
      if (u.capacity <= 0) continue;
      if (!best) {
        best = u;
        continue;
      }
      if (u.capacity > best.capacity) best = u;
      else if (u.capacity === best.capacity) {
        if (u.assignedTotal < best.assignedTotal) best = u;
        else if (u.assignedTotal === best.assignedTotal && u.id < best.id) best = u;
      }
    }
    if (!best) {
      unassigned.push(leadId);
      continue;
    }
    const list = perUser.get(best.id) ?? [];
    list.push(leadId);
    perUser.set(best.id, list);
    best.capacity -= 1;
    best.assignedTotal += 1;
  }

  return { perUser, unassigned };
}
