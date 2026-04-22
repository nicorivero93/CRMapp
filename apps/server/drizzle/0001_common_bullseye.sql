CREATE TABLE `automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`trigger` text NOT NULL,
	`conditions` text DEFAULT '[]',
	`actions` text NOT NULL,
	`last_run_at` integer,
	`run_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`start` integer NOT NULL,
	`end` integer NOT NULL,
	`status` text DEFAULT 'confirmed' NOT NULL,
	`owner_id` text,
	`lead_id` text,
	`contact_id` text,
	`deal_id` text,
	`attendees` text DEFAULT '[]',
	`color` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_owner_start` ON `events` (`owner_id`,`start`);--> statement-breakpoint
CREATE INDEX `events_start` ON `events` (`start`);