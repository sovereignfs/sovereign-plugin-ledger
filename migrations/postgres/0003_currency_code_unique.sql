DROP INDEX "ledger_currencies_user_code_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_currencies_user_code_idx" ON "ledger_currencies" USING btree ("user_id","code");