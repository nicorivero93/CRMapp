import { eq } from 'drizzle-orm';
import { appSettings } from '@mycrm/db';
import type { MetaConfigInput, WhatsAppChannelKind } from '@mycrm/shared';
import { getDb } from '../db/client.js';
import { decryptSecret, encryptSecret, tryDecrypt } from '../lib/secrets.js';

const KEY_CHANNEL = 'whatsappChannel';
const KEY_META = 'whatsappMetaConfig';

interface StoredMeta {
  phoneNumberId: string | null;
  businessId: string | null;
  accessTokenEnc: string | null;
  webhookVerifyTokenEnc: string | null;
}

export function getWhatsAppChannelKind(): WhatsAppChannelKind {
  const row = getDb().select().from(appSettings).where(eq(appSettings.key, KEY_CHANNEL)).get();
  const v = row?.value as string | undefined;
  return v === 'meta-cloud' ? 'meta-cloud' : 'manual';
}

export function setWhatsAppChannelKind(kind: WhatsAppChannelKind): void {
  const db = getDb();
  const existing = db.select().from(appSettings).where(eq(appSettings.key, KEY_CHANNEL)).get();
  if (existing) {
    db.update(appSettings).set({ value: kind }).where(eq(appSettings.key, KEY_CHANNEL)).run();
  } else {
    db.insert(appSettings).values({ key: KEY_CHANNEL, value: kind }).run();
  }
}

function readStoredMeta(): StoredMeta {
  const row = getDb().select().from(appSettings).where(eq(appSettings.key, KEY_META)).get();
  if (!row) {
    return { phoneNumberId: null, businessId: null, accessTokenEnc: null, webhookVerifyTokenEnc: null };
  }
  const v = row.value as StoredMeta;
  return {
    phoneNumberId: v.phoneNumberId ?? null,
    businessId: v.businessId ?? null,
    accessTokenEnc: v.accessTokenEnc ?? null,
    webhookVerifyTokenEnc: v.webhookVerifyTokenEnc ?? null,
  };
}

export interface MetaSecretsReveal {
  phoneNumberId: string | null;
  businessId: string | null;
  accessToken: string | null;
  webhookVerifyToken: string | null;
}

export function revealMetaSecrets(): MetaSecretsReveal {
  const stored = readStoredMeta();
  return {
    phoneNumberId: stored.phoneNumberId,
    businessId: stored.businessId,
    accessToken: tryDecrypt(stored.accessTokenEnc),
    webhookVerifyToken: tryDecrypt(stored.webhookVerifyTokenEnc),
  };
}

/**
 * Patch the stored Meta config. Secrets are encrypted; non-secret ids stored
 * plain. Missing keys in the patch are left untouched so the operator can
 * update one field at a time (e.g. rotate the access token).
 */
export function patchMetaSecrets(patch: Partial<MetaConfigInput>): void {
  const current = readStoredMeta();
  const next: StoredMeta = {
    phoneNumberId: patch.phoneNumberId ?? current.phoneNumberId,
    businessId: patch.businessId ?? current.businessId,
    accessTokenEnc: patch.accessToken ? encryptSecret(patch.accessToken) : current.accessTokenEnc,
    webhookVerifyTokenEnc: patch.webhookVerifyToken
      ? encryptSecret(patch.webhookVerifyToken)
      : current.webhookVerifyTokenEnc,
  };
  const db = getDb();
  const existing = db.select().from(appSettings).where(eq(appSettings.key, KEY_META)).get();
  if (existing) {
    db.update(appSettings).set({ value: next }).where(eq(appSettings.key, KEY_META)).run();
  } else {
    db.insert(appSettings).values({ key: KEY_META, value: next }).run();
  }
}

export interface MetaStatusDTO {
  configured: boolean;
  phoneNumberId: string | null;
  businessId: string | null;
  hasAccessToken: boolean;
  hasWebhookVerifyToken: boolean;
}

export function metaStatus(): MetaStatusDTO {
  const s = readStoredMeta();
  const tokenOk = !!s.accessTokenEnc && !!tryDecrypt(s.accessTokenEnc);
  const vtokOk = !!s.webhookVerifyTokenEnc && !!tryDecrypt(s.webhookVerifyTokenEnc);
  return {
    configured: !!s.phoneNumberId && !!s.businessId && tokenOk && vtokOk,
    phoneNumberId: s.phoneNumberId,
    businessId: s.businessId,
    hasAccessToken: tokenOk,
    hasWebhookVerifyToken: vtokOk,
  };
}

/** Read helper for the webhook route: returns the plaintext verify token. */
export function getWebhookVerifyToken(): string | null {
  const stored = readStoredMeta();
  return tryDecrypt(stored.webhookVerifyTokenEnc);
}
