import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { auth } from '../lib/admin';

// Sets custom auth claims {teamId, role} from users/{uid} so firestore.rules
// can rely on request.auth.token without extra reads.
async function applyClaims(uid: string, teamId?: string, role?: string) {
  if (!teamId || !role) return;
  try {
    await auth.setCustomUserClaims(uid, { teamId, role });
    logger.info('custom claims set', { uid, teamId, role });
  } catch (err) {
    logger.error('failed to set custom claims', err);
  }
}

export const onUserDocCreated = onDocumentCreated(
  { region: 'us-central1', document: 'users/{uid}' },
  async (event) => {
    const uid = event.params.uid;
    const data = event.data?.data();
    await applyClaims(uid, data?.teamId, data?.role);
  }
);

export const onUserDocUpdated = onDocumentUpdated(
  { region: 'us-central1', document: 'users/{uid}' },
  async (event) => {
    const uid = event.params.uid;
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!after) return;
    if (before?.teamId === after.teamId && before?.role === after.role) return;
    await applyClaims(uid, after.teamId, after.role);
  }
);
