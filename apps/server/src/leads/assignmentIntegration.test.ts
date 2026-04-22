import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-assign-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getRawSqlite } = await import('../db/client.js');

let app: FastifyInstance;
let ownerCookie: string;

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const v = Array.isArray(raw) ? raw[0] : (raw as string | undefined);
  return v ? v.split(';')[0]! : '';
}

async function signupOwner(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/signup-owner',
    payload: { email: 'owner@test.com', password: 'hunter2222', name: 'Owner' },
  });
  return cookieFrom(res);
}

async function createSales(
  cookie: string,
  email: string,
  name: string,
  dailyLeadTarget: number,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/users',
    headers: { cookie },
    payload: { email, password: 'hunter2222', name, dailyLeadTarget },
  });
  expect(res.statusCode).toBe(201);
  return res.json().user.id;
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
    'DELETE FROM lead_events; DELETE FROM leads; DELETE FROM import_batches; DELETE FROM sessions; DELETE FROM users; DELETE FROM app_settings;',
  );
  ownerCookie = await signupOwner();
  // owner's default target is 30 — bump to 0 so they don't hoard leads in these tests
  await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: { cookie: ownerCookie },
  });
});

describe('end-to-end assignment', () => {
  it('importing 100 leads splits 50/30/15 across 3 sales users with targets 50/30/15', async () => {
    // Zero the owner's capacity so only sales users receive leads
    const meRes = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: ownerCookie } });
    const ownerId = meRes.json().user.id;
    await app.inject({
      method: 'PATCH',
      url: `/api/users/${ownerId}`,
      headers: { cookie: ownerCookie },
      payload: { dailyLeadTarget: 0 },
    });

    await createSales(ownerCookie, 's1@test.com', 'S1', 50);
    await createSales(ownerCookie, 's2@test.com', 'S2', 30);
    await createSales(ownerCookie, 's3@test.com', 'S3', 15);

    // Build a 100-row paste with unique Argentine mobiles (uses +5411 prefix-ish fallback)
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      const suffix = String(10_000_000 + i).padStart(8, '0');
      lines.push(`Lead ${i} +5491123${suffix}`);
    }

    const pasteRes = await app.inject({
      method: 'POST',
      url: '/api/leads/paste',
      headers: { cookie: ownerCookie },
      payload: { text: lines.join('\n') },
    });
    expect(pasteRes.statusCode).toBe(201);
    const report = pasteRes.json();
    expect(report.imported).toBe(100);
    expect(report.assigned).toBe(95);
    expect(report.unassigned).toBe(5);

    // Each user sees their own pile
    async function countMine(cookie: string): Promise<number> {
      const r = await app.inject({
        method: 'GET',
        url: '/api/leads?assignedTo=me&limit=200',
        headers: { cookie },
      });
      return r.json().total;
    }

    const login = async (email: string): Promise<string> => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email, password: 'hunter2222' },
      });
      return cookieFrom(r);
    };

    expect(await countMine(await login('s1@test.com'))).toBe(50);
    expect(await countMine(await login('s2@test.com'))).toBe(30);
    expect(await countMine(await login('s3@test.com'))).toBe(15);
  });

  it('manual-only mode skips auto-assignment, POST /assign does it later', async () => {
    const meRes = await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: ownerCookie } });
    const ownerId = meRes.json().user.id;
    await app.inject({
      method: 'PATCH',
      url: `/api/users/${ownerId}`,
      headers: { cookie: ownerCookie },
      payload: { dailyLeadTarget: 0 },
    });
    await createSales(ownerCookie, 's1@test.com', 'S1', 50);

    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie: ownerCookie },
      payload: { assignmentMode: 'manual-only' },
    });

    const pasteRes = await app.inject({
      method: 'POST',
      url: '/api/leads/paste',
      headers: { cookie: ownerCookie },
      payload: { text: 'A +5491111111001\nB +5491111111002\nC +5491111111003' },
    });
    expect(pasteRes.json().assigned).toBe(0);
    expect(pasteRes.json().unassigned).toBe(3);

    const beforeList = await app.inject({
      method: 'GET',
      url: '/api/leads?assignedTo=&limit=10',
      headers: { cookie: ownerCookie },
    });
    // Everything still status=new, assignedTo=null
    for (const lead of beforeList.json().leads) {
      expect(lead.assignedTo).toBeNull();
      expect(lead.status).toBe('new');
    }

    const assignRes = await app.inject({
      method: 'POST',
      url: '/api/leads/assign',
      headers: { cookie: ownerCookie },
      payload: { allUnassigned: true },
    });
    expect(assignRes.statusCode).toBe(200);
    const r = assignRes.json();
    expect(r.total).toBe(3);
    expect(r.assigned.length).toBe(3);
  });
});
