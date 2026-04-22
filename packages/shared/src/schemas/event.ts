import { z } from 'zod';

export const eventStatusSchema = z.enum(['confirmed', 'canceled']);
export type EventStatus = z.infer<typeof eventStatusSchema>;

export const createEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional().nullable(),
    start: z.string().datetime(),
    end: z.string().datetime(),
    leadId: z.string().optional().nullable(),
    contactId: z.string().optional().nullable(),
    dealId: z.string().optional().nullable(),
    attendees: z.array(z.string().min(1)).max(50).optional(),
    color: z.string().max(20).optional().nullable(),
  })
  .refine((v) => new Date(v.start).getTime() < new Date(v.end).getTime(), {
    message: 'start debe ser anterior a end',
    path: ['end'],
  });

export const patchEventSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
    status: eventStatusSchema.optional(),
    leadId: z.string().nullable().optional(),
    contactId: z.string().nullable().optional(),
    dealId: z.string().nullable().optional(),
    attendees: z.array(z.string().min(1)).max(50).optional(),
    color: z.string().max(20).nullable().optional(),
  })
  .strict();

export const eventRangeQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  ownerId: z.string().optional(),
  includeCanceled: z.coerce.boolean().default(false),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type PatchEventInput = z.infer<typeof patchEventSchema>;
export type EventRangeQuery = z.infer<typeof eventRangeQuerySchema>;

export interface EventDTO {
  id: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  status: EventStatus;
  ownerId: string | null;
  leadId: string | null;
  contactId: string | null;
  dealId: string | null;
  attendees: string[];
  color: string | null;
  createdAt: string;
  updatedAt: string;
}
