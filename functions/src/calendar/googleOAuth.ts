import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { google } from 'googleapis';
import { db } from '../lib/admin';

export const GOOGLE_OAUTH_CLIENT_ID = defineSecret('GOOGLE_OAUTH_CLIENT_ID');
export const GOOGLE_OAUTH_CLIENT_SECRET = defineSecret('GOOGLE_OAUTH_CLIENT_SECRET');
export const GOOGLE_OAUTH_REDIRECT = defineSecret('GOOGLE_OAUTH_REDIRECT');

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const POST_REDIRECT = 'https://crm-app-31a8f.web.app/app/calendar';

function makeClient(): InstanceType<typeof google.auth.OAuth2> {
  return new google.auth.OAuth2(
    GOOGLE_OAUTH_CLIENT_ID.value(),
    GOOGLE_OAUTH_CLIENT_SECRET.value(),
    GOOGLE_OAUTH_REDIRECT.value()
  );
}

export const googleOAuthStart = onRequest(
  {
    region: 'us-central1',
    secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT],
    cors: true,
  },
  async (req, res) => {
    const uid = String(req.query.uid ?? '');
    if (!uid) {
      res.status(400).send('Missing uid');
      return;
    }
    const oauth2 = makeClient();
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state: uid,
    });
    res.redirect(url);
  }
);

export const googleOAuthCallback = onRequest(
  {
    region: 'us-central1',
    secrets: [GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT],
  },
  async (req, res) => {
    const code = String(req.query.code ?? '');
    const uid = String(req.query.state ?? '');
    if (!code || !uid) {
      res.status(400).send('Missing code or state');
      return;
    }
    try {
      const oauth2 = makeClient();
      const { tokens } = await oauth2.getToken(code);
      await db.doc(`users/${uid}`).set(
        {
          googleTokens: {
            refresh_token: tokens.refresh_token ?? null,
            access_token: tokens.access_token ?? null,
            expiry_date: tokens.expiry_date ?? null,
            scope: tokens.scope ?? null,
            token_type: tokens.token_type ?? null,
          },
        },
        { merge: true }
      );
      res.redirect(POST_REDIRECT);
    } catch (err) {
      logger.error('googleOAuthCallback error', { err: (err as Error).message });
      res.status(500).send('OAuth failed');
    }
  }
);
