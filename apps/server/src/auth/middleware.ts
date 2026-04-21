import type { FastifyReply, FastifyRequest } from 'fastify';
import type { UserRow } from '@mycrm/db';
import { validateSession } from './session.js';
import { AppError } from '../lib/errors.js';

export const SESSION_COOKIE = 'sessionId';

declare module 'fastify' {
  interface FastifyRequest {
    currentUser?: UserRow;
    currentSessionId?: string;
  }
}

export async function loadSession(req: FastifyRequest): Promise<void> {
  const sid = req.cookies[SESSION_COOKIE];
  if (!sid) return;
  const session = validateSession(sid);
  if (!session) return;
  req.currentUser = session.user;
  req.currentSessionId = session.sessionId;
}

export async function requireAuth(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  await loadSession(req);
  if (!req.currentUser) {
    throw new AppError('UNAUTHENTICATED', 'Authentication required', 401);
  }
}

export function requireRole(...roles: Array<UserRow['role']>) {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    await loadSession(req);
    if (!req.currentUser) {
      throw new AppError('UNAUTHENTICATED', 'Authentication required', 401);
    }
    if (!roles.includes(req.currentUser.role)) {
      throw new AppError('FORBIDDEN', 'Insufficient permissions', 403);
    }
  };
}

export function publicUser(u: UserRow) {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}
