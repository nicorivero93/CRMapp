import { z } from 'zod';

export const sendWhatsAppSchema = z
  .object({
    templateId: z.string().min(1).optional(),
    body: z.string().min(1).max(4000).optional(),
  })
  .refine((v) => !!v.templateId || !!v.body, {
    message: 'Pasá templateId o body',
  });

export type SendWhatsAppInput = z.infer<typeof sendWhatsAppSchema>;

export interface SendWhatsAppResponse {
  url: string;
  preview: string;
  line: {
    id: string;
    dailyCount: number;
    dailyCapMessages: number;
  };
}
