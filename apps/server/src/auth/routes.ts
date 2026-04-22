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
import { seedDefaultStages } from '../stages/routes.js';
import { SESSION_COOKIE, loadSession, publicUser, requireAuth } from './middleware.js';
import { config } from '../config.js';

// In-memory login rate limit: 5 failed attempts per IP per 60s window.
// Intentionally simple — single-PC deploy, no need for redis/etc.
const LOGIN_LIMIT_MAX = 5;
const LOGIN_LIMIT_WINDOW_MS = 60_000;
interface Bucket { count: number; resetAt: number; }
const loginAttempts = new Map<string, Bucket>();

function checkLoginRate(ip: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = loginAttempts.get(ip);
  if (!b || b.resetAt < now) {
    loginAttempts.set(ip, { count: 0, resetAt: now + LOGIN_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }
  if (b.count >= LOGIN_LIMIT_MAX) {
    return { allowed: false, retryAfterSec: Math.ceil((b.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const b = loginAttempts.get(ip);
  if (!b || b.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_LIMIT_WINDOW_MS });
  } else {
    b.count += 1;
  }
}

function clearLoginAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

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
  app.get('/api/auth/status', async () => {
    const db = getDb();
    const row = db.select({ n: sql<number>`count(*)` }).from(users).get();
    return { ownerExists: !!row && row.n > 0 };
  });

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
    // Seed pipeline defaults for this brand-new installation.
    try { seedDefaultStages(id); } catch (err) { req.log.warn({ err }, 'seedDefaultStages failed'); }
    const session = createSession(id);
    setSessionCookie(reply, session.id, session.expiresAt);
    reply.status(201).send({ user: publicUser(user) });
  });

  app.post('/api/auth/login', async (req, reply) => {
    const ip = req.ip ?? 'unknown';
    const gate = checkLoginRate(ip);
    if (!gate.allowed) {
      reply.header('retry-after', String(gate.retryAfterSec));
      throw new AppError(
        'RATE_LIMITED',
        `Demasiados intentos. Probá de nuevo en ${gate.retryAfterSec}s.`,
        429,
      );
    }
    const body = loginSchema.parse(req.body);
    const db = getDb();
    const user = db.select().from(users).where(eq(users.email, body.email)).get();
    if (!user || !user.isActive) {
      recordLoginFailure(ip);
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    const ok = await verifyPassword(user.passwordHash, body.password);
    if (!ok) {
      recordLoginFailure(ip);
      throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password', 401);
    }
    clearLoginAttempts(ip);
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
