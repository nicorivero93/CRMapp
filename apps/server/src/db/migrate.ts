import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { config } from '../config.js';
import { getDb } from './client.js';
import { logger } from '../lib/logger.js';

export function runMigrations(): void {
  const db = getDb();
  migrate(db, { migrationsFolder: config.migrationsPath });
  logger.info('migrations applied');
}
