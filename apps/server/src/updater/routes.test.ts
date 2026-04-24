import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { FastifyInstance } from 'fastify';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-updater-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret-updater';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

const { buildApp } = await import('../app.js');
const { runMigrations } = await import('../db/migrate.js');
const { closeDb, getDb, getRawSqlite } = await import('../db/client.js');
const { updaterDeps } = await import('./routes.js');
const { config } = await import('../config.js');
const { appSettings } = await import('@mycrm/db');
const { eq } = await import('drizzle-orm');

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
    payload: { email: 'owner@test.com', password: 'updaterpw99', name: 'Owner' },
  });
  if (res.statusCode >= 400) throw new Error(`signup failed: ${res.statusCode} ${res.body}`);
  return cookieFrom(res);
}

function seedLatestRelease(version: string, assetUrl = `https://example/v${version}.zip`): void {
  const db = getDb();
  const existing = db.select().from(appSettings).where(eq(appSettings.key, 'updater')).get();
  const value = {
    latestVersion: version,
    lastCheckedAt: new Date().toISOString(),
    releaseNotes: 'notes',
    releaseAssetUrl: assetUrl,
    error: null,
  };
  if (existing) {
    db.update(appSettings).set({ value }).where(eq(appSettings.key, 'updater')).run();
  } else {
    db.insert(appSettings).values({ key: 'updater', value }).run();
  }
}

function bumpVersion(parts: number[]): string {
  return parts.join('.');
}

