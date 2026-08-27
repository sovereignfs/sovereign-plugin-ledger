CREATE TABLE "ledger_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"institution" text,
	"type" text NOT NULL,
	"balance_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"credit_limit_minor" integer,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"value_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_currencies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"is_base" integer DEFAULT 0 NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_fx_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"currency_code" text NOT NULL,
	"pivot_code" text NOT NULL,
	"rate" double precision NOT NULL,
	"as_of_date" text NOT NULL,
	"source" text
);
--> statement-breakpoint
CREATE TABLE "ledger_incomes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_jar_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"jar_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"category_id" text,
	"note" text,
	"occurred_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_kinds" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"predicted_amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"recurrence_interval_unit" text,
	"recurrence_interval_count" integer,
	"recurrence_anchor_date" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_loans" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"lender" text NOT NULL,
	"principal_minor" integer NOT NULL,
	"remaining_balance_minor" integer NOT NULL,
	"installment_amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"linked_kind_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "ledger_loans_linked_kind_id_unique" UNIQUE("linked_kind_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_people" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"balance_minor" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_people_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"person_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"note" text,
	"occurred_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_period_reviews" (
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"reviewed_at" bigint NOT NULL,
	CONSTRAINT "ledger_period_reviews_user_id_year_month_pk" PRIMARY KEY("user_id","year","month")
);
--> statement-breakpoint
CREATE TABLE "ledger_saving_jars" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind_id" text NOT NULL,
	"balance_minor" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "ledger_saving_jars_kind_id_unique" UNIQUE("kind_id")
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind_id" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"occurred_at" bigint NOT NULL,
	"note" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ledger_jar_transactions" ADD CONSTRAINT "ledger_jar_transactions_jar_id_ledger_saving_jars_id_fk" FOREIGN KEY ("jar_id") REFERENCES "ledger_saving_jars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_jar_transactions" ADD CONSTRAINT "ledger_jar_transactions_category_id_ledger_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "ledger_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_kinds" ADD CONSTRAINT "ledger_kinds_category_id_ledger_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "ledger_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_loans" ADD CONSTRAINT "ledger_loans_linked_kind_id_ledger_kinds_id_fk" FOREIGN KEY ("linked_kind_id") REFERENCES "ledger_kinds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_people_transactions" ADD CONSTRAINT "ledger_people_transactions_person_id_ledger_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "ledger_people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_saving_jars" ADD CONSTRAINT "ledger_saving_jars_kind_id_ledger_kinds_id_fk" FOREIGN KEY ("kind_id") REFERENCES "ledger_kinds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_kind_id_ledger_kinds_id_fk" FOREIGN KEY ("kind_id") REFERENCES "ledger_kinds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ledger_accounts_user_idx" ON "ledger_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_assets_user_idx" ON "ledger_assets" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_categories_user_idx" ON "ledger_categories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_currencies_user_code_idx" ON "ledger_currencies" USING btree ("user_id","code");--> statement-breakpoint
CREATE INDEX "ledger_deposits_user_idx" ON "ledger_deposits" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_fx_rates_lookup_idx" ON "ledger_fx_rates" USING btree ("currency_code","pivot_code","as_of_date");--> statement-breakpoint
CREATE INDEX "ledger_incomes_user_idx" ON "ledger_incomes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_jar_transactions_user_jar_occurred_idx" ON "ledger_jar_transactions" USING btree ("user_id","jar_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_kinds_category_idx" ON "ledger_kinds" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "ledger_loans_user_idx" ON "ledger_loans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_people_user_idx" ON "ledger_people" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_people_transactions_user_person_occurred_idx" ON "ledger_people_transactions" USING btree ("user_id","person_id","occurred_at");--> statement-breakpoint
CREATE INDEX "ledger_saving_jars_user_idx" ON "ledger_saving_jars" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_user_kind_occurred_idx" ON "ledger_transactions" USING btree ("user_id","kind_id","occurred_at");