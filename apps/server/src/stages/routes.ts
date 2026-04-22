import { asc, eq, sql } from 'drizzle-orm';
import { stages, deals, type StageRow } from '@mycrm/db';
import {
  createStageSchema,
  patchStageSchema,
  reorderStagesSchema,
  type StageDTO,
} from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { getDb } from '../db/client.js';
import { getRawSqlite } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

type App = Awaited<ReturnType<typeof buildApp>>;

function toDTO(row: StageRow): StageDTO {
  return {
    id: row.id,
    name: row.name,
    order: row.order,
    color: row.color ?? null,
    isClosedWon: row.isClosedWon,
  };
}

/**
 * Seed default stages for a fresh workspace. Called from signup-owner.
 * Idempotent: returns existing stages if any are already present.
 */
export function seedDefaultStages(_userId: string): StageDTO[] {
  const db = getDb();
  const existing = db.select().from(stages).orderBy(asc(stages.order)).all();
  if (existing.length > 0) return existing.map(toDTO);

  const defaults: Array<{ name: string; color: string; isClosedWon: boolean }> = [
    { name: 'Nuevo', color: '#6366f1', isClosedWon: false },
    { name: 'Contactado', color: '#f59e0b', isClosedWon: false },
    { name: 'Propuesta', color: '#10b981', isClosedWon: false },
    { name: 'Cerrado-Ganado', color: '#22c55e', isClosedWon: true },
  ];

  const rows: StageRow[] = [];
  for (let i = 0; i < defaults.length; i++) {
    const d = defaults[i]!;
    const id = newId();
    db.insert(stages)
      .values({
        id,
        name: d.name,
        order: i,
        color: d.color,
        isClosedWon: d.isClosedWon,
      })
      .run();
    rows.push(db.select().from(stages).where(eq(stages.id, id)).get()!);
  }
  return rows.map(toDTO);
}

export async function registerStageRoutes(app: App): Promise<void> {
  app.get('/api/stages', { preHandler: requireAuth }, async () => {
    const rows = getDb().select().from(stages).orderBy(asc(stages.order)).all();
    return { stages: rows.map(toDTO) };
  });

  app.post('/api/stages', { preHandler: requireRole('owner') }, async (req, reply) => {
    const body = createStageSchema.parse(req.body);
    const db = getDb();
    const maxRow = db
      .select({ m: sql<number | null>`max(${stages.order})` })
      .from(stages)
      .get();
    const nextOrder = (maxRow?.m ?? -1) + 1;
    const id = newId();
    db.insert(stages)
      .values({
        id,
        name: body.name,
        order: nextOrder,
        color: body.color ?? null,
        isClosedWon: body.isClosedWon,
      })
      .run();
    const created = db.select().from(stages).where(eq(stages.id, id)).get()!;
    reply.status(201).send({ stage: toDTO(created) });
  });

  app.patch('/api/stages/:id', { preHandler: requireRole('owner') }, async (req) => {
    const { id } = req.params as { id: string };
    const body = patchStageSchema.parse(req.body);
    const db = getDb();
    const existing = db.select().from(stages).where(eq(stages.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Stage no encontrado', 404);
    const patch: Partial<typeof stages.$inferInsert> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.color !== undefined) patch.color = body.color;
    if (body.isClosedWon !== undefined) patch.isClosedWon = body.isClosedWon;
    if (Object.keys(patch).length > 0) {
      db.update(stages).set(patch).where(eq(stages.id, id)).run();
    }
    const updated = db.select().from(stages).where(eq(stages.id, id)).get()!;
    return { stage: toDTO(updated) };
  });

  app.post('/api/stages/reorder', { preHandler: requireRole('owner') }, async (req) => {
    const body = reorderStagesSchema.parse(req.body);
    const db = getDb();
    const all = db.select().from(stages).all();
    if (all.length !== body.ids.length) {
      throw new AppError(
        'REORDER_MISMATCH',
        `Reorder incluye ${body.ids.length} ids pero hay ${all.length} stages`,
        400,
      );
    }
    const knownIds = new Set(all.map((s) => s.id));
    for (const id of body.ids) {
      if (!knownIds.has(id)) {
        throw new AppError('REORDER_UNKNOWN', `Stage desconocido: ${id}`, 400);
      }
    }
    const sqlite = getRawSqlite();
    const tx = sqlite.transaction((ids: string[]) => {
      for (let i = 0; i < ids.length; i++) {
        db.update(stages).set({ order: i }).where(eq(stages.id, ids[i]!)).run();
      }
    });
    tx(body.ids);
    const rows = db.select().from(stages).orderBy(asc(stages.order)).all();
    return { stages: rows.map(toDTO) };
  });

  app.delete('/api/stages/:id', { preHandler: requireRole('owner') }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const db = getDb();
    const existing = db.select().from(stages).where(eq(stages.id, id)).get();
    if (!existing) throw new AppError('NOT_FOUND', 'Stage no encontrado', 404);
    const hasDeals = db.select({ n: sql<number>`count(*)` }).from(deals).where(eq(deals.stageId, id)).get();
    if ((hasDeals?.n ?? 0) > 0) {
      throw new AppError(
        'STAGE_HAS_DEALS',
        'No se puede borrar: hay deals en esta stage. Movélos primero.',
        409,
      );
    }
    db.delete(stages).where(eq(stages.id, id)).run();
    reply.status(204).send();
  });
}
