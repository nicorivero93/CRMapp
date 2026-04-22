import { TEMPLATE_VARS, type TemplateVar } from '@mycrm/shared';

export type TemplateVars = Partial<Record<TemplateVar, string | null | undefined>>;

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Replace `{{var}}` placeholders in `body` using the provided vars.
 * Unknown or empty vars become an empty string — never leak raw `{{foo}}` to the
 * recipient because a seller forgot to fill a slot.
 */
export function interpolate(body: string, vars: TemplateVars): string {
  return body.replace(PLACEHOLDER, (_match, name: string) => {
    const v = (vars as Record<string, unknown>)[name];
    return v == null ? '' : String(v);
  });
}

export function todayStringInTZ(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('es-AR', {
      timeZone: timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function knownVars(): readonly TemplateVar[] {
  return TEMPLATE_VARS;
}
