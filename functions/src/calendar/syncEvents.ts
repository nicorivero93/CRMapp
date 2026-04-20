import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import * as logger from 'firebase-functions/logger';
import { google, calendar_v3 } from 'googleapis';
import { db } from '../lib/admin';
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_REDIRECT,
} from './googleOAuth';

type GoogleTokens = {
  refresh_token?: string | null;
  access_token?: string | null;
  expiry_date?: number | null;
};

type EventData = {
  teamId: string;
  ownerId: string;
  title: string;
  start: { toDate?: () => Date } | string | Date;
  end: { toDate?: () => Date } | string | Date;
  attendees?: string[];
  status: 'confirmed' | 'canceled';
  googleEventId?: string;
};

function toIso(value: EventData['start']): string | null {
  if (!value) return null;
  if (typeof value === 'string') return new Date(value).toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
}

async function clientForUser(uid: string): Promise<InstanceType<typeof google.auth.OAuth2> | null> {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return null;
  const data = snap.data() as { googleTokens?: GoogleTokens } | undefined;
  const tokens = data?.googleTokens;
  if (!tokens?.refresh_token) return null;

  const oauth2 = new google.auth.OAuth2(
    GOOGLE_OAUTH_CLIENT_ID.value(),
    GOOGLE_OAUTH_CLIENT_SECRET.value(),
    GOOGLE_OAUTH_REDIRECT.value()
  );
  oauth2.setCredentials({
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token ?? undefined,
    expiry_date: tokens.expiry_date ?? undefined,
  });
  return oauth2;
}

export const syncEventToGoogle = onDocumentWritten(
  {
    document: 'events/{id}',
    region: 'us-central1',
    secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT],
  },
  async (event) => {
    const after = event.data?.after.data() as EventData | undefined;
    const before = event.data?.before.data() as EventData | undefined;
    const source = after ?? before;
    if (!source) return;

    // Anti-loop: if the only thing that changed is googleEventId (i.e. our own
    // write below), skip — there's nothing to push to Google.
    if (before && after) {
      const diff = Object.keys({ ...before, ...after }).filter(
        (k) => JSON.stringify((before as any)[k]) !== JSON.stringify((after as any)[k])
      );
      if (diff.length === 1 && diff[0] === 'googleEventId') return;
    }

    try {
      const oauth2 = await clientForUser(source.ownerId);
      if (!oauth2) {
        logger.info('syncEventToGoogle: owner has no googleTokens, skip', { ownerId: source.ownerId });
        return;
      }
      const calendar = google.calendar({ version: 'v3', auth: oauth2 });
      const eventId = event.params.id;

      // Deletion
      if (!after && before?.googleEventId) {
        await calendar.events.delete({ calendarId: 'primary', eventId: before.googleEventId }).catch((e) => {
          logger.warn('google delete failed', { err: (e as Error).message });
        });
        return;
      }

      if (!after) return;

      if (after.status === 'canceled' && after.googleEventId) {
        await calendar.events.delete({ calendarId: 'primary', eventId: after.googleEventId }).catch((e) => {
          logger.warn('google cancel delete failed', { err: (e as Error).message });
        });
        return;
      }

      const start = toIso(after.start);
      const end = toIso(after.end);
      if (!start || !end) {
        logger.warn('syncEventToGoogle: missing start/end', { eventId });
        return;
      }

      const body: calendar_v3.Schema$Event = {
        summary: after.title,
        start: { dateTime: start },
        end: { dateTime: end },
      };

      if (after.googleEventId) {
        await calendar.events.update({
          calendarId: 'primary',
          eventId: after.googleEventId,
          requestBody: body,
        });
      } else {
        const res = await calendar.events.insert({ calendarId: 'primary', requestBody: body });
        const gid = res.data.id;
        if (gid) {
          await event.data!.after.ref.update({ googleEventId: gid });
        }
      }
    } catch (err) {
      logger.error('syncEventToGoogle error', { err: (err as Error).message });
    }
  }
);
