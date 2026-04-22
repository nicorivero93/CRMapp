import { z } from 'zod';

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(80),
  body: z.string().min(1).max(4000),
  category: z.string().max(50).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const patchTemplateSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    body: z.string().min(1).max(4000).optional(),
    category: z.string().max(50).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
export type PatchTemplateInput = z.infer<typeof patchTemplateSchema>;

export interface TemplateDTO {
  id: string;
  name: string;
  body: string;
  category: string | null;
  isActive: boolean;
}

/** Known interpolation variables. */
export const TEMPLATE_VARS = ['name', 'phone', 'sellerName', 'today'] as const;
export type TemplateVar = (typeof TEMPLATE_VARS)[number];
