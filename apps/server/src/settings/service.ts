import { eq, inArray } from 'drizzle-orm';
import { appSettings } from '@mycrm/db';
import { appSettingsSchema, type AppSettings } from '@mycrm/shared';
import { getDb } from '../db/client.js';

export function getSettings(): AppSettings {
  const db = getDb();
  const rows = db
    .select()
    .from(appSettings)
    .where(inArray(appSettings.key, ['assignmentMode', 'timezone', 'defaultRecyclingDays']))
    .all();
  const raw: Record<string, unknown> = {};
  for (const r of rows) raw[r.key] = r.value;
  return appSettingsSchema.parse(raw);
}

export function patchSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb();
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const existing = db.select().from(appSettings).where(eq(appSettings.key, key)).get();
    if (existing) {
      db.update(appSettings).set({ value }).where(eq(appSettings.key, key)).run();
    } else {
      db.insert(appSettings).values({ key, value }).run();
    }
  }
  return getSettings();
}
