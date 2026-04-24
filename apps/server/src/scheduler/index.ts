import cron, { type ScheduledTask } from 'node-cron';
import { logger } from '../lib/logger.js';
import { getSettings } from '../settings/service.js';
import { runDailyReset } from './daily.js';
import { runRecyclingCycle } from '../leads/recyclingService.js';
import { runDailyBackup } from '../backup/scheduled.js';

let task: ScheduledTask | null = null;

async function runDailyTick(): Promise<void> {
  try {
    const r = runDailyReset();
    logger.info(r, 'scheduler: daily tick');
  } catch (err) {
    logger.error({ err }, 'scheduler: daily tick failed');
  }
  try {
    const r = runRecyclingCycle({ byUserId: null });
    logger.info(r, 'scheduler: recycling cycle');
  } catch (err) {
    logger.error({ err }, 'scheduler: recycling cycle failed');
  }
  try {
    const r = await runDailyBackup();
    if (r.ran) logger.info(r, 'scheduler: daily backup');
  } catch (err) {
    logger.error({ err }, 'scheduler: daily backup failed');
  }
}

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
      void runDailyTick();
    },
    { timezone: settings.timezone },
  );
  logger.info({ timezone: settings.timezone }, 'scheduler started');
  // Run once at startup in case the server was offline when it should have
  // fired. All sub-tasks are self-guarded via appSettings last*At keys.
  void runDailyTick();
}

export function stopScheduler(): void {
  if (task) {
    task.stop();
    task = null;
  }
}
