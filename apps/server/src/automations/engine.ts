import type {
  AutomationAction,
  AutomationCondition,
  AutomationTestResult,
  AutomationTrigger,
  AutomationTriggerType,
} from '@mycrm/shared';

/* =========================================================================
 *  Pure engine — NO side effects. Given a rule + a runtime ctx, returns
 *  whether the rule would fire and which actions would execute.
 * ========================================================================= */

export interface HydratedRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
}

export interface EngineContext {
  triggerType: AutomationTriggerType;
  /** Params observed from the actual event (e.g. the `from`/`to` of a status change). */
  triggerParams: Record<string, unknown>;
  /** The entity that triggered the event (lead/deal/contact/event) as a plain record. */
  entity: Record<string, unknown>;
}

export function evaluateRule(input: {
  rule: HydratedRule;
  ctx: EngineContext;
}): AutomationTestResult {
  const { rule, ctx } = input;

  if (!rule.enabled) {
    return {
      matched: false,
      ranConditions: false,
      wouldExecute: [],
      reason: 'rule-disabled',
    };
  }

  if (rule.trigger.type !== ctx.triggerType) {
    return {
      matched: false,
      ranConditions: false,
      wouldExecute: [],
      reason: `trigger-mismatch:${rule.trigger.type}!=${ctx.triggerType}`,
    };
  }

  // Trigger params filter. If a rule param is set (not undefined/null/""),
  // require ctx.triggerParams to equal it. If the rule param is empty, any ctx value is fine.
  const ruleParams = (rule.trigger.params ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(ruleParams)) {
    const wanted = ruleParams[key];
    if (wanted === undefined || wanted === null || wanted === '') continue;
    const got = ctx.triggerParams[key];
    if (got !== wanted) {
      return {
        matched: false,
        ranConditions: false,
        wouldExecute: [],
        reason: `trigger-param-mismatch:${key}`,
      };
    }
  }

  // Conditions — all must pass (AND).
  for (const cond of rule.conditions) {
    if (!evaluateCondition(cond, ctx.entity)) {
      return {
        matched: false,
        ranConditions: true,
        wouldExecute: [],
        reason: `condition-failed:${cond.field} ${cond.op}`,
      };
    }
  }

  return {
    matched: true,
    ranConditions: rule.conditions.length > 0,
    wouldExecute: rule.actions,
  };
}

/* ------------------------------------------------------------------------- */

export function evaluateCondition(
  cond: AutomationCondition,
  entity: Record<string, unknown>,
): boolean {
  const left = getFieldValue(entity, cond.field);
  const right = cond.value;

  switch (cond.op) {
    case 'eq':
      return looseEq(left, right);
    case 'neq':
      return !looseEq(left, right);
    case 'contains':
      return containsOp(left, right);
    case 'not-contains':
      return !containsOp(left, right);
    case 'gt':
      return toNum(left) > toNum(right);
    case 'lt':
      return toNum(left) < toNum(right);
    case 'gte':
      return toNum(left) >= toNum(right);
    case 'lte':
      return toNum(left) <= toNum(right);
    case 'in': {
      const arr = Array.isArray(right) ? right : typeof right === 'string' ? right.split(',').map((s) => s.trim()) : [];
      return arr.some((v) => looseEq(left, v));
    }
    case 'exists': {
      // if value === false, require absence; otherwise require presence.
      const present = left !== undefined && left !== null && left !== '';
      return right === false ? !present : present;
    }
    default:
      return false;
  }
}

function getFieldValue(entity: Record<string, unknown>, field: string): unknown {
  if (!field) return undefined;
  if (!field.includes('.')) return entity[field];
  const parts = field.split('.');
  let cur: unknown = entity;
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  // Numeric comparison when both are numeric-ish.
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && (typeof a === 'number' || typeof b === 'number')) {
    return na === nb;
  }
  return String(a) === String(b);
}

function containsOp(left: unknown, right: unknown): boolean {
  if (left === null || left === undefined) return false;
  if (Array.isArray(left)) {
    return left.some((v) => looseEq(v, right));
  }
  if (typeof left === 'string') {
    return left.toLowerCase().includes(String(right ?? '').toLowerCase());
  }
  if (typeof left === 'object') {
    return Object.values(left as Record<string, unknown>).some((v) => looseEq(v, right));
  }
  return false;
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  if (v instanceof Date) return v.getTime();
  return Number.NaN;
}
