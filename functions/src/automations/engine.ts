import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { db, FieldValue } from '../lib/admin';
import { sendEmail, RESEND_API_KEY, RESEND_FROM } from '../lib/resend';
import { eventCanceled, welcome, followUp } from '../lib/email-templates';

type Action = { type: string; params: Record<string, unknown> };

type Rule = {
  id: string;
  teamId: string;
  enabled: boolean;
  trigger: { type: string; params?: Record<string, unknown> };
  conditions?: { field: string; op: string; value: unknown }[];
  actions: Action[];
};

type ExecCtx = {
  teamId: string;
  entity?: Record<string, unknown>;
  entityId?: string;
  entityType?: 'contact' | 'deal' | 'event';
};

async function resolveEmail(uid: string | undefined): Promise<string | null> {
  if (!uid) return null;
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as { email?: string } | undefined;
  return data?.email ?? null;
}

function getField(entity: Record<string, unknown> | undefined, field: string): unknown {
  if (!entity) return undefined;
  return entity[field];
}

function checkConditions(rule: Rule, entity: Record<string, unknown> | undefined): boolean {
  if (!rule.conditions || rule.conditions.length === 0) return true;
  return rule.conditions.every((c) => {
    const v = getField(entity, c.field);
    switch (c.op) {
      case 'eq': return v === c.value;
      case 'neq': return v !== c.value;
      case 'gt': return typeof v === 'number' && typeof c.value === 'number' && v > c.value;
      case 'lt': return typeof v === 'number' && typeof c.value === 'number' && v < c.value;
      case 'contains': return Array.isArray(v) && v.includes(c.value);
      default: return true;
    }
  });
}

export async function executeActions(actions: Action[], ctx: ExecCtx): Promise<void> {
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'sendEmail': {
          const to = (action.params.to as string) || (ctx.entity?.['email'] as string | undefined);
          const subject = (action.params.subject as string) || 'Notificación MyCRM';
          const html = (action.params.html as string) || `<p>${String(action.params.body ?? '')}</p>`;
          if (to) await sendEmail({ to, subject, html });
          break;
        }
        case 'welcomeEmail': {
          const to = (action.params.to as string) || (ctx.entity?.['email'] as string | undefined);
          const name = (ctx.entity?.['name'] as string | undefined) ?? 'there';
          if (to) {
            const { subject, html } = welcome(name);
            await sendEmail({ to, subject, html });
          }
          break;
        }
        case 'followUpEmail': {
          const ownerId = ctx.entity?.['ownerId'] as string | undefined;
          const to = await resolveEmail(ownerId);
          const title = (ctx.entity?.['title'] as string | undefined) ?? 'deal';
          if (to) {
            const { subject, html } = followUp(title, 'owner');
            await sendEmail({ to, subject, html });
          }
          break;
        }
        case 'assignOwner': {
          const ownerId = action.params.ownerId as string | undefined;
          if (ownerId && ctx.entityType && ctx.entityId) {
            await db.doc(`${collectionFor(ctx.entityType)}/${ctx.entityId}`).update({ ownerId });
          }
          break;
        }
        case 'createTask': {
          const title = (action.params.title as string) || 'Tarea automática';
          const dueInDays = Number(action.params.dueInDays ?? 1);
          const due = new Date(Date.now() + dueInDays * 24 * 60 * 60 * 1000);
          await db.collection('activities').add({
            teamId: ctx.teamId,
            type: 'task',
            title,
            done: false,
            dueAt: due,
            entityId: ctx.entityId ?? null,
            entityType: ctx.entityType ?? null,
            ownerId: (ctx.entity?.['ownerId'] as string | undefined) ?? null,
            createdAt: FieldValue.serverTimestamp(),
          });
          break;
        }
        case 'moveStage': {
          const stageId = action.params.stageId as string | undefined;
          if (stageId && ctx.entityType === 'deal' && ctx.entityId) {
            // Anti-loop: only move if the deal is not already in the target stage.
            const currentStage = ctx.entity?.['stageId'] as string | undefined;
            if (currentStage === stageId) break;
            await db.doc(`deals/${ctx.entityId}`).update({
              stageId,
              stageHistory: FieldValue.arrayUnion({ stageId, at: new Date() }),
            });
          }
          break;
        }
        case 'notifyUser': {
          const uid = (action.params.uid as string | undefined) ?? (ctx.entity?.['ownerId'] as string | undefined);
          const message = (action.params.message as string) ?? 'Tenés una notificación nueva';
          if (uid) {
            await db.collection('notifications').add({
              uid,
              teamId: ctx.teamId,
              message,
              read: false,
              createdAt: FieldValue.serverTimestamp(),
              entityId: ctx.entityId ?? null,
              entityType: ctx.entityType ?? null,
            });
          }
          break;
        }
        default:
          logger.warn('unknown action type', { type: action.type });
      }
    } catch (err) {
      logger.error('action failed', { type: action.type, err: (err as Error).message });
    }
  }
}

function collectionFor(t: 'contact' | 'deal' | 'event'): string {
  return t === 'contact' ? 'contacts' : t === 'deal' ? 'deals' : 'events';
}

