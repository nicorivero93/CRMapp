import type { buildApp } from '../app.js';
import { getRawSqlite } from '../db/client.js';
import { config } from '../config.js';

type App = Awaited<ReturnType<typeof buildApp>>;
const startedAt = Date.now();

export async function registerHealthRoutes(app: App): Promise<void> {
  app.get('/api/health', async () => {
    let dbStatus: 'ok' | 'error' = 'ok';
    try {
      getRawSqlite().prepare('SELECT 1').get();
    } catch {
      dbStatus = 'error';
    }
    return {
      status: dbStatus === 'ok' ? ('ok' as const) : ('degraded' as const),
      version: config.version,
      db: dbStatus,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    };
  });
}
