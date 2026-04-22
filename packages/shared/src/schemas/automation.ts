import { z } from 'zod';
import { leadSourceSchema, leadStatusSchema } from './lead.js';

/* =========================================================================
 *  TRIGGERS
 * ========================================================================= */

export const triggerLeadCreatedSchema = z.object({
  type: z.literal('lead.created'),
  params: z
    .object({
      source: leadSourceSchema.optional(),
    })
    .default({}),
});

export const triggerLeadStatusChangedSchema = z.object({
  type: z.literal('lead.status-changed'),
  params: z
    .object({
      from: leadStatusSchema.optional(),
      to: leadStatusSchema.optional(),
    })
    .default({}),
});

export const triggerDealStageChangedSchema = z.object({
  type: z.literal('deal.stage-changed'),
  params: z
    .object({
      fromStageId: z.string().optional(),
      toStageId: z.string().optional(),
    })
    .default({}),
});

export const triggerContactCreatedSchema = z.object({
  type: z.literal('contact.created'),
  params: z.object({}).default({}),
});

export const triggerEventCanceledSchema = z.object({
  type: z.literal('event.canceled'),
  params: z.object({}).default({}),
});

export const automationTriggerSchema = z.discriminatedUnion('type', [
  triggerLeadCreatedSchema,
  triggerLeadStatusChangedSchema,
  triggerDealStageChangedSchema,
  triggerContactCreatedSchema,
  triggerEventCanceledSchema,
]);
export type AutomationTrigger = z.infer<typeof automationTriggerSchema>;
export type AutomationTriggerType = AutomationTrigger['type'];

/* =========================================================================
 *  CONDITIONS
 * ========================================================================= */

export const automationConditionOpSchema = z.enum([
  'eq',
  'neq',
  'contains',
  'not-contains',
  'gt',
  'lt',
  'gte',
  'lte',
  'in',
  'exists',
]);

export const automationConditionSchema = z.object({
  field: z.string().min(1).max(100),
  op: automationConditionOpSchema,
  value: z.any().optional(),
});
export type AutomationCondition = z.infer<typeof automationConditionSchema>;

/* =========================================================================
 *  ACTIONS
 * ========================================================================= */

export const actionAddTagSchema = z.object({
  type: z.literal('add-tag'),
  params: z.object({ tag: z.string().min(1).max(50) }),
});

export const actionAssignOwnerSchema = z.object({
  type: z.literal('assign-owner'),
  params: z.object({ userId: z.string().min(1) }),
});

export const actionMoveStageSchema = z.object({
  type: z.literal('move-stage'),
  params: z.object({ stageId: z.string().min(1) }),
});

export const actionNotifyUserSchema = z.object({
  type: z.literal('notify-user'),
  params: z.object({
    userId: z.string().min(1).optional(),
    message: z.string().min(1).max(500),
  }),
});

export const actionUpdateFieldSchema = z.object({
  type: z.literal('update-field'),
  params: z.object({
    field: z.enum(['name', 'notes', 'status']),
    value: z.string().max(2000),
  }),
});

export const automationActionSchema = z.discriminatedUnion('type', [
  actionAddTagSchema,
  actionAssignOwnerSchema,
  actionMoveStageSchema,
  actionNotifyUserSchema,
  actionUpdateFieldSchema,
]);
export type AutomationAction = z.infer<typeof automationActionSchema>;
export type AutomationActionType = AutomationAction['type'];

/* =========================================================================
 *  RULE CRUD
 * ========================================================================= */

export const createAutomationSchema = z.object({
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  trigger: automationTriggerSchema,
  conditions: z.array(automationConditionSchema).max(10).default([]),
  actions: z.array(automationActionSchema).min(1).max(10),
});

export const patchAutomationSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    enabled: z.boolean().optional(),
    trigger: automationTriggerSchema.optional(),
    conditions: z.array(automationConditionSchema).max(10).optional(),
    actions: z.array(automationActionSchema).min(1).max(10).optional(),
  })
  .strict();

export type CreateAutomationInput = z.infer<typeof createAutomationSchema>;
export type PatchAutomationInput = z.infer<typeof patchAutomationSchema>;

export interface AutomationDTO {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  lastRunAt: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationTestResult {
  matched: boolean;
  ranConditions: boolean;
  wouldExecute: AutomationAction[];
  reason?: string;
}
