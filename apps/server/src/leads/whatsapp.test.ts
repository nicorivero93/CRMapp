import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-wa-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getRawSqlite } = await import('../db/client.js');
const { runDailyReset } = await import('../scheduler/daily.js');

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
    'DELETE FROM lead_events; DELETE FROM leads; DELETE FROM message_templates; DELETE FROM whatsapp_lines; DELETE FROM sessions; DELETE FROM users; DELETE FROM app_settings;',
  );
});

describe('POST /api/leads/:id/whatsapp', () => {
  it('happy path with template: logs events, updates status, increments line count', async () => {
    const cookie = await signupOwner();

    const line = await app.inject({
      method: 'POST',
      url: '/api/lines',
      headers: { cookie },
      payload: { phone: '+5491111000001', label: 'Principal' },
    });
    const lineId = line.json().line.id;
    await app.inject({ method: 'POST', url: `/api/lines/${lineId}/activate`, headers: { cookie } });

    const tpl = await app.inject({
      method: 'POST',
      url: '/api/templates',
      headers: { cookie },
      payload: {
        name: 'Primer contacto',
        body: 'Hola {{name}}, te escribe {{sellerName}} de mayorista.',
      },
    });
    const templateId = tpl.json().template.id;

    const lead = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie },
      payload: { name: 'Ana', phone: '+5491122334455', source: 'manual' },
    });
    const leadId = lead.json().lead.id;

    const send = await app.inject({
      method: 'POST',
      url: `/api/leads/${leadId}/whatsapp`,
      headers: { cookie },
      payload: { templateId },
    });
    expect(send.statusCode).toBe(200);
    const r = send.json();
    expect(r.url).toMatch(/^https:\/\/wa\.me\/5491122334455\?text=/);
    expect(decodeURIComponent(r.url.split('text=')[1])).toContain('Hola Ana, te escribe Owner');
    expect(r.line.dailyCount).toBe(1);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/leads/${leadId}`,
      headers: { cookie },
    });
    const body = detail.json();
    expect(body.lead.status).toBe('contacted');
    expect(body.lead.lastContactAt).toBeTruthy();
    expect(body.lead.firstContactAt).toBeTruthy();
    const types = body.events.map((e: any) => e.type);
    expect(types).toContain('wa-opened');
    expect(types).toContain('message-sent');
  });

  it('rejects with NO_ACTIVE_LINE when user has no active line', async () => {
    const cookie = await signupOwner();
    const lead = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie },
      payload: { name: 'X', phone: '+5491100000000', source: 'manual' },
    });
    const leadId = lead.json().lead.id;
    const res = await app.inject({
      method: 'POST',
      url: `/api/leads/${leadId}/whatsapp`,
      headers: { cookie },
      payload: { body: 'Hola' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('NO_ACTIVE_LINE');
  });

  it('accepts free-form body without template', async () => {
    const cookie = await signupOwner();
    const line = await app.inject({
      method: 'POST',
      url: '/api/lines',
      headers: { cookie },
      payload: { phone: '+5491111000001' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/lines/${line.json().line.id}/activate`,
      headers: { cookie },
    });
    const lead = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie },
      payload: { phone: '+5491122000000', source: 'manual' },
    });
    const res = await app.inject({
      method: 'POST',
      url: `/api/leads/${lead.json().lead.id}/whatsapp`,
      headers: { cookie },
      payload: { body: 'Mensaje libre sin template' },
    });
    expect(res.statusCode).toBe(200);
    expect(decodeURIComponent(res.json().url.split('text=')[1])).toBe('Mensaje libre sin template');
  });
});

describe('daily reset', () => {
  it('zeroes dailyCount for all lines; is idempotent within the same day', async () => {
    const cookie = await signupOwner();
    const line = await app.inject({
      method: 'POST',
      url: '/api/lines',
      headers: { cookie },
      payload: { phone: '+5491111000001' },
    });
    const lineId = line.json().line.id;
    await app.inject({ method: 'POST', url: `/api/lines/${lineId}/activate`, headers: { cookie } });

    const lead = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie },
      payload: { phone: '+5491122000000', source: 'manual' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/leads/${lead.json().lead.id}/whatsapp`,
      headers: { cookie },
      payload: { body: 'Test' },
    });

    const before = await app.inject({ method: 'GET', url: '/api/lines', headers: { cookie } });
    expect(before.json().lines[0].dailyCount).toBe(1);

    const r1 = runDailyReset();
    expect(r1.ran).toBe(true);
    expect(r1.linesReset).toBe(1);

    const after = await app.inject({ method: 'GET', url: '/api/lines', headers: { cookie } });
    expect(after.json().lines[0].dailyCount).toBe(0);

    const r2 = runDailyReset();
    expect(r2.ran).toBe(false);
    expect(r2.reason).toBe('already-ran');
  });
});
