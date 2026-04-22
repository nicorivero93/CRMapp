import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-leads-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getRawSqlite } = await import('../db/client.js');

let app: FastifyInstance;
let ownerCookie: string;

function cookieFromResponse(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const val = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
  return val ? val.split(';')[0]! : '';
}

async function signupOwner(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup-owner',
    payload: { email: 'owner@test.com', password: 'hunter2222', name: 'Owner' },
  });
  return cookieFromResponse(res);
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
  sql.exec('DELETE FROM lead_events; DELETE FROM leads; DELETE FROM import_batches; DELETE FROM sessions; DELETE FROM users;');
  ownerCookie = await signupOwner();
});

describe('POST /api/leads/paste', () => {
  it('imports leads from pasted text, dedups in-batch and against DB', async () => {
    const r1 = await app.inject({
      method: 'POST',
      url: '/api/leads/paste',
      headers: { cookie: ownerCookie },
      payload: { text: 'Juan 11 2345 6789\nAna +54 911 8765 4321\nsin telefono here' },
    });
    expect(r1.statusCode).toBe(201);
    const b1 = r1.json();
    expect(b1.imported).toBe(2);
    expect(b1.errors).toBe(1);

    const r2 = await app.inject({
      method: 'POST',
      url: '/api/leads/paste',
      headers: { cookie: ownerCookie },
      payload: { text: 'Juan 11 2345 6789\nMaria 11 9999 0000' },
    });
    const b2 = r2.json();
    expect(b2.imported).toBe(1);
    expect(b2.deduped).toBe(1);
  });
});

describe('GET /api/leads', () => {
  it('lists with filters', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/leads/paste',
      headers: { cookie: ownerCookie },
      payload: { text: 'A 11 1111 1111\nB 11 2222 2222\nC 11 3333 3333', source: 'manual' },
    });
    const all = await app.inject({ method: 'GET', url: '/api/leads', headers: { cookie: ownerCookie } });
    expect(all.json().total).toBe(3);

    const byStatus = await app.inject({
      method: 'GET',
      url: '/api/leads?status=new',
      headers: { cookie: ownerCookie },
    });
    expect(byStatus.json().total).toBe(3);

    const bySource = await app.inject({
      method: 'GET',
      url: '/api/leads?source=manual',
      headers: { cookie: ownerCookie },
    });
    expect(bySource.json().total).toBe(3);

    const search = await app.inject({
      method: 'GET',
      url: '/api/leads?q=A',
      headers: { cookie: ownerCookie },
    });
    expect(search.json().leads.length).toBe(1);
  });
});

describe('POST /api/leads/:id/events + GET /api/leads/:id', () => {
  it('adds note event and returns timeline', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie: ownerCookie },
      payload: { name: 'Test', phone: '11 2345 6789', source: 'manual' },
    });
    expect(created.statusCode).toBe(201);
    const leadId = created.json().lead.id;

    const evt = await app.inject({
      method: 'POST',
      url: `/api/leads/${leadId}/events`,
      headers: { cookie: ownerCookie },
      payload: { type: 'note-added', meta: { text: 'Probamos llamar a las 10am' } },
    });
    expect(evt.statusCode).toBe(201);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/leads/${leadId}`,
      headers: { cookie: ownerCookie },
    });
    const body = detail.json();
    expect(body.events.length).toBe(2); // imported + note-added
    expect(body.events[0].type).toBe('note-added');
  });
});

describe('POST /api/leads (single)', () => {
  it('creates lead and rejects duplicate phone', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie: ownerCookie },
      payload: { name: 'Ana', phone: '+54 911 2345 6789', source: 'manual' },
    });
    expect(first.statusCode).toBe(201);

    const dup = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie: ownerCookie },
      payload: { name: 'Another', phone: '+54 9 11 2345-6789', source: 'manual' },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('rejects invalid phone', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie: ownerCookie },
      payload: { name: 'X', phone: 'abc', source: 'manual' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /api/leads/:id', () => {
  it('updates status and logs status-changed event', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie: ownerCookie },
      payload: { name: 'X', phone: '11 1234 5678', source: 'manual' },
    });
    const id = created.json().lead.id;

    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/leads/${id}`,
      headers: { cookie: ownerCookie },
      payload: { status: 'contacted' },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().lead.status).toBe('contacted');

    const detail = await app.inject({
      method: 'GET',
      url: `/api/leads/${id}`,
      headers: { cookie: ownerCookie },
    });
    const events = detail.json().events;
    expect(events.some((e: any) => e.type === 'status-changed')).toBe(true);
  });
});
