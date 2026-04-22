import { z } from 'zod';
import { leadStatusSchema } from './lead.js';

export const recyclingActionSchema = z.enum([
  'return-to-pool',
  'reassign-to-different-user',
  'escalate-to-owner',
]);
export type RecyclingAction = z.infer<typeof recyclingActionSchema>;

export const createRecyclingRuleSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  statusIn: z.array(leadStatusSchema).min(1),
  daysSinceLastContact: z.number().int().min(1).max(365),
  action: recyclingActionSchema,
  maxRecyclesPerLead: z.number().int().min(1).max(20).default(3),
});

export const patchRecyclingRuleSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
    statusIn: z.array(leadStatusSchema).min(1).optional(),
    daysSinceLastContact: z.number().int().min(1).max(365).optional(),
    action: recyclingActionSchema.optional(),
    maxRecyclesPerLead: z.number().int().min(1).max(20).optional(),
  })
  .strict();

export type CreateRecyclingRuleInput = z.infer<typeof createRecyclingRuleSchema>;
export type PatchRecyclingRuleInput = z.infer<typeof patchRecyclingRuleSchema>;

export interface RecyclingRuleDTO {
  id: string;
  name: string;
  enabled: boolean;
  statusIn: string[];
  daysSinceLastContact: number;
  action: RecyclingAction;
  maxRecyclesPerLead: number;
  createdAt: string;
}

export interface RecyclingReport {
  evaluated: number;
  recycled: number;
  discarded: number;
  reassigned: number;
  escalated: number;
  returnedToPool: number;
  /** Per-rule breakdown for debugging. */
  perRule: Record<string, { matched: number; recycled: number; discarded: number }>;
}
