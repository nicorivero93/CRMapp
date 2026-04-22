import { z } from 'zod';

export const whatsappChannelKindSchema = z.enum(['manual', 'meta-cloud']);
export type WhatsAppChannelKind = z.infer<typeof whatsappChannelKindSchema>;

export const metaConfigSchema = z.object({
  phoneNumberId: z.string().min(1).max(64),
  businessId: z.string().min(1).max(64),
  accessToken: z.string().min(10).max(1024),
  webhookVerifyToken: z.string().min(8).max(128),
});
export type MetaConfigInput = z.infer<typeof metaConfigSchema>;

export const patchWhatsAppSettingsSchema = z
  .object({
    channel: whatsappChannelKindSchema.optional(),
    meta: metaConfigSchema.partial().optional(),
  })
  .strict();
export type PatchWhatsAppSettingsInput = z.infer<typeof patchWhatsAppSettingsSchema>;

export interface WhatsAppSettingsDTO {
  channel: WhatsAppChannelKind;
  /** Meta config presence flags — secrets are NEVER returned. */
  meta: {
    configured: boolean;
    phoneNumberId: string | null;
    businessId: string | null;
    hasAccessToken: boolean;
    hasWebhookVerifyToken: boolean;
  };
  /** URL the operator must configure in Meta Business as the webhook callback. */
  webhookUrl: string;
}

export const testSendSchema = z.object({
  to: z.string().min(6).max(40),
  body: z.string().min(1).max(1000),
});
export type TestSendInput = z.infer<typeof testSendSchema>;
