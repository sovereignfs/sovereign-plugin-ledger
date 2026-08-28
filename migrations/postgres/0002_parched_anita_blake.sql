CREATE TABLE "ledger_month_end_notifications" (
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"sent_at" bigint NOT NULL,
	CONSTRAINT "ledger_month_end_notifications_user_id_year_month_pk" PRIMARY KEY("user_id","year","month")
);
