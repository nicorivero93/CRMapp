import { eq } from 'drizzle-orm';
import { sessions, users, type UserRow } from '@mycrm/db';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { config } from '../config.js';

const SESSION_TTL_MS = config.sessionTtlDays * 24 * 60 * 60 * 1000;

export interface SessionWithUser {
  sessionId: string;
  expiresAt: Date;
  user: UserRow;
}

export function createSession(userId: string): { id: string; expiresAt: Date } {
  const db = getDb();
  const id = newId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.insert(sessions).values({ id, userId, expiresAt }).run();
  return { id, expiresAt };
}

export function validateSession(sessionId: string): SessionWithUser | null {
  const db = getDb();
  const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    invalidateSession(sessionId);
    return null;
  }
  const user = db.select().from(users).where(eq(users.id, session.userId)).get();
  if (!user) {
    invalidateSession(sessionId);
    return null;
  }
  let expiresAt = session.expiresAt;
  const halfLife = Date.now() + SESSION_TTL_MS / 2;
  if (expiresAt.getTime() < halfLife) {
    expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    db.update(sessions).set({ expiresAt }).where(eq(sessions.id, sessionId)).run();
  }
  return { sessionId: session.id, expiresAt, user };
}

export function invalidateSession(sessionId: string): void {
  const db = getDb();
  db.delete(sessions).where(eq(sessions.id, sessionId)).run();
}

export function invalidateAllUserSessions(userId: string): void {
  const db = getDb();
  db.delete(sessions).where(eq(sessions.userId, userId)).run();
}
