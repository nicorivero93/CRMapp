import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT ?? 3180),
  host: process.env.HOST ?? '0.0.0.0',
  dbPath: process.env.DB_PATH ?? path.resolve(__dirname, '../data/mycrm.db'),
  migrationsPath: path.resolve(__dirname, '../drizzle'),
  cookieSecret: process.env.COOKIE_SECRET ?? 'dev-secret-change-me-in-prod',
  isDev: process.env.NODE_ENV !== 'production',
  sessionTtlDays: 30,
  version: '0.1.0',
} as const;
