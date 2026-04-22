import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { leads, leadEvents } from '@mycrm/db';
import type { buildApp } from '../app.js';
import { getDb } from '../db/client.js';
import { newId } from '../lib/ids.js';
import { logger } from '../lib/logger.js';
import { broadcast } from '../stream/sse.js';
import { getWebhookVerifyToken } from './settings.js';

type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * Meta Cloud API webhook handler.
 *
 * Meta calls these routes when configured as the callback URL in the
 * WhatsApp Business account. The server must be reachable from the public
 * internet — recommend Cloudflare Tunnel (free) if the client doesn't have a
 * public address.
 *
 * GET  — verification handshake: Meta sends hub.mode=subscribe, hub.verify_token,
 *        hub.challenge. We echo the challenge if the token matches.
 * POST — inbound messages + status updates. We match incoming texts to leads
 *        by phoneNormalized and register a `response-received` event.
 */
export async function registerWhatsAppWebhookRoutes(app: App): Promise<void> {
  app.get('/api/whatsapp/webhook', async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const mode = q['hub.mode'];
    const token = q['hub.verify_token'];
    const challenge = q['hub.challenge'];

    const stored = getWebhookVerifyToken();
    if (!stored) {
      reply.status(503).send({ error: 'Webhook not configured' });
      return;
    }
    if (mode === 'subscribe' && token === stored && challenge) {
      reply.header('content-type', 'text/plain').send(challenge);
      return;
    }
    reply.status(403).send({ error: 'forbidden' });
  });

  app.post('/api/whatsapp/webhook', async (req, reply) => {
    // Meta expects 200 OK within a few seconds or it retries. Process
    // synchronously because SQLite writes are fast; if we ever grow, queue it.
    try {
      const body = (req.body ?? {}) as MetaWebhookPayload;
      handleInboundPayload(body);
    } catch (err) {
      logger.warn({ err }, 'webhook processing error');
    }
    reply.status(200).send({ ok: true });
  });
}

interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string; display_phone_number?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: { type?: string };
        }>;
        statuses?: Array<{ id?: string; status?: string; recipient_id?: string }>;
      };
    }>;
  }>;
}

/** Parses the envelope and records events. Exported for tests. */
export function handleInboundPayload(payload: MetaWebhookPayload): {
  matched: number;
  unmatched: number;
} {
  let matched = 0;
  let unmatched = 0;
  const entries = payload.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      for (const msg of value.messages ?? []) {
        const from = msg.from;
        if (!from) continue;
        const bodyText = extractText(msg);
        const now = new Date();
        const result = recordInboundMessage({
          fromDigits: from,
          text: bodyText,
          providerMessageId: msg.id ?? null,
          now,
        });
        if (result.matched) matched++;
        else unmatched++;
      }
      // status callbacks (delivered/read) are ignored for now.
    }
  }
  return { matched, unmatched };
}

function extractText(msg: {
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
}): string {
  if (msg.type === 'text') return msg.text?.body ?? '';
  if (msg.type === 'button') return msg.button?.text ?? '(click)';
  return `(${msg.type ?? 'unknown'})`;
}

interface InboundRecord {
  fromDigits: string;
  text: string;
  providerMessageId: string | null;
  now: Date;
}

function recordInboundMessage(r: InboundRecord): { matched: boolean; leadId?: string } {
  const db = getDb();
  // Meta sends digits only (E.164 without +). Match against phoneNormalized
  // which for AR leads will be like `+5491122334455`.
  const key = r.fromDigits.startsWith('+') ? r.fromDigits : `+${r.fromDigits}`;
  const match = db
    .select()
    .from(leads)
    .where(
      and(
        eq(leads.phoneNormalized, key),
        isNotNull(leads.assignedTo), // only care about tracked/owned leads
      ),
    )
    .get();

  // Fallback: digits-only comparison (drops + prefix in stored keys too)
  let lead = match;
  if (!lead) {
    const digitsOnly = r.fromDigits.replace(/\D+/g, '');
    const rows = db
      .select()
      .from(leads)
      .where(sql`replace(${leads.phoneNormalized}, '+', '') = ${digitsOnly}`)
      .all();
    lead = rows[0];
  }
  if (!lead) {
    logger.info({ fromDigits: r.fromDigits }, 'webhook: unmatched inbound');
    return { matched: false };
  }

  db.insert(leadEvents)
    .values({
      id: newId(),
      leadId: lead.id,
      at: r.now,
      type: 'response-received',
      byUserId: null,
      meta: { providerMessageId: r.providerMessageId, text: r.text.slice(0, 1000) },
    })
    .run();

  const nextStatus: typeof lead.status = lead.status === 'responded' ? 'responded' : 'responded';
  db.update(leads)
    .set({
      status: nextStatus,
      responseCount: lead.responseCount + 1,
      lastContactAt: r.now,
      updatedAt: r.now,
    })
    .where(eq(leads.id, lead.id))
    .run();

  const updated = db.select().from(leads).where(eq(leads.id, lead.id)).get();
  if (updated) {
    broadcast('lead.updated', toDTOLight(updated));
    broadcast('lead.event-added', { leadId: lead.id });
  }
  return { matched: true, leadId: lead.id };
}

function toDTOLight(row: typeof leads.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    phoneNormalized: row.phoneNormalized,
    source: row.source,
    sourceMeta: row.sourceMeta,
    importBatchId: row.importBatchId,
    status: row.status,
    assignedTo: row.assignedTo,
    assignedAt: row.assignedAt?.toISOString() ?? null,
    firstContactAt: row.firstContactAt?.toISOString() ?? null,
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    responseCount: row.responseCount,
    noResponseCount: row.noResponseCount,
    recycledCount: row.recycledCount,
    lastRecycledAt: row.lastRecycledAt?.toISOString() ?? null,
    tags: (row.tags as string[] | null) ?? [],
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
  };
}
