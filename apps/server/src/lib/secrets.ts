import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { config } from '../config.js';

/**
 * AES-256-GCM wrapping for secrets stored in app_settings.
 * Key is derived from COOKIE_SECRET via scrypt (local-edition trust model:
 * anyone with process env access already has full DB access). Rotating the
 * cookie secret invalidates stored secrets — they must be re-entered.
 */

const MAGIC = 'scgm1'; // scheme marker so we can rotate algorithms later
const KEY_SALT = 'mycrm-secret-v1';
let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  _key = scryptSync(config.cookieSecret, KEY_SALT, 32);
  return _key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [MAGIC, iv.toString('base64'), ct.toString('base64'), tag.toString('base64')].join('.');
}

export function decryptSecret(enc: string): string {
  const parts = enc.split('.');
  if (parts.length !== 4 || parts[0] !== MAGIC) {
    throw new Error('Invalid secret envelope');
  }
  const [, ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64!, 'base64');
  const ct = Buffer.from(ctB64!, 'base64');
  const tag = Buffer.from(tagB64!, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

export function tryDecrypt(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}
