import { logger } from '../lib/logger.js';
import type { SendParams, SendResult, WhatsAppChannel } from './channel.js';

export interface MetaCloudChannelConfig {
  phoneNumberId: string;
  accessToken: string;
  apiVersion?: string;
}

export class MetaCloudChannel implements WhatsAppChannel {
  constructor(private readonly cfg: MetaCloudChannelConfig) {}

  async send({ to, body }: SendParams): Promise<SendResult> {
    const digits = to.replace(/\D+/g, '');
    const version = this.cfg.apiVersion ?? 'v20.0';
    const url = `https://graph.facebook.com/${version}/${encodeURIComponent(this.cfg.phoneNumberId)}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: digits,
        type: 'text',
        text: { preview_url: false, body },
      }),
    });

    if (!res.ok) {
      const errText = await safeReadError(res);
      logger.warn({ status: res.status, err: errText }, 'meta cloud send failed');
      throw new MetaCloudSendError(`Meta Cloud ${res.status}: ${errText}`, res.status);
    }

    const payload = (await res.json()) as {
      messages?: Array<{ id: string }>;
    };
    const providerMessageId = payload.messages?.[0]?.id;
    if (!providerMessageId) {
      throw new MetaCloudSendError('Meta Cloud response missing message id', 502);
    }
    return { type: 'delivered', providerMessageId, preview: body };
  }
}

export class MetaCloudSendError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'MetaCloudSendError';
  }
}

async function safeReadError(res: Response): Promise<string> {
  try {
    const t = await res.text();
    if (t.length > 500) return t.slice(0, 500) + '…';
    return t;
  } catch {
    return '(body unreadable)';
  }
}
