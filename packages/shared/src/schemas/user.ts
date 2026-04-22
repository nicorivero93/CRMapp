import { z } from 'zod';
import { emailSchema, nameSchema, passwordSchema } from './auth.js';

export const userRoleSchema = z.enum(['owner', 'sales', 'viewer']);

export const createUserSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  role: userRoleSchema.optional(),
  dailyLeadTarget: z.number().int().min(0).max(1000).optional(),
});

export const patchUserSchema = z
  .object({
    name: nameSchema.optional(),
    role: userRoleSchema.optional(),
    isActive: z.boolean().optional(),
    dailyLeadTarget: z.number().int().min(0).max(1000).optional(),
    activeLineId: z.string().nullable().optional(),
    password: passwordSchema.optional(),
    // Required when `password` is set AND the caller is self-patching.
    // Owner-patching-another-user's-password does not need it.
    currentPassword: z.string().min(1).max(256).optional(),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type PatchUserInput = z.infer<typeof patchUserSchema>;
