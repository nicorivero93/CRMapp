import { asc, eq } from 'drizzle-orm';
import { messageTemplates, type MessageTemplateRow } from '@mycrm/db';
import { createTemplateSchema, patchTemplateSchema, type TemplateDTO } from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

type App = Awaited<ReturnType<typeof buildApp>>;

function toDTO(row: MessageTemplateRow): TemplateDTO {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    category: row.category,
    isActive: row.isActive,
  };
}

export async function registerTemplateRoutes(app: App): Promise<void> {
  app.get('/api/templates', { preHandler: requireAuth }, async () => {
    const rows = getDb().select().from(messageTemplates).orderBy(asc(messageTemplates.name)).all();
    return { templates: rows.map(toDTO) };
  });

  app.post('/api/templates', { preHandler: requireRole('owner') }, async (req, reply) => {
    const body = createTemplateSchema.parse(req.body);
    const id = newId();
    const db = getDb();
    db.insert(messageTemplates)
      .values({
        id,
        name: body.name,
        body: body.body,
        category: body.category ?? null,
        isActive: body.isActive,
      })
      .run();
    const created = db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).get()!;
    reply.status(201).send({ template: toDTO(created) });
  });

  app.patch('/api/templates/:id', { preHandler: requireRole('owner') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchTemplateSchema.parse(req.body);
    const db = getDb();
    const existing = db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Template no encontrado', 404);
    const patch: Partial<typeof messageTemplates.$inferInsert> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.body !== undefined) patch.body = body.body;
    if (body.category !== undefined) patch.category = body.category;
    if (body.isActive !== undefined) patch.isActive = body.isActive;
    if (Object.keys(patch).length > 0) {
      db.update(messageTemplates).set(patch).where(eq(messageTemplates.id, id)).run();
    }
    const updated = db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).get()!;
    return { template: toDTO(updated) };
  });

  app.delete('/api/templates/:id', { preHandler: requireRole('owner') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const existing = db.select().from(messageTemplates).where(eq(messageTemplates.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Template no encontrado', 404);
    db.delete(messageTemplates).where(eq(messageTemplates.id, id)).run();
    reply.status(204).send();
  });
}
