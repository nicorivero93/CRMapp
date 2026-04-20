import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { randomUUID } from 'crypto';
import * as logger from 'firebase-functions/logger';
import { db, auth, FieldValue } from '../lib/admin';
import { sendEmail, RESEND_API_KEY, RESEND_FROM } from '../lib/resend';
import { inviteSent } from '../lib/email-templates';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CreateInvitePayload = { email: string; role: 'owner' | 'sales' | 'member' };
type AcceptInvitePayload = { token: string };

export const createInvite = onCall(
  { region: 'us-central1', secrets: [RESEND_API_KEY, RESEND_FROM] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

    const { email, role } = (request.data ?? {}) as CreateInvitePayload;
    if (!email || !role) throw new HttpsError('invalid-argument', 'email and role required');

    const teamId = request.auth?.token?.teamId as string | undefined;
    const callerRole = request.auth?.token?.role as string | undefined;
    if (!teamId) throw new HttpsError('failed-precondition', 'No team in claims');
    if (callerRole !== 'owner') throw new HttpsError('permission-denied', 'Only owner can invite');

    const teamSnap = await db.doc(`teams/${teamId}`).get();
    const team = teamSnap.exists ? (teamSnap.data() as { name?: string } | undefined) : undefined;

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    const ref = await db.collection('invites').add({
      token,
      email: email.toLowerCase(),
      role,
      teamId,
      invitedBy: uid,
      expiresAt,
      createdAt: FieldValue.serverTimestamp(),
    });

    const inviterSnap = await db.doc(`users/${uid}`).get();
    const inviter = inviterSnap.exists ? (inviterSnap.data() as { name?: string } | undefined) : undefined;

    const acceptLink = `https://crm-app-31a8f.web.app/accept-invite?token=${encodeURIComponent(token)}`;
    const { subject, html } = inviteSent(inviter?.name ?? 'Alguien', team?.name ?? 'el team', acceptLink);
    await sendEmail({ to: email, subject, html });

    logger.info('invite created', { inviteId: ref.id, teamId, email });
    return { id: ref.id, token, expiresAt: expiresAt.toISOString() };
  }
);

export const acceptInvite = onCall(
  { region: 'us-central1' },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

    const { token } = (request.data ?? {}) as AcceptInvitePayload;
    if (!token) throw new HttpsError('invalid-argument', 'token required');

    const snap = await db.collection('invites').where('token', '==', token).limit(1).get();
    if (snap.empty) throw new HttpsError('not-found', 'Invite not found');
    const inviteDoc = snap.docs[0];
    const invite = inviteDoc.data() as {
      teamId: string;
      role: 'owner' | 'sales' | 'member';
      expiresAt: { toDate?: () => Date } | Date;
    };

    const expiresAtDate =
      invite.expiresAt instanceof Date
        ? invite.expiresAt
        : typeof (invite.expiresAt as { toDate?: () => Date }).toDate === 'function'
        ? (invite.expiresAt as { toDate: () => Date }).toDate()
        : null;
    if (!expiresAtDate || expiresAtDate.getTime() < Date.now()) {
      throw new HttpsError('deadline-exceeded', 'Invite expired');
    }

    await db.doc(`teams/${invite.teamId}`).update({
      members: FieldValue.arrayUnion(uid),
    });

    await db.doc(`users/${uid}`).set(
      { teamId: invite.teamId, role: invite.role },
      { merge: true }
    );

    await auth.setCustomUserClaims(uid, { teamId: invite.teamId, role: invite.role });

    await inviteDoc.ref.delete();

    logger.info('invite accepted', { uid, teamId: invite.teamId, role: invite.role });
    return { teamId: invite.teamId, role: invite.role };
  }
);
