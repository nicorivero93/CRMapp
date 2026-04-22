import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-lines-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getRawSqlite } = await import('../db/client.js');

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
  sql.exec(
    'DELETE FROM whatsapp_lines; DELETE FROM sessions; DELETE FROM users; DELETE FROM app_settings;',
  );
});

describe('lines CRUD + activate', () => {
  it('create/list/patch/delete flow', async () => {
    const cookie = await signupOwner();
    const c = await app.inject({
      method: 'POST',
      url: '/api/lines',
      headers: { cookie },
      payload: { phone: '+5491111000001', label: 'Chip 1' },
    });
    expect(c.statusCode).toBe(201);
    const id = c.json().line.id;

    const l = await app.inject({ method: 'GET', url: '/api/lines', headers: { cookie } });
    expect(l.json().lines).toHaveLength(1);

    const p = await app.inject({
      method: 'PATCH',
      url: `/api/lines/${id}`,
      headers: { cookie },
      payload: { label: 'Principal', dailyCapMessages: 300 },
    });
    expect(p.json().line.label).toBe('Principal');
    expect(p.json().line.dailyCapMessages).toBe(300);

    const d = await app.inject({
      method: 'DELETE',
      url: `/api/lines/${id}`,
      headers: { cookie },
    });
    expect(d.statusCode).toBe(204);

    const after = await app.inject({ method: 'GET', url: '/api/lines', headers: { cookie } });
    expect(after.json().lines).toHaveLength(0);
  });

  it('activate makes one active and deactivates siblings; syncs users.activeLineId', async () => {
    const cookie = await signupOwner();
    const a = await app.inject({
      method: 'POST',
      url: '/api/lines',
      headers: { cookie },
      payload: { phone: '+5491111000001' },
    });
    const b = await app.inject({
      method: 'POST',
      url: '/api/lines',
      headers: { cookie },
      payload: { phone: '+5491111000002' },
    });
    const aId = a.json().line.id;
    const bId = b.json().line.id;

    await app.inject({ method: 'POST', url: `/api/lines/${aId}/activate`, headers: { cookie } });
    let list = await app.inject({ method: 'GET', url: '/api/lines', headers: { cookie } });
    expect(list.json().lines.find((l: any) => l.id === aId).isActive).toBe(true);
    expect(list.json().lines.find((l: any) => l.id === bId).isActive).toBe(false);

    let me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json().user.activeLineId).toBe(aId);

    await app.inject({ method: 'POST', url: `/api/lines/${bId}/activate`, headers: { cookie } });
    list = await app.inject({ method: 'GET', url: '/api/lines', headers: { cookie } });
    expect(list.json().lines.find((l: any) => l.id === aId).isActive).toBe(false);
    expect(list.json().lines.find((l: any) => l.id === bId).isActive).toBe(true);

    me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(me.json().user.activeLineId).toBe(bId);
  });

  it("a user cannot touch another user's lines", async () => {
    const ownerCookie = await signupOwner();
    await createSales(ownerCookie, 'v@t.com', 'Vendedora');
    const salesCookie = await login('v@t.com');

    const mine = await app.inject({
      method: 'POST',
      url: '/api/lines',
      headers: { cookie: salesCookie },
      payload: { phone: '+5491111000001' },
    });
    const salesLineId = mine.json().line.id;

    const ownerSees = await app.inject({
      method: 'GET',
      url: '/api/lines',
      headers: { cookie: ownerCookie },
    });
    expect(ownerSees.json().lines).toHaveLength(0);

    const hijack = await app.inject({
      method: 'PATCH',
      url: `/api/lines/${salesLineId}`,
      headers: { cookie: ownerCookie },
      payload: { label: 'Robada' },
    });
    expect(hijack.statusCode).toBe(403);
  });
});
