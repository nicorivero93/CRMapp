import { describe, expect, it } from 'vitest';
import { ManualChannel } from './channel.js';

describe('ManualChannel', () => {
  it('builds a wa.me URL with digits-only destination and encoded body', async () => {
    const ch = new ManualChannel();
    const r = await ch.send({ to: '+54 9 11 2345-6789', body: 'Hola Ana, ¿cómo estás?' });
    expect(r.type).toBe('link');
    if (r.type !== 'link') throw new Error('unexpected');
    expect(r.url.startsWith('https://wa.me/5491123456789?text=')).toBe(true);
    expect(r.url).toContain('Hola%20Ana');
    expect(r.url).toContain('%C3%B3'); // ó encoded
    expect(r.preview).toBe('Hola Ana, ¿cómo estás?');
  });

  it('empty body still builds valid URL', async () => {
    const r = await new ManualChannel().send({ to: '+5491111111111', body: '' });
    expect(r.type).toBe('link');
    if (r.type === 'link') expect(r.url).toBe('https://wa.me/5491111111111?text=');
  });
});