async function loadRules(teamId: string, triggerType: string): Promise<Rule[]> {
  const snap = await db
    .collection('automations')
    .where('teamId', '==', teamId)
    .where('enabled', '==', true)
    .get();
  const rules: Rule[] = [];
  snap.forEach((d) => {
    const data = d.data() as Omit<Rule, 'id'>;
    if (data.trigger?.type === triggerType) rules.push({ id: d.id, ...data });
  });
  return rules;
}

export const onContactCreated = onDocumentCreated(
  { document: 'contacts/{id}', region: 'us-central1', secrets: [RESEND_API_KEY, RESEND_FROM] },
  async (event) => {
    const data = event.data?.data() as Record<string, unknown> | undefined;
    if (!data) return;
    const teamId = data['teamId'] as string | undefined;
    if (!teamId) return;
    const rules = await loadRules(teamId, 'contact.created');
    for (const rule of rules) {
      if (!checkConditions(rule, data)) continue;
      await executeActions(rule.actions, { teamId, entity: data, entityId: event.params.id, entityType: 'contact' });
    }
  }
);

export const onDealUpdated = onDocumentUpdated(
  { document: 'deals/{id}', region: 'us-central1', secrets: [RESEND_API_KEY, RESEND_FROM] },
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!before || !after) return;
    const teamId = after['teamId'] as string | undefined;
    if (!teamId) return;

    if (before['stageId'] !== after['stageId']) {
      const rules = await loadRules(teamId, 'deal.stageChanged');
      for (const rule of rules) {
        const paramStage = rule.trigger?.params?.['stageId'] as string | undefined;
        if (paramStage && paramStage !== after['stageId']) continue;
        if (!checkConditions(rule, after)) continue;
        await executeActions(rule.actions, { teamId, entity: after, entityId: event.params.id, entityType: 'deal' });
      }
    }
  }
);

export const onEventUpdated = onDocumentUpdated(
  { document: 'events/{id}', region: 'us-central1', secrets: [RESEND_API_KEY, RESEND_FROM] },
  async (event) => {
    const before = event.data?.before.data() as Record<string, unknown> | undefined;
    const after = event.data?.after.data() as Record<string, unknown> | undefined;
    if (!before || !after) return;
    const teamId = after['teamId'] as string | undefined;
    if (!teamId) return;

    const becameCanceled = before['status'] !== 'canceled' && after['status'] === 'canceled';
    if (!becameCanceled) return;

    try {
      const ownerId = after['ownerId'] as string | undefined;
      const attendees = (after['attendees'] as string[] | undefined) ?? [];
      const title = (after['title'] as string | undefined) ?? 'Evento';

      const [ownerSnap, attendeesSnap] = await Promise.all([
        ownerId ? db.doc(`users/${ownerId}`).get() : Promise.resolve(null),
        attendees.length > 0
          ? db.collection('users').where('__name__', 'in', attendees.slice(0, 10)).get()
          : Promise.resolve(null),
      ]);
      const canceler = ownerSnap && ownerSnap.exists ? (ownerSnap.data() as { name?: string; email?: string }) : { name: 'Alguien' };
      const recipients: { name?: string; email?: string }[] = [];
      attendeesSnap?.forEach((d) => {
        const u = d.data() as { name?: string; email?: string };
        if (u.email) recipients.push(u);
      });

      for (const att of recipients) {
        if (!att.email) continue;
        const { subject, html } = eventCanceled({ title }, att, canceler);
        await sendEmail({ to: att.email, subject, html });
      }
    } catch (err) {
      logger.error('onEventUpdated email fail', { err: (err as Error).message });
    }

    const rules = await loadRules(teamId, 'event.canceled');
    for (const rule of rules) {
      if (!checkConditions(rule, after)) continue;
      await executeActions(rule.actions, { teamId, entity: after, entityId: event.params.id, entityType: 'event' });
    }
  }
);

export const scheduledNoActivityCheck = onSchedule(
  { schedule: 'every 24 hours', region: 'us-central1', secrets: [RESEND_API_KEY, RESEND_FROM] },
  async () => {
    const snap = await db
      .collection('automations')
      .where('enabled', '==', true)
      .get();
    const rules: Rule[] = [];
    snap.forEach((d) => {
      const data = d.data() as Omit<Rule, 'id'>;
      if (data.trigger?.type === 'deal.noActivityFor') rules.push({ id: d.id, ...data });
    });

    for (const rule of rules) {
      const days = Number(rule.trigger?.params?.['days'] ?? 7);
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const dealsSnap = await db
        .collection('deals')
        .where('teamId', '==', rule.teamId)
        .get();

      for (const dealDoc of dealsSnap.docs) {
        const deal = dealDoc.data() as Record<string, unknown>;
        // skip won/closed if we have a closedAt
        if (deal['closedAt']) continue;

        const actSnap = await db
          .collection('activities')
          .where('teamId', '==', rule.teamId)
          .where('entityId', '==', dealDoc.id)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();

        const hasRecent = !actSnap.empty && (() => {
          const a = actSnap.docs[0].data() as { createdAt?: { toDate?: () => Date } };
          const ts = a.createdAt?.toDate?.();
          return ts ? ts > cutoff : false;
        })();

        if (hasRecent) continue;
        if (!checkConditions(rule, deal)) continue;

        await executeActions(rule.actions, {
          teamId: rule.teamId,
          entity: deal,
          entityId: dealDoc.id,
          entityType: 'deal',
        });
      }
    }
    logger.info('scheduledNoActivityCheck done', { rules: rules.length });
  }
);
