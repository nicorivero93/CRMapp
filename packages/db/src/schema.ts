import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role', { enum: ['owner', 'sales', 'viewer'] }).notNull().default('sales'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  dailyLeadTarget: integer('daily_lead_target').notNull().default(30),
  activeLineId: text('active_line_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({ userIdIdx: index('sessions_user_id').on(t.userId) }),
);

export const whatsappLines = sqliteTable('whatsapp_lines', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  phone: text('phone').notNull(),
  label: text('label'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  dailyCapMessages: integer('daily_cap_messages').notNull().default(250),
  dailyCount: integer('daily_count').notNull().default(0),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  restrictedAt: integer('restricted_at', { mode: 'timestamp' }),
});

export const leads = sqliteTable(
  'leads',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    phone: text('phone').notNull(),
    phoneNormalized: text('phone_normalized').notNull(),
    source: text('source', {
      enum: [
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
      ],
    }).notNull(),
    sourceMeta: text('source_meta', { mode: 'json' }),
    importBatchId: text('import_batch_id'),
    status: text('status', {
      enum: [
        'new',
        'assigned',
        'contacted',
        'responded',
        'qualified',
        'converted',
        'no-response',
        'recycled',
        'discarded',
      ],
    })
      .notNull()
      .default('new'),
    assignedTo: text('assigned_to').references(() => users.id),
    assignedAt: integer('assigned_at', { mode: 'timestamp' }),
    firstContactAt: integer('first_contact_at', { mode: 'timestamp' }),
    lastContactAt: integer('last_contact_at', { mode: 'timestamp' }),
    responseCount: integer('response_count').notNull().default(0),
    noResponseCount: integer('no_response_count').notNull().default(0),
    recycledCount: integer('recycled_count').notNull().default(0),
    lastRecycledAt: integer('last_recycled_at', { mode: 'timestamp' }),
    convertedContactId: text('converted_contact_id'),
    convertedDealId: text('converted_deal_id'),
    tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
    notes: text('notes'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    createdBy: text('created_by').notNull(),
  },
  (t) => ({
    phoneNormIdx: index('leads_phone_norm').on(t.phoneNormalized),
    statusAssignedIdx: index('leads_status_assigned').on(t.status, t.assignedTo),
    lastContactIdx: index('leads_last_contact').on(t.lastContactAt),
    sourceIdx: index('leads_source_created').on(t.source, t.createdAt),
  }),
);

export const leadEvents = sqliteTable(
  'lead_events',
  {
    id: text('id').primaryKey(),
    leadId: text('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    at: integer('at', { mode: 'timestamp' }).notNull(),
    type: text('type', {
      enum: [
        'imported',
        'assigned',
        'wa-opened',
        'message-sent',
        'response-received',
        'status-changed',
        'recycled',
        'note-added',
        'converted',
      ],
    }).notNull(),
    byUserId: text('by_user_id'),
    meta: text('meta', { mode: 'json' }),
  },
  (t) => ({ leadAtIdx: index('events_lead_at').on(t.leadId, t.at) }),
);

export const contacts = sqliteTable('contacts', {
  id: text('id').primaryKey(),
  leadId: text('lead_id').references(() => leads.id),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  company: text('company'),
  industry: text('industry'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().default([]),
  ownerId: text('owner_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export const stages = sqliteTable('stages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  order: integer('order').notNull(),
  color: text('color'),
  isClosedWon: integer('is_closed_won', { mode: 'boolean' }).notNull().default(false),
});

export const deals = sqliteTable('deals', {
  id: text('id').primaryKey(),
  contactId: text('contact_id').references(() => contacts.id),
  leadId: text('lead_id').references(() => leads.id),
  title: text('title').notNull(),
  value: integer('value').notNull().default(0),
  currency: text('currency').notNull().default('ARS'),
  stageId: text('stage_id')
    .notNull()
    .references(() => stages.id),
  ownerId: text('owner_id').references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  closedAt: integer('closed_at', { mode: 'timestamp' }),
});

export const importBatches = sqliteTable('import_batches', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  fileName: text('file_name'),
  totalRows: integer('total_rows').notNull(),
  imported: integer('imported').notNull(),
  deduped: integer('deduped').notNull(),
  errors: integer('errors').notNull(),
  errorsSample: text('errors_sample', { mode: 'json' }).$type<string[]>(),
  createdBy: text('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const recyclingRules = sqliteTable('recycling_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  statusIn: text('status_in', { mode: 'json' }).$type<string[]>().notNull(),
  daysSinceLastContact: integer('days_since_last_contact').notNull(),
  action: text('action', {
    enum: ['return-to-pool', 'reassign-to-different-user', 'escalate-to-owner'],
  }).notNull(),
  maxRecyclesPerLead: integer('max_recycles_per_lead').notNull().default(3),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

export const messageTemplates = sqliteTable('message_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  body: text('body').notNull(),
  category: text('category'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
});

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
});

export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    start: integer('start', { mode: 'timestamp' }).notNull(),
    end: integer('end', { mode: 'timestamp' }).notNull(),
    status: text('status', { enum: ['confirmed', 'canceled'] })
      .notNull()
      .default('confirmed'),
    ownerId: text('owner_id').references(() => users.id),
    leadId: text('lead_id').references(() => leads.id),
    contactId: text('contact_id').references(() => contacts.id),
    dealId: text('deal_id').references(() => deals.id),
    attendees: text('attendees', { mode: 'json' }).$type<string[]>().default([]),
    color: text('color'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    ownerStartIdx: index('events_owner_start').on(t.ownerId, t.start),
    startIdx: index('events_start').on(t.start),
  }),
);

export const automationRules = sqliteTable('automation_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  trigger: text('trigger', { mode: 'json' }).notNull(),
  conditions: text('conditions', { mode: 'json' }).$type<unknown[]>().default([]),
  actions: text('actions', { mode: 'json' }).notNull(),
  lastRunAt: integer('last_run_at', { mode: 'timestamp' }),
  runCount: integer('run_count').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;
export type LeadRow = typeof leads.$inferSelect;
export type LeadEventRow = typeof leadEvents.$inferSelect;
export type WhatsappLineRow = typeof whatsappLines.$inferSelect;
export type ContactRow = typeof contacts.$inferSelect;
export type DealRow = typeof deals.$inferSelect;
export type StageRow = typeof stages.$inferSelect;
export type AppSettingRow = typeof appSettings.$inferSelect;
export type MessageTemplateRow = typeof messageTemplates.$inferSelect;
export type RecyclingRuleRow = typeof recyclingRules.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type AutomationRuleRow = typeof automationRules.$inferSelect;
