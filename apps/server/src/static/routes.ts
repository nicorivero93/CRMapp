import fs from 'node:fs';
import path from 'node:path';
import staticPlugin from '@fastify/static';
import type { buildApp } from '../app.js';
import { logger } from '../lib/logger.js';

type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * Serves the built web UI so clients can hit `http://host:3180` directly
 * without a separate frontend server. Looks for the static bundle in two
 * locations:
 *
 *   1. `<server-root>/public/`        (release layout — packed by
 *                                      build-release.ps1)
 *   2. `<repo-root>/apps/web/dist/`   (dev / monorepo checkout)
 *
 * If neither exists, the server still boots and only serves /api/. Useful
 * during development when `npm run dev` spins up Vite on :5173 and proxies
 * the API.
 *
 * SPA fallback: unknown GET routes that aren't /api/* return index.html so
 * client-side routing (React Router) works on deep-links.
 */
export async function registerStaticRoutes(app: App): Promise<void> {
  const candidates = [
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), '..', '..', 'apps', 'web', 'dist'),
  ];
  const root = candidates.find((p) => fs.existsSync(path.join(p, 'index.html')));
  if (!root) {
    logger.info({ looked: candidates }, 'static: no built web UI found, skipping (dev mode)');
    return;
  }
  logger.info({ root }, 'static: serving web UI');

  await app.register(staticPlugin, {
    root,
    prefix: '/',
    decorateReply: false,
    setHeaders: (res, filePath) => {
      // Cache hashed asset files aggressively (Vite fingerprints /assets/*).
      if (/[/\\]assets[/\\]/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  });

  // SPA fallback: anything that isn't /api/* and isn't a real static file
  // returns index.html so React Router can take over.
  app.setNotFoundHandler(async (req, reply) => {
    if (req.method !== 'GET') {
      reply.status(404).send({ error: 'Not found' });
      return;
    }
    if (req.url.startsWith('/api/')) {
      reply.status(404).send({ error: 'Not found', path: req.url });
      return;
    }
    const indexPath = path.join(root, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');
    reply.header('Cache-Control', 'no-cache').type('text/html').send(html);
  });
}
