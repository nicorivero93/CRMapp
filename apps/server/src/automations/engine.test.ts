import { describe, expect, it } from 'vitest';
import { evaluateRule, type HydratedRule } from './engine.js';

function mkRule(overrides: Partial<HydratedRule> = {}): HydratedRule {
  return {
    id: overrides.id ?? 'r1',
    name: overrides.name ?? 'Test',
    enabled: overrides.enabled ?? true,
    trigger: overrides.trigger ?? { type: 'lead.created', params: {} },
    conditions: overrides.conditions ?? [],
    actions:
      overrides.actions ??
      ([{ type: 'add-tag', params: { tag: 'hot' } }] as HydratedRule['actions']),
  };
}

describe('evaluateRule — trigger matching', () => {
  it('returns matched:true for a rule with no conditions when trigger matches', () => {
    const r = evaluateRule({
      rule: mkRule(),
      ctx: { triggerType: 'lead.created', triggerParams: {}, entity: { id: 'l1' } },
    });
    expect(r.matched).toBe(true);
    expect(r.ranConditions).toBe(false);
    expect(r.wouldExecute).toHaveLength(1);
  });

  it('skips disabled rules', () => {
    const r = evaluateRule({
      rule: mkRule({ enabled: false }),
      ctx: { triggerType: 'lead.created', triggerParams: {}, entity: {} },
    });
    expect(r.matched).toBe(false);
    expect(r.reason).toBe('rule-disabled');
  });

  it('trigger type mismatch → not matched', () => {
    const r = evaluateRule({
      rule: mkRule({ trigger: { type: 'deal.stage-changed', params: {} } }),
      ctx: { triggerType: 'lead.created', triggerParams: {}, entity: {} },
    });
    expect(r.matched).toBe(false);
    expect(r.reason).toContain('trigger-mismatch');
  });

  it('trigger params filter — rule requires from=new, ctx has from=contacted → skip', () => {
    const r = evaluateRule({
      rule: mkRule({
        trigger: { type: 'lead.status-changed', params: { from: 'new', to: 'assigned' } },
      }),
      ctx: {
        triggerType: 'lead.status-changed',
        triggerParams: { from: 'contacted', to: 'assigned' },
        entity: {},
      },
    });
    expect(r.matched).toBe(false);
    expect(r.reason).toContain('trigger-param-mismatch');
  });

  it('trigger params filter — rule empty params accepts any ctx params', () => {
    const r = evaluateRule({
      rule: mkRule({
        trigger: { type: 'lead.status-changed', params: {} },
      }),
      ctx: {
        triggerType: 'lead.status-changed',
        triggerParams: { from: 'new', to: 'assigned' },
        entity: {},
      },
    });
    expect(r.matched).toBe(true);
  });

  it('trigger params filter — exact transition match', () => {
    const r = evaluateRule({
      rule: mkRule({
        trigger: { type: 'lead.status-changed', params: { from: 'new', to: 'assigned' } },
      }),
      ctx: {
        triggerType: 'lead.status-changed',
        triggerParams: { from: 'new', to: 'assigned' },
        entity: {},
      },
    });
    expect(r.matched).toBe(true);
  });
});

