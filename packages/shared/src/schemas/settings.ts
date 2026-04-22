import { z } from 'zod';

export const assignmentModeSchema = z.enum(['round-robin', 'capacity-weighted', 'manual-only']);
export type AssignmentMode = z.infer<typeof assignmentModeSchema>;

export const appSettingsSchema = z.object({
  assignmentMode: assignmentModeSchema.default('capacity-weighted'),
  timezone: z.string().default('America/Argentina/Buenos_Aires'),
  defaultRecyclingDays: z.number().int().min(1).max(365).default(7),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const patchSettingsSchema = appSettingsSchema.partial().strict();
export type PatchSettingsInput = z.infer<typeof patchSettingsSchema>;

export const assignLeadsSchema = z.object({
  leadIds: z.array(z.string().min(1)).min(1).max(1000).optional(),
  /** If leadIds is absent, the server assigns all currently unassigned `new` leads. */
  allUnassigned: z.boolean().default(false),
  excludeUserId: z.string().optional(),
});
export type AssignLeadsInput = z.infer<typeof assignLeadsSchema>;

export interface AssignmentReport {
  assigned: Array<{ leadId: string; userId: string }>;
  unassigned: string[];
  /** Per-user tally of newly assigned leads in this run. */
  perUser: Record<string, number>;
}
