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
import { registerStreamRoutes } from './stream/routes.js';

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
  await registerStreamRoutes(app);

  return app;
}