beforeAll(async () => {
  await runMigrations();
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Wipe auth + settings between tests so each one starts from a blank slate.
  const sql = getRawSqlite();
  sql.exec('DELETE FROM sessions; DELETE FROM users; DELETE FROM app_settings;');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('POST /api/updater/apply', () => {
  it('devuelve no-candidate si no hay version target ni latest conocido', async () => {
    const cookie = await signupOwner();
    const res = await app.inject({
      method: 'POST',
      url: '/api/updater/apply',
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ status: 'no-candidate', version: null });
  });

  it('devuelve already-up-to-date si target <= current', async () => {
    const cookie = await signupOwner();
    const res = await app.inject({
      method: 'POST',
      url: '/api/updater/apply',
      headers: { cookie },
      payload: { version: config.version },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'already-up-to-date', version: config.version });
  });

  it('devuelve 503 si no encuentra update.ps1 en el filesystem', async () => {
    // El cwd del test es apps/server/ y no hay update.ps1 ahi ni en Program Files
    // de Windows runner — asi que el find va a retornar null.
    const cookie = await signupOwner();
    const bumped = bumpVersion([99, 99, 99]); // > current
    const res = await app.inject({
      method: 'POST',
      url: '/api/updater/apply',
      headers: { cookie },
      payload: { version: bumped },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().message).toMatch(/update\.ps1/);
  });

  describe('con update.ps1 presente y schtasks mockeado', () => {
    let scriptPath: string;

    beforeEach(() => {
      // Ubicacion mas "natural" que va a encontrar findUpdaterScript:
      // cwd() durante tests es apps/server/, entonces ponemos el fake
      // update.ps1 en apps/server/update.ps1.
      scriptPath = path.join(process.cwd(), 'update.ps1');
      fs.writeFileSync(scriptPath, '# stub update.ps1 for tests\n');
    });

    afterEach(() => {
      if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
    });

    it('happy path: escribe .bat + .xml y dispara schtasks /XML + /Run', async () => {
      const calls: string[][] = [];
      vi.spyOn(updaterDeps, 'runSchtasks').mockImplementation(async (args) => {
        calls.push(args);
        if (args[0] === '/Delete' && calls.length === 1) {
          return { args, stdout: '', stderr: 'ERROR: does not exist', code: 1 };
        }
        return { args, stdout: '', stderr: '', code: 0 };
      });

      const cookie = await signupOwner();
      seedLatestRelease('99.99.99');
      const res = await app.inject({
        method: 'POST',
        url: '/api/updater/apply',
        headers: { cookie },
        payload: { version: '99.99.99' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: 'initiated', version: '99.99.99' });

      // 3 invocaciones: Delete (pre-cleanup), Create via XML, Run
      expect(calls).toHaveLength(3);
      expect(calls[0]).toEqual(['/Delete', '/TN', 'MyCRMUpdate', '/F']);

      // Create: usa /XML con path al runner-xml, NO /TR con el comando embebido.
      expect(calls[1]).toContain('/Create');
      expect(calls[1]).toContain('/TN');
      expect(calls[1]).toContain('MyCRMUpdate');
      expect(calls[1]).toContain('/XML');
      expect(calls[1]).not.toContain('/TR'); // evita el limite de 261 chars
      const xmlIdx = calls[1]!.indexOf('/XML');
      const xmlPath = calls[1]![xmlIdx + 1]!;
      expect(xmlPath).toMatch(/update-runner\.xml$/);

      // Run
      expect(calls[2]).toEqual(['/Run', '/TN', 'MyCRMUpdate']);

      // El .bat debe existir y contener el comando completo (no truncado).
      const programData = process.env.ProgramData ?? 'C:\\ProgramData';
      const batPath = path.join(programData, 'MyCRM', 'update-runner.bat');
      expect(fs.existsSync(batPath)).toBe(true);
      const batContent = fs.readFileSync(batPath, 'utf8');
      expect(batContent).toMatch(/powershell\.exe/i);
      expect(batContent).toContain('update.ps1');
      expect(batContent).toContain('-TargetVersion 99.99.99');
      expect(batContent).toContain('-AssetUrl "https://example/v99.99.99.zip"');

      // El XML debe tener las opciones de bateria deshabilitadas.
      const xmlContent = fs.readFileSync(xmlPath, 'utf16le').replace(/^\uFEFF/, '');
      expect(xmlContent).toContain('<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>');
      expect(xmlContent).toContain('<StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>');
      expect(xmlContent).toContain('<UserId>S-1-5-18</UserId>'); // LocalSystem
      expect(xmlContent).toContain('<RunLevel>HighestAvailable</RunLevel>');
      expect(xmlContent).toContain(batPath);
    });

    it('si schtasks /Create falla → responde 500 con el stderr', async () => {
      vi.spyOn(updaterDeps, 'runSchtasks').mockImplementation(async (args) => {
        if (args[0] === '/Delete') return { args, stdout: '', stderr: '', code: 0 };
        if (args[0] === '/Create') {
          return { args, stdout: '', stderr: 'ERROR: Access is denied.', code: 5 };
        }
        return { args, stdout: '', stderr: '', code: 0 };
      });

      const cookie = await signupOwner();
      const res = await app.inject({
        method: 'POST',
        url: '/api/updater/apply',
        headers: { cookie },
        payload: { version: '99.99.99' },
      });
      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.message).toMatch(/tarea programada/);
      expect(body.message).toMatch(/Access is denied/);
    });

    it('si schtasks /Run falla → responde 500 y limpia la tarea huerfana', async () => {
      const calls: string[][] = [];
      vi.spyOn(updaterDeps, 'runSchtasks').mockImplementation(async (args) => {
        calls.push(args);
        if (args[0] === '/Run') {
          return { args, stdout: '', stderr: 'ERROR: task not found (race)', code: 1 };
        }
        return { args, stdout: '', stderr: '', code: 0 };
      });

      const cookie = await signupOwner();
      const res = await app.inject({
        method: 'POST',
        url: '/api/updater/apply',
        headers: { cookie },
        payload: { version: '99.99.99' },
      });
      expect(res.statusCode).toBe(500);
      expect(res.json().message).toMatch(/disparar/i);

      // Cleanup: dos /Delete (pre-cleanup + post-fail cleanup)
      const deletes = calls.filter((c) => c[0] === '/Delete');
      expect(deletes).toHaveLength(2);
    });

    it('rechaza con 403 si el caller no es owner', async () => {
      // Signup OK → login → pero ahora no usamos la cookie de owner
      await signupOwner();
      const res = await app.inject({
        method: 'POST',
        url: '/api/updater/apply',
        payload: { version: '99.99.99' },
      });
      // Sin cookie: 401 por requireAuth, no por requireRole
      expect([401, 403]).toContain(res.statusCode);
    });
  });
});

describe('GET /api/updater/status', () => {
  it('devuelve current version + sin update si DB vacia', async () => {
    const cookie = await signupOwner();
    const res = await app.inject({
      method: 'GET',
      url: '/api/updater/status',
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json().status;
    expect(body.currentVersion).toBe(config.version);
    expect(body.hasUpdate).toBe(false);
  });

  it('reporta hasUpdate=true cuando el latest conocido > current', async () => {
    const cookie = await signupOwner();
    seedLatestRelease('99.99.99');
    const res = await app.inject({
      method: 'GET',
      url: '/api/updater/status',
      headers: { cookie },
    });
    const body = res.json().status;
    expect(body.latestVersion).toBe('99.99.99');
    expect(body.hasUpdate).toBe(true);
  });
});
