import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-contacts-'));
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
    'DELETE FROM lead_events; DELETE FROM events; DELETE FROM deals; DELETE FROM contacts; DELETE FROM leads; DELETE FROM import_batches; DELETE FROM whatsapp_lines; DELETE FROM sessions; DELETE FROM users; DELETE FROM app_settings;',
  );
});

describe('contacts CRUD', () => {
  it('create / list / get / patch / delete owner-only', async () => {
    const cookie = await signupOwner();

    const c = await app.inject({
      method: 'POST',
      url: '/api/contacts',
      headers: { cookie },
      payload: {
        name: 'Juan Perez',
        phone: '+5491111222333',
        email: 'j@t.com',
        company: 'Acme',
        industry: 'saas',
        tags: ['vip', 'ar'],
      },
    });
    expect(c.statusCode).toBe(201);
    const created = c.json().contact;
    expect(created.name).toBe('Juan Perez');
    expect(created.tags).toEqual(['vip', 'ar']);

    const list = await app.inject({ method: 'GET', url: '/api/contacts', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().total).toBe(1);
    expect(list.json().contacts).toHaveLength(1);

    const get1 = await app.inject({
      method: 'GET',
      url: `/api/contacts/${created.id}`,
      headers: { cookie },
    });
    expect(get1.statusCode).toBe(200);
    expect(get1.json().contact.id).toBe(created.id);
    expect(get1.json().deals).toEqual([]);
    expect(get1.json().events).toEqual([]);

    const p = await app.inject({
      method: 'PATCH',
      url: `/api/contacts/${created.id}`,
      headers: { cookie },
      payload: { name: 'Juan P.', industry: 'fintech' },
    });
    expect(p.statusCode).toBe(200);
    expect(p.json().contact.name).toBe('Juan P.');
    expect(p.json().contact.industry).toBe('fintech');

    // sales user can NOT delete
    await createSales(cookie, 'v@t.com', 'Vendedora');
    const salesCookie = await login('v@t.com');
    const dnope = await app.inject({
      method: 'DELETE',
      url: `/api/contacts/${created.id}`,
      headers: { cookie: salesCookie },
    });
    expect(dnope.statusCode).toBe(403);

    const d = await app.inject({
      method: 'DELETE',
      url: `/api/contacts/${created.id}`,
      headers: { cookie },
    });
    expect(d.statusCode).toBe(204);

    const after = await app.inject({ method: 'GET', url: '/api/contacts', headers: { cookie } });
    expect(after.json().total).toBe(0);
  });

  it('list filters: q / tag / industry', async () => {
    const cookie = await signupOwner();

    const payloads = [
      { name: 'Ana Gomez', phone: '+5491111000001', email: 'ana@x.com', industry: 'saas', tags: ['vip'] },
      { name: 'Bruno Lopez', phone: '+5491111000002', email: 'bruno@y.com', industry: 'retail', tags: ['cold'] },
      { name: 'Carla Ruiz', phone: '+5491111000003', email: 'carla@x.com', industry: 'saas', tags: ['vip', 'ar'] },
    ];
    for (const p of payloads) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/contacts',
        headers: { cookie },
        payload: p,
      });
      expect(r.statusCode).toBe(201);
    }

    const qRes = await app.inject({
      method: 'GET',
      url: '/api/contacts?q=Ana',
      headers: { cookie },
    });
    expect(qRes.json().total).toBe(1);
    expect(qRes.json().contacts[0].name).toBe('Ana Gomez');

    const industryRes = await app.inject({
      method: 'GET',
      url: '/api/contacts?industry=saas',
      headers: { cookie },
    });
    expect(industryRes.json().total).toBe(2);

    const tagRes = await app.inject({
      method: 'GET',
      url: '/api/contacts?tag=vip',
      headers: { cookie },
    });
    expect(tagRes.json().total).toBe(2);

    const tagRes2 = await app.inject({
      method: 'GET',
      url: '/api/contacts?tag=cold',
      headers: { cookie },
    });
    expect(tagRes2.json().total).toBe(1);
  });
});

describe('contacts CSV import', () => {
  it('imports, dedups by normalized phone', async () => {
    const cookie = await signupOwner();

    const csv =
      'nombre,telefono,email,empresa,industria,tags\n' +
      'Ana,+5491111000001,ana@x.com,Acme,saas,"vip,ar"\n' +
      'Bruno,+5491111000002,bruno@y.com,Beta,retail,cold\n' +
      'Ana Duplicada,+5491111000001,,,,\n' + // dedup vs row 1 (exact match)
      ',,,,,\n' + // empty row, should be row with errors (empty after parse: csv-parse skips)
      'SinTel,,noPhone@x.com,,,\n'; // error: no phone

    const boundary = '----vitestContacts';
    const body =
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="contacts.csv"\r\n` +
      `Content-Type: text/csv\r\n\r\n` +
      `${csv}\r\n` +
      `--${boundary}--\r\n`;

    const res = await app.inject({
      method: 'POST',
      url: '/api/contacts/import',
      headers: {
        cookie,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(res.statusCode).toBe(201);
    const r = res.json();
    expect(r.imported).toBe(2);
    expect(r.deduped).toBeGreaterThanOrEqual(1);
    expect(r.errors).toBeGreaterThanOrEqual(1);

    const list = await app.inject({ method: 'GET', url: '/api/contacts', headers: { cookie } });
    expect(list.json().total).toBe(2);
  });
});

describe('convert lead -> contact', () => {
  it('creates contact, marks lead converted, logs event', async () => {
    const cookie = await signupOwner();

    // create a lead
    const lr = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie },
      payload: {
        phone: '+5491111999888',
        name: 'Lead Uno',
        source: 'manual',
      },
    });
    expect(lr.statusCode).toBe(201);
    const leadId = lr.json().lead.id;

    const conv = await app.inject({
      method: 'POST',
      url: `/api/leads/${leadId}/convert-to-contact`,
      headers: { cookie },
      payload: { overrides: { company: 'Acme', industry: 'saas' } },
    });
    expect(conv.statusCode).toBe(201);
    const contact = conv.json().contact;
    const lead = conv.json().lead;
    expect(contact.name).toBe('Lead Uno');
    expect(contact.company).toBe('Acme');
    expect(contact.industry).toBe('saas');
    expect(contact.leadId).toBe(leadId);
    expect(lead.status).toBe('converted');
    expect(lead.convertedContactId).toBe(contact.id);

    // timeline has 'converted' event
    const detail = await app.inject({
      method: 'GET',
      url: `/api/leads/${leadId}`,
      headers: { cookie },
    });
    const events = detail.json().events as Array<{ type: string }>;
    expect(events.some((e) => e.type === 'converted')).toBe(true);

    // re-convert → 409
    const again = await app.inject({
      method: 'POST',
      url: `/api/leads/${leadId}/convert-to-contact`,
      headers: { cookie },
      payload: {},
    });
    expect(again.statusCode).toBe(409);
  });
});
