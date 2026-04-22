import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-events-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getRawSqlite } = await import('../db/client.js');
// registerEventRoutes wired in app.ts now.

let app: FastifyInstance;

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const v = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
  return v ? v.split(';')[0]! : '';
}

async function signupOwner(email = 'o@t.com'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup-owner',
    payload: { email, password: 'hunter2222', name: 'Owner' },
  });
  return cookieFrom(res);
}

async function createSales(cookie: string, email: string, name: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/users',
    headers: { cookie },
    payload: { email, password: 'hunter2222', name },
  });
  return res.json().user.id;
}

async function login(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'hunter2222' },
  });
  return cookieFrom(res);
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
  sql.exec('DELETE FROM events; DELETE FROM sessions; DELETE FROM users; DELETE FROM app_settings;');
});

function iso(year: number, month: number, day: number, hour = 10, minute = 0): string {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0)).toISOString();
}

describe('events CRUD + range', () => {
  it('create/get/patch/soft-delete flow', async () => {
    const cookie = await signupOwner();
    const c = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie },
      payload: {
        title: 'Call',
        start: iso(2026, 4, 20, 10),
        end: iso(2026, 4, 20, 11),
      },
    });
    expect(c.statusCode).toBe(201);
    const id = c.json().event.id;
    expect(c.json().event.status).toBe('confirmed');
    expect(c.json().event.ownerId).toBeTruthy();

    const g = await app.inject({ method: 'GET', url: `/api/events/${id}`, headers: { cookie } });
    expect(g.statusCode).toBe(200);
    expect(g.json().event.title).toBe('Call');

    const p = await app.inject({
      method: 'PATCH',
      url: `/api/events/${id}`,
      headers: { cookie },
      payload: { title: 'Llamada', description: 'Nota' },
    });
    expect(p.statusCode).toBe(200);
    expect(p.json().event.title).toBe('Llamada');
    expect(p.json().event.description).toBe('Nota');

    const d = await app.inject({
      method: 'DELETE',
      url: `/api/events/${id}`,
      headers: { cookie },
    });
    expect(d.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET',
      url: `/api/events/${id}`,
      headers: { cookie },
    });
    expect(after.json().event.status).toBe('canceled');
  });

  it('rejects create when end <= start', async () => {
    const cookie = await signupOwner();
    const res = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie },
      payload: {
        title: 'Bad',
        start: iso(2026, 4, 20, 12),
        end: iso(2026, 4, 20, 11),
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it('range query returns only intersecting events', async () => {
    const cookie = await signupOwner();
    // Before range.
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie },
      payload: {
        title: 'A',
        start: iso(2026, 4, 10, 8),
        end: iso(2026, 4, 10, 9),
      },
    });
    // Inside range.
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie },
      payload: {
        title: 'B',
        start: iso(2026, 4, 20, 10),
        end: iso(2026, 4, 20, 11),
      },
    });
    // Straddles start of range.
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie },
      payload: {
        title: 'C',
        start: iso(2026, 4, 19, 23),
        end: iso(2026, 4, 20, 1),
      },
    });
    // After range.
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie },
      payload: {
        title: 'D',
        start: iso(2026, 4, 30, 10),
        end: iso(2026, 4, 30, 11),
      },
    });

    const from = iso(2026, 4, 20, 0);
    const to = iso(2026, 4, 21, 0);
    const res = await app.inject({
      method: 'GET',
      url: `/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const titles = res.json().events.map((e: { title: string }) => e.title).sort();
    expect(titles).toEqual(['B', 'C']);
  });

  it('includeCanceled default excludes canceled; true includes them', async () => {
    const cookie = await signupOwner();
    const c = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie },
      payload: {
        title: 'X',
        start: iso(2026, 4, 20, 10),
        end: iso(2026, 4, 20, 11),
      },
    });
    const id = c.json().event.id;
    await app.inject({ method: 'DELETE', url: `/api/events/${id}`, headers: { cookie } });

    const from = iso(2026, 4, 20, 0);
    const to = iso(2026, 4, 21, 0);
    const def = await app.inject({
      method: 'GET',
      url: `/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: { cookie },
    });
    expect(def.json().events).toHaveLength(0);

    const incl = await app.inject({
      method: 'GET',
      url: `/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&includeCanceled=true`,
      headers: { cookie },
    });
    expect(incl.json().events).toHaveLength(1);
    expect(incl.json().events[0].status).toBe('canceled');
  });

  it('filters by ownerId', async () => {
    const ownerCookie = await signupOwner();
    const salesId = await createSales(ownerCookie, 'v@t.com', 'Vendedora');
    const salesCookie = await login('v@t.com');

    // Owner event.
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie: ownerCookie },
      payload: { title: 'Owner evt', start: iso(2026, 4, 20, 10), end: iso(2026, 4, 20, 11) },
    });
    // Sales event.
    await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie: salesCookie },
      payload: { title: 'Sales evt', start: iso(2026, 4, 20, 12), end: iso(2026, 4, 20, 13) },
    });

    const from = iso(2026, 4, 20, 0);
    const to = iso(2026, 4, 21, 0);
    const res = await app.inject({
      method: 'GET',
      url: `/api/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&ownerId=${salesId}`,
      headers: { cookie: ownerCookie },
    });
    expect(res.json().events).toHaveLength(1);
    expect(res.json().events[0].title).toBe('Sales evt');
  });

  it('DELETE soft-deletes (row persists with status=canceled)', async () => {
    const cookie = await signupOwner();
    const c = await app.inject({
      method: 'POST',
      url: '/api/events',
      headers: { cookie },
      payload: { title: 'Kill me', start: iso(2026, 4, 20, 10), end: iso(2026, 4, 20, 11) },
    });
    const id = c.json().event.id;

    const d = await app.inject({
      method: 'DELETE',
      url: `/api/events/${id}`,
      headers: { cookie },
    });
    expect(d.statusCode).toBe(204);

    // DB: row still exists, status=canceled.
    const sql = getRawSqlite();
    const row = sql.prepare('SELECT status FROM events WHERE id = ?').get(id) as
      | { status: string }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.status).toBe('canceled');
  });
});
