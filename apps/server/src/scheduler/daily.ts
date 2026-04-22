import { eq } from 'drizzle-orm';
import { appSettings, whatsappLines } from '@mycrm/db';
import { getDb } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { getSettings } from '../settings/service.js';
import { todayStringInTZ } from '../whatsapp/templates.js';

const LAST_RESET_KEY = 'lastDailyResetAt';

export interface DailyResetReport {
  ran: boolean;
  linesReset: number;
  dayKey: string;
  reason?: 'already-ran' | 'done';
}

/**
 * Reset per-line dailyCount to 0. Guarded by an `app_settings` row so that
 * calling it repeatedly within the same local day is a no-op.
 */
export function runDailyReset(now = new Date()): DailyResetReport {
  const settings = getSettings();
  const dayKey = todayStringInTZ(settings.timezone, now);
  const db = getDb();
  const last = db.select().from(appSettings).where(eq(appSettings.key, LAST_RESET_KEY)).get();
  if (last && last.value === dayKey) {
    return { ran: false, linesReset: 0, dayKey, reason: 'already-ran' };
  }
  const before = db.select().from(whatsappLines).all();
  db.update(whatsappLines).set({ dailyCount: 0 }).run();
  if (last) {
    db.update(appSettings).set({ value: dayKey }).where(eq(appSettings.key, LAST_RESET_KEY)).run();
  } else {
    db.insert(appSettings).values({ key: LAST_RESET_KEY, value: dayKey }).run();
  }
  logger.info({ dayKey, lines: before.length }, 'daily reset done');
  return { ran: true, linesReset: before.length, dayKey, reason: 'done' };
}
