import type { buildApp } from '../app.js';
import { requireAuth } from '../auth/middleware.js';
import { addSubscriber } from './sse.js';

type App = Awaited<ReturnType<typeof buildApp>>;

export async function registerStreamRoutes(app: App): Promise<void> {
  app.get('/api/stream', { preHandler: requireAuth }, async (req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders?.();
    reply.raw.write(`: connected\n\n`);

    const unsubscribe = addSubscriber(reply, req.currentUser!.id);
    req.raw.on('close', unsubscribe);
    req.raw.on('error', unsubscribe);

    // Keep the handler pending; fastify will not send the default response because
    // we've hijacked the raw response.
    return reply;
  });
}
