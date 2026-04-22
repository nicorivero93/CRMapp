import { z } from 'zod';

export const createContactSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(6).max(40),
  email: z.string().email().max(254).optional().nullable(),
  company: z.string().max(200).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  tags: z.array(z.string().min(1).max(50)).max(50).optional(),
  leadId: z.string().optional().nullable(),
});

export const patchContactSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    phone: z.string().min(6).max(40).optional(),
    email: z.string().email().max(254).nullable().optional(),
    company: z.string().max(200).nullable().optional(),
    industry: z.string().max(100).nullable().optional(),
    tags: z.array(z.string().min(1).max(50)).max(50).optional(),
    ownerId: z.string().nullable().optional(),
  })
  .strict();

export const contactListQuerySchema = z.object({
  q: z.string().max(100).optional(),
  tag: z.string().max(50).optional(),
  industry: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;
export type PatchContactInput = z.infer<typeof patchContactSchema>;
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

export interface ContactDTO {
  id: string;
  leadId: string | null;
  name: string;
  phone: string;
  email: string | null;
  company: string | null;
  industry: string | null;
  tags: string[];
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}
