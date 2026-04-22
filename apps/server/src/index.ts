import { buildApp } from './app.js';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { runMigrations } from './db/migrate.js';
import { closeDb } from './db/client.js';
import { startScheduler, stopScheduler } from './scheduler/index.js';

async function main(): Promise<void> {
  runMigrations();
  const app = await buildApp();
  startScheduler();
  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port, host: config.host }, 'server listening');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    stopScheduler();
    await app.close();
    closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
