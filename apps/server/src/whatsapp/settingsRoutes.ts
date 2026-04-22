import {
  patchWhatsAppSettingsSchema,
  testSendSchema,
  type WhatsAppSettingsDTO,
} from '@mycrm/shared';
import type { buildApp } from '../app.js';
import { AppError } from '../lib/errors.js';
import { requireRole } from '../auth/middleware.js';
import {
  getWhatsAppChannelKind,
  metaStatus,
  patchMetaSecrets,
  revealMetaSecrets,
  setWhatsAppChannelKind,
} from './settings.js';
import { MetaCloudChannel, MetaCloudSendError } from './metaCloud.js';

type App = Awaited<ReturnType<typeof buildApp>>;

function toDTO(publicWebhookUrl: string): WhatsAppSettingsDTO {
  const status = metaStatus();
  return {
    channel: getWhatsAppChannelKind(),
    meta: status,
    webhookUrl: publicWebhookUrl,
  };
}

export async function registerWhatsAppSettingsRoutes(app: App): Promise<void> {
  app.get('/api/settings/whatsapp', { preHandler: requireRole('owner') }, async (req) => {
    // Try to reconstruct the public webhook URL from the request host; operator
    // will typically override this by pointing Meta at their tunnel domain.
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers['host'] ?? 'your-public-host';
    const webhookUrl = `${proto}://${host}/api/whatsapp/webhook`;
    return { settings: toDTO(webhookUrl) };
  });

  app.patch('/api/settings/whatsapp', { preHandler: requireRole('owner') }, async (req) => {
    const body = patchWhatsAppSettingsSchema.parse(req.body);
    if (body.meta) {
      patchMetaSecrets(body.meta);
    }
    if (body.channel) {
      // Refuse to enable meta-cloud without full config.
      if (body.channel === 'meta-cloud') {
        const s = metaStatus();
        if (!s.configured) {
          throw new AppError(
            'META_INCOMPLETE',
            'Completá phoneNumberId, businessId, accessToken y webhookVerifyToken antes de activar Meta Cloud.',
            400,
          );
        }
      }
      setWhatsAppChannelKind(body.channel);
    }
    const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'https';
    const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers['host'] ?? 'your-public-host';
    return { settings: toDTO(`${proto}://${host}/api/whatsapp/webhook`) };
  });

  app.post('/api/settings/whatsapp/test-send', { preHandler: requireRole('owner') }, async (req) => {
    const body = testSendSchema.parse(req.body);
    const secrets = revealMetaSecrets();
    if (!secrets.phoneNumberId || !secrets.accessToken) {
      throw new AppError(
        'META_INCOMPLETE',
        'Configurá phoneNumberId y accessToken primero.',
        400,
      );
    }
    const channel = new MetaCloudChannel({
      phoneNumberId: secrets.phoneNumberId,
      accessToken: secrets.accessToken,
    });
    try {
      const r = await channel.send({ to: body.to, body: body.body });
      if (r.type !== 'delivered') {
        throw new AppError('NOT_DELIVERED', 'La API no devolvió id de mensaje', 502);
      }
      return { ok: true, providerMessageId: r.providerMessageId };
    } catch (err) {
      if (err instanceof MetaCloudSendError) {
        throw new AppError('META_SEND_FAILED', err.message, err.status >= 500 ? 502 : 400);
      }
      throw err;
    }
  });
}
