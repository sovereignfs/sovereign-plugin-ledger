DROP INDEX "ledger_fx_rates_lookup_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_fx_rates_lookup_idx" ON "ledger_fx_rates" USING btree ("currency_code","pivot_code","as_of_date");