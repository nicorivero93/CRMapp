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

let current: WhatsAppChannel = new ManualChannel();

export function getWhatsAppChannel(): WhatsAppChannel {
  return current;
}

/** Used by tests or L2.8 MetaCloud swap. */
export function setWhatsAppChannel(ch: WhatsAppChannel): void {
  current = ch;
}
