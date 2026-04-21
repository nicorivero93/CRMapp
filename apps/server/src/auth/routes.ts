import type { FastifyReply } from 'fastify';
import type { buildApp } from '../app.js';
type App = Awaited<ReturnType<typeof buildApp>>;
import { eq, sql } from 'drizzle-orm';
import { users } from '@mycrm/db';
import { loginSchema, signupOwnerSchema } from '@mycrm/shared';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from './password.js';
import { createSession, invalidateSession } from './session.js';
import { SESSION_COOKIE, loadSession, publicUser, requireAuth } from './middleware.js';
import { config } from '../config.js';

function setSessionCookie(reply: FastifyReply, sid: string, expires: Date): void {
  reply.setCookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !config.isDev,
    path: '/',
    expires,
  });
}

export async function registerAuthRoutes(app: App): Promise<void> {
  app.post('/api/auth/signup-owner', async (req, reply) => {
    const db = getDb();
    const existing = db.select({ n: sql<number>`count(*)` }).from(users).get();
    if (existing && existing.n > 0) {
      throw new AppError('OWNER_EXISTS', 'Owner already exists', 409);
    }
    const body = signupOwnerSchema.parse(req.body);
    const now = new Date();
    const id = newId();
    const passwordHash = await hashPassword(body.password);
    db.insert(users)
      .values({
        id,
        email: body.email,
        passwordHash,
        name: body.name,
        role: 'owner',
        isActive: true,
        dailyLeadTarget: 30,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const user = db.select().from(users).where(eq(users.id, id)).get()!;
    const session = createSession(id);
    setSessionCookie(reply, session.id, session.expiresAt);
    reply.status(201).send({ user: publicUser(user) });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const db = getDb();
    const user = db.select().from(users).where(eq(users.email, body.email)).get();
    if (!user || !user.isActive) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    const ok = await verifyPassword(user.passwordHash, body.password);
    if (!ok) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    const session = createSession(user.id);
    setSessionCookie(reply, session.id, session.expiresAt);
    return { user: publicUser(user) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await loadSession(req);
    if (req.currentSessionId) invalidateSession(req.currentSessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.status(204).send();
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (req) => {
    return { user: publicUser(req.currentUser!) };
  });
}
