import { z } from 'zod';

export const createLineSchema = z.object({
  phone: z.string().min(6).max(40),
  label: z.string().max(80).optional(),
  dailyCapMessages: z.number().int().min(1).max(10_000).default(250),
});

export const patchLineSchema = z
  .object({
    phone: z.string().min(6).max(40).optional(),
    label: z.string().max(80).nullable().optional(),
    dailyCapMessages: z.number().int().min(1).max(10_000).optional(),
  })
  .strict();

export type CreateLineInput = z.infer<typeof createLineSchema>;
export type PatchLineInput = z.infer<typeof patchLineSchema>;

export interface LineDTO {
  id: string;
  ownerId: string;
  phone: string;
  label: string | null;
  isActive: boolean;
  dailyCapMessages: number;
  dailyCount: number;
  lastUsedAt: string | null;
  restrictedAt: string | null;
}
