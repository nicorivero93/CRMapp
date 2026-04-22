import { describe, expect, it } from 'vitest';
import { interpolate } from './templates.js';

describe('interpolate', () => {
  it('replaces known placeholders', () => {
    const out = interpolate('Hola {{name}}, te escribe {{sellerName}}', {
      name: 'Ana',
      sellerName: 'Nico',
    });
    expect(out).toBe('Hola Ana, te escribe Nico');
  });

  it('treats missing vars as empty string', () => {
    const out = interpolate('Hola {{name}}, {{missing}}', { name: 'Ana' });
    expect(out).toBe('Hola Ana, ');
  });

  it('handles null and undefined values as empty string', () => {
    const out = interpolate('Hola {{name}} el {{today}}', { name: null, today: undefined });
    expect(out).toBe('Hola  el ');
  });

  it('allows whitespace inside placeholders', () => {
    const out = interpolate('{{  name  }}', { name: 'Juan' });
    expect(out).toBe('Juan');
  });

  it('replaces multiple occurrences of same var', () => {
    const out = interpolate('{{name}} {{name}} {{name}}', { name: 'X' });
    expect(out).toBe('X X X');
  });

  it('does not re-interpolate values that contain placeholders', () => {
    const out = interpolate('Hola {{name}}', { name: '{{name}}' });
    expect(out).toBe('Hola {{name}}');
  });
});
