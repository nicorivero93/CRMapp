import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger.js';
import { getSettings } from '../settings/service.js';
import { runDailyReset } from './daily.js';

let task: ScheduledTask | null = null;

/**
 * Schedule the daily cron jobs. Called once at server boot (post-migrate).
 * Idempotent — calling again replaces the previous task.
 */
export function startScheduler(): void {
  if (task) {
    task.stop();
    task = null;
  }
  const settings = getSettings();
  task = cron.schedule(
    '0 0 * * *',
    () => {
      try {
        const r = runDailyReset();
        logger.info(r, 'scheduler: daily tick');
      } catch (err) {
        logger.error({ err }, 'scheduler: daily tick failed');
      }
    },
    { timezone: settings.timezone },
  );
  logger.info({ timezone: settings.timezone }, 'scheduler started');
  // Run once at startup in case the server was offline when it should have
  // fired. `runDailyReset` is self-guarded via lastDailyResetAt.
  try {
    const r = runDailyReset();
    if (r.ran) logger.info(r, 'scheduler: catch-up reset');
  } catch (err) {
    logger.error({ err }, 'scheduler: catch-up reset failed');
  }
}

export function stopScheduler(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
