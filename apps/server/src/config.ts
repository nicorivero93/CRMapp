import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve a data dir in two layouts:
 *   - dev: `apps/server/src/` bundle → look at `apps/server/<name>/`  (../<name>)
 *   - prod: `C:\Program Files\MyCRM\server-bundle.cjs` → look at same dir (./<name>)
 * Pick whichever actually exists; default to the same-dir (bundle) layout.
 */
function resolveAsset(name: string): string {
  const sameDir = path.resolve(__dirname, name);
  const parent = path.resolve(__dirname, '..', name);
  if (fs.existsSync(sameDir)) return sameDir;
  if (fs.existsSync(parent)) return parent;
  return sameDir;
}

export const config = {
  port: Number(process.env.PORT ?? 3180),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? path.join(resolveAsset('data'), 'mycrm.db'),
  migrationsPath: process.env.MIGRATIONS_PATH ?? resolveAsset('drizzle'),
  cookieSecret: process.env.COOKIE_SECRET ?? 'dev-secret-change-me-in-prod',
  isDev: process.env.NODE_ENV !== 'production',
  sessionTtlDays: 30,
  version: '0.1.2',
} as const;
