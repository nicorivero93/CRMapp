import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-deals-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getRawSqlite } = await import('../db/client.js');
const { seedDefaultStages } = await import('../stages/routes.js');

let app: FastifyInstance;

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

async function createLead(cookie: string, phone = '+5491111222333', name = 'Juan'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/leads',
    headers: { cookie },
    payload: { phone, name, source: 'manual' },
  });
  return res.json().lead.id;
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

beforeEach(() => {
  const sql = getRawSqlite();
  sql.exec(
    'DELETE FROM lead_events; DELETE FROM deals; DELETE FROM contacts; DELETE FROM leads; DELETE FROM stages; DELETE FROM sessions; DELETE FROM users; DELETE FROM app_settings;',
  );
});

describe('deals CRUD + move', () => {
  it('create/list/patch/delete flow', async () => {
    const cookie = await signupOwner();
    const [s0, s1] = seedDefaultStages('owner');

    const c = await app.inject({
      method: 'POST',
      url: '/api/deals',
      headers: { cookie },
      payload: { title: 'Deal uno', value: 50000, currency: 'ARS', stageId: s0!.id },
    });
    expect(c.statusCode).toBe(201);
    const id = c.json().deal.id;

    const list = await app.inject({ method: 'GET', url: '/api/deals', headers: { cookie } });
    expect(list.json().deals).toHaveLength(1);
    expect(list.json().total).toBe(1);

    const get = await app.inject({ method: 'GET', url: `/api/deals/${id}`, headers: { cookie } });
    expect(get.json().deal.title).toBe('Deal uno');
    expect(get.json().stage.id).toBe(s0!.id);

    const p = await app.inject({
      method: 'PATCH',
      url: `/api/deals/${id}`,
      headers: { cookie },
      payload: { title: 'Deal editado', value: 75000, stageId: s1!.id },
    });
    expect(p.json().deal.title).toBe('Deal editado');
    expect(p.json().deal.value).toBe(75000);
    expect(p.json().deal.stageId).toBe(s1!.id);

    const d = await app.inject({
      method: 'DELETE',
      url: `/api/deals/${id}`,
      headers: { cookie },
    });
    expect(d.statusCode).toBe(204);

    const after = await app.inject({ method: 'GET', url: '/api/deals', headers: { cookie } });
    expect(after.json().deals).toHaveLength(0);
  });

  it('create with invalid stageId rejects', async () => {
    const cookie = await signupOwner();
    const c = await app.inject({
      method: 'POST',
      url: '/api/deals',
      headers: { cookie },
      payload: { title: 'X', value: 0, currency: 'ARS', stageId: 'nope' },
    });
    expect(c.statusCode).toBe(400);
  });

  it('move to closedWon stage sets closedAt; moving out does NOT reset it', async () => {
    const cookie = await signupOwner();
    const stagesArr = seedDefaultStages('owner');
    const sOpen = stagesArr[0]!;
    const sWon = stagesArr[3]!;
    expect(sWon.isClosedWon).toBe(true);

    const c = await app.inject({
      method: 'POST',
      url: '/api/deals',
      headers: { cookie },
      payload: { title: 'Deal', value: 1000, currency: 'ARS', stageId: sOpen.id },
    });
    const id = c.json().deal.id;
    expect(c.json().deal.closedAt).toBeNull();

    const m1 = await app.inject({
      method: 'POST',
      url: `/api/deals/${id}/move`,
      headers: { cookie },
      payload: { stageId: sWon.id },
    });
    expect(m1.statusCode).toBe(200);
    expect(m1.json().deal.stageId).toBe(sWon.id);
    expect(m1.json().deal.closedAt).not.toBeNull();
    const firstClosedAt = m1.json().deal.closedAt;

    // Move back to open stage — closedAt should persist
    const m2 = await app.inject({
      method: 'POST',
      url: `/api/deals/${id}/move`,
      headers: { cookie },
      payload: { stageId: sOpen.id },
    });
    expect(m2.json().deal.stageId).toBe(sOpen.id);
    expect(m2.json().deal.closedAt).toBe(firstClosedAt);
  });

  it('list filters by stageId and ownerId', async () => {
    const cookie = await signupOwner();
    const [s0, s1] = seedDefaultStages('owner');
    await app.inject({
      method: 'POST',
      url: '/api/deals',
      headers: { cookie },
      payload: { title: 'a', stageId: s0!.id, value: 0, currency: 'ARS' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/deals',
      headers: { cookie },
      payload: { title: 'b', stageId: s1!.id, value: 0, currency: 'ARS' },
    });
    const q = await app.inject({
      method: 'GET',
      url: `/api/deals?stageId=${s0!.id}`,
      headers: { cookie },
    });
    expect(q.json().deals).toHaveLength(1);
    expect(q.json().deals[0].title).toBe('a');
  });
});

describe('convert lead -> deal', () => {
  it('creates contact implicitly when createContact=true and sets convertedContactId + convertedDealId', async () => {
    const cookie = await signupOwner();
    const [s0] = seedDefaultStages('owner');
    const leadId = await createLead(cookie);

    const c = await app.inject({
      method: 'POST',
      url: `/api/deals/from-lead/${leadId}`,
      headers: { cookie },
      payload: {
        title: 'Desde lead',
        value: 20000,
        currency: 'ARS',
        stageId: s0!.id,
        createContact: true,
      },
    });
    expect(c.statusCode).toBe(201);
    expect(c.json().deal.leadId).toBe(leadId);
    expect(c.json().deal.contactId).toBeTruthy();
    expect(c.json().lead.status).toBe('converted');
    expect(c.json().lead.convertedDealId).toBe(c.json().deal.id);
    expect(c.json().lead.convertedContactId).toBeTruthy();

    // Lead DTO confirms the same via GET
    const leadGet = await app.inject({
      method: 'GET',
      url: `/api/leads/${leadId}`,
      headers: { cookie },
    });
    expect(leadGet.json().lead.status).toBe('converted');
    expect(leadGet.json().lead.convertedDealId).toBe(c.json().deal.id);
  });

  it('does NOT create contact when createContact=false', async () => {
    const cookie = await signupOwner();
    const [s0] = seedDefaultStages('owner');
    const leadId = await createLead(cookie);

    const c = await app.inject({
      method: 'POST',
      url: `/api/deals/from-lead/${leadId}`,
      headers: { cookie },
      payload: {
        title: 'Sin contacto',
        value: 0,
        currency: 'ARS',
        stageId: s0!.id,
        createContact: false,
      },
    });
    expect(c.statusCode).toBe(201);
    expect(c.json().deal.contactId).toBeNull();
    expect(c.json().lead.convertedContactId).toBeNull();
    expect(c.json().lead.convertedDealId).toBe(c.json().deal.id);
  });
});
