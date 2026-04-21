import { z } from 'zod';

export const emailSchema = z.string().email().max(254).toLowerCase().trim();
export const passwordSchema = z.string().min(8).max(256);
export const nameSchema = z.string().min(1).max(120).trim();

export const signupOwnerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type SignupOwnerInput = z.infer<typeof signupOwnerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
