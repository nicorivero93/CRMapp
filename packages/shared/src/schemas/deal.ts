import { z } from 'zod';

export const createDealSchema = z.object({
  title: z.string().min(1).max(200),
  value: z.number().int().min(0).default(0),
  currency: z.string().min(3).max(3).default('ARS'),
  stageId: z.string().min(1),
  contactId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  ownerId: z.string().optional().nullable(),
});

export const patchDealSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    value: z.number().int().min(0).optional(),
    currency: z.string().min(3).max(3).optional(),
    stageId: z.string().min(1).optional(),
    contactId: z.string().nullable().optional(),
    leadId: z.string().nullable().optional(),
    ownerId: z.string().nullable().optional(),
  })
  .strict();

export const moveDealSchema = z.object({
  stageId: z.string().min(1),
});

export const dealListQuerySchema = z.object({
  stageId: z.string().optional(),
  ownerId: z.string().optional(),
  contactId: z.string().optional(),
  leadId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export const convertLeadToDealSchema = z.object({
  title: z.string().min(1).max(200),
  value: z.number().int().min(0).default(0),
  currency: z.string().min(3).max(3).default('ARS'),
  stageId: z.string().min(1),
  createContact: z.boolean().default(true),
});

export type CreateDealInput = z.infer<typeof createDealSchema>;
export type PatchDealInput = z.infer<typeof patchDealSchema>;
export type MoveDealInput = z.infer<typeof moveDealSchema>;
export type DealListQuery = z.infer<typeof dealListQuerySchema>;
export type ConvertLeadToDealInput = z.infer<typeof convertLeadToDealSchema>;

export interface DealDTO {
  id: string;
  title: string;
  value: number;
  currency: string;
  stageId: string;
  contactId: string | null;
  leadId: string | null;
  ownerId: string | null;
  createdAt: string;
  closedAt: string | null;
}
