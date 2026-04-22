export type SendResult =
  | { type: 'link'; url: string; preview: string }
  | { type: 'delivered'; providerMessageId: string; preview: string };

export interface SendParams {
  /** Destination phone, E.164 preferred. Anything with digits works. */
  to: string;
  /** Already-interpolated message body. */
  body: string;
}

export interface WhatsAppChannel {
  send(params: SendParams): Promise<SendResult>;
}

/** Default channel: returns a wa.me link for the frontend to `window.open`. */
export class ManualChannel implements WhatsAppChannel {
  async send({ to, body }: SendParams): Promise<SendResult> {
    const digits = to.replace(/\D+/g, '');
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
    return { type: 'link', url, preview: body };
  }
}

import { getWhatsAppChannelKind, revealMetaSecrets } from './settings.js';
import { MetaCloudChannel } from './metaCloud.js';

let override: WhatsAppChannel | null = null;

/**
 * Returns the channel configured in `appSettings`. Re-reads on every call so
 * the operator can flip Manual ↔ Meta Cloud without restarting the server.
 *
 * Tests / mocks can force a specific channel via `setWhatsAppChannel`.
 */
export function getWhatsAppChannel(): WhatsAppChannel {
  if (override) return override;
  try {
    if (getWhatsAppChannelKind() === 'meta-cloud') {
      const s = revealMetaSecrets();
      if (s.phoneNumberId && s.accessToken) {
        return new MetaCloudChannel({
          phoneNumberId: s.phoneNumberId,
          accessToken: s.accessToken,
        });
      }
    }
  } catch {
    /* fallthrough to manual */
  }
  return new ManualChannel();
}

/** For tests or explicit overrides. Pass null to restore dynamic selection. */
export function setWhatsAppChannel(ch: WhatsAppChannel | null): void {
  override = ch;
}
