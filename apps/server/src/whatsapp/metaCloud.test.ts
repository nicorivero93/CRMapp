import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaCloudChannel, MetaCloudSendError } from './metaCloud.js';

describe('MetaCloudChannel', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('posts to graph.facebook.com with bearer + text body and returns providerMessageId', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.ABC123' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as any;

    const ch = new MetaCloudChannel({ phoneNumberId: '111222', accessToken: 'TOK' });
    const r = await ch.send({ to: '+54 9 11 2233-4455', body: 'Hola' });

    expect(r.type).toBe('delivered');
    if (r.type === 'delivered') {
      expect(r.providerMessageId).toBe('wamid.ABC123');
      expect(r.preview).toBe('Hola');
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('graph.facebook.com');
    expect(calls[0]!.url).toContain('/111222/messages');
    const h = calls[0]!.init!.headers as Record<string, string>;
    expect(h.Authorization).toBe('Bearer TOK');
    const body = JSON.parse(calls[0]!.init!.body as string);
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('5491122334455'); // digits-only, including +54
    expect(body.type).toBe('text');
    expect(body.text.body).toBe('Hola');
  });

  it('throws MetaCloudSendError on 4xx and surfaces the error message', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: 'bad token' } }), { status: 401 }),
    ) as any;
    const ch = new MetaCloudChannel({ phoneNumberId: 'p', accessToken: 'bad' });
    await expect(ch.send({ to: '+5491111111111', body: 'x' })).rejects.toBeInstanceOf(
      MetaCloudSendError,
    );
  });

  it('throws when response is OK but missing message id', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ messages: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as any;
    const ch = new MetaCloudChannel({ phoneNumberId: 'p', accessToken: 'TOK' });
    await expect(ch.send({ to: '+5491111111111', body: 'x' })).rejects.toBeInstanceOf(
      MetaCloudSendError,
    );
  });
});
