// Dark-themed, branded email templates for MyCRM.
// Brand color: #6366f1

const BRAND = '#6366f1';
const BG = '#0b0b0f';
const CARD = '#14141b';
const TEXT = '#e5e7eb';
const DIM = '#9ca3af';

function shell(bodyHtml: string, preheader = ''): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>MyCRM</title>
  </head>
  <body style="margin:0;padding:0;background:${BG};color:${TEXT};font-family:Inter,Segoe UI,Arial,sans-serif;">
    <span style="display:none;max-height:0;overflow:hidden;color:${BG};">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:${CARD};border-radius:12px;overflow:hidden;border:1px solid #1f1f29;">
            <tr>
              <td style="padding:20px 24px;border-bottom:1px solid #1f1f29;">
                <div style="font-weight:700;font-size:18px;color:${BRAND};">MyCRM</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;color:${TEXT};font-size:15px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;border-top:1px solid #1f1f29;color:${DIM};font-size:12px;">
                Enviado por MyCRM — respondé este email para hablar con nosotros.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function button(text: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">${text}</a>`;
}

function esc(v: unknown): string {
  const s = String(v ?? '');
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export type DealLike = { id?: string; title: string; value?: number; currency?: string; company?: string };
export type UserLike = { name?: string; email?: string };
export type EventLike = { id?: string; title: string; start?: unknown; end?: unknown };

export function dealClosed(deal: DealLike, owner: UserLike): { subject: string; html: string } {
  const subject = `Deal cerrado: ${deal.title}`;
  const value = deal.value != null ? `${deal.currency ?? 'USD'} ${deal.value.toLocaleString()}` : '';
  const body = `
    <h2 style="margin:0 0 12px;color:${TEXT};font-size:20px;">Se cerró un deal</h2>
    <p>Hola ${esc(owner.name ?? 'owner')},</p>
    <p><strong>${esc(deal.title)}</strong>${deal.company ? ` — ${esc(deal.company)}` : ''} quedó en estado <strong>ganado</strong>.</p>
    ${value ? `<p style="color:${DIM};">Valor: <span style="color:${TEXT};">${esc(value)}</span></p>` : ''}
    <p>${button('Ver deal', 'https://crm-app-31a8f.web.app/app/pipeline')}</p>
  `;
  return { subject, html: shell(body, 'Se cerró un deal en MyCRM') };
}

export function eventCanceled(event: EventLike, attendee: UserLike, canceler: UserLike): { subject: string; html: string } {
  const subject = `Evento cancelado: ${event.title}`;
  const body = `
    <h2 style="margin:0 0 12px;font-size:20px;">Evento cancelado</h2>
    <p>Hola ${esc(attendee.name ?? attendee.email ?? 'team')},</p>
    <p>${esc(canceler.name ?? 'Alguien')} canceló el evento <strong>${esc(event.title)}</strong>.</p>
    <p>${button('Ver calendario', 'https://crm-app-31a8f.web.app/app/calendar')}</p>
  `;
  return { subject, html: shell(body, 'Un evento fue cancelado') };
}

export function inviteSent(inviterName: string, teamName: string, acceptLink: string): { subject: string; html: string } {
  const subject = `${inviterName} te invitó a ${teamName} en MyCRM`;
  const body = `
    <h2 style="margin:0 0 12px;font-size:20px;">Te invitaron a un team</h2>
    <p><strong>${esc(inviterName)}</strong> te invitó a unirte a <strong>${esc(teamName)}</strong> en MyCRM.</p>
    <p>${button('Aceptar invitación', acceptLink)}</p>
    <p style="color:${DIM};font-size:12px;">La invitación expira en 7 días.</p>
  `;
  return { subject, html: shell(body, `Invitación a ${teamName}`) };
}

export function welcome(contactName: string): { subject: string; html: string } {
  const subject = `Bienvenido ${contactName}`;
  const body = `
    <h2 style="margin:0 0 12px;font-size:20px;">Bienvenido a MyCRM</h2>
    <p>Hola ${esc(contactName)},</p>
    <p>Gracias por sumarte. En breve alguien del equipo te va a contactar.</p>
    <p>${button('Ir al CRM', 'https://crm-app-31a8f.web.app')}</p>
  `;
  return { subject, html: shell(body, 'Bienvenido a MyCRM') };
}

export function followUp(dealTitle: string, ownerName: string): { subject: string; html: string } {
  const subject = `Follow-up sugerido: ${dealTitle}`;
  const body = `
    <h2 style="margin:0 0 12px;font-size:20px;">Recordatorio de seguimiento</h2>
    <p>Hola ${esc(ownerName)},</p>
    <p>El deal <strong>${esc(dealTitle)}</strong> lleva días sin actividad. Quizás es momento de retomarlo.</p>
    <p>${button('Abrir pipeline', 'https://crm-app-31a8f.web.app/app/pipeline')}</p>
  `;
  return { subject, html: shell(body, 'Recordatorio de follow-up') };
}
