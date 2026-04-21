import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-test-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getRawSqlite } = await import('../db/client.js');

let app: FastifyInstance;

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
  sql.exec('DELETE FROM sessions; DELETE FROM users;');
});

function cookieFromResponse(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const val = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
  if (!val) return '';
  return val.split(';')[0]!;
}

describe('auth flow', () => {
  it('signup-owner creates owner and session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup-owner',
      payload: { email: 'nico@test.com', password: 'hunter2222', name: 'Nico' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe('nico@test.com');
    expect(body.user.role).toBe('owner');
    expect(body.user.passwordHash).toBeUndefined();
    expect(cookieFromResponse(res)).toMatch(/^sessionId=/);
  });

  it('signup-owner rejects when owner exists', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup-owner',
      payload: { email: 'a@test.com', password: 'hunter2222', name: 'A' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup-owner',
      payload: { email: 'b@test.com', password: 'hunter2222', name: 'B' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('login returns user + cookie; me returns same user', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup-owner',
      payload: { email: 'nico@test.com', password: 'hunter2222', name: 'Nico' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nico@test.com', password: 'hunter2222' },
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieFromResponse(login);
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('nico@test.com');
  });

  it('login rejects bad password', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup-owner',
      payload: { email: 'nico@test.com', password: 'hunter2222', name: 'Nico' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nico@test.com', password: 'wrongpass' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('me without cookie returns 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('logout invalidates session', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/signup-owner',
      payload: { email: 'nico@test.com', password: 'hunter2222', name: 'Nico' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nico@test.com', password: 'hunter2222' },
    });
    const cookie = cookieFromResponse(login);
    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(204);
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(401);
  });
});

describe('users routes', () => {
  async function signupOwner() {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/signup-owner',
      payload: { email: 'owner@test.com', password: 'hunter2222', name: 'Owner' },
    });
    return cookieFromResponse(res);
  }

  it('owner can create a sales user', async () => {
    const cookie = await signupOwner();
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie },
      payload: { email: 'sales@test.com', password: 'hunter2222', name: 'Vendedora' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.role).toBe('sales');
  });

  it('non-owner cannot create users', async () => {
    const ownerCookie = await signupOwner();
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: ownerCookie },
      payload: { email: 'sales@test.com', password: 'hunter2222', name: 'V' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'sales@test.com', password: 'hunter2222' },
    });
    const salesCookie = cookieFromResponse(login);
    const res = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: salesCookie },
      payload: { email: 'x@test.com', password: 'hunter2222', name: 'X' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('duplicate email on create is 409', async () => {
    const cookie = await signupOwner();
    const dup = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie },
      payload: { email: 'owner@test.com', password: 'hunter2222', name: 'Dup' },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('self-patch allows activeLineId but not role', async () => {
    const ownerCookie = await signupOwner();
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { cookie: ownerCookie },
      payload: { email: 's@test.com', password: 'hunter2222', name: 'S' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 's@test.com', password: 'hunter2222' },
    });
    const salesCookie = cookieFromResponse(login);
    const meRes = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: salesCookie } });
    const salesId = meRes.json().user.id;

    const okPatch = await app.inject({
      method: 'PATCH',
      url: `/api/users/${salesId}`,
      headers: { cookie: salesCookie },
      payload: { activeLineId: 'line-abc' },
    });
    expect(okPatch.statusCode).toBe(200);

    const forbidden = await app.inject({
      method: 'PATCH',
      url: `/api/users/${salesId}`,
      headers: { cookie: salesCookie },
      payload: { role: 'owner' },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('owner cannot delete themselves', async () => {
    const cookie = await signupOwner();
    const me = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    const id = me.json().user.id;
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/users/${id}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('health', () => {
  it('reports ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.db).toBe('ok');
  });
});
