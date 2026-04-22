import { z } from 'zod';

export const leadSourceSchema = z.enum([
  'instagram',
  'facebook',
  'tiktok',
  'meta-lead-ads',
  'public-form',
  'csv-import',
  'sheets-import',
  'excel-import',
  'manual',
  'bulk-paste',
  'whatsapp-inbound',
]);

export const leadStatusSchema = z.enum([
  'new',
  'assigned',
  'contacted',
  'responded',
  'qualified',
  'converted',
  'no-response',
  'recycled',
  'discarded',
]);

export const leadEventTypeSchema = z.enum([
  'imported',
  'assigned',
  'wa-opened',
  'message-sent',
  'response-received',
  'status-changed',
  'recycled',
  'note-added',
  'converted',
]);

export const phoneSchema = z.string().min(6).max(40);
export const leadNameSchema = z.string().min(1).max(200);
export const tagsSchema = z.array(z.string().min(1).max(50)).max(50);

export const createLeadSchema = z.object({
  name: leadNameSchema.optional(),
  phone: phoneSchema,
  source: leadSourceSchema,
  sourceMeta: z.record(z.unknown()).optional(),
  tags: tagsSchema.optional(),
  notes: z.string().max(5000).optional(),
});

export const patchLeadSchema = z
  .object({
    name: leadNameSchema.nullable().optional(),
    status: leadStatusSchema.optional(),
    assignedTo: z.string().nullable().optional(),
    tags: tagsSchema.optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict();

export const leadListQuerySchema = z.object({
  status: leadStatusSchema.optional(),
  assignedTo: z.string().optional(),
  source: leadSourceSchema.optional(),
  q: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const addLeadEventSchema = z.object({
  type: leadEventTypeSchema,
  meta: z.record(z.unknown()).optional(),
});

export const pasteLeadsSchema = z.object({
  text: z.string().min(1).max(500_000),
  source: leadSourceSchema.default('bulk-paste'),
  defaultCountry: z.string().length(2).default('AR'),
});

export const importLeadsMetaSchema = z.object({
  source: leadSourceSchema.default('csv-import'),
  defaultCountry: z.string().length(2).default('AR'),
});

export type LeadSource = z.infer<typeof leadSourceSchema>;
export type LeadStatus = z.infer<typeof leadStatusSchema>;
export type LeadEventType = z.infer<typeof leadEventTypeSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type PatchLeadInput = z.infer<typeof patchLeadSchema>;
export type LeadListQuery = z.infer<typeof leadListQuerySchema>;
export type AddLeadEventInput = z.infer<typeof addLeadEventSchema>;
export type PasteLeadsInput = z.infer<typeof pasteLeadsSchema>;

export interface LeadDTO {
  id: string;
  name: string | null;
  phone: string;
  phoneNormalized: string;
  source: LeadSource;
  sourceMeta: Record<string, unknown> | null;
  importBatchId: string | null;
  status: LeadStatus;
  assignedTo: string | null;
  assignedAt: string | null;
  firstContactAt: string | null;
  lastContactAt: string | null;
  responseCount: number;
  noResponseCount: number;
  recycledCount: number;
  lastRecycledAt: string | null;
  convertedContactId: string | null;
  convertedDealId: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface LeadEventDTO {
  id: string;
  leadId: string;
  at: string;
  type: LeadEventType;
  byUserId: string | null;
  meta: Record<string, unknown> | null;
}

export interface ImportReportDTO {
  batchId: string;
  totalRows: number;
  imported: number;
  deduped: number;
  errors: number;
  errorsSample: string[];
}
