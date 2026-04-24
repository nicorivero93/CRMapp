import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mycrm-backup-'));
process.env.DB_PATH = path.join(tmpDir, 'test.db');
process.env.COOKIE_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// BACKUP_DIR override per-test — set before each case
const backupsDir = path.join(tmpDir, 'backups');
process.env.BACKUP_DIR = backupsDir;

const { runMigrations } = await import('../db/migrate.js');
const { getDb, getRawSqlite, closeDb } = await import('../db/client.js');
const { runDailyBackup, resolveBackupDir } = await import('./scheduled.js');
const { appSettings } = await import('@mycrm/db');
const { eq } = await import('drizzle-orm');

beforeAll(async () => {
  await runMigrations();
  // Force the DB to boot now so getRawSqlite() returns a real file-backed conn.
  getDb();
});

afterAll(() => {
  closeDb();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Wipe backup dir + lastBackupAt row between tests so each case starts clean.
  fs.rmSync(backupsDir, { recursive: true, force: true });
  const db = getDb();
  db.delete(appSettings).where(eq(appSettings.key, 'lastBackupAt')).run();
});

describe('runDailyBackup', () => {
  it('resolveBackupDir honra BACKUP_DIR env', () => {
    expect(resolveBackupDir()).toBe(backupsDir);
  });

  it('crea el archivo de backup con nombre mycrm-YYYYMMDD.db', async () => {
    const now = new Date('2026-05-15T10:00:00');
    const r = await runDailyBackup(now);
    expect(r.ran).toBe(true);
    expect(r.reason).toBe('done');
    expect(r.path).toBe(path.join(backupsDir, 'mycrm-20260515.db'));
    expect(fs.existsSync(r.path!)).toBe(true);
    expect(r.sizeBytes).toBeGreaterThan(0);
  });

  it('es idempotente dentro del mismo dia (segunda llamada no corre)', async () => {
    const now = new Date('2026-05-15T00:30:00');
    const first = await runDailyBackup(now);
    expect(first.ran).toBe(true);

    const later = new Date('2026-05-15T23:59:00');
    const second = await runDailyBackup(later);
    expect(second.ran).toBe(false);
    expect(second.reason).toBe('already-ran');
  });

  it('un dia distinto dispara una nueva corrida', async () => {
    const day1 = new Date('2026-05-15T01:00:00');
    const r1 = await runDailyBackup(day1);
    expect(r1.ran).toBe(true);

    const day2 = new Date('2026-05-16T01:00:00');
    const r2 = await runDailyBackup(day2);
    expect(r2.ran).toBe(true);
    expect(r2.path).toBe(path.join(backupsDir, 'mycrm-20260516.db'));
  });

  it('elimina backups con mas de 7 dias de antiguedad', async () => {
    fs.mkdirSync(backupsDir, { recursive: true });
    // Crear dos archivos falsos: uno reciente (3 dias), uno viejo (10 dias).
    const recent = path.join(backupsDir, 'mycrm-20260512.db');
    const old = path.join(backupsDir, 'mycrm-20260505.db');
    fs.writeFileSync(recent, Buffer.alloc(1024));
    fs.writeFileSync(old, Buffer.alloc(1024));
    const now = Date.now();
    // mtime: reciente = now - 3d, viejo = now - 10d
    fs.utimesSync(recent, new Date(now - 3 * 86400e3), new Date(now - 3 * 86400e3));
    fs.utimesSync(old, new Date(now - 10 * 86400e3), new Date(now - 10 * 86400e3));

    const r = await runDailyBackup(new Date());
    expect(r.ran).toBe(true);
    expect(r.prunedCount).toBe(1);
    expect(fs.existsSync(recent)).toBe(true);
    expect(fs.existsSync(old)).toBe(false);
  });

  it('no toca archivos ajenos al patron mycrm-YYYYMMDD.db', async () => {
    fs.mkdirSync(backupsDir, { recursive: true });
    const stranger = path.join(backupsDir, 'README.txt');
    fs.writeFileSync(stranger, 'no me borres');
    fs.utimesSync(stranger, new Date(Date.now() - 30 * 86400e3), new Date(Date.now() - 30 * 86400e3));

    const r = await runDailyBackup(new Date());
    expect(r.ran).toBe(true);
    expect(fs.existsSync(stranger)).toBe(true);
  });

  it('persiste lastBackupAt en appSettings', async () => {
    const now = new Date('2026-05-15T02:00:00');
    await runDailyBackup(now);
    const db = getDb();
    const row = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'lastBackupAt'))
      .get();
    expect(row?.value).toBe('20260515');
  });

  it('el archivo generado es una DB SQLite valida', async () => {
    const r = await runDailyBackup(new Date('2026-05-15T00:00:00'));
    expect(r.ran).toBe(true);
    // Magic header de SQLite: 'SQLite format 3\u0000'
    const fd = fs.openSync(r.path!, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    expect(buf.toString('utf-8')).toBe('SQLite format 3\u0000');
  });
});
