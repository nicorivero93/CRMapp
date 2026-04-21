CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`company` text,
	`industry` text,
	`tags` text DEFAULT '[]',
	`owner_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deals` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_id` text,
	`lead_id` text,
	`title` text NOT NULL,
	`value` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'ARS' NOT NULL,
	`stage_id` text NOT NULL,
	`owner_id` text,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`stage_id`) REFERENCES `stages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`file_name` text,
	`total_rows` integer NOT NULL,
	`imported` integer NOT NULL,
	`deduped` integer NOT NULL,
	`errors` integer NOT NULL,
	`errors_sample` text,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `lead_events` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`at` integer NOT NULL,
	`type` text NOT NULL,
	`by_user_id` text,
	`meta` text,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `events_lead_at` ON `lead_events` (`lead_id`,`at`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`phone` text NOT NULL,
	`phone_normalized` text NOT NULL,
	`source` text NOT NULL,
	`source_meta` text,
	`import_batch_id` text,
	`status` text DEFAULT 'new' NOT NULL,
	`assigned_to` text,
	`assigned_at` integer,
	`first_contact_at` integer,
	`last_contact_at` integer,
	`response_count` integer DEFAULT 0 NOT NULL,
	`no_response_count` integer DEFAULT 0 NOT NULL,
	`recycled_count` integer DEFAULT 0 NOT NULL,
	`last_recycled_at` integer,
	`converted_contact_id` text,
	`converted_deal_id` text,
	`tags` text DEFAULT '[]',
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `leads_phone_norm` ON `leads` (`phone_normalized`);--> statement-breakpoint
CREATE INDEX `leads_status_assigned` ON `leads` (`status`,`assigned_to`);--> statement-breakpoint
CREATE INDEX `leads_last_contact` ON `leads` (`last_contact_at`);--> statement-breakpoint
CREATE INDEX `leads_source_created` ON `leads` (`source`,`created_at`);--> statement-breakpoint
CREATE TABLE `message_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`body` text NOT NULL,
	`category` text,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `recycling_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`status_in` text NOT NULL,
	`days_since_last_contact` integer NOT NULL,
	`action` text NOT NULL,
	`max_recycles_per_lead` integer DEFAULT 3 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `stages` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`order` integer NOT NULL,
	`color` text,
	`is_closed_won` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'sales' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`daily_lead_target` integer DEFAULT 30 NOT NULL,
	`active_line_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `whatsapp_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`phone` text NOT NULL,
	`label` text,
	`is_active` integer DEFAULT false NOT NULL,
	`daily_cap_messages` integer DEFAULT 250 NOT NULL,
	`daily_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`restricted_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
