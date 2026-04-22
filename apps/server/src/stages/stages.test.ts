import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-stages-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getRawSqlite } = await import('../db/client.js');
const { seedDefaultStages } = await import('./routes.js');

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
  // Signup auto-seeds 4 default stages; wipe them so each test starts clean.
  getRawSqlite().exec('DELETE FROM stages;');
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
    'DELETE FROM deals; DELETE FROM stages; DELETE FROM sessions; DELETE FROM users; DELETE FROM app_settings;',
  );
});

describe('stages CRUD + reorder + delete guards', () => {
  it('CRUD flow', async () => {
    const cookie = await signupOwner();
    const c = await app.inject({
      method: 'POST',
      url: '/api/stages',
      headers: { cookie },
      payload: { name: 'Nuevo', color: '#6366f1' },
    });
    expect(c.statusCode).toBe(201);
    expect(c.json().stage.order).toBe(0);
    const first = c.json().stage.id;

    const c2 = await app.inject({
      method: 'POST',
      url: '/api/stages',
      headers: { cookie },
      payload: { name: 'Cerrado', isClosedWon: true },
    });
    expect(c2.json().stage.order).toBe(1);

    const list = await app.inject({ method: 'GET', url: '/api/stages', headers: { cookie } });
    expect(list.json().stages).toHaveLength(2);

    const p = await app.inject({
      method: 'PATCH',
      url: `/api/stages/${first}`,
      headers: { cookie },
      payload: { name: 'Nuevo renombrado', color: '#ff0000' },
    });
    expect(p.json().stage.name).toBe('Nuevo renombrado');
    expect(p.json().stage.color).toBe('#ff0000');

    const d = await app.inject({
      method: 'DELETE',
      url: `/api/stages/${first}`,
      headers: { cookie },
    });
    expect(d.statusCode).toBe(204);
  });

  it('reorder updates order by position', async () => {
    const cookie = await signupOwner();
    const seeded = seedDefaultStages('owner');
    expect(seeded).toHaveLength(4);
    const ids = seeded.map((s) => s.id);
    const reversed = [...ids].reverse();

    const r = await app.inject({
      method: 'POST',
      url: '/api/stages/reorder',
      headers: { cookie },
      payload: { ids: reversed },
    });
    expect(r.statusCode).toBe(200);
    const orders = r.json().stages.map((s: { id: string; order: number }) => ({
      id: s.id,
      order: s.order,
    }));
    // After reorder, the first in reversed should have order 0.
    expect(orders.find((o: { id: string }) => o.id === reversed[0])?.order).toBe(0);
    expect(orders.find((o: { id: string }) => o.id === reversed[3])?.order).toBe(3);
  });

  it('reorder rejects mismatched id count', async () => {
    const cookie = await signupOwner();
    const seeded = seedDefaultStages('owner');
    const partial = seeded.slice(0, 2).map((s) => s.id);
    const r = await app.inject({
      method: 'POST',
      url: '/api/stages/reorder',
      headers: { cookie },
      payload: { ids: partial },
    });
    expect(r.statusCode).toBe(400);
  });

  it('delete returns 409 when stage has deals', async () => {
    const cookie = await signupOwner();
    const [s0] = seedDefaultStages('owner');
    const cDeal = await app.inject({
      method: 'POST',
      url: '/api/deals',
      headers: { cookie },
      payload: { title: 'Deal A', value: 1000, currency: 'ARS', stageId: s0!.id },
    });
    expect(cDeal.statusCode).toBe(201);

    const d = await app.inject({
      method: 'DELETE',
      url: `/api/stages/${s0!.id}`,
      headers: { cookie },
    });
    expect(d.statusCode).toBe(409);
  });

  it('seedDefaultStages is idempotent', async () => {
    const a = seedDefaultStages('owner');
    const b = seedDefaultStages('owner');
    expect(a).toHaveLength(4);
    expect(b).toHaveLength(4);
    expect(a.map((s) => s.id).sort()).toEqual(b.map((s) => s.id).sort());
  });
});
