import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-recycle-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getRawSqlite } = await import('../db/client.js');
const { runRecyclingCycle } = await import('./recyclingService.js');

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
    payload: { email: 'o@t.com', password: 'hunter2222', name: 'Owner' },
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

beforeEach(async () => {
  const sql = getRawSqlite();
  sql.exec(
    'DELETE FROM lead_events; DELETE FROM leads; DELETE FROM recycling_rules; DELETE FROM sessions; DELETE FROM users; DELETE FROM app_settings;',
  );
  ownerCookie = await signupOwner();
});

describe('POST /api/recycling-rules + run-now', () => {
  it('recycles an old assigned lead via return-to-pool', async () => {
    // Set a manual-only mode so creating leads doesn't auto-assign back
    // (we want to observe the recycled → unassigned state).
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie: ownerCookie },
      payload: { assignmentMode: 'manual-only' },
    });

    // Create a lead manually
    const created = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie: ownerCookie },
      payload: { name: 'Ana', phone: '+5491122334455', source: 'manual' },
    });
    expect(created.statusCode).toBe(201);
    const leadId = created.json().lead.id;

    // Pretend the lead was assigned 20 days ago and never contacted
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    getRawSqlite()
      .prepare(
        `UPDATE leads SET status='assigned', assigned_to=?, assigned_at=?, updated_at=? WHERE id=?`,
      )
      .run(
        (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: ownerCookie } })).json().user.id,
        Math.floor(twentyDaysAgo.getTime() / 1000),
        Math.floor(Date.now() / 1000),
        leadId,
      );

    // Create a recycling rule
    const rule = await app.inject({
      method: 'POST',
      url: '/api/recycling-rules',
      headers: { cookie: ownerCookie },
      payload: {
        name: 'Reciclar asignados sin contacto',
        statusIn: ['assigned'],
        daysSinceLastContact: 7,
        action: 'return-to-pool',
        maxRecyclesPerLead: 3,
      },
    });
    expect(rule.statusCode).toBe(201);

    // Run the cycle
    const r = runRecyclingCycle();
    expect(r.evaluated).toBe(1);
    expect(r.returnedToPool).toBe(1);
    expect(r.recycled).toBe(1);

    // Verify lead state
    const detail = await app.inject({
      method: 'GET',
      url: `/api/leads/${leadId}`,
      headers: { cookie: ownerCookie },
    });
    const body = detail.json();
    expect(body.lead.status).toBe('recycled');
    expect(body.lead.assignedTo).toBeNull();
    expect(body.lead.recycledCount).toBe(1);
    const types = body.events.map((e: any) => e.type);
    expect(types).toContain('recycled');
  });

  it('discards a lead that has hit maxRecyclesPerLead', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie: ownerCookie },
      payload: { assignmentMode: 'manual-only' },
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie: ownerCookie },
      payload: { phone: '+5491122334455', source: 'manual' },
    });
    const leadId = created.json().lead.id;

    const twentyDaysAgo = Math.floor(Date.now() / 1000) - 20 * 24 * 3600;
    const ownerId = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: ownerCookie } })).json().user.id;
    getRawSqlite()
      .prepare(
        `UPDATE leads SET status='assigned', assigned_to=?, assigned_at=?, recycled_count=? WHERE id=?`,
      )
      .run(ownerId, twentyDaysAgo, 3, leadId);

    await app.inject({
      method: 'POST',
      url: '/api/recycling-rules',
      headers: { cookie: ownerCookie },
      payload: {
        name: 'Ciclo',
        statusIn: ['assigned'],
        daysSinceLastContact: 7,
        action: 'return-to-pool',
        maxRecyclesPerLead: 3,
      },
    });

    const r = runRecyclingCycle();
    expect(r.discarded).toBe(1);
    expect(r.recycled).toBe(0);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/leads/${leadId}`,
      headers: { cookie: ownerCookie },
    });
    expect(detail.json().lead.status).toBe('discarded');
  });
});

describe('GET /api/recycling/preview + /run-now endpoint', () => {
  it('returns candidates + the endpoint processes them', async () => {
    await app.inject({
      method: 'PATCH',
      url: '/api/settings',
      headers: { cookie: ownerCookie },
      payload: { assignmentMode: 'manual-only' },
    });

    const ownerId = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: ownerCookie } })).json().user.id;
    for (let i = 0; i < 3; i++) {
      const c = await app.inject({
        method: 'POST',
        url: '/api/leads',
        headers: { cookie: ownerCookie },
        payload: { phone: `+549112200000${i}`, source: 'manual' },
      });
      const leadId = c.json().lead.id;
      const tenDaysAgo = Math.floor(Date.now() / 1000) - 10 * 24 * 3600;
      getRawSqlite()
        .prepare(`UPDATE leads SET status='assigned', assigned_to=?, assigned_at=? WHERE id=?`)
        .run(ownerId, tenDaysAgo, leadId);
    }

    await app.inject({
      method: 'POST',
      url: '/api/recycling-rules',
      headers: { cookie: ownerCookie },
      payload: {
        name: 'Regla',
        statusIn: ['assigned'],
        daysSinceLastContact: 7,
        action: 'return-to-pool',
      },
    });

    const preview = await app.inject({
      method: 'GET',
      url: '/api/recycling/preview',
      headers: { cookie: ownerCookie },
    });
    expect(preview.json().candidates).toHaveLength(3);

    const runRes = await app.inject({
      method: 'POST',
      url: '/api/recycling/run-now',
      headers: { cookie: ownerCookie },
    });
    expect(runRes.statusCode).toBe(200);
    expect(runRes.json().report.recycled).toBe(3);
  });
});

describe('GET /api/analytics/sources', () => {
  it('aggregates leads by source + status', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/leads/paste',
      headers: { cookie: ownerCookie },
      payload: {
        text: 'A +5491111111001\nB +5491111111002\nC +5491111111003',
        source: 'instagram',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/leads/paste',
      headers: { cookie: ownerCookie },
      payload: {
        text: 'D +5491111111011\nE +5491111111012',
        source: 'facebook',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/analytics/sources',
      headers: { cookie: ownerCookie },
    });
    expect(res.statusCode).toBe(200);
    const report = res.json().report;
    expect(report.totals.total).toBe(5);
    expect(report.rows).toHaveLength(2);
    const instagram = report.rows.find((r: any) => r.source === 'instagram');
    expect(instagram.total).toBe(3);
  });
});
