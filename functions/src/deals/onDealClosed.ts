import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { db, FieldValue } from '../lib/admin';
import { sendEmail, RESEND_API_KEY, RESEND_FROM } from '../lib/resend';
import { dealClosed } from '../lib/email-templates';

type Deal = {
  teamId: string;
  title: string;
  company?: string;
  value?: number;
  currency?: string;
  stageId: string;
  ownerId: string;
  closedAt?: unknown;
};

type Stage = { id: string; name: string; isClosedWon?: boolean };

export const onDealClosed = onDocumentUpdated(
  {
    document: 'deals/{id}',
    region: 'us-central1',
    secrets: [RESEND_API_KEY, RESEND_FROM],
  },
  async (event) => {
    const before = event.data?.before.data() as Deal | undefined;
    const after = event.data?.after.data() as Deal | undefined;
    if (!before || !after) return;
    if (before.stageId === after.stageId) return;

    try {
      const teamSnap = await db.doc(`teams/${after.teamId}`).get();
      if (!teamSnap.exists) {
        logger.warn('onDealClosed: team not found', { teamId: after.teamId });
        return;
      }
      const team = teamSnap.data() as { stages?: Stage[]; name?: string; ownerId?: string } | undefined;
      const stages = team?.stages ?? [];
      const newStage = stages.find((s) => s.id === after.stageId);
      if (!newStage?.isClosedWon) return;

      logger.info('onDealClosed: deal won', { dealId: event.params.id, teamId: after.teamId });

      if (!after.closedAt) {
        await event.data!.after.ref.update({ closedAt: FieldValue.serverTimestamp() });
      }

      const [ownerSnap, teamOwnerSnap] = await Promise.all([
        db.doc(`users/${after.ownerId}`).get(),
        team?.ownerId ? db.doc(`users/${team.ownerId}`).get() : Promise.resolve(null),
      ]);
      const owner = ownerSnap.exists ? (ownerSnap.data() as { name?: string; email?: string }) : null;
      const teamOwner = teamOwnerSnap && teamOwnerSnap.exists ? (teamOwnerSnap.data() as { name?: string; email?: string }) : null;

      const recipients = new Set<string>();
      if (owner?.email) recipients.add(owner.email);
      if (teamOwner?.email) recipients.add(teamOwner.email);

      if (recipients.size === 0) {
        logger.warn('onDealClosed: no recipients', { dealId: event.params.id });
        return;
      }

      const { subject, html } = dealClosed(
        { title: after.title, value: after.value, currency: after.currency, company: after.company },
        { name: owner?.name, email: owner?.email }
      );
      await sendEmail({ to: Array.from(recipients), subject, html });
    } catch (err) {
      logger.error('onDealClosed error', { err: (err as Error).message });
    }
  }
);
