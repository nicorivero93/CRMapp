import { z } from 'zod';

export const createStageSchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().max(20).optional().nullable(),
  isClosedWon: z.boolean().default(false),
});

export const patchStageSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    color: z.string().max(20).nullable().optional(),
    isClosedWon: z.boolean().optional(),
  })
  .strict();

export const reorderStagesSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(50),
});

export type CreateStageInput = z.infer<typeof createStageSchema>;
export type PatchStageInput = z.infer<typeof patchStageSchema>;
export type ReorderStagesInput = z.infer<typeof reorderStagesSchema>;

export interface StageDTO {
  id: string;
  name: string;
  order: number;
  color: string | null;
  isClosedWon: boolean;
}
