import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-webhook-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-cookie-secret-webhook';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getRawSqlite } = await import('../db/client.js');
const { patchMetaSecrets, setWhatsAppChannelKind } = await import('./settings.js');
const { handleInboundPayload } = await import('./webhookRoutes.js');

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
    'DELETE FROM lead_events; DELETE FROM leads; DELETE FROM sessions; DELETE FROM users; DELETE FROM app_settings;',
  );
  ownerCookie = await signupOwner();
});

describe('GET /api/whatsapp/webhook (verify)', () => {
  it('returns 503 when not configured', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=123',
    });
    expect(res.statusCode).toBe(503);
  });

  it('echoes challenge when token matches', async () => {
    patchMetaSecrets({
      phoneNumberId: '111',
      businessId: '222',
      accessToken: 'atoken',
      webhookVerifyToken: 'secret-v-token',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=secret-v-token&hub.challenge=CHLNG',
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('CHLNG');
  });

  it('returns 403 when token mismatches', async () => {
    patchMetaSecrets({
      phoneNumberId: '111',
      businessId: '222',
      accessToken: 'atoken',
      webhookVerifyToken: 'secret-v-token',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=X',
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/whatsapp/webhook + handleInboundPayload', () => {
  it('matches a message to a tracked lead by phone, creates response-received event', async () => {
    // Create a lead assigned to the owner
    const created = await app.inject({
      method: 'POST',
      url: '/api/leads',
      headers: { cookie: ownerCookie },
      payload: { name: 'Ana', phone: '+5491122334455', source: 'manual' },
    });
    const leadId = created.json().lead.id;

    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'biz',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: { phone_number_id: '111' },
                contacts: [{ wa_id: '5491122334455', profile: { name: 'Ana' } }],
                messages: [
                  {
                    id: 'wamid.in.1',
                    from: '5491122334455',
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    type: 'text',
                    text: { body: '¡Sí, me interesa!' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };
    const r = handleInboundPayload(payload);
    expect(r.matched).toBe(1);
    expect(r.unmatched).toBe(0);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/leads/${leadId}`,
      headers: { cookie: ownerCookie },
    });
    const body = detail.json();
    expect(body.lead.status).toBe('responded');
    expect(body.lead.responseCount).toBe(1);
    expect(body.events.some((e: any) => e.type === 'response-received')).toBe(true);
  });

  it('counts unmatched when no lead exists with that phone', async () => {
    const r = handleInboundPayload({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  { id: 'x', from: '9999999999999', type: 'text', text: { body: 'hola' } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(r.matched).toBe(0);
    expect(r.unmatched).toBe(1);
  });

  it('webhook POST always responds 200 even on malformed payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/whatsapp/webhook',
      payload: { weird: 'thing' },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('PATCH /api/settings/whatsapp', () => {
  it('refuses to enable meta-cloud without full config', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/settings/whatsapp',
      headers: { cookie: ownerCookie },
      payload: { channel: 'meta-cloud' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('META_INCOMPLETE');
  });

  it('accepts full meta config then channel flip', async () => {
    const put = await app.inject({
      method: 'PATCH',
      url: '/api/settings/whatsapp',
      headers: { cookie: ownerCookie },
      payload: {
        meta: {
          phoneNumberId: '111',
          businessId: '222',
          accessToken: 'Abcdefghij',
          webhookVerifyToken: 'verifyme',
        },
        channel: 'meta-cloud',
      },
    });
    expect(put.statusCode).toBe(200);
    const got = put.json().settings;
    expect(got.channel).toBe('meta-cloud');
    expect(got.meta.configured).toBe(true);
    expect(got.meta.hasAccessToken).toBe(true);
  });

  it('does not echo secrets in GET response', async () => {
    patchMetaSecrets({
      phoneNumberId: '111',
      businessId: '222',
      accessToken: 'SUPER-SECRET-TOKEN',
      webhookVerifyToken: 'secret-verify',
    });
    setWhatsAppChannelKind('meta-cloud');
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/whatsapp',
      headers: { cookie: ownerCookie },
    });
    const body = JSON.stringify(res.json());
    expect(body).not.toContain('SUPER-SECRET-TOKEN');
    expect(body).not.toContain('secret-verify');
  });
});
