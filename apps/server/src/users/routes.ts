import type { buildApp } from '../app.js';
type App = Awaited<ReturnType<typeof buildApp>>;
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '@mycrm/db';
import { createUserSchema, patchUserSchema } from '@mycrm/shared';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { AppError } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { invalidateAllUserSessions, createSession } from '../auth/session.js';
import { SESSION_COOKIE } from '../auth/middleware.js';
import { config } from '../config.js';
import { publicUser, requireAuth, requireRole } from '../auth/middleware.js';

const idParam = z.object({ id: z.string().min(1) });

export async function registerUserRoutes(app: App): Promise<void> {
  app.get('/api/users', { preHandler: requireAuth }, async () => {
    const db = getDb();
    const rows = db.select().from(users).all();
    return { users: rows.map(publicUser) };
  });

  app.post('/api/users', { preHandler: requireRole('owner') }, async (req, reply) => {
    const body = createUserSchema.parse(req.body);
    const db = getDb();
    const dup = db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.email, body.email))
      .get();
    if (dup && dup.n > 0) {
      throw new AppError('EMAIL_TAKEN', 'Email already registered', 409);
    }
    const now = new Date();
    const id = newId();
    const passwordHash = await hashPassword(body.password);
    db.insert(users)
      .values({
        id,
        email: body.email,
        passwordHash,
        name: body.name,
        role: body.role ?? 'sales',
        isActive: true,
        dailyLeadTarget: body.dailyLeadTarget ?? 30,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    const created = db.select().from(users).where(eq(users.id, id)).get()!;
    reply.status(201).send({ user: publicUser(created) });
  });

  app.patch('/api/users/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = patchUserSchema.parse(req.body);
    const me = req.currentUser!;
    const isSelf = me.id === id;
    const isOwner = me.role === 'owner';

    if (!isOwner && !isSelf) {
      throw new AppError('FORBIDDEN', 'Cannot edit other users', 403);
    }
    if (!isOwner) {
      // self-edit: only activeLineId allowed
      const allowed = new Set(['activeLineId']);
      for (const k of Object.keys(body)) {
        if (!allowed.has(k)) {
          throw new AppError('FORBIDDEN', `Cannot self-edit field: ${k}`, 403);
        }
      }
    }

    const db = getDb();
    const target = db.select().from(users).where(eq(users.id, id)).get();
    if (!target) throw new AppError('NOT_FOUND', 'User not found', 404);

    const patch: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) patch.name = body.name;
    if (body.role !== undefined) patch.role = body.role;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    if (body.dailyLeadTarget !== undefined) patch.dailyLeadTarget = body.dailyLeadTarget;
    if (body.activeLineId !== undefined) patch.activeLineId = body.activeLineId;
    const pwChanged = body.password !== undefined;
    if (pwChanged) {
      // When a user changes their own password, require the current one to
      // prevent session-hijacking from rotating creds. Owner patching
      // somebody else's password skips this check (admin reset flow).
      if (isSelf) {
        if (!body.currentPassword) {
          throw new AppError('CURRENT_PASSWORD_REQUIRED', 'Enviá la contraseña actual.', 400);
        }
        const ok = await verifyPassword(target.passwordHash, body.currentPassword);
        if (!ok) {
          throw new AppError('INVALID_CREDENTIALS', 'La contraseña actual no coincide.', 401);
        }
      }
      patch.passwordHash = await hashPassword(body.password!);
      // Kill every session for this user; re-issue a fresh cookie below so
      // the caller doesn't get logged out of THIS tab.
      invalidateAllUserSessions(id);
    }

    db.update(users).set(patch).where(eq(users.id, id)).run();
    const updated = db.select().from(users).where(eq(users.id, id)).get()!;

    if (pwChanged && isSelf) {
      const session = createSession(id);
      reply.setCookie(SESSION_COOKIE, session.id, {
        httpOnly: true,
        sameSite: 'lax',
        secure: !config.isDev,
        path: '/',
        expires: session.expiresAt,
      });
    }

    return { user: publicUser(updated) };
  });

  app.delete('/api/users/:id', { preHandler: requireRole('owner') }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (req.currentUser!.id === id) {
      throw new AppError('FORBIDDEN', 'Cannot delete yourself', 403);
    }
    const db = getDb();
    const target = db.select().from(users).where(eq(users.id, id)).get();
    if (!target) throw new AppError('NOT_FOUND', 'User not found', 404);
    db.delete(users).where(eq(users.id, id)).run();
    reply.status(204).send();
  });
}
