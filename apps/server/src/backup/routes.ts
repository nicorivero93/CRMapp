import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import type { buildApp } from '../app.js';
import { requireRole } from '../auth/middleware.js';
import { getRawSqlite } from '../db/client.js';
import { logger } from '../lib/logger.js';

type App = Awaited<ReturnType<typeof buildApp>>;

const gzip = promisify(zlib.gzip);

export async function registerBackupRoutes(app: App): Promise<void> {
  // Owner-only consistent snapshot of the SQLite DB, gzipped and served as a
  // download. Safe to call while the server is running (better-sqlite3 online
  // backup API handles WAL consistency).
  app.get('/api/backup', { preHandler: requireRole('owner') }, async (_req, reply) => {
    const ts = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const tempPath = path.join(os.tmpdir(), `mycrm-backup-${ts}.db`);
    const sqlite = getRawSqlite();
    try {
      await sqlite.backup(tempPath);
    } catch (err) {
      logger.error({ err }, 'backup: online backup failed');
      reply.status(500).send({ error: 'BACKUP_FAILED', message: String((err as Error).message) });
      return;
    }
    try {
      const raw = await fs.promises.readFile(tempPath);
      const compressed = await gzip(raw);
      reply
        .header('content-type', 'application/gzip')
        .header('content-disposition', `attachment; filename="mycrm-backup-${ts}.db.gz"`)
        .header('content-length', String(compressed.length))
        .send(compressed);
    } finally {
      fs.promises.unlink(tempPath).catch(() => {});
    }
  });
}
