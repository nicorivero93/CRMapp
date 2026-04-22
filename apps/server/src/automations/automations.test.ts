import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-automations-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getRawSqlite } = await import('../db/client.js');
// registerAutomationRoutes now wired in app.ts; no manual registration needed.
const { emit } = await import('./dispatcher.js');

let app: FastifyInstance;
let ownerCookie: string;
let salesCookie: string;

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const v = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
  return v ? v.split(';')[0]! : '';
}

async function signupOwner(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup-owner',
    payload: { email: 'o@t.com', password: 'hunter2222', name: 'Owner' },
  });
  return cookieFrom(res);
}

async function createSales(owner: string): Promise<string> {
  await app.inject({
    method: 'POST',
    url: '/api/users',
    headers: { cookie: owner },
    payload: { email: 's@t.com', password: 'hunter2222', name: 'Sales' },
  });
  const login = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: 's@t.com', password: 'hunter2222' },
  });
  return cookieFrom(login);
}

beforeAll(async () => {
  runMigrations();
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  const sql = getRawSqlite();
  sql.exec(
    'DELETE FROM automation_rules; DELETE FROM lead_events; DELETE FROM leads; DELETE FROM sessions; DELETE FROM users; DELETE FROM app_settings;',
  );
  ownerCookie = await signupOwner();
  salesCookie = await createSales(ownerCookie);
});

describe('automations CRUD', () => {
  const baseRule = {
    name: 'IG → tag hot',
    enabled: true,
    trigger: { type: 'lead.created', params: { source: 'instagram' } },
    conditions: [],
    actions: [{ type: 'add-tag', params: { tag: 'ig' } }],
  };

  it('owner creates, lists, patches and deletes a rule', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/automations',
      headers: { cookie: ownerCookie },
      payload: baseRule,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().automation.id;

    const list = await app.inject({
      method: 'GET',
      url: '/api/automations',
      headers: { cookie: ownerCookie },
    });
    expect(list.json().automations).toHaveLength(1);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/automations/${id}`,
      headers: { cookie: ownerCookie },
      payload: { enabled: false },
    });
    expect(patched.json().automation.enabled).toBe(false);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/automations/${id}`,
      headers: { cookie: ownerCookie },
    });
    expect(deleted.statusCode).toBe(204);

    const finalList = await app.inject({
      method: 'GET',
      url: '/api/automations',
      headers: { cookie: ownerCookie },
    });
    expect(finalList.json().automations).toHaveLength(0);
  });

  it('sales user receives 403 on every endpoint', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/automations',
      headers: { cookie: salesCookie },
    });
    expect(list.statusCode).toBe(403);

    const post = await app.inject({
      method: 'POST',
      url: '/api/automations',
      headers: { cookie: salesCookie },
      payload: baseRule,
    });
    expect(post.statusCode).toBe(403);
  });
});

describe('automations /test endpoint', () => {
  it('returns a preview without side effects', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/automations',
      headers: { cookie: ownerCookie },
      payload: {
        name: 'tag IG',
        enabled: true,
        trigger: { type: 'lead.created', params: { source: 'instagram' } },
        conditions: [{ field: 'source', op: 'eq', value: 'instagram' }],
        actions: [{ type: 'add-tag', params: { tag: 'ig' } }],
      },
    });
    const id = created.json().automation.id;

    const preview = await app.inject({
      method: 'POST',
      url: `/api/automations/${id}/test`,
      headers: { cookie: ownerCookie },
      payload: {
        entity: { id: 'fake-lead', source: 'instagram', tags: [] },
        triggerParams: { source: 'instagram' },
      },
    });
    expect(preview.statusCode).toBe(200);
    const r = preview.json().result;
    expect(r.matched).toBe(true);
    expect(r.wouldExecute).toHaveLength(1);
    expect(r.wouldExecute[0].type).toBe('add-tag');

    // Confirm no runCount bump and no DB side effects on the (non-existent) lead.
    const stat = await app.inject({
      method: 'GET',
      url: '/api/automations',
      headers: { cookie: ownerCookie },
    });
    expect(stat.json().automations[0].runCount).toBe(0);
    expect(stat.json().automations[0].lastRunAt).toBeNull();
  });
});

describe('dispatcher.emit integration', () => {
  it('creating an IG lead + emit → lead gets the tag and runCount increments', async () => {
    // Manual-only so a new lead stays as-is and we can observe the tag change.
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie: ownerCookie },
      payload: { assignmentMode: 'manual-only' },
    });

    await app.inject({
      method: 'POST',
      url: '/api/automations',
      headers: { cookie: ownerCookie },
      payload: {
        name: 'tag IG',
        enabled: true,
        trigger: { type: 'lead.created', params: { source: 'instagram' } },
        conditions: [],
        actions: [{ type: 'add-tag', params: { tag: 'ig' } }],
      },
    });

    // emit('lead.created') is now wired into POST /api/leads via the
    // dispatcher in leads/routes.ts, so just creating the lead triggers
    // the rule.
    const leadRes = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie: ownerCookie },
      payload: { name: 'Ana', phone: '+5491155556666', source: 'instagram' },
    });
    expect(leadRes.statusCode).toBe(201);
    const lead = leadRes.json().lead;

    const detail = await app.inject({
      method: 'GET',
      url: `/api/leads/${lead.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(detail.json().lead.tags).toContain('ig');

    const rules = await app.inject({
      method: 'GET',
      url: '/api/automations',
      headers: { cookie: ownerCookie },
    });
    const rule = rules.json().automations[0];
    expect(rule.runCount).toBe(1);
    expect(rule.lastRunAt).not.toBeNull();
  });

  it('emit does nothing when no enabled rule matches', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/automations',
      headers: { cookie: ownerCookie },
      payload: {
        name: 'disabled',
        enabled: false,
        trigger: { type: 'lead.created', params: {} },
        conditions: [],
        actions: [{ type: 'add-tag', params: { tag: 'x' } }],
      },
    });
    const report = await emit('lead.created', {}, { id: 'ghost' }, { entityKind: 'lead' });
    expect(report.triggered).toBe(0);
    expect(report.executed).toBe(0);
  });
});
