import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { config } from './config.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './lib/errors.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerUserRoutes } from './users/routes.js';
import { registerHealthRoutes } from './health/routes.js';

export async function buildApp() {
  const app = Fastify({
    loggerInstance: logger,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: true, credentials: true });
  await app.register(cookie, { secret: config.cookieSecret });

  app.setErrorHandler(errorHandler);

  await registerAuthRoutes(app);
  await registerUserRoutes(app);
  await registerHealthRoutes(app);

  return app;
}
