import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '@mycrm/db';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';

export type DB = BetterSQLite3Database<typeof schema>;

let _db: DB | null = null;
let _sqlite: Database.Database | null = null;

export function getDb(): DB {
  if (_db) return _db;
  const dbPath = config.dbPath;
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('synchronous = NORMAL');
  _sqlite = sqlite;
  _db = drizzle(sqlite, { schema });
  logger.info({ dbPath }, 'sqlite connected');
  return _db;
}

export function getRawSqlite(): Database.Database {
  if (!_sqlite) getDb();
  return _sqlite!;
}

export function closeDb(): void {
  _sqlite?.close();
  _sqlite = null;
  _db = null;
}
