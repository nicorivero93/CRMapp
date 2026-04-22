import { and, eq, ne } from 'drizzle-orm';
import { users, whatsappLines, type WhatsappLineRow } from '@mycrm/db';
import { createLineSchema, patchLineSchema, type LineDTO } from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { AppError } from '../lib/errors.js';
import { requireAuth } from '../auth/middleware.js';

type App = Awaited<ReturnType<typeof buildApp>>;

function toDTO(row: WhatsappLineRow): LineDTO {
  return {
    id: row.id,
    ownerId: row.ownerId,
    phone: row.phone,
    label: row.label,
    isActive: row.isActive,
    dailyCapMessages: row.dailyCapMessages,
    dailyCount: row.dailyCount,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    restrictedAt: row.restrictedAt?.toISOString() ?? null,
  };
}

function requireOwnLine(lineId: string, userId: string): WhatsappLineRow {
  const row = getDb().select().from(whatsappLines).where(eq(whatsappLines.id, lineId)).get();
  if (!row) throw new AppError('NOT_FOUND', 'Línea no encontrada', 404);
  if (row.ownerId !== userId) throw new AppError('FORBIDDEN', 'No es tu línea', 403);
  return row;
}

export async function registerLineRoutes(app: App): Promise<void> {
  app.get('/api/lines', { preHandler: requireAuth }, async (req) => {
    const rows = getDb()
      .select()
      .from(whatsappLines)
      .where(eq(whatsappLines.ownerId, req.currentUser!.id))
      .all();
    return { lines: rows.map(toDTO) };
  });

  app.post('/api/lines', { preHandler: requireAuth }, async (req, reply) => {
    const body = createLineSchema.parse(req.body);
    const id = newId();
    const db = getDb();
    db.insert(whatsappLines)
      .values({
        id,
        ownerId: req.currentUser!.id,
        phone: body.phone,
        label: body.label ?? null,
        isActive: false,
        dailyCapMessages: body.dailyCapMessages,
        dailyCount: 0,
      })
      .run();
    const created = db.select().from(whatsappLines).where(eq(whatsappLines.id, id)).get()!;
    reply.status(201).send({ line: toDTO(created) });
  });

  app.patch('/api/lines/:id', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    requireOwnLine(id, req.currentUser!.id);
    const body = patchLineSchema.parse(req.body);
    const db = getDb();
    const patch: Partial<typeof whatsappLines.$inferInsert> = {};
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.label !== undefined) patch.label = body.label;
    if (body.dailyCapMessages !== undefined) patch.dailyCapMessages = body.dailyCapMessages;
    if (Object.keys(patch).length > 0) {
      db.update(whatsappLines).set(patch).where(eq(whatsappLines.id, id)).run();
    }
    const updated = db.select().from(whatsappLines).where(eq(whatsappLines.id, id)).get()!;
    return { line: toDTO(updated) };
  });

  app.delete('/api/lines/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const line = requireOwnLine(id, req.currentUser!.id);
    const db = getDb();
    db.delete(whatsappLines).where(eq(whatsappLines.id, id)).run();
    // Unset users.activeLineId if it pointed to this line
    if (line.isActive) {
      db.update(users)
        .set({ activeLineId: null, updatedAt: new Date() })
        .where(eq(users.id, req.currentUser!.id))
        .run();
    }
    reply.status(204).send();
  });

  app.post('/api/lines/:id/activate', { preHandler: requireAuth }, async (req) => {
    const { id } = req.params as { id: string };
    requireOwnLine(id, req.currentUser!.id);
    const db = getDb();
    const now = new Date();
    // Deactivate siblings, activate target, sync user.activeLineId.
    db.update(whatsappLines)
      .set({ isActive: false })
      .where(and(eq(whatsappLines.ownerId, req.currentUser!.id), ne(whatsappLines.id, id)))
      .run();
    db.update(whatsappLines).set({ isActive: true }).where(eq(whatsappLines.id, id)).run();
    db.update(users)
      .set({ activeLineId: id, updatedAt: now })
      .where(eq(users.id, req.currentUser!.id))
      .run();
    const updated = db.select().from(whatsappLines).where(eq(whatsappLines.id, id)).get()!;
    return { line: toDTO(updated) };
  });
}
