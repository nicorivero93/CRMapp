import { patchSettingsSchema } from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { getSettings, patchSettings } from './service.js';

type App = Awaited<ReturnType<typeof buildApp>>;

export async function registerSettingsRoutes(app: App): Promise<void> {
  app.get('/api/settings', { preHandler: requireAuth }, async () => {
    return { settings: getSettings() };
  });

  app.patch('/api/settings', { preHandler: requireRole('owner') }, async (req) => {
    const body = patchSettingsSchema.parse(req.body);
    const settings = patchSettings(body);
    return { settings };
  });
}
