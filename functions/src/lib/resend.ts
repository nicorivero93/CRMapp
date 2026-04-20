import { defineSecret } from 'firebase-functions/params';
import * as logger from 'firebase-functions/logger';
import { Resend } from 'resend';

export const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
export const RESEND_FROM = defineSecret('RESEND_FROM');

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
};

export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<void> {
  const apiKey = RESEND_API_KEY.value();
  const from = RESEND_FROM.value() || 'MyCRM <no-reply@crm-app-31a8f.web.app>';
  if (!apiKey) {
    logger.error('sendEmail: RESEND_API_KEY is not set, skipping', { to, subject });
    return;
  }
  try {
    const resend = new Resend(apiKey);
    const recipients = Array.isArray(to) ? to : [to];
    const filtered = recipients.filter((r) => !!r);
    if (filtered.length === 0) {
      logger.warn('sendEmail: no recipients', { subject });
      return;
    }
    const { error } = await resend.emails.send({
      from,
      to: filtered,
      subject,
      html,
    });
    if (error) {
      logger.error('resend error', { error, subject, to: filtered });
    } else {
      logger.info('email sent', { subject, to: filtered });
    }
  } catch (err) {
    logger.error('sendEmail failed', { err: (err as Error).message, subject });
  }
}
