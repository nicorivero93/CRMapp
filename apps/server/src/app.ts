import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './lib/errors.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerUserRoutes } from './users/routes.js';
import { registerHealthRoutes } from './health/routes.js';
import { registerLeadRoutes } from './leads/routes.js';
import { registerContactRoutes } from './contacts/routes.js';
import { registerStageRoutes } from './stages/routes.js';
import { registerDealRoutes } from './deals/routes.js';
import { registerEventRoutes } from './events/routes.js';
import { registerAutomationRoutes } from './automations/routes.js';
import { registerUpdaterRoutes } from './updater/routes.js';
import { registerStreamRoutes } from './stream/routes.js';
import { registerSettingsRoutes } from './settings/routes.js';
import { registerLineRoutes } from './lines/routes.js';
import { registerTemplateRoutes } from './templates/routes.js';
import { registerRecyclingRoutes } from './recycling/routes.js';
import { registerAnalyticsRoutes } from './analytics/routes.js';
import { registerWhatsAppWebhookRoutes } from './whatsapp/webhookRoutes.js';
import { registerWhatsAppSettingsRoutes } from './whatsapp/settingsRoutes.js';
import { registerStaticRoutes } from './static/routes.js';

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie, { secret: config.cookieSecret });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  app.setErrorHandler(errorHandler);

  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerHealthRoutes(app);
  await registerLeadRoutes(app);
  await registerContactRoutes(app);
  await registerStageRoutes(app);
  await registerDealRoutes(app);
  await registerEventRoutes(app);
  await registerAutomationRoutes(app);
  await registerUpdaterRoutes(app);
  await registerStreamRoutes(app);
  await registerSettingsRoutes(app);
  await registerLineRoutes(app);
  await registerTemplateRoutes(app);
  await registerRecyclingRoutes(app);
  await registerAnalyticsRoutes(app);
  await registerWhatsAppWebhookRoutes(app);
  await registerWhatsAppSettingsRoutes(app);
  // Register last: its SPA fallback catches all unhandled GETs.
  await registerStaticRoutes(app);

  return app;
}