describe('evaluateRule — condition operators', () => {
  it('eq / neq on scalars', () => {
    const entity = { source: 'instagram', responseCount: 3 };
    expect(
      evaluateRule({
        rule: mkRule({ conditions: [{ field: 'source', op: 'eq', value: 'instagram' }] }),
        ctx: { triggerType: 'lead.created', triggerParams: {}, entity },
      }).matched,
    ).toBe(true);
    expect(
      evaluateRule({
        rule: mkRule({ conditions: [{ field: 'source', op: 'neq', value: 'instagram' }] }),
        ctx: { triggerType: 'lead.created', triggerParams: {}, entity },
      }).matched,
    ).toBe(false);
  });

  it('contains on strings (case-insensitive) and arrays', () => {
    expect(
      evaluateRule({
        rule: mkRule({ conditions: [{ field: 'notes', op: 'contains', value: 'URGENT' }] }),
        ctx: {
          triggerType: 'lead.created',
          triggerParams: {},
          entity: { notes: 'this is urgent stuff' },
        },
      }).matched,
    ).toBe(true);

    expect(
      evaluateRule({
        rule: mkRule({ conditions: [{ field: 'tags', op: 'contains', value: 'vip' }] }),
        ctx: {
          triggerType: 'lead.created',
          triggerParams: {},
          entity: { tags: ['hot', 'vip'] },
        },
      }).matched,
    ).toBe(true);
  });

  it('gt / lt / gte / lte coerce numbers', () => {
    const entity = { responseCount: 5 };
    expect(
      evaluateRule({
        rule: mkRule({ conditions: [{ field: 'responseCount', op: 'gt', value: 3 }] }),
        ctx: { triggerType: 'lead.created', triggerParams: {}, entity },
      }).matched,
    ).toBe(true);
    expect(
      evaluateRule({
        rule: mkRule({ conditions: [{ field: 'responseCount', op: 'lt', value: 3 }] }),
        ctx: { triggerType: 'lead.created', triggerParams: {}, entity },
      }).matched,
    ).toBe(false);
    expect(
      evaluateRule({
        rule: mkRule({ conditions: [{ field: 'responseCount', op: 'gte', value: 5 }] }),
        ctx: { triggerType: 'lead.created', triggerParams: {}, entity },
      }).matched,
    ).toBe(true);
  });

  it('in operator accepts array or comma string', () => {
    const entity = { source: 'instagram' };
    expect(
      evaluateRule({
        rule: mkRule({
          conditions: [{ field: 'source', op: 'in', value: ['instagram', 'facebook'] }],
        }),
        ctx: { triggerType: 'lead.created', triggerParams: {}, entity },
      }).matched,
    ).toBe(true);

    expect(
      evaluateRule({
        rule: mkRule({
          conditions: [{ field: 'source', op: 'in', value: 'facebook, tiktok' }],
        }),
        ctx: { triggerType: 'lead.created', triggerParams: {}, entity },
      }).matched,
    ).toBe(false);
  });

  it('exists — presence and absence', () => {
    expect(
      evaluateRule({
        rule: mkRule({ conditions: [{ field: 'name', op: 'exists' }] }),
        ctx: {
          triggerType: 'lead.created',
          triggerParams: {},
          entity: { name: 'Ana' },
        },
      }).matched,
    ).toBe(true);

    expect(
      evaluateRule({
        rule: mkRule({ conditions: [{ field: 'name', op: 'exists' }] }),
        ctx: { triggerType: 'lead.created', triggerParams: {}, entity: { name: null } },
      }).matched,
    ).toBe(false);

    expect(
      evaluateRule({
        rule: mkRule({ conditions: [{ field: 'name', op: 'exists', value: false }] }),
        ctx: { triggerType: 'lead.created', triggerParams: {}, entity: {} },
      }).matched,
    ).toBe(true);
  });

  it('ANDs multiple conditions — all must pass', () => {
    const entity = { source: 'instagram', responseCount: 5 };
    const pass = evaluateRule({
      rule: mkRule({
        conditions: [
          { field: 'source', op: 'eq', value: 'instagram' },
          { field: 'responseCount', op: 'gte', value: 3 },
        ],
      }),
      ctx: { triggerType: 'lead.created', triggerParams: {}, entity },
    });
    expect(pass.matched).toBe(true);

    const fail = evaluateRule({
      rule: mkRule({
        conditions: [
          { field: 'source', op: 'eq', value: 'instagram' },
          { field: 'responseCount', op: 'gte', value: 10 },
        ],
      }),
      ctx: { triggerType: 'lead.created', triggerParams: {}, entity },
    });
    expect(fail.matched).toBe(false);
    expect(fail.ranConditions).toBe(true);
    expect(fail.reason).toContain('condition-failed');
  });

  it('nested field access via dot notation', () => {
    const entity = { sourceMeta: { adId: 'abc-123' } };
    expect(
      evaluateRule({
        rule: mkRule({
          conditions: [{ field: 'sourceMeta.adId', op: 'eq', value: 'abc-123' }],
        }),
        ctx: { triggerType: 'lead.created', triggerParams: {}, entity },
      }).matched,
    ).toBe(true);
  });
});
