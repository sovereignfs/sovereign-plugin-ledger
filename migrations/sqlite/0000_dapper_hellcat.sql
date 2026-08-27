CREATE TABLE `ledger_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`institution` text,
	`type` text NOT NULL,
	`balance_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`credit_limit_minor` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_accounts_user_idx` ON `ledger_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `ledger_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`value_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_assets_user_idx` ON `ledger_assets` (`user_id`);--> statement-breakpoint
CREATE TABLE `ledger_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_categories_user_idx` ON `ledger_categories` (`user_id`);--> statement-breakpoint
CREATE TABLE `ledger_currencies` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`code` text NOT NULL,
	`is_base` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_currencies_user_code_idx` ON `ledger_currencies` (`user_id`,`code`);--> statement-breakpoint
CREATE TABLE `ledger_deposits` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_deposits_user_idx` ON `ledger_deposits` (`user_id`);--> statement-breakpoint
CREATE TABLE `ledger_fx_rates` (
	`id` text PRIMARY KEY NOT NULL,
	`currency_code` text NOT NULL,
	`pivot_code` text NOT NULL,
	`rate` real NOT NULL,
	`as_of_date` text NOT NULL,
	`source` text
);
--> statement-breakpoint
CREATE INDEX `ledger_fx_rates_lookup_idx` ON `ledger_fx_rates` (`currency_code`,`pivot_code`,`as_of_date`);--> statement-breakpoint
CREATE TABLE `ledger_incomes` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_incomes_user_idx` ON `ledger_incomes` (`user_id`);--> statement-breakpoint
CREATE TABLE `ledger_jar_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`jar_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`category_id` text,
	`note` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`jar_id`) REFERENCES `ledger_saving_jars`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `ledger_categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ledger_jar_transactions_user_jar_occurred_idx` ON `ledger_jar_transactions` (`user_id`,`jar_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `ledger_kinds` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`predicted_amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`recurrence_interval_unit` text,
	`recurrence_interval_count` integer,
	`recurrence_anchor_date` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `ledger_categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ledger_kinds_category_idx` ON `ledger_kinds` (`category_id`);--> statement-breakpoint
CREATE TABLE `ledger_loans` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`lender` text NOT NULL,
	`principal_minor` integer NOT NULL,
	`remaining_balance_minor` integer NOT NULL,
	`installment_amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`linked_kind_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`linked_kind_id`) REFERENCES `ledger_kinds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_loans_linked_kind_id_unique` ON `ledger_loans` (`linked_kind_id`);--> statement-breakpoint
CREATE INDEX `ledger_loans_user_idx` ON `ledger_loans` (`user_id`);--> statement-breakpoint
CREATE TABLE `ledger_people` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`balance_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ledger_people_user_idx` ON `ledger_people` (`user_id`);--> statement-breakpoint
CREATE TABLE `ledger_people_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`person_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`note` text,
	`occurred_at` integer NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `ledger_people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ledger_people_transactions_user_person_occurred_idx` ON `ledger_people_transactions` (`user_id`,`person_id`,`occurred_at`);--> statement-breakpoint
CREATE TABLE `ledger_period_reviews` (
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`reviewed_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `year`, `month`)
);
--> statement-breakpoint
CREATE TABLE `ledger_saving_jars` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind_id` text NOT NULL,
	`balance_minor` integer DEFAULT 0 NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`kind_id`) REFERENCES `ledger_kinds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_saving_jars_kind_id_unique` ON `ledger_saving_jars` (`kind_id`);--> statement-breakpoint
CREATE INDEX `ledger_saving_jars_user_idx` ON `ledger_saving_jars` (`user_id`);--> statement-breakpoint
CREATE TABLE `ledger_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`kind_id`) REFERENCES `ledger_kinds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ledger_transactions_user_kind_occurred_idx` ON `ledger_transactions` (`user_id`,`kind_id`,`occurred_at`);