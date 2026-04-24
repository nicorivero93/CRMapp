import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { appSettings } from '@mycrm/db';
import { getDb, getRawSqlite } from '../db/client.js';
import { logger } from '../lib/logger.js';

const LAST_BACKUP_KEY = 'lastBackupAt';
const RETENTION_DAYS = 7;
const BACKUP_FILENAME_REGEX = /^mycrm-\d{8}\.db$/;

export interface DailyBackupReport {
  ran: boolean;
  dayKey: string;
  reason: 'already-ran' | 'done' | 'skipped-in-memory';
  path?: string;
  sizeBytes?: number;
  prunedCount?: number;
  dir?: string;
}

export function resolveBackupDir(): string {
  const envDir = process.env.BACKUP_DIR?.trim();
  if (envDir) return envDir;
  const programData = process.env.ProgramData ?? 'C:\\ProgramData';
  return path.join(programData, 'MyCRM', 'db-backups');
}

function todayKey(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

async function prune(dir: string, nowMs: number): Promise<number> {
  const cutoff = nowMs - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let pruned = 0;
  const entries = await fs.promises.readdir(dir).catch(() => [] as string[]);
  for (const name of entries) {
    if (!BACKUP_FILENAME_REGEX.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = await fs.promises.stat(full);
      if (st.mtimeMs < cutoff) {
        await fs.promises.unlink(full);
        pruned += 1;
      }
    } catch {
      // file raced away — ignore
    }
  }
  return pruned;
}

/**
 * Daily online backup of the SQLite database to `BACKUP_DIR`.
 * Idempotent per calendar day via `appSettings.lastBackupAt`.
 * Keeps 7 days; older files are pruned every run.
 *
 * Safe to call while the server is running — better-sqlite3's `backup()`
 * copies the DB atomically via the SQLite online backup API.
 */
export async function runDailyBackup(now: Date = new Date()): Promise<DailyBackupReport> {
  const dayKey = todayKey(now);
  const db = getDb();
  const last = db.select().from(appSettings).where(eq(appSettings.key, LAST_BACKUP_KEY)).get();
  if (last && last.value === dayKey) {
    return { ran: false, dayKey, reason: 'already-ran' };
  }

  const sqlite = getRawSqlite();
  // In-memory DBs can't be backed up to a file path meaningfully, and tests
  // use :memory:. Skip cleanly instead of erroring.
  if (sqlite.name === '' || sqlite.name === ':memory:') {
    return { ran: false, dayKey, reason: 'skipped-in-memory' };
  }

  const dir = resolveBackupDir();
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, `mycrm-${dayKey}.db`);
  await sqlite.backup(file);
  // Pin the mtime to the logical backup instant. Keeps pruning deterministic
  // if this ever runs with a `now` other than wall-clock (tests, replay).
  await fs.promises.utimes(file, now, now);
  const { size } = await fs.promises.stat(file);

  const prunedCount = await prune(dir, now.getTime());

  if (last) {
    db.update(appSettings).set({ value: dayKey }).where(eq(appSettings.key, LAST_BACKUP_KEY)).run();
  } else {
    db.insert(appSettings).values({ key: LAST_BACKUP_KEY, value: dayKey }).run();
  }

  logger.info({ path: file, sizeBytes: size, prunedCount, dir }, 'daily backup done');
  return { ran: true, dayKey, reason: 'done', path: file, sizeBytes: size, prunedCount, dir };
}
