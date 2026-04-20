import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { db, FieldValue } from '../lib/admin';

type Row = Record<string, unknown>;

type ImportPayload = {
  teamId: string;
  rows: Row[];
  mapping?: Record<string, string>;
};

export const importContactsCsv = onCall(
  { region: 'us-central1', maxInstances: 10 },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');

    const { teamId, rows, mapping } = (request.data ?? {}) as ImportPayload;
    if (!teamId || !Array.isArray(rows)) {
      throw new HttpsError('invalid-argument', 'teamId and rows are required');
    }

    const teamSnap = await db.doc(`teams/${teamId}`).get();
    if (!teamSnap.exists) throw new HttpsError('not-found', 'Team not found');
    const team = teamSnap.data() as { members?: string[] } | undefined;
    if (!team?.members?.includes(uid)) {
      throw new HttpsError('permission-denied', 'Not a team member');
    }

    const assigneesSnap = await db
      .collection('users')
      .where('teamId', '==', teamId)
      .where('role', 'in', ['sales', 'owner'])
      .get();
    const assignees = assigneesSnap.docs.map((d) => d.id);
    if (assignees.length === 0) assignees.push(uid);

    let created = 0;
    let skipped = 0;
    let idx = 0;

    const BATCH_LIMIT = 400;
    let batch = db.batch();
    let inBatch = 0;

    const map = (row: Row, field: string, fallback: string): unknown => {
      const src = mapping?.[field] ?? fallback;
      return row[src] ?? row[field];
    };

    for (const row of rows) {
      const name = (map(row, 'name', 'name') as string | undefined)?.toString().trim();
      if (!name) {
        skipped++;
        continue;
      }
      const email = (map(row, 'email', 'email') as string | undefined)?.toString().trim() || undefined;
      const phone = (map(row, 'phone', 'phone') as string | undefined)?.toString().trim() || undefined;
      const company = (map(row, 'company', 'company') as string | undefined)?.toString().trim() || undefined;
      const country = (map(row, 'country', 'country') as string | undefined)?.toString().trim() || undefined;
      const industry = (map(row, 'industry', 'industry') as string | undefined)?.toString().trim() || undefined;
      const source = (map(row, 'source', 'source') as string | undefined)?.toString().trim() || 'csv';

      const ownerId = assignees[idx % assignees.length];
      idx++;

      const ref = db.collection('contacts').doc();
      batch.set(ref, {
        teamId,
        name,
        email,
        phone,
        company,
        country,
        industry,
        source,
        ownerId,
        status: 'active',
        createdAt: FieldValue.serverTimestamp(),
      });
      created++;
      inBatch++;

      if (inBatch >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        inBatch = 0;
      }
    }

    if (inBatch > 0) await batch.commit();

    logger.info('importContactsCsv done', { teamId, created, skipped });
    return { created, skipped };
  }
);
